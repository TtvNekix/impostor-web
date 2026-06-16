# El Impostor — Phase 1: Gameplay, Audit & SEO

**Date**: 2026-06-16
**Status**: Draft
**Author**: TtvNekix + assistant

## Goal

Make the existing real-time multiplayer social deduction game at
`https://impostor.nekix.lol` feel like a more complete, polished
product. Phase 1 focuses on **gameplay depth, observability, and SEO
baseline**. Future phases will add social features (chat, reactions,
avatars) and content persistence.

## Scope

**In scope** (Phase 1):

1. Expand the built-in word bank from 5 categories to ~30 categories
2. Configurable voting timer (15/30/45/60s)
3. Re-rol rule: a player cannot be the impostor 3 times in a row
4. Hardcore mode (toggle): 1 impostor always, no category hint, no
   skip-vote option, random word from all categories
5. Hardcore help modal: small (?) icon in the lobby that explains
   the mode
6. Server-side audit log: every meaningful game event sent to a
   private Discord webhook. No privacy filtering — the user owns
   the Discord and wants full visibility
7. Sitemap + robots.txt served by Express

**Out of scope** (deferred to later phases):

- Avatars, animations, loading skeletons, in-game chat, reactions
- Shared/persistent custom category lists
- Status page
- i18n improvements (more languages, dynamic translations)
- Modo "Por imagen" (separate spec)

## Features

### 1. Expand built-in word bank

**Why**: The current 5 categories × ~16 words = ~80 words is small.
After playing a few rounds the word pool feels repetitive. A larger,
better-curated bank gives more variety and replay value.

**What changes**:

- `server/src/data/word-bank.json` grows from 5 to ~30 categories
- ~50% gaming/tech (matches the existing vibe): `videojuegos`,
  `esports`, `internet`, `anime`, `programacion`, `hardware`, etc.
- ~50% general/divertido: `comida`, `animales`, `profesiones`,
  `deportes`, `musica`, `peliculas`, `marcas`, `lugares`, `objetos`,
  `paises`, etc.
- 12-20 words per category. Total ~400-500 words.
- Each word carefully chosen to be:
  - ASCII (no `ñ` or accents — keeps word bank machine-friendly)
  - Conversation-sparking (things people can describe or hint at)
  - Unambiguous (avoid "ratón" — animal vs computer peripheral)
- **Review** the 5 current categories (`videojuegos`, `internet`,
  `juegos-de-mesa`, `esports`, `gaming-cultura`): keep, drop, or
  rewrite each based on word quality
- **No breaking changes**: custom categories (host-added) keep
  working as today. The `WordBank` class supports `addCategory` and
  `addWords` regardless of how many built-ins exist

**Data shape** (no change):

```ts
type WordBankData = {
  categories: Array<{ name: string; displayName: string; words: string[] }>;
}
```

**Server behavior** (no change): `randomWord()` and
`randomWordFromCategory(name)` already work over any number of
categories. New categories flow through automatically.

**Client behavior** (no change): categories are fetched via the
`categories` server event on connect and stored in
`useCategoryStore`. The lobby selector lists whatever the server
returns.

**Hardcore interaction**: when `hardcore=true`, the server picks a
random word from ALL built-in + custom categories (ignoring the
room's selected category). This uses the existing `randomWord()` —
no new method needed. See feature 4 for the full hardcore flow.

### 2. Configurable voting timer

**Why**: 30s is the only option today. Some groups want longer (deep
strategy), some want shorter (faster pace). A multi-choice host
setting matches user expectations from similar party games.

**What changes**:

- `RoomSettings` gains `votingTimer: 15 | 30 | 45 | 60`
- Default: `30` (no visible change for existing users)
- Host selects in the lobby, next to `maxPlayers` and `category`
- **Locked once the match starts** (same as `maxPlayers`)
- Server `startVoting()` uses `room.settings.votingTimer * 1000`
  instead of hardcoded `VOTING_TIMER * 1000`
- Client `VotingScreen` already reads from `phaseEndsAt`; no UI
  change for displaying the timer

**Data shape** (additive):

```ts
interface RoomSettings {
  maxPlayers: number;
  impostorCount: number;   // ignored if hardcore=true
  discussionTime: number;  // ignored if hardcore=true
  category: string | null;
  votingTimer: 15 | 30 | 45 | 60;  // NEW, default 30
  hardcore: boolean;                 // NEW, default false (see feature 4)
}
```

**Wire protocol** (additive):

- `UpdateSettingsPayload.votingTimer?: 15 | 30 | 45 | 60`
- `RoomSettings` shared type gains the two new fields

**Client UI**: dropdown or segmented control in the lobby settings
panel. Reuses the existing `.settings-panel__row` pattern.

### 3. Re-rol rule (no 3 times in a row)

**Why**: A small but important fairness fix. Without this, a player
can be randomly picked as impostor 3-4 times in a row, which makes
the game less fun for them. A "2 strikes then skip" rule is a
well-known pattern in social deduction games.

**What changes**:

- `Room` (or `RoomManager`) tracks `impostorHistory: string[]` —
  the socket IDs of the last 2 impostors, most recent last
- On `startMatch`, the impostor picker:
  1. Builds the candidate set as today
  2. Removes any player whose ID appears in BOTH slots of
     `impostorHistory` (i.e., was impostor in the last 2 rounds)
  3. If the resulting set is empty, removes only the oldest entry
     (FIFO expiry) so at least one candidate is available
  4. Picks from the filtered set as today
- After picking, shift `impostorHistory`: drop oldest, push new
- **Scope**: per-room. If everyone leaves and a new round starts,
  the history is empty (no carryover)
- **Hardcore interaction**: when `hardcore=true`, only 1 impostor is
  picked, so the same logic applies (it's the candidate set that
  shrinks, not the count)

**Edge cases**:

- Room with 3 players, all 3 already impostor twice → all
  candidates blocked → FIFO removes the oldest block → that
  player becomes the next impostor. Tested explicitly.
- First match in a room → `impostorHistory` is empty → no
  exclusion → picks normally

**Data shape** (internal, not on the wire):

```ts
// In Room or RoomManager (server-side only)
private impostorHistory: string[] = [];  // last 2 impostor socket IDs
```

### 4. Hardcore mode (toggle)

**Why**: Players who have played a few rounds want a harder, more
mysterious variant. Hardcore removes two big info advantages (the
category hint, and the option to skip voting) and forces 1 impostor
regardless of count. Discussion stays so the game is still winnable
through conversation.

**What changes**:

**Server (`GameEngine`)**:

- `RoomSettings.hardcore: boolean` (default `false`)
- When `startMatch` runs with `hardcore=true`:
  - `forcedImpostorCount = 1` (overrides the normal 1-or-2 logic)
  - Word picker uses `randomWord()` (ignores `room.settings.category`),
    so the word comes from any built-in OR custom category
  - `word_assigned` payload still contains only `{ word }` for
    non-impostors (no category field today; we don't add one)
- `startVoting` and `tallyAndEvaluate` are unchanged (normal flow)

**Client**:

- `LobbyScreen` shows a new settings row with a toggle switch
  labeled "Modo Hardcore" + a small `(?)` help button next to the
  label
- Toggling sends `update_settings({ hardcore: true/false })`
- `DiscussionScreen`: hide the category card when
  `settings.hardcore === true` (the `category` value is still
  available in the store, just don't render it)
- `VotingTable`: hide the "Saltar voto" / "Skip vote" button when
  `settings.hardcore === true`
- `RoleReveal`: no change — the impostor still gets `word: null`,
  non-impostors still get the word (just without the category hint
  since the card is hidden)
- A `HardcoreHelpModal` is shown when the user clicks the `(?)` icon.
  Contents: short title, description, 4-bullet list of what changes.
  Reuses the existing `modal` styles

**Data shape** (additive):

```ts
interface RoomSettings {
  // ...existing fields
  hardcore: boolean;  // NEW, default false
}
```

**Wire protocol** (additive):

- `UpdateSettingsPayload.hardcore?: boolean`

**Help modal text** (i18n strings, all 6 languages):

- Title: "What is Hardcore mode?" / "¿Qué es el modo Hardcore?" / etc.
- Body: short paragraph + 4 bullets:
  - 1 impostor always (regardless of player count)
  - No category hint (the word can be from any category)
  - No skip-vote option (everyone must vote for someone)
  - Random word from all built-in + custom categories

### 5. Server-side audit log + Discord webhook

**Why**: The user (sole maintainer) wants full visibility into what
the server is doing. Since the Discord webhook points to their
private server, there's no privacy concern. The audit log makes
debugging, balancing, and anti-cheat work possible.

**What changes**:

**New module: `server/src/audit/logger.ts`**

```ts
const WEBHOOK_URL = process.env.AUDIT_WEBHOOK_URL
  ?? 'https://discord.com/api/webhooks/1516416022872064100/nWm...';
```

A `logEvent(type: string, data: Record<string, unknown>)` function:

1. Builds a Discord message with the event name + key fields
2. Sends a `POST` with `fetch` (already used in the project)
3. `try/catch` swallows webhook failures — a Discord outage must
   not affect the game
4. Also writes a line to `stdout` (so `journalctl` shows it on the
   server)

**Events to log**:

| Event | Fields logged |
|-------|---------------|
| `room_created` | `code, maxPlayers, category, votingTimer, hardcore, hostUsername` |
| `room_joined` | `code, username, role: host\|guest` |
| `room_left` | `code, username, wasHost` |
| `match_started` | `code, roundNumber, impostorIds, wordAssignments: {socketId, word}` |
| `vote_cast` | `code, roundNumber, voterUsername, targetUsername, skipped` |
| `round_result` | `code, roundNumber, expelledUsername, wasImpostor, winner` |
| `match_ended` | `code, winner, durationSeconds, totalRounds` |
| `player_kicked` | `code, hostUsername, targetUsername` |
| `server_error` | `context, message, stack` |

**Hook points** in `server/src/ws/handlers.ts` and
`server/src/game/GameEngine.ts`:

- After each `case` body in the WS switch (room_created, room_joined,
  etc.)
- After `tallyAndEvaluate` for round_result
- After `startMatch` for match_started (need to thread the word
  assignments through)
- After the kick handler for player_kicked
- In a global `uncaughtException` and `unhandledRejection` handler
  for server_error

**Privacy**: none. The user explicitly said "no privacy filtering".
The webhook is their private Discord.

**Failure handling**: if the Discord webhook is rate-limited (30/min)
or down, the request is caught and ignored. A `console.warn` records
the failure for ops debugging.

**Cost**: a few extra ms per WS event. Acceptable. If the webhook is
slow, the game keeps running.

### 6. Sitemap + robots.txt

**Why**: SEO baseline. The site already has good meta tags and Open
Graph. A sitemap helps search engines discover `/` and `/play`. The
robots.txt prevents indexing of internal paths.

**What changes**:

**New routes in `server/src/index.ts`**:

```ts
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nAllow: /\n',
  );
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

**No client changes** — these are pure server routes.

## Architecture

### Modified files

| File | Change |
|------|--------|
| `server/src/data/word-bank.json` | Expand to ~30 categories, ~400+ words |
| `server/src/words/WordBank.ts` | No code change (data-driven) |
| `server/src/room/Room.ts` | Add `impostorHistory: string[]` field, helper methods |
| `server/src/room/RoomManager.ts` | Update `selectImpostors` to exclude blocked players, FIFO fallback |
| `server/src/game/GameEngine.ts` | Respect `settings.votingTimer` and `settings.hardcore` in `startMatch` and `startVoting`. Log `match_started` / `round_result` / `match_ended` |
| `server/src/ws/handlers.ts` | Log `room_created`, `room_joined`, `room_left`, `player_kicked`. Accept `hardcore` and `votingTimer` in `update_settings` |
| `server/src/index.ts` | Add `/robots.txt` and `/sitemap.xml` routes. Global `uncaughtException` handler |
| `server/src/audit/logger.ts` | **NEW** — `logEvent(type, data)` function |
| `shared/src/types/protocol.ts` | Add `votingTimer` and `hardcore` to `RoomSettings` and `UpdateSettingsPayload` |
| `shared/src/constants.ts` | Add `DEFAULT_VOTING_TIMER = 30` and `ALLOWED_VOTING_TIMERS = [15, 30, 45, 60]` |
| `client/src/screens/LobbyScreen.tsx` | Add toggle for `hardcore`, dropdown for `votingTimer`, `(?)` help button, hardcore help modal |
| `client/src/screens/DiscussionScreen.tsx` | Hide category card if `settings.hardcore` |
| `client/src/components/VotingTable.tsx` | Hide "Saltar voto" / "Skip vote" if `settings.hardcore` |
| `client/src/components/HardcoreHelpModal.tsx` | **NEW** — small modal explaining hardcore |
| `client/src/i18n/{en,es,pt,fr,it,de}.ts` | New strings: `lobby.hardcore`, `lobby.votingTimer`, `lobby.helpHardcore`, `lobby.hardcoreHelp` (modal content) |
| `client/src/hooks/useSocket.ts` | `updateSettings` already supports new fields via the shared type; nothing to change |

### New files

- `server/src/audit/logger.ts`
- `client/src/components/HardcoreHelpModal.tsx`

### Wire protocol

`UpdateSettingsPayload` grows two new fields:
```ts
{
  votingTimer?: 15 | 30 | 45 | 60;
  hardcore?: boolean;
}
```

No other wire protocol changes.

## Data flow

### Hardcore toggle flow

```
Host opens lobby
   │
   ▼
Host clicks Hardcore toggle → updateSettings({ hardcore: true })
   │
   ▼
Server validates: caller is host, phase is LOBBY
   │
   ▼
Server: room.settings.hardcore = true
Server: broadcast SETTINGS_UPDATED to all in room
   │
   ▼
All clients: useRoomStore.updateSettings({ hardcore: true })
   │
   ▼
UI re-renders:
  - Lobby: toggle shows ON
  - (Other screens render normally, hardcore is just stored)
   │
   ▼
Host clicks "Iniciar Partida" → startMatch
   │
   ▼
Server: startMatch sees hardcore=true
  - forcedImpostorCount = 1
  - word = randomWord() (ignores settings.category)
  - impostorHistory updates
  - Log match_started (with word assignments, all hardcoded details)
  - Broadcast GAME_STARTED with impostorIds
   │
   ▼
WORD_REVEAL → word_assigned (no category field exists today)
   │
   ▼
DISCUSSION phase
  - Client: hides category card (settings.hardcore === true)
  - Discussion proceeds as normal
   │
   ▼
VOTING phase
  - Client: hides "Saltar voto" button in VotingTable
  - Vote proceeds as normal
   │
   ▼
EVALUATION → GAME_OVER (or next round)
```

### Re-rol flow

```
startMatch(roomCode, callerSocketId)
   │
   ▼
Get active players from room
   │
   ▼
impostorHistory = last 2 impostor socket IDs (most recent last)
   │
   ▼
blockedSet = players whose ID is in BOTH impostorHistory slots
   │
   ▼
candidates = activePlayers \ blockedSet
   │
   ▼
if candidates is empty:
    candidates = activePlayers \ (only the OLDEST block)
    (FIFO expiry: drop the oldest history entry)
   │
   ▼
if activePlayers.length < 2:
    reject startMatch (already a server-side check)
   │
   ▼
if candidates is empty AND activePlayers < 2:
    (unreachable — caught by the length check)
   │
   ▼
Pick impostor from candidates (Fisher-Yates, existing)
   │
   ▼
Shift impostorHistory: drop oldest, push new
   │
   ▼
Build game state, return
```

### Audit log flow

```
WS handler runs (e.g., CREATE_ROOM case)
   │
   ▼
Build room, send ROOM_JOINED
   │
   ▼
logEvent('room_created', { code, maxPlayers, ..., hostUsername })
   │
   ├─ await fetch(WEBHOOK_URL, { method: 'POST', body: JSON.stringify(discordPayload) })
   │    (in a try/catch, errors are swallowed + logged to console)
   │
   └─ console.log('[audit]', type, JSON.stringify(data))
```

## Edge cases

1. **All players blocked in re-rol**: 3-player room where all 3
   have been impostor twice → FIFO drops the oldest block → that
   player becomes impostor. Tested explicitly.

2. **Re-rol + first match of a room**: `impostorHistory` is empty
   on room creation → no exclusion → normal pick. Tested.

3. **Hardcore with 1 player**: server's `startMatch` already
   requires `MIN_PLAYERS` (3) so this can't happen.

4. **Hardcore word selection with no custom categories**: the
   word comes from the ~30 built-ins. The game still works.

5. **Hardcore toggle during a match**: the server validates
   `phase === 'LOBBY'` in `update_settings`. If someone tries
   to toggle mid-game, the server rejects with a
   `not_in_room` / `game_in_progress` error.

6. **Voting timer of 0 or negative**: validation rejects anything
   outside `[15, 30, 45, 60]` with the existing
   `invalid_max_players`-style error code (or a new
   `invalid_voting_timer`).

7. **Webhook down**: `try/catch` + `console.warn`. Game continues
   unaffected. Ops can grep journalctl for the warnings.

8. **Sitemap with future query params**: the static XML only
   includes the bare paths. No dynamic pages exist yet.

9. **Re-rol across room destruction**: if all players leave and a
   new round is later started, the room is fresh. No history
   carries over (this is per-room state).

10. **Hardcore help icon on mobile**: the `(?)` is a real button
    with `onClick`. Tap → modal opens. Works without hover.

## Error handling

- **Webhook failures**: caught, logged to console, ignored. Game
  keeps running.
- **Invalid settings update**: server returns a `room_error` with
  `invalid_voting_timer` (new code) or `generic` for unknown
  fields. Client shows a toast.
- **Word bank empty after categories removed**: the server's
  `startMatch` already checks `isEmpty()` and returns
  `min_players`-style error. Hardcore uses `randomWord()` which
  falls back to all built-ins.
- **Missing hardcore field in old clients**: TypeScript
  `Partial<RoomSettings>` makes both old and new fields optional.
  The server defaults to `false`. The client always sets it on
  toggle.

## Testing strategy

- **Categorías**: update `WordBank.test.ts` to assert each
  category has 10-20 words, no duplicates within or across
  categories, all ASCII printable, no single-word ambiguity
  (manual review checklist for the human)
- **Voting timer**: `GameEngine.test.ts` — startVoting with
  custom `votingTimer` uses that value, not the constant
- **Re-rol**: new `RoomManager.test.ts` cases:
  - 3 players, history [A, A] → A is excluded
  - 3 players, history [B, A] → A is excluded
  - 3 players, history [B, A], all excluded → FIFO drops A's
    block → A is picked
  - 3 players, history [] (fresh) → no exclusion
  - 5 players, history [B, A], A picked → new history [A, B]
- **Hardcore**: `GameEngine.test.ts` — with `hardcore=true`:
  - 1 impostor always (even with 6 players)
  - `word_assigned` for non-impostors contains a word (no
    category field — verified by shape check)
  - startMatch uses `randomWord()`, ignoring `settings.category`
- **Audit log**: `audit/logger.test.ts` — logEvent with mocked
  fetch:
  - Sends correct payload to webhook URL
  - On fetch error, doesn't throw
  - On fetch success, doesn't throw
- **Sitemap + robots**: integration test that the routes return
  200 and the expected content-type

## Open questions

None at the time of writing.
