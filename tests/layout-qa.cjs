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
      : null;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'book-layout-'));
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47914' },
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
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:47914');
    // Daily check-in starts collapsed; open it to measure the mood controls.
    await page.locator('.daily-checkin > summary').click();
    await page.locator('#exact-mood').waitFor();
    for (const width of [1920, 1440, 1366, 1280, 1024, 861, 860, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const result = await page.evaluate(() => {
        const identity = document.querySelector('.identity'),
          text = document.querySelector('.compass-text'),
          box = identity.getBoundingClientRect(),
          edit = document.querySelector('#edit-compass').getBoundingClientRect();
        // Mood is a continuous slider: its -3..+3 ticks share one line, and the "Exact mood" label does not wrap.
        const mood = document.querySelector('#mood-slider').closest('.mood-checkin'),
          ticks = [...mood.querySelectorAll('.mood-ticks span')];
        const tops = ticks.map(e => e.getBoundingClientRect().top);
        const hint = document.querySelector('#exact-mood').closest('label').firstChild,
          range = document.createRange();
        range.selectNodeContents(hint);
        return {
          width: innerWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          compassOverflow: identity.scrollWidth > identity.clientWidth + 1,
          editInside:
            edit.width > 0 &&
            edit.left >= box.left - 1 &&
            edit.right <= box.right + 1 &&
            edit.top >= box.top - 1 &&
            edit.bottom <= box.bottom + 1,
          font: getComputedStyle(text).fontSize,
          moodOneLine: ticks.length === 7 && Math.max(...tops) - Math.min(...tops) < 1,
          hintLines: range.getClientRects().length
        };
      });
      console.log(result);
      assert.equal(result.overflow, false);
      assert.equal(result.compassOverflow, false);
      assert.equal(result.editInside, true);
      assert.equal(result.moodOneLine, true);
      assert.equal(result.hintLines, 1);
      if ([1440, 1024, 390].includes(width)) {
        await page.locator('.identity').screenshot({ path: path.join(__dirname, `layout-compass-${width}.png`) });
        await page.locator('.daily-checkin').screenshot({ path: path.join(__dirname, `layout-checkin-${width}.png`) });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.proud-check').screenshot({ path: path.join(__dirname, 'proud-theme-unchecked.png') });
    await page.locator('#proud-today').check();
    await page.locator('.proud-check').screenshot({ path: path.join(__dirname, 'proud-theme-checked.png') });
    await page.locator('[data-view="proud"]').click();
    await page.locator('.page').screenshot({ path: path.join(__dirname, 'proud-calendar-theme.png') });
    await page.locator('[data-view="day"]').click();
    await page.locator('#proud-today').uncheck();
    if (!(await page.locator('.daily-checkin').evaluate(el => el.open)))
      await page.locator('.daily-checkin > summary').click();
    await page.locator('#mood-slider').fill('3');
    assert.equal(Number(await page.locator('#exact-mood').inputValue()), 3);
    await page.locator('#exact-mood').fill('1.5');
    await page.locator('#exact-mood').dispatchEvent('change');
    await page.locator('#clear-mood').click();
    assert.equal(await page.locator('#exact-mood').inputValue(), '');
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      before
    );
    console.log('PASS: Chrome 100% layout, mood controls, production data unchanged');
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
