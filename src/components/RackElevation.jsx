import { useMemo } from 'react';
import { useMaterialTypes } from '../meta.jsx';
import { MaterialTypeIcon } from './MetaBits.jsx';

const HEALTH_COLOR = {
  ok: '#34d399',
  warning: '#fbbf24',
  critical: '#f87171',
  offline: '#64748b',
  unknown: '#94a3b8',
};

export default function RackElevation({ rack, items = [], onSelect, selectedId, compact = false }) {
  const { types, statuses } = useMaterialTypes();
  const unit = compact ? 9 : 12;
  const height = (rack?.u_height || 42) * unit;

  const placed = useMemo(
    () =>
      items
        .filter((item) => item.position_u !== null && item.position_u !== undefined && item.rack_id === rack?.id)
        .sort((a, b) => a.position_u - b.position_u),
    [items, rack?.id],
  );

  const colorOf = (item) => {
    if (item.type === 'server' && item.health) return HEALTH_COLOR[item.health] || HEALTH_COLOR.unknown;
    if (item.status === 'fault') return '#f87171';
    if (item.status === 'maintenance') return '#fbbf24';
    if (item.status === 'spare') return '#64748b';
    return types[item.type]?.color || '#94a3b8';
  };

  const labels = [];
  for (let u = 1; u <= (rack?.u_height || 42); u++) {
    if (u === 1 || u % 5 === 0 || u === rack?.u_height) labels.push(u);
  }

  if (!rack) return null;

  return (
    <div className={`rack-elev ${compact ? 'compact' : ''}`}>
      <div className="rack-elev-top">
        <span className="rack-name">{rack.name}</span>
        <span className="rack-occupancy">{rack.occupancy ?? 0}% · {rack.used_u ?? 0}/{rack.u_height}U</span>
      </div>
      <div className="rack-elev-frame" style={{ height: height + 16 }}>
        <div className="rack-u-labels" style={{ bottom: 8, height }}>
          {labels.map((u) => (
            <span key={u} style={{ bottom: (u - 1) * unit }}>
              {u}U
            </span>
          ))}
        </div>
        <div
          className="rack-slots"
          style={{
            bottom: 8,
            height,
            '--u': `${unit}px`,
            backgroundSize: `100% ${unit}px`,
          }}
        >
          {placed.map((item) => {
            const color = colorOf(item);
            const blockHeight = Math.max(item.u_height * unit - 2, unit - 2);
            const active = selectedId === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`rack-slot ${active ? 'active' : ''}`}
                style={{
                  bottom: (item.position_u - 1) * unit + 1,
                  height: blockHeight,
                  borderColor: color,
                  background: `linear-gradient(90deg, ${color}33, ${color}12)`,
                }}
                onClick={() => onSelect?.(item)}
                title={`${item.code} · ${item.name}\nU${item.position_u}-U${item.position_u + item.u_height - 1} · ${
                  statuses[item.status]?.label || item.status
                }`}
              >
                <span className="rack-slot-icon">
                  <MaterialTypeIcon type={item.type} size={compact ? 9 : 11} />
                </span>
                <span className="rack-slot-code">{item.code}</span>
                <i style={{ background: color }} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="rack-elev-foot">
        <span>前视图</span>
        <span>{placed.length} 台设备</span>
      </div>
    </div>
  );
}