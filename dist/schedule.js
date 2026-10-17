(function (root) {
  const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const time = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  function layout(entries) {
    const events = entries.map((s, index) => ({
      s,
      index,
      start: minutes(s.time),
      end: s.end && minutes(s.end) > minutes(s.time) ? minutes(s.end) : minutes(s.time) + 30
    }));
    const start = Math.floor(Math.min(360, ...events.map(e => e.start)) / 30) * 30,
      end = Math.max(1440, ...events.map(e => e.end));
    const ranked = events
      .slice()
      .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start || a.index - b.index);
    // Treat simultaneous starts as one layer with separate columns. A thin
    // exposed edge cannot keep two headers and their controls readable.
    const groups = [];
    for (const e of ranked) {
      let group = groups.find(g => g.start === e.start);
      if (!group) {
        group = { start: e.start, end: e.end, events: [] };
        groups.push(group);
      }
      group.end = Math.max(group.end, e.end);
      group.events.push(e);
    }
    groups.forEach((group, i) => {
      const behind = groups.slice(0, i).filter(g => g.start < group.end && group.start < g.end);
      group.depth = behind.length ? Math.max(...behind.map(g => g.depth)) + 1 : 0;
      group.events.forEach((e, column) => {
        e.depth = group.depth;
        e.column = column;
        e.columns = group.events.length;
      });
    });
    ranked.forEach((e, i) => {
      e.layer = i + 1;
      e.top = (e.start - start) * 2;
      e.height = (e.end - e.start) * 2;
    });
    const minWidth = Math.max(
      260,
      ...groups.map(g => g.depth * 32 + (g.events.length > 1 ? g.events.length * 160 + (g.events.length - 1) * 8 : 260))
    );
    return {
      start,
      end,
      height: (end - start) * 2,
      events: ranked,
      maxDepth: Math.max(0, ...ranked.map(e => e.depth)),
      minWidth
    };
  }
  const api = { minutes, time, layout };
  if (typeof module === 'object') module.exports = api;
  else root.DailyBookSchedule = api;
})(typeof globalThis === 'object' ? globalThis : this);
