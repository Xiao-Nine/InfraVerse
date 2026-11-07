import { useState } from 'react';
import {
  ArrowRight,
  Boxes,
  Eye,
  EyeOff,
  KeyRound,
  PackageSearch,
  PlugZap,
  ScrollText,
  Server,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Spinner } from '../ui.jsx';

const FEATURES = [
  { icon: Boxes, title: '3D 数字孪生', text: '机柜、服务器与部件级可视化，点击即可查看状态。' },
  { icon: PackageSearch, title: '物料全生命周期', text: '编码 / 型号 / 位置 / 凭据，一物一档，随手可查。' },
  { icon: PlugZap, title: 'Agent 原生接入', text: '内置 MCP Server，让智能体安全地读写物料与状态。' },
  { icon: ScrollText, title: '全量操作审计', text: '所有写操作均留痕，全员管理员，记录完全透明。' },
];

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register({ username: username.trim(), password, display_name: displayName.trim() });
    } catch (err) {
      setError(err.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setPassword('');
    if (next === 'register' && username === 'admin') setUsername('');
  };

  return (
    <div className="login-page">
      <div className="login-grid" />
      <div className="login-glow glow-cyan" />
      <div className="login-glow glow-blue" />

      <section className="login-hero">
        <div className="login-brand">
          <span className="brand-mark large">
            <Boxes size={24} />
          </span>
          <span className="brand-text">
            <strong>
              Infra<span>Verse</span>
            </strong>
            <small>DATA CENTER DIGITAL TWIN</small>
          </span>
        </div>

        <h1>
          机房的
          <span className="gradient-text">数字孪生</span>
          <br />
          工作台
        </h1>
        <p className="login-lead">
          一个轻量、自托管的机房基础设施空间。用 3D 孪生跟踪每一台服务器，用结构化物料档案跟踪每一块网卡、DPU 和每一根线缆。
        </p>

        <div className="feature-grid">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div className="feature-card" key={feature.title}>
                <Icon size={17} />
                <strong>{feature.title}</strong>
                <span>{feature.text}</span>
              </div>
            );
          })}
        </div>

        <div className="login-iso" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div className={`iso-rack iso-${i}`} key={i}>
              <span className="iso-top" />
              <span className="iso-face">
                {Array.from({ length: 5 }).map((_, j) => (
                  <i key={j} className={j === i ? 'hot' : ''} />
                ))}
              </span>
              <span className="iso-led" />
            </div>
          ))}
          <div className="iso-floor" />
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-brand">
            <span className="brand-mark">
              <Boxes size={18} />
            </span>
            <span className="brand-text">
              <strong>
                Infra<span>Verse</span>
              </strong>
              <small>DATA CENTER DIGITAL TWIN</small>
            </span>
          </div>
          <div className="login-tabs">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
              登录
            </button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
              注册
            </button>
          </div>

          <div className="login-heading">
            <h2>{mode === 'login' ? '进入控制台' : '创建管理员账号'}</h2>
            <p>{mode === 'login' ? '使用你的账号登录 InfraVerse。' : '每位用户都是管理员，拥有全部系统权限。'}</p>
          </div>

          <form onSubmit={submit} className="login-form">
            <label className="field">
              <span>用户名</span>
              <div className="input-icon">
                <User size={15} />
                <input
                  className="input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="3-32 位字母或数字"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </label>

            {mode === 'register' && (
              <label className="field">
                <span>显示名称</span>
                <div className="input-icon">
                  <ShieldCheck size={15} />
                  <input
                    className="input"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="例如：基础设施运维"
                    autoComplete="nickname"
                  />
                </div>
              </label>
            )}

            <label className="field">
              <span>密码</span>
              <div className="input-icon">
                <KeyRound size={15} />
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 6 位"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" className="input-action" onClick={() => setShowPassword((v) => !v)} aria-label="显示密码">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            {error && <div className="form-error">{error}</div>}

            <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
              {busy ? <Spinner label={mode === 'login' ? '登录中' : '创建中'} /> : (
                <>
                  {mode === 'login' ? '登录控制台' : '创建并登录'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="demo-account">
            <Server size={15} />
            <span>
              演示账号 <code>admin</code> / <code>admin123</code>
            </span>
          </div>

          <p className="login-note">登录即代表你已了解：本系统的全部操作记录对所有成员可见。</p>
        </div>
      </section>
    </div>
  );
}