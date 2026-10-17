const { test } = require('node:test');
const assert = require('node:assert/strict');
const { backupsToDelete, backupTime } = require('../backup-retention.cjs');
const now = Date.parse('2026-10-10T12:00:00.000Z');
const name = (ms, rev) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + rev + '.json';
const keep = (names, at = now) => {
  const gone = new Set(backupsToDelete(names, at));
  return names.filter(n => !gone.has(n));
};

test('parses backup names and ignores manual snapshots', () => {
  assert.equal(backupTime('2026-10-10T03-00-00-000Z-100.json'), Date.parse('2026-10-10T03:00:00.000Z'));
  assert.equal(backupTime('before-calendar-upgrade-20261009-120000.json'), null);
  const many = Array.from({ length: 200 }, (_, i) => name(now - 3 * 86400e3 - i * 1000, i));
  assert.ok(
    keep([...many, 'before-calendar-upgrade-20261009-120000.json']).includes(
      'before-calendar-upgrade-20261009-120000.json'
    )
  );
});

test('a burst of saves keeps the newest 30, then one per minute for the last hour', () => {
  const burst = Array.from({ length: 1500 }, (_, i) => name(now - i * 1e3, 5000 - i)); // one save per second for 25 min
  const recent = keep(burst);
  assert.deepEqual(recent.slice(0, 30), burst.slice(0, 30));
  assert.ok(recent.length >= 30 + 23 && recent.length <= 30 + 26, `kept ${recent.length}`); // ~25 one-minute buckets
  const old = Array.from({ length: 150 }, (_, i) => name(now - 2 * 3600e3 - i * 10e3, 1000 - i)); // same burst, two hours ago
  const kept = keep(old);
  assert.ok(kept.length <= 30 + 3, 'thinned to 15-minute buckets');
  assert.equal(kept[0], old[0], 'newest is always kept');
});

test('a morning mistake can still be undone in the evening', () => {
  // Saves every 20 seconds from 07:00 to 19:00 Bangkok (00:00–12:00 UTC).
  const names = [];
  for (let t = Date.parse('2026-10-10T00:00:00Z'), r = 0; t <= now; t += 20e3, r++) names.push(name(t, r));
  const kept = keep(names).map(backupTime);
  const morning = Date.parse('2026-10-10T02:00:00Z'); // 09:00 Bangkok
  assert.ok(
    kept.some(t => t <= morning && t > morning - 15 * 60e3),
    'a snapshot within 15 minutes before 09:00 survives'
  );
  assert.ok(kept.length <= 30 + 60 + 45, `kept ${kept.length} of ${names.length}`);
});

test('older history keeps one per day, then one per week', () => {
  const names = [];
  for (let d = 0; d < 200; d++)
    for (let h = 0; h < 5; h++) names.push(name(now - d * 86400e3 - h * 3600e3 - 2 * 86400e3, d * 10 + h));
  const kept = keep(names).map(backupTime);
  // Past the newest 30 (about six days here), each Bangkok date keeps exactly one backup.
  const window = kept.filter(t => now - t >= 10 * 86400e3 && now - t < 89 * 86400e3);
  const days = new Set(window.map(t => new Date(t + 7 * 3600e3).toISOString().slice(0, 10)));
  assert.equal(window.length, days.size, 'one per day');
  assert.ok(days.size >= 78, `daily history retained: ${days.size}`);
  const ancient = kept.filter(t => now - t >= 90 * 86400e3);
  assert.ok(ancient.length >= 14 && ancient.length <= 17, `about one per week for ~110 days: ${ancient.length}`);
});
