import type { PublicRoomDTO } from '@impostor/shared';
import { useT, LOCALE_LABELS } from '../i18n/I18nContext';
import { useCategoryStore } from '../stores/categoryStore';

interface PublicRoomListProps {
  /** Rooms to render (already filtered client-side). */
  rooms: PublicRoomDTO[];
  /** True on the first fetch (or while the tab is opening). */
  loading: boolean;
  /** Total server-reported count (pre-client-filter); used for X-of-Y. */
  totalCount: number;
  /** True when the server reported more rooms than the response cap. */
  hasMore: boolean;
  /** Last fetch error, or null. */
  error: string | null;
  /** Handler the card's Join button calls with the room code. */
  onJoin: (code: string) => void;
}

/**
 * Renders the public-rooms list as a vertical stack of cards plus the
 * "no rooms" / "X of Y" / error states.
 *
 * Each card exposes: room code, host first name, category, host locale,
 * player count / max, and age. The "Join" button hands the room code
 * back to the parent which routes it through the existing JOIN_ROOM flow.
 */
export function PublicRoomList({
  rooms,
  loading,
  totalCount,
  hasMore,
  error,
  onJoin,
}: PublicRoomListProps) {
  const t = useT();
  const getDisplayName = useCategoryStore((s) => s.getDisplayName);

  return (
    <div className="public-rooms-list">
      {/* Error banner — show only when the list is empty (otherwise the
          stale list is still useful). */}
      {error && rooms.length === 0 && (
        <p className="public-rooms-list__error" role="alert">
          {t.errors.generic}
        </p>
      )}

      {/* Empty state — no rooms returned AND no error. */}
      {!loading && !error && rooms.length === 0 && (
        <p className="public-rooms-list__empty">{t.entry.publicRooms.empty}</p>
      )}

      {/* The list itself */}
      {rooms.length > 0 && (
        <ul className="public-rooms-list__items" aria-label={t.entry.publicRooms.title}>
          {rooms.map((room) => (
            <PublicRoomCard
              key={room.roomCode}
              room={room}
              onJoin={onJoin}
              getCategoryLabel={getDisplayName}
            />
          ))}
        </ul>
      )}

      {/* "Showing X of Y" indicator — show when we have results and
          either the server's totalCount disagrees with our filtered
          count (a filter narrowed the list) or the server flagged
          hasMore (50-room cap was hit). */}
      {rooms.length > 0 && (rooms.length !== totalCount || hasMore) && (
        <p className="public-rooms-list__cap">
          {t.entry.publicRooms.capReached
            .replace('{shown}', String(rooms.length))
            .replace('{total}', String(totalCount || rooms.length))}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card                                                                */
/* ------------------------------------------------------------------ */

interface PublicRoomCardProps {
  room: PublicRoomDTO;
  onJoin: (code: string) => void;
  getCategoryLabel: (name: string | null | undefined) => string;
}

function PublicRoomCard({ room, onJoin, getCategoryLabel }: PublicRoomCardProps) {
  const t = useT();
  const hostLocale = LOCALE_LABELS[room.hostLocale as keyof typeof LOCALE_LABELS];
  const localeShort = hostLocale?.short ?? room.hostLocale.toUpperCase();
  const categoryLabel = room.category ? getCategoryLabel(room.category) : t.lobby.randomCategory;

  return (
    <li className="public-room-card">
      <div className="public-room-card__head">
        <span className="public-room-card__code" aria-label={t.lobby.roomCode}>
          {room.roomCode}
        </span>
        <button
          type="button"
          onClick={() => onJoin(room.roomCode)}
          className="btn btn--primary btn--sm public-room-card__join"
          aria-label={`${t.entry.publicRooms.joinButton} ${room.roomCode}`}
        >
          {t.entry.publicRooms.joinButton}
        </button>
      </div>

      <div className="public-room-card__meta">
        <span className="public-room-card__host">
          {/* Anonymized host identifier. We expose a deterministic
              "Host-XXXX" tag instead of the host's real username so
              that someone who joined with their full name isn't
              leaked to every public-room-list visitor. The tag is
              derived from the room code, so two rooms in the list
              are still distinguishable at a glance. */}
          {room.hostTag}
        </span>
        <span className="public-room-card__dot" aria-hidden="true">·</span>
        <span className="public-room-card__locale" aria-label={room.hostLocale}>
          {localeShort}
        </span>
        <span className="public-room-card__dot" aria-hidden="true">·</span>
        <span className="public-room-card__category">{categoryLabel}</span>
      </div>

      <div className="public-room-card__foot">
        <span className="public-room-card__count">
          {t.lobby.playerCount
            .replace('{count}', String(room.playerCount))
            .replace('{max}', String(room.maxPlayers))}
        </span>
        <span className="public-room-card__dot" aria-hidden="true">·</span>
        <span className="public-room-card__age">{formatAge(room.ageSeconds)}</span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Human-friendly age: "12s", "1m 5s", "2h 10m". */
function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
