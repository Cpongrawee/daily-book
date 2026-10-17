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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-')),
    out = path.join(__dirname, 'behavior');
  fs.mkdirSync(out, { recursive: true });
  const days = {};
  for (let i = 1; i <= 8; i++)
    days[`2026-10-0${i}`] = {
      schedule: [],
      priority: 'Priority ' + i,
      priorityDone: i % 2 === 0,
      tasks: [
        { id: 'a' + i, text: 'Task <one> ' + i, done: true, goalId: '' },
        { id: 'b' + i, text: 'Task two ' + i, done: i % 2 === 0, goalId: '' }
      ],
      closed: i < 7,
      proud: i % 2 === 0,
      reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
      checkin: { sets: Array(i === 1 ? 4 : i === 2 ? 10 : 5).fill(true), fasting: i % 2 === 0 }
    };
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({ version: 1, revision: 0, identity: 'Test', days, goals: [], reviews: {} })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47849' },
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
    await page.clock.install({ time: new Date('2026-10-08T05:00:00Z') });
    const errors = [];
    let puts = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      if (r.method() === 'PUT') puts++;
    });
    await page.goto('http://127.0.0.1:47849');
    await page.locator('#priority').waitFor();
    const memory = await page.evaluate(() => JSON.stringify(book)),
      disk = fs.readFileSync(path.join(dir, 'book.json'));
    await page.locator('[data-view="behavior"]').click();
    assert.equal(await page.locator('[data-metric]').count(), 6);
    assert.equal(await page.locator('.date-nav').isVisible(), false);
    assert.equal(await page.locator('.behavior-calendar thead th').count(), 9);
    assert.match(await page.locator('[data-metric="training"]').textContent(), /44 total sets/);
    await page.locator('[data-detail="tasks:success"]').click();
    assert.equal(await page.locator('.behavior-detail li').count(), 12);
    assert.match(await page.locator('.behavior-detail').textContent(), /Task <one>/);
    await page.locator('[data-detail="tasks:failure"]').click();
    assert.equal(await page.locator('.behavior-detail li').count(), 3);
    for (const [label, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
      ['small-mobile', 320, 800]
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: path.join(out, label + '.png'), fullPage: true });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        label + ' overflow'
      );
    }
    await page.locator('[name="start"]').fill('2026-10-08');
    await page.locator('.behavior-filters [name="end"]').fill('2026-10-01');
    await page.locator('.behavior-filters button').click();
    assert.equal(await page.locator('.behavior-error').isVisible(), true);
    await page.locator('[name="period"]').selectOption('2026-11');
    assert.match(await page.locator('.behavior-results').textContent(), /No elapsed dates/);
    await page.locator('[name="period"]').selectOption('quarter');
    assert.equal(await page.locator('.behavior-calendar thead th').count(), 9);
    assert.equal(await page.evaluate(() => JSON.stringify(book)), memory);
    assert.equal(puts, 0);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'book.json')), disk);
    await page.locator('.behavior-cell').first().click();
    assert.equal(await page.locator('#date').inputValue(), '2026-10-01');
    await page.locator('#priority-done').check();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.locator('[data-view="behavior"]').click();
    assert.equal(await page.locator('[data-detail="priority:success"]').textContent(), '5');
    await page.reload();
    await page.locator('#priority').waitFor();
    await page.locator('[data-view="behavior"]').click();
    assert.equal(await page.locator('[name="period"]').inputValue(), 'month');
    assert.equal(await page.locator('[data-detail="priority:success"]').textContent(), '5');
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      production
    );
    console.log(
      'PASS desktop/mobile/320px, details, filters, future exclusion, read-only memory/disk/requests, date navigation, edit refresh/reload, production unchanged'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
