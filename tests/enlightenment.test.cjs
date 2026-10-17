const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  base = 'http://127.0.0.1:47846';
test('always-lit decorative candles, legacy books, motion and print; production unchanged', async () => {
  const before = fs.existsSync(path.join(root, 'data/book.json'))
    ? fs.readFileSync(path.join(root, 'data/book.json'))
    : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enlightenment-'));
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
      identity: '',
      goals: [],
      reviews: {},
      days: {
        '2026-10-07': {
          schedule: [],
          priority: '',
          priorityDone: false,
          tasks: [],
          reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
          closed: false,
          proud: false,
          enlightenment: { priority: false, tasks: true }
        }
      }
    })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47846' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Startup timeout')), 10000);
      child.stdout.once('data', () => {
        clearTimeout(timer);
        resolve();
      });
      child.once('error', reject);
    });
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const selectDate = async date => {
      await page.locator('#date').fill(date);
      await page.locator('#date').dispatchEvent('change');
    };
    const checkLit = async () => {
      assert.equal(await page.locator('[data-candle]').count(), 6);
      assert.equal(
        await page.locator('button[data-candle], [data-action="toggle-candle"], [data-candle][aria-pressed]').count(),
        0
      );
      assert.equal(await page.locator('[data-candle][aria-hidden="true"]').count(), 6);
      assert.ok(
        await page.locator('.candle-flame').evaluateAll(els => els.every(el => getComputedStyle(el).opacity === '1'))
      );
    };
    await page.goto(base);
    await page.locator('#priority').waitFor();
    await selectDate('2026-10-07');
    await checkLit();
    const revision = JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).revision;
    const candle = page.locator('[data-candle="priority"]');
    const box = await candle.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).revision, revision);
    await page.locator('#priority').fill('A deliberate choice');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).days['2026-10-07'].enlightenment, {
      priority: false,
      tasks: true
    });
    await page.reload();
    await page.locator('#priority').waitFor();
    await checkLit();
    await selectDate('2026-10-08');
    await checkLit();
    await selectDate('2026-10-07');
    await page.locator('.reflection-page').screenshot({ path: path.join(__dirname, 'enlightenment-desktop.png') });
    await page
      .locator('.reflection-page > .section')
      .first()
      .screenshot({ path: path.join(__dirname, 'candle-detail.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await candle.locator('.candle-flame').evaluate(el => getComputedStyle(el).animationName), 'none');
    await checkLit();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(
      await candle.locator('.candle-flame').evaluate(el => getComputedStyle(el).animationName),
      'enlightenment-flicker'
    );
    await page.setViewportSize({ width: 320, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.reflection-page').screenshot({ path: path.join(__dirname, 'enlightenment-mobile.png') });
    await page.emulateMedia({ media: 'print' });
    await checkLit();
    assert.equal(await candle.locator('.candle-flame').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.kill();
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      before
    );
  }
});
