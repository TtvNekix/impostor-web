import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { RoomStore } from './room/RoomStore';
import { RoomManager } from './room/RoomManager';
import { WordBank } from './words/WordBank';
import { GameEngine } from './game/GameEngine';
import { ConnectionManager } from './connection/ConnectionManager';
import { registerHandlers } from './socket/handlers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Load word bank                                                      */
/* ------------------------------------------------------------------ */

const wordBankDataPath = path.resolve(
  __dirname,
  'data',
  'word-bank.json',
);
const wordBankRaw = JSON.parse(
  fs.readFileSync(wordBankDataPath, 'utf-8'),
);
const wordBank = new WordBank(wordBankRaw);

/* ------------------------------------------------------------------ */
/*  HTTP + Socket.IO server                                            */
/* ------------------------------------------------------------------ */

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

/* ------------------------------------------------------------------ */
/*  Domain layer                                                        */
/* ------------------------------------------------------------------ */

const roomStore = new RoomStore();
const roomManager = new RoomManager(roomStore);
const gameEngine = new GameEngine(io, roomStore, roomManager, wordBank);
const connectionManager = new ConnectionManager(roomStore, roomManager, io);

/* ------------------------------------------------------------------ */
/*  Static serve (client build)                                        */
/* ------------------------------------------------------------------ */

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  console.warn(
    '[server] client/dist not found — serving API only. Build the client with `pnpm build:client`.',
  );
}

/* ------------------------------------------------------------------ */
/*  Socket.IO handlers                                                 */
/* ------------------------------------------------------------------ */

registerHandlers(io, roomManager, gameEngine, connectionManager);

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT ?? '3001', 10);
server.listen(PORT, () => {
  console.log(`[server] El Impostor server listening on http://localhost:${PORT}`);
});
