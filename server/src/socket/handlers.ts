import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@impostor/shared';
import {
  ServerEvent,
  ClientEvent,
  roomToDTO,
  clampTimer,
} from '@impostor/shared';
import { RoomManager } from '../room/RoomManager';
import { GameEngine } from '../game/GameEngine';
import { ConnectionManager } from '../connection/ConnectionManager';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerHandlers(
  io: TypedServer,
  roomManager: RoomManager,
  gameEngine: GameEngine,
  connectionManager: ConnectionManager,
): void {
  io.on('connection', (socket: TypedSocket) => {
    /* ----------------------------------------------------------------- */
    /*  CREATE_ROOM                                                       */
    /* ----------------------------------------------------------------- */
    socket.on(ClientEvent.CREATE_ROOM, ({ code, username, settings }) => {
      try {
        const { room, player } = roomManager.createRoom(
          code.toUpperCase(),
          username.trim(),
          settings,
        );
        // Assign socket ID to player
        player.id = socket.id;
        room.players.set(username.trim(), player);

        connectionManager.register(socket.id, room.code, username.trim());
        socket.join(room.code);
        socket.emit(ServerEvent.ROOM_JOINED, { room: roomToDTO(room) });
      } catch (err: any) {
        socket.emit(ServerEvent.ROOM_ERROR, { message: err.message });
      }
    });

    /* ----------------------------------------------------------------- */
    /*  JOIN_ROOM                                                         */
    /* ----------------------------------------------------------------- */
    socket.on(ClientEvent.JOIN_ROOM, ({ code, username }) => {
      try {
        const roomCode = code.toUpperCase();
        const trimmedName = username.trim();

        // Check for reconnection
        try {
          const room = roomManager.getRoom(roomCode);
          const existing = room.players.get(trimmedName);
          if (existing && existing.status === 'DISCONNECTED') {
            const oldSocketId = existing.id;
            connectionManager.onReconnect(oldSocketId, socket.id);
            socket.join(roomCode);
            socket.emit(ServerEvent.ROOM_JOINED, { room: roomToDTO(room) });
            return;
          }
        } catch {
          // Room not found — fall through to normal join flow
        }

        const { room, player } = roomManager.joinRoom(
          roomCode,
          trimmedName,
          socket.id,
        );

        connectionManager.register(socket.id, room.code, trimmedName);
        socket.join(room.code);
        socket.emit(ServerEvent.ROOM_JOINED, { room: roomToDTO(room) });
        socket.to(room.code).emit(ServerEvent.PLAYER_JOINED, { player });
      } catch (err: any) {
        socket.emit(ServerEvent.ROOM_ERROR, { message: err.message });
      }
    });

    /* ----------------------------------------------------------------- */
    /*  START_MATCH                                                       */
    /* ----------------------------------------------------------------- */
    socket.on(ClientEvent.START_MATCH, () => {
      const roomCode = connectionManager.getRoomCode(socket.id);
      if (!roomCode) {
        socket.emit(ServerEvent.ROOM_ERROR, { message: 'Not in a room' });
        return;
      }
      gameEngine.startMatch(roomCode, socket);
    });

    /* ----------------------------------------------------------------- */
    /*  VOTE                                                              */
    /* ----------------------------------------------------------------- */
    socket.on(ClientEvent.VOTE, ({ targetId }) => {
      const roomCode = connectionManager.getRoomCode(socket.id);
      if (!roomCode) return;
      gameEngine.processVote(roomCode, socket.id, targetId);
    });

    /* ----------------------------------------------------------------- */
    /*  UPDATE_SETTINGS                                                   */
    /* ----------------------------------------------------------------- */
    socket.on(ClientEvent.UPDATE_SETTINGS, ({ impostorCount, discussionTime }) => {
      try {
        const roomCode = connectionManager.getRoomCode(socket.id);
        if (!roomCode) {
          socket.emit(ServerEvent.ROOM_ERROR, { message: 'Not in a room' });
          return;
        }

        const room = roomManager.getRoom(roomCode);
        const player = room.players.get(connectionManager.getUsername(socket.id)!);
        if (!player?.isHost) {
          socket.emit(ServerEvent.ROOM_ERROR, { message: 'Only the host can change settings' });
          return;
        }

        if (impostorCount !== undefined) {
          const activeCount = Array.from(room.players.values()).filter(
            (p) => p.status === 'ACTIVE',
          ).length;
          const maxImp = activeCount <= 6 ? 1 : 2;
          if (impostorCount < 1 || impostorCount > maxImp) {
            socket.emit(ServerEvent.ROOM_ERROR, {
              message: `Impostor count must be between 1 and ${maxImp}`,
            });
            return;
          }
          room.settings.impostorCount = impostorCount;
        }

        if (discussionTime !== undefined) {
          room.settings.discussionTime = clampTimer(discussionTime);
        }

        io.to(roomCode).emit(ServerEvent.SETTINGS_UPDATED, room.settings);
      } catch (err: any) {
        socket.emit(ServerEvent.ROOM_ERROR, { message: err.message });
      }
    });

    /* ----------------------------------------------------------------- */
    /*  NEW_MATCH                                                         */
    /* ----------------------------------------------------------------- */
    socket.on(ClientEvent.NEW_MATCH, () => {
      const roomCode = connectionManager.getRoomCode(socket.id);
      if (!roomCode) {
        socket.emit(ServerEvent.ROOM_ERROR, { message: 'Not in a room' });
        return;
      }
      gameEngine.startNewMatch(roomCode, socket);
    });

    /* ----------------------------------------------------------------- */
    /*  LEAVE_ROOM                                                        */
    /* ----------------------------------------------------------------- */
    socket.on(ClientEvent.LEAVE_ROOM, () => {
      handleLeave(socket, roomManager, connectionManager, io);
    });

    /* ----------------------------------------------------------------- */
    /*  DISCONNECT                                                        */
    /* ----------------------------------------------------------------- */
    socket.on('disconnect', () => {
      connectionManager.onDisconnect(socket.id);
    });
  });
}

/* -------------------------------------------------------------------- */
/*  Helpers                                                              */
/* -------------------------------------------------------------------- */

function handleLeave(
  socket: TypedSocket,
  roomManager: RoomManager,
  connectionManager: ConnectionManager,
  io: TypedServer,
): void {
  const roomCode = connectionManager.getRoomCode(socket.id);
  const username = connectionManager.getUsername(socket.id);
  if (!roomCode || !username) return;

  try {
    const { wasLastPlayer, newHost } = roomManager.leaveRoom(roomCode, username);
    connectionManager.removeConnection(socket.id);
    socket.leave(roomCode);

    if (!wasLastPlayer) {
      socket.to(roomCode).emit(ServerEvent.PLAYER_LEFT, {
        playerId: socket.id,
        newHost,
      });
    }
  } catch {
    // Room may already be gone
  }
}
