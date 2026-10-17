/* Read-only weight and body-fat analysis. No network requests or storage writes. */
(function (root) {
  'use strict';
  const toNumber = v => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const validWeight = v => {
    const n = toNumber(v);
    return Number.isFinite(n) && n >= 20 && n <= 400;
  };
  const validFat = v => {
    const n = toNumber(v);
    return Number.isFinite(n) && n >= 2 && n <= 75;
  };
  function nextDate(date, offset = 1) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function series(days, start, end) {
    const result = [];
    for (let date = start; date <= end; date = nextDate(date)) {
      const c = days[date]?.checkin || {};
      const weight = validWeight(c.weight) ? Number(c.weight) : null;
      const bodyFat = validFat(c.bodyFat) ? Number(c.bodyFat) : null;
      result.push({
        date,
        weight,
        bodyFat,
        lean: weight !== null && bodyFat !== null ? weight * (1 - bodyFat / 100) : null
      });
    }
    return result;
  }
  function summarize(values) {
    const pick = key => values.filter(d => d[key] !== null);
    const trend = key => {
      const v = pick(key);
      return {
        count: v.length,
        first: v[0]?.[key] ?? null,
        latest: v.at(-1)?.[key] ?? null,
        change: v.length >= 2 ? v.at(-1)[key] - v[0][key] : null,
        latestDate: v.at(-1)?.date ?? null
      };
    };
    return { weight: trend('weight'), bodyFat: trend('bodyFat'), lean: trend('lean') };
  }
  // Rounded axis bounds covering the data with some headroom, split into `ticks` equal steps.
  function axisRange(vals, fallbackMin, fallbackMax, ticks = 5) {
    let lo = vals.length ? Math.min(...vals) : fallbackMin,
      hi = vals.length ? Math.max(...vals) : fallbackMax;
    if (hi - lo < 2) {
      const mid = (hi + lo) / 2;
      lo = mid - 1;
      hi = mid + 1;
    }
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
    const raw = (hi - lo) / ticks,
      mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
    lo = Math.floor(lo / step) * step;
    hi = lo + step * ticks;
    while (hi < Math.max(...vals, lo)) hi += step;
    return { lo, hi, step };
  }
  const esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const fmt = (n, digits = 1) => (n === null ? '—' : (Object.is(n, -0) ? 0 : n).toFixed(digits));
  const signed = (n, digits = 1) => (n === null ? '—' : (n > 0 ? '+' : '') + fmt(Math.abs(n) < 1e-9 ? 0 : n, digits));
  const pretty = date =>
    new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  const kg = n => (n === null ? 'Not recorded' : `${fmt(n)} kg`);
  const pct = n => (n === null ? 'Not recorded' : `${fmt(n)} %`);
  function markup() {
    return `<section id="body-metrics" aria-label="Weight and body fat overview">
      <form class="mood-filters"><label>Period<select name="preset" aria-label="Chart period"></select></label>
        <label>From<input name="start" type="date" required aria-label="Chart start date"></label><label>To<input name="end" type="date" required aria-label="Chart end date"></label><button type="submit" class="primary">Apply range</button></form>
      <p class="mood-range-error" role="alert" hidden></p><p class="mood-range-label subtle"></p>
      <div class="overview mood-metrics body-metrics-stats" aria-live="polite"></div>
      <section class="page mood-chart-card"><div class="page-top"><div><h2>Weight & body fat over time</h2><small>Values from the Body section of Daily check-in.</small></div></div>
        <div class="mood-legend"><span><i class="mood-line-key" aria-hidden="true"></i>Weight (kg) · left axis</span><span><i class="body-fat-key" aria-hidden="true"></i>Body fat (%) · right axis</span></div>
        <p class="mood-empty" hidden>No entries yet. Record your weight and body fat in Daily check-in to start seeing trends.</p>
        <div class="mood-plot" role="group" aria-label="Weight and body fat chart"><svg class="mood-left-axis" aria-label="Weight in kilograms"></svg><div class="mood-scroll" tabindex="0" aria-label="Scrollable dates"><svg class="mood-chart" role="img" aria-label="Weight as a wine-red line and body fat as a gold dashed line"></svg></div><svg class="mood-right-axis" aria-label="Body fat percentage"></svg></div>
        <div class="mood-x-title">Date</div><p class="mood-click-hint">Click a day to open its daily page at the weight entry. On a touch screen, tap once to view it and again to open it.</p><p class="mood-scroll-hint" hidden>Scroll horizontally to see every date. Both scales stay visible.</p>
        <div class="mood-selection"><label>View date<select class="mood-date-select" aria-label="Selected chart date"></select></label><div class="mood-day-detail" aria-live="polite"></div><button type="button" class="mood-open-day">Open daily page →</button></div>
        <p class="mood-explanation">Missing entries stay blank and break the lines. Change compares the first and latest recorded values in the selected range. Lean mass = weight × (1 − body fat %).</p>
      </section>
      <details class="page mood-table-panel"><summary>View daily data</summary><div class="mood-table-scroll"><table class="mood-data-table"><thead><tr><th scope="col">Date</th><th scope="col">Weight (kg)</th><th scope="col">Body fat (%)</th><th scope="col">Lean mass (kg)</th></tr></thead><tbody></tbody></table></div></details>
    </section>`;
  }
  function mount(container, days, options) {
    const { state, max, onOpenDate } = options;
    // Allow earlier dates (e.g. imported history) back to the first recorded body value.
    const recorded = Object.keys(days)
      .filter(
        k =>
          /^\d{4}-\d{2}-\d{2}$/.test(k) &&
          k <= max &&
          (validWeight(days[k]?.checkin?.weight) || validFat(days[k]?.checkin?.bodyFat))
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
      state.start = recorded[0] || options.min;
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
    function linePath(key, x, y) {
      let d = '',
        open = false;
      rows.forEach((r, i) => {
        if (r[key] === null) {
          open = false;
          return;
        }
        d += `${open ? 'L' : 'M'}${x(i)},${y(r[key])} `;
        open = true;
      });
      return d;
    }
    function draw() {
      if (disposed) return;
      const plotHeight = 264,
        top = 34,
        bottom = top + plotHeight,
        height = 356,
        ticks = 5;
      const width = window.matchMedia('print').matches
          ? Math.max(200, scroll.clientWidth)
          : Math.max(scroll.clientWidth, rows.length * 24),
        step = width / rows.length;
      const w = axisRange(
        rows.map(d => d.weight).filter(v => v !== null),
        60,
        80,
        ticks
      );
      const f = axisRange(
        rows.map(d => d.bodyFat).filter(v => v !== null),
        15,
        25,
        ticks
      );
      const yW = n => bottom - ((n - w.lo) / (w.hi - w.lo)) * plotHeight;
      const yF = n => bottom - ((n - f.lo) / (f.hi - f.lo)) * plotHeight;
      const x = i => step * (i + 0.5);
      const digits = s => (s < 1 ? 1 : 0);
      for (const axis of [q('.mood-left-axis'), q('.mood-right-axis')])
        axis.setAttribute('viewBox', `0 0 62 ${height}`);
      let left = `<text x="56" y="17" text-anchor="end">Weight (kg)</text>`,
        right = `<text x="6" y="17">Fat (%)</text>`;
      for (let i = 0; i <= ticks; i++) {
        const y = bottom - (i / ticks) * plotHeight + 4;
        left += `<text x="56" y="${y}" text-anchor="end">${(w.lo + (i * (w.hi - w.lo)) / ticks).toFixed(digits(w.step))}</text>`;
        right += `<text x="6" y="${y}">${(f.lo + (i * (f.hi - f.lo)) / ticks).toFixed(digits(f.step))}</text>`;
      }
      q('.mood-left-axis').innerHTML = left;
      q('.mood-right-axis').innerHTML = right;
      chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
      chart.style.width = `${width}px`;
      let content = `<title>Weight and body fat from ${pretty(state.start)} to ${pretty(state.end)}</title><desc>The wine-red line uses the left weight axis in kilograms; the gold dashed line uses the right body-fat axis in percent. Missing entries break the lines.</desc>`;
      for (let i = 0; i <= ticks; i++) {
        const y = bottom - (i / ticks) * plotHeight;
        content += `<line x1="0" x2="${width}" y1="${y}" y2="${y}" class="mood-grid"/>`;
      }
      content += `<rect x="0" y="${top}" width="${width}" height="${plotHeight}" class="mood-frame"/>`;
      const selectedIndex = rows.findIndex(d => d.date === state.selected);
      content += `<rect x="${step * selectedIndex}" y="${top}" width="${step}" height="${plotHeight}" class="mood-selected-column"/>`;
      content += `<path d="${linePath('bodyFat', x, yF)}" class="body-fat-trend"/><path d="${linePath('weight', x, yW)}" class="mood-trend"/>`;
      rows.forEach((d, i) => {
        const r = d.date === state.selected ? 5 : 3.5;
        if (d.bodyFat !== null)
          content += `<rect x="${x(i) - r}" y="${yF(d.bodyFat) - r}" width="${r * 2}" height="${r * 2}" class="body-fat-point"/>`;
        if (d.weight !== null) content += `<circle cx="${x(i)}" cy="${yW(d.weight)}" r="${r}" class="mood-point"/>`;
      });
      const every = Math.max(1, Math.ceil(60 / step));
      rows.forEach((d, i) => {
        if (i % every === 0 && i < rows.length - 1 - Math.floor(45 / step))
          content += `<text x="${x(i)}" y="${bottom + 25}" text-anchor="${i === 0 ? 'start' : 'middle'}">${pretty(d.date).replace(/, \d{4}$/, '')}</text>`;
      });
      content += `<text x="${width - 4}" y="${bottom + 25}" text-anchor="end">${pretty(state.end).replace(/, \d{4}$/, '')}</text>`;
      rows.forEach((d, i) => {
        content += `<rect x="${i * step}" y="${top - 6}" width="${step}" height="${plotHeight + 12}" class="mood-hit" data-chart-date="${d.date}"><title>${pretty(d.date)} · Weight ${kg(d.weight)} · Body fat ${pct(d.bodyFat)}</title></rect>`;
      });
      chart.innerHTML = content;
      q('.mood-scroll-hint').hidden = width <= scroll.clientWidth + 1 || window.matchMedia('print').matches;
      renderDetail();
    }
    function renderDetail() {
      const d = rows.find(d => d.date === state.selected);
      select.value = state.selected;
      q('.mood-day-detail').innerHTML =
        `<strong>${pretty(d.date)}</strong><div>Weight <b>${kg(d.weight)}</b> · Body fat <b>${pct(d.bodyFat)}</b></div><small>${d.lean === null ? 'Lean mass needs both weight and body fat.' : `Lean mass ${fmt(d.lean)} kg · Fat mass ${fmt(d.weight - d.lean)} kg`}</small>`;
    }
    function refresh() {
      rows = series(days, state.start, state.end);
      if (!rows.some(d => d.date === state.selected))
        state.selected = [...rows].reverse().find(d => d.weight !== null || d.bodyFat !== null)?.date || state.start;
      const s = summarize(rows);
      const tile = (label, t, unit, digits) =>
        `<div class="stat"><small>${label}</small><strong>${fmt(t.latest, digits)} <span class="mood-unit">${unit}</span></strong><small>${t.count ? `Change ${signed(t.change, digits)} ${unit} · ${t.count} recorded days` : 'Not recorded yet'}</small></div>`;
      q('.mood-range-label').textContent = `${pretty(state.start)} – ${pretty(state.end)}`;
      q('.body-metrics-stats').innerHTML =
        tile('Latest weight', s.weight, 'kg', 1) +
        tile('Latest body fat', s.bodyFat, '%', 1) +
        tile('Latest lean mass', s.lean, 'kg', 1);
      q('.mood-empty').hidden = s.weight.count > 0 || s.bodyFat.count > 0;
      select.innerHTML = rows.map(d => `<option value="${d.date}">${pretty(d.date)}</option>`).join('');
      q('.mood-data-table tbody').innerHTML = rows
        .map(
          d =>
            `<tr><th scope="row">${pretty(d.date)}</th><td>${fmt(d.weight)}</td><td>${fmt(d.bodyFat)}</td><td>${fmt(d.lean)}</td></tr>`
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
      if (preset === 'all') apply(recorded[0] || options.min, max, preset);
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
  const api = { validWeight, validFat, series, summarize, axisRange, markup, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyBookBodyMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
