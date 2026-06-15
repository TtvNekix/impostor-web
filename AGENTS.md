# Agent Notes — El Impostor

Production deployment details. Read this before doing any deploy.

## Production Infrastructure

- **App URL**: https://impostor.nekix.lol
- **Server**: Proxmox container at `192.168.1.11` (hostname: `bot-coffeeprojects`)
- **Nginx Proxy Manager**: `192.168.1.50` (handles SSL termination + ACME)
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
3. Uploads changed server source files (`server/src/**/*.ts`)
4. Uploads changed shared source files (`shared/src/**/*.ts`)
5. Removes orphan asset hashes from previous builds
6. Restarts the `impostor-web` systemd service
7. Verifies HTTP responses locally and via public domain

**Always include `index.html` in the upload**. If you upload a new JS but the old index.html is still on the server, it will still reference the old JS hash and the new code never loads.

## Manual Deploy (only if script fails)

```python
import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.1.11', username='root', password='juanito2005', timeout=10)
sftp = client.open_sftp()
# ... upload files ...
sftp.put(r'F:\web impostor\client\dist\assets\index-C0lW0DsY.js', '/opt/impostor-web/client/dist/assets/index-C0lW0DsY.js')
# CRITICAL: also put index.html
sftp.put(r'F:\web impostor\client\dist\index.html', '/opt/impostor-web/client/dist/index.html')
# ... restart
client.exec_command('systemctl restart impostor-web')
```

## Post-Deploy Verification

```bash
curl -s -o /dev/null -w "%{http_code}" https://impostor.nekix.lol/        # should be 200
curl -s -o /dev/null -w "%{http_code}" https://impostor.nekix.lol/play    # should be 302
curl -sL https://impostor.nekix.lol/play | grep assets/index              # check JS hash is current
```

## Project Structure

- Monorepo: `shared/`, `server/`, `client/` (pnpm workspaces)
- Server uses `tsx` to load `shared/src/*.ts` directly — shared package doesn't need a build step, but changes to shared source files MUST be deployed
- Client is a React 18 + Vite SPA, built to `client/dist/`
- Server is Node.js + Express + raw `ws` WebSocket (NOT Socket.IO — replaced because Engine.IO doesn't pass through proxies)

## Common Pitfalls

1. **Forgetting to upload `index.html`** → server serves HTML referencing old JS hash → new code never loads
2. **Only uploading `index-*.js` without cleaning up old hash** → old file still in dist, gets cached
3. **Running `pnpm build:shared` and expecting it to deploy** → server uses `shared/src/`, not `shared/dist/`
4. **Using `pscp` or `plink` directly** → host key cache issues, see above
5. **Using Windows OpenSSH `ssh` command** → kex algorithm mismatch, hangs silently
6. **Trying to start with `juanp` user** → wrong user, password auth fails
