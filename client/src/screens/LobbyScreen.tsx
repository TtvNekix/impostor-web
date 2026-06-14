import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useGameStore } from '../stores/gameStore';
import { PlayerList } from '../components/PlayerList';
import { CustomSelect, type CustomSelectOption } from '../components/CustomSelect';
import {
  generateRoomCode,
  ALLOWED_MAX_PLAYERS,
  DEFAULT_MAX_PLAYERS,
} from '@impostor/shared';
import es from '../i18n/es';

interface LobbyScreenProps {
  createRoom: (payload: { code: string; username: string; settings?: { maxPlayers: number } }) => void;
  joinRoom: (payload: { code: string; username: string }) => void;
  startMatch: () => void;
  updateSettings: (payload: { impostorCount?: number; discussionTime?: number }) => void;
}

const MAX_PLAYER_OPTIONS: CustomSelectOption<number>[] = ALLOWED_MAX_PLAYERS.map((n) => ({
  value: n,
  label: String(n),
}));

const DISCUSSION_TIME_OPTIONS: CustomSelectOption<number>[] = [
  { value: 60, label: `60 ${es.lobby.seconds}` },
  { value: 90, label: `90 ${es.lobby.seconds}` },
  { value: 120, label: `120 ${es.lobby.seconds}` },
];

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
  const [maxPlayers, setMaxPlayers] = useState<number>(DEFAULT_MAX_PLAYERS);
  const [copied, setCopied] = useState(false);

  // Only show lobby UI when phase is LOBBY
  if (gamePhase !== 'LOBBY') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    if (mode === 'create') {
      const roomCode = code.trim().toUpperCase() || generateRoomCode();
      createRoom({
        code: roomCode,
        username: username.trim(),
        settings: { maxPlayers },
      });
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

          {mode === 'create' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.6rem 0.8rem',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(0, 0, 0, 0.2)',
              }}
            >
              <label
                htmlFor="max-players-select"
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                }}
              >
                {es.lobby.maxPlayers}
              </label>
              <CustomSelect
                value={maxPlayers}
                options={MAX_PLAYER_OPTIONS}
                onChange={setMaxPlayers}
                ariaLabel={es.lobby.maxPlayers}
                className="connection-max-players"
              />
            </div>
          )}

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

      {/* Settings (host only) — maxPlayers is set at create time and locked. */}
      {isHost && settings && (
        <div className="settings-panel">
          <h3 className="settings-panel__title">{es.lobby.settings}</h3>

          {/* Max players (read-only, set at room creation) */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{es.lobby.maxPlayers}</label>
            <span className="settings-panel__value">{settings.maxPlayers}</span>
          </div>

          {/* Impostor count */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{es.lobby.impostors}</label>
            <CustomSelect
              value={settings.impostorCount}
              options={[
                { value: 1, label: '1' },
                { value: 2, label: '2' },
              ]}
              onChange={(v) => updateSettings({ impostorCount: v })}
              ariaLabel={es.lobby.impostors}
            />
          </div>

          {/* Discussion time */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{es.lobby.discussionTime}</label>
            <CustomSelect
              value={settings.discussionTime}
              options={DISCUSSION_TIME_OPTIONS}
              onChange={(v) => updateSettings({ discussionTime: v })}
              ariaLabel={es.lobby.discussionTime}
            />
          </div>
        </div>
      )}

      {/* Start match button (host only) */}
      {isHost && (
        <button
          onClick={handleStartMatch}
          disabled={!canStart}
          className={`btn btn--lg btn--block ${canStart ? 'btn--success' : ''}`}
        >
          {players.length < 3
            ? es.lobby.minPlayersRequired.replace('{min}', '3')
            : es.lobby.startMatch}
        </button>
      )}
    </div>
  );
}
