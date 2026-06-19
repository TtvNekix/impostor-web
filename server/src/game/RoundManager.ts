import type { GamePlayer, Vote, RoundResult, Winner } from '@impostor/shared';

export interface TallyResult {
  expelled: GamePlayer | null;
  roundResult: RoundResult;
}

export class RoundManager {
  /**
   * Tally votes and determine expulsion.
   *
   * - If all votes are skip OR there's a tie for most votes → no expulsion
   * - Otherwise → the player with the most votes is expelled
   */
  static tally(votes: Vote[], players: GamePlayer[]): TallyResult {
    const activePlayers = players.filter((p) => p.status === 'ACTIVE');
    // Count only ACTIVE impostors. SPECTATOR impostors from previous
    // rounds must not be counted as "alive" — they were expelled.
    const impostorIds = new Set(
      players.filter((p) => p.isImpostor && p.status === 'ACTIVE').map((p) => p.id),
    );

    // Count votes per target (exclude skip votes)
    const targetCounts = new Map<string, number>();
    let skipCount = 0;

    for (const vote of votes) {
      if (vote.targetId === null) {
        skipCount++;
      } else {
        targetCounts.set(vote.targetId, (targetCounts.get(vote.targetId) ?? 0) + 1);
      }
    }

    // Determine the maximum vote count among targets
    let maxVotes = 0;
    for (const count of targetCounts.values()) {
      if (count > maxVotes) maxVotes = count;
    }

    // Find all targets that received maxVotes
    const topTargets: string[] = [];
    for (const [targetId, count] of targetCounts.entries()) {
      if (count === maxVotes && count > 0) {
        topTargets.push(targetId);
      }
    }

    // Tie or all skip → no expulsion
    if (topTargets.length !== 1) {
      return {
        expelled: null,
        roundResult: {
          expelledId: null,
          expelledUsername: '',
          wasImpostor: false,
          aliveImpostors: impostorIds.size,
          aliveNonImpostors: activePlayers.length - impostorIds.size,
          winner: null,
        },
      };
    }

    // Single target with most votes → expel
    const expelledId = topTargets[0];
    const expelled = players.find((p) => p.id === expelledId) ?? null;

    if (!expelled) {
      // Shouldn't happen, but guard just in case
      return {
        expelled: null,
        roundResult: {
          expelledId: null,
          expelledUsername: '',
          wasImpostor: false,
          aliveImpostors: impostorIds.size,
          aliveNonImpostors: activePlayers.length - impostorIds.size,
          winner: null,
        },
      };
    }

    const wasImpostor = expelled.isImpostor;
    const aliveImpostors = impostorIds.size - (wasImpostor ? 1 : 0);
    const aliveNonImpostors = activePlayers.length - 1 - aliveImpostors;

    // Check win condition
    const winner = RoundManager.checkWinCondition(aliveImpostors, aliveNonImpostors);

    return {
      expelled,
      roundResult: {
        expelledId: expelled.id,
        expelledUsername: expelled.username,
        wasImpostor,
        aliveImpostors,
        aliveNonImpostors,
        winner,
      },
    };
  }

  /**
   * Determine the winner based on remaining player counts.
   *
   * - No impostors left → NON_IMPOSTORS win
   * - Non-impostors ≤ impostors → IMPOSTORS win
   * - Otherwise → null (continue playing)
   */
  static checkWinCondition(
    aliveImpostors: number,
    aliveNonImpostors: number,
  ): Winner | null {
    if (aliveImpostors === 0) return 'NON_IMPOSTORS';
    if (aliveNonImpostors <= aliveImpostors) return 'IMPOSTORS';
    return null;
  }

  /** Check whether every alive player has cast a vote. */
  static allVotesIn(votes: Vote[], players: GamePlayer[]): boolean {
    const activeIds = new Set(
      players.filter((p) => p.status === 'ACTIVE').map((p) => p.id),
    );
    const votedIds = new Set(votes.map((v) => v.voterId));
    // Every active player must have voted
    for (const id of activeIds) {
      if (!votedIds.has(id)) return false;
    }
    return true;
  }
}
