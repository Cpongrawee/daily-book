const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert/strict');
(async () => {
  const before = fs.existsSync(path.join(__dirname, '../data/book.json'))
    ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
    : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkin-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47921' },
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
    await page.goto('http://127.0.0.1:47921');
    await page.locator('[data-set="0"]').waitFor({ state: 'attached' });
    const panel = page.locator('.daily-checkin'),
      heading = panel.locator('summary'),
      exact = page.locator('#exact-mood');
    // The panel starts collapsed; open it whenever the page re-renders.
    const openPanel = async () => {
      await heading.waitFor();
      if ((await panel.getAttribute('open')) === null) await heading.click();
      await page.locator('[data-set="0"]').waitFor();
    };
    assert.equal(await panel.getAttribute('open'), null);
    assert.equal(await page.locator('[data-set="0"]').isVisible(), false);
    await panel.screenshot({ path: path.join(__dirname, 'checkin-collapsed.png') });
    await heading.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-set="0"]').isVisible(), true);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-set="0"]').isVisible(), false);
    await heading.click();
    assert.equal(await page.locator('[data-set="0"]').isVisible(), true);
    assert.equal(await page.locator('[data-set]').count(), 10);
    assert.equal(await exact.inputValue(), '');
    assert.equal(await page.locator('#mood-slider').getAttribute('aria-valuetext'), 'Not recorded');
    for (const sel of ['[data-set="0"]', '[data-set="9"]', '[data-checkin="fasting"]']) await page.locator(sel).check();
    await exact.fill('-3');
    await exact.press('Tab');
    await page.locator('[data-checkin="bedtime"]').fill('23:00');
    await page.locator('[data-checkin="wakeTime"]').fill('07:00');
    assert.equal(await page.locator('#sleep-hours').textContent(), '8 hr 0 min');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await openPanel();
    assert.equal(await page.locator('[data-set]:checked').count(), 2);
    assert.equal(await page.locator('[data-checkin]:checked').count(), 1);
    assert.equal(await exact.inputValue(), '-3.0');
    assert.equal(await page.locator('#mood-slider').inputValue(), '-3');
    await page.locator('[data-checkin="bedDay"]').selectOption('today');
    await page.locator('[data-checkin="bedtime"]').fill('01:00');
    assert.equal(await page.locator('#sleep-hours').textContent(), '6 hr 0 min');
    await page.locator('.daily-checkin').screenshot({ path: path.join(__dirname, 'checkin-mood-selected.png') });
    await page.locator('#clear-mood').click();
    assert.equal(await exact.inputValue(), '');
    assert.equal(await page.locator('#mood-slider').getAttribute('aria-valuetext'), 'Not recorded');
    await page.locator('.daily-checkin').screenshot({ path: path.join(__dirname, 'checkin-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.daily-checkin').screenshot({ path: path.join(__dirname, 'checkin-mobile.png') });
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.locator('#date').fill('2026-10-08');
    await page.locator('#date').dispatchEvent('change');
    await openPanel();
    assert.equal(await page.locator('[data-set]:checked').count(), 0);
    assert.equal(await exact.inputValue(), '');
    assert.equal(await page.locator('#sleep-hours').textContent(), 'Enter both times');
    assert.deepEqual(
      fs.existsSync(path.join(__dirname, '../data/book.json'))
        ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
        : null,
      before
    );
    console.log(
      'PASS: checkboxes, mood, sleep, reload persistence, separate days, mobile width; production data unchanged'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
