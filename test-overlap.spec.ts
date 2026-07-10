import { test, expect } from '@playwright/test';

test('find overlapping element', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
  await page.fill('input[placeholder="Enter username"]', 'owner');
  await page.fill('input[placeholder="Enter password"]', 'minecontrol');
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('http://localhost:5173/');

  await page.goto('http://localhost:5173/discord');
  await page.waitForTimeout(1000);
  
  const saveBtn = page.locator('button:has-text("Save Configuration")').first();
  const box = await saveBtn.boundingBox();
  if (box) {
    console.log(`Button box: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
    
    // Evaluate what element is exactly at the center of the button
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const elementHit = await page.evaluate(({ cx, cy }) => {
      const el = document.elementFromPoint(cx, cy);
      return el ? el.outerHTML : 'null';
    }, { cx, cy });
    
    console.log("Element at button center:");
    console.log(elementHit);
  }
});
