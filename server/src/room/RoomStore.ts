import type { Room, RoomSettings } from '@impostor/shared';

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
}
