const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const port = 47839;
const base = `http://127.0.0.1:${port}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-test-'));
let child;
after(async () => {
  await stop();
  fs.rmSync(data, { recursive: true, force: true });
});
async function start() {
  child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: String(port) },
    windowsHide: true
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server startup timed out')), 10000);
    child.stdout.once('data', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('error', reject);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code) reject(Error('Server exit ' + code));
    });
  });
}
async function stop() {
  // A killed child has signalCode set and exitCode null; waiting for 'exit' again would hang.
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    child.once('exit', resolve);
    child.kill();
  });
}
async function read() {
  return (await fetch(base + '/api/book')).json();
}
async function put(book, token) {
  return fetch(base + '/api/book', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Book-Token': token },
    body: JSON.stringify(book)
  });
}
test('durable storage, backup, conflict and malformed restore protection', async () => {
  try {
    await start();
    let { book, token } = await read();
    assert.equal(book.revision, 0);
    book.identity = 'Test identity';
    let response = await put(book, token);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 1);
    assert.equal((await put(book, token)).status, 409);
    book.revision = 1;
    const bad = { ...book, days: { '2026-10-07': { schedule: 'invalid' } } };
    assert.equal((await put(bad, token)).status, 400);
    assert.equal((await put(book, 'bad-token')).status, 403);
    assert.equal((await read()).book.identity, 'Test identity');
    const backups = fs.readdirSync(path.join(data, 'backups'));
    assert.equal(backups.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'backups', backups[0]))).revision, 0);
    await stop();
    await start();
    assert.equal((await read()).book.identity, 'Test identity');
  } finally {
    await stop();
  }
});
test('daily book browser workflow', async () => {
  let browser;
  try {
    await start();
    // Start from an empty Compass so the app shows its default sentence.
    const { book: saved, token: saveToken } = await read();
    saved.identity = '';
    assert.equal((await put(saved, saveToken)).status, 200);
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    await page.locator('[aria-label="Plan at 08:00"]').fill('Read chapter 2 notes');
    await page.locator('#priority').fill('Finish the proof');
    assert.equal(await page.locator('[data-action=change], #change-dialog').count(), 0);
    await page.locator('[data-compass-part=Healthy]').fill('Went for a walk. เดินเล่นหนึ่งชั่วโมง');
    await page.locator('[data-reflection=fix]').fill('Put the phone away before starting work.');
    await page.locator('#proud-today').check();
    await page.locator('#close-day').click();
    await page.locator('[data-view=month]').click();
    await page.locator('#add-goal [name=title]').fill('Complete coursework module');
    await page.locator('#add-goal button').click();
    await page.locator('[data-view=week]').click();
    await page.locator('#add-goal [name=title]').fill('Finish required readings');
    await page.locator('#add-goal select').selectOption({ label: 'Complete coursework module' });
    await page.locator('#add-goal button').click();
    await page.locator('[data-view=day]').click();
    await page.locator('#add-task [name=text]').fill('Read chapter 1');
    await page.locator('#add-task select').selectOption({ label: 'Week · Finish required readings' });
    await page.locator('#add-task button').click();
    await page.locator('[data-action=task-done]').check();
    await page.locator('#priority-done').check();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#summary').click();
    const download = await downloadPromise;
    const summaryPath = path.join(data, 'summary.md');
    await download.saveAs(summaryPath);
    const summary = fs.readFileSync(summaryPath, 'utf8');
    assert.match(summary, /Activity: Read chapter 2 notes/);
    assert.match(summary, /Am I proud of myself today\? Yes/);
    assert.doesNotMatch(summary, /BLUE|RED|Noise|priority changes/);
    assert.match(summary, /เดินเล่น/);
    await page.reload();
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('#priority').inputValue(), 'Finish the proof');
    assert.equal(await page.locator('#proud-today').isChecked(), true);
    assert.equal(await page.locator('.change').count(), 0);
    assert.match(await page.locator('[data-compass-part=Healthy]').inputValue(), /เดินเล่น/);
    assert.equal(await page.locator('[data-action=task-done]').isChecked(), true);
    await page.screenshot({ path: path.join(root, 'tests', 'daily-desktop.png'), fullPage: true });
    await page.locator('[data-view=week]').click();
    assert.match(await page.locator('.goal-meta').textContent(), /1\/1 linked daily tasks complete/);
    await page.screenshot({ path: path.join(root, 'tests', 'weekly-desktop.png'), fullPage: true });
    await page.locator('[data-view=month]').click();
    await page.screenshot({ path: path.join(root, 'tests', 'monthly-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-view=day]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(root, 'tests', 'daily-mobile.png'), fullPage: true });
    page.once('dialog', d => d.dismiss());
    await page.locator('[data-action=activity-menu]').click();
    await page.locator('[data-activity-menu=delete]').click();
    assert.equal(await page.locator('[data-action=plan]').count(), 1);
    page.once('dialog', d => d.accept());
    await page.locator('[data-action=activity-menu]').click();
    await page.locator('[data-activity-menu=delete]').click();
    assert.equal(await page.locator('.change').count(), 0);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('.change').count(), 0);
    assert.equal(await page.locator('[aria-label="Plan at 08:00"]').count(), 1);
    assert.equal(await page.locator('#priority').inputValue(), 'Finish the proof');
    assert.equal(await page.locator('#identity').evaluate(el => el.tagName), 'P');
    assert.match(
      await page.locator('#identity').textContent(),
      /^I am healthy, focused, kind, disciplined and at peace\.$/
    );
    // The Compass is editable, saved in the book, and can go back to the default.
    await page.locator('#edit-compass').click();
    await page.locator('#compass-edit-form textarea').fill('I am calm, disciplined and kind.');
    await page.locator('#compass-edit-form button.primary').click();
    assert.equal(await page.locator('#identity').textContent(), 'I am calm, disciplined and kind.');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal((await read()).book.identity, 'I am calm, disciplined and kind.');
    await page.reload();
    await page.locator('#identity').waitFor();
    assert.equal(await page.locator('#identity').textContent(), 'I am calm, disciplined and kind.');
    await page.locator('#edit-compass').click();
    await page.locator('#compass-edit-cancel').click();
    assert.equal(await page.locator('#identity').textContent(), 'I am calm, disciplined and kind.');
    await page.locator('#edit-compass').click();
    await page.locator('#compass-edit-reset').click();
    await page.locator('#compass-edit-form button.primary').click();
    assert.match(await page.locator('#identity').textContent(), /^I am healthy, focused/);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal((await read()).book.identity, '');
    // Date controls at the bottom of the daily page move days and return to the top.
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    await page.locator('.day-nav-bottom [data-day-nav="1"]').scrollIntoViewIfNeeded();
    await page.locator('.day-nav-bottom [data-day-nav="1"]').click();
    assert.equal(await page.locator('#date').inputValue(), '2026-10-08');
    assert.equal(await page.locator('#date-bottom').inputValue(), '2026-10-08');
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.locator('.day-nav-bottom [data-day-nav="-1"]').click();
    assert.equal(await page.locator('#date').inputValue(), '2026-10-07');
    await page.locator('#date-bottom').fill('2026-10-01');
    await page.locator('#date-bottom').dispatchEvent('change');
    assert.equal(await page.locator('#date').inputValue(), '2026-10-01');
    await page.locator('.day-nav-bottom [data-day-nav="today"]').click();
    assert.equal(
      await page.locator('#date').inputValue(),
      await page.evaluate(() => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10))
    );
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('.reflection-card').count(), 4);
    assert.equal(await page.locator('[data-compass-part]').count(), 5);
    assert.equal(await page.locator('.timeline-row').count(), 36);
    assert.equal(await page.locator('.hour').first().textContent(), '06:00');
    assert.equal(await page.locator('.hour').last().textContent(), '23:30');
    await page.locator('[data-view=proud]').click();
    assert.equal(await page.locator('.heat-map tbody tr').count(), 14);
    assert.equal(await page.locator('.heat-day').count(), 92);
    assert.equal(await page.locator('.heat-day.is-proud').count(), 1);
    assert.equal(
      await page
        .locator('.heat-map tbody tr')
        .first()
        .locator('td')
        .nth(4)
        .locator('button')
        .getAttribute('data-open-date'),
      '2026-10-01'
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: path.join(root, 'tests', 'proud-heatmap.png'), fullPage: true });
    await page.locator('[data-open-date="2026-10-07"]').click();
    assert.equal(await page.locator('#proud-today').isChecked(), true);
    await page.locator('#date').fill('2026-09-30');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('#date').inputValue(), '2026-09-30');
    assert.equal(await page.locator('#prev').isDisabled(), false);
    await page.locator('[data-view=week]').click();
    assert.equal(await page.locator('.day-link').count(), 7);
    await page.locator('#date').fill('2027-01-01');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('#date').inputValue(), '2027-01-01');
    assert.equal(await page.locator('.day-link').count(), 7);
    assert.equal(await page.locator('#next').isDisabled(), false);
    await page.locator('[data-view=day]').click();
    assert.equal(await page.locator('#proud-today').isChecked(), false);
    await page.locator('#date').fill('2026-10-08');
    await page.locator('#date').dispatchEvent('change');
    await page.locator('#proud-today').check();
    await page.locator('[aria-label="Plan at 07:00"]').fill('Morning walk');
    await page.locator('#priority').fill('Write notes');
    await page.locator('#add-task [name=text]').fill('Read ten pages');
    await page.locator('#add-task button').click();
    await page.locator('[data-action=carry-task]').click();
    assert.match(await page.locator('#tasks').textContent(), /Carried to 2026-10-09/);
    await page.locator('#next').click();
    assert.match(await page.locator('#tasks').textContent(), /Read ten pages/);
    assert.equal(await page.locator('[data-action=task-done]').isChecked(), false);
    await page.locator('#prev').click();
    await page.locator('.routine-panel summary').click();
    page.once('dialog', d => d.accept('Morning routine'));
    await page.locator('[data-routine=save]').click();
    await page.locator('#next').click();
    await page.locator('.routine-panel summary').click();
    await page.locator('#routine-select').selectOption({ label: 'Morning routine' });
    await page.locator('[data-routine=apply]').click();
    assert.equal(await page.locator('[aria-label="Activity at 07:00"]').inputValue(), 'Morning walk');
    assert.equal(await page.locator('.task').count(), 1);
    await page.locator('#undo').click();
    assert.equal(await page.locator('[aria-label="Plan at 07:00"]').count(), 1);
    assert.equal(await page.locator('.task').count(), 1);
    await page.locator('[data-view=week]').click();
    assert.match(await page.locator('.weekly-dashboard').textContent(), /Proud checkbox marked/);
    assert.equal(await page.locator('.review-streaks tbody tr').count(), 6);
    const weekDownload = page.waitForEvent('download');
    await page.locator('#period-summary').click();
    const weekFile = await weekDownload;
    assert.equal(weekFile.suggestedFilename(), 'Daily-Book-week-2026-10-04.md');
    const weekPath = path.join(data, 'week.md');
    await weekFile.saveAs(weekPath);
    const weekMd = fs.readFileSync(weekPath, 'utf8');
    assert.match(weekMd, /^# Weekly review — Oct 4 – Oct 10, 2026/);
    assert.match(weekMd, /- Proud days: 2 of 7/);
    assert.match(weekMd, /## Moments of pride\n- Wed, Oct 7 — /);
    await page.locator('[data-view=month]').click();
    assert.match(await page.locator('.period-dashboard h2').textContent(), /Your month, reflected/);
    assert.match(await page.locator('#period-summary').textContent(), /Monthly summary/);
    await page.locator('[data-view=week]').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-08');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('#proud-today').isChecked(), true);
    await page.locator('.routine-panel summary').click();
    assert.equal(await page.locator('#routine-select option').count(), 2);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await stop();
  }
});
