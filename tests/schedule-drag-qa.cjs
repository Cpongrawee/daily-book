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
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'book-drag-'));
  const schedule = [
    {
      id: 'range',
      time: '08:17',
      end: '09:03',
      plan: 'Exact range',
      done: true,
      changes: [{ kind: 'blue', actual: 'Original', reason: 'Preserve', at: '2026-10-07T00:00:00Z' }]
    },
    { id: 'single', time: '10:00', plan: 'Single time', done: false, changes: [] },
    { id: 'overlap', time: '08:30', end: '10:00', plan: 'Overlapping', done: false, changes: [] }
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
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47912' },
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
    async function open() {
      await page.goto('http://127.0.0.1:47912');
      await page.locator('#priority').waitFor();
      await page.locator('#date').fill('2026-10-07');
      await page.locator('#date').dispatchEvent('change');
    }
    const card = id => page.locator(`[data-event-id=${id}]`),
      saved = () => page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    async function drag(id, delta, cancel = false, body = false) {
      const target = body ? card(id).locator('.block-range') : card(id).locator('[data-action=shift-activity]');
      await target.evaluate(el => {
        const r = el.getBoundingClientRect();
        window.scrollBy(0, r.top - 300);
      });
      const r = await target.boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + delta * 2, { steps: 5 });
      assert.equal(await card(id).evaluate(el => el.classList.contains('is-dragging')), true);
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
      if (!cancel) await saved();
    }
    await open();
    await drag('range', 37);
    assert.equal(await card('range').locator('.block-range').textContent(), '08:54–09:40');
    assert.equal(await card('range').locator('[data-action=schedule-done]').isChecked(), true);
    assert.equal(await card('overlap').locator('.block-range').textContent(), '08:30–10:00');
    await page.locator('#undo').click();
    await saved();
    assert.equal(await card('range').locator('.block-range').textContent(), '08:17–09:03');
    await drag('range', -17, false, true);
    assert.equal(await card('range').locator('.block-range').textContent(), '08:00–08:46');
    await drag('range', 20, true);
    assert.equal(await card('range').locator('.block-range').textContent(), '08:00–08:46');
    await drag('single', 11);
    assert.equal(await card('single').locator('.block-range').textContent(), '10:11');
    await card('single').locator('[data-action=shift-activity]').focus();
    await page.keyboard.press('ArrowUp');
    await saved();
    await page.keyboard.press('Shift+ArrowDown');
    await saved();
    assert.equal(await card('single').locator('.block-range').textContent(), '10:25');
    await open();
    assert.equal(await card('range').locator('.block-range').textContent(), '08:00–08:46');
    assert.equal(await card('single').locator('.block-range').textContent(), '10:25');
    // Clamp large pointer movements without needing to scroll through the whole day.
    await card('range').locator('[data-action=shift-activity]').scrollIntoViewIfNeeded();
    async function synthetic(delta, cancel = false) {
      const handle = card('range').locator('[data-action=shift-activity]');
      await handle.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 300));
      const r = await handle.boundingBox(),
        y = r.y + r.height / 2;
      await page.mouse.move(r.x + r.width / 2, y);
      await page.mouse.down();
      await page.locator('body').dispatchEvent('pointermove', { pointerId: 1, clientY: y + delta * 2 });
      if (cancel) await page.locator('body').dispatchEvent('pointercancel', { pointerId: 1 });
      await page.mouse.up();
      if (!cancel) await saved();
    }
    // The day runs 00:00–23:59, so a large drag stops at either edge with its duration intact.
    await synthetic(-1000);
    assert.equal(await card('range').locator('.block-range').textContent(), '00:00–00:46');
    await synthetic(2000);
    assert.equal(await card('range').locator('.block-range').textContent(), '23:13–23:59');
    await synthetic(-30, true);
    assert.equal(await card('range').locator('.block-range').textContent(), '23:13–23:59');
    await page.locator('#undo').click();
    await saved();
    await page.locator('#undo').click();
    await saved();
    await card('range').locator('[data-action=activity-menu]').click();
    await page.locator('[data-activity-menu=edit]').click();
    assert.equal(await page.locator('#activity-editor').evaluate(el => el.open), true);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 900 });
    await drag('single', -10);
    assert.equal(await card('single').locator('.block-range').textContent(), '10:15');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const disk = JSON.parse(fs.readFileSync(path.join(data, 'book.json'))).days['2026-10-07'].schedule;
    assert.equal(disk.find(s => s.id === 'single').end || '', '');
    assert.deepEqual(disk.find(s => s.id === 'range').changes, schedule[0].changes);
    const touch = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true }),
      tp = await touch.newPage();
    await tp.goto('http://127.0.0.1:47912');
    await tp.locator('#priority').waitFor();
    await tp.locator('#date').fill('2026-10-07');
    await tp.locator('#date').dispatchEvent('change');
    const th = tp.locator('[data-event-id=single] [data-action=shift-activity]');
    await th.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 300));
    const tr = await th.boundingBox(),
      cdp = await touch.newCDPSession(tp),
      x = tr.x + tr.width / 2,
      y = tr.y + tr.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 40 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tp.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal(await tp.locator('[data-event-id=single] .block-range').textContent(), '10:35');
    await touch.close();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(__dirname, 'schedule-drag-mobile.png') });
    console.log(
      'PASS: handle/body drag, exact duration, overlap, completion, cancel, Undo, keyboard, reload, bounds, pointercancel, menu, mobile'
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
