import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ServerEvent,
  ClientEvent,
  roomToDTO,
  clampTimer,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from '@impostor/shared';
import { RoomManager } from '../room/RoomManager';
import { GameEngine } from '../game/GameEngine';
import { ConnectionManager } from '../connection/ConnectionManager';

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 20_000;

export function registerHandlers(
  wss: WebSocketServer,
  roomManager: RoomManager,
  gameEngine: GameEngine,
  connectionManager: ConnectionManager,
): void {
  wss.on('connection', (ws: WebSocket) => {
    const socketId = randomUUID();

    /* ---------------------------------------------------------------- */
    /*  Send assigned connection ID                                     */
    /* ---------------------------------------------------------------- */
    ws.send(JSON.stringify({ event: ServerEvent.CONNECTED, data: { id: socketId } }));

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
          try {
            const { room, player } = roomManager.createRoom(
              code.toUpperCase(),
              username.trim(),
              settings as any,
            );
            player.id = socketId;
            room.players.set(username.trim(), player);

            connectionManager.register(socketId, ws, room.code, username.trim());
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_JOINED,
              data: { room: roomToDTO(room) },
            }));
          } catch (err: any) {
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_ERROR,
              data: { message: err.message },
            }));
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
          try {
            const roomCode = code.toUpperCase();
            const trimmedName = username.trim();

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
            // Broadcast to room (excluding the new joiner — they already got room_joined)
            connectionManager.broadcastToRoom(room.code, ServerEvent.PLAYER_JOINED, { player });
          } catch (err: any) {
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_ERROR,
              data: { message: err.message },
            }));
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  START_MATCH                                                  */
        /* ------------------------------------------------------------ */
        case ClientEvent.START_MATCH: {
          const roomCode = connectionManager.getRoomCode(socketId);
          if (!roomCode) {
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_ERROR,
              data: { message: 'Not in a room' },
            }));
            return;
          }
          gameEngine.startMatch(roomCode, socketId);
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
              ws.send(JSON.stringify({
                event: ServerEvent.ROOM_ERROR,
                data: { message: 'Not in a room' },
              }));
              return;
            }

            const room = roomManager.getRoom(roomCode);
            const player = room.players.get(connectionManager.getUsername(socketId)!);
            if (!player?.isHost) {
              ws.send(JSON.stringify({
                event: ServerEvent.ROOM_ERROR,
                data: { message: 'Only the host can change settings' },
              }));
              return;
            }

            const { impostorCount, discussionTime, maxPlayers } = data as {
              impostorCount?: number;
              discussionTime?: number;
              maxPlayers?: number;
            };

            if (impostorCount !== undefined) {
              const activeCount = Array.from(room.players.values()).filter(
                (p) => p.status === 'ACTIVE',
              ).length;
              const maxImp = activeCount <= 6 ? 1 : activeCount <= 10 ? 2 : activeCount <= 15 ? 3 : 4;
              if (impostorCount < 1 || impostorCount > maxImp) {
                ws.send(JSON.stringify({
                  event: ServerEvent.ROOM_ERROR,
                  data: { message: `Impostor count must be between 1 and ${maxImp}` },
                }));
                return;
              }
              room.settings.impostorCount = impostorCount;
            }

            if (discussionTime !== undefined) {
              room.settings.discussionTime = clampTimer(discussionTime);
            }

            if (maxPlayers !== undefined) {
              const activeCount = Array.from(room.players.values()).filter(
                (p) => p.status === 'ACTIVE',
              ).length;
              // Only allow increasing maxPlayers and only within allowed bounds.
              // Never kick existing players.
              if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
                ws.send(JSON.stringify({
                  event: ServerEvent.ROOM_ERROR,
                  data: { message: `Max players must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}` },
                }));
                return;
              }
              if (maxPlayers < room.settings.maxPlayers && maxPlayers < activeCount) {
                ws.send(JSON.stringify({
                  event: ServerEvent.ROOM_ERROR,
                  data: { message: 'Cannot reduce max players below current player count' },
                }));
                return;
              }
              if (maxPlayers < activeCount) {
                ws.send(JSON.stringify({
                  event: ServerEvent.ROOM_ERROR,
                  data: { message: 'Max players cannot be lower than current player count' },
                }));
                return;
              }
              room.settings.maxPlayers = maxPlayers;
            }

            connectionManager.broadcastToRoom(roomCode, ServerEvent.SETTINGS_UPDATED, room.settings);
          } catch (err: any) {
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_ERROR,
              data: { message: err.message },
            }));
          }
          break;
        }

        /* ------------------------------------------------------------ */
        /*  NEW_MATCH                                                    */
        /* ------------------------------------------------------------ */
        case ClientEvent.NEW_MATCH: {
          const roomCode = connectionManager.getRoomCode(socketId);
          if (!roomCode) {
            ws.send(JSON.stringify({
              event: ServerEvent.ROOM_ERROR,
              data: { message: 'Not in a room' },
            }));
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

  try {
    const { wasLastPlayer, newHost } = roomManager.leaveRoom(roomCode, username);
    connectionManager.removeConnection(socketId);

    if (!wasLastPlayer) {
      connectionManager.broadcastToRoom(roomCode, ServerEvent.PLAYER_LEFT, {
        playerId: socketId,
        newHost,
      });
    }
  } catch {
    // Room may already be gone
  }
}
