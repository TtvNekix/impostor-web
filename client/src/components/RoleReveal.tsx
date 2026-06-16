import type { PlayerRole } from '../stores/gameStore';
import { useT, useLocale } from '../i18n/I18nContext';

interface RoleRevealProps {
  role: PlayerRole;
  word: string | null;
  animate?: boolean;
}

const ROLE_HINT: Record<string, string> = {
  en: 'Try to figure out the word without being discovered',
  es: 'Intenta descubrir la palabra sin ser descubierto',
  pt: 'Tenta descobrir a palavra sem seres descoberto',
  fr: "Essaie de deviner le mot sans être découvert",
  it: 'Cerca di indovinare la parola senza essere scoperto',
  de: 'Versuche das Wort zu erraten, ohne entdeckt zu werden',
};

/**
 * Animated card that reveals the player's role with a flip animation.
 * - Impostor: dark red card with neon red glow, "YOU ARE THE IMPOSTOR"
 * - Non-impostor: dark green card with neon green glow, shows the secret word
 * - null: waiting state
 * Uses cyberpunk neon theme with card flip animation.
 */
export function RoleReveal({
  role,
  word,
  animate = false,
}: RoleRevealProps) {
  const t = useT();
  const locale = useLocale();

  if (!role) {
    return (
      <div className="role-reveal--waiting">
        {t.discussion.waitingForRole}
      </div>
    );
  }

  const isImpostor = role === 'impostor';
  const cardClass = isImpostor ? 'role-reveal--impostor' : 'role-reveal--non-impostor';
  const labelClass = isImpostor ? 'role-reveal__label--impostor' : 'role-reveal__label--safe';

  return (
    <div
      className={`role-reveal ${cardClass}`}
      style={{
        animation: animate ? undefined : 'none',
        transform: animate ? undefined : 'none',
      }}
    >
      {/* Role label */}
      <div className={`role-reveal__label ${labelClass}`}>
        {isImpostor ? t.discussion.youAreImpostor : t.discussion.wordHint}
      </div>

      {/* Main content */}
      <div className="role-reveal__main">
        {isImpostor ? t.discussion.youAreImpostor.toUpperCase() : word}
      </div>

      {isImpostor && (
        <div className="role-reveal__sub">
          {ROLE_HINT[locale]}
        </div>
      )}
    </div>
  );
}
