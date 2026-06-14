import type { PlayerRole } from '../stores/gameStore';

interface RoleRevealProps {
  role: PlayerRole;
  word: string | null;
  animate?: boolean;
}

/**
 * Animated card that reveals the player's role.
 * - Impostor: red card with "ERES EL IMPOSTOR"
 * - Non-impostor: green card with the secret word
 * - null: nothing shown (not yet assigned)
 */
export function RoleReveal({
  role,
  word,
  animate = false,
}: RoleRevealProps) {
  if (!role) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#9ca3af',
        }}
      >
        Esperando asignación de rol...
      </div>
    );
  }

  const isImpostor = role === 'impostor';

  const cardStyle: React.CSSProperties = {
    padding: '2.5rem 2rem',
    borderRadius: '1rem',
    textAlign: 'center',
    maxWidth: '400px',
    margin: '0 auto',
    background: isImpostor
      ? 'linear-gradient(135deg, #4a1a1a, #7f1d1d)'
      : 'linear-gradient(135deg, #1a4a1a, #1d7f1d)',
    border: isImpostor
      ? '2px solid #ef4444'
      : '2px solid #4ade80',
    boxShadow: isImpostor
      ? '0 0 30px rgba(239, 68, 68, 0.3)'
      : '0 0 30px rgba(74, 222, 128, 0.3)',
    transition: animate
      ? 'transform 0.5s ease, opacity 0.5s ease'
      : undefined,
    transform: animate ? 'scale(1)' : undefined,
  };

  return (
    <div style={cardStyle}>
      {/* Role label */}
      <div
        style={{
          fontSize: '0.85rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: isImpostor ? '#fca5a5' : '#86efac',
          marginBottom: '0.75rem',
        }}
      >
        {isImpostor ? 'Tu rol' : 'Tu palabra'}
      </div>

      {/* Main content */}
      <div
        style={{
          fontSize: '1.8rem',
          fontWeight: 800,
          color: '#fff',
          lineHeight: 1.3,
        }}
      >
        {isImpostor ? 'ERES EL IMPOSTOR' : word}
      </div>

      {isImpostor && (
        <div
          style={{
            marginTop: '1rem',
            fontSize: '0.85rem',
            color: '#fca5a5',
          }}
        >
          Intenta descubrir la palabra sin ser descubierto
        </div>
      )}
    </div>
  );
}
