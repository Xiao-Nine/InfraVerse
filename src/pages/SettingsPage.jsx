import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Database,
  Globe,
  KeyRound,
  LayoutGrid,
  Pencil,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { api, formatBytes, formatDateTime, formatTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { CopyButton, Modal, Spinner, useConfirm, useToast } from '../ui.jsx';

const MCP_TOOLS = [
  ['whoami', '当前身份'],
  ['material_types', '物料类型与字段说明'],
  ['materials_search', '搜索物料'],
  ['materials_get', '查看物料详情（含凭据）'],
  ['materials_create', '新增物料'],
  ['materials_update', '修改物料'],
  ['materials_delete', '删除物料'],
  ['racks_list', '机柜列表'],
  ['racks_create', '新增机柜'],
  ['racks_update', '修改机柜'],
  ['racks_delete', '删除机柜'],
  ['dashboard_overview', '孪生总览与告警'],
  ['server_status_get', '查看服务器状态'],
  ['server_status_report', '上报服务器遥测'],
  ['commands_send', '下发服务器指令'],
  ['commands_list', '查看指令队列'],
  ['commands_ack', '确认指令结果'],
  ['logs_list', '查看操作记录'],
];

function emptyRackForm(rack) {
  return {
    name: rack?.name || '',
    row_label: rack?.row_label || '',
    col: rack?.col ?? '',
    x: rack?.x ?? 0,
    z: rack?.z ?? 0,
    rotation: rack?.rotation ?? 0,
    u_height: rack?.u_height ?? 42,
    power_capacity: rack?.power_capacity || '',
    note: rack?.note || '',
  };
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { meta, reload } = useMeta();
  const toast = useToast();
  const confirm = useConfirm();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [tokens, setTokens] = useState([]);
  const [tokenName, setTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState(null);

  const [racks, setRacks] = useState([]);
  const [rackForm, setRackForm] = useState(null);
  const [savingRack, setSavingRack] = useState(false);
  const [rackError, setRackError] = useState('');

  const loadTokens = useCallback(async () => {
    try {
      const result = await api('/api/tokens');
      setTokens(result.items || []);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [toast]);

  const loadRacks = useCallback(async () => {
    try {
      const result = await api('/api/racks');
      setRacks(result.items || []);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    loadTokens();
    loadRacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast('两次输入的新密码不一致', 'warning');
      return;
    }
    setSavingPassword(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { old_password: oldPassword, new_password: newPassword },
      });
      toast('密码已更新', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const createToken = async (event) => {
    event.preventDefault();
    if (!tokenName.trim()) {
      toast('请填写 Token 名称', 'warning');
      return;
    }
    setCreatingToken(true);
    try {
      const result = await api('/api/tokens', { method: 'POST', body: { name: tokenName.trim() } });
      setCreatedToken(result);
      setTokenName('');
      loadTokens();
      toast('API Token 已创建', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCreatingToken(false);
    }
  };

  const removeToken = async (token) => {
    const ok = await confirm({
      title: '删除 API Token',
      message: `删除「${token.name}」后，使用该 Token 的 Agent 将立即失去访问权限。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/tokens/${token.id}`, { method: 'DELETE' });
      toast('Token 已删除', 'success');
      loadTokens();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const submitRack = async (event) => {
    event.preventDefault();
    if (!rackForm) return;
    setRackError('');
    setSavingRack(true);
    const payload = {
      name: rackForm.values.name.trim(),
      row_label: rackForm.values.row_label.trim() || null,
      col: rackForm.values.col === '' ? null : Number(rackForm.values.col),
      x: Number(rackForm.values.x) || 0,
      z: Number(rackForm.values.z) || 0,
      rotation: Number(rackForm.values.rotation) || 0,
      u_height: Number(rackForm.values.u_height) || 42,
      power_capacity: rackForm.values.power_capacity.trim() || null,
      note: rackForm.values.note.trim() || null,
    };
    try {
      if (rackForm.rack) {
        await api(`/api/racks/${rackForm.rack.id}`, { method: 'PATCH', body: payload });
        toast('机柜已更新', 'success');
      } else {
        await api('/api/racks', { method: 'POST', body: payload });
        toast('机柜已创建', 'success');
      }
      setRackForm(null);
      loadRacks();
      reload();
    } catch (err) {
      setRackError(err.message);
    } finally {
      setSavingRack(false);
    }
  };

  const removeRack = async (rack) => {
    const ok = await confirm({
      title: '删除机柜',
      message: `确认删除机柜 ${rack.name} 吗？`,
      hint: rack.device_count ? `机柜内仍有 ${rack.device_count} 台设备，稍后需要确认强制下架。` : undefined,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/racks/${rack.id}`, { method: 'DELETE' });
      toast('机柜已删除', 'success');
      loadRacks();
      reload();
    } catch (err) {
      if (err.status === 409 && err.details?.device_count) {
        const force = await confirm({
          title: '强制下架并删除',
          message: `机柜内仍有 ${err.details.device_count} 台设备，强制删除会将它们全部下架为库存状态。`,
          confirmText: '强制删除',
          danger: true,
        });
        if (!force) return;
        try {
          await api(`/api/racks/${rack.id}?force=1`, { method: 'DELETE' });
          toast('机柜及设备已下架', 'success');
          loadRacks();
          reload();
        } catch (nextError) {
          toast(nextError.message, 'error');
        }
      } else {
        toast(err.message, 'error');
      }
    }
  };

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const snippets = useMemo(() => {
    const origin = window.location.origin;
    return {
      http: `URL: ${origin}/mcp\nTransport: Streamable HTTP\nHeader: Authorization: Bearer <API_TOKEN>`,
      stdio: `INFRAVERSE_TOKEN=iv_xxxxxxxx npm run mcp`,
      claude: `claude mcp add --transport http infraverse ${origin}/mcp \\\n  --header "Authorization: Bearer iv_xxxxxxxx"`,
      cursor: JSON.stringify(
        {
          mcpServers: {
            infraverse: {
              url: `${origin}/mcp`,
              headers: { Authorization: 'Bearer iv_xxxxxxxx' },
            },
          },
        },
        null,
        2,
      ),
      desktop: JSON.stringify(
        {
          mcpServers: {
            infraverse: {
              command: 'node',
              args: ['/绝对路径/InfraVerse/server/mcp-stdio.js'],
              env: { INFRAVERSE_TOKEN: 'iv_xxxxxxxx' },
            },
          },
        },
        null,
        2,
      ),
    };
  }, []);

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">SYSTEM</span>
          <h1>系统设置</h1>
          <p>账号安全、Agent 接入、机房布局与系统信息。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => scrollTo('settings-account')}>
            <User size={15} /> 账号
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => scrollTo('settings-mcp')}>
            <Terminal size={15} /> MCP
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => scrollTo('settings-racks')}>
            <LayoutGrid size={15} /> 机柜
          </button>
        </div>
      </header>

      <div className="settings-grid">
        <section className="panel settings-card" id="settings-account">
          <header className="panel-head">
            <span><User size={16} /> 账号信息</span>
            <span className="pill pill-success">管理员</span>
          </header>
          <div className="account-grid">
            <div className="account-avatar">{(user?.display_name || user?.username || 'IV').slice(0, 2)}</div>
            <div className="account-details">
              <strong>{user?.display_name || user?.username}</strong>
              <span>@{user?.username}</span>
              <small>注册于 {formatDateTime(user?.created_at)} · 最近登录 {formatTime(user?.last_login_at)}</small>
            </div>
            <button type="button" className="btn btn-ghost" onClick={logout}>退出登录</button>
          </div>

          <form className="password-form" onSubmit={changePassword}>
            <h4>修改密码</h4>
            <div className="form-grid">
              <label className="field">
                <span>原密码</span>
                <input className="input" type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} autoComplete="current-password" />
              </label>
              <label className="field">
                <span>新密码</span>
                <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 6 位" />
              </label>
              <label className="field">
                <span>确认新密码</span>
                <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingPassword}>
              {savingPassword ? <Spinner label="保存中" /> : '更新密码'}
            </button>
          </form>
        </section>

        <section className="panel settings-card" id="settings-mcp">
          <header className="panel-head">
            <span><KeyRound size={16} /> API Token 与 MCP 接入</span>
            <span className="muted">Agent 通过 Bearer Token 访问</span>
          </header>

          <form className="token-form" onSubmit={createToken}>
            <input
              className="input"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="Token 名称，例如 claude-code / monitoring-agent"
            />
            <button type="submit" className="btn btn-primary" disabled={creatingToken}>
              {creatingToken ? <Spinner label="创建中" /> : <><Plus size={15} /> 创建 Token</>}
            </button>
          </form>

          {createdToken && (
            <div className="token-reveal">
              <div className="token-reveal-head">
                <strong>Token 已生成，仅显示一次</strong>
                <button type="button" className="icon-btn" onClick={() => setCreatedToken(null)}>
                  <X size={15} />
                </button>
              </div>
              <code>{createdToken.token}</code>
              <div className="token-reveal-actions">
                <CopyButton value={createdToken.token} label="复制 Token" />
                <span>请立即妥善保存。</span>
              </div>
            </div>
          )}

          <div className="token-list">
            {tokens.length === 0 ? (
              <p className="muted">还没有 API Token。创建一个后即可连接 MCP Agent。</p>
            ) : (
              tokens.map((token) => (
                <div className="token-row" key={token.id}>
                  <div className="token-icon"><KeyRound size={15} /></div>
                  <div className="token-meta">
                    <strong>{token.name}</strong>
                    <small className="mono">{token.token_prefix}••••••</small>
                  </div>
                  <div className="token-dates">
                    <span>创建 {formatDateTime(token.created_at)}</span>
                    <span>最近使用 {token.last_used_at ? formatTime(token.last_used_at) : '从未'}</span>
                  </div>
                  <button type="button" className="icon-btn danger" onClick={() => removeToken(token)} title="删除">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="snippet-list">
            <div className="snippet">
              <div className="snippet-head">
                <span><Globe size={14} /> HTTP MCP 端点</span>
                <CopyButton value={snippets.http} />
              </div>
              <pre>{snippets.http}</pre>
            </div>
            <div className="snippet">
              <div className="snippet-head">
                <span><Terminal size={14} /> 本机 stdio MCP</span>
                <CopyButton value={snippets.stdio} />
              </div>
              <pre>{snippets.stdio}</pre>
            </div>
            <details className="snippet-details">
              <summary>Claude Code 接入命令</summary>
              <pre>{snippets.claude}</pre>
            </details>
            <details className="snippet-details">
              <summary>Cursor / 通用 HTTP 客户端配置</summary>
              <pre>{snippets.cursor}</pre>
            </details>
            <details className="snippet-details">
              <summary>Claude Desktop stdio 配置</summary>
              <pre>{snippets.desktop}</pre>
            </details>
          </div>

          <div className="mcp-tools">
            <h4>可用 MCP 工具 · {MCP_TOOLS.length}</h4>
            <div className="mcp-tools-grid">
              {MCP_TOOLS.map(([name, description]) => (
                <div key={name}>
                  <code>{name}</code>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel settings-card" id="settings-racks">
          <header className="panel-head">
            <span><LayoutGrid size={16} /> 机房布局</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRackError(''); setRackForm({ rack: null, values: emptyRackForm(null) }); }}>
              <Plus size={14} /> 新增机柜
            </button>
          </header>
          <p className="panel-hint">
            机柜默认排成一行（z = 0，朝向 +Z）。修改 x / z / rotation 会同步到 3D 孪生场景。
          </p>
          <div className="rack-admin-list">
            {racks.map((rack) => (
              <div className="rack-admin-row" key={rack.id}>
                <div className="rack-admin-name">
                  <Boxes size={16} />
                  <div>
                    <strong>{rack.name}</strong>
                    <small>{rack.row_label} 列 · X {rack.x} / Z {rack.z} · 旋转 {Math.round((rack.rotation * 180) / Math.PI)}°</small>
                  </div>
                </div>
                <div className="rack-admin-meta">
                  <span>{rack.device_count} 台</span>
                  <span>{rack.used_u}/{rack.u_height}U · {rack.occupancy}%</span>
                  <div className="rack-admin-bar"><i style={{ width: `${Math.min(rack.occupancy, 100)}%` }} /></div>
                </div>
                <div className="row-actions">
                  <button type="button" className="icon-btn" title="编辑" onClick={() => { setRackError(''); setRackForm({ rack, values: emptyRackForm(rack) }); }}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="icon-btn danger" title="删除" onClick={() => removeRack(rack)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel settings-card" id="settings-about">
          <header className="panel-head">
            <span><Database size={16} /> 系统信息</span>
            <span className="pill pill-success">v{meta.version}</span>
          </header>
          <dl className="spec-list about-list">
            <div className="spec-row"><dt>数据库</dt><dd className="mono">SQLite · {formatBytes(meta.db?.size)}</dd></div>
            <div className="spec-row"><dt>数据文件</dt><dd className="mono">{meta.db?.path}</dd></div>
            <div className="spec-row"><dt>机房尺寸</dt><dd>{meta.room?.width} × {meta.room?.depth} m</dd></div>
            <div className="spec-row"><dt>指令执行</dt><dd>{meta.simulate_commands ? '演示模式（自动模拟）' : '由 Agent 轮询执行'}</dd></div>
            <div className="spec-row"><dt>注册</dt><dd>{meta.allow_register ? '开放注册' : '已关闭'}</dd></div>
            <div className="spec-row"><dt>权限模型</dt><dd>全员管理员 · 全量操作记录可见</dd></div>
          </dl>
          <div className="about-note">
            <ShieldCheck size={15} />
            <span>
              InfraVerse 是一个轻量、自托管的机房数字孪生与物料管理平台。数据全部保存在本机 SQLite，可通过 Docker 一键部署。
            </span>
          </div>
        </section>
      </div>

      {rackForm && (
        <Modal
          title={rackForm.rack ? `编辑机柜 · ${rackForm.rack.name}` : '新增机柜'}
          subtitle="坐标单位为米，rotation 为朝向弧度（0 面向 +Z，π 面向 -Z）"
          onClose={savingRack ? undefined : () => setRackForm(null)}
          size="md"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRackForm(null)} disabled={savingRack}>
                取消
              </button>
              <button type="submit" form="rack-form" className="btn btn-primary" disabled={savingRack}>
                {savingRack ? <Spinner label="保存中" /> : '保存机柜'}
              </button>
            </>
          }
        >
          <form id="rack-form" className="material-form" onSubmit={submitRack}>
            {rackError && <div className="form-error">{rackError}</div>}
            <div className="form-grid">
              <label className="field">
                <span>机柜名称 *</span>
                <input className="input" value={rackForm.values.name} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, name: event.target.value } }))} placeholder="例如 B07" />
              </label>
              <label className="field">
                <span>列标识</span>
                <input className="input" value={rackForm.values.row_label} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, row_label: event.target.value } }))} placeholder="A" />
              </label>
              <label className="field">
                <span>列内序号</span>
                <input className="input" type="number" value={rackForm.values.col} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, col: event.target.value } }))} />
              </label>
              <label className="field">
                <span>U 高度</span>
                <input className="input" type="number" min="1" max="60" value={rackForm.values.u_height} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, u_height: event.target.value } }))} />
              </label>
              <label className="field">
                <span>X 坐标 (m)</span>
                <input className="input" type="number" step="0.05" value={rackForm.values.x} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, x: event.target.value } }))} />
              </label>
              <label className="field">
                <span>Z 坐标 (m)</span>
                <input className="input" type="number" step="0.05" value={rackForm.values.z} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, z: event.target.value } }))} />
              </label>
              <label className="field">
                <span>旋转 (弧度)</span>
                <input className="input" type="number" step="0.1" value={rackForm.values.rotation} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, rotation: event.target.value } }))} />
              </label>
              <label className="field">
                <span>供电容量</span>
                <input className="input" value={rackForm.values.power_capacity} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, power_capacity: event.target.value } }))} placeholder="2 × 32A 三相" />
              </label>
            </div>
            <label className="field">
              <span>备注</span>
              <input className="input" value={rackForm.values.note} onChange={(event) => setRackForm((prev) => ({ ...prev, values: { ...prev.values, note: event.target.value } }))} />
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}