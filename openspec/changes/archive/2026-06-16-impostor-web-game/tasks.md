# Tasks: El Impostor — Web Game

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1500–2000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Foundation + Server → PR 2: Client → PR 3: Integration & Polish |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Monorepo + shared types + server game logic | PR 1 | Base: `feature/impostor-web-game`. Autonomous: server runs standalone |
| 2 | Client UI (React + Zustand + Socket.IO) | PR 2 | Depends on PR 1. All screens + stores + hook + i18n |
| 3 | Integration tests + E2E + polish | PR 3 | Depends on PR 2. Socket.IO lifecycle, Playwright stretch, final cleanup |

## Phase 1: Foundation

- [x] 1.1 Create root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- [x] 1.2 Create `shared/package.json` + `shared/tsconfig.json`
- [x] 1.3 Define types: `shared/src/types/room.ts` (Player, Room, RoomSettings)
- [x] 1.4 Define types: `shared/src/types/game.ts` (GamePhase, GameState, Vote, RoundResult)
- [x] 1.5 Define types: `shared/src/types/protocol.ts` (ClientEvents, ServerEvents)
- [x] 1.6 Create `shared/src/constants.ts` (MAX_PLAYERS, MIN_PLAYERS, DEFAULT_TIMER)
- [x] 1.7 Create `shared/src/utils.ts` (generateRoomCode, clampTimer)
- [x] 1.8 Create `shared/src/index.ts` — barrel export

## Phase 2: Server Core

- [x] 2.1 Create `server/package.json` + `server/tsconfig.json`
- [x] 2.2 Create `server/src/data/word-bank.json` with 100+ words across 5+ categories
- [x] 2.3 Create `server/src/words/WordBank.ts` — load JSON, randomWordByCategory()
- [x] 2.4 Create `server/src/room/RoomStore.ts` — `Map<string, Room>` thread-safe wrapper
- [x] 2.5 Create `server/src/room/RoomManager.ts` — createRoom, joinRoom, leaveRoom, destroyRoom
- [x] 2.6 Create `server/src/game/StateMachine.ts` — GamePhase transitions + setTimeout per phase
- [x] 2.7 Create `server/src/game/RoundManager.ts` — vote tally, tie-break, expulsion logic
- [x] 2.8 Create `server/src/game/GameEngine.ts` — startMatch, processVote, checkWinCondition, endMatch
- [x] 2.9 Create `server/src/connection/ConnectionManager.ts` — socket lifecycle, reconnection, timeout
- [x] 2.10 Create `server/src/socket/handlers.ts` — map all 7 client→server events to domain logic
- [x] 2.11 Create `server/src/index.ts` — HTTP server + Socket.IO attach + static serve for client build

## Phase 3: Client UI

- [x] 3.1 Create `client/package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`
- [x] 3.2 Create `client/src/i18n/es.ts` — all Spanish UI strings object
- [x] 3.3 Create `client/src/stores/connectionStore.ts` — socketStatus, error
- [x] 3.4 Create `client/src/stores/roomStore.ts` — roomCode, players, isHost, settings
- [x] 3.5 Create `client/src/stores/gameStore.ts` — phase, word, myRole, votes, results, timer
- [x] 3.6 Create `client/src/hooks/useSocket.ts` — socket.io-client init, bind server events to stores
- [x] 3.7 Create `client/src/components/TimerBar.tsx` — countdown bar with auto-format
- [x] 3.8 Create `client/src/components/PlayerList.tsx` — player avatars with status indicators
- [x] 3.9 Create `client/src/components/VotingTable.tsx` — clickable player grid for vote targets
- [x] 3.10 Create `client/src/components/RoleReveal.tsx` — role card animation (impostor / non-impostor)
- [x] 3.11 Create `client/src/screens/LobbyScreen.tsx` — create/join form, player list, settings, start btn
- [x] 3.12 Create `client/src/screens/DiscussionScreen.tsx` — word display, timer, spectator info
- [x] 3.13 Create `client/src/screens/VotingScreen.tsx` — target grid, skip, timer, live vote count
- [x] 3.14 Create `client/src/screens/EvaluationScreen.tsx` — result card, role reveal, next round
- [x] 3.15 Create `client/src/screens/GameOverScreen.tsx` — winner banner, play again btn
- [x] 3.16 Create `client/src/App.tsx` — ConnectionGuard + phase-based screen router
- [x] 3.17 Create `client/src/main.tsx` — React 18 createRoot entry

## Phase 4: Testing & Polish

- [x] 4.1 Unit: WordBank tests — random selection, missing category, empty bank edge case
- [x] 4.2 Unit: StateMachine tests — all 6 phase transitions, timer cancellation
- [x] 4.3 Unit: GameEngine tests — impostor assignment, vote processing, win conditions
- [x] 4.4 Unit: RoomManager tests — create, join, leave, host reassignment, max players
- [x] 4.5 Unit: RoundManager tests — tally, tie-break, skip vote handling
- [x] 4.6 Integration: Socket.IO full match lifecycle — 3 bot clients play a complete match
- [x] 4.7 Integration: room lifecycle — create → join → leave → destroy → reconnection
- [ ] 4.8 E2E: Playwright with 3 bot clients simulating a full game (stretch — optional for MVP)
- [x] 4.9 Final: verify build, lint, and Vitest run pass without errors

## Phase 5: Socket.IO → Raw WS Migration

- [x] 5.1 Update `shared/src/types/protocol.ts` — remove Socket.IO types, add WsMessage + ConnectedPayload
- [x] 5.2 Update `server/package.json` — remove `socket.io`, add `ws` + `@types/ws`
- [x] 5.3 Update `server/src/index.ts` — replace `Server(socket.io)` with `WebSocketServer(ws)`
- [x] 5.4 Rewrite `server/src/connection/ConnectionManager.ts` — track raw WebSocket, add broadcastToRoom/sendToSocket
- [x] 5.5 Rewrite `server/src/game/GameEngine.ts` — use ConnectionManager for all emits
- [x] 5.6 Create `server/src/ws/handlers.ts` — raw WebSocket message router with heartbeat
- [x] 5.7 Remove `server/src/socket/handlers.ts` — old Socket.IO handlers
- [x] 5.8 Update `client/package.json` — remove `socket.io-client`
- [x] 5.9 Rewrite `client/src/hooks/useSocket.ts` — native WebSocket with heartbeat ping
- [x] 5.10 Update `client/vite.config.ts` — remove Socket.IO proxy
- [x] 5.11 Update integration test — use raw WebSocket instead of Socket.IO test client
- [x] 5.12 Verify server and client compilation — both pass tsc

## Phase 6: SDD Archive

- [x] 6.1 Archive: sync 7 spec domains to `openspec/specs/`, create `state.yaml`, persist archive-report to Engram, move change to `openspec/changes/archive/2026-06-16-impostor-web-game/`
