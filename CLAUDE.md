# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A family of Tampermonkey userscripts that drive end-to-end report downloads on Paycom/ADP and data entry on UZIO, after the user has logged in manually in their normal Chrome. It is **not** a Node.js application — `package.json`, `package-lock.json`, `node_modules/`, and `user-data/` are leftover artifacts from an earlier Playwright-based attempt that was abandoned (see "Why a userscript" below). Node IS useful for one thing: `node --check <file>.user.js` as a syntax gate before handing a modified script to the user.

The scripts that actually run:

- [paycom-reports.user.js](paycom-reports.user.js) — the original bot (Census wizard + Prior Payroll YTD loop + Scheduled Deductions + Tax Profile + doc download). Most of this document describes it.
- [paycom-historical-data.user.js](paycom-historical-data.user.js) — "Historical Data Bot": batch-downloads ~30 historical reports (Time-Off / T&A / Accrual / HR & Audit / Payroll ARW) with clean file names. See "Historical Data Bot" section below.
- [adp-reports.user.js](adp-reports.user.js) — ADP reports + export-documents automation.
- [uzio-deductions.user.js](uzio-deductions.user.js) — reads a Payroll Setup Helper .xlsx and auto-creates Earnings/Deductions/Contributions in UZIO. Depends on the workbook's tab names (`Earnings`/`Deductions`/`Contributions`) and column headers (`Earning Name`/`UZIO Deduction Name`/`Contribution Name`) — never on file names.

## "Build" / "test" / "run"

There is no build, no test runner, no lint. To exercise changes:

1. Open the Tampermonkey browser extension dashboard, edit the existing **"Paycom Daily Reports Automation"** script (or create one and paste the contents), `Ctrl+S` to save.
2. In a Paycom-logged-in tab, refresh. A floating **"Paycom Bot"** panel appears bottom-right with three buttons: **Start Census Report**, **Run Prior Payroll**, **Stop / reset**.
3. Watch the browser DevTools console for `[PaycomBot]` log lines — most flow decisions are logged.
4. If the script gets stuck mid-flow (state survives across reloads), click **Stop / reset** before re-running.

The `@version` field in the userscript header is bumped on each meaningful change so Tampermonkey shows a diff prompt; keep doing this when modifying the script.

## Why a userscript and not Playwright

Paycom is protected by Arkose Labs CAPTCHAs. They fingerprint *any* automated browser (verified against `chromium.launchPersistentContext` with `channel: 'chrome'` + `--disable-blink-features=AutomationControlled` + `navigator.webdriver` overrides + a persistent profile). The CAPTCHA also silently rejects user-solved challenges once the bot score is high. The pivot to Tampermonkey works because the script runs *inside* the user's real, manually-driven Chrome session — there is no automation framework for Arkose to detect. **Do not propose a Playwright/Puppeteer/Selenium fallback** for the auth path; this has already been tried and lost. (The full reasoning is preserved in `memory/feedback_arkose_tampermonkey.md` — see "Memory directory" below.)

## Architecture

The userscript is a single IIFE in [paycom-reports.user.js](paycom-reports.user.js), divided by `// ───── ` comment headers into roughly:

- **Shared helpers** — `visible()`, `findByText()`, `findVisibleByExactText()`, `waitFor()`, `clickEl()`, etc. Used by both modes.
- **Census mode** — `selectRequiredFieldsAndNext()`, `runWizardAfterStep1()`, `waitForReportAndDownload()`. Drives the Advanced Report Writer wizard end-to-end.
- **Prior Payroll mode** — `ppHandleScheduleList()`, `ppHandleSchedulePage()`, `ppHandleReportPage()`, plus task generation + dialogs. Drives the Employee YTD Balances Report (`rpt_id=58`) once per scraped Processed pay period.
- **Page-router state machine** — `dispatch()` routes to either `dispatchCensus()` or `dispatchPriorPayroll()` based on which mode is `RUNNING`. Each per-mode dispatcher keys off `location.href` to decide what to do.
- **Floating panel + init** — UI and the `init()` that wires the panel and resumes any in-flight state on load.

### State machine pattern (important)

Each Paycom click usually causes a full page reload, which destroys the JavaScript context. Cross-page state lives in `localStorage` so a fresh script instance on the next page can pick up where the previous one left off:

| Key                       | Used by         | Purpose                                                         |
| ------------------------- | --------------- | --------------------------------------------------------------- |
| `paycomBot.state`         | Census          | `IDLE` / `RUNNING`                                              |
| `paycomBot.pp.state`      | Prior Payroll   | `IDLE` / `PP_GO_TO_SCHEDULE` / `PP_AT_SCHEDULE` / `PP_AT_REPORT`|
| `paycomBot.pp.tasks`      | Prior Payroll   | JSON array of tasks (quarterly + per-pay-period)                |
| `paycomBot.pp.index`      | Prior Payroll   | Current task index in the loop                                  |

On every `init()`, if either mode reports running, `dispatch()` is called and the relevant per-mode dispatcher inspects the URL to decide what handler to run. **Never mix mode states** — the panel `Start` buttons explicitly clear the other mode's state before kicking off, and `Stop / reset` clears both.

The two modes are isolated by design (different state keys, different handlers, different URL match conditions). Adding a third mode means: new state key, new dispatcher, new button, and a new branch in `dispatch()`.

### Cooperative abort (Stop button)

Clearing `localStorage` alone wouldn't interrupt in-flight `await` work — the Stop button needs to be responsive even when the script is mid-`waitFor` (10-min Download wait) or mid-loop (270 checkbox sleeps). Pattern:

- `shouldAbort()` returns true iff both modes are IDLE.
- **Every long pause is abort-aware**: `sleep(ms)` and `waitFor(...)` both poll `shouldAbort()` (every ≤100ms and every `interval` ms respectively) and reject with `err.aborted = true` when it flips.
- The rejection propagates up through `await` chains and is caught by the dispatcher try/catches, each of which checks `if (err.aborted) return;` to exit silently (no alert).
- The Stop click handler also calls `hideProgressBanner()` and removes any open `paycom-bot-confirm` / `paycom-bot-schedule-pick` / `paycom-bot-info` dialogs.

**Contract for new code**: any long async helper added inside a flow handler should use `sleep()` or `waitFor()`, not raw `setTimeout` / `new Promise`. Otherwise it won't inherit the abort behavior. If you really need a raw pause, manually re-check `shouldAbort()` between operations.

### Selector strategy (the key constraint when extending)

Paycom's UI:

- **Keeps prior tabs / years in the DOM, hidden via CSS** — so naive `document.querySelectorAll('tr')` returns rows from every year tab, not just the active one. **Always filter through `visible()`** when scraping table content. The schedule scraper (`scrapePayrollSchedule`) does this; new scrapers must too.
- **Uses the same URL for multi-step wizards** (`/enh-srw-reportwriter.php` is shared by all four wizard steps). Detect the current step by content (`detectWizardStep()` looks for unique-per-step strings like `"Output Format"` or `"Selected Sorts"`), not by URL.
- **URL substrings overlap** — `/processingschedules/index/` is a substring of both the listing page (`/processingschedules/indexTable`) and detail pages (`/processingschedules/index/<id>`). The dispatcher uses `/index/<digits>` as a regex when it needs the detail page specifically.
- **Date `<input>` fields don't react to plain `.value =`** because Paycom's framework registers via descriptor setters. Use `setInputValue()`, which calls the prototype setter and dispatches `input` / `change` / `blur`.
- **Per-client IDs vary** — payroll-schedule IDs differ across Paycom clients (`5701` for one, `76`/`400` for another). Never hardcode them. Navigate via listing pages and pick by content.

### The Prior Payroll task model

After scraping the Schedule Dates table for the current calendar year, `generateTaskList()` produces tasks with this rule:

- **Fully-Processed quarter** (every row Processed) → ONE quarterly task. Date range = first row's check date → last row's check date.
- **Active quarter** (some Processed, some not) → ONE task per Processed row. Date range = that row's check date → same date.
- **Quarter with zero Processed rows** → skip.

The user always sees a confirmation dialog (`showTaskConfirmDialog`) listing every task with a checkbox before any report is generated. If multiple payroll schedules on a client have processed data (e.g. weekly + biweekly both running), `showSchedulePickDialog` asks which one to use. Both dialogs gate the navigation that follows; cancellation cleanly resets state.

### The required-fields list

The big `RAW_REQUIRED_FIELDS` template literal in the Census section was copy-pasted verbatim from the user's pre-existing standalone field-selection userscript. Preserve it exactly (including duplicates and odd casing — the matcher normalizes and de-duplicates) unless the user explicitly asks to edit it. Order is not significant; the matcher walks DOM-order checkboxes.

## Historical Data Bot (`paycom-historical-data.user.js`)

Same architecture as the main bot (localStorage state machine, page-router `dispatch()`, cooperative abort) but iterates a REPORTS config array: each entry is either `rptId`-based (`rpt-generate.php?rpt_id=N`) or slug-based (`web.php/report-center/generate/<slug>`), and either a **date-range** report (one file per year/range) or a **snapshot** (`snapshot: true`, single file, no Date Range).

### Paycom has TWO download mechanisms — do not mix them up

Discovered the hard way (Equifax TWN Feed kept saving under Paycom's default name, Aug 2026):

1. **Legacy pages** (`rpt-generate.php?rpt_id=N`): file is fetched from `rpt-generateproc.php?session_nonce=<nonce>&download=1&transid=<n>`. The nonce is findable in hrefs/HTML; the transid comes from the `queued-report-<transid>` row id.
2. **Report-center slug pages** (`web.php/report-center/generate/<slug>`): **`session_nonce` does not exist anywhere on these pages** — not in DOM, cookies, storage, or any network request. No amount of regex-broadening or XHR-sniffing will find one (v0.17.4 and v0.18.0 tried; both were dead ends). Paycom's own handler (`handleDownloadOrView` in `/v4/cl/js/report-center/generate.js`) reads a jQuery `data('url')` TEMPLATE off the Download button (`…/report-center/download/{{ID}}`), substitutes `{{ID}}` with the `.queued-item` row's `data('id')` (= transid), runs an OTP pre-check (`reportaction/one-time-password`, usually `isOTPRequired:false`), then navigates. These are **jQuery data-store values, not `data-*` attributes** — `el.dataset` is empty; you must read them via `window.jQuery(el).data(...)` (the script is `@grant none`, so the page's jQuery is directly accessible).

`tryReportCenterDownload()` (v0.18.1) implements path 2 — substitute template + id, `fetch` with `credentials:'include'`, save the blob under OUR name — and `downloadNewest()` tries it FIRST, falling back to the legacy nonce path. Verified live: `GET web.php/report-center/download/<id>` → 200 `application/octet-stream`.

### Snapshot vs date-range: verify on the live form, never assume

A report whose form has no Date Range block must be `snapshot: true`, else `setDateRange` times out after 20s and the report is skipped ("Timed out waiting for Date Range inputs"). But the split is NOT uniform within a family — e.g. **Accrual Balances is a snapshot while Accrual Detail and Accrual Summary DO have a Date Range**. Marking a whole section snapshot broke Detail/Summary (v0.17.2, reverted in v0.17.3). Open the actual report page and look before flipping the flag.

### Change protocol for these scripts (learned from a full revert)

A batch of three simultaneous "fixes" (multi-tab lock + nonce regex + date-range fallback, v0.16) broke the script outright and had to be entirely reversed. Since then the working rules are:

1. **One fix per version, test, then next.** Bump `@version` every time; hand the file to the user via file-send after every change.
2. **Debug live in the user's logged-in Chrome** (claude-in-chrome MCP) instead of guessing from code: `performance.getEntriesByType('resource')` lists every request URL the page made; fetching Paycom's own JS bundles and grepping them reveals the real handlers. Minutes of live inspection beat hours of speculative patching.
3. The Chrome extension **blocks returning raw HTML or query-string data** from the page (`[BLOCKED: Cookie/query string data]`). Return only attribute NAMES, URL pathnames, `searchParams.keys()`, and heavily masked snippets (`.replace(/[A-Za-z0-9+\/]{16,}/g,'MASKED')`).
4. `node --check` the script after every edit — it catches template-literal/escaping mistakes before the user pastes a broken file. It does **not** catch a `let` used above its declaration (that only throws at runtime), so put new module-level state near the top with the rest.
5. **Get the markup before writing the fix.** Two consecutive ADP releases were shipped reasoning from code alone and both missed; the actual `<ul>` markup, once captured, made the fix obvious and correct first time. If the element can't be inspected because it disappears on click, use the Console recipe in "Capturing DOM that vanishes when you click" — a couple of minutes there beats a release that has to be undone.
6. Multi-tab hazard — now FIXED in code (v0.21.0+): a sessionStorage tab-id + localStorage heartbeat lock makes one tab the "driver"; other tabs stand by and take over only if the heartbeat goes stale. (An earlier v0.16 tab-lock attempt broke the script; this minimal heartbeat version works.)

### Duplicate-instance war stories (Aug 2026, the Employee Punch Change saga)

Every one of these produced the SAME symptom — doubled log lines / doubled generates / a panel that survives deletion — and each had a different cause. Check them in this order:

1. **Tampermonkey BETA had a second copy of the script.** Two userscript-manager extensions (stable + beta) each injected once: two panels, 14 generates instead of 7, and a panel that persisted after the script was "deleted" (from the other manager). Diagnose with the TM toolbar-icon popup (lists scripts active on the page) or `chrome://extensions`. The script now also sets `window.__histbotLoaded` and exits if it's already set.
2. **Paycom embeds same-origin iframes matching `/v4/cl/*`** — Tampermonkey injects into them too. The script now exits unless `window.top === window.self`.
3. A deleted script's already-injected instance **stays alive until the tab reloads** — "deleted it but the panel is still there" usually just means the tab wasn't refreshed.

### Serial > pipelined for multi-range downloads

The queue-all-generates-then-harvest pipeline (v0.20.x–0.21.x) was reverted after repeatedly mislabeling files: row→label mapping broke via late-rendering junk queue rows, lazy tab panes, and the duplicate instances above. **Strictly serial** (generate one range → wait for ITS download → save → next) cannot mix labels up and is the shipped design. Reports whose full year is too large get quarterly `ranges` (`QUARTER_RANGES`) plus `pickRanges: true`, which pops a checkbox dialog so an interrupted run can resume with only the missing quarters. Download-button wait is 30 min (a ~71k-row quarter genuinely exceeded 10).

Startup log line shows the running version (`Started 1 report(s) [v0.23.0]: …`) — check it FIRST when behavior doesn't match the code you just shipped; a stale Tampermonkey paste cost a debugging round. All four bots now read this from `GM_info.script.version`; never hardcode a second copy (see "A log that can lie" below).

## Picking the RIGHT row / the RIGHT element (Aug 2026 — the costliest bug family)

Every silent-wrong-file bug in this repo has been the same mistake wearing a different hat: **identifying the thing to click by position or by text instead of by identity.** Four separate instances in one session:

1. **"Wait for the Download-button count to rise, then take the topmost."** The count also rises when a PREVIOUS range's row finishes, and at that moment the topmost row with a button is still that range. `PriorPayroll_2024.csv` was a byte-identical copy of 2023 (md5 `0fe1ac6e1930`); `EmployeePunchChange_2026-Q3` was a byte-identical copy of Q2 (md5 `c8cf48d92995`) saved 39s after Generate while every real quarter took 4–8 min. Fix: snapshot the newest queue-row **timestamp** before clicking Generate, then wait for a strictly newer row and download ITS button. Stamps are compared only to each other — Paycom prints them in the client's timezone, not the browser's.
2. **Fixing one code path and *assuming* the sibling is safe.** After fixing `wizardDownload`, a comment was written claiming `generateAndDownload` was safe "because it snapshots on the same page". It was not; the identical bug shipped there and cost another round. **When you fix a selection bug, audit every path that selects the same kind of thing, and delete the old helper so it cannot come back** (`downloadNewest` is gone for exactly this reason).
3. **The same visible text on a wrapper and its control.** ADP's menu item is `<li><a data-pendo-id="…VIEW_DATA_PDF">PDF</a></li>` — the `<li>` and the `<a>` both have `textContent === "PDF"`, and the `<li>` comes first in document order, so a text search returns the wrapper. Clicking an `<li>` never reaches the `<a>` inside it, so every mouse event fired did nothing. Prefer a real control (`a, [role="menuitem"], button`), then the deepest node — and better still, key on the app's own identifier (`data-pendo-id`), which cannot collide with **Run** / **Query** / **AddNotes** the way text can.
4. **Hidden duplicate copies of a row.** With `override-report-hub=1` Paycom keeps a hidden Report Hub copy of each queue row later in the DOM; keeping only the last element per timestamp latched onto the invisible one whose Download button never passes `visible()`. Collect **all** candidates per key and take the first that yields a visible control.

**Verify with hashes, not with logs.** `md5sum` across a finished run is the only cheap proof: identical hashes for different labels = wrong-row bug; a file the log says was saved but which isn't on disk = the run lied. Both happened here.

## Capturing DOM that vanishes when you click (the hidden-menu recipe)

Dojo popups (ADP's ⋯ row menu) close on any outside mousedown, so **neither** the bot's own "Inspect Element HTML" button **nor** clicking into DevTools can be used the normal way. Three rounds were burned guessing at this markup before capturing it. The recipe that works, in the page's Console (pick the right frame in the context dropdown first — see below):

```js
// 1. Arm a watcher, THEN open the menu. It captures and stops on its own.
window.__cap=null; window.__t=setInterval(()=>{const c=[...document.querySelectorAll('[id^="revit_TooltipDialog_"],div,ul')].filter(e=>{const t=(e.innerText||'').replace(/\s+/g,' ').trim();return e.offsetParent&&t&&/view as/i.test(t)&&/pdf|xls|excel/i.test(t)&&t.length<250;});if(c.length){window.__cap=c[c.length-1].outerHTML;clearInterval(window.__t);console.log('CAPTURED '+window.__cap.length+' chars');}},200);
// 2. Click ⋯ . 3. Let the menu close — the HTML is already saved. 4. Then:
copy(__cap)
```

Two traps that wasted a round each:

- **`copy()` only exists for a directly-evaluated Console expression.** Inside a `setTimeout`/`setInterval` callback it throws `copy is not defined`. Capture into a global, then call `copy()` as its own statement.
- **ADP's Reports Output grid lives inside a same-origin `<iframe id="adprIframe">`** (`basic/Reporting/indexPortalLight.do`). A top-level `document.getElementById(...)` cannot see a popup Dojo attached inside the frame, and the Console evaluates against whichever frame the context dropdown names. In code, always resolve against `trigger.ownerDocument` first, then `document`. (`deepQueryAll` already walks same-origin iframes and shadow roots — mirror that habit anywhere you use raw `document.*`.)

Useful ADP-specific handles found this way: the row button carries `aria-owns="revit_TooltipDialog_NNN"` naming its own popup (scope every search to it), and **`aria-expanded` lies** — it stays `"false"` on an open menu while `popupactive="true"`. Trust either.

## A log that can lie is worse than no log

Most of the debugging time in this session went to logs that misreported reality. All four are fixed; do not reintroduce them.

- **Claiming success after failure.** ADP printed `✓ … downloaded` directly beneath its own `Download failed` warning, because the download step returns `true` on purpose (a naming failure must not fail the whole report). Thread the real outcome back (`lastSaveOk`) and report what actually happened.
- **Silence during a long operation.** `downloadViaButton` fetches the file with a 180s timeout and logged nothing until it finished, so a healthy 33 MB download looked identical to a hang — reported twice as "the bot is stuck, it won't click". Any wait longer than ~30s must log periodically, and the line should carry elapsed time.
- **A version badge that isn't the running version.** `SCRIPT_VERSION` was a second hardcoded copy and read `1.10.1` while `@version` had moved four releases on. Mid-run, that is the one fact you must be able to trust: it is how you tell *"the fix didn't work"* from *"the fix isn't loaded"*. All four bots now derive it from `GM_info.script.version`.
- **An opaque failure message.** `"View as XLS" menu item not found` cannot distinguish "menu never opened" from "menu open, nothing matched". Make failures name their branch and dump what was actually seen (`menu WAS open, contents: "View as PDF Query Run…"`). This turned round 3 of the ADP bug from a guess into a five-minute fix.

## When "nothing happened" doesn't mean the click missed

The sniffer hooks `window.open`, `fetch`, `XMLHttpRequest.open` and `form.submit`. **A native `<a href download>` click or an injected iframe uses none of them**, so "no request captured" is not evidence the click failed — on ADP's Employee Lien Detail the PDF downloaded every time while the sniffer stayed completely silent.

Consequences worth remembering:

- Reading that silence as "the click missed" justified an automatic retry, and **the retry was itself the second PDF** the user reported. `mouseSeq()` already ends in a `click` event; firing `.click()` and `dijitclick` alongside it runs the handler two or three times. **One click, no retry.**
- For the anchor case there is a better move than capturing a URL: hook `HTMLAnchorElement.prototype.click` and rewrite the element's own `download` attribute to our filename before letting the click through. The browser saves it correctly first time — no re-fetch, no second copy.

## ADP Historical Data Bot (`adp-historical-data.user.js`)

Same shape as the Paycom historical bot but driven by named ADP Standard Reports rather than an `rptId` catalog, so filenames are built per flow (`HistoricalPayroll_<year>.xlsx`, `safeFileName(reportName)_<range>.xlsx`, `<Client>_Audit_Trail_Report_<Qn-YYYY>.xlsx`). Notes:

- **Payroll History covers `y-3 … y`** (v1.14.0). The current year is capped at **today**, not 31 Dec — asking ADP for a range running into the future is not a range the report takes — and is saved as `<year>-to-date` so a partial year can't be mistaken for a full one.
- **An empty report is not necessarily a bug.** Payroll History returned `"Your filter criteria didn't return anything to report."` for all three prior years on First Line Logistics; the `Report Runtime Settings` sheet inside each file confirmed the requested range was correct. Read that sheet before blaming the bot — some reports (`Salary Time Off Absence Tracking`) even state the date range they ran with.
- Client name is detected on the run page and prefixes the audit / I-9 / lien filenames; it is re-detected per run and **can fail on later iterations**, which silently drops the prefix.

## Memory directory

Project memories (cross-conversation context, feedback, decisions) live outside the repo at:

```
C:\Users\shobhit.sharma\.claude\projects\c--Users-shobhit-sharma-Downloads-Playright-MCP-Automations\memory\
```

`MEMORY.md` is the index. The most useful files there are `project_paycom_reports.md` (current architecture, bug history, open items) and `feedback_arkose_tampermonkey.md` (the validated decision to use Tampermonkey over Playwright stealth). Read those before suggesting any architectural changes.

For the *business* side — who's driving requirements, why historical data matters (Amazon DSP audit exposure), retention scope, rollout status, and links to the report catalog / distribution folder / relevant email threads — see `communication_context.md` in the repo root. Read it before drafting any stakeholder-facing update, and keep it current as decisions land.

**That file is deliberately gitignored and exists only on the local machine.** It carries names, work email addresses, a named client's audit situation and internal Drive links, and **this repository is public** — so never commit it, quote it into a tracked file, or paste its contents anywhere public.

## Files to ignore

These are leftover from the abandoned Playwright path; they are not part of the runtime:

- `package.json`, `package-lock.json`, `node_modules/` — the Playwright dependency declaration. Misleading because nothing uses Node at runtime.
- `user-data/` — a real Chrome profile dir from `chromium.launchPersistentContext`. Gitignored. May be locked while Chrome is open.
- `.qodo/` — IDE/tool artifact directory. Empty. Gitignored.

The user has not asked for these to be removed, so leave them in place unless instructed.
