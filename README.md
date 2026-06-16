# 🕵️ El Impostor

**Real-time multiplayer social deduction in your browser. No installs, no accounts — just a room code and your friends.**

---

## ✨ The Game

**El Impostor** is a social deduction game for 3–15 players. Each round, one or two players are secretly the **Impostor**. The non-impostors are given a secret **Word** (from a category) — their job is to identify the impostor through discussion and voting. The Impostor doesn't know the word and must bluff their way through.

**Features:**

- **"By Word" mode** — 30+ word categories, 548 unique words
- **"By Image" mode** — *Coming soon*
- **Configurable voting timer** (15s–60s)
- **Hardcore mode** — 1 impostor, no category hints, no skip-vote
- **Custom word categories** — hosts can create and share their own
- **Re-rol rule** — no player is the impostor two rounds in a row
- **6 languages** — English, Español, Português, Français, Italiano, Deutsch
- **Public rooms** — browse and join open games from the entry page
- **Kick players** — host can remove disruptive players
- **Spectator mode** — late joiners can watch mid-game

---

## 🚀 Quick Start (Development)

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 8 (`npm i -g pnpm`)

### Setup

```bash
git clone https://github.com/TtvNekix/impostor-web.git
cd impostor-web
pnpm install
```

### Run locally

```bash
# Terminal 1: server (port 3001)
pnpm --filter @impostor/server dev

# Terminal 2: client (Vite dev server, port 5173)
pnpm --filter @impostor/client dev
```

Open `http://localhost:5173` in your browser.

### Build for production

```bash
pnpm --filter @impostor/shared build
pnpm --filter @impostor/client build
pnpm --filter @impostor/server build
```

### Run tests

```bash
# All server tests (154 total)
pnpm --filter @impostor/server test

# Single test file
pnpm --filter @impostor/server test -- src/__tests__/GameEngine.test.ts
```

---

## 🏗️ Architecture

```
impostor-web/
├── shared/          # Shared types & constants (client + server)
│   └── src/
│       ├── types/   # Room, Game, Protocol, API DTOs
│       ├── constants.ts
│       └── index.ts # Barrel export
│
├── server/          # Node.js + Express + raw WebSocket
│   └── src/
│       ├── index.ts           # Express routes + WS server
│       ├── room/              # Room lifecycle (RoomStore, RoomManager)
│       ├── game/              # Game engine (StateMachine, GameEngine, RoundManager)
│       ├── connection/        # WS connection lifecycle & reconnect
│       ├── audit/logger.ts    # Event logging (fire-and-forget)
│       ├── words/             # WordBank with 30 categories
│       ├── ws/handlers.ts     # All WS event handlers
│       └── __tests__/         # 9 test files, 154 tests
│
└── client/          # React 18 + Vite + Zustand
    └── src/
        ├── screens/           # EntryPage, LobbyScreen, DiscussionScreen, etc.
        ├── components/        # Reusable UI
        ├── hooks/             # useSocket, usePublicRooms, etc.
        ├── stores/            # Zustand stores
        ├── i18n/              # 6 language dictionaries
        └── styles/globals.css # Single stylesheet
```

### Key design decisions

- **raw `ws` over Socket.IO**: Migrated from Socket.IO because Engine.IO had proxy issues with the reverse proxy. Now uses raw WebSocket with a typed event protocol.
- **In-memory state**: RoomStore is a `Map<string, Room>` — server restart loses all active games. No database. (A future persistence layer could add SQLite.)
- **Castellano Spanish**: All Spanish UI uses Spain Spanish (vosotros imperatives, no voseo).
- **6-language i18n**: DeepStringify enforces shape parity at build time — all 6 files must have identical nested structure.
- **Single CSS file**: No CSS-in-JS, no modules. Global stylesheet with BEM-like naming and CSS custom properties.
- **Discord audit log**: Server events (room created, match started, votes) are posted to a Discord webhook via fire-and-forget fetch. Never blocks the game loop.

---

## 🧪 Testing

| Layer | Tool | Tests | Notes |
|-------|------|-------|-------|
| Server unit | Vitest | 154 (9 files) | Game engine, room mgmt, word bank, state machine, voting, integ. |
| Client unit | None | 0 | Need to add a runner |
| E2E | None | 0 | Need Playwright |

---

## 📝 Development notes

- **Commit style**: Conventional commits (`feat|fix|chore|test|docs(scope): message`)
- **No AI attribution**: No "Co-Authored-By" in commits
- **Spanish UI**: Castellano (Spain), no voseo; vosotros imperatives for commands
- **CSS**: Edit `client/src/styles/globals.css` only. BEM naming (`.block__element--modifier`). Custom properties from `:root`.
- **Types**: All shared types in `shared/src/types/`. Server loads them directly from `src/` via `tsx` (no build step required).
- **WebSocket protocol**: JSON messages with `{ event, data }` format. Event types in `shared/src/types/protocol.ts`.
- **One-instance design**: Single server process. No horizontal scaling (rooms are in-memory Maps).

---

## 📄 License

Private project — all rights reserved.
