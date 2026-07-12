import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';

// ── Helper: bypass lock screen ─────────────────────────────────────
async function bypassLock(page: import('@playwright/test').Page) {
  // If lock is enabled we need a token; for tests we just set localStorage
  // and let the app verify. If no lock, nothing happens.
  await page.goto(BASE);
  // Wait for app to load (LockGuard resolves)
  await page.waitForTimeout(3000);
}

// ════════════════════════════════════════════════════════════════════
// SECTION 1: Backend health
// ════════════════════════════════════════════════════════════════════
test.describe('Backend Health', () => {
  test('API server responds on /api/server/health', async ({ request }) => {
    const res = await request.get(`${API}/api/server/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });

  test('Discord API endpoints are reachable', async ({ request }) => {
    const res = await request.get(`${API}/api/discord/status`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('connected');
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 2: Discord config persistence
// ════════════════════════════════════════════════════════════════════
test.describe('Discord Configuration Persistence', () => {
  test('save and reload configuration via API', async ({ request }) => {
    const testToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GAAAAA.TESTTOKEN123456789abcdef';
    const testChannelId = '1234567890123456789';
    const testVoiceId = '9876543210987654321';

    // Save config
    const saveRes = await request.post(`${API}/api/discord`, {
      data: {
        bot_token: testToken,
        text_channel_id: testChannelId,
        voice_channel_id: testVoiceId,
        auto_reconnect: true,
        notify_server_start: true,
        notify_server_stop: true,
        notify_server_crash: true,
        notify_server_restart: true,
        notify_backup_created: true,
        notify_backup_restored: true,
        notify_backup_failed: true,
        notify_player_join: false,
        notify_player_left: false,
        notify_player_kicked: false,
        notify_player_banned: true,
        notify_player_unbanned: true,
        notify_player_approved: true,
        notify_whitelist_updated: true,
        notify_software_changed: true,
        notify_version_changed: true,
        notify_update_available: true,
      },
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveBody = await saveRes.json();
    expect(saveBody.success).toBe(true);

    // Reload config
    const getRes = await request.get(`${API}/api/discord`);
    expect(getRes.ok()).toBeTruthy();
    const config = await getRes.json();

    // Token should be masked
    expect(config.botToken).toBe('••••••••');
    // Channel IDs should be persisted
    expect(config.textChannelId).toBe(testChannelId);
    expect(config.voiceChannelId).toBe(testVoiceId);
    expect(config.autoReconnect).toBe(true);
    // Notification settings should persist
    expect(config.notify_server_start).toBe(true);
    expect(config.notify_player_join).toBe(false);
  });

  test('config survives page refresh via UI', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Check that the config fields have values (from prior API test)
    const channelInput = page.locator('input[placeholder="123456789012345678"]').first();
    await expect(channelInput).toHaveValue('1234567890123456789');

    // Refresh the page
    await page.reload();
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Config should still be loaded
    const channelAfter = page.locator('input[placeholder="123456789012345678"]').first();
    await expect(channelAfter).toHaveValue('1234567890123456789');
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 3: Discord status indicator
// ════════════════════════════════════════════════════════════════════
test.describe('Discord Status Indicator', () => {
  test('shows a status indicator on the Discord page', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Should show one of: Connected, Disconnected, Connecting, Error
    const statusText = page.locator('text=/Connected|Disconnected|Connecting|Error|Reconnecting/').first();
    await expect(statusText).toBeVisible({ timeout: 10000 });
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 4: Save via UI + verify network
// ════════════════════════════════════════════════════════════════════
test.describe('Discord Save via UI', () => {
  test('clicking Save Configuration sends POST to /api/discord', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Listen for the POST
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/discord') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    const saveBtn = page.locator('button:has-text("Save Configuration")');
    await saveBtn.click();

    const resp = await responsePromise;
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.success).toBe(true);

    // Should show success toast
    const toast = page.locator('text=/saved|Settings/i').first();
    await expect(toast).toBeVisible({ timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 5: Test Connection via API
// ════════════════════════════════════════════════════════════════════
test.describe('Test Connection', () => {
  test('POST /api/discord/test returns structured result', async ({ request }) => {
    // Use the saved config - the test endpoint reads from DB if masked
    const res = await request.post(`${API}/api/discord/test`, {
      data: { textChannelId: '1234567890123456789' },
    });
    // It should return 200 with success: false (since token is fake) or success: true
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('message');
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 6: Notification History
// ════════════════════════════════════════════════════════════════════
test.describe('Notification History', () => {
  test('GET /api/discord/history returns array', async ({ request }) => {
    const res = await request.get(`${API}/api/discord/history?limit=20`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('DELETE /api/discord/history clears history', async ({ request }) => {
    const delRes = await request.delete(`${API}/api/discord/history`);
    expect(delRes.ok()).toBeTruthy();
    const delBody = await delRes.json();
    expect(delBody.success).toBe(true);

    const getRes = await request.get(`${API}/api/discord/history?limit=100`);
    expect(getRes.ok()).toBeTruthy();
    const history = await getRes.json();
    expect(history.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 7: Send Test Message via API
// ════════════════════════════════════════════════════════════════════
test.describe('Send Test Message', () => {
  test('POST /api/discord/test-message returns success field', async ({ request }) => {
    const res = await request.post(`${API}/api/discord/test-message`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('success');
    // Will be false since bot is not connected, but the endpoint must respond properly
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 8: Discord UI elements exist
// ════════════════════════════════════════════════════════════════════
test.describe('Discord UI Elements', () => {
  test('all critical UI elements are present', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

    // Header
    await expect(page.locator('text=Discord Integration')).toBeVisible();

    // Bot Configuration section
    await expect(page.locator('text=Bot Configuration')).toBeVisible();

    // Bot Token input
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // Channel ID inputs
    await expect(page.locator('input[placeholder="123456789012345678"]').first()).toBeVisible();

    // Auto-reconnect checkbox
    await expect(page.locator('text=Auto-reconnect')).toBeVisible();

    // Save button
    await expect(page.locator('button:has-text("Save Configuration")')).toBeVisible();

    // Test Connection button
    await expect(page.locator('button:has-text("Test Connection")')).toBeVisible();

    // Send Test Message button
    await expect(page.locator('button:has-text("Send Test Message")')).toBeVisible();

    // Bot Controls section
    await expect(page.locator('text=Bot Controls')).toBeVisible();

    // Notification Events section
    await expect(page.locator('text=Notification Events')).toBeVisible();

    // Setup Guide
    await expect(page.locator('text=Setup Guide')).toBeVisible();

    // Notification History
    await expect(page.locator('text=Notification History')).toBeVisible();
  });

  test('notification checkboxes render for all 17 events', async ({ page }) => {
    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Notification Events', { timeout: 15000 });

    const expectedEvents = [
      'Server Start', 'Server Stop', 'Server Crash', 'Server Restart',
      'Backup Created', 'Backup Restored', 'Backup Failed',
      'Player Join', 'Player Leave', 'Player Kicked',
      'Player Banned', 'Player Unbanned', 'Player Approved',
      'Whitelist Updated', 'Software Changed', 'Version Changed', 'Update Available',
    ];

    for (const label of expectedEvents) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 9: Browser console - no errors
// ════════════════════════════════════════════════════════════════════
test.describe('Console Validation', () => {
  test('no React errors or unhandled rejections on Discord page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (
          text.includes('Unhandled Promise') ||
          text.includes('TypeError') ||
          text.includes('ReferenceError') ||
          text.includes('React') ||
          text.includes('CORS')
        ) {
          errors.push(text);
        }
      }
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
    await page.waitForTimeout(3000);

    expect(errors).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 10: Network validation
// ════════════════════════════════════════════════════════════════════
test.describe('Network Validation', () => {
  test('no 500 errors on Discord page load', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('response', (resp) => {
      if (resp.status() >= 500) {
        failedRequests.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await bypassLock(page);
    await page.goto(`${BASE}/discord`);
    await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
    await page.waitForTimeout(3000);

    expect(failedRequests).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════
// SECTION 11: Responsive layout - no horizontal scroll
// ════════════════════════════════════════════════════════════════════
test.describe('Responsive Layout', () => {
  const viewports = [
    { width: 1920, height: 1080, name: '1920x1080' },
    { width: 1440, height: 900, name: '1440x900' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 1024, height: 768, name: '1024x768' },
    { width: 768, height: 1024, name: '768x1024' },
    { width: 390, height: 844, name: '390x844' },
  ];

  for (const vp of viewports) {
    test(`no horizontal scroll on Discord page at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bypassLock(page);
      await page.goto(`${BASE}/discord`);
      await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
      await page.waitForTimeout(1000);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test('no horizontal scroll on Dashboard at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await bypassLock(page);
    await page.goto(`${BASE}/dashboard`);
    await page.waitForTimeout(3000);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('no horizontal scroll on Settings at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await bypassLock(page);
    await page.goto(`${BASE}/settings`);
    await page.waitForTimeout(3000);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
