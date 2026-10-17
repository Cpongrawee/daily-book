const { test } = require('node:test');
const assert = require('node:assert/strict');
const Review = require('../dist/period-review.js');

// Week of Sun 2026-10-11 to Sat 2026-10-17, viewed on Thu 2026-10-15.
const book = {
  days: {
    '2026-10-11': {
      checkin: { mood: 1, energy: 2, bedtime: '23:00', wakeTime: '07:00' },
      proud: true,
      proudNote: 'Ran 5 km',
      closed: true,
      priority: 'Write chapter',
      priorityDone: true,
      tasks: [
        { text: 'Read', done: true },
        { text: 'Email', done: false },
        { text: '  ', done: true }
      ],
      reflections: { fix: 'Sleep earlier' }
    },
    '2026-10-12': {
      checkin: { mood: -1, bedtime: '01:00', bedDay: 'today', wakeTime: '07:00' },
      closed: true,
      priority: 'Revise',
      priorityDone: false,
      reflections: { fix: '' }
    },
    '2026-10-13': { proud: true },
    // After "today": never counted.
    '2026-10-16': { proud: true, checkin: { mood: 3 }, closed: true }
  }
};

test('summarises elapsed days of the week', () => {
  const s = Review.compute(book, '2026-10-11', '2026-10-17', '2026-10-15');
  assert.equal(s.elapsed, 5);
  assert.equal(s.total, 7);
  assert.equal(s.includesToday, true);
  assert.deepEqual(s.mood, { mean: 0, n: 2 });
  assert.deepEqual(s.energy, { mean: 2, n: 1 });
  assert.deepEqual(s.sleep, { mean: 7, n: 2, sevenPlus: 1 });
  assert.deepEqual(s.proud, [
    { date: '2026-10-11', note: 'Ran 5 km' },
    { date: '2026-10-13', note: '' }
  ]);
  assert.deepEqual(s.fixes, [{ date: '2026-10-11', text: 'Sleep earlier' }]);
  assert.equal(s.reviewed, 2);
  assert.deepEqual(s.tasks, { done: 1, total: 2 });
  assert.deepEqual(s.priorities, { done: 1, set: 2 });
  const proud = s.measures.find(m => m.key === 'proud');
  assert.equal(proud.rate, 67);
  assert.equal(proud.best, 1);
});

test('a future period has nothing elapsed', () => {
  const s = Review.compute(book, '2026-11-01', '2026-11-30', '2026-10-15');
  assert.equal(s.elapsed, 0);
  assert.equal(s.total, 30);
  assert.equal(s.mood.mean, null);
  assert.deepEqual(s.proud, []);
});

test('markdown includes averages, streaks, goals, pride, fixes and reflection', () => {
  const s = Review.compute(book, '2026-10-11', '2026-10-17', '2026-10-15');
  const md = Review.markdown(s, 'week', {
    title: 'Oct 11 – Oct 17, 2026',
    goals: [
      { title: 'Finish draft', done: true },
      { title: 'Gym 4x', done: false }
    ],
    reflection: 'A steady week.'
  });
  assert.match(md, /^# Weekly review — Oct 11 – Oct 17, 2026\n/);
  assert.match(md, /Period: 2026-10-11 → 2026-10-17 \(5 of 7 days so far\)/);
  assert.match(md, /- Average mood: 0\.00 \(2 days recorded/);
  assert.match(md, /- Average energy: \+2\.00 \(1 day recorded/);
  assert.match(md, /- Average sleep: 7\.00 hr \(2 nights · 1 with 7\+ hr\)/);
  assert.match(md, /- Proud days: 2 of 5/);
  assert.match(md, /\| Proud day \| 67% \| 1 day \| 0 days \|/);
  assert.match(md, /- \[x\] Finish draft\n- \[ \] Gym 4x/);
  assert.match(md, /- Sun, Oct 11 — Ran 5 km\n- Tue, Oct 13 — Proud checkbox marked\./);
  assert.match(md, /## Fixes to follow through on\n- Sun, Oct 11 — Sleep earlier/);
  assert.match(md, /## Weekly reflection\nA steady week\.\n$/);
  assert.doesNotMatch(md, /Oct 16/);
});

test('monthly markdown and empty sections', () => {
  const s = Review.compute({ days: {} }, '2026-10-01', '2026-10-31', '2026-10-15');
  const md = Review.markdown(s, 'month', { title: 'October 2026' });
  assert.match(md, /^# Monthly review — October 2026/);
  assert.match(md, /Best streak this month/);
  assert.match(md, /## Goals\nNo goals set\./);
  assert.match(md, /## Monthly reflection\nNot written yet\./);
});

test('page markup escapes notes and offers the download', () => {
  const s = Review.compute(
    { days: { '2026-10-11': { proud: true, proudNote: '<b>me</b>' } } },
    '2026-10-11',
    '2026-10-17',
    '2026-10-15'
  );
  const html = Review.markup(s, 'week');
  assert.match(html, /Your week, reflected/);
  assert.match(html, /id="period-summary">↓ Weekly summary/);
  assert.match(html, /&lt;b&gt;me&lt;\/b&gt;/);
  assert.match(html, /data-open-date="2026-10-11"/);
});
