import { useT } from '../i18n/I18nContext';

/**
 * Small "BETA · v1.0.0" pill displayed in the entry page hero so
 * visitors know the game is still in active development.
 */
export function VersionBadge() {
  const t = useT();
  return (
    <div className="version-badge" aria-label={`${t.common.beta} ${t.common.version}`}>
      <span className="version-badge__pill version-badge__pill--beta">
        {t.common.beta}
      </span>
      <span className="version-badge__version">{t.common.version}</span>
    </div>
  );
}
