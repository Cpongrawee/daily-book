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
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'book-same-start-')),
    output = path.join(__dirname, 'simultaneous');
  fs.mkdirSync(output, { recursive: true });
  const schedule = [
    ['a', '08:00', '12:00', 'Study session'],
    ['b', '09:30', '12:00', 'Phone call'],
    ['c', '09:30', '12:00', 'Laundry']
  ].map(([id, time, end, plan]) => ({ id, time, end, plan, done: false, changes: [] }));
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
          priority: '',
          priorityDone: false,
          closed: false,
          tasks: [],
          schedule,
          reflections: { compass: '', fix: '', discipline: '', tomorrow: '' }
        }
      }
    })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47903' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47903');
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const rectangles = await page.locator('.parallel-event').evaluateAll(elements =>
        elements.map(el => ({
          left: el.offsetLeft,
          right: el.offsetLeft + el.offsetWidth,
          top: el.offsetTop,
          height: el.offsetHeight
        }))
      );
      assert.equal(rectangles.length, 2);
      assert.ok(rectangles[0].right <= rectangles[1].left, 'simultaneous blocks must not cover each other');
      assert.equal(rectangles[0].top, rectangles[1].top);
      assert.equal(rectangles[0].height, 300);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('[data-event-id=a]').scrollIntoViewIfNeeded();
      await page.locator('.timeline-scroll').evaluate(el => (el.scrollLeft = 0));
      await page.screenshot({ path: path.join(output, `same-start-${width}.png`) });
      for (const id of ['b', 'c']) {
        const event = page.locator(`[data-event-id=${id}]`);
        await event.locator('[data-action=schedule-done]').check();
        assert.equal(await event.locator('[data-action=schedule-done]').isChecked(), true);
        await event.locator('[data-action=activity-menu]').click();
        await page.locator('[data-activity-menu=edit]').click();
        assert.equal(
          await page.locator('#activity-edit-form [name=plan]').inputValue(),
          id === 'c' ? 'Laundry' : 'Phone call'
        );
        await page.locator('#activity-edit-cancel').click();
      }
      await page.locator('[data-event-id=c]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `same-start-right-${width}.png`) });
    }
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await page.locator('#priority').waitFor();
    // The app always reopens on today's date, so return to the seeded day.
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('[data-event-id=c] [data-action=schedule-done]').isChecked(), true);
    assert.equal(await page.locator('[data-event-id=b] [data-action=schedule-done]').isChecked(), true);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: separate simultaneous headers, menus and completion accessible at 1440/390/320px, no page overflow, reload'
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
