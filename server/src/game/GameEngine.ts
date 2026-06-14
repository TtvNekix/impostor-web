import type { Room, GameState, GamePlayer, Player, GamePhase } from '@impostor/shared';
import {
  ServerEvent,
  VOTING_TIMER,
  MIN_PLAYERS,
} from '@impostor/shared';
import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { ConnectionManager } from '../connection/ConnectionManager';
import { StateMachine } from './StateMachine';
import { RoundManager } from './RoundManager';

export class GameEngine {
  /** Per-room state machine instances. */
  private machines: Map<string, StateMachine> = new Map();

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
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, { message: 'Room not found' });
      return false;
    }

    const host = this.findPlayerBySocket(room, callerSocketId);
    if (!host || !host.isHost) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, { message: 'Only the host can start a match' });
      return false;
    }

    const activePlayers = Array.from(room.players.values()).filter(
      (p) => p.status === 'ACTIVE',
    );
    if (activePlayers.length < MIN_PLAYERS) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        message: `Minimum ${MIN_PLAYERS} players required to start`,
      });
      return false;
    }

    if (this.wordBank.isEmpty()) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, { message: 'No words available in bank' });
      return false;
    }

    // Validate impostor count against player count
    const maxImpostors = this.getMaxImpostors(activePlayers.length);
    if (room.settings.impostorCount > maxImpostors) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, {
        message: `Maximum ${maxImpostors} impostor(s) for ${activePlayers.length} players`,
      });
      return false;
    }

    // Create GamePlayer snapshot
    const impostorIds = this.selectImpostors(activePlayers, room.settings.impostorCount);
    const gamePlayers: GamePlayer[] = activePlayers.map((p) => ({
      id: p.id,
      username: p.username,
      isImpostor: impostorIds.has(p.id),
      status: p.status,
    }));

    // Select a word
    const wordPick = this.wordBank.randomWord();
    if (!wordPick) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, { message: 'Failed to select word' });
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
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, { message: 'Room not found' });
      return false;
    }

    const host = this.findPlayerBySocket(room, callerSocketId);
    if (!host || !host.isHost) {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, { message: 'Only the host can start a new match' });
      return false;
    }

    if (!room.gameState || room.gameState.phase !== 'GAME_OVER') {
      this.connManager.sendToSocket(callerSocketId, ServerEvent.ROOM_ERROR, { message: 'Match is not over' });
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
      const votingMs = VOTING_TIMER * 1000;
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

  private selectImpostors(
    activePlayers: Player[],
    count: number,
  ): Set<string> {
    const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
    const ids = new Set<string>();
    for (let i = 0; i < count && i < shuffled.length; i++) {
      ids.add(shuffled[i].id);
    }
    return ids;
  }

  private getMaxImpostors(playerCount: number): number {
    if (playerCount <= 6) return 1;
    return 2;
  }

  cleanupRoom(roomCode: string): void {
    const sm = this.machines.get(roomCode);
    sm?.cancelTimer();
    this.machines.delete(roomCode);
  }
}
