import { useEffect, useRef, useCallback } from 'react';
import {
  ClientEvent,
  ServerEvent,
  type JoinRoomPayload,
  type CreateRoomPayload,
  type VotePayload,
  type UpdateSettingsPayload,
  type AddCategoryPayload,
  type AddWordsPayload,
  type RoomSettings,
  type RoomErrorPayload,
  type CategoryInfo,
  ErrorCode,
} from '@impostor/shared';
import { useConnectionStore } from '../stores/connectionStore';
import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { useCategoryStore } from '../stores/categoryStore';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../i18n/I18nContext';

/**
 * Translate a server error code into a localized string in the user's
 * active language, interpolating any data values. Falls back to the raw
 * English message or a generic string when the code is unknown.
 */
function useLocalizeError() {
  const t = useT();
  return useCallback((payload: RoomErrorPayload): string => {
    const { code, message, data } = payload;
    const tmpl: string | undefined = (t.errors as Record<string, string | undefined>)[code];
    if (tmpl) {
      if (data) {
        return tmpl.replace(/\{(\w+)\}/g, (_, k) => String(data[k] ?? `{${k}}`));
      }
      return tmpl;
    }
    return message || t.errors.generic;
  }, [t]);
}

/**
 * Creates a raw WebSocket connection, binds all server→client events to
 * Zustand stores, and returns typed send helpers for client→server events.
 *
 * Auto-connects on mount, auto-reconnects on close (with backoff), and
 * replies to server pings immediately so the 20s pong timeout can't fire.
 */
export function useSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Messages queued while the WebSocket is not yet OPEN. Flushed on
   * the `open` event. Bounded FIFO (see sendMessage). The buffer
   * exists because the user can click "Join" in /salas before the
   * socket finishes its initial connection — without buffering, the
   * first click is silently dropped and the user has to click again.
   */
  const pendingRef = useRef<Array<{ event: string; data: unknown }>>([]);

  const t = useT();
  const localizeError = useLocalizeError();
  const pushToast = useToastStore((s) => s.push);

  const setConnected = useConnectionStore((s) => s.setConnected);
  const setDisconnected = useConnectionStore((s) => s.setDisconnected);
  const setError = useConnectionStore((s) => s.setError);
  const setConnecting = useConnectionStore((s) => s.setConnecting);
  const clearError = useConnectionStore((s) => s.clearError);

  const setRoom = useRoomStore((s) => s.setRoom);
  const addPlayer = useRoomStore((s) => s.addPlayer);
  const removePlayer = useRoomStore((s) => s.removePlayer);
  const updateRoomSettings = useRoomStore((s) => s.updateSettings);
  const clearRoom = useRoomStore((s) => s.clearRoom);

  const setCategories = useCategoryStore((s) => s.setCategories);

  const setPhase = useGameStore((s) => s.setPhase);
  const setWord = useGameStore((s) => s.setWord);
  const setCategory = useGameStore((s) => s.setCategory);
  const setVotes = useGameStore((s) => s.setVotes);
  const setVoterCount = useGameStore((s) => s.setVoterCount);
  const setRoundResult = useGameStore((s) => s.setRoundResult);
  const setWinner = useGameStore((s) => s.setWinner);
  const setRoundNumber = useGameStore((s) => s.setRoundNumber);
  const setImpostorIds = useGameStore((s) => s.setImpostorIds);
  const setTurnOrder = useGameStore((s) => s.setTurnOrder);
  const setMyId = useGameStore((s) => s.setMyId);
  const resetGame = useGameStore((s) => s.resetGame);
  const resetMyStats = useGameStore((s) => s.resetMyStats);
  const recordRoundPlayed = useGameStore((s) => s.recordRoundPlayed);
  const recordAsImpostor = useGameStore((s) => s.recordAsImpostor);
  const recordCaught = useGameStore((s) => s.recordCaught);
  const recordSurvived = useGameStore((s) => s.recordSurvived);
  const recordImpostorFound = useGameStore((s) => s.recordImpostorFound);
  const myRole = useGameStore((s) => s.myRole);

  useEffect(() => {
    setConnecting();
    // Expose the connection status to the page (dev/test only). This
    // lets Playwright wait for "ws is open" before firing events that
    // would otherwise be dropped or queued. Cheap to set on every
    // transition; the page never reads it in production.
    if (typeof window !== 'undefined') {
      (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus = 'connecting';
    }

    const serverUrl = import.meta.env.VITE_SERVER_URL;
    const url = serverUrl || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

    let reconnectAttempt = 0;

    const scheduleReconnect = () => {
      if (reconnectTimerRef.current) return;
      // Exponential backoff capped at 10s: 1s, 2s, 4s, 8s, 10s, 10s...
      const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttempt));
      reconnectAttempt++;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      reconnectAttempt = 0;

      ws.addEventListener('open', () => {
        setConnected();
        if (typeof window !== 'undefined') {
          (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus = 'connected';
        }
        // Flush any messages queued while the socket was connecting.
        // This is what makes the "first click on /salas does nothing"
        // bug go away: the user can fire JOIN_ROOM before the WS
        // finishes its handshake, and we replay it the moment we're
        // open.
        const queue = pendingRef.current;
        pendingRef.current = [];
        for (const { event, data } of queue) {
          try {
            ws.send(JSON.stringify({ event, data }));
          } catch {
            // ignore — best-effort delivery
          }
        }
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        let msg: { event: string; data: unknown };
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        const { event: eventName, data } = msg;

        // Heartbeat: reply to server pings immediately. The server
        // only waits 20s for a pong, so relying on the 25s periodic
        // interval is a race condition that kills the connection.
        if (eventName === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'pong' }));
          }
          return;
        }

        switch (eventName) {
          case 'connected': {
            const id = (data as { id: string }).id;
            myIdRef.current = id;
            // Keep the gameStore in sync so components that don't
            // have access to useSocket (e.g. the DiscussionScreen
            // reading the turn order) can read myId for the
            // "is this you?" highlight.
            setMyId(id);
            break;
          }

          case ServerEvent.CATEGORIES: {
            const { categories } = data as { categories: CategoryInfo[] };
            setCategories(categories);
            break;
          }

          case ServerEvent.ROOM_JOINED: {
            const { room } = data as { room: any };
            const myId = myIdRef.current;
            if (!myId) return;
            const me = room.players.find((p: any) => p.id === myId);
            setRoom(room.code, room.players, me?.isHost ?? false, room.settings);
            if (room.gameState) {
              setPhase(room.gameState.phase, room.gameState.phaseEndsAt);
              setCategory(room.gameState.category);
              setRoundNumber(room.gameState.roundNumber);
              setImpostorIds(room.gameState.impostorIds ?? []);
              setTurnOrder(room.gameState.turnOrder ?? []);
              if (room.gameState.phase !== 'LOBBY') {
                setVotes(room.gameState.votes);
              }
            } else {
              resetGame();
            }
            clearError();
            break;
          }

          case ServerEvent.ROOM_ERROR: {
            setError(localizeError(data as RoomErrorPayload));
            break;
          }

          case ServerEvent.PLAYER_JOINED: {
            addPlayer((data as { player: any }).player);
            break;
          }

          case ServerEvent.PLAYER_LEFT: {
            const { playerId, newHost } = data as { playerId: string; newHost?: string };
            // Pass my own socket id so removePlayer can decide whether
            // I was promoted to host.
            removePlayer(playerId, newHost, myIdRef.current ?? undefined);
            break;
          }

          case ServerEvent.GAME_STARTED: {
            setPhase('WORD_REVEAL', 0);
            const gs = data as { category: string; roundNumber: number; impostorIds: string[]; turnOrder?: string[] };
            setCategory(gs.category);
            setRoundNumber(gs.roundNumber);
            setImpostorIds(gs.impostorIds ?? []);
            setTurnOrder(gs.turnOrder ?? []);
            // New match (round 1) → reset stats. Subsequent rounds in the
            // same match just bump the roundsPlayed counter.
            if (gs.roundNumber === 1) {
              resetMyStats();
            }
            recordRoundPlayed();
            if (myIdRef.current && (gs.impostorIds ?? []).includes(myIdRef.current)) {
              recordAsImpostor();
            }
            break;
          }

          case ServerEvent.WORD_ASSIGNED: {
            setWord((data as { word: string | null }).word);
            break;
          }

          case ServerEvent.PHASE_CHANGED: {
            const { phase, phaseEndsAt } = data as { phase: any; phaseEndsAt: number };
            setPhase(phase, phaseEndsAt);
            break;
          }

          case ServerEvent.VOTE_BROADCAST: {
            setVotes((data as { votes: any[] }).votes);
            break;
          }

          case ServerEvent.VOTE_UPDATE: {
            const { voterCount, totalPlayers } = data as {
              voterCount: number;
              totalPlayers: number;
            };
            setVoterCount(voterCount, totalPlayers);
            break;
          }

          case ServerEvent.ROUND_RESULT: {
            const rr = data as any;
            setRoundResult(rr);
            // Stats: did I get caught? Did I find an impostor?
            if (rr?.expelledId && myIdRef.current === rr.expelledId && rr.wasImpostor) {
              recordCaught();
            } else if (rr?.expelledId && rr.wasImpostor && myRole === 'non_impostor') {
              // I voted (or at least participated) and the impostor was found
              recordImpostorFound();
            }
            break;
          }

          case ServerEvent.GAME_OVER: {
            const payload = data as { winner: any };
            setWinner(payload.winner);
            setPhase('GAME_OVER', 0);
            // Stats: if I was impostor and impostors won, I survived
            if (payload.winner === 'IMPOSTORS' && myRole === 'impostor') {
              recordSurvived();
            }
            break;
          }

          case ServerEvent.SETTINGS_UPDATED: {
            updateRoomSettings(data as RoomSettings);
            break;
          }

          case ServerEvent.HOST_LEFT: {
            const payload = data as { code: string; message: string };
            clearRoom();
            resetGame();
            setDisconnected(payload.message || t.errors.generic);
            if (typeof window !== 'undefined') {
              (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus = 'disconnected';
            }
            // Show a toast for the host-leave event in addition to the
            // disconnected screen, so the user gets an immediate cue.
            pushToast({
              message: '',
              variant: 'error',
              code: payload.code || 'host_disconnected',
            });
            break;
          }

          case ServerEvent.KICKED: {
            const payload = data as { code: string; message: string };
            // Same teardown as HOST_LEFT: the server is about to close
            // the socket (removeConnection → close), but if we don't
            // clear the room locally first, App.tsx will keep rendering
            // the in-room UI because roomCode is still set when the
            // socketStatus flips to 'disconnected'. The "Algo salió mal"
            // crash was the disconnected-screen failing to render
            // inside the still-mounted room tree.
            clearRoom();
            resetGame();
            setDisconnected(payload.message || t.errors.generic);
            if (typeof window !== 'undefined') {
              (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus = 'disconnected';
            }
            pushToast({
              message: '',
              variant: 'error',
              code: payload.code || 'kicked_by_host',
            });
            break;
          }

          default:
            break;
        }
      });

      ws.addEventListener('close', () => {
        setDisconnected();
        if (typeof window !== 'undefined') {
          (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus = 'disconnected';
        }
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        // Auto-reconnect unless we deliberately left
        // (leaveRoom sets wsRef.current = null first).
        if (wsRef.current !== null) {
          scheduleReconnect();
        }
      });

      ws.addEventListener('error', () => {
        setDisconnected('Error de conexión');
      });

      // Backup periodic pong in case the immediate response is missed
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'pong' }));
        }
      }, 25_000);
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      const ws = wsRef.current;
      // null it first so the close handler doesn't trigger a reconnect
      wsRef.current = null;
      if (ws) ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Typed send helpers                                                */
  /* ---------------------------------------------------------------- */

  const sendMessage = useCallback((event: string, data?: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
      return;
    }
    // Buffer the message. It will be flushed when the WS finishes
    // connecting. The buffer is bounded — if we accumulate too many
    // stale events (e.g. the user spams Join before the socket is up)
    // we drop the oldest. JOIN_ROOM / CREATE_ROOM are the critical
    // ones that lose state if dropped (they're the user's primary
    // intent), so we keep them at the head by NOT dropping those
    // specifically; only other events get evicted FIFO.
    const buffered = { event, data };
    if (event === ClientEvent.JOIN_ROOM || event === ClientEvent.CREATE_ROOM) {
      // Never drop the user's join/create intent — prepend it.
      pendingRef.current = [buffered, ...pendingRef.current].slice(0, 32);
    } else {
      pendingRef.current = [...pendingRef.current, buffered].slice(-32);
    }
  }, []);

  const joinRoom = useCallback(
    (payload: JoinRoomPayload) => sendMessage(ClientEvent.JOIN_ROOM, payload),
    [sendMessage],
  );

  const createRoom = useCallback(
    (payload: CreateRoomPayload) => sendMessage(ClientEvent.CREATE_ROOM, payload),
    [sendMessage],
  );

  const startMatch = useCallback(
    () => sendMessage(ClientEvent.START_MATCH),
    [sendMessage],
  );

  const startVoting = useCallback(
    () => sendMessage(ClientEvent.START_VOTING),
    [sendMessage],
  );

  const vote = useCallback(
    (payload: VotePayload) => sendMessage(ClientEvent.VOTE, payload),
    [sendMessage],
  );

  const sendSettings = useCallback(
    (payload: UpdateSettingsPayload) => sendMessage(ClientEvent.UPDATE_SETTINGS, payload),
    [sendMessage],
  );

  const sendAddCategory = useCallback(
    (payload: AddCategoryPayload) => sendMessage(ClientEvent.ADD_CATEGORY, payload),
    [sendMessage],
  );

  const sendAddWords = useCallback(
    (payload: AddWordsPayload) => sendMessage(ClientEvent.ADD_WORDS, payload),
    [sendMessage],
  );

  const newMatch = useCallback(
    () => sendMessage(ClientEvent.NEW_MATCH),
    [sendMessage],
  );

  const forceEndVoting = useCallback(
    () => sendMessage(ClientEvent.FORCE_END_VOTING),
    [sendMessage],
  );

  const leaveRoom = useCallback(() => {
    // Tell the server to remove us. The WebSocket stays open so the
    // socketStatus remains 'connected' and the user lands on the
    // create/join form. If they need to fully disconnect, the X
    // button does a hard navigation.
    sendMessage(ClientEvent.LEAVE_ROOM);
    clearRoom();
    resetGame();
    setError('');
  }, [sendMessage, clearRoom, resetGame, setError]);

  const kickPlayer = useCallback(
    (username: string) => sendMessage(ClientEvent.KICK_PLAYER, { username }),
    [sendMessage],
  );

  return {
    joinRoom,
    createRoom,
    startMatch,
    startVoting,
    vote,
    updateSettings: sendSettings,
    addCategory: sendAddCategory,
    addWords: sendAddWords,
    newMatch,
    leaveRoom,
    kickPlayer,
    forceEndVoting,
    /** This client's assigned socket id (server sends it on connect). */
    get myId() { return myIdRef.current; },
  };
}
