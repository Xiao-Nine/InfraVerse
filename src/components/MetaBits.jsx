import {
  Boxes,
  Cable,
  CircuitBoard,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Package,
  PlugZap,
  Server,
} from 'lucide-react';
import { useMaterialTypes } from '../meta.jsx';

const TYPE_ICONS = {
  server: Server,
  switch: Network,
  nic: CircuitBoard,
  dpu: Cpu,
  memory: MemoryStick,
  disk: HardDrive,
  cable: Cable,
  sfp: Boxes,
  pdu: PlugZap,
  other: Package,
};

export function MaterialTypeIcon({ type, size = 16, className = '' }) {
  const { types } = useMaterialTypes();
  const def = types[type];
  const Icon = TYPE_ICONS[type] || Package;
  const color = def?.color || '#94a3b8';
  return (
    <span
      className={`type-icon ${className}`}
      style={{ color, background: `${color}1c`, borderColor: `${color}44` }}
      title={def?.label || type}
    >
      <Icon size={size} />
    </span>
  );
}

export function StatusPill({ status }) {
  const { statuses } = useMaterialTypes();
  if (!status) return <span className="pill pill-muted">—</span>;
  const meta = statuses[status] || { label: status, color: '#94a3b8' };
  return (
    <span className="pill" style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}>
      <i style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function HealthPill({ health, powerState }) {
  const { health: healthMeta } = useMaterialTypes();
  const meta = healthMeta[health] || { label: health || '未知', color: '#94a3b8' };
  const label = powerState === 'off' && health === 'offline' ? '离线' : meta.label;
  return (
    <span className="pill" style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}>
      <i className={health === 'critical' || health === 'warning' ? 'pulse' : ''} style={{ background: meta.color }} />
      {label}
    </span>
  );
}

const COMMAND_STATUS = {
  pending: { label: '排队中', color: '#38bdf8' },
  running: { label: '执行中', color: '#fbbf24' },
  done: { label: '已完成', color: '#34d399' },
  failed: { label: '失败', color: '#f87171' },
};

export function CommandStatusPill({ status }) {
  const meta = COMMAND_STATUS[status] || { label: status, color: '#94a3b8' };
  return (
    <span className="pill pill-sm" style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}>
      <i style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function TypeLabel({ type }) {
  const { types } = useMaterialTypes();
  return types[type]?.label || type;
}