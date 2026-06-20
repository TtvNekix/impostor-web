import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { TimerBar } from '../components/TimerBar';
import { VotingTable } from '../components/VotingTable';
import { usePhaseTimer } from '../hooks/usePhaseTimer';
import { useT } from '../i18n/I18nContext';

interface VotingScreenProps {
  vote: (payload: { targetId: string | null }) => void;
  /** Total voting duration in seconds. Read from the room settings
   *  (set by the host at create time or via UPDATE_SETTINGS). If
   *  undefined (e.g. settings haven't loaded yet) we fall back to 30
   *  so the bar still has a denominator for the percentage. */
  totalTime?: number;
  /** This client's socket id (so we can filter ourselves from the list) */
  myId?: string;
  /** Host-only: tally the current set of votes even if some
   *  players haven't voted yet. Used when the room is stuck at
   *  "5/6 voted" because someone AFK'd. */
  forceEndVoting?: () => void;
}

/**
 * Voting screen shows:
 * - VotingTable with clickable player cards
 * - Timer bar for vote phase
 * - Skip vote button
 * - Live vote count ("X/Y voted")
 * - Phase info
 * - Spectators see results but cannot vote
 */
export function VotingScreen({
  vote,
  totalTime,
  myId = '',
  forceEndVoting,
}: VotingScreenProps) {
  const t = useT();
  const players = useRoomStore((s) => s.players);
  const settings = useRoomStore((s) => s.settings);
  const roomCode = useRoomStore((s) => s.roomCode);
  const phase = useGameStore((s) => s.phase);
  const myRole = useGameStore((s) => s.myRole);
  const voterCount = useGameStore((s) => s.voterCount);
  const totalVoters = useGameStore((s) => s.totalVoters);
  const votes = useGameStore((s) => s.votes);
  const hasVoted = !!myId && votes.some((v) => v.voterId === myId);

  // Local timer tick — the server sets phaseEndsAt in phase_changed, this
  // hook recomputes the remaining seconds on a 250ms interval.
  const remaining = usePhaseTimer();

  // Fall back to 30s when settings haven't loaded yet so the timer bar
  // has a denominator for the percentage. This is also what the server
  // defaults to (DEFAULT_VOTING_TIMER).
  const totalSec = totalTime ?? 30;

  // If phase is not VOTING, don't render
  if (phase !== 'VOTING') return null;

  // Check if current player is spectator (no role or was expelled)
  const isSpectator = myRole === null;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header__title">{t.voting.title}</div>
        {roomCode && (
          <div className="page-header__subtitle">
            {t.lobby.roomCode}: {roomCode}
          </div>
        )}
      </div>

      {/* Phase info */}
      <div className="card card--centered">
        <span className="text-warning-emphasis text-warning-emphasis--sm">
          {t.voting.phaseInfo}
        </span>
      </div>

      {/* Timer bar */}
      <TimerBar total={totalSec} remaining={remaining > 0 ? remaining : totalSec} />

      {/* Live vote count */}
      <div className="vote-count">
        {totalVoters > 0
          ? t.voting.voteCount
              .replace('{count}', String(voterCount))
              .replace('{total}', String(totalVoters))
          : t.voting.waitingForVotes}
      </div>

      {/* Voting table */}
      <VotingTable
        players={players}
        currentPlayerId={myId}
        isSpectator={isSpectator}
        hasVoted={hasVoted}
        hardcore={settings?.hardcore}
        onVote={(targetId) => vote({ targetId })}
        onForceEnd={forceEndVoting}
        showForceEnd
      />
    </div>
  );
}
