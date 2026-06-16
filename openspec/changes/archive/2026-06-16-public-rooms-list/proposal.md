# Proposal: Public Rooms List

## Intent

Visitors landing on https://impostor.nekix.lol have no discovery path today — joining requires a 5-character code shared out-of-band. We will add a **public rooms browser** to the entry page so anyone can see and join currently-open public rooms. Hosts opt in at creation time (`public` vs `private`); `private` stays the default to preserve today's behavior for friend groups. Updates are non-gameplay-critical, so periodic HTTP polling is acceptable.

## Scope

### In Scope

- `visibility: 'public' | 'private'` and `hostLocale: Locale` added to `RoomSettings` (shared).
- New `Locale` type in `shared/` (mirror the 6 codes) and `PublicRoomDTO` for listings.
- Server: `RoomStore.getAllPublicRooms()`, `GET /api/rooms` HTTP route with `visibility`, `lang`, `hasSpace` query params, `Cache-Control: max-age=3`.
- Server: visibility default = `'private'`; add `visibility` to `UPDATE_SETTINGS` so host can toggle in-lobby.
- Client: `publicRoomsStore` (Zustand), new `PublicRoomList` component, "Public rooms" tab + "Make public" toggle in `EntryPage`.
- 5s client-side polling while the list tab is open, with a manual refresh button.
- Max 50 rooms returned; "X more rooms exist" hint when over.
- i18n: ~15 new keys across all 6 dictionaries (castellano, no voseo).
- Audit: include `visibility` in the `room_created` log payload.
- Tests: visibility default in `RoomManager.test.ts`; new `__tests__/publicRooms.test.ts` for the HTTP route.

### Out of Scope (backlog)

- Chat / DMs, room passwords, deep links (`/room/ABC123`), custom skins, persistent sessions, room history, "report room" flow, friend lists, host-blocked-user lists, public room creation rate-limit (per session memory: debounce UI only).

## Capabilities

### New Capabilities

- `public-rooms-discovery`: HTTP-polled public rooms list with filters, host opt-in visibility, and host in-lobby toggle.

### Modified Capabilities

- `room-management`: `RoomSettings` extended with `visibility` and `hostLocale`; visibility default is `private`; existing rooms are unchanged.

## Approach

**HTTP polling at 5s on `GET /api/rooms`.** One Express route, zero new WS events, zero new client WS handlers. Inherits the `/health` transport — no NPM proxy risk. Browser cache headers handle the easy case. ~480 lines total is over the 400-line review budget → **chained PRs**:

| PR | Scope | ~Lines |
|----|-------|--------|
| **PR 1 (server)** | shared types (`Locale`, `PublicRoomDTO`, settings fields) + `RoomStore.getAllPublicRooms()` + `GET /api/rooms` + `UPDATE_SETTINGS` visibility + `RoomManager` default + audit field + tests | ~200 |
| **PR 2 (client + i18n)** | `publicRoomsStore` + `PublicRoomList` + `EntryPage` tab/toggle + polling hook + 6-language i18n | ~280 |

Each PR is independently shippable, has a clean rollback, and lands well inside budget.

## Open Questions — Resolved (user gave default `auto`)

1. **Privacy bar** → expose **host first name only** + **category** in the DTO. Hide `discussionTime`, `votingTimer`, `hardcore`. Rationale: a recognizable host is the point of discovery ("oh, that's my friend"); category is already in the public word bank; hardcore flags would let trolls filter for edge settings.
2. **List filter UI scope** → **simple client-side filter** for `lang` and `hasSpace` only. No category filter, no player-count range. Rationale: keeps UI under 80 lines and matches "browse, not curate".
3. **List refresh cadence** → **5s polling + manual refresh button**. Rationale: 3s is wasted work; 10s feels stale. 5s is the standard lobby-list sweet spot. Manual refresh covers the "I just want to see it now" case without 1s polling.
4. **Max public rooms shown** → **cap at 50**, with a `"X more rooms exist — refine your filter"` hint when truncated. Rationale: 50 covers any realistic lobby and keeps the response payload under ~10 KB. A 51st public room is rare; the hint nudges the user to filter rather than paginate.
5. **Empty room lifecycle** → **`getAllPublicRooms` filters out rooms with 0 ACTIVE players** (defense in depth — `RoomStore.deleteRoom` already destroys empty rooms after host disconnect, but a brief race window exists if the host leaves and no replacement host is assigned). The DTO does not include such a room even for one poll cycle.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `shared/src/types/room.ts` | Modified | Add `visibility`, `hostLocale`; add `PublicRoomDTO` |
| `shared/src/types/locale.ts` | New | Mirror the 6 locale codes |
| `server/src/room/RoomStore.ts` | Modified | `getAllPublicRooms()` filter |
| `server/src/room/RoomManager.ts` | Modified | Visibility default + sanitize |
| `server/src/index.ts` | Modified | `GET /api/rooms` route |
| `server/src/ws/handlers.ts` | Modified | `UPDATE_SETTINGS` accepts `visibility` |
| `server/src/audit/logger.ts` | Modified | Add `visibility` to `room_created` payload |
| `client/src/stores/publicRoomsStore.ts` | New | Tiny Zustand store |
| `client/src/components/PublicRoomList.tsx` | New | List + filters + refresh |
| `client/src/screens/EntryPage.tsx` | Modified | New tab + "Make public" toggle |
| `client/src/i18n/{en,es,pt,fr,it,de}.ts` | Modified | ~15 new keys each |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Privacy leak (host name, category) | Medium | Medium | Resolved Q1: first name + category only; no settings; cap at 50 |
| 6-language i18n drift | Medium | Low | DeepStringify type check at build time |
| Chained PR coordination | Low | Low | PR 1 is fully shippable alone; PR 2 depends on the DTO shape only |
| HTTP poll DDoS | Low | Low | `Cache-Control: max-age=3`, Node single handler at 1000+ RPS |
| NPM proxy issue | Very low | High | Same transport as `/health` — already proven |
| Stale list (5s lag) | Low | Low | Manual refresh button covers the impatient case |

## Rollback Plan

- **PR 1**: revert server commit; `visibility` defaults to `'private'` in code so no client breakage. `GET /api/rooms` simply returns `[]` if rolled back past the route addition. No data loss (in-memory only).
- **PR 2**: revert client commit; the create form loses the "Make public" toggle and reverts to always-private. Existing public rooms (if any from PR 1) keep working — they just can't be joined via the list, only via code.
- Per-PR rollback is independent: PR 1 can ship and stay even if PR 2 is reverted.

## Dependencies

- None external. PR 2 requires PR 1's DTO to compile; PR 1 is self-contained.

## Success Criteria

- [ ] `GET /api/rooms?visibility=public` returns up to 50 DTOs with host first name, category, locale, player count, max, and age in seconds.
- [ ] `visibility` defaults to `'private'` for clients that don't send it; no existing private-room flow changes.
- [ ] Host can toggle visibility from the lobby settings panel; change is reflected in the next poll cycle.
- [ ] Client polls every 5s only while the list tab is open; polling stops on tab close / route change.
- [ ] All 6 i18n dictionaries have the new keys (DeepStringify passes).
- [ ] `pnpm --filter @impostor/server test` is green (existing 131 + new tests).
- [ ] Total deploy is under 400 lines per PR.
