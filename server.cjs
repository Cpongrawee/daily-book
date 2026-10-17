const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Calendar = require('./dist/calendar-model.js');
const IdeaBoard = require('./dist/idea-board.js');
const { createGoogle } = require('./google-calendar.cjs');
const { backupsToDelete, backupTime } = require('./backup-retention.cjs');
const { createReminder } = require('./reminder.cjs');
const ROOT = __dirname;
const DATA = process.env.DAILY_BOOK_DATA || path.join(ROOT, 'data');
const PORT = Number(process.env.DAILY_BOOK_PORT || 47831);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FILE = path.join(DATA, 'book.json');
// Idea Board pictures: one file each, named by a random id; the book stores only the name.
const IMAGES = path.join(DATA, 'board-images');
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true });
// Trust the file's own first bytes, not the Content-Type the browser sent.
function imageKind(buf) {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (/^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return 'gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const empty = () => ({
  version: 1,
  revision: 0,
  identity: '', // empty: the app shows its default Compass until the user edits it
  days: {},
  goals: [],
  reviews: {},
  calendar: { version: 1, events: {} }
});
function valid(d) {
  if (
    d?.calendar &&
    (d.calendar.version !== 1 ||
      !d.calendar.events ||
      Array.isArray(d.calendar.events) ||
      !Object.entries(d.calendar.events).every(([id, e]) => id === e.id && Calendar.validEvent(e)))
  )
    return false;
  if (
    !d ||
    d.version !== 1 ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    typeof d.identity !== 'string' ||
    !d.days ||
    typeof d.days !== 'object' ||
    Array.isArray(d.days) ||
    !Array.isArray(d.goals) ||
    !d.reviews ||
    typeof d.reviews !== 'object' ||
    Array.isArray(d.reviews)
  )
    return false;
  if (d.board !== undefined && !IdeaBoard.validBoard(d.board)) return false;
  const str = x => typeof x === 'string';
  const date = x =>
    str(x) && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
  const time = x => str(x) && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
  if (
    d.settings !== undefined &&
    (!d.settings ||
      typeof d.settings !== 'object' ||
      Array.isArray(d.settings) ||
      (d.settings.bedtimeReminder !== undefined &&
        d.settings.bedtimeReminder !== '' &&
        !time(d.settings.bedtimeReminder)))
  )
    return false;
  if (
    !d.goals.every(
      g =>
        g &&
        str(g.id) &&
        str(g.title) &&
        ['week', 'month'].includes(g.type) &&
        date(g.start) &&
        date(g.end) &&
        g.start <= g.end &&
        typeof g.done === 'boolean' &&
        str(g.parentId)
    )
  )
    return false;
  if (new Set(d.goals.map(g => g.id)).size !== d.goals.length) return false;
  for (const [key, day] of Object.entries(d.days)) {
    if (
      !date(key) ||
      !day ||
      !Array.isArray(day.schedule) ||
      !Array.isArray(day.tasks) ||
      !str(day.priority) ||
      typeof day.priorityDone !== 'boolean' ||
      typeof day.closed !== 'boolean' ||
      !day.reflections ||
      typeof day.reflections !== 'object'
    )
      return false;
    if (!['compass', 'fix', 'discipline', 'tomorrow'].every(k => str(day.reflections[k]))) return false;
    if (day.reflections.worry !== undefined && !str(day.reflections.worry)) return false;
    if (
      day.enlightenment !== undefined &&
      (!day.enlightenment ||
        typeof day.enlightenment !== 'object' ||
        Array.isArray(day.enlightenment) ||
        !Object.entries(day.enlightenment).every(
          ([k, v]) =>
            ['priority', 'tasks', 'compass', 'fix', 'discipline', 'tomorrow'].includes(k) && typeof v === 'boolean'
        ))
    )
      return false;
    if (!day.tasks.every(t => t && str(t.id) && str(t.text) && typeof t.done === 'boolean' && str(t.goalId)))
      return false;
    if (
      !day.schedule.every(
        s =>
          s &&
          str(s.id) &&
          time(s.time) &&
          str(s.plan) &&
          (s.end === undefined || s.end === '' || time(s.end)) &&
          typeof s.done === 'boolean' &&
          Array.isArray(s.changes) &&
          s.changes.every(c => c && ['red', 'blue'].includes(c.kind) && str(c.actual) && str(c.reason) && str(c.at))
      )
    )
      return false;
  }
  return Object.values(d.reviews).every(str);
}
// Startup problems are also written to data/server-error.log so the launcher can show them.
function fatal(message) {
  console.error(message);
  try {
    fs.appendFileSync(path.join(DATA, 'server-error.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {}
  process.exit(1);
}
// Write a temp file, flush it to disk, then swap it in, so a crash or power cut never leaves a half-written book.
function writeDurably(file, text) {
  const fd = fs.openSync(file + '.tmp', 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(file + '.tmp', file);
}
function readBook(file) {
  try {
    const book = JSON.parse(fs.readFileSync(file, 'utf8'));
    return valid(book) ? { book } : { problem: 'it is not a valid Daily Book' };
  } catch (e) {
    return { problem: e.code === 'ENOENT' ? 'it is missing' : e instanceof SyntaxError ? 'it is damaged' : e.message };
  }
}
// The most recent readable copy: an unfinished save (book.json.tmp) or a backup, highest revision first.
function newestGoodCopy() {
  const dir = path.join(DATA, 'backups');
  const candidates = [{ file: FILE + '.tmp', label: 'an unfinished save' }];
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const file = path.join(dir, name);
    candidates.push({ file, label: `backup ${name}`, time: backupTime(name) ?? fs.statSync(file).mtimeMs });
  }
  let best = null;
  for (const c of candidates) {
    const { book } = readBook(c.file);
    if (
      book &&
      (!best || book.revision > best.book.revision || (book.revision === best.book.revision && c.time > best.time))
    )
      best = { ...c, book };
  }
  return best;
}
let state,
  notice = '';
{
  const opened = readBook(FILE);
  if (opened.book) state = opened.book;
  else {
    const copy = newestGoodCopy();
    const exists = fs.existsSync(FILE);
    if (copy) {
      const kept = exists ? `book.damaged-${new Date().toISOString().replace(/[:.]/g, '-')}.json` : '';
      if (kept) fs.copyFileSync(FILE, path.join(DATA, kept));
      writeDurably(FILE, JSON.stringify(copy.book, null, 2));
      state = copy.book;
      notice = `Your book file could not be opened because ${opened.problem}, so Daily Book reopened the most recent good copy (${copy.label}, revision ${copy.book.revision}).${kept ? ` The unreadable file was kept as data\\${kept}.` : ''} Please check your latest entries.`;
      console.error(notice);
    } else if (!exists) {
      state = empty();
      writeDurably(FILE, JSON.stringify(state, null, 2));
    } else
      fatal(
        `Your book could not be read because ${opened.problem}, and no good backup was found. Original file preserved.`
      );
  }
}
const legacyTimes = new Set();
function rememberLegacyTimes(book) {
  for (const [dateKey, d] of Object.entries(book.days))
    for (const a of d.schedule)
      if (a.time < '05:00' || a.time > '23:00' || (a.end && (a.end > '23:00' || a.end <= a.time)))
        legacyTimes.add(JSON.stringify([dateKey, a.id, a.time, a.end || '']));
}
rememberLegacyTimes(state);
function commit(next) {
  if (next.revision !== state.revision) throw Error('Book changed while saving. Reload before continuing.');
  next.revision = state.revision + 1;
  fs.copyFileSync(
    FILE,
    path.join(DATA, 'backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${state.revision}.json`)
  );
  writeDurably(FILE, JSON.stringify(next, null, 2));
  state = next;
  // Pruning must never turn a completed save into a reported failure.
  try {
    for (const n of backupsToDelete(fs.readdirSync(path.join(DATA, 'backups'))))
      fs.unlinkSync(path.join(DATA, 'backups', n));
  } catch (e) {
    console.error('Backup cleanup skipped:', e.message);
  }
}
if (!state.calendar) {
  const next = Calendar.clone(state);
  Calendar.migrate(next);
  Calendar.projectAll(next);
  commit(next);
}
const google = createGoogle({ data: DATA, origin: ORIGIN, getBook: () => state, commit });
// Only the real book (default data folder) sends bedtime notifications; tests and QA copies stay silent.
if (!process.env.DAILY_BOOK_DATA) createReminder({ data: DATA, origin: ORIGIN, getBook: () => state });
const token = crypto.randomBytes(24).toString('hex');
const files = {
  '/calendar-setup.css': 'calendar-setup.css',
  '/google-calendar-setup.html': 'google-calendar-setup.html',
  '/calendar-model.js': 'calendar-model.js',
  '/calendar-ui.js': 'calendar-ui.js',
  '/calendar.css': 'calendar.css',
  '/intro-math-atlas-a.png': 'intro-math-atlas-a.png',
  '/intro-math-atlas-b.png': 'intro-math-atlas-b.png',
  '/intro-math-a.png': 'intro-math-a.png',
  '/intro-math-b.png': 'intro-math-b.png',
  '/intro-cover-v2.png': 'intro-cover-v2.png',
  '/intro-spine-v2.png': 'intro-spine-v2.png',
  '/intro.js': 'intro.js',
  '/intro.css': 'intro.css',
  '/': 'index.html',
  '/app.js': 'app.js',
  '/schedule.js': 'schedule.js',
  '/behavior.js': 'behavior.js',
  '/period-review.js': 'period-review.js',
  '/style.css': 'style.css',
  '/mood-sleep.js': 'mood-sleep.js',
  '/body-metrics.js': 'body-metrics.js',
  '/cycle.js': 'cycle.js',
  '/search.js': 'search.js',
  '/insights.js': 'insights.js',
  '/idea-board.js': 'idea-board.js',
  '/idea-board.css': 'idea-board.css',
  '/daily-book-logo.png': 'daily-book-logo.png',
  '/daily-book.ico': 'daily-book.ico',
  '/fonts/Quintessential-Regular.ttf': 'fonts/Quintessential-Regular.ttf'
};
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (code, data, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type });
    res.end(Buffer.isBuffer(data) || typeof data === 'string' ? data : JSON.stringify(data));
  };
  if (req.headers.host !== `127.0.0.1:${PORT}`)
    return send(403, { error: 'Open the app using its 127.0.0.1 address.' });
  const route = req.url.split('?')[0];
  if (route === '/api/google/callback' && req.method === 'GET') {
    try {
      await google.handle('callback', Object.fromEntries(new URL(req.url, ORIGIN).searchParams));
      return send(
        200,
        'Google connected. You can close this tab and return to Daily Book.',
        'text/plain; charset=utf-8'
      );
    } catch (e) {
      return send(400, e.message, 'text/plain; charset=utf-8');
    }
  }
  if (route.startsWith('/api/google/')) {
    if (req.headers.origin !== ORIGIN || req.headers['x-book-token'] !== token || req.method !== 'POST')
      return send(403, { error: 'Please reopen this app.' });
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 1024 * 1024) return send(413, { error: 'Request too large.' });
      }
      const body = raw ? JSON.parse(raw) : {};
      return send(200, await google.handle(route.slice('/api/google/'.length), body));
    } catch (e) {
      return send(400, { error: e.message });
    }
  }
  if (route === '/api/board-images' && req.method === 'POST') {
    if (req.headers.origin !== ORIGIN || req.headers['x-book-token'] !== token)
      return send(403, { error: 'Please reopen this app.' });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) return send(413, { error: 'This picture is too large (8 MB is the limit).' });
        chunks.push(chunk);
      }
      const buf = Buffer.concat(chunks),
        kind = imageKind(buf);
      if (!kind) return send(400, { error: 'Only PNG, JPG, GIF and WebP pictures can be pinned.' });
      const name = `${crypto.randomBytes(16).toString('hex')}.${kind}`;
      fs.mkdirSync(IMAGES, { recursive: true });
      writeDurably(path.join(IMAGES, name), buf);
      return send(200, { image: name });
    } catch (e) {
      return send(500, { error: 'The picture could not be saved. ' + e.message });
    }
  }
  if (req.method === 'GET' && route.startsWith('/board-images/')) {
    const name = route.slice('/board-images/'.length);
    if (!IdeaBoard.IMAGE_NAME.test(name)) return send(404, { error: 'Not found' });
    try {
      return send(200, fs.readFileSync(path.join(IMAGES, name)), IMAGE_TYPES[name.split('.').pop()]);
    } catch {
      return send(404, { error: 'Not found' });
    }
  }
  if (route === '/api/calendar' && req.method === 'GET')
    return send(200, { calendar: state.calendar, revision: state.revision });
  if (req.method === 'GET' && route === '/api/book')
    return send(200, { book: state, token, ...(notice && { notice }) });
  if (req.method === 'PUT' && route === '/api/book') {
    if (req.headers.origin !== ORIGIN || req.headers['x-book-token'] !== token)
      return send(403, { error: 'Please reopen this app.' });
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 10 * 1024 * 1024) return send(413, { error: 'Book exceeds the 10 MB limit.' });
      }
      const next = JSON.parse(body);
      if (!valid(next))
        return send(400, { error: 'This book has an invalid format. Your saved book was not changed.' });
      if (next.revision !== state.revision)
        return send(409, {
          error: 'Another tab saved a newer version. Download your unsaved copy, then reload before continuing.'
        });
      if (req.headers['x-book-restore'] !== 'true') {
        for (const [dateKey, day] of Object.entries(next.days))
          for (const activity of day.schedule) {
            const old = state.days[dateKey]?.schedule.find(s => s.id === activity.id);
            if (
              (old && old.time === activity.time && (old.end || '') === (activity.end || '')) ||
              legacyTimes.has(JSON.stringify([dateKey, activity.id, activity.time, activity.end || '']))
            )
              continue;
            const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
            if (
              !timePattern.test(activity.time) ||
              (activity.end && (!timePattern.test(activity.end) || activity.end <= activity.time))
            )
              return send(400, {
                error: 'Activity end must be later than start. Use Calendar for overnight activities.'
              });
          }
      }
      if (req.headers['x-book-restore'] === 'true') {
        if (google.status().busy)
          return send(409, { error: 'Wait for Google sync to finish before restoring a backup.' });
        google.pause();
        Calendar.migrate(next);
        for (const [id, event] of Object.entries(state.calendar.events))
          if (!next.calendar.events[id]) next.calendar.events[id] = { ...event, deleted: true };
        rememberLegacyTimes(next);
      } else if (!next.calendar) {
        return send(409, { error: 'The calendar format has changed. Reload this page before saving.' });
      }
      Calendar.projectAll(next);
      commit(next);
      notice = '';
      google.schedule();
      return send(200, { revision: state.revision, book: state });
    } catch (e) {
      return send(500, { error: 'Could not save. Download a backup before closing. ' + e.message });
    }
  }
  if (req.method === 'GET' && files[route]) {
    const file = files[route];
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    );
    if (file.endsWith('.png') || file.endsWith('.ico'))
      return send(
        200,
        fs.readFileSync(path.join(ROOT, 'dist', file)),
        file.endsWith('.png') ? 'image/png' : 'image/x-icon'
      );
    if (file.endsWith('.ttf')) return send(200, fs.readFileSync(path.join(ROOT, 'dist', file)), 'font/ttf');
    return send(
      200,
      fs.readFileSync(path.join(ROOT, 'dist', file), 'utf8'),
      file.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : file.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : 'text/html; charset=utf-8'
    );
  }
  send(404, { error: 'Not found' });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Daily Book ready: ${ORIGIN}`));
server.on('error', e =>
  fatal(e.code === 'EADDRINUSE' ? `Port ${PORT} is already used by another program.` : `Server error: ${e.message}`)
);
