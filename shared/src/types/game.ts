import type { PlayerStatus } from './room';

export type GamePhase = 'LOBBY' | 'WORD_REVEAL' | 'DISCUSSION' | 'VOTING' | 'EVALUATION' | 'GAME_OVER';

export type Winner = 'NON_IMPOSTORS' | 'IMPOSTORS';

export interface GameState {
  phase: GamePhase;
  word: string;
  category: string;
  players: GamePlayer[];
  votes: Vote[];
  roundNumber: number;
  phaseEndsAt: number;
  result: RoundResult | null;
  impostorIds: string[];
}

export interface GamePlayer {
  id: string;
  username: string;
  isImpostor: boolean;
  status: PlayerStatus;
}

export interface Vote {
  voterId: string;
  targetId: string | null;
}

export interface RoundResult {
  expelledId: string | null;
  expelledUsername: string;
  wasImpostor: boolean;
  aliveImpostors: number;
  aliveNonImpostors: number;
  winner: Winner | null;
}
