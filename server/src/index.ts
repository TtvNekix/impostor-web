import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RoomStore } from './room/RoomStore';
import { RoomManager } from './room/RoomManager';
import { WordBank } from './words/WordBank';
import { GameEngine } from './game/GameEngine';
import { ConnectionManager } from './connection/ConnectionManager';
import { registerHandlers } from './ws/handlers';
import { logEvent } from './audit/logger';

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
/*  HTTP + WebSocket server                                            */
/* ------------------------------------------------------------------ */

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/* ------------------------------------------------------------------ */
/*  Domain layer                                                        */
/* ------------------------------------------------------------------ */

const roomStore = new RoomStore();
const roomManager = new RoomManager(roomStore);
const connectionManager = new ConnectionManager(roomStore, roomManager);
const gameEngine = new GameEngine(connectionManager, roomStore, roomManager, wordBank);

/* ------------------------------------------------------------------ */
/*  Health check (required for Railway)                                */
/* ------------------------------------------------------------------ */

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/* ------------------------------------------------------------------ */
/*  Static serve (client build)                                        */
/* ------------------------------------------------------------------ */

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  console.log(`[server] Serving static files from ${clientDist}`);
  app.use(express.static(clientDist));
  // App lives at the root. The X button navigates to "/".
  // /play is kept as an alias for backwards compatibility.
  app.get('/play*', (_req, res) => {
    res.redirect('/');
  });
  app.get('/', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  console.warn(
    `[server] client/dist not found at ${clientDist}. Build the client with \`pnpm build:client\`.`,
  );
}

/* ------------------------------------------------------------------ */
/*  WebSocket handlers                                                 */
/* ------------------------------------------------------------------ */

registerHandlers(wss, roomManager, gameEngine, connectionManager, wordBank);

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT ?? '3001', 10);

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[server] uncaughtException', err);
  logEvent('server_error', {
    context: 'uncaughtException',
    message: err.message,
    stack: err.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  // eslint-disable-next-line no-console
  console.error('[server] unhandledRejection', err);
  logEvent('server_error', {
    context: 'unhandledRejection',
    message: err.message,
    stack: err.stack,
  });
});

server.listen(PORT, () => {
  console.log(`[server] El Impostor server listening on http://localhost:${PORT}`);
});
