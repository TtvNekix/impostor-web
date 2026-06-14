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

  // No room → show create/join form
  if (!roomCode) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          gap: '2rem',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: '#fff',
            textAlign: 'center',
          }}
        >
          {es.common.appName}
        </h1>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { setMode('create'); clearError(); }}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '0.5rem 0 0 0.5rem',
              border: '1px solid #555',
              background: mode === 'create' ? '#4a4a8a' : '#1a1a3a',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {es.lobby.createRoom}
          </button>
          <button
            onClick={() => { setMode('join'); clearError(); }}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '0 0.5rem 0.5rem 0',
              border: '1px solid #555',
              background: mode === 'join' ? '#4a4a8a' : '#1a1a3a',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
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
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #555',
              background: '#1a1a3a',
              color: '#fff',
              fontSize: '1rem',
            }}
          />

          {mode === 'join' && (
            <input
              type="text"
              placeholder={es.lobby.enterRoomCode}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #555',
                background: '#1a1a3a',
                color: '#fff',
                fontSize: '1rem',
                textTransform: 'uppercase',
              }}
            />
          )}

          <button
            type="submit"
            disabled={!username.trim() || (mode === 'join' && !code.trim())}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background:
                !username.trim() || (mode === 'join' && !code.trim())
                  ? '#555'
                  : '#4a4a8a',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor:
                !username.trim() || (mode === 'join' && !code.trim())
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {mode === 'create' ? es.lobby.create : es.lobby.join}
          </button>

          {error && (
            <p style={{ color: '#ef4444', textAlign: 'center', fontSize: '0.9rem' }}>
              {error}
            </p>
          )}
        </form>
      </div>
    );
  }

  // Room exists → show lobby with player list, settings, and start button
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '600px',
        margin: '0 auto',
        padding: '2rem 1rem',
        gap: '1.5rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 style={{ color: '#fff', fontWeight: 700 }}>{es.lobby.title}</h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#facc15',
              letterSpacing: '0.2em',
            }}
          >
            {roomCode}
          </span>
          <button
            onClick={handleCopyCode}
            style={{
              background: 'transparent',
              border: '1px solid #555',
              color: '#ccc',
              padding: '0.25rem 0.6rem',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            {copied ? es.lobby.codeCopied : es.lobby.copyCode}
          </button>
        </div>
      </div>

      {/* Player count */}
      <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
        {es.lobby.playerCount.replace('{count}', String(players.length)).replace('{max}', String(settings?.maxPlayers ?? 10))}
      </p>

      {/* Player list */}
      <PlayerList
        players={players}
        currentPlayerId={undefined}
      />

      {/* Settings (host only) */}
      {isHost && settings && (
        <div
          style={{
            background: '#1a1a3a',
            borderRadius: '0.5rem',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <h3 style={{ color: '#ccc', fontSize: '0.9rem', fontWeight: 600 }}>
            {es.lobby.settings}
          </h3>

          {/* Impostor count */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <label style={{ color: '#ccc' }}>{es.lobby.impostors}</label>
            <select
              value={settings.impostorCount}
              onChange={(e) =>
                updateSettings({ impostorCount: Number(e.target.value) })
              }
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '0.25rem',
                border: '1px solid #555',
                background: '#2a2a4a',
                color: '#fff',
              }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>

          {/* Discussion time */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <label style={{ color: '#ccc' }}>{es.lobby.discussionTime}</label>
            <select
              value={settings.discussionTime}
              onChange={(e) =>
                updateSettings({ discussionTime: Number(e.target.value) })
              }
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '0.25rem',
                border: '1px solid #555',
                background: '#2a2a4a',
                color: '#fff',
              }}
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
          style={{
            padding: '1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: canStart
              ? 'linear-gradient(135deg, #4ade80, #22c55e)'
              : '#555',
            color: canStart ? '#0f0f23' : '#999',
            fontWeight: 700,
            fontSize: '1.1rem',
            cursor: canStart ? 'pointer' : 'not-allowed',
            transition: 'opacity 0.2s',
          }}
        >
          {players.length < 3
            ? es.lobby.minPlayersRequired.replace('{min}', '3')
            : es.lobby.startMatch}
        </button>
      )}
    </div>
  );
}
