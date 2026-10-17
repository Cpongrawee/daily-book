const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Board = require('../dist/idea-board.js');

const note = (over = {}) => ({
  id: 'n1',
  kind: 'note',
  text: 'Idea',
  color: 'yellow',
  x: 0,
  y: 0,
  w: 220,
  z: 1,
  ...over
});
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(
    '0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f60000000049454e44ae426082',
    'hex'
  )
]);

test('safeUrl keeps only http(s) addresses and adds https:// to bare domains', () => {
  assert.equal(Board.safeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(Board.safeUrl('  youtube.com/watch?v=x '), 'https://youtube.com/watch?v=x');
  assert.equal(Board.safeUrl('www.wikipedia.org'), 'https://www.wikipedia.org/');
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///C:/x',
    'hello world',
    'idea',
    '',
    'ftp://x.org'
  ])
    assert.equal(Board.safeUrl(bad), '', bad);
  assert.ok(Board.looksLikeUrl('https://x.org/page'));
  assert.ok(!Board.looksLikeUrl('buy milk at shop.com later'));
  assert.equal(Board.hostOf('https://www.youtube.com/watch'), 'youtube.com');
});

test('validBoard accepts notes, links and pictures and rejects unsafe or malformed cards', () => {
  const link = { id: 'l1', kind: 'link', url: 'https://example.com/', title: '', x: 5, y: 5, w: 260, z: 2 };
  const image = { id: 'i1', kind: 'image', image: 'a'.repeat(32) + '.png', ratio: 0.6, x: -40, y: 9, w: 320, z: 3 };
  assert.ok(Board.validBoard({ version: 1, items: [] }));
  assert.ok(Board.validBoard({ version: 1, items: [note(), link, image] }));
  const bad = [
    note({ color: 'purple' }),
    note({ text: 5 }),
    note({ x: NaN }),
    note({ w: 10 }),
    note({ z: 1.5 }),
    note({ kind: 'video' }),
    { ...link, url: 'javascript:alert(1)' },
    { ...link, url: 'example.com' },
    { ...image, image: '../book.json' },
    { ...image, ratio: 0 }
  ];
  for (const item of bad) assert.ok(!Board.validBoard({ version: 1, items: [item] }), JSON.stringify(item));
  assert.ok(!Board.validBoard({ version: 1, items: [note(), note()] }), 'duplicate ids');
  assert.ok(!Board.validBoard({ version: 2, items: [] }));
  assert.ok(!Board.validBoard([]));
});

test('freeSpot places a new card clear of existing ones, near the requested point', () => {
  const items = [note(), note({ id: 'n2', x: 0, y: 160 })];
  const spot = Board.freeSpot(items, { x: 0, y: 0 }, 220, 140);
  const box = { left: spot.x, top: spot.y, right: spot.x + 220, bottom: spot.y + 140 };
  for (const i of items)
    assert.ok(box.right <= i.x || i.x + i.w <= box.left || box.bottom <= i.y || i.y + 140 <= box.top);
  assert.ok(Math.hypot(spot.x, spot.y) < 400);
  assert.deepEqual(Board.freeSpot([], { x: 10.4, y: 3 }, 220, 140), { x: 10, y: 3 });
  assert.equal(Board.nextZ([note({ z: 4 }), note({ id: 'b', z: 9 })]), 10);
  assert.equal(Board.nextZ([]), 1);
});

test('itemMarkup escapes text and never builds a link from an unsafe address', () => {
  const html = Board.itemMarkup(note({ text: '<img src=x onerror=alert(1)> & "q"' }));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;'));
  const link = Board.itemMarkup({
    id: 'l',
    kind: 'link',
    url: 'https://a.org/?q="x"',
    title: '<b>',
    x: 0,
    y: 0,
    w: 260,
    z: 1
  });
  assert.ok(link.includes('href="https://a.org/?q=&quot;x&quot;"') && link.includes('rel="noopener noreferrer"'));
  assert.ok(link.includes('&lt;b&gt;'));
});

// Server: picture upload, serving, and book validation of the board.
const port = 47933,
  base = `http://127.0.0.1:${port}`,
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-board-'));
let child;
after(async () => {
  if (child && child.exitCode === null && child.signalCode === null)
    await new Promise(resolve => {
      child.once('exit', resolve);
      child.kill();
    });
  fs.rmSync(data, { recursive: true, force: true });
});

test('server stores pictures by content type, serves them, and validates board cards', async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.cjs')], {
    env: { ...process.env, DAILY_BOOK_DATA: data, DAILY_BOOK_PORT: String(port) },
    windowsHide: true
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('exit', code => reject(Error('Server exit ' + code)));
  });
  const { book, token } = await (await fetch(base + '/api/book')).json();
  const upload = (body, headers = {}) =>
    fetch(base + '/api/board-images', {
      method: 'POST',
      headers: { Origin: base, 'X-Book-Token': token, 'Content-Type': 'image/png', ...headers },
      body
    });
  assert.equal((await upload(PNG, { 'X-Book-Token': 'wrong' })).status, 403);
  assert.equal((await upload(PNG, { Origin: 'http://evil.test' })).status, 403);
  const notImage = await upload(Buffer.from('<svg onload=alert(1)></svg>          '), {
    'Content-Type': 'image/svg+xml'
  });
  assert.equal(notImage.status, 400);
  const tooBig = await upload(Buffer.concat([PNG, Buffer.alloc(8 * 1024 * 1024)]));
  assert.equal(tooBig.status, 413);

  const res = await upload(PNG, { 'Content-Type': 'image/jpeg' });
  assert.equal(res.status, 200);
  const { image } = await res.json();
  assert.match(image, /^[a-f0-9]{32}\.png$/, 'named by the real bytes, not the claimed type');
  assert.deepEqual(fs.readFileSync(path.join(data, 'board-images', image)), PNG);
  const served = await fetch(base + '/board-images/' + image);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);
  assert.equal((await fetch(base + '/board-images/' + 'b'.repeat(32) + '.png')).status, 404);
  assert.equal((await fetch(base + '/board-images/..%2Fbook.json')).status, 404);

  const put = next =>
    fetch(base + '/api/book', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: base, 'X-Book-Token': token },
      body: JSON.stringify(next)
    });
  const evil = {
    ...book,
    board: {
      version: 1,
      items: [{ id: 'x', kind: 'link', url: 'javascript:alert(1)', title: '', x: 0, y: 0, w: 260, z: 1 }]
    }
  };
  assert.equal((await put(evil)).status, 400);
  const good = {
    ...book,
    board: { version: 1, items: [note(), { id: 'p', kind: 'image', image, ratio: 1, x: 300, y: 0, w: 200, z: 2 }] }
  };
  const saved = await put(good);
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).book.board, good.board);
});
