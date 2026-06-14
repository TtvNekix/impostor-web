import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useGameStore } from '../stores/gameStore';
import { PlayerList } from '../components/PlayerList';
import es from '../i18n/es';

interface LobbyScreenProps {
  createRoom: (payload: { code: string; username: string }) => void;
  joinRoom: (payload: { code: string; username: string }) => void;
  startMatch: () => void;
  updateSettings: (payload: { impostorCount?: number; discussionTime?: number }) => void;
}

export function LobbyScreen({
  createRoom,
  joinRoom,
  startMatch,
  updateSettings,
}: LobbyScreenProps) {
  const roomCode = useRoomStore((s) => s.roomCode);
  const players = useRoomStore((s) => s.players);
  const isHost = useRoomStore((s) => s.isHost);
  const settings = useRoomStore((s) => s.settings);
  const error = useConnectionStore((s) => s.error);
  const clearError = useConnectionStore((s) => s.clearError);

  const gamePhase = useGameStore((s) => s.phase);

  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [copied, setCopied] = useState(false);

  // Only show lobby UI when phase is LOBBY
  if (gamePhase !== 'LOBBY') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    if (mode === 'create') {
      createRoom({ code: code.trim().toUpperCase(), username: username.trim() });
    } else {
      joinRoom({ code: code.trim().toUpperCase(), username: username.trim() });
    }
  };

  const handleCopyCode = async () => {
    if (roomCode) {
      try {
        await navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback: select text
      }
    }
  };

  const handleStartMatch = () => {
    if (isHost && players.length >= 3) {
      startMatch();
    }
  };

  const canStart = isHost && players.length >= 3;

  // No room → show create/join form (connection screen)
  if (!roomCode) {
    return (
      <div className="connection-screen">
        <h1 className="connection-screen__title">
          {es.common.appName}
        </h1>

        {/* Mode toggle */}
        <div className="toggle-group">
          <button
            onClick={() => { setMode('create'); clearError(); }}
            className={`toggle-group__btn${mode === 'create' ? ' toggle-group__btn--active' : ''}`}
          >
            {es.lobby.createRoom}
          </button>
          <button
            onClick={() => { setMode('join'); clearError(); }}
            className={`toggle-group__btn${mode === 'join' ? ' toggle-group__btn--active' : ''}`}
          >
            {es.lobby.joinRoom}
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          <input
            type="text"
            placeholder={es.lobby.enterUsername}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            className="input"
          />

          {mode === 'join' && (
            <input
              type="text"
              placeholder={es.lobby.enterRoomCode}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              className="input"
              style={{ textTransform: 'uppercase' }}
            />
          )}

          <button
            type="submit"
            disabled={!username.trim() || (mode === 'join' && !code.trim())}
            className="btn btn--primary btn--block"
          >
            {mode === 'create' ? es.lobby.create : es.lobby.join}
          </button>

          {error && (
            <p className="connection-screen__error">{error}</p>
          )}
        </form>
      </div>
    );
  }

  // Room exists → show lobby with player list, settings, and start button
  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header__title">{es.lobby.title}</div>
      </div>

      {/* Room code + copy */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="room-code-display">
          <span className="room-code-display__code">{roomCode}</span>
          <button
            onClick={handleCopyCode}
            className="btn btn--ghost btn--sm"
          >
            {copied ? es.lobby.codeCopied : es.lobby.copyCode}
          </button>
        </div>
        <span className="player-count">
          {es.lobby.playerCount
            .replace('{count}', String(players.length))
            .replace('{max}', String(settings?.maxPlayers ?? 10))}
        </span>
      </div>

      {/* Player list */}
      <PlayerList
        players={players}
        currentPlayerId={undefined}
      />

      {/* Settings (host only) */}
      {isHost && settings && (
        <div className="settings-panel">
          <h3 className="settings-panel__title">{es.lobby.settings}</h3>

          {/* Impostor count */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{es.lobby.impostors}</label>
            <select
              value={settings.impostorCount}
              onChange={(e) =>
                updateSettings({ impostorCount: Number(e.target.value) })
              }
              className="settings-panel__select"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>

          {/* Discussion time */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{es.lobby.discussionTime}</label>
            <select
              value={settings.discussionTime}
              onChange={(e) =>
                updateSettings({ discussionTime: Number(e.target.value) })
              }
              className="settings-panel__select"
            >
              <option value={60}>60 {es.lobby.seconds}</option>
              <option value={90}>90 {es.lobby.seconds}</option>
              <option value={120}>120 {es.lobby.seconds}</option>
            </select>
          </div>
        </div>
      )}

      {/* Start match button (host only) */}
      {isHost && (
        <button
          onClick={handleStartMatch}
          disabled={!canStart}
          className={`btn btn--lg btn--block ${canStart ? 'btn--success' : ''}`}
          style={!canStart ? { opacity: 0.4, cursor: 'not-allowed', background: '#333' } : undefined}
        >
          {players.length < 3
            ? es.lobby.minPlayersRequired.replace('{min}', '3')
            : es.lobby.startMatch}
        </button>
      )}
    </div>
  );
}
