const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { spawn } = require('node:child_process');
const { chromium } = require('playwright');
(async () => {
  const original = fs.existsSync(path.join(__dirname, '../data/book.json'))
    ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
    : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discipline-qa-'));
  const seed = {
    version: 1,
    revision: 0,
    identity: '',
    goals: [],
    reviews: {},
    days: {
      '2026-10-07': {
        schedule: [],
        priority: '',
        priorityDone: false,
        tasks: [],
        reflections: { compass: '', fix: '', discipline: 'Previous reflection retained.', tomorrow: '' },
        closed: false,
        proud: false
      }
    }
  };
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify(seed));
  const child = spawn(process.execPath, [path.join(__dirname, '../server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47853' },
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:47853');
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    const card = page.locator('.discipline-card');
    await card.waitFor();
    assert.equal(await card.locator('textarea,input[type=text]').count(), 0);
    assert.equal(await card.locator('input[type=checkbox]').count(), 2);
    const discipline = page.locator('[data-discipline-choice="discipline"]'),
      fire = card.locator('.activity-fire');
    await discipline.uncheck();
    assert.equal(await fire.isVisible(), false);
    for (const key of ['discipline', 'emotion']) await page.locator(`[data-discipline-choice="${key}"]`).check();
    assert.equal(await fire.isVisible(), true);
    assert.equal(await fire.locator('.fire-tongue').count(), 7);
    assert.equal(await fire.getAttribute('aria-hidden'), 'true');
    assert.equal(await fire.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.waitForFunction(
      () =>
        !saving && editCount === savedCount && document.querySelector('#save-status').textContent.includes('✓ Saved')
    );
    await page.reload();
    await card.waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    for (const key of ['discipline', 'emotion'])
      assert.equal(await page.locator(`[data-discipline-choice="${key}"]`).isChecked(), true);
    assert.equal(await fire.isVisible(), true);
    await discipline.uncheck();
    assert.equal(await fire.isVisible(), false);
    await discipline.check();
    assert.equal(await fire.isVisible(), true);
    await page.locator('[data-discipline-choice="emotion"]').uncheck();
    await page.waitForFunction(
      () =>
        !saving && editCount === savedCount && document.querySelector('#save-status').textContent.includes('✓ Saved')
    );
    await page.reload();
    await card.waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await page.locator('[data-discipline-choice="emotion"]').isChecked(), false);
    assert.equal(await page.evaluate(() => day().reflections.discipline), 'Previous reflection retained.');
    assert.match(await page.evaluate(() => summary()), /- \[x\] Discipline\n- \[ \] Emotion/);
    const priority = page.locator('#priority-done'),
      priorityCard = page.locator('.priority-card'),
      priorityFire = priorityCard.locator('.activity-fire');
    await priority.uncheck();
    assert.equal(await priorityFire.isVisible(), false);
    await priority.check();
    assert.equal(await priorityFire.isVisible(), true);
    await page.locator('#priority').fill('Write weekly report');
    await page.waitForFunction(() => !saving && editCount === savedCount);
    await page.reload();
    await card.waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await priority.isChecked(), true);
    assert.equal(await priorityFire.isVisible(), true);
    assert.equal(await page.locator('#priority').inputValue(), 'Write weekly report');
    await priority.uncheck();
    assert.equal(await priorityFire.isVisible(), false);
    await priority.check();
    assert.equal(await priorityFire.isVisible(), true);
    await priorityCard.screenshot({ path: path.join(__dirname, 'priority-fire-desktop.png') });
    await card.screenshot({ path: path.join(__dirname, 'discipline-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await card.screenshot({ path: path.join(__dirname, 'discipline-mobile.png') });
    await priorityCard.screenshot({ path: path.join(__dirname, 'priority-fire-mobile.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await fire
        .locator('.fire-tongue')
        .first()
        .evaluate(el => getComputedStyle(el).animationName),
      'none'
    );
    assert.equal(
      await priorityFire
        .locator('.fire-tongue')
        .first()
        .evaluate(el => getComputedStyle(el).animationName),
      'none'
    );
    await page.emulateMedia({ media: 'print' });
    assert.equal(await fire.isVisible(), false);
    assert.equal(await priorityFire.isVisible(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(__dirname, '../data/book.json'))
        ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
        : null,
      original
    );
    console.log(
      'PASS: two checkboxes, save/reload, uncheck, retained notes, summary, mobile layout, no browser errors, production data unchanged.'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
