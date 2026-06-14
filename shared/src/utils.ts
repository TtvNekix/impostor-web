import { MIN_TIMER, MAX_TIMER, DEFAULT_TIMER } from './constants';

/**
 * Generate a 6-character uppercase alphanumeric room code.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Clamp a discussion timer value within [MIN_TIMER, MAX_TIMER].
 * Falls back to DEFAULT_TIMER when the input is not a valid number.
 */
export function clampTimer(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) {
    return DEFAULT_TIMER;
  }
  return Math.max(MIN_TIMER, Math.min(MAX_TIMER, Math.round(value)));
}
