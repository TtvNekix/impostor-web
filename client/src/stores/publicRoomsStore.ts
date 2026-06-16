import { create } from 'zustand';
import type { PublicRoomDTO } from '@impostor/shared';

/**
 * Global cache for the public-rooms list.
 *
 * The polling hook (`usePublicRooms`) writes here so any consumer
 * (the list, the filters, future badges/counters) can subscribe
 * without each opening its own fetch loop. Filter state lives in
 * the hook, not here — the store only knows about raw server data.
 *
 * `hasMore` and `totalCount` are the server's values from the most
 * recent successful response, before client-side filtering. The list
 * uses them to show the "X of Y" indicator.
 */
interface PublicRoomsState {
  rooms: PublicRoomDTO[];
  loading: boolean;
  error: string | null;
  lastFetchAt: number;
  hasMore: boolean;
  totalCount: number;

  setRooms: (data: { rooms: PublicRoomDTO[]; hasMore: boolean; totalCount: number }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const usePublicRoomsStore = create<PublicRoomsState>((set) => ({
  rooms: [],
  loading: false,
  error: null,
  lastFetchAt: 0,
  hasMore: false,
  totalCount: 0,

  setRooms: ({ rooms, hasMore, totalCount }) =>
    set({ rooms, hasMore, totalCount, lastFetchAt: Date.now() }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      rooms: [],
      loading: false,
      error: null,
      lastFetchAt: 0,
      hasMore: false,
      totalCount: 0,
    }),
}));
