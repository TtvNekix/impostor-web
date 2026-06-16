import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorCode, ServerEvent } from '@impostor/shared';

import { RoomStore } from '../room/RoomStore';
import { RoomManager } from '../room/RoomManager';
import { WordBank } from '../words/WordBank';
import { GameEngine } from '../game/GameEngine';
import { ConnectionManager } from '../connection/ConnectionManager';
import { handleKick } from '../ws/handlers';

function setup() {
  const store = new RoomStore();
  const roomManager = new RoomManager(store);
  const bank = new WordBank({
    categories: [{ name: 'test', displayName: 'Test', words: ['word1'] }],
  });
  const connManager = new ConnectionManager(store, roomManager);
  // GameEngine is not used directly here but the connManager needs it.
  new GameEngine(connManager, store, roomManager, bank);
  return { store, roomManager, connManager };
}

describe('handleKick', () => {
  let roomManager: RoomManager;
  let connManager: ConnectionManager;

  beforeEach(() => {
    const s = setup();
    roomManager = s.roomManager;
    connManager = s.connManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('host can kick a non-host player; kicked player receives KICKED event with kicked_by_host code', () => {
    // Setup: host creates, target joins, mimic joins
    const { room } = roomManager.createRoom('KIK01', 'Host');
    roomManager.joinRoom('KIK01', 'Target', 'target-sid');
    roomManager.joinRoom('KIK01', 'Mimic', 'mimic-sid');
    room.players.get('Host')!.id = 'host-sid';
    room.players.get('Target')!.id = 'target-sid';
    room.players.get('Mimic')!.id = 'mimic-sid';

    const hostWs = { send: vi.fn(), readyState: 1 } as unknown as Parameters<typeof handleKick>[4];
    const targetWs = { send: vi.fn(), readyState: 1 } as unknown as { send: ReturnType<typeof vi.fn> };
    const mimicWs = { send: vi.fn(), readyState: 1 } as unknown as { send: ReturnType<typeof vi.fn> };
    connManager.register('host-sid', hostWs as never, 'KIK01', 'Host');
    connManager.register('target-sid', targetWs as never, 'KIK01', 'Target');
    connManager.register('mimic-sid', mimicWs as never, 'KIK01', 'Mimic');

    const broadcastSpy = vi.spyOn(connManager, 'broadcastToRoom');

    // Act
    handleKick('host-sid', { username: 'Target' }, roomManager, connManager, hostWs as never);

    // Assert: the kicked player got a KICKED event with the right code
    const targetSend = (targetWs.send as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((m) => m.event === ServerEvent.KICKED);
    expect(targetSend).toBeDefined();
    expect(targetSend.data).toMatchObject({ code: 'kicked_by_host' });

    // Assert: the room broadcast a PLAYER_LEFT to remaining members
    expect(broadcastSpy).toHaveBeenCalledWith(
      'KIK01',
      ServerEvent.PLAYER_LEFT,
      expect.objectContaining({ playerId: 'target-sid' }),
    );

    // Assert: the kicked player's connection entry is removed
    expect(connManager.getConnection('target-sid')).toBeUndefined();

    // Assert: the kicked player is removed from the room
    expect(room.players.has('Target')).toBe(false);
  });

  it('non-host trying to kick returns a NOT_HOST error and does not remove the target', () => {
    const { room } = roomManager.createRoom('KIK02', 'Host');
    roomManager.joinRoom('KIK02', 'Target', 'target-sid');
    roomManager.joinRoom('KIK02', 'Mimic', 'mimic-sid');
    room.players.get('Host')!.id = 'host-sid';
    room.players.get('Target')!.id = 'target-sid';
    room.players.get('Mimic')!.id = 'mimic-sid';

    const hostWs = { send: vi.fn(), readyState: 1 } as unknown as { send: ReturnType<typeof vi.fn> };
    const targetWs = { send: vi.fn(), readyState: 1 } as unknown as { send: ReturnType<typeof vi.fn> };
    const mimicWs = { send: vi.fn(), readyState: 1 } as unknown as Parameters<typeof handleKick>[4];
    connManager.register('host-sid', hostWs as never, 'KIK02', 'Host');
    connManager.register('target-sid', targetWs as never, 'KIK02', 'Target');
    connManager.register('mimic-sid', mimicWs as never, 'KIK02', 'Mimic');

    const broadcastSpy = vi.spyOn(connManager, 'broadcastToRoom');

    handleKick('mimic-sid', { username: 'Target' }, roomManager, connManager, mimicWs as never);

    // Assert: error was sent to the caller with NOT_HOST code
    const mimicSend = (mimicWs.send as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((m) => m.event === ServerEvent.ROOM_ERROR);
    expect(mimicSend).toBeDefined();
    expect(mimicSend.data).toMatchObject({ code: ErrorCode.NOT_HOST });

    // Assert: no KICKED sent to the target
    const targetSend = (targetWs.send as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((m) => m.event === ServerEvent.KICKED);
    expect(targetSend).toBeUndefined();

    // Assert: no PLAYER_LEFT broadcast
    expect(broadcastSpy).not.toHaveBeenCalledWith(
      'KIK02',
      ServerEvent.PLAYER_LEFT,
      expect.anything(),
    );

    // Assert: target is still in the room
    expect(room.players.has('Target')).toBe(true);
  });

  it('kicking a non-existent player returns an error and does not affect the room', () => {
    const { room } = roomManager.createRoom('KIK03', 'Host');
    room.players.get('Host')!.id = 'host-sid';

    const hostWs = { send: vi.fn(), readyState: 1 } as unknown as Parameters<typeof handleKick>[4];
    connManager.register('host-sid', hostWs as never, 'KIK03', 'Host');

    handleKick('host-sid', { username: 'Ghost' }, roomManager, connManager, hostWs as never);

    // Assert: error sent to caller
    const hostSend = (hostWs.send as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((m) => m.event === ServerEvent.ROOM_ERROR);
    expect(hostSend).toBeDefined();

    // Room still has the host
    expect(room.players.has('Host')).toBe(true);
  });

  it('host cannot kick themselves; gets a generic error', () => {
    const { room } = roomManager.createRoom('KIK04', 'Host');
    room.players.get('Host')!.id = 'host-sid';

    const hostWs = { send: vi.fn(), readyState: 1 } as unknown as Parameters<typeof handleKick>[4];
    connManager.register('host-sid', hostWs as never, 'KIK04', 'Host');

    handleKick('host-sid', { username: 'Host' }, roomManager, connManager, hostWs as never);

    // Assert: error sent
    const hostSend = (hostWs.send as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((m) => m.event === ServerEvent.ROOM_ERROR);
    expect(hostSend).toBeDefined();

    // Host still in the room
    expect(room.players.has('Host')).toBe(true);
  });
});
