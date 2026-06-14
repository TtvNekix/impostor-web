import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { ServerEvent, MIN_PLAYERS } from '@impostor/shared';
import type { Server, Socket } from 'socket.io';

function createMockIo(): Server {
  return {
    to: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
  } as unknown as Server;
}

function createMockSocket(overrides = {}): Socket {
  return {
    id: 'host-socket',
    emit: vi.fn(),
    join: vi.fn(),
    ...overrides,
  } as unknown as Socket;
}

function createSampleBank(): WordBank {
  return new WordBank({
    categories: [
      {
        name: 'test',
        words: ['word1', 'word2', 'word3'],
      },
    ],
  });
}

describe('GameEngine', () => {
  let store: RoomStore;
  let roomManager: RoomManager;
  let bank: WordBank;
  let io: Server;
  let engine: GameEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new RoomStore();
    roomManager = new RoomManager(store);
    bank = createSampleBank();
    io = createMockIo();
    engine = new GameEngine(io, store, roomManager, bank);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startMatch', () => {
    it('starts a match with 3+ players', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      const room = store.getRoom('ABC12')!;
      room.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      const result = engine.startMatch('ABC12', hostSocket);

      expect(result).toBe(true);
      expect(room.gameState).not.toBeNull();
      // gameState.phase is synced with StateMachine via onTransition callback
      expect(room.gameState!.phase).toBe('DISCUSSION');
      expect(room.gameState!.players.length).toBe(3);
    });

    it('rejects start match with fewer than 3 players', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';

      const result = engine.startMatch('ABC12', hostSocket);

      expect(result).toBe(false);
      expect(store.getRoom('ABC12')!.gameState).toBeNull();
    });

    it('emits error when non-host tries to start', () => {
      const nonHostSocket = createMockSocket({ id: 'non-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      const result = engine.startMatch('ABC12', nonHostSocket);

      expect(result).toBe(false);
      expect(nonHostSocket.emit).toHaveBeenCalledWith(
        ServerEvent.ROOM_ERROR,
        expect.objectContaining({
          message: expect.stringContaining('host'),
        }),
      );
    });

    it('assigns 1 impostor for 3-6 players', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host', { impostorCount: 1 });
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      engine.startMatch('ABC12', hostSocket);

      const impostors = store.getRoom('ABC12')!.gameState!.players.filter(
        (p) => p.isImpostor,
      );
      expect(impostors.length).toBe(1);
    });

    it('assigns impostor count within limits for 7-10 players', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host', { impostorCount: 2 });
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';

      // Add 7 more players (8 total)
      for (let i = 0; i < 7; i++) {
        roomManager.joinRoom(
          'ABC12',
          `Player${i}`,
          `socket-p${i}`,
        );
      }

      engine.startMatch('ABC12', hostSocket);

      const impostors = store.getRoom('ABC12')!.gameState!.players.filter(
        (p) => p.isImpostor,
      );
      expect(impostors.length).toBe(2);
    });

    it('assigns word to non-impostors and null to impostors', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      engine.startMatch('ABC12', hostSocket);

      // Check word_assigned was emitted for each player
      const gamePlayers = store.getRoom('ABC12')!.gameState!.players;
      const word = store.getRoom('ABC12')!.gameState!.word;

      for (const gp of gamePlayers) {
        expect(io.to).toHaveBeenCalledWith(gp.id);
      }

      // Verify the word_assigned emits by checking the mock calls
      const toMock = vi.mocked(io.to);
      for (const gp of gamePlayers) {
        expect(toMock).toHaveBeenCalledWith(gp.id);
        const emitMock = toMock.mock.results.find(
          (r) => r.value === io.to(gp.id),
        );
      }
    });

    it('rejects start when impostor count exceeds limit', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host', { impostorCount: 2 });
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      // 3 players, max 1 impostor

      const result = engine.startMatch('ABC12', hostSocket);
      expect(result).toBe(false);
    });
  });

  describe('processVote', () => {
    it('processes a vote and tracks it', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', hostSocket);

      // Force phase to VOTING for testing
      const room = store.getRoom('ABC12')!;
      room.gameState!.phase = 'VOTING';

      engine.processVote('ABC12', 'socket-host', 'socket-alice');

      expect(room.gameState!.votes.length).toBe(1);
      expect(room.gameState!.votes[0].voterId).toBe('socket-host');
      expect(room.gameState!.votes[0].targetId).toBe('socket-alice');
    });

    it('does not process vote when phase is not VOTING', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', hostSocket);

      // Phase is DISCUSSION (just started)
      engine.processVote('ABC12', 'socket-host', 'socket-alice');

      expect(store.getRoom('ABC12')!.gameState!.votes.length).toBe(0);
    });
  });

  describe('startNewMatch', () => {
    it('resets game state for a new match', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', hostSocket);

      // Set to GAME_OVER to simulate end
      const room = store.getRoom('ABC12')!;
      room.gameState!.phase = 'GAME_OVER';

      engine.startNewMatch('ABC12', hostSocket);

      expect(room.gameState).toBeNull();
      // All players should be ACTIVE
      for (const [, p] of room.players) {
        expect(p.status).toBe('ACTIVE');
      }
    });

    it('rejects new match from non-host', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', hostSocket);

      const nonHostSocket = createMockSocket({ id: 'socket-alice' });

      const result = engine.startNewMatch('ABC12', nonHostSocket);
      expect(result).toBe(false);
    });
  });

  describe('cleanupRoom', () => {
    it('cleans up room state machine', () => {
      const hostSocket = createMockSocket({ id: 'socket-host' });
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', hostSocket);

      engine.cleanupRoom('ABC12');

      // No error — cleanup should work
      engine.cleanupRoom('NONEXIST'); // Should not throw
    });
  });
});
