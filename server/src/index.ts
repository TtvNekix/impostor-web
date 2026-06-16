import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { ALLOWED_LOCALES } from '@impostor/shared';
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

// Wire room-destruction cleanup: when a room is truly destroyed (host
// disconnect cascade, last player leaves), clear the game engine's
// per-room impostor history. Prevents a memory leak and avoids stale
// exclusion data if the random 5-char code is somehow reissued.
roomManager.onRoomDestroyed = (code) => gameEngine.clearImpostorHistory(code);

/* ------------------------------------------------------------------ */
/*  Health check (required for Railway)                                */
/* ------------------------------------------------------------------ */

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});

app.get('/sitemap.xml', (_req, res) => {
  const base = process.env.PUBLIC_URL ?? 'https://impostor.nekix.lol';
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc></url>
  <url><loc>${base}/play</loc></url>
</urlset>`);
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/* ------------------------------------------------------------------ */
/*  Public rooms discovery                                             */
/* ------------------------------------------------------------------ */

/**
 * GET /api/rooms?visibility=public&lang=es&hasSpace=true
 *
 * Returns the list of currently-open public rooms. No auth: the
 * response is built from a sanitized DTO (see RoomStore.getAllPublicRooms)
 * that only leaks the agreed field set. Browser cache is held to 3s
 * to keep the list fresh without hammering the single-server deployment.
 *
 * Query params (all optional):
 *   - visibility: only 'public' is honored. Other values yield an empty list.
 *   - lang: one of the 6 supported locale codes. Rooms whose hostLocale
 *     doesn't match are excluded.
 *   - hasSpace: 'true' to keep only rooms with activeCount < maxPlayers.
 */
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
    ? lang
    : null;
  const hasSpaceFilter = hasSpaceParam === 'true' || hasSpaceParam === '1';

  const result = roomStore.getAllPublicRooms();
  let rooms = result.rooms;

  if (langFilter !== null) {
    rooms = rooms.filter((r) => r.hostLocale === langFilter);
  }
  if (hasSpaceFilter) {
    rooms = rooms.filter((r) => r.playerCount < r.maxPlayers);
  }

  // Recompute totalCount after post-filtering so the client sees the
  // post-filter total (not the pre-filter one). hasMore is reset to
  // false since we never receive more than the cap from the store.
  res.status(200).json({
    rooms,
    hasMore: false,
    totalCount: rooms.length,
  });
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
