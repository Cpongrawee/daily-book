const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..'),
    production = fs.existsSync(path.join(root, 'data/book.json'))
      ? fs.readFileSync(path.join(root, 'data/book.json'))
      : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mood-sleep-')),
    output = path.join(__dirname, 'mood-sleep');
  fs.mkdirSync(output, { recursive: true });
  const sleeps = [7.5, 6, 8, 5.5, 7, 8.5, 6.5, 7.5, 5, 8, null, 6, 7.5, 8],
    moods = [1, 0, 2, -1, -1, 3, null, 0, -2, 1, 2, -1, 1, 2],
    energies = [1, 2, -1, 1, null, null, null, null, null, null, null, null, null, null];
  const beds = [
    '23:00',
    '00:30',
    '22:30',
    '01:00',
    '23:30',
    '22:00',
    '00:00',
    '23:00',
    '01:30',
    '22:30',
    null,
    '00:30',
    '23:00',
    '22:30'
  ];
  const days = {};
  for (let i = 0; i < 14; i++) {
    const key = `2026-10-${String(i + 1).padStart(2, '0')}`;
    days[key] = {
      schedule: [],
      tasks: [],
      priority: '',
      priorityDone: false,
      closed: false,
      reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
      checkin: {
        mood: moods[i],
        energy: energies[i],
        bedtime: beds[i] || '',
        wakeTime: beds[i] ? '06:30' : '',
        bedDay: beds[i] && beds[i] < '06:30' ? 'today' : 'previous'
      }
    };
  }
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({ version: 1, revision: 0, identity: 'Test', days, goals: [], reviews: {} })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47923' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited ${code}`)));
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 }),
      errors = [];
    let puts = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => {
      if (req.method() === 'PUT') puts++;
    });
    await page.goto('http://127.0.0.1:47923');
    await page.locator('#priority').waitFor();
    const before = fs.readFileSync(path.join(dir, 'book.json'));
    const memoryBefore = await page.evaluate(() => JSON.stringify(book));
    await page.locator('[data-view="mood"]').click();
    await page.locator('.mood-chart').waitFor();
    assert.equal(await page.locator('.date-nav').isVisible(), false);
    assert.deepEqual(await page.locator('.mood-metrics strong').allTextContents(), [
      '+0.892',
      '+0.54',
      '+0.75',
      '7.00 hr'
    ]);
    assert.equal(await page.locator('.mood-chart circle').count(), 13);
    assert.equal(await page.locator('.mood-chart .energy-point').count(), 4);
    assert.equal(await page.locator('.mood-chart .mood-bar').count(), 13);
    assert.equal(await page.locator('.mood-data-table tbody tr').count(), 92);
    assert.equal(
      await page
        .locator('.mood-trend')
        .getAttribute('d')
        .then(d => (d.match(/M/g) || []).length),
      2
    );
    assert.equal(
      await page
        .locator('.energy-trend')
        .getAttribute('d')
        .then(d => (d.match(/M/g) || []).length),
      1
    );
    await page.locator('.mood-filters [name="preset"]').selectOption('2026-10');
    assert.equal(await page.locator('.mood-data-table tbody tr').count(), 31);
    await page.locator('.mood-filters [name="start"]').fill('2026-10-01');
    await page.locator('.mood-filters [name="end"]').fill('2026-10-14');
    await page.locator('.mood-filters button').click();
    assert.equal(await page.locator('.mood-data-table tbody tr').count(), 14);
    for (const [label, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
      ['small-mobile', 320, 800]
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `${label} overflow`
      );
      await page.locator('.mood-date-select').selectOption('2026-10-11');
      assert.ok((await page.locator('.mood-day-detail').textContent()).includes('Sleep Not recorded'));
      await page.locator('.mood-date-select').selectOption('2026-10-07');
      assert.ok((await page.locator('.mood-day-detail').textContent()).includes('Mood Not recorded'));
      await page.locator('.mood-date-select').selectOption('2026-10-06');
      await page
        .locator('#mood-sleep')
        .screenshot({ path: path.join(output, `chart-${label}.png`), animations: 'disabled' });
      assert.equal(
        await page.locator('.mood-right-axis').evaluate(el => el.getBoundingClientRect().right <= innerWidth),
        true
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.mood-filters [name="start"]').fill('2026-10-14');
    await page.locator('.mood-filters [name="end"]').fill('2026-10-01');
    await page.locator('.mood-filters button').click();
    assert.equal(await page.locator('.mood-range-error').isVisible(), true);
    assert.equal(await page.locator('.mood-data-table tbody tr').count(), 14);
    await page.locator('.mood-filters [name="preset"]').selectOption('2026-11');
    assert.equal(await page.locator('.mood-empty').isVisible(), true);
    assert.deepEqual(await page.locator('.mood-metrics strong').allTextContents(), ['—', '—', '—', '— hr']);
    await page
      .locator('#mood-sleep')
      .screenshot({ path: path.join(output, 'empty-desktop.png'), animations: 'disabled' });
    await page.locator('.mood-filters [name="preset"]').selectOption('quarter');
    assert.equal(await page.evaluate(() => JSON.stringify(book)), memoryBefore);
    assert.equal(puts, 0);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'book.json')), before);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.mood-table-panel').getAttribute('open'), '');
    assert.equal(
      await page
        .locator('.mood-chart')
        .evaluate(el => el.getBoundingClientRect().width <= el.parentElement.clientWidth + 1),
      true,
      'Printed chart fits'
    );
    await page.pdf({ path: path.join(output, 'print-quarter.pdf'), format: 'A4', printBackground: true });
    await page
      .locator('#mood-sleep')
      .screenshot({ path: path.join(output, 'print-quarter.png'), animations: 'disabled' });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => dispatchEvent(new Event('afterprint')));
    // A touch tap on a day selects it; a second tap opens its daily page.
    const tap = d =>
      page
        .locator(`.mood-hit[data-chart-date="${d}"]`)
        .evaluate(el => el.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerType: 'touch' })));
    await page.locator('.mood-date-select').selectOption('2026-10-01');
    await tap('2026-10-04');
    assert.equal(await page.locator('.mood-date-select').inputValue(), '2026-10-04');
    assert.equal(await page.locator('#mood-sleep').count(), 1, 'first tap stays on the chart');
    await tap('2026-10-04');
    await page.locator('.daily-checkin').waitFor();
    assert.equal(await page.locator('#date').inputValue(), '2026-10-04');
    await page.locator('[data-view="mood"]').click();
    // A mouse click on a day's bar opens that day with Daily check-in expanded and the wake-up time focused.
    await page.locator('.mood-hit[data-chart-date="2026-10-06"]').click();
    assert.equal(await page.locator('#date').inputValue(), '2026-10-06');
    assert.equal(await page.locator('.daily-checkin').getAttribute('open'), '');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.checkin), 'wakeTime');
    assert.equal(await page.locator('[data-checkin="wakeTime"]').isVisible(), true);
    assert.ok(
      await page.locator('[data-checkin="wakeTime"]').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }),
      'wake-up time is scrolled into view'
    );
    // "Open daily page" does the same for the selected date.
    await page.locator('[data-view="mood"]').click();
    await page.locator('.mood-date-select').selectOption('2026-10-06');
    await page.locator('.mood-open-day').click();
    assert.equal(await page.locator('#date').inputValue(), '2026-10-06');
    assert.equal(await page.locator('.daily-checkin').getAttribute('open'), '');
    await page.locator('#exact-mood').fill('-3');
    await page.locator('#exact-mood').press('Tab');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.locator('[data-view="mood"]').click();
    assert.equal((await page.locator('.mood-metrics strong').allTextContents())[1], '+0.08');
    await page.reload();
    await page.locator('#priority').waitFor();
    await page.locator('[data-view="mood"]').click();
    // The chart period isn't remembered across reloads; it falls back to the default "All recorded data".
    assert.equal(await page.locator('.mood-filters [name="preset"]').inputValue(), 'all');
    assert.equal((await page.locator('.mood-metrics strong').allTextContents())[1], '+0.08');
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      production
    );
    console.log(
      'PASS: paired correlation, independent averages, date filters, invalid range, gaps, empty state, fixed axes, 1440/390/320px, read-only navigation, print, live check-in updates, reload; production unchanged'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
