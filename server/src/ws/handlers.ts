import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ServerEvent,
  ClientEvent,
  roomToDTO,
  clampTimer,
  MIN_PLAYERS,
  MAX_PLAYERS,
  ErrorCode,
  ALLOWED_VOTING_TIMERS,
  ALLOWED_LOCALES,
  validateUsername,
  validateRoomCode,
  validateCategoryName,
  validateWordList,
} from '@impostor/shared';
import { RoomManager } from '../room/RoomManager';
import { GameEngine } from '../game/GameEngine';
import { ConnectionManager } from '../connection/ConnectionManager';
import { WordBank } from '../words/WordBank';
import { logEvent } from '../audit/logger';

/** Helper to send a localized error code to a single socket. */
function sendError(
  ws: WebSocket,
  code: string,
  message: string,
  data?: Record<string, string | number>,
): void {
  ws.send(JSON.stringify({
    event: ServerEvent.ROOM_ERROR,
    data: { code, message, ...(data ? { data } : {}) },
  }));
}

/** Helper to send a generic event payload to a single socket. */
function sendEvent(
  ws: WebSocket,
  event: string,
  data: unknown,
): void {
  ws.send(JSON.stringify({ event, data }));
}

/** Translate a thrown Error from RoomManager into a structured error code. */
function roomErrorCode(err: Error): string {
  switch (err.message) {
    case 'Room not found':
      return ErrorCode.ROOM_NOT_FOUND;
    case 'Room is full':
      return ErrorCode.ROOM_FULL;
    case 'Username already taken':
      return ErrorCode.USERNAME_TAKEN;
    case 'Game already in progress':
      return ErrorCode.GAME_IN_PROGRESS;
    case 'Player not found in room':
      return ErrorCode.GENERIC;
    default:
      // Match the room-already-taken error from RoomStore. The message
      // includes the code, so we use a startsWith check instead of an
      // exact match.
      if (err.message.startsWith('Room code "') && err.message.endsWith('" is already taken')) {
        return ErrorCode.ROOM_CODE_TAKEN;
      }
      return ErrorCode.GENERIC;
  }
}

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 20_000;

export function registerHandlers(
  wss: WebSocketServer,
  roomManager: RoomManager,
  gameEngine: GameEngine,
  connectionManager: ConnectionManager,
  wordBank: WordBank,
): void {
  wss.on('connection', (ws: WebSocket) => {
    const socketId = randomUUID();

    /* ---------------------------------------------------------------- */
    /*  Send assigned connection ID + available categories              */
    /* ---------------------------------------------------------------- */
    ws.send(JSON.stringify({ event: ServerEvent.CONNECTED, data: { id: socketId } }));
    ws.send(JSON.stringify({
      event: ServerEvent.CATEGORIES,
      data: { categories: wordBank.getCategories() },
    }));

    /* ---------------------------------------------------------------- */
    /*  Heartbeat — ping every 25 s, expect pong within 20 s           */
    /* ---------------------------------------------------------------- */
    let pongTimeout: ReturnType<typeof setTimeout> | null = null;

    const pingInterval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(pingInterval);
        return;
      }
      ws.send(JSON.stringify({ event: 'ping' }));
      // Start the pong timeout
      pongTimeout = setTimeout(() => {
        ws.terminate();
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);

    /* ---------------------------------------------------------------- */
    /*  Incoming message router                                         */
    /* ---------------------------------------------------------------- */

    ws.on('message', (raw: Buffer) => {
      let msg: { event: string; data: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // Ignore invalid JSON
      }

      const { event, data } = msg;

      // Heartbeat pong — reset pong timeout
      if (event === 'pong') {
        if (pongTimeout) {
          clearTimeout(pongTimeout);
          pongTimeout = null;
        }
        return;
      }

      switch (event) {
        /* ------------------------------------------------------------ */
        /*  CREATE_ROOM                                                  */
        /* ------------------------------------------------------------ */
        case ClientEvent.CREATE_ROOM: {
          const { code, username, settings } = data as {
            code: string;
            username: string;
            settings?: Record<string, unknown>;
          };
          const cleanCode = validateRoomCode(code);
          const cleanName = validateUsername(username);
          if (!cleanCode || !cleanName) {
            sendError(ws, ErrorCode.GENERIC, 'Invalid room code or username');
            return;
          }
          try {
            const { room, player } = roomManager.createRoom(
              cleanCode,
              cleanName,
              settings as any,
            );
            player.id = socketId;
            room.players.set(cleanName, player);

            connectionManager.register(socketId, ws, room.code, cleanName);
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_JOINED,
              data: { room: roomToDTO(room) },
            }));
            logEvent('room_created', {
              code: cleanCode,
              hostUsername: cleanName,
              maxPlayers: room.settings.maxPlayers,
              category: room.settings.category ?? 'aleatoria',
              votingTimer: room.settings.votingTimer,
              hardcore: room.settings.hardcore,
              visibility: room.settings.visibility,
              hostLocale: room.settings.hostLocale,
            });
          } catch (err: any) {
            // Translate the error to a structured code; do not leak
            // the raw `err.message` to the client (it can include
            // server-internal language like Spanish strings from
            // RoomManager).
            sendError(ws, roomErrorCode(err), 'Could not create room');
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  JOIN_ROOM                                                    */
        /* ------------------------------------------------------------ */
        case ClientEvent.JOIN_ROOM: {
          const { code, username } = data as {
            code: string;
            username: string;
          };
          const roomCode = validateRoomCode(code);
          const trimmedName = validateUsername(username);
          if (!roomCode || !trimmedName) {
            sendError(ws, ErrorCode.GENERIC, 'Invalid room code or username');
            return;
          }
          try {
            // Check for reconnection
            try {
              const room = roomManager.getRoom(roomCode);
              const existing = room.players.get(trimmedName);
              if (existing && existing.status === 'DISCONNECTED') {
                const oldSocketId = existing.id;
                connectionManager.onReconnect(oldSocketId, socketId, ws);
                ws.send(JSON.stringify({
                  event: ServerEvent.ROOM_JOINED,
                  data: { room: roomToDTO(room) },
                }));
                logEvent('room_joined', {
                  code: roomCode,
                  username: trimmedName,
                  isHost: existing.isHost,
                });
                return;
              }
            } catch {
              // Room not found — fall through to normal join flow
            }

            const { room, player } = roomManager.joinRoom(
              roomCode,
              trimmedName,
              socketId,
            );

            connectionManager.register(socketId, ws, room.code, trimmedName);
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_JOINED,
              data: { room: roomToDTO(room) },
            }));
            logEvent('room_joined', {
              code: roomCode,
              username: trimmedName,
              isHost: player.isHost,
            });
            // Broadcast to room (excluding the new joiner — they already got room_joined)
            connectionManager.broadcastToRoom(room.code, ServerEvent.PLAYER_JOINED, { player });
          } catch (err: any) {
            // Translate to a structured code; do not leak raw message
            // to the client.
            sendError(ws, roomErrorCode(err), 'Could not join room');
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  START_MATCH                                                  */
        /* ------------------------------------------------------------ */
        case ClientEvent.START_MATCH: {
          const roomCode = connectionManager.getRoomCode(socketId);
          if (!roomCode) {
            sendError(ws, ErrorCode.NOT_IN_ROOM, 'Not in a room');
            return;
          }
          try {
            gameEngine.startMatch(roomCode, socketId);
          } catch (err: any) {
            sendError(ws, ErrorCode.MIN_PLAYERS, 'Not enough players to start', { min: MIN_PLAYERS });
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  START_VOTING (host-driven, from DISCUSSION)                  */
        /* ------------------------------------------------------------ */
        case ClientEvent.START_VOTING: {
          const roomCode = connectionManager.getRoomCode(socketId);
          if (!roomCode) {
            sendError(ws, ErrorCode.NOT_IN_ROOM, 'Not in a room');
            return;
          }
          gameEngine.startVoting(roomCode, socketId);
          break;
        }

        /* ------------------------------------------------------------ */
        /*  FORCE_END_VOTING (host-driven, while in VOTING)             */
        /* ------------------------------------------------------------ */
        // Useful when one or more players have AFK'd or left their
        // client open without voting; the rest of the room is stuck at
        // "5/6 voted" with no way to advance. The host can force-tally
        // with the current set of votes. Server-side: same authorisation
        // check as start_match (host only), same phase check (must be
        // in VOTING). Missing voters are simply absent from the tally.
        case ClientEvent.FORCE_END_VOTING: {
          const roomCode = connectionManager.getRoomCode(socketId);
          if (!roomCode) {
            sendError(ws, ErrorCode.NOT_IN_ROOM, 'Not in a room');
            return;
          }
          gameEngine.forceEndVoting(roomCode, socketId);
          break;
        }

        /* ------------------------------------------------------------ */
        /*  VOTE                                                         */
        /* ------------------------------------------------------------ */
        case ClientEvent.VOTE: {
          const roomCode = connectionManager.getRoomCode(socketId);
          if (!roomCode) return;
          const { targetId } = data as { targetId: string | null };
          gameEngine.processVote(roomCode, socketId, targetId);
          break;
        }

        /* ------------------------------------------------------------ */
        /*  UPDATE_SETTINGS                                              */
        /* ------------------------------------------------------------ */
        case ClientEvent.UPDATE_SETTINGS: {
          try {
            const roomCode = connectionManager.getRoomCode(socketId);
            if (!roomCode) {
              sendError(ws, ErrorCode.NOT_IN_ROOM, 'Not in a room');
              return;
            }

            const room = roomManager.getRoom(roomCode);
            const player = room.players.get(connectionManager.getUsername(socketId)!);
            if (!player?.isHost) {
              sendError(ws, ErrorCode.NOT_HOST, 'Only the host can change settings');
              return;
            }

            const { impostorCount, discussionTime, category, votingTimer, hardcore, visibility, hostLocale } = data as {
              impostorCount?: number;
              discussionTime?: number;
              category?: string | null;
              votingTimer?: 15 | 30 | 45 | 60;
              hardcore?: boolean;
              visibility?: 'public' | 'private';
              hostLocale?: string;
            };

            // impostorCount: accepted freely in the lobby (host plans ahead).
            // The game engine clamps it at start_match time if the value is
            // too high for the current player count.
            if (impostorCount !== undefined) {
              if (impostorCount < 1 || impostorCount > 2) {
                sendError(ws, ErrorCode.INVALID_IMPOSTOR_COUNT,
                  'Impostor count must be 1 or 2',
                  { max: 2, players: 0 },
                );
                return;
              }
              room.settings.impostorCount = impostorCount;
            }

            if (discussionTime !== undefined) {
              room.settings.discussionTime = clampTimer(discussionTime);
            }

            // votingTimer: must be one of the allowed values
            if (votingTimer !== undefined) {
              if (!ALLOWED_VOTING_TIMERS.includes(votingTimer)) {
                sendError(ws, ErrorCode.GENERIC,
                  'Invalid voting timer',
                  { max: 60, players: 0 },
                );
                return;
              }
              room.settings.votingTimer = votingTimer;
            }

            // hardcore: simple boolean toggle
            if (hardcore !== undefined) {
              room.settings.hardcore = !!hardcore;
            }

            // Category: host can pick a specific category or null for random.
            // The lobby UI labels this option "Random" but sends the
            // literal string "random" over the wire — we accept that
            // as a synonym for null/empty.
            if (category !== undefined) {
              if (category === null || category === '' || category === 'random') {
                room.settings.category = null;
              } else if (wordBank.getCategories().some((c) => c.name === category)) {
                room.settings.category = category;
              } else {
                sendError(ws, ErrorCode.GENERIC, `Unknown category: ${category}`);
                return;
              }
            }

            // visibility: host can flip between public and private. Anything
            // else is rejected so the same sanitization rule as createRoom
            // applies on this in-lobby transport.
            if (visibility !== undefined) {
              if (visibility !== 'public' && visibility !== 'private') {
                sendError(ws, ErrorCode.GENERIC,
                  'Invalid visibility: must be "public" or "private"');
                return;
              }
              room.settings.visibility = visibility;
            }

            // hostLocale: validated against the 6-code ALLOWED_LOCALES set.
            if (hostLocale !== undefined) {
              if (!ALLOWED_LOCALES.includes(hostLocale as typeof ALLOWED_LOCALES[number])) {
                sendError(ws, ErrorCode.GENERIC,
                  `Invalid hostLocale: must be one of ${ALLOWED_LOCALES.join(', ')}`);
                return;
              }
              room.settings.hostLocale = hostLocale;
            }

            connectionManager.broadcastToRoom(roomCode, ServerEvent.SETTINGS_UPDATED, room.settings);
          } catch (err: any) {
            sendError(ws, ErrorCode.GENERIC, 'Could not update settings');
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  ADD_CATEGORY (host only, lobby phase)                       */
        /* ------------------------------------------------------------ */
        case ClientEvent.ADD_CATEGORY: {
          try {
            const roomCode = connectionManager.getRoomCode(socketId);
            if (!roomCode) {
              sendError(ws, ErrorCode.NOT_IN_ROOM, 'Not in a room');
              return;
            }
            const room = roomManager.getRoom(roomCode);
            const player = room.players.get(connectionManager.getUsername(socketId)!);
            if (!player?.isHost) {
              sendError(ws, ErrorCode.NOT_HOST, 'Only the host can create categories');
              return;
            }
            if (room.gameState && room.gameState.phase !== 'LOBBY' && room.gameState.phase !== 'GAME_OVER') {
              sendError(ws, ErrorCode.GAME_IN_PROGRESS, 'Cannot add categories during a match');
              return;
            }

            const { name, displayName, words } = data as {
              name: string;
              displayName?: string;
              words: string;
            };

            // Validate the category name and word list. Reject
            // oversized / control-character / empty inputs before
            // they reach the WordBank.
            const cleanName = validateCategoryName(name);
            const cleanDisplay = displayName !== undefined
              ? validateCategoryName(displayName)
              : undefined;
            const rawList = typeof words === 'string'
              ? words.split(/[;,\n]/)
              : words;
            const cleanWords = validateWordList(rawList);
            if (!cleanName || !cleanWords) {
              sendError(ws, ErrorCode.GENERIC, 'Invalid category or words');
              return;
            }

            const created = wordBank.addCategory(cleanName, cleanDisplay ?? cleanName, cleanWords);

            // Auto-select the new category so the host doesn't have to pick again
            room.settings.category = created.name;
            connectionManager.broadcastToRoom(roomCode, ServerEvent.CATEGORIES, {
              categories: wordBank.getCategories(),
            });
            connectionManager.broadcastToRoom(roomCode, ServerEvent.SETTINGS_UPDATED, room.settings);
          } catch (err: any) {
            sendError(ws, ErrorCode.GENERIC, 'Could not add category');
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  ADD_WORDS (host only, lobby phase)                          */
        /* ------------------------------------------------------------ */
        case ClientEvent.ADD_WORDS: {
          try {
            const roomCode = connectionManager.getRoomCode(socketId);
            if (!roomCode) {
              sendError(ws, ErrorCode.NOT_IN_ROOM, 'Not in a room');
              return;
            }
            const room = roomManager.getRoom(roomCode);
            const player = room.players.get(connectionManager.getUsername(socketId)!);
            if (!player?.isHost) {
              sendError(ws, ErrorCode.NOT_HOST, 'Only the host can add words');
              return;
            }
            if (room.gameState && room.gameState.phase !== 'LOBBY' && room.gameState.phase !== 'GAME_OVER') {
              sendError(ws, ErrorCode.GAME_IN_PROGRESS, 'Cannot add words during a match');
              return;
            }

            const { category, words } = data as {
              category: string;
              words: string;
            };

            // Validate the category reference and the word list.
            const cleanCategory = validateCategoryName(category);
            const rawList = typeof words === 'string'
              ? words.split(/[;,\n]/)
              : words;
            const cleanWords = validateWordList(rawList);
            if (!cleanCategory || !cleanWords) {
              sendError(ws, ErrorCode.GENERIC, 'Invalid category or words');
              return;
            }

            const result = wordBank.addWords(cleanCategory, cleanWords);

            connectionManager.broadcastToRoom(roomCode, ServerEvent.CATEGORIES, {
              categories: wordBank.getCategories(),
            });
            // Notify the host about the success (sent only to caller)
            sendEvent(ws, ServerEvent.WORDS_ADDED, {
              category: cleanCategory,
              added: result.added,
              total: result.total,
            });
          } catch (err: any) {
            sendError(ws, ErrorCode.GENERIC, 'Could not add words');
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  NEW_MATCH                                                    */
        /* ------------------------------------------------------------ */
        case ClientEvent.NEW_MATCH: {
          const roomCode = connectionManager.getRoomCode(socketId);
          if (!roomCode) {
            sendError(ws, ErrorCode.NOT_IN_ROOM, 'Not in a room');
            return;
          }
          gameEngine.startNewMatch(roomCode, socketId);
          break;
        }

        /* ------------------------------------------------------------ */
        /*  LEAVE_ROOM                                                   */
        /* ------------------------------------------------------------ */
        case ClientEvent.LEAVE_ROOM: {
          handleLeave(socketId, roomManager, connectionManager);
          break;
        }

        /* ------------------------------------------------------------ */
        /*  KICK_PLAYER (host only)                                     */
        /* ------------------------------------------------------------ */
        case ClientEvent.KICK_PLAYER: {
          handleKick(socketId, data as { username?: string }, roomManager, connectionManager, ws);
          break;
        }

        default:
          break;
      }
    });

    /* ---------------------------------------------------------------- */
    /*  Close / Error cleanup                                            */
    /* ---------------------------------------------------------------- */

    ws.on('close', () => {
      clearInterval(pingInterval);
      if (pongTimeout) clearTimeout(pongTimeout);
      connectionManager.onDisconnect(socketId);
    });

    ws.on('error', () => {
      clearInterval(pingInterval);
      if (pongTimeout) clearTimeout(pongTimeout);
      connectionManager.onDisconnect(socketId);
    });
  });
}

/* -------------------------------------------------------------------- */
/*  Helpers                                                              */
/* -------------------------------------------------------------------- */

function handleLeave(
  socketId: string,
  roomManager: RoomManager,
  connectionManager: ConnectionManager,
): void {
  const roomCode = connectionManager.getRoomCode(socketId);
  const username = connectionManager.getUsername(socketId);
  if (!roomCode || !username) return;

  // Capture host status before leaving (player is removed by leaveRoom)
  const preRoom = roomManager.getRoom(roomCode);
  const wasHost = preRoom?.players.get(username)?.isHost ?? false;

  if (wasHost) {
    // Host leaving — the room can't function without an admin. Destroy
    // the room and notify every remaining member. Same behaviour as the
    // host's WS disconnecting.
    connectionManager.handleHostLeft(roomCode);
    connectionManager.removeConnection(socketId);
    logEvent('room_destroyed', { code: roomCode, reason: 'host_left' });
    return;
  }

  try {
    const { wasLastPlayer, newHost } = roomManager.leaveRoom(roomCode, username);
    connectionManager.removeConnection(socketId);

    if (!wasLastPlayer) {
      logEvent('room_left', {
        code: roomCode,
        username,
        wasHost: false,
      });
      connectionManager.broadcastToRoom(roomCode, ServerEvent.PLAYER_LEFT, {
        playerId: socketId,
        newHost,
      });
    }
  } catch {
    // Room may already be gone
  }
}

/* -------------------------------------------------------------------- */
/*  KICK_PLAYER — host-only action                                     */
/* -------------------------------------------------------------------- */

export function handleKick(
  callerSocketId: string,
  data: { username?: string },
  roomManager: RoomManager,
  connectionManager: ConnectionManager,
  ws: WebSocket,
): void {
  const roomCode = connectionManager.getRoomCode(callerSocketId);
  const callerName = connectionManager.getUsername(callerSocketId);
  if (!roomCode || !callerName) {
    sendError(ws, ErrorCode.NOT_IN_ROOM, 'You are not in a room');
    return;
  }
  if (!data?.username) {
    sendError(ws, ErrorCode.GENERIC, 'Missing target username');
    return;
  }
  if (data.username === callerName) {
    sendError(ws, ErrorCode.GENERIC, 'Cannot kick yourself');
    return;
  }
  // Verify the caller is the host.
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, ErrorCode.ROOM_NOT_FOUND, 'Room no longer exists');
    return;
  }
  const host = room.players.get(callerName);
  if (!host?.isHost) {
    sendError(ws, ErrorCode.NOT_HOST, 'Only the host can kick');
    return;
  }
  // Resolve the target's socket ID from their username.
  const targetSocketId = connectionManager.getSocketIdByUsername(
    roomCode,
    data.username,
  );
  if (!targetSocketId) {
    sendError(ws, ErrorCode.GENERIC, 'Player not found in room');
    return;
  }
  // Tell the kicked player specifically — they get redirected to the
  // entry page with a localized reason.
  connectionManager.sendToSocket(targetSocketId, ServerEvent.KICKED, {
    code: 'kicked_by_host',
    message: 'You have been kicked by the host',
  });
  logEvent('player_kicked', {
    code: roomCode,
    hostUsername: callerName,
    targetUsername: data.username,
  });
  // Remove the player from the room and broadcast to the rest.
  try {
    const { newHost, wasLastPlayer } = roomManager.leaveRoom(
      roomCode,
      data.username,
    );
    connectionManager.removeConnection(targetSocketId);
    if (!wasLastPlayer) {
      connectionManager.broadcastToRoom(roomCode, ServerEvent.PLAYER_LEFT, {
        playerId: targetSocketId,
        newHost,
      });
    }
  } catch {
    // ignore
  }
}
