const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { spawn } = require('node:child_process');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..'),
    before = fs.existsSync(path.join(root, 'data/book.json'))
      ? fs.readFileSync(path.join(root, 'data/book.json'))
      : null,
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-calendar-browser-')),
    base = 'http://127.0.0.1:47863';
  const fixture = {
    version: 1,
    revision: 0,
    identity: 'Test',
    goals: [],
    reviews: {},
    days: {
      '2026-10-09': {
        schedule: [{ id: 'existing', time: '08:00', end: '09:00', plan: 'Existing activity', done: true, changes: [] }],
        tasks: [],
        priority: 'Preserved priority',
        priorityDone: false,
        closed: false,
        reflections: { compass: 'Original private note', fix: '', discipline: '', tomorrow: '' }
      }
    }
  };
  fs.writeFileSync(path.join(data, 'book.json'), JSON.stringify(fixture));
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47863' },
    windowsHide: true
  });
  let browser;
  child.stderr.on('data', x => process.stderr.write(x));
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
      child.once('exit', c => reject(Error('Server exit ' + c)));
    });
    const get = async () => (await fetch(base + '/api/book')).json();
    let initial = await get();
    assert.equal(initial.book.calendar.events.existing.done, true);
    assert.equal(fs.readdirSync(path.join(data, 'backups')).length, 1);
    assert.equal((await fetch(base + '/api/google/status', { method: 'POST' })).status, 403);
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.locator('#priority').waitFor();
    await page.locator('[data-view=calendar]').click();
    await page.locator('.calendar-month').waitFor();
    await page.locator('#date').fill('2027-01-15');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('#date').inputValue(), '2027-01-15');
    await page.locator('#next').click();
    assert.equal(await page.locator('#date').inputValue(), '2027-02-01');
    await page.locator('#date').fill('2027-01-15');
    await page.locator('#date').dispatchEvent('change');
    await page.locator('.calendar-toolbar [data-cal-add]').first().click();
    const form = page.locator('#calendar-form');
    await form.locator('[name=title]').fill('Midnight research ภาษาไทย');
    await form.locator('[name=startTime]').fill('23:30');
    await form.locator('[name=endDate]').fill('2027-01-16');
    await form.locator('[name=endTime]').fill('00:30');
    await page.locator('#calendar-save').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    let current = await get();
    let midnight = Object.values(current.book.calendar.events).find(e => e.title.startsWith('Midnight'));
    assert.ok(midnight);
    assert.equal(midnight.end, '2027-01-16T00:30:00');
    await page.locator('.calendar-agenda [data-open-date]').click();
    await page.locator('.timeline-event').waitFor();
    assert.match(await page.locator('.timeline-event').textContent(), /23:30/);
    await page.locator('#date').fill('2027-01-16');
    await page.locator('#date').dispatchEvent('change');
    assert.match(await page.locator('.timeline-event').textContent(), /00:00/);
    await page.locator('[data-view=calendar]').click();
    await page.locator('.calendar-toolbar [data-cal-add]').first().click();
    await form.locator('[name=title]').fill('All day celebration');
    await form.locator('[name=allDay]').check();
    await page.locator('#calendar-save').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal(await page.locator('.calendar-agenda .all-day').count(), 1);
    await page.locator('.calendar-toolbar [data-cal-add]').first().click();
    await form.locator('[name=title]').fill('Weekly training');
    await form.locator('[name=repeat]').selectOption('WEEKLY');
    await form.locator('[name=until]').fill('2027-02-28');
    await page.locator('#calendar-save').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.locator('.calendar-agenda [data-cal-event]').filter({ hasText: 'Weekly training' }).click();
    await form.locator('[name=title]').fill('Training exception');
    await page.locator('#calendar-save').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    current = await get();
    let series = Object.values(current.book.calendar.events).find(e => e.title === 'Weekly training');
    assert.equal(series.exceptions['2027-01-15'].title, 'Training exception');
    await page.locator('#undo').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal(
      await page.locator('.calendar-agenda [data-cal-event]').filter({ hasText: 'Training exception' }).count(),
      0
    );
    await page.locator('[data-cal-mode=week]').click();
    assert.equal(await page.locator('.calendar-week-day').count(), 7);
    await page.screenshot({ path: path.join(__dirname, 'calendar-week-desktop.png') });
    await page.locator('[data-cal-mode=month]').click();
    await page.screenshot({ path: path.join(__dirname, 'calendar-month-desktop.png') });
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(__dirname, 'calendar-month-mobile.png'), fullPage: true });
    await page.reload();
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-09');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('#priority').inputValue(), 'Preserved priority');
    await page.locator('[data-event-id=existing] [data-action=plan]').fill('Edited in Daily');
    await page.locator('#priority').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal((await get()).book.calendar.events.existing.title, 'Edited in Daily');
    const stale = (await get()).book;
    await page.locator('#priority').fill('New priority');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    const conflict = await fetch(base + '/api/book', {
      method: 'PUT',
      headers: { Origin: base, 'X-Book-Token': initial.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(stale)
    });
    assert.equal(conflict.status, 409);
    const restoreBook = { ...fixture, revision: (await get()).book.revision };
    const restore = await fetch(base + '/api/book', {
      method: 'PUT',
      headers: {
        Origin: base,
        'X-Book-Token': initial.token,
        'X-Book-Restore': 'true',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(restoreBook)
    });
    assert.equal(restore.status, 200);
    const restored = (await get()).book;
    assert.equal(restored.calendar.events.existing.title, 'Existing activity');
    assert.equal(restored.calendar.events[midnight.id].deleted, true);
    assert.equal(restored.days['2026-10-09'].reflections.compass, 'Original private note');
    const status = await (
      await fetch(base + '/api/google/status', {
        method: 'POST',
        headers: { Origin: base, 'X-Book-Token': initial.token, 'Content-Type': 'application/json' },
        body: '{}'
      })
    ).json();
    assert.equal(status.paused, true);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: actual HTTP desktop/mobile, migration, future navigation, overnight, all-day, recurring exception, Undo, Daily edits, persistence, revision conflict, legacy restore and sync pause.'
    );
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      const exited = new Promise(r => child.once('exit', r));
      child.kill();
      await exited;
    }
    fs.rmSync(data, { recursive: true, force: true });
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      before
    );
    console.log('Production book unchanged.');
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
