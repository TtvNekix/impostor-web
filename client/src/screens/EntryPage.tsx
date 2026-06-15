import { useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useT, useLocale, useSetLocale, type Locale } from '../i18n/I18nContext';
import { CustomSelect, type CustomSelectOption } from '../components/CustomSelect';
import { generateRoomCode, ALLOWED_MAX_PLAYERS, DEFAULT_MAX_PLAYERS } from '@impostor/shared';

interface EntryPageProps {
  createRoom: (payload: { code: string; username: string }) => void;
  joinRoom: (payload: { code: string; username: string }) => void;
}

const MAX_PLAYER_OPTIONS: CustomSelectOption<number>[] = ALLOWED_MAX_PLAYERS.map((n) => ({
  value: n,
  label: String(n),
}));

/**
 * Landing page shown when the user has no room yet. Lets them pick:
 *   - "By word" mode (the current game) — with a create/join form inside
 *   - "By image" mode — disabled, marked as "Coming soon"
 *
 * Also hosts the language selector in the top corner.
 */
export function EntryPage({ createRoom, joinRoom }: EntryPageProps) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();

  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [maxPlayers, setMaxPlayers] = useState<number>(DEFAULT_MAX_PLAYERS);
  const error = useConnectionStore((s) => s.error);
  const clearError = useConnectionStore((s) => s.clearError);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (mode === 'create') {
      const roomCode = code.trim().toUpperCase() || generateRoomCode();
      createRoom({ code: roomCode, username: username.trim() });
    } else {
      joinRoom({ code: code.trim().toUpperCase(), username: username.trim() });
    }
  };

  return (
    <div className="entry-page">
      {/* Language selector — top right */}
      <div className="entry-page__lang">
        <LanguageToggle current={locale} onChange={setLocale} />
      </div>

      {/* Title block */}
      <div className="entry-page__hero">
        <h1 className="entry-page__title">{t.entry.title}</h1>
        <p className="entry-page__subtitle">{t.entry.subtitle}</p>
      </div>

      {/* Game mode cards */}
      <div className="entry-page__modes">
        {/* WORD MODE — active */}
        <div className="mode-card mode-card--active" aria-label={t.entry.wordMode.title}>
          <header className="mode-card__header">
            <h2 className="mode-card__title">{t.entry.wordMode.title}</h2>
            <span className="mode-card__meta">{t.entry.wordMode.minPlayers}</span>
          </header>
          <p className="mode-card__desc">{t.entry.wordMode.description}</p>

          {/* Create / Join form inside the active card */}
          <div className="mode-card__form">
            <div className="toggle-group">
              <button
                type="button"
                onClick={() => { setMode('create'); clearError(); }}
                className={`toggle-group__btn${mode === 'create' ? ' toggle-group__btn--active' : ''}`}
              >
                {t.lobby.createRoom}
              </button>
              <button
                type="button"
                onClick={() => { setMode('join'); clearError(); }}
                className={`toggle-group__btn${mode === 'join' ? ' toggle-group__btn--active' : ''}`}
              >
                {t.lobby.joinRoom}
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mode-card__fields"
            >
              <input
                type="text"
                placeholder={t.lobby.enterUsername}
                value={username}
                onChange={(e) => { setUsername(e.target.value); if (error) clearError(); }}
                maxLength={20}
                className="input"
              />

              {mode === 'create' ? (
                <div className="mode-card__row">
                  <label htmlFor="max-players-select" className="mode-card__row-label">
                    {t.lobby.maxPlayers}
                  </label>
                  <CustomSelect
                    value={maxPlayers}
                    options={MAX_PLAYER_OPTIONS}
                    onChange={setMaxPlayers}
                    ariaLabel={t.lobby.maxPlayers}
                    className="connection-max-players"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  placeholder={t.lobby.enterRoomCode}
                  value={code}
                  onChange={(e) => { setCode(e.target.value); if (error) clearError(); }}
                  maxLength={6}
                  className="input"
                  style={{ textTransform: 'uppercase' }}
                />
              )}

              <button
                type="submit"
                disabled={!username.trim() || (mode === 'join' && !code.trim())}
                className="btn btn--primary btn--block"
              >
                {mode === 'create' ? t.lobby.create : t.lobby.join}
              </button>

              {error && (
                <p className="connection-screen__error">{error}</p>
              )}
            </form>
          </div>
        </div>

        {/* IMAGE MODE — coming soon */}
        <div
          className="mode-card mode-card--disabled"
          aria-disabled="true"
          aria-label={t.entry.imageMode.title}
        >
          <header className="mode-card__header">
            <h2 className="mode-card__title">{t.entry.imageMode.title}</h2>
            <span className="mode-card__meta">{t.entry.imageMode.maxPlayers}</span>
          </header>
          <p className="mode-card__desc">{t.entry.imageMode.description}</p>
          <div className="mode-card__badge">{t.entry.imageMode.comingSoon}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Language toggle                                                     */
/* ------------------------------------------------------------------ */

interface LanguageToggleProps {
  current: Locale;
  onChange: (l: Locale) => void;
}

function LanguageToggle({ current, onChange }: LanguageToggleProps) {
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => onChange('en')}
        className={`lang-toggle__btn${current === 'en' ? ' lang-toggle__btn--active' : ''}`}
        aria-pressed={current === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => onChange('es')}
        className={`lang-toggle__btn${current === 'es' ? ' lang-toggle__btn--active' : ''}`}
        aria-pressed={current === 'es'}
      >
        ES
      </button>
    </div>
  );
}
