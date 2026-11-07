import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronRight,
  Layers,
  Maximize2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Server,
  Tag,
  X,
} from 'lucide-react';
import { api, formatTime } from '../api.js';
import { useMaterialTypes } from '../meta.jsx';
import { navigate } from '../router.js';
import { Spinner, useConfirm, useToast } from '../ui.jsx';
import TwinScene from '../three/TwinScene.jsx';
import MaterialDetail from '../components/MaterialDetail.jsx';
import MaterialForm from '../components/MaterialForm.jsx';
import RackElevation from '../components/RackElevation.jsx';
import { HealthPill, MaterialTypeIcon, StatusPill } from '../components/MetaBits.jsx';

export default function TwinPage({ route }) {
  const { health: healthMeta } = useMaterialTypes();
  const toast = useToast();
  const confirm = useConfirm();
  const [twin, setTwin] = useState(null);
  const [dash, setDash] = useState(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState(null);
  const [focus, setFocus] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [formMaterial, setFormMaterial] = useState(null);
  const selectionRef = useRef(null);

  selectionRef.current = selection;

  const loadTwin = useCallback(
    async (silent = false) => {
      try {
        const [twinData, dashboardData] = await Promise.all([api('/api/twin'), api('/api/dashboard')]);
        setTwin(twinData);
        setDash(dashboardData);
        setError('');
      } catch (err) {
        if (!silent) setError(err.message);
      }
    },
    [],
  );

  const loadDetail = useCallback(
    async (id, silent = false) => {
      if (!id) return;
      if (!silent) setDetailLoading(true);
      try {
        const data = await api(`/api/materials/${id}`);
        if (selectionRef.current?.kind === 'material' && selectionRef.current.id === id) {
          setDetail(data);
        }
      } catch (err) {
        if (!silent) toast(err.message, 'error');
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    loadTwin();
    const timer = window.setInterval(() => loadTwin(true), 8000);
    return () => window.clearInterval(timer);
  }, [loadTwin]);

  useEffect(() => {
    if (selection?.kind !== 'material') {
      setDetail(null);
      return;
    }
    setDetail((prev) => (prev?.id === selection.id ? prev : null));
    loadDetail(selection.id);
    const timer = window.setInterval(() => loadDetail(selection.id, true), 10000);
    return () => window.clearInterval(timer);
  }, [selection?.kind, selection?.id, loadDetail]);

  useEffect(() => {
    const focusParam = route.params.get('focus');
    if (!focusParam) return;
    const [kind, rawId] = focusParam.split(':');
    const id = Number(rawId);
    if (!id || !['material', 'rack'].includes(kind)) return;
    setSelection({ kind, id });
    setFocus({ kind, id, nonce: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.toString()]);

  const refreshAfterChange = useCallback(() => {
    loadTwin(true);
    if (selectionRef.current?.kind === 'material') loadDetail(selectionRef.current.id, true);
  }, [loadTwin, loadDetail]);

  const selectAndFocus = (next) => {
    setSelection(next);
    setFocus({ ...next, nonce: Date.now() });
  };

  const handleDelete = async (material) => {
    const ok = await confirm({
      title: '删除物料',
      message: `确认删除 ${material.code}（${material.name}）吗？该操作不可恢复。`,
      hint: material.child_count > 0 ? `该物料下还有 ${material.child_count} 个子物料，稍后需要确认级联删除。` : undefined,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/materials/${material.id}`, { method: 'DELETE' });
      toast('物料已删除', 'success');
      setSelection(null);
      refreshAfterChange();
    } catch (err) {
      if (err.status === 409 && err.details?.descendants) {
        const cascade = await confirm({
          title: '级联删除',
          message: `该物料下仍有 ${err.details.descendants} 个子物料，是否一并删除？`,
          confirmText: '全部删除',
          danger: true,
        });
        if (!cascade) return;
        try {
          await api(`/api/materials/${material.id}?cascade=1`, { method: 'DELETE' });
          toast('物料及子物料已删除', 'success');
          setSelection(null);
          refreshAfterChange();
        } catch (nextError) {
          toast(nextError.message, 'error');
        }
      } else {
        toast(err.message, 'error');
      }
    }
  };

  const selectedRack = selection?.kind === 'rack' ? twin?.racks.find((rack) => rack.id === selection.id) : null;
  const inspectorOpen = Boolean(selection);
  const alerts = dash?.alerts || [];

  if (error && !twin) {
    return (
      <div className="twin-page twin-error">
        <AlertTriangle size={30} />
        <strong>孪生数据加载失败</strong>
        <span>{error}</span>
        <button type="button" className="btn btn-primary" onClick={() => loadTwin()}>
          <RefreshCw size={15} /> 重试
        </button>
      </div>
    );
  }

  if (!twin) {
    return (
      <div className="twin-page twin-loading">
        <Spinner label="正在构建 3D 孪生场景…" />
      </div>
    );
  }

  return (
    <div className="twin-page">
      <TwinScene
        data={twin}
        selection={selection}
        onSelect={setSelection}
        showLabels={showLabels}
        autoRotate={autoRotate}
        focus={focus}
        resetNonce={resetNonce}
      />

      <div className="twin-toolbar">
        <button
          type="button"
          className={`icon-btn ${showLabels ? 'active' : ''}`}
          onClick={() => setShowLabels((value) => !value)}
          title="机柜标签"
        >
          <Tag size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn ${autoRotate ? 'active' : ''}`}
          onClick={() => setAutoRotate((value) => !value)}
          title="自动旋转"
        >
          <RotateCcw size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setResetNonce((value) => value + 1)} title="重置视角">
          <Maximize2 size={16} />
        </button>
      </div>

      <aside className="twin-hud">
        <div className="hud-head">
          <div>
            <span className="hud-eyebrow">DIGITAL TWIN</span>
            <h2>{twin.room.name}</h2>
          </div>
          <span className="live-badge">
            <i /> LIVE
          </span>
        </div>

        <div className="hud-stats">
          <div className="hud-stat">
            <Server size={15} />
            <span>在线服务器</span>
            <strong>
              {dash?.servers.online ?? '—'}
              <em>/{dash?.servers.total ?? '—'}</em>
            </strong>
          </div>
          <div className="hud-stat">
            <Boxes size={15} />
            <span>物料总数</span>
            <strong>{dash?.materials.total ?? '—'}</strong>
          </div>
          <div className="hud-stat">
            <Layers size={15} />
            <span>机柜占用</span>
            <strong>{dash?.racks.occupancy ?? '—'}%</strong>
          </div>
          <div className="hud-stat">
            <Activity size={15} />
            <span>活跃告警</span>
            <strong className={alerts.length ? 'warn' : ''}>{alerts.length}</strong>
          </div>
        </div>

        <div className="hud-section">
          <div className="hud-section-head">
            <span>当前告警</span>
            <small>{alerts.length ? `${alerts.length} 条` : '全部正常'}</small>
          </div>
          {alerts.length === 0 ? (
            <div className="hud-empty">
              <span className="ok-dot" /> 所有服务器状态正常
            </div>
          ) : (
            <div className="alert-list">
              {alerts.slice(0, 4).map((alert) => {
                const color = healthMeta[alert.health]?.color || '#fbbf24';
                return (
                  <button
                    type="button"
                    className="alert-row"
                    key={alert.id}
                    onClick={() => selectAndFocus({ kind: 'material', id: alert.id })}
                  >
                    <i style={{ background: color }} />
                    <div>
                      <strong>{alert.code}</strong>
                      <small>{alert.message}</small>
                    </div>
                    <ChevronRight size={13} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hud-legend">
          {Object.entries(healthMeta).map(([key, meta]) => (
            <span key={key}>
              <i style={{ background: meta.color }} />
              {meta.label}
            </span>
          ))}
        </div>

        <div className="hud-foot">
          <ClockIcon /> 同步于 {formatTime(twin.updated_at)}
        </div>
      </aside>

      <aside className={`twin-inspector ${inspectorOpen ? 'open' : ''}`}>
        {selection?.kind === 'rack' && selectedRack && (
          <section className="rack-inspector">
            <header className="rack-inspector-head">
              <div>
                <span className="hud-eyebrow">RACK</span>
                <h2>机柜 {selectedRack.name}</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelection(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div className="rack-inspector-stats">
              <div>
                <span>占用</span>
                <strong>{selectedRack.occupancy}%</strong>
              </div>
              <div>
                <span>已用 U</span>
                <strong>{selectedRack.used_u}/{selectedRack.u_height}</strong>
              </div>
              <div>
                <span>设备</span>
                <strong>{selectedRack.devices.length}</strong>
              </div>
            </div>
            <div className="rack-inspector-body">
              <RackElevation
                rack={selectedRack}
                items={selectedRack.devices}
                onSelect={(device) => selectAndFocus({ kind: 'material', id: device.id })}
                compact
              />
              <div className="rack-device-list">
                {[...selectedRack.devices]
                  .sort((a, b) => b.position_u - a.position_u)
                  .map((device) => (
                    <button
                      type="button"
                      className="rack-device-row"
                      key={device.id}
                      onClick={() => selectAndFocus({ kind: 'material', id: device.id })}
                    >
                      <MaterialTypeIcon type={device.type} size={13} />
                      <div>
                        <strong>{device.code}</strong>
                        <small>
                          U{device.position_u}-U{device.position_u + device.u_height - 1} · {device.name}
                        </small>
                      </div>
                      {device.type === 'server' ? (
                        <HealthPill health={device.health} powerState={device.power_state} />
                      ) : (
                        <StatusPill status={device.status} />
                      )}
                    </button>
                  ))}
              </div>
            </div>
          </section>
        )}

        {selection?.kind === 'material' && (
          <>
            {detailLoading && !detail ? (
              <div className="inspector-loading">
                <Spinner label="读取物料详情…" />
              </div>
            ) : detail ? (
              <MaterialDetail
                material={detail}
                onClose={() => setSelection(null)}
                onEdit={(material) => setFormMaterial(material)}
                onDelete={handleDelete}
                onLocate={(material) => setFocus({ kind: 'material', id: material.id, nonce: Date.now() })}
                onOpenMaterial={(code) => navigate(`/materials?q=${encodeURIComponent(code)}`)}
                onRefresh={() => loadDetail(detail.id)}
                onChanged={refreshAfterChange}
              />
            ) : (
              <div className="inspector-loading">
                <Spinner label="物料不存在或已删除" />
              </div>
            )}
          </>
        )}

        {!selection && (
          <section className="rack-nav-panel">
            <header className="rack-inspector-head">
              <div>
                <span className="hud-eyebrow">RACKS</span>
                <h2>机柜导航</h2>
              </div>
              <span className="pill pill-muted">{twin.racks.length} 个</span>
            </header>
            <div className="rack-nav">
              {twin.racks.map((rack) => (
                <button
                  type="button"
                  className="rack-nav-row"
                  key={rack.id}
                  onClick={() => selectAndFocus({ kind: 'rack', id: rack.id })}
                >
                  <span className="rack-nav-name">{rack.name}</span>
                  <div className="rack-nav-bar">
                    <i style={{ width: `${Math.min(rack.occupancy || 0, 100)}%` }} />
                  </div>
                  <span className="rack-nav-meta">
                    {rack.devices.length} 台 · {rack.occupancy}%
                  </span>
                </button>
              ))}
            </div>
            <div className="rack-nav-tip">
              <MapPin size={14} />
              点击场景中的机柜或设备查看详情，拖拽旋转，滚轮缩放。
            </div>
          </section>
        )}
      </aside>

      <div className="twin-hint">
        <span>拖拽旋转</span>
        <i />
        <span>滚轮缩放</span>
        <i />
        <span>点击查看</span>
      </div>

      {formMaterial && (
        <MaterialForm
          key={formMaterial.id}
          material={formMaterial}
          onClose={() => setFormMaterial(null)}
          onSaved={(saved) => {
            setFormMaterial(null);
            setDetail(saved);
            loadTwin(true);
            loadDetail(saved.id, true);
          }}
        />
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}