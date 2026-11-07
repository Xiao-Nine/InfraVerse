import { useEffect } from 'react';
import { Boxes, History, LogOut, Package, Settings, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { StatusDot } from '../ui.jsx';

const NAV = [
  { path: '/twin', label: '孪生视图', icon: Boxes },
  { path: '/materials', label: '物料管理', icon: Package },
  { path: '/logs', label: '操作记录', icon: History },
  { path: '/settings', label: '系统设置', icon: Settings },
];

function initials(name) {
  if (!name) return 'IV';
  if (/^[a-zA-Z0-9_.-]+$/.test(name)) return name.slice(0, 2).toUpperCase();
  return name.slice(0, 2);
}

export default function Layout({ path, children }) {
  const { user, logout } = useAuth();
  const active = NAV.find((item) => path.startsWith(item.path)) || NAV[0];

  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector('.main')?.scrollTo(0, 0);
  }, [path]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/twin">
          <span className="brand-mark">
            <Boxes size={20} />
          </span>
          <span className="brand-text">
            <strong>
              Infra<span>Verse</span>
            </strong>
            <small>DATA CENTER TWIN</small>
          </span>
        </a>

        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.path} href={`#${item.path}`} className={`nav-item ${active.path === item.path ? 'active' : ''}`}>
                <Icon size={16} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="topbar-right">
          <span className="system-status">
            <StatusDot color="#34d399" pulse />
            <span>系统在线</span>
          </span>
          <div className="user-chip" title={`${user?.display_name || user?.username} · 管理员`}>
            <span className="avatar">{initials(user?.display_name || user?.username)}</span>
            <span className="user-meta">
              <strong>{user?.display_name || user?.username}</strong>
              <small>
                <ShieldCheck size={11} /> 管理员
              </small>
            </span>
          </div>
          <button type="button" className="icon-btn logout-btn" onClick={logout} title="退出登录" aria-label="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <main className={`main ${path === '/twin' ? 'main-twin' : ''}`}>{children}</main>
    </div>
  );
}