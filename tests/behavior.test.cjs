const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../dist/behavior.js');
const day = (n, closed = false) => ({ closed, checkin: { sets: Array(n).fill(true) } });
test('training threshold and review status', () => {
  for (const n of [4, 5, 10])
    for (const closed of [true, false])
      assert.equal(
        B.status(day(n, closed), 'training', '2026-10-07', '2026-10-08'),
        n >= 5 ? 'success' : closed ? 'failure' : 'unknown'
      );
  assert.equal(B.status(day(4), 'training', '2026-10-08', '2026-10-08'), 'pending');
  assert.equal(B.status({}, 'review', '2026-10-07', '2026-10-08'), 'unknown');
});
test('tasks, blank titles, carried plans and read-only aggregation', () => {
  const days = {
    '2026-10-01': {
      closed: true,
      priority: ' ',
      priorityDone: true,
      tasks: [
        { text: 'A', done: true },
        { text: 'B', done: false },
        { text: ' ', done: true }
      ]
    },
    '2026-10-02': { tasks: [{ text: 'B', done: true }] },
    '2026-10-03': {
      tasks: [
        { text: 'C', done: true },
        { text: 'D', done: false }
      ]
    }
  };
  const before = JSON.stringify(days);
  const s = B.summarize(days, '2026-10-01', '2026-10-04', '2026-10-03');
  const r = s.rows[1];
  assert.deepEqual(r.counts, { success: 3, failure: 1, unknown: 0, pending: 1, na: 0 });
  assert.equal(r.rate, 75);
  assert.equal(r.knownDays, 3);
  assert.equal(r.best, 1);
  assert.equal(r.current, 1);
  assert.equal(s.rows[0].counts.na, 3);
  assert.equal(s.dates.length, 3);
  assert.equal(JSON.stringify(days), before);
});
test('streak crosses month, gaps break and reopening recalculates', () => {
  const days = {
    '2026-10-30': day(5, true),
    '2026-10-31': day(5, true),
    '2026-11-01': day(5, true),
    '2026-11-02': day(4)
  };
  let r = B.summarize(days, '2026-11-01', '2026-11-30', '2026-11-02').rows[3];
  assert.equal(r.current, 3);
  assert.equal(r.best, 1);
  days['2026-11-02'].closed = true;
  assert.equal(B.current(days, 'training', '2026-11-02'), 0);
  days['2026-11-02'].closed = false;
  assert.equal(B.current(days, 'training', '2026-11-02'), 3);
  delete days['2026-10-31'];
  assert.equal(B.current(days, 'training', '2026-11-02'), 1);
});
test('empty and future ranges, review never fails, real zero rate', () => {
  assert.equal(B.summarize({}, '2026-11-01', '2026-11-30', '2026-10-08').dates.length, 0);
  const s = B.summarize({ '2026-10-01': { closed: true } }, '2026-10-01', '2026-10-02', '2026-10-08');
  assert.equal(s.rows[3].rate, 0);
  assert.equal(s.rows[5].counts.failure, 0);
  assert.equal(s.rows[0].rate, null);
  assert.deepEqual(B.presetRange('week', '2026-10-01'), ['2026-09-27', '2026-10-03']);
});
test('ranges follow the current quarter across the new year', () => {
  assert.deepEqual(B.quarterOf('2026-11-15'), ['2026-10-01', '2026-12-31']);
  assert.deepEqual(B.quarterOf('2027-01-01'), ['2027-01-01', '2027-03-31']);
  assert.deepEqual(B.presetRange('quarter', '2027-01-05'), ['2027-01-01', '2027-03-31']);
  assert.deepEqual(B.presetRange('month', '2027-02-10'), ['2027-02-01', '2027-02-28']);
  assert.deepEqual(B.presetRange('2028-02', '2028-01-10'), ['2028-02-01', '2028-02-29']);
  assert.deepEqual(B.presetRange('week', '2027-01-01'), ['2026-12-27', '2027-01-02']);
  const m = B.markup('2027-01-05');
  for (const s of ['January 2027', 'February 2027', 'March 2027', 'All Q1 2027']) assert.ok(m.includes(s), s);
  assert.ok(!m.includes('October'));
});
test('streaks continue past December 31', () => {
  const days = { '2026-12-30': day(5, true), '2026-12-31': day(5, true), '2027-01-01': day(5, true) };
  assert.equal(B.current(days, 'training', '2027-01-01'), 3);
  assert.equal(B.summarize(days, '2026-12-01', '2027-01-31', '2027-01-01').rows[3].best, 3);
});
