import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { UIProvider } from './ui.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <UIProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </UIProvider>,
);