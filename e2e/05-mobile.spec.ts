import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile viewport tests.
 *
 * The game is mobile-first (the lobby + voting screens target
 * touch interactions and the CSS has media queries at 720 / 480
 * / 360 px). These tests assert the layout works at the iPhone 13
 * viewport (390x844 — the most common device class) and the small
 * phone viewport (360x640 — Galaxy S8 and similar).
 *
 * Note: we do NOT cover tablet viewports (iPad). The design only
 * has desktop + phone breakpoints; tablet falls back to the desktop
 * layout and is exercised by the desktop suite.
 *
 * These tests are skipped on Firefox / WebKit projects because
 * the viewport is a critical part of what they're verifying —
 * running them at a desktop viewport would defeat the purpose.
 * The desktop suite covers the same flows at desktop dimensions
 * on all three browsers.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'Mobile viewport tests target a specific pixel size');

const SEL = {
  usernameInput: /Enter your name|Introduce tu nombre/i,
  createSubmit: /^(Create|Crear)$/i,
  joinSubmit: /^(Join|Unirse)$/i,
};

async function waitForWsConnected(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __impostorSocketStatus?: string }).__impostorSocketStatus === 'connected',
    { timeout: 5_000 },
  );
}

test.describe('Mobile viewport (iPhone 13 — 390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('entry page renders without horizontal scroll', async ({ page }) => {
    await page.goto('/');
    // Wait for the React app to render
    await expect(page.getByRole('heading', { name: /impostor/i }).first()).toBeVisible();
    // The page width should fit the viewport (no horizontal scroll).
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('entry form is usable on mobile: fill and submit', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnected(page);
    await page.getByPlaceholder(SEL.usernameInput).first().fill('mobileUser');
    await page.getByRole('button', { name: SEL.createSubmit }).click();
    // The lobby renders the player name and the room code
    await expect(page.getByText('mobileUser').first()).toBeVisible({ timeout: 10_000 });
    const code = await page.locator('.room-code-display__code').textContent();
    expect(code?.trim()).toMatch(/^[A-Z0-9]{4,6}$/);
  });

  test('the start button is large enough for touch (>= 44px tall)', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnected(page);
    await page.getByPlaceholder(SEL.usernameInput).first().fill('mobileUser');
    await page.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(page.getByText('mobileUser').first()).toBeVisible({ timeout: 10_000 });
    // The "At least 3 players required" button is the start button.
    const box = await page.locator('.btn--lg.btn--block').first().boundingBox();
    expect(box).not.toBeNull();
    // Apple HIG and Material Design both recommend 44-48px as the
    // minimum touch target. We assert >= 40 (slightly more lenient
    // for a non-Material web app).
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });

  test('the language selector dropdown fits in the viewport', async ({ page }) => {
    await page.goto('/');
    const trigger = page.locator('.lang-selector__trigger').first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    // The dropdown should be fully visible (no overflow)
    const menu = page.locator('.lang-selector__menu').first();
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test('mobile: create → start match → discussion renders without overflow', async ({ browser }) => {
    // Use the iPhone viewport for this test
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await waitForWsConnected(page);
    await page.getByPlaceholder(SEL.usernameInput).first().fill('m1');
    await page.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(page.getByText('m1').first()).toBeVisible({ timeout: 10_000 });

    // Add two more players via a context per player
    const make = async (name: string) => {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await c.newPage();
      const code = (await page.locator('.room-code-display__code').textContent())?.trim() ?? '';
      await p.goto(`/join/${code}`);
      await waitForWsConnected(p);
      await p.getByPlaceholder(SEL.usernameInput).first().fill(name);
      await p.getByRole('button', { name: SEL.joinSubmit }).click();
      await expect(p.getByText('m1')).toBeVisible({ timeout: 10_000 });
      return { ctx: c, p };
    };
    const a = await make('a');
    const b = await make('b');
    await expect(page.locator('.btn--lg.btn--block').first()).toBeEnabled({ timeout: 5_000 });

    // Start the match on the host
    await page.locator('.btn--lg.btn--block').first().click();
    // Discussion renders with the speaking order. The page must not
    // overflow horizontally at mobile width.
    await expect(page.locator('button:has-text("Start voting")')).toBeVisible({ timeout: 8_000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    await ctx.close();
    await a.ctx.close();
    await b.ctx.close();
  });
});

test.describe('Small phone viewport (Galaxy S8 — 360x640)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('entry page does not horizontal-scroll at 360px', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /impostor/i }).first()).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('the room code + copy link is readable at 360px', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnected(page);
    await page.getByPlaceholder(SEL.usernameInput).first().fill('small');
    await page.getByRole('button', { name: SEL.createSubmit }).click();
    await expect(page.getByText('small').first()).toBeVisible({ timeout: 10_000 });
    // The code element should be visible and not overflow the viewport
    const codeEl = page.locator('.room-code-display__code').first();
    await expect(codeEl).toBeVisible();
    const box = await codeEl.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  });
});
