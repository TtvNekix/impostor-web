import { create } from 'zustand';
import type { GamePhase, Vote, RoundResult, Winner } from '@impostor/shared';

export type PlayerRole = 'impostor' | 'non_impostor' | null;

interface GameState {
  phase: GamePhase;
  word: string | null;
  /** Raw category identifier (kebab-case) from the server. */
  category: string | null;
  myRole: PlayerRole;
  votes: Vote[];
  roundResult: RoundResult | null;
  winner: Winner | null;
  /** Authoritative end timestamp in ms (epoch) for the current phase. 0 if no timer. */
  phaseEndsAt: number;
  /** Last-known total duration of the current phase, in seconds. */
  phaseTotal: number;
  /** Last-tick computed remaining time in seconds (0 if no timer). */
  timer: number;
  roundNumber: number;

  setPhase: (phase: GamePhase, phaseEndsAt?: number) => void;
  setWord: (word: string | null) => void;
  setCategory: (category: string) => void;
  setMyRole: (role: PlayerRole) => void;
  setVotes: (votes: Vote[]) => void;
  setRoundResult: (result: RoundResult) => void;
  setWinner: (winner: Winner) => void;
  setTimer: (seconds: number) => void;
  setRoundNumber: (n: number) => void;
  resetGame: () => void;
}

const initialState = {
  phase: 'LOBBY' as GamePhase,
  word: null,
  category: null,
  myRole: null as PlayerRole,
  votes: [] as Vote[],
  roundResult: null as RoundResult | null,
  winner: null as Winner | null,
  phaseEndsAt: 0,
  phaseTotal: 0,
  timer: 0,
  roundNumber: 0,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setPhase: (phase, phaseEndsAt) => {
    const now = phaseEndsAt && phaseEndsAt > 0 ? phaseEndsAt : 0;
    const remaining = now > 0 ? Math.max(0, Math.ceil((now - Date.now()) / 1000)) : 0;
    set({
      phase,
      phaseEndsAt: now,
      // phaseTotal is best-effort; consumers should also use phaseEndsAt
      // directly for accurate countdowns.
      phaseTotal: remaining,
      timer: remaining,
    });
  },

  setWord: (word) =>
    set({ word, myRole: word === null ? 'impostor' : 'non_impostor' }),

  setCategory: (category) => set({ category }),

  setMyRole: (myRole) => set({ myRole }),

  setVotes: (votes) => set({ votes }),

  setRoundResult: (result) => set({ roundResult: result }),

  setWinner: (winner) => set({ winner }),

  setTimer: (timer) => set({ timer }),

  setRoundNumber: (roundNumber) => set({ roundNumber }),

  resetGame: () => set({ ...initialState }),
}));
