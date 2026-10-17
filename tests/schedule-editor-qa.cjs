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
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'book-layered-')),
    output = path.join(__dirname, 'schedule-editor');
  fs.mkdirSync(output, { recursive: true });
  const history = [{ kind: 'red', actual: 'Legacy actual', reason: 'Keep history', at: '2026-10-07T00:00:00Z' }];
  const schedule = [
    { id: 'long', time: '12:30', end: '14:00', plan: 'Prepare the weekly report', done: true, changes: history },
    ...[
      ['short', '13:00', '13:30', 'Parallel phone call'],
      ['partial', '13:15', '14:15', 'Partial overlap'],
      ['equal', '13:00', '13:30', 'Another parallel task'],
      ['tiny', '14:30', '14:35', 'Five minute break'],
      ['legacy', '03:45', '04:15', 'Legacy early activity'],
      ['single', '16:00', '', 'Single time entry']
    ].map(([id, time, end, plan]) => ({ id, time, end, plan, done: false, changes: [] }))
  ];
  const seed = {
    version: 1,
    revision: 0,
    identity: 'Test',
    goals: [],
    reviews: {},
    days: {
      '2026-10-07': {
        priority: 'Keep priority',
        priorityDone: false,
        closed: false,
        tasks: [],
        schedule,
        reflections: { compass: '', fix: '', discipline: '', tomorrow: '' }
      }
    }
  };
  fs.writeFileSync(path.join(data, 'book.json'), JSON.stringify(seed));
  const backup = path.join(data, 'old.json');
  fs.writeFileSync(backup, JSON.stringify(seed));
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47913' },
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
    page.on('dialog', d => d.accept());
    await page.goto('http://127.0.0.1:47913');
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    const event = id => page.locator(`[data-event-id="${id}"]`),
      saved = () => page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    const open = async id => {
      await event(id).dispatchEvent('contextmenu', { clientX: 150, clientY: 150 });
      await page.locator('[data-activity-menu=edit]').click();
      await page.locator('#activity-editor').waitFor({ state: 'visible' });
    };
    const form = page.locator('#activity-edit-form'),
      time = form.locator('[name=time]'),
      end = form.locator('[name=end]'),
      name = form.locator('[name=plan]');
    assert.equal(await page.locator('.timeline-event').count(), 7);
    assert.equal(await event('long').locator('[data-action=schedule-done]').isChecked(), true);
    await open('long');
    await time.fill('12:45');
    await end.fill('14:10');
    await name.fill('Edited preparation');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await saved();
    let stored = JSON.parse(fs.readFileSync(path.join(data, 'book.json'))).days['2026-10-07'].schedule.find(
      s => s.id === 'long'
    );
    assert.equal(stored.time, '12:45');
    assert.equal(stored.end, '14:10');
    assert.equal(stored.done, true);
    assert.deepEqual(stored.changes, history);
    await page.locator('#undo').click();
    await saved();
    assert.equal(await event('long').locator('[data-action=plan]').inputValue(), 'Prepare the weekly report');
    await open('long');
    await time.fill('14:00');
    await end.fill('13:00');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await page.locator('#activity-edit-error').isVisible(), true);
    await page.locator('#activity-edit-cancel').click();
    assert.equal(await event('long').locator('.block-range').textContent(), '12:30–14:00');
    await open('long');
    await end.fill('');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await saved();
    assert.equal(await event('long').locator('.block-range').textContent(), '12:30');
    await page.locator('#undo').click();
    await saved();
    await open('legacy');
    await time.fill('05:30');
    await end.fill('06:00');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await saved();
    await page.locator('#undo').click();
    await saved();
    assert.equal(await event('legacy').locator('.block-range').textContent(), '03:45–04:15');
    await event('short').dispatchEvent('contextmenu', { clientX: 150, clientY: 150 });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#activity-menu').isVisible(), false);
    await event('short').focus();
    await page.keyboard.press('Shift+F10');
    await page.keyboard.press('Enter');
    await name.fill('Keyboard edited call');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await saved();
    await event('short').locator('[data-action=plan]').fill('Directly edited call');
    await event('short').click({ position: { x: 2, y: 15 } });
    await event('short').locator('[data-action=schedule-done]').check();
    await saved();
    await page.reload();
    await page.locator('#priority').waitFor();
    // A reload opens today, so return to the seeded day.
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await event('short').locator('[data-action=plan]').inputValue(), 'Directly edited call');
    assert.equal(await event('short').locator('[data-action=schedule-done]').isChecked(), true);
    // Activate the exposed left edge; the large background event can be reached.
    await event('long').scrollIntoViewIfNeeded();
    await event('long').click({ position: { x: 2, y: 70 } });
    assert.equal(await event('long').evaluate(el => el.classList.contains('is-raised')), true);
    await page.locator('#page-title').click();
    assert.equal(await event('long').evaluate(el => el.classList.contains('is-raised')), false);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await event('long').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `overlap-${width}.png`) });
      await event('tiny').locator('[data-action=activity-menu]').click();
      await page.locator('[data-activity-menu=edit]').click();
      assert.equal(await time.inputValue(), '14:30');
      assert.equal(await end.inputValue(), '14:35');
      await page.locator('#activity-edit-cancel').click();
    }
    // New activities are added from the timeline's right-click menu.
    await page.locator('[data-action=new-plan][data-time="18:00"]').click({ button: 'right' });
    await page.locator('[data-activity-menu=add]').click();
    await time.fill('18:07');
    await end.fill('18:23');
    await name.fill('Minute precision');
    await form.getByRole('button', { name: 'Add to schedule', exact: true }).click();
    await saved();
    assert.equal(await page.locator('.timeline-event').count(), 8);
    await event('equal').locator('[data-action=activity-menu]').click();
    await page.locator('[data-activity-menu=delete]').click();
    await saved();
    assert.equal(await event('equal').count(), 0);
    const summaryEvent = page.waitForEvent('download');
    await page.locator('#summary').click();
    const dl = await summaryEvent;
    await dl.saveAs(path.join(data, 'summary.md'));
    assert.match(fs.readFileSync(path.join(data, 'summary.md'), 'utf8'), /18:07–18:23/);
    // Server rejects bad new times and malformed ends, without altering storage.
    for (const [start, finish] of [
      ['24:00', '24:30'],
      ['12:00', '11:00'],
      ['12:00', 'not-time']
    ]) {
      const status = await page.evaluate(
        async ({ start, finish }) => {
          const r = await fetch('/api/book'),
            d = await r.json();
          d.book.days['2026-10-07'].schedule.push({
            id: 'bad',
            time: start,
            end: finish,
            plan: 'Bad',
            done: false,
            changes: []
          });
          return (
            await fetch('/api/book', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'X-Book-Token': d.token },
              body: JSON.stringify(d.book)
            })
          ).status;
        },
        { start, finish }
      );
      assert.equal(status, 400);
    }
    await page.locator('#import-file').setInputFiles(backup);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Backup restored'));
    assert.equal(await page.locator('.timeline-event').count(), 7);
    const restored = JSON.parse(fs.readFileSync(path.join(data, 'book.json'))).days['2026-10-07'].schedule;
    assert.deepEqual(restored.find(s => s.id === 'long').changes, history);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.schedule-timeline').isVisible(), false);
    assert.equal(await page.locator('.schedule-print>div').count(), 7);
    await page.screenshot({ path: path.join(output, 'print.png'), fullPage: true });
    await page.pdf({ path: path.join(output, 'print.pdf'), format: 'A4', printBackground: true });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: minute editing, menus, keyboard, cancel, invalid input, Undo, direct edits, completion, reload, overlaps, mobile scroll, add/delete, backup restore, server validation, summary, print'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      before
    );
    console.log('Production data unchanged');
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
