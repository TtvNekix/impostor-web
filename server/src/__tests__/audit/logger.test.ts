import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logEvent } from '../../audit/logger';

describe('audit/logger.logEvent', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts an embed to the Discord webhook URL with the event title and fields', () => {
    logEvent('room_created', { code: 'TEST01', host: 'alice' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('discord.com/api/webhooks/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.embeds[0].title).toBe('[impostor] room_created');
    expect(body.embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'code', value: 'TEST01' }),
        expect.objectContaining({ name: 'host', value: 'alice' }),
      ]),
    );
  });

  it('serializes object values as JSON', () => {
    logEvent('match_started', { wordAssignments: { id1: 'cat' } });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    const field = body.embeds[0].fields.find((f: { name: string }) => f.name === 'wordAssignments');
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
      '[audit] room_created',
      expect.stringContaining('JRNL'),
    );
  });
});
