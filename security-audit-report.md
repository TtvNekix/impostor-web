# El Impostor — Security Audit Report

**Date**: 2026-06-19
**Scope**: Static code review of `F:\web impostor` (server, client, shared packages, deploy scripts)
**Methodology**: Manual OWASP Top 10 (2021) review of all source files. No dynamic testing against production.
**Authorization**: Read-only audit. No files modified, no requests sent to the production server.

---

## Executive Summary

The codebase is small, modern, and well-organized. The author's intent is clear: defense in depth (CSP, HSTS, input validation, server-as-source-of-truth, host verification). React auto-escaping eliminates the classic XSS surface, and the WebSocket protocol correctly verifies host-only operations on the server.

However, several **high-impact issues** exist that warrant attention before a real threat model is finalized:

| # | Severity | Title | CWE |
|---|----------|-------|-----|
| 1 | **High** | Discord webhook URL hardcoded in source | CWE-798 |
| 2 | **High** | No `maxPayload` on the `ws` server → single-message DoS | CWE-770 |
| 3 | **High** | Username/room-code input is not validated server-side | CWE-20 |
| 4 | **High** | No rate limiting on any endpoint (HTTP or WS) | CWE-770 |
| 5 | **Medium** | Error messages from `RoomManager` leaked to client | CWE-209 |
| 6 | **Medium** | Host's first name leaked in `/api/rooms` DTO | CWE-359 |
| 7 | **Medium** | Public room DTO is unauthenticated & uncapped per IP | CWE-307 |
| 8 | **Medium** | `Math.random()` used for security-sensitive randomness | CWE-338 |
| 9 | **Medium** | Host can re-trigger `START_MATCH` mid-game (state race) | CWE-362 |
| 10 | **Low** | No `Origin` validation on WebSocket upgrade | CWE-346 |
| 11 | **Low** | Hardcoded fallback webhook + plaintext audit content | CWE-540 |
| 12 | **Info** | Stack traces logged on uncaught exception (internal only) | CWE-209 |
| 13 | **Info** | No body parser → no body-size attack surface (positive) | — |

The `pnpm audit` command reports **no known vulnerabilities** at the time of this review; the workspace `pnpm-workspace.yaml` overrides pin `vite@^6.4.3` and `esbuild@^0.25.0` specifically to dodge the known supply-chain CVEs.

---

## 1. OWASP A01:2021 — Broken Access Control

### A1-1 — Host-only WebSocket operations are properly enforced ✅
- **Location**: `server/src/ws/handlers.ts:237-249` (START_MATCH), `:254-262` (START_VOTING), `:278-380` (UPDATE_SETTINGS), `:385-423` (ADD_CATEGORY), `:428-467` (ADD_WORDS), `:472-480` (NEW_MATCH), `:572-639` (KICK_PLAYER)
- **Description**: Every privileged action looks up the caller via `connectionManager.getUsername(socketId)` and then checks `player.isHost` against the room's player map. The host is determined by socket-id→username→room lookup, not by any client-supplied field. `KICK_PLAYER` (line 599-603) also verifies the caller exists and is host before resolving a target.
- **Verdict**: No findings. Auth/authz is correct.

### A1-2 — `KICK_PLAYER` is rate-limit-free but server-validated ✅
- **Location**: `server/src/ws/handlers.ts:572-639`
- **Description**: A non-host cannot kick because the handler checks `host?.isHost` on the caller's player record. The target's socket ID is resolved server-side via `getSocketIdByUsername`. The target cannot be the caller (line 589-592).
- **Verdict**: No findings (modulo the global lack of rate limiting — see A04).

### A1-3 — Reconnect on a different socket is bound to username, not socket-id
- **Location**: `server/src/ws/handlers.ts:188-205` and `server/src/connection/ConnectionManager.ts:134-179`
- **Description**: A reconnect is only accepted if the existing `room.players.get(trimmedName)` entry is in `DISCONNECTED` status. There is no token or proof of identity — anyone who knows the username and connects within 30s of a disconnect can claim that slot. The threat model is "casual social game with friends"; this is acceptable. The risk only materializes if a malicious user already knows another player's exact username *and* the victim disconnects, and even then the attacker can only resume as the victim (no privilege escalation).
- **Verdict**: **Informational**. Acceptable for the trust model, but worth documenting in a threat model.

---

## 2. OWASP A02:2021 — Cryptographic Failures

### A2-1 — Room code and impostor/word selection use `Math.random()`
- **Severity**: **Medium**
- **CWE**: CWE-338 (Use of Cryptographically Weak PRNG)
- **Location**:
  - Room codes: `shared/src/utils.ts:13-20` (uses `Math.random()`)
  - Impostor shuffle: `server/src/room/RoomManager.ts:257-260` (uses `Math.random()` for Fisher-Yates)
  - Word/category selection: `server/src/words/WordBank.ts:34, 37, 46` (uses `Math.random()`)
- **Description**: V8's `Math.random()` uses XorShift128+, which is not cryptographically secure. For a casual game, room-code predictability is not a real attack surface (codes are ephemeral, 6 chars from a 32-char alphabet, and the worst an attacker can do is collide on a known 5-char code to join a room they were going to brute-force anyway). For impostor/word shuffling, fairness rather than secrecy is the concern, and `Math.random()` is statistically fine.
- **Impact**: Minimal for the current product. The only theoretical risk is "an attacker predicts a future room code and joins a friend's game with it" — and the predicted code would expire as soon as the real game starts.
- **Remediation**: Replace with `crypto.randomInt()` for room code and impostor/word selection. Trivial to fix.
  ```ts
  // shared/src/utils.ts
  import { randomInt } from 'node:crypto';
  export function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[randomInt(0, chars.length)];
    return code;
  }
  ```
- **Effort**: **Trivial** (~10 minutes).

### A2-2 — Socket IDs use `crypto.randomUUID()` ✅
- **Location**: `server/src/ws/handlers.ts:77`
- **Description**: New sockets get `randomUUID()` from `node:crypto`. The 122 bits of entropy is more than enough to prevent socket-id guessing.
- **Verdict**: No findings.

### A2-3 — TLS is correctly terminated at the edge
- **Location**: `F:\web impostor\11-ssl.conf` + Cloudflare DNS-only
- **Description**: TLS cert at NPM, `Strict-Transport-Security: max-age=31536000; includeSubDomains` set in the Express response, Cloudflare is DNS-only (no proxying), so the browser sees a real `wss://` and `https://` connection.
- **Verdict**: No findings.

### A2-4 — Sensitive data at rest: nothing
- **Description**: All game state is in-memory (`Map`s in `RoomStore`, `ConnectionManager`, `GameEngine`). No database, no log files written by the app, no cookies. The only persistent artifact is the Discord audit-log channel, which contains game metadata (see A09).
- **Verdict**: No findings.

---

## 3. OWASP A03:2021 — Injection (XSS, WebSocket payload, command)

### A3-1 — React auto-escapes all user-controlled text ✅
- **Locations (audited)**:
  - `client/src/components/PlayerList.tsx:63` — `{player.username}`
  - `client/src/components/VotingTable.tsx:119` — `{player.username}`
  - `client/src/components/PublicRoomList.tsx:103, 117, 124, 132` — `{room.roomCode}`, `{room.hostFirstName}`, `{categoryLabel}`, etc.
  - `client/src/screens/GameOverScreen.tsx:75` — `{impostorLabel}` (joined from impostorIds → players → usernames)
  - `client/src/screens/EvaluationScreen.tsx:68-86` — `{roundResult.expelledUsername}` inside `t.evaluation.expelled.replace(...)`
  - `client/src/components/PlayerList.tsx:85` — `aria-label={`${t.confirm.kick} ${player.username}`}` (auto-escaped)
- **Description**: Every spot where a username, room code, or category is rendered uses JSX text content (`{value}`), not `dangerouslySetInnerHTML`. React escapes `<`, `>`, `&`, `'`, `"` by default.
- **Verdict**: **No XSS via the user-controlled fields** that are visible to other clients. ✅

### A3-2 — No `dangerouslySetInnerHTML` or `innerHTML` usage anywhere
- **Verified by**: `grep` across `client/src` and `server/src` for `dangerouslySetInnerHTML|innerHTML|outerHTML|document\.write|eval\(|new Function`. **0 matches.**
- **Verdict**: No findings.

### A3-3 — WebSocket message validation is **partial**
- **Severity**: **High**
- **CWE**: CWE-20 (Improper Input Validation)
- **Location**: `server/src/ws/handlers.ts:109-501` (the entire `ws.on('message', ...)` handler)
- **Description**: The handler parses JSON, then casts `data` to a local TS shape with `as { ... }` — but **never validates**:
  - `username` is a string
  - `username` length is in `[1, 20]`
  - `username` does not contain control characters, Unicode tags, zero-width chars, etc.
  - `code` is a string of `[A-Z0-9]{4,6}`
  - `targetId` (in VOTE) is a string of the expected format (the gameplay code does check it against `gs.players` — see A3-4)
  - `settings.impostorCount` etc. is the right type (TS type assertions are stripped at runtime)
- **Proof of Concept**:
  - Connect to the WebSocket, then send:
    ```json
    {"event":"create_room","data":{"code":"X","username":"<script>alert(1)</script>","settings":{}}}
    ```
    The server stores the username and broadcasts it to every other client. React escapes it client-side, so no XSS, but the **string is stored in memory and in audit logs** verbatim.
  - Send a username 10 MB long. The server stores it, broadcasts it (so each other client must allocate ~10 MB just to display the player list), and the audit log POSTs a 10 MB field to Discord (which will reject the webhook call and the call will silently fail). Result: a single OOM.
  - Send a code like `"../../etc/passwd"`. The server normalizes to `"../../ETC/PASSWD"` and uses it as a `Map` key — no traversal (the key never touches `fs`), but it does end up in the public `/api/rooms` DTO and gets rendered to every lobby browser.
- **Impact**: DoS via memory exhaustion (huge usernames / categories), plus an unbounded-string data-flow problem in the audit log channel. No XSS (React saves us), but no defense-in-depth either.
- **Remediation**: Add a `validate.ts` helper and call it at the top of every handler:
  ```ts
  // shared/src/validators.ts
  export function validateUsername(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > 20) return null;
    if (/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2066-\u2069]/.test(trimmed)) return null;
    return trimmed;
  }
  export function validateCode(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const upper = raw.toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(upper)) return null;
    return upper;
  }
  ```
  Apply these in every case branch of `ws.on('message', ...)`. Also enforce the same validation in the `UPDATE_SETTINGS` and `ADD_CATEGORY` paths.
- **Effort**: **Small** (~1 hour). High value: closes the input-validation gap that is the single largest source of attack surface.

### A3-4 — Vote target ID is properly checked against the player list ✅
- **Location**: `server/src/game/GameEngine.ts:243-307`
- **Description**: `processVote` validates `targetId` is a string (line 292), looks it up in `gs.players` (line 299), rejects self-vote (line 282), rejects double-vote (line 273), and rejects if voter is not ACTIVE (line 263-269).
- **Verdict**: No findings.

### A3-5 — JOIN_ROOM `code` cannot cause path traversal ✅
- **Location**: `server/src/room/RoomStore.ts:7-22`
- **Description**: The code is used as a `Map<string, Room>` key, never as a filesystem path. `Map.has()` and `Map.get()` are not vulnerable to `../` injection.
- **Verdict**: No findings.

### A3-6 — CSP includes `unsafe-inline` for `style-src`
- **Severity**: **Low**
- **CWE**: CWE-1021 (Improper Restriction of Rendered UI Layers)
- **Location**: `server/src/index.ts:65`
- **Description**: The CSP set at `style-src 'self' 'unsafe-inline'` allows inline `<style>` and `style=` attributes. The author's comment explains this is for Vite inlining styles in dev — but the production build is also covered by the same middleware, and the comment claims "production bundles a single .css". If the production build never emits inline styles, this could be tightened to remove `'unsafe-inline'`.
- **Remediation**: Confirm the production CSS output, then drop `'unsafe-inline'` from `style-src` (or scope it to `'unsafe-hashes'` with explicit hashes).
- **Effort**: **Small** (~30 minutes to test).

### A3-7 — No command injection surface
- **Description**: The server does not shell out, does not pass user input to `child_process`, does not write to disk from user input. ✅
- **Verdict**: No findings.

---

## 4. OWASP A04:2021 — Insecure Design

### A4-1 — Host can re-trigger `START_MATCH` mid-game
- **Severity**: **Medium**
- **CWE**: CWE-362 (Concurrent Execution / Race Condition)
- **Location**: `server/src/game/GameEngine.ts:40-191`
- **Description**: `startMatch` does not check `room.gameState.phase` at the top. If the host sends `START_MATCH` during an in-progress game (e.g. they double-clicked "Start voting", or a malicious host scripted it), the function:
  1. Re-selects impostors (different from the previous round — potential fairness issue if the original round had a special state)
  2. Overwrites `room.gameState` with a fresh state (line 139: `room.gameState = gameState;`)
  3. Broadcasts a new `GAME_STARTED` to all players mid-round
  4. Sends new `WORD_ASSIGNED` events (overwriting players' current word)
- **Impact**: Confused state, lost role information, potential integrity issues. In a casual game this is a "soft bug"; in a competitive context it could be exploited.
- **Remediation**: Add a phase guard:
  ```ts
  if (room.gameState && room.gameState.phase !== 'GAME_OVER' && room.gameState.phase !== 'LOBBY') {
    this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
      code: ErrorCode.GAME_IN_PROGRESS, message: 'A match is already in progress',
    });
    return false;
  }
  ```
- **Effort**: **Trivial** (~5 minutes).

### A4-2 — No rate limiting anywhere
- **Severity**: **High**
- **CWE**: CWE-770 (Allocation of Resources Without Limits or Throttling)
- **Locations**:
  - `GET /api/rooms` — `server/src/index.ts:131-165` (no rate limit, returns up to 50 room DTOs per call)
  - All `case` branches in `server/src/ws/handlers.ts:128-499` (no per-socket message rate)
  - `app.get('/health')` — `server/src/index.ts:109-111` (no rate limit)
- **Description**: An attacker can:
  - Open a single WebSocket and send 10,000 `create_room` messages/second. Each one creates a `Room` and a `Player` and registers a `ConnectionManager` entry. Memory grows unbounded; legitimate traffic is starved.
  - Open 100,000 WebSocket connections and call `GET /api/rooms` on each. CPU spent serializing the room list, bandwidth consumed.
  - Open 1,000 WebSockets and send 1 million `join_room` messages. Each one builds a `RoomJoinedPayload` DTO and serializes it.
- **Impact**: Trivial denial of service. The single-server deployment (`Proxmox` container with 1 GB RAM) is especially vulnerable.
- **Remediation**:
  1. Add a per-socket message rate limit in the WebSocket handler:
     ```ts
     let msgCount = 0;
     const RATE_RESET_MS = 1000;
     const MAX_PER_SEC = 50;
     let rateResetTimer = setTimeout(() => { msgCount = 0; rateResetTimer = setTimeout(...); }, RATE_RESET_MS);
     ws.on('message', (raw) => {
       if (++msgCount > MAX_PER_SEC) { ws.terminate(); return; }
       // ... existing handler
     });
     ```
  2. Add `express-rate-limit` to the Express app for the HTTP routes.
  3. Set `WebSocketServer({ server, maxPayload: 16 * 1024 })` (see A5-1).
- **Effort**: **Small** (~1 hour for both layers).

### A4-3 — Impostor count is enforced server-side ✅
- **Location**: `server/src/game/GameEngine.ts:79-86`
- **Description**: `clampedCount = room.settings.hardcore ? 1 : Math.max(1, Math.min(room.settings.impostorCount, maxAllowed))` overrides the host's value. The client UI cannot subvert this.
- **Verdict**: No findings.

### A4-4 — Username collision during reconnect is handled, but with a side-effect
- **Location**: `server/src/ws/handlers.ts:188-205`
- **Description**: If user A is in a room, then user B sends a `JOIN_ROOM` with A's exact username while A is disconnected, the code first checks for reconnect (finds A is `DISCONNECTED`, so it claims A's slot as a "reconnect"). The check at line 192 is `existing && existing.status === 'DISCONNECTED'` — no verification that the joining socket *is* the original A.
- **Impact**: Identity hijack. If user A's connection drops for >0 seconds (the status is set in `onDisconnect`, which runs on the *first* `close` event) and user B connects with A's exact username, B takes A's slot *including* the `isHost` flag if A is the host. This is the trust-model trade-off in A1-3.
- **Remediation**: Either accept the risk (current design) or require a reconnection token issued at `LEAVE_ROOM` / disconnect time. For a casual game, the current behavior is fine; document it.
- **Effort**: **Documentation only** OR **Medium** (2-3 hours for a token-based reconnect).

### A4-5 — `vote` for a target outside the room is properly rejected
- **Location**: `server/src/game/GameEngine.ts:291-307`
- **Description**: `targetId` is checked against `gs.players` (the current game's player list). Out-of-room IDs are rejected.
- **Verdict**: No findings.

---

## 5. OWASP A05:2021 — Security Misconfiguration

### A5-1 — WebSocket server has no `maxPayload`
- **Severity**: **High**
- **CWE**: CWE-770
- **Location**: `server/src/index.ts:38` — `const wss = new WebSocketServer({ server });`
- **Description**: The `ws` library's default `maxPayload` is **100 MB**. A single client can send a 100 MB JSON blob in one message; the server will buffer it all in memory before invoking the `message` handler.
- **Proof of Concept**:
  ```js
  const ws = new WebSocket('wss://impostor.nekix.lol/');
  ws.onopen = () => {
    ws.send(JSON.stringify({ event: 'create_room', data: { code: 'AAAA', username: 'A'.repeat(100 * 1024 * 1024), settings: {} } }));
  };
  ```
  The server will try to allocate a 100 MB string before throwing or OOM.
- **Remediation**:
  ```ts
  const wss = new WebSocketServer({
    server,
    maxPayload: 16 * 1024, // 16 KB — far above any legitimate message
  });
  ```
- **Effort**: **Trivial** (~2 minutes).

### A5-2 — Security headers are correctly set ✅
- **Location**: `server/src/index.ts:55-75`
- **Description**:
  - `X-Content-Type-Options: nosniff` ✅
  - `X-Frame-Options: DENY` ✅
  - `Referrer-Policy: strict-origin-when-cross-origin` ✅
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` ✅
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` ✅
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` ✅
  - `X-Powered-By` disabled (line 54: `app.disable('x-powered-by')`) ✅
- **Verdict**: No findings. (Note: the CSP's `connect-src 'self' wss:` is fine because all WS traffic uses the same origin; for development the client sets `VITE_SERVER_URL` which is same-origin in prod.)

### A5-3 — `Server: Express` header not sent ✅
- **Verified by**: `app.disable('x-powered-by')` at `server/src/index.ts:54`. `x-powered-by` is the only fingerprinting header Express adds by default.
- **Verdict**: No findings.

### A5-4 — CORS: no CORS middleware is used ✅
- **Description**: The server has no `cors` package and no manual `Access-Control-Allow-Origin` header is set. Browser same-origin policy blocks cross-origin XHR/fetch by default. The `/api/rooms` endpoint is intentionally public but not CORS-enabled, so external sites cannot read the room list.
- **Verdict**: No findings (intentional behavior).

### A5-5 — Static file path traversal: not exploitable ✅
- **Location**: `server/src/index.ts:178-201`
- **Description**: `express.static(clientDist)` is safe by default. The SPA fallback at line 193-201 always returns `index.html` (not user-controlled), so even a request like `GET /../../../etc/passwd` lands on `path.join(clientDist, 'index.html')`, which Express resolves to `<clientDist>/index.html`.
- **Verdict**: No findings.

### A5-6 — No body parser mounted
- **Description**: The Express app does not call `express.json()` or `express.urlencoded()`. The only HTTP routes are GET, so the lack of a body parser is fine. There is no `body-parser` package, and the default body-size limit doesn't apply.
- **Verdict**: **Positive finding** — no body-parser DoS attack surface.

### A5-7 — No cookies used ✅
- **Description**: The app is fully stateless on the HTTP side; identity lives in the WebSocket layer. No session, no auth cookie, no CSRF concern.
- **Verdict**: No findings.

---

## 6. OWASP A06:2021 — Vulnerable & Outdated Components

### A6-1 — `pnpm audit` reports no vulnerabilities
- **Verified by**: `pnpm audit --prod` ran at audit time, output: `No known vulnerabilities found`.
- **Versions installed (from `pnpm-lock.yaml`)**:
  - `ws@8.21.0` — CVE-2024-37890 was fixed in `8.17.1`; `8.21.0` is patched.
  - `vite@6.4.3` — patched (per `pnpm-workspace.yaml` overrides: `vite: ^6.4.3, esbuild: ^0.25.0`).
  - `esbuild@0.25.12` — patched (≥ 0.25.0 fixes GHSA-67mh-4wv8-2f99).
  - `vitest@3.2.6` — the user-mentioned CVEs (UI server RCE) affect `<3.2.6`; `3.2.6` is patched. Vitest is **dev-only** and does not run on the production server.
  - `express@4.22.2` — current stable.
- **Verdict**: No findings. The author's proactive `pnpm-workspace.yaml` overrides are a **positive finding** — they pin the build to versions that dodge all the recent supply-chain CVEs.

---

## 7. OWASP A07:2021 — Identification & Authentication Failures

### A7-1 — No persistent identity
- **Description**: The app has no login, no signup, no password, no email, no identity proof. Identities are ephemeral socket IDs + username strings. ✅
- **Verdict**: This is the right design for a casual multiplayer game. No findings.

### A7-2 — Username uniqueness within a room is enforced server-side ✅
- **Location**: `server/src/room/RoomManager.ts:114-116` (`if (room.players.has(username)) throw new Error('Username already taken');`)
- **Verdict**: No findings.

### A7-3 — No password / token, but the game requires none
- **Description**: A malicious user can impersonate any "guest" identity by sending the same username. They cannot, however, take over an *active* (non-disconnected) player.
- **Verdict**: Acceptable for the trust model. See A1-3 for the reconnect-hijack nuance.

---

## 8. OWASP A08:2021 — Software & Data Integrity Failures

### A8-1 — State machine prevents illegal phase transitions ✅
- **Location**: `server/src/game/StateMachine.ts:12-19` (the `VALID_TRANSITIONS` map) and `server/src/game/StateMachine.ts:33-53` (`transition` method enforces it)
- **Description**: `transition('EVALUATION', 'LOBBY')` returns `false`. The state machine is the only place phases change, and all transitions are validated.
- **Verdict**: No findings.

### A8-2 — Word assignments are sent only to the recipient ✅
- **Location**: `server/src/game/GameEngine.ts:175-179`
  ```ts
  for (const gp of gamePlayers) {
    const word = gp.isImpostor ? null : gameState.word;
    this.connManager.sendToSocket(gp.id, ServerEvent.WORD_ASSIGNED, { word });
  }
  ```
- **Description**: Each player's word is sent only to their own socket. The broadcast `GAME_STARTED` event only contains `impostorIds` (line 153-158), not the word.
- **Verdict**: No findings.

### A8-3 — `room.players.set(username, player)` overwrites silently on collision
- **Location**: `server/src/ws/handlers.ts:149` — `room.players.set(username.trim(), player);`
- **Description**: In `CREATE_ROOM`, after `roomManager.createRoom` returns, the handler calls `room.players.set(username.trim(), player)` with the trimmed name. Since `createRoom` already added the player with the same key (line 100 of RoomManager.ts), this is redundant but not a bug. However, in `UPDATE_SETTINGS` (line 287), the handler does `room.players.get(connectionManager.getUsername(socketId)!)` — the username is taken from the connection, which was registered with the trimmed name, so this lookup works.
- **Verdict**: No findings.

### A8-4 — Public-rooms DTO leaks host's first name without consent
- **Severity**: **Medium**
- **CWE**: CWE-359 (Exposure of Private Personal Information to an Unauthorized Actor)
- **Location**: `server/src/room/RoomStore.ts:67-79`
- **Description**: The `/api/rooms` endpoint returns `hostFirstName` — the first whitespace-delimited token of the host's username. The author documents this in the comment (lines 47-50) as a deliberate trade-off, but it does mean a user who joins with their full real name has their first name broadcast to every browser that hits `/api/rooms`.
- **Impact**: Privacy leak, especially on the `/salas` public page. A user named "María García" is publicly displayed as "María". This is a *behavior*, not a bug, but worth a product decision.
- **Remediation**: Either (a) document explicitly in the UI ("Your first name will be visible to other players"), or (b) add a `publicName` field separate from the in-room username, or (c) hash/anonymize the first name.
- **Effort**: **Small** for documentation; **Medium** for code change.

---

## 9. OWASP A09:2021 — Security Logging & Monitoring Failures

### A9-1 — Hardcoded Discord webhook URL in source
- **Severity**: **High**
- **CWE**: CWE-798 (Use of Hard-coded Credentials)
- **Location**: `server/src/audit/logger.ts:8-9`
  ```ts
  const WEBHOOK_URL = process.env.AUDIT_WEBHOOK_URL
    ?? 'https://discord.com/api/webhooks/1516416022872064100/nWmudVWKTa-jsp5K6gbUtlHXcNITDI2Im6iIVymHKB7GIZfl-bg8C2Y93Ft2psjJojXs';
  ```
- **Description**: A Discord webhook is a write-credential to a private channel. The URL is committed to the source repository (and the GitHub repo is public — see `client/src/components/ContributeModal.tsx:3` for `https://github.com/TtvNekix/impostor-web`). Any reader of the GitHub repo can now post arbitrary messages to the audit channel — flooding it, poisoning the audit trail, or exfiltrating data via cleverly crafted messages.
- **Proof of Concept**:
  ```bash
  curl -X POST -H 'content-type: application/json' \
    -d '{"content":"audit channel compromised — see https://impostor.nekix.lol"}' \
    'https://discord.com/api/webhooks/1516416022872064100/nWmudVWKTa-jsp5K6gbUtlHXcNITDI2Im6iIVymHKB7GIZfl-bg8C2Y93Ft2psjJojXs'
  ```
- **Impact**: Audit log poisoning, alerting disruption, social-engineering foothold (the audit log is presumably trusted by the maintainer).
- **Remediation**:
  1. **Immediately rotate the Discord webhook** (delete the old one in the Discord UI and create a new one).
  2. Make `AUDIT_WEBHOOK_URL` a *required* env var; if not set, `logEvent` should console-log only:
     ```ts
     if (!WEBHOOK_URL) return;
     ```
  3. Never fall back to a hardcoded URL in the source.
- **Effort**: **Trivial** (~10 minutes) for the fix; the rotation is operational.

### A9-2 — `logEvent` POSTs the full word assignment table
- **Severity**: **Medium**
- **CWE**: CWE-532 (Insertion of Sensitive Information into Log File), CWE-209 (Information Exposure Through an Error Message)
- **Location**: `server/src/game/GameEngine.ts:160-173`
  ```ts
  logEvent('match_started', {
    code: roomCode,
    roundNumber: gameState.roundNumber,
    hardcore: room.settings.hardcore,
    votingTimer: room.settings.votingTimer,
    wordCategory: gameState.category,
    wordAssignments: gamePlayers.reduce(
      (acc, gp) => {
        acc[gp.id] = gp.isImpostor ? '<impostor>' : gameState.word!;
        return acc;
      },
      {} as Record<string, string>,
    ),
  });
  ```
- **Description**: The full `word` (the secret word for the round) is logged to the audit channel along with the player ID for every non-impostor. This means every Discord audit-log reader can see the secret word in plaintext. If the audit log is leaked, every game in history is compromised. Even if the channel is private, this is over-collection.
- **Remediation**: Log only `wordCategory` and the *impostor IDs* (not the word, not the per-player mapping).
  ```ts
  logEvent('match_started', {
    code: roomCode,
    roundNumber: gameState.roundNumber,
    wordCategory: gameState.category,
    impostorIds: gameState.impostorIds,
  });
  ```
- **Effort**: **Trivial** (~5 minutes).

### A9-3 — `error.message` and `error.stack` are logged to the audit webhook on uncaught exception
- **Severity**: **Low**
- **CWE**: CWE-209
- **Location**: `server/src/index.ts:227-246`
- **Description**: `process.on('uncaughtException', ...)` and `process.on('unhandledRejection', ...)` POST `err.message` and `err.stack` to the audit webhook. Stacks may contain internal paths, dependency names, and (potentially) user input that triggered the error. For a private audit channel this is acceptable; for a public channel, it's over-sharing.
- **Remediation**: If the audit channel is shared with anyone outside the dev team, scrub `err.stack` before sending (or send only the type + a hash of the message).
- **Effort**: **Trivial**.

### A9-4 — Stack traces are NOT sent to the client ✅
- **Location**: All `sendError` calls in `server/src/ws/handlers.ts` and `server/src/game/GameEngine.ts:42-44, 51-53, 60-67, ...`
- **Description**: The client only receives `code` and a localized `message` (or a generic English fallback). No stacks, no internal paths.
- **Verdict**: No findings.

### A9-5 — But `sendError(ws, roomErrorCode(err), err.message)` does leak error messages
- **Severity**: **Medium**
- **CWE**: CWE-209
- **Location**: `server/src/ws/handlers.ts:167, 229, 377, 420, 464`
- **Description**: Every `try { ... } catch (err: any) { sendError(ws, roomErrorCode(err), err.message); }` sends the raw error message to the client. Examples:
  - `'Room code "XXX" is already taken'` — leaks the code (low impact)
  - `'Player not found in room'` — minor
  - `'La categoría "xxx" ya existe'` (Spanish!) — leaks server error messages in the *server's* UI language, not the client's. A user with `en` locale gets Spanish error text from the server.
  - `'No se pueden crear categorías durante la partida'` (Spanish) — **always Spanish**, regardless of the client's locale.
- **Impact**: Information leak (which keys exist in the WordBank), and a localization inconsistency (server errors in Spanish to an English client).
- **Remediation**: Send only the `code` and let the client localize. The English fallback in `roomErrorCode`'s default branch (`ErrorCode.GENERIC`) is enough for clients that don't have a localized message.
  ```ts
  sendError(ws, roomErrorCode(err), 'Generic error');
  // or better:
  sendError(ws, roomErrorCode(err), t.errors.generic_for_locale || 'Generic error');
  ```
- **Effort**: **Small** (~30 minutes).

---

## 10. OWASP A10:2021 — Server-Side Request Forgery (SSRF)

### A10-1 — Server fetches one external URL: the Discord webhook
- **Location**: `server/src/audit/logger.ts:31`
- **Description**: The webhook URL is hardcoded, not user-controllable. There is no path through which a client can influence where the server fetches.
- **Verdict**: **No SSRF** (no user input reaches the URL). ✅

### A10-2 — No avatar / image / URL proxy
- **Description**: The app does not accept user-supplied URLs to fetch. The only external network call is the audit webhook.
- **Verdict**: No findings.

---

## Additional WebSocket-Specific Findings (not strictly OWASP)

### WS-1 — No `Origin` check on WebSocket upgrade
- **Severity**: **Low**
- **CWE**: CWE-346 (Source Verify Error)
- **Location**: `server/src/index.ts:38`
- **Description**: A WebSocket connection can be opened from any origin. The browser will block cross-origin reads (the `Sec-WebSocket-Protocol` and `Origin` headers are browser-enforced for WS reads), but a *server-to-client* WebSocket server can be abused to attack third-party origins in some scenarios. For this app, the only attack surface is "anyone can spam your server", which is already covered by the rate-limit gap (A4-2).
- **Remediation**: Optional — if the production server has a single public origin (`https://impostor.nekix.lol`), add:
  ```ts
  const wss = new WebSocketServer({
    server,
    maxPayload: 16 * 1024,
    verifyClient: ({ origin }, cb) => {
      cb(origin === 'https://impostor.nekix.lol' || !origin);
    },
  });
  ```
  Note: `verifyClient` was removed in `ws@8`; use the `upgrade` event or the `handleProtocols` option in modern code. The current `ws@8.21.0` still supports `verifyClient` but it's deprecated.
- **Effort**: **Small**.

### WS-2 — `perMessageDeflate` is enabled by default
- **Severity**: **Low**
- **CWE**: CWE-409 (Improper Handling of Highly Compressed Data)
- **Location**: `server/src/index.ts:38` (defaults are accepted)
- **Description**: The `ws` library enables `perMessageDeflate` by default. This is fine for normal traffic, but a malicious peer can send a small payload compressed to gigabytes via the "zlib bomb" attack, exhausting server memory.
- **Remediation**: Disable per-message deflate or set a `maxPayload` cap (which also caps the deflated payload):
  ```ts
  const wss = new WebSocketServer({
    server,
    maxPayload: 16 * 1024,
    // perMessageDeflate: false,  // uncomment if DoS becomes a problem
  });
  ```
- **Effort**: **Trivial**.

### WS-3 — No backpressure / write-buffer monitoring
- **Severity**: **Low**
- **CWE**: CWE-770
- **Location**: `server/src/connection/ConnectionManager.ts:41-48, 54-59`
- **Description**: `broadcastToRoom` and `sendToSocket` call `ws.send()` without checking the return value. A slow consumer (e.g. a WebSocket client that doesn't read its messages) will buffer messages in Node's `ws` internal buffer indefinitely. With a host spamming `start_match` and a slow client, memory grows without bound.
- **Remediation**: Check `ws.bufferedAmount` and skip / drop the slow client:
  ```ts
  if (entry.ws.bufferedAmount > 1024 * 1024) {
    entry.ws.terminate();
    continue;
  }
  ```
- **Effort**: **Small**.

### WS-4 — `Map` cleanup on disconnect looks correct ✅
- **Location**: `server/src/connection/ConnectionManager.ts:92-124, 212-218, 80-86`
- **Description**: Connections are removed in `onDisconnect` (line 92), `removeConnection` (line 212), and `handleHostLeft` (line 80-86). No leaks identified.
- **Verdict**: No findings.

### WS-5 — Reconnect race condition (documented) is bounded
- **Location**: `server/src/connection/ConnectionManager.ts:119-124, 134-179`
- **Description**: Disconnect timer is 30s. On reconnect within the window, the timer is cleared. On timer expiry, the player is removed. The race between reconnect and cleanup is handled by clearing the timer in `onReconnect`. ✅
- **Verdict**: No findings.

---

## 11. Supply-Chain (additional context)

The `pnpm-lock.yaml` was inspected for the dependencies called out in the audit prompt. All are patched:

| Package | Installed | Latest patched | Status |
|---------|-----------|----------------|--------|
| `ws` | `8.21.0` | `8.21.0+` (CVE-2024-37890 fixed in 8.17.1) | ✅ Patched |
| `vite` | `6.4.3` | `6.4.3+` (server.fs.deny, .map traversal, NTLMv2 via UNC) | ✅ Patched (forced via `pnpm-workspace.yaml` override) |
| `vitest` | `3.2.6` | `3.2.6` (UI server RCE fix) | ✅ Patched (dev-only, not on prod server) |
| `esbuild` | `0.25.12` | `0.25.0+` (SSRF in dev server) | ✅ Patched (forced via `pnpm-workspace.yaml` override) |
| `express` | `4.22.2` | `4.22.x` | ✅ Current |

**Positive finding**: The author's decision to pin `vite@^6.4.3` and `esbuild@^0.25.0` via `pnpm-workspace.yaml` overrides is exactly the right pattern — these are dev-only dependencies, but if a transitive `vitest` pulled a vulnerable `vite@5.x`, the build would be vulnerable. The override prevents that.

---

## Summary of Recommendations (Prioritized)

| Priority | Effort | Action | File |
|----------|--------|--------|------|
| 🔴 P0 | 5 min | **Rotate the hardcoded Discord webhook** in `audit/logger.ts:9` | `server/src/audit/logger.ts` |
| 🔴 P0 | 2 min | Add `maxPayload: 16 * 1024` to `WebSocketServer` | `server/src/index.ts:38` |
| 🔴 P0 | 1 hr | Add server-side input validation for username, code, settings, words | `server/src/ws/handlers.ts`, `server/src/room/RoomManager.ts` |
| 🟠 P1 | 1 hr | Add per-socket WS rate limit + HTTP rate limit | `server/src/ws/handlers.ts`, `server/src/index.ts` |
| 🟠 P1 | 5 min | Remove `wordAssignments` from the audit log | `server/src/game/GameEngine.ts:160-173` |
| 🟠 P1 | 5 min | Add phase guard to `startMatch` to prevent re-trigger | `server/src/game/GameEngine.ts:40-191` |
| 🟠 P1 | 30 min | Stop sending `err.message` to clients; let i18n localize | `server/src/ws/handlers.ts` (5 sites) |
| 🟡 P2 | 10 min | Replace `Math.random()` with `crypto.randomInt()` for room codes and shuffling | `shared/src/utils.ts`, `server/src/room/RoomManager.ts`, `server/src/words/WordBank.ts` |
| 🟡 P2 | 30 min | Confirm `style-src 'unsafe-inline'` is needed in production CSP | `server/src/index.ts:65` |
| 🟡 P2 | 1 hr | Add backpressure check on broadcast/send | `server/src/connection/ConnectionManager.ts` |
| 🟢 P3 | 30 min | Disable `perMessageDeflate` or bound it via `maxPayload` (already covered) | `server/src/index.ts:38` |
| 🟢 P3 | 30 min | Add `verifyClient` (or upgrade-handler) to enforce Origin | `server/src/index.ts:38` |
| 🟢 P3 | Doc | Document the reconnect-hijack trade-off in AGENTS.md | `F:\web impostor\AGENTS.md` |

---

## What This Codebase Does Well

- **React everywhere** — auto-escaping is the single biggest reason the XSS surface is so small.
- **No `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `new Function`** — verified by full-tree grep.
- **Host-only operations are server-verified**, not just client-guarded.
- **Impostor count is server-enforced** (clamped in `GameEngine.startMatch`).
- **The state machine is the only path for phase changes**, and it validates every transition.
- **Word assignments are sent only to the recipient socket**, not broadcast.
- **Security headers are comprehensive** — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options all set.
- **`X-Powered-By` is disabled** — no Express fingerprint.
- **No body parser** — closes a whole class of body-size DoS.
- **Public rooms DTO is deliberately small** — hostFirstName + locale + player count, not full settings.
- **Workspace `pnpm-workspace.yaml` overrides** dodge all the known 2024-2026 supply-chain CVEs.
- **Audit log** records security-relevant events (`match_started`, `round_result`, `player_kicked`, etc.).
- **Host disconnect cascades destroy the room** — no zombie rooms, no memory leak from stranded state.
- **Connection reconnect timer (30s) prevents join-bombing** of a transient disconnect slot.

The author clearly understands the security model. The findings above are about hardening the edges, not about fixing a broken design.
