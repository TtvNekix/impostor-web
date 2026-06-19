import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import { ALLOWED_LOCALES } from '@impostor/shared';

import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { GameEngine } from '../game/GameEngine';
import { ConnectionManager } from '../connection/ConnectionManager';

/**
 * A thin handler that wires a raw WebSocket server to our game engine.
 */
function createTestServer() {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  const store = new RoomStore();
  const roomManager = new RoomManager(store);
  const bank = new WordBank({
    categories: [
      {
        name: 'test',
        displayName: 'Test',
        words: ['integration-word'],
      },
    ],
  });
  const connManager = new ConnectionManager(store, roomManager);
  const engine = new GameEngine(connManager, store, roomManager, bank);

  const socketIdMap = new Map<WebSocket, string>();

  wss.on('connection', (ws) => {
    const socketId = randomUUID();
    socketIdMap.set(ws, socketId);

    ws.send(JSON.stringify({ event: 'connected', data: { id: socketId } }));

    ws.on('message', (raw: Buffer) => {
      let msg: { event: string; data: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const { event, data } = msg;

      switch (event) {
        case 'create_room': {
          const { code, username, settings } = data as {
            code: string;
            username: string;
            settings?: Record<string, unknown>;
          };
          try {
            const { room, player } = roomManager.createRoom(
              code,
              username,
              settings as any,
            );
            player.id = socketId;
            connManager.register(socketId, ws, room.code, username);
            ws.send(JSON.stringify({
              event: 'room_joined',
              data: {
                room: {
                  code: room.code,
                  settings: room.settings,
                  players: Array.from(room.players.values()),
                  gameState: null,
                  createdAt: room.createdAt,
                },
              },
            }));
          } catch (err: any) {
            ws.send(JSON.stringify({
              event: 'room_error',
              data: { message: err.message },
            }));
          }
          break;
        }

        case 'join_room': {
          const { code, username } = data as { code: string; username: string };
          try {
            const { room, player } = roomManager.joinRoom(
              code,
              username,
              socketId,
            );
            connManager.register(socketId, ws, room.code, username);
            connManager.broadcastToRoom(room.code, 'player_joined', { player });
            ws.send(JSON.stringify({
              event: 'room_joined',
              data: {
                room: {
                  code: room.code,
                  settings: room.settings,
                  players: Array.from(room.players.values()),
                  gameState: room.gameState,
                  createdAt: room.createdAt,
                },
              },
            }));
          } catch (err: any) {
            ws.send(JSON.stringify({
              event: 'room_error',
              data: { message: err.message },
            }));
          }
          break;
        }

        case 'start_match': {
          const roomCode = connManager.getRoomCode(socketId);
          if (roomCode) {
            engine.startMatch(roomCode, socketId);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      socketIdMap.delete(ws);
      connManager.onDisconnect(socketId);
    });

    ws.on('error', () => {
      socketIdMap.delete(ws);
      connManager.onDisconnect(socketId);
    });
  });

  return new Promise<{
    httpServer: HttpServer;
    wss: WebSocketServer;
    port: number;
  }>((resolve) => {
    httpServer.listen(0, () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({ httpServer, wss, port });
    });
  });
}

function connect(serverPort: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', (err) => {
      reject(new Error(`Connect error: ${err.message}`));
    });
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

function waitForEvent(
  ws: WebSocket,
  event: string,
  timeoutMs = 4000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeoutMs);

    const handler = (raw: Buffer, _isBinary: boolean) => {
      let msg: { event: string; data: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.event === event) {
        ws.off('message', handler);
        clearTimeout(timer);
        resolve(msg.data);
      }
    };

    ws.on('message', handler);
  });
}

describe('Integration: WebSocket game lifecycle', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  const clients: WebSocket[] = [];

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(() => {
    for (const c of clients) {
      try {
        c.close();
      } catch {
        // ignore close errors
      }
    }
    server.wss.close();
    server.httpServer.close();
  });

  it('creates a room and joins with 3 players', async () => {
    const host = await connect(server.port);
    clients.push(host);

    const alice = await connect(server.port);
    clients.push(alice);

    const bob = await connect(server.port);
    clients.push(bob);

    // Host creates room
    const hostJoined = waitForEvent(host, 'room_joined');
    host.send(JSON.stringify({
      event: 'create_room',
      data: { code: 'INT01', username: 'Host' },
    }));
    const hostData = await hostJoined;
    expect(hostData).toBeDefined();
    expect(hostData.room.code).toBe('INT01');
    expect(hostData.room.players.length).toBe(1);
    expect(Array.isArray(hostData.room.players)).toBe(true);

    // Alice joins
    const aliceJoined = waitForEvent(alice, 'room_joined');
    alice.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'INT01', username: 'Alice' },
    }));
    const aliceData = await aliceJoined;
    expect(aliceData).toBeDefined();
    expect(aliceData.room.players.length).toBe(2);

    // Bob joins
    const bobJoined = waitForEvent(bob, 'room_joined');
    bob.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'INT01', username: 'Bob' },
    }));
    const bobData = await bobJoined;
    expect(bobData.room.players.length).toBe(3);
  }, 20000);

  it('starts a match with 3 players', async () => {
    const host = await connect(server.port);
    clients.push(host);

    const alice = await connect(server.port);
    clients.push(alice);

    const bob = await connect(server.port);
    clients.push(bob);

    // Create room
    const hostJoined = waitForEvent(host, 'room_joined');
    host.send(JSON.stringify({
      event: 'create_room',
      data: { code: 'MTCH1', username: 'Host' },
    }));
    await hostJoined;

    // Alice joins
    const aliceJoined = waitForEvent(alice, 'room_joined');
    alice.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'MTCH1', username: 'Alice' },
    }));
    await aliceJoined;

    // Bob joins
    const bobJoined = waitForEvent(bob, 'room_joined');
    bob.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'MTCH1', username: 'Bob' },
    }));
    await bobJoined;

    // Start match — expect game_started and phase_changed
    const gameStarted = waitForEvent(host, 'game_started');
    host.send(JSON.stringify({ event: 'start_match', data: {} }));
    const gsData = await gameStarted;
    expect(gsData).toBeDefined();
    expect(gsData.roundNumber).toBe(1);
    expect(gsData.category).toBe('test');
  }, 20000);

  it('rejects joining a full room', async () => {
    const host = await connect(server.port);
    clients.push(host);

    const hostJoined = waitForEvent(host, 'room_joined');
    host.send(JSON.stringify({
      event: 'create_room',
      data: { code: 'FULL1', username: 'Host', settings: { maxPlayers: 3 } },
    }));
    await hostJoined;

    const alice = await connect(server.port);
    clients.push(alice);

    const aliceJoined = waitForEvent(alice, 'room_joined');
    alice.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'FULL1', username: 'Alice' },
    }));
    await aliceJoined;

    const carol = await connect(server.port);
    clients.push(carol);

    const carolJoined = waitForEvent(carol, 'room_joined');
    carol.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'FULL1', username: 'Carol' },
    }));
    await carolJoined;

    // Fourth player should get an error (room now at maxPlayers = 3)
    const bob = await connect(server.port);
    clients.push(bob);

    const errorEvt = waitForEvent(bob, 'room_error');
    bob.send(JSON.stringify({
      event: 'join_room',
      data: { code: 'FULL1', username: 'Bob' },
    }));
    const errData = await errorEvt;
    expect(errData).toBeDefined();
    expect(errData.message).toBeTruthy();
  }, 20000);
});

/* -------------------------------------------------------------------- */
/*  GET /api/rooms — HTTP route tests                                    */
/* -------------------------------------------------------------------- */

/**
 * Spin up a minimal Express + http server wired with the same /api/rooms
 * route as production (inline copy of the handler logic so we don't have
 * to refactor the route into a separate export).
 */
function createPublicRoomsTestServer() {
  const store = new RoomStore();

  const app = express();
  app.get('/api/rooms', (req, res) => {
    res.set('Cache-Control', 'max-age=3');

    const visibility = String(req.query.visibility ?? 'public');
    if (visibility !== 'public') {
      res.status(200).json({ rooms: [], hasMore: false, totalCount: 0 });
      return;
    }

    const lang = req.query.lang;
    const hasSpaceParam = req.query.hasSpace;
    const langFilter = typeof lang === 'string' && (ALLOWED_LOCALES as readonly string[]).includes(lang)
      ? lang : null;
    const hasSpaceFilter = hasSpaceParam === 'true' || hasSpaceParam === '1';

    const result = store.getAllPublicRooms();
    let rooms = result.rooms;
    if (langFilter !== null) rooms = rooms.filter((r) => r.hostLocale === langFilter);
    if (hasSpaceFilter) rooms = rooms.filter((r) => r.playerCount < r.maxPlayers);
    res.status(200).json({ rooms, hasMore: false, totalCount: rooms.length });
  });

  return new Promise<{ store: RoomStore; port: number; close: () => Promise<void> }>((resolve) => {
    const httpServer = createServer(app);
    httpServer.listen(0, () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        store,
        port,
        close: () => new Promise<void>((closeResolve) => {
          httpServer.close(() => closeResolve());
        }),
      });
    });
  });
}

import * as http from 'node:http';

function httpGetJson(port: number, path: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: any }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let body: any = null;
        try { body = JSON.parse(raw); } catch { body = raw; }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

describe('GET /api/rooms', () => {
  let server: Awaited<ReturnType<typeof createPublicRoomsTestServer>>;

  beforeEach(async () => {
    server = await createPublicRoomsTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns 200 with empty list when no public rooms exist', async () => {
    const res = await httpGetJson(server.port, '/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.rooms).toEqual([]);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.totalCount).toBe(0);
  });

  it('returns 200 with populated list and the agreed DTO shape', async () => {
    const code = 'POP01';
    const room = server.store.createRoom(code, {
      maxPlayers: 10, impostorCount: 1, discussionTime: 0,
      category: 'animals', votingTimer: 30, hardcore: false,
      visibility: 'public', hostLocale: 'es',
    });
    room.players.set('Alice', {
      id: 's1', username: 'Alice', status: 'ACTIVE', isHost: true, joinedAt: 0,
    });

    const res = await httpGetJson(server.port, '/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.rooms).toHaveLength(1);
    const found = res.body.rooms[0];
    expect(found.roomCode).toBe(code);
    expect(Object.keys(found).sort()).toEqual([
      'ageSeconds', 'category', 'hostLocale', 'hostTag',
      'maxPlayers', 'playerCount', 'roomCode',
    ]);
    // hostTag is derived from the code; the host's actual username
    // is never exposed in the public rooms DTO.
    expect(found.hostTag).toBe(`Host-${code}`);
    expect(found.hostTag).not.toContain('Alice');
    expect(found.hostLocale).toBe('es');
  });

  it('does not include private rooms in the response', async () => {
    const prv = server.store.createRoom('PRV99', {
      maxPlayers: 10, impostorCount: 1, discussionTime: 0,
      category: 'animals', votingTimer: 30, hardcore: false,
      visibility: 'private', hostLocale: 'en',
    });
    prv.players.set('P', { id: 'p', username: 'P', status: 'ACTIVE', isHost: true, joinedAt: 0 });
    const pub = server.store.createRoom('PUB99', {
      maxPlayers: 10, impostorCount: 1, discussionTime: 0,
      category: 'animals', votingTimer: 30, hardcore: false,
      visibility: 'public', hostLocale: 'en',
    });
    pub.players.set('H', { id: 'h', username: 'H', status: 'ACTIVE', isHost: true, joinedAt: 0 });

    const res = await httpGetJson(server.port, '/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.rooms.find((r: any) => r.roomCode === 'PRV99')).toBeUndefined();
    expect(res.body.rooms.find((r: any) => r.roomCode === 'PUB99')).toBeDefined();
    expect(res.body.totalCount).toBe(1);
  });

  it('sets Cache-Control: max-age=3 on the response', async () => {
    const res = await httpGetJson(server.port, '/api/rooms');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('max-age=3');
  });

  it('returns empty list when visibility=private is requested', async () => {
    // Seed a public room so a non-empty result proves the filter kicked in
    const pub = server.store.createRoom('PUBXX', {
      maxPlayers: 10, impostorCount: 1, discussionTime: 0,
      category: 'animals', votingTimer: 30, hardcore: false,
      visibility: 'public', hostLocale: 'en',
    });
    pub.players.set('H', { id: 'h', username: 'H', status: 'ACTIVE', isHost: true, joinedAt: 0 });

    const res = await httpGetJson(server.port, '/api/rooms?visibility=private');
    expect(res.status).toBe(200);
    expect(res.body.rooms).toEqual([]);
    expect(res.body.totalCount).toBe(0);
  });
});
