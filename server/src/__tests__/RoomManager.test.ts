import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../room/RoomManager';
import { RoomStore } from '../room/RoomStore';

describe('RoomManager', () => {
  let store: RoomStore;
  let manager: RoomManager;

  beforeEach(() => {
    store = new RoomStore();
    manager = new RoomManager(store);
  });

  describe('createRoom', () => {
    it('creates a room with the host player', () => {
      const { room, player } = manager.createRoom('ABC12', 'Alice');

      expect(room.code).toBe('ABC12');
      expect(player.username).toBe('Alice');
      expect(player.isHost).toBe(true);
      expect(player.status).toBe('ACTIVE');
      expect(room.players.size).toBe(1);
      expect(room.settings.maxPlayers).toBe(10);
      expect(room.settings.impostorCount).toBe(1);
      // No discussion time by default — host must press "Iniciar votación"
      expect(room.settings.discussionTime).toBe(0);
    });

    it('accepts custom settings', () => {
      const { room } = manager.createRoom('XYZ99', 'Bob', {
        maxPlayers: 6,
        impostorCount: 2,
        discussionTime: 60,
      });

      expect(room.settings.maxPlayers).toBe(6);
      expect(room.settings.impostorCount).toBe(2);
      expect(room.settings.discussionTime).toBe(60);
    });

    it('defaults visibility to "private" when not provided', () => {
      const { room } = manager.createRoom('DEF01', 'Host');
      expect(room.settings.visibility).toBe('private');
    });

    it('defaults hostLocale to "en" when not provided', () => {
      const { room } = manager.createRoom('DEF02', 'Host');
      expect(room.settings.hostLocale).toBe('en');
    });

    it('accepts visibility "public" and "private"', () => {
      const pub = manager.createRoom('DEF03', 'Host', { visibility: 'public' });
      const prv = manager.createRoom('DEF04', 'Host', { visibility: 'private' });
      expect(pub.room.settings.visibility).toBe('public');
      expect(prv.room.settings.visibility).toBe('private');
    });

    it('accepts any of the 6 allowed hostLocales', () => {
      for (const locale of ['en', 'es', 'pt', 'fr', 'it', 'de']) {
        const { room } = manager.createRoom(`LOC${locale}`, 'Host', { hostLocale: locale });
        expect(room.settings.hostLocale).toBe(locale);
      }
    });

    it('rejects invalid visibility with a clear error', () => {
      expect(() =>
        manager.createRoom('BAD01', 'Host', { visibility: 'whisper' as never }),
      ).toThrow(/Invalid visibility/);
    });

    it('rejects invalid hostLocale with a clear error', () => {
      expect(() =>
        manager.createRoom('BAD02', 'Host', { hostLocale: 'jp' }),
      ).toThrow(/Invalid hostLocale/);
    });

    it('throws on visibility but does NOT create the room', () => {
      expect(() =>
        manager.createRoom('BAD03', 'Host', { visibility: 'open' as never }),
      ).toThrow();
      // Room was rejected before persistence
      expect(store.getRoom('BAD03')).toBeUndefined();
    });
  });

  describe('joinRoom', () => {
    it('allows a player to join an existing room', () => {
      manager.createRoom('ABC12', 'Alice');
      const { room, player } = manager.joinRoom(
        'ABC12',
        'Bob',
        'socket-bob',
      );

      expect(player.username).toBe('Bob');
      expect(player.id).toBe('socket-bob');
      expect(player.isHost).toBe(false);
      expect(room.players.size).toBe(2);
    });

    it('rejects join when room is full', () => {
      const { room } = manager.createRoom('ABC12', 'Host', {
        maxPlayers: 3,
      });

      manager.joinRoom('ABC12', 'Player2', 'socket-p2');
      manager.joinRoom('ABC12', 'Player3', 'socket-p3');

      expect(() =>
        manager.joinRoom('ABC12', 'Player4', 'socket-p4'),
      ).toThrow('Room is full');
    });

    it('rejects duplicate username', () => {
      manager.createRoom('ABC12', 'Alice');

      expect(() =>
        manager.joinRoom('ABC12', 'Alice', 'socket-alice2'),
      ).toThrow('Username already taken');
    });

    it('rejects join when room does not exist', () => {
      expect(() =>
        manager.joinRoom('NONEXIST', 'Player', 'socket'),
      ).toThrow('Room not found');
    });

    it('joins as SPECTATOR during an active game (no rejection)', () => {
      const { room } = manager.createRoom('ABC12', 'Host');
      room.gameState = {
        phase: 'DISCUSSION',
        word: 'test',
        category: 'test',
        players: [],
        votes: [],
        roundNumber: 1,
        phaseEndsAt: 0,
        result: null,
        impostorIds: [],
      };

      const result = manager.joinRoom('ABC12', 'LatePlayer', 'socket-late');
      expect(result.player.status).toBe('SPECTATOR');
      expect(result.player.isHost).toBe(false);
      expect(room.players.get('LatePlayer')?.status).toBe('SPECTATOR');
    });

    it('spectator does not count toward the maxPlayers ceiling', () => {
      const { room } = manager.createRoom('ABC12', 'Host', { maxPlayers: 2 });
      room.gameState = {
        phase: 'DISCUSSION',
        word: 'test',
        category: 'test',
        players: [],
        votes: [],
        roundNumber: 1,
        phaseEndsAt: 0,
        result: null,
        impostorIds: [],
      };

      // Add 2 spectators — should be allowed even though maxPlayers=2
      manager.joinRoom('ABC12', 'Late1', 'socket-late1');
      manager.joinRoom('ABC12', 'Late2', 'socket-late2');
      expect(room.players.size).toBe(3);
    });
  });

  describe('leaveRoom', () => {
    it('allows a player to leave and keeps the room', () => {
      manager.createRoom('ABC12', 'Alice');
      manager.joinRoom('ABC12', 'Bob', 'socket-bob');

      const result = manager.leaveRoom('ABC12', 'Bob');
      expect(result.wasLastPlayer).toBe(false);
      expect(store.getRoom('ABC12')).toBeDefined();
    });

    it('transfers host to the longest-standing player when host leaves', () => {
      manager.createRoom('ABC12', 'Alice');
      manager.joinRoom('ABC12', 'Bob', 'socket-bob');
      manager.joinRoom('ABC12', 'Charlie', 'socket-charlie');

      const result = manager.leaveRoom('ABC12', 'Alice');

      expect(result.newHost).toBe('Bob');
      const room = store.getRoom('ABC12')!;
      const bob = room.players.get('Bob');
      expect(bob!.isHost).toBe(true);
    });

    it('destroys room when the last player leaves', () => {
      manager.createRoom('ABC12', 'Alice');

      const result = manager.leaveRoom('ABC12', 'Alice');

      expect(result.wasLastPlayer).toBe(true);
      expect(store.getRoom('ABC12')).toBeUndefined();
    });

    it('throws error when player not found in room', () => {
      manager.createRoom('ABC12', 'Alice');

      expect(() => manager.leaveRoom('ABC12', 'NonExistent')).toThrow(
        'Player not found in room',
      );
    });
  });

  describe('lookup', () => {
    it('getRoom returns the room', () => {
      manager.createRoom('ABC12', 'Alice');
      const room = manager.getRoom('ABC12');
      expect(room.code).toBe('ABC12');
    });

    it('getRoom throws for non-existent room', () => {
      expect(() => manager.getRoom('FAKE')).toThrow('Room not found');
    });

    it('destroyRoom removes the room', () => {
      manager.createRoom('ABC12', 'Alice');
      manager.destroyRoom('ABC12');
      expect(store.getRoom('ABC12')).toBeUndefined();
    });
  });

  describe('findRoomBySocketId', () => {
    it('finds room and player by socket id', () => {
      manager.createRoom('ABC12', 'Alice');
      // The host gets an empty id initially; simulate a real scenario
      const room1 = store.getRoom('ABC12')!;
      const alice = room1.players.get('Alice')!;
      alice.id = 'socket-alice';

      const result = manager.findRoomBySocketId('socket-alice');
      expect(result).not.toBeNull();
      expect(result!.player.username).toBe('Alice');
      expect(result!.room.code).toBe('ABC12');
    });

    it('returns null when socket id not found', () => {
      expect(manager.findRoomBySocketId('unknown')).toBeNull();
    });
  });

  describe('selectImpostors with exclusion (re-rol rule)', () => {
    it('excludes a player who was impostor in both of the last 2 rounds (same ID twice)', () => {
      const { room } = manager.createRoom('RR01', 'Host');
      const host = room.players.get('Host')!;
      host.id = 'host-sid';
      manager.joinRoom('RR01', 'Alice', 'alice');
      manager.joinRoom('RR01', 'Bob', 'bob');
      manager.joinRoom('RR01', 'Carol', 'carol');

      // Alice was impostor in BOTH of the last 2 rounds (same ID in both rounds)
      const picked = manager.selectImpostors(
        Array.from(room.players.values()),
        1,
        [['alice'], ['alice']],
      );
      expect(picked.has('alice')).toBe(false);
    });

    it('excludes BOTH impostors from the last round, regardless of count', () => {
      const { room } = manager.createRoom('RR02', 'Host');
      const host = room.players.get('Host')!;
      host.id = 'host-sid';
      manager.joinRoom('RR02', 'Alice', 'alice');
      manager.joinRoom('RR02', 'Bob', 'bob');
      manager.joinRoom('RR02', 'Carol', 'carol');

      // Last round had [bob, alice] as impostors; both must be excluded
      const picked = manager.selectImpostors(
        Array.from(room.players.values()),
        1,
        [['bob', 'alice']],
      );
      // Only host and carol are candidates
      expect(picked.has('alice')).toBe(false);
      expect(picked.has('bob')).toBe(false);
      expect(picked.has('host-sid') || picked.has('carol')).toBe(true);
    });

    it('drops the oldest round (FIFO) when ALL players were in the last 2 rounds', () => {
      // 3 players, last 2 rounds: every player was impostor → FIFO drops oldest
      const picked = manager.selectImpostors(
        [
          { id: 'a', username: 'A', status: 'ACTIVE' as const, isHost: false, joinedAt: 0 },
          { id: 'b', username: 'B', status: 'ACTIVE' as const, isHost: false, joinedAt: 1 },
          { id: 'c', username: 'C', status: 'ACTIVE' as const, isHost: false, joinedAt: 2 },
        ],
        1,
        [['a', 'b', 'c'], ['a', 'b', 'c']],
      );
      // Oldest round dropped → everyone eligible → 'a' (or any) can be picked
      expect(picked.size).toBe(1);
    });

    it('multi-impostor: FIFO drops the oldest round (a, b) so c and d are eligible', () => {
      // 4 players, last 2 rounds each had 2 impostors. The old flat-list
      // bug would have only excluded the last 2 entries of the flat list,
      // making a and b eligible to be picked again (they were impostors
      // 2 rounds ago). The new per-round logic correctly excludes all 4
      // from the last 2 rounds, then FIFO drops the oldest round [a, b]
      // from the exclusion, leaving c and d as the only candidates.
      const players = [
        { id: 'a', username: 'A', status: 'ACTIVE' as const, isHost: false, joinedAt: 0 },
        { id: 'b', username: 'B', status: 'ACTIVE' as const, isHost: false, joinedAt: 1 },
        { id: 'c', username: 'C', status: 'ACTIVE' as const, isHost: false, joinedAt: 2 },
        { id: 'd', username: 'D', status: 'ACTIVE' as const, isHost: false, joinedAt: 3 },
      ];
      const picked = manager.selectImpostors(
        players,
        2,
        [['a', 'b'], ['c', 'd']],
      );
      // FIFO drops oldest round [a, b] → candidates = {c, d}
      expect(picked.size).toBe(2);
      expect(picked.has('a')).toBe(false);
      expect(picked.has('b')).toBe(false);
      expect(picked.has('c') && picked.has('d')).toBe(true);
    });

    it('returns a valid selection when history is empty (fresh room)', () => {
      const { room } = manager.createRoom('RR04', 'Host');
      const host = room.players.get('Host')!;
      host.id = 'host-sid';
      manager.joinRoom('RR04', 'Alice', 'alice');
      manager.joinRoom('RR04', 'Bob', 'bob');
      manager.joinRoom('RR04', 'Carol', 'carol');

      const picked = manager.selectImpostors(
        Array.from(room.players.values()),
        1,
        [],
      );
      expect(picked.size).toBe(1);
    });
  });

  describe('updateSocketId', () => {
    it('updates a player socket id on reconnect', () => {
      manager.createRoom('ABC12', 'Alice');
      manager.updateSocketId('ABC12', 'Alice', 'new-socket');

      const room = store.getRoom('ABC12')!;
      const alice = room.players.get('Alice')!;
      expect(alice.id).toBe('new-socket');
    });

    it('silently does nothing for non-existent room', () => {
      // Should not throw
      manager.updateSocketId('FAKE', 'Alice', 'socket');
    });
  });
});
