import type { Player, Room, RoomSettings } from '@impostor/shared';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  DEFAULT_TIMER,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_VOTING_TIMER,
  clampMaxPlayers,
  clampTimer,
} from '@impostor/shared';
import { RoomStore } from './RoomStore';

export interface JoinResult {
  room: Room;
  player: Player;
}

export interface LeaveResult {
  room: Room;
  newHost?: string;
  wasLastPlayer: boolean;
}

export class RoomManager {
  constructor(private store: RoomStore) {}

  /* ------------------------------------------------------------------ */
  /*  Create                                                             */
  /* ------------------------------------------------------------------ */

  createRoom(code: string, username: string, settings?: Partial<RoomSettings>): JoinResult {
    const defaultSettings: RoomSettings = {
      maxPlayers: DEFAULT_MAX_PLAYERS,
      impostorCount: 1,
      discussionTime: DEFAULT_TIMER,
      category: null,
      votingTimer: DEFAULT_VOTING_TIMER,
      hardcore: false,
      ...settings,
    };
    // Sanitize maxPlayers before persisting
    if (defaultSettings.maxPlayers) {
      defaultSettings.maxPlayers = Math.max(
        MIN_PLAYERS,
        Math.min(MAX_PLAYERS, defaultSettings.maxPlayers),
      );
    }
    if (defaultSettings.discussionTime) {
      defaultSettings.discussionTime = clampTimer(defaultSettings.discussionTime);
    }

    const room = this.store.createRoom(code, defaultSettings);

    const player: Player = {
      id: '', // assigned after socket connects
      username,
      status: 'ACTIVE',
      isHost: true,
      joinedAt: Date.now(),
    };

    room.players.set(username, player);
    return { room, player };
  }

  /* ------------------------------------------------------------------ */
  /*  Join                                                               */
  /* ------------------------------------------------------------------ */

  joinRoom(code: string, username: string, socketId: string): JoinResult {
    const room = this.store.getRoom(code);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.players.has(username)) {
      throw new Error('Username already taken');
    }

    const isMidGame =
      room.gameState !== null &&
      room.gameState.phase !== 'LOBBY' &&
      room.gameState.phase !== 'GAME_OVER';

    // When a game is in progress, newcomers can still join as spectators.
    // Spectators don't count toward the max-player ceiling and they don't
    // receive a role or word. They watch until the host starts a new match,
    // at which point the engine flips all current players (including
    // latecomers) back to ACTIVE.
    if (isMidGame) {
      const player: Player = {
        id: socketId,
        username,
        status: 'SPECTATOR',
        isHost: false,
        joinedAt: Date.now(),
      };
      room.players.set(username, player);
      return { room, player };
    }

    // LOBBY / GAME_OVER: normal join — counts toward maxPlayers.
    const activeCount = Array.from(room.players.values()).filter(
      (p) => p.status === 'ACTIVE',
    ).length;
    if (activeCount >= room.settings.maxPlayers) {
      throw new Error('Room is full');
    }

    const player: Player = {
      id: socketId,
      username,
      status: 'ACTIVE',
      isHost: false,
      joinedAt: Date.now(),
    };

    room.players.set(username, player);
    return { room, player };
  }

  /* ------------------------------------------------------------------ */
  /*  Leave                                                              */
  /* ------------------------------------------------------------------ */

  leaveRoom(code: string, username: string): LeaveResult {
    const room = this.store.getRoom(code);
    if (!room) {
      throw new Error('Room not found');
    }

    const player = room.players.get(username);
    if (!player) {
      throw new Error('Player not found in room');
    }

    room.players.delete(username);

    // If last player, destroy room
    if (room.players.size === 0) {
      this.store.deleteRoom(code);
      return { room, wasLastPlayer: true };
    }

    // Reassign host if needed
    let newHost: string | undefined;
    if (player.isHost) {
      const longestPlayer = Array.from(room.players.values())
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];
      longestPlayer.isHost = true;
      newHost = longestPlayer.username;
    }

    return { room, newHost, wasLastPlayer: false };
  }

  /* ------------------------------------------------------------------ */
  /*  Lookup                                                             */
  /* ------------------------------------------------------------------ */

  getRoom(code: string): Room {
    const room = this.store.getRoom(code);
    if (!room) {
      throw new Error('Room not found');
    }
    return room;
  }

  destroyRoom(code: string): void {
    this.store.deleteRoom(code);
  }

  /**
   * Select impostor IDs from active players with optional exclusion.
   * The exclusion list is a rolling history of impostor player IDs
   * (most recent last). A player whose ID appears in either of the
   * last 2 history slots is excluded from the candidate pool (re-rol
   * rule — same person can't be impostor 3 times in a row by avoiding
   * consecutive selections). If the resulting candidate set is too
   * small, falls back to excluding only the player from the OLDEST
   * history entry (FIFO expiry).
   */
  selectImpostors(
    activePlayers: Player[],
    count: number,
    excludeIds: string[] = [],
  ): Set<string> {
    if (count > activePlayers.length) {
      throw new Error('Not enough players to select impostors');
    }
    // Build the exclusion set from the last 2 history entries
    const excludeSet = new Set<string>();
    const lastIdx = excludeIds.length - 1;
    if (lastIdx >= 0) excludeSet.add(excludeIds[lastIdx]);
    if (lastIdx >= 1) excludeSet.add(excludeIds[lastIdx - 1]);

    let candidates = activePlayers.filter((p) => !excludeSet.has(p.id));
    // If too few candidates remain, drop only the oldest block (FIFO)
    if (candidates.length < count && excludeIds.length > 0) {
      const oldest = excludeIds[0];
      candidates = activePlayers.filter((p) => p.id !== oldest);
    }
    // Last resort: all active players
    if (candidates.length < count) {
      candidates = activePlayers;
    }
    // Fisher-Yates shuffle for uniform distribution
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const ids = new Set<string>();
    for (let i = 0; i < count && i < shuffled.length; i++) {
      ids.add(shuffled[i].id);
    }
    return ids;
  }

  /** Find which room a player (by socket ID) is in. */
  findRoomBySocketId(socketId: string): { room: Room; player: Player } | null {
    for (const code of this.store.getAllRoomCodes()) {
      const room = this.store.getRoom(code)!;
      for (const [, player] of room.players) {
        if (player.id === socketId) {
          return { room, player };
        }
      }
    }
    return null;
  }

  /** Update a player's socket ID (used on reconnect). */
  updateSocketId(code: string, username: string, newSocketId: string): void {
    const room = this.store.getRoom(code);
    if (!room) return;
    const player = room.players.get(username);
    if (player) {
      player.id = newSocketId;
    }
  }
}
