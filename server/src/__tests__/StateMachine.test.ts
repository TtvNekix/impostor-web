import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateMachine } from '../game/StateMachine';
import type { GamePhase } from '@impostor/shared';

describe('StateMachine', () => {
  let sm: StateMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    sm = new StateMachine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in LOBBY phase', () => {
      expect(sm.currentPhase).toBe('LOBBY');
    });
  });

  describe('valid transitions', () => {
    const validCases: Array<{ from: GamePhase; to: GamePhase }> = [
      { from: 'LOBBY', to: 'WORD_REVEAL' },
      { from: 'WORD_REVEAL', to: 'DISCUSSION' },
      { from: 'DISCUSSION', to: 'VOTING' },
      { from: 'VOTING', to: 'EVALUATION' },
      { from: 'EVALUATION', to: 'DISCUSSION' },
      { from: 'EVALUATION', to: 'GAME_OVER' },
      { from: 'GAME_OVER', to: 'LOBBY' },
    ];

    for (const { from, to } of validCases) {
      it(`${from} → ${to} is valid`, () => {
        // Force initial phase
        sm.currentPhase = from;
        const result = sm.transition(to);
        expect(result).toBe(true);
        expect(sm.currentPhase).toBe(to);
      });
    }
  });

  describe('invalid transitions', () => {
    const invalidCases: Array<{ from: GamePhase; to: GamePhase }> = [
      { from: 'LOBBY', to: 'VOTING' },
      { from: 'LOBBY', to: 'EVALUATION' },
      { from: 'LOBBY', to: 'GAME_OVER' },
      { from: 'LOBBY', to: 'LOBBY' },
      { from: 'WORD_REVEAL', to: 'LOBBY' },
      { from: 'WORD_REVEAL', to: 'VOTING' },
      { from: 'DISCUSSION', to: 'LOBBY' },
      { from: 'DISCUSSION', to: 'EVALUATION' },
      { from: 'VOTING', to: 'LOBBY' },
      { from: 'VOTING', to: 'DISCUSSION' },
      { from: 'GAME_OVER', to: 'DISCUSSION' },
      { from: 'GAME_OVER', to: 'VOTING' },
    ];

    for (const { from, to } of invalidCases) {
      it(`${from} → ${to} returns false`, () => {
        sm.currentPhase = from;
        const result = sm.transition(to);
        expect(result).toBe(false);
        expect(sm.currentPhase).toBe(from); // Phase unchanged
      });
    }
  });

  describe('timer functionality', () => {
    it('fires onTimerExpired callback when timer expires', () => {
      // Must use valid transitions: LOBBY→WORD_REVEAL→DISCUSSION
      sm.transition('WORD_REVEAL', 0);

      const callback = vi.fn();
      sm.onTimerExpired = callback;

      sm.transition('DISCUSSION', 1000);

      // Fast-forward past the timer
      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('DISCUSSION');
    });

    it('cancels timer when transition is called again', () => {
      sm.transition('WORD_REVEAL', 0);

      const callback = vi.fn();
      sm.onTimerExpired = callback;

      sm.transition('DISCUSSION', 5000);

      // Transition again before timer expires (GOING BACK to WORD_REVEAL is invalid,
      // so use another valid chain: set phase directly for test, then start a new timer)
      sm.currentPhase = 'LOBBY';
      sm.transition('WORD_REVEAL', 0);

      // Advance past the original timer
      vi.advanceTimersByTime(5000);

      // The callback should NOT fire for the cancelled timer
      expect(callback).not.toHaveBeenCalled();
    });

    it('cancelTimer stops the timer and resets phaseEndsAt', () => {
      sm.transition('WORD_REVEAL', 0);
      sm.transition('DISCUSSION', 10000);
      expect(sm.phaseEndsAt).toBeGreaterThan(0);

      sm.cancelTimer();
      expect(sm.phaseEndsAt).toBe(0);

      // Advance past the timer — callback should not fire
      const callback = vi.fn();
      sm.onTimerExpired = callback;
      vi.advanceTimersByTime(10000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('sets phaseEndsAt when duration is provided', () => {
      vi.setSystemTime(1000000);

      sm.transition('WORD_REVEAL', 0);
      sm.transition('DISCUSSION', 5000);
      expect(sm.phaseEndsAt).toBe(1005000);
    });

    it('sets phaseEndsAt to 0 when no duration is provided', () => {
      sm.transition('WORD_REVEAL', 0);
      expect(sm.phaseEndsAt).toBe(0);
    });
  });

  describe('getRemainingMs', () => {
    it('returns correct remaining time', () => {
      vi.setSystemTime(1000000);

      sm.transition('WORD_REVEAL', 0);
      sm.transition('DISCUSSION', 10000);
      const elapsed = 3000;
      vi.advanceTimersByTime(elapsed);

      const remaining = sm.getRemainingMs();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(7000);
    });

    it('returns 0 when phase has no timer', () => {
      sm.transition('WORD_REVEAL', 0);
      expect(sm.getRemainingMs()).toBe(0);
    });

    it('returns 0 after timer expires', () => {
      sm.transition('VOTING', 500);
      vi.advanceTimersByTime(500);
      expect(sm.getRemainingMs()).toBe(0);
    });
  });

  describe('static isValidTransition', () => {
    it('returns true for valid transitions', () => {
      expect(StateMachine.isValidTransition('LOBBY', 'WORD_REVEAL')).toBe(true);
      expect(
        StateMachine.isValidTransition('EVALUATION', 'GAME_OVER'),
      ).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(StateMachine.isValidTransition('LOBBY', 'VOTING')).toBe(false);
      expect(StateMachine.isValidTransition('LOBBY', 'LOBBY')).toBe(false);
    });
  });

  describe('onTransition callback', () => {
    it('fires onTransition callback with from and to phases', () => {
      const callback = vi.fn();
      sm.onTransition = callback;

      sm.currentPhase = 'WORD_REVEAL';
      sm.transition('DISCUSSION');

      expect(callback).toHaveBeenCalledWith('WORD_REVEAL', 'DISCUSSION');
    });
  });
});
