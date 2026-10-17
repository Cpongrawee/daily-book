/* Read-only mood and sleep analysis. No network requests or storage writes. */
(function (root) {
  'use strict';
  const validTime = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  function sleepMinutes(c) {
    if (!c || !validTime(c.bedtime) || !validTime(c.wakeTime)) return null;
    const bedDay = c.bedDay ?? 'previous';
    if (!['previous', 'today'].includes(bedDay)) return null;
    const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const duration = minutes(c.wakeTime) - minutes(c.bedtime) + (bedDay === 'previous' ? 1440 : 0);
    return duration >= 0 && duration <= 1440 ? duration : null;
  }
  const validMood = mood => Number.isFinite(mood) && mood >= -3 && mood <= 3;
  function nextDate(date, offset = 1) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function series(days, start, end) {
    const result = [];
    for (let date = start; date <= end; date = nextDate(date)) {
      const c = days[date]?.checkin || {};
      const minutes = sleepMinutes(c);
      result.push({
        date,
        sleep: minutes === null ? null : minutes / 60,
        mood: validMood(c.mood) ? c.mood : null,
        energy: validMood(c.energy) ? c.energy : null,
        bedtime: validTime(c.bedtime) ? c.bedtime : null,
        wakeTime: validTime(c.wakeTime) ? c.wakeTime : null,
        bedtimeDate: nextDate(date, c.bedDay === 'today' ? 0 : -1),
        invalidSleep: !!(c.bedtime || c.wakeTime) && minutes === null
      });
    }
    return result;
  }
  function pearson(values) {
    const pairs = values.filter(d => Number.isFinite(d.sleep) && Number.isFinite(d.mood));
    const n = pairs.length;
    if (n < 3) return { r: null, n, reason: 'Record at least 3 days with both sleep and mood.' };
    const mx = pairs.reduce((s, d) => s + d.sleep, 0) / n;
    const my = pairs.reduce((s, d) => s + d.mood, 0) / n;
    let xx = 0,
      yy = 0,
      xy = 0;
    for (const d of pairs) {
      const x = d.sleep - mx,
        y = d.mood - my;
      xx += x * x;
      yy += y * y;
      xy += x * y;
    }
    if (xx === 0 || yy === 0) return { r: null, n, reason: 'Correlation needs variation in both sleep and mood.' };
    return { r: Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))), n, reason: '' };
  }
  function summarize(values) {
    const moods = values.filter(d => Number.isFinite(d.mood));
    const sleeps = values.filter(d => Number.isFinite(d.sleep));
    const energies = values.filter(d => Number.isFinite(d.energy));
    return {
      meanMood: moods.length ? moods.reduce((s, d) => s + d.mood, 0) / moods.length : null,
      meanSleep: sleeps.length ? sleeps.reduce((s, d) => s + d.sleep, 0) / sleeps.length : null,
      meanEnergy: energies.length ? energies.reduce((s, d) => s + d.energy, 0) / energies.length : null,
      moodCount: moods.length,
      energyCount: energies.length,
      sleepCount: sleeps.length,
      correlation: pearson(values)
    };
  }
  const esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const signed = (n, digits = 0) =>
    n === null ? '—' : (n > 0 ? '+' : '') + (Object.is(n, -0) ? 0 : n).toFixed(digits);
  const pretty = date =>
    new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  const hours = n => (n === null ? 'Not recorded' : `${Number(n.toFixed(2))} hr`);
  const sleepDetail = d =>
    d.sleep === null
      ? d.invalidSleep
        ? 'Check the bedtime date and times in Daily check-in.'
        : 'Sleep not recorded.'
      : `Bedtime ${pretty(d.bedtimeDate)} at ${d.bedtime} → Wake time ${pretty(d.date)} at ${d.wakeTime}`;
  function markup() {
    return `<section id="mood-sleep" aria-label="Mood, energy and sleep overview">
      <form class="mood-filters"><label>Period<select name="preset" aria-label="Chart period"></select></label>
        <label>From<input name="start" type="date" required aria-label="Chart start date"></label><label>To<input name="end" type="date" required aria-label="Chart end date"></label><button type="submit" class="primary">Apply range</button></form>
      <p class="mood-range-error" role="alert" hidden></p><p class="mood-range-label subtle"></p>
      <div class="overview mood-metrics" aria-live="polite"></div>
      <section class="page mood-chart-card"><div class="page-top"><div><h2>Sleep, mood & energy over time</h2><small>Last night's sleep, paired with the mood and energy of your waking day.</small></div></div>
        <div class="mood-legend"><span><i class="mood-bar-key" aria-hidden="true"></i>Sleep · bars</span><span><i class="mood-line-key" aria-hidden="true"></i>Mood · line & points</span><span><i class="energy-line-key" aria-hidden="true"></i>Energy · dashed line & squares</span></div>
        <p class="mood-empty" hidden>No entries yet. Record your mood, energy, bedtime, and wake time in Daily check-in to start seeing patterns.</p>
        <div class="mood-plot" role="group" aria-label="Sleep, mood and energy chart"><svg class="mood-left-axis" aria-label="Sleep in hours"></svg><div class="mood-scroll" tabindex="0" aria-label="Scrollable dates"><svg class="mood-chart" role="img" aria-label="Sleep duration as gold bars and mood as a wine-red line, energy as a dashed green line"></svg></div><svg class="mood-right-axis" aria-label="Mood and energy scale from minus 3 to plus 3"></svg></div>
        <div class="mood-x-title">Date</div><p class="mood-click-hint">Click a day to open its daily page at the sleep entry. On a touch screen, tap once to view it and again to open it.</p><p class="mood-scroll-hint" hidden>Scroll horizontally to see every date. Both scales stay visible.</p>
        <div class="mood-selection"><label>View date<select class="mood-date-select" aria-label="Selected chart date"></select></label><div class="mood-day-detail" aria-live="polite"></div><button type="button" class="mood-open-day">Open daily page →</button></div>
        <p class="mood-explanation">Missing entries stay blank. Averages use available entries; correlation uses paired days only. Positive r means more sleep is associated with higher mood; negative r means the opposite. Correlation does not establish cause and effect.</p>
      </section>
      <details class="page mood-table-panel"><summary>View daily data</summary><div class="mood-table-scroll"><table class="mood-data-table"><thead><tr><th scope="col">Date</th><th scope="col">Sleep (hr)</th><th scope="col">Mood</th><th scope="col">Energy</th><th scope="col">Bedtime</th><th scope="col">Wake time</th></tr></thead><tbody></tbody></table></div></details>
    </section>`;
  }
  function mount(container, days, options) {
    const { state, max, onOpenDate } = options;
    // Allow earlier dates (e.g. imported history) back to the first recorded sleep, mood or energy value.
    const recorded = Object.keys(days)
      .filter(
        k =>
          /^\d{4}-\d{2}-\d{2}$/.test(k) &&
          k <= max &&
          (() => {
            const c = days[k]?.checkin || {};
            return validMood(c.mood) || validMood(c.energy) || sleepMinutes(c) !== null;
          })()
      )
      .sort();
    const min = recorded[0] && recorded[0] < options.min ? recorded[0] : options.min;
    const months = [];
    for (let m = min.slice(0, 7); m <= max.slice(0, 7); m = nextDate(m + '-28', 4).slice(0, 7)) months.push(m);
    const monthEnd = m => nextDate(nextDate(m + '-28', 4).slice(0, 7) + '-01', -1);
    const monthName = m =>
      new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const q = selector => container.querySelector(selector);
    const form = q('.mood-filters'),
      scroll = q('.mood-scroll');
    const chart = q('.mood-chart'),
      select = q('.mood-date-select');
    let rows = [],
      disposed = false;
    form.elements.preset.innerHTML = `<option value="all">All recorded data</option><option value="quarter">Entire Q${Math.floor((+options.min.slice(5, 7) - 1) / 3) + 1} ${options.min.slice(0, 4)}</option>${months.map(m => `<option value="${m}">${monthName(m)}</option>`).join('')}<option value="custom">Custom range</option>`;
    if (state.preset === 'all') {
      state.start = min;
      state.end = max;
    }
    for (const input of [form.elements.start, form.elements.end]) {
      input.min = min;
      input.max = max;
    }
    const syncForm = () => {
      form.elements.preset.value = state.preset;
      form.elements.start.value = state.start;
      form.elements.end.value = state.end;
    };
    function draw() {
      if (disposed) return;
      const plotHeight = 264,
        top = 34,
        bottom = top + plotHeight,
        height = 356;
      const width = window.matchMedia('print').matches
          ? Math.max(200, scroll.clientWidth)
          : Math.max(scroll.clientWidth, rows.length * 24),
        step = width / rows.length;
      const yMax = Math.max(12, Math.ceil(Math.max(0, ...rows.map(d => d.sleep ?? 0)) / 2) * 2);
      const ySleep = n => bottom - (n / yMax) * plotHeight;
      const yMood = n => bottom - ((n + 3) / 6) * plotHeight;
      const x = i => step * (i + 0.5);
      for (const axis of [q('.mood-left-axis'), q('.mood-right-axis')])
        axis.setAttribute('viewBox', `0 0 62 ${height}`);
      let left = `<text x="56" y="17" text-anchor="end">Sleep (hr)</text>`,
        right = `<text x="6" y="11">Mood</text><text x="6" y="23" class="mood-axis-sub">/ Energy</text>`;
      for (let n = 0; n <= yMax; n += 2) left += `<text x="56" y="${ySleep(n) + 4}" text-anchor="end">${n}</text>`;
      for (let n = -3; n <= 3; n++) right += `<text x="6" y="${yMood(n) + 4}">${signed(n)}</text>`;
      q('.mood-left-axis').innerHTML = left;
      q('.mood-right-axis').innerHTML = right;
      chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
      chart.style.width = `${width}px`;
      let content = `<title>Sleep, mood and energy from ${pretty(state.start)} to ${pretty(state.end)}</title><desc>Gold bars use the left sleep-hours axis; the wine-red mood line and dashed green energy line share the right axis from minus 3 to plus 3. Missing entries break the lines.</desc>`;
      for (let n = 0; n <= yMax; n += 2)
        content += `<line x1="0" x2="${width}" y1="${ySleep(n)}" y2="${ySleep(n)}" class="mood-grid"/>`;
      content += `<line x1="0" x2="${width}" y1="${yMood(0)}" y2="${yMood(0)}" class="mood-zero"/><rect x="0" y="${top}" width="${width}" height="${plotHeight}" class="mood-frame"/>`;
      const selectedIndex = rows.findIndex(d => d.date === state.selected);
      content += `<rect x="${step * selectedIndex}" y="${top}" width="${step}" height="${plotHeight}" class="mood-selected-column"/>`;
      rows.forEach((d, i) => {
        if (d.sleep !== null)
          content += `<rect x="${x(i) - step * 0.32}" y="${ySleep(d.sleep)}" width="${step * 0.64}" height="${bottom - ySleep(d.sleep)}" class="mood-bar"/>`;
      });
      let line = '',
        open = false;
      rows.forEach((d, i) => {
        if (d.mood === null) {
          open = false;
          return;
        }
        line += `${open ? 'L' : 'M'}${x(i)},${yMood(d.mood)} `;
        open = true;
      });
      content += `<path d="${line}" class="mood-trend"/>`;
      let energyLine = '';
      open = false;
      rows.forEach((d, i) => {
        if (d.energy === null) {
          open = false;
          return;
        }
        energyLine += `${open ? 'L' : 'M'}${x(i)},${yMood(d.energy)} `;
        open = true;
      });
      content += `<path d="${energyLine}" class="energy-trend"/>`;
      rows.forEach((d, i) => {
        if (d.energy !== null) {
          const r = d.date === state.selected ? 4.5 : 3.2;
          content += `<rect x="${x(i) - r}" y="${yMood(d.energy) - r}" width="${r * 2}" height="${r * 2}" class="energy-point"/>`;
        }
      });
      rows.forEach((d, i) => {
        if (d.mood !== null)
          content += `<circle cx="${x(i)}" cy="${yMood(d.mood)}" r="${d.date === state.selected ? 5 : 3.5}" class="mood-point"/>`;
      });
      const every = Math.max(1, Math.ceil(60 / step));
      rows.forEach((d, i) => {
        if (i % every === 0 && i < rows.length - 1 - Math.floor(45 / step))
          content += `<text x="${x(i)}" y="${bottom + 25}" text-anchor="${i === 0 ? 'start' : 'middle'}">${pretty(d.date).replace(/, \d{4}$/, '')}</text>`;
      });
      content += `<text x="${width - 4}" y="${bottom + 25}" text-anchor="end">${pretty(state.end).replace(/, \d{4}$/, '')}</text>`;
      rows.forEach((d, i) => {
        content += `<rect x="${i * step}" y="${top - 6}" width="${step}" height="${plotHeight + 12}" class="mood-hit" data-chart-date="${d.date}"><title>${pretty(d.date)} · Sleep ${hours(d.sleep)} · Mood ${d.mood === null ? 'Not recorded' : signed(d.mood, 1)} · Energy ${d.energy === null ? 'Not recorded' : signed(d.energy, 1)}</title></rect>`;
      });
      chart.innerHTML = content;
      q('.mood-scroll-hint').hidden = width <= scroll.clientWidth + 1 || window.matchMedia('print').matches;
      renderDetail();
    }
    function renderDetail() {
      const d = rows.find(d => d.date === state.selected);
      select.value = state.selected;
      q('.mood-day-detail').innerHTML =
        `<strong>${pretty(d.date)}</strong><div>Sleep <b>${hours(d.sleep)}</b> · Mood <b>${d.mood === null ? 'Not recorded' : signed(d.mood, 1)}</b> · Energy <b>${d.energy === null ? 'Not recorded' : signed(d.energy, 1)}</b></div><small>${sleepDetail(d)}</small>`;
    }
    function refresh() {
      rows = series(days, state.start, state.end);
      if (!rows.some(d => d.date === state.selected))
        state.selected = rows.find(d => d.sleep !== null || d.mood !== null || d.energy !== null)?.date || state.start;
      const s = summarize(rows),
        c = s.correlation;
      q('.mood-range-label').textContent = `${pretty(state.start)} – ${pretty(state.end)}`;
      q('.mood-metrics').innerHTML =
        `<div class="stat"><small>Pearson correlation</small><strong>${signed(c.r, 3)}</strong><small>${c.n} paired days${c.reason ? `<br>${c.reason}` : ''}</small></div><div class="stat"><small>Average mood</small><strong>${signed(s.meanMood, 2)}</strong><small>${s.moodCount} recorded days · −3 to +3</small></div><div class="stat"><small>Average energy</small><strong>${signed(s.meanEnergy, 2)}</strong><small>${s.energyCount} recorded days · −3 to +3</small></div><div class="stat"><small>Average sleep</small><strong>${s.meanSleep === null ? '—' : s.meanSleep.toFixed(2)} <span class="mood-unit">hr</span></strong><small>${s.sleepCount} recorded nights</small></div>`;
      q('.mood-empty').hidden = s.moodCount > 0 || s.energyCount > 0 || s.sleepCount > 0;
      select.innerHTML = rows.map(d => `<option value="${d.date}">${pretty(d.date)}</option>`).join('');
      q('.mood-data-table tbody').innerHTML = rows
        .map(
          d =>
            `<tr><th scope="row">${pretty(d.date)}</th><td>${d.sleep === null ? '—' : d.sleep.toFixed(2)}</td><td>${signed(d.mood, 1)}</td><td>${signed(d.energy, 1)}</td><td>${d.bedtime ? `${pretty(d.bedtimeDate)} ${esc(d.bedtime)}` : '—'}</td><td>${d.wakeTime ? `${pretty(d.date)} ${esc(d.wakeTime)}` : '—'}</td></tr>`
        )
        .join('');
      syncForm();
      draw();
      scroll.scrollLeft = 0;
    }
    function apply(start, end, preset) {
      const goodDate = d =>
        /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        !isNaN(Date.parse(d)) &&
        new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
      if (!goodDate(start) || !goodDate(end) || start < min || end > max || start > end) {
        q('.mood-range-error').textContent =
          `Choose a valid date range from ${pretty(min)} to ${pretty(max)}, with the start on or before the end.`;
        q('.mood-range-error').hidden = false;
        return;
      }
      q('.mood-range-error').hidden = true;
      Object.assign(state, { start, end, preset });
      refresh();
    }
    form.addEventListener('submit', e => {
      e.preventDefault();
      apply(form.elements.start.value, form.elements.end.value, form.elements.preset.value);
    });
    form.elements.preset.addEventListener('change', () => {
      const preset = form.elements.preset.value;
      if (preset === 'custom') return;
      if (preset === 'all') apply(min, max, preset);
      else if (preset === 'quarter') apply(options.min, max, preset);
      else apply(preset + '-01', monthEnd(preset), preset);
    });
    for (const input of [form.elements.start, form.elements.end])
      input.addEventListener('input', () => (form.elements.preset.value = 'custom'));
    function selectDate(date, reveal) {
      state.selected = date;
      draw();
      if (reveal) {
        const i = rows.findIndex(d => d.date === date),
          step = chart.getBoundingClientRect().width / rows.length;
        scroll.scrollLeft = Math.max(0, (i + 0.5) * step - scroll.clientWidth / 2);
      }
    }
    select.addEventListener('change', () => selectDate(select.value, true));
    // A mouse click opens that day (hovering already selects it); a tap selects first, and a second tap opens.
    chart.addEventListener('click', e => {
      const hit = e.target.closest('[data-chart-date]');
      if (!hit) return;
      if (e.pointerType === 'mouse' || hit.dataset.chartDate === state.selected) onOpenDate(hit.dataset.chartDate);
      else selectDate(hit.dataset.chartDate, false);
    });
    chart.addEventListener('pointermove', e => {
      const hit = e.target.closest('[data-chart-date]');
      if (e.pointerType === 'mouse' && hit && hit.dataset.chartDate !== state.selected)
        selectDate(hit.dataset.chartDate, false);
    });
    q('.mood-open-day').addEventListener('click', () => onOpenDate(state.selected));
    const observer = new ResizeObserver(draw);
    observer.observe(scroll);
    const tablePanel = q('.mood-table-panel');
    let tableWasOpen = false;
    const beforePrint = () => {
      tableWasOpen = tablePanel.open;
      tablePanel.open = true;
      draw();
    };
    const afterPrint = () => {
      tablePanel.open = tableWasOpen;
      draw();
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    refresh();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }
  const api = { sleepMinutes, validMood, series, pearson, summarize, markup, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyBookMoodSleep = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
