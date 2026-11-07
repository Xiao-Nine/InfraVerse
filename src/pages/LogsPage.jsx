import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, formatDateTime } from '../api.js';
import { EmptyState, Spinner } from '../ui.jsx';

const ACTION_LABELS = {
  'auth.login': '登录成功',
  'auth.login_failed': '登录失败',
  'auth.register': '注册账号',
  'auth.change_password': '修改密码',
  'material.create': '新增物料',
  'material.update': '修改物料',
  'material.delete': '删除物料',
  'rack.create': '新增机柜',
  'rack.update': '修改机柜',
  'rack.delete': '删除机柜',
  'command.create': '下发指令',
  'command.execute': '执行指令',
  'command.ack': '确认指令',
  'token.create': '创建 Token',
  'token.delete': '删除 Token',
  'telemetry.update': '状态上报',
  'system.seed': '系统初始化',
};

const ACTION_GROUPS = {
  auth: { label: '认证', color: '#38bdf8' },
  material: { label: '物料', color: '#22d3ee' },
  rack: { label: '机柜', color: '#a78bfa' },
  command: { label: '指令', color: '#fbbf24' },
  token: { label: 'Token', color: '#f472b6' },
  telemetry: { label: '状态', color: '#2dd4bf' },
  system: { label: '系统', color: '#94a3b8' },
};

const SOURCE_LABELS = {
  web: 'Web',
  mcp: 'MCP',
  agent: 'Agent',
  system: '系统',
  stdio: 'MCP stdio',
};

function actionGroup(action) {
  const prefix = String(action || '').split('.')[0];
  return ACTION_GROUPS[prefix] || { label: prefix || '其他', color: '#94a3b8' };
}

export default function LogsPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [action, setAction] = useState('');
  const [username, setUsername] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [data, setData] = useState({ items: [], total: 0 });
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    api('/api/logs/actions')
      .then((result) => setActions(result.items || []))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (silent = false) => {
      const requestId = ++requestRef.current;
      if (!silent) setLoading(true);
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      if (debouncedQ) params.set('q', debouncedQ);
      if (action) params.set('action', action);
      if (username) params.set('username', username);
      if (source) params.set('source', source);
      try {
        const result = await api(`/api/logs?${params.toString()}`);
        if (requestId === requestRef.current) {
          setData(result);
          setError('');
        }
      } catch (err) {
        if (requestId === requestRef.current) setError(err.message);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [page, pageSize, debouncedQ, action, username, source],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const rows = useMemo(() => data.items || [], [data.items]);
  const resetFilters = () => {
    setQ('');
    setAction('');
    setUsername('');
    setSource('');
    setPage(1);
  };
  const hasFilters = Boolean(q || action || username || source);

  return (
    <div className="page logs-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">AUDIT TRAIL</span>
          <h1>操作记录</h1>
          <p>全系统操作留痕。每位成员都是管理员，均可查看所有用户的操作记录。</p>
        </div>
        <div className="page-actions">
          <span className="transparency-badge">
            <ShieldCheck size={15} /> 全员可见
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => load()}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> 刷新
          </button>
        </div>
      </header>

      <div className="toolbar logs-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="搜索摘要 / 实体 / 用户…"
          />
          {q && (
            <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="清空">
              <X size={14} />
            </button>
          )}
        </div>
        <select className="select toolbar-select" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}>
          <option value="">全部动作</option>
          {actions.map((item) => (
            <option key={item} value={item}>{ACTION_LABELS[item] || item}</option>
          ))}
        </select>
        <input
          className="input toolbar-select"
          style={{ width: 150 }}
          value={username}
          onChange={(event) => { setUsername(event.target.value); setPage(1); }}
          placeholder="操作用户"
        />
        <select className="select toolbar-select" value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }}>
          <option value="">全部来源</option>
          <option value="web">Web</option>
          <option value="mcp">MCP</option>
          <option value="stdio">MCP stdio</option>
          <option value="agent">Agent</option>
          <option value="system">系统</option>
        </select>
        {hasFilters && (
          <button type="button" className="btn btn-filter" onClick={resetFilters}>
            <X size={14} /> 清除筛选
          </button>
        )}
        <div className="toolbar-spacer" />
        <span className="result-count">共 <strong>{data.total}</strong> 条</span>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="table-wrap">
        {loading && rows.length === 0 ? (
          <Spinner label="正在加载操作记录…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={History} title="暂无操作记录" hint="系统内的写操作、登录与指令执行都会记录在这里。" />
        ) : (
          <table className="data-table logs-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>动作</th>
                <th>摘要</th>
                <th>来源</th>
                <th>IP</th>
                <th className="th-actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const group = actionGroup(row.action);
                const isExpanded = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={isExpanded ? 'expanded' : ''}
                      onClick={() => setExpanded(isExpanded ? null : row.id)}
                    >
                      <td className="muted-cell nowrap">{formatDateTime(row.created_at)}</td>
                      <td>
                        <span className="log-user">{row.username || 'system'}</span>
                      </td>
                      <td>
                        <span className="action-pill" style={{ color: group.color, borderColor: `${group.color}44`, background: `${group.color}12` }}>
                          {ACTION_LABELS[row.action] || row.action}
                        </span>
                      </td>
                      <td className="log-summary">{row.summary || '—'}</td>
                      <td><span className="source-pill">{SOURCE_LABELS[row.source] || row.source}</span></td>
                      <td className="muted-cell mono">{row.ip || '—'}</td>
                      <td className="th-actions">
                        {row.detail ? (
                          <span className="icon-btn">{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                        ) : null}
                      </td>
                    </tr>
                    {isExpanded && row.detail && (
                      <tr className="log-detail-row" key={`${row.id}-detail`}>
                        <td colSpan={7}>
                          <pre>{JSON.stringify(row.detail, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination">
        <span>第 {page} / {totalPages} 页</span>
        <div className="pagination-buttons">
          <button type="button" className="icon-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="icon-btn" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}