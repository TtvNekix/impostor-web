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
      expect(room.settings.discussionTime).toBe(90);
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

    it('rejects join during an active game', () => {
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

      expect(() =>
        manager.joinRoom('ABC12', 'LatePlayer', 'socket-late'),
      ).toThrow('Game already in progress');
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
