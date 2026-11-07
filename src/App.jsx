import { RefreshCw, Server } from 'lucide-react';
import { useAuth } from './auth.jsx';
import { MetaProvider, useMeta } from './meta.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import TwinPage from './pages/TwinPage.jsx';
import MaterialsPage from './pages/MaterialsPage.jsx';
import LogsPage from './pages/LogsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { Spinner } from './ui.jsx';
import { useHashRoute } from './router.js';

function BootScreen({ label = '正在加载基础设施数据…' }) {
  return (
    <div className="boot-screen">
      <div className="boot-logo">
        <Server size={30} />
      </div>
      <Spinner label={label} />
    </div>
  );
}

function MetaGate({ children }) {
  const { meta, error, reload } = useMeta();
  if (!meta && !error) return <BootScreen label="正在同步物料与孪生数据…" />;
  if (!meta) {
    return (
      <div className="boot-screen">
        <div className="boot-error">
          <strong>无法加载系统元数据</strong>
          <span>{error}</span>
          <button type="button" className="btn btn-primary" onClick={reload}>
            <RefreshCw size={15} /> 重试
          </button>
        </div>
      </div>
    );
  }
  return children;
}

function AuthedApp() {
  const route = useHashRoute();
  let page = null;
  if (route.path === '/materials') page = <MaterialsPage route={route} />;
  else if (route.path === '/logs') page = <LogsPage route={route} />;
  else if (route.path === '/settings') page = <SettingsPage route={route} />;
  else page = <TwinPage route={route} />;

  return (
    <MetaProvider>
      <MetaGate>
        <Layout path={route.path}>{page}</Layout>
      </MetaGate>
    </MetaProvider>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <BootScreen label="正在验证登录状态…" />;
  if (!user) return <LoginPage />;
  return <AuthedApp />;
}

export { BootScreen };