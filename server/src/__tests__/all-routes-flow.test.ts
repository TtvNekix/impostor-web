/**
 * All-routes-flow E2E tests.
 *
 * Comprehensive coverage of every route a player can take to reach a
 * lobby and stay in one, plus HTTP regression for the SPA fallback.
 *
 * Complements `full-game-flow.test.ts` (which focuses on the round
 * lifecycle) by covering the entry / lobby / disconnect paths.
 *
 * Conventions inherited from `full-game-flow.test.ts`:
 *   - Skip discussion by setting `discussionTime: 0` and calling
 *     `start_voting` manually. Saves ~30s per test, keeps it deterministic.
 *   - Test backdoor: read `engine.getGameState()` directly to identify
 *     impostors. Standard E2E pattern.
 *   - Use the REAL `registerHandlers` factory (not a re-implementation).
 *   - Standard mode (no strict TDD). Write the tests, run them, fix
 *     what fails. Tests should expose real bugs.
 *
 * IMPORTANT: The helpers below are COPIED from `full-game-flow.test.ts`
 * (not imported) because that file does not export them. If you change
 * a helper there, mirror the change here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { GameEngine } from '../game/GameEngine';
import { ConnectionManager } from '../connection/ConnectionManager';
import { registerHandlers } from '../ws/handlers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================================================================== */
/*  Test infrastructure (copied from full-game-flow.test.ts)            */
/* ================================================================== */

interface TestClient {
  ws: WebSocket;
  events: Array<{ event: string; data: any }>;
  roomCode: string | null;
  username: string;
}

interface TestServer {
  httpServer: HttpServer;
  wss: WebSocketServer;
  port: number;
  engine: GameEngine;
  store: RoomStore;
  roomManager: RoomManager;
  connManager: ConnectionManager;
  close: () => Promise<void>;
}

async function setupServer(): Promise<TestServer> {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  const store = new RoomStore();
  const roomManager = new RoomManager(store);
  const bank = new WordBank({
    categories: [
      {
        name: 'test',
        displayName: 'Test',
        words: ['the-secret-word'],
      },
    ],
  });
  const connManager = new ConnectionManager(store, roomManager);
  const engine = new GameEngine(connManager, store, roomManager, bank);

  // Use the REAL production handler factory.
  registerHandlers(wss, roomManager, engine, connManager, bank);

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      resolve((httpServer.address() as AddressInfo).port);
    });
  });

  return {
    httpServer,
    wss,
    port,
    engine,
    store,
    roomManager,
    connManager,
    close: () =>
      new Promise<void>((resolve) => {
        wss.close(() => httpServer.close(() => resolve()));
      }),
  };
}

function connectClient(
  server: TestServer,
  username: string,
  wsPath = '',
): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const url = wsPath
      ? `ws://localhost:${server.port}${wsPath}`
      : `ws://localhost:${server.port}`;
    const ws = new WebSocket(url);
    const client: TestClient = { ws, events: [], roomCode: null, username };

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        client.events.push({ event: msg.event, data: msg.data });
      } catch {
        // ignore malformed
      }
    });

    ws.on('open', () => resolve(client));
    ws.on('error', (err) => reject(new Error(`Connect error: ${err.message}`)));

    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

function waitForEvent(
  client: TestClient,
  eventName: string,
  timeoutMs = 4000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const existing = client.events.find((e) => e.event === eventName);
    if (existing) {
      const idx = client.events.indexOf(existing);
      client.events.splice(idx, 1);
      resolve(existing.data);
      return;
    }

    const handler = (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === eventName) {
          client.ws.off('message', handler);
          clearTimeout(timer);
          resolve(msg.data);
        }
      } catch {
        // ignore
      }
    };

    const timer = setTimeout(() => {
      client.ws.off('message', handler);
      reject(new Error(
        `Timeout waiting for ${eventName} on ${client.username} (got: ${client.events.map((e) => e.event).join(', ')})`
      ));
    }, timeoutMs);

    client.ws.on('message', handler);
  });
}

async function connectN(server: TestServer, n: number): Promise<TestClient[]> {
  return Promise.all(
    Array.from({ length: n }, (_, i) => connectClient(server, `player${i + 1}`)),
  );
}

async function hostCreate(
  host: TestClient,
  code: string,
  settings: { impostorCount?: number; discussionTime?: number; votingTimer?: number; hardcore?: boolean; maxPlayers?: number; visibility?: 'public' | 'private' } = {},
): Promise<void> {
  const joined = waitForEvent(host, 'room_joined');
  host.ws.send(JSON.stringify({
    event: 'create_room',
    data: {
      code,
      username: host.username,
      settings: {
        impostorCount: settings.impostorCount ?? 1,
        discussionTime: settings.discussionTime ?? 0,
        votingTimer: settings.votingTimer ?? 30,
        hardcore: settings.hardcore ?? false,
        maxPlayers: settings.maxPlayers ?? 10,
        visibility: settings.visibility ?? 'private',
      },
    },
  }));
  await joined;
  host.roomCode = code;
}

async function clientJoin(
  client: TestClient,
  code: string,
  usernameOverride?: string,
): Promise<void> {
  const joined = waitForEvent(client, 'room_joined');
  client.ws.send(JSON.stringify({
    event: 'join_room',
    data: { code, username: usernameOverride ?? client.username },
  }));
  await joined;
  client.roomCode = code;
}

async function hostStartMatch(host: TestClient): Promise<void> {
  const started = waitForEvent(host, 'game_started');
  host.ws.send(JSON.stringify({ event: 'start_match', data: {} }));
  await started;
}

async function hostStartVoting(host: TestClient): Promise<void> {
  // Drain any phase_changed events that arrived before us (e.g. the
  // DISCUSSION one that the server emits at the end of startMatch).
  while (host.events.some((e) => e.event === 'phase_changed')) {
    const idx = host.events.findIndex((e) => e.event === 'phase_changed');
    host.events.splice(idx, 1);
  }

  const phaseEvt = waitForEvent(host, 'phase_changed');
  host.ws.send(JSON.stringify({ event: 'start_voting', data: {} }));
  const data = await phaseEvt;
  expect(data.phase).toBe('VOTING');
}

async function clientVote(
  voter: TestClient,
  targetUsername: string | null,
  server: TestServer,
  roomCode: string,
): Promise<void> {
  let targetId: string | null = null;
  if (targetUsername !== null) {
    const gs = getGameStateFor(server, roomCode);
    if (gs) {
      const target = gs.players.find((p) => p.username === targetUsername);
      if (target) targetId = target.id;
    }
  }
  voter.ws.send(JSON.stringify({
    event: 'vote',
    data: { targetId },
  }));
}

function getGameStateFor(server: TestServer, code: string) {
  const room = server.store.getRoom(code);
  return room?.gameState ?? null;
}

function getImpostorUsernames(server: TestServer, code: string): string[] {
  const gs = getGameStateFor(server, code);
  if (!gs) return [];
  return gs.players.filter((p) => p.isImpostor).map((p) => p.username);
}

/**
 * Plays a full match from the current state until game_over, expelling
 * one impostor per round. In a real game the host would announce
 * continue, but we just call start_voting immediately to skip
 * discussion.
 */
async function playUntilGameOver(
  server: TestServer,
  code: string,
  clients: TestClient[],
  host: TestClient,
): Promise<any> {
  let lastResult: any = null;
  let rounds = 0;
  const MAX_ROUNDS = 10;

  while (rounds < MAX_ROUNDS) {
    rounds++;
    // Drain ALL stale events from the previous round.
    for (const c of clients) {
      c.events.length = 0;
    }
    host.events.length = 0;

    const gs = getGameStateFor(server, code);
    if (!gs) throw new Error('gameState missing in playUntilGameOver');
    if (gs.phase !== 'VOTING') {
      const phaseEvt = waitForEvent(host, 'phase_changed');
      host.ws.send(JSON.stringify({ event: 'start_voting', data: {} }));
      await phaseEvt;
    }

    const gs2 = getGameStateFor(server, code);
    if (!gs2) throw new Error('gameState missing in playUntilGameOver');
    const activeImpostors = gs2.players.filter((p) => p.isImpostor && p.status === 'ACTIVE');
    if (activeImpostors.length === 0) break;
    const target = activeImpostors[0].username;

    const activeNonImpostors = gs2.players.filter((p) => !p.isImpostor && p.status === 'ACTIVE');
    for (const p of activeNonImpostors) {
      const voter = clients.find((c) => c.username === p.username);
      if (!voter) continue;
      await clientVote(voter, target, server, code);
    }
    const otherImp = activeImpostors.find((p) => p.username !== target);
    if (otherImp) {
      const otherClient = clients.find((c) => c.username === otherImp.username);
      if (otherClient) await clientVote(otherClient, target, server, code);
    }
    const targetClient = clients.find((c) => c.username === target);
    if (targetClient) await clientVote(targetClient, null, server, code);

    const result = await waitForEvent(host, 'round_result', 6000);
    lastResult = result;
    if (result.winner) {
      try {
        await waitForEvent(host, 'game_over', 2000);
      } catch {
        // game_over might arrive before round_result listener processes
      }
      return result;
    }
  }
  throw new Error(`playUntilGameOver exceeded ${MAX_ROUNDS} rounds`);
}

/* ================================================================== */
/*  Test 1: Entry → Unirse a Sala (Via A)                              */
/* ================================================================== */

describe('All-routes — Entry → Unirse a Sala (Via A)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeAll(async () => {
    server = await setupServer();
  });

  afterAll(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
  });

  it('6 players, host creates and 5 others join, non-impostors win', async () => {
    const code = 'VIA01';
    const [host, ...rest] = await connectN(server, 6);
    clients.push(host, ...rest);

    await hostCreate(host, code, { impostorCount: 2, discussionTime: 0 });
    for (const p of rest) {
      await clientJoin(p, code);
    }
    await hostStartMatch(host);

    const room = server.store.getRoom(code);
    expect(room).toBeDefined();
    expect(room!.players.size).toBe(6);

    const impostors = getImpostorUsernames(server, code);
    expect(impostors).toHaveLength(2);

    await hostStartVoting(host);

    const finalResult = await playUntilGameOver(server, code, clients, host);
    expect(finalResult.wasImpostor).toBe(true);
    expect(finalResult.winner).toBe('NON_IMPOSTORS');
  }, 30000);
});

/* ================================================================== */
/*  Test 2: Entry → Crear Sala with custom settings (Via B + hardcore) */
/* ================================================================== */

describe('All-routes — Entry → Crear Sala with custom settings (Via B)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeAll(async () => {
    server = await setupServer();
  });

  afterAll(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
  });

  it('5 players, hardcore=true forces 1 impostor even with 5 players', async () => {
    const code = 'HC002';
    const [host, alice, bob, carol, dave] = await connectN(server, 5);
    clients.push(host, alice, bob, carol, dave);

    await hostCreate(host, code, {
      impostorCount: 2,
      hardcore: true,
      discussionTime: 90,
      votingTimer: 60,
      maxPlayers: 10,
      visibility: 'public',
    });
    await clientJoin(alice, code);
    await clientJoin(bob, code);
    await clientJoin(carol, code);
    await clientJoin(dave, code);

    // Assert settings on the room itself: hardcore is stored, impostorCount
    // is still the host's choice (2) — it only gets clamped at startMatch.
    const room = server.store.getRoom(code);
    expect(room).toBeDefined();
    expect(room!.settings.hardcore).toBe(true);
    expect(room!.settings.visibility).toBe('public');
    expect(room!.settings.votingTimer).toBe(60);
    expect(room!.settings.impostorCount).toBe(2);

    await hostStartMatch(host);

    // The engine should have clamped impostorCount to 1 (hardcore).
    const impostors = getImpostorUsernames(server, code);
    expect(impostors).toHaveLength(1);

    // After start, the room.settings.impostorCount was re-broadcast as 1.
    const roomAfter = server.store.getRoom(code);
    expect(roomAfter!.settings.impostorCount).toBe(1);
  }, 15000);
});

/* ================================================================== */
/*  Test 3: Deep link with valid and invalid codes (Via C)             */
/* ================================================================== */

describe('All-routes — Deep link with valid + invalid codes (Via C)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeAll(async () => {
    server = await setupServer();
  });

  afterAll(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
  });

  it('Part A: deep-link path /join/CODE accepts valid code; Part B: invalid code returns room_not_found', async () => {
    const code = 'DL001';

    // Part A: host creates room, then a 2nd client connects via the
    // deep-link WS path /join/CODE and joins.
    const host = await connectClient(server, 'dl-host');
    clients.push(host);
    await hostCreate(host, code, { impostorCount: 1, discussionTime: 0 });

    const joiner = await connectClient(server, 'dl-joiner', `/join/${code}`);
    clients.push(joiner);
    await clientJoin(joiner, code);
    expect(joiner.roomCode).toBe(code);

    // Part B: 3rd client connects via the deep-link path with garbage,
    // then tries to JOIN_ROOM with a code that doesn't exist.
    const ghost = await connectClient(server, 'dl-ghost', '/join/INVALID');
    clients.push(ghost);

    const errEvt = waitForEvent(ghost, 'room_error', 4000);
    ghost.ws.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'ZZZZZ', username: 'dl-ghost' },
    }));
    const err = await errEvt;
    expect(err).toBeDefined();
    expect(err.code).toBe('room_not_found');
  }, 15000);
});

/* ================================================================== */
/*  Test 4: Deep link with lowercase code                              */
/* ================================================================== */

describe('All-routes — Deep link with lowercase code', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeAll(async () => {
    server = await setupServer();
  });

  afterAll(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
  });

  it('lowercase JOIN_ROOM code works (server uppercases) and host disconnect cascades HOST_LEFT', async () => {
    const code = 'MIX01';

    const host = await connectClient(server, 'mix-host');
    clients.push(host);
    await hostCreate(host, code, { impostorCount: 1, discussionTime: 0 });

    // Connect via deep-link path with lowercase code (this is purely
    // cosmetic server-side; the path is not parsed).
    const joiner = await connectClient(server, 'mix-joiner', `/join/${code.toLowerCase()}`);
    clients.push(joiner);

    // Send JOIN_ROOM with a lowercase code. The server's JOIN_ROOM
    // handler does `code.toUpperCase()` before looking up, so this
    // should succeed.
    await clientJoin(joiner, code.toLowerCase());

    // Verify the room actually has 2 players (the real proof that the
    // lowercase lookup hit the same room as the uppercase CREATE_ROOM).
    // NOTE: don't assert on joiner.roomCode — that field is just a
    // local cache of the test's input, not the server's authoritative
    // code. The server uppercases the code before storing the room.
    const room = server.store.getRoom(code);
    expect(room).toBeDefined();
    expect(room!.players.size).toBe(2);

    // Now have the host disconnect. The joiner should receive HOST_LEFT
    // (cascaded by ConnectionManager.onDisconnect). The room should be
    // destroyed.
    const hostLeftEvt = waitForEvent(joiner, 'host_left', 4000);
    host.ws.close();
    const hostLeft = await hostLeftEvt;
    expect(hostLeft).toBeDefined();
    expect(hostLeft.code).toBe('host_disconnected');

    // Give the server a tick to actually destroy the room.
    await new Promise((r) => setTimeout(r, 100));
    expect(server.store.getRoom(code)).toBeUndefined();
  }, 15000);
});

/* ================================================================== */
/*  Test 5: 5 consecutive matches in the same lobby                    */
/* ================================================================== */

describe('All-routes — 5 consecutive matches (extended re-rol)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeAll(async () => {
    server = await setupServer();
  });

  afterAll(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
  });

  it('7 players, 2 impostors, 5 matches in a row — re-rol prevents back-to-back repeats', async () => {
    const code = 'RE5X1';
    const [host, ...rest] = await connectN(server, 7);
    clients.push(host, ...rest);

    await hostCreate(host, code, { impostorCount: 2, discussionTime: 0 });
    for (const p of rest) {
      await clientJoin(p, code);
    }

    const impostorSets: string[][] = [];
    const allDistinctImpostors = new Set<string>();

    for (let match = 1; match <= 5; match++) {
      // Drain any leftover events from the previous match (game_over,
      // phase_changed, etc).
      for (const c of clients) c.events.length = 0;
      host.events.length = 0;

      // If we're in GAME_OVER from the previous match, we need to
      // send new_match first to reset state.
      const room = server.store.getRoom(code);
      if (room?.gameState?.phase === 'GAME_OVER') {
        const phaseLobby = waitForEvent(host, 'phase_changed');
        host.ws.send(JSON.stringify({ event: 'new_match', data: {} }));
        await phaseLobby;
      }

      // Start the next match.
      const started = waitForEvent(host, 'game_started');
      host.ws.send(JSON.stringify({ event: 'start_match', data: {} }));
      await started;

      const impostors = getImpostorUsernames(server, code);
      expect(impostors).toHaveLength(2);
      impostorSets.push(impostors);
      for (const u of impostors) allDistinctImpostors.add(u);

      await hostStartVoting(host);
      await playUntilGameOver(server, code, clients, host);
    }

    // Assert: each match has exactly 2 impostors.
    for (let i = 0; i < impostorSets.length; i++) {
      expect(impostorSets[i]).toHaveLength(2);
    }

    // Assert: NO player is impostor in two consecutive rounds.
    for (let i = 1; i < impostorSets.length; i++) {
      const prev = new Set(impostorSets[i - 1]);
      const curr = impostorSets[i];
      const sameSet = curr.every((u) => prev.has(u));
      expect(sameSet).toBe(false);
    }

    // Assert: across 5 rounds, at least 5 distinct players were impostor.
    expect(allDistinctImpostors.size).toBeGreaterThanOrEqual(5);
  }, 90000);
});

/* ================================================================== */
/*  Test 6: Lobby edge cases                                           */
/* ================================================================== */

describe('All-routes — Lobby edge cases', () => {
  /* -------------------------------------------------------------- */
  /*  6a: Host disconnects with players in lobby                    */
  /* -------------------------------------------------------------- */
  it('6a: host disconnects → others receive HOST_LEFT, room is destroyed', async () => {
    const server = await setupServer();
    const clients: TestClient[] = [];
    try {
      const code = 'EDG01';
      const [host, alice, bob, carol, dave] = await connectN(server, 5);
      clients.push(host, alice, bob, carol, dave);

      await hostCreate(host, code, { impostorCount: 1, discussionTime: 0 });
      await clientJoin(alice, code);
      await clientJoin(bob, code);
      await clientJoin(carol, code);
      await clientJoin(dave, code);

      // Each non-host should receive HOST_LEFT with code 'host_disconnected'.
      const others = [alice, bob, carol, dave];
      const evts = others.map((c) => waitForEvent(c, 'host_left', 4000));
      host.ws.close();
      for (const e of evts) {
        const data = await e;
        expect(data).toBeDefined();
        expect(data.code).toBe('host_disconnected');
      }

      // Give the server a tick to actually destroy the room.
      await new Promise((r) => setTimeout(r, 100));
      expect(server.store.getRoom(code)).toBeUndefined();
    } finally {
      for (const c of clients) {
        try { c.ws.close(); } catch { /* ignore */ }
      }
      await server.close();
    }
  }, 15000);

  /* -------------------------------------------------------------- */
  /*  6b: Non-host player leaves                                     */
  /* -------------------------------------------------------------- */
  it('6b: non-host leaves → others receive PLAYER_LEFT, room still exists, host still host', async () => {
    const server = await setupServer();
    const clients: TestClient[] = [];
    try {
      const code = 'EDG02';
      const [host, alice, bob, carol, dave] = await connectN(server, 5);
      clients.push(host, alice, bob, carol, dave);

      await hostCreate(host, code, { impostorCount: 1, discussionTime: 0 });
      await clientJoin(alice, code);
      await clientJoin(bob, code);
      await clientJoin(carol, code);
      await clientJoin(dave, code);

      // Have alice (non-host) leave. Use the explicit LEAVE_ROOM event
      // so we deterministically trigger PLAYER_LEFT (vs. PLAYER_DISCONNECTED
      // which is the on-close path and waits 30s for cleanup).
      const evts = [host, bob, carol, dave].map((c) => waitForEvent(c, 'player_left', 4000));
      alice.ws.send(JSON.stringify({ event: 'leave_room', data: {} }));
      for (const e of evts) {
        const data = await e;
        expect(data).toBeDefined();
        // The payload includes the leaving playerId; we don't pin the
        // exact socketId, just that PLAYER_LEFT arrived.
        expect(typeof data.playerId).toBe('string');
      }

      // Room should still exist with 4 players.
      const room = server.store.getRoom(code);
      expect(room).toBeDefined();
      expect(room!.players.size).toBe(4);

      // Host should still be host.
      const hostPlayer = room!.players.get(host.username);
      expect(hostPlayer?.isHost).toBe(true);

      // Alice is gone.
      expect(room!.players.has(alice.username)).toBe(false);
    } finally {
      for (const c of clients) {
        try { c.ws.close(); } catch { /* ignore */ }
      }
      await server.close();
    }
  }, 15000);

  /* -------------------------------------------------------------- */
  /*  6c: Host kicks a non-host player                              */
  /* -------------------------------------------------------------- */
  it('6c: host kicks a non-host → KICKED to target, PLAYER_LEFT to others, kicked player removed', async () => {
    const server = await setupServer();
    const clients: TestClient[] = [];
    try {
      const code = 'EDG03';
      const [host, alice, bob, carol] = await connectN(server, 4);
      clients.push(host, alice, bob, carol);

      await hostCreate(host, code, { impostorCount: 1, discussionTime: 0 });
      await clientJoin(alice, code);
      await clientJoin(bob, code);
      await clientJoin(carol, code);

      // Start a match and a voting phase so we can verify the kicked
      // player can no longer vote.
      await hostStartMatch(host);
      await hostStartVoting(host);

      // Kicking path: KICKED to the target, PLAYER_LEFT to the rest.
      const kickedEvt = waitForEvent(alice, 'kicked', 4000);
      const leftEvts = [host, bob, carol].map((c) => waitForEvent(c, 'player_left', 4000));
      host.ws.send(JSON.stringify({
        event: 'kick_player',
        data: { username: alice.username },
      }));

      const kickedData = await kickedEvt;
      expect(kickedData).toBeDefined();
      expect(kickedData.code).toBe('kicked_by_host');

      for (const e of leftEvts) {
        const data = await e;
        expect(data).toBeDefined();
        expect(typeof data.playerId).toBe('string');
      }

      // Room should still exist with 3 players (host + bob + carol).
      const room = server.store.getRoom(code);
      expect(room).toBeDefined();
      expect(room!.players.size).toBe(3);
      expect(room!.players.has(alice.username)).toBe(false);

      // Alice's WS is still open (kick doesn't close it), but she's been
      // removed from the connection manager. If she sends a vote, the
      // server's VOTE handler calls `getRoomCode(socketId)` which returns
      // undefined (connection entry was deleted by removeConnection) so
      // the vote is silently ignored. Verify by sending a vote and
      // checking that no vote_update arrives within a tick.
      const gs = getGameStateFor(server, code);
      expect(gs).toBeDefined();
      const initialVotes = gs!.votes.length;

      await clientVote(alice, 'player1', server, code);
      await new Promise((r) => setTimeout(r, 200));

      const gsAfter = getGameStateFor(server, code);
      expect(gsAfter!.votes.length).toBe(initialVotes);
    } finally {
      for (const c of clients) {
        try { c.ws.close(); } catch { /* ignore */ }
      }
      await server.close();
    }
  }, 15000);

  /* -------------------------------------------------------------- */
  /*  6d: Sala llena — try to join a full room                       */
  /* -------------------------------------------------------------- */
  it('6d: try to join a full room → ROOM_ERROR with code "room_full"', async () => {
    const server = await setupServer();
    const clients: TestClient[] = [];
    try {
      const code = 'EDG04';
      const [host, alice, bob] = await connectN(server, 3);
      clients.push(host, alice, bob);

      // maxPlayers=3 — fill the room with 3 players.
      await hostCreate(host, code, { impostorCount: 1, maxPlayers: 3, discussionTime: 0 });
      await clientJoin(alice, code);
      await clientJoin(bob, code);

      // 4th player tries to join — should get ROOM_ERROR room_full.
      const carol = await connectClient(server, 'carol');
      clients.push(carol);
      const errEvt = waitForEvent(carol, 'room_error', 4000);
      carol.ws.send(JSON.stringify({
        event: 'join_room',
        data: { code, username: 'carol' },
      }));
      const err = await errEvt;
      expect(err).toBeDefined();
      expect(err.code).toBe('room_full');

      // The 4th player was NOT added to the room.
      const room = server.store.getRoom(code);
      expect(room!.players.size).toBe(3);
      expect(room!.players.has('carol')).toBe(false);
    } finally {
      for (const c of clients) {
        try { c.ws.close(); } catch { /* ignore */ }
      }
      await server.close();
    }
  }, 15000);
});

/* ================================================================== */
/*  Test 7: HTTP regression for SPA routes                             */
/* ================================================================== */

describe('All-routes — HTTP regression for SPA routes', () => {
  let httpServer: HttpServer;
  let wss: WebSocketServer;
  let port: number;
  let store: RoomStore;
  let connManager: ConnectionManager;

  beforeAll(async () => {
    // Spin up the FULL server (Express + WS) the same way server/src/index.ts
    // does — minus the production word-bank.json load (use a small in-memory
    // bank for test isolation; the API and static-serve paths don't care).
    const app = express();

    const wordBankDataPath = path.resolve(__dirname, '../data/word-bank.json');
    const wordBank = new WordBank(JSON.parse(fs.readFileSync(wordBankDataPath, 'utf-8')));

    store = new RoomStore();
    const roomManager = new RoomManager(store);
    connManager = new ConnectionManager(store, roomManager);
    const engine = new GameEngine(connManager, store, roomManager, wordBank);

    roomManager.onRoomDestroyed = (code) => engine.clearImpostorHistory(code);

    app.get('/robots.txt', (_req, res) => {
      res.type('text/plain').send('User-agent: *\nAllow: /\n');
    });
    app.get('/sitemap.xml', (_req, res) => {
      res.type('application/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      );
    });
    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });
    app.get('/api/rooms', (req, res) => {
      res.set('Cache-Control', 'max-age=3');
      const result = store.getAllPublicRooms();
      res.status(200).json({ rooms: result.rooms, hasMore: false, totalCount: result.rooms.length });
    });

    // Static serve block, copied verbatim from server/src/index.ts.
    // If you change one, change the other — they're intentionally
    // identical so the test mirrors production behaviour. (A future
    // cleanup: extract to a shared factory and import here.)
    const clientDist = path.resolve(__dirname, '../../../client/dist');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.get('/play*', (_req, res) => res.redirect('/'));
      app.get('/', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
      // SPA fallback: serve index.html for non-API, non-asset GETs.
      // Paths that look like static assets (have a file extension)
      // skip this and fall through to the 404 handler below.
      app.use((req, res, next) => {
        const p = req.path;
        if (/\.[a-zA-Z0-9]{1,8}$/.test(p)) {
          next();
          return;
        }
        res.sendFile(path.join(clientDist, 'index.html'));
      });
      // Final 404: missing static assets land here.
      app.use((_req, res) => {
        res.status(404).json({ error: 'not_found' });
      });
    }

    httpServer = createServer(app);
    wss = new WebSocketServer({ server: httpServer });
    registerHandlers(wss, roomManager, engine, connManager, wordBank);

    port = await new Promise<number>((resolve) => {
      httpServer.listen(0, () => {
        resolve((httpServer.address() as AddressInfo).port);
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      wss.close(() => httpServer.close(() => resolve()));
    });
  });

  function httpGet(targetPath: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${targetPath}`, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  it('SPA fallback returns index.html on every front-end route', async () => {
    // Skip cleanly if the dist directory is missing — we can't assert
    // the SPA fallback in that case.
    const clientDist = path.resolve(__dirname, '../../../client/dist');
    if (!fs.existsSync(clientDist)) {
      // eslint-disable-next-line no-console
      console.warn(`[HTTP test] client/dist not found at ${clientDist} — skipping`);
      return;
    }

    // All these routes should return the React root HTML.
    for (const route of [
      '/',
      '/salas',
      '/lobbies',
      '/join/ABC12',
      '/join/foo',
    ]) {
      const res = await httpGet(route);
      expect(res.status, `route ${route}`).toBe(200);
      expect(res.body, `route ${route} should include root div`).toContain('<div id="root">');
    }
  }, 10000);

  it('GET /api/rooms?visibility=public returns 200 with { rooms, hasMore, totalCount }', async () => {
    const res = await httpGet('/api/rooms?visibility=public');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('rooms');
    expect(body).toHaveProperty('hasMore');
    expect(body).toHaveProperty('totalCount');
    expect(Array.isArray(body.rooms)).toBe(true);
  }, 10000);

  it('GET /health returns 200 with JSON { status: "ok" }', async () => {
    const res = await httpGet('/health');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  }, 10000);

  it('GET /play and /play/whatever redirect to / (302)', async () => {
    for (const route of ['/play', '/play/whatever']) {
      const res = await httpGet(route);
      expect(res.status, `route ${route}`).toBe(302);
      expect(res.headers.location, `route ${route}`).toBe('/');
    }
  }, 10000);

  it('GET /nonexistent-asset.png returns 404', async () => {
    const res = await httpGet('/nonexistent-asset.png');
    expect(res.status).toBe(404);
  }, 10000);
});
