// Body & cycle check-in: sex, shabu buffet and period checkboxes, flow choices shown only with a period, saved across reloads.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert/strict');
(async () => {
  const before = fs.existsSync(path.join(__dirname, '../data/book.json'))
    ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
    : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cycle-checkin-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47843' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise(r => child.stdout.once('data', r));
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47843');
    await page.locator('.daily-checkin').waitFor();
    if ((await page.locator('.daily-checkin').getAttribute('open')) === null)
      await page.locator('.daily-checkin summary').click();
    const flows = page.locator('#flow-choices');
    assert.equal(await page.locator('.cycle-checkin h3').textContent(), 'Body & cycle');
    assert.equal(await flows.isVisible(), false);
    await page.locator('[data-checkin="sex"]').check();
    await page.locator('[data-checkin="shabu"]').check();
    await page.locator('[data-checkin="period"]').check();
    assert.equal(await flows.isVisible(), true);
    assert.equal(await flows.locator('input').count(), 4);
    await page.locator('[data-checkin="periodFlow"][value="medium"]').check();
    await page.locator('.cycle-checkin').screenshot({ path: path.join(__dirname, 'cycle-checkin.png') });
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await page.locator('.daily-checkin').waitFor();
    if ((await page.locator('.daily-checkin').getAttribute('open')) === null)
      await page.locator('.daily-checkin summary').click();
    assert.equal(await page.locator('[data-checkin="sex"]').isChecked(), true);
    assert.equal(await page.locator('[data-checkin="shabu"]').isChecked(), true);
    assert.equal(await page.locator('[data-checkin="period"]').isChecked(), true);
    assert.equal(await page.locator('[data-checkin="periodFlow"][value="medium"]').isChecked(), true);
    // Unticking the period hides and clears the flow.
    await page.locator('[data-checkin="period"]').uncheck();
    assert.equal(await flows.isVisible(), false);
    await page.locator('[data-checkin="period"]').check();
    assert.equal(await page.locator('[data-checkin="periodFlow"]:checked').count(), 0);
    await page.setViewportSize({ width: 320, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('cycle check-in QA passed');
  } finally {
    if (browser) await browser.close();
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(
      fs.existsSync(path.join(__dirname, '../data/book.json'))
        ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
        : null,
      before
    );
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
