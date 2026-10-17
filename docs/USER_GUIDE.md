# Daily Book — User guide

Commands below are run from the repository folder.

## Calendar and Google Calendar

Choose **04 · Calendar** for month/week planning across all years. Calendar and Daily pages share the same activities, including all-day, overnight, and daily/weekly recurring events. Daily pages now support 00:00–23:59. Quarterly views follow the current quarter (see **Quarters and the new year** below).

Google Calendar supports two-way sync with one selected writable calendar. First-time setup, account sign-in, and a temporary connection test are required before syncing all existing activities. Open the Google Calendar panel for the built-in Thai setup guide, or read [GOOGLE_CALENDAR_SETUP.md](../GOOGLE_CALENDAR_SETUP.md).

The upgrade backs up the original book before migrating activities into `calendar.events`. Reflections and completion data stay local. OAuth tokens are encrypted with Windows DPAPI and excluded from book exports. Sync conflicts require choosing a version; restoring a backup pauses sync. The app runs locally, so background sync requires this computer and its Daily Book server to remain running.

Calendar checks: `node --test tests/calendar.test.cjs` and `node tests/calendar-qa.cjs`. Browser QA uses disposable data and checks that the real book remains unchanged.

Run `Start Daily Book.ps1` (or `npm start`) to open your book. It runs locally at http://127.0.0.1:47831 using Node.js LTS (install with `winget install OpenJS.NodeJS.LTS`). No account or internet connection is needed.

## Your daily routine

1. Select a date and type your hourly plans. Use the time field below the schedule to add activities at other times or multiple activities at the same time.
2. Set your most important task and other tasks. Optionally link tasks to goals for the selected date.
3. Edit an activity directly and tick it when completed. Use the ⋯ menu to edit its times or delete it. Multi-hour activities use a soft wine background and wine-red accent.
4. Fill your reflection sections as you complete them. **Do → Compass** is for completed actions, not future intentions.
5. To change day without scrolling up, use the ← date → **Today** controls at the bottom of the daily page; the chosen day opens from its top.
6. At bedtime, choose **Finish bedtime review**, then **Bedtime summary** to download a Markdown file you can share in chat. Finishing a review marks it reviewed; the page remains editable.

To change the Compass sentence at the top of each daily page, select ✎ in its corner, edit the text and choose **Save**. It is stored in your book (`identity` in `book.json`) and travels with backups. **Use default** restores the built-in sentence. An empty Compass also shows the default.

**02 · Weekly goals** and **03 · Monthly view** each include a review, **Your week, reflected** or **Your month, reflected**. It shows average mood, energy and sleep (with nights of 7+ hours), proud days, bedtime reviews, most important task and task completion. A table lists success rate, best streak in the period and current streak for the six Behavior Dashboard measures, followed by proud notes and fixes. Only days up to today count, and averages use the days you recorded. **↓ Weekly summary** / **↓ Monthly summary** downloads the review as Markdown, together with the period's goals and reflection. The calculations live in `dist/period-review.js`; run `node --test tests/period-review.test.cjs`.

Weekly goals use Sunday–Saturday weeks. A week spanning two months can connect to either month's goals. Monthly goals link to weekly goals, and daily tasks can link to either. Goal checkboxes reflect your assessment that the outcome is achieved; task counts are supporting progress, not automatic goal completion.

## Saving and backups

- Edits autosave after a short pause. Check for **Saved on this computer** before closing.
- The main file is `data/book.json`.
- Previous versions are in `data/backups`. Backups are snapshots before each successful save, thinned with age: the newest 30 are always kept, then one per minute for the last hour, one per 15 minutes for the last 24 hours, one per Bangkok day for 90 days, and one per week after that. Files with other names (manual snapshots) are never removed. The policy lives in `backup-retention.cjs`; run `node --test tests/backup-retention.test.cjs`.
- **Download backup** exports the whole book, including unsaved edits. Keep occasional copies on a separate drive for protection against disk loss.
- **Restore backup** replaces the book after confirmation, downloads the current version first, and keeps a server snapshot. Only valid Daily Book JSON is accepted.
- If two tabs conflict, the newer saved book is preserved. Download the unsaved tab's backup and reload it before continuing.
- Avoid editing `book.json` while the server is running; use Restore backup instead.
- **Automatic recovery:** if `book.json` is missing or unreadable when the server starts, it reopens the most recent good copy (an unfinished save or a backup), keeps the unreadable file as `data\book.damaged-*.json`, and the app shows a notice. With nothing to recover, the server stops and leaves the file untouched; the launcher shows the reason, which is also written to `data\server-error.log`.

## Insights, Search and the bedtime reminder

- **08 · Insights** compares days with and without one condition: 7+ hours of sleep, bed before midnight, discipline vs emotion, weight training (5+ sets) and fasting. It shows mood, energy, sleep, planned work completed (reviewed days only) and proud days for each side. A comparison needs at least 3 days on each side, today is excluded, and **What stands out** lists the clearest differences. These are associations, not causes.
- **09 · Search** finds words across reflections, worries, compass and proud notes, tasks, priorities, activities, goals and weekly/monthly reflections. Every word must appear in the same note; narrow the search with **In**. Select a result to open its day (or week for weekly reflections).
- **Bedtime reminder** (bottom of each daily page): if today isn't reviewed by the chosen time (default 22:30, Bangkok time), Windows shows one notification that evening; selecting it opens the book. Clear the time to turn reminders off. The server must be running (see the optional sign-in shortcut under **Technical notes**).

## Idea Board

**10 · Idea Board** is a big chalkboard for ideas that pop up: sticky notes, links and pictures you can place anywhere.

- **Notes:** double-click the board (or **+ Note**, or press **N** while the board is selected) and write; click away, press **Esc** or **Ctrl+Enter** to finish. Double-click a note (or press **Enter** on it) to edit it again. Hover a note to change its colour.
- **Links:** **+ Link** pins a web address with an optional name; pasting an address (**Ctrl+V**) or dropping one on the board does the same. Only `http`/`https` addresses are accepted. Click a link card to open it in a new tab. Daily Book never fetches the page itself, so nothing leaves the computer.
- **Pictures:** **+ Picture**, drag image files onto the board, or paste a screenshot with **Ctrl+V**. PNG, JPG, GIF and WebP work; HEIC phone photos must be saved as JPG first. Photos larger than 1600 px are shrunk before saving.
- Drag a card to move it, drag its bottom-right corner to resize it, and drag the empty board to look around. Scroll to zoom; **Fit all** shows every card. On a selected card, arrow keys move it (Shift for bigger steps) and **Delete** removes it; **Undo last change** brings it back.
- Cards are stored in `book.json` as `board` (and so in every backup snapshot). Pictures are files in `data\board-images`; the book stores only their names. **Download backup** includes the cards but not the picture files, so copy `data\board-images` too if you move the book to another computer. Deleting a picture card keeps its file, so Undo and older backups still show it.
- Checks: `node --test tests/idea-board.test.cjs` (links, validation, placement, picture upload/serving) and `node tests/idea-board-qa.cjs` (browser QA).

## Technical notes

Buildless HTML/CSS/JavaScript frontend and a dependency-free Node server. The server binds only to loopback. Data is saved with atomic replacement (flushed to disk before the swap) and revision checks. The launcher runs the server hidden and reuses it on subsequent launches. Optionally, put a shortcut in the Windows Startup folder (`shell:startup`) that runs the launcher with `-NoBrowser`, so Google Calendar sync and the bedtime reminder resume after a restart. After the server restarts, reload any open Daily Book tab.

Personal data lives in `data/`, which is gitignored and never committed. Code is formatted with Prettier: `npm run format`.

Tests, from the repository folder:

- `npm test` runs the unit and server tests (all on disposable data).
- `npm run qa` runs every browser QA script on disposable data and checks your real book is unchanged. Scripts written for an earlier UI are listed in `tests/run-qa.cjs` with the reason; they still run but don't fail the result.
- `npm run check` runs both.

Keep the downloaded Google OAuth client JSON inside `data/` (gitignored); the app itself uses the encrypted copy in `credentials.dpapi`.

## Royal manuscript theme

The built-in Renaissance theme uses ivory paper, wine-red navigation, antique-gold frames, and local SVG flourishes. Fonts and ornaments work offline. Activities use soft wine backgrounds, wine-red accents, and editable text. Mobile navigation uses two columns; printed calendars and Proud days remain visible on a plain background.

Headings, the Daily Book name, summary numbers, and Compass use Garamond when installed, with Palatino Linotype and Georgia fallbacks; the intro uses the bundled Quintessential font. Body text and form controls use Segoe UI. The shared type scale adapts to mobile screens.

The sidebar uses an inline SVG monogram crest, larger navigation labels, and a deep wine background. It scrolls independently on shorter desktop screens to keep backup controls accessible. QA screenshots use 2x pixel density, including `tests/renaissance/sidebar-desktop-2x.png`.

Run `node tests/theme-qa.cjs` for visual checks at desktop and two mobile widths, schedule and save/reload checks, and print checks. It uses disposable data on port 47843, checks that the real book is unchanged, and saves screenshots under `tests/renaissance`.

## Quarters and the new year

The book continues across years. Daily, weekly and monthly pages navigate to any date. Daily pages provide 37 half-hour slots from 05:00 through 23:00. Previously saved custom times remain visible so no existing entry is lost.

Notebook 00, **Proud days**, shows the quarter of the selected date (13–14 week rows, Sunday–Saturday columns); use ← → to move between quarters. Green cells reflect the daily proud checkbox. Neutral cells mean not checked, and dates outside the quarter are blank. Click a date to open its daily page. Weekly pages always show all seven days; existing week identifiers remain intact for saved goal links.

Run `node tests/year-rollover-qa.cjs` to check the app with the clock set to January 2027 (disposable data; the real book is unchanged).

## Daily support tools

- **Why am I proud today?** is optional, saves per day, appears in the bedtime summary and weekly dashboard, and is available as a heat-map tooltip.
- **Tomorrow →** copies an unfinished task to tomorrow, retaining the original and its carry date. The new task is unchecked. The most important task can be carried as an ordinary task so tomorrow's priority is not overwritten. Carry-forward works across month and year boundaries.
- Expand **Daily routines** to name and save a day's original schedule, priority, and tasks. Applying adds missing time/activity pairs and task titles, only fills an empty priority, and resets completion states for new items. Reflections and goal links are not copied. Delete a routine without deleting daily entries.
- **Undo last change** restores up to 30 recent edit snapshots in this tab. Rapid typing is grouped. It can restore deletions and undo routine application or carry-forward. Undo history ends on reload or backup restore; the file backups remain available.
- The weekly dashboard presents proud notes and your recorded fixes alongside the existing goal and task totals.

Daily check-in records ten training sets, fasting, mood from -3 to +3, and bedtime/wake time per date. Choose Today for an after-midnight bedtime. Sleep duration is calculated; all check-in fields appear in the bedtime summary.

## Mood & Sleep

Choose **05 · Mood & Sleep** to compare last night's sleep with the mood of the waking day. Gold bars use the left hours axis; the wine-red line uses the right -3 to +3 mood axis. Both scales stay visible while scrolling dates. The initial range is all recorded data through the end of the current quarter; choose the current quarter, a month, or a custom range. Select or tap a date for its bedtime, wake time, duration, and mood, or open its daily page.

Average mood and average sleep each use their own available entries and show their counts. Missing entries stay blank, while real zero values are included. Pearson correlation uses only days with both valid values, needs at least three paired days and variation in both series, and describes association rather than cause and effect. Invalid or incomplete sleep times are excluded. Bedtime, duration, and mood are read from existing Daily check-in entries; viewing and filtering the chart never saves or creates records. There are no demo entries in your book.

The daily data table provides a text alternative and is expanded for printing. Charts and fonts work offline. Run `node --test tests/mood-sleep.test.cjs` for the calculation checks and `node tests/mood-sleep-qa.cjs` for isolated browser checks. Sample-data screenshots and the print preview are under `tests/mood-sleep`.

## Enlightenment candles

Each of the six Intentions & reflections sections has an always-lit decorative ivory candle with an antique-gold holder and a soft warm glow. Candles have no on/off control and do not track completion or save state. Older candle-state fields remain compatible with saved books and backups. Reduced-motion preferences and printing are supported. Run `node --test tests/enlightenment.test.cjs` for isolated browser checks.

## Custom logo

The sidebar and browser favicon use a transparent-background adaptation of the project logo in `dist/daily-book-logo.png`. The cream outer background and UI border are removed, and the crest is scaled to fit the wine sidebar. `dist/daily-book-logo-original.png` preserves the original. Run `node tests/logo-build.cjs` to rebuild the Windows icon from this PNG.

## Simplified activity schedule

The plan-change classifications and Change dialog have been removed. Existing entries show their saved plan, remain editable, and retain their completion state. Legacy `changes` records stay in saved data and exported backups for compatibility, but are no longer displayed or included in summaries. New entries keep an empty `changes` array. Most important task remains available.
`node tests/simplified-schedule.cjs` checks legacy history preservation, direct editing, completion, add/delete, save/reload, old-backup restore, summary output, desktop/mobile colors, and print using disposable data. Screenshots are saved under `tests/simplified-schedule`.

## Activity times and parallel activities

Drag an activity's background or ↕ handle up/down to shift its start and end together by exact minutes, keeping its duration. A time preview appears while dragging; release to save, press Escape to cancel, or use Undo afterward. Moves stop at 05:00–23:00. Single-time activities keep their end blank. On touch screens, drag the ↕ handle; swipe elsewhere to scroll. Focus the handle and use ↑/↓ to shift one minute, or Shift+↑/↓ for 15 minutes. Legacy ranges outside these bounds can still be changed through Edit.

Completed activities use the Legendary effect: overlapping, branching orange-gold flames rise from a dark charcoal bed with glowing red-orange cracks, alongside rising embers, a 2px gold rim with a moving highlight, and sparkling corner stars. The flames use layered SVG shapes that sway at different speeds. Short cards use smaller flames to keep controls readable. Unticking completion removes the effects immediately; Undo and reload follow the saved completion state. Decorations do not intercept clicks or change card dimensions, are omitted from print, and become still when reduced motion is enabled. Run `node tests/activity-fire-qa.cjs` for isolated browser checks.

Right-click anywhere on the daily timeline, including time labels or an existing activity, and choose **Add activity**. The dialog starts at the clicked minute with a suggested 30-minute range. Set the name and exact start/end times, then choose **Add to schedule**. Leave end blank for a single-time activity. Times are within 05:00–23:00; Cancel makes no changes, and Undo can remove an addition. The Daily page uses the context menu for adding activities; Daily check-in and Daily routines sit below the schedule and reflections. Run `node tests/schedule-add-qa.cjs` for isolated browser checks.

Use an activity’s ⋯ menu or right-click → Edit to change its name, start/end times, and completion. Keyboard users can open the menu with Shift+F10 or the menu key. Save preserves the activity ID and legacy history; Cancel leaves it unchanged, and Undo can restore edits. New times allow exact minutes within 05:00–23:00. End must be later than start, or left blank for a single-time activity. Existing legacy times remain visible, editable, and compatible with backups.

Longer activities form the background; shorter overlapping activities appear above with an offset. Activities that start at the same time use separate columns so their names, checkboxes, and menus do not cover one another. Longer activities that start earlier remain behind them. Column order follows duration and then original data order. Touching intervals do not overlap. Select an exposed edge to bring a background activity forward, and click outside to reset it. On narrow screens, scroll the activity area sideways while the time labels remain fixed. Short events use compact headings; Edit shows their full details. Single-time activities occupy 30 minutes visually without adding an end to saved data. Printed schedules list all activities chronologically.

Run `node --test tests/schedule-layout.test.cjs` and `node tests/schedule-editor-qa.cjs` for interval and isolated browser checks. Browser screenshots and a print PDF are under `tests/schedule-editor`. Tests verify the production book is unchanged.

Run `node tests/simultaneous-qa.cjs` to check simultaneous-start columns with the Study session / Phone call / Laundry example at desktop and mobile widths, including menu access, completion and reload. Screenshots are in `tests/simultaneous`.

## Behavior Dashboard

Choose **07 · Behavior Dashboard** for six measures: priority, individual tasks, fasting, training (at least five sets daily), proud days, and bedtime review. Work and habit summaries are separate. Filters default to the current Bangkok month and support Sunday–Saturday weeks, each month of the current quarter, the whole current quarter, and custom dates back to the first recorded day. Current streaks continue across month, quarter and year boundaries. Future dates are excluded.

Checked outcomes count immediately. Unchecked outcomes only count as not completed after bedtime review; otherwise they remain missing or awaiting today's review. Empty work plans are excluded. Bedtime review itself never counts as failed. Rates use completed plus not-completed outcomes; tasks use individual items and also show known-day counts. Carried tasks count as a new day's plan.

Current streak is independent of the filter and ends today or yesterday if today is pending or has no work set. Past gaps break continuity without being labeled failure. Best streak is restricted to the selected range. Task streak requires at least one named task and completion of all named tasks. Drilldowns and calendar buttons open the source day. Viewing and filtering never writes data.

Run `node --test tests/behavior.test.cjs` and `node tests/behavior-qa.cjs`. Browser QA uses disposable data, checks desktop/390px/320px rendering and read-only behavior, and preserves the production book. Screenshots are under `tests/behavior`.
