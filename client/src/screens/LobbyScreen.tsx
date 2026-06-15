import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { useCategoryStore } from '../stores/categoryStore';
import { PlayerList } from '../components/PlayerList';
import { CustomSelect, type CustomSelectOption } from '../components/CustomSelect';
import { CategoryManager } from '../components/CategoryManager';
import { useT } from '../i18n/I18nContext';

interface LobbyScreenProps {
  createRoom: (payload: { code: string; username: string; settings?: { maxPlayers: number } }) => void;
  joinRoom: (payload: { code: string; username: string }) => void;
  startMatch: () => void;
  updateSettings: (payload: {
    category?: string | null;
  }) => void;
  addCategory: (payload: { name: string; displayName?: string; words: string }) => void;
  addWords: (payload: { category: string; words: string }) => void;
}

export function LobbyScreen({
  startMatch,
  updateSettings,
  addCategory,
  addWords,
}: LobbyScreenProps) {
  const t = useT();
  const roomCode = useRoomStore((s) => s.roomCode);
  const players = useRoomStore((s) => s.players);
  const isHost = useRoomStore((s) => s.isHost);
  const settings = useRoomStore((s) => s.settings);

  const gamePhase = useGameStore((s) => s.phase);
  const categories = useCategoryStore((s) => s.categories);
  const getDisplayName = useCategoryStore((s) => s.getDisplayName);

  const [copied, setCopied] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  // Only show lobby UI when phase is LOBBY
  if (gamePhase !== 'LOBBY') return null;

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

  // Build category options for the in-lobby selector. The first option is
  // the special "Aleatoria" entry (null) that means random category.
  const categoryOptions: CustomSelectOption<string>[] = [
    { value: '', label: t.lobby.randomCategory },
    ...categories.map((c) => ({ value: c.name, label: c.displayName })),
  ];

  // Room exists → show lobby with player list, settings, and start button
  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header__title">{t.lobby.title}</div>
      </div>

      {/* Room code + copy */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="room-code-display">
          <span className="room-code-display__code">{roomCode}</span>
          <button
            onClick={handleCopyCode}
            className="btn btn--ghost btn--sm"
          >
            {copied ? t.lobby.codeCopied : t.lobby.copyCode}
          </button>
        </div>
        <span className="player-count">
          {t.lobby.playerCount
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
          <h3 className="settings-panel__title">{t.lobby.settings}</h3>

          {/* Max players (read-only, set at room creation) */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{t.lobby.maxPlayers}</label>
            <span className="settings-panel__value">{settings.maxPlayers}</span>
          </div>

          {/* Category (host picks) */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{t.lobby.category}</label>
            <div className="settings-panel__category-controls">
              <CustomSelect
                value={settings.category ?? ''}
                options={categoryOptions}
                onChange={(v) => updateSettings({ category: v === '' ? null : v })}
                ariaLabel={t.lobby.category}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm settings-panel__manage-btn"
                onClick={() => setCategoryModalOpen(true)}
                aria-label={t.lobby.manageCategories}
                title={t.lobby.manageCategories}
              >
                {t.lobby.manageCategories}
              </button>
            </div>
          </div>

          {/* Impostor count — derived from player count, not a setting.
              < 5 players → 1 impostor.  5+ players → 2 impostors.
              Server enforces the same rule in startMatch. */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{t.lobby.impostors}</label>
            <span className="settings-panel__value">
              {players.length >= 5 ? 2 : 1}
            </span>
          </div>

          <p className="settings-panel__hint">
            {t.lobby.discussionHint}
          </p>
        </div>
      )}

      {/* Selected category preview (non-host viewers) */}
      {!isHost && settings?.category && (
        <div className="card" style={{ textAlign: 'center', padding: '0.6rem 0.9rem' }}>
          <span style={{ color: 'var(--accent-warning)', fontWeight: 600, fontSize: '0.85rem' }}>
            {t.lobby.category}:
          </span>{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            {getDisplayName(settings.category)}
          </span>
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
            ? t.lobby.minPlayersRequired.replace('{min}', '3')
            : t.lobby.startMatch}
        </button>
      )}

      {/* Category management modal */}
      {categoryModalOpen && (
        <CategoryManager
          onClose={() => setCategoryModalOpen(false)}
          addCategory={addCategory}
          addWords={addWords}
        />
      )}
    </div>
  );
}
