import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicRoomDTO, PublicRoomsResponse } from '@impostor/shared';
import { usePublicRoomsStore } from '../stores/publicRoomsStore';

/* ------------------------------------------------------------------ */
/*  Polling cadence                                                     */
/* ------------------------------------------------------------------ */

/** How often the hook refetches the public-rooms list while mounted. */
const POLL_INTERVAL_MS = 5_000;

/** Minimum gap between consecutive manual refreshes (debounce). */
const MANUAL_REFRESH_DEBOUNCE_MS = 1_500;

/* ------------------------------------------------------------------ */
/*  Filter shape                                                        */
/* ------------------------------------------------------------------ */

export type PublicRoomLangFilter = 'all' | 'en' | 'es' | 'pt' | 'fr' | 'it' | 'de';

export interface PublicRoomFilters {
  /** Locale code to filter by, or 'all' for no language filter. */
  lang: PublicRoomLangFilter;
  /** When true, only show rooms with free slots (playerCount < maxPlayers). */
  hasSpace: boolean;
}

const DEFAULT_FILTERS: PublicRoomFilters = {
  lang: 'all',
  hasSpace: false,
};

/* ------------------------------------------------------------------ */
/*  Hook return shape                                                   */
/* ------------------------------------------------------------------ */

export interface UsePublicRoomsResult {
  /** Rooms after applying the current client-side filters. */
  rooms: PublicRoomDTO[];
  /** True when the server reported more rooms than the response cap. */
  hasMore: boolean;
  /** Total rooms matching the current server-side query (pre-client-filter). */
  totalCount: number;
  /** True while a fetch is in flight (or the first fetch hasn't landed). */
  loading: boolean;
  /** Last fetch error message, or null. */
  error: string | null;
  /** Unix ms timestamp of the last successful fetch. */
  lastFetchAt: number;
  /** Manually trigger an immediate fetch (debounced). */
  refresh: () => void;
  /** Current filter values. */
  filters: PublicRoomFilters;
  /** Update one or more filter fields. */
  setFilters: (next: Partial<PublicRoomFilters>) => void;
}

/* ------------------------------------------------------------------ */
/*  Hook implementation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Polls `GET /api/rooms?visibility=public` every 5s and exposes a
 * filterable view of the result.
 *
 * Lifecycle:
 *   - Mount → fires an immediate fetch
 *   - Every 5s → automatic fetch
 *   - `refresh()` → manual fetch, debounced (no spam-clicks)
 *   - Unmount → polling stops, in-flight request is ignored
 *
 * Filters (`lang`, `hasSpace`) are applied client-side per the spec;
 * the server's filter query params are intentionally NOT used so the
 * full result stays in the store and any future consumer (badges,
 * counts) sees the same source of truth.
 */
export function usePublicRooms(): UsePublicRoomsResult {
  const setRooms = usePublicRoomsStore((s) => s.setRooms);
  const setLoading = usePublicRoomsStore((s) => s.setLoading);
  const setError = usePublicRoomsStore((s) => s.setError);

  const rawRooms = usePublicRoomsStore((s) => s.rooms);
  const loading = usePublicRoomsStore((s) => s.loading);
  const error = usePublicRoomsStore((s) => s.error);
  const lastFetchAt = usePublicRoomsStore((s) => s.lastFetchAt);
  const serverHasMore = usePublicRoomsStore((s) => s.hasMore);
  const serverTotalCount = usePublicRoomsStore((s) => s.totalCount);

  const [filters, setFiltersState] = useState<PublicRoomFilters>(DEFAULT_FILTERS);

  /** Tracks the most-recently-issued fetch so a late response from
   *  a stale call (after unmount or after a faster follow-up) is
   *  discarded. */
  const fetchSeqRef = useRef(0);
  const lastManualRefreshRef = useRef<number>(0);

  const fetchOnce = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const res = await fetch('/api/rooms?visibility=public', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as PublicRoomsResponse;
      // Drop the response if the user navigated away or a newer fetch
      // has already started (prevents race overwriting newer data).
      if (seq !== fetchSeqRef.current) return;
      setRooms({
        rooms: data.rooms,
        hasMore: data.hasMore,
        totalCount: data.totalCount,
      });
      setError(null);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [setRooms, setLoading, setError]);

  /* ---------------------------------------------------------------- */
  /*  5s polling                                                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    // Immediate first fetch when the tab opens.
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      // Bump the seq so any in-flight fetch is ignored on unmount.
      fetchSeqRef.current++;
    };
  }, [fetchOnce]);

  /* ---------------------------------------------------------------- */
  /*  Manual refresh (debounced)                                       */
  /* ---------------------------------------------------------------- */
  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastManualRefreshRef.current < MANUAL_REFRESH_DEBOUNCE_MS) {
      return;
    }
    lastManualRefreshRef.current = now;
    void fetchOnce();
  }, [fetchOnce]);

  const setFilters = useCallback((next: Partial<PublicRoomFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Client-side filtering                                             */
  /* ---------------------------------------------------------------- */
  const filteredRooms = useMemo(() => {
    return rawRooms.filter((room) => {
      if (filters.lang !== 'all' && room.hostLocale !== filters.lang) {
        return false;
      }
      if (filters.hasSpace && room.playerCount >= room.maxPlayers) {
        return false;
      }
      return true;
    });
  }, [rawRooms, filters.lang, filters.hasSpace]);

  return {
    rooms: filteredRooms,
    hasMore: serverHasMore,
    totalCount: serverTotalCount,
    loading,
    error,
    lastFetchAt,
    refresh,
    filters,
    setFilters,
  };
}
