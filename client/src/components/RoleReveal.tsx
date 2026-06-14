import type { PlayerRole } from '../stores/gameStore';

interface RoleRevealProps {
  role: PlayerRole;
  word: string | null;
  animate?: boolean;
}

/**
 * Animated card that reveals the player's role with a flip animation.
 * - Impostor: dark red card with neon red glow, "ERES EL IMPOSTOR"
 * - Non-impostor: dark green card with neon green glow, shows the secret word
 * - null: waiting state
 * Uses cyberpunk neon theme with card flip animation.
 */
export function RoleReveal({
  role,
  word,
  animate = false,
}: RoleRevealProps) {
  if (!role) {
    return (
      <div className="role-reveal--waiting">
        Esperando asignación de rol...
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
        {isImpostor ? 'Tu rol' : 'Tu palabra'}
      </div>

      {/* Main content */}
      <div className="role-reveal__main">
        {isImpostor ? 'ERES EL IMPOSTOR' : word}
      </div>

      {isImpostor && (
        <div className="role-reveal__sub">
          Intenta descubrir la palabra sin ser descubierto
        </div>
      )}
    </div>
  );
}
