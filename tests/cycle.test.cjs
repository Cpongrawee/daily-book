const { test } = require('node:test');
const assert = require('node:assert/strict');
const { periods, stats, weeklySex, monthlySex, weeklyShabu, monthlyShabu, markup } = require('../dist/cycle.js');
const period = (flow = 'medium') => ({ checkin: { period: true, periodFlow: flow } });
function log(starts, length = 5) {
  const days = {};
  for (const s of starts)
    for (let i = 0; i < length; i++) {
      const d = new Date(s + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      days[d.toISOString().slice(0, 10)] = period();
    }
  return days;
}
test('groups period days and bridges a single missed day', () => {
  const days = {
    '2026-08-01': period(),
    '2026-08-02': period(),
    '2026-08-04': period('light'),
    '2026-08-08': period('spotting'),
    '2026-08-03': { checkin: { period: false } }
  };
  assert.deepEqual(periods(days, '2026-10-10'), [
    { start: '2026-08-01', end: '2026-08-04', length: 4 },
    { start: '2026-08-08', end: '2026-08-08', length: 1 }
  ]);
});
test('no estimate until two periods are logged', () => {
  const s = stats(log(['2026-09-20']), '2026-10-10');
  assert.equal(s.lastStart, '2026-09-20');
  assert.equal(s.avgLength, 5);
  assert.equal(s.avgCycle, null);
  assert.equal(s.nextStart, null);
});
test('average cycle, typical length, next start; in-progress period excluded from length', () => {
  const days = log(['2026-07-01', '2026-07-29', '2026-08-28']);
  Object.assign(days, log(['2026-09-26'], 2));
  const s = stats(days, '2026-09-27');
  assert.deepEqual(s.cycles, [28, 30, 29]);
  assert.equal(s.avgCycle, 29);
  assert.equal(s.ongoing, true);
  assert.equal(s.avgLength, 5);
  assert.equal(s.nextStart, '2026-10-25');
});
test('implausible gaps (missed logging) are left out of the cycle average', () => {
  const s = stats(log(['2026-03-01', '2026-06-01', '2026-06-29']), '2026-10-10');
  assert.deepEqual(s.cycles, [28]);
});
test('future days are ignored and data is not modified', () => {
  const days = log(['2026-10-01', '2026-10-20']),
    before = JSON.stringify(days);
  assert.equal(stats(days, '2026-10-10').periods.length, 1);
  markup(days, '2026-10-10');
  assert.equal(JSON.stringify(days), before);
});
test('sex counts by Monday-start week and by month', () => {
  const days = {
    '2026-10-05': { checkin: { sex: true } }, // Monday
    '2026-10-07': { checkin: { sex: true } },
    '2026-10-04': { checkin: { sex: true } }, // Sunday, previous week
    '2026-09-10': { checkin: { sex: false } }
  };
  const weeks = weeklySex(days, '2026-10-10', 2);
  assert.deepEqual(weeks, [
    { start: '2026-09-28', count: 1 },
    { start: '2026-10-05', count: 2 }
  ]);
  assert.equal(monthlySex(days, '2026-10'), 3);
  assert.equal(monthlySex(days, '2026-09'), 0);
});
test('markup shows flow shades, sex dots and an empty state', () => {
  const html = markup({ '2026-10-02': { checkin: { period: true, periodFlow: 'heavy', sex: true } } }, '2026-10-10');
  assert.match(html, /class="cycle-day flow-heavy" data-cycle-date="2026-10-02"/);
  assert.match(html, /Period: Heavy · Had sex/);
  assert.match(html, /cycle-sex-dot/);
  assert.match(html, /Needs two logged periods/);
  assert.doesNotMatch(html, /style="/);
  assert.match(markup({}, '2026-10-10'), /No period logged yet/);
});
test('shabu buffet counts by week and month, separately from sex', () => {
  const days = {
    '2026-10-05': { checkin: { shabu: true, sex: true } },
    '2026-10-09': { checkin: { shabu: true } },
    '2026-09-30': { checkin: { shabu: true } },
    '2026-10-06': { checkin: { shabu: false } }
  };
  assert.deepEqual(weeklyShabu(days, '2026-10-10', 2), [
    { start: '2026-09-28', count: 1 },
    { start: '2026-10-05', count: 2 }
  ]);
  assert.equal(weeklyShabu(days, '2026-10-10').length, 12);
  assert.equal(monthlyShabu(days, '2026-10'), 2);
  assert.equal(monthlyShabu(days, '2026-09'), 1);
  assert.equal(monthlySex(days, '2026-10'), 1);
});
test('markup shows shabu dots beside sex dots, a legend entry and its own chart', () => {
  const html = markup(
    { '2026-10-02': { checkin: { sex: true, shabu: true } }, '2026-10-03': { checkin: { shabu: true } } },
    '2026-10-10'
  );
  assert.match(html, /Oct 2, 2026 · Had sex · Shabu buffet/);
  assert.match(
    html,
    /<i class="cycle-sex-dot" aria-hidden="true"><\/i><i class="cycle-shabu-dot" aria-hidden="true"><\/i>/
  );
  assert.equal(html.match(/<i class="cycle-shabu-dot" aria-hidden="true">/g).length, 2);
  assert.match(html, /<span><i class="cycle-shabu-dot"><\/i>Shabu buffet<\/span>/);
  assert.equal(html.match(/class="cycle-bar-shabu"/g).length, 12);
  assert.equal(html.match(/class="cycle-bar"/g).length, 12);
  assert.match(html, /aria-label="Shabu buffet days per week, last 12 weeks: (0, ){10}2, 0"/);
  assert.doesNotMatch(html, /style="/);
});
