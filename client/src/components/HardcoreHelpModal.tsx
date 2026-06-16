import { useT } from '../i18n/I18nContext';

interface HardcoreHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/** Small modal explaining hardcore mode. Triggered by (?) button in lobby. */
export function HardcoreHelpModal({ open, onClose }: HardcoreHelpModalProps) {
  const t = useT();
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hardcore-modal-title"
    >
      <div
        className="modal modal--small"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title" id="hardcore-modal-title">
            {t.lobby.helpHardcore}
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label={t.common.close}
          >
            ✕
          </button>
        </div>
        <div className="modal__body">
          <p className="hardcore-help__intro">{t.lobby.hardcoreHelp}</p>
          <ul className="hardcore-help__bullets">
            <li>{t.lobby.hardcoreHelpBullets.one}</li>
            <li>{t.lobby.hardcoreHelpBullets.two}</li>
            <li>{t.lobby.hardcoreHelpBullets.three}</li>
            <li>{t.lobby.hardcoreHelpBullets.four}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
