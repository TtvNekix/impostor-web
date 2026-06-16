import { useEffect, useState } from 'react';

/**
 * The four top-level paths the app understands.
 *
 *   - `entry`: the landing page (/) — game-mode selector + create/join form
 *   - `lobbies`: the dedicated public-rooms browser (/salas or /lobbies)
 *   - `join`: a deep link to join a specific room (/join/CODE)
 *   - `in-game`: anything else (a room-specific path the SPA has claimed)
 *
 * We intentionally avoid hashing, locale-prefixes, or per-room URLs — the
 * game itself is single-screen and identity lives in the WebSocket layer,
 * not the URL. Anything other than `/`, `/salas`/`/lobbies`, or `/join/CODE`
 * falls through to the in-game router (the phase-based ScreenRouter).
 */
export type Path = 'entry' | 'lobbies' | 'join' | 'in-game';

/** Regex for a valid room code (matches the format used by generateRoomCode). */
const JOIN_CODE_RE = /^[A-Za-z0-9]{4,6}$/;

/**
 * If the current path is `/join/{code}` and the code matches the
 * room-code format, returns the code normalized to uppercase.
 * Returns null otherwise.
 */
export function parseJoinCode(): string | null {
  const m = window.location.pathname.match(/^\/join\/([A-Za-z0-9]{4,6})\/?$/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Reads the current browser path and maps it to one of the app's
 * four top-level routes.
 */
export function currentPath(): Path {
  if (parseJoinCode() !== null) return 'join';
  const p = window.location.pathname;
  if (p === '/salas' || p === '/lobbies') return 'lobbies';
  if (p === '/' || p === '') return 'entry';
  return 'in-game';
}

/**
 * Programmatic navigation. Calls history.pushState (or replaceState) and
 * synchronously dispatches a `popstate` event so React components using
 * `useLocation()` re-render without waiting for the next user-driven
 * navigation.
 *
 * `replace=true` swaps the current history entry instead of pushing a new
 * one — useful when you don't want the back button to return to the
 * intermediate state (e.g. initial redirect).
 */
export function navigate(path: '/' | '/salas' | '/lobbies', replace = false): void {
  if (replace) {
    history.replaceState({}, '', path);
  } else {
    history.pushState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Hook that returns the current `Path` and re-renders on browser
 * back/forward and on programmatic `navigate()` calls.
 */
export function useLocation(): Path {
  const [path, setPath] = useState<Path>(currentPath);
  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}
