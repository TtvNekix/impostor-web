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
  /**
   * Random speaking order for the discussion phase. A permutation
   * of the active player ids in the order they should speak. Set
   * once at match start and reused for every round in the same
   * match (so everyone knows their order from round 1).
   */
  turnOrder: string[];
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
