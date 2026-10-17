const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert/strict'),
  { spawn } = require('child_process');
const { chromium } = require('playwright');
(async () => {
  const original = fs.existsSync(path.join(__dirname, '../data/book.json'))
    ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
    : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosize-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47849' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47849');
    await page.locator('textarea[data-reflection="fix"]').waitFor();
    assert.equal(await page.locator('#proud-note').count(), 0);
    assert.equal(await page.locator('#proud-today').count(), 1);
    const long = Array.from(
      { length: 14 },
      (_, i) => `${i + 1}. วันนี้ได้เรียนรู้และลงมือทำสิ่งดี ๆ ` + 'A'.repeat(120)
    ).join('\n');
    async function check() {
      await page.waitForTimeout(150);
      const fields = await page.locator('textarea:visible').evaluateAll(els =>
        els.map(el => ({
          id: el.id,
          scroll: el.scrollHeight,
          client: el.clientHeight,
          overflow: getComputedStyle(el).overflowY,
          resize: getComputedStyle(el).resize
        }))
      );
      assert.ok(fields.length);
      for (const f of fields) {
        assert.ok(f.scroll <= f.client + 1, JSON.stringify(f));
        assert.equal(f.overflow, 'hidden');
        assert.equal(f.resize, 'none');
      }
    }
    for (const field of await page.locator('#content textarea:visible').all()) await field.fill(long);
    await check();
    const large = await page.locator('textarea[data-reflection="fix"]').evaluate(el => el.clientHeight);
    await page.locator('textarea[data-reflection="fix"]').fill('Short note');
    await check();
    assert.ok((await page.locator('textarea[data-reflection="fix"]').evaluate(el => el.clientHeight)) < large);
    await page.locator('textarea[data-reflection="fix"]').fill(long);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await page.locator('textarea[data-reflection="fix"]').waitFor();
    assert.equal(await page.locator('textarea[data-reflection="fix"]').inputValue(), long);
    await check();
    await page.setViewportSize({ width: 390, height: 844 });
    await check();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page
      .locator('textarea[data-reflection="fix"]')
      .screenshot({ path: path.join(__dirname, 'textarea-auto-grow-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const view of ['week', 'month']) {
      await page.locator(`[data-view="${view}"]`).click();
      const field = page.locator('textarea[data-review]');
      await field.fill(long);
      await check();
      await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
      await page.reload();
      await page.locator('textarea[data-reflection="fix"]').waitFor();
      // Reload returns to Daily; reopen the saved review.
      await page.locator(`[data-view="${view}"]`).click();
      assert.equal(await page.locator('textarea[data-review]').inputValue(), long);
      await check();
    }
    await page.locator('[data-view="day"]').click();

    await page
      .locator('textarea[data-reflection="fix"]')
      .screenshot({ path: path.join(__dirname, 'textarea-auto-grow-desktop.png') });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(__dirname, '../data/book.json'))
        ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
        : null,
      original
    );
    console.log(
      'PASS: daily notes, shrink after deletion, saved notes on reload, weekly/monthly reviews, mobile wrapping; no browser errors; production book unchanged.'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
