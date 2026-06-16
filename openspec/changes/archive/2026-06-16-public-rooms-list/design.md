# Design: Public Rooms List

## Technical Approach

Extend `RoomSettings` with `visibility` and `hostLocale`, expose `GET /api/rooms` (HTTP, up to 50 sanitized DTOs), and let the entry page list them via a 5 s polling hook. Chained PRs: **PR 1** = server + shared types, **PR 2** = client + 6-file i18n. WS is unchanged except for `UPDATE_SETTINGS`. Inherits `/health` transport — no NPM proxy risk.

## Architecture Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | HTTP route location | `server/src/index.ts` next to `/health` | Low traffic, 1 route, matches existing style. |
| 2 | `getAllPublicRooms` filter | Single-pass `Map` iteration, inline predicate | One call, O(N) on tiny in-memory Map, no DTO leakage. |
| 3 | DTO construction site | Inside `RoomStore.getAllPublicRooms()` | Spec strictly limits DTO fields (privacy bar); construction is the security boundary. |
| 4 | `UPDATE_SETTINGS` extension | Same per-field pattern as `category` / `votingTimer` | Symmetric with existing code. |
| 5 | Client polling placement | `usePublicRooms` hook + Zustand store + `PublicRoomList` component | Mirrors `useSocket` style; keeps `EntryPage` form-focused. |
| 6 | Audit `room_created` | Add `visibility` and `hostLocale` to existing payload | No new event = no new client/server wiring. |
| 7 | Response shape | Always `{ rooms, hasMore, totalCount }` | Uniform contract. Reinterprets the spec's "empty list" scenario as an empty `rooms` array. |

## Data Flow

```
 HOST                                              GUEST
   │ CREATE_ROOM { visibility, hostLocale }         │
   ▼                                                │
 ws/handlers.ts → RoomManager.createRoom            │
   ▼                                                │
 RoomStore.rooms.set(code, Room { settings })       │
   │                                                │ GET /api/rooms (5 s poll)
   │                                                ▼
   │                                Express: filter (public, ≥1 ACTIVE)
   │                                res.json({ rooms, hasMore, totalCount })
   ▼                                                ▼
 UPDATE_SETTINGS { visibility: 'public' }   PublicRoomList → click "Join"
   ▼ sanitize                              fills code field → JOIN_ROOM
 room.settings.visibility = 'public'
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `shared/src/types/locale.ts` | Create | `Locale` (6 codes) |
| `shared/src/types/room.ts` | Modify | `RoomSettings`: + `visibility`, + `hostLocale` |
| `shared/src/types/protocol.ts` | Modify | `UpdateSettingsPayload`: + `visibility?`, + `hostLocale?` |
| `shared/src/types/api.ts` | Create | `PublicRoomDTO` + `PublicRoomsResponse` |
| `shared/src/constants.ts` | Modify | `DEFAULT_VISIBILITY`, `ALLOWED_LOCALES`, `MAX_PUBLIC_ROOMS_RETURNED` |
| `client/src/i18n/I18nContext.tsx` | Modify | Import `Locale` from `@impostor/shared` (re-export) |
| `server/src/room/RoomStore.ts` | Modify | `getAllPublicRooms(): PublicRoomDTO[]` |
| `server/src/room/RoomManager.ts` | Modify | Sanitize `visibility` (default `'private'`), `hostLocale` (default `'en'`); reject invalid |
| `server/src/ws/handlers.ts` | Modify | `UPDATE_SETTINGS` validates new fields; audit `room_created` includes them |
| `server/src/index.ts` | Modify | `GET /api/rooms` with `Cache-Control: max-age=3` |
| `client/src/hooks/usePublicRooms.ts` | Create | 5 s `setInterval`, `refresh()`, auto-stop on unmount |
| `client/src/stores/publicRoomsStore.ts` | Create | Zustand: `{ rooms, hasMore, totalCount, loading }` |
| `client/src/components/PublicRoomList.tsx` | Create | List + filters + refresh + overflow hint |
| `client/src/screens/EntryPage.tsx` | Modify | "Public rooms" tab; "Make public" toggle in create form (auto-sets `hostLocale`) |
| `client/src/screens/LobbyScreen.tsx` | Modify | Public/Private radio in settings panel |
| `client/src/i18n/{en,es,pt,fr,it,de}.ts` | Modify | ~12 keys: `entry.publicRooms.*`, `lobby.visibility.*` |

## Interfaces / Contracts

```ts
// shared/src/types/locale.ts (new)
export type Locale = 'en' | 'es' | 'pt' | 'fr' | 'it' | 'de';

// shared/src/types/api.ts (new)
export interface PublicRoomDTO {
  roomCode: string;
  hostFirstName: string;   // first whitespace-delimited token
  category: string | null;
  hostLocale: Locale;
  playerCount: number;     // ACTIVE only
  maxPlayers: number;
  ageSeconds: number;
}
export interface PublicRoomsResponse {
  rooms: PublicRoomDTO[];
  hasMore: boolean;
  totalCount: number;
}
```

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | `getAllPublicRooms` — filter, DTO shape, empty case, cap, `hasMore`/`totalCount`, empty-room filter | New `publicRooms.test.ts`; `beforeEach` fresh `RoomStore` |
| Unit | `RoomManager.createRoom` — defaults (`'private'`/`'en'`), reject invalid `visibility` | Extend `RoomManager.test.ts` |
| Integration | `GET /api/rooms?visibility=public` — 200 OK, `Cache-Control`, query filters, DTO field set | New `publicRooms.http.test.ts`; Express on random port, `node:http` like `integration.test.ts` |
| Client | Manual smoke (no client runner — known gap, AGENTS.md) | Test guide in `tasks.md`: 2 public rooms, 5 s polling, toggle visibility, refresh, join |

## Migration / Rollout

- **PR 1 (server + shared types)** — shared types, server route, store, manager, handlers, server tests, I18nContext re-export. ~210 lines. Rollback: revert. `visibility` defaults to `'private'` → no client breakage.
- **PR 2 (client + i18n)** — hook, store, component, EntryPage, LobbyScreen, 6 i18n files. ~280 lines. Compile-time dependency on PR 1's `PublicRoomDTO`. Rollback: revert client; existing public rooms stay functional, just not discoverable.

No data migration. In-memory only. Single-container deploy; visibility default applies at next process start.

## Open Questions

None. All resolved by the proposal (visibility default, list filter scope, refresh cadence, max 50 cap, empty room lifecycle) and the spec's sanitization requirement. Decision #7 reinterprets the spec's "empty list" wording as an empty `rooms` array for a uniform response contract.
