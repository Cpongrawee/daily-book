const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const server = path.resolve(__dirname, '..', 'server.cjs');
const port = 47871;
const base = `http://127.0.0.1:${port}`;
const book = (revision, note = '') => ({
  version: 1,
  revision,
  identity: 'Test',
  days: note
    ? {
        '2026-10-01': {
          schedule: [],
          priority: note,
          priorityDone: false,
          tasks: [],
          reflections: { compass: '', fix: '', discipline: '', tomorrow: '' },
          closed: false
        }
      }
    : {},
  goals: [],
  reviews: {},
  calendar: { version: 1, events: {} }
});
function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-recovery-'));
  fs.mkdirSync(path.join(dir, 'backups'));
  for (const [name, content] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  return dir;
}
// Resolves with the running child, or with its exit code if it stops first.
function start(dir, env = {}) {
  const child = spawn(process.execPath, [server], {
    env: { ...process.env, DAILY_BOOK_DATA: dir, DAILY_BOOK_PORT: String(port), ...env },
    windowsHide: true
  });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', d => String(d).includes('ready') && resolve({ child }));
    child.once('exit', code => resolve({ code }));
    child.once('error', reject);
  });
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(r => child.once('exit', r));
  child.kill();
  await exited;
}
async function withServer(dir, check) {
  const { child, code } = await start(dir);
  assert.equal(code, undefined, 'server should start');
  try {
    await check();
  } finally {
    await stop(child);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a damaged book reopens from the newest good backup and keeps the damaged file', async () => {
  const dir = folder({
    'book.json': '{"version":1,"revis',
    'backups/2026-10-09T01-00-00-000Z-5.json': book(5, 'older'),
    'backups/2026-10-10T01-00-00-000Z-7.json': book(7, 'newest'),
    'backups/2026-10-10T02-00-00-000Z-8.json': '{broken'
  });
  await withServer(dir, async () => {
    const data = await (await fetch(base + '/api/book')).json();
    assert.equal(data.book.revision, 7);
    assert.equal(data.book.days['2026-10-01'].priority, 'newest');
    assert.match(data.notice, /it is damaged.*revision 7.*book\.damaged-/);
    assert.equal(fs.readdirSync(dir).filter(n => n.startsWith('book.damaged-')).length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'book.json'))).revision, 7);
    const saved = await fetch(base + '/api/book', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: base, 'X-Book-Token': data.token },
      body: JSON.stringify({ ...data.book, identity: 'Saved after recovery' })
    });
    assert.equal(saved.status, 200);
    assert.equal((await (await fetch(base + '/api/book')).json()).notice, undefined, 'notice clears after a save');
  });
});

test('a missing book with backups is restored instead of starting empty', async () => {
  const dir = folder({ 'backups/2026-10-10T01-00-00-000Z-3.json': book(3, 'keep me') });
  await withServer(dir, async () => {
    const data = await (await fetch(base + '/api/book')).json();
    assert.equal(data.book.days['2026-10-01'].priority, 'keep me');
    assert.match(data.notice, /it is missing/);
    assert.doesNotMatch(data.notice, /unreadable file was kept/);
  });
});

test('an unfinished save newer than every backup is preferred', async () => {
  const dir = folder({
    'book.json': '',
    'book.json.tmp': book(9, 'unfinished save'),
    'backups/2026-10-10T01-00-00-000Z-8.json': book(8, 'backup')
  });
  await withServer(dir, async () => {
    const data = await (await fetch(base + '/api/book')).json();
    assert.equal(data.book.days['2026-10-01'].priority, 'unfinished save');
    assert.match(data.notice, /an unfinished save/);
  });
});

test('a first run with no book and no backups starts an empty book without a notice', async () => {
  await withServer(folder({}), async () => {
    const data = await (await fetch(base + '/api/book')).json();
    assert.equal(data.book.revision, 0);
    assert.equal(data.notice, undefined);
  });
});

test('with nothing to recover, the server stops, keeps the file and logs why', async () => {
  const dir = folder({ 'book.json': 'not json' });
  try {
    const { code } = await start(dir);
    assert.equal(code, 1);
    assert.equal(fs.readFileSync(path.join(dir, 'book.json'), 'utf8'), 'not json');
    assert.match(
      fs.readFileSync(path.join(dir, 'server-error.log'), 'utf8'),
      /it is damaged, and no good backup was found/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a busy port is reported in the log', async () => {
  const first = folder({}),
    second = folder({});
  const { child } = await start(first);
  try {
    const { code } = await start(second);
    assert.equal(code, 1);
    assert.match(fs.readFileSync(path.join(second, 'server-error.log'), 'utf8'), /Port 47871 is already used/);
  } finally {
    await stop(child);
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});
