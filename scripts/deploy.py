#!/usr/bin/env python
"""
Deploy El Impostor to production.

Usage:
    python scripts/deploy.py                    # full deploy (client + server + restart)
    python scripts/deploy.py --client-only     # only client assets
    python scripts/deploy.py --server-only      # only server source files
    python scripts/deploy.py --verify          # just verify current state

Required:
    pip install paramiko
"""
import argparse
import os
import sys
from pathlib import Path

import paramiko

# --- Config ---
HOST = '192.168.1.11'
USER = 'root'                  # SSH user on the Proxmox container (NOT 'juanp')
PASSWORD = 'juanito2005'       # SSH password (also used for 192.168.1.50 NPM)
REMOTE_BASE = '/opt/impostor-web'
SERVICE_NAME = 'impostor-web'

# (local_path, remote_path) — relative to REMOTE_BASE
CLIENT_FILES = [
    # The index.html MUST be deployed — it references the JS hash, so if you
    # upload a new JS but the old index.html is still there, the new JS never loads.
    ('client/dist/index.html', 'client/dist/index.html'),
    # Add the JS/CSS map files explicitly with their hashed names (we discover them below)
]

# Server source files to deploy (only files we changed; full reinstall is via pnpm install)
SERVER_FILES = [
    'server/src/index.ts',
    'server/src/room/RoomManager.ts',
    'server/src/room/RoomStore.ts',
    'server/src/game/GameEngine.ts',
    'server/src/game/RoundManager.ts',
    'server/src/game/StateMachine.ts',
    'server/src/connection/ConnectionManager.ts',
    'server/src/words/WordBank.ts',
    'server/src/ws/handlers.ts',
]

# Shared package source (server uses tsx to load directly from src/, not dist)
SHARED_FILES = [
    'shared/src/index.ts',
    'shared/src/constants.ts',
    'shared/src/utils.ts',
    'shared/src/types/protocol.ts',
    'shared/src/types/room.ts',
    'shared/src/types/game.ts',
]


def sftp_put(sftp, local: str, remote: str):
    """Upload a file, skipping if missing locally."""
    if not os.path.exists(local):
        print(f'  SKIP (not found): {local}')
        return False
    sftp.put(local, remote)
    print(f'  PUT {local} -> {remote}')
    return True


def discover_client_assets(dist_dir: str) -> list[tuple[str, str]]:
    """Find hashed JS/CSS assets in client/dist/assets/."""
    assets_dir = Path(dist_dir) / 'assets'
    if not assets_dir.exists():
        return []
    pairs = []
    for f in sorted(assets_dir.iterdir()):
        if f.suffix in ('.js', '.css', '.map'):
            # Upload only the new files (not the whole directory)
            pairs.append((str(f), f'client/dist/assets/{f.name}'))
    return pairs


def run(client, cmd: str, label: str = '') -> tuple[str, str, int]:
    """Run a command, return (stdout, stderr, exit_code)."""
    print(f'  EXEC [{label or cmd[:40]}]: {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=30)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(f'      stdout: {out}')
    if err:
        print(f'      stderr: {err}')
    if code != 0:
        print(f'      EXIT: {code}')
    return out, err, code


def deploy_client(sftp, repo_root: str):
    print('=== CLIENT ===')
    dist = os.path.join(repo_root, 'client/dist')
    if not os.path.exists(dist):
        print(f'  ERROR: {dist} not found. Run `pnpm --filter @impostor/client build` first.')
        sys.exit(1)
    # Index.html (critical — references the JS hash)
    sftp_put(sftp, os.path.join(dist, 'index.html'), f'{REMOTE_BASE}/client/dist/index.html')
    # Hashed assets
    for local, remote in discover_client_assets(dist):
        sftp_put(sftp, local, f'{REMOTE_BASE}/{remote}')


def deploy_server(sftp, repo_root: str):
    print('=== SERVER ===')
    for rel in SERVER_FILES:
        local = os.path.join(repo_root, rel)
        remote = f'{REMOTE_BASE}/{rel}'
        sftp_put(sftp, local, remote)


def deploy_shared(sftp, repo_root: str):
    print('=== SHARED ===')
    for rel in SHARED_FILES:
        local = os.path.join(repo_root, rel)
        remote = f'{REMOTE_BASE}/{rel}'
        sftp_put(sftp, local, remote)


def cleanup_old_assets(sftp, repo_root: str):
    """Remove old client asset hashes that are no longer referenced.

    Uses the LOCAL index.html (which we just wrote and know the contents of)
    rather than re-reading the remote one — sftp.put can return before the
    file is visible on disk, so reading the remote right after would see
    the old content and wrongly remove the new files.
    """
    import re
    print('=== CLEANUP OLD ASSETS ===')

    local_index = os.path.join(repo_root, 'client', 'dist', 'index.html')
    if not os.path.exists(local_index):
        print('  No local index.html — skipping cleanup')
        return
    with open(local_index, 'r', encoding='utf-8') as f:
        html = f.read()
    # Only capture the hash group (group 1), not the extension. If we capture
    # both, set() gives tuples and the "in" check never matches.
    current_hashes = set(re.findall(r'index-([A-Za-z0-9]+)\.(?:js|css)', html))
    print(f'  Current hashes: {current_hashes}')

    # List all files in remote assets dir
    files = sftp.listdir(f'{REMOTE_BASE}/client/dist/assets')
    removed = 0
    for fname in files:
        m = re.match(r'^index-([A-Za-z0-9]+)\.(js|css|js\.map|css\.map)$', fname)
        if m:
            hash_id = m.group(1)
            if hash_id not in current_hashes:
                sftp.remove(f'{REMOTE_BASE}/client/dist/assets/{fname}')
                print(f'  RM remote hash orphan: {fname}')
                removed += 1
    if removed == 0:
        print('  (no orphans)')


def restart_service(client):
    print('=== RESTART ===')
    out, _, code = run(
        client,
        f'systemctl restart {SERVICE_NAME} && sleep 1 && systemctl is-active {SERVICE_NAME}',
        'restart'
    )
    if 'active' in out and 'inactive' not in out:
        print('  [OK] service is active')
    else:
        print(f'  [FAIL] service status: {out}')
        sys.exit(1)


def verify(client):
    print('=== VERIFY ===')
    cmds = [
        ('GET /        (local)',  'curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/'),
        ('GET /play    (local)',  'curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/play'),
        ('GET /play -L (local)',  'curl -sL -o /dev/null -w "%{http_code}" http://localhost:3001/play'),
        ('GET /health  (local)',  'curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health'),
        ('GET /        (public)', 'curl -s -o /dev/null -w "%{http_code}" -k https://impostor.nekix.lol/'),
        ('GET /play    (public)', 'curl -s -o /dev/null -w "%{http_code}" -k https://impostor.nekix.lol/play'),
        ('GET /health  (public)', 'curl -s -o /dev/null -w "%{http_code}" -k https://impostor.nekix.lol/health'),
    ]
    for label, cmd in cmds:
        out, _, _ = run(client, cmd, label)
        if out == '200':
            print(f'  [OK] {label} -> 200')
        elif out in ('302', '200,302', '302,200'):
            print(f'  [OK] {label} -> {out} (redirect)')
        else:
            print(f'  [WARN] {label} -> {out}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--client-only', action='store_true')
    parser.add_argument('--server-only', action='store_true')
    parser.add_argument('--verify',      action='store_true')
    parser.add_argument('--no-restart',   action='store_true')
    parser.add_argument('--no-cleanup',   action='store_true')
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    print(f'Repo root: {repo_root}\n')

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=10)
    sftp = client.open_sftp()

    try:
        if args.verify:
            verify(client)
            return

        if not args.server_only:
            deploy_client(sftp, str(repo_root))
        if not args.client_only:
            deploy_server(sftp, str(repo_root))
            deploy_shared(sftp, str(repo_root))

        if not args.no_cleanup:
            cleanup_old_assets(sftp, str(repo_root))

        if not args.no_restart:
            restart_service(client)

        print('\n=== DONE ===')
        verify(client)
    finally:
        sftp.close()
        client.close()


if __name__ == '__main__':
    main()
