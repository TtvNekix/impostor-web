import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logEvent } from '../../audit/logger';

describe('audit/logger.logEvent', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const ORIGINAL_ENV = process.env.AUDIT_WEBHOOK_URL;

  beforeEach(() => {
    // Set a webhook URL so the discord branch runs. Individual tests
    // can clear it to exercise the no-webhook path.
    process.env.AUDIT_WEBHOOK_URL = 'https://discord.com/api/webhooks/test/token';
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIGINAL_ENV === undefined) {
      delete process.env.AUDIT_WEBHOOK_URL;
    } else {
      process.env.AUDIT_WEBHOOK_URL = ORIGINAL_ENV;
    }
  });

  it('posts an embed to the Discord webhook URL with the event title and fields', () => {
    logEvent('room_created', { code: 'TEST01', host: 'alice' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('discord.com/api/webhooks/test/token');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    // Title is now the Spanish label with an emoji prefix.
    expect(body.embeds[0].title).toBe('🟢 Sala creada');
    // Field names are the Spanish labels from the registry, with
    // camelCase keys mapped to "Camel Case" when not in the registry.
    expect(body.embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Código', value: 'TEST01' }),
        expect.objectContaining({ name: 'Host', value: 'alice' }),
      ]),
    );
  });

  it('serializes object values as JSON', () => {
    logEvent('match_started', { wordAssignments: { id1: 'cat' } });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const field = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Word Assignments');
    expect(field.value).toBe('{"id1":"cat"}');
  });

  it('does not throw when fetch fails', () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(() => logEvent('room_created', { code: 'X' })).not.toThrow();
  });

  it('does not throw when fetch returns a non-2xx', () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    expect(() => logEvent('room_created', { code: 'X' })).not.toThrow();
  });

  it('always logs to stdout for journalctl visibility', () => {
    logEvent('room_created', { code: 'JRNL' });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[audit]'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('JRNL'),
    );
  });

  it('does not call fetch when AUDIT_WEBHOOK_URL is not set', () => {
    delete process.env.AUDIT_WEBHOOK_URL;
    logEvent('room_created', { code: 'NOWEBHOOK' });
    expect(fetchMock).not.toHaveBeenCalled();
    // stdout log still happens
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('NOWEBHOOK'),
    );
  });

  it('formats boolean values as "Sí" / "No"', () => {
    logEvent('room_created', { code: 'B01', hardcore: true, visibility: 'public' });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const hardcore = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Modo hardcore');
    expect(hardcore.value).toBe('Sí');
  });

  it('formats array values joined by comma', () => {
    logEvent('match_started', { code: 'A01', impostorIds: ['id1', 'id2'] });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const impostors = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Impostores');
    expect(impostors.value).toBe('id1, id2');
  });

  it('uses the error color for server_error events', () => {
    logEvent('server_error', { context: 'uncaughtException', message: 'oops' });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.embeds[0].color).toBe(0xff3333);
  });

  it('falls back to a humanized label for unknown fields', () => {
    logEvent('room_created', { code: 'U01', someUnknownKey: 'value' });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const unknown = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Some Unknown Key');
    expect(unknown).toBeDefined();
    expect(unknown.value).toBe('value');
  });
});
