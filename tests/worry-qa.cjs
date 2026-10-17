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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worry-panel-qa-'));
  // Disposable book: 2026-10-08 is a legacy day saved before the worry field existed; 2026-10-09 has no entry.
  const identity = 'Test compass: calm, curious, kind.';
  const seed = {
    version: 1,
    revision: 0,
    identity,
    days: {
      '2026-10-08': {
        schedule: [],
        tasks: [],
        priority: 'Legacy day',
        priorityDone: false,
        closed: false,
        reflections: { compass: '', fix: '', discipline: '', tomorrow: '' }
      }
    },
    goals: [],
    reviews: {}
  };
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify(seed));
  const origin = 'http://127.0.0.1:47924';
  const child = spawn(process.execPath, [path.join(__dirname, '../server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47924' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
      child.once('exit', code => reject(Error('Server exited ' + code)));
    });
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Route through Node, which also works where Chromium cannot reach localhost directly.
    await page.route(origin + '/**', async route => {
      const req = route.request();
      const res = await fetch(req.url(), {
        method: req.method(),
        headers: req.headers(),
        body: req.postDataBuffer() || undefined
      });
      await route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer())
      });
    });
    await page.goto(origin);
    await page.locator('#worry-notes').waitFor();
    async function selectDate(date) {
      await page.locator('#date').fill(date);
      await page.locator('#date').dispatchEvent('change');
    }
    await selectDate('2026-10-08');
    const field = page.locator('#worry-notes');
    assert.equal(await page.locator('#priority').inputValue(), 'Legacy day');
    assert.equal(await field.inputValue(), '');
    assert.ok((await page.locator('#identity').textContent()).includes(identity));
    const layout = await page.evaluate(() => {
      const cols = document.querySelector('.pages').getBoundingClientRect(),
        panel = document.querySelector('.worry-panel').getBoundingClientRect(),
        check = document.querySelector('.daily-checkin').getBoundingClientRect();
      return {
        colWidth: cols.width,
        panelWidth: panel.width,
        colBottom: cols.bottom,
        panelTop: panel.top,
        panelBottom: panel.bottom,
        checkTop: check.top
      };
    });
    assert.ok(Math.abs(layout.colWidth - layout.panelWidth) < 1);
    assert.ok(layout.panelTop >= layout.colBottom);
    assert.ok(layout.checkTop >= layout.panelBottom);
    const note = 'กังวลเรื่องงาน <script> & เวลา\nStrategy: เริ่มอ่านหนึ่งหน้า แล้วพัก';
    await field.fill(note);
    await page.waitForFunction(() => !saving && editCount === savedCount);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).days['2026-10-08'].reflections.worry, note);
    await page.reload();
    await selectDate('2026-10-08');
    assert.equal(await field.inputValue(), note);
    await selectDate('2026-10-09');
    assert.equal(await field.inputValue(), '');
    await selectDate('2026-10-08');
    assert.equal(await field.inputValue(), note);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#summary').click()]);
    const md = fs.readFileSync(await download.path(), 'utf8');
    assert.ok(md.includes('## What’s worrying you & how will you address it?\n' + note));
    await page.locator('.worry-panel').screenshot({ path: path.join(dir, 'desktop.png') });
    const shortHeight = (await field.boundingBox()).height;
    await field.fill(Array.from({ length: 24 }, (_, i) => 'Concern ' + i + ' → one small step').join('\n'));
    await page.waitForFunction(() => {
      const el = document.querySelector('#worry-notes');
      return el.clientHeight >= el.scrollHeight;
    });
    assert.ok((await field.boundingBox()).height > shortHeight);
    await page.waitForFunction(() => !saving && editCount === savedCount);
    await field.fill(note);
    await page.waitForFunction(() => !saving && editCount === savedCount);
    await page.setViewportSize({ width: 390, height: 844 });
    await field.scrollIntoViewIfNeeded();
    const mobile = await field.boundingBox();
    assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 390);
    await page.locator('.worry-panel').screenshot({ path: path.join(dir, 'mobile.png') });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(__dirname, '../data/book.json'))
        ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
        : null,
      original
    );
    console.log(
      'PASS: routed isolated-server browser QA: legacy-day compatibility, full width placement, autosave/reload, separate daily notes, downloaded Markdown, auto growth, mobile fit, escaped text, no browser errors, production unchanged.'
    );
    console.log('Screenshots: ' + dir);
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
