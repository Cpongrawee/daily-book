const { test } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../dist/insights.js');
const day = (o = {}) => ({ closed: true, priority: '', priorityDone: false, tasks: [], ...o });
const slept = (bedtime, wakeTime, bedDay, extra = {}) => ({ checkin: { bedtime, wakeTime, bedDay, ...extra } });
test('work rate counts named tasks plus the priority, only after review', () => {
  assert.equal(
    I.workRate(
      day({
        priority: 'P',
        priorityDone: true,
        tasks: [
          { text: 'A', done: true },
          { text: 'B', done: false },
          { text: ' ', done: true }
        ]
      })
    ),
    2 / 3
  );
  assert.equal(I.workRate(day({ closed: false, tasks: [{ text: 'A', done: true }] })), null);
  assert.equal(I.workRate(day()), null, 'no work planned');
});
test('sleep comparison splits at 7 hours and needs three days per side', () => {
  const days = {};
  ['01', '02', '03'].forEach(
    n => (days['2026-10-' + n] = day({ ...slept('23:00', '07:00', 'previous', { mood: 2 }), proud: true }))
  );
  ['04', '05'].forEach(
    n => (days['2026-10-' + n] = day({ ...slept('01:00', '06:00', 'today', { mood: -1 }), proud: false }))
  );
  let sleep = I.compute(days).find(r => r.id === 'sleep');
  assert.deepEqual(sleep.days, { a: 3, b: 2 });
  assert.equal(sleep.rows.find(r => r.key === 'mood').enough, false);
  days['2026-10-06'] = day({ ...slept('02:00', '07:30', 'today', { mood: -2 }), proud: false });
  sleep = I.compute(days).find(r => r.id === 'sleep');
  const mood = sleep.rows.find(r => r.key === 'mood');
  assert.deepEqual([mood.a.mean, mood.a.n, mood.b.n], [2, 3, 3]);
  assert.ok(Math.abs(mood.b.mean + 4 / 3) < 1e-9);
  assert.equal(mood.notable, true);
  assert.equal(sleep.rows.find(r => r.key === 'proud').difference, 1);
  const bed = I.compute(days).find(r => r.id === 'bedtime');
  assert.deepEqual(bed.days, { a: 3, b: 3 });
  assert.equal(bed.rows.find(r => r.key === 'sleep').a.mean, 480);
  const notes = I.highlights(I.compute(days));
  assert.ok(notes.length > 0 && notes.length <= 3);
  assert.match(notes.join(' '), /Proud days: 100% on “7 h or more” days vs 0% on “Under 7 h” days \(3 vs 3 days\)/);
});
test('today, future and out-of-range days are excluded; unreviewed misses are unknown', () => {
  const days = {
    '2026-10-01': day({ checkin: { sets: [true, true, true, true, true] } }),
    '2026-10-02': day({ closed: false, checkin: { sets: [true] } }),
    '2026-10-03': day({ checkin: { sets: [] } }),
    '2026-10-04': day({ checkin: { sets: [true, true, true, true, true] } })
  };
  const training = I.compute(days, { today: '2026-10-04' }).find(r => r.id === 'training');
  assert.deepEqual(training.days, { a: 1, b: 1 });
  assert.deepEqual(I.compute(days, { start: '2026-10-03', end: '2026-10-03' }).find(r => r.id === 'training').days, {
    a: 0,
    b: 1
  });
  const disc = I.compute({
    '2026-10-01': day({ disciplineChoices: { discipline: true } }),
    '2026-10-02': day({ disciplineChoices: { discipline: true, emotion: true } }),
    '2026-10-03': day({ disciplineChoices: {} })
  }).find(r => r.id === 'discipline');
  assert.deepEqual(disc.days, { a: 1, b: 1 });
});
test('most important task misses are counted by reason, weekday and recent notes', () => {
  const miss = (reason, note = '') => ({ priorityMiss: { reason, note } });
  const days = {
    '2026-10-05': day({ priority: 'Essay', ...miss('big', 'No outline yet') }), // Mon
    '2026-10-06': day({ priority: 'Essay', priorityDone: true }), // Tue
    '2026-10-07': day({ priority: 'Slides', ...miss('big') }), // Wed
    '2026-10-08': day({ priority: 'Call', ...miss('energy') }), // Thu
    '2026-10-09': day({ priority: 'Report' }), // Fri, no reason noted
    '2026-10-10': day({ priority: 'Done anyway', priorityDone: true, ...miss('avoided') }),
    '2026-10-11': day({ priority: ' ' }), // nothing set
    '2026-10-16': day({ priority: 'Today', ...miss('time') }) // today is excluded
  };
  const p = I.priorityMisses(days, { today: '2026-10-16' });
  assert.deepEqual([p.set, p.done, p.missed, p.unexplained], [6, 2, 4, 1]);
  assert.deepEqual(
    p.reasons.map(r => [r.key, r.count]),
    [
      ['big', 2],
      ['energy', 1]
    ],
    'a reason left on a finished day is ignored'
  );
  assert.deepEqual(
    p.weekdays.filter(w => w.set).map(w => [w.label, w.done, w.set]),
    [
      ['Mon', 0, 1],
      ['Tue', 1, 1],
      ['Wed', 0, 1],
      ['Thu', 0, 1],
      ['Fri', 0, 1],
      ['Sat', 1, 1]
    ]
  );
  assert.deepEqual(
    p.recent.map(r => [r.date, r.reason?.key, r.note]),
    [
      ['2026-10-08', 'energy', ''],
      ['2026-10-07', 'big', ''],
      ['2026-10-05', 'big', 'No outline yet']
    ]
  );
  assert.deepEqual(I.priorityMisses(days, { start: '2026-10-06', end: '2026-10-06' }).missed, 0);
  const sleep = I.compute(days).find(r => r.id === 'sleep');
  assert.ok(
    sleep.rows.some(r => r.key === 'priority'),
    'sleep card compares the top task too'
  );
});
test('weight change uses the next morning and needs both weigh-ins', () => {
  const days = {
    '2026-10-01': { checkin: { weight: '60.2' } },
    '2026-10-02': { checkin: { weight: 61 } },
    '2026-10-03': { checkin: { weight: '' } }
  };
  assert.ok(Math.abs(I.weightChange(days['2026-10-01'], '2026-10-01', days) - 0.8) < 1e-9);
  assert.equal(I.weightChange(days['2026-10-02'], '2026-10-02', days), null, 'next weight missing');
  assert.equal(I.weightChange(days['2026-10-03'], '2026-10-03', days), null);
  assert.equal(I.METRICS.weightChange.format(0.8), '+0.8 kg');
});
test('shabu comparison: weight gain the morning after shabu days', () => {
  const days = {};
  // Shabu on the 1st, 3rd, 5th (+1 kg next morning); no shabu on the 2nd, 4th, 6th (−0.8 kg).
  const weights = [60, 61, 60.2, 61.2, 60.4, 61.4, 60.6];
  weights.forEach((w, i) => {
    const date = '2026-10-0' + (i + 1);
    days[date] = day({ checkin: { weight: w, shabu: i % 2 === 0 } });
  });
  days['2026-10-07'] = { checkin: { weight: 60.6 } }; // not closed, no shabu field: left out
  days['2026-10-08'] = day({ checkin: { mood: 1 } }); // no shabu field (logged before the feature)
  const r = I.compute(days).find(c => c.id === 'shabu');
  assert.deepEqual(r.days, { a: 3, b: 3 });
  const w = r.rows.find(row => row.key === 'weightChange');
  assert.ok(Math.abs(w.a.mean - 1) < 1e-9);
  assert.ok(Math.abs(w.b.mean + 0.8) < 1e-9);
  assert.equal(w.notable, true);
  assert.ok(
    I.highlights([r]).some(t => /Weight change by next morning: \+1\.0 kg on “Shabu” days vs −0\.8 kg/.test(t))
  );
});
