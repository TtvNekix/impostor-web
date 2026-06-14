import { create } from 'zustand';
import type { Player, RoomSettings } from '@impostor/shared';

interface RoomState {
  roomCode: string | null;
  players: Player[];
  isHost: boolean;
  settings: RoomSettings | null;
  setRoom: (code: string, players: Player[], isHost: boolean, settings: RoomSettings) => void;
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string, newHostId?: string) => void;
  setHost: (isHost: boolean) => void;
  updateSettings: (settings: RoomSettings) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomCode: null,
  players: [],
  isHost: false,
  settings: null,

  setRoom: (code, players, isHost, settings) =>
    set({ roomCode: code, players, isHost, settings }),

  setPlayers: (players) => set({ players }),

  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players.filter((p) => p.id !== player.id), player],
    })),

  removePlayer: (playerId, newHostId) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
      isHost: newHostId
        ? state.players.find((p) => p.id === playerId)?.isHost ?? state.isHost
        : state.isHost,
    })),

  setHost: (isHost) => set({ isHost }),

  updateSettings: (settings) => set({ settings }),

  clearRoom: () =>
    set({ roomCode: null, players: [], isHost: false, settings: null }),
}));
