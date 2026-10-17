const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validWeight, validFat, series, summarize, axisRange } = require('../dist/body-metrics.js');
test('weight and body fat validation accepts numeric strings in range only', () => {
  assert.ok(validWeight('70.5'));
  assert.ok(validWeight(70));
  for (const v of ['', null, undefined, 'abc', '19.9', '401']) assert.equal(validWeight(v), false);
  assert.ok(validFat('20.5'));
  for (const v of ['', '1.9', '75.1', 'x']) assert.equal(validFat(v), false);
});
test('series includes gaps, derives lean mass, and does not modify days', () => {
  const days = {
    '2026-10-01': { checkin: { weight: '70', bodyFat: '20' } },
    '2026-10-03': { checkin: { weight: '69', bodyFat: 'bad' } }
  };
  const before = JSON.stringify(days),
    rows = series(days, '2026-10-01', '2026-10-03');
  assert.deepEqual(
    rows.map(d => d.date),
    ['2026-10-01', '2026-10-02', '2026-10-03']
  );
  assert.equal(rows[0].weight, 70);
  assert.equal(rows[0].bodyFat, 20);
  assert.equal(rows[0].lean, 56);
  assert.equal(rows[1].weight, null);
  assert.equal(rows[2].bodyFat, null);
  assert.equal(rows[2].lean, null);
  assert.equal(JSON.stringify(days), before);
  const s = summarize(rows);
  assert.equal(s.weight.count, 2);
  assert.equal(s.weight.latest, 69);
  assert.equal(s.weight.change, -1);
  assert.equal(s.bodyFat.change, null);
});
test('axis range covers all values with equal steps', () => {
  for (const vals of [[70.2, 71.8, 69.4], [18], [], [55, 95]]) {
    const r = axisRange(vals, 60, 80);
    for (const v of vals) assert.ok(v >= r.lo && v <= r.hi);
    assert.ok(r.hi > r.lo);
  }
});
