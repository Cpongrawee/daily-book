(function (root) {
  'use strict';
  const metrics = [
    ['priority', 'Most important task'],
    ['tasks', 'Tasks'],
    ['fasting', 'Fasting >16 hr'],
    ['training', 'Weight training ≥5 sets'],
    ['proud', 'Proud day'],
    ['review', 'Bedtime review']
  ];
  const labels = {
    success: 'Completed',
    failure: 'Not completed',
    unknown: 'No data',
    pending: 'Awaiting review',
    na: 'No task set'
  };
  const symbols = { success: '✓', failure: '×', unknown: '?', pending: '…', na: '–' };
  const escape = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const next = (s, n = 1) => {
    const d = new Date(s + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const monthEnd = ym => utc(+ym.slice(0, 4), +ym.slice(5, 7), 0);
  // Quarter containing a date: [first day, last day].
  const quarterOf = s => {
    const y = +s.slice(0, 4),
      m = Math.floor((+s.slice(5, 7) - 1) / 3) * 3;
    return [utc(y, m, 1), utc(y, m + 3, 0)];
  };
  const quarterName = s => `Q${Math.floor((+s.slice(5, 7) - 1) / 3) + 1} ${s.slice(0, 4)}`;
  const monthName = ym =>
    new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  function dates(start, end) {
    const out = [];
    for (let d = start; d <= end; d = next(d)) out.push(d);
    return out;
  }
  function tasks(d) {
    return (d.tasks || []).filter(t => typeof t.text === 'string' && t.text.trim());
  }
  function sets(d) {
    return Array.isArray(d.checkin?.sets) ? d.checkin.sets.filter(v => v === true).length : 0;
  }
  function status(d = {}, key, date, today) {
    const pending = date === today ? 'pending' : 'unknown';
    if (key === 'priority' && !d.priority?.trim()) return 'na';
    if (key === 'tasks' && !tasks(d).length) return 'na';
    if (key === 'review') return d.closed ? 'success' : pending;
    const done =
      key === 'priority'
        ? d.priorityDone
        : key === 'tasks'
          ? tasks(d).every(t => t.done)
          : key === 'training'
            ? sets(d) >= 5
            : key === 'proud'
              ? d.proud
              : d.checkin?.[key];
    return done ? 'success' : d.closed ? 'failure' : pending;
  }
  function current(days, key, today) {
    const first = Object.keys(days).sort()[0];
    if (!first) return 0;
    let end = today,
      s = status(days[end], key, end, today);
    if (s === 'pending' || s === 'na') end = next(end, -1);
    let count = 0;
    for (let d = end; d >= first && status(days[d], key, d, today) === 'success'; d = next(d, -1)) count++;
    return count;
  }
  function summarize(days, start, end, today) {
    const ds = dates(start, [end, today].sort()[0]);
    const rows = metrics.map(([key, name]) => {
      const counts = { success: 0, failure: 0, unknown: 0, pending: 0, na: 0 },
        items = [];
      let best = 0,
        run = 0,
        knownDays = 0,
        totalSets = 0;
      const cells = ds.map(date => {
        const d = days[date] || {},
          s = status(d, key, date, today);
        run = s === 'success' ? run + 1 : 0;
        best = Math.max(best, run);
        if (key === 'training') totalSets += sets(d);
        if (key === 'tasks') {
          const ts = tasks(d);
          let known = false;
          if (!ts.length) counts.na++;
          for (const t of ts) {
            const state = t.done ? 'success' : d.closed ? 'failure' : date === today ? 'pending' : 'unknown';
            counts[state]++;
            if (state === 'success' || state === 'failure') known = true;
            items.push({ date, text: t.text, state });
          }
          if (known) knownDays++;
        } else {
          counts[s]++;
          if (s === 'success' || s === 'failure') knownDays++;
          if (key === 'priority' && s !== 'na') items.push({ date, text: d.priority, state: s });
        }
        return { date, state: s };
      });
      const denominator = counts.success + counts.failure;
      return {
        key,
        name,
        counts,
        items,
        cells,
        best,
        current: current(days, key, today),
        knownDays,
        totalSets,
        rate: denominator ? Math.round((100 * counts.success) / denominator) : null
      };
    });
    return { dates: ds, rows };
  }
  function presetRange(preset, today) {
    if (preset === 'quarter') return quarterOf(today);
    if (preset === 'week') {
      const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
      const start = next(today, -weekday);
      return [start, next(start, 6)];
    }
    const month = /^\d{4}-\d{2}$/.test(preset) ? preset : today.slice(0, 7);
    return [month + '-01', monthEnd(month)];
  }
  function markup(today = new Date().toISOString().slice(0, 10)) {
    const qStart = quarterOf(today)[0],
      months = [0, 1, 2].map(i => utc(+qStart.slice(0, 4), +qStart.slice(5, 7) - 1 + i, 1).slice(0, 7));
    return (
      '<section id="behavior-dashboard" class="page"><div class="section"><p class="subtle">Notice your progress, one day at a time.</p><form class="behavior-filters"><label>Period<select name="period"><option value="month">This month</option><option value="week">This week</option>' +
      months.map(m => '<option value="' + m + '">' + monthName(m) + '</option>').join('') +
      '<option value="quarter">All ' +
      quarterName(qStart) +
      '</option><option value="custom">Custom dates</option></select></label><label>From<input type="date" name="start" required></label><label>Through<input type="date" name="end" required></label><button class="primary">Apply</button></form><p class="behavior-error" role="alert" hidden></p><div class="behavior-results"></div></div></section>'
    );
  }
  function mount(container, days, { today, state }) {
    const q = s => container.querySelector(s),
      form = q('form');
    const first = Object.keys(days).sort()[0],
      min = first && first < today ? first : today,
      max = quarterOf(today)[1];
    for (const name of ['start', 'end']) Object.assign(form.elements[name], { min, max });
    if (!state.start) {
      [state.start, state.end] = presetRange('month', today);
      state.preset = 'month';
    }
    const rate = r => (r.rate === null ? '—' : r.rate + '%');
    function draw() {
      const data = summarize(days, state.start, state.end, today),
        rows = data.rows;
      const countButton = (r, s) =>
        r.key === 'priority' || r.key === 'tasks'
          ? `<button class="behavior-count" data-detail="${r.key}:${s}" aria-label="${escape(r.name)} ${labels[s]}: ${r.counts[s]}">${r.counts[s]}</button>`
          : r.counts[s];
      const cards = [
        ['Work · individual tasks', rows.slice(0, 2)],
        ['Habits · daily outcomes', rows.slice(2)]
      ];
      q('.behavior-results').innerHTML =
        `<p class="behavior-range">${escape(state.start)} → ${escape(state.end)} · ${data.dates.length} elapsed days · Bangkok time</p>${!data.dates.length ? '<p class="empty">No elapsed dates in this range. Future days are excluded.</p>' : ''}<div class="behavior-overview">${cards
          .map(([title, rs]) => {
            const sum = k => rs.reduce((a, r) => a + r.counts[k], 0);
            return `<section class="behavior-card"><h2>${title}</h2><div class="behavior-totals"><span><strong>${sum('success')}</strong>Completed</span><span><strong>${sum('failure')}</strong>Not completed</span><span><strong>${sum('unknown') + sum('pending')}</strong>No data / awaiting</span></div><p>${sum('success') + sum('failure') ? Math.round((sum('success') * 100) / (sum('success') + sum('failure'))) + '%' : '—'} completed among known outcomes</p></section>`;
          })
          .join(
            ''
          )}</div><h2>Your six measures</h2><p class="subtle">Tasks count individual items; other measures count days. Unchecked items become “Not completed” only after bedtime review. Bedtime review itself is never marked failed.</p><div class="behavior-scroll" tabindex="0" role="region" aria-label="Behavior statistics, scroll horizontally"><table class="behavior-table"><thead><tr><th>Measure</th><th>Completed</th><th>Not completed</th><th>No data</th><th>Awaiting review</th><th>No task set<br>(days)</th><th>Success rate</th><th>Known days</th><th>Current streak<br>through today / yesterday</th><th>Best streak<br>selected range</th></tr></thead><tbody>${rows.map(r => `<tr data-metric="${r.key}"><th scope="row">${r.name}${r.key === 'training' ? `<small>${r.totalSets} total sets · 5/day</small>` : r.key === 'tasks' ? '<small>Streak: all tasks completed</small>' : ''}</th><td>${countButton(r, 'success')}</td><td>${countButton(r, 'failure')}</td><td>${r.counts.unknown}</td><td>${r.counts.pending}</td><td>${r.counts.na || '—'}</td><td>${rate(r)}</td><td>${r.knownDays}</td><td>${r.current} days</td><td>${r.best} days</td></tr>`).join('')}</tbody></table></div><p class="subtle">Current streak uses all recorded dates through ${today}, independently of the filter. Missing days never bridge a streak; an unfinished today preserves yesterday’s streak. Carried tasks count again as the next day’s plan.</p><section class="behavior-detail" aria-live="polite"><h3>Task details</h3><p>Select a completed or not-completed work count above to see its items.</p></section><h2>Daily pattern</h2><p class="behavior-legend">✓ Completed · × Not completed · ? No data · … Awaiting review · – No task set</p><div class="behavior-scroll" tabindex="0" role="region" aria-label="Daily behavior calendar, scroll horizontally"><table class="behavior-table behavior-calendar"><thead><tr><th>Measure</th>${data.dates.map(d => `<th>${d.slice(5)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${r.name}</th>${r.cells.map(c => `<td><button class="behavior-cell ${c.state}" data-open-date="${c.date}" title="${escape(r.name)} · ${c.date} · ${labels[c.state]}" aria-label="${escape(r.name)} · ${c.date} · ${labels[c.state]}">${symbols[c.state]}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      q('.behavior-results').onclick = e => {
        const b = e.target.closest('[data-detail]');
        if (!b) return;
        const [key, s] = b.dataset.detail.split(':'),
          r = rows.find(r => r.key === key),
          items = r.items.filter(i => i.state === s);
        q('.behavior-detail').innerHTML =
          `<h3>${r.name} · ${labels[s]} (${items.length})</h3>${items.length ? `<ul>${items.map(i => `<li><button data-open-date="${i.date}">${i.date}</button> ${escape(i.text)}</li>`).join('')}</ul>` : '<p>No matching tasks in this range.</p>'}`;
        q('.behavior-detail').scrollIntoView({ block: 'nearest', behavior: 'auto' });
      };
    }
    function sync() {
      form.elements.period.value = state.preset;
      form.elements.start.value = state.start;
      form.elements.end.value = state.end;
    }
    form.elements.period.onchange = () => {
      const p = form.elements.period.value;
      if (p === 'custom') return;
      [state.start, state.end] = presetRange(p, today);
      state.preset = p;
      q('.behavior-error').hidden = true;
      sync();
      draw();
    };
    for (const name of ['start', 'end'])
      form.elements[name].onchange = () => {
        form.elements.period.value = 'custom';
      };
    form.onsubmit = e => {
      e.preventDefault();
      const start = form.elements.start.value,
        end = form.elements.end.value;
      if (!start || !end || start > end || start < min || end > max) {
        q('.behavior-error').textContent = `Choose an ordered date range from ${min} to ${max}.`;
        q('.behavior-error').hidden = false;
        return;
      }
      Object.assign(state, { start, end, preset: form.elements.period.value });
      q('.behavior-error').hidden = true;
      draw();
    };
    sync();
    draw();
  }
  const api = { metrics, status, summarize, current, presetRange, quarterOf, markup, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyBookBehavior = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
