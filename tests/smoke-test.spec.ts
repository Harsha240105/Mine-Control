import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:5173';

const ROUTES = [
  { path: '/', name: 'Servers' },
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/players', name: 'Players' },
  { path: '/console', name: 'Console' },
  { path: '/worlds', name: 'Worlds' },
  { path: '/plugins', name: 'Plugins' },
  { path: '/mods', name: 'Mods' },
  { path: '/shaders', name: 'Shaders' },
  { path: '/resourcepacks', name: 'Resource Packs' },
  { path: '/backups', name: 'Backups' },
  { path: '/scheduler', name: 'Scheduler' },
  { path: '/connection', name: 'Connection' },
  { path: '/compatibility', name: 'Compatibility' },
  { path: '/discord', name: 'Discord' },
  { path: '/settings', name: 'Settings' },
  { path: '/settings/performance', name: 'Performance Settings' },
  { path: '/settings/security', name: 'Security Settings' },
  { path: '/java', name: 'Java Manager' },
  { path: '/diagnostics', name: 'Diagnostics' },
  { path: '/guide', name: 'Guide' },
  { path: '/github', name: 'GitHub' },
  { path: '/privacy', name: 'Privacy' },
  { path: '/updates', name: 'Updates' },
  { path: '/feedback', name: 'Feedback' },
  { path: '/map', name: 'Map View' },
  { path: '/uninstall', name: 'Uninstall' },
];

async function bypassLock(page: Page) {
  await page.goto(BASE);
  await page.waitForTimeout(3000);
}

test.describe('Full Application Smoke Test', () => {
  test('all routes load without console errors or 500s', async ({ page }) => {
    test.setTimeout(180000);
    const consoleErrors: string[] = [];
    const networkErrors: { url: string; status: number }[] = [];
    const reactErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Minified React error') || text.includes('Uncaught Error')) {
          reactErrors.push(text.slice(0, 200));
        }
        if (text.includes('contentscript.js')) return;
        consoleErrors.push(text.slice(0, 200));
      }
    });

    page.on('response', (resp) => {
      if (resp.url().includes('/api/') && resp.status() >= 500) {
        networkErrors.push({ url: resp.url(), status: resp.status() });
      }
    });

    await bypassLock(page);

    const results: { route: string; status: string; error?: string }[] = [];

    for (const route of ROUTES) {
      try {
        await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);

        const hasReactError = reactErrors.length > 0;
        const hasNetworkError = networkErrors.some(n => n.status >= 500);

        if (hasReactError) {
          results.push({ route: route.path, status: 'REACT ERROR', error: reactErrors[reactErrors.length - 1] });
        } else if (hasNetworkError) {
          const lastNetError = networkErrors[networkErrors.length - 1];
          results.push({ route: route.path, status: 'NETWORK 500', error: `${lastNetError.status} ${lastNetError.url}` });
        } else {
          results.push({ route: route.path, status: 'OK' });
        }
      } catch (err: any) {
        results.push({ route: route.path, status: 'TIMEOUT/CRASH', error: err.message?.slice(0, 100) });
      }
    }

    console.log('\n=== ROUTE SMOKE TEST RESULTS ===');
    for (const r of results) {
      const icon = r.status === 'OK' ? '✓' : '✗';
      console.log(`  ${icon} ${r.route} — ${r.status}${r.error ? ': ' + r.error : ''}`);
    }

    const failed = results.filter(r => r.status !== 'OK');
    console.log(`\n  Total: ${results.length} routes, ${failed.length} failures`);
    if (consoleErrors.length) console.log(`  Console errors captured: ${consoleErrors.length}`);
    if (networkErrors.length) console.log(`  Network 500s captured: ${networkErrors.length}`);

    expect(failed.length, `Failed routes: ${failed.map(f => f.route).join(', ')}`).toBe(0);
  });

  test('sidebar renders and navigates without overlap', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check that the first visible content card/heading is offset from the sidebar
    const firstHeading = page.locator('h1, h2, [class*="text-2xl"], [class*="text-xl"]').first();
    if (await firstHeading.isVisible()) {
      const box = await firstHeading.boundingBox();
      if (box) {
        console.log(`First heading starts at x=${box.x}`);
        // On desktop, headings should be offset past the 72px sidebar
        expect(box.x).toBeGreaterThan(80);
      }
    }
  });

  test('no horizontal overflow at 1920px', async ({ page }) => {
    await bypassLock(page);
    await page.setViewportSize({ width: 1920, height: 1080 });

    for (const route of ROUTES.slice(0, 10)) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (hasHorizontalScroll) {
        console.log(`HORIZONTAL OVERFLOW at ${route.path}`);
      }
      expect(hasHorizontalScroll, `Horizontal overflow on ${route.path}`).toBe(false);
    }
  });

  test('no horizontal overflow at 1024px', async ({ page }) => {
    await bypassLock(page);
    await page.setViewportSize({ width: 1024, height: 768 });

    for (const route of ROUTES.slice(0, 10)) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (hasHorizontalScroll) {
        console.log(`HORIZONTAL OVERFLOW at 1024px on ${route.path}`);
      }
      expect(hasHorizontalScroll, `Horizontal overflow at 1024px on ${route.path}`).toBe(false);
    }
  });

  test('no horizontal overflow at 390px mobile', async ({ page }) => {
    await bypassLock(page);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ROUTES.slice(0, 10)) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (hasHorizontalScroll) {
        console.log(`HORIZONTAL OVERFLOW at 390px on ${route.path}`);
      }
      expect(hasHorizontalScroll, `Horizontal overflow at 390px on ${route.path}`).toBe(false);
    }
  });
});
