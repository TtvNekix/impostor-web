import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * Game flow tests — host starts a match, players see words, vote, and
 * the round resolves. Covers the WORD_REVEAL → DISCUSSION → VOTING →
 * round_result path end-to-end. Each test uses its own browser
 * contexts so rooms don't collide.
 *
 * Strategy:
 *   - We use `discussionTime: 0` server-side so the discussion phase
 *     auto-advances and we don't have to wait 60+ seconds.
 *   - The host calls `start_voting` manually via the in-app button
 *     once the room is in DISCUSSION.
 *   - The "impostor" status is private per player. We use the
 *     `getGameStateFor` backdoor via a `page.evaluate` that talks to
 *     a debug API we add in dev mode... but we don't have one. So
 *     instead we set `impostorCount: 2` (with 4+ players) and just
 *     cast a vote and verify the round advances.
 */

const SEL = {
  usernameInput: /Enter your name|Introduce tu nombre/i,
  createSubmit: /^(Create|Crear)$/i,
  joinSubmit: /^(Join|Unirse)$/i,
  lobbiesLink: /View public rooms|Ver salas públicas/i,
  // "By Word" + a button to open the Create form. The host clicks
  // "Create Room" in the toggle group, then "Create" submit.
};

async function waitForWsConnected(page: Page, timeoutMs = 5_000): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus === 'connected',
    { timeout: timeoutMs },
  );
}

async function readRoomCode(page: Page): Promise<string> {
  const code = await page.locator('.room-code-display__code').textContent();
  const trimmed = code?.trim() ?? '';
  if (!/^[A-Z0-9]{4,6}$/.test(trimmed)) {
    throw new Error(`Expected room code on page, got: ${JSON.stringify(trimmed)}`);
  }
  return trimmed;
}

/**
 * Join a freshly created room as a 2nd/3rd/4th player. Returns the
 * new page (in its own context). Reads the host's URL to find the
 * code, then drives the deep-link join.
 */
async function joinAs(
  browser: Browser,
  host: Page,
  username: string,
): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const code = await readRoomCode(host);
  await page.goto(`/join/${code}`);
  await waitForWsConnected(page);
  await page.getByPlaceholder(SEL.usernameInput).first().fill(username);
  await page.getByRole('button', { name: SEL.joinSubmit }).click();
  // After my fix, App re-renders to LobbyScreen once roomCode is set,
  // so we can wait for the lobby to render (any player name visible).
  await expect(page.getByText('hostA')).toBeVisible({ timeout: 10_000 });
  return page;
}

test.describe('Game flow: lobby → start match → word reveal → voting', () => {
  test('start_match is disabled until 3 players have joined', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });

    // 1 player → disabled
    await expect(host.locator('.btn--lg.btn--block').first()).toBeDisabled();

    // Add alice
    const alice = await joinAs(browser, host, 'alice');
    // Now 2 players → still disabled
    await expect(host.locator('.btn--lg.btn--block').first()).toBeDisabled();

    // Add bob → 3 players → enabled
    const bob = await joinAs(browser, host, 'bob');
    await expect(host.locator('.btn--lg.btn--block').first()).toBeEnabled({ timeout: 5_000 });

    await hostCtx.close();
    await alice.context().close();
    await bob.context().close();
  });

  test('host clicks Start → all players enter DISCUSSION phase', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });

    const alice = await joinAs(browser, host, 'alice');
    const bob = await joinAs(browser, host, 'bob');
    await expect(host.locator('.btn--lg.btn--block').first()).toBeEnabled({ timeout: 5_000 });

    // Start the match
    await host.locator('.btn--lg.btn--block').first().click();

    // The server with discussionTime: 0 advances directly to
    // DISCUSSION. Each player sees the DiscussionScreen with their
    // word and the "Start voting" button (host only). We use a
    // text-based selector (not getByRole) because the button's
    // accessible name includes a leading icon char that varies.
    await expect(host.locator('button:has-text("Start voting")')).toBeVisible({ timeout: 8_000 });
    // Non-impostor players see "The word is: …"
    await expect(alice.getByText(/word is|word|palabra es|palabra/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(bob.getByText(/word is|word|palabra es|palabra/i).first()).toBeVisible({ timeout: 8_000 });

    await hostCtx.close();
    await alice.context().close();
    await bob.context().close();
  });

  test('after start_match the host sees the speaking order list (turnOrder feature)', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });

    const alice = await joinAs(browser, host, 'alice');
    const bob = await joinAs(browser, host, 'bob');
    await expect(host.locator('.btn--lg.btn--block').first()).toBeEnabled({ timeout: 5_000 });

    // Start match
    await host.locator('.btn--lg.btn--block').first().click();

    // The DiscussionScreen has a speaking-order list. We just verify
    // all three player names appear on the page (they're in the
    // player list AND in the order list).
    await expect(host.getByText('alice').first()).toBeVisible({ timeout: 5_000 });
    await expect(host.getByText('bob').first()).toBeVisible({ timeout: 5_000 });

    // The .speaking-order element is a <ol> rendered with the order.
    // We just check it has the right number of items by counting the
    // list elements under it.
    const orderCount = await host.locator('.speaking-order li').count();
    expect(orderCount).toBe(3);

    await hostCtx.close();
    await alice.context().close();
    await bob.context().close();
  });

  test('host triggers start_voting → all players enter VOTING phase', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });

    const alice = await joinAs(browser, host, 'alice');
    const bob = await joinAs(browser, host, 'bob');
    await expect(host.locator('.btn--lg.btn--block').first()).toBeEnabled({ timeout: 5_000 });

    await host.locator('.btn--lg.btn--block').first().click();
    await expect(host.locator('button:has-text("Start voting")')).toBeVisible({ timeout: 8_000 });

    // Click Start voting
    await host.locator('button:has-text("Start voting")').first().click();

    // All players should now see the VotingScreen — there's a
    // "Skip vote" button on every player's table.
    await expect(host.locator('button:has-text("Skip vote")').first()).toBeVisible({ timeout: 8_000 });
    await expect(alice.locator('button:has-text("Skip vote")').first()).toBeVisible({ timeout: 8_000 });
    await expect(bob.locator('button:has-text("Skip vote")').first()).toBeVisible({ timeout: 8_000 });

    await hostCtx.close();
    await alice.context().close();
    await bob.context().close();
  });

  test('a vote cast is reflected in the live vote count (VOTE_UPDATE)', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });

    const alice = await joinAs(browser, host, 'alice');
    const bob = await joinAs(browser, host, 'bob');
    await expect(host.locator('.btn--lg.btn--block').first()).toBeEnabled({ timeout: 5_000 });

    await host.locator('.btn--lg.btn--block').first().click();
    await expect(host.locator('button:has-text("Start voting")')).toBeVisible({ timeout: 8_000 });
    await host.locator('button:has-text("Start voting")').first().click();
    await expect(host.locator('button:has-text("Skip vote")').first()).toBeVisible({ timeout: 8_000 });

    // Alice votes to skip.
    await alice.locator('button:has-text("Skip vote")').first().click();
    // The host's view should show 1/3 voted.
    await expect(host.getByText(/1\s*\/\s*3\s+votaron|1\s*\/\s*3\s+voted/i).first()).toBeVisible({ timeout: 5_000 });

    await hostCtx.close();
    await alice.context().close();
    await bob.context().close();
  });

  test('host can force-end voting when 1 voter is missing (FORCE_END_VOTING feature)', async ({ browser }) => {
    // Use 4 players so the "1 missing" scenario is possible without
    // the server auto-tallying after everyone votes.
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await waitForWsConnected(host);
    await host.getByPlaceholder(SEL.usernameInput).first().fill('hostA');
    await host.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(host.getByText('hostA').first()).toBeVisible({ timeout: 10_000 });

    const alice = await joinAs(browser, host, 'alice');
    const bob = await joinAs(browser, host, 'bob');
    const carol = await joinAs(browser, host, 'carol');
    await expect(host.locator('.btn--lg.btn--block').first()).toBeEnabled({ timeout: 5_000 });

    await host.locator('.btn--lg.btn--block').first().click();
    await expect(host.locator('button:has-text("Start voting")')).toBeVisible({ timeout: 8_000 });
    await host.locator('button:has-text("Start voting")').first().click();
    await expect(host.locator('button:has-text("Skip vote")').first()).toBeVisible({ timeout: 8_000 });

    // Three of four vote. Carol AFKs (doesn't vote). The server
    // does NOT auto-tally because at least one active voter is
    // missing — the host's "Force end of voting" button shows up
    // after they vote, so the round can resolve.
    await alice.locator('button:has-text("Skip vote")').first().click();
    await bob.locator('button:has-text("Skip vote")').first().click();
    await host.locator('button:has-text("Skip vote")').first().click();

    // The force-end button shows up after the host has voted.
    const forceEnd = host.locator('button:has-text("Force end of voting")').first();
    await expect(forceEnd).toBeVisible({ timeout: 5_000 });
    await forceEnd.click();
    // Voting table is gone after force-end (round resolved).
    await expect(host.locator('button:has-text("Skip vote")')).toHaveCount(0, { timeout: 5_000 });

    await hostCtx.close();
    await alice.context().close();
    await bob.context().close();
    await carol.context().close();
  });
});
