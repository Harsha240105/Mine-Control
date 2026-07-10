import { test, expect } from '@playwright/test';

test('click save configuration', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
  await page.fill('input[placeholder="Enter username"]', 'owner');
  await page.fill('input[placeholder="Enter password"]', 'minecontrol');
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('http://localhost:5173/');

  await page.goto('http://localhost:5173/discord');
  // Find the Save Configuration button
  const saveBtn = page.locator('button:has-text("Save Configuration")');
  
  // Try to click it
  await saveBtn.click({ timeout: 5000 });
  console.log("Successfully clicked without hover");
});
