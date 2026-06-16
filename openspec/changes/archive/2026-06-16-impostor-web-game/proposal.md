# Proposal: El Impostor — Real-Time Multiplayer Social Deduction Web Game

## Intent

Build a browser-based real-time multiplayer social deduction game ("El Impostor") where players in a Discord voice call identify and vote to expel secret impostors. MVP targets a working game loop with room management, server-authoritative logic, in-memory state, and zero persistence.

## Scope

### In Scope

- Room system: create, join, leave, max 10 players, host controls
- Full game state machine: Lobby → Word Reveal → Discussion → Voting → Round Result → Game Over
- Word bank with gamer-oriented categories (embedded JSON, ~100+ words)
- Per-player secret word delivery (impostors receive role-only string)
- Voting system with skip option, one vote per player per round
- Expulsion → spectator mode (expelled players stay in room, watch)
- Multi-match lifecycle: play again in same room without recreating
- Configurable impostor count (1 for 3–6 players, 1–2 for 7–10)
- Configurable discussion timer (60–120s, host sets before match)
- Entire UI in Spanish
- Single-server deployment: backend serves built frontend

### Out of Scope

- User accounts, authentication, persistent profiles
- Database persistence (in-memory only for MVP)
- Voice/video chat (handled via Discord)
- Admin panel or word bank management UI
- Game history, replays, or analytics
- Mobile-native app (responsive web only)
- Room passwords or friend lists

## Capabilities

> Contract between proposal and spec phases. Each new capability becomes a full spec in `openspec/specs/`.

### New Capabilities

- `room-management`: Room CRUD, player list, host assignment, max-player enforcement, lobby state
- `game-lifecycle`: State machine with timer-driven phase transitions, win-condition checks, round loop
- `word-assignment`: Word bank with categories, per-player secret delivery, impostor role string
- `voting-system`: Vote submission, tally, skip option, expulsion, role reveal
- `spectator-mode`: Expelled → spectator status, spectator UI, rejoin on next match
- `multi-match`: Reset game state, new word, reuse room settings
- `player-connection`: Socket.IO lifecycle, reconnection window, disconnect timeout, cleanup

### Modified Capabilities

None — greenfield project.

## Approach

Monorepo (pnpm workspaces) with three packages: `shared/` (types, message protocol, constants), `server/` (Node.js + Socket.IO + TypeScript — game engine, rooms, state machine, word bank), `client/` (React 18 + Vite + TypeScript + Zustand — SPA with phase-based screens). Server-authoritative: all game logic on server, client renders state from emitted events. Word bank as embedded JSON, rooms in `Map<string, Room>`, timers via `setTimeout`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `shared/` | New | Shared types, WS protocol, constants |
| `server/` | New | Socket.IO server, game engine, room manager, word bank |
| `client/` | New | React SPA, 5 screens, Zustand stores, Socket.IO client |
| Root config | New | pnpm workspace, tsconfig, root package.json |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Word leak via dev tools | Low | Per-player WS messages, never broadcast role/word |
| Client cheating | Low | Server-authoritative: server validates every action |
| Single-process crash | Low for MVP | PM2 auto-restart or Docker restart policy |
| Timer desync | Low | Server is authoritative time source |

## Rollback Plan

Git revert the commit or stop the process. No persistence means no data migration. Greenfield project — no production users affected.

## Dependencies

- Node.js 18+, pnpm
- socket.io, socket.io-client, react 18, vite, zustand, typescript

## Success Criteria

- [ ] 3+ players create/join a room, start a match, complete a full cycle: word reveal → discussion → voting → expulsion → game over
- [ ] Impostor sees no word; non-impostors see their assigned word
- [ ] Expelled players spectate and rejoin next match
- [ ] Multiple consecutive matches work in the same room without recreating
- [ ] 2-impostor mode works for 7–10 player rooms
- [ ] Timer configuration (60–120s) works correctly
- [ ] UI fully in Spanish with no untranslated text
