# Tasks: Public Rooms List

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 480 (PR 1 ~210, PR 2 ~280) |
| 400-line budget risk | Medium (per-PR within budget, total > 400) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 server+shared, PR 2 client+i18n |
| Delivery strategy | auto-forecast (chained PRs) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Server: shared types, RoomStore filter, /api/rooms route, validation, audit, tests | PR 1 | Base = `feature/public-rooms-list-server` |
| 2 | Client: hook, store, list UI, EntryPage tab, LobbyScreen toggle, 6-file i18n | PR 2 | Base = PR 1 branch |

---

## Phase 1: PR 1 — Server + Shared Types (~210 LOC)

- [x] **Step 1.1: Extend `RoomSettings`** — add `visibility: 'public' | 'private'` and `hostLocale: string` fields in `shared/src/types/room.ts`. (~3 LOC; acceptance: TS compiles, `CreateRoomPayload.settings` now accepts the two new fields)
- [x] **Step 1.2: Add public-rooms constants** — append `DEFAULT_VISIBILITY = 'private'`, `ALLOWED_LOCALES` (6 codes), `MAX_PUBLIC_ROOMS_RETURNED = 50` to `shared/src/constants.ts`. (~6 LOC; acceptance: vitest snapshot of `ALLOWED_LOCALES.length === 6`)
- [x] **Step 1.3: Extend `UpdateSettingsPayload`** — add `visibility?: 'public' | 'private'` and `hostLocale?: string` to `shared/src/types/protocol.ts`. (~3 LOC; acceptance: type compiles, both optional)
- [x] **Step 1.4: Create `PublicRoomDTO`** — new `shared/src/types/api.ts` with `PublicRoomDTO` and `PublicRoomsResponse` interfaces per design §Interfaces. (~20 LOC; acceptance: file exports both, fields match design)
- [x] **Step 1.5: Implement `RoomStore.getAllPublicRooms()`** — single-pass filter (visibility === 'public' AND ≥1 ACTIVE player), DTO construction (first-name token from host, sanitized fields), 50-room cap with `hasMore` + `totalCount`. (~45 LOC; acceptance: returns `PublicRoomDTO[]` with all agreed fields, hides empty rooms)
- [x] **Step 1.6: Sanitize settings in `RoomManager.createRoom`** — default `visibility` to `'private'` and `hostLocale` to `'en'`; throw on invalid `visibility` (not in allowed set) and on invalid `hostLocale` (not in `ALLOWED_LOCALES`). (~15 LOC; acceptance: existing 131 tests still pass; new tests for invalid inputs)
- [x] **Step 1.7: Update `ws/handlers.ts`** — `CREATE_ROOM` passes through `settings` to `createRoom` (no change needed for forward pass); extend `UPDATE_SETTINGS` to validate and apply `visibility` + `hostLocale`; extend `room_created` audit log to include both fields. (~30 LOC; acceptance: setting persists, audit log shows new fields, invalid `hostLocale` rejected with `ROOM_ERROR`)
- [x] **Step 1.8: Add `GET /api/rooms` route** — in `server/src/index.ts` next to `/health`. Calls `roomStore.getAllPublicRooms()`, applies `lang` + `hasSpace` query filters, sets `Cache-Control: max-age=3`, returns `{ rooms, hasMore, totalCount }`. (~30 LOC; acceptance: 200 + empty list, 200 + populated, `Cache-Control` header set)
- [x] **Step 1.9: Unit tests for `getAllPublicRooms`** — new `server/src/__tests__/publicRooms.test.ts` covering: filter excludes private rooms, DTO has only agreed fields, empty rooms excluded, 50-cap with `hasMore`/`totalCount`, active-player count uses ACTIVE only. (~50 LOC; acceptance: 5+ tests pass)
- [x] **Step 1.10: Extend `RoomManager.test.ts`** — add tests for `visibility` default to `'private'`, `hostLocale` default to `'en'`, reject invalid `visibility`, reject invalid `hostLocale`. (~20 LOC; acceptance: 4 new tests pass)
- [x] **Step 1.11: HTTP integration tests for `GET /api/rooms`** — new `server/src/__tests__/publicRoomsHttp.test.ts` using `node:http` + `http.get`: 200 + empty list when no public rooms, 200 + populated list when 2 public + 1 private, `Cache-Control: max-age=3` header set, no auth required, `lang` + `hasSpace` filters work. (~50 LOC; acceptance: 4+ tests pass against live Express server)
- [x] **Step 1.12: Verify server tests + build** — run `pnpm --filter @impostor/server test` (must be 131 + new tests, all green) and `pnpm --filter @impostor/server build` (TS compiles, no errors). (~0 LOC, verification only)

## Phase 2: PR 2 — Client + i18n (~280 LOC)

- [ ] **Step 2.1: Create `usePublicRooms` polling hook** — new `client/src/hooks/usePublicRooms.ts` exporting `{ rooms, hasMore, totalCount, loading, refresh }`. 5s `setInterval` while active, `refresh()` for manual, `clearInterval` on unmount. (~30 LOC; acceptance: hook returns current state, polling stops on unmount)
- [ ] **Step 2.2: Create `publicRoomsStore` Zustand store** — new `client/src/stores/publicRoomsStore.ts` mirroring the hook shape, with `setRooms`, `setLoading`, `setError` actions. (~20 LOC; acceptance: store importable, can be subscribed to)
- [ ] **Step 2.3: Create `PublicRoomList` component** — new `client/src/components/PublicRoomList.tsx` rendering room cards (code, hostFirstName, category, locale, player count, max, age in seconds), Join button calls `joinRoom(code)`, empty state, overflow hint when `hasMore`. (~80 LOC; acceptance: renders list from store, Join button visible per card, empty + overflow states)
- [ ] **Step 2.4: Create `PublicRoomFilters` component** — new `client/src/components/PublicRoomFilters.tsx` with language dropdown + `hasSpace` toggle, client-side filtering of the store. (~30 LOC; acceptance: filters narrow the visible list, both filters combine)
- [ ] **Step 2.5: Add "Public rooms" section to `EntryPage`** — new `PublicRoomList` + `PublicRoomFilters` mount below the active mode card; add a "Make public" toggle inside the create form that flips `visibility`. (~35 LOC; acceptance: list visible on entry page, toggle controls new rooms)
- [ ] **Step 2.6: Add Public/Private radio to `LobbyScreen` settings** — in `client/src/screens/LobbyScreen.tsx` add a radio in the settings panel that fires `updateSettings({ visibility })`. (~20 LOC; acceptance: radio reflects current `settings.visibility`, change broadcasts `UPDATE_SETTINGS`)
- [ ] **Step 2.7: Send `visibility` + `hostLocale` in create/update** — extend `EntryPage` `createRoom` call to include `visibility` + `hostLocale: locale` in settings; `LobbyScreen` already handled in 2.6. (~10 LOC; acceptance: WS payload contains both fields, server accepts)
- [ ] **Step 2.8: Add 12 new i18n keys to all 6 dictionaries** — add `entry.publicRooms.{title,subtitle,refresh,empty,capReached,filterLanguage,filterHasSpace}` (7) + `lobby.{visibility,public,private,visibilityHint}` (4) = 11 keys to `en.ts`, `es.ts`, `pt.ts`, `fr.ts`, `it.ts`, `de.ts`. Spanish uses castellano (no voseo). (~72 LOC across 6 files; acceptance: DeepStringify passes, all keys present in all 6)
- [ ] **Step 2.9: Verify client build** — run `pnpm --filter @impostor/client build` (must compile, DeepStringify catches i18n drift). (~0 LOC, verification only)
- [ ] **Step 2.10: Manual smoke test** — start local server, open 2 browser tabs, create 2 public rooms, verify list updates every 5s, toggle one to private and confirm it disappears, click Join on the other and verify it lands in the lobby, test both filters, create 51 rooms and verify the overflow hint. (~0 LOC, manual checklist)

## Phase 3: Per-PR Verification & Deploy (orchestrator-driven)

- [ ] **Step 3.1: PR 1 review + deploy** — push server branch, get review, merge, run `python scripts/deploy.py --server-only`, verify `/api/rooms` returns `[]` then populated list via `curl https://impostor.nekix.lol/api/rooms?visibility=public`.
- [ ] **Step 3.2: PR 2 review + deploy** — push client branch (base = PR 1), get review, merge, run `python scripts/deploy.py --client-only`, verify with the same manual smoke as 2.10 against production.
- [ ] **Step 3.3: Archive change** — run sdd-archive to move `openspec/changes/public-rooms-list/` → `openspec/changes/archive/2026-06-16-public-rooms-list/` and merge delta specs into main.

---

## Notes

- `Locale` type: kept as `string` per explicit user instruction in 1.1; validation lives in `ALLOWED_LOCALES` constant. No `shared/src/types/locale.ts` file created in this change (avoids unused export). If a future change wants strict `Locale` union, refactor at that point.
- i18n sync: step 2.8 is one logical commit (DeepStringify requires all 6 files in sync) — local LOC is ~72 due to 6-file repetition, not because the change is complex.
- The user prompt listed 12 i18n keys; counted to 11. Used 11 in the breakdown. Re-confirm against design §"i18n Coverage" before PR 2 apply.
- 6 languages: en, es, pt, fr, it, de (per `openspec/config.yaml` i18n.languages).
- Tests: 131 server tests currently pass; PR 1 adds ~13 new tests (5 in `publicRooms.test.ts`, 4 in `RoomManager.test.ts`, 4+ in `publicRoomsHttp.test.ts`). 0 client tests (no runner — manual smoke only).
