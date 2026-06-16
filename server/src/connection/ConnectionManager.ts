import { WebSocket } from 'ws';
import { ServerEvent } from '@impostor/shared';
import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';

const DISCONNECT_TIMEOUT_MS = 30_000; // 30 seconds

interface ConnectionEntry {
  ws: WebSocket;
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
  ) {}

  /* ------------------------------------------------------------------ */
  /*  Register a new connection                                          */
  /* ------------------------------------------------------------------ */

  register(socketId: string, ws: WebSocket, roomCode: string, username: string): void {
    this.connections.set(socketId, {
      ws,
      roomCode,
      username,
      disconnectTimer: null,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Broadcast to all clients in a room                                 */
  /* ------------------------------------------------------------------ */

  broadcastToRoom(roomCode: string, event: string, data: unknown): void {
    const payload = JSON.stringify({ event, data });
    for (const [, entry] of this.connections) {
      if (entry.roomCode === roomCode && entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.send(payload);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Send to a specific socket                                          */
  /* ------------------------------------------------------------------ */

  sendToSocket(socketId: string, event: string, data: unknown): void {
    const entry = this.connections.get(socketId);
    if (!entry) return;
    if (entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(JSON.stringify({ event, data }));
    }
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
        // Host disconnected — the room can't function without an admin.
        // Destroy the room immediately and notify every remaining member.
        if (player.isHost) {
          this.broadcastToRoom(roomCode, ServerEvent.HOST_LEFT, {
            code: 'host_disconnected',
            message: 'The host disconnected. The room has been deleted.',
          });
          this.roomManager.destroyRoom(roomCode);
          // Drop every connection entry that pointed at this room so future
          // messages from those sockets become no-ops (they'll also see the
          // HOST_LEFT event and reset their own state).
          for (const [otherId, other] of this.connections) {
            if (other.roomCode === roomCode) {
              if (other.disconnectTimer) clearTimeout(other.disconnectTimer);
              this.connections.delete(otherId);
            }
          }
          return;
        }

        player.status = 'DISCONNECTED';
        this.broadcastToRoom(roomCode, ServerEvent.PLAYER_DISCONNECTED, {
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
  onReconnect(oldSocketId: string, newSocketId: string, newWs: WebSocket): boolean {
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

    // Update connection tracking (keep the old entry's metadata, swap ws + socketId)
    this.connections.delete(oldSocketId);
    this.connections.set(newSocketId, {
      ws: newWs,
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

      this.broadcastToRoom(roomCode, ServerEvent.PLAYER_RECONNECTED, {
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
      if (!wasLastPlayer && room) {
        this.broadcastToRoom(roomCode, ServerEvent.PLAYER_LEFT, {
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

  /**
   * Find the socket ID for a given (roomCode, username) pair. Returns
   * null if no such connection exists. Used by the kick handler to
   * resolve a target username to a live socket.
   */
  getSocketIdByUsername(roomCode: string, username: string): string | null {
    for (const [sid, entry] of this.connections) {
      if (entry.roomCode === roomCode && entry.username === username) {
        return sid;
      }
    }
    return null;
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
