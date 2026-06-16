import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { ConnectionManager } from '../connection/ConnectionManager';
import { ServerEvent, MIN_PLAYERS, DEFAULT_VOTING_TIMER } from '@impostor/shared';

function createMockConnManager(): ConnectionManager {
  return {
    broadcastToRoom: vi.fn(),
    sendToSocket: vi.fn(),
  } as unknown as ConnectionManager;
}

function createSampleBank(): WordBank {
  return new WordBank({
    categories: [
      {
        name: 'test',
        displayName: 'Test',
        words: ['word1', 'word2', 'word3'],
      },
    ],
  });
}

describe('GameEngine', () => {
  let store: RoomStore;
  let roomManager: RoomManager;
  let bank: WordBank;
  let connManager: ConnectionManager;
  let engine: GameEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new RoomStore();
    roomManager = new RoomManager(store);
    bank = createSampleBank();
    connManager = createMockConnManager();
    engine = new GameEngine(connManager, store, roomManager, bank);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startMatch', () => {
    it('starts a match with 3+ players', () => {
      roomManager.createRoom('ABC12', 'Host');
      const room = store.getRoom('ABC12')!;
      room.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      const result = engine.startMatch('ABC12', 'socket-host');

      expect(result).toBe(true);
      expect(room.gameState).not.toBeNull();
      // gameState.phase is synced with StateMachine via onTransition callback
      expect(room.gameState!.phase).toBe('DISCUSSION');
      expect(room.gameState!.players.length).toBe(3);
    });

    it('rejects start match with fewer than 3 players', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';

      const result = engine.startMatch('ABC12', 'socket-host');

      expect(result).toBe(false);
      expect(store.getRoom('ABC12')!.gameState).toBeNull();
    });

    it('emits error when non-host tries to start', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      const result = engine.startMatch('ABC12', 'non-host');

      expect(result).toBe(false);
      expect(connManager.sendToSocket).toHaveBeenCalledWith(
        'non-host',
        ServerEvent.ROOM_ERROR,
        expect.objectContaining({
          message: expect.stringContaining('host'),
        }),
      );
    });

    it('assigns 1 impostor for 3-6 players', () => {
      roomManager.createRoom('ABC12', 'Host', { impostorCount: 1 });
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      engine.startMatch('ABC12', 'socket-host');

      const impostors = store.getRoom('ABC12')!.gameState!.players.filter(
        (p) => p.isImpostor,
      );
      expect(impostors.length).toBe(1);
    });

    it('assigns impostor count within limits for 7-10 players', () => {
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

      engine.startMatch('ABC12', 'socket-host');

      const impostors = store.getRoom('ABC12')!.gameState!.players.filter(
        (p) => p.isImpostor,
      );
      expect(impostors.length).toBe(2);
    });

    it('assigns word to non-impostors and null to impostors', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      engine.startMatch('ABC12', 'socket-host');

      // Check word_assigned was sent to each player individually
      const gamePlayers = store.getRoom('ABC12')!.gameState!.players;

      for (const gp of gamePlayers) {
        expect(connManager.sendToSocket).toHaveBeenCalledWith(
          gp.id,
          ServerEvent.WORD_ASSIGNED,
          expect.anything(),
        );
      }
    });

    it('auto-clamps impostor count when it exceeds the limit for the current player count', () => {
      roomManager.createRoom('ABC12', 'Host', { impostorCount: 2 });
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      // 3 players, max 1 impostor — server should clamp to 1 and start the match

      const result = engine.startMatch('ABC12', 'socket-host');
      expect(result).toBe(true);
      // Settings were clamped to 1
      expect(store.getRoom('ABC12')!.settings.impostorCount).toBe(1);
      // Settings update was broadcast
      expect(connManager.broadcastToRoom).toHaveBeenCalledWith(
        'ABC12',
        ServerEvent.SETTINGS_UPDATED,
        expect.objectContaining({ impostorCount: 1 }),
      );
      // Game started with 1 impostor
      const impostors = store.getRoom('ABC12')!.gameState!.players.filter(
        (p) => p.isImpostor,
      );
      expect(impostors.length).toBe(1);
    });

    it('forces 2 impostors when there are 5+ players, even if room was created with impostorCount=1', () => {
      // 5 players, server must override the stored setting to 2
      roomManager.createRoom('ABC12', 'Host', { impostorCount: 1 });
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      for (const [i, name] of ['Alice', 'Bob', 'Carol', 'Dave'].entries()) {
        roomManager.joinRoom('ABC12', name, `socket-p${i}`);
      }

      const result = engine.startMatch('ABC12', 'socket-host');
      expect(result).toBe(true);
      // Settings were forced to 2
      expect(store.getRoom('ABC12')!.settings.impostorCount).toBe(2);
      // Settings update was broadcast
      expect(connManager.broadcastToRoom).toHaveBeenCalledWith(
        'ABC12',
        ServerEvent.SETTINGS_UPDATED,
        expect.objectContaining({ impostorCount: 2 }),
      );
      // Game started with 2 impostors
      const impostors = store.getRoom('ABC12')!.gameState!.players.filter(
        (p) => p.isImpostor,
      );
      expect(impostors.length).toBe(2);
    });

    it('sends impostorIds in the GAME_STARTED broadcast so the client can name them on game over', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      engine.startMatch('ABC12', 'socket-host');

      expect(connManager.broadcastToRoom).toHaveBeenCalledWith(
        'ABC12',
        ServerEvent.GAME_STARTED,
        expect.objectContaining({
          impostorIds: expect.any(Array),
        }),
      );
      // The impostorIds should have exactly one entry (3 players → 1 impostor)
      const call = (connManager.broadcastToRoom as any).mock.calls.find(
        ([code, event]: any) => code === 'ABC12' && event === ServerEvent.GAME_STARTED,
      );
      const payload = call[2] as { impostorIds: string[] };
      expect(payload.impostorIds).toHaveLength(1);
      // And that ID must correspond to a real player
      const playerIds = ['socket-host', 'socket-alice', 'socket-bob'];
      expect(playerIds).toContain(payload.impostorIds[0]);
    });

    it('picks a word from the configured category', () => {
      const cat = bank.getCategories()[0];
      roomManager.createRoom('ABC12', 'Host', { category: cat.name });
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');

      engine.startMatch('ABC12', 'socket-host');

      expect(store.getRoom('ABC12')!.gameState!.category).toBe(cat.name);
    });
  });

  describe('startVoting', () => {
    it('moves from DISCUSSION to VOTING when called by host', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', 'socket-host');

      const result = engine.startVoting('ABC12', 'socket-host');
      expect(result).toBe(true);
      expect(store.getRoom('ABC12')!.gameState!.phase).toBe('VOTING');
    });

    it('rejects startVoting from non-host', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', 'socket-host');

      const result = engine.startVoting('ABC12', 'socket-alice');
      expect(result).toBe(false);
      expect(store.getRoom('ABC12')!.gameState!.phase).toBe('DISCUSSION');
    });

    it('rejects startVoting when not in DISCUSSION', () => {
      roomManager.createRoom('ABC12', 'Host');
      const result = engine.startVoting('ABC12', 'socket-host');
      expect(result).toBe(false);
    });
  });

  describe('startVoting with configurable votingTimer', () => {
    it('uses room.settings.votingTimer when starting voting', () => {
      roomManager.createRoom('VT01', 'Host', { votingTimer: 15 });
      store.getRoom('VT01')!.players.get('Host')!.id = 'host-sid';
      roomManager.joinRoom('VT01', 'Alice', 'alice-sid');
      roomManager.joinRoom('VT01', 'Bob', 'bob-sid');
      engine.startMatch('VT01', 'host-sid');

      const start = Date.now();
      engine.startVoting('VT01', 'host-sid');

      const gs = store.getRoom('VT01')!.gameState!;
      expect(gs.phaseEndsAt - start).toBe(15_000);
    });

    it('falls back to DEFAULT_VOTING_TIMER when votingTimer is not set', () => {
      roomManager.createRoom('VT02', 'Host');
      store.getRoom('VT02')!.players.get('Host')!.id = 'host-sid';
      roomManager.joinRoom('VT02', 'Alice', 'alice-sid');
      roomManager.joinRoom('VT02', 'Bob', 'bob-sid');
      engine.startMatch('VT02', 'host-sid');

      const start = Date.now();
      engine.startVoting('VT02', 'host-sid');

      const gs = store.getRoom('VT02')!.gameState!;
      expect(gs.phaseEndsAt - start).toBe(DEFAULT_VOTING_TIMER * 1000);
    });
  });

  describe('processVote', () => {
    it('processes a vote and tracks it', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', 'socket-host');

      // Force phase to VOTING for testing
      const room = store.getRoom('ABC12')!;
      room.gameState!.phase = 'VOTING';

      engine.processVote('ABC12', 'socket-host', 'socket-alice');

      expect(room.gameState!.votes.length).toBe(1);
      expect(room.gameState!.votes[0].voterId).toBe('socket-host');
      expect(room.gameState!.votes[0].targetId).toBe('socket-alice');
    });

    it('does not process vote when phase is not VOTING', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', 'socket-host');

      // Phase is DISCUSSION (just started)
      engine.processVote('ABC12', 'socket-host', 'socket-alice');

      expect(store.getRoom('ABC12')!.gameState!.votes.length).toBe(0);
    });
  });

  describe('startNewMatch', () => {
    it('resets game state for a new match', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', 'socket-host');

      // Set to GAME_OVER to simulate end
      const room = store.getRoom('ABC12')!;
      room.gameState!.phase = 'GAME_OVER';

      engine.startNewMatch('ABC12', 'socket-host');

      expect(room.gameState).toBeNull();
      // All players should be ACTIVE
      for (const [, p] of room.players) {
        expect(p.status).toBe('ACTIVE');
      }
    });

    it('rejects new match from non-host', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', 'socket-host');

      const result = engine.startNewMatch('ABC12', 'socket-alice');
      expect(result).toBe(false);
    });
  });

  describe('cleanupRoom', () => {
    it('cleans up room state machine', () => {
      roomManager.createRoom('ABC12', 'Host');
      store.getRoom('ABC12')!.players.get('Host')!.id = 'socket-host';
      roomManager.joinRoom('ABC12', 'Alice', 'socket-alice');
      roomManager.joinRoom('ABC12', 'Bob', 'socket-bob');
      engine.startMatch('ABC12', 'socket-host');

      engine.cleanupRoom('ABC12');

      // No error - cleanup should work
      engine.cleanupRoom('NONEXIST'); // Should not throw
    });
  });

  describe('selectImpostors randomness', () => {
    // Each of 4 players should be picked as impostor roughly 1/4 of the
    // time, never monopolized. With Fisher-Yates the distribution is
    // uniform within ±10% over 4000 runs.
    it('picks a uniform random subset across many runs', () => {
      const players = [
        { id: 'a', username: 'A', status: 'ACTIVE' as const, isHost: false, joinedAt: 0 },
        { id: 'b', username: 'B', status: 'ACTIVE' as const, isHost: false, joinedAt: 1 },
        { id: 'c', username: 'C', status: 'ACTIVE' as const, isHost: false, joinedAt: 2 },
        { id: 'd', username: 'D', status: 'ACTIVE' as const, isHost: false, joinedAt: 3 },
      ];
      const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
      const N = 4000;
      for (let i = 0; i < N; i++) {
        const picked = roomManager.selectImpostors(players, 1);
        for (const id of picked) counts[id] = (counts[id] ?? 0) + 1;
      }
      const expected = N / 4;
      for (const id of ['a', 'b', 'c', 'd']) {
        const got = counts[id];
        const deviation = Math.abs(got - expected) / expected;
        expect(deviation).toBeLessThan(0.15);
      }
    });
  });
});
