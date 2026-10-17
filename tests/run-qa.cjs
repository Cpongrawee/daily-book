// Runs every browser QA script one after another and prints a summary.
// Each script starts its own server on disposable data and checks that data/book.json is unchanged.
// Usage: node tests/run-qa.cjs [name-filter]
const { spawnSync } = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path');
// Not run here: previews and the logo build.
const SKIP = /^(logo-build|run-qa)|preview\.cjs$/;
// Scripts known to be out of date with the UI, with the reason. Reported, but they don't fail the run.
const STALE = {};
const filter = process.argv[2] || '';
const scripts = fs
  .readdirSync(__dirname)
  .filter(n => (n.endsWith('-qa.cjs') || n === 'simplified-schedule.cjs') && !SKIP.test(n) && n.includes(filter))
  .sort();
const results = [];
for (const name of scripts) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 240000,
    windowsHide: true
  });
  const output = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  const ok = r.status === 0 && !r.error,
    stale = STALE[name];
  results.push({ name, ok, stale, seconds: Math.round((Date.now() - started) / 1000) });
  if (stale) console.log(`${ok ? 'PASS (remove from STALE list)' : 'STALE'} ${name} — ${stale}`);
  else console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${results.at(-1).seconds}s)`);
  if (!ok && !stale) console.log('  ' + (r.error?.message || output.slice(-6).join('\n  ')));
}
const current = results.filter(r => !r.stale),
  failed = current.filter(r => !r.ok);
console.log(
  `\n${current.length - failed.length}/${current.length} QA scripts passed; ${results.length - current.length} stale scripts skipped from the verdict`
);
process.exitCode = failed.length ? 1 : 0;
