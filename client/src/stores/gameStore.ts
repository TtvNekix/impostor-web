import { create } from 'zustand';
import type { GamePhase, Vote, RoundResult, Winner } from '@impostor/shared';

export type PlayerRole = 'impostor' | 'non_impostor' | null;

/** Per-match stats for the local user. Reset on each new match. */
export interface MyMatchStats {
  roundsPlayed: number;
  timesAsImpostor: number;
  timesCaught: number;
  timesSurvivedAsImpostor: number;
  impostorsFound: number;
}

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
  /** Live count of players that have voted in the current round. */
  voterCount: number;
  /** Total number of active players who can vote. */
  totalVoters: number;
  roundNumber: number;
  /** Player IDs who are impostors in the current match (set on game start). */
  impostorIds: string[];
  /** Stats for the local user across the current match. */
  myStats: MyMatchStats;

  setPhase: (phase: GamePhase, phaseEndsAt?: number) => void;
  setWord: (word: string | null) => void;
  setCategory: (category: string) => void;
  setMyRole: (role: PlayerRole) => void;
  setVotes: (votes: Vote[]) => void;
  setRoundResult: (result: RoundResult) => void;
  setWinner: (winner: Winner) => void;
  setTimer: (seconds: number) => void;
  setVoterCount: (voterCount: number, totalVoters?: number) => void;
  setRoundNumber: (n: number) => void;
  setImpostorIds: (ids: string[]) => void;
  resetMyStats: () => void;
  recordRoundPlayed: () => void;
  recordAsImpostor: () => void;
  recordCaught: () => void;
  recordSurvived: () => void;
  recordImpostorFound: () => void;
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
  voterCount: 0,
  totalVoters: 0,
  roundNumber: 0,
  impostorIds: [] as string[],
  myStats: {
    roundsPlayed: 0,
    timesAsImpostor: 0,
    timesCaught: 0,
    timesSurvivedAsImpostor: 0,
    impostorsFound: 0,
  } as MyMatchStats,
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
      // Reset the live voter count when the phase changes (e.g. fresh
      // voting round after a new round starts).
      voterCount: 0,
      totalVoters: 0,
      // Reset the votes array too — otherwise a new match's VOTING phase
      // would see stale votes from the previous round and lock the table
      // with "✓ Voto registrado" because hasVoted computes true.
      votes: [],
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

  setVoterCount: (voterCount, totalVoters) => set((state) => ({
    voterCount,
    totalVoters: totalVoters !== undefined ? totalVoters : state.totalVoters,
  })),

  setRoundNumber: (roundNumber) => set({ roundNumber }),

  setImpostorIds: (impostorIds) => set({ impostorIds }),

  resetMyStats: () => set({ myStats: { ...initialState.myStats } }),
  recordRoundPlayed: () =>
    set((state) => ({ myStats: { ...state.myStats, roundsPlayed: state.myStats.roundsPlayed + 1 } })),
  recordAsImpostor: () =>
    set((state) => ({ myStats: { ...state.myStats, timesAsImpostor: state.myStats.timesAsImpostor + 1 } })),
  recordCaught: () =>
    set((state) => ({ myStats: { ...state.myStats, timesCaught: state.myStats.timesCaught + 1 } })),
  recordSurvived: () =>
    set((state) => ({ myStats: { ...state.myStats, timesSurvivedAsImpostor: state.myStats.timesSurvivedAsImpostor + 1 } })),
  recordImpostorFound: () =>
    set((state) => ({ myStats: { ...state.myStats, impostorsFound: state.myStats.impostorsFound + 1 } })),

  resetGame: () => set({ ...initialState }),
}));
