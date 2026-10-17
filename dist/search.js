(function (root) {
  'use strict';
  // Search every written note in the book: daily reflections, tasks, activities, goals and period reviews.
  const GROUPS = {
    all: 'All notes',
    fix: 'Below Your Standard & Fix',
    worry: 'What’s worrying you',
    compass: 'Compass & proud notes',
    tomorrow: 'Purpose to Wake Up For',
    work: 'Tasks, priorities & activities',
    goals: 'Goals & weekly/monthly reflections'
  };
  const escape = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const lower = s => String(s).toLocaleLowerCase();
  function fields(book) {
    const out = [];
    const add = (date, group, label, text, view = 'day') => {
      if (typeof text === 'string' && text.trim()) out.push({ date, group, label, text, view });
    };
    for (const [date, d] of Object.entries(book.days || {})) {
      add(date, 'fix', 'Below Your Standard & Fix', d.reflections?.fix);
      add(date, 'worry', 'What’s worrying you', d.reflections?.worry);
      add(date, 'tomorrow', 'Purpose to Wake Up For', d.reflections?.tomorrow);
      add(date, 'compass', 'Previous Compass notes', d.reflections?.compass);
      add(date, 'compass', 'Discipline or Emotion note', d.reflections?.discipline);
      for (const [part, text] of Object.entries(d.compassActions || {}))
        add(date, 'compass', 'Compass · ' + part, text);
      add(date, 'compass', 'Why I am proud', d.proudNote);
      add(date, 'compass', 'Mood note', d.checkin?.moodNote);
      add(date, 'work', 'Most important task', d.priority);
      add(date, 'work', 'What got in the way', d.priorityMiss?.note);
      for (const t of d.tasks || []) add(date, 'work', 'Task', t.text);
      for (const s of d.schedule || []) add(date, 'work', 'Activity · ' + s.time, s.plan);
    }
    for (const g of book.goals || [])
      add(g.start, 'goals', g.type === 'week' ? 'Weekly goal' : 'Monthly goal', g.title, g.type);
    for (const [key, text] of Object.entries(book.reviews || {})) {
      const [view, date] = key.split(':');
      if (/^\d{4}-\d{2}-\d{2}$/.test(date || ''))
        add(
          date,
          'goals',
          view === 'week' ? 'Weekly reflection' : 'Monthly reflection',
          text,
          view === 'week' ? 'week' : 'month'
        );
    }
    return out;
  }
  // Every word of the query must appear in the same note (case-insensitive).
  function find(book, query, group = 'all') {
    const terms = lower(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return fields(book)
      .filter(f => (group === 'all' || f.group === group) && terms.every(t => lower(f.text).includes(t)))
      .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
  }
  // A short excerpt around the first match, with every term highlighted.
  function snippet(text, query, radius = 70) {
    const terms = [...new Set(lower(query).split(/\s+/).filter(Boolean))],
      low = lower(text),
      ranges = [];
    for (const t of terms)
      for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + t.length)) ranges.push([i, i + t.length]);
    ranges.sort((a, b) => a[0] - b[0]);
    const first = ranges.length ? ranges[0][0] : 0,
      start = Math.max(0, first - radius),
      end = Math.min(text.length, first + radius * 2);
    let html = '',
      pos = start;
    for (const [a, b] of ranges) {
      if (b <= pos || a >= end) continue;
      const s = Math.max(a, pos),
        e = Math.min(b, end);
      html += escape(text.slice(pos, s)) + '<mark>' + escape(text.slice(s, e)) + '</mark>';
      pos = e;
    }
    html += escape(text.slice(pos, end));
    return (start > 0 ? '… ' : '') + html + (end < text.length ? ' …' : '');
  }
  const LIMIT = 200;
  function markup(state = {}) {
    return `<section id="book-search" class="page"><div class="section"><p class="subtle">Find patterns in what you have written. Every word must appear in the same note.</p><form class="search-form" role="search"><label>Search<input type="search" name="q" value="${escape(state.query || '')}" placeholder="e.g. sleep, exercise, project" autocomplete="off"></label><label>In<select name="group">${Object.entries(
      GROUPS
    )
      .map(([k, v]) => `<option value="${k}" ${k === (state.group || 'all') ? 'selected' : ''}>${escape(v)}</option>`)
      .join(
        ''
      )}</select></label></form><p class="search-count" aria-live="polite"></p><ol class="search-results"></ol></div></section>`;
  }
  function mount(container, book, { state, fmt }) {
    const form = container.querySelector('.search-form'),
      list = container.querySelector('.search-results'),
      count = container.querySelector('.search-count');
    let timer;
    function draw() {
      state.query = form.elements.q.value;
      state.group = form.elements.group.value;
      if (!state.query.trim()) {
        count.textContent = 'Type a word to search all your pages.';
        list.innerHTML = '';
        return;
      }
      const results = find(book, state.query, state.group),
        days = new Set(results.map(r => r.date)).size;
      count.textContent = results.length
        ? `${results.length} ${results.length === 1 ? 'note' : 'notes'} on ${days} ${days === 1 ? 'date' : 'dates'}${results.length > LIMIT ? ` · showing the newest ${LIMIT}` : ''}`
        : 'No notes match. Try fewer or shorter words.';
      list.innerHTML = results
        .slice(0, LIMIT)
        .map(
          r =>
            `<li><button type="button" class="search-hit" data-open-date="${escape(r.date)}" data-open-view="${escape(r.view)}"><span class="search-meta"><strong>${escape(fmt ? fmt(r.date) : r.date)}</strong> · ${escape(r.label)}</span><span class="search-snippet">${snippet(r.text, state.query)}</span></button></li>`
        )
        .join('');
    }
    form.onsubmit = e => e.preventDefault();
    form.elements.q.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(draw, 120);
    };
    form.elements.group.onchange = draw;
    draw();
    form.elements.q.focus();
    return () => clearTimeout(timer);
  }
  const api = { GROUPS, fields, find, snippet, markup, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyBookSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
