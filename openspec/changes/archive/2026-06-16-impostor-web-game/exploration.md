## Exploration: Impostor Web Game — Real-Time Multiplayer Social Deduction

### Current State

**Greenfield project** — no code exists yet. The filesystem contains only SDD scaffolding (`openspec/`, `.atl/`, `.git/`).

**Game concept requirements:**
- Web-based real-time multiplayer social deduction game
- Players join a ROOM with a username
- One player per round is secretly assigned as THE IMPOSTOR
- Non-impostors see a secret WORD on their screen; the impostor sees NOTHING
- Players communicate via Discord voice (OUT OF SCOPE — game handles no voice/video)
- Players VOTE to expel someone from the GAME (not from the room)
- Expelled player is revealed as impostor or innocent
- Game continues until: impostor is expelled (innocents win) OR impostor outlasts (impostor wins)
- Must work across devices, browser-based, no install required

**Constraints:**
- No audio/video — Discord handles all player communication
- No authentication system — just username
- Room-based isolation — multiple games can run simultaneously
- Must be lightweight — no heavy dependencies, fast to load

---

### Affected Areas

This is a greenfield project — ALL of the following are new files to create:

| Area | What | Why |
|------|------|-----|
| `server/` | WebSocket + HTTP server | Real-time communication, game logic, state management |
| `client/` | Frontend application | Browser UI for the game |
| `shared/` | Shared types and constants | Message protocols, game state types, configuration |
| Project root | Build config, package.json, deployment | Monorepo or split repos |

---

### Approaches

#### 1. Technology Stack

##### 1A. Frontend: React + Vite + TypeScript

| Pros | Cons | Effort |
|------|------|--------|
| Mature ecosystem, huge community | Heavier than alternatives | Medium |
| Excellent TypeScript support | Requires build step | |
| Vite is fast and modern | | |
| Rich component model for complex UI | | |
| Easy state management with Zustand/Redux | | |

##### 1B. Frontend: Vanilla TypeScript + Lit

| Pros | Cons | Effort |
|------|------|--------|
| No framework overhead | Must build component system from scratch | High |
| Lightweight bundle | Less ecosystem support | |
| Web components are framework-agnostic | More boilerplate for complex UIs | |

**Recommendation: React + Vite + TypeScript.** The game has multiple screens (lobby, game, results) with complex state transitions. React's component model and ecosystem make this straightforward. The extra bundle weight is negligible for this application.

##### 2A. Backend: Node.js + Socket.IO + TypeScript

| Pros | Cons | Effort |
|------|------|--------|
| Built-in room management (perfect for game rooms) | Slightly heavier than raw ws | Low |
| Automatic reconnection handling | | |
| Fallback transports (polling if WebSocket blocked) | | |
| TypeScript support | | |
| Event-based API matches game messaging | | |

##### 2B. Backend: Node.js + Fastify + ws (raw WebSocket)

| Pros | Cons | Effort |
|------|------|--------|
| Lighter than Socket.IO | Must implement rooms manually | Medium |
| Full control over protocol | Need custom reconnection logic | |
| Fastify is fast and well-structured | More boilerplate for event routing | |

**Recommendation: Socket.IO.** The room management, reconnection, and event routing map 1:1 to game needs. Room management alone saves significant code. The overhead is acceptable for a web game.

##### 3A. Language: TypeScript everywhere (monorepo)

| Pros | Cons | Effort |
|------|------|--------|
| Shared types between client and server | Both client and server in same language | Low |
| Single language reduces context switching | | |
| Shared message protocol types | | |

**Recommendation: TypeScript everywhere.** The shared type definitions between client and server are too valuable to give up. The message protocol, game state types, and constants should be shared to guarantee consistency.

##### 4A. State/Data: In-memory only

| Pros | Cons | Effort |
|------|------|--------|
| Fastest possible, no I/O | No persistence across restarts | Low |
| Simple to implement | Cannot recover after crash | |
| No database dependency | No analytics/history | |

##### 4B. State/Data: In-memory + SQLite for word bank + optionally history

| Pros | Cons | Effort |
|------|------|--------|
| Word bank in DB is easy to manage | Slightly more complex setup | Low-Med |
| Can store game history for analytics | Not needed for MVP | |
| better-sqlite3 is synchronous and fast | | |

**Recommendation: Start with in-memory only.** For MVP, keep the word bank as a JSON file or hardcoded array. Add SQLite later if game history or dynamic word management becomes needed.

##### 5A. Hosting: Single server (frontend served by backend)

| Pros | Cons | Effort |
|------|------|--------|
| Simplest deployment, no CORS issues | Cannot scale frontend independently | Low |
| Single deploy target | | |
| Socket.IO works on same port | | |

##### 5B. Hosting: Separate frontend (Vercel/Netlify) + Backend (Railway/Fly)

| Pros | Cons | Effort |
|------|------|--------|
| Independent scaling | CORS configuration needed | Medium |
| Frontend CDN-served | Two deploy targets | |
| Professional separation | Complex WebSocket proxy setup | |

**Recommendation: Start with single server (5A).** Serve the built frontend from the same server that handles WebSocket connections. This eliminates CORS, WebSocket proxy issues, and deployment complexity. Can always split later.

---

#### 2. Game Architecture

##### State Machine Design

```
LOBBY ──[host starts]──> WORD_REVEAL ──[5s timer]──> DISCUSSION ──[vote timer]──> VOTING
                                                                                        │
                                                                                        v
GAME_OVER <──[condition met]── ROUND_RESULT <──[votes tallied]── VOTING
     │                                                                   │
     └──[host restarts]──> LOBBY (reusing same room)                    │
                                                                         │
                                          [no game over] ───────────────> WORD_REVEAL (next round)
```

**Phase details:**

| Phase | Duration | What happens |
|-------|----------|-------------|
| LOBBY | Indefinite | Players join/leave, host configures settings, host starts |
| WORD_REVEAL | ~5 seconds | Word shown to non-impostors, impostor sees "You are the impostor" |
| DISCUSSION | Configurable (60-120s) | Players talk on Discord, game shows player list |
| VOTING | Configurable (30s) | Each player votes for someone to expel (or skip) |
| ROUND_RESULT | ~10 seconds | Show who was expelled and their role, check game over |
| GAME_OVER | Indefinite | Show winner, option to play again |

##### Phase 1A: Timer-based phases (simple)

| Pros | Cons | Effort |
|------|------|--------|
| Simple to implement, deterministic | Less flexible | Low |
| Clear UX — players see countdown | | |

##### Phase 1B: Timer + early-skip (players can end phase early)

| Pros | Cons | Effort |
|------|------|--------|
| Faster games when players agree | More complex state logic | Medium |
| Better player experience | Need "everyone ready" detection | |

**Recommendation: Phase 1A for MVP.** Fixed timers keep things simple. Can add early-skip later. Discussion phase should be the longest configurable time.

---

#### 3. Real-Time Multiplayer Model

##### Message Protocol

**Client → Server events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ roomName, maxPlayers, username }` | Create a new room |
| `room:join` | `{ roomId, username }` | Join an existing room |
| `room:leave` | `{}` | Leave current room |
| `game:start` | `{}` | Host starts the game |
| `vote:submit` | `{ targetPlayerId }` | Cast vote (can be empty/null for skip) |
| `room:restart` | `{}` | Host restarts game after game over |

**Server → Client events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `room:joined` | `{ roomId, players[], hostId }` | Successfully joined |
| `room:player_joined` | `{ player }` | Another player joined |
| `room:player_left` | `{ playerId }` | Player disconnected/left |
| `room:error` | `{ message, code }` | Error notification |
| `game:phase_change` | `{ phase, duration }` | Game phase transition |
| `game:word_assigned` | `{ word: string \| null }` | Word for non-impostors, null for impostor |
| `game:player_expelled` | `{ playerId, wasImpostor }` | Someone was expelled |
| `vote:update` | `{ totalVotes, neededVotes }` | Vote progress (NOT who voted for whom) |
| `game:round_result` | `{ expelledPlayer, wasImpostor, impostorPlayerId }` | Full round reveal |
| `game:over` | `{ winner: 'impostor' \| 'innocents', impostorPlayerId }` | Game over |
| `connection:error` | `{ message }` | Connection-level error |

##### Connection Lifecycle

```
CONNECTING ──> CONNECTED ──> ROOM_JOINED ──> IN_GAME ──> DISCONNECTED
                                                           │
                                                           v
                                                    RECONNECT_WINDOW
                                                           │
                                              ┌────────────┴────────────┐
                                              v                         v
                                         RECONNECTED              TIMEOUT → REMOVED
```

- On disconnect: player stays in room for 30 seconds
- On reconnect within window: player rejoins, gets current game state
- On timeout: player is removed from game, vote is counted as "skip"

##### Server Architecture

```
Single process with async I/O:
┌─────────────────────────────────────────┐
│           HTTP Server (Fastify)          │
│            serves static frontend        │
├─────────────────────────────────────────┤
│          Socket.IO Server (same port)     │
│  ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Room 1 │ │ Room 2 │ │ Room N │       │
│  └────────┘ └────────┘ └────────┘       │
│    rooms stored in Map<string, Room>     │
├─────────────────────────────────────────┤
│         Game Logic Engine                │
│  • Room lifecycle management            │
│  • Round/phase state machine            │
│  • Word assignment (random from bank)   │
│  • Vote tallying                         │
│  • Game-over condition checking          │
│  • Timer management (setTimeout/clear)  │
└─────────────────────────────────────────┘
```

Single process is sufficient for the expected scale (tens to low hundreds of concurrent rooms). Node.js async I/O handles thousands of concurrent connections easily.

---

#### 4. Frontend Architecture

##### Page / Screen Structure

```
┌────────────────────────────────────┐
│              APP                    │
│  ┌──────────────────────────────┐  │
│  │  HOME / LANDING              │  │
│  │  • Create room form          │  │
│  │  • Join room form            │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  LOBBY                       │  │
│  │  • Player list               │  │
│  │  • Room code display         │  │
│  │  • Settings (host only)      │  │
│  │  • Start button (host only)  │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  GAME                        │  │
│  │  ┌──── WORD_REVEAL ────────┐│  │
│  │  │ • Word display (or role) ││  │
│  │  │ • Countdown timer       ││  │
│  │  └─────────────────────────┘│  │
│  │  ┌──── DISCUSSION ────────┐│  │
│  │  │ • Player list (alive)  ││  │
│  │  │ • Timer                 ││  │
│  │  └─────────────────────────┘│  │
│  │  ┌──── VOTING ────────────┐│  │
│  │  │ • Vote buttons per     ││  │
│  │  │   alive player         ││  │
│  │  │ • Skip option          ││  │
│  │  │ • Vote progress bar    ││  │
│  │  └─────────────────────────┘│  │
│  │  ┌──── ROUND_RESULT ──────┐│  │
│  │  │ • Expelled player      ││  │
│  │  │ • Role reveal          ││  │
│  │  │ • Next round countdown ││  │
│  │  └─────────────────────────┘│  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  GAME OVER                   │  │
│  │  • Winner announcement       │  │
│  │  • Impostor reveal           │  │
│  │  • Play again button         │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

##### Component Tree

```
<App>
  <SocketProvider>          — Socket.IO connection context
    <Router>
      <HomePage />          — Create/Join room form
      <LobbyPage>           — Pre-game waiting area
        <PlayerList />
        <RoomSettings />    — Host only
        <StartButton />     — Host only
      </LobbyPage>
      <GamePage>            — Main game view (phase-based)
        <PhaseHeader />     — Current phase + timer
        <PlayerList />      — Alive players with status
        <PhaseContent>      — Renders based on phase
          <WordReveal />    — Word or impostor role
          <Discussion />    — Waiting screen
          <Voting />        — Vote for a player
          <RoundResult />   — Expulsion reveal
        </PhaseContent>
        <GameLog />         — Event feed
      </GamePage>
      <GameOverPage>        — Final results
        <WinnerDisplay />
        <PlayAgainButton />
      </GameOverPage>
    </Router>
  </SocketProvider>
</App>
```

##### State Management: Zustand

Zustand over Redux or Context:
- Minimal boilerplate, lightweight (~1KB)
- Works well with Socket.IO event handlers
- Game state is relatively simple (room, game phase, players, word)
- No complex selectors or middleware needed

**Store slices:**
- `connectionStore` — socket connection status, reconnect state
- `roomStore` — room ID, host ID, players, room settings
- `gameStore` — current phase, timer, word (or null if impostor), votes
- `uiStore` — modal states, animations, loading/error states

---

#### 5. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **Word leak via network inspection** | Word is sent ONLY to non-impostor clients. The impostor receives a role string ("You are the impostor"), NOT the word. SSL/TLS encrypts transport. |
| **Client-side cheating** | All game logic is server-authoritative. Client only renders state and submits actions. Word assignment, role selection, vote tallying ALL happen server-side. |
| **Word bank exposure** | Word bank lives exclusively on the server. Never sent to clients in bulk. |
| **Vote manipulation** | Server validates each vote: one per player per round, target must be alive, player must be alive to vote. |
| **Room access** | Room codes are short alphanumeric strings. No password required (social game — friends share link). For more privacy, optionally add room passwords later. |
| **Username validation** | Server-side: length 2-16 chars, alphanumeric + underscore only, no duplicate names in same room, profanity filter. |
| **Rate limiting** | Limit message frequency per socket: max 10 actions/second. Drop excess with error. |
| **Room creation abuse** | Limit rooms per IP address. Clean up empty rooms. |
| **Disconnection attacks** | Players who disconnect during voting: auto-skip their vote after timeout window. Players who don't reconnect within 30s are removed. |
| **Multiple tabs** | For simplicity: same browser can open multiple tabs, each is a separate player. Could enforce one-per-session later. |

---

### Recommendation

**Recommended stack for MVP:**

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React 18 + Vite + TypeScript | Mature, fast, great DX |
| State | Zustand | Minimal boilerplate, perfect for game state |
| Backend | Node.js + Socket.IO + TypeScript | Built-in rooms, reconnection, event routing |
| Database | None (in-memory) → JSON word bank | Zero dependencies for MVP |
| Deployment | Single server (e.g., Railway, Fly.io) | Simplest, no CORS/proxy issues |
| Hosting | serve frontend from same server | Static files from Express/Fastify |

**Game architecture key decisions:**
1. Fixed timer phases (configurable per room)
2. Server-authoritative everything
3. Word bank as a JSON file on server (expandable)
4. Single process with Map<string, Room> for state
5. Shared TypeScript package for message protocol types

---

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Word leak via browser dev tools | Critical | Low | Word sent per-player, never broadcast. Memory cleared on phase transitions. |
| Room discovery/hacking | Medium | Low | Room codes use sufficient entropy (4+ alphanumeric). No room listing endpoint. |
| Node.js single-process crash | High | Low for MVP | Simple restart. Add process manager (PM2) or Docker restart policy. |
| Insufficient word bank | Low | Medium | Start with 100+ words. Make it easy to add more via JSON config. |
| Discord + Web timing mismatch | Medium | Medium | Show countdown timers clearly. Allow some grace period for vote submission. |
| Reconnection edge cases | Medium | Medium | Socket.IO handles most cases. Handle edge: reconnecting mid-vote, mid-word-reveal. |
| Timer desync | Medium | Low | Server is source of truth for timers. Client only displays countdown from server-emitted duration. |

---

### Ready for Proposal

**Yes.** The concept is well-defined, the scope is clear, and the architectural choices have clear tradeoffs with solid MVP recommendations.

The orchestrator should tell the user:
- Proposed stack: React + Vite + TypeScript (frontend), Node.js + Socket.IO + TypeScript (backend)
- Single-server deployment for simplicity
- Server-authoritative game logic with in-memory state
- MVPs should focus on: room management → game state machine → word reveal → voting → round results
- No audio/video, no database required for MVP

