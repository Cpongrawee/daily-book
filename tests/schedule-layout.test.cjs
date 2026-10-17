const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { layout } = require('../dist/schedule.js');
const event = (id, time, end) => ({ id, time, end });
test('nested and partial intervals sort by duration and preserve exact minute positions', () => {
  const model = layout([
    event('short', '13:05', '13:20'),
    event('long', '12:30', '14:00'),
    event('partial', '13:15', '14:00')
  ]);
  assert.deepEqual(
    model.events.map(e => e.s.id),
    ['long', 'partial', 'short']
  );
  assert.deepEqual(
    model.events.map(e => e.depth),
    [0, 1, 2]
  );
  const short = model.events[2];
  assert.equal(short.height, 30);
  assert.equal(short.top, (13 * 60 + 5 - 360) * 2);
});
test('ties are stable, touching intervals do not overlap, implicit duration stays out of data', () => {
  const entries = [
      event('later', '13:00', '14:00'),
      event('first', '12:00', '13:00'),
      event('equal', '12:00', '13:00'),
      event('single', '15:00', '')
    ],
    m = layout(entries);
  assert.deepEqual(
    m.events.map(e => e.s.id),
    ['first', 'equal', 'later', 'single']
  );
  assert.deepEqual(
    m.events.map(e => e.depth),
    [0, 0, 0, 0]
  );
  assert.equal(m.events[3].height, 60);
  assert.equal(entries[3].end, '');
});
test('legacy times extend the view rather than disappearing', () => {
  const m = layout([event('early', '03:45', '04:15'), event('late', '23:45', '')]);
  assert.equal(m.start, 210);
  assert.equal(m.end, 1455);
  assert.equal(m.events.length, 2);
});
test('the day view starts at 06:00 and runs to midnight by default', () => {
  const m = layout([event('work', '09:00', '10:00')]);
  assert.equal(m.start, 360);
  assert.equal(m.end, 1440);
  assert.equal(layout([]).start, 360);
});

test('simultaneous activities have separate columns over the long background', () => {
  const m = layout([event('a', '08:00', '12:00'), event('b', '09:30', '12:00'), event('c', '09:30', '12:00')]);
  assert.deepEqual(
    m.events.map(e => e.depth),
    [0, 1, 1]
  );
  assert.deepEqual(
    m.events.map(e => e.column),
    [0, 0, 1]
  );
  assert.deepEqual(
    m.events.map(e => e.columns),
    [1, 2, 2]
  );
  assert.equal(m.minWidth, 360);
});
test('simultaneous starts with different durations and three columns retain their real ranges', () => {
  const m = layout([event('a', '08:00', '12:00'), event('b', '08:00', '09:00'), event('c', '08:00', '08:30')]);
  assert.deepEqual(
    m.events.map(e => e.depth),
    [0, 0, 0]
  );
  assert.deepEqual(
    m.events.map(e => e.column),
    [0, 1, 2]
  );
  assert.deepEqual(
    m.events.map(e => e.height),
    [480, 120, 60]
  );
  assert.equal(m.minWidth, 496);
});
