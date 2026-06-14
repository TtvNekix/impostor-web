import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';

import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { GameEngine } from '../game/GameEngine';

/**
 * A thin handler that wires a real Socket.IO server to our game engine.
 */
function createTestServer() {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const store = new RoomStore();
  const roomManager = new RoomManager(store);
  const bank = new WordBank({
    categories: [
      {
        name: 'test',
        words: ['integration-word'],
      },
    ],
  });
  const engine = new GameEngine(io, store, roomManager, bank);

  io.on('connection', (socket) => {
    socket.on('create_room', ({ code, username, settings }) => {
      try {
        const { room, player } = roomManager.createRoom(
          code,
          username,
          settings,
        );
        player.id = socket.id;
        socket.join(code);
        socket.emit('room_joined', {
          room: {
            code: room.code,
            settings: room.settings,
            players: Array.from(room.players.values()),
            gameState: null,
            createdAt: room.createdAt,
          },
          players: Array.from(room.players.values()),
        });
      } catch (err: any) {
        socket.emit('room_error', { message: err.message });
      }
    });

    socket.on('join_room', ({ code, username }) => {
      try {
        const { room, player } = roomManager.joinRoom(
          code,
          username,
          socket.id,
        );
        socket.join(code);
        io.to(code).emit('player_joined', { player });
        socket.emit('room_joined', {
          room: {
            code: room.code,
            settings: room.settings,
            players: Array.from(room.players.values()),
            gameState: room.gameState,
            createdAt: room.createdAt,
          },
          players: Array.from(room.players.values()),
        });
      } catch (err: any) {
        socket.emit('room_error', { message: err.message });
      }
    });

    socket.on('start_match', () => {
      // Find room code from joined rooms (exclude the default room named after socket.id)
      let roomCode: string | undefined;
      socket.rooms.forEach((r) => {
        if (r !== socket.id) roomCode = r;
      });
      if (roomCode) {
        engine.startMatch(roomCode, socket);
      }
    });
  });

  return new Promise<{
    httpServer: typeof httpServer;
    io: Server;
    port: number;
  }>((resolve) => {
    httpServer.listen(0, () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({ httpServer, io, port });
    });
  });
}

function connect(
  serverPort: number,
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = Client(`http://localhost:${serverPort}`, {
      transports: ['polling', 'websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => {
      reject(new Error(`Connect error: ${err.message}`));
    });
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

function waitForEvent(
  socket: ClientSocket,
  event: string,
  timeoutMs = 4000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeoutMs);
    socket.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('Integration: Socket.IO game lifecycle', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  const clients: ClientSocket[] = [];

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
    server.io.close();
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
    host.emit('create_room', {
      code: 'INT01',
      username: 'Host',
    });
    const hostData = await hostJoined;
    expect(hostData).toBeDefined();
    expect(hostData.room.code).toBe('INT01');
    expect(hostData.players.length).toBe(1);
    expect(Array.isArray(hostData.players)).toBe(true);

    // Alice joins
    const aliceJoined = waitForEvent(alice, 'room_joined');
    alice.emit('join_room', { code: 'INT01', username: 'Alice' });
    const aliceData = await aliceJoined;
    expect(aliceData).toBeDefined();
    expect(aliceData.players.length).toBe(2);

    // Bob joins
    const bobJoined = waitForEvent(bob, 'room_joined');
    bob.emit('join_room', { code: 'INT01', username: 'Bob' });
    const bobData = await bobJoined;
    expect(bobData.players.length).toBe(3);
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
    host.emit('create_room', { code: 'MTCH1', username: 'Host' });
    await hostJoined;

    // Alice joins
    const aliceJoined = waitForEvent(alice, 'room_joined');
    alice.emit('join_room', { code: 'MTCH1', username: 'Alice' });
    await aliceJoined;

    // Bob joins
    const bobJoined = waitForEvent(bob, 'room_joined');
    bob.emit('join_room', { code: 'MTCH1', username: 'Bob' });
    await bobJoined;

    // Start match — expect game_started and phase_changed
    const gameStarted = waitForEvent(host, 'game_started');
    host.emit('start_match');
    const gsData = await gameStarted;
    expect(gsData).toBeDefined();
    expect(gsData.roundNumber).toBe(1);
    expect(gsData.category).toBe('test');
  }, 20000);

  it('rejects joining a full room', async () => {
    const host = await connect(server.port);
    clients.push(host);

    const hostJoined = waitForEvent(host, 'room_joined');
    host.emit('create_room', {
      code: 'FULL1',
      username: 'Host',
      settings: { maxPlayers: 2 } as any,
    });
    await hostJoined;

    const alice = await connect(server.port);
    clients.push(alice);

    const aliceJoined = waitForEvent(alice, 'room_joined');
    alice.emit('join_room', { code: 'FULL1', username: 'Alice' });
    await aliceJoined;

    // Third player should get an error
    const bob = await connect(server.port);
    clients.push(bob);

    const errorEvt = waitForEvent(bob, 'room_error');
    bob.emit('join_room', { code: 'FULL1', username: 'Bob' });
    const errData = await errorEvt;
    expect(errData).toBeDefined();
    expect(errData.message).toBeTruthy();
  }, 20000);
});
