import type { GamePhase } from '@impostor/shared';

/**
 * Valid transitions:
 *   LOBBY      → WORD_REVEAL
 *   WORD_REVEAL → DISCUSSION
 *   DISCUSSION  → VOTING
 *   VOTING      → EVALUATION
 *   EVALUATION  → DISCUSSION | GAME_OVER
 *   GAME_OVER   → LOBBY
 */
const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  LOBBY: ['WORD_REVEAL'],
  WORD_REVEAL: ['DISCUSSION'],
  DISCUSSION: ['VOTING'],
  VOTING: ['EVALUATION'],
  EVALUATION: ['DISCUSSION', 'GAME_OVER'],
  GAME_OVER: ['LOBBY'],
};

export class StateMachine {
  currentPhase: GamePhase = 'LOBBY';
  private timerId: ReturnType<typeof setTimeout> | null = null;
  phaseEndsAt: number = 0;

  /** Called AFTER a transition is applied. */
  onTransition: ((from: GamePhase, to: GamePhase) => void) | null = null;

  /** Called when the current phase timer expires naturally. */
  onTimerExpired: ((phase: GamePhase) => void) | null = null;

  /** Attempt a phase transition. */
  transition(to: GamePhase, durationMs?: number): boolean {
    if (!StateMachine.isValidTransition(this.currentPhase, to)) {
      return false;
    }
    const from = this.currentPhase;
    this.cancelTimer();

    this.currentPhase = to;
    if (durationMs && durationMs > 0) {
      this.phaseEndsAt = Date.now() + durationMs;
      this.timerId = setTimeout(() => {
        this.timerId = null;
        this.onTimerExpired?.(to);
      }, durationMs);
    } else {
      this.phaseEndsAt = 0;
    }

    this.onTransition?.(from, to);
    return true;
  }

  cancelTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.phaseEndsAt = 0;
  }

  /** Milliseconds remaining in the current phase. */
  getRemainingMs(): number {
    if (!this.phaseEndsAt) return 0;
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  static isValidTransition(from: GamePhase, to: GamePhase): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed?.includes(to) ?? false;
  }
}
