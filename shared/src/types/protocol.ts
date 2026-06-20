import type { RoomSettings, Player } from './room';
import type { GamePhase, Vote, RoundResult, Winner } from './game';
import type { RoomDTO } from './room';

/* ------------------------------------------------------------------ */
/*  Event name constants                                               */
/* ------------------------------------------------------------------ */

export const ClientEvent = {
  JOIN_ROOM: 'join_room',
  CREATE_ROOM: 'create_room',
  START_MATCH: 'start_match',
  START_VOTING: 'start_voting',
  VOTE: 'vote',
  FORCE_END_VOTING: 'force_end_voting',
  UPDATE_SETTINGS: 'update_settings',
  ADD_CATEGORY: 'add_category',
  ADD_WORDS: 'add_words',
  NEW_MATCH: 'new_match',
  LEAVE_ROOM: 'leave_room',
  KICK_PLAYER: 'kick_player',
} as const;

export const ServerEvent = {
  CONNECTED: 'connected',
  CATEGORIES: 'categories',
  ROOM_JOINED: 'room_joined',
  ROOM_ERROR: 'room_error',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  GAME_STARTED: 'game_started',
  WORD_ASSIGNED: 'word_assigned',
  PHASE_CHANGED: 'phase_changed',
  VOTE_UPDATE: 'vote_update',
  VOTE_BROADCAST: 'vote_broadcast',
  ROUND_RESULT: 'round_result',
  GAME_OVER: 'game_over',
  SETTINGS_UPDATED: 'settings_updated',
  PLAYER_DISCONNECTED: 'player_disconnected',
  PLAYER_RECONNECTED: 'player_reconnected',
  WORDS_ADDED: 'words_added',
  HOST_LEFT: 'host_left',
  KICKED: 'kicked',
} as const;

/* ------------------------------------------------------------------ */
/*  Payload types                                                      */
/* ------------------------------------------------------------------ */

/* Client → Server */

export interface JoinRoomPayload {
  code: string;
  username: string;
}

export interface CreateRoomPayload {
  code: string;
  username: string;
  settings?: Partial<RoomSettings>;
}

export interface VotePayload {
  targetId: string | null;
}

export interface UpdateSettingsPayload {
  impostorCount?: number;
  discussionTime?: number;
  category?: string | null;
  maxPlayers?: number;
  votingTimer?: 15 | 30 | 45 | 60;
  hardcore?: boolean;
  visibility?: 'public' | 'private';
  hostLocale?: string;
}

export interface AddCategoryPayload {
  /** Kebab-case identifier. Will be normalized. */
  name: string;
  /** Optional human-readable label. Defaults to title-cased name. */
  displayName?: string;
  /** Words separated by ';' (or any delimiter), trimmed, deduplicated. */
  words: string;
}

export interface AddWordsPayload {
  /** Target category name (kebab-case). */
  category: string;
  /** New words separated by ';'. */
  words: string;
}

/* Server → Client */

export interface RoomJoinedPayload {
  room: RoomDTO;
}

export interface RoomErrorPayload {
  /** Machine-readable error code. Clients should map this to a localized string. */
  code: string;
  /** Human-readable fallback (English). */
  message: string;
  /** Optional interpolation data for the localized message. */
  data?: Record<string, string | number>;
}

/** Canonical error codes returned by the server. Keep in sync with the client i18n `errors` map. */
export const ErrorCode = {
  ROOM_NOT_FOUND: 'room_not_found',
  ROOM_FULL: 'room_full',
  ROOM_CODE_TAKEN: 'room_code_taken',
  USERNAME_TAKEN: 'username_taken',
  GAME_IN_PROGRESS: 'game_in_progress',
  INVALID_IMPOSTOR_COUNT: 'invalid_impostor_count',
  INVALID_MAX_PLAYERS: 'invalid_max_players',
  MIN_PLAYERS: 'min_players',
  NOT_HOST: 'not_host',
  NOT_IN_ROOM: 'not_in_room',
  GENERIC: 'generic',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface PlayerJoinedPayload {
  player: Player;
}

export interface PlayerLeftPayload {
  playerId: string;
  newHost?: string;
}

export interface GameStartedPayload {
  roundNumber: number;
  category: string;
  phaseEndsAt: number;
}

export interface WordAssignedPayload {
  word: string | null;
}

export interface PhaseChangedPayload {
  phase: GamePhase;
  phaseEndsAt: number;
}

/** Category info for the lobby selector. */
export interface CategoryInfo {
  name: string;
  displayName: string;
}

export interface VoteUpdatePayload {
  voterCount: number;
  totalPlayers: number;
}

export interface VoteBroadcastPayload {
  votes: Vote[];
}

export interface PlayerDisconnectedPayload {
  playerId: string;
  timeout?: number;
}

export interface PlayerReconnectedPayload {
  playerId: string;
}

export interface KickedPayload {
  /** Machine-readable code, mapped to a localized string client-side. */
  code: 'kicked_by_host' | 'kicked_room_destroyed' | 'kicked_self';
  /** Human-readable fallback (English). */
  message: string;
}

export interface KickPlayerPayload {
  /** Username of the player to kick. */
  username: string;
}

export interface HostLeftPayload {
  /** Machine-readable code, mapped to a localized string client-side. */
  code: 'host_disconnected' | 'host_left';
  /** Human-readable fallback (English). */
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Wire message envelope                                              */
/* ------------------------------------------------------------------ */

export interface WsMessage {
  event: string;
  data: unknown;
}

/* ------------------------------------------------------------------ */
/*  Connection-level payloads                                          */
/* ------------------------------------------------------------------ */

export interface ConnectedPayload {
  id: string;
}
