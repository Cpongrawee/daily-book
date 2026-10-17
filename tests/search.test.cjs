const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../dist/search.js');
const book = {
  days: {
    '2026-10-02': {
      priority: 'Finish project chart',
      tasks: [{ text: 'Call Mom', done: true }],
      schedule: [{ time: '07:00', plan: 'Morning walk' }],
      reflections: {
        fix: 'Scrolled my phone late at night',
        worry: 'Project deadline',
        tomorrow: '',
        compass: '',
        discipline: ''
      },
      compassActions: { Healthy: 'Gym 5 sets' }
    },
    '2026-10-05': {
      priority: '',
      tasks: [],
      schedule: [],
      reflections: {
        fix: 'Phone again <after> 23:00 & no plan',
        worry: '',
        tomorrow: 'See the sunrise',
        compass: '',
        discipline: ''
      },
      proudNote: 'Kept my promise'
    },
    '2026-10-07': {
      priority: '',
      tasks: [],
      schedule: [],
      reflections: { fix: '', worry: '', tomorrow: '', compass: '', discipline: '' }
    }
  },
  goals: [
    {
      id: 'g',
      type: 'week',
      title: 'Finish project results',
      start: '2026-10-04',
      end: '2026-10-10',
      done: false,
      parentId: ''
    }
  ],
  reviews: { 'week:2026-10-04': 'Phone time crept up this week', 'month:2026-10-01': '' }
};
test('finds notes across days, goals and reviews, newest first', () => {
  const r = S.find(book, 'phone');
  assert.deepEqual(
    r.map(x => [x.date, x.label]),
    [
      ['2026-10-05', 'Below Your Standard & Fix'],
      ['2026-10-04', 'Weekly reflection'],
      ['2026-10-02', 'Below Your Standard & Fix']
    ]
  );
  assert.equal(r[1].view, 'week');
  assert.equal(S.find(book, 'PROJECT').length, 3, 'case-insensitive: priority, worry, goal');
});
test('all words must appear in the same note, and groups narrow the search', () => {
  assert.equal(S.find(book, 'phone late').length, 1);
  assert.equal(S.find(book, 'phone', 'fix').length, 2);
  assert.equal(S.find(book, 'project', 'worry').length, 1);
  assert.deepEqual(
    S.find(book, 'gym', 'compass').map(x => x.label),
    ['Compass · Healthy']
  );
  assert.deepEqual(S.find(book, '   '), []);
});
test('snippets escape HTML and highlight every term', () => {
  const html = S.snippet('Phone again <after> 23:00 & no plan', 'phone plan');
  assert.equal(html, '<mark>Phone</mark> again &lt;after&gt; 23:00 &amp; no <mark>plan</mark>');
  assert.equal(S.snippet('a & amp', 'amp'), 'a &amp; <mark>amp</mark>');
  const long = 'x'.repeat(200) + 'needle' + 'y'.repeat(300);
  assert.match(S.snippet(long, 'needle'), /^… x+<mark>needle<\/mark>y+ …$/);
});
