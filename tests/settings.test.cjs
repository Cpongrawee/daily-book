const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const port = 47874;
const base = `http://127.0.0.1:${port}`;

test('book settings: a valid or empty bedtime reminder saves, anything else is rejected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-settings-'));
  const child = spawn(process.execPath, [path.resolve(__dirname, '..', 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: String(port) },
    windowsHide: true
  });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('exit', c => reject(Error('server exit ' + c)));
    });
    let { book, token } = await (await fetch(base + '/api/book')).json();
    const put = settings =>
      fetch(base + '/api/book', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: base, 'X-Book-Token': token },
        body: JSON.stringify({ ...book, settings })
      });
    for (const bad of [{ bedtimeReminder: '25:00' }, { bedtimeReminder: 2230 }, [], null])
      assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
    for (const good of [{ bedtimeReminder: '23:15' }, { bedtimeReminder: '' }, {}]) {
      const r = await put(good);
      assert.equal(r.status, 200, JSON.stringify(good));
      book = (await r.json()).book;
    }
  } finally {
    const exited = new Promise(r => child.once('exit', r));
    child.kill();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
