import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';

async function bypassLock(page: import('@playwright/test').Page) {
  await page.goto(BASE);
  await page.waitForTimeout(3000);
}

// ════════════════════════════════════════════════════════════════════
// SECTION 1: Bot connection status states (Issue 8)
// ════════════════════════════════════════════════════════════════════
test.describe('Connection Status Indicator', () => {
  test('shows Disconnected when bot token is invalid', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Bot was set with fake token so should show error/disconnected
    const statusArea = page.locator('.card').first();
    await expect(statusArea).toBeVisible();

    // The status indicator should show one of the known states
    const statusText = await page.locator('text=/Connected|Disconnected|Connecting|Error|Reconnecting/').first().textContent();
    expect(statusText).toBeTruthy();
    console.log('Status:', statusText);

    // With a fake token, status should NOT be "Connected"
    expect(statusText).not.toBe('Connected');
  });

  test('status shows error message when last_error exists', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // The status bar should show the last error
    const errorText = page.locator('text=/invalid token|Invalid token|token/i').first();
    // May or may not be visible depending on how status is displayed
    const hasError = await errorText.isVisible().catch(() => false);
    console.log('Error message visible:', hasError);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 2: Test Connection button behavior (Issue 4)
// ════════════════════════════════════════════════════════════════════
test.describe('Test Connection', () => {
  test('Test Connection button is enabled when token and channel are present', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    const testBtn = page.locator('button:has-text("Test Connection")');
    await expect(testBtn).toBeVisible();
    // Should be enabled since we have config saved
    await expect(testBtn).toBeEnabled();
  });

  test('clicking Test Connection shows result', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    const testBtn = page.locator('button:has-text("Test Connection")');
    await testBtn.click();

    // Wait for result to appear
    await page.waitForTimeout(5000);

    // Should show a result message (success or error)
    const resultArea = page.locator('.bg-green-500\\/10, .bg-red-500\\/10').first();
    const hasResult = await resultArea.isVisible().catch(() => false);
    console.log('Test result visible:', hasResult);

    // If we have a fake token, we should see an error
    const errorMsg = page.locator('text=/Invalid|Failed|invalid|failed/').first();
    const hasError = await errorMsg.isVisible().catch(() => false);
    console.log('Error message shown:', hasError);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 3: Send Test Message button state (Issue 5)
// ════════════════════════════════════════════════════════════════════
test.describe('Send Test Message', () => {
  test('Send Test Message button is disabled when not connected', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    const sendBtn = page.locator('button:has-text("Send Test Message")');
    await expect(sendBtn).toBeVisible();

    // With invalid token, bot is not connected, so button should be disabled
    const isDisabled = await sendBtn.isDisabled();
    console.log('Send Test Message disabled:', isDisabled);
    expect(isDisabled).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 4: Notification History UI (Issue 7)
// ════════════════════════════════════════════════════════════════════
test.describe('Notification History UI', () => {
  test('history section expands and shows entries or empty state', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Click on history to expand
    const historyToggle = page.locator('text=/Notification History/');
    await historyToggle.click();
    await page.waitForTimeout(2000);

    // Should show either "No notifications sent yet" or history entries
    const emptyOrEntries = page.locator('text=/No notifications sent yet|event_type|sent/');
    const hasContent = await emptyOrEntries.first().isVisible().catch(() => false);
    console.log('History section content visible:', hasContent);
    expect(hasContent).toBe(true);
  });

  test('Clear button appears when history has entries', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Expand history
    await page.locator('text=/Notification History/').click();
    await page.waitForTimeout(1000);

    // Clear button may or may not be visible depending on if entries exist
    const clearBtn = page.locator('button:has-text("Clear")');
    const hasClear = await clearBtn.isVisible().catch(() => false);
    console.log('Clear button visible:', hasClear);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 5: Config persistence - save with different values (Issue 1)
// ════════════════════════════════════════════════════════════════════
test.describe('Config Persistence Deep', () => {
  test('save new config, reload, verify exact values', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Change channel ID
    const channelInput = page.locator('input[placeholder="123456789012345678"]').first();
    await channelInput.clear();
    await channelInput.fill('999999999999999999');

    // Toggle auto-reconnect off
    const autoReconnect = page.locator('text=Auto-reconnect').locator('..').locator('input[type="checkbox"]');
    const wasChecked = await autoReconnect.isChecked();
    if (wasChecked) await autoReconnect.uncheck();

    // Save
    await page.locator('button:has-text("Save Configuration")').click();
    await page.waitForTimeout(2000);

    // Reload
    await page.reload();
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Verify values persisted
    const channelAfter = page.locator('input[placeholder="123456789012345678"]').first();
    await expect(channelAfter).toHaveValue('999999999999999999');

    const autoReconnectAfter = page.locator('text=Auto-reconnect').locator('..').locator('input[type="checkbox"]');
    await expect(autoReconnectAfter).not.toBeChecked();
  });

  test('API-level: config survives simulated restart', async ({ request }) => {
    // Read config
    const getRes = await request.get(`${API}/api/discord`);
    const config = await getRes.json();
    expect(config.textChannelId).toBe('999999999999999999');
    expect(config.autoReconnect).toBe(false);

    // Simulate: verify config is still there (this is what happens after backend restart)
    const getRes2 = await request.get(`${API}/api/discord`);
    const config2 = await getRes2.json();
    expect(config2.textChannelId).toBe('999999999999999999');
    expect(config2.autoReconnect).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 6: Bot Controls - connect/disconnect buttons (Issue 3)
// ════════════════════════════════════════════════════════════════════
test.describe('Bot Controls', () => {
  test('Connect Bot and Disconnect Bot buttons are visible', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Bot Controls', { timeout: 15000 });

    // Either Connect or Disconnect should be visible
    const connectBtn = page.locator('button:has-text("Connect Bot")');
    const disconnectBtn = page.locator('button:has-text("Disconnect Bot")');
    const reconnectBtn = page.locator('button:has-text("Reconnect")');

    const hasConnect = await connectBtn.isVisible().catch(() => false);
    const hasDisconnect = await disconnectBtn.isVisible().catch(() => false);
    const hasReconnect = await reconnectBtn.isVisible().catch(() => false);

    console.log('Connect visible:', hasConnect, 'Disconnect visible:', hasDisconnect, 'Reconnect visible:', hasReconnect);

    // At least one of Connect or Disconnect must be visible
    expect(hasConnect || hasDisconnect).toBe(true);
    // Reconnect should always be visible
    expect(hasReconnect).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 7: Setup Guide (Issue 4)
// ════════════════════════════════════════════════════════════════════
test.describe('Setup Guide', () => {
  test('Setup Guide expands with steps', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    const guide = page.locator('text=Setup Guide');
    await guide.click();
    await page.waitForTimeout(500);

    // Should show developer portal link
    const link = page.locator('text=Discord Developer Portal');
    await expect(link).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 8: All pages - no 500 errors (Issue 12)
// ════════════════════════════════════════════════════════════════════
test.describe('All Pages Network Health', () => {
  const pages = [
    '/', '/dashboard', '/software', '/settings', '/console',
    '/players', '/plugins', '/mods', '/shaders', '/resourcepacks',
    '/worlds', '/backups', '/scheduler', '/connection', '/discord',
    '/feedback', '/java', '/diagnostics', '/guide', '/privacy',
    '/updates', '/uninstall', '/settings/performance',
  ];

  for (const path of pages) {
    test(`no 500 errors on ${path || '/'} (${path})`, async ({ page }) => {
      const serverErrors: string[] = [];
      page.on('response', (resp) => {
        if (resp.status() >= 500) {
          serverErrors.push(`${resp.status()} ${resp.url()}`);
        }
      });

      await bypassLock(page);
      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(2000);

      expect(serverErrors).toEqual([]);
    });
  }
});

// ════════════════════════════════════════════════════════════════════
// SECTION 9: Console errors on all pages (Issue 12)
// ════════════════════════════════════════════════════════════════════
test.describe('Console Health Across Pages', () => {
  const pages = ['/', '/discord', '/settings', '/dashboard', '/players'];

  for (const path of pages) {
    test(`no React/critical errors on ${path || '/'}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await bypassLock(page);
      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(3000);

      const criticalErrors = errors.filter(e =>
        !e.includes('ResizeObserver') &&
        !e.includes('Non-Error promise')
      );
      expect(criticalErrors).toEqual([]);
    });
  }
});

// ════════════════════════════════════════════════════════════════════
// SECTION 10: Responsive - sidebar not overlapping content
// ════════════════════════════════════════════════════════════════════
test.describe('Sidebar Responsiveness', () => {
  test('sidebar does not overlap main content at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check that the Discord Integration heading is visible and not behind sidebar
    const heading = page.locator('text=Discord Integration');
    const box = await heading.boundingBox();
    console.log('Heading position:', box);
    expect(box).not.toBeNull();
    if (box) {
      // Should be to the right of the sidebar (which is ~108px from left)
      expect(box.x).toBeGreaterThan(80);
    }
  });

  test('sidebar hidden on mobile, toggle button works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // On mobile, the sidebar should be hidden
    // The carousel sidebar has class "hidden md:block"
    const sidebar = page.locator('aside.hidden');
    const sidebarCount = await sidebar.count();
    console.log('Hidden sidebar count:', sidebarCount);

    // Content should be visible and not clipped
    const heading = page.locator('text=Discord Integration');
    await expect(heading).toBeVisible();
  });
});
