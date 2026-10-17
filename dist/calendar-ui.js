'use strict';
let calendarInstanceRange = '',
  googlePanelSignature = '';
let calendarMode = 'month',
  calendarStatus = null,
  calendarSelected = bangkokToday(),
  calendarEdit = null,
  calendarInitialized = false;
const C = BookCalendar;
const calendarRange = () => {
  if (calendarMode === 'week') {
    const s = C.add(date, -C.weekday(date));
    return [s, C.add(s, 6)];
  }
  const s = date.slice(0, 8) + '01';
  const end = C.add(new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 1)).toISOString().slice(0, 10), -1);
  return [C.add(s, -C.weekday(s)), C.add(end, 6 - C.weekday(end))];
};
function calendarCard(e, shownDate = e.start.slice(0, 10)) {
  return `<button class="calendar-event ${e.allDay ? 'all-day' : ''} ${e.done ? 'completed' : ''}" data-cal-event="${esc(e.eventId)}" data-occurrence="${e.occurrence}" title="${esc(e.title)}"><span>${e.allDay ? 'All day' : typeof shownDate === 'string' && e.start.slice(0, 10) < shownDate ? '↳ 00:00' : e.start.slice(11, 16)}</span> ${esc(e.title)}${e.recurrence?.length ? ' ↻' : ''}${e.readOnly ? ' ↗' : ''}</button>`;
}
function dailyAllDay() {
  return `<div class="daily-calendar-bar"><button data-cal-add="${date}">+ Activity</button><button data-cal-show="${date}">Calendar ↗</button>${C.between(
    book,
    date,
    date
  )
    .filter(e => e.allDay)
    .map(calendarCard)
    .join('')}</div>`;
}
function renderCalendar() {
  $('#page-title').textContent = 'Your calendar';
  $('#eyebrow').textContent = 'MAKE ROOM FOR WHAT MATTERS';
  const [start, end] = calendarRange(),
    events = C.between(book, start, end),
    days = [];
  for (let d = start; d <= end; d = C.add(d, 1)) days.push(d);
  const onDay = d => events.filter(e => e.start.slice(0, 10) <= d && e.end > (e.allDay ? d : d + 'T00:00:00'));
  const month = days
    .map(
      d =>
        `<div class="calendar-cell ${d.slice(0, 7) !== date.slice(0, 7) ? 'outside-month' : ''} ${d === calendarSelected ? 'selected' : ''}"><button class="calendar-date ${d === bangkokToday() ? 'today' : ''}" data-cal-date="${d}" aria-label="Select ${d}">${Number(d.slice(8))}</button><div class="calendar-cell-events">${onDay(
          d
        )
          .slice(0, 3)
          .map(e => calendarCard(e, d))
          .join(
            ''
          )}${onDay(d).length > 3 ? `<button data-cal-date="${d}" class="calendar-more">+${onDay(d).length - 3} more</button>` : ''}</div><button class="calendar-cell-add" data-cal-add="${d}" aria-label="Add activity on ${d}">+</button></div>`
    )
    .join('');
  const week = days
    .map(d => {
      const entries = onDay(d).filter(e => !e.allDay);
      return `<div class="calendar-week-day"><div class="calendar-week-label"><button data-cal-date="${d}">${fmt(d, { weekday: 'short', day: 'numeric' })}</button>${onDay(
        d
      )
        .filter(e => e.allDay)
        .map(calendarCard)
        .join('')}</div><div class="calendar-week-track">${Array.from({ length: 48 }, (_, i) => {
        const t = String(Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
        return `<button class="calendar-time-slot" data-cal-add="${d}" data-cal-time="${t}" aria-label="Add ${d} at ${t}"><span>${t}</span></button>`;
      }).join('')}${entries
        .map(e => {
          const start = e.start.slice(0, 10) < d ? 0 : DailyBookSchedule.minutes(e.start.slice(11, 16)),
            end = e.end.slice(0, 10) > d ? 1440 : DailyBookSchedule.minutes(e.end.slice(11, 16));
          return `<div class="calendar-week-event" data-cal-top="${(start / 30) * 36}" data-cal-height="${Math.max(30, ((end - start) / 30) * 36)}">${calendarCard(e, d)}</div>`;
        })
        .join('')}</div></div>`;
    })
    .join('');
  return `<section class="page calendar-page"><div class="calendar-toolbar"><h2>${calendarMode === 'month' ? fmt(date, { month: 'long', year: 'numeric' }) : fmt(start, { month: 'short', day: 'numeric' }) + ' – ' + fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}</h2><div><button data-cal-mode="month" aria-pressed="${calendarMode === 'month'}">Month</button><button data-cal-mode="week" aria-pressed="${calendarMode === 'week'}">Week</button><button class="primary" data-cal-add="${calendarSelected}">+ Activity</button></div></div><p class="calendar-zone">Asia/Bangkok · Sunday–Saturday</p>${calendarMode === 'month' ? `<div class="calendar-month"><div class="calendar-weekdays">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<span>${x}</span>`).join('')}</div><div class="calendar-month-grid">${month}</div></div>` : `<div class="calendar-week-scroll"><div class="calendar-week-grid">${week}</div></div>`}<section class="calendar-agenda"><div class="calendar-toolbar"><h3>${fmt(calendarSelected, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</h3><div><button data-cal-add="${calendarSelected}">+ Add</button><button data-open-date="${calendarSelected}">Open Daily ↗</button></div></div>${
    C.between(book, calendarSelected, calendarSelected)
      .map(e => calendarCard(e, calendarSelected))
      .join('') || '<p class="empty">A little space for your next plan.</p>'
  }</section></section><details class="page calendar-google"><summary>Google Calendar <span id="google-status-label">${calendarStatus?.connected ? 'Connected' : 'Connect your calendar'}</span></summary><div id="google-panel" class="section">${googlePanel()}</div></details>`;
}
function mountCalendar() {
  document.querySelectorAll('[data-cal-top]').forEach(el => {
    el.style.top = el.dataset.calTop + 'px';
    el.style.height = el.dataset.calHeight + 'px';
  });
  document.querySelectorAll('.calendar-week-track').forEach(track => {
    const cards = [...track.querySelectorAll('.calendar-week-event')].sort(
      (a, b) => Number(a.dataset.calTop) - Number(b.dataset.calTop)
    );
    let group = [],
      ends = [],
      limit = 0;
    const flush = () => {
      for (const { card, lane } of group) {
        card.style.width = 100 / ends.length + '%';
        card.style.left = (lane * 100) / ends.length + '%';
      }
      group = [];
      ends = [];
    };
    for (const card of cards) {
      const start = Number(card.dataset.calTop),
        end = start + Number(card.dataset.calHeight);
      if (group.length && start >= limit) flush();
      let lane = ends.findIndex(n => n <= start);
      if (lane < 0) lane = ends.length;
      ends[lane] = end;
      group.push({ card, lane });
      limit = Math.max(...ends);
    }
    if (group.length) flush();
  });
  refreshGoogle()
    .then(async () => {
      const [start, end] = calendarRange(),
        key = start + '|' + end + '|' + calendarStatus?.lastSync;
      if (
        calendarStatus?.connected &&
        calendarStatus?.calendar &&
        key !== calendarInstanceRange &&
        Object.values(book.calendar.events).some(e => C.simpleRule(e) === false)
      ) {
        calendarInstanceRange = key;
        try {
          await googleCall('instances', { start, end });
          await refreshBook();
        } catch (e) {
          calendarInstanceRange = '';
          error(e.message);
        }
      }
    })
    .catch(() => {});
}
function conflictText(e) {
  if (e.deleted || e.status === 'cancelled') return 'Deleted';
  return [
    e.summary || '(Untitled)',
    (e.start?.date || e.start?.dateTime || '') + ' → ' + (e.end?.date || e.end?.dateTime || ''),
    e.location,
    e.description
  ]
    .filter(Boolean)
    .join('\n');
}
function googlePanel() {
  const s = calendarStatus;
  if (!s) return '<p>Checking connection…</p>';
  return `<p>${s.connected ? 'Google account connected.' : 'Connect Google to keep both calendars up to date.'} ${s.calendar ? 'Calendar: <strong>' + esc(s.calendar.summary) + '</strong>' : ''}</p><p role="status">${s.busy ? 'Syncing…' : s.paused ? 'Sync paused' : s.connected && s.calendar ? 'Automatic sync every minute while Daily Book is running.' : 'Saved locally until connected.'} ${s.pending ? `${s.pending} pending changes.` : ''}${s.lastSync ? ' Last sync: ' + esc(new Date(s.lastSync).toLocaleString()) : ''}</p>${s.error ? `<p class="calendar-error">${esc(s.error)}</p>` : ''}<div class="calendar-google-actions">${!s.connected ? '<label class="calendar-config">OAuth Desktop JSON<input type="file" id="google-config" accept=".json,application/json"></label>' : ''}<button data-google="connect">${s.connected ? 'Reconnect Google' : 'Sign in with Google'}</button>${s.connected ? '<button data-google="list">Choose calendar</button>' : ''}${s.calendar && s.connected ? `<button data-google="probe">Test connection</button><button data-google="${s.paused ? 'start' : 'sync'}">${s.paused ? 'Start / resume sync' : 'Sync now'}</button><button data-google="pause">Pause</button>` : ''}${s.connected ? '<button data-google="disconnect">Disconnect</button>' : ''}</div><div id="google-calendars"></div>${s.paused && s.calendar ? '<p>The first sync sends all existing activities, including past dates, to this calendar. After a backup restore, review your local activities before resuming; simultaneous changes will appear below.</p>' : ''}${(s.conflicts || []).map(c => `<div class="calendar-conflict"><h4>${esc(c.title)}</h4><div class="calendar-conflict-versions"><div><strong>Daily Book</strong><pre>${esc(conflictText(c.local))}</pre></div><div><strong>Google</strong><pre>${esc(conflictText(c.remote))}</pre></div></div><button data-conflict="${esc(c.id)}" data-choice="local">Keep Daily Book</button><button data-conflict="${esc(c.id)}" data-choice="remote">Keep Google</button></div>`).join('')}<p class="subtle"><a href="/google-calendar-setup.html" target="_blank" rel="noopener">วิธีเชื่อม Google Calendar ↗</a> · Sign-in opens Google in a new tab. Credentials stay encrypted on this computer.</p>`;
}
async function googleCall(action, body = {}) {
  const r = await fetch('/api/google/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Book-Token': token },
    body: JSON.stringify(body)
  });
  const x = await r.json();
  if (!r.ok) throw Error(x.error || 'Google request failed.');
  return x;
}
async function refreshGoogle() {
  calendarStatus = await googleCall('status');
  const signature = JSON.stringify(calendarStatus),
    panel = $('#google-panel');
  if (panel && signature !== googlePanelSignature && !panel.contains(document.activeElement)) {
    panel.innerHTML = googlePanel();
    googlePanelSignature = signature;
  }
  const label = $('#google-status-label');
  if (label)
    label.textContent = calendarStatus.error
      ? 'Needs attention'
      : calendarStatus.busy
        ? 'Syncing…'
        : calendarStatus.connected
          ? 'Connected'
          : 'Connect your calendar';
}
async function refreshBook() {
  if (
    saving ||
    editCount !== savedCount ||
    blocked ||
    document.querySelector('dialog[open]') ||
    ($('#content').contains(document.activeElement) && document.activeElement.matches('input,textarea,select'))
  )
    return;
  const revision = book.revision,
    edits = editCount;
  const r = await fetch('/api/book');
  if (!r.ok) return;
  const x = await r.json();
  if (
    saving ||
    editCount !== edits ||
    editCount !== savedCount ||
    book.revision !== revision ||
    document.querySelector('dialog[open]')
  )
    return;
  if (x.book.revision !== book.revision) {
    book = x.book;
    lastEdit = JSON.stringify(book);
    undoStack = [];
    updateUndo();
    render();
  }
}
function ensureCalendarEditor() {
  if ($('#calendar-editor')) return;
  const d = document.createElement('dialog');
  d.id = 'calendar-editor';
  d.innerHTML = `<form id="calendar-form"><h2>Activity</h2><div id="calendar-readonly" hidden>This activity is managed in Google. <a id="calendar-google-link" target="_blank" rel="noopener">Open in Google ↗</a></div><fieldset id="calendar-fields"><label>Title<input name="title" required maxlength="500"></label><label>Description<textarea name="description" rows="3"></textarea></label><label>Location<input name="location" maxlength="1000"></label><label class="calendar-inline"><input name="allDay" type="checkbox"> All day</label><div class="calendar-form-grid"><label>Start date<input name="startDate" type="date" required></label><label class="calendar-time-field">Start time<input name="startTime" type="time" step="60"></label><label>End date<input name="endDate" type="date" required></label><label class="calendar-time-field">End time<input name="endTime" type="time" step="60"></label></div><label>Time zone<input name="timeZone" value="Asia/Bangkok" required></label><label id="calendar-scope-label">Apply to<select name="scope"><option value="instance">This occurrence</option><option value="series">Entire series</option></select></label><label>Repeat<select name="repeat"><option value="">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option></select></label><div id="calendar-repeat-days">${C.codes.map((x, i) => `<label><input type="checkbox" name="weekday" value="${x}">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</label>`).join('')}</div><label id="calendar-until">Repeat until (optional)<input name="until" type="date"></label><label class="calendar-inline"><input type="checkbox" name="done"> Completed in Daily Book</label></fieldset><p id="calendar-editor-error" role="alert" hidden></p><div class="calendar-editor-actions"><button type="button" id="calendar-delete">Delete</button><button type="button" id="calendar-open-day">Open Daily</button><button type="button" id="calendar-cancel">Cancel</button><button class="primary" id="calendar-save">Save activity</button></div></form>`;
  document.body.append(d);
  const f = $('#calendar-form');
  f.elements.allDay.onchange = editorFields;
  f.elements.repeat.onchange = editorFields;
  f.elements.scope.onchange = () =>
    fillCalendarForm(calendarEdit.event, calendarEdit.occurrence, f.elements.scope.value);
  $('#calendar-cancel').onclick = () => d.close();
  $('#calendar-open-day').onclick = () => {
    date = f.elements.startDate.value;
    view = 'day';
    d.close();
    render();
  };
  $('#calendar-delete').onclick = deleteCalendarEvent;
  f.onsubmit = saveCalendarEvent;
}
function editorFields() {
  const f = $('#calendar-form');
  document.querySelectorAll('.calendar-time-field').forEach(el => (el.hidden = f.elements.allDay.checked));
  f.elements.startTime.required = f.elements.endTime.required = !f.elements.allDay.checked;
  $('#calendar-repeat-days').hidden = f.elements.repeat.value !== 'WEEKLY';
  $('#calendar-until').hidden = !f.elements.repeat.value;
  f.elements.repeat.disabled = !!calendarEdit?.event?.recurrence?.length && f.elements.scope.value === 'instance';
}
function fillCalendarForm(e, occurrence, scope = 'instance') {
  const f = $('#calendar-form'),
    x = e.recurrence?.length && scope === 'instance' ? C.instance(e, occurrence) : e;
  f.elements.title.value = x?.title || e.title;
  f.elements.description.value = x?.description || '';
  f.elements.location.value = x?.location || '';
  f.elements.startDate.value = (x?.start || e.start).slice(0, 10);
  f.elements.endDate.value = e.allDay ? C.add(x?.end || e.end, -1) : (x?.end || e.end).slice(0, 10);
  f.elements.startTime.value = e.allDay ? '09:00' : (x?.start || e.start).slice(11, 16);
  f.elements.endTime.value = e.allDay ? '09:30' : (x?.end || e.end).slice(11, 16);
  f.elements.allDay.checked = e.allDay;
  f.elements.timeZone.value = e.timeZone;
  f.elements.done.checked = !!x?.done;
  f.elements.scope.value = scope;
  const r = C.simpleRule(e);
  f.elements.repeat.value = r?.FREQ || '';
  f.elements.until.value = r?.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : '';
  f.querySelectorAll('[name=weekday]').forEach(
    el => (el.checked = (r?.BYDAY || C.codes[C.weekday(e.start.slice(0, 10))]).split(',').includes(el.value))
  );
  $('#calendar-scope-label').hidden = !e.recurrence?.length;
  editorFields();
}
function openCalendarEvent(id, d = calendarSelected, time = '09:00') {
  ensureCalendarEditor();
  const e = id
    ? book.calendar.events[id]
    : {
        id: uid(),
        title: '',
        description: '',
        location: '',
        start: C.stamp(d, time),
        end: C.plus(C.stamp(d, time), 30),
        timeZone: 'Asia/Bangkok',
        allDay: false,
        recurrence: [],
        exceptions: {},
        done: false,
        changes: []
      };
  if (!e) return;
  calendarEdit = { event: C.clone(e), occurrence: d, isNew: !id };
  const rule = C.simpleRule(e),
    readOnly = e.readOnly || rule === false || rule?.COUNT || Number(rule?.INTERVAL || 1) !== 1;
  $('#calendar-fields').disabled = !!readOnly;
  $('#calendar-readonly').hidden = !readOnly;
  const link = $('#calendar-google-link');
  link.removeAttribute('href');
  if (/^https:\/\/(calendar\.google\.com|www\.google\.com)\//.test(e.googleUrl || '')) link.href = e.googleUrl;
  $('#calendar-save').hidden = !!readOnly;
  $('#calendar-delete').hidden = !id || !!readOnly;
  $('#calendar-editor-error').hidden = true;
  fillCalendarForm(e, d);
  $('#calendar-editor').showModal();
  $('#calendar-form').elements.title.focus();
}
function editorError(message) {
  $('#calendar-editor-error').textContent = message;
  $('#calendar-editor-error').hidden = false;
}
function saveCalendarEvent(ev) {
  ev.preventDefault();
  const f = $('#calendar-form'),
    original = calendarEdit.event,
    allDay = f.elements.allDay.checked,
    start = allDay ? f.elements.startDate.value : C.stamp(f.elements.startDate.value, f.elements.startTime.value),
    end = allDay ? C.add(f.elements.endDate.value, 1) : C.stamp(f.elements.endDate.value, f.elements.endTime.value);
  let e = {
    ...original,
    title: f.elements.title.value.trim(),
    description: f.elements.description.value,
    location: f.elements.location.value,
    allDay,
    start,
    end,
    timeZone: f.elements.timeZone.value.trim(),
    done: f.elements.done.checked,
    noEnd: original.noEnd && start === original.start && end === original.end
  };
  if (!e.title || !C.validEvent(e))
    return editorError('Enter a title, valid dates and time zone. End must be later than start.');
  const instance = original.recurrence?.length && f.elements.scope.value === 'instance';
  if (instance) {
    if (allDay !== original.allDay || e.timeZone !== original.timeZone)
      return editorError('Change all-day or time zone for the entire series.');
    const current = book.calendar.events[e.id];
    current.exceptions[calendarEdit.occurrence] = {
      ...current.exceptions[calendarEdit.occurrence],
      title: e.title,
      description: e.description,
      location: e.location,
      start,
      end,
      done: e.done,
      deleted: false
    };
  } else {
    const repeat = f.elements.repeat.value,
      until = f.elements.until.value;
    if (until && until < start.slice(0, 10)) return editorError('Repeat end must not be before the start date.');
    const days = [...f.querySelectorAll('[name=weekday]:checked')].map(el => el.value);
    if (repeat === 'WEEKLY' && !days.length) return editorError('Choose at least one repeat day.');
    if (repeat === 'WEEKLY' && !days.includes(C.codes[C.weekday(start.slice(0, 10))]))
      return editorError('The start date must be one of the selected repeat weekdays.');
    e.recurrence = C.repeatRule(repeat, days, until, allDay, e.timeZone);
    if (
      original.recurrence?.length &&
      (original.start !== start || JSON.stringify(original.recurrence) !== JSON.stringify(e.recurrence)) &&
      Object.keys(original.exceptions || {}).length
    )
      return editorError(
        'This series has edited occurrences. Change its timing or repeat pattern in Google; title and details can be edited here.'
      );
    book.calendar.events[e.id] = e;
  }
  lastEditAt = 0;
  C.projectAll(book);
  dirty(true);
  $('#calendar-editor').close();
  render();
}
function deleteCalendarEvent() {
  const e = calendarEdit.event,
    instance = e.recurrence?.length && $('#calendar-form').elements.scope.value === 'instance';
  if (
    !confirm(
      instance
        ? 'Delete only this occurrence?'
        : 'Delete this activity' +
            (e.recurrence?.length ? ' and its entire series' : '') +
            '? This also deletes it from Google after syncing.'
    )
  )
    return;
  if (instance) book.calendar.events[e.id].exceptions[calendarEdit.occurrence] = { deleted: true };
  else book.calendar.events[e.id].deleted = true;
  lastEditAt = 0;
  C.projectAll(book);
  dirty(true);
  $('#calendar-editor').close();
  render();
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.calEvent) {
      openCalendarEvent(b.dataset.calEvent, b.dataset.occurrence);
      return;
    }
    if (b.dataset.calAdd) {
      openCalendarEvent(null, b.dataset.calAdd, b.dataset.calTime || '09:00');
      return;
    }
    if (b.dataset.calShow) {
      date = b.dataset.calShow;
      calendarSelected = date;
      view = 'calendar';
      render();
      return;
    }
    if (b.dataset.calDate) {
      calendarSelected = b.dataset.calDate;
      date = calendarSelected;
      render();
      return;
    }
    if (b.dataset.calMode) {
      calendarMode = b.dataset.calMode;
      render();
      return;
    }
    if (b.dataset.google) {
      b.disabled = true;
      const action = b.dataset.google;
      if (action === 'connect') {
        const x = await googleCall('connect');
        window.open(x.url, '_blank', 'noopener');
      } else if (action === 'list') {
        const x = await googleCall('calendars');
        $('#google-calendars').innerHTML = x.items
          .map(c => `<button data-google-select="${esc(c.id)}">${esc(c.summary)}</button>`)
          .join('');
        return;
      } else {
        await googleCall(action);
        await refreshBook();
      }
      await refreshGoogle();
    }
    if (b.dataset.googleSelect) {
      await googleCall('select', { id: b.dataset.googleSelect });
      await refreshGoogle();
    }
    if (b.dataset.conflict) {
      await googleCall('resolve', { id: b.dataset.conflict, choice: b.dataset.choice });
      await refreshBook();
      await refreshGoogle();
    }
  } catch (e) {
    error(e.message);
  } finally {
    b.disabled = false;
  }
});
document.addEventListener('change', async ev => {
  if (ev.target.id !== 'google-config') return;
  try {
    const file = ev.target.files[0];
    if (file) {
      await googleCall('configure', { credentials: JSON.parse(await file.text()) });
      await refreshGoogle();
    }
  } catch (e) {
    error(e.message);
  }
});
setInterval(() => {
  if (book) {
    refreshBook().catch(() => {});
    if (view === 'calendar') refreshGoogle().catch(() => {});
  }
}, 5000);
