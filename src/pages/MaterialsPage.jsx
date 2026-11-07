import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Focus,
  Layers,
  LayoutGrid,
  MapPin,
  Package,
  PackageOpen,
  Pencil,
  Server,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api, formatTime } from '../api.js';
import { useMaterialTypes } from '../meta.jsx';
import { navigate } from '../router.js';
import { EmptyState, Modal, Spinner, useConfirm, useToast } from '../ui.jsx';
import MaterialDetail from '../components/MaterialDetail.jsx';
import MaterialForm from '../components/MaterialForm.jsx';
import RackElevation from '../components/RackElevation.jsx';
import { MaterialTypeIcon, StatusPill, TypeLabel } from '../components/MetaBits.jsx';

export default function MaterialsPage({ route }) {
  const { types, statuses } = useMaterialTypes();
  const toast = useToast();
  const confirm = useConfirm();

  const [q, setQ] = useState(route.params.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(route.params.get('q') || '');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [rackFilter, setRackFilter] = useState('');
  const [unplaced, setUnplaced] = useState(false);
  const [rootOnly, setRootOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState({ items: [], total: 0 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [racks, setRacks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formState, setFormState] = useState(null);
  const [rackModalOpen, setRackModalOpen] = useState(false);
  const [rackModalSelected, setRackModalSelected] = useState('');
  const [rackElevation, setRackElevation] = useState(null);
  const [rackLoading, setRackLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const param = route.params.get('q');
    if (param) {
      setQ(param);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.toString()]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [q]);

  const loadRacks = useCallback(async () => {
    try {
      const result = await api('/api/racks');
      setRacks(result.items || []);
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => {
    loadRacks();
  }, [loadRacks]);

  const loadStats = useCallback(async () => {
    try {
      const result = await api('/api/dashboard');
      setStats(result);
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort: 'code',
      order: 'asc',
    });
    if (debouncedQ) params.set('q', debouncedQ);
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (rackFilter) params.set('rack', rackFilter);
    if (unplaced) params.set('unplaced', '1');
    if (rootOnly) params.set('root_only', '1');

    setLoading(true);
    api(`/api/materials?${params.toString()}`, { signal: controller.signal })
      .then((result) => {
        if (requestId !== requestRef.current) return;
        setData(result);
        setError('');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (requestId === requestRef.current) setError(err.message);
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQ, type, status, rackFilter, unplaced, rootOnly, page, pageSize]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    api(`/api/materials/${encodeURIComponent(selected)}`)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err) => {
        if (!cancelled) toast(err.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (!rackModalOpen || !rackModalSelected) return;
    let cancelled = false;
    setRackLoading(true);
    api(`/api/racks/${encodeURIComponent(rackModalSelected)}/elevation`)
      .then((result) => {
        if (!cancelled) setRackElevation(result);
      })
      .catch((err) => {
        if (!cancelled) toast(err.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setRackLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rackModalOpen, rackModalSelected]);

  const refresh = useCallback(() => {
    setPage((value) => value);
    // 通过修改一个无关紧要的 state 不可靠，直接重新请求由 effect 依赖驱动；
    // 这里使用一次手动请求覆盖当前筛选条件。
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort: 'code',
      order: 'asc',
    });
    if (debouncedQ) params.set('q', debouncedQ);
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (rackFilter) params.set('rack', rackFilter);
    if (unplaced) params.set('unplaced', '1');
    if (rootOnly) params.set('root_only', '1');
    setLoading(true);
    api(`/api/materials?${params.toString()}`)
      .then(setData)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedQ, type, status, rackFilter, unplaced, rootOnly, toast]);

  const refreshAfterChange = useCallback(() => {
    refresh();
    loadRacks();
    loadStats();
    if (selected) {
      api(`/api/materials/${encodeURIComponent(selected)}`)
        .then(setDetail)
        .catch(() => {});
    }
  }, [refresh, loadRacks, loadStats, selected]);

  const openEdit = async (material) => {
    try {
      const full = detail?.id === material.id ? detail : await api(`/api/materials/${material.id}`);
      setFormState({ material: full });
    } catch (err) {
      toast(err.message, 'error');
    }
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
      setSelected(null);
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
          setSelected(null);
          refreshAfterChange();
        } catch (nextError) {
          toast(nextError.message, 'error');
        }
      } else {
        toast(err.message, 'error');
      }
    }
  };

  const locate = (material) => {
    navigate(`/twin?focus=material:${material.id}`);
  };

  const selectStat = ({ nextType = '', nextStatus = '', nextUnplaced = false }) => {
    setType(nextType);
    setStatus(nextStatus);
    setUnplaced(nextUnplaced);
    setRootOnly(false);
    setQ('');
    setDebouncedQ('');
    setPage(1);
  };

  const openRackModal = () => {
    setRackModalOpen(true);
    setRackModalSelected((prev) => prev || racks[0]?.name || '');
  };

  const openRack = (name) => {
    setRackModalSelected(name);
    setRackModalOpen(true);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const activeFilters = Boolean(type || status || rackFilter || unplaced || rootOnly);

  const rackOptions = useMemo(() => racks, [racks]);

  return (
    <div className="page materials-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">INVENTORY</span>
          <h1>物料管理</h1>
          <p>跟踪每一台设备、每一块网卡与 DPU、每一根线缆的位置与凭据。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={openRackModal}>
            <LayoutGrid size={15} /> 机柜视图
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setFormState({ material: null })}>
            <Plus size={16} /> 新增物料
          </button>
        </div>
      </header>

      <div className="inventory-stats">
        <button
          type="button"
          className={`inv-stat ${!type && !status && !unplaced && !rootOnly ? 'active' : ''}`}
          onClick={() => selectStat({})}
        >
          <Boxes size={16} />
          <strong>{stats?.materials.total ?? '—'}</strong>
          <span>物料总数</span>
        </button>
        {['server', 'nic', 'dpu', 'memory', 'cable', 'switch'].map((key) => (
          <button
            type="button"
            key={key}
            className={`inv-stat ${type === key ? 'active' : ''}`}
            onClick={() => selectStat({ nextType: key })}
          >
            <MaterialTypeIcon type={key} size={15} />
            <strong>{stats?.materials.by_type?.[key] ?? 0}</strong>
            <span>{types[key]?.label || key}</span>
          </button>
        ))}
        <button
          type="button"
          className={`inv-stat ${status === 'spare' ? 'active' : ''}`}
          onClick={() => selectStat({ nextStatus: 'spare' })}
        >
          <PackageOpen size={16} />
          <strong>{stats?.materials.by_status?.spare ?? 0}</strong>
          <span>库存物料</span>
        </button>
        <button
          type="button"
          className={`inv-stat danger ${status === 'fault' ? 'active' : ''}`}
          onClick={() => selectStat({ nextStatus: 'fault' })}
        >
          <AlertTriangle size={16} />
          <strong>{stats?.materials.by_status?.fault ?? 0}</strong>
          <span>故障物料</span>
        </button>
        <button
          type="button"
          className="inv-stat online"
          onClick={() => navigate('/twin')}
        >
          <Server size={16} />
          <strong>{stats ? `${stats.servers.online}/${stats.servers.total}` : '—'}</strong>
          <span>在线服务器</span>
        </button>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="搜索编码 / 名称 / 型号 / IP / 机柜…"
          />
          {q && (
            <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="清空搜索">
              <X size={14} />
            </button>
          )}
        </div>

        <select className="select toolbar-select" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
          <option value="">全部类型</option>
          {Object.entries(types).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>

        <select className="select toolbar-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          {Object.entries(statuses).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>

        <select
          className="select toolbar-select"
          value={rackFilter}
          onChange={(event) => { setRackFilter(event.target.value); setPage(1); }}
        >
          <option value="">全部机柜</option>
          {rackOptions.map((rack) => (
            <option key={rack.id} value={rack.name}>{rack.name}</option>
          ))}
        </select>

        <button
          type="button"
          className={`btn btn-filter ${unplaced ? 'active' : ''}`}
          onClick={() => { setUnplaced((value) => !value); setPage(1); }}
          title="只看未上架 / 库存物料"
        >
          <PackageOpen size={15} /> 库存
        </button>

        <button
          type="button"
          className={`btn btn-filter ${rootOnly ? 'active' : ''}`}
          onClick={() => { setRootOnly((value) => !value); setPage(1); }}
          title="隐藏服务器内部部件，只看顶层设备"
        >
          <Layers size={15} /> 仅顶层
        </button>

        <div className="toolbar-spacer" />
        <span className="result-count">
          共 <strong>{data.total}</strong> 条
        </span>
        <button type="button" className="icon-btn" onClick={refresh} title="刷新">
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="table-wrap">
        {loading && data.items.length === 0 ? (
          <Spinner label="正在检索物料…" />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="没有匹配的物料"
            hint={activeFilters || debouncedQ ? '尝试调整搜索条件或清除筛选。' : '创建第一件物料，开始建立机房资产台账。'}
            action={
              <button type="button" className="btn btn-primary" onClick={() => setFormState({ material: null })}>
                <Plus size={15} /> 新增物料
              </button>
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>物料</th>
                <th>类型</th>
                <th>型号 / 厂商</th>
                <th>位置</th>
                <th>状态</th>
                <th>更新时间</th>
                <th className="th-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className={detail?.id === item.id ? 'selected' : ''} onClick={() => setSelected(item.id)}>
                  <td>
                    <div className="table-material">
                      <MaterialTypeIcon type={item.type} size={16} />
                      <div>
                        <strong className="mono">{item.code}</strong>
                        <small>
                          {item.name}
                          {item.child_count > 0 ? ` · ${item.child_count} 个部件` : ''}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="type-label">{types[item.type]?.label || item.type}</span>
                  </td>
                  <td>
                    <div className="table-model">
                      <span>{item.model || '—'}</span>
                      <small>{item.vendor || '—'}</small>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="location-cell" onClick={(event) => { event.stopPropagation(); if (item.rack_name) openRack(item.rack_name); }}>
                      <MapPin size={13} />
                      <span>{item.location}</span>
                    </button>
                  </td>
                  <td><StatusPill status={item.status} /></td>
                  <td className="muted-cell">{formatTime(item.updated_at)}</td>
                  <td>
                    <div className="row-actions">
                      {item.rack_id && (
                        <button type="button" className="icon-btn" title="3D 定位" onClick={(event) => { event.stopPropagation(); locate(item); }}>
                          <Focus size={15} />
                        </button>
                      )}
                      <button type="button" className="icon-btn" title="编辑" onClick={(event) => { event.stopPropagation(); openEdit(item); }}>
                        <Pencil size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination">
        <span>
          第 {page} / {totalPages} 页
        </span>
        <select className="select select-sm" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
          <option value={20}>20 条/页</option>
          <option value={50}>50 条/页</option>
          <option value={100}>100 条/页</option>
        </select>
        <div className="pagination-buttons">
          <button type="button" className="icon-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="icon-btn" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="drawer">
            {detailLoading && !detail ? (
              <Spinner label="读取物料详情…" />
            ) : detail ? (
              <MaterialDetail
                material={detail}
                onClose={() => setSelected(null)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onLocate={locate}
                onOpenMaterial={(code) => setSelected(code)}
                onRefresh={() =>
                  api(`/api/materials/${encodeURIComponent(selected)}`)
                    .then(setDetail)
                    .catch((err) => toast(err.message, 'error'))
                }
                onChanged={refreshAfterChange}
              />
            ) : null}
          </aside>
        </>
      )}

      {formState !== null && (
        <MaterialForm
          key={formState.material?.id || 'new'}
          material={formState.material}
          onClose={() => setFormState(null)}
          onSaved={(saved) => {
            setFormState(null);
            setDetail(saved);
            setSelected(saved.id);
            refreshAfterChange();
          }}
        />
      )}

      {rackModalOpen && (
        <Modal
          title="机柜视图"
          subtitle="选择机柜查看前视图与 U 位占用，点击设备查看详情"
          size="md"
          onClose={() => setRackModalOpen(false)}
        >
          <div className="rack-modal">
            <div className="rack-modal-toolbar">
              <select
                className="select"
                value={rackModalSelected}
                onChange={(event) => setRackModalSelected(event.target.value)}
              >
                {racks.map((rack) => (
                  <option key={rack.id} value={rack.name}>
                    {rack.name} · {rack.devices ?? rack.device_count} 台 · {rack.occupancy}%
                  </option>
                ))}
              </select>
              {rackModalSelected && (
                <button type="button" className="btn btn-ghost" onClick={() => { setRackModalOpen(false); setRackFilter(rackModalSelected); setPage(1); }}>
                  <Boxes size={15} /> 查看机柜物料
                </button>
              )}
            </div>
            {rackLoading ? (
              <Spinner label="加载机柜视图…" />
            ) : rackElevation ? (
              <div className="rack-modal-body">
                <RackElevation
                  rack={rackElevation.rack}
                  items={rackElevation.items}
                  onSelect={(item) => {
                    setRackModalOpen(false);
                    setSelected(item.id);
                  }}
                />
                <div className="rack-modal-meta">
                  <h4>机柜信息</h4>
                  <dl className="spec-list">
                    <div className="spec-row"><dt>机柜</dt><dd>{rackElevation.rack.name}</dd></div>
                    <div className="spec-row"><dt>容量</dt><dd>{rackElevation.rack.u_height}U</dd></div>
                    <div className="spec-row"><dt>已用</dt><dd>{rackElevation.rack.used_u}U · {rackElevation.rack.occupancy}%</dd></div>
                    <div className="spec-row"><dt>供电</dt><dd>{rackElevation.rack.power_capacity || '—'}</dd></div>
                    <div className="spec-row"><dt>备注</dt><dd>{rackElevation.rack.note || '—'}</dd></div>
                  </dl>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </div>
  );
}