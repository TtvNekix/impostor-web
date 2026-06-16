import { createPortal } from 'react-dom';
import { useToastStore, useResolveToastMessage } from '../stores/toastStore';

/**
 * Renders the global toast stack as a React portal so it sits above
 * the rest of the app without being clipped by overflow:hidden on
 * any container.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const resolve = useResolveToastMessage();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.variant}`}
          onClick={() => dismiss(toast.id)}
        >
          <span className="toast__message">{resolve(toast)}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(toast.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
