export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 3;
export const DEFAULT_MAX_PLAYERS = 10;
/** Default discussion time (in seconds). 0 = no auto-end; the host must
 *  press "Iniciar votación" to advance to the voting phase. */
export const DEFAULT_TIMER = 0;
export const VOTING_TIMER = 30;

/** Impostor count constraints keyed by player count ceiling. */
export const IMPOSTOR_LIMITS: Array<{ maxPlayers: number; maxImpostors: number }> = [
  { maxPlayers: 5, maxImpostors: 1 },
  { maxPlayers: 10, maxImpostors: 2 },
];

/** Allowed `maxPlayers` values for the create-room selector. */
export const ALLOWED_MAX_PLAYERS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10];
