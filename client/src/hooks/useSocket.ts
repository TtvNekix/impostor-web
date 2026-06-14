import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ClientEvent,
  ServerEvent,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type JoinRoomPayload,
  type CreateRoomPayload,
  type VotePayload,
  type UpdateSettingsPayload,
  type RoomSettings,
} from '@impostor/shared';
import { useConnectionStore } from '../stores/connectionStore';
import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Creates a typed Socket.IO client, binds all server→client events to
 * Zustand stores, and returns typed emit helpers for client→server events.
 *
 * Auto-connects on mount and disconnects on unmount.
 */
export function useSocket() {
  const socketRef = useRef<TypedSocket | null>(null);

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

    const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;
    const socket: TypedSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    /* -------------------------------------------------------------- */
    /*  Server → Client event bindings                                 */
    /* -------------------------------------------------------------- */

    socket.on(ServerEvent.ROOM_JOINED, (payload) => {
      const { room } = payload;
      const myId = socket.id;
      if (!myId) return;

      const me = room.players.find((p) => p.id === myId);
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
    });

    socket.on(ServerEvent.ROOM_ERROR, (payload) => {
      setDisconnected(payload.message);
    });

    socket.on(ServerEvent.PLAYER_JOINED, (payload) => {
      addPlayer(payload.player);
    });

    socket.on(ServerEvent.PLAYER_LEFT, (payload) => {
      removePlayer(payload.playerId, payload.newHost);
    });

    socket.on(ServerEvent.GAME_STARTED, (payload) => {
      setPhase('WORD_REVEAL');
      setCategory(payload.category);
      setRoundNumber(payload.roundNumber);
    });

    socket.on(ServerEvent.WORD_ASSIGNED, (payload) => {
      setWord(payload.word);
    });

    socket.on(ServerEvent.PHASE_CHANGED, (payload) => {
      setPhase(payload.phase);
    });

    socket.on(ServerEvent.VOTE_UPDATE, (_payload) => {
      // Vote progress tracked by VotingScreen via live count display
    });

    socket.on(ServerEvent.VOTE_BROADCAST, (payload) => {
      setVotes(payload.votes);
    });

    socket.on(ServerEvent.ROUND_RESULT, (payload) => {
      setRoundResult(payload);
    });

    socket.on(ServerEvent.GAME_OVER, (payload) => {
      setWinner(payload.winner);
      setPhase('GAME_OVER');
    });

    socket.on(ServerEvent.SETTINGS_UPDATED, (payload: RoomSettings) => {
      updateRoomSettings(payload);
    });

    socket.on(ServerEvent.PLAYER_DISCONNECTED, (_payload) => {
      // Player status will update via room-level events
    });

    socket.on(ServerEvent.PLAYER_RECONNECTED, (_payload) => {
      // Player status will update via room-level events
    });

    socket.on(ServerEvent.KICKED, (payload) => {
      resetGame();
      setDisconnected(payload.reason);
    });

    socket.on('connect', () => {
      setConnected();
    });

    socket.on('disconnect', () => {
      setDisconnected();
    });

    socket.on('connect_error', () => {
      setDisconnected('Error de conexión');
    });

    /* -------------------------------------------------------------- */
    /*  Cleanup                                                        */
    /* -------------------------------------------------------------- */

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Typed emit helpers                                                */
  /* ---------------------------------------------------------------- */

  const emit = useCallback(<K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socketRef.current as any)?.emit(event, ...args);
  }, []);

  const joinRoom = useCallback(
    (payload: JoinRoomPayload) => emit(ClientEvent.JOIN_ROOM, payload),
    [emit],
  );

  const createRoom = useCallback(
    (payload: CreateRoomPayload) => emit(ClientEvent.CREATE_ROOM, payload),
    [emit],
  );

  const startMatch = useCallback(
    () => emit(ClientEvent.START_MATCH),
    [emit],
  );

  const vote = useCallback(
    (payload: VotePayload) => emit(ClientEvent.VOTE, payload),
    [emit],
  );

  const sendSettings = useCallback(
    (payload: UpdateSettingsPayload) => emit(ClientEvent.UPDATE_SETTINGS, payload),
    [emit],
  );

  const newMatch = useCallback(
    () => emit(ClientEvent.NEW_MATCH),
    [emit],
  );

  const leaveRoom = useCallback(
    () => emit(ClientEvent.LEAVE_ROOM),
    [emit],
  );

  return {
    socket: socketRef,
    joinRoom,
    createRoom,
    startMatch,
    vote,
    updateSettings: sendSettings,
    newMatch,
    leaveRoom,
  };
}
