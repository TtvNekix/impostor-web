/**
 * Server-side audit log. Posts structured events to a private Discord
 * webhook so the maintainer can see the full state of the game from a
 * familiar surface. Failures (Discord down, rate limited, network
 * error) must not affect the running game.
 *
 * Events are emitted in Spanish (matching the rest of the UI copy) and
 * enriched with a small server-context footer (PID, uptime, build
 * hash) so a single log line is enough to identify the deployment
 * that produced it.
 *
 * The webhook URL MUST be supplied via the AUDIT_WEBHOOK_URL
 * environment variable. There is intentionally no hardcoded fallback:
 * if the env var is missing, the logger is a no-op (events still go
 * to stdout via console.log, which journald captures on the server).
 *
 * The secret is read once at module load. Rotating the webhook
 * requires a service restart.
 */

const SERVER_START_TIME = Date.now();
const BUILD_HASH = process.env.BUILD_HASH ?? 'dev';

/**
 * Read the current webhook URL from the environment. Called per
 * `logEvent` (not at module load) so tests can flip the env var
 * without re-importing the module, and so a server-side `setenv`
 * followed by a process restart is the only required rotation step.
 */
function getWebhookUrl(): string {
  return process.env.AUDIT_WEBHOOK_URL ?? '';
}

/**
 * Per-event-type human-readable metadata. The label is the title shown
 * in Discord; the emoji gives a quick visual scan; fieldLabels maps
 * the raw field name in the data payload to a Spanish display label.
 * Adding a new event = one entry here + one logEvent() call site.
 */
interface EventDescriptor {
  label: string;
  emoji: string;
  fieldLabels: Record<string, string>;
}

const EVENT_REGISTRY: Record<string, EventDescriptor> = {
  room_created: {
    label: 'Sala creada',
    emoji: '🟢',
    fieldLabels: {
      code: 'Código',
      hostUsername: 'Anfitrión',
      maxPlayers: 'Máx. jugadores',
      category: 'Categoría',
      votingTimer: 'Temporizador de votación',
      hardcore: 'Modo hardcore',
      visibility: 'Visibilidad',
      hostLocale: 'Idioma del anfitrión',
    },
  },
  room_joined: {
    label: 'Jugador se unió',
    emoji: '➡️',
    fieldLabels: {
      code: 'Código',
      username: 'Usuario',
      isHost: '¿Es anfitrión?',
    },
  },
  room_left: {
    label: 'Jugador salió',
    emoji: '⬅️',
    fieldLabels: {
      code: 'Código',
      username: 'Usuario',
    },
  },
  room_destroyed: {
    label: 'Sala destruida',
    emoji: '🗑️',
    fieldLabels: {
      code: 'Código',
      reason: 'Razón',
    },
  },
  match_started: {
    label: 'Partida iniciada',
    emoji: '🎮',
    fieldLabels: {
      code: 'Código',
      roundNumber: 'Ronda',
      hardcore: 'Modo hardcore',
      votingTimer: 'Temporizador de votación',
      wordCategory: 'Categoría de palabras',
      playerCount: 'Cantidad',
      players: 'Jugadores',
      impostors: 'Impostores',
    },
  },
  vote_cast: {
    label: 'Voto emitido',
    emoji: '🗳️',
    fieldLabels: {
      code: 'Código',
      roundNumber: 'Ronda',
      voter: 'Votante',
      target: 'Objetivo',
    },
  },
  round_result: {
    label: 'Resultado de ronda',
    emoji: '📊',
    fieldLabels: {
      code: 'Código',
      roundNumber: 'Ronda',
      expelled: 'Expulsado',
      wasImpostor: '¿Era impostor?',
      aliveImpostors: 'Impostores vivos',
      aliveNonImpostors: 'No-impostores vivos',
    },
  },
  match_ended: {
    label: 'Partida terminada',
    emoji: '🏁',
    fieldLabels: {
      code: 'Código',
      winner: 'Ganador',
      totalRounds: 'Rondas totales',
    },
  },
  player_kicked: {
    label: 'Jugador expulsado por el anfitrión',
    emoji: '👢',
    fieldLabels: {
      code: 'Código',
      hostUsername: 'Anfitrión',
      targetUsername: 'Objetivo',
    },
  },
  server_error: {
    label: 'Error del servidor',
    emoji: '🔴',
    fieldLabels: {
      context: 'Contexto',
      message: 'Mensaje',
      stack: 'Pila de llamadas',
    },
  },
};

const COLOR_INFO = 0x00d4ff;
const COLOR_ERROR = 0xff3333;

function colorForType(type: string): number {
  if (type === 'server_error') return COLOR_ERROR;
  return COLOR_INFO;
}

/**
 * Resolve the Spanish label for a field name. Falls back to a
 * humanized version of the raw key (e.g. "userId" -> "User Id")
 * when the field is not in the registry, so the log is still
 * readable when the data dict gains a new key before the registry.
 */
function labelFor(type: string, fieldName: string): string {
  const desc = EVENT_REGISTRY[type];
  if (desc?.fieldLabels[fieldName]) return desc.fieldLabels[fieldName];
  // Fallback: convert camelCase to "Camel Case"
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '(vacío)';
    return value.map((v) => String(v)).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildFooter(): string {
  const uptimeSec = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  return `PID ${process.pid} · Build ${BUILD_HASH} · Activo ${hours}h ${minutes}m`;
}

function toDiscordEmbed(type: string, data: Record<string, unknown>) {
  const desc = EVENT_REGISTRY[type];
  const title = desc ? `${desc.emoji} ${desc.label}` : `📋 ${type}`;
  // Order fields: known ones first (in registry order), then any
  // unknown fields at the end so the output stays predictable.
  const knownFields: [string, unknown][] = [];
  const unknownFields: [string, unknown][] = [];
  const seen = new Set<string>();
  if (desc) {
    for (const key of Object.keys(desc.fieldLabels)) {
      if (key in data) {
        knownFields.push([key, data[key]]);
        seen.add(key);
      }
    }
  }
  for (const [k, v] of Object.entries(data)) {
    if (!seen.has(k)) unknownFields.push([k, v]);
  }
  const allFields = [...knownFields, ...unknownFields];
  return {
    title,
    color: colorForType(type),
    fields: allFields.map(([k, v]) => ({
      name: labelFor(type, k),
      value: formatValue(v),
      inline: false,
    })),
    footer: { text: buildFooter() },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Emit an audit event. Always writes to stdout (visible via journald
 * on the production server) so logs survive even if the Discord
 * webhook is missing or down. When AUDIT_WEBHOOK_URL is set, also
 * posts the event to Discord in a fire-and-forget manner.
 */
export function logEvent(type: string, data: Record<string, unknown>): void {
  const desc = EVENT_REGISTRY[type];
  const title = desc ? `${desc.emoji} ${desc.label}` : `📋 ${type}`;

  // 1. Always log to stdout. Format: [audit] <title> | key=value ...
  //    journald captures this and it's the source of truth on the
  //    server (the Discord channel is a notification surface, not a
  //    log store).
  const kv = Object.entries(data)
    .map(([k, v]) => `${labelFor(type, k)}=${formatValue(v)}`)
    .join(' · ');
  // eslint-disable-next-line no-console
  console.log(`[audit] ${title} | ${kv}`);

  // 2. If no webhook is configured, stop here. The console line is
  //    the only artifact.
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  // 3. Fire-and-forget POST to Discord. Errors are logged to stdout
  //    but never thrown -- the running game must not be affected by
  //    audit-log failures.
  const embed = toDiscordEmbed(type, data);
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: null, embeds: [embed] }),
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[audit] fallo al enviar a Discord (${type}):`,
      err instanceof Error ? err.message : String(err),
    );
  });
}
