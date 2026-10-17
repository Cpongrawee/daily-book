// Cycle section on Body Tracking: stats, month grids, sex and shabu dots and bars, day links, phone width; no writes.
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cycle-'));
  const days = {};
  const blank = () => ({
    schedule: [],
    priority: '',
    priorityDone: false,
    tasks: [],
    closed: false,
    proud: false,
    reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
    checkin: {}
  });
  const add = (date, c) => {
    days[date] ||= blank();
    Object.assign(days[date].checkin, c);
  };
  const shift = (date, n) => {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  for (const start of ['2026-08-01', '2026-08-29'])
    ['heavy', 'heavy', 'medium', 'light', 'spotting'].forEach((f, i) =>
      add(shift(start, i), { period: true, periodFlow: f })
    );
  add('2026-09-26', { period: true });
  for (const d of ['2026-08-06', '2026-08-16', '2026-08-26', '2026-09-05', '2026-09-15', '2026-09-25', '2026-10-05'])
    add(d, { sex: true });
  for (const d of ['2026-09-10', '2026-09-20', '2026-10-01', '2026-10-05']) add(d, { shabu: true });
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({ version: 1, revision: 0, identity: 'Test', days, goals: [], reviews: {} })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47851' },
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.clock.install({ time: new Date('2026-10-10T05:00:00Z') });
    const errors = [];
    let puts = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('request', r => r.method() === 'PUT' && puts++);
    await page.goto('http://127.0.0.1:47851');
    await page.locator('[data-view="body"]').click();
    const section = page.locator('#cycle-overview');
    await section.waitFor();
    const stats = await section.locator('.cycle-stats').first().innerText();
    // Starts Aug 1, Aug 29, Sep 26 → cycles 28 and 28 → average 28 → next Oct 24.
    assert.match(stats, /Sep 26, 2026\s+14 days ago/);
    assert.match(stats, /28 days\s+Start to start · 2 cycles/);
    assert.match(stats, /Oct 24, 2026/);
    assert.equal(await section.locator('.cycle-month').count(), 3);
    assert.equal(await section.locator('.cycle-day.flow-heavy').count(), 4);
    assert.equal(await section.locator('.cycle-day.flow-unknown').count(), 1);
    assert.equal(await section.locator('.cycle-day .cycle-sex-dot').count(), 7);
    assert.equal(await section.locator('.cycle-bars .cycle-bar').count(), 12);
    // Shabu buffet: orange dot in the other corner, so a day with both shows two separate dots.
    assert.equal(await section.locator('.cycle-day .cycle-shabu-dot').count(), 4);
    assert.equal(await section.locator('.cycle-bars .cycle-bar-shabu').count(), 12);
    const both = section.locator('[data-cycle-date="2026-10-05"]');
    assert.match(await both.getAttribute('aria-label'), /Had sex · Shabu buffet/);
    const sexBox = await both.locator('.cycle-sex-dot').boundingBox(),
      shabuBox = await both.locator('.cycle-shabu-dot').boundingBox();
    assert.ok(shabuBox.x + shabuBox.width < sexBox.x, 'shabu dot sits left of the sex dot');
    assert.notEqual(
      await both.locator('.cycle-shabu-dot').evaluate(i => getComputedStyle(i).backgroundColor),
      await both.locator('.cycle-sex-dot').evaluate(i => getComputedStyle(i).backgroundColor)
    );
    assert.match(await section.innerText(), /Shabu buffet[\s\S]*October 2026\s+2\s+days/);
    await section.screenshot({ path: path.join(__dirname, 'cycle-desktop.png') });
    await page.setViewportSize({ width: 375, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await section.screenshot({ path: path.join(__dirname, 'cycle-mobile.png') });
    await section.locator('[data-cycle-date="2026-09-10"]').click();
    await page.locator('#priority').waitFor();
    assert.match(await page.locator('.day-heading h2').first().innerText(), /September 10/i);
    assert.deepEqual(errors, []);
    assert.equal(puts, 0);
    console.log('cycle QA passed');
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
