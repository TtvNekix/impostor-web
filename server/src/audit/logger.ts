/**
 * Server-side audit log. POSTs structured events to a private Discord
 * webhook so the maintainer can see the full state of the game from a
 * familiar surface. Failures (Discord down, rate limited, network
 * error) must not affect the running game.
 */

const WEBHOOK_URL = process.env.AUDIT_WEBHOOK_URL
  ?? 'https://discord.com/api/webhooks/1516416022872064100/nWmudVWKTa-jsp5K6gbUtlHXcNITDI2Im6iIVymHKB7GIZfl-bg8C2Y93Ft2psjJojXs';

export function logEvent(type: string, data: Record<string, unknown>): void {
  const payload = {
    content: null,
    embeds: [
      {
        title: `[impostor] ${type}`,
        color: 0x00d4ff,
        fields: Object.entries(data).map(([name, value]) => ({
          name,
          value: typeof value === 'string' ? value : JSON.stringify(value),
          inline: false,
        })),
        timestamp: new Date().toISOString(),
      },
    ],
  };
  // Always log to stdout for ops/journalctl visibility
  // eslint-disable-next-line no-console
  console.log(`[audit] ${type}`, JSON.stringify(data));
  // Fire-and-forget webhook POST
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[audit] webhook POST failed:', err.message);
  });
}
