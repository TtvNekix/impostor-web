import { useEffect, useRef, useCallback } from 'react';
import {
  ClientEvent,
  ServerEvent,
  type JoinRoomPayload,
  type CreateRoomPayload,
  type VotePayload,
  type UpdateSettingsPayload,
  type RoomSettings,
} from '@impostor/shared';
import { useConnectionStore } from '../stores/connectionStore';
import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';

/**
 * Creates a raw WebSocket connection, binds all server→client events to
 * Zustand stores, and returns typed send helpers for client→server events.
 *
 * Auto-connects on mount and disconnects on unmount.
 */
export function useSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setConnected = useConnectionStore((s) => s.setConnected);
  const setDisconnected = useConnectionStore((s) => s.setDisconnected);
  const setConnecting = useConnectionStore((s) => s.setConnecting);
  const clearError = useConnectionStore((s) => s.clearError);

  const setRoom = useRoomStore((s) => s.setRoom);
  const addPlayer = useRoomStore((s) => s.addPlayer);
  const removePlayer = useRoomStore((s) => s.removePlayer);
  const updateRoomSettings = useRoomStore((s) => s.updateSettings);

  const setPhase = useGameStore((s) => s.setPhase);
  const setWord = useGameStore((s) => s.setWord);
  const setCategory = useGameStore((s) => s.setCategory);
  const setVotes = useGameStore((s) => s.setVotes);
  const setRoundResult = useGameStore((s) => s.setRoundResult);
  const setWinner = useGameStore((s) => s.setWinner);
  const setRoundNumber = useGameStore((s) => s.setRoundNumber);
  const resetGame = useGameStore((s) => s.resetGame);

  useEffect(() => {
    setConnecting();

    const serverUrl = import.meta.env.VITE_SERVER_URL;
    const url = serverUrl || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      setConnected();
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      let msg: { event: string; data: unknown };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const { event: eventName, data } = msg;

      switch (eventName) {
        /* ------------------------------------------------------------ */
        /*  Connection established — save assigned ID                   */
        /* ------------------------------------------------------------ */
        case 'connected': {
          myIdRef.current = (data as { id: string }).id;
          break;
        }

        /* ------------------------------------------------------------ */
        /*  Server → Client events                                      */
        /* ------------------------------------------------------------ */

        case ServerEvent.ROOM_JOINED: {
          const { room } = data as { room: any };
          const myId = myIdRef.current;
          if (!myId) return;

          const me = room.players.find((p: any) => p.id === myId);
          setRoom(room.code, room.players, me?.isHost ?? false, room.settings);
          if (room.gameState) {
            setPhase(room.gameState.phase);
            setCategory(room.gameState.category);
            setRoundNumber(room.gameState.roundNumber);
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
          setDisconnected((data as { message: string }).message);
          break;
        }

        case ServerEvent.PLAYER_JOINED: {
          addPlayer((data as { player: any }).player);
          break;
        }

        case ServerEvent.PLAYER_LEFT: {
          const { playerId, newHost } = data as { playerId: string; newHost?: string };
          removePlayer(playerId, newHost);
          break;
        }

        case ServerEvent.GAME_STARTED: {
          setPhase('WORD_REVEAL');
          const gs = data as { category: string; roundNumber: number };
          setCategory(gs.category);
          setRoundNumber(gs.roundNumber);
          break;
        }

        case ServerEvent.WORD_ASSIGNED: {
          setWord((data as { word: string | null }).word);
          break;
        }

        case ServerEvent.PHASE_CHANGED: {
          setPhase((data as { phase: any }).phase);
          break;
        }

        case ServerEvent.VOTE_BROADCAST: {
          setVotes((data as { votes: any[] }).votes);
          break;
        }

        case ServerEvent.ROUND_RESULT: {
          setRoundResult(data as any);
          break;
        }

        case ServerEvent.GAME_OVER: {
          setWinner((data as { winner: any }).winner);
          setPhase('GAME_OVER');
          break;
        }

        case ServerEvent.SETTINGS_UPDATED: {
          updateRoomSettings(data as RoomSettings);
          break;
        }

        case ServerEvent.KICKED: {
          resetGame();
          setDisconnected((data as { reason: string }).reason);
          break;
        }

        default:
          break;
      }
    });

    ws.addEventListener('close', () => {
      setDisconnected();
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    });

    ws.addEventListener('error', () => {
      setDisconnected('Error de conexión');
    });

    /* ---------------------------------------------------------------- */
    /*  Heartbeat — send pong every 25 s                                */
    /* ---------------------------------------------------------------- */

    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'pong' }));
      }
    }, 25_000);

    /* ---------------------------------------------------------------- */
    /*  Cleanup                                                         */
    /* ---------------------------------------------------------------- */

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      ws.close();
      wsRef.current = null;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Typed send helpers                                                */
  /* ---------------------------------------------------------------- */

  const sendMessage = useCallback((event: string, data?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
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

  const vote = useCallback(
    (payload: VotePayload) => sendMessage(ClientEvent.VOTE, payload),
    [sendMessage],
  );

  const sendSettings = useCallback(
    (payload: UpdateSettingsPayload) => sendMessage(ClientEvent.UPDATE_SETTINGS, payload),
    [sendMessage],
  );

  const newMatch = useCallback(
    () => sendMessage(ClientEvent.NEW_MATCH),
    [sendMessage],
  );

  const leaveRoom = useCallback(
    () => sendMessage(ClientEvent.LEAVE_ROOM),
    [sendMessage],
  );

  return {
    joinRoom,
    createRoom,
    startMatch,
    vote,
    updateSettings: sendSettings,
    newMatch,
    leaveRoom,
  };
}
