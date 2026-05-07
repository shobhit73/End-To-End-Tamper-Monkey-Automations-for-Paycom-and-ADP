# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A single Tampermonkey userscript that drives end-to-end report downloads on Paycom, after the user has logged in manually in their normal Chrome. It is **not** a Node.js application — `package.json`, `package-lock.json`, `node_modules/`, and `user-data/` are leftover artifacts from an earlier Playwright-based attempt that was abandoned (see "Why a userscript" below). The only file that actually runs is [paycom-reports.user.js](paycom-reports.user.js).

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

## Memory directory

Project memories (cross-conversation context, feedback, decisions) live outside the repo at:

```
C:\Users\shobhit.sharma\.claude\projects\c--Users-shobhit-sharma-Downloads-Playright-MCP-Automations\memory\
```

`MEMORY.md` is the index. The most useful files there are `project_paycom_reports.md` (current architecture, bug history, open items) and `feedback_arkose_tampermonkey.md` (the validated decision to use Tampermonkey over Playwright stealth). Read those before suggesting any architectural changes.

## Files to ignore

These are leftover from the abandoned Playwright path; they are not part of the runtime:

- `package.json`, `package-lock.json`, `node_modules/` — the Playwright dependency declaration. Misleading because nothing uses Node at runtime.
- `user-data/` — a real Chrome profile dir from `chromium.launchPersistentContext`. Gitignored. May be locked while Chrome is open.
- `.qodo/` — IDE/tool artifact directory. Empty. Gitignored.

The user has not asked for these to be removed, so leave them in place unless instructed.
