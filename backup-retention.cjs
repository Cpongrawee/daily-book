// Tiered backup retention: dense recent history, thinning out with age.
// Names look like 2026-10-10T03-00-00-000Z-100.json (UTC time, then revision).
// Files that do not follow this pattern (e.g. manual snapshots) are never deleted.
const MINUTE = 60e3,
  HOUR = 60 * MINUTE,
  DAY = 24 * HOUR;
const BANGKOK = 7 * HOUR;
const KEEP_NEWEST = 30;

function backupTime(name) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-\d+\.json$/.exec(name);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isNaN(t) ? null : t;
}

// Bucket a backup by age; the newest backup in each bucket is kept.
function bucket(t, now) {
  const age = now - t,
    local = t + BANGKOK;
  if (age < 0) return null; // clock moved backwards: keep
  if (age < HOUR) return 'm' + Math.floor(local / MINUTE);
  if (age < DAY) return 'q' + Math.floor(local / (15 * MINUTE));
  if (age < 90 * DAY) return 'd' + new Date(local).toISOString().slice(0, 10);
  return 'w' + Math.floor(local / (7 * DAY));
}

function backupsToDelete(names, now = Date.now()) {
  const dated = names
    .map(name => ({ name, t: backupTime(name) }))
    .filter(b => b.t !== null)
    .sort((a, b) => b.t - a.t || b.name.localeCompare(a.name));
  const seen = new Set(),
    remove = [];
  dated.forEach((b, i) => {
    const key = bucket(b.t, now);
    if (i < KEEP_NEWEST || key === null || !seen.has(key)) {
      if (key !== null) seen.add(key);
      return;
    }
    remove.push(b.name);
  });
  return remove;
}

module.exports = { backupsToDelete, backupTime };
