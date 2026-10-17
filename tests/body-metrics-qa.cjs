// Weight & body fat chart on Body Tracking: clicking a day opens its daily page at the weight entry; a tap selects first.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..'),
    production = fs.existsSync(path.join(root, 'data/book.json'))
      ? fs.readFileSync(path.join(root, 'data/book.json'))
      : null,
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'body-metrics-'));
  const days = {};
  [60, 61, 62, 63, 64, 65, 66, 67, 68].forEach((weight, i) => {
    days['2026-10-0' + (i + 1)] = {
      schedule: [],
      priority: '',
      priorityDone: false,
      tasks: [],
      closed: false,
      proud: false,
      reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
      checkin: { weight, bodyFat: 20 + i }
    };
  });
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({ version: 1, revision: 0, identity: 'Test', days, goals: [], reviews: {} })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47861' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
      child.once('exit', c => reject(Error('server ' + c)));
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.clock.install({ time: new Date('2026-10-10T05:00:00Z') });
    const errors = [];
    let puts = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('request', r => r.method() === 'PUT' && puts++);
    await page.goto('http://127.0.0.1:47861');
    await page.locator('#priority').waitFor();
    const section = page.locator('#body-metrics');
    const openBody = async () => {
      await page.locator('[data-view="body"]').click();
      await section.locator('.mood-chart').waitFor();
    };
    const atWeight = async d => {
      assert.equal(await page.locator('#date').inputValue(), d);
      assert.equal(await page.locator('.daily-checkin').getAttribute('open'), '');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.checkin), 'weight');
      assert.ok(
        await page.locator('[data-checkin="weight"]').evaluate(el => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
        'weight field is scrolled into view'
      );
    };
    await openBody();
    assert.match(await section.locator('.mood-click-hint').innerText(), /weight entry/);

    // Touch: the first tap only selects the day; tapping it again opens it.
    const tap = d =>
      section
        .locator(`.mood-hit[data-chart-date="${d}"]`)
        .evaluate(el => el.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerType: 'touch' })));
    await section.locator('.mood-date-select').selectOption('2026-10-01');
    await tap('2026-10-04');
    assert.equal(await section.locator('.mood-date-select').inputValue(), '2026-10-04');
    assert.equal(await page.locator('.daily-checkin').count(), 0, 'first tap stays on the chart');
    await tap('2026-10-04');
    await page.locator('.daily-checkin').waitFor();
    await atWeight('2026-10-04');

    // Mouse: one click opens the day.
    await openBody();
    await section.locator('.mood-hit[data-chart-date="2026-10-07"]').click();
    await page.locator('.daily-checkin').waitFor();
    await atWeight('2026-10-07');

    // "Open daily page" does the same for the selected date.
    await openBody();
    await section.locator('.mood-date-select').selectOption('2026-10-02');
    await section.locator('.mood-open-day').click();
    await atWeight('2026-10-02');

    assert.deepEqual(errors, []);
    assert.equal(puts, 0);
    console.log('body metrics QA passed');
  } finally {
    if (browser) await browser.close();
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      production
    );
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
