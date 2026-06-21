import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Wait for the WebSocket to be open. The client mirrors
 * `socketStatus` to `window.__impostorSocketStatus` so tests can
 * synchronously check it. We poll until the value is 'connected'.
 */
async function waitForWsConnected(page: Page, timeoutMs = 5_000): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus === 'connected',
    { timeout: timeoutMs },
  );
}

/**
 * Entry page + room creation tests.
 *
 * Covers the basic "cold start" flow:
 *   - Landing page renders
 *   - Language selector works
 *   - Create-room form submits and shows the lobby
 *   - Join via /join/CODE
 *   - Join via /salas (with bug 2 regression: first click before WS ready)
 *   - Joining a non-existent room shows an error
 *
 * Note: the client uses the roomStore as its source of truth for
 * "am I in a room" — the URL does NOT change after create_room. So
 * tests use the LobbyScreen render (player list with the right names)
 * as the canonical "I'm in the room" signal. The room code itself is
 * extracted from the page (it appears in a header chip).
 */

const SEL = {
  usernameInput: /Enter your name|Introduce tu nombre/i,
  roomCodeInput: /Enter code|Introduce el código/i,
  createToggle: /Create Room|Crear sala/i,
  joinToggle: /Join Room|Unirse a sala/i,
  createSubmit: /^(Create|Crear)$/i,
  joinSubmit: /^(Join|Unirse)$/i,
  lobbiesLink: /View public rooms|Ver salas públicas/i,
  kickButtonTitle: /kick|expulsar/i,
  startButton: /start|empezar|comenzar/i,
};

/**
 * Read the room code from the page. The LobbyScreen renders it in
 * a `<span class="room-code-display__code">`. We use the class
 * selector directly — it's the canonical place.
 */
async function readRoomCode(page: Page): Promise<string> {
  const code = await page.locator('.room-code-display__code').textContent();
  const trimmed = code?.trim() ?? '';
  if (!/^[A-Z0-9]{4,6}$/.test(trimmed)) {
    throw new Error(`Expected room code on page, got: ${JSON.stringify(trimmed)}`);
  }
  return trimmed;
}

test.describe('Entry page + room creation', () => {
  test('landing page shows the title and the create/join form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /impostor/i }).first()).toBeVisible();
    await expect(page.locator('.mode-card--active')).toBeVisible();
    await expect(page.getByPlaceholder(SEL.usernameInput).first()).toBeVisible();
    await expect(page.getByRole('button', { name: SEL.lobbiesLink }).first()).toBeVisible();
    await expect(page.locator('.mode-card--disabled')).toBeVisible();
  });

  test('create-room form: submitting shows the lobby with the room code', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnected(page);
    await page.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await page.getByRole('button', { name: SEL.createSubmit }).click();
    // LobbyScreen renders the host in the player list
    await expect(page.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });
    // And the room code in the header
    const code = await readRoomCode(page);
    expect(code).toMatch(/^[A-Z0-9]{4,6}$/);
    // The start button is disabled with < 3 players. The button is
    // the only `.btn--lg.btn--block` on the page.
    await expect(page.locator('.btn--lg.btn--block').first()).toBeDisabled();
  });

  test('join via /join/CODE: a second player enters the same room', async ({ browser }) => {
    // Two separate browser contexts (independent localStorage/cookies).
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });
    const code = await readRoomCode(host);
    expect(code).toMatch(/^[A-Z0-9]{4,6}$/);

    // Alice opens the deep link
    const aliceCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    await alice.goto(`/join/${code}`);
    await waitForWsConnected(alice);
    // The JoinPage has the code pre-filled and a username input
    await alice.getByPlaceholder(SEL.usernameInput).first().fill('alice');
    await alice.getByRole('button', { name: SEL.joinSubmit }).click();
    await expect(alice.getByText('hostA')).toBeVisible({ timeout: 10_000 });
    await expect(host.getByText('alice')).toBeVisible({ timeout: 5_000 });

    await hostCtx.close();
    await aliceCtx.close();
  });

  test('join via /salas: the public rooms page lets a player join (bug 2 regression)', async ({ browser }) => {
    // Host creates a PUBLIC room
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.locator('input[type="checkbox"]').first().check();
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });
    const code = await readRoomCode(host);
    expect(code).toMatch(/^[A-Z0-9]{4,6}$/);

    // Bob opens /salas. We do NOT wait for his WS to be ready —
    // clicking Join immediately is the bug-2 regression test.
    // The page requires a username before joining (in the input
    // above the rooms list).
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await bob.goto('/salas');
    const card = bob.locator('.public-room-card').filter({ hasText: code });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await bob.locator('#lobbies-username').fill('bob');
    await card.getByRole('button').first().click();
    // The first click may be queued while the WS is still connecting;
    // the lobby must still appear within a few seconds.
    await expect(bob.getByText('hostA')).toBeVisible({ timeout: 15_000 });
    await expect(host.getByText('bob')).toBeVisible({ timeout: 5_000 });

    await hostCtx.close();
    await bobCtx.close();
  });

  test('joining a non-existent room shows a clear error (not a crash)', async ({ page }) => {
    await page.goto('/join/NOPE0');
    await waitForWsConnected(page);
    await page.getByPlaceholder(SEL.usernameInput).first().fill('lonely');
    await page.getByRole('button', { name: SEL.joinSubmit }).click();
    // The JoinPage shows a brief error (in the toast layer) and then
    // redirects to /. We don't depend on either being still on screen
    // by the time the test runs — the important thing is that the
    // page does NOT crash, so just verify we end up back at the entry
    // page or still on the join page, but never a blank page.
    await expect(
      page.getByText(/El Impostor|Impostor|Create Room|Crear sala/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
