# 🕵️ El Impostor

**Real-time multiplayer social deduction in your browser. No installs, no accounts — just a room code and your friends.**

[![Live](https://img.shields.io/badge/live-impostor.nekix.lol-00d4ff)](https://impostor.nekix.lol)
[![Stack](https://img.shields.io/badge/stack-React%20%2B%20Node%20%2B%20ws-00d4ff?logo=typescript)]()

---

## ✨ The Game

**El Impostor** is a social deduction game for 3–15 players. Each round, one or two players are secretly the **Impostor**. The non-impostors are given a secret **Word** (from a category) — their job is to identify the impostor through discussion and voting. The Impostor doesn't know the word and must bluff their way through.

**Features:**

- **"By Word" mode** — 30+ word categories, 548 unique words
- **"By Image" mode** — *Coming soon* 🏗️
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
- **pnpm** ≥ 8 (`npm install -g pnpm`)

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

Open `http://localhost:5173` in your browser. The Vite dev server proxies API/WebSocket requests to the server at port 3001.

### Build for production

```bash
pnpm --filter @impostor/client build
pnpm --filter @impostor/server build
```

The server serves the client build from `client/dist/` as static files.

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
├── shared/          # Shared types & constants (both client and server)
│   └── src/
│       ├── types/   # Room, Game, Protocol, API DTOs
│       ├── constants.ts
│       └── index.ts # Barrel export
│
├── server/          # Node.js + Express + raw WebSocket
│   └── src/
│       ├── index.ts           # Entry: Express routes + WS server
│       ├── room/              # Room lifecycle (RoomStore, RoomManager)
│       ├── game/              # Game engine (StateMachine, GameEngine, RoundManager)
│       ├── connection/        # WS connection lifecycle & reconnect
│       ├── audit/logger.ts    # Discord webhook (fire-and-forget)
│       ├── words/             # WordBank with 30 categories
│       ├── ws/handlers.ts     # All WS event handlers
│       └── __tests__/         # 9 test files, 154 tests
│
├── client/          # React 18 + Vite + Zustand
│   └── src/
│       ├── screens/           # EntryPage, LobbyScreen, DiscussionScreen, VotingScreen, etc.
│       ├── components/        # Reusable UI components
│       ├── hooks/             # useSocket, usePublicRooms, etc.
│       ├── stores/            # Zustand stores
│       ├── i18n/              # 6 language dictionaries
│       └── styles/globals.css # Single stylesheet (~3076 lines)
│
└── scripts/
    └── deploy.py    # Production deploy via paramiko
```

### Key design decisions

- **raw `ws` over Socket.IO**: Engine.IO didn't pass through the Nginx Proxy Manager. Migrated to raw WebSocket with a typed event protocol.
- **In-memory state**: RoomStore is a `Map<string, Room>` — server restart loses all active games. No database. (A future persistence layer would add SQLite.)
- **Castellano Spanish**: All Spanish UI uses Spain Spanish (vosotros imperatives, no voseo).
- **6-language i18n**: DeepStringify enforces shape parity at build time — all 6 files must have identical nested structure.
- **Single CSS file**: No CSS-in-JS, no modules. 3076 lines of global CSS with BEM-like naming and custom properties.

---

## 🧪 Testing

| Layer | Tool | Tests | Notes |
|-------|------|-------|-------|
| Server unit | Vitest | 154 (9 files) | Covers game engine, room management, word bank, state machine, voting, integration |
| Client unit | None | 0 | ❌ No test runner configured |
| E2E | None | 0 | ❌ Playwright not set up |

---

## 🚢 Deploy

Production is deployed to a Proxmox container at `192.168.1.11` via a Python paramiko script.

```bash
# Full deploy (client + server + restart)
python scripts/deploy.py

# Client only (CSS/components)
python scripts/deploy.py --client-only

# Server only (handlers/engine)
python scripts/deploy.py --server-only

# Verify current state
python scripts/deploy.py --verify
```

The deploy script:
1. Auto-discovers all `.ts` files in `server/src/` and `shared/src/`
2. Uploads via SFTP to `/opt/impostor-web/`
3. Builds and uploads client assets from `client/dist/`
4. Cleans up orphaned asset hashes
5. Runs a smoke test (`import('@impostor/shared')` via tsx) verifying modules load
6. Restarts the `impostor-web` systemd service
7. Verifies all endpoints return 200

See [`docs/GUIDE.md`](docs/GUIDE.md) for detailed deploy procedures.

---

## 🌐 Infrastructure

```
Cloudflare (DNS only) ──> Nginx Proxy Manager ──> Proxmox Container
                           192.168.1.50            192.168.1.11:3001
```

- **SSL**: Let's Encrypt via NPM (Flexible mode)
- **WebSocket**: Proxied through NPM, no Engine.IO issues (raw ws)
- **Restart policy**: systemd auto-restart on crash (with Pre-Restart Smoke check to prevent crash-loops)

---

## 📝 Contributing / Development notes

- **Commit style**: Conventional commits (`feat|fix|chore|test|docs(scope): message`)
- **No AI attribution**: No "Co-Authored-By" in commits
- **Spanish UI**: Castellano (Spain), no voseo; vosotros imperatives for commands
- **CSS**: Edit `client/src/styles/globals.css` only. Use BEM-like naming (`.block__element--modifier`). Prefer CSS custom properties from `:root`.
- **Types**: All shared types in `shared/src/types/`. Server uses them directly via `tsx` (no build step).

---

## 📄 License

Private project — all rights reserved.

---

*Built with ❤️ by TtvNekix. Deployed from Buenos Aires.*
