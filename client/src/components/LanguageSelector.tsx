import { useEffect, useRef, useState } from 'react';
import { LOCALE_LABELS, type Locale } from '../i18n/I18nContext';

interface LanguageSelectorProps {
  current: Locale;
  onChange: (l: Locale) => void;
}

/**
 * Dropdown for picking the active UI locale. The 6 supported locales
 * come from `LOCALE_LABELS` in the i18n context, so adding a new locale
 * only requires touching one file.
 *
 * Closes on outside-click and Escape. The trigger shows the short
 * 2-letter label (`EN`, `ES`, ...); the dropdown shows both the short
 * code and the full locale name in its own language.
 */
export function LanguageSelector({ current, onChange }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLabel = LOCALE_LABELS[current]?.short ?? current.toUpperCase();

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lang-selector" ref={containerRef}>
      <button
        type="button"
        className="lang-selector__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
      >
        {currentLabel}
        <span className="lang-selector__arrow" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="lang-selector__menu" role="listbox">
          {(Object.keys(LOCALE_LABELS) as Locale[]).map((loc) => (
            <li key={loc} role="option" aria-selected={loc === current}>
              <button
                type="button"
                className={`lang-selector__option${loc === current ? ' lang-selector__option--active' : ''}`}
                onClick={() => {
                  onChange(loc);
                  setOpen(false);
                }}
              >
                <span className="lang-selector__short">{LOCALE_LABELS[loc].short}</span>
                <span className="lang-selector__full">{LOCALE_LABELS[loc].code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
