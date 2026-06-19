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
 *
 * Uses a cryptographically-secure random source so a malicious
 * observer cannot predict the next code. In Node.js (server-side)
 * this uses `crypto.randomInt`; in the browser this uses
 * `crypto.getRandomValues`, both of which are CSPRNGs. Math.random
 * uses XorShift128+ which is predictable from a few samples.
 *
 * The shared module is consumed by both the server (Node) and the
 * client (browser), so the implementation picks the available
 * CSPRNG at module load time and does NOT import `node:crypto` at
 * the top level (which would break the browser bundle).
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const length = chars.length;

  type Rng = (maxExclusive: number) => number;
  let rng: Rng;
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    // Browser + Node 19+. Use rejection sampling for an unbiased
    // uniform distribution: keep drawing 32-bit ints until we land
    // in the range [0, maxExclusive).
    const buf = new Uint32Array(1);
    rng = (maxExclusive) => {
      const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
      let n: number;
      do {
        globalThis.crypto.getRandomValues(buf);
        n = buf[0];
      } while (n >= limit);
      return n % maxExclusive;
    };
  } else {
    // Fallback: non-cryptographic. Should never run in practice
    // because every supported runtime exposes Web Crypto.
    rng = (maxExclusive) => Math.floor(Math.random() * maxExclusive);
  }

  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[rng(length)];
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
