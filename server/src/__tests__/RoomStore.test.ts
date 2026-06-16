import { describe, it, expect, beforeEach } from 'vitest';
import { RoomStore } from '../room/RoomStore';
import type { RoomSettings } from '@impostor/shared';

const baseSettings: RoomSettings = {
  maxPlayers: 10,
  impostorCount: 1,
  discussionTime: 0,
  category: 'animals',
  votingTimer: 30,
  hardcore: false,
  visibility: 'private',
  hostLocale: 'en',
};

function makeSettings(overrides: Partial<RoomSettings> = {}): RoomSettings {
  return { ...baseSettings, ...overrides };
}

describe('RoomStore.getAllPublicRooms', () => {
  let store: RoomStore;

  beforeEach(() => {
    store = new RoomStore();
  });

  it('returns empty list when no rooms exist', () => {
    const result = store.getAllPublicRooms();
    expect(result.rooms).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.totalCount).toBe(0);
  });

  it('returns empty list when no public rooms exist', () => {
    // 3 private rooms
    for (const code of ['PR001', 'PR002', 'PR003']) {
      store.createRoom(code, makeSettings({ visibility: 'private' }));
    }
    const result = store.getAllPublicRooms();
    expect(result.rooms).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('filters out non-public rooms', () => {
    const pub1 = store.createRoom('PUB01', makeSettings({ visibility: 'public' }));
    const prv1 = store.createRoom('PRV01', makeSettings({ visibility: 'private' }));
    const pub2 = store.createRoom('PUB02', makeSettings({ visibility: 'public' }));
    const prv2 = store.createRoom('PRV02', makeSettings({ visibility: 'private' }));
    // Public rooms need at least 1 ACTIVE player to pass the empty-room
    // filter; private rooms don't need any.
    for (const r of [pub1, pub2]) {
      r.players.set('H', { id: 'h', username: 'H', status: 'ACTIVE', isHost: true, joinedAt: 0 });
    }
    for (const r of [prv1, prv2]) {
      r.players.set('H', { id: 'h', username: 'H', status: 'ACTIVE', isHost: true, joinedAt: 0 });
    }

    const result = store.getAllPublicRooms();
    expect(result.rooms.map((r) => r.roomCode).sort()).toEqual(['PUB01', 'PUB02']);
    expect(result.totalCount).toBe(2);
    expect(result.hasMore).toBe(false);
  });

  it('returns DTOs with the agreed field shape', () => {
    const room = store.createRoom('DTO01', makeSettings({
      visibility: 'public',
      category: 'food',
      hostLocale: 'es',
      maxPlayers: 8,
    }));
    room.players.set('Alice Smith', {
      id: 's1', username: 'Alice Smith', status: 'ACTIVE', isHost: true, joinedAt: 0,
    });
    room.players.set('Bob', {
      id: 's2', username: 'Bob', status: 'ACTIVE', isHost: false, joinedAt: 1,
    });

    const result = store.getAllPublicRooms(0);
    expect(result.rooms).toHaveLength(1);
    const dto = result.rooms[0];
    // Agreed field set only — no extras
    expect(Object.keys(dto).sort()).toEqual([
      'ageSeconds', 'category', 'hostFirstName', 'hostLocale',
      'maxPlayers', 'playerCount', 'roomCode',
    ]);
    expect(dto.roomCode).toBe('DTO01');
    expect(dto.hostFirstName).toBe('Alice'); // first whitespace-delimited token
    expect(dto.category).toBe('food');
    expect(dto.hostLocale).toBe('es');
    expect(dto.maxPlayers).toBe(8);
    expect(dto.playerCount).toBe(2);
  });

  it('exposes only the first whitespace-delimited host name token', () => {
    const room = store.createRoom('NAM01', makeSettings({ visibility: 'public' }));
    room.players.set('María José García', {
      id: 's1', username: 'María José García', status: 'ACTIVE', isHost: true, joinedAt: 0,
    });
    // Extra players with later join time shouldn't be picked as host
    room.players.set('Carl Sagan', {
      id: 's2', username: 'Carl Sagan', status: 'ACTIVE', isHost: false, joinedAt: 1,
    });

    const result = store.getAllPublicRooms();
    expect(result.rooms[0].hostFirstName).toBe('María');
  });

  it('counts only ACTIVE players for playerCount', () => {
    const room = store.createRoom('CNT01', makeSettings({ visibility: 'public' }));
    room.players.set('H', { id: 's1', username: 'H', status: 'ACTIVE', isHost: true, joinedAt: 0 });
    room.players.set('A', { id: 's2', username: 'A', status: 'ACTIVE', isHost: false, joinedAt: 1 });
    room.players.set('B', { id: 's3', username: 'B', status: 'ACTIVE', isHost: false, joinedAt: 2 });
    room.players.set('S1', { id: 's4', username: 'S1', status: 'SPECTATOR', isHost: false, joinedAt: 3 });
    room.players.set('D1', { id: 's5', username: 'D1', status: 'DISCONNECTED', isHost: false, joinedAt: 4 });

    const result = store.getAllPublicRooms();
    expect(result.rooms[0].playerCount).toBe(3); // H + A + B; spectators and disconnected don't count
  });

  it('excludes empty public rooms (defense in depth)', () => {
    store.createRoom('PUB01', makeSettings({ visibility: 'public' }));
    // PUB01 has no players
    const result = store.getAllPublicRooms();
    expect(result.rooms).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('applies 50-cap with hasMore and totalCount', () => {
    for (let i = 0; i < 55; i++) {
      const code = `R${String(i).padStart(3, '0')}`;
      const room = store.createRoom(code, makeSettings({ visibility: 'public' }));
      // Give every room at least 1 ACTIVE player so the empty-room filter
      // doesn't kick in and we're testing the cap, not the filter.
      room.players.set(`H${i}`, {
        id: `s${i}`,
        username: `Host${i}`,
        status: 'ACTIVE',
        isHost: true,
        joinedAt: 0,
      });
    }
    const result = store.getAllPublicRooms();
    expect(result.rooms).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(result.totalCount).toBe(55);
  });

  it('does not flag hasMore when exactly at the cap', () => {
    for (let i = 0; i < 50; i++) {
      const code = `X${String(i).padStart(3, '0')}`;
      const room = store.createRoom(code, makeSettings({ visibility: 'public' }));
      room.players.set(`H${i}`, {
        id: `s${i}`, username: `Host${i}`, status: 'ACTIVE', isHost: true, joinedAt: 0,
      });
    }
    const result = store.getAllPublicRooms();
    expect(result.rooms).toHaveLength(50);
    expect(result.hasMore).toBe(false);
    expect(result.totalCount).toBe(50);
  });

  it('computes ageSeconds as floor((now - createdAt) / 1000)', () => {
    // Inject a room whose createdAt is 2 minutes 5 seconds in the past
    // relative to "now". Use the underlying rooms Map to set a known
    // createdAt. This keeps the public API surface stable.
    const room = store.createRoom('AGE01', makeSettings({ visibility: 'public' }));
    room.players.set('H', { id: 's1', username: 'H', status: 'ACTIVE', isHost: true, joinedAt: 0 });
    room.createdAt = 1_000_000_000; // anchor
    const now = 1_000_000_000 + (125 * 1000); // 125s later

    const result = store.getAllPublicRooms(now);
    expect(result.rooms[0].ageSeconds).toBe(125);
  });

  it('clamps ageSeconds to 0 when now is before createdAt (clock skew)', () => {
    const room = store.createRoom('AGE02', makeSettings({ visibility: 'public' }));
    room.players.set('H', { id: 's1', username: 'H', status: 'ACTIVE', isHost: true, joinedAt: 0 });
    room.createdAt = 2_000_000_000;
    const result = store.getAllPublicRooms(1_000_000_000);
    expect(result.rooms[0].ageSeconds).toBe(0);
  });
});
