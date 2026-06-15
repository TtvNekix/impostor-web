import type { Player, Room, RoomSettings } from '@impostor/shared';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  DEFAULT_TIMER,
  DEFAULT_MAX_PLAYERS,
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

    if (room.players.size >= room.settings.maxPlayers) {
      throw new Error('Room is full');
    }

    if (room.players.has(username)) {
      throw new Error('Username already taken');
    }

    if (room.gameState && room.gameState.phase !== 'LOBBY' && room.gameState.phase !== 'GAME_OVER') {
      throw new Error('Game already in progress');
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
