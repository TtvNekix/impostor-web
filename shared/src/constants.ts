export const MAX_PLAYERS = 20;
export const MIN_PLAYERS = 3;
export const DEFAULT_MAX_PLAYERS = 10;
export const DEFAULT_TIMER = 90;
export const MIN_TIMER = 60;
export const MAX_TIMER = 120;
export const VOTING_TIMER = 30;

/** Impostor count constraints keyed by player count ceiling. */
export const IMPOSTOR_LIMITS: Array<{ maxPlayers: number; maxImpostors: number }> = [
  { maxPlayers: 6, maxImpostors: 1 },
  { maxPlayers: 10, maxImpostors: 2 },
  { maxPlayers: 15, maxImpostors: 3 },
  { maxPlayers: 20, maxImpostors: 4 },
];

/** Allowed `maxPlayers` values for the create-room / settings selectors. */
export const ALLOWED_MAX_PLAYERS: readonly number[] = [4, 6, 8, 10, 12, 15, 20];
