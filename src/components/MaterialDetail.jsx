import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Focus,
  Gauge,
  MapPin,
  Pencil,
  Power,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Thermometer,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import { api, formatDateTime, formatTime, formatUptime } from '../api.js';
import { useMaterialTypes } from '../meta.jsx';
import { CopyButton, useConfirm, useToast } from '../ui.jsx';
import { CommandStatusPill, HealthPill, MaterialTypeIcon, StatusPill, TypeLabel } from './MetaBits.jsx';

const COMMAND_ICONS = {
  ping: Wifi,
  locate: MapPin,
  selftest: ShieldCheck,
  restart: RotateCw,
  power_off: Power,
  power_on: Power,
};

function fieldValue(field, spec, reveal) {
  const value = spec?.[field.key];
  if (value === undefined || value === null || value === '') return '—';
  if (field.secret && !reveal) return '••••••';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function buildGroups(material, typeDef) {
  const fields = typeDef?.fields || [];
  const known = new Set(fields.map((field) => field.key));
  const groups = [];
  const index = new Map();
  for (const field of fields) {
    const name = field.group || (typeDef?.key === 'server' ? '硬件规格' : '规格信息');
    if (!index.has(name)) {
      const group = { name, fields: [], hasSecret: false };
      index.set(name, group);
      groups.push(group);
    }
    const group = index.get(name);
    group.fields.push(field);
    if (field.secret) group.hasSecret = true;
  }
  const custom = Object.entries(material.spec || {}).filter(([key]) => !known.has(key));
  return { groups, custom };
}

function Meter({ label, value, unit = '%', color }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <strong style={{ color }}>{value === null || value === undefined ? '—' : `${value}${unit}`}</strong>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function MaterialDetail({
  material,
  onClose,
  onEdit,
  onDelete,
  onLocate,
  onOpenMaterial,
  onRefresh,
  onChanged,
}) {
  const { types, commands: commandMeta, simulateCommands } = useMaterialTypes();
  const typeDef = types[material.type];
  const toast = useToast();
  const confirm = useConfirm();
  const [reveal, setReveal] = useState(false);
  const [commands, setCommands] = useState([]);
  const [busyAction, setBusyAction] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const status = material.status_detail;
  const isServer = material.type === 'server';
  const { groups, custom } = useMemo(() => buildGroups(material, typeDef), [material, typeDef]);

  useEffect(() => {
    setReveal(false);
  }, [material.id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadCommands = async () => {
    if (!isServer) return;
    try {
      const data = await api(`/api/materials/${material.id}/commands?limit=12`);
      if (mounted.current) setCommands(data.items || []);
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    if (!isServer) {
      setCommands([]);
      return;
    }
    loadCommands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id, isServer]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  };

  const runCommand = async (action) => {
    const meta = commandMeta[action];
    if (!meta) return;
    if (meta.danger) {
      const ok = await confirm({
        title: '确认下发指令',
        message: `确认对 ${material.code}（${material.name}）执行「${meta.label}」吗？`,
        hint: meta.description,
        confirmText: meta.label,
        danger: true,
      });
      if (!ok) return;
    }
    setBusyAction(action);
    try {
      const command = await api(`/api/materials/${material.id}/commands`, {
        method: 'POST',
        body: { action },
      });
      toast(`已下发「${meta.label}」`, 'success');
      if (mounted.current) setCommands((prev) => [command, ...prev].slice(0, 12));
      window.setTimeout(() => {
        if (mounted.current) loadCommands();
        onChanged?.();
      }, 2400);
      window.setTimeout(() => {
        if (mounted.current) loadCommands();
        onChanged?.();
      }, 5200);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  };

  const healthColor = {
    ok: '#34d399',
    warning: '#fbbf24',
    critical: '#f87171',
    offline: '#64748b',
    unknown: '#94a3b8',
  }[status?.health || 'unknown'];

  return (
    <section className="material-detail">
      <header className="md-head">
        <MaterialTypeIcon type={material.type} size={20} />
        <div className="md-title">
          <span className="md-code">{material.code}</span>
          <h2>{material.name}</h2>
        </div>
        <div className="md-head-actions">
          <StatusPill status={material.status} />
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="md-subline">
        <span>
          <TypeLabel type={material.type} />
        </span>
        <span className="sep">/</span>
        <span className="mono">
          <MapPin size={12} /> {material.location}
        </span>
        {material.model && (
          <>
            <span className="sep">/</span>
            <span>{material.model}</span>
          </>
        )}
      </div>

      <div className="md-scroll">
        {isServer && (
          <div className="detail-card runtime-card">
            <div className="detail-card-head">
              <span>
                <Activity size={15} /> 运行状态
              </span>
              <div className="runtime-actions">
                <HealthPill health={status?.health} powerState={status?.power_state} />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={refresh}
                  title="刷新状态"
                  disabled={refreshing}
                >
                  <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                </button>
              </div>
            </div>
            <div className="runtime-grid">
              <div className="runtime-stat">
                <Gauge size={15} />
                <div>
                  <span>CPU</span>
                  <strong>{status?.cpu_pct ?? '—'}%</strong>
                </div>
              </div>
              <div className="runtime-stat">
                <Activity size={15} />
                <div>
                  <span>内存</span>
                  <strong>{status?.mem_pct ?? '—'}%</strong>
                </div>
              </div>
              <div className="runtime-stat">
                <Thermometer size={15} />
                <div>
                  <span>温度</span>
                  <strong>{status?.temp_c ?? '—'}°C</strong>
                </div>
              </div>
              <div className="runtime-stat">
                <Clock size={15} />
                <div>
                  <span>运行时长</span>
                  <strong>{formatUptime(status?.uptime_s)}</strong>
                </div>
              </div>
            </div>
            <div className="meter-stack">
              <Meter label="CPU 使用率" value={status?.cpu_pct} color={healthColor} />
              <Meter label="内存使用率" value={status?.mem_pct} color="#38bdf8" />
            </div>
            <div className="runtime-foot">
              <span>电源：{status?.power_state === 'on' ? '开启' : status?.power_state === 'off' ? '关闭' : '未知'}</span>
              <span>最后上报：{formatTime(status?.last_seen)}</span>
            </div>
            {status?.metrics && Object.keys(status.metrics).length > 0 && (
              <div className="metrics-grid">
                {Object.entries(status.metrics)
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</strong>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {isServer && (
          <div className="detail-card">
            <div className="detail-card-head">
              <span>
                <Wifi size={15} /> 快捷指令
              </span>
              {simulateCommands && <em className="sim-hint">演示模式自动执行</em>}
            </div>
            <div className="command-grid">
              {Object.entries(commandMeta).map(([action, meta]) => {
                const Icon = COMMAND_ICONS[action] || Power;
                return (
                  <button
                    key={action}
                    type="button"
                    className={`command-btn ${meta.danger ? 'danger' : ''}`}
                    disabled={Boolean(busyAction)}
                    onClick={() => runCommand(action)}
                    title={meta.description}
                  >
                    <Icon size={15} className={busyAction === action ? 'spin' : ''} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
            {commands.length > 0 && (
              <div className="command-history">
                {commands.slice(0, 6).map((command) => (
                  <div className="command-row" key={command.id}>
                    <div>
                      <strong>{command.action_label}</strong>
                      <small>{formatTime(command.created_at)}</small>
                    </div>
                    <CommandStatusPill status={command.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="detail-card">
          <div className="detail-card-head">
            <span>
              <ShieldCheck size={15} /> 规格与凭据
            </span>
            {groups.some((group) => group.hasSecret) && (
              <button type="button" className="ghost-link" onClick={() => setReveal((value) => !value)}>
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                {reveal ? '隐藏敏感字段' : '显示敏感字段'}
              </button>
            )}
          </div>

          {groups.map((group) => (
            <div className="spec-group" key={group.name}>
              <h4>{group.name}</h4>
              <dl className="spec-list">
                {group.fields.map((field) => {
                  const value = fieldValue(field, material.spec, reveal);
                  return (
                    <div className={`spec-row ${field.secret ? 'secret' : ''}`} key={field.key}>
                      <dt>{field.label}</dt>
                      <dd className={field.type === 'password' || /ip|mac/i.test(field.key) ? 'mono' : ''}>
                        <span>{value}</span>
                        {value !== '—' && (!field.secret || reveal) && <CopyButton value={material.spec?.[field.key]} />}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}

          {custom.length > 0 && (
            <div className="spec-group">
              <h4>扩展信息</h4>
              <dl className="spec-list">
                {custom.map(([key, value]) => (
                  <div className="spec-row" key={key}>
                    <dt>{key}</dt>
                    <dd>
                      <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      <CopyButton value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <div className="detail-card">
          <div className="detail-card-head">
            <span>
              <Copy size={15} /> 资产信息
            </span>
          </div>
          <dl className="spec-list">
            <div className="spec-row">
              <dt>型号</dt>
              <dd>{material.model || '—'}</dd>
            </div>
            <div className="spec-row">
              <dt>厂商</dt>
              <dd>{material.vendor || '—'}</dd>
            </div>
            <div className="spec-row">
              <dt>序列号</dt>
              <dd className="mono">{material.serial || '—'}</dd>
            </div>
            <div className="spec-row">
              <dt>位置</dt>
              <dd>{material.location}</dd>
            </div>
            {material.parent_code && (
              <div className="spec-row">
                <dt>所属设备</dt>
                <dd>
                  <button type="button" className="link-btn" onClick={() => onOpenMaterial?.(material.parent_code)}>
                    {material.parent_code} <ChevronRight size={12} />
                  </button>
                </dd>
              </div>
            )}
            <div className="spec-row">
              <dt>创建时间</dt>
              <dd>{formatDateTime(material.created_at)}</dd>
            </div>
            <div className="spec-row">
              <dt>更新时间</dt>
              <dd>{formatDateTime(material.updated_at)}</dd>
            </div>
          </dl>
          {material.note && <p className="material-note">{material.note}</p>}
        </div>

        {Array.isArray(material.children) && material.children.length > 0 && (
          <div className="detail-card">
            <div className="detail-card-head">
              <span>子物料 · {material.children.length}</span>
            </div>
            <div className="child-list">
              {material.children.map((child) => (
                <button
                  type="button"
                  className="child-row"
                  key={child.id}
                  onClick={() => onOpenMaterial?.(child.code)}
                >
                  <MaterialTypeIcon type={child.type} size={14} />
                  <div>
                    <strong>{child.code}</strong>
                    <small>
                      {child.name}
                      {child.slot ? ` · ${child.slot}` : ''}
                    </small>
                  </div>
                  <StatusPill status={child.status} />
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="md-footer">
        {onLocate && material.rack_id && (
          <button type="button" className="btn btn-ghost" onClick={() => onLocate(material)}>
            <Focus size={15} /> 3D 定位
          </button>
        )}
        <div className="md-footer-right">
          {onEdit && (
            <button type="button" className="btn btn-ghost" onClick={() => onEdit(material)}>
              <Pencil size={15} /> 编辑
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => onDelete(material)}>
              <Trash2 size={15} /> 删除
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}