# Agent Notes — El Impostor

Production deployment details. Read this before doing any deploy or feature work.

## Production Infrastructure

- **App URL**: https://impostor.nekix.lol
- **Server**: Proxmox container at `192.168.1.11` (hostname: `bot-coffeeprojects`)
- **Nginx Proxy Manager**: `192.168.1.50` (SSL termination + ACME)
- **Cloudflare**: DNS-only (gray cloud) for Let's Encrypt, SSL mode: Flexible
- **Domain → NPM** via `impostor.nekix.lol` (proxy host 11) → `http://192.168.1.11:3001`
- **Port 3001** is NOT publicly exposed — only NPM proxies to it

## SSH Access to Production

- **User**: `root` (NOT `juanp`)
- **Password**: `juanito2005`
- **SSH host key fingerprint**: `ssh-ed25519 255 SHA256:9iu9X9qrz2sWQGlMDt15w2mSk4tggRSzzadQ78ooMV0`
- **PuTTY hostkey cache is unreliable** — gets cleared between sessions
- **Windows OpenSSH doesn't work** — server uses `sntrup761x25519-sha512@openssh.com` kex which Windows OpenSSH 9.5p2 doesn't support
- **Use paramiko** (Python SSH library) — bypasses both issues

## Deploy Method

**Always use** `pnpm deploy` or `python scripts/deploy.py`. The script:
1. Uploads `client/dist/index.html` (CRITICAL — references the JS hash)
2. Uploads all hashed JS/CSS/map files in `client/dist/assets/`
3. Uploads static files at `client/dist/` root (favicons, logos, web manifest, etc.)
4. Uploads changed server source files (`server/src/**/*.ts`)
5. Uploads changed shared source files (`shared/src/**/*.ts`)
6. Removes orphan asset hashes from previous builds
7. Restarts the `impostor-web` systemd service
8. Waits 2s for the port to actually open (service can be "active" but not listening yet)
9. Verifies HTTP responses locally and via public domain

### Sub-commands
- `pnpm deploy` — full deploy
- `pnpm deploy:verify` — only verify current state
- `pnpm deploy:client` — client only
- `pnpm deploy:server` — server only

**Always include `index.html` in the upload**. If you upload a new JS but the old index.html is still on the server, it will still reference the old JS hash and the new code never loads.

## Project Structure

- Monorepo: `shared/`, `server/`, `client/` (pnpm workspaces)
- Server uses `tsx` to load `shared/src/*.ts` directly — shared package doesn't need a build step, but changes to shared source files MUST be deployed
- Client is a React 18 + Vite SPA, built to `client/dist/`
- Server is Node.js + Express + raw `ws` WebSocket (NOT Socket.IO — replaced because Engine.IO doesn't pass through proxies)

## Internationalization (i18n)

- 6 languages supported: **EN, ES (Castilian), PT, FR, IT, DE**
- Dictionary files: `client/src/i18n/{en,es,pt,fr,it,de}.ts`
- `useT()` hook returns the active dictionary
- `useLocale()` returns the active locale code
- `useSetLocale()` returns a setter
- Selection persisted in `localStorage` under `impostor.locale`
- Auto-detects browser language on first load
- Type-safe: all 6 files must have the same nested shape (DeepStringify checks at build time)
- Spanish must use **castellano** forms (no voseo): introduce, completa, elige, separa (not ingresá, completá, elegí, separá); vosotros imperatives (hablad, votad, leed)

## Game Mode Status

- **"By word" (Por palabra)**: ACTIVE — current game, 3+ players
- **"By image" (Por imagen)**: COMING SOON — disabled with "Próximamente" badge
- Both modes share the same game flow; only the secret assignment differs

## Impostor Count Rule

- Player count is a function of lobby size, **not a host-pickable setting**:
  - 4 or fewer players → 1 impostor
  - 5 or more players → 2 impostors
- Server enforces in `startMatch` via `GameEngine.getMaxImpostors()`
- UI shows the value as a read-only chip in the lobby settings panel

## New Features (added in 2026-06-15)

### Notifications
- Global toast system (`client/src/stores/toastStore.ts`)
- `ToastContainer` renders a portal of active toasts
- `useToastStore.getState().push({ message, variant, code })` to dispatch

### Error handling
- React `ErrorBoundary` (`client/src/components/ErrorBoundary.tsx`) wraps the entire app
- Renders a localized fallback panel with a Reload button on unhandled errors
- Catches unhandled render errors so the user never sees a blank screen

### Confirmation modal
- Reusable `ConfirmationModal` (`client/src/components/ConfirmationModal.tsx`)
- Used for: leaving the room (X button), kicking a player
- Has `variant: 'default' | 'danger'` styling
- Traps focus on Confirm, listens for Escape

### Server: kick player
- New `KICK_PLAYER` client event (`shared/src/types/protocol.ts`)
- Server handler in `server/src/ws/handlers.ts`:
  - Verifies caller is the host
  - Sends `KICKED` event with code to the target socket
  - Removes the player from the room
  - Broadcasts `PLAYER_LEFT` to remaining players
- Client `KICKED` handler:
  - Shows a localized toast
  - Resets room/game state
  - Routes to disconnected screen with a localized message

### Server: host disconnect cascade (already existed, verified)
- When the host disconnects, `ConnectionManager.onDisconnect`:
  - Broadcasts `HOST_LEFT` with code `host_disconnected` to all room members
  - Destroys the room
  - Drops all connection entries for that room
- All remaining players see a localized toast + disconnected screen

### Per-match stats
- Tracked in `gameStore.myStats` (resets on round 1 of a new match)
- Fields: roundsPlayed, timesAsImpostor, timesCaught, timesSurvivedAsImpostor, impostorsFound
- Displayed on the GameOver screen below the impostor reveal
- Updated by `useSocket` on GAME_STARTED, ROUND_RESULT, GAME_OVER

### Languages
- Added PT, FR, IT, DE translation files
- Language selector is now a dropdown (was a 2-button pill) at top-right of entry page
- All UI strings translated; right-to-left languages not supported

### Visual polish
- Gold accent (`--accent-gold`) added to the theme, matches the logo palette
- "Coming soon" badge now uses the gold accent (was warning-yellow)
- Phase transitions use `fadeInUp` with a subtle cubic-bezier easing
- Logo appears on entry page (hero), game header, lobby page header, connection screens, and favicon

### SEO
- Comprehensive meta tags: description, keywords, author, robots, language
- Open Graph tags for Facebook, Discord, Slack, WhatsApp, LinkedIn (with image, locale variants)
- Twitter Card (summary_large_image)
- PWA manifest updated with description, scope, orientation, maskable icons
- **NO canonical link** (user explicitly requested no canonical)

## Common Pitfalls

1. **Forgetting to upload `index.html`** → server serves HTML referencing old JS hash → new code never loads
2. **Only uploading `index-*.js` without cleaning up old hash** → old file still in dist, gets cached
3. **Running `pnpm build:shared` and expecting it to deploy** → server uses `shared/src/`, not `shared/dist/`
4. **Using `pscp` or `plink` directly** → host key cache issues, see above
5. **Using Windows OpenSSH `ssh` command** → kex algorithm mismatch, hangs silently
6. **Trying to start with `juanp` user** → wrong user, password auth fails
7. **Deploying only client without `--client-only`** → script restarts the service, port may not be open yet
8. **Forgetting to upload static files at `client/dist/` root** → favicons, logos, manifest not served
9. **Voseo in Spanish translations** → user wants castellano (Spain), use vosotros imperatives and standard tú forms
10. **Castellano specific: "Próximamente" not "Coming soon"**, "Hecho por" not "Powered by", "Impostores" not "Impostors", etc.

## Common Tasks

### Deploy a client change
```bash
pnpm --filter @impostor/client build
python scripts/deploy.py --client-only
```

### Deploy a server change
```bash
python scripts/deploy.py --server-only
```

### Verify current production state
```bash
python scripts/deploy.py --verify
```

### Run server tests
```bash
pnpm --filter @impostor/server test
```

### SSH into production
```bash
python -c "
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.1.11', username='root', password='juanito2005', timeout=10)
si, so, se = c.exec_command('hostname && uptime', timeout=10)
print(so.read().decode())
c.close()
"
```
