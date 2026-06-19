import { randomInt } from 'node:crypto';
import type { Player, Room, RoomSettings } from '@impostor/shared';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  DEFAULT_TIMER,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_VOTING_TIMER,
  DEFAULT_VISIBILITY,
  DEFAULT_HOST_LOCALE,
  ALLOWED_LOCALES,
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

/**
 * Validate and sanitize a partial settings object (used by both
 * createRoom and the in-lobby UPDATE_SETTINGS path so neither transport
 * can bypass the same rules).
 *
 * - `visibility` defaults to 'private' if not provided; anything outside
 *   {'public','private'} throws.
 * - `hostLocale` defaults to 'en' if not provided; anything outside the
 *   6-code ALLOWED_LOCALES list throws.
 * - `maxPlayers` is clamped to the allowed range.
 * - `discussionTime` is normalized through clampTimer.
 */
export function sanitizeRoomSettings(settings?: Partial<RoomSettings>): RoomSettings {
  if (settings?.visibility !== undefined &&
      settings.visibility !== 'public' &&
      settings.visibility !== 'private') {
    throw new Error('Invalid visibility: must be "public" or "private"');
  }
  if (settings?.hostLocale !== undefined &&
      !ALLOWED_LOCALES.includes(settings.hostLocale as typeof ALLOWED_LOCALES[number])) {
    throw new Error(`Invalid hostLocale: must be one of ${ALLOWED_LOCALES.join(', ')}`);
  }

  const sanitized: RoomSettings = {
    maxPlayers: settings?.maxPlayers ?? DEFAULT_MAX_PLAYERS,
    impostorCount: settings?.impostorCount ?? 1,
    discussionTime: settings?.discussionTime ?? DEFAULT_TIMER,
    category: settings?.category ?? null,
    votingTimer: settings?.votingTimer ?? DEFAULT_VOTING_TIMER,
    hardcore: settings?.hardcore ?? false,
    visibility: settings?.visibility ?? DEFAULT_VISIBILITY,
    hostLocale: settings?.hostLocale ?? DEFAULT_HOST_LOCALE,
  };

  sanitized.maxPlayers = Math.max(
    MIN_PLAYERS,
    Math.min(MAX_PLAYERS, sanitized.maxPlayers),
  );
  if (sanitized.discussionTime) {
    sanitized.discussionTime = clampTimer(sanitized.discussionTime);
  }

  return sanitized;
}

export class RoomManager {
  /**
   * Optional callback fired when a room is truly destroyed (host
   * disconnect cascade or last player leaves). Receives the room code.
   * Used by GameEngine to clear its per-room impostor history to
   * prevent a memory leak and avoid stale exclusion data if the same
   * code is somehow reissued (random 5-char codes make this rare).
   */
  public onRoomDestroyed: ((code: string) => void) | null = null;

  constructor(private store: RoomStore) {}

  /* ------------------------------------------------------------------ */
  /*  Create                                                             */
  /* ------------------------------------------------------------------ */

  createRoom(code: string, username: string, settings?: Partial<RoomSettings>): JoinResult {
    const fullSettings = sanitizeRoomSettings(settings);
    const room = this.store.createRoom(code, fullSettings);

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
      this.onRoomDestroyed?.(code);
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
    this.onRoomDestroyed?.(code);
  }

  /**
   * Pick `count` impostors from `activePlayers`, avoiding players who were
   * impostor in either of the last 2 rounds. Each inner array in
   * `recentRounds` is the full set of impostor IDs from one round (most
   * recent last). This guarantees no player is picked as impostor in 2 of
   * the last 3 rounds — except in the FIFO fallback edge case below.
   *
   * FIFO fallback: if excluding the last 2 rounds leaves too few
   * candidates to pick `count` impostors, drop the OLDEST round from the
   * exclusion (so a player from that round becomes eligible again).
   * Last resort: if still no candidates, fall back to all active players.
   */
  selectImpostors(
    activePlayers: Player[],
    count: number,
    recentRounds: string[][] = [],
  ): Set<string> {
    if (count > activePlayers.length) {
      throw new Error('Not enough players to select impostors');
    }
    // Build the exclusion set as the union of impostor IDs from the
    // last 2 ROUNDS (not the last 2 entries of a flat list — that would
    // miss impostors when a round has more than one impostor).
    const excludeSet = new Set<string>();
    const lastTwoRounds = recentRounds.slice(-2);
    for (const round of lastTwoRounds) {
      for (const id of round) {
        excludeSet.add(id);
      }
    }

    let candidates = activePlayers.filter((p) => !excludeSet.has(p.id));
    // FIFO: if too few candidates, drop the entire oldest round.
    if (candidates.length < count && recentRounds.length > 0) {
      const oldestRound = recentRounds[0];
      const oldestSet = new Set(oldestRound);
      candidates = activePlayers.filter((p) => !oldestSet.has(p.id));
    }
    // Last resort: all active players.
    if (candidates.length < count) {
      candidates = activePlayers;
    }
    // Fisher-Yates shuffle for uniform distribution. Uses randomInt
    // (CSPRNG) so a malicious observer cannot predict the next
    // impostor selection from prior round outcomes.
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
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
