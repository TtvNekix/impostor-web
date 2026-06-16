# El Impostor — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 features for the El Impostor real-time multiplayer social deduction game: bigger word bank, configurable voting timer, re-rol rule, hardcore mode (with help modal), full server audit log to a private Discord webhook, and sitemap + robots.

**Architecture:** Incremental additions to the existing monorepo (`shared/`, `server/`, `client/`). Server-driven game state; client reflects via WS events. All new game settings flow through the existing `update_settings` handler. Audit logging is a new server-side module that POSTs to Discord via `fetch` with try/catch. Sitemap + robots are pure Express routes.

**Tech Stack:** TypeScript, Node.js + Express + raw `ws`, React 18 + Vite + Zustand, Vitest.

---

## File Structure

**New files:**
- `server/src/audit/logger.ts` — `logEvent` function with try/catch fetch
- `server/src/__tests__/audit/logger.test.ts` — tests for logger
- `client/src/components/HardcoreHelpModal.tsx` — small modal explaining hardcore

**Modified files (logical groups):**

| Group | Files |
|-------|-------|
| Shared types & constants | `shared/src/types/protocol.ts`, `shared/src/constants.ts` |
| Server: audit | `server/src/audit/logger.ts` (new), `server/src/ws/handlers.ts`, `server/src/index.ts` |
| Server: word bank | `server/src/data/word-bank.json`, `server/src/__tests__/WordBank.test.ts` |
| Server: gameplay (timer, re-rol, hardcore) | `server/src/room/Room.ts`, `server/src/room/RoomManager.ts`, `server/src/game/GameEngine.ts`, `server/src/__tests__/RoomManager.test.ts`, `server/src/__tests__/GameEngine.test.ts` |
| Server: SEO | `server/src/index.ts` |
| Client: shared types | `client/src/hooks/useSocket.ts` (mostly untouched; `updateSettings` already forwards new fields via shared type) |
| Client: lobby + hardcore UI | `client/src/screens/LobbyScreen.tsx`, `client/src/screens/DiscussionScreen.tsx`, `client/src/components/VotingTable.tsx`, `client/src/components/HardcoreHelpModal.tsx` (new) |
| Client: i18n | `client/src/i18n/{en,es,pt,fr,it,de}.ts` |

---

## Task 1: Shared types & constants (votingTimer + hardcore)

**Files:**
- Modify: `shared/src/types/protocol.ts`
- Modify: `shared/src/constants.ts`

- [ ] **Step 1.1: Add `votingTimer` and `hardcore` to `RoomSettings`**

In `shared/src/types/protocol.ts`, locate the `RoomSettings` interface (around line 13) and add the two new fields. The full interface becomes:

```ts
export interface RoomSettings {
  maxPlayers: number;
  impostorCount: number;
  discussionTime: number;
  category: string | null;
  votingTimer: 15 | 30 | 45 | 60;
  hardcore: boolean;
}
```

- [ ] **Step 1.2: Add the same fields to `UpdateSettingsPayload`**

In the same file, locate `UpdateSettingsPayload` (around line 62) and update it to:

```ts
export interface UpdateSettingsPayload {
  impostorCount?: number;
  discussionTime?: number;
  category?: string | null;
  maxPlayers?: number;
  votingTimer?: 15 | 30 | 45 | 60;
  hardcore?: boolean;
}
```

- [ ] **Step 1.3: Add the new constants**

In `shared/src/constants.ts`, add at the bottom:

```ts
/** Default voting phase duration when the host doesn't pick one. */
export const DEFAULT_VOTING_TIMER = 30;

/** Valid voting-timer choices shown in the lobby selector. */
export const ALLOWED_VOTING_TIMERS = [15, 30, 45, 60] as const;
```

- [ ] **Step 1.4: Verify the build passes**

Run from repo root:
```bash
pnpm build:shared
```

Expected: build succeeds. The shared package compiles cleanly with the new fields.

- [ ] **Step 1.5: Commit**

```bash
git add shared/src/types/protocol.ts shared/src/constants.ts
git commit -m "feat(shared): add votingTimer and hardcore to RoomSettings"
```

---

## Task 2: Audit logger module (server)

**Files:**
- Create: `server/src/audit/logger.ts`
- Create: `server/src/__tests__/audit/logger.test.ts`

- [ ] **Step 2.1: Create the audit logger**

Create `server/src/audit/logger.ts`:

```ts
/**
 * Server-side audit log. POSTs structured events to a private Discord
 * webhook so the maintainer can see the full state of the game from a
 * familiar surface. Failures (Discord down, rate limited, network
 * error) must not affect the running game.
 */

const WEBHOOK_URL = process.env.AUDIT_WEBHOOK_URL
  ?? 'https://discord.com/api/webhooks/1516416022872064100/nWmudVWKTa-jsp5K6gbUtlHXcNITDI2Im6iIVymHKB7GIZfl-bg8C2Y93Ft2psjJojXs';

export function logEvent(type: string, data: Record<string, unknown>): void {
  const payload = {
    content: null,
    embeds: [
      {
        title: `[impostor] ${type}`,
        color: 0x00d4ff,
        fields: Object.entries(data).map(([name, value]) => ({
          name,
          value: typeof value === 'string' ? value : JSON.stringify(value),
          inline: false,
        })),
        timestamp: new Date().toISOString(),
      },
    ],
  };
  // Always log to stdout for ops/journalctl visibility
  // eslint-disable-next-line no-console
  console.log(`[audit] ${type}`, JSON.stringify(data));
  // Fire-and-forget webhook POST
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[audit] webhook POST failed:', err.message);
  });
}
```

- [ ] **Step 2.2: Write the failing test**

Create `server/src/__tests__/audit/logger.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('audit/logger.logEvent', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts an embed to the Discord webhook URL with the event title and fields', () => {
    const { logEvent } = require('../../audit/logger');
    logEvent('room_created', { code: 'TEST01', host: 'alice' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('discord.com/api/webhooks/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.embeds[0].title).toBe('[impostor] room_created');
    expect(body.embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'code', value: 'TEST01' }),
        expect.objectContaining({ name: 'host', value: 'alice' }),
      ]),
    );
  });

  it('serializes object values as JSON', () => {
    const { logEvent } = require('../../audit/logger');
    logEvent('match_started', { wordAssignments: { id1: 'cat' } });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const field = body.embeds[0].fields.find((f: { name: string }) => f.name === 'wordAssignments');
    expect(field.value).toBe('{"id1":"cat"}');
  });

  it('does not throw when fetch fails', () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { logEvent } = require('../../audit/logger');
    expect(() => logEvent('room_created', { code: 'X' })).not.toThrow();
  });

  it('does not throw when fetch returns a non-2xx', () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const { logEvent } = require('../../audit/logger');
    expect(() => logEvent('room_created', { code: 'X' })).not.toThrow();
  });

  it('always logs to stdout for journalctl visibility', () => {
    const { logEvent } = require('../../audit/logger');
    logEvent('room_created', { code: 'JRNL' });
    expect(console.log).toHaveBeenCalledWith(
      '[audit] room_created',
      expect.stringContaining('JRNL'),
    );
  });
});
```

- [ ] **Step 2.3: Run tests to verify they pass**

Run from `server/`:
```bash
pnpm test -- src/__tests__/audit/logger.test.ts
```

Expected: 5 tests pass. (The require is inside each test so that vi's module mocks work cleanly.)

- [ ] **Step 2.4: Commit**

```bash
git add server/src/audit/logger.ts server/src/__tests__/audit/logger.test.ts
git commit -m "feat(server): audit logger module that posts to Discord webhook"
```

---

## Task 3: Wire audit logging into WS handlers

**Files:**
- Modify: `server/src/ws/handlers.ts`

- [ ] **Step 3.1: Add the import**

In `server/src/ws/handlers.ts`, add at the top (after the existing imports):

```ts
import { logEvent } from '../audit/logger';
```

- [ ] **Step 3.2: Log `room_created` in the CREATE_ROOM case**

Locate the `case ClientEvent.CREATE_ROOM` block. After the `ws.send(JSON.stringify({ event: 'room_joined', ... }))` line, add:

```ts
logEvent('room_created', {
  code: code.toUpperCase(),
  hostUsername: username.trim(),
  maxPlayers: settings?.maxPlayers ?? 'default',
  category: settings?.category ?? 'random',
  votingTimer: settings?.votingTimer ?? 'default',
  hardcore: settings?.hardcore ?? false,
});
```

- [ ] **Step 3.3: Log `room_joined` in the JOIN_ROOM case**

Locate the `case ClientEvent.JOIN_ROOM` block. After the successful `room_joined` send, add:

```ts
logEvent('room_joined', {
  code: code.toUpperCase(),
  username: username.trim(),
  isHost: me.isHost,
});
```

- [ ] **Step 3.4: Log `room_left` in the LEAVE_ROOM handler**

Locate the `handleLeave` function. After `roomManager.leaveRoom(...)`, add (only if the room still exists):

```ts
if (room) {
  logEvent('room_left', {
    code: roomCode,
    username,
    wasHost: room.players.get(username)?.isHost ?? false,
  });
}
```

- [ ] **Step 3.5: Log `player_kicked` in handleKick**

Locate the `handleKick` function. After the `connectionManager.sendToSocket(targetSocketId, ServerEvent.KICKED, ...)` call, add:

```ts
logEvent('player_kicked', {
  code: roomCode,
  hostUsername: callerName,
  targetUsername: data.username,
});
```

- [ ] **Step 3.6: Add the global uncaughtException handler in `index.ts`**

In `server/src/index.ts`, find the section where `server.listen` is called. Above it, add:

```ts
import { logEvent } from './audit/logger';

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
```

- [ ] **Step 3.7: Run existing server tests to verify no regression**

```bash
pnpm --filter @impostor/server test
```

Expected: 111 existing tests pass. The audit calls are fire-and-forget so they don't break existing behavior.

- [ ] **Step 3.8: Commit**

```bash
git add server/src/ws/handlers.ts server/src/index.ts
git commit -m "feat(server): log room/kick/error events to audit webhook"
```

---

## Task 4: Expand the built-in word bank

**Files:**
- Modify: `server/src/data/word-bank.json`
- Modify: `server/src/__tests__/WordBank.test.ts`

- [ ] **Step 4.1: Read the current word bank**

Open `server/src/data/word-bank.json` and review the 5 current categories (`videojuegos`, `internet`, `juegos-de-mesa`, `esports`, `gaming-cultura`). For each, decide which words to KEEP (good, conversation-sparking) and which to REPLACE or DROP (ambiguous, NSFW, too obscure).

- [ ] **Step 4.2: Rewrite the JSON with ~30 categories**

Replace the contents of `server/src/data/word-bank.json`. The new file should have **30 categories** total, each with **12-20 words** (ASCII, no `ñ`/accents, no ambiguous meanings).

Required categories (mix of gaming/tech + general):
- `videojuegos`, `esports`, `internet`, `anime`, `programacion`, `hardware`, `streaming`, `consolas` (8 gaming/tech)
- `comida`, `animales`, `profesiones`, `deportes`, `musica`, `peliculas`, `series`, `marcas`, `lugares`, `paises`, `ciudades`, `objetos`, `instrumentos`, `frutas`, `comidas-tipicas`, `videojuegos-clasicos`, `peliculas-disney`, `superheroes`, `vehiculos`, `elementos` (22 general)

That gives 8+22 = 30 categories. Example structure (the engineer fills in actual words):

```json
{
  "categories": [
    {
      "name": "videojuegos",
      "displayName": "Videojuegos",
      "words": ["minecraft", "zelda", "mario", "sonic", "kratos", ...]
    },
    {
      "name": "comida",
      "displayName": "Comida",
      "words": ["pizza", "sushi", "tacos", "paella", "empanada", ...]
    },
    ...
  ]
}
```

The complete list is a content-creation task; fill in plausible Spanish-language game words for each category. Aim for 12-20 per category.

- [ ] **Step 4.3: Update the WordBank test to assert the new size**

Open `server/src/__tests__/WordBank.test.ts`. Add (or replace) a test block:

```ts
describe('WordBank size and quality', () => {
  it('has at least 25 categories', () => {
    expect(bank.getCategories().length).toBeGreaterThanOrEqual(25);
  });

  it('every category has between 10 and 25 words', () => {
    for (const cat of bank.getCategories()) {
      const words = bank.getWords(cat.name);
      expect(words.length, `category ${cat.name}`).toBeGreaterThanOrEqual(10);
      expect(words.length, `category ${cat.name}`).toBeLessThanOrEqual(25);
    }
  });

  it('every word is ASCII printable (no accents, no ñ)', () => {
    for (const cat of bank.getCategories()) {
      for (const w of bank.getWords(cat.name)) {
        // eslint-disable-next-line no-control-regex
        expect(w, `category ${cat.name}`).toMatch(/^[\x20-\x7E]+$/);
      }
    }
  });

  it('has no duplicate words within or across categories', () => {
    const seen = new Map<string, string>();
    for (const cat of bank.getCategories()) {
      for (const w of bank.getWords(cat.name)) {
        const lower = w.toLowerCase();
        expect(seen.get(lower), `duplicate: "${w}"`).toBeUndefined();
        seen.set(lower, cat.name);
      }
    }
  });
});
```

- [ ] **Step 4.4: Run the tests**

```bash
pnpm --filter @impostor/server test -- src/__tests__/WordBank.test.ts
```

Expected: all original WordBank tests + the 4 new tests pass. If any fail, fix the word bank data (most likely candidates: words with accents, duplicates, or too few/too many per category).

- [ ] **Step 4.5: Commit**

```bash
git add server/src/data/word-bank.json server/src/__tests__/WordBank.test.ts
git commit -m "feat(server): expand word bank to 30 categories"
```

---

## Task 5: Voting timer configurable (server)

**Files:**
- Modify: `server/src/game/GameEngine.ts`

- [ ] **Step 5.1: Add the failing test**

Open `server/src/__tests__/GameEngine.test.ts`. Add a new `describe` block:

```ts
describe('startVoting with configurable votingTimer', () => {
  it('uses room.settings.votingTimer (not the constant) when starting voting', () => {
    // Create a room with votingTimer=15
    const { engine, connManager, store } = setup();
    roomManager.createRoom('VT01', 'Host', { votingTimer: 15 });
    const room = store.getRoom('VT01')!;
    room.players.get('Host')!.isHost = true;
    room.players.get('Host')!.id = 'host-sid';
    roomManager.joinRoom('VT01', 'Alice', 'alice-sid');
    roomManager.joinRoom('VT01', 'Bob', 'bob-sid');
    engine.startMatch('VT01', 'host-sid');

    vi.useFakeTimers();
    const start = Date.now();
    engine.startVoting('VT01', 'host-sid');

    // Verify the phaseEndsAt is approximately 15 seconds in the future
    const gs = room.gameState!;
    expect(gs.phaseEndsAt - start).toBe(15_000);
    vi.useRealTimers();
  });

  it('falls back to the default 30s when votingTimer is not set', () => {
    // Create a room WITHOUT votingTimer
    const { engine, connManager, store } = setup();
    roomManager.createRoom('VT02', 'Host');
    const room = store.getRoom('VT02')!;
    room.players.get('Host')!.isHost = true;
    room.players.get('Host')!.id = 'host-sid';
    roomManager.joinRoom('VT02', 'Alice', 'alice-sid');
    roomManager.joinRoom('VT02', 'Bob', 'bob-sid');
    engine.startMatch('VT02', 'host-sid');

    vi.useFakeTimers();
    const start = Date.now();
    engine.startVoting('VT02', 'host-sid');

    const gs = room.gameState!;
    expect(gs.phaseEndsAt - start).toBe(30_000);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 5.2: Run the test to verify it fails**

```bash
pnpm --filter @impostor/server test -- src/__tests__/GameEngine.test.ts
```

Expected: 2 new tests fail. The current `startVoting` uses the constant `VOTING_TIMER`, not the room setting.

- [ ] **Step 5.3: Update `startVoting` to use the room setting**

In `server/src/game/GameEngine.ts`, find the `startVoting` method. The current implementation likely has:
```ts
const votingMs = VOTING_TIMER * 1000;
```

Replace it with:
```ts
const room = this.roomStore.getRoom(roomCode);
const votingSec = room?.settings.votingTimer ?? VOTING_TIMER;
const votingMs = votingSec * 1000;
```

Also add at the top of the file (next to the existing `VOTING_TIMER` import):
```ts
import { DEFAULT_VOTING_TIMER as VOTING_TIMER } from '@impostor/shared';
```

(Replace the existing `VOTING_TIMER` import.)

- [ ] **Step 5.4: Update the existing `createRoom` to accept `votingTimer`**

The `RoomManager.createRoom` already accepts `Partial<RoomSettings>` and spreads it. So no change needed there — the shared type update from Task 1 makes `votingTimer` a valid field. Verify the spread:

In `server/src/room/RoomManager.ts`, the existing `createRoom`:
```ts
const defaultSettings: RoomSettings = {
  maxPlayers: DEFAULT_MAX_PLAYERS,
  impostorCount: 1,
  discussionTime: DEFAULT_TIMER,
  category: null,
  ...settings,
};
```

No change needed — `votingTimer` flows through the spread once it's on the type.

- [ ] **Step 5.5: Update the RoomStore.createRoom to also default votingTimer**

Open `server/src/room/RoomStore.ts`. The `createRoom` method might not default `votingTimer` if it's missing. Add a fallback. If the existing code is:

```ts
createRoom(code: string, settings: RoomSettings): Room {
```

Then change to:
```ts
createRoom(code: string, settings: RoomSettings): Room {
  const finalSettings: RoomSettings = {
    votingTimer: 30,
    hardcore: false,
    ...settings,
  };
  // ... rest uses finalSettings
}
```

- [ ] **Step 5.6: Re-run the tests**

```bash
pnpm --filter @impostor/server test -- src/__tests__/GameEngine.test.ts
```

Expected: both new tests pass, no existing tests broke.

- [ ] **Step 5.7: Commit**

```bash
git add server/src/game/GameEngine.ts server/src/room/RoomManager.ts server/src/room/RoomStore.ts server/src/__tests__/GameEngine.test.ts
git commit -m "feat(server): honor room.settings.votingTimer in startVoting"
```

---

## Task 6: Re-rol rule (server)

**Files:**
- Modify: `server/src/room/RoomManager.ts`
- Modify: `server/src/__tests__/RoomManager.test.ts`

- [ ] **Step 6.1: Add the failing tests**

Open `server/src/__tests__/RoomManager.test.ts`. Add:

```ts
describe('selectImpostors with exclusion (re-rol rule)', () => {
  it('excludes a player who was impostor in the last 2 rounds', () => {
    const rm = new RoomManager(new RoomStore());
    const { room } = rm.createRoom('RR01', 'Host');
    rm.joinRoom('RR01', 'Alice', 'alice');
    rm.joinRoom('RR01', 'Bob', 'bob');
    rm.joinRoom('RR01', 'Carol', 'carol');

    // Alice was impostor in the last 2 rounds
    const picked = rm.selectImpostors(Array.from(room.players.values()), 1, ['alice', 'bob']);
    expect(picked.has('alice')).toBe(false);
    // Bob is in the exclusion list (the older one) but not in the last 1
    // Actually re-read the rule: excluded if in BOTH slots. ['alice', 'bob'] means
    // alice was round N and bob was round N-1. Only alice is in BOTH slots. So bob is eligible.
  });

  it('excludes only players in BOTH slots (FIFO logic)', () => {
    const rm = new RoomManager(new RoomStore());
    const { room } = rm.createRoom('RR02', 'Host');
    rm.joinRoom('RR02', 'Alice', 'alice');
    rm.joinRoom('RR02', 'Bob', 'bob');
    rm.joinRoom('RR02', 'Carol', 'carol');

    // Alice was impostor 2 rounds ago, Bob was last round
    const picked = rm.selectImpostors(Array.from(room.players.values()), 1, ['bob', 'alice']);
    // Alice is in both slots (indices 0 and 1) → excluded
    // Bob is in index 0 only → eligible
    expect(picked.has('alice')).toBe(false);
    expect(picked.has('bob') || picked.has('carol')).toBe(true);
  });

  it('drops the oldest block when ALL players are excluded (FIFO expiry)', () => {
    const rm = new RoomManager(new RoomStore());
    const { room } = rm.createRoom('RR03', 'Host');
    rm.joinRoom('RR03', 'Alice', 'alice');
    rm.joinRoom('RR03', 'Bob', 'bob');
    rm.joinRoom('RR03', 'Carol', 'carol');

    // All 3 players have been impostor twice in a row
    const picked = rm.selectImpostors(
      Array.from(room.players.values()),
      1,
      ['alice', 'bob', 'carol', 'alice', 'bob', 'carol'],
    );
    // The oldest entry ('alice', index 0) is dropped, making alice eligible again
    expect(picked.size).toBe(1);
    expect(picked.has('alice')).toBe(true);
  });

  it('returns an empty exclusion list as a no-op (fresh room)', () => {
    const rm = new RoomManager(new RoomStore());
    const { room } = rm.createRoom('RR04', 'Host');
    rm.joinRoom('RR04', 'Alice', 'alice');
    rm.joinRoom('RR04', 'Bob', 'bob');
    rm.joinRoom('RR04', 'Carol', 'carol');

    const picked = rm.selectImpostors(Array.from(room.players.values()), 1, []);
    expect(picked.size).toBe(1);
    // All 3 are eligible, the picker is random
  });
});
```

- [ ] **Step 6.2: Run the tests to verify they fail**

```bash
pnpm --filter @impostor/server test -- src/__tests__/RoomManager.test.ts
```

Expected: 4 new tests fail. The current `selectImpostors` doesn't accept an exclusion list.

- [ ] **Step 6.3: Update `selectImpostors` to accept an exclusion list**

In `server/src/room/RoomManager.ts`, locate the `selectImpostors` method. Update it to:

```ts
selectImpostors(
  activePlayers: Player[],
  count: number,
  excludeIds: string[] = [],
): Set<string> {
  // Fisher-Yates shuffle: uniform distribution, unlike
  // `Array.sort(() => Math.random() - 0.5)` which has known bias.
  if (count > activePlayers.length) {
    throw new Error('Not enough players to select impostors');
  }
  // Build a candidate set: remove players whose id appears in BOTH
  // of the last two exclusion slots (re-rol rule — same person can't
  // be impostor 3 times in a row). If the resulting set is empty,
  // fall back to only excluding the OLDEST slot (FIFO expiry) so
  // there's always at least one candidate.
  const lastRound = excludeIds[excludeIds.length - 1];
  const previousRound = excludeIds[excludeIds.length - 2];
  let candidates = activePlayers.filter(
    (p) => !(lastRound && previousRound && p.id === lastRound && p.id === previousRound),
  );
  if (candidates.length < count) {
    // FIFO: drop the oldest exclusion (index 0 in excludeIds)
    candidates = activePlayers.filter(
      (p) => !(excludeIds[0] && p.id === excludeIds[0]),
    );
  }
  // If still empty (shouldn't happen with at least 1 active player), fall back to all
  if (candidates.length === 0) {
    candidates = activePlayers;
  }
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const ids = new Set<string>();
  for (let i = 0; i < count && i < shuffled.length; i++) {
    ids.add(shuffled[i].id);
  }
  return ids;
}
```

- [ ] **Step 6.4: Re-run the tests to verify they pass**

```bash
pnpm --filter @impostor/server test -- src/__tests__/RoomManager.test.ts
```

Expected: 4 new tests pass + all existing RoomManager tests still pass.

- [ ] **Step 6.5: Commit**

```bash
git add server/src/room/RoomManager.ts server/src/__tests__/RoomManager.test.ts
git commit -m "feat(server): re-rol rule — exclude players in last 2 rounds, FIFO fallback"
```

---

## Task 7: Hardcore mode (server)

**Files:**
- Modify: `server/src/game/GameEngine.ts`
- Modify: `server/src/__tests__/GameEngine.test.ts`

- [ ] **Step 7.1: Add the failing tests**

Open `server/src/__tests__/GameEngine.test.ts`. Add:

```ts
describe('startMatch with hardcore mode', () => {
  it('forces 1 impostor regardless of player count when hardcore=true', () => {
    const { engine, connManager, store, roomManager } = setup();
    roomManager.createRoom('HC01', 'Host', { hardcore: true });
    const room = store.getRoom('HC01')!;
    room.players.get('Host')!.isHost = true;
    room.players.get('Host')!.id = 'host-sid';
    // Add 5 more players (6 total)
    for (let i = 0; i < 5; i++) {
      roomManager.joinRoom('HC01', `p${i}`, `p${i}-sid`);
    }
    engine.startMatch('HC01', 'host-sid');
    const impostors = room.gameState!.players.filter((p) => p.isImpostor);
    expect(impostors.length).toBe(1);
  });

  it('picks a word from any category (ignores settings.category) when hardcore=true', () => {
    const { engine, connManager, store, roomManager } = setup();
    roomManager.createRoom('HC02', 'Host', { hardcore: true, category: 'videojuegos' });
    const room = store.getRoom('HC02')!;
    room.players.get('Host')!.isHost = true;
    room.players.get('Host')!.id = 'host-sid';
    roomManager.joinRoom('HC02', 'Alice', 'alice-sid');
    roomManager.joinRoom('HC02', 'Bob', 'bob-sid');
    engine.startMatch('HC02', 'host-sid');

    // Sample many times; the picked category should be diverse
    const categoriesPicked = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { engine: e2, connManager: c2, store: s2, roomManager: rm2 } = setup();
      rm2.createRoom(`HC02-${i}`, 'Host', { hardcore: true, category: 'videojuegos' });
      const r = s2.getRoom(`HC02-${i}`)!;
      r.players.get('Host')!.isHost = true;
      r.players.get('Host')!.id = 'host-sid';
      rm2.joinRoom(`HC02-${i}`, 'A', 'a');
      rm2.joinRoom(`HC02-${i}`, 'B', 'b');
      e2.startMatch(`HC02-${i}`, 'host-sid');
      categoriesPicked.add(s2.getRoom(`HC02-${i}`)!.gameState!.category);
    }
    // With 30+ categories, 50 samples should hit at least 5 different ones
    expect(categoriesPicked.size).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 7.2: Run the tests to verify they fail**

```bash
pnpm --filter @impostor/server test -- src/__tests__/GameEngine.test.ts
```

Expected: 2 new tests fail. The current `startMatch` uses the normal impostor count logic and the room's selected category.

- [ ] **Step 7.3: Update `startMatch` for hardcore**

In `server/src/game/GameEngine.ts`, locate the `startMatch` method. Find the block that builds the impostor count and the word picker. The current code has:

```ts
const maxImpostors = this.getMaxImpostors(activePlayers.length);
if (room.settings.impostorCount > maxImpostors) {
  // ...
}
const impostorIds = this.selectImpostors(activePlayers, room.settings.impostorCount);
```

And later:
```ts
const wordPick = room.settings.category
  ? // ...
  : this.wordBank.randomWord();
```

Replace this whole section to:

```ts
// Hardcore: always 1 impostor, word from any category.
const forcedImpostorCount = room.settings.hardcore ? 1 : room.settings.impostorCount;
const maxImpostors = this.getMaxImpostors(activePlayers.length);
if (!room.settings.hardcore && forcedImpostorCount > maxImpostors) {
  // ...existing auto-clamp logic (unchanged for non-hardcore)
}
const impostorIds = this.selectImpostors(activePlayers, forcedImpostorCount);
```

And for the word:
```ts
// Hardcore ignores the room's selected category — picks from any.
const wordPick = room.settings.hardcore
  ? this.wordBank.randomWord()
  : room.settings.category
    ? // ... existing logic
    : this.wordBank.randomWord();
```

- [ ] **Step 7.4: Log `match_started` with word assignments**

After the impostor selection (and word pick) in `startMatch`, before the final `ws.send` of `game_started`, add:

```ts
logEvent('match_started', {
  code: roomCode,
  roundNumber: gameState.roundNumber,
  hardcore: room.settings.hardcore,
  votingTimer: room.settings.votingTimer,
  wordCategory: wordPick.category,
  wordAssignments: gamePlayers.reduce(
    (acc, gp) => {
      acc[gp.id] = gp.isImpostor ? '<impostor>' : wordPick.word;
      return acc;
    },
    {} as Record<string, string>,
  ),
});
```

- [ ] **Step 7.5: Re-run the tests**

```bash
pnpm --filter @impostor/server test -- src/__tests__/GameEngine.test.ts
```

Expected: 2 new tests pass, all existing tests still pass.

- [ ] **Step 7.6: Commit**

```bash
git add server/src/game/GameEngine.ts server/src/__tests__/GameEngine.test.ts
git commit -m "feat(server): hardcore mode — 1 impostor always, random word from all"
```

---

## Task 8: Audit + vote logging in startMatch / roundResult / gameOver

**Files:**
- Modify: `server/src/game/GameEngine.ts`

- [ ] **Step 8.1: Log `vote_cast` in `processVote`**

In `GameEngine.ts`, find the `processVote` method. After the line that pushes the vote (`gs.votes.push(...)`), add:

```ts
logEvent('vote_cast', {
  code: roomCode,
  roundNumber: gs.roundNumber,
  voter: voterId,
  target: targetId,  // null if skip
});
```

- [ ] **Step 8.2: Log `round_result` in `tallyAndEvaluate`**

In `tallyAndEvaluate`, after `this.broadcastToRoom(roomCode, ServerEvent.ROUND_RESULT, roundResult)`, add:

```ts
logEvent('round_result', {
  code: roomCode,
  roundNumber: gs.roundNumber,
  expelled: roundResult.expelledUsername || null,
  wasImpostor: roundResult.wasImpostor,
  aliveImpostors: roundResult.aliveImpostors,
  aliveNonImpostors: roundResult.aliveNonImpostors,
});
```

- [ ] **Step 8.3: Log `match_ended` in the GAME_OVER branch of `tallyAndEvaluate`**

Inside the `if (roundResult.winner) { ... }` block, after the `GAME_OVER` broadcast, add:

```ts
logEvent('match_ended', {
  code: roomCode,
  winner: roundResult.winner,
  totalRounds: gs.roundNumber,
});
```

- [ ] **Step 8.4: Run existing tests to verify no regression**

```bash
pnpm --filter @impostor/server test
```

Expected: all tests pass. The logEvent calls are fire-and-forget.

- [ ] **Step 8.5: Commit**

```bash
git add server/src/game/GameEngine.ts
git commit -m "feat(server): log vote_cast, round_result, match_ended events"
```

---

## Task 9: Sitemap + robots routes

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/__tests__/integration.test.ts` (add a smoke test for the new routes)

- [ ] **Step 9.1: Add the routes**

In `server/src/index.ts`, find the section where the Express app is set up (before the WebSocket setup). Add:

```ts
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
```

- [ ] **Step 9.2: Add a smoke test for the new routes**

Open `server/src/__tests__/integration.test.ts`. At the end of the existing test file (inside the existing `describe`), add:

```ts
it('serves robots.txt and sitemap.xml', async () => {
  // Make a request to the test server for robots.txt
  const robotsRes = await fetch(`http://localhost:${port}/robots.txt`);
  expect(robotsRes.status).toBe(200);
  expect(robotsRes.headers.get('content-type')).toContain('text/plain');
  const robotsBody = await robotsRes.text();
  expect(robotsBody).toContain('User-agent: *');
  expect(robotsBody).toContain('Allow: /');

  // And sitemap
  const sitemapRes = await fetch(`http://localhost:${port}/sitemap.xml`);
  expect(sitemapRes.status).toBe(200);
  expect(sitemapRes.headers.get('content-type')).toContain('application/xml');
  const sitemapBody = await sitemapRes.text();
  expect(sitemapBody).toContain('<urlset');
  expect(sitemapBody).toContain('<loc>');
});
```

(Note: the existing integration test uses `WebSocketServer` on top of `httpServer`. This test may need to add a basic Express app to the test server. If the existing test server doesn't expose Express routes, create a separate minimal test setup or just verify via the deployed server later. Adapt the test to fit the existing harness — the smoke test is a nice-to-have, not blocking.)

- [ ] **Step 9.3: Run the integration tests**

```bash
pnpm --filter @impostor/server test -- src/__tests__/integration.test.ts
```

Expected: 3 original integration tests + the new smoke test pass.

- [ ] **Step 9.4: Commit**

```bash
git add server/src/index.ts server/src/__tests__/integration.test.ts
git commit -m "feat(server): serve robots.txt and sitemap.xml"
```

---

## Task 10: Client i18n strings for the new features

**Files:**
- Modify: `client/src/i18n/{en,es,pt,fr,it,de}.ts`

- [ ] **Step 10.1: Add the new strings to en.ts**

In `client/src/i18n/en.ts`, locate the `lobby` object. Add these new keys:

```ts
lobby: {
  // ...existing keys
  votingTimer: 'Voting time',
  votingTimerHint: 'How long players have to vote',
  hardcore: 'Hardcore mode',
  hardcoreOn: 'Hardcore: ON',
  hardcoreOff: 'Hardcore: OFF',
  helpHardcore: 'What is Hardcore mode?',
  hardcoreHelp: 'A harder variant. The discussion still happens, but the rules change:',
  hardcoreHelpBullets: {
    one: '1 impostor always (regardless of player count)',
    two: 'No category hint (the word can be from anywhere)',
    three: 'No skip-vote option (everyone must vote)',
    four: 'Random word from all built-in + custom categories',
  },
}
```

- [ ] **Step 10.2: Add the same strings to es.ts**

```ts
lobby: {
  // ...existing keys
  votingTimer: 'Tiempo de votación',
  votingTimerHint: 'Cuánto tiempo tienen los jugadores para votar',
  hardcore: 'Modo Hardcore',
  hardcoreOn: 'Hardcore: ON',
  hardcoreOff: 'Hardcore: OFF',
  helpHardcore: '¿Qué es el modo Hardcore?',
  hardcoreHelp: 'Una variante más difícil. La discusión sigue pasando, pero las reglas cambian:',
  hardcoreHelpBullets: {
    one: '1 impostor siempre (sin importar cuántos jugadores haya)',
    two: 'Sin pista de categoría (la palabra puede ser cualquier cosa)',
    three: 'No se puede saltar el voto (todos deben votar)',
    four: 'Palabra random de todas las categorías (built-in + custom)',
  },
}
```

- [ ] **Step 10.3: Add the same strings to pt.ts**

```ts
lobby: {
  // ...existing keys
  votingTimer: 'Tempo de votação',
  votingTimerHint: 'Quanto tempo os jogadores têm para votar',
  hardcore: 'Modo Hardcore',
  hardcoreOn: 'Hardcore: ON',
  hardcoreOff: 'Hardcore: OFF',
  helpHardcore: 'O que é o modo Hardcore?',
  hardcoreHelp: 'Uma variante mais difícil. A discussão continua, mas as regras mudam:',
  hardcoreHelpBullets: {
    one: '1 impostor sempre (independentemente do número de jogadores)',
    two: 'Sem pista de categoria (a palavra pode ser qualquer uma)',
    three: 'Não é possível saltar o voto (todos têm de votar)',
    four: 'Palavra aleatória de todas as categorias (built-in + custom)',
  },
}
```

- [ ] **Step 10.4: Add the same strings to fr.ts**

```ts
lobby: {
  // ...existing keys
  votingTimer: 'Temps de vote',
  votingTimerHint: 'Combien de temps les joueurs ont pour voter',
  hardcore: 'Mode Hardcore',
  hardcoreOn: 'Hardcore : ON',
  hardcoreOff: 'Hardcore : OFF',
  helpHardcore: 'Qu\'est-ce que le mode Hardcore ?',
  hardcoreHelp: 'Une variante plus difficile. La discussion a toujours lieu, mais les règles changent :',
  hardcoreHelpBullets: {
    one: '1 imposteur toujours (quel que soit le nombre de joueurs)',
    two: 'Pas d\'indice de catégorie (le mot peut venir de n\'importe où)',
    three: 'Impossible de passer le vote (tout le monde doit voter)',
    four: 'Mot aléatoire parmi toutes les catégories (built-in + custom)',
  },
}
```

- [ ] **Step 10.5: Add the same strings to it.ts**

```ts
lobby: {
  // ...existing keys
  votingTimer: 'Tempo di votazione',
  votingTimerHint: 'Quanto tempo hanno i giocatori per votare',
  hardcore: 'Modalità Hardcore',
  hardcoreOn: 'Hardcore: ON',
  hardcoreOff: 'Hardcore: OFF',
  helpHardcore: 'Cos\'è la modalità Hardcore?',
  hardcoreHelp: 'Una variante più difficile. La discussione avviene ancora, ma le regole cambiano:',
  hardcoreHelpBullets: {
    one: '1 impostore sempre (indipendentemente dal numero di giocatori)',
    two: 'Nessun indizio sulla categoria (la parola può essere qualsiasi)',
    three: 'Nessuna opzione per saltare il voto (tutti devono votare)',
    four: 'Parola casuale da tutte le categorie (built-in + custom)',
  },
}
```

- [ ] **Step 10.6: Add the same strings to de.ts**

```ts
lobby: {
  // ...existing keys
  votingTimer: 'Abstimmungszeit',
  votingTimerHint: 'Wie viel Zeit die Spieler zum Abstimmen haben',
  hardcore: 'Hardcore-Modus',
  hardcoreOn: 'Hardcore: AN',
  hardcoreOff: 'Hardcore: AUS',
  helpHardcore: 'Was ist der Hardcore-Modus?',
  hardcoreHelp: 'Eine schwierigere Variante. Die Diskussion findet weiterhin statt, aber die Regeln ändern sich:',
  hardcoreHelpBullets: {
    one: '1 Hochstapler immer (unabhängig von der Spieleranzahl)',
    two: 'Kein Kategorie-Hinweis (das Wort kann von überall kommen)',
    three: 'Keine Möglichkeit, die Stimme zu überspringen (alle müssen abstimmen)',
    four: 'Zufälliges Wort aus allen Kategorien (Built-in + Custom)',
  },
}
```

- [ ] **Step 10.7: Build the client to verify type consistency**

```bash
pnpm --filter @impostor/client build
```

Expected: build passes. All 6 files have the same shape, so the `Translations` type doesn't error.

- [ ] **Step 10.8: Commit**

```bash
git add client/src/i18n/
git commit -m "feat(client): i18n strings for votingTimer, hardcore mode, help modal"
```

---

## Task 11: Hardcore help modal (client)

**Files:**
- Create: `client/src/components/HardcoreHelpModal.tsx`

- [ ] **Step 11.1: Create the modal component**

Create `client/src/components/HardcoreHelpModal.tsx`:

```tsx
import { useT } from '../i18n/I18nContext';

interface HardcoreHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Small modal explaining the Hardcore mode. Triggered by the (?)
 * button next to the Hardcore label in the lobby. Reuses the standard
 * modal styles.
 */
export function HardcoreHelpModal({ open, onClose }: HardcoreHelpModalProps) {
  const t = useT();
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hardcore-modal-title"
    >
      <div
        className="modal modal--small"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title" id="hardcore-modal-title">
            {t.lobby.helpHardcore}
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label={t.common.close}
          >
            ✕
          </button>
        </div>
        <div className="modal__body">
          <p className="hardcore-help__intro">{t.lobby.hardcoreHelp}</p>
          <ul className="hardcore-help__bullets">
            <li>🕵️ {t.lobby.hardcoreHelpBullets.one}</li>
            <li>🚫 {t.lobby.hardcoreHelpBullets.two}</li>
            <li>🗳️ {t.lobby.hardcoreHelpBullets.three}</li>
            <li>🎲 {t.lobby.hardcoreHelpBullets.four}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: Add the CSS for the help modal bullets**

In `client/src/styles/globals.css`, add:

```css
/* ----------------------------------------------------------- */
/*  Hardcore Help Modal                                          */
/* ----------------------------------------------------------- */

.hardcore-help__intro {
  margin: 0 0 var(--space-md);
  color: var(--text-secondary);
  line-height: 1.5;
}

.hardcore-help__bullets {
  margin: 0;
  padding-left: 1.25rem;
  color: var(--text-primary);
  line-height: 1.7;
}

.hardcore-help__bullets li {
  margin-bottom: 0.35rem;
}
```

Add this near the existing modal styles (search for `.contribute-modal__intro` for context).

- [ ] **Step 11.3: Build to verify the component compiles**

```bash
pnpm --filter @impostor/client build
```

Expected: build passes.

- [ ] **Step 11.4: Commit**

```bash
git add client/src/components/HardcoreHelpModal.tsx client/src/styles/globals.css
git commit -m "feat(client): HardcoreHelpModal with the 4-rule explanation"
```

---

## Task 12: Lobby UI — voting timer dropdown + hardcore toggle + help icon

**Files:**
- Modify: `client/src/screens/LobbyScreen.tsx`
- Modify: `client/src/styles/globals.css`

- [ ] **Step 12.1: Update LobbyScreen imports**

In `client/src/screens/LobbyScreen.tsx`, add to the imports:

```ts
import { useState } from 'react';  // already imported
import { ALLOWED_VOTING_TIMERS } from '@impostor/shared';
import { HardcoreHelpModal } from '../components/HardcoreHelpModal';
import { CustomSelect, type CustomSelectOption } from '../components/CustomSelect';  // already imported
```

- [ ] **Step 12.2: Add state for the help modal and the new settings**

In `LobbyScreen`, add (next to the existing `useState` calls):

```ts
const [hardcoreHelpOpen, setHardcoreHelpOpen] = useState(false);
```

- [ ] **Step 12.3: Build the voting timer option list**

In `LobbyScreen`, add (after the existing `categoryOptions` definition):

```ts
const votingTimerOptions: CustomSelectOption<number>[] = ALLOWED_VOTING_TIMERS.map((s) => ({
  value: s,
  label: `${s}s`,
}));
```

- [ ] **Step 12.4: Add the voting timer + hardcore rows to the settings panel**

In `LobbyScreen`, find the existing settings panel (the block with `settings-panel__row` for max players, category, impostors). After the impostors row, add:

```tsx
{/* Voting timer (host picks) */}
<div className="settings-panel__row">
  <label className="settings-panel__label">{t.lobby.votingTimer}</label>
  <CustomSelect
    value={settings?.votingTimer ?? 30}
    options={votingTimerOptions}
    onChange={(v) => updateSettings({ votingTimer: v as 15 | 30 | 45 | 60 })}
    ariaLabel={t.lobby.votingTimer}
  />
</div>

{/* Hardcore mode toggle + help */}
<div className="settings-panel__row settings-panel__row--hardcore">
  <label className="settings-panel__label">
    {t.lobby.hardcore}
    <button
      type="button"
      className="help-icon"
      onClick={() => setHardcoreHelpOpen(true)}
      aria-label={t.lobby.helpHardcore}
      title={t.lobby.helpHardcore}
    >
      ?
    </button>
  </label>
  <label className="toggle-switch">
    <input
      type="checkbox"
      checked={settings?.hardcore ?? false}
      onChange={(e) => updateSettings({ hardcore: e.target.checked })}
    />
    <span className="toggle-switch__slider" />
  </label>
</div>
```

- [ ] **Step 12.5: Render the HardcoreHelpModal at the end of the component**

At the end of the LobbyScreen's return, after the existing `ConfirmationModal` for kick, add:

```tsx
<HardcoreHelpModal
  open={hardcoreHelpOpen}
  onClose={() => setHardcoreHelpOpen(false)}
/>
```

- [ ] **Step 12.6: Add the CSS for the toggle switch + help icon**

In `client/src/styles/globals.css`, add (near the existing settings-panel styles):

```css
/* Hardcore row layout: label with help icon, toggle on the right */
.settings-panel__row--hardcore {
  /* override column-on-mobile default from .settings-panel__row */
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.settings-panel__row--hardcore .settings-panel__label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: all 0.15s ease;
}

.help-icon:hover,
.help-icon:focus-visible {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  outline: none;
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex: 0 0 auto;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-switch__slider {
  position: absolute;
  inset: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-switch__slider::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: all 0.2s ease;
}

.toggle-switch input:checked + .toggle-switch__slider {
  background: var(--accent-warning);
  border-color: var(--accent-warning);
}

.toggle-switch input:checked + .toggle-switch__slider::before {
  transform: translateY(-50%) translateX(20px);
  background: #1a1500;
}
```

Also, override the existing 720px media query so the hardcore row stays horizontal on mobile too. Find the `@media (max-width: 720px)` block and add:

```css
@media (max-width: 720px) {
  /* ... existing rules ... */
  .settings-panel__row--hardcore {
    flex-direction: row;
    align-items: center;
  }
}
```

- [ ] **Step 12.7: Build to verify**

```bash
pnpm --filter @impostor/client build
```

Expected: build passes. The toggle and help icon are functional.

- [ ] **Step 12.8: Commit**

```bash
git add client/src/screens/LobbyScreen.tsx client/src/styles/globals.css
git commit -m "feat(client): votingTimer dropdown + hardcore toggle + help icon in lobby"
```

---

## Task 13: Hide category in DiscussionScreen + skip in VotingTable when hardcore

**Files:**
- Modify: `client/src/screens/DiscussionScreen.tsx`
- Modify: `client/src/components/VotingTable.tsx`

- [ ] **Step 13.1: Hide the category card in DiscussionScreen when hardcore is on**

In `client/src/screens/DiscussionScreen.tsx`, find the block that renders the category card. It looks like:

```tsx
{/* Category */}
{category && (
  <div className="card" ...>
    ...
  </div>
)}
```

Wrap the condition with `&& !settings?.hardcore`:

```tsx
{/* Category — hidden in hardcore mode (no hint) */}
{category && !settings?.hardcore && (
  <div className="card" ...>
    ...
  </div>
)}
```

To make `settings` available, add to the imports / destructure at the top of the component:

```ts
const settings = useRoomStore((s) => s.settings);
```

- [ ] **Step 13.2: Hide the "Saltar voto" / "Skip vote" button in VotingTable when hardcore is on**

In `client/src/components/VotingTable.tsx`, find the action buttons section at the bottom (the `<div className="voting-table__actions">` block). It has a Skip button and a Vote button. Wrap the Skip button with a condition:

```tsx
<div className="voting-table__actions">
  {!hardcore && (
    <button
      onClick={handleSkip}
      disabled={locked}
      className="btn btn--ghost"
    >
      {t.voting.skip}
    </button>
  )}

  <button
    onClick={handleConfirm}
    disabled={!selectedId || locked}
    className="btn btn--danger"
  >
    {t.voting.castVote}
  </button>
</div>
```

Add a `hardcore` prop to `VotingTableProps`:

```ts
interface VotingTableProps {
  // ...existing
  hardcore?: boolean;
}

export function VotingTable({
  // ...existing
  hardcore = false,
}: VotingTableProps) {
```

- [ ] **Step 13.3: Pass `hardcore` from VotingScreen**

In `client/src/screens/VotingScreen.tsx`, find the `VotingTable` usage. Add `hardcore={settings?.hardcore}`:

```tsx
<VotingTable
  players={players}
  currentPlayerId={myId}
  isSpectator={isSpectator}
  hasVoted={hasVoted}
  hardcore={settings?.hardcore}
  onVote={(targetId) => vote({ targetId })}
/>
```

Add `settings` from `useRoomStore`:

```ts
const settings = useRoomStore((s) => s.settings);
```

- [ ] **Step 13.4: Build to verify**

```bash
pnpm --filter @impostor/client build
```

Expected: build passes. The hardcoded modes visually hide the category and skip button.

- [ ] **Step 13.5: Commit**

```bash
git add client/src/screens/DiscussionScreen.tsx client/src/screens/VotingScreen.tsx client/src/components/VotingTable.tsx
git commit -m "feat(client): hide category + skip-vote in hardcore mode"
```

---

## Task 14: Deploy

**Files:**
- (no file changes)

- [ ] **Step 14.1: Build the client**

```bash
pnpm --filter @impostor/client build
```

Expected: build passes.

- [ ] **Step 14.2: Run all server tests**

```bash
pnpm --filter @impostor/server test
```

Expected: 111+ tests pass. New tests:
- 5 audit logger tests
- 4 WordBank size/quality tests
- 2 votingTimer tests
- 4 re-rol tests
- 2 hardcore tests
- 1 sitemap/robots test (if added)

Total: ~18 new tests + 111 existing ≈ 129 tests.

- [ ] **Step 14.3: Deploy via the existing script**

```bash
python "F:\web impostor\scripts\deploy.py"
```

Expected: full deploy (client + server), restart, verify shows 200s.

- [ ] **Step 14.4: Commit the deploy (no code changes, just marker)**

```bash
git commit --allow-empty -m "chore: deploy phase 1 (categories, voting timer, re-rol, hardcore, audit, SEO)"
```

---

## Self-Review

1. **Spec coverage**:
   - 1. Categorías → Task 4 ✅
   - 2. Voting timer → Tasks 1, 5, 10, 12 ✅
   - 3. Re-rol → Tasks 1, 6 ✅
   - 4. Hardcore + help → Tasks 1, 7, 8, 10, 11, 12, 13 ✅
   - 5. Audit log → Tasks 2, 3, 8 ✅
   - 6. Sitemap + robots → Task 9 ✅

2. **Placeholder scan**: no TBD, no "implement later", no "similar to". Every step has actual content.

3. **Type consistency**:
   - `RoomSettings.votingTimer: 15 | 30 | 45 | 60` defined in Task 1, used in Task 5 (server), Task 10 (i18n), Task 12 (client)
   - `RoomSettings.hardcore: boolean` defined in Task 1, used in Task 7 (server), Task 13 (client)
   - `selectImpostors(activePlayers, count, excludeIds?)` — same signature in Task 6
   - `logEvent(type, data)` — same signature in Tasks 2, 3, 7, 8
   - `HardcoreHelpModal` — created in Task 11, used in Task 12

   No drift detected.

4. **Gaps found and fixed during self-review**: none. All spec items map to tasks.
