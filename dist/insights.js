(function (root) {
  'use strict';
  // Compare days that share one habit or condition with days that don't (association, not cause).
  const MS = typeof module !== 'undefined' && module.exports ? require('./mood-sleep.js') : root.DailyBookMoodSleep;
  const BM = typeof module !== 'undefined' && module.exports ? require('./body-metrics.js') : root.DailyBookBodyMetrics;
  const MIN_DAYS = 3;
  const escape = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const named = d => (d.tasks || []).filter(t => typeof t.text === 'string' && t.text.trim());
  const signed = v => {
    const r = Math.round(v * 10) / 10;
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(1);
  };
  const percent = v => Math.round(v * 100) + '%';
  function nextDate(date) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // Next day's weight minus this day's, so an evening meal shows up in the next morning's weigh-in.
  function weightChange(d, date, days) {
    const now = d.checkin?.weight,
      next = days?.[nextDate(date)]?.checkin?.weight;
    return BM.validWeight(now) && BM.validWeight(next) ? Number(next) - Number(now) : null;
  }
  // Share of planned work completed, only once the day has been reviewed at bedtime.
  function workRate(d) {
    if (!d.closed) return null;
    const ts = named(d),
      priority = d.priority?.trim() ? 1 : 0,
      total = ts.length + priority;
    return total ? (ts.filter(t => t.done).length + (priority && d.priorityDone ? 1 : 0)) / total : null;
  }
  // Why the most important task was left unfinished; chosen on the daily page, counted here.
  const MISS_REASONS = [
    {
      key: 'big',
      icon: '🧱',
      label: 'Too big or unclear',
      tip: 'Write the first small step as the task, e.g. “Draft the outline”.'
    },
    {
      key: 'time',
      icon: '⏱️',
      label: 'Took longer than planned',
      tip: 'Give it a time block early in the day and allow extra time.'
    },
    {
      key: 'interrupted',
      icon: '📥',
      label: 'Urgent things got in the way',
      tip: 'Do it before opening messages, or protect a block in your schedule.'
    },
    {
      key: 'energy',
      icon: '🔋',
      label: 'Low energy or poor sleep',
      tip: 'Put it in your best-energy hour and compare the sleep card below.'
    },
    {
      key: 'avoided',
      icon: '🙈',
      label: 'Put it off',
      tip: 'Start with just 10 minutes and name what feels unpleasant about it.'
    },
    {
      key: 'switched',
      icon: '🔀',
      label: 'Chose something more important',
      tip: 'Fine when it was a real choice; check that the plan matched the day.'
    },
    {
      key: 'forgot',
      icon: '🤷',
      label: 'Forgot about it',
      tip: 'Give it a set time in the schedule so the day reminds you.'
    }
  ];
  const priorityResult = d => (typeof d.priority === 'string' && d.priority.trim() ? (d.priorityDone ? 1 : 0) : null);
  const METRICS = {
    mood: {
      label: 'Mood (−3 to +3)',
      format: signed,
      get: d => (MS.validMood(d.checkin?.mood) ? d.checkin.mood : null),
      threshold: 0.5
    },
    energy: {
      label: 'Energy (−3 to +3)',
      format: signed,
      get: d => (MS.validMood(d.checkin?.energy) ? d.checkin.energy : null),
      threshold: 0.5
    },
    sleep: {
      label: 'Sleep',
      format: v => (v / 60).toFixed(1) + ' h',
      get: d => MS.sleepMinutes(d.checkin),
      threshold: 30
    },
    work: { label: 'Planned work completed', format: percent, get: workRate, threshold: 0.1 },
    priority: { label: 'Most important task done', format: percent, get: priorityResult, threshold: 0.1 },
    proud: {
      label: 'Proud days',
      format: percent,
      get: d => (d.proud === true ? 1 : d.closed ? 0 : null),
      threshold: 0.1
    },
    weightChange: {
      label: 'Weight change by next morning',
      format: v => signed(v) + ' kg',
      get: weightChange,
      threshold: 0.3
    }
  };
  const sets = d => (Array.isArray(d.checkin?.sets) ? d.checkin.sets.filter(v => v === true).length : null);
  const COMPARISONS = [
    {
      id: 'sleep',
      title: 'After 7+ hours of sleep',
      a: '7 h or more',
      b: 'Under 7 h',
      metrics: ['mood', 'energy', 'priority', 'work', 'proud'],
      split: d => {
        const m = MS.sleepMinutes(d.checkin);
        return m === null ? null : m >= 420 ? 'a' : 'b';
      }
    },
    {
      id: 'bedtime',
      title: 'In bed before midnight',
      a: 'Before midnight',
      b: 'After midnight',
      metrics: ['sleep', 'mood', 'energy', 'priority', 'work'],
      split: d => {
        const c = d.checkin;
        if (MS.sleepMinutes(c) === null) return null;
        return (c.bedDay ?? 'previous') === 'previous' ? 'a' : 'b';
      }
    },
    {
      id: 'discipline',
      title: 'Discipline or emotion steered the day',
      a: 'Discipline only',
      b: 'Emotion involved',
      metrics: ['priority', 'work', 'mood', 'proud'],
      split: d => {
        const c = d.disciplineChoices || {};
        return c.emotion ? 'b' : c.discipline ? 'a' : null;
      }
    },
    {
      id: 'training',
      title: 'Weight training (5+ sets)',
      a: 'Trained',
      b: 'Fewer than 5 sets',
      metrics: ['mood', 'energy', 'sleep', 'work'],
      split: d => {
        const n = sets(d);
        return n === null || (!d.closed && n < 5) ? null : n >= 5 ? 'a' : 'b';
      }
    },
    {
      id: 'fasting',
      title: 'Fasting over 16 hours',
      a: 'Fasted',
      b: 'Did not fast',
      metrics: ['mood', 'energy', 'work'],
      split: d =>
        typeof d.checkin?.fasting !== 'boolean' || (!d.closed && !d.checkin.fasting)
          ? null
          : d.checkin.fasting
            ? 'a'
            : 'b'
    },
    {
      id: 'shabu',
      title: 'Shabu buffet day',
      a: 'Shabu',
      b: 'No shabu',
      metrics: ['weightChange', 'energy', 'mood'],
      split: d =>
        typeof d.checkin?.shabu !== 'boolean' || (!d.closed && !d.checkin.shabu) ? null : d.checkin.shabu ? 'a' : 'b'
    }
  ];
  function mean(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  // Days strictly before today and inside [start, end].
  const inRange = (days, { start = '0000-01-01', end = '9999-12-31', today } = {}) =>
    Object.entries(days)
      .filter(([k]) => k >= start && k <= end && (!today || k < today))
      .sort(([a], [b]) => a.localeCompare(b));
  // How often the most important task got done, and what got in the way on the days it didn't.
  function priorityMisses(days, range = {}) {
    const set = inRange(days, range).filter(([, d]) => priorityResult(d) !== null),
      missed = set.filter(([, d]) => !d.priorityDone),
      count = key => missed.filter(([, d]) => d.priorityMiss?.reason === key).length;
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(label => ({ label, set: 0, done: 0 }));
    for (const [k, d] of set) {
      const w = weekdays[new Date(k + 'T12:00:00Z').getUTCDay()];
      w.set++;
      if (d.priorityDone) w.done++;
    }
    return {
      set: set.length,
      done: set.length - missed.length,
      missed: missed.length,
      reasons: MISS_REASONS.map(r => ({ ...r, count: count(r.key) }))
        .filter(r => r.count)
        .sort((a, b) => b.count - a.count),
      unexplained: missed.filter(([, d]) => !MISS_REASONS.some(r => r.key === d.priorityMiss?.reason)).length,
      weekdays,
      recent: missed
        .filter(([, d]) => d.priorityMiss?.reason || d.priorityMiss?.note?.trim())
        .slice(-5)
        .reverse()
        .map(([date, d]) => ({
          date,
          task: d.priority.trim(),
          reason: MISS_REASONS.find(r => r.key === d.priorityMiss.reason) || null,
          note: d.priorityMiss.note?.trim() || ''
        }))
    };
  }
  function compute(days, range = {}) {
    const entries = inRange(days, range);
    return COMPARISONS.map(c => {
      const groups = { a: [], b: [] };
      for (const [k, d] of entries) {
        const g = c.split(d);
        if (g) groups[g].push([k, d]);
      }
      const rows = c.metrics.map(key => {
        const m = METRICS[key],
          side = g => {
            const values = groups[g].map(([k, d]) => m.get(d, k, days)).filter(v => v !== null && Number.isFinite(v));
            return { mean: mean(values), n: values.length };
          };
        const a = side('a'),
          b = side('b'),
          enough = a.n >= MIN_DAYS && b.n >= MIN_DAYS;
        return {
          key,
          label: m.label,
          a,
          b,
          enough,
          difference: enough ? a.mean - b.mean : null,
          notable: enough && Math.abs(a.mean - b.mean) >= m.threshold
        };
      });
      return {
        id: c.id,
        title: c.title,
        aLabel: c.a,
        bLabel: c.b,
        days: { a: groups.a.length, b: groups.b.length },
        rows
      };
    });
  }
  // The clearest differences, written as sentences.
  function highlights(results, limit = 3) {
    const items = [];
    for (const r of results)
      for (const row of r.rows)
        if (row.notable) {
          const m = METRICS[row.key];
          items.push({
            score: Math.abs(row.difference) / m.threshold,
            text: `${row.label}: ${m.format(row.a.mean)} on “${r.aLabel}” days vs ${m.format(row.b.mean)} on “${r.bLabel}” days (${row.a.n} vs ${row.b.n} days).`
          });
        }
    return items
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map(x => x.text);
  }
  function priorityMarkup(p) {
    if (!p.set)
      return '<section class="insights-priority"><h2>Most important task</h2><p class="empty">No most important task was set in this period.</p></section>';
    // A weekday is named only when it alone has the lowest rate.
    const top = p.reasons[0],
      counted = p.weekdays.filter(w => w.set >= MIN_DAYS),
      low = Math.min(...counted.map(w => w.done / w.set)),
      lowest = counted.filter(w => w.done / w.set === low),
      weakest = lowest.length === 1 ? lowest[0] : null;
    const bar = (label, n, cls = '') =>
      `<li class="${cls}"><span>${label}</span><span class="miss-bar"><i data-share="${Math.round((n / p.missed) * 100)}"></i></span><strong>${n}</strong></li>`;
    const reasons = p.missed
      ? `<ul class="miss-bars">${p.reasons.map(r => bar(`${r.icon} ${escape(r.label)}`, r.count)).join('')}${p.unexplained ? bar('No reason noted', p.unexplained, 'miss-unexplained') : ''}</ul>`
      : '<p class="empty">It got done every day in this period.</p>';
    const tip =
      top && top.count >= 2
        ? `<p class="miss-tip"><strong>Most often: ${top.icon} ${escape(top.label)}</strong> (${top.count} of ${p.missed} unfinished days). Try: ${escape(top.tip)}</p>`
        : '';
    const week = `<div class="miss-week-scroll"><table class="behavior-table insights-table miss-week"><caption>Done by weekday</caption><thead><tr>${p.weekdays.map(w => `<th scope="col">${w.label}</th>`).join('')}</tr></thead><tbody><tr>${p.weekdays.map(w => `<td class="${w === weakest && w.done < w.set ? 'is-weakest' : ''}">${w.set ? percent(w.done / w.set) + `<small>${w.done}/${w.set}</small>` : '—'}</td>`).join('')}</tr></tbody></table></div>`;
    const recent = p.recent.length
      ? `<h3>Recent notes</h3><ul class="miss-recent">${p.recent.map(r => `<li><button type="button" class="miss-date" data-open-date="${r.date}">${r.date}</button> <span class="miss-task">${escape(r.task)}</span>${r.reason ? ` · ${r.reason.icon} ${escape(r.reason.label)}` : ''}${r.note ? ` · “${escape(r.note)}”` : ''}</li>`).join('')}</ul>`
      : '';
    return `<section class="insights-priority"><h2>Most important task</h2><p class="subtle">Done on ${p.done} of ${p.set} days (${percent(p.done / p.set)}) · ${p.missed} unfinished. When it doesn’t get done, pick what got in the way under the task on the daily page.</p>${tip}${reasons}${week}${weakest && weakest.done < weakest.set ? `<p class="insights-note">Hardest weekday: ${weakest.label} (${weakest.done}/${weakest.set} done).</p>` : ''}${recent}</section>`;
  }
  function markup() {
    return (
      '<section id="insights" class="page"><div class="section"><p class="subtle">Each card compares days with and without one condition. Differences show association, not cause. A comparison needs at least ' +
      MIN_DAYS +
      ' days on each side; today is excluded until it is over.</p><form class="insights-filters"><label>Period<select name="period"><option value="all">All recorded days</option><option value="quarter">This quarter</option><option value="90">Last 90 days</option><option value="30">Last 30 days</option></select></label></form><div class="insights-results"></div></div></section>'
    );
  }
  function mount(container, days, { today, state, quarter }) {
    const form = container.querySelector('form'),
      out = container.querySelector('.insights-results');
    const back = n => {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    function draw() {
      state.period = form.elements.period.value;
      const range =
        state.period === 'quarter'
          ? { start: quarter[0], end: quarter[1] }
          : state.period === 'all'
            ? {}
            : { start: back(+state.period), end: today };
      const results = compute(days, { ...range, today }),
        notes = highlights(results),
        priority = priorityMarkup(priorityMisses(days, { ...range, today }));
      const cell = (row, side) =>
        row[side].n
          ? `${METRICS[row.key].format(row[side].mean)}<small>${row[side].n} ${row[side].n === 1 ? 'day' : 'days'}</small>`
          : '—';
      out.innerHTML = `<section class="insights-highlights"><h2>What stands out</h2>${notes.length ? `<ul>${notes.map(t => `<li>${escape(t)}</li>`).join('')}</ul>` : '<p class="empty">No clear differences yet. Keep filling in your check-ins; patterns appear after a few weeks.</p>'}</section>${priority}<div class="insights-grid">${results.map(r => `<section class="insights-card" data-insight="${r.id}"><h3>${escape(r.title)}</h3><p class="subtle">${r.days.a} “${escape(r.aLabel)}” · ${r.days.b} “${escape(r.bLabel)}” days</p><table class="behavior-table insights-table"><thead><tr><th scope="col">Measure</th><th scope="col">${escape(r.aLabel)}</th><th scope="col">${escape(r.bLabel)}</th></tr></thead><tbody>${r.rows.map(row => `<tr class="${row.notable ? 'is-notable' : ''}"><th scope="row">${escape(row.label)}</th><td>${cell(row, 'a')}</td><td>${cell(row, 'b')}</td></tr>`).join('')}</tbody></table>${r.rows.some(row => !row.enough) ? `<p class="insights-note">Rows with fewer than ${MIN_DAYS} days on a side are shown for reference only and never highlighted.</p>` : ''}</section>`).join('')}</div>`;
      // Set from script: the page's style-src policy blocks inline style attributes.
      out.querySelectorAll('.miss-bar i').forEach(i => (i.style.width = i.dataset.share + '%'));
    }
    form.elements.period.value = state.period || 'all';
    form.elements.period.onchange = draw;
    draw();
  }
  const api = {
    METRICS,
    COMPARISONS,
    MIN_DAYS,
    MISS_REASONS,
    workRate,
    weightChange,
    priorityMisses,
    compute,
    highlights,
    markup,
    mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyBookInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
