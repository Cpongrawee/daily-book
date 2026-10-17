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
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'book-simple-')),
    output = path.join(__dirname, 'simplified-schedule');
  fs.mkdirSync(output, { recursive: true });
  const changes = [
    { kind: 'blue', actual: 'Legacy actual activity', reason: 'Legacy context', at: '2026-10-07T08:00:00Z' }
  ];
  const backup = {
    version: 1,
    revision: 0,
    identity: 'Test',
    goals: [],
    reviews: {},
    days: {
      '2026-10-07': {
        priority: 'Keep this priority',
        priorityDone: false,
        closed: false,
        proud: true,
        proudNote: 'A good day',
        tasks: [],
        reflections: { compass: '', fix: 'Keep going', discipline: '', tomorrow: '' },
        schedule: [{ id: 'legacy', time: '17:00', end: '19:00', plan: 'Original reading plan', done: true, changes }]
      }
    }
  };
  const backupPath = path.join(data, 'legacy.json');
  fs.writeFileSync(backupPath, JSON.stringify(backup));
  fs.writeFileSync(path.join(data, 'book.json'), JSON.stringify(backup));
  const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: '47902' },
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
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto('http://127.0.0.1:47902');
    await page.locator('#priority').waitFor();
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    const plan = page.locator('[data-action=plan]');
    const colors = () =>
      page
        .locator('.timeline-event')
        .first()
        .evaluate(el => ({
          bg: getComputedStyle(el).backgroundColor,
          gradient: getComputedStyle(el).backgroundImage.startsWith('linear-gradient'),
          line: getComputedStyle(el).borderLeftColor,
          ink: getComputedStyle(el.querySelector('[data-action=plan]')).color,
          time: getComputedStyle(el.querySelector('.block-range')).color
        }));
    assert.equal(await plan.inputValue(), 'Original reading plan');
    assert.equal(await plan.isEditable(), true);
    assert.equal(await page.locator('[data-action=schedule-done]').isChecked(), true);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const view of ['day', 'week', 'month']) {
        await page.locator(`[data-view=${view}]`).click();
        assert.doesNotMatch(
          await page.locator('#content').innerText(),
          /Noise|More important priority|priority changes|red changes|blue changes|Changes and their context|Legacy actual activity/
        );
        assert.equal(await page.locator('[data-action=change],#change-dialog').count(), 0);
      }
      await page.locator('[data-view=day]').click();
      // Completed activities use the champagne/gold finish; open ones keep the wine palette (checked below).
      assert.deepEqual(await colors(), {
        bg: 'rgba(0, 0, 0, 0)',
        gradient: true,
        line: 'rgb(187, 150, 83)',
        ink: 'rgb(84, 33, 42)',
        time: 'rgb(128, 97, 91)'
      });
      await page.locator('.timeline-event').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `schedule-${width}.png`) });
    }
    await plan.fill('Edited reading plan');
    await page.locator('[data-action=schedule-done]').uncheck();
    assert.deepEqual(await colors(), {
      bg: 'rgb(242, 227, 222)',
      gradient: false,
      line: 'rgb(114, 47, 55)',
      ink: 'rgb(84, 33, 42)',
      time: 'rgb(128, 97, 91)'
    });
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    await page.reload();
    await page.locator('#priority').waitFor();
    // The app always reopens on today's date, so return to the seeded day.
    await page.locator('#date').fill('2026-10-07');
    await page.locator('#date').dispatchEvent('change');
    assert.equal(await plan.inputValue(), 'Edited reading plan');
    assert.equal(await page.locator('[data-action=schedule-done]').isChecked(), false);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(data, 'book.json'))).days['2026-10-07'].schedule[0].changes,
      changes
    );
    const summaryEvent = page.waitForEvent('download');
    await page.locator('#summary').click();
    const summary = await summaryEvent;
    const summaryPath = path.join(data, 'summary.md');
    await summary.saveAs(summaryPath);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /Activity: Edited reading plan/);
    assert.doesNotMatch(fs.readFileSync(summaryPath, 'utf8'), /Legacy actual|Noise|BLUE|RED|priority changes/);
    // Activities are now added through the activity menu's "Add" dialog.
    await page.locator('[data-id=legacy] [data-action=activity-menu]').click();
    await page.locator('[data-activity-menu=add]').click();
    const form = page.locator('#activity-edit-form');
    await form.locator('[name=time]').fill('08:00');
    await form.locator('[name=end]').fill('09:00');
    await form.locator('[name=plan]').fill('New activity');
    await form.getByRole('button', { name: 'Add to schedule', exact: true }).click();
    assert.equal(await page.locator('.entry').count(), 2);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    // The saved schedule is no longer in insertion order, so find the new entry by name instead of by index.
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'book.json')));
    const added = saved.days['2026-10-07'].schedule.filter(s => s.plan === 'New activity');
    assert.deepEqual(
      added.map(s => [s.time, s.end, s.changes]),
      [['08:00', '09:00', []]]
    );
    await page.locator('[data-id=legacy] [data-action=activity-menu]').click();
    await page.locator('[data-activity-menu=delete]').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal(await page.locator('[data-id=legacy]').count(), 0);
    await page.locator('#import-file').setInputFiles(backupPath);
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Backup restored'));
    assert.equal(await plan.inputValue(), 'Original reading plan');
    assert.equal(await page.locator('[data-action=schedule-done]').isChecked(), true);
    assert.equal(await page.locator('#priority').inputValue(), 'Keep this priority');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(data, 'book.json'))).days['2026-10-07'].schedule[0].changes,
      changes
    );
    await page.emulateMedia({ media: 'print' });
    for (const view of ['day', 'week', 'month']) {
      await page.locator(`[data-view=${view}]`).evaluate(el => el.click());
      assert.doesNotMatch(await page.locator('#content').innerText(), /Noise|priority changes|Legacy actual/);
      await page.screenshot({ path: path.join(output, `print-${view}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: legacy plan editing, completion, add/delete, reload, legacy backup restore, history preservation, summary, desktop/mobile colors, print, no browser errors'
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
