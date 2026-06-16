import { useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useT, useLocale, useSetLocale, LOCALE_LABELS, type Locale } from '../i18n/I18nContext';
import { CustomSelect, type CustomSelectOption } from '../components/CustomSelect';
import { VersionBadge } from '../components/VersionBadge';
import { ContributeModal } from '../components/ContributeModal';
import { PublicRoomList } from '../components/PublicRoomList';
import { PublicRoomFiltersComponent } from '../components/PublicRoomFilters';
import { usePublicRooms } from '../hooks/usePublicRooms';
import { generateRoomCode, ALLOWED_MAX_PLAYERS, DEFAULT_MAX_PLAYERS } from '@impostor/shared';

interface EntryPageProps {
  createRoom: (payload: {
    code: string;
    username: string;
    settings?: { maxPlayers: number };
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
  const [contributeOpen, setContributeOpen] = useState(false);
  const error = useConnectionStore((s) => s.error);
  const clearError = useConnectionStore((s) => s.clearError);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (mode === 'create') {
      const roomCode = code.trim().toUpperCase() || generateRoomCode();
      createRoom({ code: roomCode, username: username.trim(), settings: { maxPlayers } });
    } else {
      joinRoom({ code: code.trim().toUpperCase(), username: username.trim() });
    }
  };

  return (
    <div className="entry-page">
      {/* Language selector — top right */}
      <div className="entry-page__lang">
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

      {/* Public rooms section — secondary discovery surface. Mounts the
          list + filters; the hook inside kicks off the 5s polling. */}
      <PublicRoomsSection
        username={username}
        onJoin={joinRoom}
        error={error}
        clearError={clearError}
      />

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

/* ------------------------------------------------------------------ */
/*  Public rooms section                                                */
/* ------------------------------------------------------------------ */

interface PublicRoomsSectionProps {
  username: string;
  onJoin: (payload: { code: string; username: string }) => void;
  error: string | null;
  clearError: () => void;
}

/**
 * Wraps the public-rooms list and filters. Owns the polling hook so
 * the 5s interval lifecycle is tied to the section's mount, and
 * threads the username (taken from the entry form) into the Join handler.
 */
function PublicRoomsSection({ username, onJoin, error, clearError }: PublicRoomsSectionProps) {
  const t = useT();
  const {
    rooms,
    loading,
    error: fetchError,
    hasMore,
    totalCount,
    refresh,
    filters,
    setFilters,
  } = usePublicRooms();

  const handleJoin = (code: string) => {
    const name = username.trim();
    if (!name) {
      // Without a username we can't join — keep the user on the entry page
      // and surface the standard error string.
      clearError();
      // Re-use the connection error channel for the inline error below
      // the create/join form by setting the error directly.
      useConnectionStore.setState({ error: t.lobby.enterUsername });
      return;
    }
    clearError();
    onJoin({ code, username: name });
  };

  return (
    <section className="public-rooms-section" aria-labelledby="public-rooms-title">
      <header className="public-rooms-section__head">
        <h2 id="public-rooms-title" className="public-rooms-section__title">
          {t.entry.publicRooms.title}
        </h2>
        <p className="public-rooms-section__subtitle">
          {t.entry.publicRooms.subtitle}
        </p>
      </header>

      <PublicRoomFiltersComponent
        filters={filters}
        onChange={setFilters}
        onRefresh={refresh}
        loading={loading}
      />

      {/*
        `error` is the join-time error (room_not_found, room_full, etc.).
        `fetchError` is the HTTP-level failure from the polling. We pass
        the join error down so the list can show it; the fetch error
        already gets surfaced via the list's empty-state branch.
      */}
      <PublicRoomList
        rooms={rooms}
        loading={loading}
        totalCount={totalCount}
        hasMore={hasMore}
        error={fetchError}
        onJoin={handleJoin}
      />

      {/* Echo of the global connection error so the user sees feedback
          when their Join click was rejected (room not found, room full,
          etc.). */}
      {error && (
        <p className="public-rooms-section__join-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Language selector (dropdown with 6 locales)                       */
/* ------------------------------------------------------------------ */

interface LanguageSelectorProps {
  current: Locale;
  onChange: (l: Locale) => void;
}

function LanguageSelector({ current, onChange }: LanguageSelectorProps) {
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
