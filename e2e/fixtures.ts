import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Shared fixtures for the El Impostor E2E suite.
 *
 * The game needs multiple browser pages (each player is a separate
 * connection), so we provide:
 *   - `hostPage` — a single page already navigated to the entry page
 *   - `createRoom()` — opens N additional pages that all join the
 *     same room code (the host's room). Returns a callable that
 *     returns the new page as it joins.
 *
 * We use multiple `BrowserContext`s rather than multiple tabs of the
 * same context so that each player has independent localStorage and
 * cookies. The game itself doesn't care about cookies (auth is
 * socket-id based) but using contexts keeps the test surface clean.
 */

export const test = base.extend<{
  hostPage: Page;
  joinAs: (username: string) => Promise<Page>;
}>({
  hostPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    // Wait for the React app to render. The EntryPage is shown when
    // there's no room — the title element is the canonical signal.
    await expect(page.getByRole('heading', { name: /impostor/i }).first()).toBeVisible();
    await use(page);
    await ctx.close();
  },

  joinAs: async ({ browser, hostPage }, use) => {
    const contexts: BrowserContext[] = [];
    const usedCodes = new Set<string>();

    // Watch the host page for the room code to appear in the URL.
    // The host navigates to /CODE (5 uppercase letters) after creating.
    const codePromise = (async () => {
      await hostPage.waitForURL(/\/[A-Z0-9]{5}$/, { timeout: 15_000 });
      const url = new URL(hostPage.url());
      return url.pathname.replace(/^\//, '');
    })();

    const joinAs = async (username: string) => {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      const page = await ctx.newPage();
      const code = await codePromise;
      usedCodes.add(code);
      await page.goto(`/join/${code}`);
      // JoinPage renders a username input and a submit button.
      await page.getByPlaceholder(/username|nombre/i).first().fill(username);
      await page.getByRole('button', { name: /unirse|join/i }).first().click();
      // Wait until the LobbyScreen renders — it shows the room code.
      await expect(page.getByText(code)).toBeVisible({ timeout: 10_000 });
      return page;
    };

    await use(joinAs);
    for (const ctx of contexts) await ctx.close();
  },
});

export { expect };
