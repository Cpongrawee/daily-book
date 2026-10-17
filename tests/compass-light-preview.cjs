const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert/strict');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..'),
    before = fs.existsSync(root + '/data/book.json') ? fs.readFileSync(root + '/data/book.json') : null,
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'compass-light-'));
  fs.writeFileSync(
    path.join(data, 'book.json'),
    JSON.stringify({ version: 1, revision: 0, identity: 'Preview', days: {}, goals: [], reviews: {} })
  );
  const server = spawn(process.execPath, [root + '/server.cjs'], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47862' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((res, rej) => {
      server.stdout.once('data', res);
      server.once('error', rej);
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47862');
    await page.locator('.identity .compass-sheen').waitFor();
    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('.identity').screenshot({ path: root + '/tests/compass-light-' + width + '.png' });
    }
    const light = page.locator('.identity .compass-sheen');
    assert.equal(await light.evaluate(e => getComputedStyle(e).pointerEvents), 'none');
    assert.equal(await page.locator('.identity i').count(), 0);
    const style = await page.locator('.identity').evaluate(e => ({
      border: getComputedStyle(e).borderTopWidth,
      color: getComputedStyle(e).borderTopColor,
      before: getComputedStyle(e, '::before').content,
      after: getComputedStyle(e, '::after').content,
      clip: getComputedStyle(e).overflow
    }));
    assert.deepEqual(style, {
      border: '1px',
      color: 'rgba(200, 177, 129, 0.45)',
      before: 'none',
      after: 'none',
      clip: 'hidden'
    });
    assert.equal(await page.locator('.identity .compass-text').evaluate(e => getComputedStyle(e).textShadow), 'none');
    assert.equal(await light.evaluate(e => getComputedStyle(e, '::before').animationDuration), '20s');
    const angles = await light.evaluate(async e => {
      const a = getComputedStyle(e, '::before').transform;
      await new Promise(r => setTimeout(r, 300));
      return [a, getComputedStyle(e, '::before').transform];
    });
    assert.notEqual(...angles);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await light.evaluate(e => getComputedStyle(e, '::before').animationName), 'none');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await light.isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: served page, Quiet Luxury sheen, desktop/mobile 390/320, reduced motion, print, no script errors'
    );
    await page.emulateMedia({ media: 'screen', reducedMotion: 'no-preference' });
    const proud = page.locator('.proud-check'),
      check = page.locator('#proud-today'),
      fire = proud.locator('.activity-fire');
    assert.equal(await fire.isVisible(), false);
    await check.check();
    assert.equal(await fire.isVisible(), true);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await check.waitFor();
    assert.equal(await check.isChecked(), true);
    assert.equal(await fire.isVisible(), true);
    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await proud.screenshot({ path: root + '/tests/proud-complete-fire-' + width + '.png' });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await fire
        .locator('.fire-tongue')
        .first()
        .evaluate(e => getComputedStyle(e).animationName),
      'none'
    );
    await page.emulateMedia({ media: 'print' });
    assert.equal(await fire.isVisible(), false);
    await page.emulateMedia({ media: 'screen', reducedMotion: 'no-preference' });
    await check.uncheck();
    assert.equal(await fire.isVisible(), false);
    assert.equal(await proud.locator('.proud-light').isVisible(), false);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.locator('#undo').click();
    assert.equal(await page.locator('#proud-today').isChecked(), true);
    assert.equal(await proud.locator('.activity-fire').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: Proud completion flames, reload persistence, uncheck, Undo, mobile, reduced motion and print');
  } finally {
    if (browser) await browser.close();
    server.kill();
    assert.deepEqual(
      fs.existsSync(root + '/data/book.json') ? fs.readFileSync(root + '/data/book.json') : null,
      before
    );
    console.log('Production book unchanged');
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
