import { useEffect, useRef } from 'react';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Generic confirm/cancel modal. Renders a backdrop that closes on
 * click, traps focus on the Confirm button, and listens for Escape to
 * cancel. Uses the existing .modal / .modal-backdrop styles.
 */
export function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the confirm button on open so Enter triggers it.
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === 'danger' ? 'btn btn--danger' : 'btn btn--primary';

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title" id="confirm-modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={onCancel}
            aria-label={cancelLabel}
          >
            ✕
          </button>
        </div>
        <div className="modal__body">
          <p className="confirm-modal__message">{message}</p>
          <div className="confirm-modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              type="button"
              ref={confirmBtnRef}
              className={confirmClass}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
