const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..'),
    before = fs.existsSync(path.join(root, 'data/book.json'))
      ? fs.readFileSync(path.join(root, 'data/book.json'))
      : null,
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'book-add-context-'));
  const schedule = [
    { id: 'existing', time: '08:00', end: '10:00', plan: 'Existing activity', done: true, changes: [] }
  ];
  fs.writeFileSync(
    path.join(data, 'book.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
      identity: 'Test',
      goals: [],
      reviews: {},
      days: {
        '2026-10-07': {
          schedule,
          tasks: [],
          reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
          priority: '',
          priorityDone: false,
          closed: false
        }
      }
    })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47911' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
      child.once('exit', c => reject(Error('Server exit ' + c)));
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47911');
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    const form = page.locator('#activity-edit-form'),
      save = () => page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    async function openAt(time, labels = false) {
      // The visible timeline starts at 06:00 or the earliest activity's half hour, whichever is earlier.
      const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)),
        start = Number(await page.locator('.timeline-canvas').getAttribute('data-timeline-start')),
        row = page.locator('.timeline-row').nth(Math.floor((minute - start) / 30));
      await row.scrollIntoViewIfNeeded();
      const point = await page.locator('.timeline-canvas').evaluate(
        (el, { minute, labels }) => {
          const r = el.getBoundingClientRect();
          return { x: labels ? r.left - 20 : r.left + 100, y: r.top + (minute - el.dataset.timelineStart) * 2 + 0.2 };
        },
        { minute, labels }
      );
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.locator('[data-activity-menu=add]').click();
      assert.equal(await form.locator('[name=time]').inputValue(), time);
    }
    await openAt('11:17');
    assert.equal(await form.locator('[name=end]').inputValue(), '11:47');
    await form.locator('[name=plan]').fill('New exact range');
    await form.locator('[name=end]').fill('11:10');
    await form.getByRole('button', { name: 'Add to schedule' }).click();
    assert.equal(await page.locator('#activity-edit-error').isVisible(), true);
    assert.equal(await page.locator('.timeline-event').count(), 1);
    await form.locator('[name=end]').fill('12:03');
    await form.getByRole('button', { name: 'Add to schedule' }).click();
    await save();
    assert.equal(await page.locator('.block-range').filter({ hasText: '11:17–12:03' }).count(), 1);
    await page.locator('#undo').click();
    await save();
    assert.equal(await page.locator('.timeline-event').count(), 1);
    await openAt('08:15');
    await form.locator('[name=plan]').fill('Parallel addition');
    await form.locator('[name=end]').fill('09:07');
    await form.getByRole('button', { name: 'Add to schedule' }).click();
    await save();
    await page.reload();
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('.block-range').filter({ hasText: '08:15–09:07' }).count(), 1);
    assert.equal(await page.locator('[data-event-id=existing] [data-action=schedule-done]').isChecked(), true);
    await openAt('13:00', true);
    await page.locator('#activity-edit-cancel').click();
    assert.equal(await page.locator('.timeline-event').count(), 2);
    // The day runs to 23:59: late starts get a 30-minute end, the last minute gets no end.
    await openAt('23:00');
    assert.equal(await form.locator('[name=end]').inputValue(), '23:30');
    await page.keyboard.press('Escape');
    await openAt('23:59');
    assert.equal(await form.locator('[name=end]').inputValue(), '');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 900 });
    await openAt('06:00');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(__dirname, 'schedule-add-mobile.png') });
    await page.locator('#activity-edit-cancel').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openAt('07:00');
    await page.screenshot({ path: path.join(__dirname, 'schedule-add-desktop.png') });
    await page.locator('#activity-edit-cancel').click();
    await page.locator('[data-event-id=existing] [data-action=activity-menu]').click();
    await page.locator('[data-activity-menu=edit]').click();
    assert.equal(await form.locator('h2').textContent(), 'Edit activity');
    assert.equal(await form.getByRole('button', { name: 'Save', exact: true }).count(), 1);
    await page.locator('#activity-edit-cancel').click();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: right-click blank/occupied/labels, exact times, invalid range, cancel, Undo, save/reload, 23:00/23:59, mobile, existing Edit'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      before
    );
    console.log('Production book unchanged');
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
