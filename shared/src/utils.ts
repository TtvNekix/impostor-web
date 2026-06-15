import {
  DEFAULT_TIMER,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_MAX_PLAYERS,
  ALLOWED_MAX_PLAYERS,
  IMPOSTOR_LIMITS,
} from './constants';

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
 * Clamp a discussion timer value. Returns 0 (= no auto-end; host must
 * press "Iniciar votación") when the input is not a valid positive number.
 */
export function clampTimer(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) {
    return DEFAULT_TIMER;
  }
  return Math.round(value);
}

/**
 * Snap a `maxPlayers` value to the nearest allowed bucket.
 * Returns `DEFAULT_MAX_PLAYERS` when the input is invalid.
 */
export function clampMaxPlayers(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) {
    return DEFAULT_MAX_PLAYERS;
  }
  const allowed = ALLOWED_MAX_PLAYERS;
  const snapped = allowed.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, snapped));
}

/**
 * Maximum allowed impostor count for a given number of active players.
 */
export function maxImpostorsForPlayers(playerCount: number): number {
  for (const limit of [...IMPOSTOR_LIMITS].sort((a, b) => a.maxPlayers - b.maxPlayers)) {
    if (playerCount <= limit.maxPlayers) return limit.maxImpostors;
  }
  return IMPOSTOR_LIMITS[IMPOSTOR_LIMITS.length - 1].maxImpostors;
}
