import { create } from 'zustand';
import type { Player, RoomSettings } from '@impostor/shared';

interface RoomState {
  roomCode: string | null;
  players: Player[];
  isHost: boolean;
  settings: RoomSettings | null;
  setRoom: (code: string, players: Player[], isHost: boolean, settings: RoomSettings) => void;
  addPlayer: (player: Player) => void;
  /**
   * Remove a player from the room and, if the server has reassigned
   * host to someone new, update my own `isHost` accordingly.
   *
   * @param playerId         Socket id of the player who left.
   * @param newHostUsername  Username of the new host as reported by
   *                         the server. Resolved against the players
   *                         array to figure out whether *I* am the
   *                         new host.
   * @param mySocketId       My own socket id, used to compare against
   *                         the new host's socket id.
   */
  removePlayer: (playerId: string, newHostUsername?: string, mySocketId?: string) => void;
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

  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players.filter((p) => p.id !== player.id), player],
    })),

  removePlayer: (playerId, newHostUsername, mySocketId) => {
    // The server sends `newHost` as the **username** of the new host
    // (see RoomManager.leaveRoom: longestPlayer.username). We need to
    // resolve that to a socket id to decide whether *I* am the new
    // host. The old version incorrectly checked whether the *leaving*
    // player was a host, which is the wrong question — the leaving
    // player is already gone from the array, and whether they were
    // host is irrelevant to my own host status.
    return set((state) => {
      const newHostSocketId = newHostUsername
        ? state.players.find((p) => p.username === newHostUsername)?.id
        : undefined;
      return {
        players: state.players.filter((p) => p.id !== playerId),
        // Promote me to host if and only if my socket id matches the
        // server-declared new host. Otherwise keep my current isHost.
        // (If the kicked player was me, the KICKED event clears the
        // room entirely and this branch is never hit.)
        isHost:
          newHostSocketId && mySocketId
            ? newHostSocketId === mySocketId
            : state.isHost,
      };
    });
  },

  setHost: (isHost) => set({ isHost }),

  updateSettings: (settings) => set({ settings }),

  clearRoom: () =>
    set({ roomCode: null, players: [], isHost: false, settings: null }),
}));
