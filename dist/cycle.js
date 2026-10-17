/* Read-only period, sex-activity and shabu-buffet overview. No network requests or storage writes. */
(function (root) {
  'use strict';
  const FLOWS = { spotting: 'Spotting', light: 'Light', medium: 'Medium', heavy: 'Heavy' };
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const toTime = date => Date.parse(date + 'T12:00:00Z');
  const between = (a, b) => Math.round((toTime(b) - toTime(a)) / 86400000);
  function nextDate(date, offset = 1) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  const keys = (days, today) =>
    Object.keys(days)
      .filter(k => DAY.test(k) && k <= today)
      .sort();
  // Period days within two days of each other belong to the same period (one missed log doesn't split it).
  function periods(days, today) {
    const result = [];
    for (const date of keys(days, today)) {
      if (days[date]?.checkin?.period !== true) continue;
      const last = result.at(-1);
      if (last && between(last.end, date) <= 2) last.end = date;
      else result.push({ start: date, end: date });
    }
    for (const p of result) p.length = between(p.start, p.end) + 1;
    return result;
  }
  const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  // Cycle = days from one period start to the next. Gaps outside 15–60 days are treated as missed logging.
  function stats(days, today) {
    const list = periods(days, today);
    const cycles = list
      .slice(1)
      .map((p, i) => between(list[i].start, p.start))
      .filter(n => n >= 15 && n <= 60);
    const last = list.at(-1) || null;
    const ongoing = !!last && between(last.end, today) <= 1;
    // Exclude a period still in progress from the typical length.
    const finished = ongoing ? list.slice(0, -1) : list;
    const avgCycle = cycles.length ? Math.round(mean(cycles)) : null;
    return {
      periods: list,
      cycles,
      lastStart: last?.start || null,
      ongoing,
      avgLength: finished.length ? Math.round(mean(finished.map(p => p.length))) : null,
      avgCycle,
      nextStart: avgCycle && last ? nextDate(last.start, avgCycle) : null
    };
  }
  // Days a check-in box was ticked, per Monday-start week, oldest first, ending with the week containing `today`.
  function weeklyCount(days, today, key, weeks = 12) {
    const dow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const firstMonday = nextDate(today, -dow - 7 * (weeks - 1));
    return Array.from({ length: weeks }, (_, i) => {
      const start = nextDate(firstMonday, i * 7);
      let count = 0;
      for (let j = 0; j < 7; j++) if (days[nextDate(start, j)]?.checkin?.[key] === true) count++;
      return { start, count };
    });
  }
  function monthlyCount(days, month, key) {
    return Object.keys(days).filter(k => DAY.test(k) && k.startsWith(month) && days[k]?.checkin?.[key] === true).length;
  }
  const weeklySex = (days, today, weeks) => weeklyCount(days, today, 'sex', weeks);
  const monthlySex = (days, month) => monthlyCount(days, month, 'sex');
  const weeklyShabu = (days, today, weeks) => weeklyCount(days, today, 'shabu', weeks);
  const monthlyShabu = (days, month) => monthlyCount(days, month, 'shabu');
  const monthsBack = (today, n) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(today.slice(0, 7) + '-15T12:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - (n - 1 - i));
      return d.toISOString().slice(0, 7);
    });
  const pretty = (date, opts = { month: 'short', day: 'numeric', year: 'numeric' }) =>
    new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  const monthName = m => pretty(m + '-15', { month: 'long', year: 'numeric' });
  function monthGrid(days, month, today) {
    const first = month + '-01',
      lead = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7;
    let cells = '<span class="cycle-blank"></span>'.repeat(lead);
    for (let date = first; date.startsWith(month); date = nextDate(date)) {
      const c = days[date]?.checkin || {},
        flow = c.period === true ? (FLOWS[c.periodFlow] ? c.periodFlow : 'unknown') : '',
        sex = c.sex === true,
        shabu = c.shabu === true,
        future = date > today;
      const label =
        pretty(date) +
        (flow ? ' · Period' + (FLOWS[flow] ? ': ' + FLOWS[flow] : '') : '') +
        (sex ? ' · Had sex' : '') +
        (shabu ? ' · Shabu buffet' : '');
      cells += future
        ? `<span class="cycle-day is-future" aria-hidden="true">${+date.slice(8)}</span>`
        : `<button type="button" class="cycle-day${flow ? ' flow-' + flow : ''}${date === today ? ' is-today' : ''}" data-cycle-date="${date}" title="${label}" aria-label="${label}">${+date.slice(8)}${sex ? '<i class="cycle-sex-dot" aria-hidden="true"></i>' : ''}${shabu ? '<i class="cycle-shabu-dot" aria-hidden="true"></i>' : ''}</button>`;
    }
    return `<div class="cycle-month"><h3>${monthName(month)}</h3><div class="cycle-weekdays" aria-hidden="true"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="cycle-grid">${cells}</div></div>`;
  }
  function markup(days, today) {
    const s = stats(days, today);
    const tile = (label, value, note) =>
      `<div class="stat"><small>${label}</small><strong>${value}</strong><small>${note}</small></div>`;
    const daysText = n => (n === null ? '—' : n + (n === 1 ? ' day' : ' days'));
    const enough = s.cycles.length > 0;
    const months = monthsBack(today, 3);
    // SVG attributes, not inline styles: the page's Content-Security-Policy blocks style="" attributes.
    const chart = (weeks, cls, label) => {
      const maxWeek = Math.max(1, ...weeks.map(w => w.count));
      const bars = weeks
        .map((w, i) => {
          const h = (w.count / maxWeek) * 90,
            x = i * 30;
          return `<g><title>Week of ${pretty(w.start)}: ${w.count}</title><rect x="${x + 5}" y="${110 - h}" width="20" height="${h}" class="${cls}"/>${w.count ? `<text x="${x + 15}" y="${104 - h}" text-anchor="middle">${w.count}</text>` : ''}<text x="${x + 15}" y="128" text-anchor="middle" class="cycle-bar-date">${pretty(w.start, { month: 'numeric', day: 'numeric' })}</text></g>`;
        })
        .join('');
      return `<svg class="cycle-bars" viewBox="0 0 360 134" role="img" aria-label="${label}, last 12 weeks: ${weeks.map(w => w.count).join(', ')}"><line x1="0" x2="360" y1="110" y2="110" class="mood-grid"/>${bars}</svg>`;
    };
    const monthTiles = count =>
      `<div class="overview cycle-stats cycle-stats-months">${months
        .slice()
        .reverse()
        .map(m => tile(monthName(m), count(days, m), 'days'))
        .join('')}</div>`;
    return `<section id="cycle-overview" class="page cycle-overview" aria-label="Cycle, sex activity and shabu buffet overview">
      <div class="page-top"><div><h2>Cycle</h2><small>From the Body &amp; cycle section of Daily check-in.</small></div></div>
      <div class="overview cycle-stats">
        ${tile('Last period started', s.lastStart ? pretty(s.lastStart) : '—', s.ongoing ? 'In progress' : s.lastStart ? between(s.lastStart, today) + ' days ago' : 'No period logged yet')}
        ${tile('Typical period length', daysText(s.avgLength), s.avgLength === null ? 'Not enough data yet' : 'Average of ' + (s.ongoing ? s.periods.length - 1 : s.periods.length) + ' logged')}
        ${tile('Average cycle', enough ? daysText(s.avgCycle) : '—', enough ? 'Start to start · ' + s.cycles.length + (s.cycles.length === 1 ? ' cycle' : ' cycles') : 'Not enough data yet')}
        ${tile('Estimated next start', enough ? pretty(s.nextStart) : '—', enough ? 'Rough estimate only' : 'Needs two logged periods')}
      </div>
      <div class="cycle-legend" aria-hidden="true"><span><i class="flow-spotting"></i>Spotting</span><span><i class="flow-light"></i>Light</span><span><i class="flow-medium"></i>Medium</span><span><i class="flow-heavy"></i>Heavy</span><span><i class="flow-unknown"></i>Flow not set</span><span><i class="cycle-sex-dot"></i>Had sex</span><span><i class="cycle-shabu-dot"></i>Shabu buffet</span></div>
      <div class="cycle-months">${months.map(m => monthGrid(days, m, today)).join('')}</div>
      <p class="subtle cycle-hint">Select a day to open its daily page.</p>
      <h3>Sex activity</h3>
      ${monthTiles(monthlySex)}
      ${chart(weeklySex(days, today), 'cycle-bar', 'Days with sex per week')}
      <p class="mood-explanation">Days with sex per week, last 12 weeks (weeks start Monday). The estimated next start adds your average cycle to your last start date. It is a rough guide from your own logs, not birth control or fertility advice.</p>
      <h3 class="cycle-shabu-heading">Shabu buffet</h3>
      ${monthTiles(monthlyShabu)}
      ${chart(weeklyShabu(days, today), 'cycle-bar-shabu', 'Shabu buffet days per week')}
      <p class="mood-explanation">Shabu buffet days per week, last 12 weeks (weeks start Monday). Insights compares your weight the next morning after shabu days with other days.</p>
    </section>`;
  }
  const api = {
    periods,
    stats,
    weeklyCount,
    monthlyCount,
    weeklySex,
    monthlySex,
    weeklyShabu,
    monthlyShabu,
    markup
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyBookCycle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
