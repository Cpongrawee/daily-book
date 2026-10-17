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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idea-board-qa-'));
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({ version: 1, revision: 0, identity: '', days: {}, goals: [], reviews: {} })
  );
  const origin = 'http://127.0.0.1:47934';
  const child = spawn(process.execPath, [path.join(__dirname, '../server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: '47934' },
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(),
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
    const saved = () => page.waitForFunction(() => !saving && editCount === savedCount);
    const stored = () => JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).board?.items || [];
    const openBoard = async () => {
      await page.locator('[data-view="board"]').click();
      await page.locator('.board-viewport').waitFor();
    };
    await page.goto(origin);
    await page.locator('#priority').waitFor();
    await openBoard();
    assert.equal(await page.locator('#page-title').textContent(), 'Idea Board');
    assert.ok(await page.locator('.date-nav').first().isHidden());
    assert.ok(await page.locator('.board-empty').isVisible());

    // Double-click the slate: a note opens for writing; clicking away keeps it.
    const vp = await page.locator('.board-viewport').boundingBox();
    await page.mouse.dblclick(vp.x + 200, vp.y + 150);
    const thai = 'ไอเดียใหม่ <b>&</b>\nlearn watercolor';
    await page.locator('.board-note-edit').fill(thai);
    await page.mouse.click(vp.x + vp.width - 60, vp.y + vp.height - 60);
    await saved();
    assert.equal(stored().length, 1);
    assert.equal(stored()[0].text, thai);
    assert.equal(await page.locator('.board-note-text').innerText(), thai);
    assert.ok(await page.locator('.board-empty').isHidden());

    // Colour swatch.
    await page.locator('.board-note').hover();
    await page.locator('[data-board-color="pink"]').click();
    await saved();
    assert.equal(stored()[0].color, 'pink');
    assert.ok(await page.locator('.board-note.note-pink').isVisible());

    // Link form refuses a javascript: address, then pins a real one.
    await page.locator('[data-board-add="link"]').click();
    await page.locator('.board-link-form [name=url]').fill('javascript:alert(1)');
    await page.locator('[data-board-link-submit]').click();
    assert.ok(await page.locator('.board-link-form').isVisible());
    assert.equal(stored().length, 1);
    await page.locator('.board-link-form [name=url]').fill('youtube.com/watch?v=abc');
    await page.locator('.board-link-form [name=title]').fill('Cool video');
    await page.locator('[data-board-link-submit]').click();
    await saved();
    const link = stored().find(i => i.kind === 'link');
    assert.equal(link.url, 'https://youtube.com/watch?v=abc');
    assert.equal(await page.locator('.board-link').getAttribute('href'), link.url);
    assert.equal(await page.locator('.board-link').getAttribute('target'), '_blank');

    // A picture from the file picker is uploaded, shrunk to card size and shown.
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 900;
      c.height = 600;
      const g = c.getContext('2d');
      g.fillStyle = '#e07a2f';
      g.fillRect(0, 0, 900, 600);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('[data-board-file]').setInputFiles({
      name: 'trip.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64')
    });
    await page.locator('.board-image img').waitFor();
    await saved();
    const pic = stored().find(i => i.kind === 'image');
    assert.ok(fs.existsSync(path.join(dir, 'board-images', pic.image)));
    assert.equal(pic.w, 320);
    assert.ok(Math.abs(pic.ratio - 600 / 900) < 0.001);
    await page.waitForFunction(() => document.querySelector('.board-image img').naturalWidth === 900);

    // An unsupported phone photo explains what to do instead.
    await page.locator('[data-board-file]').setInputFiles({
      name: 'IMG_1.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('not really heic')
    });
    await page.waitForFunction(() => document.querySelector('.board-status').textContent.includes('JPG'));
    assert.equal(stored().length, 3);

    // Pasting a single address makes a link card; pasting plain text makes a note.
    await page.locator('.board-viewport').focus();
    await page.evaluate(() => {
      for (const text of ['https://www.wikipedia.org/', 'Buy groceries on Sunday']) {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }));
      }
    });
    await saved();
    assert.ok(stored().some(i => i.kind === 'link' && i.url === 'https://www.wikipedia.org/'));
    assert.ok(stored().some(i => i.kind === 'note' && i.text === 'Buy groceries on Sunday'));

    // New cards don't land on top of each other.
    const boxes = await page
      .locator('.board-item')
      .evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a],
          B = boxes[b];
        assert.ok(
          A.right <= B.left + 8 || B.right <= A.left + 8 || A.bottom <= B.top + 8 || B.bottom <= A.top + 8,
          'cards overlap'
        );
      }

    // Drag a note with the mouse: the new place is saved.
    const first = page.locator('.board-note.note-pink');
    const before = stored().find(i => i.text === thai);
    const box = await first.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 160, { steps: 6 });
    await page.mouse.up();
    await saved();
    const moved = stored().find(i => i.text === thai);
    assert.equal(moved.x - before.x, 100);
    assert.equal(moved.y - before.y, 100);

    // Dragging a link card must not open the link.
    const pages = context.pages().length;
    const linkBox = await page.locator('.board-link-card').first().boundingBox();
    await page.mouse.move(linkBox.x + 60, linkBox.y + linkBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(linkBox.x + 60, linkBox.y + linkBox.height / 2 + 80, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.equal(context.pages().length, pages);
    await saved();

    // Wheel zooms around the pointer; Fit all brings every card into view.
    await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
    await page.mouse.wheel(0, 400);
    assert.notEqual(await page.locator('[data-board-zoom-level]').textContent(), '100%');
    await page.locator('[data-board-fit]').click();
    const view = await page.locator('.board-viewport').boundingBox();
    for (const b of await page
      .locator('.board-item')
      .evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON())))
      assert.ok(
        b.left >= view.x - 1 &&
          b.right <= view.x + view.width + 1 &&
          b.top >= view.y - 10 &&
          b.bottom <= view.y + view.height + 1
      );

    // Keyboard: Enter edits, Delete removes, the sidebar Undo brings it back.
    const count = stored().length;
    await page.locator('.board-note').last().focus();
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('.board-note-edit').isVisible());
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await saved();
    await page.keyboard.press('Delete');
    await saved();
    assert.equal(stored().length, count - 1);
    await page.locator('#undo').click();
    await saved();
    assert.equal(stored().length, count);

    // Everything is there after a reload, pictures included.
    await page.reload();
    await page.locator('#priority').waitFor();
    await openBoard();
    assert.equal(await page.locator('.board-item').count(), count);
    await page.waitForFunction(() => document.querySelector('.board-image img').naturalWidth > 0);
    await page.locator('.board-frame').screenshot({ path: path.join(dir, 'desktop.png') });

    // Phone width: no sideways page scroll, toolbar still reachable.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    assert.ok(await page.locator('[data-board-add="note"]').isVisible());
    await page.locator('.board-frame').screenshot({ path: path.join(dir, 'mobile.png') });

    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.existsSync(path.join(__dirname, '../data/book.json'))
        ? fs.readFileSync(path.join(__dirname, '../data/book.json'))
        : null,
      original
    );
    console.log(
      'PASS: Idea Board browser QA: empty state, double-click note with Thai text, colours, safe link form, picture upload and resize, HEIC message, paste link/text, no overlapping cards, mouse drag saved, link not opened by drag, wheel zoom and fit, keyboard edit/move/delete, undo, reload persistence, mobile fit, no browser errors, production unchanged.'
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
