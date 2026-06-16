# Design: El Impostor — Web Game

## Technical Approach

Server-authoritative monorepo (pnpm workspaces): `shared/` (types + protocol), `server/` (Node.js + Socket.IO + in-memory state), `client/` (React 18 + Vite + Zustand). All game logic runs server-side; client renders state from emitted events. Timers via `setTimeout`, rooms as `Map<string, Room>`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| State storage | `Map<string, Room>` in memory | Redis, SQLite | MVP with zero persistence; no DB ops latency |
| State machine | Explicit `GamePhase` enum + `transition()` method | XState, state machines lib | Minimal dependency, full control, <100 LOC |
| Secret delivery | Per-player WS events (`word_assigned`) | Room broadcast with filter | Impossibility of word leak via dev tools |
| Timer mgmt | `setTimeout` per phase | `node-cron`, timers lib | Simple, 2 active phases, cleanup on transition |
| Client state | Zustand | Redux, Context API | Minimal boilerplate, no providers needed |

## Data Flow (Vote Example)

```
Browser(Alice)                 Server                    Room State
     │                           │                          │
     │── vote({target:"Bob"}) ──→│                          │
     │                           ├── validate(Alice alive)  │
     │                           ├── store vote             │
     │                           ├── check all voted?       │
     │                           │   └── yes: tally()       │
     │                           │       ├── find mode      │
     │                           │       ├── remove player  │
     │                           │       └── broadcast      │
     │←── vote_broadcast(result)─┤                          │
     │←── player_expelled(p) ────┤                          │
```

## 1. Monorepo Structure

```
impostor-web-game/
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml       # packages: [shared, server, client]
├── tsconfig.base.json
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── types/
│       │   ├── room.ts        # Room, Player, PlayerStatus
│       │   ├── game.ts        # GameState, GamePhase, Vote, RoundResult
│       │   └── protocol.ts    # ClientEvents, ServerEvents, event payloads
│       ├── constants.ts       # MAX_PLAYERS, MIN_PLAYERS, DEFAULT_TIMER, etc.
│       └── utils.ts           # generateRoomCode(), clampTimer()
├── server/
│   ├── package.json
│   └── src/
│       ├── index.ts           # Server entry — http + Socket.IO + static serve
│       ├── room/
│       │   ├── RoomManager.ts # createRoom, joinRoom, leaveRoom, getRoom
│       │   └── RoomStore.ts   # Map<string, Room> wrapper
│       ├── game/
│       │   ├── GameEngine.ts  # startMatch, processVote, transition, checkWin
│       │   ├── StateMachine.ts # phase transition logic + timer
│       │   └── RoundManager.ts # vote tally, tie-break, expulsion
│       ├── words/
│       │   └── WordBank.ts    # load word-bank.json, randomWordByCategory
│       ├── connection/
│       │   └── ConnectionManager.ts # socket lifecycle, reconnection, timeout
│       ├── socket/
│       │   └── handlers.ts    # All socket event handlers per domain
│       └── data/
│           └── word-bank.json
├── client/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── stores/
│       │   ├── roomStore.ts       # room state, player list
│       │   ├── gameStore.ts       # phase, word, votes, results
│       │   └── connectionStore.ts # socket status
│       ├── hooks/
│       │   └── useSocket.ts       # socket init, event binding
│       ├── screens/
│       │   ├── LobbyScreen.tsx    # room creation/join, player list, settings
│       │   ├── DiscussionScreen.tsx # word display, chat preview
│       │   ├── VotingScreen.tsx   # vote target selector, timer, results
│       │   ├── EvaluationScreen.tsx # expulsion result, role reveal
│       │   └── GameOverScreen.tsx # winner display, new match button
│       ├── components/
│       │   ├── PlayerList.tsx
│       │   ├── TimerBar.tsx
│       │   ├── VotingTable.tsx
│       │   └── RoleReveal.tsx
│       └── i18n/
│           └── es.ts             # Spanish strings object
```

## 2. TypeScript Types

```typescript
// shared/src/types/room.ts
export type PlayerStatus = 'ACTIVE' | 'SPECTATOR' | 'DISCONNECTED';

export interface Player {
  id: string;           // socket.id
  username: string;
  status: PlayerStatus;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomSettings {
  maxPlayers: number;      // default 10
  impostorCount: number;   // 1 or 2
  discussionTime: number;  // seconds, 60–120
}

export interface Room {
  code: string;
  players: Map<string, Player>;
  settings: RoomSettings;
  gameState: GameState | null;
  createdAt: number;
}

// shared/src/types/game.ts
export type GamePhase = 'LOBBY' | 'WORD_REVEAL' | 'DISCUSSION' | 'VOTING' | 'EVALUATION' | 'GAME_OVER';

export interface GameState {
  phase: GamePhase;
  word: string;                    // current round word (never sent to impostors)
  category: string;
  players: GamePlayer[];           // snapshot at game start
  votes: Vote[];
  roundNumber: number;
  phaseEndsAt: number;             // Date.now() + timer
  result: RoundResult | null;
}

export interface GamePlayer {
  id: string;
  username: string;
  isImpostor: boolean;
  status: PlayerStatus;
}

export interface Vote {
  voterId: string;
  targetId: string | null;        // null = skip
}

export interface RoundResult {
  expelledId: string;
  expelledUsername: string;
  wasImpostor: boolean;
  aliveImpostors: number;
  aliveNonImpostors: number;
  winner: 'NON_IMPOSTORS' | 'IMPOSTORS' | null;  // null = no one expelled
}
```

## 3. WebSocket Protocol

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_room` | `{ code, username }` | Join existing room |
| `create_room` | `{ code, username, settings? }` | Create room (creator = host) |
| `start_match` | `{}` | Host starts match (LOBBY→WORD_REVEAL) |
| `vote` | `{ targetId \| null }` | Submit vote (null = skip) |
| `update_settings` | `{ impostorCount?, discussionTime? }` | Host changes settings |
| `new_match` | `{}` | Host starts next match (GAME_OVER→LOBBY) |
| `leave_room` | `{}` | Player leaves voluntarily |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room_joined` | `{ room, players }` | Confirmation + full state |
| `room_error` | `{ message }` | Error (room full, name taken, etc.) |
| `player_joined` | `{ player }` | A new player joined |
| `player_left` | `{ playerId, newHost? }` | Player left, optional host reassign |
| `game_started` | `{ roundNumber, category, phaseEndsAt }` | Match begins |
| `word_assigned` | `{ word \| null }` | Per-player secret word (null = impostor) |
| `phase_changed` | `{ phase, phaseEndsAt }` | Phase transition announcement |
| `vote_update` | `{ voterCount, totalPlayers }` | Vote progress (no identity) |
| `vote_broadcast` | `{ votes }` | All votes revealed after tally |
| `round_result` | `{ RoundResult }` | Expulsion + role reveal |
| `game_over` | `{ winner }` | Game over with winner announcement |
| `settings_updated` | `{ RoomSettings }` | Host changed settings |
| `player_disconnected` | `{ playerId, timeout? }` | Disconnect or timeout |
| `player_reconnected` | `{ playerId }` | Player reconnected |
| `kicked` | `{ reason }` | Player removed (timeout, room destroyed) |

## 4. Server Architecture

```
RoomManager              GameEngine
 ┌─────────────┐         ┌──────────────────────┐
 │ createRoom() │──room──→│ startMatch()         │
 │ joinRoom()   │         │ processVote()        │
 │ leaveRoom()  │         │ transition(phase)    │
 │ getRoom()    │         │ checkWinCondition()  │
 │ destroyRoom()│         │ endMatch()           │
 └─────────────┘         └──────────┬───────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
         WordBank            TimerManager         ConnectionManager
  ┌──────────────────┐  ┌───────────────┐  ┌────────────────┐
  │ loadFromJSON()   │  │ startTimer()  │  │ onConnect()    │
  │ randomWord()     │  │ cancelTimer() │  │ onDisconnect() │
  │ byCategory()     │  │ getRemaining()│  │ scheduleKick() │
  └──────────────────┘  └───────────────┘  └────────────────┘
```

**Handler wiring**: `socket/handlers.ts` maps Socket.IO events → RoomManager + GameEngine calls, then broadcasts results.

## 5. Client Architecture

```
App.tsx
 └─ ConnectionGuard             # shows loading/error if disconnected
    └─ Router (phase-based)
       ├─ LobbyScreen           # create/join form, player list, settings, start btn
       ├─ DiscussionScreen      # word display, timer, player list, spectator info
       ├─ VotingScreen          # player target grid, skip button, timer, live count
       ├─ EvaluationScreen      # round result card, role reveal, next round btn
       └─ GameOverScreen        # winner banner, play again btn

Zustand Stores:
  roomStore     → roomCode, players[], isHost, settings
  gameStore     → phase, word, category, myRole, votes[], results, timer
  connectionStore → socketStatus, error
```

**Socket binding**: `useSocket` hook creates `socket.io-client` connection, binds all server events to Zustand store setters. Returns `emit` helpers typed to `ClientEvents`.

## 6. Game State Machine

```
LOBBY
  │ host clicks start + ≥3 players
  ▼
WORD_REVEAL                    # Per-player word delivery (instant)
  │ after all words sent (sync)
  ▼
DISCUSSION                     # Timer: 60–120s (host configured)
  │ timer expires
  ▼
VOTING                         # Timer: 30s (fixed)
  │ all voted OR timer expires
  ▼
EVALUATION                     # Tally, expel, check win
  │ win condition met → GAME_OVER
  │ no winner / tie → LOBBY
  ▼
LOBBY → (next match)    or    GAME_OVER → host clicks "new match" → LOBBY
```

**Conditions**:
- `LOBBY→WORD_REVEAL`: minPlayers=3, impostorCount valid, word bank non-empty
- `EVALUATION→LOBBY`: expelled and `aliveImpostors>0 && aliveNonImpostors>impostors`
- `EVALUATION→GAME_OVER`: `aliveImpostors===0` (non-impostors win) || `aliveNonImpostors≤aliveImpostors` (impostors win)

## 7. Word Bank Structure

```json
{
  "categories": [
    {
      "name": "videojuegos",
      "words": [
        "speedrun", "headshot", "respawn", "grindear",
        "nerfeo", "buffear", "lootear", "craftear",
        "boss final", "mazmorra", "puzzle", "checkpoint"
      ]
    },
    {
      "name": "internet",
      "words": ["meme", "trolear", "stremear", "moderador", "baneado"]
    },
    {
      "name": "juegos-de-mesa",
      "words": ["ficha", "dado", "tablero", "mazmorreo", "campana"]
    }
  ]
}
```

~100+ words minimum across categories. Server selects category randomly per round.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | GameEngine, StateMachine, RoomManager | Vitest, pure function tests |
| Unit | WordBank | Random selection + edge cases (empty) |
| Integration | Socket handlers + GameEngine loop | Socket.IO test client, simulate full match |
| Integration | Room lifecycle | Create/join/leave host reassignment |
| E2E | Full game cycle | Playwright + test server, 3 bot clients |

No migration required — greenfield, in-memory only.
