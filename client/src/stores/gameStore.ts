import { create } from 'zustand';
import type { GamePhase, Vote, RoundResult, Winner } from '@impostor/shared';

export type PlayerRole = 'impostor' | 'non_impostor' | null;

interface GameState {
  phase: GamePhase;
  word: string | null;
  category: string | null;
  myRole: PlayerRole;
  votes: Vote[];
  roundResult: RoundResult | null;
  winner: Winner | null;
  timer: number; // remaining seconds
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
  timer: 0,
  roundNumber: 0,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

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
