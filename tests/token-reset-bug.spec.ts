import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';

async function bypassLock(page: import('@playwright/test').Page) {
  await page.goto(BASE);
  await page.waitForTimeout(3000);
}

test('TRACE: monitor all API calls and state during navigation', async ({ page }) => {
  const apiCalls: { url: string; status: number; body: any }[] = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/discord')) {
      try {
        const body = await resp.json();
        apiCalls.push({ url: resp.url(), status: resp.status(), body });
      } catch {}
    }
  });

  await bypassLock(page);
  await page.goto(`${BASE}/discord`);
  await page.waitForSelector('text=Discord Integration', { timeout: 15000 });
  await page.waitForTimeout(3000);

  console.log('=== INITIAL LOAD ===');
  console.log('API calls on load:', apiCalls.length);
  for (const c of apiCalls) {
    console.log(`  ${c.status} ${c.url} → botToken=${c.body.botToken}, textChannelId=${c.body.textChannelId}`);
  }
  apiCalls.length = 0;

  // Enter values
  const tokenInput = page.locator('input[type="password"]').first();
  const textChannelInput = page.locator('input[placeholder="123456789012345678"]').first();
  const voiceChannelInput = page.locator('input[placeholder="123456789012345678"]').last();

  await tokenInput.clear();
  await tokenInput.fill('MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GAAAAA.TRACE123');
  await textChannelInput.clear();
  await textChannelInput.fill('333333333333333333');
  await voiceChannelInput.clear();
  await voiceChannelInput.fill('444444444444444444');

  await page.locator('button:has-text("Save Configuration")').click();
  await page.waitForTimeout(4000);

  console.log('=== AFTER SAVE ===');
  console.log('API calls after save:', apiCalls.length);
  for (const c of apiCalls) {
    console.log(`  ${c.status} ${c.url} → botToken=${c.body.botToken}, textChannelId=${c.body.textChannelId}, voiceChannelId=${c.body.voiceChannelId}`);
  }
  apiCalls.length = 0;

  // Read field values
  console.log('Field values after save:', {
    token: await tokenInput.inputValue(),
    textCh: await textChannelInput.inputValue(),
    voiceCh: await voiceChannelInput.inputValue()
  });

  // Navigate away via popstate
  await page.evaluate(() => {
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(3000);

  // Navigate back via popstate
  await page.evaluate(() => {
    window.history.pushState({}, '', '/discord');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(5000);

  console.log('=== AFTER NAV BACK ===');
  console.log('API calls after nav:', apiCalls.length);
  for (const c of apiCalls) {
    console.log(`  ${c.status} ${c.url} → botToken=${c.body.botToken}, textChannelId=${c.body.textChannelId}, voiceChannelId=${c.body.voiceChannelId}`);
  }

  console.log('Field values after nav:', {
    token: await tokenInput.inputValue(),
    textCh: await textChannelInput.inputValue(),
    voiceCh: await voiceChannelInput.inputValue()
  });

  // Also check the raw API directly
  const directApi = await page.request.get(`${API}/api/discord`);
  const directCfg = await directApi.json();
  console.log('Direct API check:', JSON.stringify({
    botToken: directCfg.botToken,
    textChannelId: directCfg.textChannelId,
    voiceChannelId: directCfg.voiceChannelId,
    autoReconnect: directCfg.autoReconnect,
    isConfigured: directCfg.isConfigured
  }));

  // Check checkbox
  const autoReconnectCb = page.locator('text=Auto-reconnect').locator('..').locator('input[type="checkbox"]');
  console.log('autoReconnect checked:', await autoReconnectCb.isChecked());

  // Check if loading state is stuck
  const loadingVisible = await page.locator('.animate-spin').first().isVisible().catch(() => false);
  console.log('Loading spinner visible:', loadingVisible);

  expect(true).toBe(true); // just pass, this is a trace test
});
