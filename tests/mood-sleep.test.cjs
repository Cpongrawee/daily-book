const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sleepMinutes, validMood, series, pearson, summarize } = require('../dist/mood-sleep.js');
test('sleep calculation uses the explicit bedtime day, with zero and 24 hours preserved', () => {
  assert.equal(sleepMinutes({ bedtime: '23:00', wakeTime: '07:00', bedDay: 'previous' }), 480);
  assert.equal(sleepMinutes({ bedtime: '01:00', wakeTime: '07:00', bedDay: 'today' }), 360);
  assert.equal(sleepMinutes({ bedtime: '07:00', wakeTime: '07:00', bedDay: 'today' }), 0);
  assert.equal(sleepMinutes({ bedtime: '07:00', wakeTime: '07:00', bedDay: 'previous' }), 1440);
  for (const c of [
    {},
    { bedtime: '23:00' },
    { bedtime: '25:00', wakeTime: '07:00' },
    { bedtime: '23:00', wakeTime: '07:00', bedDay: 'today' },
    { bedtime: '01:00', wakeTime: '07:00', bedDay: 'previous' },
    { bedtime: '23:00', wakeTime: '07:00', bedDay: 'invalid' }
  ])
    assert.equal(sleepMinutes(c), null);
});
test('series includes gaps and reads without creating days; mood zero remains valid', () => {
  const days = {
    '2026-10-01': { checkin: { mood: 0, bedtime: '23:00', wakeTime: '07:00' } },
    '2026-10-03': { checkin: { mood: 4, bedtime: '01:00', wakeTime: '07:00', bedDay: 'today' } }
  };
  const before = JSON.stringify(days),
    values = series(days, '2026-10-01', '2026-10-03');
  assert.deepEqual(
    values.map(d => d.date),
    ['2026-10-01', '2026-10-02', '2026-10-03']
  );
  assert.equal(values[0].mood, 0);
  assert.equal(values[0].sleep, 8);
  assert.equal(values[0].bedtimeDate, '2026-09-30');
  assert.equal(values[1].mood, null);
  assert.equal(values[1].sleep, null);
  assert.equal(values[2].mood, null);
  assert.equal(values[2].sleep, 6);
  assert.equal(JSON.stringify(days), before);
  for (const mood of [null, undefined, '0', NaN, Infinity, 4, -4]) assert.equal(validMood(mood), false);
  assert.equal(validMood(0.9), true);
  assert.equal(validMood(-0.2), true);
  assert.equal(series({ '2026-10-01': { checkin: { mood: 0.9 } } }, '2026-10-01', '2026-10-01')[0].mood, 0.9);
});
test('Pearson handles +1, -1, 0, insufficient pairs and constant values', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);
  near(
    pearson([
      { sleep: 1, mood: -1 },
      { sleep: 2, mood: 0 },
      { sleep: 3, mood: 1 }
    ]).r,
    1
  );
  near(
    pearson([
      { sleep: 1, mood: 1 },
      { sleep: 2, mood: 0 },
      { sleep: 3, mood: -1 }
    ]).r,
    -1
  );
  near(
    pearson([
      { sleep: 1, mood: 1 },
      { sleep: 2, mood: -2 },
      { sleep: 3, mood: 1 }
    ]).r,
    0
  );
  assert.equal(
    pearson([
      { sleep: 1, mood: 0 },
      { sleep: null, mood: 1 },
      { sleep: 2, mood: null }
    ]).n,
    1
  );
  assert.equal(
    pearson([
      { sleep: 1, mood: 1 },
      { sleep: 2, mood: 2 }
    ]).r,
    null
  );
  assert.equal(
    pearson([
      { sleep: 2, mood: 1 },
      { sleep: 2, mood: 0 },
      { sleep: 2, mood: -1 }
    ]).r,
    null
  );
  assert.equal(
    pearson([
      { sleep: 1, mood: 0 },
      { sleep: 2, mood: 0 },
      { sleep: 3, mood: 0 }
    ]).r,
    null
  );
});
test('means use each available series independently and retain zero', () => {
  const s = summarize([
    { sleep: 0, mood: 0 },
    { sleep: 8, mood: 2 },
    { sleep: null, mood: -2 },
    { sleep: 7, mood: null }
  ]);
  assert.equal(s.meanSleep, 5);
  assert.equal(s.meanMood, 0);
  assert.equal(s.sleepCount, 3);
  assert.equal(s.moodCount, 3);
  assert.equal(s.correlation.n, 2);
  const empty = summarize([]);
  assert.equal(empty.meanSleep, null);
  assert.equal(empty.meanMood, null);
  assert.equal(empty.correlation.r, null);
});
test('energy is read like mood: zero kept, out-of-range dropped, averaged independently', () => {
  const v = series(
    {
      '2026-10-01': { checkin: { energy: 0 } },
      '2026-10-02': { checkin: { energy: 4 } },
      '2026-10-03': { checkin: { energy: -1.5, mood: 2 } }
    },
    '2026-10-01',
    '2026-10-04'
  );
  assert.deepEqual(
    v.map(d => d.energy),
    [0, null, -1.5, null]
  );
  const s = summarize(v);
  assert.equal(s.energyCount, 2);
  assert.equal(s.meanEnergy, -0.75);
  assert.equal(s.moodCount, 1);
  assert.equal(summarize([]).meanEnergy, null);
});
