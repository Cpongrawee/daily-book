const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const R = require('../reminder.cjs');
const at = iso => Date.parse(iso); // UTC; Bangkok is +7
test('due once the reminder time passes in Bangkok, unless the day is reviewed or reminders are off', () => {
  const book = { days: { '2026-10-10': { closed: false } } };
  assert.equal(R.isDue(book, '', at('2026-10-10T15:29:00Z')), false, '22:29 Bangkok');
  assert.equal(R.isDue(book, '', at('2026-10-10T15:30:00Z')), true, '22:30 Bangkok');
  assert.equal(R.isDue(book, '2026-10-10', at('2026-10-10T16:00:00Z')), false, 'already reminded tonight');
  assert.equal(
    R.isDue({ days: { '2026-10-10': { closed: true } } }, '', at('2026-10-10T16:00:00Z')),
    false,
    'reviewed'
  );
  assert.equal(R.isDue({ days: {} }, '', at('2026-10-10T16:00:00Z')), true, 'no page yet still reminds');
  assert.equal(R.isDue({ settings: { bedtimeReminder: '' }, days: {} }, '', at('2026-10-10T16:00:00Z')), false, 'off');
  assert.equal(
    R.isDue({ settings: { bedtimeReminder: '23:15' }, days: {} }, '', at('2026-10-10T16:00:00Z')),
    false,
    '23:00 < 23:15'
  );
  assert.equal(R.isDue(book, '', at('2026-10-10T17:10:00Z')), false, '00:10 is a new day before its reminder time');
});
test('createReminder notifies once per evening and remembers it across restarts', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-reminder-'));
  try {
    let clock = at('2026-10-10T15:31:00Z');
    const sent = [];
    const book = { days: {} };
    const make = () =>
      R.createReminder({
        data,
        origin: 'http://127.0.0.1:1',
        getBook: () => book,
        notify: m => sent.push(m),
        now: () => clock,
        interval: 1e9
      });
    let r = make();
    assert.equal(r.check(), true);
    assert.equal(r.check(), false);
    r.close();
    r = make();
    clock += 10 * 60e3;
    assert.equal(r.check(), false, 'restart does not repeat');
    r.close();
    clock = at('2026-10-11T15:31:00Z');
    r = make();
    assert.equal(r.check(), true, 'next evening');
    r.close();
    assert.equal(sent.length, 2);
    assert.equal(sent[0].url, 'http://127.0.0.1:1/');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
