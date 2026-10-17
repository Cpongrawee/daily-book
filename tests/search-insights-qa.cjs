// Browser QA for 08 · Insights, 09 · Search and the bedtime reminder setting (disposable data, production book unchanged).
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-search-insights-'));
  const day = (n, extra = {}) => ({
    schedule: [],
    priority: 'Write chapter ' + n,
    priorityDone: n % 2 === 0,
    tasks: [],
    reflections: {
      compass: '',
      fix: n % 3 === 0 ? 'Phone <late> again & again' : '',
      discipline: '',
      tomorrow: '',
      worry: ''
    },
    closed: true,
    proud: n % 2 === 0,
    checkin:
      n % 2 === 0
        ? { bedtime: '22:30', wakeTime: '06:30', bedDay: 'previous', mood: 2, energy: 1 }
        : { bedtime: '01:30', wakeTime: '06:30', bedDay: 'today', mood: -1, energy: -1 },
    ...extra
  });
  const days = {};
  for (let n = 1; n <= 9; n++) days[`2026-10-0${n}`] = day(n);
  for (const n of [3, 5]) days[`2026-10-0${n}`].priorityMiss = { reason: 'big', note: n === 3 ? 'No outline yet' : '' };
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
      identity: 'Test',
      days,
      goals: [],
      reviews: { 'week:2026-10-04': 'Phone use review' }
    })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47873' },
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
    await page.clock.install({ time: new Date('2026-10-10T05:00:00Z') });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47873');
    await page.locator('#priority').waitFor();

    // Insights: sleep and bedtime cards highlight the clear mood difference.
    await page.locator('[data-view=insights]').click();
    assert.equal(await page.locator('.date-nav').isVisible(), false);
    assert.equal(await page.locator('.insights-card').count(), 6);
    assert.match(
      await page.locator('[data-insight=sleep] .subtle').textContent(),
      /4 “7 h or more” · 5 “Under 7 h” days/
    );
    assert.equal(await page.locator('[data-insight=sleep] tr.is-notable').count(), 5);
    // Most important task: done rate, most common reason, bars sized from script (CSP blocks inline styles).
    const misses = page.locator('.insights-priority');
    assert.match(await misses.textContent(), /Done on 4 of 9 days \(44%\) · 5 unfinished/);
    assert.match(await misses.locator('.miss-tip').textContent(), /Too big or unclear \(2 of 5 unfinished days\)/);
    assert.equal(
      await misses
        .locator('.miss-bar i')
        .first()
        .evaluate(i => i.style.width),
      '40%'
    );
    assert.match(await misses.locator('.miss-recent').textContent(), /2026-10-03.*No outline yet/);
    assert.match(
      await page.locator('.insights-highlights').textContent(),
      /Proud days: 100% on “7 h or more” days vs 0% on “Under 7 h” days \(4 vs 5 days\)/
    );
    assert.match(await page.locator('[data-insight=sleep] tbody tr').first().textContent(), /Mood.*\+2\.0.*−1\.0/);

    // Search: escaped snippets, highlighting, field filter, and opening the matching page or week.
    await page.locator('[data-view=search]').click();
    await page.locator('#book-search [name=q]').fill('phone again');
    await page.waitForFunction(() => document.querySelectorAll('.search-hit').length === 3);
    assert.match(await page.locator('.search-count').textContent(), /3 notes on 3 dates/);
    assert.equal(await page.locator('.search-hit mark').first().textContent(), 'Phone');
    assert.match(
      await page.locator('.search-snippet').first().innerHTML(),
      /&lt;late&gt; <mark>again<\/mark> &amp; <mark>again<\/mark>/
    );
    await page.locator('#book-search [name=q]').fill('phone');
    await page.waitForFunction(() => document.querySelectorAll('.search-hit').length === 4);
    await page.locator('#book-search [name=group]').selectOption('goals');
    assert.equal(await page.locator('.search-hit').count(), 1);
    await page.locator('.search-hit').click();
    assert.equal(await page.locator('#page-title').textContent(), 'Your weekly goals');
    await page.locator('[data-view=search]').click();
    assert.equal(await page.locator('#book-search [name=q]').inputValue(), 'phone', 'search is kept between visits');
    await page.locator('#book-search [name=group]').selectOption('fix');
    await page.locator('.search-hit').first().click();
    assert.equal(await page.locator('#date').inputValue(), '2026-10-09');

    // An unticked past day opens “what got in the way”; a reason and note save, and ticking the task hides it.
    const miss = page.locator('.priority-miss');
    assert.equal(await miss.evaluate(d => d.open), true);
    await miss.locator('[data-miss-reason=energy]').click();
    await page.locator('#priority-miss-note').fill('Slept 5 hours');
    const missSaved = () => JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).days['2026-10-09'].priorityMiss;
    for (let i = 0; i < 50 && missSaved()?.note !== 'Slept 5 hours'; i++) await page.waitForTimeout(100);
    assert.deepEqual(missSaved(), { reason: 'energy', note: 'Slept 5 hours' });
    assert.equal(await miss.locator('[data-miss-reason=energy]').getAttribute('aria-pressed'), 'true');
    await page.locator('#priority-done').check();
    assert.equal(await miss.isVisible(), false);
    await page.locator('#priority-done').uncheck();
    assert.equal(await miss.isVisible(), true);

    // Reminder setting saves through server validation; clearing it turns reminders off.
    const reminder = page.locator('#bedtime-reminder');
    assert.equal(await reminder.inputValue(), '22:30');
    await reminder.fill('23:15');
    const saved = () => JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).settings?.bedtimeReminder;
    for (let i = 0; i < 50 && saved() !== '23:15'; i++) await page.waitForTimeout(100);
    assert.equal(saved(), '23:15');

    for (const [label, width] of [
      ['mobile', 390],
      ['small-mobile', 320]
    ]) {
      await page.setViewportSize({ width, height: 800 });
      for (const v of ['insights', 'search']) {
        await page.locator(`[data-view=${v}]`).click();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${v} ${label} overflow`
        );
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      production
    );
    console.log(
      'PASS insights cards/highlights/top-task misses, what-got-in-the-way save, search snippets/filter/open/keep, reminder setting save, 390/320px, production unchanged'
    );
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      const exited = new Promise(r => child.once('exit', r));
      child.kill();
      await exited;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
