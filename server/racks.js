import { all, get, run, tx } from './db.js';
import { now } from './config.js';
import { badRequest, conflict, notFound } from './errors.js';
import { writeAudit } from './audit.js';

export const ROOM = {
  name: 'InfraVerse 演示机房',
  width: 6.6,
  depth: 5.4,
  height: 2.9,
  rack: { width: 0.7, depth: 0.9, height: 2.0, unit: 1.9 / 42 },
};

function decorateRack(rack, rows) {
  if (!rack) return null;
  const placed = rows.filter((m) => m.rack_id === rack.id && m.position_u !== null);
  const usedU = placed.reduce((sum, m) => sum + (Number(m.u_height) || 1), 0);
  const serverCount = placed.filter((m) => m.type === 'server').length;
  return {
    ...rack,
    used_u: usedU,
    free_u: Math.max(rack.u_height - usedU, 0),
    occupancy: rack.u_height ? Math.round((usedU / rack.u_height) * 100) : 0,
    device_count: placed.length,
    server_count: serverCount,
  };
}

export function listRacks() {
  const racks = all('SELECT * FROM racks ORDER BY row_label, col, name');
  const rows = all('SELECT id, rack_id, type, position_u, u_height FROM materials WHERE rack_id IS NOT NULL');
  return racks.map((rack) => decorateRack(rack, rows));
}

export function getRack(idOrName) {
  if (idOrName === null || idOrName === undefined || idOrName === '') return null;
  const key = String(idOrName);
  const rack = /^\d+$/.test(key)
    ? get('SELECT * FROM racks WHERE id = ?', Number(key))
    : get('SELECT * FROM racks WHERE name = ?', key);
  if (!rack) return null;
  const rows = all('SELECT id, rack_id, type, position_u, u_height FROM materials WHERE rack_id IS NOT NULL');
  return decorateRack(rack, rows);
}

export function resolveRack(idOrName) {
  const rack = getRack(idOrName);
  if (!rack) throw badRequest(`机柜不存在：${idOrName}`);
  return rack;
}

export function createRack(input, ctx, { source = 'web' } = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw badRequest('机柜名称不能为空');
  if (get('SELECT id FROM racks WHERE name = ?', name)) throw conflict(`机柜 ${name} 已存在`);
  const uHeight = Number(input.u_height || 42);
  if (!Number.isFinite(uHeight) || uHeight < 1 || uHeight > 60) throw badRequest('机柜 U 高度需在 1-60 之间');
  const ts = now();
  const result = run(
    `INSERT INTO racks (name, row_label, col, x, z, rotation, u_height, power_capacity, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    name,
    input.row_label || name.slice(0, 1),
    Number(input.col || 0),
    Number(input.x || 0),
    Number(input.z || 0),
    Number(input.rotation || 0),
    uHeight,
    input.power_capacity || null,
    input.note || null,
    ts,
    ts,
  );
  const rack = getRack(result.lastInsertRowid);
  writeAudit({ ...ctx, source }, {
    action: 'rack.create',
    entityType: 'rack',
    entityId: rack.id,
    summary: `新增机柜 ${rack.name}`,
    detail: { name: rack.name, x: rack.x, z: rack.z, u_height: rack.u_height },
  });
  return rack;
}

export function updateRack(idOrName, patch, ctx, { source = 'web' } = {}) {
  const rack = getRack(idOrName);
  if (!rack) throw notFound('机柜不存在');
  const allowed = ['name', 'row_label', 'col', 'x', 'z', 'rotation', 'u_height', 'power_capacity', 'note'];
  const updates = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) updates[key] = patch[key];
  }
  if (updates.name !== undefined) {
    const name = String(updates.name).trim();
    if (!name) throw badRequest('机柜名称不能为空');
    const dup = get('SELECT id FROM racks WHERE name = ? AND id <> ?', name, rack.id);
    if (dup) throw conflict(`机柜 ${name} 已存在`);
    updates.name = name;
  }
  if (updates.u_height !== undefined) {
    const u = Number(updates.u_height);
    if (!Number.isFinite(u) || u < 1 || u > 60) throw badRequest('机柜 U 高度需在 1-60 之间');
    updates.u_height = u;
  }
  if (Object.keys(updates).length === 0) return getRack(rack.id);
  const sets = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
  run(`UPDATE racks SET ${sets}, updated_at = ? WHERE id = ?`, ...Object.values(updates), now(), rack.id);
  const updated = getRack(rack.id);
  writeAudit({ ...ctx, source }, {
    action: 'rack.update',
    entityType: 'rack',
    entityId: rack.id,
    summary: `更新机柜 ${updated.name}`,
    detail: { fields: Object.keys(updates) },
  });
  return updated;
}

export function deleteRack(idOrName, { force = false } = {}, ctx, { source = 'web' } = {}) {
  const rack = getRack(idOrName);
  if (!rack) throw notFound('机柜不存在');
  if (rack.device_count > 0 && !force) {
    throw conflict(`机柜 ${rack.name} 内仍有 ${rack.device_count} 台设备，无法删除。可加 force=true 强制下架。`, {
      device_count: rack.device_count,
    });
  }
  tx(() => {
    if (force) {
      run('UPDATE materials SET rack_id = NULL, position_u = NULL WHERE rack_id = ?', rack.id);
    }
    run('DELETE FROM racks WHERE id = ?', rack.id);
  });
  writeAudit({ ...ctx, source }, {
    action: 'rack.delete',
    entityType: 'rack',
    entityId: rack.id,
    summary: `删除机柜 ${rack.name}${force && rack.device_count ? `（强制下架 ${rack.device_count} 台设备）` : ''}`,
    detail: { name: rack.name, device_count: rack.device_count, force },
  });
  return { ok: true };
}

export function roomLayout() {
  return { ...ROOM, racks: listRacks() };
}