'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { spawnSync } = require('node:child_process');
const C = require('./dist/calendar-model.js');
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone = C.clone;
function payload(e) {
  if (e.deleted) return { deleted: true };
  return {
    summary: e.title,
    description: e.description || '',
    location: e.location || '',
    start: e.allDay ? { date: e.start } : { dateTime: C.utc(e.start, e.timeZone), timeZone: e.timeZone },
    end: e.allDay ? { date: e.end } : { dateTime: C.utc(e.end, e.timeZone), timeZone: e.timeZone },
    // One popup at the start time instead of the calendar's default (often 30 minutes before).
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    ...(e.recurrence?.length ? { recurrence: e.recurrence } : {})
  };
}
// Google may return offset names such as "GMT+07:00", which Intl rejects; map whole-hour offsets to IANA zones.
function zoneOf(z) {
  if (!z) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: z });
    return z;
  } catch {}
  const m = /^(?:GMT|UTC)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(z);
  if (!m || Number(m[3] || 0)) return null;
  const h = Number(m[2]);
  if (m[1] === '+' && h === 7) return 'Asia/Bangkok';
  return h ? 'Etc/GMT' + (m[1] === '+' ? '-' : '+') + h : 'UTC';
}
function fromGoogle(g, id, previous = {}) {
  const allDay = !!g.start?.date,
    zone = zoneOf(g.start?.timeZone) || zoneOf(previous.timeZone) || 'Asia/Bangkok';
  return {
    ...previous,
    cachedInstances: undefined,
    id,
    title: g.summary || '(Untitled)',
    description: g.description || '',
    location: g.location || '',
    allDay,
    timeZone: zone,
    start: allDay ? g.start.date : C.inZone(g.start.dateTime, zone),
    end: allDay ? g.end.date : C.inZone(g.end.dateTime, zone),
    recurrence: g.recurrence || [],
    exceptions: previous.exceptions || {},
    done: previous.done || false,
    changes: previous.changes || [],
    deleted: false,
    readOnly: !!g.attendees?.length || g.locked === true || (!!g.eventType && g.eventType !== 'default'),
    googleUrl: g.htmlLink || '',
    noEnd: previous.noEnd || false
  };
}
function protect(text, decrypt = false) {
  if (process.platform !== 'win32') throw Error('Google credentials require Windows DPAPI on this computer.');
  const script = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::${decrypt ? 'Unprotect' : 'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: decrypt ? text : Buffer.from(text).toString('base64'),
    encoding: 'utf8',
    windowsHide: true
  });
  if (r.status !== 0) throw Error('Windows could not protect or unlock Google credentials.');
  return decrypt ? Buffer.from(r.stdout.trim(), 'base64').toString() : r.stdout.trim();
}
function createGoogle({ data, origin, getBook, commit, fetcher = fetch, vault = protect }) {
  const dir = path.join(data, 'google-private');
  fs.mkdirSync(dir, { recursive: true });
  const read = (name, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return fallback;
      throw e;
    }
  };
  let meta = read('sync.json', { links: {}, conflicts: {}, paused: false }),
    secret = {};
  try {
    if (fs.existsSync(path.join(dir, 'credentials.dpapi')))
      secret = JSON.parse(vault(fs.readFileSync(path.join(dir, 'credentials.dpapi'), 'utf8'), true));
  } catch {
    meta.error = 'Credentials could not be unlocked. Reconnect Google on this Windows account.';
  }
  let busy = false,
    oauth = null,
    timer;
  function atomic(name, value) {
    const f = path.join(dir, name);
    const fd = fs.openSync(f + '.tmp', 'w');
    try {
      fs.writeSync(fd, value);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(f + '.tmp', f);
  }
  function persist() {
    atomic('sync.json', JSON.stringify(meta, null, 2));
  }
  function credentials() {
    atomic('credentials.dpapi', vault(JSON.stringify(secret)));
  }
  function localItems(book = getBook()) {
    const items = {};
    for (const e of Object.values(book.calendar.events)) {
      items[e.id] = { event: e, body: payload(e) };
      for (const [d, x] of Object.entries(e.exceptions || {})) {
        if (e.deleted || !e.recurrence?.length || Object.keys(x).every(k => k === 'done')) continue;
        const instance = C.instance(e, d);
        items[e.id + '@' + d] = {
          event: e,
          occurrence: d,
          body: x.deleted ? { deleted: true } : payload({ ...instance, recurrence: [] })
        };
      }
    }
    for (const id of Object.keys(meta.links)) {
      if (items[id]) continue;
      const at = id.lastIndexOf('@');
      if (at < 0) continue;
      const e = book.calendar.events[id.slice(0, at)],
        d = id.slice(at + 1);
      if (e && !e.deleted && e.recurrence?.length && C.occurs(e, d)) {
        const inst = C.instance(e, d);
        if (inst) items[id] = { event: e, occurrence: d, body: payload({ ...inst, recurrence: [] }) };
      }
    }
    return items;
  }
  function status() {
    const items = localItems();
    return {
      configured: !!secret.client_id,
      connected: !!secret.refresh_token,
      calendar: meta.calendar || null,
      paused: !!meta.paused,
      busy,
      lastSync: meta.lastSync || null,
      error: meta.error || '',
      pending: Object.entries(items).filter(
        ([id, x]) =>
          !x.event.readOnly &&
          hash(x.body) !== meta.links[id]?.base &&
          !(!meta.links[id] && x.body.deleted && !x.occurrence)
      ).length,
      conflicts: Object.entries(meta.conflicts || {}).map(([id, c]) => ({
        id,
        local: c.local,
        remote: c.remote,
        title: items[id]?.event.title || c.remote?.summary || id
      })),
      probePassed: !!meta.probePassed
    };
  }
  async function request(url, options = {}) {
    const r = await fetcher(url, { ...options, signal: AbortSignal.timeout(20000) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = Error(body.error?.message || body.error_description || 'Google request failed (' + r.status + ').');
      err.status = r.status;
      throw err;
    }
    return body;
  }
  async function access() {
    if (secret.access_token && secret.expires > Date.now() + 60000) return secret.access_token;
    if (!secret.refresh_token) throw Error('Connect your Google account first.');
    try {
      const r = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: secret.client_id,
          client_secret: secret.client_secret || '',
          refresh_token: secret.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      secret = { ...secret, ...r, expires: Date.now() + r.expires_in * 1000 };
      credentials();
      return secret.access_token;
    } catch (e) {
      if (e.status === 400) {
        meta.paused = true;
        meta.error = 'Google authorization expired or was revoked. Reconnect your account.';
        persist();
      }
      throw e;
    }
  }
  async function api(p, options = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await access();
      try {
        return await request('https://www.googleapis.com/calendar/v3' + p, {
          ...options,
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers }
        });
      } catch (e) {
        if (e.status !== 401 || attempt) throw e;
        delete secret.access_token;
        secret.expires = 0;
      }
    }
  }
  const eventsPath = () => '/calendars/' + encodeURIComponent(meta.calendar.id) + '/events';
  const updateBook = fn => {
    const b = clone(getBook());
    fn(b);
    C.projectAll(b);
    commit(b);
  };
  function applyRemote(b, id, g) {
    const at = id.lastIndexOf('@');
    if (at > 0 && b.calendar.events[id.slice(0, at)]?.recurrence?.length) {
      const e = b.calendar.events[id.slice(0, at)],
        d = id.slice(at + 1);
      if (g.status === 'cancelled') e.exceptions[d] = { ...e.exceptions[d], deleted: true };
      else {
        const n = fromGoogle(g, id, e);
        e.exceptions[d] = {
          ...e.exceptions[d],
          start: n.start,
          end: n.end,
          title: n.title,
          description: n.description,
          location: n.location,
          deleted: false
        };
      }
      return;
    }
    if (g.status === 'cancelled') {
      if (b.calendar.events[id]) b.calendar.events[id].deleted = true;
    } else b.calendar.events[id] = fromGoogle(g, id, b.calendar.events[id]);
  }
  async function pull() {
    let page,
      changes = [],
      next;
    try {
      do {
        const q = new URLSearchParams({
          showDeleted: 'true',
          maxResults: '2500',
          ...(meta.syncToken ? { syncToken: meta.syncToken } : {}),
          ...(page ? { pageToken: page } : {})
        });
        const r = await api(eventsPath() + '?' + q);
        changes.push(...(r.items || []));
        page = r.nextPageToken;
        next = r.nextSyncToken || next;
      } while (page);
    } catch (e) {
      if (e.status === 410) {
        delete meta.syncToken;
        persist();
        return pull();
      }
      throw e;
    }
    // Resolve all pages as one local transaction. The book is read only after network I/O.
    if (meta.paused) return;
    const b = clone(getBook());
    let changed = false;
    const links = clone(meta.links),
      conflicts = clone(meta.conflicts || {});
    changes.sort((a, b) => Number(!!a.recurringEventId) - Number(!!b.recurringEventId));
    for (const g of changes) {
      let id = Object.keys(links).find(k => links[k].googleId === g.id);
      if (!id && g.recurringEventId) {
        const parent = Object.keys(links).find(k => links[k].googleId === g.recurringEventId);
        if (!parent) continue;
        const d =
          g.originalStartTime?.date ||
          C.inZone(g.originalStartTime.dateTime, b.calendar.events[parent]?.timeZone || 'Asia/Bangkok').slice(0, 10);
        id = parent + '@' + d;
      }
      if (!id && g.status === 'cancelled') continue;
      id ||= 'google-' + hash(meta.calendar.id + '|' + g.id).slice(0, 32);
      const old = links[id],
        item = localItems(b)[id];
      if (old?.etag === g.etag) continue;
      // A provisional link without an ETag is a retried insert; adopt its response only if content agrees.
      const remoteBody = g.status === 'cancelled' ? { deleted: true } : payload(fromGoogle(g, id, item?.event));
      if (old && item && hash(item.body) !== old.base) {
        if (hash(remoteBody) === old.base) {
          links[id] = { ...old, etag: g.etag, deleted: g.status === 'cancelled' };
          continue;
        }
        if (hash(remoteBody) !== hash(item.body)) {
          conflicts[id] = { local: item.body, remote: g };
          continue;
        }
      }
      applyRemote(b, id, g);
      changed = true;
      links[id] = {
        googleId: g.id,
        etag: g.etag,
        deleted: g.status === 'cancelled',
        generation: old?.generation || 0,
        base: hash(localItems(b)[id]?.body || { deleted: true })
      };
      delete conflicts[id];
    }
    if (changed) {
      C.projectAll(b);
      commit(b);
    }
    meta.links = links;
    meta.conflicts = conflicts;
    meta.syncToken = next;
    persist();
  }
  async function push() {
    for (const [id, initial] of Object.entries(localItems())) {
      if (meta.paused) return;
      if (initial.event.readOnly || meta.conflicts[id]) continue;
      let item = localItems()[id];
      if (!item) continue;
      let link = meta.links[id];
      if (hash(item.body) === link?.base || (!link && item.body.deleted && !item.occurrence)) continue;
      if (item.occurrence && !link) {
        const parent = meta.links[item.event.id];
        if (!parent?.etag) continue;
        const q = new URLSearchParams({
          originalStart: item.event.allDay
            ? item.occurrence + 'T00:00:00Z'
            : C.utc(item.occurrence + item.event.start.slice(10), item.event.timeZone),
          showDeleted: 'true'
        });
        const r = await api(eventsPath() + '/' + encodeURIComponent(parent.googleId) + '/instances?' + q);
        const g = r.items?.find(
          g =>
            (g.originalStartTime?.date || C.inZone(g.originalStartTime.dateTime, item.event.timeZone).slice(0, 10)) ===
            item.occurrence
        );
        if (!g) throw Error('Could not locate recurring occurrence in Google.');
        if (meta.paused) return;
        link = meta.links[id] = { googleId: g.id, etag: g.etag, base: '' };
        persist();
      }
      if (!item.occurrence && link?.deleted && !item.body.deleted) {
        const generation = (link.generation || 0) + 1;
        link = meta.links[id] = {
          googleId: 'db' + hash(meta.calendar.id + '|' + id + '|' + generation).slice(0, 48),
          base: '',
          generation
        };
        persist();
      }
      if (!link) {
        link = meta.links[id] = { googleId: 'db' + hash(meta.calendar.id + '|' + id).slice(0, 48), base: '' };
        persist();
      }
      const sentHash = hash(item.body);
      let g;
      try {
        if (item.body.deleted) {
          if (link.etag)
            await api(eventsPath() + '/' + encodeURIComponent(link.googleId), {
              method: 'DELETE',
              headers: { 'If-Match': link.etag }
            });
          g = { id: link.googleId, status: 'cancelled' };
        } else if (link.etag) {
          g = await api(eventsPath() + '/' + encodeURIComponent(link.googleId), {
            method: 'PATCH',
            headers: { 'If-Match': link.etag },
            body: JSON.stringify({
              ...item.body,
              ...(link.deleted ? { status: 'confirmed' } : {}),
              recurrence: item.body.recurrence || []
            })
          });
        } else {
          try {
            g = await api(eventsPath(), {
              method: 'POST',
              body: JSON.stringify({
                ...item.body,
                id: link.googleId,
                extendedProperties: { private: { dailyBookId: id } }
              })
            });
          } catch (e) {
            if (e.status !== 409) throw e;
            g = await api(eventsPath() + '/' + encodeURIComponent(link.googleId));
            if (g.status === 'cancelled') {
              meta.links[id] = { ...link, deleted: true, etag: g.etag };
              persist();
              continue;
            }
            if (hash(payload(fromGoogle(g, id, item.event))) !== sentHash) {
              meta.conflicts[id] = { local: item.body, remote: g };
              persist();
              continue;
            }
          }
        }
      } catch (e) {
        if (e.status === 412) {
          const remote = await api(eventsPath() + '/' + encodeURIComponent(link.googleId));
          meta.conflicts[id] = { local: item.body, remote };
          persist();
          continue;
        }
        if (item.body.deleted && [404, 410].includes(e.status)) g = { id: link.googleId, status: 'cancelled' };
        else throw e;
      }
      meta.links[id] = {
        googleId: link.googleId,
        etag: g.etag,
        deleted: !!item.body.deleted,
        generation: link.generation || 0,
        base: sentHash
      };
      persist();
    }
  }
  async function sync() {
    if (busy || meta.paused || !secret.refresh_token || !meta.calendar) return status();
    busy = true;
    try {
      await pull();
      await push();
      meta.error = '';
      meta.lastSync = new Date().toISOString();
    } catch (e) {
      meta.error = e.message;
    } finally {
      busy = false;
      persist();
    }
    return status();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(sync, 1200);
    timer.unref?.();
  }
  function pause() {
    meta.paused = true;
    meta.restoreReview = true;
    persist();
  }
  async function handle(route, body = {}) {
    if (route === 'status') return status();
    if (route === 'configure') {
      if (busy) throw Error('Wait for the current sync to finish.');
      const c = body.credentials?.installed;
      if (!c?.client_id || !c?.client_secret) throw Error('Choose the Google OAuth Desktop app JSON file.');
      if (secret.refresh_token) throw Error('Disconnect before replacing OAuth configuration.');
      secret = { client_id: c.client_id, client_secret: c.client_secret };
      credentials();
      return status();
    }
    if (route === 'connect') {
      const verifier = crypto.randomBytes(48).toString('base64url'),
        state = crypto.randomBytes(32).toString('hex');
      if (!secret.client_id) throw Error('Configure your Google OAuth Desktop app first.');
      oauth = { verifier, state, expires: Date.now() + 600000 };
      const q = new URLSearchParams({
        client_id: secret.client_id,
        redirect_uri: origin + '/api/google/callback',
        response_type: 'code',
        scope:
          'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        access_type: 'offline',
        prompt: 'consent select_account',
        state,
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256'
      });
      return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q };
    }
    if (route === 'callback') {
      if (!oauth || body.state !== oauth.state || oauth.expires < Date.now())
        throw Error('Expired or invalid Google sign-in. Please try again.');
      const flow = oauth;
      oauth = null;
      if (body.error || !body.code) throw Error('Google sign-in was cancelled.');
      const r = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: secret.client_id,
          client_secret: secret.client_secret,
          code: body.code,
          code_verifier: flow.verifier,
          grant_type: 'authorization_code',
          redirect_uri: origin + '/api/google/callback'
        })
      });
      secret = {
        client_id: secret.client_id,
        client_secret: secret.client_secret,
        ...r,
        expires: Date.now() + r.expires_in * 1000
      };
      credentials();
      meta.paused = true;
      meta.error = '';
      persist();
      return status();
    }
    if (route === 'calendars') {
      let items = [],
        page;
      do {
        const r = await api(
          '/users/me/calendarList?' +
            new URLSearchParams({ minAccessRole: 'writer', ...(page ? { pageToken: page } : {}) })
        );
        items.push(
          ...(r.items || [])
            .filter(x => ['owner', 'writer'].includes(x.accessRole))
            .map(x => ({ id: x.id, summary: x.summary }))
        );
        page = r.nextPageToken;
      } while (page);
      return { items };
    }
    if (route === 'select') {
      if (busy) throw Error('Wait for the current sync to finish.');
      if (meta.calendar && meta.calendar.id !== body.id)
        throw Error(
          'This installation is linked to another calendar. Keep the existing calendar to preserve event links.'
        );
      const calendars = await handle('calendars');
      const cal = calendars.items.find(c => c.id === body.id);
      if (!cal) throw Error('Choose a calendar you can edit.');
      meta.calendar = cal;
      meta.paused = true;
      persist();
      return status();
    }
    if (route === 'probe') {
      if (busy) throw Error('Wait for the current sync to finish.');
      if (!meta.calendar) throw Error('Select a calendar first.');
      busy = true;
      const id = meta.probeId || 'dbtest' + crypto.randomBytes(16).toString('hex');
      meta.probeId = id;
      persist();
      try {
        try {
          await api(eventsPath() + '/' + id);
        } catch (e) {
          if (e.status !== 404) throw e;
          try {
            await api(eventsPath(), {
              method: 'POST',
              body: JSON.stringify({
                id,
                summary: 'Daily Book connection test (temporary)',
                start: { dateTime: new Date(Date.now() + 3600000).toISOString() },
                end: { dateTime: new Date(Date.now() + 5400000).toISOString() },
                reminders: { useDefault: false }
              })
            });
          } catch (insertError) {
            if (insertError.status !== 409) throw insertError;
          }
        }
        await api(eventsPath() + '/' + id);
        try {
          await api(eventsPath() + '/' + id, { method: 'DELETE' });
        } catch (e) {
          if (![404, 410].includes(e.status)) throw e;
        }
        delete meta.probeId;
        meta.probePassed = true;
        meta.error = '';
      } finally {
        busy = false;
        persist();
      }
      return status();
    }
    if (route === 'start') {
      const calendars = await handle('calendars');
      if (!calendars.items.some(c => c.id === meta.calendar?.id))
        throw Error('The selected calendar is unavailable to this Google account.');
      if (!meta.probePassed) throw Error('Run the connection test before importing your activities.');
      meta.paused = false;
      delete meta.restoreReview;
      persist();
      return sync();
    }
    if (route === 'sync') return sync();
    if (route === 'pause') {
      pause();
      return status();
    }
    if (route === 'disconnect') {
      if (busy) throw Error('Wait for the current sync to finish.');
      secret = { client_id: secret.client_id, client_secret: secret.client_secret };
      credentials();
      meta.paused = true;
      meta.error = '';
      persist();
      return status();
    }
    if (route === 'resolve') {
      if (busy) throw Error('Wait for the current sync to finish.');
      const c = meta.conflicts[body.id];
      if (!c) throw Error('Conflict no longer exists.');
      if (!['local', 'remote'].includes(body.choice)) throw Error('Choose local or Google.');
      if (body.choice === 'remote') updateBook(b => applyRemote(b, body.id, c.remote));
      const remoteBody =
        c.remote.status === 'cancelled'
          ? { deleted: true }
          : payload(fromGoogle(c.remote, body.id, localItems()[body.id]?.event));
      meta.links[body.id] = {
        ...meta.links[body.id],
        googleId: c.remote.id,
        etag: c.remote.etag,
        deleted: c.remote.status === 'cancelled',
        base: hash(remoteBody)
      };
      delete meta.conflicts[body.id];
      persist();
      schedule();
      return status();
    }
    if (route === 'instances') {
      if (!C.dateOK(body.start) || !C.dateOK(body.end) || body.end < body.start) throw Error('Invalid calendar range.');
      if (!meta.calendar || !secret.refresh_token) return {};
      for (const [id, e] of Object.entries(getBook().calendar.events)) {
        if (C.simpleRule(e) !== false || !meta.links[id]) continue;
        let page,
          instances = [];
        do {
          const q = new URLSearchParams({
            timeMin: body.start + 'T00:00:00+07:00',
            timeMax: C.add(body.end, 1) + 'T00:00:00+07:00',
            ...(page ? { pageToken: page } : {})
          });
          const r = await api(eventsPath() + '/' + encodeURIComponent(meta.links[id].googleId) + '/instances?' + q);
          instances.push(
            ...(r.items || [])
              .filter(g => g.status !== 'cancelled')
              .map(g => ({
                ...fromGoogle(g, g.id, e),
                originalDate: (g.originalStartTime?.date || g.originalStartTime?.dateTime || '').slice(0, 10)
              }))
          );
          page = r.nextPageToken;
        } while (page);
        if (JSON.stringify(getBook().calendar.events[id]?.cachedInstances) !== JSON.stringify(instances))
          updateBook(b => {
            if (b.calendar.events[id]) b.calendar.events[id].cachedInstances = instances;
          });
      }
      return {};
    }
    throw Error('Unknown Google Calendar action.');
  }
  const interval = setInterval(sync, 60000);
  interval.unref?.();
  schedule();
  return {
    handle,
    status,
    schedule,
    pause,
    close() {
      clearInterval(interval);
      clearTimeout(timer);
    },
    sync
  };
}
module.exports = { createGoogle, payload, fromGoogle, protect };
