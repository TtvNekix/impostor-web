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
  VOTE: 'vote',
  UPDATE_SETTINGS: 'update_settings',
  NEW_MATCH: 'new_match',
  LEAVE_ROOM: 'leave_room',
} as const;

export const ServerEvent = {
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
}

/* Server → Client */

export interface RoomJoinedPayload {
  room: RoomDTO;
}

export interface RoomErrorPayload {
  message: string;
}

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
  reason: string;
}

/* ------------------------------------------------------------------ */
/*  Socket.IO typed event maps                                         */
/* ------------------------------------------------------------------ */

export interface ClientToServerEvents {
  [ClientEvent.JOIN_ROOM]: (payload: JoinRoomPayload) => void;
  [ClientEvent.CREATE_ROOM]: (payload: CreateRoomPayload) => void;
  [ClientEvent.START_MATCH]: () => void;
  [ClientEvent.VOTE]: (payload: VotePayload) => void;
  [ClientEvent.UPDATE_SETTINGS]: (payload: UpdateSettingsPayload) => void;
  [ClientEvent.NEW_MATCH]: () => void;
  [ClientEvent.LEAVE_ROOM]: () => void;
}

export interface ServerToClientEvents {
  [ServerEvent.ROOM_JOINED]: (payload: RoomJoinedPayload) => void;
  [ServerEvent.ROOM_ERROR]: (payload: RoomErrorPayload) => void;
  [ServerEvent.PLAYER_JOINED]: (payload: PlayerJoinedPayload) => void;
  [ServerEvent.PLAYER_LEFT]: (payload: PlayerLeftPayload) => void;
  [ServerEvent.GAME_STARTED]: (payload: GameStartedPayload) => void;
  [ServerEvent.WORD_ASSIGNED]: (payload: WordAssignedPayload) => void;
  [ServerEvent.PHASE_CHANGED]: (payload: PhaseChangedPayload) => void;
  [ServerEvent.VOTE_UPDATE]: (payload: VoteUpdatePayload) => void;
  [ServerEvent.VOTE_BROADCAST]: (payload: VoteBroadcastPayload) => void;
  [ServerEvent.ROUND_RESULT]: (payload: RoundResult) => void;
  [ServerEvent.GAME_OVER]: (payload: { winner: Winner }) => void;
  [ServerEvent.SETTINGS_UPDATED]: (payload: RoomSettings) => void;
  [ServerEvent.PLAYER_DISCONNECTED]: (payload: PlayerDisconnectedPayload) => void;
  [ServerEvent.PLAYER_RECONNECTED]: (payload: PlayerReconnectedPayload) => void;
  [ServerEvent.KICKED]: (payload: KickedPayload) => void;
}
