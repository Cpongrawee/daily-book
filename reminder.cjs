// Bedtime review reminder: one Windows notification per evening while today's page is not yet reviewed.
// The time comes from book.settings.bedtimeReminder ('HH:MM', '' = off; default 22:30, Bangkok time).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const DEFAULT_TIME = '22:30';

function bangkokNow(now = Date.now()) {
  const iso = new Date(now + 7 * 3600e3).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
function reminderTime(book) {
  const value = book?.settings?.bedtimeReminder;
  return value === undefined ? DEFAULT_TIME : value;
}
function isDue(book, lastReminded, now = Date.now()) {
  const at = reminderTime(book);
  if (!at) return false;
  const { date, time } = bangkokNow(now);
  return time >= at && lastReminded !== date && book?.days?.[date]?.closed !== true;
}

// Windows toast through Windows PowerShell; text is passed in environment variables, never in the script.
const TOAST = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$e = [Security.SecurityElement]
$url = $e::Escape($env:DAILY_BOOK_TOAST_URL)
$xml = "<toast activationType='protocol' launch='$url'><visual><binding template='ToastGeneric'><text>$($e::Escape($env:DAILY_BOOK_TOAST_TITLE))</text><text>$($e::Escape($env:DAILY_BOOK_TOAST_BODY))</text></binding></visual><actions><action content='Open Daily Book' activationType='protocol' arguments='$url'/></actions></toast>"
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($doc))
`;
function toast({ title, body, url }) {
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', TOAST],
    {
      env: { ...process.env, DAILY_BOOK_TOAST_TITLE: title, DAILY_BOOK_TOAST_BODY: body, DAILY_BOOK_TOAST_URL: url },
      windowsHide: true,
      stdio: 'ignore'
    }
  );
  child.on('error', e => console.error('Bedtime reminder failed:', e.message));
}

function createReminder({ data, origin, getBook, notify = toast, now = Date.now, interval = 60000 }) {
  const file = path.join(data, 'reminder.json');
  let lastReminded = '';
  try {
    lastReminded = JSON.parse(fs.readFileSync(file, 'utf8')).lastReminded || '';
  } catch {}
  function check() {
    if (!isDue(getBook(), lastReminded, now())) return false;
    lastReminded = bangkokNow(now()).date;
    try {
      fs.writeFileSync(file, JSON.stringify({ lastReminded }));
    } catch (e) {
      console.error('Reminder state not saved:', e.message);
    }
    notify({
      title: 'Daily Book · Bedtime review',
      body: 'Take a few minutes to review today and choose Finish bedtime review.',
      url: origin + '/'
    });
    return true;
  }
  const timer = setInterval(check, interval);
  timer.unref?.();
  return {
    check,
    close() {
      clearInterval(timer);
    }
  };
}

module.exports = { DEFAULT_TIME, bangkokNow, reminderTime, isDue, createReminder, toast };
