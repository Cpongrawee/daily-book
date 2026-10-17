const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert/strict'),
  { spawn } = require('child_process');
const { chromium } = require('playwright');
(async () => {
  const original = fs.existsSync(path.join(__dirname, '../data/book.json'))
      ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
      : null,
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mood-continuous-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47922' },
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
    await page.goto('http://127.0.0.1:47922');
    await page.locator('.daily-checkin summary').click();
    const exact = page.locator('#exact-mood'),
      slider = page.locator('#mood-slider');
    const save = () =>
      page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('✓ Saved'));
    assert.equal(await exact.inputValue(), '');
    assert.equal(await slider.getAttribute('aria-valuetext'), 'Not recorded');
    const note = page.locator('#mood-note'),
      noteText = 'วันนี้เหนื่อยนิดหน่อย แต่ดีใจที่ได้ออกกำลังกาย\nพักแล้วรู้สึกดีขึ้น <3';
    assert.equal(await note.inputValue(), '');
    await note.fill(noteText);
    await save();
    for (const [n, rounded] of [
      ['-3', '-3.0'],
      ['3', '3.0'],
      ['2.56', '2.6'],
      ['-1.25', '-1.3'],
      ['0.123456', '0.1']
    ]) {
      await exact.fill(n);
      await exact.press('Tab');
      assert.equal(await exact.inputValue(), rounded);
      assert.equal(Number(await slider.inputValue()), Number(rounded));
      await save();
    }
    await page.reload();
    await page.locator('.daily-checkin summary').click();
    assert.equal(await exact.inputValue(), '0.1');
    assert.equal(await note.inputValue(), noteText);
    assert.ok(
      await page.evaluate(() => summary().includes('Mood note: ' + document.querySelector('#mood-note').value))
    );
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'book.json'), 'utf8'));
    assert.equal(Object.values(saved.days)[0].checkin.mood, 0.1);
    assert.equal(Object.values(saved.days)[0].checkin.moodNote, noteText);
    await exact.fill('3.01');
    await exact.press('Tab');
    assert.equal(await exact.evaluate(el => el.checkValidity()), false);
    assert.equal(await slider.inputValue(), '0.1');
    await exact.fill('2.5');
    await exact.press('Tab');
    await slider.focus();
    await slider.press('ArrowLeft');
    assert.equal(await exact.inputValue(), '2.4');
    await slider.press('Home');
    assert.equal(await exact.inputValue(), '-3.0');
    await slider.press('End');
    assert.equal(await exact.inputValue(), '3.0');
    const box = await slider.boundingBox();
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height / 2);
    const value = Number(await exact.inputValue());
    assert.ok(value > 0 && value < 2 && !Number.isInteger(value));
    assert.equal(Number(await slider.inputValue()), value);
    assert.match(await exact.inputValue(), /^-?\d\.\d$/);
    await save();
    await page
      .locator('.mood-checkin:not(.energy-checkin)')
      .screenshot({ path: path.join(__dirname, 'mood-continuous-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page
      .locator('.mood-checkin:not(.energy-checkin)')
      .screenshot({ path: path.join(__dirname, 'mood-continuous-mobile.png') });
    await page.locator('#clear-mood').click();
    assert.equal(await exact.inputValue(), '');
    assert.equal(await slider.getAttribute('aria-valuetext'), 'Not recorded');
    await save();
    assert.equal(await note.inputValue(), noteText);
    await page.reload();
    await page.locator('.daily-checkin summary').click();
    assert.equal(await exact.inputValue(), '');
    assert.equal(await note.inputValue(), noteText);
    const firstDate = await page.locator('#date').inputValue(),
      otherDate = firstDate === '2026-10-09' ? '2026-10-10' : '2026-10-09';
    await page.locator('#date').fill(otherDate);
    await page.locator('#date').dispatchEvent('change');
    await page.locator('.daily-checkin summary').click();
    assert.equal(await note.inputValue(), '');
    await note.fill('หมายเหตุของอีกวัน');
    await save();
    await page.locator('#date').fill(firstDate);
    await page.locator('#date').dispatchEvent('change');
    await page.locator('.daily-checkin summary').click();
    assert.equal(await note.inputValue(), noteText);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(__dirname, '../data/book.json'))
        ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
        : null,
      original
    );
    console.log(
      'PASS: mood rounding; Thai multiline note autosave, reload, separate dates, summary, retained after clearing score; desktop/mobile layout; production data unchanged.'
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
