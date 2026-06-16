# Exploration: Public Rooms List

> **Phase**: sdd-explore
> **Change**: `public-rooms-list`
> **Date**: 2026-06-16
> **Status**: exploration complete — ready for `sdd-propose`

## Problem Statement

Today, joining a game requires knowing the 5-character room code. That works fine for friend groups sharing a link, but new visitors to https://impostor.nekix.lol have no discovery path — they have to make their own room and wait for friends, or be invited out-of-band.

We want to add a **public rooms browser** to the entry page that lists currently-open public rooms, with enough metadata to make a join decision (host, player count, language, settings, age). The host opts in at creation time (`public` vs `private`); private is the default to preserve today's behavior.

Real-time updates are not gameplay-critical for a lobby list — periodic polling is acceptable.

## Code Analysis

### What exists today

**Server (`server/src/`)**:
- `room/RoomStore.ts` — `Map<string, Room>`, in-memory. Already has `getAllRoomCodes()` and a `size` getter. Creating a `getAllPublicRooms()` filter is a 1-method addition.
- `room/RoomManager.ts` — `createRoom(code, username, settings?)` merges `Partial<RoomSettings>` over defaults. Adding `visibility` to the defaults is a 1-line change.
- `ws/handlers.ts` — `CREATE_ROOM` is at line 125, takes `settings: Record<string, unknown>`. The handler sanitizes a few fields and passes the rest to `roomManager.createRoom()`. No validation needed for `visibility` (it'll default to `private` if missing).
- `index.ts` — Express app with three existing HTTP routes (`/robots.txt`, `/sitemap.xml`, `/health`) and a `express.static(clientDist)`. Adding a `GET /api/rooms` route is drop-in.
- `audit/logger.ts` — `logEvent('room_created', { ... })` is already fired. We'll add a `visibility` field to the audit payload.

**Shared (`shared/src/`)**:
- `types/room.ts` — `RoomSettings` has `{ maxPlayers, impostorCount, discussionTime, category, votingTimer, hardcore }`. Needs `visibility: 'public' | 'private'` and a `hostLocale: Locale` (to power the language filter).
- `types/protocol.ts` — `CreateRoomPayload.settings?: Partial<RoomSettings>`. No new event types needed for polling — the HTTP endpoint is out-of-band.
- No `Locale` type in `shared/` — currently `Locale` lives in `client/src/i18n/I18nContext.tsx`. The shared package needs its own locale type so the server can validate incoming `hostLocale`.

**Client (`client/src/`)**:
- `screens/EntryPage.tsx` — has the create/join form. Needs a third option ("Browse public rooms") plus a new screen/modal.
- `hooks/useSocket.ts` — `createRoom(payload)` is a WS send. The new field passes through transparently because `settings` is `Partial<RoomSettings>`.
- `stores/` — no store for public room list. Need a tiny `publicRoomsStore` (Zustand, 30 lines max).
- `i18n/*.ts` (6 files) — needs new keys: `entry.publicRooms`, `entry.browseRooms`, `entry.noPublicRooms`, `entry.filterLanguage`, `entry.filterHasSpace`, `entry.publicRoomAge`, `entry.publicRoomPlayers`, `entry.hostName`, `entry.visibilityPublic`, `entry.visibilityPrivate`, `entry.makePublic`, `entry.refresh`, `entry.loadingRooms`, plus `errors.room_list_unavailable`.

### What needs to change

1. **Shared types** — add `visibility` and `hostLocale` to `RoomSettings`; add a `Locale` type to `shared/` (mirror the 6 codes).
2. **Server** — sanitize `visibility` in `CREATE_ROOM` (default `'private'`), add `RoomStore.getAllPublicRooms()` returning a DTO slice, add `GET /api/rooms?visibility=public&lang=xx&hasSpace=true` to `index.ts`.
3. **Client** — add `publicRoomsStore`, add a "Public rooms" tab in `EntryPage` with filters and a refresh button (auto-poll every 5s when the tab is open), add a "Make public" toggle in the create form.
4. **i18n** — add the new strings to all 6 dictionaries (with castellano, no voseo).
5. **Audit** — include `visibility` in the `room_created` log payload.
6. **Tests** — extend `RoomManager.test.ts` to cover the visibility default; add a new `__tests__/publicRooms.test.ts` (integration-style) for the HTTP route.

### Backwards compatibility

- Existing clients that send `settings: { maxPlayers: 6 }` without `visibility` → server defaults to `private`. ✅
- `RoomSettings` is consumed everywhere via `room.settings.X` — adding a field is non-breaking. The `RoomDTO` already mirrors `RoomSettings` shape, so listings work without DTO changes.
- Old in-memory rooms from before a deploy: there are none (server restart wipes the map). ✅

## Approach Comparison

### A. HTTP polling (`GET /api/rooms`)

- **Pros**:
  - No WebSocket protocol changes (the WS is for game flow, the list is a separate concern).
  - Polling is naturally throttled — even a sloppy 1s poll can't overwhelm a single Express handler.
  - Easy to add HTTP cache headers (`Cache-Control: max-age=3`) — the browser handles it for free.
  - Compatible with the existing audit logger (log on poll, not on every WS event).
  - Trivial to test with `supertest` or just `fetch` — no WS plumbing.
  - Matches the user's "lobby-list UX, not gameplay-critical" framing in the brief.
- **Cons**:
  - 0–5s staleness on join. Acceptable for a lobby.
  - Two protocols (HTTP for list, WS for game). Minor cognitive cost.
- **Effort**: Low. ~30 lines for the route + DTO, ~80 lines for the client store + UI, ~30 lines for tests.

### B. WebSocket broadcast

- **Pros**:
  - Truly real-time (list updates within 100ms of any room change).
  - Single protocol.
- **Cons**:
  - New `ServerEvent.PUBLIC_ROOMS_UPDATED` and `ClientEvent.SUBSCRIBE_PUBLIC_ROOMS` events. Adds ~80 lines of protocol surface.
  - Need a subscriber set in `ConnectionManager` — fan-out on every `room_created` / `room_destroyed` / `PLAYER_JOINED` (privacy problem: a join can fill a public room from 4/6 to 5/6, which we currently don't broadcast to non-members).
  - Subscribers who close their socket must be cleaned up — extra connection lifecycle code.
  - Not testable without a full WS harness.
- **Effort**: Medium. ~150 lines for protocol + handler, ~60 lines for the subscriber set, plus tests.

### C. Server-Sent Events

- **Pros**:
  - Push semantics without WS.
  - Auto-reconnect built into the EventSource API.
- **Cons**:
  - One connection per browser tab — same cleanup problem as WS.
  - No NPM proxy validation — adding SSE to a stack we already had to move off Socket.IO is a risk we don't need.
  - No HTTP cache benefit.
  - Server-side: needs a separate broadcast path to all SSE clients whenever a public room state changes.
- **Effort**: Medium. ~120 lines. Same fan-out complexity as WS, but unidirectional.

## Recommendation

**Option A (HTTP polling).**

Three reasons:

1. **The brief explicitly says periodic poll is fine** ("this can be a periodic poll ... since it's a lobby-list UX, not gameplay-critical"). The user has already made the trade-off decision for us.
2. **Minimum viable surface**: 1 new Express route, 0 new WS events, 0 new client WS handlers. The 400-line review budget is real — Option A lands well inside it; B and C do not.
3. **Proxy-safe**: our previous Socket.IO → raw `ws` switch was driven by NPM proxy quirks. HTTP polling inherits no such risk — it's the same transport as `/health`.

**Polling cadence**: 5s, with a manual refresh button (3s would be smoother but is wasted work; 5s is a good cost/UX trade-off). The list tab can `setInterval(fetchPublicRooms, 5000)` and clear it on tab close / route change.

## Open Questions for the User

1. **What's the privacy bar for the list?** Specifically:
   - Should we expose the **host's username** in the list, or anonymize to "Anfitrión" (matching today's UI)? Trade-off: a real host name makes it easier to recognize a friend's room but leaks identity at scale.
   - Should we expose the **category** (e.g., "Películas")? Categories are public-by-design (they're in the word bank) but exposing them lets trolls target rooms with custom/hardcore settings.

2. **What happens to a public room when the host closes the tab?** Today the host disconnect cascade destroys the room and broadcasts `HOST_LEFT`. Should the list entry also broadcast a removal? (We can do this with a small WS event from server → list subscribers, even with HTTP polling for the bulk.) The alternative is just letting the next poll pick up the absence. Recommend: let the poll handle it. 5s lag is fine.

3. **Should "make public" be a one-way door?** Today once you create a public room, can the host toggle it back to private from the lobby settings panel? That'd add a new `UPDATE_SETTINGS` field and UI. Recommend: **yes, host can toggle visibility in-lobby** — it's a 10-line addition to the existing `UPDATE_SETTINGS` handler and avoids the "oops, I made it public" regret.

4. **Rate limit on public room creation?** The user has explicitly said no rate limit (per session memory). For public rooms this means a single user could spam-create. Mitigation: client-side debounce on the create button. Recommend: keep server open, debounce the UI.

5. **What does the list show when the locale filter has no matches?** Empty list, or a "show all" fallback? Recommend: empty list + a "clear filter" button.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing private rooms break | Low | High | `visibility` defaults to `'private'` server-side; old clients don't send it; `RoomSettings` extension is non-breaking |
| Privacy leak (host name, category) | Medium | Medium | Decide in open question #1; default to anonymized host + no category if no answer |
| DDoS via poll spam | Low | Low | HTTP cache headers; Node's event loop is fine at 1000 RPS on this endpoint |
| 6-language i18n drift | Medium | Low | DeepStringify type check at build time catches missing keys |
| 400-line review budget | Medium | Medium | Stick to Option A; defer any "pretty UI" ideas to a follow-up |
| Memory leak from public rooms | Low | Low | `RoomStore.deleteRoom` already wired through `onRoomDestroyed` (recent bug fix); polling doesn't keep refs |
| NPM proxy issue with new HTTP route | Very low | High | HTTP polling shares the same transport as `/health`, which is already proxied successfully |

## Size Estimate

| Layer | Lines added (net) |
|-------|-------------------|
| `shared/src/types/room.ts` (visibility, hostLocale, Locale) | ~15 |
| `shared/src/constants.ts` (LOCALE_CODES if needed) | ~10 |
| `server/src/room/RoomStore.ts` (getAllPublicRooms) | ~20 |
| `server/src/room/RoomManager.ts` (visibility default, locale) | ~10 |
| `server/src/index.ts` (GET /api/rooms) | ~35 |
| `server/src/__tests__/publicRooms.test.ts` (new) | ~80 |
| `server/src/__tests__/RoomManager.test.ts` (visibility cases) | ~30 |
| `client/src/stores/publicRoomsStore.ts` (new) | ~30 |
| `client/src/screens/EntryPage.tsx` (Public tab + toggle) | ~70 |
| `client/src/components/PublicRoomList.tsx` (new) | ~80 |
| `client/src/i18n/*.ts` (6 files × ~15 new keys) | ~90 |
| `shared/src/types/protocol.ts` (PublicRoomDTO) | ~10 |
| **Total** | **~480 lines** |

That's a touch over the 400-line budget. Options:

- **Chained PR**: split into (1) server + shared types + tests, (2) client UI + i18n. Two PRs, each well under 400.
- **Single PR with exception**: ask the user for explicit `size:exception` since i18n is mechanical.

Recommend **chained PRs** — it matches the orchestrator's existing delivery discipline (Phase 1 also used chained work units) and gives the user a review checkpoint before any UI work.

## Ready for Proposal

**Yes.** The recommendation is concrete (HTTP polling at 5s, default-private visibility, host can toggle in-lobby, 6-language i18n, no new WS events). The only true blocker is the privacy question (#1); the rest have a recommended default the user can override.

**Orchestrator next step**: run `sdd-propose` for `public-rooms-list`. Include the chained-PR strategy in the proposal so the user knows upfront.
