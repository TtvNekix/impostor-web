import type { Room, GameState, GamePlayer, Player, GamePhase } from '@impostor/shared';
import {
  ServerEvent,
  DEFAULT_VOTING_TIMER,
  MIN_PLAYERS,
  ErrorCode,
} from '@impostor/shared';
import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { ConnectionManager } from '../connection/ConnectionManager';
import { StateMachine } from './StateMachine';
import { RoundManager } from './RoundManager';
import { logEvent } from '../audit/logger';

export class GameEngine {
  /** Per-room state machine instances. */
  private machines: Map<string, StateMachine> = new Map();
  /**
   * Impostor history per room. For each roomCode, an array of the impostor
   * ID lists from recent matches (most recent last, max 2 kept). Used to
   * enforce the re-rol rule: no player can be picked as impostor in 2 of
   * the last 3 rounds. Each entry is the full set of impostor IDs from
   * that match (one entry for 1-impostor matches, two entries for
   * 2-impostor matches, etc).
   */
  private impostorHistory: Map<string, string[][]> = new Map();

  constructor(
    private connManager: ConnectionManager,
    private roomStore: RoomStore,
    private roomManager: RoomManager,
    private wordBank: WordBank,
  ) {}

  /* ------------------------------------------------------------------ */
  /*  Start a new match                                                  */
  /* ------------------------------------------------------------------ */

  startMatch(roomCode: string, callerSocketId: string): boolean {
    const room = this.roomStore.getRoom(roomCode);
    if (!room) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found',
      });
      return false;
    }

    const host = this.findPlayerBySocket(room, callerSocketId);
    if (!host || !host.isHost) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.NOT_HOST, message: 'Only the host can start a match',
      });
      return false;
    }

    const activePlayers = Array.from(room.players.values()).filter(
      (p) => p.status === 'ACTIVE',
    );
    if (activePlayers.length < MIN_PLAYERS) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.MIN_PLAYERS,
        message: `Minimum ${MIN_PLAYERS} players required to start`,
        data: { min: MIN_PLAYERS },
      });
      return false;
    }

    if (this.wordBank.isEmpty()) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.GENERIC, message: 'No words available in bank',
      });
      return false;
    }

    // Hardcore mode: always 1 impostor, overrides host setting.
    // Non-hardcore: clamp the host's chosen impostorCount to valid bounds
    // (1 with <5 players, 1-2 with 5+ players).
    const maxAllowed = this.getMaxImpostors(activePlayers.length);
    const clampedCount = room.settings.hardcore
      ? 1
      : Math.max(1, Math.min(room.settings.impostorCount, maxAllowed));
    if (room.settings.impostorCount !== clampedCount) {
      room.settings.impostorCount = clampedCount;
      this.connManager.broadcastToRoom(roomCode, ServerEvent.SETTINGS_UPDATED, room.settings);
    }

    // Create GamePlayer snapshot with re-rol exclusion.
    // Pass the per-round history (NOT a flattened list) so multi-impostor
    // matches correctly exclude everyone from the last 2 rounds.
    const history = this.impostorHistory.get(roomCode) ?? [];
    const impostorIds = this.roomManager.selectImpostors(
      activePlayers,
      room.settings.impostorCount,
      history,
    );
    // Update impostor history (last 2 rounds)
    const newHistory = history.length >= 2
      ? [history[history.length - 1], Array.from(impostorIds)]
      : [...history, Array.from(impostorIds)];
    this.impostorHistory.set(roomCode, newHistory);

    const gamePlayers: GamePlayer[] = activePlayers.map((p) => ({
      id: p.id,
      username: p.username,
      isImpostor: impostorIds.has(p.id),
      status: p.status,
    }));

    // Select a word — hardcore ignores the category setting
    const wordPick = room.settings.hardcore
      ? this.wordBank.randomWord()
      : room.settings.category
      ? (() => {
          const w = this.wordBank.randomWordFromCategory(room.settings.category!);
          return w ? { word: w, category: room.settings.category! } : null;
        })()
      : this.wordBank.randomWord();
    if (!wordPick) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.GENERIC, message: 'Failed to select word',
      });
      return false;
    }

    // Build game state
    const gameState: GameState = {
      phase: 'WORD_REVEAL',
      word: wordPick.word,
      category: wordPick.category,
      players: gamePlayers,
      votes: [],
      roundNumber: (room.gameState?.roundNumber ?? 0) + 1,
      phaseEndsAt: 0,
      result: null,
      impostorIds: Array.from(impostorIds),
    };

    room.gameState = gameState;

    // Create state machine for this room
    const sm = new StateMachine();
    sm.onTimerExpired = (phase) => this.handleTimerExpiry(roomCode, phase);
    sm.onTransition = (_from, to) => {
      if (room.gameState) room.gameState.phase = to;
    };
    this.machines.set(roomCode, sm);

    // 1. Transition WORD_REVEAL (instant, duration 0)
    sm.transition('WORD_REVEAL', 0);

    // 2. Emit game_started to room
    this.connManager.broadcastToRoom(roomCode, ServerEvent.GAME_STARTED, {
      roundNumber: gameState.roundNumber,
      category: gameState.category,
      phaseEndsAt: 0,
      impostorIds: gameState.impostorIds,
    });

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

    // 3. Send word_assigned individually
    for (const gp of gamePlayers) {
      const word = gp.isImpostor ? null : gameState.word;
      this.connManager.sendToSocket(gp.id, ServerEvent.WORD_ASSIGNED, { word });
    }

    // 4. Transition to DISCUSSION
    const discussionMs = room.settings.discussionTime * 1000;
    sm.transition('DISCUSSION', discussionMs);

    this.connManager.broadcastToRoom(roomCode, ServerEvent.PHASE_CHANGED, {
      phase: 'DISCUSSION',
      phaseEndsAt: sm.phaseEndsAt,
    });

    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Manually start the voting phase (host-driven, from DISCUSSION)     */
  /* ------------------------------------------------------------------ */

  startVoting(roomCode: string, callerSocketId: string): boolean {
    const room = this.roomStore.getRoom(roomCode);
    if (!room) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found',
      });
      return false;
    }

    const host = this.findPlayerBySocket(room, callerSocketId);
    if (!host || !host.isHost) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.NOT_HOST, message: 'Only the host can start voting',
      });
      return false;
    }

    if (!room.gameState || room.gameState.phase !== 'DISCUSSION') {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.GENERIC, message: 'Voting can only start during discussion',
      });
      return false;
    }

    const sm = this.machines.get(roomCode);
    if (!sm) return false;

    // Cancel the discussion timer and transition to VOTING
    sm.cancelTimer();
    const votingSec = room.settings.votingTimer ?? DEFAULT_VOTING_TIMER;
    const votingMs = votingSec * 1000;
    sm.transition('VOTING', votingMs);

    if (room.gameState) room.gameState.phaseEndsAt = sm.phaseEndsAt;

    this.connManager.broadcastToRoom(roomCode, ServerEvent.PHASE_CHANGED, {
      phase: 'VOTING',
      phaseEndsAt: sm.phaseEndsAt,
    });
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Process a vote                                                     */
  /* ------------------------------------------------------------------ */

  processVote(roomCode: string, voterId: string, targetId: string | null): void {
    const room = this.roomStore.getRoom(roomCode);
    if (!room || !room.gameState) return;

    const gs = room.gameState;
    if (gs.phase !== 'VOTING') return;

    // Validate voter is ACTIVE
    const voter = gs.players.find((p) => p.id === voterId);
    if (!voter || voter.status !== 'ACTIVE') return;

    // Prevent double-voting
    if (gs.votes.some((v) => v.voterId === voterId)) return;

    // If targetId is set, validate target exists and is active
    if (targetId !== null) {
      const target = gs.players.find((p) => p.id === targetId);
      if (!target || target.status !== 'ACTIVE') return;
    }

    gs.votes.push({ voterId, targetId });

    logEvent('vote_cast', {
      code: roomCode,
      roundNumber: gs.roundNumber,
      voter: voterId,
      target: targetId,  // null if skip
    });

    // Broadcast vote progress
    const activeCount = gs.players.filter((p) => p.status === 'ACTIVE').length;
    this.connManager.broadcastToRoom(roomCode, ServerEvent.VOTE_UPDATE, {
      voterCount: gs.votes.length,
      totalPlayers: activeCount,
    });

    // If all votes are in, tally immediately
    if (RoundManager.allVotesIn(gs.votes, gs.players)) {
      this.tallyAndEvaluate(roomCode);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Start a new match (after GAME_OVER)                               */
  /* ------------------------------------------------------------------ */

  startNewMatch(roomCode: string, callerSocketId: string): boolean {
    const room = this.roomStore.getRoom(roomCode);
    if (!room) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found',
      });
      return false;
    }

    const host = this.findPlayerBySocket(room, callerSocketId);
    if (!host || !host.isHost) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.NOT_HOST, message: 'Only the host can start a new match',
      });
      return false;
    }

    if (!room.gameState || room.gameState.phase !== 'GAME_OVER') {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        code: ErrorCode.GENERIC, message: 'Match is not over',
      });
      return false;
    }

    // Cleanup old state machine
    this.cleanupRoom(roomCode);

    // Reset all players to ACTIVE
    for (const [, player] of room.players) {
      player.status = 'ACTIVE';
    }

    room.gameState = null;

    // Transition to LOBBY
    const sm = new StateMachine();
    sm.transition('LOBBY');
    this.machines.set(roomCode, sm);

    this.connManager.broadcastToRoom(roomCode, ServerEvent.PHASE_CHANGED, {
      phase: 'LOBBY',
      phaseEndsAt: 0,
    });

    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Internal: Tally + Evaluate                                         */
  /* ------------------------------------------------------------------ */

  private tallyAndEvaluate(roomCode: string): void {
    const room = this.roomStore.getRoom(roomCode);
    if (!room || !room.gameState) return;

    const gs = room.gameState;

    // Cancel voting timer
    const sm = this.machines.get(roomCode);
    sm?.cancelTimer();

    // Transition to EVALUATION
    sm?.transition('EVALUATION', 0);

    // Tally
    const { expelled, roundResult } = RoundManager.tally(gs.votes, gs.players);
    gs.result = roundResult;

    // Broadcast all votes
    this.connManager.broadcastToRoom(roomCode, ServerEvent.VOTE_BROADCAST, { votes: gs.votes });

    // Broadcast result
    this.connManager.broadcastToRoom(roomCode, ServerEvent.ROUND_RESULT, roundResult);

    logEvent('round_result', {
      code: roomCode,
      roundNumber: gs.roundNumber,
      expelled: roundResult.expelledUsername || null,
      wasImpostor: roundResult.wasImpostor,
      aliveImpostors: roundResult.aliveImpostors,
      aliveNonImpostors: roundResult.aliveNonImpostors,
    });

    if (expelled) {
      // Update player status
      const roomPlayer = room.players.get(expelled.username);
      if (roomPlayer) {
        roomPlayer.status = 'SPECTATOR';
      }
      const gp = gs.players.find((p) => p.id === expelled.id);
      if (gp) {
        gp.status = 'SPECTATOR';
      }
    }

    // Check win condition
    if (roundResult.winner) {
      // Game over
      gs.phase = 'GAME_OVER';
      logEvent('match_ended', {
        code: roomCode,
        winner: roundResult.winner,
        totalRounds: gs.roundNumber,
      });
      this.connManager.broadcastToRoom(roomCode, ServerEvent.GAME_OVER, { winner: roundResult.winner });
      this.connManager.broadcastToRoom(roomCode, ServerEvent.PHASE_CHANGED, {
        phase: 'GAME_OVER',
        phaseEndsAt: 0,
      });
    } else {
      // Resume discussion (next round)
      gs.votes = [];
      const discussionMs = room.settings.discussionTime * 1000;
      sm?.transition('DISCUSSION', discussionMs);

      this.connManager.broadcastToRoom(roomCode, ServerEvent.PHASE_CHANGED, {
        phase: 'DISCUSSION',
        phaseEndsAt: sm?.phaseEndsAt ?? 0,
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Internal: Timer expiry handler                                     */
  /* ------------------------------------------------------------------ */

  private handleTimerExpiry(roomCode: string, phase: GamePhase): void {
    const room = this.roomStore.getRoom(roomCode);
    if (!room || !room.gameState) return;

    const gs = room.gameState;
    const sm = this.machines.get(roomCode);
    if (!sm) return;

    if (phase === 'DISCUSSION') {
      // Discussion time's up → VOTING
      const votingSec = room.settings.votingTimer ?? DEFAULT_VOTING_TIMER;
      const votingMs = votingSec * 1000;
      gs.phaseEndsAt = Date.now() + votingMs;
      sm.transition('VOTING', votingMs);

      this.connManager.broadcastToRoom(roomCode, ServerEvent.PHASE_CHANGED, {
        phase: 'VOTING',
        phaseEndsAt: sm.phaseEndsAt,
      });
    } else if (phase === 'VOTING') {
      // Voting time's up → tally with whatever we have
      this.tallyAndEvaluate(roomCode);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  private findPlayerBySocket(room: Room, socketId: string): Player | undefined {
    for (const [, player] of room.players) {
      if (player.id === socketId) return player;
    }
    return undefined;
  }

  /**
   * Impostor count is purely a function of the lobby size:
   *   - 4 or fewer players → 1 impostor
   *   - 5 or more players  → 2 impostors
   * The host cannot pick a different value.
   */
  private getMaxImpostors(playerCount: number): number {
    if (playerCount < 5) return 1;
    return 2;
  }

  cleanupRoom(roomCode: string): void {
    const sm = this.machines.get(roomCode);
    sm?.cancelTimer();
    this.machines.delete(roomCode);
  }

  /**
   * Clear the impostor history for a room. Called by RoomManager via
   * the onRoomDestroyed callback when the room is truly destroyed
   * (host disconnect, last player leaves). Do NOT call this when
   * starting a new match in the same room — the re-rol rule depends
   * on the history surviving across matches.
   */
  clearImpostorHistory(roomCode: string): void {
    this.impostorHistory.delete(roomCode);
  }
}
