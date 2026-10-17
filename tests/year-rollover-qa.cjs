// Browser QA: the book keeps working after December 31, 2026 (disposable data, production book unchanged).
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollover-'));
  const day = (extra = {}) => ({
    schedule: [],
    priority: '',
    priorityDone: false,
    tasks: [],
    reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
    closed: true,
    proud: false,
    checkin: { sets: Array(5).fill(true) },
    ...extra
  });
  const days = {
    '2026-11-15': day({ proud: true }),
    '2026-12-30': day(),
    '2026-12-31': day({ closed: false, tasks: [{ id: 't1', text: 'Plan Q1', done: false, goalId: '' }] }),
    '2027-01-01': day({ proud: true }),
    '2027-01-02': day({ checkin: { sets: Array(5).fill(true), mood: 2, bedtime: '23:00', wakeTime: '07:00' } })
  };
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.clock.install({ time: new Date('2027-01-03T03:00:00Z') });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47851');
    await page.locator('#priority').waitFor();
    assert.equal(await page.locator('#date').inputValue(), '2027-01-03', 'daily page opens on the real date');
    // Carry forward across the year boundary.
    await page.locator('#date').fill('2026-12-31');
    await page.locator('#date').dispatchEvent('change');
    await page.locator('[data-action=carry-task]').click();
    assert.match(await page.locator('#tasks').textContent(), /Carried to 2027-01-01/);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    // Proud days follows the selected date's quarter and can move between quarters.
    await page.locator('#today').click();
    await page.locator('[data-view=proud]').click();
    assert.equal(await page.locator('.date-nav').isVisible(), true);
    assert.equal(await page.locator('#eyebrow').textContent(), 'NOTEBOOK 00 · Q1 2027');
    assert.match(await page.locator('.day-heading h2').textContent(), /January 1 – March 31, 2027/);
    assert.match(await page.locator('.day-heading .subtle').textContent(), /1 proud day marked · 90 days/);
    assert.equal(await page.locator('.heat-map tbody tr').count(), 14);
    await page.locator('#prev').click();
    assert.equal(await page.locator('#eyebrow').textContent(), 'NOTEBOOK 00 · Q4 2026');
    assert.match(await page.locator('.day-heading .subtle').textContent(), /1 proud day marked · 92 days/);
    await page.locator('#next').click();
    await page.locator('#next').click();
    assert.match(await page.locator('.day-heading h2').textContent(), /April 1 – June 30, 2027/);
    // Week view spanning the new year shows all seven days.
    await page.locator('#today').click();
    await page.locator('#date').fill('2026-12-31');
    await page.locator('#date').dispatchEvent('change');
    await page.locator('[data-view=week]').click();
    assert.equal(await page.locator('.day-link').count(), 7);
    // Behavior dashboard uses Q1 2027 presets and keeps streaks across December 31.
    await page.locator('[data-view=behavior]').click();
    const options = await page.locator('[name="period"] option').allTextContents();
    for (const o of ['January 2027', 'February 2027', 'March 2027', 'All Q1 2027']) assert.ok(options.includes(o), o);
    assert.equal(
      await page.locator('[data-metric="training"] td').nth(7).textContent(),
      '4 days',
      'current streak Dec 30 → Jan 2'
    );
    await page.locator('[name="period"]').selectOption('quarter');
    assert.match(await page.locator('.behavior-range').textContent(), /2027-01-01 → 2027-03-31/);
    // Mood & Sleep offers the current quarter.
    await page.locator('[data-view=mood]').click();
    assert.ok((await page.locator('[name="preset"] option').allTextContents()).includes('Entire Q1 2027'));
    await page.screenshot({ path: path.join(__dirname, 'year-rollover.png'), fullPage: false });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      production
    );
    console.log(
      'PASS today after new year, carry across Dec 31, proud quarters ←/→, 7-day week, behavior Q1 presets and streak, mood quarter, production unchanged'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
    await new Promise(r => setTimeout(r, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
