'use strict';
let undoStack = [],
  lastEdit = '',
  lastEditAt = 0;
function updateUndo() {
  const b = document.querySelector('#undo');
  if (b) b.disabled = !undoStack.length;
}
function rememberEdit() {
  const now = Date.now();
  if (lastEdit && (now - lastEditAt > 1000 || !undoStack.length)) {
    undoStack.push(lastEdit);
    if (undoStack.length > 30) undoStack.shift();
  }
  lastEdit = JSON.stringify(book);
  lastEditAt = now;
  updateUndo();
}
const $ = s => document.querySelector(s);
// Keep notes readable while typing, reopening a page, or changing width.
function fitTextarea(el) {
  if (!el.getClientRects().length || !el.clientWidth) return;
  const style = getComputedStyle(el);
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  el.style.height = 'auto';
  el.style.height = Math.ceil(el.scrollHeight + border) + 'px';
}
let textareaFrame;
const textareaWidths = new WeakMap();
const textareaResize = new ResizeObserver(entries => {
  for (const { target, contentRect } of entries) {
    if (textareaWidths.get(target) !== contentRect.width) {
      textareaWidths.set(target, contentRect.width);
      fitTextarea(target);
    }
  }
});
function refreshTextareas() {
  cancelAnimationFrame(textareaFrame);
  textareaFrame = requestAnimationFrame(() =>
    document.querySelectorAll('textarea').forEach(el => {
      if (!textareaWidths.has(el)) {
        textareaWidths.set(el, -1);
        textareaResize.observe(el);
      }
      fitTextarea(el);
    })
  );
}
document.addEventListener('input', e => {
  if (e.target.matches('textarea')) fitTextarea(e.target);
});
new MutationObserver(records => {
  for (const record of records)
    for (const node of record.removedNodes) {
      if (node.nodeType === 1) {
        if (node.matches('textarea')) textareaResize.unobserve(node);
        node.querySelectorAll('textarea').forEach(el => textareaResize.unobserve(el));
      }
    }
  refreshTextareas();
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
document.addEventListener('toggle', refreshTextareas, true);
window.addEventListener('beforeprint', () => document.querySelectorAll('textarea').forEach(fitTextarea));
document.fonts.ready.then(refreshTextareas);
refreshTextareas();
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
// Compare daily-page dates with the current calendar day in Thailand.
const bangkokToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDate = s => new Date(s + 'T12:00:00');
const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
};
const fmt = (s, opts = { weekday: 'long', month: 'long', day: 'numeric' }) =>
  parseDate(s).toLocaleDateString('en-US', opts);
// Default Compass; the book's own `identity` replaces it once the user edits it.
const COMPASS = 'I am healthy, focused, kind, disciplined and at peace.';
const compassText = () => (book.identity || '').trim() || COMPASS;
const COMPASS_ACTION_PARTS = ['Healthy', 'Focused', 'Kind', 'Disciplined', 'Peaceful'];
const uid = () => crypto.randomUUID();
function candleMarkup(key) {
  return `<span class="enlightenment-candle" data-candle="${key}" aria-hidden="true"><svg viewBox="0 0 40 64" focusable="false"><defs><linearGradient id="wax-${key}" x1="0" x2="1"><stop stop-color="#DCC598"/><stop offset=".4" stop-color="#FFFBEA"/><stop offset=".7" stop-color="#F6E8C7"/><stop offset="1" stop-color="#CDB17D"/></linearGradient><linearGradient id="gold-${key}" x1="0" x2="1"><stop stop-color="#89602E"/><stop offset=".45" stop-color="#E5C681"/><stop offset=".7" stop-color="#C69B50"/><stop offset="1" stop-color="#89602E"/></linearGradient><linearGradient id="flame-${key}" x1="0" y1="1" x2=".2" y2="0"><stop stop-color="#C7791F"/><stop offset=".55" stop-color="#F4B735"/><stop offset="1" stop-color="#FFE7A0"/></linearGradient></defs><ellipse class="candle-halo" cx="20" cy="17" rx="17" ry="20"/><g class="candle-flame"><path fill="url(#flame-${key})" d="M21 3C23 11 28 15 26 21C25 26 16 27 14 22C11 16 18 12 21 3Z"/><path class="flame-inner" d="M20 14C21 18 24 20 22 23C21 25 17 24 17 22C17 19 19 17 20 14Z"/></g><path class="candle-wick" d="M20 30V25"/><path class="candle-wax" fill="url(#wax-${key})" d="M15 30Q20 28 25 30L24 49H16Z"/><ellipse class="candle-top" cx="20" cy="30" rx="5" ry="1.5"/><path class="candle-drip" d="M17 31V36Q17 38 19 37V33"/><g fill="url(#gold-${key})" class="candle-holder"><path d="M13 48H27L25 51H15Z"/><path d="M18 51H22V56Q22 58 26 59H14Q18 58 18 56Z"/><path d="M12 59H28L30 62H10Z"/></g><path class="candle-engraving" d="M14 49H26M13 60H27"/></svg></span>`;
}
const newDay = () => ({
  schedule: [],
  priority: '',
  priorityDone: false,
  tasks: [],
  reflections: { compass: '', fix: '', discipline: '', tomorrow: '', worry: '' },
  closed: false,
  proud: false
});
// Quarter containing a date: [first day, last day] and a label such as "Q4 2026".
const quarterOf = s => {
  const y = +s.slice(0, 4),
    m = Math.floor((+s.slice(5, 7) - 1) / 3) * 3;
  return [localDate(new Date(y, m, 1)), localDate(new Date(y, m + 3, 0))];
};
const quarterName = s => `Q${Math.floor((+s.slice(5, 7) - 1) / 3) + 1} ${s.slice(0, 4)}`;
const behaviorRange = {};
let book,
  token,
  date = bangkokToday(),
  view = 'day',
  editCount = 0,
  savedCount = 0,
  saving = false,
  timer,
  blocked = false;
$('#date').value = date;
function day() {
  return book.days[date] || (book.days[date] = newDay());
}
function bounds(type = view) {
  const d = parseDate(date);
  if (type === 'month') {
    return [
      localDate(new Date(d.getFullYear(), d.getMonth(), 1)),
      localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    ];
  }
  const start = addDays(date, -d.getDay());
  return [start, addDays(start, 6)];
}
function relevantGoals() {
  return book.goals.filter(g => !g.done && g.start <= date && g.end >= date);
}
function error(message) {
  $('#error').textContent = message;
  $('#error').hidden = !message;
}
function dirty(calendarChange = false) {
  if (!calendarChange) BookCalendar.reconcile(book, lastEdit ? JSON.parse(lastEdit) : null);
  rememberEdit();
  editCount++;
  $('#save-status').textContent = 'Saving…';
  clearTimeout(timer);
  timer = setTimeout(save, 450);
}
async function save() {
  if (saving || blocked || editCount === savedCount) return;
  saving = true;
  const count = editCount;
  try {
    const res = await fetch('/api/book', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Book-Token': token },
      body: JSON.stringify(book)
    });
    const result = await res.json();
    if (!res.ok) {
      if (res.status === 409) blocked = true;
      throw new Error(result.error || 'Save failed');
    }
    if (editCount === count && result.book) {
      book = result.book;
      lastEdit = JSON.stringify(book);
    }
    book.revision = result.revision;
    savedCount = count;
    $('#save-status').textContent = '✓ Saved on this computer';
    error('');
  } catch (e) {
    $('#save-status').textContent = 'Not saved — download backup';
    error(e.message);
  } finally {
    saving = false;
    if (editCount > savedCount && !blocked && savedCount === count) setTimeout(save, 0);
  }
}
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function summary() {
  const d = day();
  const out = [
    `# Daily Book — ${fmt(date)} ${parseDate(date).getFullYear()}`,
    `\nIdentity: ${compassText()}`,
    `\nDay status: ${d.closed ? 'Reviewed at bedtime' : 'Still in progress'}`,
    `\nAm I proud of myself today? ${d.proud ? 'Yes ✓' : 'Not checked'}`,
    `\nWhy I am proud: ${d.proudNote || ''}`,
    '\n## Schedule'
  ];
  BookCalendar.between(book, date, date)
    .filter(e => e.allDay)
    .forEach(e => out.push(`- All day | Activity: ${e.title} | ${e.done ? 'Completed' : 'Not marked complete'}`));
  d.schedule
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach(s => {
      out.push(
        `- ${s.time}${s.end ? '–' + s.end : ''} | Activity: ${s.plan} | ${s.done ? 'Completed' : 'Not marked complete'}`
      );
    });
  const miss = !d.priorityDone && d.priorityMiss,
    missReason = miss && DailyBookInsights.MISS_REASONS.find(r => r.key === miss.reason);
  out.push(
    `\n## Most important task\n[${d.priorityDone ? 'x' : ' '}] ${d.priority}` +
      (miss ? `\nWhat got in the way: ${[missReason?.label, miss.note?.trim()].filter(Boolean).join(' — ')}` : ''),
    '\n## Other tasks'
  );
  d.tasks.forEach(t => {
    const g = book.goals.find(g => g.id === t.goalId);
    out.push(`- [${t.done ? 'x' : ' '}] ${t.text}${g ? ' → ' + g.title : ''}`);
  });
  for (const [key, title] of [
    ['compass', 'Do → Compass (completed actions)'],
    ['fix', 'Below Your Standard & Fix'],
    ['discipline', 'Discipline or Emotion'],
    ['tomorrow', 'Purpose to Wake Up For']
  ])
    out.push(
      `\n## ${title}\n${key === 'discipline' ? disciplineSummary(d) : d.reflections[key]}` +
        (key === 'compass'
          ? '\n' + COMPASS_ACTION_PARTS.map(part => `- ${part}: ${compassValue(d, part)}`).join('\n')
          : '')
    );
  out.push(`\n## What’s worrying you & how will you address it?\n${d.reflections.worry || ''}`);
  out.push(checkinSummary(d));
  return out.join('\n');
}
function activityFireMarkup() {
  return `<span class="activity-fire" aria-hidden="true">${Array.from({ length: 7 }, () => `<svg class="fire-tongue" viewBox="0 0 100 150" preserveAspectRatio="none" focusable="false"><path class="fire-outer" d="M22 150C6 120 29 99 41 77C55 51 57 24 54 3C78 40 65 68 76 94C88 123 85 139 77 150Z"/><path class="fire-inner" d="M34 150C23 126 44 104 49 87C54 72 55 60 54 48C70 78 59 95 66 111C74 130 69 143 66 150Z"/><path class="fire-core" d="M44 150C37 135 48 124 53 108C61 125 63 138 57 150Z"/></svg>`).join('')}<i class="fire-ember"></i><i class="fire-ember"></i><i class="fire-ember"></i></span>`;
}
function scheduleEntry(s) {
  return `<div class="entry" data-id="${esc(s.id)}"><div class="entry-head"><input type="checkbox" data-action="schedule-done" ${s.done ? 'checked' : ''} aria-label="Mark ${esc(s.plan || s.time + ' activity')} complete"><input type="text" data-action="plan" ${s.calendarManaged ? 'readonly' : ''} aria-label="Activity at ${s.time}" placeholder="Write your activity…" value="${esc(s.plan)}" class="${s.done ? 'done-text' : ''}"><button data-action="shift-activity" ${s.calendarManaged ? 'disabled' : ''} aria-label="Move ${esc(s.plan || 'activity')} in time" title="Drag to move · ↑/↓ 1 minute · Shift+↑/↓ 15 minutes">↕</button><button data-action="activity-menu" aria-label="Actions for ${esc(s.plan || 'activity')}" aria-haspopup="menu" aria-expanded="false">⋯</button></div><div class="activity-gold-frame" aria-hidden="true"><span class="gold-spark"></span><span class="gold-spark"></span><span class="gold-spark"></span><span class="gold-spark"></span></div>${activityFireMarkup()}<small class="block-range">${s.time}${s.end ? '–' + s.end : ''}</small></div>`;
}
function renderSchedule() {
  const model = DailyBookSchedule.layout(day().schedule),
    labels = [],
    rows = [];
  for (let n = Math.floor(model.start / 30) * 30; n < model.end; n += 30) {
    const t = DailyBookSchedule.time(n),
      top = (n - model.start) * 2;
    labels.push(`<div class="hour" data-layout-top="${top}">${t}</div>`);
    const covered = model.events.some(e => e.start <= n && n < e.end);
    rows.push(
      `<div class="timeline-row" data-layout-top="${top}">${!covered && n >= 0 && n <= 1410 ? `<input type="text" data-action="new-plan" data-time="${t}" aria-label="Plan at ${t}" placeholder="—">` : ''}</div>`
    );
  }
  return `<div class="schedule-timeline"><div class="timeline-now" hidden aria-hidden="true"><span class="timeline-now-time"></span><i class="timeline-now-dot"></i></div><div class="timeline-hours" data-layout-height="${model.height}">${labels.join('')}</div><div class="timeline-scroll" tabindex="0" aria-label="Activity timeline"><div class="timeline-canvas" data-timeline-start="${model.start}" data-timeline-end="${model.end}" data-layout-height="${model.height}" data-layout-width="${model.minWidth}">${rows.join('')}${model.events.map(e => `<article class="timeline-event ${e.columns > 1 ? 'parallel-event ' : ''}${e.height < 60 ? 'compact-event' : ''}" data-event-id="${esc(e.s.id)}" tabindex="0" aria-label="${esc(e.s.plan)} · ${e.s.time}${e.s.end ? '–' + e.s.end : ''}" data-layout-top="${e.top}" data-layout-height="${e.height}" data-layout-left="${e.depth * 32}" data-layout-layer="${e.layer}" data-layout-column="${e.column}" data-layout-columns="${e.columns}">${scheduleEntry(e.s)}</article>`).join('')}</div></div></div><div class="schedule-print">${day()
    .schedule.slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(s => `<div><strong>${s.time}${s.end ? '–' + s.end : ''}</strong> · ${s.done ? '✓ ' : ''}${esc(s.plan)}</div>`)
    .join('')}</div>`;
}
function renderTasks() {
  return day()
    .tasks.map(t => {
      const g = book.goals.find(g => g.id === t.goalId);
      return `<div class="task" data-id="${esc(t.id)}"><input type="checkbox" data-action="task-done" ${t.done ? 'checked' : ''} aria-label="Complete ${esc(t.text)}"><div class="task-body"><span class="${t.done ? 'done-text' : ''}">${esc(t.text)}</span>${t.carriedTo ? `<small>Carried to ${esc(t.carriedTo)}</small>` : ''}${t.carriedFrom ? `<small>From ${esc(t.carriedFrom)}</small>` : ''}${g ? `<small>↗ ${esc(g.title)}</small>` : ''}</div>${!t.done ? `<button data-action="carry-task" ${t.carriedTo ? 'disabled' : ''}>Tomorrow →</button>` : ''}<button data-action="edit-task" aria-label="Edit ${esc(t.text)}">Edit</button><button data-action="delete-task" aria-label="Remove ${esc(t.text)}">×</button></div>`;
    })
    .join('');
}
// Shown while the most important task is unticked (CSS hides it otherwise), so an unfinished day can say why.
function priorityMissMarkup(d) {
  const m = d.priorityMiss || {};
  return `<details class="priority-miss"${m.reason || m.note || date < bangkokToday() ? ' open' : ''}><summary>Didn’t finish it? Note what got in the way</summary><div class="miss-reasons" role="group" aria-label="What got in the way">${DailyBookInsights.MISS_REASONS.map(r => `<button type="button" class="miss-reason" data-miss-reason="${r.key}" aria-pressed="${m.reason === r.key}">${r.icon} ${esc(r.label)}</button>`).join('')}</div><input id="priority-miss-note" type="text" maxlength="200" value="${esc(m.note || '')}" placeholder="One line: what happened? (optional)" aria-label="What got in the way, in one line"></details>`;
}
function setPriorityMiss(d, change) {
  const m = { reason: '', note: '', ...d.priorityMiss, ...change };
  if (m.reason || m.note.trim()) d.priorityMiss = m;
  else delete d.priorityMiss;
}
function renderDay() {
  const d = day();
  BookCalendar.project(book, date);
  $('#page-title').textContent = 'Your daily pages';
  $('#eyebrow').textContent = 'A LITTLE INTENTION, EVERY DAY';
  return `<div class="day-heading"><div><h2>${fmt(date)}</h2></div></div><section class="identity"><span class="compass-sheen" aria-hidden="true"></span><p id="identity" class="compass-text">${esc(compassText())}</p><button id="edit-compass" class="compass-edit" title="Edit your Compass" aria-label="Edit your Compass">✎</button></section><label class="proud-check">${activityFireMarkup()}<span class="proud-light" aria-hidden="true"><i></i><i></i><i></i><i></i></span><input id="proud-today" type="checkbox" ${d.proud ? 'checked' : ''}><span class="proud-check-copy"><span class="proud-check-question">Am I proud of myself today?</span></span></label><div class="pages"><section class="page"><div class="schedule">${dailyAllDay()}${renderSchedule()}</div></section><section class="page reflection-page"><section class="section priority-card">${activityFireMarkup()}<div class="section-title">${candleMarkup('priority', 'Most important task')}<h3>Most important task</h3></div><p>Give the thing that matters a place in your day.</p><div class="priority-row"><input id="priority-done" type="checkbox" ${d.priorityDone ? 'checked' : ''} aria-label="Most important task complete"><input id="priority" type="text" value="${esc(d.priority)}" placeholder="What matters most today?" aria-label="Most important task"></div>${!d.priorityDone ? `<button class="carry-priority" data-action="carry-priority" ${d.priorityCarriedTo ? 'disabled' : ''}>${d.priorityCarriedTo ? 'Carried to ' + esc(d.priorityCarriedTo) : 'Carry to tomorrow →'}</button>` : ''}${priorityMissMarkup(d)}</section><section class="section"><div class="section-title">${candleMarkup('tasks', 'Other tasks')}<h3>Other tasks</h3></div><div id="tasks">${renderTasks()}</div><form id="add-task" class="task-add"><input name="text" required placeholder="One concrete action…" aria-label="New task"><select name="goalId" aria-label="Link task to a goal"><option value="">Link to a goal (optional)</option>${relevantGoals()
    .map(g => `<option value="${esc(g.id)}">${g.type === 'week' ? 'Week' : 'Month'} · ${esc(g.title)}</option>`)
    .join('')}</select><button>Add task</button></form></section>${[
    [
      'compass',
      'Do → Compass',
      'Completed actions that moved you toward your compass.',
      'What did you do today that reflects who you want to become?',
      'compass-title'
    ],
    [
      'fix',
      'Below Your Standard & Fix',
      'Notice the pattern. Write a practical adjustment.',
      'What happened → What I can do differently',
      'red-title'
    ],
    [
      'discipline',
      'Discipline or Emotion',
      'Choose what influenced your choices today. You can select both.',
      'Where did I follow through? Where did my mood steer me?',
      ''
    ],
    [
      'tomorrow',
      'Purpose to Wake Up For',
      'Leave tomorrow something meaningful to begin with.',
      'What am I looking forward to or choosing to work toward?',
      ''
    ]
  ]
    .map(
      ([key, title, desc, placeholder, color], i) =>
        `<section class="section reflection-card ${key}-card"><div class="section-title">${candleMarkup(key, title)}<h3 class="${color}">${title}</h3></div><p>${desc}</p>${key === 'compass' ? renderCompassActions(d) : key === 'discipline' ? renderDisciplineChoices(d) : `<textarea class="reflection" data-reflection="${key}" aria-label="${title}" placeholder="${placeholder}">${esc(d.reflections[key])}</textarea>`}</section>`
    )
    .join(
      ''
    )}</section></div>${worryPanel(d)}${checkinPanel()}${routinePanel()}<section class="bedtime-footer" aria-label="Bedtime review"><p class="subtle">${d.closed ? '<span class="badge">✓ Bedtime review complete</span>' : 'A fresh page. A little progress. Your own pace.'}</p><div class="actions"><button id="summary">↓ Bedtime summary</button><button id="close-day" class="${d.closed ? '' : 'primary'}">${d.closed ? 'Reopen day' : 'Finish bedtime review'}</button></div><label class="reminder-setting">Bedtime reminder <input id="bedtime-reminder" type="time" value="${esc(book.settings?.bedtimeReminder ?? '22:30')}" aria-describedby="reminder-hint"></label><small id="reminder-hint">A Windows notification if today isn’t reviewed by then. Clear the time to turn it off.</small></section><div class="date-nav day-nav-bottom" role="group" aria-label="Change day"><button data-day-nav="-1" aria-label="Previous day">←</button><input id="date-bottom" type="date" value="${date}" aria-label="Go to date"><button data-day-nav="1" aria-label="Next day">→</button><button data-day-nav="today">Today</button></div>`;
}
function stats(start, end) {
  const days = Object.entries(book.days).filter(([k]) => k >= start && k <= end);
  const tasks = days.reduce((total, [, d]) => total + d.tasks.filter(t => t.done).length + (d.priorityDone ? 1 : 0), 0);
  return { tasks, reviewed: days.filter(([, d]) => d.closed).length };
}
function goalMarkup(g) {
  const linked = Object.values(book.days)
    .flatMap(d => d.tasks)
    .filter(t => t.goalId === g.id);
  const children = book.goals.filter(c => c.parentId === g.id);
  const parent = book.goals.find(p => p.id === g.parentId);
  return `<div class="goal" data-id="${esc(g.id)}"><label class="goal-line"><input type="checkbox" data-action="goal-done" ${g.done ? 'checked' : ''}><span class="${g.done ? 'done-text' : ''}">${esc(g.title)}</span></label><div class="goal-meta">${linked.filter(t => t.done).length}/${linked.length} linked daily tasks complete${children.length ? ` · ${children.filter(c => c.done).length}/${children.length} weekly goals complete` : ''}${parent ? `<br>↗ ${esc(parent.title)}` : ''}</div><div class="goal-actions"><button data-action="edit-goal">Edit</button><button data-action="delete-goal">Remove</button></div></div>`;
}
function calendar() {
  const [start, end] = bounds('month');
  const cells = Array(parseDate(start).getDay()).fill('<span></span>');
  for (let n = 1; n <= parseDate(end).getDate(); n++) {
    const key = start.slice(0, 8) + String(n).padStart(2, '0');
    const d = book.days[key];
    const hasData =
      d && (d.schedule.length || d.tasks.length || d.priority || Object.values(d.reflections).some(Boolean));
    cells.push(
      `<button data-open-date="${key}" class="${key === date ? 'selected ' : ''}${key === localDate() ? 'is-today' : ''}" aria-label="Open ${fmt(key)}"><span>${n}</span>${d?.closed ? '<small class="cal-dots">✓ Reviewed</small>' : hasData ? '<small>• In progress</small>' : ''}</button>`
    );
  }
  return `<div class="calendar">${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(s => `<span class="weekday">${s}</span>`).join('')}${cells.join('')}</div>`;
}
function periodTitle(start, end) {
  return view === 'week'
    ? `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : fmt(start, { month: 'long', year: 'numeric' });
}
function periodSummary() {
  const [start, end] = bounds();
  return DailyBookPeriodReview.markdown(DailyBookPeriodReview.compute(book, start, end, bangkokToday()), view, {
    title: periodTitle(start, end),
    goals: book.goals.filter(g => g.type === view && g.start === start),
    reflection: book.reviews[view + ':' + start]
  });
}
function renderPeriod() {
  const [start, end] = bounds();
  const s = stats(start, end);
  const goals = book.goals.filter(g => g.type === view && g.start === start);
  const completed = goals.filter(g => g.done).length;
  const title = periodTitle(start, end);
  $('#page-title').textContent = view === 'week' ? 'Your weekly goals' : 'Your monthly view';
  $('#eyebrow').textContent = view === 'week' ? 'SMALL STEPS, A SHARED DIRECTION' : 'KEEP THE BIGGER PICTURE IN SIGHT';
  const key = view + ':' + start;
  return `<div class="day-heading"><div><h2>${title}</h2><p class="subtle">${view === 'week' ? 'Weeks run Sunday to Saturday, like your notebook.' : 'Your milestones and daily pages, together.'}</p></div></div><div class="overview"><div class="stat"><strong>${completed} / ${goals.length}</strong><small>Goals complete</small></div><div class="stat"><strong>${s.tasks}</strong><small>Daily tasks complete</small></div><div class="stat"><strong>${s.reviewed}</strong><small>Days reviewed</small></div></div><div class="period-grid"><section class="page"><div class="page-top"><div><h2>${view === 'week' ? 'This week’s intentions' : 'This month’s goals'}</h2><small>Choose outcomes you can recognize when they happen.</small></div></div><div class="section">${goals.length ? goals.map(goalMarkup).join('') : '<p class="empty">No goals yet. Start with one meaningful outcome.</p>'}<form id="add-goal" class="goal-form"><input name="title" required placeholder="${view === 'week' ? 'What will you move forward this week?' : 'What would make this month meaningful?'}" aria-label="New goal">${
    view === 'week'
      ? `<select name="parentId" aria-label="Related monthly goal"><option value="">Connect to a monthly goal (optional)</option>${book.goals
          .filter(g => g.type === 'month' && g.start <= end && g.end >= start)
          .map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`)
          .join('')}</select>`
      : ''
  }<button class="primary">Add ${view === 'week' ? 'weekly' : 'monthly'} goal</button></form><p class="summary-line">Mark a goal complete when its outcome is achieved. Linked tasks show progress; they don’t complete the goal automatically.</p></div></section><section class="page"><div class="page-top"><h2>${view === 'week' ? 'Your seven daily pages' : 'Your month at a glance'}</h2></div><div class="section">${
    view === 'month'
      ? calendar()
      : `<div class="week-days">${Array.from({ length: 7 }, (_, i) => {
          const key = addDays(start, i),
            d = book.days[key];
          return `<button class="day-link${key < bangkokToday() ? ' past-day' : ''}" data-open-date="${key}"><span>${fmt(key, { weekday: 'short', month: 'short', day: 'numeric' })}</span><small>${d?.closed ? '✓ Reviewed' : d && (d.schedule.length || d.tasks.length || d.priority || Object.values(d.reflections).some(Boolean)) ? 'In progress' : 'Open page'} →</small></button>`;
        }).join('')}</div>`
  }</div></section></div>${
    // Missing only when an older server is still running; the rest of the page still works.
    window.DailyBookPeriodReview
      ? DailyBookPeriodReview.markup(DailyBookPeriodReview.compute(book, start, end, bangkokToday()), view)
      : ''
  }<section class="page period-review"><div class="section"><h3>${view === 'week' ? 'Weekly' : 'Monthly'} reflection</h3><p>What moved forward? What needs adjusting? What will you carry into the next ${view}?</p><textarea data-review="${key}" rows="4" placeholder="Pause, notice, and choose your next step…" aria-label="${view} reflection">${esc(book.reviews[key] || '')}</textarea></div></section>`;
}
let moodCleanup = null;
const [initialQStart, initialQEnd] = quarterOf(bangkokToday());
const moodRange = { start: initialQStart, end: initialQEnd, preset: 'all', selected: null };
const bodyRange = { start: initialQStart, end: initialQEnd, preset: 'all', selected: null };
const searchState = { query: '', group: 'all' };
const insightsState = { period: 'all' };
const boardState = { x: 40, y: 40, zoom: 1 };
function render() {
  finishActivityDrag();
  closeActivityMenu();
  if (!book) return;
  if (moodCleanup) {
    moodCleanup();
    moodCleanup = null;
  }
  $('#date').value = date;
  document.querySelectorAll('[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
    b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
  });
  $('#date').value = date;
  $('.date-nav').hidden = ['mood', 'body', 'behavior', 'search', 'insights', 'board'].includes(view);
  $('#prev').disabled = false;
  $('#next').disabled = false;
  $('#today').disabled = false;
  const [qStart, qEnd] = quarterOf(bangkokToday());
  $('#content').innerHTML =
    view === 'calendar'
      ? renderCalendar()
      : view === 'board'
        ? DailyBookIdeaBoard.markup()
        : view === 'search'
          ? DailyBookSearch.markup(searchState)
          : view === 'insights'
            ? DailyBookInsights.markup()
            : view === 'behavior'
              ? DailyBookBehavior.markup(bangkokToday())
              : view === 'mood'
                ? renderMoodSleep()
                : view === 'body'
                  ? renderBodyMetrics()
                  : view === 'proud'
                    ? renderProud()
                    : view === 'day'
                      ? renderDay()
                      : renderPeriod();
  mountTimeline();
  if (view === 'calendar') mountCalendar();
  if (view === 'search') {
    $('#page-title').textContent = 'Search your book';
    $('#eyebrow').textContent = 'NOTICE WHAT KEEPS COMING BACK';
    moodCleanup = DailyBookSearch.mount($('#book-search'), book, {
      state: searchState,
      fmt: d => fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    });
  }
  if (view === 'board') {
    $('#page-title').textContent = 'Idea Board';
    $('#eyebrow').textContent = 'CATCH IT BEFORE IT FLIES AWAY';
    moodCleanup = DailyBookIdeaBoard.mount($('#idea-board'), {
      getBook: () => book,
      getToken: () => token,
      // Every board change is a whole action (a move, a finished note), so each gets its own Undo step.
      changed: () => {
        lastEditAt = 0;
        dirty();
      },
      state: boardState
    });
  }
  if (view === 'insights') {
    $('#page-title').textContent = 'Insights';
    $('#eyebrow').textContent = 'WHAT GOES TOGETHER WITH YOUR GOOD DAYS';
    DailyBookInsights.mount($('#insights'), book.days, {
      today: bangkokToday(),
      state: insightsState,
      quarter: [qStart, qEnd]
    });
  }
  if (view === 'behavior') {
    $('#page-title').textContent = 'Behavior Dashboard';
    $('#eyebrow').textContent = 'CONSISTENCY, WITH CONTEXT';
    DailyBookBehavior.mount($('#behavior-dashboard'), book.days, { today: bangkokToday(), state: behaviorRange });
  }
  if (view === 'mood')
    moodCleanup = DailyBookMoodSleep.mount(document.querySelector('#mood-sleep'), book.days, {
      state: moodRange,
      min: qStart,
      max: qEnd,
      onOpenDate: d => {
        date = d;
        view = 'day';
        render();
        showCheckinField('wakeTime');
      }
    });
  if (view === 'body') {
    document.querySelector('#cycle-overview').addEventListener('click', e => {
      const hit = e.target.closest('[data-cycle-date]');
      if (!hit) return;
      date = hit.dataset.cycleDate;
      view = 'day';
      render();
    });
    moodCleanup = DailyBookBodyMetrics.mount(document.querySelector('#body-metrics'), book.days, {
      state: bodyRange,
      min: qStart,
      max: qEnd,
      onOpenDate: d => {
        date = d;
        view = 'day';
        render();
        showCheckinField('weight');
      }
    });
  }
}
function updateTaskList() {
  $('#tasks').innerHTML = renderTasks();
}
function renderProud() {
  $('#page-title').textContent = 'Your proud days';
  const [qStart, qEnd] = quarterOf(date),
    qName = quarterName(qStart);
  const clampQ = s => (s < qStart ? qStart : s > qEnd ? qEnd : s);
  $('#eyebrow').textContent = `NOTEBOOK 00 · ${qName}`;
  const total = Object.entries(book.days).filter(([key, d]) => key >= qStart && key <= qEnd && d.proud === true).length;
  const first = addDays(qStart, -parseDate(qStart).getDay());
  let dayCount = 0;
  for (let k = qStart; k <= qEnd; k = addDays(k, 1)) dayCount++;
  const weekCount = Math.ceil((dayCount + parseDate(qStart).getDay()) / 7);
  const rows = Array.from({ length: weekCount }, (_, i) => {
    const start = addDays(first, i * 7),
      end = addDays(start, 6);
    const label = `${fmt(clampQ(start), { month: 'short', day: 'numeric' })} – ${fmt(clampQ(end), { month: 'short', day: 'numeric' })}`;
    return `<tr><th scope="row">Week ${i + 1}<small>${label}</small></th>${Array.from({ length: 7 }, (_, j) => {
      const key = addDays(start, j);
      if (key < qStart || key > qEnd)
        return `<td class="outside-quarter"><span aria-label="Outside ${qName}">—</span></td>`;
      const proud = book.days[key]?.proud === true;
      const status = proud ? 'Proud day' : 'Not checked';
      return `<td><button class="heat-day ${proud ? 'is-proud' : ''}" data-open-date="${key}" aria-label="${fmt(key)} ${key.slice(0, 4)} · ${status}" title="${fmt(key)} · ${status}${book.days[key]?.proudNote ? ' · ' + esc(book.days[key].proudNote) : ''}">${proud ? activityFireMarkup() : ''}<span class="proud-date-label">${fmt(key, { month: 'short', day: 'numeric' })}</span><strong aria-hidden="true">${proud ? '✓' : '·'}</strong></button></td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<div class="day-heading"><div><h2>${fmt(qStart, { month: 'long', day: 'numeric' })} – ${fmt(qEnd, { month: 'long', day: 'numeric', year: 'numeric' })}</h2><p class="subtle">${total} proud ${total === 1 ? 'day' : 'days'} marked · ${dayCount} days in your quarter</p></div></div><section class="page"><div class="page-top"><div><h2>A quarter of moments to be proud of</h2><small>Each marked square comes from your daily “Am I proud of myself today?” checkbox.</small></div></div><div class="section"><div class="heat-legend"><span><i class="heat-key proud-key"></i>Proud day</span><span><i class="heat-key"></i>Not checked</span><span>Click a date to open its daily page.</span></div><div class="heat-scroll"><table class="heat-map"><thead><tr><th scope="col">${qName.slice(0, 2)} week</th>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="summary-line">The first and last weeks contain only the days inside ${qName}. Use ← → to move between quarters. An unchecked day simply means the checkbox is not marked.</p></div></section>`;
}
$('#content').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.compassPart) {
    day().compassActions ||= {};
    day().compassActions[el.dataset.compassPart] = el.value;
    dirty();
  } else if (el.id === 'priority') {
    day().priority = el.value;
    dirty();
  } else if (el.id === 'priority-miss-note') {
    setPriorityMiss(day(), { note: el.value });
    dirty();
  } else if (el.dataset.reflection) {
    day().reflections[el.dataset.reflection] = el.value;
    dirty();
  } else if (el.dataset.review) {
    book.reviews[el.dataset.review] = el.value;
    dirty();
  } else if (el.dataset.action === 'plan') {
    const s = day().schedule.find(s => s.id === el.closest('[data-id]').dataset.id);
    s.plan = el.value;
    const check = el.closest('.entry')?.querySelector('[data-action=schedule-done]');
    if (check) check.setAttribute('aria-label', 'Mark ' + (s.plan || s.time + ' activity') + ' complete');
    dirty();
    updateSchedulePrint();
  } else if (el.dataset.action === 'new-plan' && el.value.trim()) {
    const s = { id: uid(), time: el.dataset.time, plan: el.value, done: false, changes: [] };
    day().schedule.push(s);
    el.dataset.action = 'plan';
    el.parentElement.dataset.id = s.id;
    el.dataset.pending = 'true';
    dirty();
  }
});
$('#content').addEventListener('focusout', e => {
  if (e.target.dataset.pending) {
    const container = e.target.parentElement;
    const s = day().schedule.find(s => s.id === container.dataset.id);
    $('.schedule').innerHTML = renderSchedule();
    mountTimeline();
  }
});
$('#content').addEventListener('change', e => {
  const el = e.target;
  const id = el.closest('[data-id]')?.dataset.id;
  if (el.dataset.disciplineChoice) {
    day().disciplineChoices ||= {};
    day().disciplineChoices[el.dataset.disciplineChoice] = el.checked;
    dirty();
  } else if (el.id === 'bedtime-reminder') {
    book.settings ||= {};
    book.settings.bedtimeReminder = el.value;
    dirty();
  } else if (el.id === 'proud-today') {
    day().proud = el.checked;
    dirty();
  } else if (el.id === 'priority-done') {
    day().priorityDone = el.checked;
    dirty();
  } else if (el.dataset.action === 'schedule-done') {
    day().schedule.find(s => s.id === id).done = el.checked;
    el.closest('.entry-head').querySelector('[data-action="plan"]').classList.toggle('done-text', el.checked);
    dirty();
    updateSchedulePrint();
  } else if (el.dataset.action === 'task-done') {
    day().tasks.find(t => t.id === id).done = el.checked;
    dirty();
    updateTaskList();
  } else if (el.dataset.action === 'goal-done') {
    book.goals.find(g => g.id === id).done = el.checked;
    dirty();
    render();
  }
});
$('#content').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  if (form.id === 'add-slot') {
    const start = f.get('time'),
      end = f.get('end'),
      plan = f.get('plan').trim();
    if (!plan) return;
    const problem = activityTimeError(start, end);
    if (problem) {
      form.querySelector('.activity-add-error').textContent = problem;
      return;
    }
    day().schedule.push({ id: uid(), time: start, end: end || '', plan, done: false, changes: [] });
    error('');
  } else if (form.id === 'add-task') {
    if (!f.get('text').trim()) return;
    day().tasks.push({ id: uid(), text: f.get('text').trim(), goalId: f.get('goalId'), done: false });
  } else if (form.id === 'add-goal') {
    if (!f.get('title').trim()) return;
    const [start, end] = bounds();
    book.goals.push({
      id: uid(),
      type: view,
      title: f.get('title').trim(),
      start,
      end,
      parentId: f.get('parentId') || '',
      done: false
    });
  } else return;
  dirty();
  render();
});
$('#content').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.openDate) {
    date = b.dataset.openDate;
    view = b.dataset.openView || 'day';
    render();
    return;
  }
  if (b.dataset.missReason) {
    const d = day(),
      key = b.dataset.missReason;
    setPriorityMiss(d, { reason: d.priorityMiss?.reason === key ? '' : key });
    b.parentElement
      .querySelectorAll('[data-miss-reason]')
      .forEach(x => x.setAttribute('aria-pressed', String(x.dataset.missReason === d.priorityMiss?.reason)));
    dirty();
    return;
  }
  if (b.id === 'summary') {
    download(`Daily-Book-${date}.md`, summary(), 'text/markdown;charset=utf-8');
    return;
  }
  if (b.id === 'period-summary') {
    download(`Daily-Book-${view}-${bounds()[0]}.md`, periodSummary(), 'text/markdown;charset=utf-8');
    return;
  }
  if (b.id === 'close-day') {
    day().closed = !day().closed;
    dirty();
    render();
    return;
  }
  if (b.id === 'edit-compass') {
    $('#compass-edit-form').elements.identity.value = compassText();
    $('#compass-editor').showModal();
    $('#compass-edit-form').elements.identity.focus();
    return;
  }
  const action = b.dataset.action;
  if (action) lastEditAt = 0;
  const id = b.closest('[data-id]')?.dataset.id;
  if (action === 'carry-task' || action === 'carry-priority') {
    carryForward(action === 'carry-priority' ? null : id);
    return;
  }
  if (action === 'activity-menu') {
    openActivityMenu(id, b);
    return;
  }
  if (action === 'delete-slot') {
    if (confirm('Delete this scheduled activity?')) {
      day().schedule = day().schedule.filter(s => s.id !== id);
      dirty();
      render();
    }
  } else if (action === 'edit-task') {
    const t = day().tasks.find(t => t.id === id);
    const text = prompt('Update this task:', t.text);
    if (text?.trim()) {
      t.text = text.trim();
      dirty();
      updateTaskList();
    }
  } else if (action === 'delete-task') {
    if (confirm('Remove this task?')) {
      day().tasks = day().tasks.filter(t => t.id !== id);
      dirty();
      updateTaskList();
    }
  } else if (action === 'edit-goal') {
    const g = book.goals.find(g => g.id === id);
    const text = prompt('Update this goal:', g.title);
    if (text?.trim()) {
      g.title = text.trim();
      dirty();
      render();
    }
  } else if (action === 'delete-goal') {
    if (confirm('Remove this goal? Linked daily tasks and weekly goals will remain, with this link removed.')) {
      book.goals = book.goals.filter(g => g.id !== id);
      book.goals.forEach(g => {
        if (g.parentId === id) g.parentId = '';
      });
      Object.values(book.days).forEach(d =>
        d.tasks.forEach(t => {
          if (t.goalId === id) t.goalId = '';
        })
      );
      dirty();
      render();
    }
  }
});
document.querySelectorAll('[data-view]').forEach(
  b =>
    (b.onclick = () => {
      view = b.dataset.view;
      if (view === 'calendar' && !calendarInitialized) {
        date = bangkokToday();
        calendarSelected = date;
        calendarInitialized = true;
      }
      render();
    })
);
$('#date').onchange = e => {
  if (e.target.value) {
    date = e.target.value;
    if (view === 'calendar') calendarSelected = date;
    render();
  }
};
$('#today').onclick = () => {
  date = bangkokToday();
  if (view === 'calendar') calendarSelected = date;
  render();
};
function move(n) {
  if (view === 'proud' || view === 'month' || (view === 'calendar' && calendarMode === 'month')) {
    const d = parseDate(date);
    date = localDate(new Date(d.getFullYear(), d.getMonth() + n * (view === 'proud' ? 3 : 1), 1));
  } else date = addDays(date, n * (view === 'week' || view === 'calendar' ? 7 : 1));
  if (view === 'calendar') calendarSelected = date;
  render();
}
$('#prev').onclick = () => move(-1);
$('#next').onclick = () => move(1);
// Date controls at the foot of a daily page: open the chosen day from its top.
function openDayFromBottom(next) {
  if (!next) return;
  date = next;
  render();
  scrollTo({ top: 0 });
}
$('#content').addEventListener('click', e => {
  const n = e.target.closest('[data-day-nav]')?.dataset.dayNav;
  if (n) openDayFromBottom(n === 'today' ? bangkokToday() : addDays(date, +n));
});
$('#content').addEventListener('change', e => {
  if (e.target.id === 'date-bottom') openDayFromBottom(e.target.value);
});
$('#export').onclick = () => {
  if (book) download(`Daily-Book-backup-${localDate()}.json`, JSON.stringify(book, null, 2), 'application/json');
};
$('#import').onclick = () => {
  if (book) $('#import-file').click();
};
$('#import-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (saving || editCount !== savedCount)
      throw new Error('Wait for your current edits to save before restoring a backup.');
    const candidate = JSON.parse(await file.text());
    if (
      candidate.version !== 1 ||
      !candidate.days ||
      !Array.isArray(candidate.goals) ||
      !candidate.reviews ||
      typeof candidate.identity !== 'string'
    )
      throw new Error('This is not a Daily Book backup.');
    if (
      !confirm(
        'Restore this backup and replace the current book? A copy of your current book will be downloaded first, and a local snapshot will be kept.'
      )
    )
      return;
    download(`Daily-Book-before-restore-${localDate()}.json`, JSON.stringify(book, null, 2), 'application/json');
    candidate.revision = book.revision;
    const res = await fetch('/api/book', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Book-Token': token, 'X-Book-Restore': 'true' },
      body: JSON.stringify(candidate)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    candidate.revision = result.revision;
    book = result.book || candidate;
    undoStack = [];
    lastEdit = JSON.stringify(book);
    updateUndo();
    error('');
    $('#save-status').textContent = '✓ Backup restored';
    render();
  } catch (err) {
    error(err.message);
  } finally {
    e.target.value = '';
  }
};
window.addEventListener('beforeunload', e => {
  if (editCount !== savedCount) {
    e.preventDefault();
    e.returnValue = '';
  }
});
setInterval(() => {
  if (book && !blocked && editCount !== savedCount && !saving) save();
}, 5000);
fetch('/api/book')
  .then(async r => {
    if (!r.ok) throw new Error('Could not open your book.');
    return r.json();
  })
  .then(data => {
    book = data.book;
    BookCalendar.migrate(book);
    lastEdit = JSON.stringify(book);
    token = data.token;
    $('#save-status').textContent = '✓ Saved on this computer';
    render();
    if (data.notice) error(data.notice);
  })
  .catch(e => error(e.message));

function worryPanel(d) {
  return `<section class="page worry-panel" aria-labelledby="worry-heading"><div class="section"><h3 id="worry-heading">What’s worrying you &amp; how will you address it?</h3><p id="worry-hint">What’s worrying me? What can I control? What’s one small step I can take?</p><textarea id="worry-notes" class="reflection" data-reflection="worry" rows="7" aria-labelledby="worry-heading" aria-describedby="worry-hint" placeholder="Write what’s on your mind and one practical next step…">${esc(d.reflections.worry || '')}</textarea></div></section>`;
}
function compassValue(d, part) {
  return d.compassActions?.[part] || '';
}
function renderCompassActions(d) {
  return `<table class="compass-actions"><thead><tr><th scope="col">My identity</th><th scope="col">What I did for this identity</th></tr></thead><tbody>${COMPASS_ACTION_PARTS.map(part => `<tr><th scope="row"><label for="compass-${part.replaceAll(' ', '-')}">${part}</label></th><td><textarea id="compass-${part.replaceAll(' ', '-')}" data-compass-part="${part}" rows="2" aria-label="What I did for ${part}" placeholder="What did I do today?">${esc(compassValue(d, part))}</textarea></td></tr>`).join('')}</tbody></table>${d.reflections.compass ? `<details class="previous-compass"><summary>Previous Compass notes</summary><textarea class="reflection" data-reflection="compass" aria-label="Previous Compass notes">${esc(d.reflections.compass)}</textarea></details>` : ''}`;
}

function carryForward(id) {
  const source = day(),
    t = id ? source.tasks.find(t => t.id === id) : null;
  if (id && (!t || t.done || t.carriedTo)) return;
  if (!id && (!source.priority.trim() || source.priorityDone || source.priorityCarriedTo)) return;
  const tomorrow = addDays(date, 1),
    target = book.days[tomorrow] || (book.days[tomorrow] = newDay());
  target.tasks.push({
    id: uid(),
    text: t ? t.text : source.priority,
    done: false,
    goalId: t ? t.goalId : '',
    carriedFrom: date
  });
  if (t) t.carriedTo = tomorrow;
  else source.priorityCarriedTo = tomorrow;
  lastEditAt = 0;
  dirty();
  render();
}
function routinePanel() {
  const routines = book.routines || [];
  return `<details class="routine-panel"><summary>Daily routines · reuse your usual plan</summary><p>Use a routine when you have a repeated kind of day, such as “Morning routine” or “Work day.”</p><ol class="routine-steps"><li>Plan this day once.</li><li>Click <strong>Save this day as a routine</strong> and give it a name.</li><li>On another day, choose that name below, then click <strong>Apply to this day</strong>.</li></ol><div class="routine-controls"><button data-routine="save">Save this day as a routine</button><select id="routine-select" aria-label="Saved routine"><option value="">${routines.length ? 'Choose a saved routine' : 'No routines saved yet'}</option>${routines.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select><button data-routine="apply" ${routines.length ? '' : 'disabled'}>Apply to this day</button><button data-routine="delete" ${routines.length ? '' : 'disabled'}>Delete routine</button></div></details>`;
}
$('#content').addEventListener('click', e => {
  const action = e.target.closest('[data-routine]')?.dataset.routine;
  if (!action) return;
  if (action === 'save') {
    const d = day();
    if (!d.schedule.some(s => s.plan.trim()) && !d.tasks.length && !d.priority.trim()) {
      error('Add a planned activity or task before saving a routine.');
      return;
    }
    const name = prompt('Name this routine (for example, Work day):');
    if (!name?.trim()) return;
    book.routines ||= [];
    book.routines.push({
      id: uid(),
      name: name.trim(),
      schedule: d.schedule.filter(s => s.plan.trim()).map(s => ({ time: s.time, plan: s.plan })),
      tasks: d.tasks.map(t => ({ text: t.text })),
      priority: d.priority
    });
  } else {
    const id = $('#routine-select').value,
      r = (book.routines || []).find(r => r.id === id);
    if (!r) {
      error('First save a routine, or choose one from the list.');
      return;
    }
    if (action === 'delete') {
      if (!confirm('Delete this reusable routine? Your daily pages will stay unchanged.')) return;
      book.routines = book.routines.filter(r => r.id !== id);
    } else {
      const d = day();
      r.schedule.forEach(s => {
        if (!d.schedule.some(x => x.time === s.time && x.plan === s.plan))
          d.schedule.push({ ...s, id: uid(), done: false, changes: [] });
      });
      r.tasks.forEach(t => {
        if (!d.tasks.some(x => x.text === t.text)) d.tasks.push({ id: uid(), text: t.text, goalId: '', done: false });
      });
      if (!d.priority.trim()) {
        d.priority = r.priority;
        d.priorityDone = false;
        delete d.priorityCarriedTo;
      }
    }
  }
  lastEditAt = 0;
  dirty();
  error('');
  render();
});
$('#undo').onclick = () => {
  if (!undoStack.length || blocked) return;
  const revision = book.revision;
  book = JSON.parse(undoStack.pop());
  book.revision = revision;
  lastEdit = JSON.stringify(book);
  lastEditAt = 0;
  editCount++;
  clearTimeout(timer);
  $('#save-status').textContent = 'Saving undo…';
  timer = setTimeout(save, 100);
  updateUndo();
  render();
};
function checkin(d = day()) {
  return {
    sets: Array(10).fill(false),
    fasting: false,
    sex: false,
    shabu: false,
    period: false,
    periodFlow: '',
    energy: null,
    mood: null,
    moodNote: '',
    bedtime: '',
    wakeTime: '',
    bedDay: 'previous',
    weight: '',
    bodyFat: '',
    ...d.checkin
  };
}
function sleepText(c) {
  if (!c.bedtime || !c.wakeTime) return 'Enter both times';
  const n = DailyBookMoodSleep.sleepMinutes(c);
  return n === null ? 'Check the bedtime date and times' : Math.floor(n / 60) + ' hr ' + (n % 60) + ' min';
}
const FLOWS = [
  ['spotting', 'Spotting'],
  ['light', 'Light'],
  ['medium', 'Medium'],
  ['heavy', 'Heavy']
];
// Opened from a chart: expand Daily check-in and bring one of its fields (e.g. wake-up time, weight) into view.
function showCheckinField(key) {
  const panel = $('.daily-checkin'),
    field = $(`[data-checkin="${key}"]`);
  if (!panel || !field) return;
  panel.open = true;
  field.scrollIntoView({ block: 'center' });
  field.focus({ preventScroll: true });
}
function checkinPanel() {
  const c = checkin();
  const box = (k, l) =>
    '<label class="checkin-box"><input type="checkbox" data-checkin="' +
    k +
    '" ' +
    (c[k] ? 'checked' : '') +
    '>' +
    l +
    '</label>';
  return (
    '<details class="page daily-checkin"><summary>Daily check-in</summary><div class="checkin-grid"><div><h3>Weight training <small id="set-count">' +
    c.sets.filter(Boolean).length +
    '/10 sets</small></h3><div class="set-boxes">' +
    Array.from(
      { length: 10 },
      (_, i) =>
        '<label><input type="checkbox" data-set="' +
        i +
        '" ' +
        (c.sets[i] ? 'checked' : '') +
        ' aria-label="Weight training set ' +
        (i + 1) +
        '"><span>' +
        (i + 1) +
        '</span></label>'
    ).join('') +
    '</div><small>One checkbox = one completed set.</small></div><div><h3>Fasting</h3>' +
    box('fasting', 'Fasting more than 16 hr') +
    '</div><div class="cycle-checkin"><h3>Body &amp; cycle</h3>' +
    box('sex', 'Had sex today') +
    box('shabu', 'Shabu buffet today') +
    box('period', 'Period today') +
    '<div class="flow-choices" id="flow-choices" role="radiogroup" aria-label="Period flow"' +
    (c.period ? '' : ' hidden') +
    '>' +
    FLOWS.map(
      ([v, l]) =>
        '<label><input type="radio" name="period-flow" data-checkin="periodFlow" value="' +
        v +
        '" ' +
        (c.periodFlow === v ? 'checked' : '') +
        '>' +
        l +
        '</label>'
    ).join('') +
    '</div></div><div class="scale-stack">' +
    '<div class="mood-checkin energy-checkin"><h3>Energy</h3><div class="mood-continuous"><input id="energy-slider" class="' +
    (c.energy === null ? 'is-empty' : '') +
    '" type="range" min="-3" max="3" step="any" value="' +
    esc(roundMood(c.energy) ?? 0) +
    '" aria-label="Energy from minus 3 to plus 3" aria-valuetext="' +
    esc(c.energy === null ? 'Not recorded' : moodText(c.energy)) +
    '"><div class="mood-ticks" aria-hidden="true">' +
    Array.from({ length: 7 }, (_, i) => i - 3)
      .map(n => '<span>' + (n > 0 ? '+' : '') + n + '</span>')
      .join('') +
    '</div></div><div class="mood-scale-captions" aria-hidden="true"><span>Very low</span><span>Neutral</span><span>Very high</span></div><div class="mood-exact-row"><label>Exact energy<input id="exact-energy" type="number" min="-3" max="3" step="0.1" value="' +
    esc(moodText(c.energy)) +
    '" aria-label="Exact energy"></label><button type="button" id="clear-energy">Clear energy</button></div></div>' +
    '<div class="mood-checkin"><h3>Mood</h3><div class="mood-continuous"><input id="mood-slider" class="' +
    (c.mood === null ? 'is-empty' : '') +
    '" type="range" min="-3" max="3" step="any" value="' +
    esc(roundMood(c.mood) ?? 0) +
    '" aria-label="Mood from minus 3 to plus 3" aria-valuetext="' +
    esc(c.mood === null ? 'Not recorded' : moodText(c.mood)) +
    '"><div class="mood-ticks" aria-hidden="true">' +
    Array.from({ length: 7 }, (_, i) => i - 3)
      .map(n => '<span>' + (n > 0 ? '+' : '') + n + '</span>')
      .join('') +
    '</div></div><div class="mood-scale-captions" aria-hidden="true"><span>Very low</span><span>Neutral</span><span>Very good</span></div><div class="mood-exact-row"><label>Exact mood<input id="exact-mood" type="number" min="-3" max="3" step="0.1" value="' +
    esc(moodText(c.mood)) +
    '" aria-label="Exact mood"></label><button type="button" id="clear-mood">Clear mood</button></div><label class="mood-note-label" for="mood-note">Mood note</label><textarea id="mood-note" rows="2" placeholder="What influenced your mood today?">' +
    esc(c.moodNote) +
    '</textarea></div></div><div class="sleep-body-row"><div class="sleep-fields"><h3>Sleep</h3><label>Sleep time of last night<input type="time" data-checkin="bedtime" value="' +
    esc(c.bedtime) +
    '"></label><label>Bedtime date<select data-checkin="bedDay"><option value="previous" ' +
    (c.bedDay === 'previous' ? 'selected' : '') +
    '>Previous day (' +
    addDays(date, -1) +
    ')</option><option value="today" ' +
    (c.bedDay === 'today' ? 'selected' : '') +
    '>Today (' +
    date +
    ') · after midnight</option></select></label><label>Wake up time today<input type="time" data-checkin="wakeTime" value="' +
    esc(c.wakeTime) +
    '"></label><p>Total sleep: <output id="sleep-hours" aria-live="polite">' +
    sleepText(c) +
    '</output></p></div><div class="body-fields"><h3>Body</h3><label>Weight today (kg)<input type="number" step="0.1" min="20" max="400" inputmode="decimal" placeholder="e.g. 70.0" data-checkin="weight" value="' +
    esc(c.weight) +
    '"></label><label>Body fat (%)<input type="number" step="0.1" min="2" max="75" inputmode="decimal" placeholder="e.g. 20.0" data-checkin="bodyFat" value="' +
    esc(c.bodyFat) +
    '"></label></div></div></div></details>'
  );
}
function checkinSummary(d) {
  const c = checkin(d);
  return (
    '\n## Daily check-in\nWeight training: ' +
    c.sets.filter(Boolean).length +
    '/10 sets\nFasting more than 16 hr: ' +
    c.fasting +
    '\nHad sex: ' +
    c.sex +
    '\nShabu buffet: ' +
    c.shabu +
    '\nPeriod: ' +
    (c.period ? FLOWS.find(([v]) => v === c.periodFlow)?.[1] || 'Yes' : 'No') +
    '\nEnergy: ' +
    (c.energy ?? 'Not recorded') +
    '\nMood: ' +
    (c.mood ?? 'Not recorded') +
    '\nMood note: ' +
    (c.moodNote || 'Not recorded') +
    '\nBedtime: ' +
    (c.bedtime || 'Not recorded') +
    ' (' +
    c.bedDay +
    ')\nWake time: ' +
    (c.wakeTime || 'Not recorded') +
    '\nTotal sleep: ' +
    sleepText(c) +
    '\nWeight: ' +
    (c.weight ? c.weight + ' kg' : 'Not recorded') +
    '\nBody fat: ' +
    (c.bodyFat ? c.bodyFat + ' %' : 'Not recorded')
  );
}
$('#content').addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.set === undefined && el.dataset.checkin === undefined && el.dataset.mood === undefined) return;
  const c = checkin();
  if (el.dataset.set !== undefined) {
    c.sets = [...c.sets];
    c.sets[Number(el.dataset.set)] = el.checked;
    $('#set-count').textContent = c.sets.filter(Boolean).length + '/10 sets';
  } else if (el.dataset.mood !== undefined) {
    c.mood = Number(el.dataset.mood);
    $('#exact-mood').value = c.mood;
  } else c[el.dataset.checkin] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.checkin === 'period') {
    $('#flow-choices').hidden = !c.period;
    if (!c.period) {
      c.periodFlow = '';
      for (const r of $('#flow-choices').querySelectorAll('input')) r.checked = false;
    }
  }
  day().checkin = c;
  $('#sleep-hours').textContent = sleepText(c);
  dirty();
});
function roundMood(n) {
  return n === null ? null : (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 10)) / 10;
}
function moodText(n) {
  return n === null ? '' : roundMood(n).toFixed(1);
}
const scaleKey = id =>
  ({
    'mood-slider': 'mood',
    'exact-mood': 'mood',
    'clear-mood': 'mood',
    'energy-slider': 'energy',
    'exact-energy': 'energy',
    'clear-energy': 'energy'
  })[id];
function setMood(n) {
  setScale('mood', n);
}
function setScale(key, n) {
  n = roundMood(n);
  day().checkin = { ...checkin(), [key]: n };
  const exact = $('#exact-' + key),
    slider = $('#' + key + '-slider');
  exact.value = moodText(n);
  exact.setCustomValidity('');
  slider.value = n ?? 0;
  slider.classList.toggle('is-empty', n === null);
  slider.setAttribute('aria-valuetext', n === null ? 'Not recorded' : moodText(n));
  dirty();
}
$('#content').addEventListener('input', e => {
  if (e.target.id === 'mood-slider' || e.target.id === 'energy-slider')
    setScale(scaleKey(e.target.id), Number(e.target.value));
  if (e.target.id === 'exact-mood' || e.target.id === 'exact-energy') e.target.setCustomValidity('');
  if (e.target.id === 'mood-note') {
    day().checkin = { ...checkin(), moodNote: e.target.value };
    dirty();
  }
});
$('#content').addEventListener('keydown', e => {
  if (e.target.id !== 'mood-slider' && e.target.id !== 'energy-slider') return;
  const key = scaleKey(e.target.id);
  const steps = { ArrowLeft: -0.1, ArrowDown: -0.1, ArrowRight: 0.1, ArrowUp: 0.1, PageDown: -1, PageUp: 1 };
  if (e.key === 'Home' || e.key === 'End' || e.key in steps) {
    e.preventDefault();
    setScale(
      key,
      e.key === 'Home'
        ? -3
        : e.key === 'End'
          ? 3
          : Math.max(-3, Math.min(3, Number((Number(e.target.value) + steps[e.key]).toFixed(10))))
    );
  }
});
$('#content').addEventListener('click', e => {
  if (e.target.id === 'clear-mood' || e.target.id === 'clear-energy') setScale(scaleKey(e.target.id), null);
});

function renderBodyMetrics() {
  document.querySelector('#page-title').textContent = 'Body Tracking';
  document.querySelector('#eyebrow').textContent = 'WEIGHT, BODY FAT & CYCLE';
  return DailyBookBodyMetrics.markup() + DailyBookCycle.markup(book.days, bangkokToday());
}
function renderMoodSleep() {
  document.querySelector('#page-title').textContent = 'Mood & Sleep';
  document.querySelector('#eyebrow').textContent = 'PATTERNS OVER TIME';
  return DailyBookMoodSleep.markup();
}

$('#content').addEventListener('change', e => {
  if (e.target.id !== 'exact-mood' && e.target.id !== 'exact-energy') return;
  const n = e.target.value === '' ? null : Number(e.target.value);
  if (e.target.validity.badInput || (n !== null && !DailyBookMoodSleep.validMood(n))) {
    e.target.setCustomValidity('Enter a number from −3 to +3.');
    e.target.reportValidity();
    return;
  }
  setScale(scaleKey(e.target.id), n);
});

function renderDisciplineChoices(d) {
  return (
    '<div class="discipline-choices" role="group" aria-label="Discipline or Emotion">' +
    [
      ['discipline', 'Discipline', 'I followed through on what I intended to do.'],
      ['emotion', 'Emotion', 'My mood influenced my choices.']
    ]
      .map(
        ([key, title, description]) =>
          `<label class="discipline-choice">${key === 'discipline' ? activityFireMarkup() : ''}<input type="checkbox" data-discipline-choice="${key}" ${d.disciplineChoices?.[key] ? 'checked' : ''}><span class="discipline-choice-copy"><strong>${title}</strong><small>${description}</small></span></label>`
      )
      .join('') +
    '</div>' +
    (d.reflections.discipline
      ? `<details class="previous-discipline"><summary>Previous notes</summary><p>${esc(d.reflections.discipline)}</p></details>`
      : '')
  );
}
function disciplineSummary(d) {
  return (
    [
      ['discipline', 'Discipline'],
      ['emotion', 'Emotion']
    ]
      .map(([key, title]) => `- [${d.disciplineChoices?.[key] ? 'x' : ' '}] ${title}`)
      .join('\n') + (d.reflections.discipline ? '\nPrevious notes: ' + d.reflections.discipline : '')
  );
}

let activityMenuId = null,
  activityEditId = null,
  activityMenuTrigger = null,
  activityMenuTime = '08:30';
function activityTimeError(start, end, old) {
  if (old && start === old.time && (end || '') === (old.end || '')) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return 'Choose a valid start time (00:00–23:59).';
  if (end && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || end <= start))
    return 'Choose an end time later than start. Use Calendar for overnight activities.';
  return '';
}
function closeActivityMenu(restoreFocus = false) {
  $('#activity-menu').hidden = true;
  activityMenuId = null;
  document.querySelectorAll('.timeline-event.is-raised').forEach(el => el.classList.remove('is-raised'));
  if (activityMenuTrigger?.isConnected) {
    activityMenuTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) activityMenuTrigger.focus();
  }
}
function openActivityMenu(id, trigger, point, time) {
  closeActivityMenu();
  activityMenuId = id;
  activityMenuTrigger = trigger;
  activityMenuTime = time || day().schedule.find(s => s.id === id)?.time || '08:30';
  $('#activity-menu')
    .querySelectorAll('[data-activity-menu="edit"],[data-activity-menu="delete"]')
    .forEach(b => (b.hidden = !id));
  const entry = trigger.closest('.timeline-event');
  entry?.classList.add('is-raised');
  trigger.setAttribute('aria-expanded', 'true');
  const menu = $('#activity-menu');
  menu.hidden = false;
  const rect = trigger.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(point?.x ?? rect.left, innerWidth - menu.offsetWidth - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(point?.y ?? rect.bottom, innerHeight - menu.offsetHeight - 4)) + 'px';
  menu.querySelector('button:not([hidden])').focus({ preventScroll: true });
}
function activityRepeatFields() {
  const repeat = $('#activity-edit-form').elements.repeat.value;
  $('#activity-repeat-days').hidden = repeat !== 'WEEKLY';
  $('#activity-repeat-until').hidden = !repeat;
}
// Start each editor as "Does not repeat", with this page's weekday ticked for Weekly.
function resetActivityRepeat(f) {
  f.elements.repeat.value = '';
  f.elements.until.value = '';
  f.querySelectorAll('[name=weekday]').forEach(
    el => (el.checked = el.value === BookCalendar.codes[BookCalendar.weekday(date)])
  );
  activityRepeatFields();
}
$('#activity-edit-form').elements.repeat.onchange = activityRepeatFields;
function addActivity(time) {
  activityEditId = null;
  const f = $('#activity-edit-form');
  f.reset();
  resetActivityRepeat(f);
  f.querySelector('h2').textContent = 'Add activity';
  f.querySelector('button.primary').textContent = 'Add to schedule';
  f.elements.time.value = time;
  const n = DailyBookSchedule.minutes(time);
  f.elements.end.value = n < 1439 ? DailyBookSchedule.time(Math.min(n + 30, 1439)) : '';
  $('#activity-edit-error').hidden = true;
  $('#activity-editor').showModal();
  f.elements.plan.focus();
}
function editActivity(id) {
  const s = day().schedule.find(s => s.id === id);
  if (!s) return;
  if (s.calendarManaged) {
    openCalendarEvent(s.eventId, s.occurrence);
    return;
  }
  activityEditId = id;
  const f = $('#activity-edit-form');
  f.elements.plan.value = s.plan;
  f.elements.time.value = s.time;
  f.elements.end.value = s.end || '';
  f.elements.done.checked = s.done;
  resetActivityRepeat(f);
  f.querySelector('h2').textContent = 'Edit activity';
  f.querySelector('button.primary').textContent = 'Save';
  $('#activity-edit-error').hidden = true;
  $('#activity-editor').showModal();
  f.elements.plan.focus();
}
$('#activity-menu').addEventListener('click', e => {
  const b = e.target.closest('[data-activity-menu]');
  if (!b) return;
  const id = activityMenuId,
    time = activityMenuTime;
  closeActivityMenu();
  if (b.dataset.activityMenu === 'add') addActivity(time);
  else if (b.dataset.activityMenu === 'edit') editActivity(id);
  else if (day().schedule.find(s => s.id === id)?.calendarManaged) {
    const s = day().schedule.find(s => s.id === id);
    openCalendarEvent(s.eventId, s.occurrence);
  } else if (confirm('Delete this scheduled activity?')) {
    lastEditAt = 0;
    day().schedule = day().schedule.filter(s => s.id !== id);
    dirty();
    render();
  }
});
$('#activity-menu').addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeActivityMenu(true);
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const buttons = [...e.currentTarget.querySelectorAll('button:not([hidden])')],
      i = buttons.indexOf(document.activeElement);
    buttons[
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
    ].focus();
  }
  if (e.key === 'Tab') closeActivityMenu();
});
$('#activity-edit-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget,
    s = day().schedule.find(s => s.id === activityEditId);
  if (activityEditId && !s) return;
  const start = f.elements.time.value,
    end = f.elements.end.value,
    plan = f.elements.plan.value.trim(),
    repeat = f.elements.repeat.value,
    until = f.elements.until.value,
    days = [...f.querySelectorAll('[name=weekday]:checked')].map(el => el.value);
  const problem = !plan
    ? 'Enter an activity name.'
    : activityTimeError(start, end, s) ||
      (repeat && until && until < date
        ? 'Repeat end must not be before this day.'
        : repeat === 'WEEKLY' && !days.length
          ? 'Choose at least one repeat day.'
          : repeat === 'WEEKLY' && !days.includes(BookCalendar.codes[BookCalendar.weekday(date)])
            ? 'This day must be one of the selected repeat days.'
            : '');
  if (problem) {
    $('#activity-edit-error').textContent = problem;
    $('#activity-edit-error').hidden = false;
    return;
  }
  lastEditAt = 0;
  let entry = s;
  if (s) Object.assign(s, { plan, time: start, end, done: f.elements.done.checked });
  else {
    entry = { id: uid(), plan, time: start, end, done: f.elements.done.checked, changes: [] };
    day().schedule.push(entry);
    activityEditId = entry.id;
  }
  if (repeat) {
    // Turn the saved activity into a Calendar series that starts on this day.
    BookCalendar.reconcile(book, lastEdit ? JSON.parse(lastEdit) : null);
    const id = entry.eventId || entry.id,
      series = (book.calendar.events[id] ||= BookCalendar.fromSlot(date, entry));
    series.recurrence = BookCalendar.repeatRule(repeat, days, until, false, series.timeZone);
    series.exceptions = entry.done ? { [date]: { done: true } } : {};
    BookCalendar.projectAll(book);
    dirty(true);
  } else dirty();
  $('#activity-editor').close();
  render();
});
$('#activity-edit-cancel').onclick = () => $('#activity-editor').close();
$('#compass-edit-form').addEventListener('submit', e => {
  e.preventDefault();
  const text = e.currentTarget.elements.identity.value.trim();
  // Saving the default text (or nothing) keeps following the default.
  book.identity = text === COMPASS ? '' : text;
  lastEditAt = 0;
  dirty();
  $('#compass-editor').close();
  render();
});
$('#compass-edit-cancel').onclick = () => $('#compass-editor').close();
$('#compass-edit-reset').onclick = () => ($('#compass-edit-form').elements.identity.value = COMPASS);
$('#compass-editor').addEventListener('close', () => $('#edit-compass')?.focus());
$('#activity-editor').addEventListener('close', () => {
  const el = [...document.querySelectorAll('.timeline-event')].find(el => el.dataset.eventId === activityEditId);
  el?.focus();
});
$('#content').addEventListener('contextmenu', e => {
  const timeline = e.target.closest('.schedule-timeline');
  if (!timeline) return;
  const canvas = timeline.querySelector('.timeline-canvas'),
    model = DailyBookSchedule.layout(day().schedule);
  const minute = model.start + Math.round((e.clientY - canvas.getBoundingClientRect().top) / 2);
  const el = e.target.closest('.timeline-event');
  if (!el && (minute < 0 || minute > 1439)) return;
  e.preventDefault();
  openActivityMenu(
    el?.dataset.eventId || null,
    el || e.target.closest('input,.timeline-scroll') || timeline.querySelector('.timeline-scroll'),
    { x: e.clientX, y: e.clientY },
    DailyBookSchedule.time(Math.max(0, Math.min(1439, minute)))
  );
});
$('#content').addEventListener('keydown', e => {
  const el = e.target.closest('.timeline-event');
  if (el && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
    e.preventDefault();
    openActivityMenu(el.dataset.eventId, el);
  }
  if (e.key === 'Escape') {
    closeActivityMenu(true);
    document.querySelectorAll('.is-raised').forEach(el => el.classList.remove('is-raised'));
  }
});
let activityDrag = null,
  activityDragFrame;
function shiftedActivity(s, delta) {
  const start = DailyBookSchedule.minutes(s.time),
    end = s.end ? DailyBookSchedule.minutes(s.end) : null;
  // Legacy ranges outside the editor's bounds stay available through Edit.
  if (s.calendarManaged || start < 0 || start > 1439 || (end !== null && (end <= start || end > 1439))) return null;
  const shift = Math.max(-start, Math.min(1439 - (end ?? start), delta));
  return {
    time: DailyBookSchedule.time(start + shift),
    end: end === null ? '' : DailyBookSchedule.time(end + shift),
    shift
  };
}
function redrawActivityTimeline(id, focus = false) {
  const schedule = $('.schedule'),
    scroll = schedule.querySelector('.timeline-scroll').scrollLeft;
  schedule.innerHTML = renderSchedule();
  mountTimeline();
  schedule.querySelector('.timeline-scroll').scrollLeft = scroll;
  if (focus)
    [...schedule.querySelectorAll('.timeline-event')]
      .find(el => el.dataset.eventId === id)
      ?.querySelector('[data-action="shift-activity"]')
      .focus({ preventScroll: true });
}
function previewActivityDrag() {
  const d = activityDrag;
  if (!d || !d.el.isConnected) return;
  const offset = d.y - d.canvas.getBoundingClientRect().top - d.origin;
  if (!d.active && Math.abs(offset) < 5) return;
  d.active = true;
  d.next = shiftedActivity(d.s, Math.round(offset / 2));
  d.el.classList.add('is-dragging');
  d.el.style.transform = `translateY(${d.next.shift * 2}px)`;
  d.el.querySelector('.block-range').textContent = d.next.time + (d.next.end ? '–' + d.next.end : '');
  d.el.setAttribute('aria-label', `${d.s.plan} · ${d.next.time}${d.next.end ? '–' + d.next.end : ''}`);
}
function finishActivityDrag(commit = false) {
  const d = activityDrag;
  if (!d) return;
  activityDrag = null;
  cancelAnimationFrame(activityDragFrame);
  if (d.el.hasPointerCapture(d.pointerId)) d.el.releasePointerCapture(d.pointerId);
  d.el.classList.remove('is-dragging');
  d.el.style.transform = '';
  d.el.querySelector('.block-range').textContent = d.s.time + (d.s.end ? '–' + d.s.end : '');
  d.el.setAttribute('aria-label', `${d.s.plan} · ${d.s.time}${d.s.end ? '–' + d.s.end : ''}`);
  if (commit && d.active && d.next.shift && date === d.date && d.el.isConnected) {
    const s = day().schedule.find(s => s.id === d.s.id);
    if (!s) return;
    s.time = d.next.time;
    if (s.end || d.next.end) s.end = d.next.end;
    lastEditAt = 0;
    dirty();
    redrawActivityTimeline(s.id);
  }
}
function scrollActivityDrag() {
  const d = activityDrag;
  if (!d) return;
  if (d.active) {
    const speed =
      d.y < 64 ? -Math.ceil((64 - d.y) / 5) : d.y > innerHeight - 64 ? Math.ceil((d.y - innerHeight + 64) / 5) : 0;
    if (speed) {
      window.scrollBy(0, Math.max(-18, Math.min(18, speed)));
      previewActivityDrag();
    }
  }
  activityDragFrame = requestAnimationFrame(scrollActivityDrag);
}
$('#content').addEventListener('pointerdown', e => {
  const el = e.target.closest('.timeline-event');
  if (!el) return;
  document.querySelectorAll('.timeline-event.is-raised').forEach(other => {
    if (other !== el) other.classList.remove('is-raised');
  });
  el.classList.add('is-raised');
  if (
    e.button !== 0 ||
    !e.isPrimary ||
    activityDrag ||
    e.target.closest('input,textarea,select,a,button:not([data-action="shift-activity"])')
  )
    return;
  // Touch uses the handle so swiping the card can still scroll the page.
  if (e.pointerType === 'touch' && !e.target.closest('[data-action="shift-activity"]')) return;
  const s = day().schedule.find(s => s.id === el.dataset.eventId);
  if (!s || !shiftedActivity(s, 0)) return;
  e.preventDefault();
  closeActivityMenu();
  el.classList.add('is-raised');
  const canvas = el.closest('.timeline-canvas');
  activityDrag = {
    el,
    canvas,
    s: { ...s },
    date,
    pointerId: e.pointerId,
    y: e.clientY,
    origin: e.clientY - canvas.getBoundingClientRect().top,
    active: false
  };
  el.setPointerCapture(e.pointerId);
  activityDragFrame = requestAnimationFrame(scrollActivityDrag);
});
document.addEventListener('pointermove', e => {
  if (activityDrag?.pointerId !== e.pointerId) return;
  activityDrag.y = e.clientY;
  previewActivityDrag();
});
document.addEventListener('pointerup', e => {
  if (activityDrag?.pointerId === e.pointerId) finishActivityDrag(true);
});
document.addEventListener('pointercancel', e => {
  if (activityDrag?.pointerId === e.pointerId) finishActivityDrag();
});
document.addEventListener('lostpointercapture', e => {
  if (activityDrag?.pointerId === e.pointerId) finishActivityDrag();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activityDrag) {
    e.preventDefault();
    finishActivityDrag();
  }
});
window.addEventListener('blur', () => finishActivityDrag());
$('#content').addEventListener('keydown', e => {
  if (!e.target.matches('[data-action="shift-activity"]') || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const id = e.target.closest('.timeline-event').dataset.eventId,
    s = day().schedule.find(s => s.id === id);
  const next = shiftedActivity(s, (e.key === 'ArrowUp' ? -1 : 1) * (e.shiftKey ? 15 : 1));
  if (!next?.shift) return;
  s.time = next.time;
  if (s.end || next.end) s.end = next.end;
  lastEditAt = 0;
  dirty();
  redrawActivityTimeline(id, true);
});
document.addEventListener('click', e => {
  if (!e.target.closest('#activity-menu,[data-action="activity-menu"]')) {
    if (!e.target.closest('.timeline-event') || !$('#activity-menu').hidden) closeActivityMenu();
  }
});
window.addEventListener('resize', () => closeActivityMenu());
document.addEventListener(
  'wheel',
  () => {
    if (!$('#activity-menu').hidden) closeActivityMenu();
  },
  { passive: true }
);
document.addEventListener(
  'touchmove',
  () => {
    if (!$('#activity-menu').hidden) closeActivityMenu();
  },
  { passive: true }
);

// Current-time marker across today's timeline, refreshed every 30 seconds.
function updateNowLine() {
  const now = new Date(),
    today = localDate(now),
    minute = now.getHours() * 60 + now.getMinutes();
  document.querySelectorAll('.schedule-timeline').forEach(timeline => {
    const line = timeline.querySelector('.timeline-now'),
      canvas = timeline.querySelector('.timeline-canvas');
    if (!line || !canvas) return;
    const start = Number(canvas.dataset.timelineStart),
      end = Number(canvas.dataset.timelineEnd);
    const show = date === today && minute >= start && minute <= end;
    line.hidden = !show;
    if (!show) return;
    line.style.top = (minute - start) * 2 + 'px';
    line.querySelector('.timeline-now-time').textContent = DailyBookSchedule.time(minute);
  });
}
setInterval(updateNowLine, 30000);
function mountTimeline() {
  document.querySelectorAll('.schedule [data-layout-height],.schedule [data-layout-top]').forEach(el => {
    for (const [key, prop] of [
      ['layoutHeight', 'height'],
      ['layoutTop', 'top'],
      ['layoutLeft', 'left'],
      ['layoutWidth', 'minWidth']
    ])
      if (el.dataset[key] !== undefined) el.style[prop] = el.dataset[key] + 'px';
    if (el.dataset.layoutLayer !== undefined) el.style.zIndex = el.dataset.layoutLayer;
    if (Number(el.dataset.layoutColumns) > 1) {
      const count = Number(el.dataset.layoutColumns),
        column = Number(el.dataset.layoutColumn),
        base = Number(el.dataset.layoutLeft),
        width = `((100% - ${base}px - ${(count - 1) * 8}px) / ${count})`;
      el.style.width = `calc(${width})`;
      el.style.left = `calc(${base}px + ${column} * (${width} + 8px))`;
      el.style.right = 'auto';
    }
  });
  updateNowLine();
}

$('#content').addEventListener('focusin', e => {
  const el = e.target.closest('.timeline-event');
  if (el) {
    document.querySelectorAll('.timeline-event.is-raised').forEach(other => {
      if (other !== el) other.classList.remove('is-raised');
    });
    el.classList.add('is-raised');
  }
});

function updateSchedulePrint() {
  const target = document.querySelector('.schedule-print');
  if (target)
    target.innerHTML = day()
      .schedule.slice()
      .sort((a, b) => a.time.localeCompare(b.time))
      .map(
        s => `<div><strong>${s.time}${s.end ? '–' + s.end : ''}</strong> · ${s.done ? '✓ ' : ''}${esc(s.plan)}</div>`
      )
      .join('');
}
window.addEventListener('beforeprint', updateSchedulePrint);
