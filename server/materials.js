import { all, get, run, tx } from './db.js';
import { now } from './config.js';
import { MATERIAL_STATUSES, MATERIAL_TYPES, TYPE_KEYS, maskSpec } from './types.js';
import { badRequest, conflict, notFound } from './errors.js';
import { writeAudit } from './audit.js';
import { getRack } from './racks.js';

const BASE_SELECT = `
  SELECT m.*,
         r.name AS rack_name,
         r.row_label AS rack_row,
         r.rotation AS rack_rotation,
         p.code AS parent_code,
         p.name AS parent_name,
         p.type AS parent_type,
         p.position_u AS parent_position_u,
         p.rack_id AS parent_rack_id,
         (SELECT COUNT(*) FROM materials c WHERE c.parent_id = m.id) AS child_count
  FROM materials m
  LEFT JOIN racks r ON r.id = m.rack_id
  LEFT JOIN materials p ON p.id = m.parent_id
`;

function parseSpec(row) {
  if (!row) return row;
  let spec = {};
  try {
    spec = row.spec ? JSON.parse(row.spec) : {};
  } catch {
    spec = {};
  }
  return { ...row, spec };
}

export function locationText(row) {
  if (!row) return '';
  if (row.parent_code) {
    const base = row.rack_name ? `${row.rack_name}${row.parent_position_u ? ` · U${row.parent_position_u}` : ''}` : '未上架';
    return `${base} · ${row.parent_code}${row.slot ? ` · ${row.slot}` : ''}`;
  }
  if (row.rack_name) {
    const slot = row.slot || (row.position_u ? `U${row.position_u}` : '');
    return `${row.rack_name}${slot ? ` · ${slot}` : ''}`;
  }
  return '库存 / 未上架';
}

export function serializeMaterial(row, { reveal = false } = {}) {
  if (!row) return null;
  const parsed = parseSpec(row);
  return {
    ...parsed,
    u_height: Number(parsed.u_height) || 1,
    position_u: parsed.position_u === null ? null : Number(parsed.position_u),
    child_count: Number(parsed.child_count) || 0,
    spec: maskSpec(parsed.type, parsed.spec, reveal),
    location: locationText(parsed),
    secrets_masked: !reveal,
  };
}

export function resolveMaterialRow(ref) {
  if (ref === null || ref === undefined || ref === '') return null;
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const byId = get(`${BASE_SELECT} WHERE m.id = ?`, Number(ref));
    if (byId) return byId;
  }
  return get(`${BASE_SELECT} WHERE m.code = ? COLLATE NOCASE`, String(ref).trim());
}

export function getMaterial(ref, { reveal = true, includeChildren = true } = {}) {
  const row = resolveMaterialRow(ref);
  if (!row) return null;
  const material = serializeMaterial(row, { reveal });
  if (includeChildren) {
    const children = all(`${BASE_SELECT} WHERE m.parent_id = ? ORDER BY m.type, m.code`, row.id);
    material.children = children.map((child) => serializeMaterial(child, { reveal }));
  }
  if (row.type === 'server') {
    material.status_detail = get('SELECT * FROM server_status WHERE material_id = ?', row.id) || null;
    if (material.status_detail?.metrics) {
      try {
        material.status_detail.metrics = JSON.parse(material.status_detail.metrics);
      } catch {
        // ignore
      }
    }
  }
  return material;
}

export function listMaterials(options = {}) {
  const {
    q,
    type,
    status,
    rack_id,
    rack,
    parent_id,
    root_only,
    unplaced,
    page = 1,
    page_size = 50,
    sort = 'updated_at',
    order = 'desc',
  } = options;

  const where = [];
  const params = [];

  if (q && String(q).trim()) {
    const tokens = String(q).trim().split(/\s+/).slice(0, 6);
    for (const token of tokens) {
      const like = `%${token}%`;
      where.push(`(
        m.code LIKE ? OR m.name LIKE ? OR m.model LIKE ? OR m.vendor LIKE ? OR m.serial LIKE ?
        OR m.spec LIKE ? OR m.note LIKE ? OR m.slot LIKE ? OR r.name LIKE ? OR p.code LIKE ?
        OR CAST(m.position_u AS TEXT) LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like, like, like, like, like);
    }
  }

  if (type) {
    const types = String(type).split(',').map((t) => t.trim()).filter(Boolean);
    if (types.length) {
      where.push(`m.type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
  }
  if (status) {
    const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length) {
      where.push(`m.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }

  let rackId = rack_id;
  if (rack) {
    const rackRow = getRack(rack);
    rackId = rackRow?.id;
    if (!rackId) return { items: [], total: 0, page: Number(page) || 1, page_size: Number(page_size) || 50 };
  }
  if (rackId !== undefined && rackId !== null && String(rackId) !== '') {
    if (String(rackId) === 'null') where.push('m.rack_id IS NULL');
    else {
      where.push('m.rack_id = ?');
      params.push(Number(rackId));
    }
  }
  if (parent_id !== undefined && parent_id !== null && String(parent_id) !== '') {
    if (String(parent_id) === 'null') where.push('m.parent_id IS NULL');
    else {
      where.push('m.parent_id = ?');
      params.push(Number(parent_id));
    }
  }
  if (root_only === true || root_only === 'true' || root_only === '1') where.push('m.parent_id IS NULL');
  if (unplaced === true || unplaced === 'true' || unplaced === '1') {
    where.push('m.rack_id IS NULL AND m.parent_id IS NULL');
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(get(`SELECT COUNT(*) AS n FROM materials m
    LEFT JOIN racks r ON r.id = m.rack_id
    LEFT JOIN materials p ON p.id = m.parent_id ${clause}`, ...params)?.n || 0);

  const sortWhitelist = ['code', 'name', 'type', 'status', 'updated_at', 'created_at', 'position_u', 'rack_id'];
  const sortKey = sortWhitelist.includes(sort) ? sort : 'updated_at';
  const direction = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(500, Math.max(1, Number(page_size) || 50));

  const relevance = q && String(q).trim() ? '(m.code = ? COLLATE NOCASE) DESC, (m.parent_id IS NULL) DESC, ' : '';
  const relevanceParams = q && String(q).trim() ? [String(q).trim()] : [];
  const rows = all(
    `${BASE_SELECT} ${clause} ORDER BY ${relevance}m.${sortKey} ${direction}, m.id DESC LIMIT ? OFFSET ?`,
    ...params,
    ...relevanceParams,
    safeSize,
    (safePage - 1) * safeSize,
  );
  return {
    items: rows.map((row) => serializeMaterial(row, { reveal: false })),
    total,
    page: safePage,
    page_size: safeSize,
  };
}

function assertType(type) {
  if (!TYPE_KEYS.includes(type)) throw badRequest(`未知物料类型：${type}`);
  return type;
}

function assertStatus(status) {
  if (status && !MATERIAL_STATUSES[status]) throw badRequest(`未知物料状态：${status}`);
  return status;
}

function cleanSpec(spec) {
  if (spec === undefined) return undefined;
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) throw badRequest('spec 必须是 JSON 对象');
  const blocked = new Set(['__proto__', 'prototype', 'constructor']);
  const out = {};
  for (const [key, value] of Object.entries(spec)) {
    if (blocked.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  const text = JSON.stringify(out);
  if (text.length > 64 * 1024) throw badRequest('扩展信息过大（最大 64KB）');
  return out;
}

function intOrNull(value, field, { min = 1, max = 60 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${field} 需为 ${min}-${max} 的整数`);
  }
  return n;
}

function resolveParent(ref) {
  if (ref === null || ref === undefined || ref === '') return null;
  const row = resolveMaterialRow(ref);
  if (!row) throw badRequest(`所属设备不存在：${ref}`);
  return row;
}

function assertNoCycle(materialId, parentRow) {
  let cursor = parentRow;
  let guard = 0;
  while (cursor) {
    if (cursor.id === materialId) throw badRequest('不能将物料挂载到自身或其子物料下');
    if (!cursor.parent_id) break;
    cursor = get('SELECT id, code, parent_id FROM materials WHERE id = ?', cursor.parent_id);
    if (++guard > 50) break;
  }
}

function checkPlacement({ rackId, positionU, uHeight, excludeId = null, force = false }) {
  if (!rackId || positionU === null || positionU === undefined) return null;
  const rack = getRack(rackId);
  if (!rack) throw badRequest('机柜不存在');
  const height = Number(uHeight) || 1;
  const top = positionU + height - 1;
  if (positionU < 1 || top > rack.u_height) {
    throw badRequest(`U 位超出机柜范围（机柜 ${rack.name} 共 ${rack.u_height}U）`);
  }
  const clash = get(
    `SELECT m.id, m.code, m.name, m.position_u, m.u_height, r.name AS rack_name
     FROM materials m JOIN racks r ON r.id = m.rack_id
     WHERE m.rack_id = ? AND m.position_u IS NOT NULL
       AND m.position_u < ? AND (m.position_u + m.u_height) > ?
       AND (? IS NULL OR m.id <> ?)
     ORDER BY m.position_u LIMIT 1`,
    rack.id,
    positionU + height,
    positionU,
    excludeId,
    excludeId,
  );
  if (clash && !force) {
    throw conflict(
      `U 位冲突：${clash.code} 已占用 ${clash.rack_name} U${clash.position_u}-U${clash.position_u + clash.u_height - 1}`,
      { conflict: { id: clash.id, code: clash.code, position_u: clash.position_u, u_height: clash.u_height } },
    );
  }
  return clash || null;
}

function resolveRackInput(input) {
  if (input.rack !== undefined && input.rack !== null && input.rack !== '') {
    const rack = getRack(input.rack);
    if (!rack) throw badRequest(`机柜不存在：${input.rack}`);
    return rack;
  }
  if (input.rack_id !== undefined) {
    if (input.rack_id === null || input.rack_id === '') return null;
    const rack = getRack(input.rack_id);
    if (!rack) throw badRequest(`机柜不存在：${input.rack_id}`);
    return rack;
  }
  return undefined;
}

export function createMaterial(input, ctx, { source = 'web' } = {}) {
  const code = String(input.code || '').trim();
  const name = String(input.name || '').trim();
  const type = assertType(String(input.type || '').trim());
  if (!code) throw badRequest('物料编码不能为空');
  if (code.length > 80) throw badRequest('物料编码过长');
  if (!name) throw badRequest('物料名称不能为空');
  if (get('SELECT id FROM materials WHERE code = ? COLLATE NOCASE', code)) {
    throw conflict(`物料编码 ${code} 已存在`);
  }
  const status = assertStatus(input.status) || 'in_use';
  const parent = resolveParent(input.parent ?? input.parent_id ?? null);
  const rack = resolveRackInput(input);
  const rackId = rack?.id ?? parent?.rack_id ?? null;
  const positionU = intOrNull(input.position_u ?? input.positionU, 'U 位', { min: 1, max: 60 });
  const uHeight = intOrNull(input.u_height ?? input.uHeight, 'U 高度', { min: 1, max: 42 }) || 1;
  checkPlacement({ rackId, positionU, uHeight, force: Boolean(input.force) });
  const spec = cleanSpec(input.spec ?? {}) || {};
  const ts = now();
  const result = run(
    `INSERT INTO materials
     (code, name, type, model, vendor, serial, status, rack_id, position_u, u_height, slot, parent_id, spec, note, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    code,
    name,
    type,
    input.model || null,
    input.vendor || null,
    input.serial || null,
    status,
    rackId,
    positionU,
    uHeight,
    input.slot || null,
    parent?.id ?? null,
    JSON.stringify(spec),
    input.note || null,
    ctx?.user?.id ?? null,
    ts,
    ts,
  );
  const id = result.lastInsertRowid;
  if (type === 'server') {
    const health = status === 'spare' ? 'offline' : 'unknown';
    run(
      `INSERT INTO server_status (material_id, power_state, health, last_seen, metrics, updated_at)
       VALUES (?, 'off', ?, ?, '{}', ?)`,
      id,
      health,
      ts,
      ts,
    );
  }
  const material = getMaterial(id, { reveal: true });
  writeAudit({ ...ctx, source }, {
    action: 'material.create',
    entityType: 'material',
    entityId: id,
    summary: `新增${MATERIAL_TYPES[type].label} ${code}（${name}）`,
    detail: {
      code,
      name,
      type,
      status,
      rack: rack?.name || null,
      position_u: positionU,
      parent: parent?.code || null,
      spec_fields: Object.keys(spec),
    },
  });
  return material;
}

export function updateMaterial(ref, patch, ctx, { source = 'web' } = {}) {
  const existing = resolveMaterialRow(ref);
  if (!existing) throw notFound('物料不存在');

  const updates = {};
  const changedFields = [];

  if (patch.code !== undefined) {
    const code = String(patch.code).trim();
    if (!code) throw badRequest('物料编码不能为空');
    if (get('SELECT id FROM materials WHERE code = ? COLLATE NOCASE AND id <> ?', code, existing.id)) {
      throw conflict(`物料编码 ${code} 已存在`);
    }
    updates.code = code;
    changedFields.push('code');
  }
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw badRequest('物料名称不能为空');
    updates.name = name;
    changedFields.push('name');
  }
  if (patch.type !== undefined) {
    updates.type = assertType(String(patch.type));
    changedFields.push('type');
  }
  if (patch.status !== undefined) {
    updates.status = assertStatus(String(patch.status));
    changedFields.push('status');
  }
  for (const key of ['model', 'vendor', 'serial', 'slot', 'note']) {
    if (patch[key] !== undefined) {
      updates[key] = patch[key] === null ? null : String(patch[key]);
      changedFields.push(key);
    }
  }

  const parentProvided = patch.parent !== undefined || patch.parent_id !== undefined;
  let parentRow = null;
  if (parentProvided) {
    parentRow = resolveParent(patch.parent ?? patch.parent_id ?? null);
    if (parentRow) assertNoCycle(existing.id, parentRow);
    updates.parent_id = parentRow?.id ?? null;
    changedFields.push('parent_id');
  }

  const rackProvided = patch.rack !== undefined || patch.rack_id !== undefined;
  let rackRow;
  if (rackProvided) {
    rackRow = resolveRackInput(patch);
    updates.rack_id = rackRow?.id ?? null;
    changedFields.push('rack_id');
    if (updates.rack_id === null) {
      updates.position_u = null;
      changedFields.push('position_u');
    }
  }

  if (patch.position_u !== undefined || patch.positionU !== undefined) {
    updates.position_u = intOrNull(patch.position_u ?? patch.positionU, 'U 位', { min: 1, max: 60 });
    changedFields.push('position_u');
  }
  if (patch.u_height !== undefined || patch.uHeight !== undefined) {
    updates.u_height = intOrNull(patch.u_height ?? patch.uHeight, 'U 高度', { min: 1, max: 42 }) || 1;
    changedFields.push('u_height');
  }

  if (patch.spec !== undefined) {
    const incoming = cleanSpec(patch.spec);
    if (!incoming) throw badRequest('spec 必须是 JSON 对象');
    let current = {};
    try {
      current = existing.spec ? JSON.parse(existing.spec) : {};
    } catch {
      current = {};
    }
    for (const [key, value] of Object.entries(incoming)) {
      // 列表接口返回的掩码值不应覆盖真实密码
      if (value === '••••••') continue;
      if (value === null || value === '') delete current[key];
      else current[key] = value;
    }
    updates.spec = JSON.stringify(current);
    changedFields.push('spec');
  }

  if (changedFields.length === 0) return getMaterial(existing.id, { reveal: true });

  const finalRackId = updates.rack_id !== undefined ? updates.rack_id : existing.rack_id;
  const finalPosition = updates.position_u !== undefined ? updates.position_u : existing.position_u;
  const finalHeight = updates.u_height !== undefined ? updates.u_height : existing.u_height;
  checkPlacement({
    rackId: finalRackId,
    positionU: finalPosition,
    uHeight: finalHeight,
    excludeId: existing.id,
    force: Boolean(patch.force),
  });

  const sets = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
  const ts = now();
  tx(() => {
    run(`UPDATE materials SET ${sets}, updated_at = ? WHERE id = ?`, ...Object.values(updates), ts, existing.id);
    // 服务器的部件跟随服务器所在机柜
    if (updates.rack_id !== undefined && ['server', 'switch'].includes(updates.type || existing.type)) {
      run('UPDATE materials SET rack_id = ?, updated_at = ? WHERE parent_id = ?', updates.rack_id, ts, existing.id);
    }
    if ((updates.type || existing.type) === 'server') {
      run(
        `INSERT OR IGNORE INTO server_status (material_id, power_state, health, last_seen, metrics, updated_at)
         VALUES (?, 'off', 'unknown', ?, '{}', ?)`,
        existing.id,
        ts,
        ts,
      );
    }
  });

  const material = getMaterial(existing.id, { reveal: true });
  writeAudit({ ...ctx, source }, {
    action: 'material.update',
    entityType: 'material',
    entityId: existing.id,
    summary: `更新${MATERIAL_TYPES[material.type]?.label || '物料'} ${material.code}（${material.name}）`,
    detail: { fields: [...new Set(changedFields)].sort() },
  });
  return material;
}

function collectDescendants(id) {
  const ids = [];
  const queue = [id];
  let guard = 0;
  while (queue.length && guard++ < 10000) {
    const current = queue.shift();
    const children = all('SELECT id FROM materials WHERE parent_id = ?', current);
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

export function deleteMaterial(ref, { cascade = false } = {}, ctx, { source = 'web' } = {}) {
  const existing = resolveMaterialRow(ref);
  if (!existing) throw notFound('物料不存在');
  const descendants = collectDescendants(existing.id);
  if (descendants.length > 0 && !cascade) {
    throw conflict(`物料 ${existing.code} 下仍有 ${descendants.length} 个子物料，无法删除。可加 cascade=true 级联删除。`, {
      descendants: descendants.length,
    });
  }
  let deleted = 0;
  tx(() => {
    for (const id of [...descendants].reverse()) {
      run('DELETE FROM materials WHERE id = ?', id);
      deleted++;
    }
    run('DELETE FROM materials WHERE id = ?', existing.id);
    deleted++;
  });
  writeAudit({ ...ctx, source }, {
    action: 'material.delete',
    entityType: 'material',
    entityId: existing.id,
    summary: `删除物料 ${existing.code}（${existing.name}）${deleted > 1 ? `，级联删除 ${deleted - 1} 个子物料` : ''}`,
    detail: { code: existing.code, name: existing.name, type: existing.type, deleted },
  });
  return { ok: true, deleted };
}

export function materialStats() {
  const byType = all('SELECT type, COUNT(*) AS count FROM materials GROUP BY type ORDER BY count DESC');
  const byStatus = all('SELECT status, COUNT(*) AS count FROM materials GROUP BY status ORDER BY count DESC');
  const byRack = all(
    `SELECT r.id, r.name, COUNT(m.id) AS count
     FROM racks r LEFT JOIN materials m ON m.rack_id = r.id AND m.position_u IS NOT NULL
     GROUP BY r.id ORDER BY r.name`,
  );
  return {
    total: Number(get('SELECT COUNT(*) AS n FROM materials')?.n || 0),
    by_type: Object.fromEntries(byType.map((r) => [r.type, Number(r.count)])),
    by_status: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
    by_rack: byRack.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
  };
}