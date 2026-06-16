import type { Room, RoomSettings, PublicRoomDTO, PublicRoomsResponse } from '@impostor/shared';
import { MAX_PUBLIC_ROOMS_RETURNED } from '@impostor/shared';

export class RoomStore {
  private rooms: Map<string, Room> = new Map();

  createRoom(code: string, settings: RoomSettings): Room {
    if (this.rooms.has(code)) {
      throw new Error(`Room code "${code}" is already taken`);
    }

    const room: Room = {
      code,
      players: new Map(),
      settings,
      gameState: null,
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  deleteRoom(code: string): boolean {
    return this.rooms.delete(code);
  }

  /** Returns a shallow copy of every active room code. */
  getAllRoomCodes(): string[] {
    return Array.from(this.rooms.keys());
  }

  /** Returns the total number of active rooms. */
  get size(): number {
    return this.rooms.size;
  }

  /**
   * Build a sanitized DTO list of every public room with at least one
   * ACTIVE player. Privacy bar:
   *   - only the host's first whitespace-delimited name token is exposed
   *   - only the agreed field set is leaked (no settings, no full host name)
   * Results are capped at MAX_PUBLIC_ROOMS_RETURNED; `hasMore` reports
   * whether more rooms existed before the cap, and `totalCount` is the
   * pre-cap total so the client can show an overflow hint.
   */
  getAllPublicRooms(now: number = Date.now()): PublicRoomsResponse {
    const all: PublicRoomDTO[] = [];
    for (const room of this.rooms.values()) {
      if (room.settings.visibility !== 'public') continue;

      const activeCount = Array.from(room.players.values()).filter(
        (p) => p.status === 'ACTIVE',
      ).length;
      // Defense in depth: hide empty public rooms (host just disconnected
      // and RoomStore.deleteRoom hasn't run yet). See spec: "empty room
      // filtering".
      if (activeCount === 0) continue;

      const host = Array.from(room.players.values()).find((p) => p.isHost);
      const hostFirstName = (host?.username ?? '').trim().split(/\s+/)[0] ?? '';

      all.push({
        roomCode: room.code,
        hostFirstName,
        category: room.settings.category,
        hostLocale: room.settings.hostLocale,
        playerCount: activeCount,
        maxPlayers: room.settings.maxPlayers,
        ageSeconds: Math.max(0, Math.floor((now - room.createdAt) / 1000)),
      });
    }

    const totalCount = all.length;
    const hasMore = totalCount > MAX_PUBLIC_ROOMS_RETURNED;
    const rooms = hasMore ? all.slice(0, MAX_PUBLIC_ROOMS_RETURNED) : all;

    return { rooms, hasMore, totalCount };
  }
}

