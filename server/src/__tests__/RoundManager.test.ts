import { describe, it, expect } from 'vitest';
import { RoundManager } from '../game/RoundManager';
import type { GamePlayer, Vote } from '@impostor/shared';

function makePlayer(
  overrides: Partial<GamePlayer> = {},
): GamePlayer {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    username: 'Player',
    isImpostor: false,
    status: 'ACTIVE',
    ...overrides,
  };
}

function makeImpostor(overrides: Partial<GamePlayer> = {}): GamePlayer {
  return makePlayer({ isImpostor: true, ...overrides });
}

describe('RoundManager', () => {
  describe('tally', () => {
    it('single target with most votes gets expelled', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice', username: 'Alice' }),
        makePlayer({ id: 'bob', username: 'Bob' }),
        makeImpostor({ id: 'charlie', username: 'Charlie' }),
      ];

      const votes: Vote[] = [
        { voterId: 'alice', targetId: 'charlie' },
        { voterId: 'bob', targetId: 'charlie' },
        { voterId: 'charlie', targetId: 'alice' },
      ];

      const result = RoundManager.tally(votes, players);

      expect(result.expelled).not.toBeNull();
      expect(result.expelled!.id).toBe('charlie');
      expect(result.roundResult.expelledId).toBe('charlie');
      expect(result.roundResult.expelledUsername).toBe('Charlie');
      expect(result.roundResult.wasImpostor).toBe(true);
    });

    it('tie results in no expulsion', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice', username: 'Alice' }),
        makePlayer({ id: 'bob', username: 'Bob' }),
        makePlayer({ id: 'charlie', username: 'Charlie' }),
        makePlayer({ id: 'diana', username: 'Diana' }),
      ];

      const votes: Vote[] = [
        { voterId: 'alice', targetId: 'bob' },
        { voterId: 'bob', targetId: 'alice' },
        { voterId: 'charlie', targetId: 'bob' },
        { voterId: 'diana', targetId: 'alice' },
      ];

      const result = RoundManager.tally(votes, players);

      expect(result.expelled).toBeNull();
      expect(result.roundResult.expelledId).toBeNull();
      expect(result.roundResult.winner).toBeNull();
    });

    it('all skip votes results in no expulsion', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice', username: 'Alice' }),
        makePlayer({ id: 'bob', username: 'Bob' }),
        makePlayer({ id: 'charlie', username: 'Charlie' }),
      ];

      const votes: Vote[] = [
        { voterId: 'alice', targetId: null },
        { voterId: 'bob', targetId: null },
        { voterId: 'charlie', targetId: null },
      ];

      const result = RoundManager.tally(votes, players);

      expect(result.expelled).toBeNull();
      expect(result.roundResult.expelledId).toBeNull();
      expect(result.roundResult.winner).toBeNull();
    });

    it('expels the correct player and reports alive counts', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice', username: 'Alice' }),
        makeImpostor({ id: 'bob', username: 'Bob', isImpostor: true }),
        makePlayer({ id: 'charlie', username: 'Charlie' }),
      ];

      const votes: Vote[] = [
        { voterId: 'alice', targetId: 'bob' },
        { voterId: 'charlie', targetId: 'bob' },
        // impostor bob votes too but against alice
        { voterId: 'bob', targetId: 'alice' },
      ];

      const result = RoundManager.tally(votes, players);

      expect(result.expelled!.id).toBe('bob');
      expect(result.roundResult.wasImpostor).toBe(true);
      expect(result.roundResult.aliveImpostors).toBe(0);
      expect(result.roundResult.aliveNonImpostors).toBe(2);
    });

    it('handles expelled non-impostor correctly', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice', username: 'Alice' }),
        makePlayer({ id: 'bob', username: 'Bob' }),
        makeImpostor({ id: 'charlie', username: 'Charlie' }),
      ];

      const votes: Vote[] = [
        { voterId: 'bob', targetId: 'alice' },
        { voterId: 'charlie', targetId: 'alice' },
        { voterId: 'alice', targetId: 'charlie' },
      ];

      const result = RoundManager.tally(votes, players);

      expect(result.expelled!.id).toBe('alice');
      expect(result.roundResult.wasImpostor).toBe(false);
      expect(result.roundResult.aliveImpostors).toBe(1);
      expect(result.roundResult.aliveNonImpostors).toBe(1);
    });
  });

  describe('checkWinCondition', () => {
    it('returns NON_IMPOSTORS when no impostors are alive', () => {
      expect(
        RoundManager.checkWinCondition(0, 3),
      ).toBe('NON_IMPOSTORS');
    });

    it('returns IMPOSTORS when non-impostors ≤ impostors', () => {
      // 2 impostors vs 2 non-impostors
      expect(RoundManager.checkWinCondition(2, 2)).toBe('IMPOSTORS');
      // 2 impostors vs 1 non-impostor
      expect(RoundManager.checkWinCondition(2, 1)).toBe('IMPOSTORS');
    });

    it('returns null when game should continue', () => {
      expect(RoundManager.checkWinCondition(1, 3)).toBeNull();
      expect(RoundManager.checkWinCondition(1, 2)).toBeNull();
      expect(RoundManager.checkWinCondition(2, 3)).toBeNull();
    });
  });

  describe('allVotesIn', () => {
    it('returns true when all active players voted', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice' }),
        makePlayer({ id: 'bob' }),
        makePlayer({ id: 'charlie' }),
      ];

      const votes: Vote[] = [
        { voterId: 'alice', targetId: 'bob' },
        { voterId: 'bob', targetId: 'alice' },
        { voterId: 'charlie', targetId: 'alice' },
      ];

      expect(RoundManager.allVotesIn(votes, players)).toBe(true);
    });

    it('returns false when not all active players voted', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice' }),
        makePlayer({ id: 'bob' }),
      ];

      const votes: Vote[] = [{ voterId: 'alice', targetId: 'bob' }];

      expect(RoundManager.allVotesIn(votes, players)).toBe(false);
    });

    it('does not count spectators in active count', () => {
      const players: GamePlayer[] = [
        makePlayer({ id: 'alice' }),
        makePlayer({ id: 'bob', status: 'SPECTATOR' }),
      ];

      const votes: Vote[] = [{ voterId: 'alice', targetId: null }];

      expect(RoundManager.allVotesIn(votes, players)).toBe(true);
    });
  });
});
