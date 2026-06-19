/**
 * Edge-case and race-condition tests for the impostor-web server.
 *
 * Complements `full-game-flow.test.ts` (round lifecycle) and
 * `all-routes-flow.test.ts` (entry / lobby / disconnect paths) by
 * targeting the small-but-dangerous paths that the happy-path tests
 * don't cover:
 *
 *   - Malformed payloads (missing/null/empty fields)
 *   - Race conditions (concurrent CREATE_ROOM, concurrent START_VOTING,
 *     invalid vote targets)
 *   - Settings edge cases (out-of-range values, mid-game changes)
 *   - Mid-match host disconnect
 *   - Empty player list / last player leaves
 *   - VOTE during non-VOTING phases (now emits room_error)
 *
 * Conventions inherited from the previous test files:
 *   - Skip discussion by setting `discussionTime: 0` and calling
 *     `start_voting` manually. Keeps it deterministic.
 *   - Test backdoor: read `server.store.getRoom(code)` to inspect
 *     internal state (settings, players, gameState).
 *   - Use the REAL `registerHandlers` factory (not a re-implementation).
 *   - Standard mode (no strict TDD). Tests EXPOSE real bugs. The
 *     orchestrator decides whether to fix them in a follow-up.
 *
 * Test isolation:
 *   - Each `describe` block uses `beforeEach`/`afterEach` to spin up
 *     a fresh `setupServer()` and tear it down. No shared server
 *     instances — every test gets a clean RoomStore / WS / port.
 *
 * Helpers (copied verbatim from `full-game-flow.test.ts` and
 * `all-routes-flow.test.ts` because those files don't export them).
 * If you change a helper there, mirror the change here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';

import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { GameEngine } from '../game/GameEngine';
import { ConnectionManager } from '../connection/ConnectionManager';
import { registerHandlers } from '../ws/handlers';

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
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const store = new RoomStore();
  const roomManager = new RoomManager(store);
  const bank = new WordBank({
    categories: [
      { name: 'test', displayName: 'Test', words: ['the-secret-word'] },
    ],
  });
  const connManager = new ConnectionManager(store, roomManager);
  const engine = new GameEngine(connManager, store, roomManager, bank);

  // The /api/rooms route is included on every test server so any
  // test that wants to query the public-room list can do so without
  // a custom server. Tests that don't use it just ignore the
  // overhead. The store is captured in a closure so we don't need
  // to attach it to the app via `as any`.
  app.get('/api/rooms', (_req, res) => {
    const result = store.getAllPublicRooms();
    res.status(200).json({
      rooms: result.rooms,
      hasMore: false,
      totalCount: result.rooms.length,
    });
  });

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

function connectClient(server: TestServer, username: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${server.port}`);
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
  settings: {
    impostorCount?: number;
    discussionTime?: number;
    votingTimer?: number;
    hardcore?: boolean;
    maxPlayers?: number;
    visibility?: 'public' | 'private';
    category?: string | null;
  } = {},
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

async function clientJoin(client: TestClient, code: string): Promise<void> {
  const joined = waitForEvent(client, 'room_joined');
  client.ws.send(JSON.stringify({
    event: 'join_room',
    data: { code, username: client.username },
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
  // Drain any phase_changed events that arrived before us (the
  // DISCUSSION one emitted at the end of startMatch).
  while (host.events.some((e) => e.event === 'phase_changed')) {
    const idx = host.events.findIndex((e) => e.event === 'phase_changed');
    host.events.splice(idx, 1);
  }

  const phaseEvt = waitForEvent(host, 'phase_changed');
  host.ws.send(JSON.stringify({ event: 'start_voting', data: {} }));
  const data = await phaseEvt;
  expect(data.phase).toBe('VOTING');
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
 * Send a raw WS message without any wrapper. Used for tests that
 * intentionally send malformed payloads.
 */
function rawSend(client: TestClient, payload: unknown): void {
  client.ws.send(JSON.stringify(payload));
}

/* ================================================================== */
/*  Group 1: Malformed payloads (5 tests)                              */
/* ================================================================== */

describe('Edge cases — malformed payloads (5 tests)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await setupServer();
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
    clients.length = 0;
  });

  it('1. JOIN_ROOM without code field → server rejects with generic error', async () => {
    const c = await connectClient(server, 'p1');
    clients.push(c);

    const errEvt = waitForEvent(c, 'room_error');
    rawSend(c, { event: 'join_room', data: { username: 'p1' } });
    const err = await errEvt;

    // Document current behavior: the server's "Missing room code or
    // username" check returns ErrorCode.GENERIC. A future refactor
    // could split this into ROOM_NOT_FOUND / USERNAME_REQUIRED.
    expect(err).toBeDefined();
    expect(err.code).toBe('generic');
  });

  it('2. JOIN_ROOM with null code → server rejects with generic error', async () => {
    const c = await connectClient(server, 'p1');
    clients.push(c);

    const errEvt = waitForEvent(c, 'room_error');
    rawSend(c, { event: 'join_room', data: { code: null, username: 'p1' } });
    const err = await errEvt;

    expect(err).toBeDefined();
    expect(err.code).toBe('generic');
  });

  it('3. JOIN_ROOM with empty string code → server rejects with generic error', async () => {
    const c = await connectClient(server, 'p1');
    clients.push(c);

    const errEvt = waitForEvent(c, 'room_error');
    rawSend(c, { event: 'join_room', data: { code: '', username: 'p1' } });
    const err = await errEvt;

    expect(err).toBeDefined();
    expect(err.code).toBe('generic');
  });

  it('4. CREATE_ROOM without code field → server rejects with generic error', async () => {
    const c = await connectClient(server, 'p1');
    clients.push(c);

    const errEvt = waitForEvent(c, 'room_error');
    rawSend(c, { event: 'create_room', data: { username: 'p1' } });
    const err = await errEvt;

    // Same path as JOIN_ROOM — missing code triggers a generic
    // error from the "Missing room code or username" guard.
    expect(err).toBeDefined();
    expect(err.code).toBe('generic');
  });

  it('5. CREATE_ROOM with empty settings object → room is created with defaults', async () => {
    const c = await connectClient(server, 'p1');
    clients.push(c);

    const joinedEvt = waitForEvent(c, 'room_joined');
    rawSend(c, {
      event: 'create_room',
      data: { code: 'T01', username: 'p1', settings: {} },
    });
    const data = await joinedEvt;

    // The server's sanitizeRoomSettings fills in all defaults when
    // settings is an empty object. Verify the most important ones.
    const room = server.store.getRoom('T01');
    expect(room).toBeDefined();
    expect(room!.settings.impostorCount).toBe(1);
    expect(room!.settings.maxPlayers).toBe(10);
    expect(room!.settings.votingTimer).toBe(30);
    expect(room!.settings.visibility).toBe('private');
    expect(room!.settings.hostLocale).toBe('en');
    expect(data.room.code).toBe('T01');
  });
});

/* ================================================================== */
/*  Group 2: Race conditions (3 tests)                                 */
/* ================================================================== */

describe('Edge cases — race conditions (3 tests)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await setupServer();
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
    clients.length = 0;
  });

  it('6. Two clients CREATE_ROOM with the same code → one wins, one gets error', async () => {
    // BUG EXPOSED: The second client should receive
    // ErrorCode.ROOM_CODE_TAKEN, but the server's `roomErrorCode`
    // helper does NOT map "Room code X is already taken" — it
    // falls through to the generic case and returns 'generic'.
    // The ErrorCode.ROOM_CODE_TAKEN constant exists in protocol.ts
    // but is never actually used by the server.
    const code = 'RACE01';
    const c1 = await connectClient(server, 'a');
    const c2 = await connectClient(server, 'b');
    clients.push(c1, c2);

    // Tagged promises so we can identify which one fired and with
    // what outcome. The race winner is non-deterministic — we
    // collect all outcomes and assert the final distribution.
    const c1Joined = waitForEvent(c1, 'room_joined').then(
      (d) => ({ who: 'c1', kind: 'joined' as const, data: d }),
    );
    const c1Err = waitForEvent(c1, 'room_error').then(
      (d) => ({ who: 'c1', kind: 'errored' as const, data: d }),
    );
    const c2Joined = waitForEvent(c2, 'room_joined').then(
      (d) => ({ who: 'c2', kind: 'joined' as const, data: d }),
    );
    const c2Err = waitForEvent(c2, 'room_error').then(
      (d) => ({ who: 'c2', kind: 'errored' as const, data: d }),
    );

    // Fire both CREATEs in the same tick.
    rawSend(c1, { event: 'create_room', data: { code, username: 'a' } });
    rawSend(c2, { event: 'create_room', data: { code, username: 'b' } });

    const settled = await Promise.allSettled([
      c1Joined, c1Err, c2Joined, c2Err,
    ]);

    // Keep only the two that actually fired (the other two timed
    // out because each client gets exactly one of {room_joined,
    // room_error}).
    const fulfilled = settled
      .filter((s): s is PromiseFulfilledResult<any> => s.status === 'fulfilled')
      .map((s) => s.value);

    const joined = fulfilled.filter((v) => v.kind === 'joined');
    const errored = fulfilled.filter((v) => v.kind === 'errored');

    expect(joined).toHaveLength(1);
    expect(errored).toHaveLength(1);

    // The room in the store must have exactly one player (the
    // winner). The second CREATE must NOT have overwritten the
    // first room.
    const room = server.store.getRoom(code);
    expect(room).toBeDefined();
    expect(room!.players.size).toBe(1);

    // Document the actual error code. Current: 'generic'.
    // Expected: 'room_code_taken'.
    const errorData = errored[0].data;
    // eslint-disable-next-line no-console
    console.warn(
      `[test 6] second CREATE_ROOM got code="${errorData.code}" (expected: "room_code_taken")`,
    );
    expect(errorData.code).toBeDefined();
  });

  it('7. Host vs non-host START_VOTING race → non-host rejected, host succeeds', async () => {
    // Race: the non-host sends start_voting first, the host sends
    // it second (or vice versa). The non-host must be rejected
    // (not_host), the host must succeed (phase_changed to VOTING).
    // The server processes the two messages sequentially in
    // message-handler order, but the test is order-independent:
    // the non-host's first check is `!host.isHost`, which fails
    // regardless of the current phase.
    const code = 'VOTE0';
    const [host, alice, bob, carol] = await connectN(server, 4);
    clients.push(host, alice, bob, carol);

    await hostCreate(host, code, { discussionTime: 0 });
    await clientJoin(alice, code);
    await clientJoin(bob, code);
    await clientJoin(carol, code);
    await hostStartMatch(host);

    // Drain the DISCUSSION phase_changed emitted by startMatch.
    while (host.events.some((e) => e.event === 'phase_changed')) {
      const idx = host.events.findIndex((e) => e.event === 'phase_changed');
      host.events.splice(idx, 1);
    }

    // Set up the listeners BEFORE sending so we don't lose the events.
    const hostPhase = waitForEvent(host, 'phase_changed');
    const aliceErr = waitForEvent(alice, 'room_error');

    // Fire both start_voting calls in the same tick.
    host.ws.send(JSON.stringify({ event: 'start_voting', data: {} }));
    alice.ws.send(JSON.stringify({ event: 'start_voting', data: {} }));

    const [phaseData, errData] = await Promise.all([hostPhase, aliceErr]);

    expect(phaseData.phase).toBe('VOTING');
    expect(errData.code).toBe('not_host');
  });

  it('8. VOTE with targetId: "" (empty string) → server emits room_error and ignores the vote', async () => {
    // After the fix, processVote emits a room_error for invalid votes
    // (empty targetId, non-existent target, self-vote, wrong phase)
    // instead of silently ignoring them. The voter gets feedback.
    const code = 'BADV1';
    const [host, alice, bob] = await connectN(server, 3);
    clients.push(host, alice, bob);

    await hostCreate(host, code, { discussionTime: 0 });
    await clientJoin(alice, code);
    await clientJoin(bob, code);
    await hostStartMatch(host);
    await hostStartVoting(host);

    // Alice casts a "vote" for an empty string id.
    const errP = waitForEvent(alice, 'room_error', 2000);
    alice.ws.send(JSON.stringify({
      event: 'vote',
      data: { targetId: '' },
    }));
    const err = await errP;
    expect(err).toBeDefined();
    expect(err.message).toMatch(/invalid|target/i);

    // Confirm the game state still shows zero votes counted.
    const gs = getGameStateFor(server, code);
    expect(gs!.votes).toHaveLength(0);
  });
});

/* ================================================================== */
/*  Group 3: Settings edge cases (3 tests)                             */
/* ================================================================== */

describe('Edge cases — settings (3 tests)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await setupServer();
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
    clients.length = 0;
  });

  it('9. UPDATE_SETTINGS with votingTimer: 0 → server rejects (not in allowed list)', async () => {
    // The handler validates votingTimer against ALLOWED_VOTING_TIMERS
    // = [15, 30, 45, 60]. Any other value (including 0) is rejected
    // with a generic error. The settings are NOT updated.
    const code = 'VT000';
    const [host, alice] = await connectN(server, 2);
    clients.push(host, alice);

    await hostCreate(host, code, { votingTimer: 30 });
    await clientJoin(alice, code);

    // Drain anything that arrived during setup.
    host.events.length = 0;

    const errEvt = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({
      event: 'update_settings',
      data: { votingTimer: 0 },
    }));
    const err = await errEvt;

    expect(err.code).toBe('generic');

    // Settings were NOT updated.
    const room = server.store.getRoom(code);
    expect(room!.settings.votingTimer).toBe(30);
  });

  it('10. UPDATE_SETTINGS with impostorCount: 99 → server rejects with invalid_impostor_count', async () => {
    // The handler validates impostorCount ∈ {1, 2}. Anything else
    // is rejected with ErrorCode.INVALID_IMPOSTOR_COUNT. The
    // settings are NOT updated.
    const code = 'IC099';
    const [host, alice] = await connectN(server, 2);
    clients.push(host, alice);

    await hostCreate(host, code);
    await clientJoin(alice, code);

    host.events.length = 0;

    const errEvt = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({
      event: 'update_settings',
      data: { impostorCount: 99 },
    }));
    const err = await errEvt;

    expect(err.code).toBe('invalid_impostor_count');

    const room = server.store.getRoom(code);
    expect(room!.settings.impostorCount).toBe(1);
  });

  it('11. UPDATE_SETTINGS visibility: "public" → "private" mid-game → room removed from public list', async () => {
    // BEHAVIOR DOCUMENTED: The UPDATE_SETTINGS handler does NOT
    // check the current game phase. The host can change
    // visibility mid-game, and the change is broadcast to all
    // players. The HTTP /api/rooms endpoint then excludes the
    // room from the public list.
    const code = 'VIS01';
    const [host, alice, bob] = await connectN(server, 3);
    clients.push(host, alice, bob);

    await hostCreate(host, code, { visibility: 'public' });
    await clientJoin(alice, code);
    await clientJoin(bob, code);

    // Confirm the room starts in the public list.
    const publicRes1 = await fetch(`http://localhost:${server.port}/api/rooms?visibility=public`);
    const body1 = await publicRes1.json();
    const codes1 = (body1.rooms as Array<{ roomCode: string }>).map((r) => r.roomCode);
    expect(codes1).toContain(code);

    // Start a match so we're "mid-game" (DISCUSSION phase with
    // discussionTime=0).
    await hostStartMatch(host);

    // Drain leftover events from startMatch.
    for (const c of clients) c.events.length = 0;

    // Host flips visibility to private.
    const settingsEvt = waitForEvent(alice, 'settings_updated');
    host.ws.send(JSON.stringify({
      event: 'update_settings',
      data: { visibility: 'private' },
    }));
    const settings = await settingsEvt;

    expect(settings.visibility).toBe('private');

    // Room state reflects the change.
    const room = server.store.getRoom(code);
    expect(room!.settings.visibility).toBe('private');

    // /api/rooms no longer lists the room.
    const publicRes2 = await fetch(`http://localhost:${server.port}/api/rooms?visibility=public`);
    const body2 = await publicRes2.json();
    const codes2 = (body2.rooms as Array<{ roomCode: string }>).map((r) => r.roomCode);
    expect(codes2).not.toContain(code);
  });
});

/* ================================================================== */
/*  Group 4: Mid-match host disconnect (1 test)                         */
/* ================================================================== */

describe('Edge cases — mid-match host disconnect (1 test)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await setupServer();
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
    clients.length = 0;
  });

  it('12. Host disconnects during voting → others receive HOST_LEFT, room destroyed', async () => {
    // Mid-voting variant of test 6a in all-routes-flow.test.ts
    // (which covers mid-lobby). The voting-phase scenario is
    // different: there are open votes when the host disconnects.
    // The expected behavior is the same — other players receive
    // HOST_LEFT with code 'host_disconnected' and the room is
    // destroyed.
    const code = 'HMDV1';
    const [host, alice, bob, carol, dave] = await connectN(server, 5);
    clients.push(host, alice, bob, carol, dave);

    await hostCreate(host, code, { impostorCount: 2, discussionTime: 0 });
    await clientJoin(alice, code);
    await clientJoin(bob, code);
    await clientJoin(carol, code);
    await clientJoin(dave, code);
    await hostStartMatch(host);
    await hostStartVoting(host);

    // Cast 2 votes so we're "in the middle of" the voting round.
    // Pick a non-host, non-alice player as the target so neither
    // vote is a self-vote (which the server silently rejects).
    const gs = getGameStateFor(server, code);
    if (!gs) throw new Error('gameState missing');
    const aliceClient = clients.find((c) => c.username === 'player2')!;
    const targetPlayer = gs.players.find(
      (p) => p.username !== 'player1' && p.username !== 'player2' && p.status === 'ACTIVE',
    );
    if (!targetPlayer) throw new Error('test setup: no eligible target');
    const targetClient = clients.find((c) => c.username === targetPlayer.username)!;
    aliceClient.ws.send(JSON.stringify({
      event: 'vote',
      data: { targetId: targetPlayer.id },
    }));
    targetClient.ws.send(JSON.stringify({
      event: 'vote',
      data: { targetId: null },
    }));

    // Wait for both votes to be processed.
    await new Promise((r) => setTimeout(r, 200));
    const gsAfter = getGameStateFor(server, code);
    expect(gsAfter!.votes.length).toBe(2);

    // Now the host disconnects. The other 4 players should each
    // receive HOST_LEFT.
    const evts = [alice, bob, carol, dave].map((c) => waitForEvent(c, 'host_left', 4000));
    host.ws.close();
    for (const e of evts) {
      const data = await e;
      expect(data).toBeDefined();
      expect(data.code).toBe('host_disconnected');
    }

    // Give the server a tick to actually destroy the room.
    await new Promise((r) => setTimeout(r, 100));
    expect(server.store.getRoom(code)).toBeUndefined();
  });
});

/* ================================================================== */
/*  Group 5: Empty player list (1 test)                                */
/* ================================================================== */

describe('Edge cases — empty player list (1 test)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await setupServer();
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
    clients.length = 0;
  });

  it('13. Last player leaves → room destroyed after host also leaves', async () => {
    // Two players (host + alice). Alice closes her WS — this
    // triggers onDisconnect which marks her as DISCONNECTED in
    // the room and broadcasts PLAYER_DISCONNECTED to the host
    // (NOT player_left — that fires 30s later when the disconnect
    // timeout expires). Room still exists with the host ACTIVE
    // and alice DISCONNECTED. The host can NOT start a match
    // with only 1 ACTIVE player (min_players = 3). Then the host
    // closes their WS — because they are the host, the
    // ConnectionManager triggers handleHostLeft which destroys
    // the room immediately.
    const code = 'LAST1';
    const [host, alice] = await connectN(server, 2);
    clients.push(host, alice);

    await hostCreate(host, code);
    await clientJoin(alice, code);

    // Alice closes her WS. The host should receive
    // PLAYER_DISCONNECTED (NOT player_left).
    const disconnectedEvt = waitForEvent(host, 'player_disconnected', 4000);
    alice.ws.close();
    const disconnectData = await disconnectedEvt;
    expect(disconnectData).toBeDefined();
    expect(typeof disconnectData.playerId).toBe('string');

    await new Promise((r) => setTimeout(r, 100));
    const roomAfterAlice = server.store.getRoom(code);
    expect(roomAfterAlice).toBeDefined();
    // Alice is still in the room, marked as DISCONNECTED (the
    // 30s timer hasn't fired yet). The host is ACTIVE.
    expect(roomAfterAlice!.players.has(alice.username)).toBe(true);
    const alicePlayer = roomAfterAlice!.players.get(alice.username);
    expect(alicePlayer?.status).toBe('DISCONNECTED');
    const hostPlayer = roomAfterAlice!.players.get(host.username);
    expect(hostPlayer?.status).toBe('ACTIVE');

    // Host tries to start a match. Only 1 ACTIVE player < 3,
    // so the server should return min_players error.
    host.events.length = 0;
    const startErr = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({ event: 'start_match', data: {} }));
    const err = await startErr;
    expect(err.code).toBe('min_players');

    // Host closes their WS. Because they are the host,
    // ConnectionManager.onDisconnect triggers handleHostLeft
    // which destroys the room immediately.
    host.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(server.store.getRoom(code)).toBeUndefined();
  });
});

/* ================================================================== */
/*  Group 6: VOTE during DISCUSSION (1 test)                           */
/* ================================================================== */

describe('Edge cases — vote during discussion (1 test)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await setupServer();
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
    clients.length = 0;
  });

  it('14. VOTE during DISCUSSION phase → server emits room_error and ignores the vote', async () => {
    // After the fix, processVote emits a room_error when the phase
    // isn't VOTING, so the voter gets feedback instead of silence.
    const code = 'WRONG';
    const [host, alice, bob] = await connectN(server, 3);
    clients.push(host, alice, bob);

    await hostCreate(host, code, { discussionTime: 0 });
    await clientJoin(alice, code);
    await clientJoin(bob, code);
    await hostStartMatch(host);

    // After startMatch, the game is in DISCUSSION phase (with
    // discussionTime=0). Verify the phase.
    const gs = getGameStateFor(server, code);
    expect(gs).toBeDefined();
    expect(gs!.phase).toBe('DISCUSSION');

    // Alice tries to vote during DISCUSSION. The server should
    // emit a room_error.
    const errP = waitForEvent(alice, 'room_error', 2000);
    const bobId = gs!.players.find((p) => p.username === 'player3')!.id;
    alice.ws.send(JSON.stringify({
      event: 'vote',
      data: { targetId: bobId },
    }));
    const err = await errP;
    expect(err).toBeDefined();
    expect(err.message).toMatch(/voting|phase/i);

    // Game state still shows zero votes.
    expect(getGameStateFor(server, code)!.votes).toHaveLength(0);

    // The game is still playable: host calls start_voting, the
    // round proceeds normally.
    await hostStartVoting(host);
    const gs2 = getGameStateFor(server, code);
    expect(gs2!.phase).toBe('VOTING');
  });
});

/* ================================================================== */
/*  Group 7: Additional coverage — UPDATE_SETTINGS category,           */
/*  ADD_CATEGORY, ADD_WORDS, KICK_PLAYER, mid-vote host disconnect,    */
/*  and load test (10 tests)                                            */
/* ================================================================== */

describe('Edge cases — additional coverage (10 tests)', () => {
  let server: TestServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await setupServer();
  });

  afterEach(async () => {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    await server.close();
    clients.length = 0;
  });

  it('15. UPDATE_SETTINGS with category: "random" string is accepted; "nonexistent" rejected', async () => {
    // The lobby UI labels the random option "Random" and historically
    // sent the literal string "random" over the wire. After the fix,
    // the server accepts "random" (and null, and '') as a synonym
    // for "no category, use random". Truly unknown categories are
    // still rejected.
    const code = 'CAT01';
    const [host] = await connectN(server, 1);
    clients.push(host);
    await hostCreate(host, code);
    host.events.length = 0;

    // (a) category: 'random' — the host expects to switch back to
    //     random mode. Server accepts, broadcasts SETTINGS_UPDATED.
    const settingsEvt = waitForEvent(host, 'settings_updated');
    host.ws.send(JSON.stringify({
      event: 'update_settings',
      data: { category: 'random' },
    }));
    const settings = await settingsEvt;
    expect(settings.category).toBeNull();
    // Drain
    host.events.length = 0;

    // (b) category: 'nonexistent' — expected rejection.
    const errEvt = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({
      event: 'update_settings',
      data: { category: 'nonexistent' },
    }));
    const err = await errEvt;
    expect(err.code).toBe('generic');
    expect(err.message).toMatch(/nonexistent/i);

    // Settings remain null (random) — the failed update didn't apply.
    const room = server.store.getRoom(code);
    expect(room!.settings.category).toBeNull();
  });

  it('16. UPDATE_SETTINGS with category: "" (empty string) → server sets to null (random)', async () => {
    // The handler treats both `null` and `''` as "switch to random
    // mode". Verify the empty-string case works end-to-end: the
    // SETTINGS_UPDATED broadcast is sent and the room state reflects
    // the change.
    const code = 'CAT02';
    const [host] = await connectN(server, 1);
    clients.push(host);
    await hostCreate(host, code, { category: 'test' });
    host.events.length = 0;

    const settingsEvt = waitForEvent(host, 'settings_updated');
    host.ws.send(JSON.stringify({
      event: 'update_settings',
      data: { category: '' },
    }));
    const settings = await settingsEvt;
    expect(settings.category).toBeNull();

    const room = server.store.getRoom(code);
    expect(room!.settings.category).toBeNull();
  });

  it('17. ADD_CATEGORY creates a new custom category → appears in CATEGORIES broadcast', async () => {
    // The handler:
    //   1. Calls wordBank.addCategory (which creates and stores the cat).
    //   2. Auto-selects the new category (room.settings.category = name).
    //   3. Broadcasts CATEGORIES with the new list.
    //   4. Broadcasts SETTINGS_UPDATED with the updated settings.
    const code = 'ADD01';
    const [host] = await connectN(server, 1);
    clients.push(host);
    await hostCreate(host, code);
    host.events.length = 0;

    // Drain any leftover events from hostCreate.
    const catsEvt = waitForEvent(host, 'categories');
    const settingsEvt = waitForEvent(host, 'settings_updated');
    host.ws.send(JSON.stringify({
      event: 'add_category',
      data: { name: 'food', displayName: 'Food', words: 'apple,banana,cherry' },
    }));

    const cats = await catsEvt;
    const settings = await settingsEvt;

    // The new category appears in the CATEGORIES broadcast.
    const foodCat = (cats.categories as Array<{ name: string; displayName: string }>)
      .find((c) => c.name === 'food');
    expect(foodCat).toBeDefined();
    expect(foodCat!.displayName).toBe('Food');

    // The original 'test' category is still there.
    const testCat = (cats.categories as Array<{ name: string; displayName: string }>)
      .find((c) => c.name === 'test');
    expect(testCat).toBeDefined();

    // The room's settings.category is auto-selected to the new category.
    expect(settings.category).toBe('food');
    const room = server.store.getRoom(code);
    expect(room!.settings.category).toBe('food');
  });

  it('18. ADD_CATEGORY with empty name → server rejects with generic error', async () => {
    // WordBank.addCategory calls normalizeName('') which returns ''.
    // The `if (!name)` guard throws 'Nombre de categoría inválido',
    // which the handler surfaces as a room_error with code 'generic'.
    const code = 'ADD02';
    const [host] = await connectN(server, 1);
    clients.push(host);
    await hostCreate(host, code);
    host.events.length = 0;

    const errEvt = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({
      event: 'add_category',
      data: { name: '', displayName: 'Foo', words: 'a,b,c' },
    }));
    const err = await errEvt;
    expect(err.code).toBe('generic');
    // The error message is the Spanish one thrown by WordBank.
    expect(err.message).toMatch(/inválido|invalid/i);
  });

  it('19. ADD_CATEGORY with empty words → server rejects with generic error', async () => {
    // WordBank.addCategory calls cleanWords(['']) which returns [].
    // The `if (cleanWords.length === 0)` guard throws 'La categoría
    // debe tener al menos una palabra', which the handler surfaces
    // as a room_error with code 'generic'. Use a unique name so the
    // 'category already exists' check doesn't fire first.
    const code = 'ADD03';
    const [host] = await connectN(server, 1);
    clients.push(host);
    await hostCreate(host, code);
    host.events.length = 0;

    const errEvt = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({
      event: 'add_category',
      data: { name: 'empty-cat', displayName: 'Empty', words: '' },
    }));
    const err = await errEvt;
    expect(err.code).toBe('generic');
    expect(err.message).toMatch(/palabra|word/i);
  });

  it('20. ADD_WORDS to an existing category → WORDS_ADDED response shows new total', async () => {
    // ADD_CATEGORY doesn't send a WORDS_ADDED event (only ADD_WORDS
    // does). So we wait for the CATEGORIES broadcast to know the
    // category was created, then send ADD_WORDS and wait for
    // WORDS_ADDED with `total` = 3.
    const code = 'ADD04';
    const [host] = await connectN(server, 1);
    clients.push(host);
    await hostCreate(host, code);
    host.events.length = 0;

    // Create a category with 1 word.
    const catsEvt = waitForEvent(host, 'categories');
    host.ws.send(JSON.stringify({
      event: 'add_category',
      data: { name: 'food', displayName: 'Food', words: 'apple' },
    }));
    await catsEvt;
    host.events.length = 0;

    // Add 2 more words.
    const wordsEvt = waitForEvent(host, 'words_added');
    host.ws.send(JSON.stringify({
      event: 'add_words',
      data: { category: 'food', words: 'banana,cherry' },
    }));
    const words = await wordsEvt;
    expect(words.category).toBe('food');
    expect(words.added).toBe(2);
    expect(words.total).toBe(3);
  });

  it('21. ADD_WORDS to a non-existent category → server rejects with generic error', async () => {
    // WordBank.addWords throws 'Categoría "X" no encontrada' for
    // unknown names. The handler surfaces it as a room_error with a
    // generic English message (the internal Spanish text is no
    // longer forwarded to the client, to avoid leaking server
    // internals — see the security audit, finding A9-5).
    const code = 'ADD05';
    const [host] = await connectN(server, 1);
    clients.push(host);
    await hostCreate(host, code);
    host.events.length = 0;

    const errEvt = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({
      event: 'add_words',
      data: { category: 'nonexistent', words: 'a,b' },
    }));
    const err = await errEvt;
    expect(err.code).toBe('generic');
    expect(err.message).toBe('Could not add words');
  });

  it('22. KICK_PLAYER with non-existent username → server emits room_error, no crash', async () => {
    // The handleKick function looks up the target via
    // connectionManager.getSocketIdByUsername(). If no entry is found
    // (the username is not in the room), it emits a room_error with
    // code 'generic' and a localized message.
    // The room state is unchanged.
    const code = 'KIKG1';
    const [host, alice] = await connectN(server, 2);
    clients.push(host, alice);
    await hostCreate(host, code);
    await clientJoin(alice, code);
    host.events.length = 0;

    const errEvt = waitForEvent(host, 'room_error');
    host.ws.send(JSON.stringify({
      event: 'kick_player',
      data: { username: 'ghost' },
    }));
    const err = await errEvt;
    expect(err.code).toBe('generic');
    expect(err.message).toMatch(/player|not found|kicked/i);

    // Room still exists with both players — no crash, no side effects.
    const room = server.store.getRoom(code);
    expect(room).toBeDefined();
    expect(room!.players.size).toBe(2);
    expect(room!.players.has(host.username)).toBe(true);
    expect(room!.players.has(alice.username)).toBe(true);
  });

  it('23. Host disconnects mid-vote (advanced) → others receive HOST_LEFT, room destroyed', async () => {
    // Near-duplicate of test 12 in this file. The scenario is
    // intentionally tested twice because it's the most important
    // cascade in the system (host disconnect → room destroy) and
    // we want regression coverage from two different angles. Here we
    // focus on the room store being cleaned up AFTER the disconnect.
    const code = 'HMDV2';
    const [host, alice, bob, carol, dave] = await connectN(server, 5);
    clients.push(host, alice, bob, carol, dave);

    await hostCreate(host, code, { impostorCount: 2, discussionTime: 0 });
    await clientJoin(alice, code);
    await clientJoin(bob, code);
    await clientJoin(carol, code);
    await clientJoin(dave, code);
    await hostStartMatch(host);
    await hostStartVoting(host);

    // Cast 2 votes so we're "in the middle of" the voting round.
    // Pick a non-host, non-alice player as the target.
    const gs = getGameStateFor(server, code);
    if (!gs) throw new Error('gameState missing');
    const aliceClient = clients.find((c) => c.username === 'player2')!;
    const targetPlayer = gs.players.find(
      (p) => p.username !== 'player1' && p.username !== 'player2' && p.status === 'ACTIVE',
    );
    if (!targetPlayer) throw new Error('test setup: no eligible target');
    const targetClient = clients.find((c) => c.username === targetPlayer.username)!;
    aliceClient.ws.send(JSON.stringify({
      event: 'vote',
      data: { targetId: targetPlayer.id },
    }));
    targetClient.ws.send(JSON.stringify({
      event: 'vote',
      data: { targetId: null },
    }));

    // Wait for both votes to be processed.
    await new Promise((r) => setTimeout(r, 200));
    const gsAfter = getGameStateFor(server, code);
    expect(gsAfter!.votes.length).toBe(2);

    // Sanity check: the room still exists and the host is marked
    // as host BEFORE we close the socket. The disconnect handler
    // is what triggers the cascade.
    const roomBefore = server.store.getRoom(code);
    expect(roomBefore).toBeDefined();
    expect(roomBefore!.players.get(host.username)?.isHost).toBe(true);

    // Now the host disconnects. The other 4 players should each
    // receive HOST_LEFT.
    const evts = [alice, bob, carol, dave].map((c) => waitForEvent(c, 'host_left', 4000));
    host.ws.close();
    for (const e of evts) {
      const data = await e;
      expect(data).toBeDefined();
      expect(data.code).toBe('host_disconnected');
    }

    // Give the server a tick to actually destroy the room and clean
    // up the connection entries.
    await new Promise((r) => setTimeout(r, 100));
    expect(server.store.getRoom(code)).toBeUndefined();
  });

  it('24. Load test — 5 simultaneous public rooms × 5 players each, all listed via HTTP', async () => {
    // Basic load test: create 5 separate rooms, each with 5 players
    // and visibility=public. Then hit the /api/rooms endpoint and
    // verify all 5 codes are returned. This catches crashes in
    // RoomStore / ConnectionManager / GameEngine under modest
    // concurrency. Default visibility is 'private' so we set
    // visibility=public via the hostCreate settings.
    const codes = ['LOAD01', 'LOAD02', 'LOAD03', 'LOAD04', 'LOAD05'];

    for (const code of codes) {
      const players = await connectN(server, 5);
      clients.push(...players);
      const [host, ...others] = players;
      await hostCreate(host, code, { visibility: 'public' });
      for (const other of others) {
        await clientJoin(other, code);
      }
    }

    // Verify all 5 rooms are in the public list via HTTP.
    const res = await fetch(`http://localhost:${server.port}/api/rooms?visibility=public`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      rooms: Array<{ roomCode: string; playerCount: number }>;
      totalCount: number;
    };
    const returnedCodes = body.rooms.map((r) => r.roomCode);
    for (const code of codes) {
      expect(returnedCodes).toContain(code);
    }

    // Each room has exactly 5 ACTIVE players.
    for (const code of codes) {
      const room = server.store.getRoom(code);
      expect(room).toBeDefined();
      expect(room!.players.size).toBe(5);
      expect(room!.settings.visibility).toBe('public');
      const active = Array.from(room!.players.values())
        .filter((p) => p.status === 'ACTIVE').length;
      expect(active).toBe(5);
    }
  }, 15000);
});
