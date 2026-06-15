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
