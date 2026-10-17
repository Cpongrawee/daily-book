(function (root) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const add = (d, n) => {
    const x = new Date(d + 'T12:00:00Z');
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const weekday = d => new Date(d + 'T12:00:00Z').getUTCDay();
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const stamp = (d, t) => d + 'T' + t + ':00';
  const plus = (s, n) => new Date(Date.parse(s + 'Z') + n * 60000).toISOString().slice(0, 19);
  const dateOK = d =>
    typeof d === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    !isNaN(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  const timeOK = s =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s) && dateOK(s.slice(0, 10));
  function validEvent(e) {
    try {
      return (
        !!e &&
        typeof e.id === 'string' &&
        e.id.length > 0 &&
        typeof e.title === 'string' &&
        typeof e.description === 'string' &&
        typeof e.location === 'string' &&
        typeof e.allDay === 'boolean' &&
        typeof e.timeZone === 'string' &&
        !!new Intl.DateTimeFormat('en', { timeZone: e.timeZone }) &&
        (e.allDay ? dateOK(e.start) && dateOK(e.end) : timeOK(e.start) && timeOK(e.end)) &&
        e.end > e.start &&
        (!e.recurrence ||
          (Array.isArray(e.recurrence) && e.recurrence.every(x => typeof x === 'string' && x.length < 10000))) &&
        (!e.exceptions ||
          (typeof e.exceptions === 'object' &&
            !Array.isArray(e.exceptions) &&
            Object.entries(e.exceptions).every(
              ([d, x]) =>
                dateOK(d) &&
                x &&
                typeof x === 'object' &&
                !Array.isArray(x) &&
                (!x.deleted || typeof x.deleted === 'boolean') &&
                (!x.start || validEvent({ ...e, ...x, exceptions: {} }))
            )))
      );
    } catch {
      return false;
    }
  }
  function fromSlot(d, s) {
    const start = stamp(d, s.time),
      end = s.end && s.end > s.time ? stamp(d, s.end) : plus(start, 30);
    return {
      id: s.id,
      title: s.plan,
      description: '',
      location: '',
      start,
      end,
      allDay: false,
      timeZone: 'Asia/Bangkok',
      done: s.done,
      changes: clone(s.changes || []),
      noEnd: !s.end,
      legacy: clone(s),
      recurrence: [],
      exceptions: {}
    };
  }
  function migrate(book) {
    if (book.calendar?.version === 1) return false;
    const events = {};
    for (const [d, day] of Object.entries(book.days))
      for (const s of day.schedule) {
        let e = fromSlot(d, s);
        if (events[e.id]) e.id = d + '-' + e.id;
        events[e.id] = e;
      }
    book.calendar = { version: 1, events };
    return true;
  }
  function simpleRule(e) {
    if (!e.recurrence?.length) return null;
    if (e.recurrence.length !== 1) return false;
    const r = Object.fromEntries(
      e.recurrence[0]
        .replace(/^RRULE:/, '')
        .split(';')
        .map(x => x.split('='))
    );
    if (
      Number(r.INTERVAL || 1) < 1 ||
      Number(r.INTERVAL || 1) % 1 ||
      (r.COUNT && (!/^\d+$/.test(r.COUNT) || Number(r.COUNT) < 1)) ||
      (r.FREQ === 'DAILY' && r.COUNT && r.BYDAY)
    )
      return false;
    if (
      !['DAILY', 'WEEKLY'].includes(r.FREQ) ||
      Object.keys(r).some(k => !['FREQ', 'BYDAY', 'UNTIL', 'INTERVAL', 'COUNT', 'WKST'].includes(k)) ||
      (r.BYDAY && r.BYDAY.split(',').some(d => !codes.includes(d)))
    )
      return false;
    return r;
  }
  // The one RRULE line the editors write: Daily, or Weekly on chosen days, optionally until a date.
  function repeatRule(repeat, days, until, allDay, timeZone) {
    if (!repeat) return [];
    const end = !until
      ? ''
      : ';UNTIL=' +
        (allDay
          ? until.replaceAll('-', '')
          : utc(stamp(until, '23:59'), timeZone).replace(/[-:]/g, '').replace('.000', ''));
    return [`RRULE:FREQ=${repeat}${repeat === 'WEEKLY' ? ';BYDAY=' + days.join(',') : ''}${end}`];
  }
  function occurs(e, d) {
    const first = e.start.slice(0, 10);
    if (d < first) return false;
    const r = simpleRule(e);
    if (r === false) return false;
    if (!r) return d === first;
    const until = r.UNTIL?.slice(0, 8);
    if (until && r.UNTIL.length === 8 && d.replaceAll('-', '') > until) return false;
    if (r.UNTIL?.endsWith('Z') && !e.allDay) {
      const u = r.UNTIL;
      const end =
        u.slice(0, 4) +
        '-' +
        u.slice(4, 6) +
        '-' +
        u.slice(6, 8) +
        'T' +
        u.slice(9, 11) +
        ':' +
        u.slice(11, 13) +
        ':' +
        u.slice(13, 15) +
        'Z';
      if (Date.parse(utc(d + e.start.slice(10), e.timeZone)) > Date.parse(end)) return false;
    }
    const delta = Math.round((Date.parse(d) - Date.parse(first)) / 86400000),
      interval = Number(r.INTERVAL || 1);
    if (r.FREQ === 'DAILY') {
      if (delta % interval) return false;
      if (r.COUNT && Math.floor(delta / interval) >= Number(r.COUNT)) return false;
      return !r.BYDAY || r.BYDAY.split(',').includes(codes[weekday(d)]);
    }
    const days = (r.BYDAY || codes[weekday(first)]).split(',');
    const wkst = codes.indexOf(r.WKST || 'MO'),
      offset = (weekday(first) - wkst + 7) % 7;
    if (Math.floor((delta + offset) / 7) % interval || !days.includes(codes[weekday(d)])) return false;
    if (r.COUNT) {
      let n = 0;
      for (let k = first; k <= d; k = add(k, 1)) {
        const dd = Math.round((Date.parse(k) - Date.parse(first)) / 86400000);
        if (Math.floor((dd + offset) / 7) % interval === 0 && days.includes(codes[weekday(k)])) n++;
        if (n > Number(r.COUNT)) return false;
      }
    }
    return true;
  }
  function instance(e, d) {
    const duration =
      Date.parse(e.end + (e.allDay ? 'T00:00:00Z' : 'Z')) - Date.parse(e.start + (e.allDay ? 'T00:00:00Z' : 'Z'));
    const start = e.allDay ? d : d + e.start.slice(10);
    const end = e.allDay
      ? add(d, Math.round(duration / 86400000))
      : new Date(Date.parse(start + 'Z') + duration).toISOString().slice(0, 19);
    const ex = e.exceptions?.[d];
    if (ex?.deleted) return null;
    return {
      ...e,
      start,
      end,
      ...ex,
      eventId: e.id,
      occurrence: d,
      instanceId: e.recurrence?.length ? e.id + '@' + d : e.id,
      done: ex?.done ?? (e.recurrence?.length ? false : e.done)
    };
  }
  // Intl formatters are expensive to construct; sync calls this hundreds of thousands of times.
  const zoneFormats = new Map();
  function inZone(s, zone) {
    let f = zoneFormats.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat('sv-SE', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
      zoneFormats.set(zone, f);
    }
    return f.format(new Date(s)).replace(' ', 'T');
  }
  function utc(local, zone) {
    let ms = Date.parse(local + 'Z');
    for (let i = 0; i < 3; i++) {
      const shown = inZone(new Date(ms).toISOString(), zone);
      ms += Date.parse(local + 'Z') - Date.parse(shown + 'Z');
    }
    return new Date(ms).toISOString();
  }
  function visibleInstance(i) {
    if (i.allDay || i.timeZone === 'Asia/Bangkok') return i;
    return {
      ...i,
      start: inZone(utc(i.start, i.timeZone), 'Asia/Bangkok'),
      end: inZone(utc(i.end, i.timeZone), 'Asia/Bangkok')
    };
  }
  function between(book, start, end) {
    migrate(book);
    const out = [];
    for (const e of Object.values(book.calendar.events)) {
      if (e.deleted) continue;
      const duration = Math.ceil(
        (Date.parse(e.end + (e.allDay ? '' : 'Z')) - Date.parse(e.start + (e.allDay ? '' : 'Z'))) / 86400000
      );
      const matches = i => {
        if (!i) return;
        const v = visibleInstance(i);
        if (v.start.slice(0, 10) <= end && v.end > (v.allDay ? start : start + 'T00:00:00')) out.push(v);
      };
      if (!e.recurrence?.length) {
        matches(instance(e, e.start.slice(0, 10)));
        continue;
      }
      if (simpleRule(e) === false) {
        for (const i of e.cachedInstances || [])
          matches({ ...e, ...i, eventId: e.id, instanceId: i.id, occurrence: i.originalDate, readOnly: true });
        continue;
      }
      for (let d = add(start, -Math.max(1, duration)); d <= add(end, 1); d = add(d, 1))
        if (occurs(e, d)) matches(instance(e, d));
      for (const [d, x] of Object.entries(e.exceptions || {}))
        if ((d < add(start, -Math.max(1, duration)) || d > add(end, 1)) && !x.deleted) matches(instance(e, d));
    }
    return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }
  function slots(book, d) {
    return between(book, d, d)
      .filter(e => !e.allDay)
      .map(e => ({
        ...e.legacy,
        id: e.instanceId,
        eventId: e.eventId,
        occurrence: e.occurrence,
        time: e.start.slice(0, 10) < d ? '00:00' : e.start.slice(11, 16),
        end: e.end.slice(0, 10) > d ? '23:59' : e.noEnd ? '' : e.end.slice(11, 16),
        plan: e.title,
        done: !!e.done,
        changes: clone(e.changes || []),
        calendarManaged: !!(
          e.recurrence?.length ||
          e.start.slice(0, 10) !== e.end.slice(0, 10) ||
          e.readOnly ||
          e.timeZone !== 'Asia/Bangkok'
        )
      }));
  }
  function project(book, d) {
    if (book.days[d]) book.days[d].schedule = slots(book, d);
  }
  function projectAll(book) {
    for (const d of Object.keys(book.days)) project(book, d);
  }
  function reconcile(book, before) {
    migrate(book);
    if (!before) return;
    migrate(before);
    for (const [d, day] of Object.entries(book.days)) {
      const old = before.days[d]?.schedule || [];
      if (JSON.stringify(old) === JSON.stringify(day.schedule)) continue;
      const oldBy = new Map(old.map(s => [s.id, s]));
      for (const s of day.schedule) {
        const prev = oldBy.get(s.id);
        if (prev && JSON.stringify(prev) === JSON.stringify(s)) continue;
        const e = book.calendar.events[s.eventId || s.id];
        if (e) {
          if (e.recurrence?.length) {
            const x = e.exceptions[s.occurrence] || {};
            e.exceptions[s.occurrence] = { ...x, done: s.done };
          } else {
            e.done = s.done;
            if (!s.calendarManaged) {
              e.title = s.plan;
              e.start = stamp(d, s.time);
              e.end = s.end ? stamp(d, s.end) : plus(e.start, 30);
              e.noEnd = !s.end;
            }
          }
        } else {
          const n = fromSlot(d, s);
          book.calendar.events[n.id] = n;
        }
      }
      for (const s of old)
        if (!day.schedule.some(n => n.id === s.id)) {
          const e = book.calendar.events[s.eventId || s.id];
          if (e && !e.deleted) {
            if (e.recurrence?.length) e.exceptions[s.occurrence] = { ...e.exceptions[s.occurrence], deleted: true };
            else e.deleted = true;
          }
        }
    }
  }
  const api = {
    clone,
    add,
    weekday,
    codes,
    stamp,
    plus,
    dateOK,
    timeOK,
    validEvent,
    fromSlot,
    migrate,
    simpleRule,
    repeatRule,
    occurs,
    instance,
    between,
    slots,
    project,
    projectAll,
    reconcile,
    inZone,
    utc
  };
  if (typeof module === 'object') module.exports = api;
  else root.BookCalendar = api;
})(typeof globalThis === 'object' ? globalThis : this);
