import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { TimerBar } from '../components/TimerBar';
import { VotingTable } from '../components/VotingTable';
import es from '../i18n/es';

interface VotingScreenProps {
  vote: (payload: { targetId: string | null }) => void;
  /** Total voting duration in seconds (default 30) */
  totalTime?: number;
  /** Current vote count info */
  voterCount?: number;
  totalPlayers?: number;
}

/**
 * Voting screen shows:
 * - VotingTable with clickable player cards
 * - Timer bar for vote phase
 * - Skip vote button
 * - Live vote count ("X/Y votaron")
 * - Phase info
 * - Spectators see results but cannot vote
 */
export function VotingScreen({
  vote,
  totalTime = 30,
  voterCount = 0,
  totalPlayers = 0,
}: VotingScreenProps) {
  const players = useRoomStore((s) => s.players);
  const roomCode = useRoomStore((s) => s.roomCode);
  const phase = useGameStore((s) => s.phase);
  const timer = useGameStore((s) => s.timer);
  const myRole = useGameStore((s) => s.myRole);

  // If phase is not VOTING, don't render
  if (phase !== 'VOTING') return null;

  // Current player ID — in a real app, this would come from auth/socket
  // For now, derive from room store or leave as unknown
  const currentPlayerId = '';

  // Check if current player is spectator (no role or was expelled)
  const isSpectator = myRole === null;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header__title">{es.voting.title}</div>
        {roomCode && (
          <div className="page-header__subtitle">Sala: {roomCode}</div>
        )}
      </div>

      {/* Phase info */}
      <div className="card" style={{ textAlign: 'center', padding: '0.6rem 1rem' }}>
        <span style={{ color: 'var(--accent-warning)', fontWeight: 600, fontSize: '0.85rem' }}>
          {es.voting.phaseInfo}
        </span>
      </div>

      {/* Timer bar */}
      <TimerBar total={totalTime} remaining={timer > 0 ? timer : totalTime} />

      {/* Live vote count */}
      <div className="vote-count">
        {totalPlayers > 0
          ? es.voting.voteCount
              .replace('{count}', String(voterCount))
              .replace('{total}', String(totalPlayers))
          : es.voting.waitingForVotes}
      </div>

      {/* Voting table */}
      <VotingTable
        players={players}
        currentPlayerId={currentPlayerId}
        isSpectator={isSpectator}
        onVote={(targetId) => vote({ targetId })}
      />
    </div>
  );
}
