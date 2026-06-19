/**
 * Server-side input validation helpers.
 *
 * The client uses maxLength={20} on the username input, but the
 * WebSocket boundary is fully open: any raw client can send a
 * 10 MB username, a 1 KB room code with path-traversal chars, or a
 * settings object with a NaN timer. TypeScript types are stripped
 * at runtime -- `as { ... }` casts are wishful thinking.
 *
 * Every ws.on('message', ...) handler calls one of these to coerce
 * and validate a field. Returns null for invalid input (handlers
 * respond with a localized room_error and ignore the message).
 */

// Forbidden characters in user-supplied names. We block:
//   - 0x00-0x1F  (NUL through US, including TAB / CR / LF)
//   - 0x7F        (DEL)
//   - 0x200B-0x200F (zero-width space, ZWNJ, ZWJ, LRM, RLM)
//   - 0x2028-0x202F (line / paragraph / word joiner separators)
//   - 0x2066-0x2069 (BiDi control codes: LRI, RLI, FSI, PDI)
//   - 0xFEFF      (BOM)
// The pattern is built with -style escapes so it survives
// any text-encoding round-trip in the toolchain.
const FORBIDDEN_NAME_CHARS = /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2066-\u2069\ufeff]/;

/**
 * Validate a username. Returns the trimmed name on success, null on
 * failure. Constraints:
 *   - is a non-empty string
 *   - length 1..20 after trim
 *   - contains no control / format / ZWJ / bidi characters
 */
export function validateUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return null;
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate a room code. Returns the uppercased code on success, null
 * on failure. Constraints:
 *   - is a string
 *   - length 3..6 (production codes are 6 chars; tests use shorter
 *     codes like T01 for readability)
 *   - chars are A-Z or 0-9 (the alphabet used by generateRoomCode)
 * Path-traversal sequences like ../../etc/passwd are rejected by the
 * character class.
 */
export function validateRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  if (!/^[A-Z0-9]{3,6}$/.test(upper)) return null;
  return upper;
}

/**
 * Validate a category name. Same rules as username, with a shorter
 * cap (16 chars). Categories are user-created so the same trust
 * boundary applies.
 */
export function validateCategoryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 16) return null;
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate a single word. Same rules as username, with a cap of 24
 * chars (longest legitimate Spanish/English word fits comfortably).
 */
export function validateWord(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 24) return null;
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate an array of words. Returns the cleaned array (filtering
 * out invalid entries) on success, null if the input is not an
 * array or if no entries are valid.
 */
export function validateWordList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned: string[] = [];
  for (const item of raw) {
    const w = validateWord(item);
    if (w !== null) cleaned.push(w);
  }
  return cleaned.length > 0 ? cleaned : null;
}
