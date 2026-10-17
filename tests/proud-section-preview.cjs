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
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'book-fire-'));
  const schedule = [
    ['long', '08:00', '10:00', 'Finished study', true],
    ['short', '10:30', '10:45', 'Quick workout', false],
    ['parallel', '08:00', '09:00', 'Finished reading', true],
    ['overlap', '09:15', '09:45', 'Finished call', true],
    ['tiny', '11:00', '11:05', 'Five minute break', true]
  ].map(([id, time, end, plan, done]) => ({ id, time, end, plan, done, changes: [] }));
  fs.writeFileSync(
    path.join(data, 'book.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
      identity: 'Test',
      goals: [],
      reviews: {},
      days: {
        '2026-10-08': {
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
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47858' },
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
    await page.goto('http://127.0.0.1:47858');
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-08');
    await page.locator('#date').dispatchEvent('change');
    const card = id => page.locator(`[data-event-id=${id}]`),
      fire = id => card(id).locator('.activity-fire'),
      check = id => card(id).locator('[data-action=schedule-done]'),
      saved = () => page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal(await fire('long').isVisible(), true);
    assert.equal(await fire('short').isVisible(), false);
    assert.equal(await fire('long').getAttribute('aria-hidden'), 'true');
    assert.equal(await fire('long').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await card('long').scrollIntoViewIfNeeded();
    const flame = card('long').locator('.fire-tongue').first();
    assert.equal(await flame.evaluate(el => el.getAnimations().length), 1);
    const transforms = await flame.evaluate(async el => {
      const a = getComputedStyle(el).transform;
      await new Promise(r => setTimeout(r, 250));
      return [a, getComputedStyle(el).transform];
    });
    assert.notEqual(transforms[0], transforms[1]);
    // Selecting a long background activity must never cover nested activity controls.
    const nestedVisible = () =>
      card('overlap')
        .locator('[data-action=schedule-done]')
        .evaluate(el => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === el || el.contains(hit);
        });
    await card('overlap').scrollIntoViewIfNeeded();
    assert.equal(await nestedVisible(), true);
    await check('long').uncheck();
    await saved();
    assert.equal(await nestedVisible(), true, 'completion must preserve nested controls');
    await check('long').check();
    await saved();
    assert.equal(await nestedVisible(), true);
    await check('long').focus();
    assert.equal(await nestedVisible(), true, 'keyboard focus must preserve nested controls');
    await card('long').locator('[data-action=activity-menu]').click();
    assert.equal(await nestedVisible(), true, 'menu must preserve nested controls');
    await page.keyboard.press('Escape');
    const rim = card('long').locator('.activity-gold-frame');
    assert.equal(await rim.isVisible(), true);
    assert.equal(await card('short').locator('.activity-gold-frame').isVisible(), false);
    const angles = await rim.evaluate(async el => {
      const a = getComputedStyle(el, '::before').getPropertyValue('--activity-gold-angle');
      await new Promise(r => setTimeout(r, 250));
      return [a, getComputedStyle(el, '::before').getPropertyValue('--activity-gold-angle')];
    });
    assert.notEqual(angles[0], angles[1]);
    assert.equal(await rim.evaluate(el => getComputedStyle(el, '::before').padding), '2px');
    assert.equal(await rim.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    assert.equal(
      await card('long')
        .locator('.gold-spark')
        .first()
        .evaluate(el => el.getAnimations().length),
      1
    );
    const geometry = () =>
      card('short').evaluate(el => ({
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight
      }));
    const beforeGeometry = await geometry();
    await check('short').check();
    assert.equal(await fire('short').isVisible(), true);
    await saved();
    await page.reload();
    await page.locator('#priority').waitFor();
    assert.equal(await fire('short').isVisible(), true);
    assert.deepEqual(await geometry(), beforeGeometry);
    assert.equal(
      await card('tiny')
        .locator('.activity-gold-frame')
        .evaluate(el => el.offsetHeight),
      28
    );
    await check('short').uncheck();
    assert.equal(await fire('short').isVisible(), false);
    await saved();
    await page.locator('#undo').click();
    await saved();
    assert.equal(await fire('short').isVisible(), true);
    assert.equal(await card('short').locator('.activity-gold-frame').isVisible(), true);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await card('long').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(__dirname, `activity-fire-${width}.png`) });
      await card('short').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(__dirname, `activity-fire-compact-${width}.png`) });
      await card('short').locator('[data-action=activity-menu]').click();
      await page.locator('[data-activity-menu=edit]').click();
      assert.equal(await page.locator('#activity-edit-form [name=done]').isChecked(), true);
      await page.locator('#activity-edit-cancel').click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('.proud-check').screenshot({ path: path.join(__dirname, 'proud-section-' + width + '.png') });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#proud-today').check();
    await saved();
    await page.locator('.proud-check').screenshot({ path: path.join(__dirname, 'proud-section-checked.png') });
    await page.locator('[data-view=proud]').click();
    const proud = page.locator('.heat-day[data-open-date="2026-10-08"]');
    assert.equal(await proud.locator('.activity-fire').isVisible(), true);
    assert.equal(await page.locator('.heat-day:not(.is-proud) .activity-fire').count(), 0);
    assert.equal(await proud.locator('.fire-tongue').count(), 7);
    await proud.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(__dirname, 'proud-fire-1440.png') });
    await page.setViewportSize({ width: 390, height: 1000 });
    await proud.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(__dirname, 'proud-fire-390.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await proud
        .locator('.fire-tongue')
        .first()
        .evaluate(el => getComputedStyle(el).animationName),
      'none'
    );
    await page.emulateMedia({ media: 'print' });
    assert.equal(await proud.locator('.activity-fire').isVisible(), false);
    await page.emulateMedia({ media: 'screen', reducedMotion: 'no-preference' });
    await proud.click();
    await page.locator('#proud-today').waitFor();
    assert.equal(await page.locator('#proud-today').isChecked(), true);
    await page.locator('#proud-today').uncheck();
    await saved();
    await page.locator('[data-view=proud]').click();
    assert.equal(await page.locator('.heat-day[data-open-date="2026-10-08"] .activity-fire').count(), 0);
    await page.locator('.heat-day[data-open-date="2026-10-08"]').click();
    await page.locator('#priority').waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await flame.evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await card('long').locator('.fire-ember').first().isVisible(), false);
    assert.equal(await rim.evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
    assert.equal(
      await card('long')
        .locator('.gold-spark')
        .first()
        .evaluate(el => getComputedStyle(el).animationName),
      'none'
    );
    await page.emulateMedia({ media: 'print' });
    assert.equal(await fire('long').isVisible(), false);
    assert.equal(await rim.isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Legendary fire, animated 2px gold rim and sparkles, unchanged geometry, toggle/Undo/reload, parallel/overlapping/compact cards, menus, mobile 390/320, reduced motion and print'
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
