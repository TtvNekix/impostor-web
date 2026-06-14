import type { Server, Socket } from 'socket.io';
import { ServerEvent } from '@impostor/shared';
import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';

const DISCONNECT_TIMEOUT_MS = 30_000; // 30 seconds

interface ConnectionEntry {
  roomCode: string;
  username: string;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export class ConnectionManager {
  /** Maps socket.id → connection metadata. */
  private connections: Map<string, ConnectionEntry> = new Map();

  constructor(
    private roomStore: RoomStore,
    private roomManager: RoomManager,
    private io: Server,
  ) {}

  /* ------------------------------------------------------------------ */
  /*  Register a new connection                                          */
  /* ------------------------------------------------------------------ */

  register(socketId: string, roomCode: string, username: string): void {
    this.connections.set(socketId, {
      roomCode,
      username,
      disconnectTimer: null,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Handle disconnect                                                  */
  /* ------------------------------------------------------------------ */

  onDisconnect(socketId: string): void {
    const entry = this.connections.get(socketId);
    if (!entry) return;

    const { roomCode, username } = entry;

    // Mark player as DISCONNECTED in room
    const room = this.roomStore.getRoom(roomCode);
    if (room) {
      const player = room.players.get(username);
      if (player) {
        player.status = 'DISCONNECTED';
        this.io.to(roomCode).emit(ServerEvent.PLAYER_DISCONNECTED, {
          playerId: socketId,
          timeout: DISCONNECT_TIMEOUT_MS,
        });
      }
    }

    // Start disconnect timeout
    const timer = setTimeout(() => {
      this.cleanupStale(socketId);
    }, DISCONNECT_TIMEOUT_MS);

    entry.disconnectTimer = timer;
  }

  /* ------------------------------------------------------------------ */
  /*  Handle reconnect                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Attempt to reconnect a player. Returns true if reconnection was
   * accepted (player was within the timeout window).
   */
  onReconnect(oldSocketId: string, newSocketId: string): boolean {
    const entry = this.connections.get(oldSocketId);
    if (!entry) return false;

    const { roomCode, username } = entry;

    // Cancel disconnect timer
    if (entry.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }

    // Update the player's socket ID in the room
    this.roomManager.updateSocketId(roomCode, username, newSocketId);

    // Update connection tracking
    this.connections.delete(oldSocketId);
    this.connections.set(newSocketId, {
      roomCode,
      username,
      disconnectTimer: null,
    });

    // Restore player status to ACTIVE (or SPECTATOR if they were expelled)
    const room = this.roomStore.getRoom(roomCode);
    if (room) {
      const player = room.players.get(username);
      if (player && player.status === 'DISCONNECTED') {
        player.status = 'ACTIVE';
        // If game is in progress and they were a spectator, keep them as SPECTATOR
        if (room.gameState) {
          const gp = room.gameState.players.find((p) => p.id === newSocketId);
          if (gp && gp.status === 'SPECTATOR') {
            player.status = 'SPECTATOR';
          }
        }
      }

      this.io.to(roomCode).emit(ServerEvent.PLAYER_RECONNECTED, {
        playerId: newSocketId,
      });
    }

    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup stale connection after timeout                             */
  /* ------------------------------------------------------------------ */

  private cleanupStale(socketId: string): void {
    const entry = this.connections.get(socketId);
    if (!entry) return;

    const { roomCode, username } = entry;
    this.connections.delete(socketId);

    try {
      const { room, wasLastPlayer, newHost } = this.roomManager.leaveRoom(
        roomCode,
        username,
      );
      if (!wasLastPlayer) {
        this.io.to(roomCode).emit(ServerEvent.PLAYER_LEFT, {
          playerId: socketId,
          newHost,
        });
      }
    } catch {
      // Room may have already been destroyed
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Full cleanup on explicit leave                                     */
  /* ------------------------------------------------------------------ */

  removeConnection(socketId: string): void {
    const entry = this.connections.get(socketId);
    if (entry?.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
    }
    this.connections.delete(socketId);
  }

  /** Look up connection metadata by socket ID. */
  getConnection(socketId: string): ConnectionEntry | undefined {
    return this.connections.get(socketId);
  }

  /** Find the username for a given socket ID. */
  getUsername(socketId: string): string | undefined {
    return this.connections.get(socketId)?.username;
  }

  /** Get the room code for a given socket ID. */
  getRoomCode(socketId: string): string | undefined {
    return this.connections.get(socketId)?.roomCode;
  }
}
