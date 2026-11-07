import { all, get, run } from './db.js';
import { config, now } from './config.js';
import { COMMANDS, HEALTH_META, MATERIAL_STATUSES } from './types.js';
import { badRequest, notFound } from './errors.js';
import { materialStats, resolveMaterialRow, serializeMaterial } from './materials.js';
import { ROOM, listRacks } from './racks.js';
import { writeAudit } from './audit.js';

const TWIN_QUERY = `
  SELECT m.id, m.code, m.name, m.type, m.model, m.vendor, m.status,
         m.rack_id, m.position_u, m.u_height, m.slot, m.parent_id,
         (SELECT COUNT(*) FROM materials c WHERE c.parent_id = m.id) AS child_count,
         s.health, s.power_state, s.cpu_pct, s.mem_pct, s.temp_c, s.last_seen
  FROM materials m
  LEFT JOIN server_status s ON s.material_id = m.id
  WHERE m.rack_id IS NOT NULL AND m.position_u IS NOT NULL
  ORDER BY m.position_u ASC, m.id ASC
`;

export function twinData() {
  const racks = listRacks();
  const devices = all(TWIN_QUERY).map((row) => ({
    ...row,
    position_u: Number(row.position_u),
    u_height: Number(row.u_height) || 1,
    child_count: Number(row.child_count) || 0,
    health: row.health || null,
    power_state: row.power_state || null,
  }));
  const grouped = new Map(racks.map((rack) => [rack.id, []]));
  for (const device of devices) {
    if (grouped.has(device.rack_id)) grouped.get(device.rack_id).push(device);
  }
  return {
    room: {
      name: ROOM.name,
      width: ROOM.width,
      depth: ROOM.depth,
      height: ROOM.height,
      rack: ROOM.rack,
    },
    racks: racks.map((rack) => ({ ...rack, devices: grouped.get(rack.id) || [] })),
    updated_at: now(),
  };
}

export function dashboard() {
  const materials = materialStats();
  const servers = all(
    `SELECT m.id, m.code, m.name, m.status AS material_status, m.rack_id, r.name AS rack_name,
            s.health, s.power_state, s.cpu_pct, s.mem_pct, s.temp_c, s.last_seen
     FROM materials m
     LEFT JOIN server_status s ON s.material_id = m.id
     LEFT JOIN racks r ON r.id = m.rack_id
     WHERE m.type = 'server'`,
  );
  const healthCounts = { ok: 0, warning: 0, critical: 0, offline: 0, unknown: 0 };
  let online = 0;
  for (const server of servers) {
    const health = server.health || 'unknown';
    healthCounts[health] = (healthCounts[health] || 0) + 1;
    if (server.power_state === 'on') online++;
  }
  const racks = listRacks();
  const totalU = racks.reduce((sum, rack) => sum + rack.u_height, 0);
  const usedU = racks.reduce((sum, rack) => sum + rack.used_u, 0);
  const alerts = servers
    .filter(
      (s) =>
        !['spare', 'retired'].includes(s.material_status) &&
        (['critical', 'warning', 'offline'].includes(s.health) || s.material_status === 'fault'),
    )
    .sort((a, b) => {
      const rank = { critical: 0, offline: 1, warning: 2 };
      return (rank[a.health] ?? 3) - (rank[b.health] ?? 3);
    })
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      rack_name: s.rack_name,
      health: s.health || 'unknown',
      material_status: s.material_status,
      cpu_pct: s.cpu_pct,
      mem_pct: s.mem_pct,
      temp_c: s.temp_c,
      last_seen: s.last_seen,
      message:
        s.health === 'critical'
          ? `严重告警 · CPU ${s.cpu_pct ?? '-'}% / 温度 ${s.temp_c ?? '-'}°C`
          : s.health === 'offline'
            ? '服务器离线'
            : s.health === 'warning'
              ? `资源水位偏高 · CPU ${s.cpu_pct ?? '-'}%`
              : '物料状态为故障',
    }));

  return {
    materials,
    servers: {
      total: servers.length,
      online,
      health: healthCounts,
    },
    racks: {
      total: racks.length,
      used_u: usedU,
      total_u: totalU,
      occupancy: totalU ? Math.round((usedU / totalU) * 100) : 0,
    },
    alerts,
    updated_at: now(),
  };
}

export function getServerStatus(ref) {
  const material = resolveMaterialRow(ref);
  if (!material) return null;
  const status = get('SELECT * FROM server_status WHERE material_id = ?', material.id);
  if (!status) return null;
  if (status.metrics) {
    try {
      status.metrics = JSON.parse(status.metrics);
    } catch {
      // ignore
    }
  }
  return { ...status, material: serializeMaterial(material, { reveal: false }) };
}

export function updateTelemetry(input, ctx, { source = 'api' } = {}) {
  const ref = input.material_id ?? input.id ?? input.code;
  const material = resolveMaterialRow(ref);
  if (!material) throw notFound('服务器不存在');
  if (material.type !== 'server') throw badRequest('仅服务器类型支持状态上报');
  const existing = get('SELECT * FROM server_status WHERE material_id = ?', material.id) || {};
  const ts = now();

  const pickNumber = (value, field, min, max) => {
    if (value === undefined || value === null || value === '') return existing[field] ?? null;
    const n = Number(value);
    if (!Number.isFinite(n)) throw badRequest(`${field} 需为数字`);
    return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  };

  const health = input.health ?? existing.health ?? 'unknown';
  if (!HEALTH_META[health]) throw badRequest(`未知健康状态：${health}`);
  const power = input.power_state ?? existing.power_state ?? 'unknown';
  if (!['on', 'off', 'unknown'].includes(power)) throw badRequest('power_state 仅支持 on / off / unknown');
  if (input.material_status !== undefined && !MATERIAL_STATUSES[input.material_status]) {
    throw badRequest('未知物料状态');
  }

  let metrics = existing.metrics || '{}';
  if (input.metrics !== undefined) metrics = JSON.stringify(input.metrics);

  run(
    `INSERT INTO server_status (material_id, power_state, health, cpu_pct, mem_pct, temp_c, uptime_s, last_seen, metrics, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(material_id) DO UPDATE SET
       power_state = excluded.power_state,
       health = excluded.health,
       cpu_pct = excluded.cpu_pct,
       mem_pct = excluded.mem_pct,
       temp_c = excluded.temp_c,
       uptime_s = excluded.uptime_s,
       last_seen = excluded.last_seen,
       metrics = excluded.metrics,
       updated_at = excluded.updated_at`,
    material.id,
    power,
    health,
    pickNumber(input.cpu_pct, 'cpu_pct', 0, 100),
    pickNumber(input.mem_pct, 'mem_pct', 0, 100),
    pickNumber(input.temp_c, 'temp_c', -20, 150),
    input.uptime_s !== undefined ? Number(input.uptime_s) || 0 : existing.uptime_s ?? null,
    input.last_seen || ts,
    metrics,
    ts,
  );

  if (input.material_status !== undefined) {
    run('UPDATE materials SET status = ?, updated_at = ? WHERE id = ?', input.material_status, ts, material.id);
  }

  if (ctx?.user && source === 'mcp') {
    // 仅通过 MCP 手动上报时记录操作，Agent 高频轮询不写日志
    writeAudit(ctx, {
      action: 'telemetry.update',
      entityType: 'material',
      entityId: material.id,
      summary: `更新服务器状态 ${material.code}（${health}）`,
      detail: { health, power_state: power, cpu_pct: input.cpu_pct, mem_pct: input.mem_pct, temp_c: input.temp_c },
    });
  }
  return getServerStatus(material.id);
}

function commandRow(row) {
  if (!row) return null;
  let params = {};
  try {
    params = row.params ? JSON.parse(row.params) : {};
  } catch {
    params = {};
  }
  return {
    ...row,
    params,
    action_label: COMMANDS[row.action]?.label || row.action,
    simulated: Boolean(row.simulated),
  };
}

function simulateCommand(commandId) {
  if (!config.simulateCommands) return;
  const delay = 1200 + Math.floor(Math.random() * 2200);
  const timer = setTimeout(() => {
    try {
      const command = get('SELECT * FROM commands WHERE id = ?', commandId);
      if (!command || command.status !== 'pending') return;
      const ts = now();
      run(
        `UPDATE commands SET status = 'done', result = ?, simulated = 1, updated_at = ?, completed_at = ? WHERE id = ? AND status = 'pending'`,
        `演示模式：${COMMANDS[command.action]?.label || command.action} 已模拟执行完成`,
        ts,
        ts,
        commandId,
      );
      if (command.action === 'power_off') {
        run(
          `UPDATE server_status SET power_state = 'off', health = 'offline', cpu_pct = 0, mem_pct = 0, last_seen = ?, updated_at = ? WHERE material_id = ?`,
          ts,
          ts,
          command.material_id,
        );
      } else if (command.action === 'power_on' || command.action === 'restart') {
        run(
          `UPDATE server_status SET power_state = 'on', health = 'ok', uptime_s = 0, last_seen = ?, updated_at = ? WHERE material_id = ?`,
          ts,
          ts,
          command.material_id,
        );
      }
      const material = get('SELECT code, name FROM materials WHERE id = ?', command.material_id);
      writeAudit(
        { user: null, username: 'system', source: 'system' },
        {
          action: 'command.execute',
          entityType: 'command',
          entityId: commandId,
          summary: `模拟执行指令：${COMMANDS[command.action]?.label || command.action} · ${material?.code || command.material_id}`,
          detail: { simulated: true },
        },
      );
    } catch (error) {
      console.error('[command] simulate failed:', error.message);
    }
  }, delay);
  timer.unref?.();
}

export function sendCommand(ref, action, params = {}, ctx, { source = 'web' } = {}) {
  const material = resolveMaterialRow(ref);
  if (!material) throw notFound('服务器不存在');
  if (material.type !== 'server') throw badRequest('当前仅服务器支持指令下发');
  if (!COMMANDS[action]) throw badRequest(`未知指令：${action}`);
  const ts = now();
  const result = run(
    `INSERT INTO commands (material_id, action, params, status, source, requested_by, requested_by_name, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    material.id,
    action,
    JSON.stringify(params || {}),
    source,
    ctx?.user?.id ?? null,
    ctx?.user?.username ?? 'system',
    ts,
    ts,
  );
  const command = commandRow(get('SELECT * FROM commands WHERE id = ?', result.lastInsertRowid));
  writeAudit({ ...ctx, source }, {
    action: 'command.create',
    entityType: 'command',
    entityId: command.id,
    summary: `下发指令：${COMMANDS[action].label} · ${material.code}（${material.name}）`,
    detail: { material_id: material.id, material_code: material.code, action, params },
  });
  simulateCommand(command.id);
  return command;
}

export function listCommands({ material, status, limit = 30 } = {}) {
  const where = [];
  const params = [];
  if (material !== undefined && material !== null && material !== '') {
    const target = resolveMaterialRow(material);
    if (!target) return { items: [], total: 0 };
    where.push('c.material_id = ?');
    params.push(target.id);
  }
  if (status) {
    where.push('c.status = ?');
    params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = all(
    `SELECT c.*, m.code AS material_code, m.name AS material_name, m.rack_id,
            r.name AS rack_name, m.position_u
     FROM commands c
     JOIN materials m ON m.id = c.material_id
     LEFT JOIN racks r ON r.id = m.rack_id
     ${clause}
     ORDER BY c.id DESC LIMIT ?`,
    ...params,
    Math.min(Number(limit) || 30, 200),
  ).map(commandRow);
  return { items, total: items.length };
}

export function ackCommand(id, { status, result }, ctx, { source = 'web' } = {}) {
  const command = get('SELECT * FROM commands WHERE id = ?', id);
  if (!command) throw notFound('指令不存在');
  if (!['done', 'failed', 'running'].includes(status)) throw badRequest('status 仅支持 running / done / failed');
  if (['done', 'failed'].includes(command.status)) throw badRequest('指令已结束，不能重复确认');
  const ts = now();
  run(
    'UPDATE commands SET status = ?, result = ?, updated_at = ?, completed_at = ? WHERE id = ?',
    status,
    result || null,
    ts,
    ['done', 'failed'].includes(status) ? ts : null,
    id,
  );
  writeAudit({ ...ctx, source }, {
    action: 'command.ack',
    entityType: 'command',
    entityId: id,
    summary: `指令确认：${COMMANDS[command.action]?.label || command.action} · ${status}`,
    detail: { status, result: result || null },
  });
  return commandRow(get('SELECT * FROM commands WHERE id = ?', id));
}