import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useMaterialTypes } from '../meta.jsx';
import { Spinner, useToast } from '../ui.jsx';
import { Modal } from '../ui.jsx';

function emptyForm(material) {
  return {
    code: material?.code || '',
    name: material?.name || '',
    type: material?.type || 'server',
    status: material?.status || 'in_use',
    model: material?.model || '',
    vendor: material?.vendor || '',
    serial: material?.serial || '',
    rack_id: material?.rack_id ?? '',
    position_u: material?.position_u ?? '',
    u_height: material?.u_height ?? 1,
    slot: material?.slot || '',
    parent_id: material?.parent_id ?? '',
    note: material?.note || '',
  };
}

export default function MaterialForm({ material, defaultParent = null, onClose, onSaved }) {
  const { types, statuses } = useMaterialTypes();
  const toast = useToast();
  const editing = Boolean(material);
  const [form, setForm] = useState(() => emptyForm(material));
  const [spec, setSpec] = useState(() => ({ ...(material?.spec || {}) }));
  const [customRows, setCustomRows] = useState(() => {
    const typeDef = types[material?.type || 'server'];
    const known = new Set((typeDef?.fields || []).map((field) => field.key));
    return Object.entries(material?.spec || {})
      .filter(([key]) => !known.has(key))
      .map(([key, value]) => ({ key, value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }));
  });
  const [racks, setRacks] = useState([]);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api('/api/racks'),
      api('/api/materials?type=server,switch&root_only=1&page_size=500&sort=code&order=asc'),
    ])
      .then(([rackData, parentData]) => {
        if (cancelled) return;
        setRacks(rackData.items || []);
        setParents(parentData.items || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (defaultParent && !form.parent_id) {
      setForm((prev) => ({ ...prev, parent_id: defaultParent.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultParent]);

  const typeDef = types[form.type] || types.server;
  const groups = useMemo(() => {
    const map = new Map();
    for (const field of typeDef?.fields || []) {
      const name = field.group || (form.type === 'server' ? '硬件规格' : '规格信息');
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(field);
    }
    return [...map.entries()];
  }, [typeDef, form.type]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateSpec = (key, value) => setSpec((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.code.trim()) {
      setError('请填写物料编码');
      return;
    }
    if (!form.name.trim()) {
      setError('请填写物料名称');
      return;
    }
    setSaving(true);
    try {
      const specOut = {};
      for (const field of typeDef?.fields || []) {
        const value = spec[field.key];
        const isEmpty = value === undefined || value === null || value === '';
        if (isEmpty) {
          if (editing && material?.spec?.[field.key] !== undefined) specOut[field.key] = null;
          continue;
        }
        specOut[field.key] = field.type === 'number' ? Number(value) : value;
      }
      const initialCustom = new Set(
        Object.keys(material?.spec || {}).filter((key) => {
          const def = types[material?.type];
          return !(def?.fields || []).some((field) => field.key === key);
        }),
      );
      for (const row of customRows) {
        const key = row.key.trim();
        if (!key) continue;
        if (row.value === '') {
          if (initialCustom.has(key)) specOut[key] = null;
          continue;
        }
        specOut[key] = row.value;
      }
      for (const key of initialCustom) {
        if (!customRows.some((row) => row.key.trim() === key)) specOut[key] = null;
      }

      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        model: form.model.trim() || null,
        vendor: form.vendor.trim() || null,
        serial: form.serial.trim() || null,
        rack_id: form.rack_id === '' ? null : Number(form.rack_id),
        position_u: form.rack_id === '' || form.position_u === '' ? null : Number(form.position_u),
        u_height: form.u_height === '' ? 1 : Number(form.u_height),
        slot: form.slot.trim() || null,
        parent_id: form.parent_id === '' ? null : Number(form.parent_id),
        note: form.note.trim() || null,
        spec: specOut,
      };

      const saved = editing
        ? await api(`/api/materials/${material.id}`, { method: 'PATCH', body: payload })
        : await api('/api/materials', { method: 'POST', body: payload });
      toast(editing ? '物料已更新' : '物料已创建', 'success');
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rackHint = useMemo(() => {
    if (!form.rack_id) return '未上架（库存）';
    const rack = racks.find((item) => item.id === Number(form.rack_id));
    return rack ? `占用 ${rack.used_u}/${rack.u_height}U` : '';
  }, [form.rack_id, racks]);

  return (
    <Modal
      title={editing ? `编辑物料 · ${material.code}` : '新增物料'}
      subtitle={editing ? '修改物料档案、位置或设备凭据' : '为机房物料建立一份结构化档案'}
      onClose={saving ? undefined : onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" form="material-form" className="btn btn-primary" disabled={saving || loading}>
            {saving ? <Spinner label="保存中" /> : (
              <>
                <Save size={15} /> {editing ? '保存修改' : '创建物料'}
              </>
            )}
          </button>
        </>
      }
    >
      {loading ? (
        <Spinner label="加载机柜与设备列表…" />
      ) : (
        <form id="material-form" className="material-form" onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}

          <h4 className="form-section-title">基本信息</h4>
          <div className="form-grid">
            <label className="field">
              <span>物料编码 *</span>
              <input
                className="input"
                value={form.code}
                onChange={(event) => update('code', event.target.value)}
                placeholder="例如 SRV-B07-01"
              />
            </label>
            <label className="field">
              <span>物料名称 *</span>
              <input
                className="input"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="例如 计算节点 B07-01"
              />
            </label>
            <label className="field">
              <span>物料类型</span>
              <select className="select" value={form.type} onChange={(event) => update('type', event.target.value)}>
                {Object.entries(types).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>状态</span>
              <select className="select" value={form.status} onChange={(event) => update('status', event.target.value)}>
                {Object.entries(statuses).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>型号</span>
              <input className="input" value={form.model} onChange={(event) => update('model', event.target.value)} />
            </label>
            <label className="field">
              <span>厂商</span>
              <input className="input" value={form.vendor} onChange={(event) => update('vendor', event.target.value)} />
            </label>
            <label className="field">
              <span>序列号</span>
              <input className="input" value={form.serial} onChange={(event) => update('serial', event.target.value)} />
            </label>
          </div>

          <h4 className="form-section-title">位置与归属</h4>
          <div className="form-grid">
            <label className="field">
              <span>
                机柜 <small className="field-hint">{rackHint}</small>
              </span>
              <select className="select" value={form.rack_id} onChange={(event) => update('rack_id', event.target.value)}>
                <option value="">未上架 / 库存</option>
                {racks.map((rack) => (
                  <option key={rack.id} value={rack.id}>
                    {rack.name} · {rack.used_u}/{rack.u_height}U
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>所属设备（父物料）</span>
              <select className="select" value={form.parent_id} onChange={(event) => update('parent_id', event.target.value)}>
                <option value="">无（顶层物料）</option>
                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.code} · {parent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                起始 U 位 <small className="field-hint">未填写则不在 3D 中显示</small>
              </span>
              <input
                className="input"
                type="number"
                min="1"
                max="60"
                value={form.position_u}
                onChange={(event) => update('position_u', event.target.value)}
                placeholder="1 为机柜最底部"
              />
            </label>
            <label className="field">
              <span>占用 U 数</span>
              <input
                className="input"
                type="number"
                min="1"
                max="42"
                value={form.u_height}
                onChange={(event) => update('u_height', event.target.value)}
              />
            </label>
            <label className="field">
              <span>机柜内编号 / 槽位</span>
              <input
                className="input"
                value={form.slot}
                onChange={(event) => update('slot', event.target.value)}
                placeholder="例如 U12 或 PCIe Slot 3"
              />
            </label>
          </div>

          {groups.map(([groupName, fields]) => (
            <div key={groupName}>
              <h4 className="form-section-title">
                {groupName}
                {fields.some((field) => field.secret) && (
                  <button type="button" className="ghost-link" onClick={() => setShowSecrets((value) => !value)}>
                    {showSecrets ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showSecrets ? '隐藏密码' : '显示密码'}
                  </button>
                )}
              </h4>
              <div className="form-grid">
                {fields.map((field) => {
                  const value = spec[field.key] ?? '';
                  if (field.type === 'select') {
                    return (
                      <label className="field" key={field.key}>
                        <span>{field.label}</span>
                        <select
                          className="select"
                          value={value}
                          onChange={(event) => updateSpec(field.key, event.target.value)}
                        >
                          <option value="">未填写</option>
                          {(field.options || []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  return (
                    <label className={`field ${field.secret ? 'field-secret' : ''}`} key={field.key}>
                      <span>{field.label}</span>
                      <input
                        className="input"
                        type={field.secret && !showSecrets ? 'password' : field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(event) => updateSpec(field.key, event.target.value)}
                        placeholder={field.placeholder || ''}
                        autoComplete="off"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <h4 className="form-section-title">
            扩展字段
            <button
              type="button"
              className="ghost-link"
              onClick={() => setCustomRows((rows) => [...rows, { key: '', value: '' }])}
            >
              <Plus size={13} /> 添加字段
            </button>
          </h4>
          {customRows.length === 0 ? (
            <p className="form-empty-hint">没有扩展字段。可添加自定义键值，用于记录不在标准模板中的信息。</p>
          ) : (
            <div className="custom-fields">
              {customRows.map((row, index) => (
                <div className="custom-row" key={index}>
                  <input
                    className="input"
                    placeholder="字段名"
                    value={row.key}
                    onChange={(event) =>
                      setCustomRows((rows) => rows.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)))
                    }
                  />
                  <input
                    className="input"
                    placeholder="字段值"
                    value={row.value}
                    onChange={(event) =>
                      setCustomRows((rows) => rows.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => setCustomRows((rows) => rows.filter((_, i) => i !== index))}
                    aria-label="删除字段"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <h4 className="form-section-title">备注</h4>
          <textarea
            className="textarea"
            rows={3}
            value={form.note}
            onChange={(event) => update('note', event.target.value)}
            placeholder="补充说明，例如业务归属、维护窗口等"
          />
        </form>
      )}
    </Modal>
  );
}