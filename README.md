# End-to-End Tampermonkey Automations — Paycom, ADP & UZIO

Browser userscripts that automate repetitive HR/payroll work — report generation, bulk
document downloads, and data setup — across **Paycom**, **ADP Workforce Now**, and **UZIO**.
Each script adds a floating control panel to the target site and drives the real UI
end-to-end while you watch.

## Why Tampermonkey (and not Playwright/Selenium)?

Paycom is protected by Arkose Labs CAPTCHAs that fingerprint *any* automated browser —
stealth flags, `navigator.webdriver` overrides, and persistent profiles were all tried and
rejected. A userscript runs **inside your real, manually-driven Chrome session**, so there is
no automation framework to detect. You log in normally; the bot only clicks what you could
click yourself.

## Scripts

| Script | Ver | Site | What it does |
| ------ | --- | ---- | ------------ |
| [`paycom-reports.user.js`](paycom-reports.user.js) | 0.19.0 | `paycomonline.net/v4/cl/*` | Census report (full ARW wizard), Prior Payroll YTD (per-quarter / per-pay-period), Scheduled Deductions, Tax Profile, Qualified Premiums, and **Download All Documents** (Doc Dashboard bulk export) |
| [`adp-reports.user.js`](adp-reports.user.js) | 1.1.4 | `workforcenow.adp.com/*` | Unified panel: report automation (Download All, Census, SIT/FIT, License/EC, Payroll History, Deduction, Direct Deposit, Qualified Overtime Wages and Tips) + **Export Documents** bot (auto-detect categories, sequential export, auto-download) |
| [`uzio-employee-history.user.js`](uzio-employee-history.user.js) | 0.12.0 | `*.uzio.com/*` | Bulk **Employee Profile Change Report** downloader — paste visible Employee IDs, the bot resolves them to internal GUIDs from the grid and clicks each row's download button |
| [`uzio-deductions.user.js`](uzio-deductions.user.js) | 0.36.0 | `app.uzio.com/*` | **Setup auto-create** — reads the Earnings / Deductions / Contributions tabs of the Payroll Setup Helper `.xlsx` and creates each item in UZIO, with verified saves and pause/skip/resume on failure |

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension (Chrome/Edge).
2. Tampermonkey dashboard → **Create a new script** → paste the contents of the script you
   want → `Ctrl+S`.
3. Log in to the target site normally and refresh — the floating bot panel appears
   (bottom-right; draggable on Paycom/UZIO).
4. Click a button, watch it work. Most flows show live progress in the panel and log
   details to the DevTools console (`[PaycomBot]`, `[ADPBot]`, `[DL]`, `[uzioBot]`).

## Highlights

### Paycom Bot (`paycom-reports.user.js`)
- **Reports** — one-click buttons for Census, Prior Payroll, Scheduled Deductions, Tax
  Profile, and Qualified Premiums; each drives Paycom's Report Center / ARW wizard end-to-end.
- **Cross-page state machine** — Paycom reloads the page on nearly every click, so each
  mode persists its state in `localStorage` and a dispatcher resumes the flow on load.
- **Download All Documents** — prompts for a start year, applies the *Last Modified* filter
  (`01/01/<year>` → `12/31/<current year>`), then pages through the entire grid downloading
  every file via `fetch → Blob` (verified size/status, retries, resumable, pause/stop).
- **Inspect Element HTML** — click it, then click anything on the page: the element's
  `outerHTML` is copied to your clipboard for fast selector debugging.
- Draggable, minimizable glass-themed panel with live status pills and a pulsing run indicator.

### ADP Bot (`adp-reports.user.js`)
- Drives ADP's mixed UI stack (Stencil shadow DOM + legacy Dojo iframes + React views)
  through deep DOM queries that pierce shadow roots and same-origin iframes.
- **Download All** runs every report back-to-back; each report is also a one-click button —
  Census, SIT/FIT, License/EC, Payroll History, Deduction, Direct Deposit, and Qualified
  Overtime Wages and Tips.
- **Export Documents** module auto-detects document categories and exports them
  sequentially with automatic downloads.

### UZIO bots
- **Bulk history reports** — UZIO delivers files via `location.href` navigation, so rapid
  programmatic calls cancel each other; the bot clicks each employee's real download
  button with spacing, which makes bulk downloads reliable.
- **Setup auto-create** — every save is positively verified (the form must reset/close);
  silent failures pause the run with Save & Continue / Resume / Skip choices, and a
  reconciliation summary runs at the end.

## Development

- No build, no test runner — edit the script in Tampermonkey, `Ctrl+S`, refresh the site.
- Bump the `@version` header on every meaningful change so Tampermonkey shows a diff prompt.
- `node --check <file>` is a quick syntax gate before committing.
- Git workflow: work happens on `<user>/<feature>` branches that are rebased onto
  `origin/main` and fast-forward merged — no merge commits on `main`. The
  [`/sync`](.claude/commands/sync.md) and [`/merge`](.claude/commands/merge.md) Claude Code
  commands automate this.

## Disclaimer

These scripts automate the same actions a logged-in user performs by hand, for legitimate
administrative use on accounts you are authorized to access. Vendor UIs change without
notice — selectors may need maintenance when Paycom/ADP/UZIO ship updates.
