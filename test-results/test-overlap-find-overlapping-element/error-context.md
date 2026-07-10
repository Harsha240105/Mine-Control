# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-overlap.spec.ts >> find overlapping element
- Location: test-overlap.spec.ts:3:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "http://localhost:5173/" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img [ref=e7]
    - heading "MineControlOS" [level=1] [ref=e10]
    - paragraph [ref=e11]: Minecraft Server Management
  - generic [ref=e12]:
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: Username
        - textbox "Enter username" [ref=e16]: owner
      - generic [ref=e17]:
        - generic [ref=e18]: Password
        - generic [ref=e19]:
          - textbox "Enter password" [ref=e20]: minecontrol
          - button [ref=e21] [cursor=pointer]:
            - img [ref=e22]
      - button "Sign In" [ref=e25] [cursor=pointer]
    - paragraph [ref=e27]: "Default login: owner / minecontrol"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('find overlapping element', async ({ page }) => {
  4  |   await page.goto('http://localhost:5173/login');
  5  |   await page.fill('input[placeholder="Enter username"]', 'owner');
  6  |   await page.fill('input[placeholder="Enter password"]', 'minecontrol');
  7  |   await page.click('button:has-text("Sign In")');
> 8  |   await page.waitForURL('http://localhost:5173/');
     |              ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  9  | 
  10 |   await page.goto('http://localhost:5173/discord');
  11 |   await page.waitForTimeout(1000);
  12 |   
  13 |   const saveBtn = page.locator('button:has-text("Save Configuration")').first();
  14 |   const box = await saveBtn.boundingBox();
  15 |   if (box) {
  16 |     console.log(`Button box: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
  17 |     
  18 |     // Evaluate what element is exactly at the center of the button
  19 |     const cx = box.x + box.width / 2;
  20 |     const cy = box.y + box.height / 2;
  21 |     const elementHit = await page.evaluate(({ cx, cy }) => {
  22 |       const el = document.elementFromPoint(cx, cy);
  23 |       return el ? el.outerHTML : 'null';
  24 |     }, { cx, cy });
  25 |     
  26 |     console.log("Element at button center:");
  27 |     console.log(elementHit);
  28 |   }
  29 | });
  30 | 
```