import { useT } from '../i18n/I18nContext';

const GITHUB_REPO = 'https://github.com/TtvNekix/impostor-web';
const GITHUB_ISSUES = `${GITHUB_REPO}/issues`;

interface ContributeModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal explaining how others can help improve the game. All
 * contributions go through GitHub: fork → branch → commit → Pull
 * Request. The maintainer (TtvNekix) reviews and merges.
 */
export function ContributeModal({ open, onClose }: ContributeModalProps) {
  const t = useT();

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contribute-modal-title"
    >
      <div
        className="modal modal--wide contribute-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title" id="contribute-modal-title">
            {t.contribute.modalTitle}
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
          {/* Intro */}
          <p className="contribute-modal__intro">{t.contribute.intro}</p>

          {/* Ways to help */}
          <h3 className="contribute-modal__section-title">
            {t.contribute.ideasTitle}
          </h3>
          <ul className="contribute-modal__ideas">
            <li>🐛 {t.contribute.ideas.bugs}</li>
            <li>🔧 {t.contribute.ideas.code}</li>
            <li>🌍 {t.contribute.ideas.translate}</li>
            <li>🎨 {t.contribute.ideas.design}</li>
            <li>📖 {t.contribute.ideas.docs}</li>
          </ul>

          {/* PR workflow */}
          <h3 className="contribute-modal__section-title">
            {t.contribute.stepsTitle}
          </h3>
          <ol className="contribute-modal__steps">
            {t.contribute.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          {/* Review note */}
          <p className="contribute-modal__note">
            <span aria-hidden="true">🔍</span> {t.contribute.reviewNote}
          </p>

          {/* Action buttons */}
          <div className="contribute-modal__actions">
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary"
            >
              {t.contribute.githubButton}
            </a>
            <a
              href={GITHUB_ISSUES}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost"
            >
              {t.contribute.issuesButton}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
