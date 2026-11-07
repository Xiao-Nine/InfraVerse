import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';

/* --------------------------------- Toast --------------------------------- */

const ToastContext = createContext(null);

const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const counter = useRef(0);

  const push = useCallback((message, type = 'success') => {
    const id = ++counter.current;
    setItems((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
    return id;
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack">
        {items.map((item) => {
          const Icon = TOAST_ICONS[item.type] || Info;
          return (
            <div key={item.id} className={`toast toast-${item.type}`}>
              <Icon size={18} />
              <span>{item.message}</span>
              <button type="button" className="toast-close" onClick={() => remove(item.id)} aria-label="关闭">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside UIProvider');
  return value;
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({ title, subtitle, onClose, children, footer, size = 'md', danger = false }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal modal-${size} ${danger ? 'modal-danger' : ''}`} role="dialog" aria-modal="true">
        {(title || onClose) && (
          <header className="modal-head">
            <div>
              {title && <h3>{title}</h3>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            {onClose && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
                <X size={18} />
              </button>
            )}
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------- Confirm -------------------------------- */

const ConfirmContext = createContext(null);

function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setRequest({
          title: '确认操作',
          message: '',
          confirmText: '确认',
          cancelText: '取消',
          danger: false,
          ...options,
          resolve,
        });
      }),
    [],
  );

  const finish = (value) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Modal
          title={request.title}
          onClose={() => finish(false)}
          danger={request.danger}
          size="sm"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => finish(false)}>
                {request.cancelText}
              </button>
              <button
                type="button"
                autoFocus
                className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => finish(true)}
              >
                {request.confirmText}
              </button>
            </>
          }
        >
          <p className="confirm-message">{request.message}</p>
          {request.hint && <p className="confirm-hint">{request.hint}</p>}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used inside UIProvider');
  return value;
}

/* ---------------------------------- Misc --------------------------------- */

export function Spinner({ label = '加载中' }) {
  return (
    <div className="spinner-wrap">
      <Loader2 className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title = '暂无数据', hint, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={30} />}
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {action}
    </div>
  );
}

export function CopyButton({ value, className = '', label = '' }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async (event) => {
    event?.stopPropagation?.();
    if (value === undefined || value === null || value === '') return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(value));
      } else {
        const area = document.createElement('textarea');
        area.value = String(value);
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      toast('已复制到剪贴板', 'success');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  return (
    <button type="button" className={`icon-btn copy-btn ${className}`} onClick={copy} title="复制">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {label && <span>{label}</span>}
    </button>
  );
}

export function StatusDot({ color = '#34d399', pulse = false }) {
  return <span className={`status-dot ${pulse ? 'pulse' : ''}`} style={{ background: color, boxShadow: `0 0 8px ${color}` }} />;
}

export function UIProvider({ children }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}