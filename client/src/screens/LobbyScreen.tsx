import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { useCategoryStore } from '../stores/categoryStore';
import { useToastStore } from '../stores/toastStore';
import { ALLOWED_VOTING_TIMERS } from '@impostor/shared';
import { PlayerList } from '../components/PlayerList';
import { CustomSelect, type CustomSelectOption } from '../components/CustomSelect';
import { CategoryManager } from '../components/CategoryManager';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { HardcoreHelpModal } from '../components/HardcoreHelpModal';
import { useT } from '../i18n/I18nContext';

interface LobbyScreenProps {
  createRoom: (payload: { code: string; username: string; settings?: { maxPlayers: number } }) => void;
  joinRoom: (payload: { code: string; username: string }) => void;
  startMatch: () => void;
  updateSettings: (payload: {
    category?: string | null;
    votingTimer?: 15 | 30 | 45 | 60;
    hardcore?: boolean;
    impostorCount?: number;
    visibility?: 'public' | 'private';
    hostLocale?: string;
  }) => void;
  addCategory: (payload: { name: string; displayName?: string; words: string }) => void;
  addWords: (payload: { category: string; words: string }) => void;
  kickPlayer: (username: string) => void;
  /** This client's socket id, used to exclude self from the kick list. */
  myId: string | null;
}

export function LobbyScreen({
  startMatch,
  updateSettings,
  addCategory,
  addWords,
  kickPlayer,
  myId,
}: LobbyScreenProps) {
  const t = useT();
  const roomCode = useRoomStore((s) => s.roomCode);
  const players = useRoomStore((s) => s.players);
  const isHost = useRoomStore((s) => s.isHost);
  const settings = useRoomStore((s) => s.settings);

  const gamePhase = useGameStore((s) => s.phase);
  const categories = useCategoryStore((s) => s.categories);
  const getDisplayName = useCategoryStore((s) => s.getDisplayName);
  const pushToast = useToastStore((s) => s.push);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [pendingKick, setPendingKick] = useState<string | null>(null);
  const [hardcoreHelpOpen, setHardcoreHelpOpen] = useState(false);

  // Only show lobby UI when phase is LOBBY
  if (gamePhase !== 'LOBBY') return null;

  const handleCopyCode = async () => {
    if (!roomCode) return;
    const url = `${window.location.origin}/join/${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ message: t.lobby.linkCopied, variant: 'success' });
    } catch {
      pushToast({ message: t.common.copyFailed, variant: 'error' });
    }
  };

  const handleStartMatch = () => {
    if (isHost && players.length >= 3) {
      startMatch();
    }
  };

  const canStart = isHost && players.length >= 3;

  // Build category options for the in-lobby selector. The first option is
  // the special "Random" entry (null) that means random category.
  const categoryOptions: CustomSelectOption<string>[] = [
    { value: '', label: t.lobby.randomCategory },
    ...categories.map((c) => ({ value: c.name, label: c.displayName })),
  ];

  const votingTimerOptions: CustomSelectOption<number>[] = ALLOWED_VOTING_TIMERS.map((s) => ({
    value: s,
    label: `${s}s`,
  }));

  // Room exists → show lobby with player list, settings, and start button
  return (
    <div className="page">
      {/* Header — small logo + room title */}
      <div className="page-header page-header--with-logo">
        <img
          src="/logo-256x256.png"
          alt=""
          aria-hidden="true"
          className="page-header__logo"
        />
        <div className="page-header__title">{t.lobby.title}</div>
      </div>

      {/* Room code + copy */}
      <div className="flex-between">
        <div className="room-code-display">
          <span className="room-code-display__code">{roomCode}</span>
          <button
            onClick={handleCopyCode}
            className="btn btn--ghost btn--sm"
          >
            {t.lobby.copyLink}
          </button>
        </div>
        <span className="player-count">
          {t.lobby.playerCount
            .replace('{count}', String(players.length))
            .replace('{max}', String(settings?.maxPlayers ?? 10))}
        </span>
      </div>

      {/* Player list — host can kick non-host players */}
      <PlayerList
        players={players}
        currentPlayerId={myId ?? undefined}
        canKick={isHost}
        onKick={(username) => setPendingKick(username)}
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

          {/* Impostor count — host picks 1 or 2.
              1 always available; 2 is shown but disabled until there are
              5+ players (the server enforces this with getMaxImpostors).
              Hardcore mode always uses 1 (overridden server-side). */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{t.lobby.impostors}</label>
            <CustomSelect
              value={settings?.impostorCount ?? 1}
              options={[
                { value: 1, label: '1' },
                {
                  value: 2,
                  label: players.length >= 5
                    ? '2'
                    : `2 (${t.lobby.impostorsNeedsFive ?? 'necesitás 5+ jugadores'})`,
                  disabled: players.length < 5,
                },
              ]}
              onChange={(v) => updateSettings({ impostorCount: v as 1 | 2 })}
              ariaLabel={t.lobby.impostors}
            />
          </div>

          {/* Voting timer (host picks) */}
          <div className="settings-panel__row">
            <label className="settings-panel__label">{t.lobby.votingTimer}</label>
            <CustomSelect
              value={settings?.votingTimer ?? 30}
              options={votingTimerOptions}
              onChange={(v) => updateSettings({ votingTimer: v as 15 | 30 | 45 | 60 })}
              ariaLabel={t.lobby.votingTimer}
            />
          </div>

          {/* Hardcore mode toggle + help */}
          <div className="settings-panel__row settings-panel__row--hardcore">
            <label className="settings-panel__label">
              {t.lobby.hardcore}
              <button
                type="button"
                className="help-icon"
                onClick={() => setHardcoreHelpOpen(true)}
                aria-label={t.lobby.helpHardcore}
                title={t.lobby.helpHardcore}
              >
                ?
              </button>
            </label>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings?.hardcore ?? false}
                onChange={(e) => updateSettings({ hardcore: e.target.checked })}
              />
              <span className="toggle-switch__slider" />
            </label>
          </div>

          {/* Visibility (public/private) — public rooms show up in the
              public-rooms list. Defaults to 'private' which matches the
              server's DEFAULT_VISIBILITY. */}
          <div className="settings-panel__row settings-panel__row--visibility">
            <label className="settings-panel__label">
              {t.lobby.visibility}
              <span
                className="help-icon"
                aria-label={t.lobby.visibilityHint}
                title={t.lobby.visibilityHint}
              >
                ?
              </span>
            </label>
            <div className="settings-panel__visibility" role="radiogroup" aria-label={t.lobby.visibility}>
              <label className={`settings-panel__radio${(settings?.visibility ?? 'private') === 'private' ? ' settings-panel__radio--active' : ''}`}>
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={(settings?.visibility ?? 'private') === 'private'}
                  onChange={() => updateSettings({ visibility: 'private' })}
                />
                <span>{t.lobby.private}</span>
              </label>
              <label className={`settings-panel__radio${settings?.visibility === 'public' ? ' settings-panel__radio--active' : ''}`}>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={settings?.visibility === 'public'}
                  onChange={() => updateSettings({ visibility: 'public' })}
                />
                <span>{t.lobby.public}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Selected category preview (non-host viewers) */}
      {!isHost && settings?.category && (
        <div className="card card--centered-narrow">
          <span className="text-warning-emphasis text-warning-emphasis--sm">
            {t.lobby.category}:
          </span>{' '}
          <span className="text-secondary">
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

      {/* Kick confirmation modal. The user must confirm before the host
          removes another player from the room. */}
      <ConfirmationModal
        open={!!pendingKick}
        title={t.confirm.kickPlayerTitle.replace('{player}', pendingKick ?? '')}
        message={t.confirm.kickPlayerMessage}
        confirmLabel={t.confirm.kick}
        cancelLabel={t.common.cancel}
        variant="danger"
        onConfirm={() => {
          if (pendingKick) kickPlayer(pendingKick);
          setPendingKick(null);
        }}
        onCancel={() => setPendingKick(null)}
      />

      <HardcoreHelpModal
        open={hardcoreHelpOpen}
        onClose={() => setHardcoreHelpOpen(false)}
      />
    </div>
  );
}
