import { useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useT, useLocale, useSetLocale } from '../i18n/I18nContext';
import { CustomSelect, type CustomSelectOption } from '../components/CustomSelect';
import { VersionBadge } from '../components/VersionBadge';
import { ContributeModal } from '../components/ContributeModal';
import { LanguageSelector } from '../components/LanguageSelector';
import { navigate } from '../lib/router';
import { generateRoomCode, ALLOWED_MAX_PLAYERS, DEFAULT_MAX_PLAYERS } from '@impostor/shared';

interface EntryPageProps {
  createRoom: (payload: {
    code: string;
    username: string;
    settings?: {
      maxPlayers: number;
      visibility?: 'public' | 'private';
      hostLocale?: string;
    };
  }) => void;
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
 * The public-rooms browser lives at `/salas` now — see `LobbiesPage`.
 * This page just exposes a link to it.
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
  const [makePublic, setMakePublic] = useState<boolean>(false);
  const [contributeOpen, setContributeOpen] = useState(false);
  const error = useConnectionStore((s) => s.error);
  const clearError = useConnectionStore((s) => s.clearError);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (mode === 'create') {
      const roomCode = code.trim().toUpperCase() || generateRoomCode();
      createRoom({
        code: roomCode,
        username: username.trim(),
        settings: {
          maxPlayers,
          visibility: makePublic ? 'public' : 'private',
          hostLocale: locale,
        },
      });
    } else {
      joinRoom({ code: code.trim().toUpperCase(), username: username.trim() });
    }
  };

  return (
    <div className="entry-page">
      {/* Top bar: nav link (left) + language selector (right) */}
      <div className="entry-page__lang">
        <button
          type="button"
          className="entry-page__lobbies-link"
          onClick={() => navigate('/salas')}
        >
          {t.entry.lobbiesLink}
        </button>
        <LanguageSelector current={locale} onChange={setLocale} />
      </div>

      {/* Title block: logo on the left, title + subtitle stacked on the right */}
      <div className="entry-page__hero">
        <VersionBadge />
        <div className="entry-page__hero-row">
          <img
            src="/logo-256x256.png"
            alt=""
            aria-hidden="true"
            className="entry-page__logo"
          />
          <div className="entry-page__hero-text">
            <h1 className="entry-page__title">{t.entry.title}</h1>
            <p className="entry-page__subtitle">{t.entry.subtitle}</p>
          </div>
        </div>
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
                <>
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
                  <label className="mode-card__checkbox">
                    <input
                      type="checkbox"
                      checked={makePublic}
                      onChange={(e) => setMakePublic(e.target.checked)}
                    />
                    <span>{t.lobby.public}</span>
                  </label>
                </>
              ) : (
                <input
                  type="text"
                  placeholder={t.lobby.enterRoomCode}
                  value={code}
                  onChange={(e) => { setCode(e.target.value); if (error) clearError(); }}
                  maxLength={6}
                  className="input text-uppercase"
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

      {/* "Help improve" button — opens the contribution modal. */}
      <div className="help-improve">
        <button
          type="button"
          className="help-improve__btn"
          onClick={() => setContributeOpen(true)}
        >
          <span aria-hidden="true">💡</span> {t.contribute.button}
        </button>
      </div>

      {/* Contribute modal */}
      <ContributeModal
        open={contributeOpen}
        onClose={() => setContributeOpen(false)}
      />
    </div>
  );
}
