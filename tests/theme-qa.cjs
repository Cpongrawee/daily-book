// Visual and interaction QA runs against disposable data, never the live book.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const original = fs.existsSync(path.join(root, 'data/book.json'))
    ? fs.readFileSync(path.join(root, 'data/book.json'))
    : null;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'royal-book-'));
  const output = path.join(__dirname, 'renaissance');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(data, 'book.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
      identity: 'Test compass',
      goals: [],
      reviews: {},
      days: {
        '2026-10-07': {
          priority: 'Make room for focused work',
          priorityDone: false,
          closed: false,
          proud: true,
          proudNote: 'I took one sustainable step today.',
          tasks: [{ id: 'task', text: 'Read one chapter', done: false, goalId: '' }],
          schedule: [{ id: 'plan', time: '08:00', plan: 'Study and write notes', done: false, changes: [] }],
          reflections: { compass: '', fix: '', discipline: '', tomorrow: '' }
        }
      }
    })
  );
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47904' },
    windowsHide: true
  });
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    const fontSession = await page.context().newCDPSession(page);
    await fontSession.send('DOM.enable');
    await fontSession.send('CSS.enable');
    async function checkDisplayFont(selector) {
      const { root: documentNode } = await fontSession.send('DOM.getDocument');
      const { nodeId } = await fontSession.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector });
      const { fonts } = await fontSession.send('CSS.getPlatformFontsForNode', { nodeId });
      assert.ok(
        fonts.some(font => font.familyName.includes('Quintessential') && font.glyphCount > 0),
        `${selector}: actual fonts ${JSON.stringify(fonts)}`
      );
    }
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47904');
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    for (const [size, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
      ['small-mobile', 320, 800]
    ]) {
      await page.setViewportSize({ width, height });
      for (const view of ['day', 'week', 'month', 'proud']) {
        await page.locator(`[data-view="${view}"]`).click();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${size}/${view} page overflow`
        );
        await checkDisplayFont('#page-title');
        await checkDisplayFont('.brand>div');
        const expectedTitleSize = width > 860 ? '46px' : '36px';
        assert.equal(
          await page.locator('#page-title').evaluate(el => getComputedStyle(el).fontSize),
          expectedTitleSize
        );
        assert.equal(
          await page.locator('.brand').evaluate(el => getComputedStyle(el).fontSize),
          width > 860 ? '30px' : '28px'
        );
        assert.ok((await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).includes('Segoe UI'));
        if (view === 'day') {
          await checkDisplayFont('.compass-text');
          await checkDisplayFont('.day-heading h2');
          assert.ok(
            await page.locator('.compass-text').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 12)
          );
          assert.equal(
            await page.locator('.identity').evaluate(el => {
              el.scrollLeft = el.scrollWidth;
              return el.scrollWidth <= el.clientWidth || el.scrollLeft > 0;
            }),
            true,
            'Compass can scroll'
          );
          await page.locator('.identity').evaluate(el => (el.scrollLeft = 0));
        }
        if (view === 'week' || view === 'month') await checkDisplayFont('.stat strong');
        await page.screenshot({
          animations: 'disabled',
          path: path.join(output, `${view}-${size}.png`),
          fullPage: true
        });
      }
      await page.locator('[data-view="day"]').click();
      assert.equal(await page.locator('#change-dialog, [data-action="change"]').count(), 0);
    }
    await page.setViewportSize({ width: 1024, height: 700 });
    for (const selector of ['[data-view="proud"]', '[data-view="month"]', '#export', '#import']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      assert.equal(
        await page.locator(selector).evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
        `Short desktop can reach ${selector}`
      );
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Medium desktop overflow'
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.sidebar').evaluate(el => (el.scrollTop = 0));
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'preview-desktop.png') });
    await page
      .locator('.sidebar')
      .screenshot({ animations: 'disabled', path: path.join(output, 'sidebar-desktop-2x.png') });
    await page.locator('#priority').fill('A focused hour, then a calm evening');
    await page.locator('[data-action="plan"]').fill('A calm focused activity');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await page.locator('#priority').waitFor();
    // The app always reopens on today's date, so return to the seeded day.
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('#priority').inputValue(), 'A focused hour, then a calm evening');
    assert.equal(await page.locator('[data-action=plan]').inputValue(), 'A calm focused activity');
    await page
      .locator('.reflection-page')
      .screenshot({ animations: 'disabled', path: path.join(output, 'reflection-desktop.png') });
    await page
      .locator('.daily-checkin')
      .screenshot({ animations: 'disabled', path: path.join(output, 'checkin-desktop.png') });
    await page.locator('#today').focus();
    assert.equal(await page.locator('#today').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await page.emulateMedia({ media: 'print' });
    for (const view of ['day', 'week', 'month', 'proud']) {
      // Click programmatically: navigation is intentionally hidden in print.
      await page.locator(`[data-view="${view}"]`).evaluate(el => el.click());
      assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
      assert.equal(await page.locator('.sidebar').evaluate(el => getComputedStyle(el).display), 'none');
      if (view === 'month') assert.equal(await page.locator('.calendar button').first().isVisible(), true);
      if (view === 'proud') assert.equal(await page.locator('.heat-day').first().isVisible(), true);
      const frame = page.locator('.page-top').first();
      if (await frame.count())
        assert.equal(await frame.evaluate(el => getComputedStyle(el, '::before').display), 'none');
      await page.screenshot({ animations: 'disabled', path: path.join(output, `print-${view}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(root, 'data/book.json')) ? fs.readFileSync(path.join(root, 'data/book.json')) : null,
      original
    );
    console.log(
      'PASS: actual bundled Quintessential rendering, title/brand/Compass sizes, Compass scroll, all four views at 1440/390/320px, simplified schedule, isolated save/reload, focus, print, no browser errors; production data unchanged'
    );
    console.log(`Visual QA: ${output}`);
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
