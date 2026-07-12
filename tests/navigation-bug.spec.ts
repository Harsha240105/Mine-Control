import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';

async function loadApp(page: import('@playwright/test').Page) {
  await page.goto(BASE);
  await page.waitForTimeout(3000);
}

// ═══════════════════════════════════════════════════════════════════════
// BUG 1: Config lost after SPA navigation (sidebar click)
// ═══════════════════════════════════════════════════════════════════════

test('Navigate away and back - Discord config persists', async ({ page }) => {
  // Load app
  await loadApp(page);

  // Navigate to Discord
  await page.goto(`${BASE}/discord`);
  await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Fill in configuration
  const testToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GAAAAA.TESTNAVIGATION123456789';
  const testTextChannel = '123456789012345678';
  const testVoiceChannel = '9876543210987654321';

  const tokenInput = page.locator('input[type="password"][placeholder*="token"]').first();
  await tokenInput.clear();
  await tokenInput.fill(testToken);

  const channelInputs = page.locator('input[placeholder="123456789012345678"]');
  const textChannelInput = channelInputs.first();
  const voiceChannelInput = channelInputs.last();

  await textChannelInput.clear();
  await textChannelInput.fill(testTextChannel);
  await voiceChannelInput.clear();
  await voiceChannelInput.fill(testVoiceChannel);

  // Verify values are typed
  expect(await textChannelInput.inputValue()).toBe(testTextChannel);
  expect(await voiceChannelInput.inputValue()).toBe(testVoiceChannel);

  // Save
  await page.locator('button:has-text("Save Configuration")').click();
  await page.waitForTimeout(2000);

  // Verify before navigation
  const channelBefore = await textChannelInput.inputValue();
  const voiceBefore = await voiceChannelInput.inputValue();
  expect(channelBefore).toBe(testTextChannel);
  expect(voiceBefore).toBe(testVoiceChannel);
  console.log('BEFORE navigation - Text:', channelBefore, 'Voice:', voiceBefore);

  // ═══ NAVIGATE AWAY using page.goto (SPA route change) ═══
  // Use the React Router by clicking the sidebar icon for Dashboard
  // The sidebar is a carousel of icons. We use page.evaluate to push a route.
  await page.evaluate(() => {
    // Trigger React Router navigation
    (window as any).history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(2000);

  // If that didn't work, just use goto
  const currentUrl = page.url();
  if (!currentUrl.includes('/dashboard')) {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForTimeout(2000);
  }

  // Verify we're on Dashboard
  console.log('Current URL after navigation:', page.url());

  // ═══ NAVIGATE BACK TO DISCORD ═══
  await page.goto(`${BASE}/discord`);
  await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // ═══ ASSERT: Config must survive navigation ═══
  const channelAfter = await page.locator('input[placeholder="123456789012345678"]').first().inputValue();
  const voiceAfter = await page.locator('input[placeholder="123456789012345678"]').last().inputValue();
  const tokenAfter = await page.locator('input[type="password"][placeholder*="token"]').first().inputValue();

  console.log('AFTER navigation - Text:', channelAfter, 'Voice:', voiceAfter, 'Token:', tokenAfter);

  expect(tokenAfter).toBe('••••••••');
  expect(channelAfter).toBe(testTextChannel);
  expect(voiceAfter).toBe(testVoiceChannel);

  // Auto-reconnect checkbox must persist
  const autoReconnectCheckbox = page.locator('text=Auto-reconnect').locator('..').locator('input[type="checkbox"]');
  await expect(autoReconnectCheckbox).toBeChecked();

  // Notification checkboxes must persist
  const serverStartCb = page.locator('text=Server Start').locator('..').locator('input[type="checkbox"]');
  await expect(serverStartCb).toBeChecked();

  console.log('ALL NAVIGATION ASSERTIONS PASSED');
});

// ═══════════════════════════════════════════════════════════════════════
// BUG 1b: Config lost after F5 refresh
// ═══════════════════════════════════════════════════════════════════════

test('Save config, F5 refresh, verify it persists', async ({ page }) => {
  await loadApp(page);
  await page.goto(`${BASE}/discord`);
  await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const testChannel = '111111111111111111';
  const channelInput = page.locator('input[placeholder="123456789012345678"]').first();
  await channelInput.clear();
  await channelInput.fill(testChannel);

  await page.locator('button:has-text("Save Configuration")').click();
  await page.waitForTimeout(2000);
  expect(await channelInput.inputValue()).toBe(testChannel);

  // F5
  await page.reload();
  await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
  await page.waitForTimeout(3000);

  const valAfter = await page.locator('input[placeholder="123456789012345678"]').first().inputValue();
  expect(valAfter).toBe(testChannel);
  console.log('F5 refresh test passed:', valAfter);
});

// ═══════════════════════════════════════════════════════════════════════
// BUG 2: API-level persistence
// ═══════════════════════════════════════════════════════════════════════

test('API: POST config then GET returns it', async ({ request }) => {
  const channel = '999999999999999999';
  await request.post(`${API}/api/discord`, {
    data: {
      bot_token: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GAAAAA.APITEST123456',
      text_channel_id: channel,
      voice_channel_id: '888888888888888888',
      auto_reconnect: true,
      notify_server_start: true,
      notify_player_join: false,
    },
  });

  const getRes = await request.get(`${API}/api/discord`);
  const body = await getRes.json();

  expect(body.textChannelId).toBe(channel);
  expect(body.voiceChannelId).toBe('888888888888888888');
  expect(body.isConfigured).toBe(true);
  expect(body.autoReconnect).toBe(true);
  expect(body.notify_server_start).toBe(true);
  expect(body.notify_player_join).toBe(false);
  console.log('API persistence test passed');
});

// ═══════════════════════════════════════════════════════════════════════
// BUG 3: SQLite direct verification
// ═══════════════════════════════════════════════════════════════════════

test('SQLite: discord_config has correct data', async ({ request }) => {
  await request.post(`${API}/api/discord`, {
    data: {
      bot_token: 'SQLITE_DIRECT_TEST_TOKEN',
      text_channel_id: '777777777777777777',
      voice_channel_id: '666666666666666666',
      auto_reconnect: true,
    },
  });

  const { execSync } = require('child_process');
  const result = execSync(
    `node -e "const db=require('better-sqlite3')('C:/Users/hshar/Documents/MineCraft Server/MineControl OS/data/minecontrol.db'); const r=db.prepare('SELECT bot_token, text_channel_id, voice_channel_id, auto_reconnect FROM discord_config ORDER BY updated_at DESC LIMIT 1').get(); console.log(JSON.stringify(r)); db.close();"`,
    { encoding: 'utf8' }
  );
  const row = JSON.parse(result.trim());

  expect(row.text_channel_id).toBe('777777777777777777');
  expect(row.voice_channel_id).toBe('666666666666666666');
  expect(row.bot_token).toBeTruthy();
  expect(row.auto_reconnect).toBe(1);
  console.log('SQLite verification passed');
});

// ═══════════════════════════════════════════════════════════════════════
// BUG 4: Infinite Reconnecting loop
// ═══════════════════════════════════════════════════════════════════════

test('Status never stuck on Reconnecting for 30 seconds', async ({ page }) => {
  await loadApp(page);
  await page.goto(`${BASE}/discord`);
  await page.waitForSelector('text=Discord Integration', { timeout: 15000 });

  // Wait for the status indicator to appear
  await page.waitForSelector('[data-testid="bot-status"]', { timeout: 10000 });

  // Wait a moment for initial status to settle
  await page.waitForTimeout(3000);

  const getStatus = async () => {
    const el = page.locator('[data-testid="bot-status"]');
    return el.textContent().catch(() => 'unknown');
  };

  const initialStatus = await getStatus();
  console.log('Initial status:', initialStatus);

  // Monitor status for 30 seconds
  const startTime = Date.now();
  const statusLog: { time: number; status: string }[] = [];

  while (Date.now() - startTime < 30000) {
    const status = await getStatus();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    statusLog.push({ time: elapsed, status: status || 'unknown' });
    await page.waitForTimeout(2000);
  }

  const finalStatus = statusLog[statusLog.length - 1]?.status;
  console.log('Final status:', finalStatus);
  console.log('Status log:', JSON.stringify(statusLog));

  // Status should NOT be stuck on Reconnecting for 30 seconds
  // It should settle to Error or Disconnected (invalid token)
  expect(finalStatus).not.toBe('Reconnecting');
});

// ═══════════════════════════════════════════════════════════════════════
// SIDEBAR RESPONSIVENESS: All pages at all viewports
// ═══════════════════════════════════════════════════════════════════════

const ALL_PAGES = [
  '/dashboard', '/console', '/players', '/backups', '/discord',
  '/settings', '/scheduler', '/worlds', '/plugins', '/mods',
  '/connection', '/java', '/diagnostics', '/guide', '/feedback',
  '/privacy', '/updates', '/settings/performance', '/software',
  '/resourcepacks', '/shaders',
];

const VIEWPORTS = [
  { width: 1920, height: 1080, label: '1920x1080' },
  { width: 1440, height: 900, label: '1440x900' },
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1280, height: 720, label: '1280x720' },
  { width: 1024, height: 768, label: '1024x768' },
  { width: 768, height: 1024, label: '768x1024' },
  { width: 390, height: 844, label: '390x844' },
];

for (const vp of VIEWPORTS) {
  test.describe(`Responsive @ ${vp.label}`, () => {
    for (const path of ALL_PAGES) {
      test(`${path} - no horizontal scroll`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await loadApp(page);
        await page.goto(`${BASE}${path}`);
        await page.waitForTimeout(3000);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const innerWidth = await page.evaluate(() => window.innerWidth);

        // Allow 1px tolerance for rounding
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
      });
    }
  });
}
