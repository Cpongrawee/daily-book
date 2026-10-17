const { test, after } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const C = require('../dist/calendar-model.js');
const { createGoogle, payload } = require('../google-calendar.cjs');
const day = schedule => ({
  schedule,
  tasks: [],
  priority: '',
  priorityDone: false,
  closed: false,
  reflections: { compass: '', fix: '', discipline: '', tomorrow: '' }
});
const fixture = () => ({
  version: 1,
  revision: 0,
  identity: 'Test',
  goals: [],
  reviews: {},
  days: {
    '2026-10-09': day([
      {
        id: 'old',
        plan: 'Original',
        time: '08:00',
        end: '',
        done: true,
        changes: [{ kind: 'red', actual: 'Before', reason: 'History', at: '2026-10-09' }]
      }
    ])
  }
});
function event(id, extra = {}) {
  return {
    id,
    title: 'Event ' + id,
    description: '',
    location: '',
    allDay: false,
    timeZone: 'Asia/Bangkok',
    start: '2026-10-09T09:00:00',
    end: '2026-10-09T10:00:00',
    recurrence: [],
    exceptions: {},
    ...extra
  };
}
test('migration preserves originals, stable IDs, completion, history and no-end semantics', () => {
  const b = fixture(),
    before = C.clone(b);
  assert.equal(C.migrate(b), true);
  assert.equal(C.migrate(b), false);
  const e = b.calendar.events.old;
  assert.equal(e.done, true);
  assert.equal(e.end, '2026-10-09T08:30:00');
  assert.equal(e.noEnd, true);
  assert.deepEqual(e.legacy, before.days['2026-10-09'].schedule[0]);
  C.projectAll(b);
  assert.equal(b.days['2026-10-09'].schedule[0].id, 'old');
  assert.equal(b.days['2026-10-09'].schedule[0].end, '');
});
test('all-day, midnight, leap years, weekly repeats and moved/cancelled exceptions', () => {
  const b = fixture();
  C.migrate(b);
  b.calendar.events = {
    a: event('a', { allDay: true, start: '2028-02-28', end: '2028-03-01' }),
    n: event('n', { start: '2027-12-31T23:30:00', end: '2028-01-01T00:30:00' }),
    r: event('r', {
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR;UNTIL=20261031T165900Z'],
      exceptions: {
        '2026-10-16': { deleted: true },
        '2026-10-23': { start: '2026-11-03T09:00:00', end: '2026-11-03T10:00:00', title: 'Moved' }
      }
    })
  };
  assert.equal(C.between(b, '2028-02-29', '2028-02-29').length, 1);
  assert.equal(C.between(b, '2028-03-01', '2028-03-01').length, 0);
  assert.equal(C.slots(b, '2028-01-01')[0].time, '00:00');
  assert.equal(C.slots(b, '2028-01-01')[0].end, '00:30');
  assert.equal(C.between(b, '2026-10-16', '2026-10-16').length, 0);
  assert.equal(C.between(b, '2026-11-03', '2026-11-03')[0].title, 'Moved');
  assert.equal(C.between(b, '2026-11-06', '2026-11-06').length, 0);
});
test('daily mutations reconcile with canonical events; deleting a single occurrence keeps the series', () => {
  const b = fixture();
  C.migrate(b);
  C.projectAll(b);
  let before = C.clone(b);
  b.days['2026-10-09'].schedule[0].plan = 'Changed';
  C.reconcile(b, before);
  assert.equal(b.calendar.events.old.title, 'Changed');
  b.calendar.events.r = event('r', { recurrence: ['RRULE:FREQ=DAILY'] });
  C.projectAll(b);
  before = C.clone(b);
  b.days['2026-10-09'].schedule = b.days['2026-10-09'].schedule.filter(s => s.eventId !== 'r');
  C.reconcile(b, before);
  assert.equal(b.calendar.events.r.exceptions['2026-10-09'].deleted, true);
  assert.equal(b.calendar.events.r.deleted, undefined);
});
test('repeat rules from the editors: none, daily, weekly days and an inclusive Bangkok end date', () => {
  assert.deepEqual(C.repeatRule('', ['MO'], '2026-10-30', false, 'Asia/Bangkok'), []);
  assert.deepEqual(C.repeatRule('DAILY', [], '', false, 'Asia/Bangkok'), ['RRULE:FREQ=DAILY']);
  const weekly = C.repeatRule('WEEKLY', ['MO', 'FR'], '2026-10-26', false, 'Asia/Bangkok');
  assert.deepEqual(weekly, ['RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20261026T165900Z']);
  assert.deepEqual(C.repeatRule('DAILY', [], '2026-10-26', true, 'Asia/Bangkok'), ['RRULE:FREQ=DAILY;UNTIL=20261026']);
  const e = { ...C.fromSlot('2026-10-16', { id: 'w', time: '06:00', end: '06:30', plan: 'Run' }), recurrence: weekly };
  assert.deepEqual(
    ['2026-10-16', '2026-10-19', '2026-10-20', '2026-10-23', '2026-10-26', '2026-10-30'].map(d => C.occurs(e, d)),
    [true, true, false, true, true, false]
  );
});
test('time zone conversion handles DST offsets and rendering in Bangkok', () => {
  assert.equal(C.utc('2026-07-01T09:00:00', 'America/Los_Angeles'), '2026-07-01T16:00:00.000Z');
  assert.equal(C.utc('2026-12-01T09:00:00', 'America/Los_Angeles'), '2026-12-01T17:00:00.000Z');
  const b = fixture();
  C.migrate(b);
  b.calendar.events = {
    z: event('z', { timeZone: 'America/Los_Angeles', start: '2026-10-09T09:00:00', end: '2026-10-09T10:00:00' })
  };
  assert.equal(C.between(b, '2026-10-09', '2026-10-09')[0].start, '2026-10-09T23:00:00');
});
function mockGoogle() {
  let seq = 0,
    offline = false,
    failAfterInsert = false,
    expire = false,
    paginate = false,
    race = false,
    unauthorized = false;
  const remote = new Map(),
    requests = [];
  const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const edit = (id, changes) => {
    const g = { ...remote.get(id), ...changes, id, etag: '"' + ++seq + '"' };
    remote.set(id, g);
    return g;
  };
  async function fetcher(url, opts = {}) {
    if (offline) throw Error('Offline');
    const u = new URL(url),
      method = opts.method || 'GET';
    requests.push({ url, method, body: opts.body });
    if (u.hostname === 'oauth2.googleapis.com')
      return response(200, { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    if (unauthorized) {
      unauthorized = false;
      return response(401, {});
    }
    if (u.pathname.endsWith('calendarList'))
      return response(200, { items: [{ id: 'chosen', summary: 'My calendar', accessRole: 'owner' }] });
    const match = u.pathname.match(/\/events(?:\/([^/]+))?(\/instances)?$/);
    if (!match) return response(404, {});
    const id = match[1];
    if (method === 'GET' && match[2]) {
      const parent = remote.get(id);
      const original = u.searchParams.get('originalStart');
      if (original) {
        const d = parent.start.date ? original.slice(0, 10) : C.inZone(original, parent.start.timeZone).slice(0, 10);
        const instanceId = id + '_' + d.replaceAll('-', '');
        if (!remote.has(instanceId)) {
          const e = require('../google-calendar.cjs').fromGoogle(parent, 'temp');
          const inst = C.instance(e, d);
          edit(instanceId, {
            ...payload({ ...inst, recurrence: [] }),
            recurringEventId: id,
            originalStartTime: parent.start.date ? { date: d } : { dateTime: original }
          });
        }
        return response(200, { items: [remote.get(instanceId)] });
      }
      return response(200, { items: [...remote.values()].filter(g => g.recurringEventId === id) });
    }
    if (method === 'GET' && !id) {
      if (expire && u.searchParams.has('syncToken')) {
        expire = false;
        return response(410, {});
      }
      const items = [...remote.values()];
      if (paginate && !u.searchParams.has('pageToken') && items.length > 1)
        return response(200, { items: items.slice(0, 1), nextPageToken: 'second' });
      return response(200, {
        items: paginate && u.searchParams.has('pageToken') ? items.slice(1) : items,
        nextSyncToken: 'token-' + seq
      });
    }
    if (method === 'POST') {
      const body = JSON.parse(opts.body);
      if (remote.has(body.id)) return response(409, {});
      const g = edit(body.id, body);
      if (failAfterInsert) {
        failAfterInsert = false;
        throw Error('Connection dropped after Google saved');
      }
      return response(200, g);
    }
    if (race && method === 'PATCH') {
      race = false;
      edit(id, { summary: 'Racing edit' });
    }
    const g = remote.get(id);
    if (!g) return response(404, {});
    if (method === 'GET') return response(200, g);
    if (opts.headers['If-Match'] && opts.headers['If-Match'] !== g.etag) return response(412, {});
    if (method === 'DELETE') {
      edit(id, { status: 'cancelled' });
      return response(204, {});
    }
    if (method === 'PATCH') return response(200, edit(id, JSON.parse(opts.body)));
    return response(400, {});
  }
  return {
    fetcher,
    remote,
    requests,
    edit,
    setOffline: x => (offline = x),
    setDrop: () => (failAfterInsert = true),
    setExpire: () => (expire = true),
    setPaginate: () => (paginate = true),
    setRace: () => (race = true),
    setUnauthorized: () => (unauthorized = true)
  };
}
// Temporary sync folders live in the system temp directory and are removed after the run.
const tempDirs = [];
after(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});
async function setup() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-book-calendar-sync-'));
  tempDirs.push(data);
  let book = fixture();
  C.migrate(book);
  C.projectAll(book);
  const mock = mockGoogle();
  const make = () => {
    const g = createGoogle({
      data,
      origin: 'http://127.0.0.1:47831',
      getBook: () => book,
      commit: b => {
        assert.equal(b.revision, book.revision);
        b.revision++;
        book = b;
      },
      fetcher: mock.fetcher,
      vault: x => x
    });
    g.close();
    return g;
  };
  let google = make();
  await google.handle('configure', { credentials: { installed: { client_id: 'client', client_secret: 'secret' } } });
  const auth = await google.handle('connect');
  const state = new URL(auth.url).searchParams.get('state');
  await google.handle('callback', { state, code: 'code' });
  await google.handle('select', { id: 'chosen' });
  await google.handle('probe');
  return {
    get book() {
      return book;
    },
    mock,
    get google() {
      return google;
    },
    restart() {
      google.close();
      google = make();
    },
    close() {
      google.close();
    },
    data
  };
}
test('two-way sync, durable retry, remote conflicts, offline queue, deleted events and expired sync token', async () => {
  const x = await setup();
  try {
    await x.google.handle('start');
    assert.equal(x.google.status().pending, 0);
    const id = [...x.mock.remote.keys()].find(k => k.startsWith('db') && !k.startsWith('dbtest'));
    assert.equal(x.mock.remote.get(id).summary, 'Original');
    assert.equal('done' in x.mock.remote.get(id), false);
    assert.deepEqual(x.mock.remote.get(id).reminders, {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 0 }]
    });
    x.mock.edit(id, { summary: 'From Google' });
    await x.google.sync();
    assert.equal(x.book.calendar.events.old.title, 'From Google');
    x.book.calendar.events.old.title = 'Local offline';
    x.mock.setOffline(true);
    await x.google.sync();
    assert.equal(x.google.status().pending, 1);
    x.mock.setOffline(false);
    x.mock.edit(id, { summary: 'Remote simultaneous' });
    await x.google.sync();
    assert.equal(x.google.status().conflicts.length, 1);
    assert.equal(x.book.calendar.events.old.title, 'Local offline');
    await x.google.handle('resolve', { id: 'old', choice: 'local' });
    await x.google.sync();
    assert.equal(x.mock.remote.get(id).summary, 'Local offline');
    x.book.calendar.events.new = event('new');
    x.mock.setDrop();
    await x.google.sync();
    assert.match(x.google.status().error, /Connection dropped/);
    x.restart();
    await x.google.sync();
    assert.equal([...x.mock.remote.values()].filter(g => g.summary === 'Event new').length, 1);
    x.mock.setExpire();
    await x.google.sync();
    assert.equal(x.google.status().error, '');
    x.book.calendar.events.old.deleted = true;
    await x.google.sync();
    assert.equal(x.mock.remote.get(id).status, 'cancelled');
    assert.equal(x.google.status().pending, 0);
  } finally {
    x.close();
  }
});
test('restore pause and OAuth state validation', async () => {
  const x = await setup();
  try {
    await assert.rejects(x.google.handle('callback', { state: 'bad', code: 'code' }), /Expired or invalid/);
    x.google.pause();
    await x.google.sync();
    assert.equal([...x.mock.remote.values()].filter(g => g.summary === 'Original').length, 0);
    assert.equal(x.google.status().paused, true);
    assert.equal(
      fs.readFileSync(path.join(x.data, 'google-private', 'sync.json'), 'utf8').includes('refresh_token'),
      false
    );
  } finally {
    x.close();
  }
});
test('pagination imports every page, 401 refresh, 412 conflict, and reconnect preserve links', async () => {
  const x = await setup();
  try {
    for (let i = 0; i < 3; i++) x.mock.edit('remote' + i, payload(event('r' + i)));
    x.mock.setPaginate();
    x.mock.setUnauthorized();
    await x.google.handle('start');
    assert.equal(x.google.status().error, '');
    assert.equal(Object.values(x.book.calendar.events).filter(e => e.id.startsWith('google-')).length, 3);
    const requests = x.mock.requests.filter(r => r.url.includes('oauth2.googleapis.com'));
    assert.ok(requests.length >= 2);
    x.book.calendar.events.old.title = 'Local raced';
    x.mock.setRace();
    await x.google.sync();
    assert.equal(x.google.status().conflicts[0].remote.summary, 'Racing edit');
    await x.google.handle('resolve', { id: 'old', choice: 'remote' });
    assert.equal(x.book.calendar.events.old.title, 'Racing edit');
    await x.google.handle('disconnect');
    const auth = await x.google.handle('connect');
    await x.google.handle('callback', { state: new URL(auth.url).searchParams.get('state'), code: 'again' });
    await x.google.handle('start');
    assert.equal([...x.mock.remote.values()].filter(e => e.summary === 'Racing edit').length, 1);
  } finally {
    x.close();
  }
});
test('recurring occurrence edit and cancellation sync independently without duplicating series', async () => {
  const x = await setup();
  try {
    x.book.calendar.events.series = event('series', {
      recurrence: ['RRULE:FREQ=DAILY'],
      exceptions: { '2026-10-10': { title: 'Special occurrence' }, '2026-10-11': { deleted: true } }
    });
    await x.google.handle('start');
    assert.equal(x.google.status().error, '');
    assert.equal([...x.mock.remote.values()].filter(e => e.recurrence?.length).length, 1);
    assert.equal([...x.mock.remote.values()].filter(e => e.summary === 'Special occurrence').length, 1);
    assert.equal([...x.mock.remote.values()].filter(e => e.recurringEventId && e.status === 'cancelled').length, 1);
    await x.google.sync();
    assert.equal(x.google.status().pending, 0);
    assert.equal(x.book.calendar.events.series.exceptions['2026-10-11'].deleted, true);
  } finally {
    x.close();
  }
});
test('Undo after a synced deletion recreates one live event without losing its local ID', async () => {
  const x = await setup();
  try {
    await x.google.handle('start');
    x.book.calendar.events.old.deleted = true;
    await x.google.sync();
    x.book.calendar.events.old.deleted = false;
    await x.google.sync();
    assert.equal(x.google.status().error, '');
    assert.equal(x.google.status().conflicts.length, 0);
    assert.equal(
      [...x.mock.remote.values()].filter(e => e.summary === 'Original' && e.status !== 'cancelled').length,
      1
    );
    assert.equal(x.book.calendar.events.old.id, 'old');
    await x.google.sync();
    assert.equal(x.google.status().pending, 0);
  } finally {
    x.close();
  }
});
test('Undo of synced recurring exceptions restores the original occurrence', async () => {
  const x = await setup();
  try {
    x.book.calendar.events.series = event('series', {
      recurrence: ['RRULE:FREQ=DAILY'],
      exceptions: { '2026-10-10': { deleted: true } }
    });
    await x.google.handle('start');
    delete x.book.calendar.events.series.exceptions['2026-10-10'];
    await x.google.sync();
    assert.equal(x.google.status().error, '');
    const instance = [...x.mock.remote.values()].find(e => e.recurringEventId);
    assert.equal(instance.status, 'confirmed');
    assert.equal(x.google.status().pending, 0);
  } finally {
    x.close();
  }
});
