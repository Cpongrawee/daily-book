/* Weekly and monthly review: read-only summary of a period, as a page section and as Markdown. */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const MS = node ? require('./mood-sleep.js') : root.DailyBookMoodSleep;
  const BH = node ? require('./behavior.js') : root.DailyBookBehavior;
  const esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const label = (date, opts) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  const shortDay = date => label(date, { weekday: 'short', month: 'short', day: 'numeric' });
  const signed = n => (n === null ? '—' : (n > 0 ? '+' : '') + (Object.is(n, -0) ? 0 : n).toFixed(2));
  const hours = n => (n === null ? '—' : n.toFixed(2) + ' hr');
  const ofDays = (n, total) => `${n} of ${total}`;
  const count = n => `${n} day${n === 1 ? '' : 's'}`;
  const text = s => (typeof s === 'string' ? s.trim() : '');

  // Everything is measured over elapsed days only: start through min(end, today).
  function compute(book, start, end, today) {
    const last = end < today ? end : today;
    const elapsed = start <= last ? MS.series(book.days, start, last) : [];
    const ms = MS.summarize(elapsed);
    const days = elapsed.map(e => [e.date, book.days[e.date]]).filter(([, d]) => d);
    const tasks = days.flatMap(([, d]) => (d.tasks || []).filter(t => text(t.text)));
    const priorities = days.filter(([, d]) => text(d.priority));
    const behavior = BH.summarize(book.days, start, end, today);
    return {
      start,
      end,
      today,
      elapsed: elapsed.length,
      total: Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1,
      includesToday: start <= today && today <= end,
      mood: { mean: ms.meanMood, n: ms.moodCount },
      energy: { mean: ms.meanEnergy, n: ms.energyCount },
      sleep: {
        mean: ms.meanSleep,
        n: ms.sleepCount,
        sevenPlus: elapsed.filter(e => e.sleep !== null && e.sleep >= 7).length
      },
      proud: days.filter(([, d]) => d.proud).map(([date, d]) => ({ date, note: text(d.proudNote) })),
      fixes: days
        .filter(([, d]) => text(d.reflections?.fix))
        .map(([date, d]) => ({ date, text: text(d.reflections.fix) })),
      reviewed: days.filter(([, d]) => d.closed).length,
      tasks: { done: tasks.filter(t => t.done).length, total: tasks.length },
      priorities: { done: priorities.filter(([, d]) => d.priorityDone).length, set: priorities.length },
      measures: behavior.rows.map(r => ({ key: r.key, name: r.name, rate: r.rate, best: r.best, current: r.current }))
    };
  }

  const noun = kind => (kind === 'week' ? 'week' : 'month');
  const rate = r => (r === null ? '—' : r + '%');
  function glance(s) {
    return [
      ['Average mood', signed(s.mood.mean), `${s.mood.n} day${s.mood.n === 1 ? '' : 's'} recorded · −3 to +3`],
      ['Average energy', signed(s.energy.mean), `${s.energy.n} day${s.energy.n === 1 ? '' : 's'} recorded · −3 to +3`],
      [
        'Average sleep',
        hours(s.sleep.mean),
        `${s.sleep.n} night${s.sleep.n === 1 ? '' : 's'} · ${s.sleep.sevenPlus} with 7+ hr`
      ],
      ['Proud days', ofDays(s.proud.length, s.elapsed), 'days so far'],
      ['Bedtime reviews', ofDays(s.reviewed, s.elapsed), 'days so far'],
      ['Most important task', ofDays(s.priorities.done, s.priorities.set), 'days it was set'],
      ['Tasks done', ofDays(s.tasks.done, s.tasks.total), 'individual tasks']
    ];
  }

  function markup(s, kind) {
    const list = (items, render) =>
      items.length ? items.map(i => `<li>${render(i)}</li>`).join('') : '<li class="subtle">Nothing recorded yet.</li>';
    const day = date => `<button class="review-day" data-open-date="${date}">${esc(shortDay(date))}</button>`;
    return `<section class="page weekly-dashboard period-dashboard"><div class="page-top"><div><h2>Your ${noun(kind)}, reflected</h2><small>${
      s.elapsed
        ? `${s.elapsed} of ${s.total} days so far${s.includesToday ? ', including today' : ''}. Averages use the days you recorded.`
        : `This ${noun(kind)} hasn’t started yet.`
    }</small></div><button type="button" id="period-summary">↓ ${kind === 'week' ? 'Weekly' : 'Monthly'} summary</button></div><div class="section"><div class="overview review-glance">${glance(
      s
    )
      .map(
        ([name, value, note]) =>
          `<div class="stat"><strong>${esc(value)}</strong><small>${esc(name)}</small><small class="review-note">${esc(note)}</small></div>`
      )
      .join(
        ''
      )}</div><h3>Habits and streaks</h3><div class="behavior-scroll" tabindex="0" role="region" aria-label="Habits and streaks, scroll horizontally"><table class="behavior-table review-streaks"><thead><tr><th scope="col">Measure</th><th scope="col">Success rate</th><th scope="col">Best streak this ${noun(
      kind
    )}</th><th scope="col">Current streak</th></tr></thead><tbody>${s.measures
      .map(
        m =>
          `<tr data-metric="${m.key}"><th scope="row">${esc(m.name)}</th><td>${rate(m.rate)}</td><td>${count(m.best)}</td><td>${count(m.current)}</td></tr>`
      )
      .join(
        ''
      )}</tbody></table></div><p class="summary-line">Success rate counts known outcomes only. Current streak always counts back from today (or yesterday, if today isn’t finished), whichever ${noun(
      kind
    )} you are viewing.</p><div class="weekly-notes"><div><h3>Moments of pride</h3><ul>${list(s.proud, p => `${day(p.date)} — ${esc(p.note || 'Proud checkbox marked.')}`)}</ul><h3>Fixes to follow through on</h3><ul>${list(
      s.fixes,
      f => `${day(f.date)} — ${esc(f.text)}`
    )}</ul></div></div><p class="summary-line">Unchecked proud days are not counted as bad days.</p></div></section>`;
  }

  // goals: [{ title, done }], reflection: the period's reflection text, title: heading such as "Oct 12 – Oct 18, 2026".
  function markdown(s, kind, { title, goals = [], reflection = '' } = {}) {
    const name = kind === 'week' ? 'Weekly' : 'Monthly';
    const out = [
      `# ${name} review — ${title}`,
      `\nPeriod: ${s.start} → ${s.end} (${s.elapsed} of ${s.total} days so far)`,
      '\n## At a glance',
      ...glance(s).map(([n, value, note]) => `- ${n}: ${value} (${note})`),
      '\n## Habits and streaks',
      `| Measure | Success rate | Best streak this ${noun(kind)} | Current streak |`,
      '| --- | --- | --- | --- |',
      ...s.measures.map(m => `| ${m.name} | ${rate(m.rate)} | ${count(m.best)} | ${count(m.current)} |`),
      '\n## Goals',
      ...(goals.length ? goals.map(g => `- [${g.done ? 'x' : ' '}] ${g.title}`) : ['No goals set.']),
      '\n## Moments of pride',
      ...(s.proud.length
        ? s.proud.map(p => `- ${shortDay(p.date)} — ${p.note || 'Proud checkbox marked.'}`)
        : ['Nothing recorded yet.']),
      '\n## Fixes to follow through on',
      ...(s.fixes.length ? s.fixes.map(f => `- ${shortDay(f.date)} — ${f.text}`) : ['Nothing recorded yet.']),
      `\n## ${name} reflection`,
      text(reflection) || 'Not written yet.'
    ];
    return out.join('\n') + '\n';
  }

  const api = { compute, markup, markdown };
  if (node) module.exports = api;
  else root.DailyBookPeriodReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
