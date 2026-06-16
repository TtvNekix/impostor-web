import type { GameState } from './game';

export type PlayerStatus = 'ACTIVE' | 'SPECTATOR' | 'DISCONNECTED';

export interface Player {
  id: string;
  username: string;
  status: PlayerStatus;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomSettings {
  maxPlayers: number;
  impostorCount: number;
  discussionTime: number;
  /** Selected category name (kebab-case identifier). null/undefined = random. */
  category: string | null;
  votingTimer: 15 | 30 | 45 | 60;
  hardcore: boolean;
  /** Whether the room is discoverable via the public rooms list. Defaults to 'private'. */
  visibility: 'public' | 'private';
  /** Host's preferred locale code (one of the 6 supported: en, es, pt, fr, it, de). */
  hostLocale: string;
}

export interface Room {
  code: string;
  players: Map<string, Player>;
  settings: RoomSettings;
  gameState: GameState | null;
  createdAt: number;
}

/** Serializable DTO for broadcasting room data via Socket.IO */
export interface RoomDTO {
  code: string;
  players: Player[];
  settings: RoomSettings;
  gameState: GameState | null;
  createdAt: number;
}

export function roomToDTO(room: Room): RoomDTO {
  return {
    code: room.code,
    players: Array.from(room.players.values()),
    settings: room.settings,
    gameState: room.gameState,
    createdAt: room.createdAt,
  };
}
