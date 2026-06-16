import { useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useT, useLocale, useSetLocale } from '../i18n/I18nContext';
import { LanguageSelector } from '../components/LanguageSelector';
import { PublicRoomList } from '../components/PublicRoomList';
import { PublicRoomFiltersComponent } from '../components/PublicRoomFilters';
import { usePublicRooms } from '../hooks/usePublicRooms';
import { navigate } from '../lib/router';

interface LobbiesPageProps {
  joinRoom: (payload: { code: string; username: string }) => void;
}

/**
 * Dedicated page for browsing public rooms. Reached at `/salas` (canonical)
 * or `/lobbies` (alias).
 *
 * Layout:
 *   1. Top bar — back button + language selector
 *   2. Head — title + subtitle
 *   3. Username input (required to join)
 *   4. Filters (language + "with space only" + manual refresh)
 *   5. Public room list (reused from EntryPage)
 *
 * The local `username` state means the field does NOT carry over from
 * `/` — the spec accepts this as a known tradeoff (see design.md risk #2).
 * The join-time error (e.g. empty username) is kept in local state so it
 * doesn't clobber the global `connectionStore.error` channel that the
 * post-join flow uses for `room_not_found` / `room_full` feedback.
 */
export function LobbiesPage({ joinRoom }: LobbiesPageProps) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();

  const [username, setUsername] = useState('');
  const [localJoinError, setLocalJoinError] = useState<string | null>(null);

  const globalError = useConnectionStore((s) => s.error);
  const clearError = useConnectionStore((s) => s.clearError);

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
      setLocalJoinError(t.lobbies.joinError);
      return;
    }
    setLocalJoinError(null);
    clearError(); // server-side room_not_found will overwrite this next
    joinRoom({ code, username: name });
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="lobbies-page">
      {/* Top bar: back button (left) + language selector (right) */}
      <div className="lobbies-page__topbar">
        <button
          type="button"
          className="lobbies-page__back"
          onClick={handleBack}
          aria-label={t.lobbies.back}
        >
          ← {t.lobbies.back}
        </button>
        <LanguageSelector current={locale} onChange={setLocale} />
      </div>

      {/* Head: title + subtitle */}
      <header className="lobbies-page__head">
        <h1 className="lobbies-page__title">{t.lobbies.title}</h1>
        <p className="lobbies-page__subtitle">{t.lobbies.subtitle}</p>
      </header>

      {/* Username input — required to join a room */}
      <div className="lobbies-page__username">
        <label htmlFor="lobbies-username">{t.lobbies.usernameLabel}</label>
        <input
          id="lobbies-username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (localJoinError) setLocalJoinError(null);
            if (globalError) clearError();
          }}
          maxLength={20}
          autoComplete="off"
          className="input"
        />
      </div>

      {/* Filters */}
      <PublicRoomFiltersComponent
        filters={filters}
        onChange={setFilters}
        onRefresh={refresh}
        loading={loading}
      />

      {/* Rooms list — the fetch error already surfaces inside the list's empty-state */}
      <PublicRoomList
        rooms={rooms}
        loading={loading}
        totalCount={totalCount}
        hasMore={hasMore}
        error={fetchError}
        onJoin={handleJoin}
      />

      {/* Local join-time error — clears when the user types */}
      {localJoinError && (
        <p className="public-rooms-section__join-error" role="alert">
          {localJoinError}
        </p>
      )}

      {/* Echo of the global connection error so the user sees feedback
          when their Join click was rejected (room not found, room full,
          etc.). */}
      {globalError && !localJoinError && (
        <p className="public-rooms-section__join-error" role="alert">
          {globalError}
        </p>
      )}
    </div>
  );
}
