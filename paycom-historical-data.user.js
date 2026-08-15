// ==UserScript==
// @name         Paycom Historical Data Bot
// @namespace    https://www.paycomonline.net/
// @version      0.32.0
// @description  Historical Data Bot — downloads Paycom historical reports as Excel for all employees. All dates are computed at run time (previous year + current year; Prior Payroll goes back 3 years) — nothing is hardcoded. Sections: Time-Off, Time & Attendance, Accrual, HR & Audit, Payroll (ARW wizard), E-Verify (grid export + all-case detail scrape). User opens Paycom, picks a section, ticks reports, and the bot navigates, configures, generates, and downloads each file with a clean name.
// @match        https://www.paycomonline.net/v4/cl/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ── Duplicate-instance guards ──
  // 1) IFRAMES: Paycom pages embed same-origin iframes whose URLs also match
  //    @match, so Tampermonkey injects a SECOND copy of this script inside the
  //    frame — a second panel appears and every generate/download fires twice
  //    (the iframe has its own window, and sessionStorage is shared, so neither
  //    the window flag nor the tab lock can catch it). Only the top window runs.
  try { if (window.top !== window.self) return; } catch (_) { return; }
  // 2) Same-window double copy (e.g. two Tampermonkey entries): @grant none →
  //    both copies share the page's window, so the second one exits here.
  if (window.__histbotLoaded) { console.warn('[HistBot] duplicate script copy detected — this copy is standing down. Delete the extra entry in the Tampermonkey dashboard.'); return; }
  window.__histbotLoaded = true;

  // ───────────────── Config ─────────────────
  // Reports to download, in order. Add the remaining four here once their
  // rpt_ids are confirmed (Employee Time-Off, Holiday/Blackout, Salary Time Off
  // Absence Tracking, Time-Off Audit). rpt_id comes from the report's
  // rpt-generate.php?rpt_id=<N> URL — navigating there needs no session_nonce.
  // fileBase drives the saved filename: `<fileBase>_<year>.xlsx`. section groups
  // reports in the picker. Only standard rpt-generate.php reports are listed here
  // (their rpt_id is the same across all Paycom employer accounts). Slug-based
  // Report-Center reports (web.php/report-center/generate/<slug>) need separate
  // handling and are tracked in PENDING_SLUG_REPORTS below.
  // All years are computed at load time — NOTHING is hardcoded, so the script
  // stays correct forever:
  //   THISYEAR/LASTYEAR → the default two-file year loop and HR & Audit ranges
  //                        (in 2026: 2025+2026 · in 2027: 2026+2027 · …)
  //   STARTYEAR (−3)    → the Prior Payroll wizard range
  const THISYEAR = new Date().getFullYear();
  const LASTYEAR = THISYEAR - 1;
  const STARTYEAR = THISYEAR - 3;
  // HR & Audit reports share one range: Jan 1 of LAST year → today.
  const HR_AUDIT_RANGES = [{ label: `${LASTYEAR}-to-date`, from: `01/01/${LASTYEAR}`, to: 'TODAY' }];
  // Form I-9 Audit needs a deeper window: Jan 1 of (this year − 3) → today
  // (in 2026: 01/01/2023 → today · in 2027: 01/01/2024 → today · …).
  const I9_RANGES = [{ label: `${STARTYEAR}-to-date`, from: `01/01/${STARTYEAR}`, to: 'TODAY' }];
  // Prior Payroll (ARW wizard): one combined 3.5-year pull can be very slow on
  // large clients, so this offers a Combined option AND one range per year —
  // the user picks via the same range-picker dialog the quarterly reports use.
  // A small client can just tick Combined and run it exactly as before.
  // `label` is the file-name suffix (PriorPayroll_2023.xlsx); `display` is what
  // the banner/log shows while that range runs — it has to stand on its own,
  // because the report's own name carries the FULL scope and reading
  // "Prior Payroll (2023 → today) (2023)" makes it look like the whole range
  // is being pulled when only 2023 is.
  const PRIOR_PAYROLL_RANGES = [
    { label: 'Combined', display: `all years in one file (${STARTYEAR} → today)`, from: `01/01/${STARTYEAR}`, to: 'TODAY' },
    { label: `${STARTYEAR}`, display: `year ${STARTYEAR} only`, from: `01/01/${STARTYEAR}`, to: `12/31/${STARTYEAR}` },
    { label: `${STARTYEAR + 1}`, display: `year ${STARTYEAR + 1} only`, from: `01/01/${STARTYEAR + 1}`, to: `12/31/${STARTYEAR + 1}` },
    { label: `${STARTYEAR + 2}`, display: `year ${STARTYEAR + 2} only`, from: `01/01/${STARTYEAR + 2}`, to: `12/31/${STARTYEAR + 2}` },
    { label: `${THISYEAR}-to-date`, display: `${THISYEAR} to date only`, from: `01/01/${THISYEAR}`, to: 'TODAY' },
  ];
  // Quarterly ranges for reports whose full-year data is too large (e.g.
  // Employee Punch Change): last + current year split per quarter, skipping
  // quarters that haven't started yet. Files: <base>_2025-Q1.xlsx, …
  const mmddyyyy = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const QUARTER_RANGES = (() => {
    const now = new Date(), out = [];
    for (const y of [LASTYEAR, THISYEAR]) for (let q = 0; q < 4; q++) {
      const from = new Date(y, q * 3, 1);
      if (from > now) break;
      out.push({ label: `${y}-Q${q + 1}`, from: mmddyyyy(from), to: mmddyyyy(new Date(y, q * 3 + 3, 0)) });
    }
    return out;
  })();

  // Human Resources → E-Verify → E-Verify Cases. Same URL for both new E-Verify
  // entries — it's a live grid page, not a per-report rpt_id/slug form.
  const EVERIFY_CASES_URL = 'https://www.paycomonline.net/v4/cl/web.php/Everify/Index/caseList#!pcm-tab-1';

  const REPORTS = [
    // ── Time-Off ──
    { section: 'Time-Off', key: 'employee-timeoff', name: 'Employee Time-Off', rptId: 184, fileBase: 'EmployeeTimeOff' },
    { section: 'Time-Off', key: 'holiday-blackout', name: 'Holiday/Blackout', rptId: 185, fileBase: 'HolidayBlackout' },
    { section: 'Time-Off', key: 'timeoff-audit', name: 'Time-Off Audit', rptId: 182, fileBase: 'TimeOffAudit' },
    { section: 'Time-Off', key: 'timeoff-summary', name: 'Time-Off Summary', rptId: 186, fileBase: 'TimeOffSummary' },
    // Slug-based (report-center) but a normal date-range report → two files, one
    // per year. This form has no Employees "Select All" (only "Show Selected");
    // in the report center an empty selection means ALL employees, and the bot
    // just logs a WARN there and proceeds.
    {
      section: 'Time-Off', key: 'salary-timeoff-absence-tracking', name: 'Salary Time Off Absence Tracking',
      url: 'https://www.paycomonline.net/v4/cl/web.php/report-center/generate/salary-time-off-absence-tracking-report',
      slug: 'salary-time-off-absence-tracking-report', fileBase: 'SalaryTimeOffAbsenceTracking',
    },
    // ── Time & Attendance ──
    { section: 'Time & Attendance', key: 'break-lunch-duration', name: 'Break/Lunch Duration', rptId: 401, fileBase: 'BreakLunchDuration' },
    // Full-year data is too large for this one — pull it quarter by quarter.
    // pickRanges: a dialog asks WHICH quarters to run (untick the ones already
    // downloaded instead of re-running all seven after a partial run).
    { section: 'Time & Attendance', key: 'employee-punch-change', name: 'Employee Punch Change', rptId: 419, fileBase: 'EmployeePunchChange', ranges: QUARTER_RANGES, pickRanges: true },
    { section: 'Time & Attendance', key: 'employee-rates-by-allocation', name: 'Employee Rates by Allocation', rptId: 405, fileBase: 'EmployeeRatesByAllocation' },
    { section: 'Time & Attendance', key: 'hours-worked-vs-threshold', name: 'Hours Worked vs Threshold', rptId: 406, fileBase: 'HoursWorkedVsThreshold' },
    { section: 'Time & Attendance', key: 'labor-allocation', name: 'Labor Allocation', rptId: 407, fileBase: 'LaborAllocation' },
    { section: 'Time & Attendance', key: 'labor-analysis-overtime', name: 'Labor Analysis/Overtime', rptId: 408, fileBase: 'LaborAnalysisOvertime' },
    { section: 'Time & Attendance', key: 'missed-break-lunch', name: 'Missed Break/Lunch', rptId: 601, fileBase: 'MissedBreakLunch' },
    { section: 'Time & Attendance', key: 'missing-punch', name: 'Missing Punch', rptId: 409, fileBase: 'MissingPunch' },
    { section: 'Time & Attendance', key: 'pay-class-effective-date', name: 'Pay Class Effective Date', rptId: 417, fileBase: 'PayClassEffectiveDate' },
    { section: 'Time & Attendance', key: 'punch-audit', name: 'Punch Audit', rptId: 410, fileBase: 'PunchAudit' },
    { section: 'Time & Attendance', key: 'punches-outside-current-allocation', name: 'Punches Outside Current Allocation', rptId: 411, fileBase: 'PunchesOutsideCurrentAllocation' },
    { section: 'Time & Attendance', key: 'time-between-shifts', name: 'Time Between Shifts', rptId: 600, fileBase: 'TimeBetweenShifts' },
    { section: 'Time & Attendance', key: 'time-detail', name: 'Time Detail', rptId: 412, fileBase: 'TimeDetail' },
    { section: 'Time & Attendance', key: 'timecard-approval', name: 'Timecard Approval', rptId: 413, fileBase: 'TimecardApproval' },
    { section: 'Time & Attendance', key: 'total-hours-by-time-range', name: 'Total Hours by Time Range', rptId: 416, fileBase: 'TotalHoursByTimeRange' },
    { section: 'Time & Attendance', key: 'total-hours-summary-by-allocation', name: 'Total Hours Summary by Allocation', rptId: 415, fileBase: 'TotalHoursSummaryByAllocation' },
    { section: 'Time & Attendance', key: 'total-hours-summary', name: 'Total Hours Summary', rptId: 414, fileBase: 'TotalHoursSummary' },
    { section: 'Time & Attendance', key: 'zero-hours-summary', name: 'Zero Hours Summary', rptId: 418, fileBase: 'ZeroHoursSummary' },
    // ── Accrual ── (these pages can differ slightly; a report that doesn't fit
    // the XLSX + Date-Range + Select-All pattern is skipped and logged.)
    { section: 'Accrual', key: 'accrual-balances', name: 'Accrual Balances', rptId: 187, snapshot: true, fileBase: 'AccrualBalances' },
    { section: 'Accrual', key: 'accrual-detail', name: 'Accrual Detail', rptId: 188, fileBase: 'AccrualDetail' },
    { section: 'Accrual', key: 'accrual-summary', name: 'Accrual Summary', rptId: 190, fileBase: 'AccrualSummary' },
    // Slug-based snapshot report: XLSX-only, no Date Range, all-employees default,
    // the "as of" date is fixed by Paycom — so it's a single file, no year loop.
    {
      section: 'Accrual', key: 'historical-accrual-data', name: 'Historical Accrual Data',
      url: 'https://www.paycomonline.net/v4/cl/web.php/report-center/generate/historical-accrual-data',
      slug: 'historical-accrual-data', snapshot: true, selectAll: false, fileBase: 'HistoricalAccrualData',
    },
    // ── HR & Audit ── (single dynamic date range: 01/01/<last year> → today)
    {
      section: 'HR & Audit', key: 'effective-dates', name: 'Effective Dates', rptId: 133, fileBase: 'EffectiveDates',
      ranges: HR_AUDIT_RANGES,
    },
    {
      section: 'HR & Audit', key: 'employee-changes', name: 'Employee Changes', rptId: 134, fileBase: 'EmployeeChanges',
      ranges: HR_AUDIT_RANGES,
      checks: ['Show Effective Date'], // tick this option before generating
    },
    // Verified live (Aug 2026): this form has NO Date Range block at all — only
    // Output Format + Employee Filters — so it's a snapshot, not a range report.
    {
      section: 'HR & Audit', key: 'employee-dates', name: 'Employee Dates', rptId: 1,
      snapshot: true, fileBase: 'EmployeeDates',
    },
    {
      section: 'HR & Audit', key: 'rate-history', name: 'Rate History', rptId: 25, fileBase: 'RateHistory',
      ranges: HR_AUDIT_RANGES,
    },
    // No Date Range on this form (only Output Format + Accrual/Status options,
    // which default to PTO + All) → snapshot: one file, Select-All employees.
    {
      section: 'HR & Audit', key: 'employee-accrual', name: 'Employee Accrual', rptId: 11,
      snapshot: true, fileBase: 'EmployeeAccrual',
    },
    // Slug-based; the form has ONLY Output Format (no Date Range, no Employee
    // Filters) → snapshot, no Select-All. Single file.
    {
      section: 'HR & Audit', key: 'equifax-twn-feed', name: 'Equifax TWN Feed',
      url: 'https://www.paycomonline.net/v4/cl/web.php/report-center/generate/efx-twn-report',
      slug: 'efx-twn-report', snapshot: true, selectAll: false, fileBase: 'EquifaxTWNFeed',
    },
    // No Date Range (Output Format + Employee Filters w/ Select All) → snapshot.
    {
      section: 'HR & Audit', key: 'employee-3rd-party-payee', name: 'Employee 3rd Party Payee', rptId: 10,
      snapshot: true, fileBase: 'Employee3rdPartyPayee',
    },
    // No Date Range on the form (verified live) → snapshot, Select-All employees.
    {
      section: 'HR & Audit', key: 'employee-rates', name: 'Employee Rates', rptId: 17,
      snapshot: true, fileBase: 'EmployeeRates',
    },
    // Verified live: no Date Range → snapshot, Select-All employees.
    {
      section: 'HR & Audit', key: 'employee-position', name: 'Employee Position', rptId: 153,
      snapshot: true, fileBase: 'EmployeePosition',
    },
    {
      section: 'HR & Audit', key: 'position-discrepancy', name: 'Position Discrepancy', rptId: 168,
      snapshot: true, fileBase: 'PositionDiscrepancy',
    },
    // Verified live: HAS a Date Range (prdate1from/to) → default two-year loop.
    {
      section: 'HR & Audit', key: 'position-management-audit', name: 'Position Management Audit', rptId: 113,
      fileBase: 'PositionManagementAudit',
    },
    // Slug-based; "As of Date" defaults to today and XLSX is preselected (the
    // output pills live outside #rpt_output, so the format WARN in the log is
    // harmless). No employee Select-All on this form → snapshot, single file.
    {
      section: 'HR & Audit', key: 'point-in-time', name: 'Point-in-Time',
      url: 'https://www.paycomonline.net/v4/cl/web.php/report-center/generate/point-in-time',
      slug: 'point-in-time', snapshot: true, selectAll: false, fileBase: 'PointInTime',
    },
    {
      section: 'HR & Audit', key: 'changed-contact', name: 'Changed Contact', rptId: 132, fileBase: 'ChangedContact',
      ranges: HR_AUDIT_RANGES,
    },
    // Has a Date Range (defaults 01/01/2023 → 12/31/<this year> on the live
    // form); we override it with the 3-year I9_RANGES window. XLSX preselected.
    {
      section: 'HR & Audit', key: 'form-i9-audit', name: 'Form I-9 Audit', rptId: 171, fileBase: 'FormI9Audit',
      ranges: I9_RANGES,
    },
    // Has a Date Range but caps at 1 year of data per pull → default two-file
    // year loop (this year + last year), Select-All employees. XLSX preselected.
    {
      section: 'HR & Audit', key: 'garnishment-report', name: 'Garnishment Report', rptId: 20, fileBase: 'GarnishmentReport',
    },
    // ── Payroll ── (Advanced Report Writer wizard — 3-year prior payroll)
    // Range is DYNAMIC: 01/01/(this year − 3) → today. So in 2026 it's 2023→today,
    // in 2027 it's 2024→today, etc. The `name`/`fileBase` follow the same year so
    // nothing is ever hardcoded. (STARTYEAR is computed once below.)
    {
      section: 'Payroll', key: 'prior-payroll-3yr', name: `Prior Payroll (${STARTYEAR} → today)`, wizard: true,
      // `name` shows the full scope in the report picker; `shortName` is used in
      // the per-range banner/log so a single-year run doesn't read as the whole range.
      shortName: 'Prior Payroll',
      reportType: 'Payroll',
      step1Fields: ['Employee Code', 'Employee Name', 'Pay Class Code'],
      step2SelectAll: ['Earnings', 'Deductions', 'Taxes', 'Employer Liability', 'Accruals', 'Net', 'Taxable Wages'],
      ranges: PRIOR_PAYROLL_RANGES, pickMode: true,
      fileBase: `PriorPayroll`,
    },
    // ── E-Verify ── (Human Resources → E-Verify → E-Verify Cases — a live
    // DataTables grid, not a rpt-generate.php form, so both entries use their
    // own `custom` flow instead of the generic date-range/snapshot handler.)
    {
      section: 'E-Verify', key: 'everify-cases-export', name: 'E-Verify Cases (grid export)',
      url: EVERIFY_CASES_URL, custom: 'everifyCasesExport',
    },
    {
      section: 'E-Verify', key: 'everify-case-details', name: 'E-Verify Case Details (all cases)',
      url: EVERIFY_CASES_URL, custom: 'everifyCaseDetails',
    },
  ];
  const reportByKey = (k) => REPORTS.find(r => r.key === k);
  // Distinct sections, in first-seen order — each gets its own Start button.
  const SECTIONS = REPORTS.reduce((acc, r) => acc.includes(r.section) ? acc : acc.concat(r.section), []);
  const SECTION_ICON = { 'Time-Off': '🗓️', 'Time & Attendance': '⏱️', 'Accrual': '📈', 'HR & Audit': '🧑‍💼', 'Payroll': '💵', 'E-Verify': '🪪' };

  // Slug-based Report-Center reports still to wire (need slug navigation + their
  // own form handling):
  //   T&A:       Calc Detail → calc-detail-report
  //   T&A:       Estimated Qualified Premiums CSV → estimated-qualified-overtime-ta-report
  //   T&A:       Punch Change Request → punch-change-request-report
  //   T&A:       Timecard Correction Comparison → timecard-correction-comparison-report
  //   T&A:       Timecard Premium → timecard-premium-report
  //   Accrual:   Accrual Projection → accrual-projection

  // Default date ranges — a report with no `ranges` of its own downloads once per
  // year (previous + current). A report can override with its own `ranges`, and a
  // range's `from`/`to` may use the token 'TODAY' → resolved to today's date.
  const YEARS = [
    { label: `${LASTYEAR}`, from: `01/01/${LASTYEAR}`, to: `12/31/${LASTYEAR}` },
    { label: `${THISYEAR}`, from: `01/01/${THISYEAR}`, to: `12/31/${THISYEAR}` },
  ];

  function todayMMDDYYYY() {
    const t = new Date();
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    const dd = String(t.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${t.getFullYear()}`;
  }
  const resolveDate = (d) => (d === 'TODAY' ? todayMMDDYYYY() : d);

  // A report is either standard (rptId → rpt-generate.php?rpt_id=N) or slug-based
  // (url/slug → web.php/report-center/generate/<slug>).
  function reportNavUrl(report) {
    if (report.url) return report.url;
    return `https://www.paycomonline.net/v4/cl/rpt-generate.php?rpt_id=${report.rptId}`;
  }
  function isOnReportPage(report) {
    if (report.slug) return location.href.includes('/report-center/generate/' + report.slug);
    if (report.rptId) return location.href.includes('/rpt-generate.php')
      && new RegExp(`[?&]rpt_id=${report.rptId}(?:[&#]|$)`).test(location.href);
    return false;
  }

  // ───────────────── State (survives page reloads) ─────────────────
  const STATE_KEY = 'histbot.state';
  const INDEX_KEY = 'histbot.index';
  const QUEUE_KEY = 'histbot.queue';       // JSON array of selected report keys for this run
  const SEL_KEY = 'histbot.selection';     // persisted { key: bool } picker selection
  const STATES = { IDLE: 'IDLE', RUNNING: 'RUNNING' };

  const getState = () => localStorage.getItem(STATE_KEY) || STATES.IDLE;
  const isRunning = () => getState() === STATES.RUNNING;
  const setState = (s) => {
    if (s === STATES.IDLE) localStorage.removeItem(STATE_KEY);
    else localStorage.setItem(STATE_KEY, s);
    refreshPanel();
    log('state →', s);
  };
  const getIndex = () => parseInt(localStorage.getItem(INDEX_KEY) || '0', 10) || 0;
  const setIndex = (n) => { localStorage.setItem(INDEX_KEY, String(n)); refreshPanel(); };

  function getQueue() {
    try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; }
    catch (_) { return []; }
  }
  const setQueue = (keys) => localStorage.setItem(QUEUE_KEY, JSON.stringify(keys));
  const clearQueue = () => localStorage.removeItem(QUEUE_KEY);

  // Picker selection: { key: bool }. Missing keys default to selected (true).
  function getSelection() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(SEL_KEY) || '{}') || {}; } catch (_) { stored = {}; }
    const sel = {};
    for (const r of REPORTS) sel[r.key] = stored[r.key] !== false;
    return sel;
  }
  function setSelected(key, on) {
    const sel = getSelection();
    sel[key] = !!on;
    try { localStorage.setItem(SEL_KEY, JSON.stringify(sel)); } catch (_) {}
  }

  // ───────────────── Logging ─────────────────
  // Also feeds the full session log (defined below) so lifecycle events that
  // only ever went to the console before — Stop/reset, aborts, standby — are
  // now in the downloadable log too.
  const log = (...args) => {
    console.log('[HistBot]', ...args);
    try {
      let t = ''; try { t = new Date().toLocaleTimeString(); } catch (_) {}
      const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      appendFullLog((t ? t + '  ' : '') + msg);
    } catch (_) {}
  };

  // Live activity log, persisted so it survives the page reloads between reports
  // (the panel shows the last ~50 lines: which report/year is processing, saves…).
  const LOG_KEY = 'histbot.log';
  function getLog() { try { const a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function clearLog() { try { localStorage.removeItem(LOG_KEY); } catch (_) {} renderLog(); }

  // Separate FULL log, kept apart from the 50-line display log above: it is
  // never trimmed to 50 lines and — unlike the display log — is NOT wiped by
  // Stop/Reset or by starting a new run. A long flow (e.g. E-Verify Case
  // Details across hundreds of pages) would otherwise lose most of its
  // history by the time it finishes, and Stop/Reset would erase the rest.
  // Only "Clear full log" in the panel empties it. Capped generously (5000
  // lines) purely as a localStorage-quota safety valve, not a normal limit.
  const FULL_LOG_KEY = 'histbot.fulllog';
  function appendFullLog(line) {
    let arr;
    try { arr = JSON.parse(localStorage.getItem(FULL_LOG_KEY) || '[]'); if (!Array.isArray(arr)) arr = []; } catch (_) { arr = []; }
    arr.push(line);
    while (arr.length > 5000) arr.shift();
    try { localStorage.setItem(FULL_LOG_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function clearFullLog() { try { localStorage.removeItem(FULL_LOG_KEY); } catch (_) {} }

  function uiLog(msg) {
    log(msg);
    let t = '';
    try { t = new Date().toLocaleTimeString(); } catch (_) {}
    const line = (t ? t + '  ' : '') + msg;
    const arr = getLog();
    arr.push(line);
    while (arr.length > 50) arr.shift();
    try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (_) {}
    appendFullLog(line);
    renderLog();
  }
  function renderLog() {
    if (!panelEl) return;
    const el = panelEl.querySelector('.hb-log');
    if (el) { el.textContent = getLog().join('\n'); el.scrollTop = el.scrollHeight; }
  }

  // ───────────────── Single-tab lock ─────────────────
  // Run state lives in shared localStorage, so TWO open Paycom tabs both resume
  // the queue and everything fires twice (7 generates became 14 — "found 15").
  // Only the lock-holding tab drives; any other tab stands by and takes over
  // only if the driver's heartbeat goes stale (tab closed / crashed).
  const TABID_KEY = 'histbot.tabid'; // sessionStorage: stable per TAB, survives reloads
  let TAB_ID = '';
  try {
    TAB_ID = sessionStorage.getItem(TABID_KEY) || String(Math.random()).slice(2, 12);
    sessionStorage.setItem(TABID_KEY, TAB_ID);
  } catch (_) { TAB_ID = String(Math.random()).slice(2, 12); }
  const LOCK_KEY = 'histbot.lock';
  // Chrome throttles timers in BACKGROUND tabs to roughly once a minute, so the
  // driver's heartbeat stops being punctual the moment the user looks at another
  // tab — it is not dead, just throttled. The old 8s staleness window treated
  // that as a crash: a second Paycom tab took over, and two tabs then drove the
  // same queue at once. That interleaved two reports on one form (Employee Punch
  // Change and Employee Rates by Allocation generated alternately), and the
  // files those runs claimed to save never reached disk. The window must
  // therefore sit comfortably above Chrome's ~60s throttled interval.
  const LOCK_STALE_MS = 120000;
  const readLock = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch (_) { return null; } };
  const heartbeat = () => { try { localStorage.setItem(LOCK_KEY, JSON.stringify({ id: TAB_ID, ts: Date.now() })); } catch (_) {} };
  function iAmDriver() {
    const l = readLock();
    if (!l || l.id === TAB_ID) return true;
    return (Date.now() - (l.ts || 0)) > LOCK_STALE_MS; // genuinely dead → take over
  }
  let hbTimer = null;
  function becomeDriver() {
    heartbeat();
    if (!hbTimer) hbTimer = setInterval(heartbeat, 2000);
    // Stamp the lock on every visibility flip too: the beat just before the tab
    // is backgrounded is the last punctual one it will get, and the beat when it
    // comes back should land immediately rather than waiting for the interval.
    if (!becomeDriver._vis) {
      becomeDriver._vis = () => { const l = readLock(); if (l && l.id === TAB_ID) heartbeat(); };
      document.addEventListener('visibilitychange', becomeDriver._vis);
    }
  }
  function releaseDriver() {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    const l = readLock();
    if (l && l.id === TAB_ID) { try { localStorage.removeItem(LOCK_KEY); } catch (_) {} }
  }

  // ───────────────── Cooperative abort ─────────────────
  // Stop simply flips state to IDLE; every long wait polls this and bails.
  const shouldAbort = () => !isRunning();

  const sleep = (ms) => new Promise((resolve, reject) => {
    const start = Date.now();
    (function tick() {
      if (shouldAbort()) { const e = new Error('Aborted during sleep'); e.aborted = true; return reject(e); }
      const remaining = ms - (Date.now() - start);
      if (remaining <= 0) return resolve();
      setTimeout(tick, Math.min(100, remaining));
    })();
  });

  function waitFor(predicate, { timeout = 30000, interval = 250, label = 'element' } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function tick() {
        if (shouldAbort()) { const e = new Error(`Aborted (was waiting for ${label})`); e.aborted = true; return reject(e); }
        let r; try { r = predicate(); } catch (_) { r = null; }
        if (r) return resolve(r);
        if (Date.now() - start > timeout) return reject(new Error(`Timed out waiting for ${label}`));
        setTimeout(tick, interval);
      })();
    });
  }

  // ───────────────── DOM helpers (ported from the main Paycom bot) ─────────────────
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const st = window.getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
  }

  function clickEl(el) {
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
    el.click();
  }

  function findVisibleByExactText(text) {
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,label,section,p,a')) {
      if (!visible(el)) continue;
      const direct = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim()).join('').trim();
      if (direct === text) return el;
    }
    return null;
  }

  // Paycom's date <input>s ignore a plain .value = — set via the prototype setter
  // and fire input/change/blur so the framework registers the change.
  function setInputValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function findRadioByLabel(text) {
    const target = text.toUpperCase();
    for (const el of document.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const direct = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim()).join('').trim();
      if (direct.toUpperCase() === target) {
        let walker = el;
        for (let i = 0; i < 5 && walker; i++) {
          const r = walker.querySelector && walker.querySelector('input[type="radio"]');
          if (r) return r;
          walker = walker.parentElement;
        }
      }
    }
    return null;
  }

  function findGenerateReportButton() {
    const all = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
      .filter(el => visible(el) && ((el.textContent || el.value || '').trim() === 'Generate Report'));
    if (all.length === 0) return null;
    all.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    return all[0];
  }

  function getDownloadButtons() {
    return Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
      .filter(el => {
        if (!visible(el)) return false;
        const text = (el.textContent || el.value || '').trim().toLowerCase();
        return text === 'download';
      });
  }

  // Two date <input>s sitting near the "Date Range" label, pre-filled MM/DD/YYYY.
  function findDateRangeInputs() {
    const label = findVisibleByExactText('Date Range');
    if (!label) return null;
    let container = label;
    for (let i = 0; i < 6 && container; i++) {
      container = container.parentElement;
      if (!container) break;
      const filled = Array.from(container.querySelectorAll('input[type="text"]'))
        .filter(inp => /\d{2}\/\d{2}\/\d{4}/.test(inp.value || ''));
      if (filled.length >= 2) return { from: filled[0], to: filled[1] };
      // Fallback: any two visible text inputs in this container (empty fields).
      const anyInputs = Array.from(container.querySelectorAll('input[type="text"]')).filter(visible);
      if (anyInputs.length >= 2) return { from: anyInputs[0], to: anyInputs[1] };
    }
    return null;
  }

  // The Employees "Select All" (topmost Select-All below the Employee Filters
  // header — Position Title's Select-All sits lower, so the topmost wins).
  function findEmployeeSelectAllCheckbox() {
    const header = findVisibleByExactText('Employee Filters');
    if (!header) return null;
    const headerTop = header.getBoundingClientRect().top;
    const candidates = Array.from(document.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => visible(cb) && cb.getBoundingClientRect().top > headerTop)
      .map(cb => {
        let walker = cb.parentElement;
        for (let i = 0; i < 4 && walker; i++) {
          const t = (walker.innerText || '').trim();
          if (/Select All/i.test(t) && t.length < 60) return { cb, top: cb.getBoundingClientRect().top };
          walker = walker.parentElement;
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top);
    return candidates[0]?.cb || null;
  }

  // ───────────────── Per-report flow ─────────────────
  // Output Format DOM (from a live inspect of #rpt_output):
  //   #rpt_output > div.smallMarginBottom
  //       > input[type=radio][name=rpt_output][value=N]
  //       > div.checkboxText > a.fbLink > div.filetype.<fmt>   (the visible pill)
  //   HTML=1 · CSV=2 · XLS=3 · XLSX=4 · PDF=5 · TXTCSV=7
  // A bare radio.click() didn't stick, so we click the pill's <a.fbLink>
  // (Paycom's own handler) AND hard-set the radio + fire change, matching the
  // format by its .filetype class (unambiguous).
  function outputRowFor(cls) {
    // Prefer a VISIBLE badge — some pages keep hidden duplicate copies in the
    // DOM (same trap as the ARW wizard), and ticking a hidden copy does nothing.
    const badges = Array.from(document.querySelectorAll(`#rpt_output .filetype.${cls}`));
    const badge = badges.find(visible) || badges[0];
    if (!badge) return null;
    const row = badge.closest('.smallMarginBottom') || badge.parentElement;
    const radio = row && row.querySelector('input[type="radio"][name="rpt_output"]');
    const link = badge.closest('a.fbLink');
    return { badge, row, radio, link };
  }

  // Report-center slug pages have NO #rpt_output container — their radios are
  // plain <input name="rpt_output" value="xlsx"> with STRING values (legacy
  // pages use numeric values inside #rpt_output). Verified live on the Salary
  // Time Off Absence Tracking form (CSV was default → files came out CSV).
  function slugOutputRadio(cls) {
    const r = document.querySelector(`input[type="radio"][name="rpt_output"][value="${cls}"]`);
    return (r && visible(r)) ? r : null;
  }

  function isExcelSelected() {
    const r = outputRowFor('xlsx') || outputRowFor('xls');
    if (r && r.radio) return !!r.radio.checked;
    const s = slugOutputRadio('xlsx') || slugOutputRadio('xls');
    return !!(s && s.checked);
  }

  function selectOutputFormat() {
    for (const cls of ['xlsx', 'xls']) {   // prefer XLSX, fall back to XLS
      const r = outputRowFor(cls);
      if (!r || !r.radio) continue;
      if (!r.radio.checked) { try { r.radio.click(); } catch (_) {} }   // native click on the real radio
      if (!r.radio.checked && r.link) clickEl(r.link);                  // then Paycom's pill link
      if (!r.radio.checked) {                                           // last resort: force + notify
        r.radio.checked = true;
        r.radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      log(`Output format → ${cls.toUpperCase()} (radio checked=${r.radio.checked})`);
      return r.radio.checked;
    }
    // Slug-page fallback (no #rpt_output): string-valued rpt_output radios.
    for (const cls of ['xlsx', 'xls']) {
      const s = slugOutputRadio(cls);
      if (!s) continue;
      if (!s.checked) { try { s.click(); } catch (_) {} }
      if (!s.checked) { s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true })); }
      log(`Output format → ${cls.toUpperCase()} via slug radio (checked=${s.checked})`);
      return s.checked;
    }
    log('WARN: XLSX/XLS output radio not found (#rpt_output missing?)');
    return false;
  }

  function ensureDateRangeMode() {
    const r = findRadioByLabel('Date Range');
    if (r && !r.checked) { clickEl(r); log('Date Range mode selected'); }
  }

  // The Generate button can render BEFORE the Date Range block on some forms
  // (Employee Dates got skipped in the same second it loaded), so wait for the
  // inputs instead of a one-shot lookup — re-asserting Date Range mode each poll.
  async function setDateRange(from, to) {
    const dr = await waitFor(() => {
      ensureDateRangeMode();
      const d = findDateRangeInputs();
      return (d && d.from && d.to) ? d : null;
    }, { timeout: 20000, interval: 400, label: 'Date Range inputs' });
    setInputValue(dr.from, from);
    setInputValue(dr.to, to);
    log(`Date range set: ${from} → ${to}`);
  }

  async function selectAllEmployees() {
    let cb = findEmployeeSelectAllCheckbox();
    if (!cb) {
      // Section may be collapsed — click the header to expand, then retry.
      const header = findVisibleByExactText('Employee Filters');
      if (header) { clickEl(header); await sleep(600); cb = findEmployeeSelectAllCheckbox(); }
    }
    if (!cb) { log('WARN: Employees "Select All" checkbox not found'); return; }
    if (!cb.checked) { clickEl(cb); log('Employees: Select All clicked'); await sleep(1500); }
    else log('Employees: Select All already checked');
  }

  // Find a report-option checkbox by its visible label text (e.g. "Show Effective
  // Date"). Matched by label — never by the raw id — so it works on every client.
  function findCheckboxByLabel(text) {
    const want = String(text).toLowerCase();
    for (const lb of document.querySelectorAll('label')) {
      if (!(lb.textContent || '').trim().toLowerCase().includes(want)) continue;
      const forId = lb.getAttribute('for');
      if (forId) { const cb = document.getElementById(forId); if (cb && cb.type === 'checkbox' && visible(cb)) return cb; }
      const inner = lb.querySelector('input[type="checkbox"]');
      if (inner && visible(inner)) return inner;
    }
    // Fallback: a checkbox whose nearby wrapper text contains the label.
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      if (!visible(cb)) continue;
      let walker = cb.parentElement;
      for (let i = 0; i < 3 && walker; i++) {
        const t = (walker.innerText || '').trim().toLowerCase();
        if (t.includes(want) && t.length < 60) return cb;
        walker = walker.parentElement;
      }
    }
    return null;
  }

  // Tick a report's extra option checkboxes (report.checks), e.g. Show Effective Date.
  async function tickChecks(labels) {
    if (!labels || !labels.length) return;
    for (const label of labels) {
      const cb = findCheckboxByLabel(label);
      if (!cb) { uiLog(`⚠ Checkbox not found: "${label}"`); continue; }
      if (!cb.checked) { clickEl(cb); uiLog(`Checked: ${label}`); await sleep(400); }
      else log(`Checkbox "${label}" already checked`);
    }
  }

  // ── Download with a proper filename ──────────────────────────────────────
  // Paycom's "Download" is a <button class="js-report-download"> (no href), so
  // we can't just fetch a link. Instead we mirror the main bot's technique:
  // clicking it fires a one-time-password XHR (…&transid=N); we hook XHR to grab
  // that transid and abort the request (so Paycom's own default-named download
  // never fires), then fetch rpt-generateproc.php?…&transid=N ourselves and save
  // the blob under our name. Falls back to a plain click if anything fails.
  // Passive nonce sniffer: Paycom's own JS carries session_nonce in its XHR /
  // fetch URLs (report generation, queue polling). Capture it as it flies by so
  // slug forms (e.g. Equifax TWN Feed) that never render the nonce in the DOM
  // still get named downloads. Purely observational — requests are never
  // modified, blocked, or delayed.
  let CAPTURED_NONCE = '';
  const NONCE_RE = /session_nonce=([A-Za-z0-9._\-]+)/;
  try {
    const _xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { const m = NONCE_RE.exec(String(url || '')); if (m) CAPTURED_NONCE = m[1]; } catch (_) {}
      return _xhrOpen.apply(this, arguments);
    };
    const _fetch = window.fetch;
    if (_fetch) window.fetch = function (input) {
      try {
        const u = (typeof input === 'string') ? input : ((input && input.url) || '');
        const m = NONCE_RE.exec(u); if (m) CAPTURED_NONCE = m[1];
      } catch (_) {}
      return _fetch.apply(this, arguments);
    };
  } catch (_) { /* sniffer is best-effort; never break the page */ }

  function getSessionNonce() {
    if (CAPTURED_NONCE) return CAPTURED_NONCE; // freshest: sniffed from Paycom's own requests
    // Paycom exposes session_nonce in different shapes across report forms:
    //   href/action query param:  session_nonce=abc
    //   JS / JSON in a <script>:   session_nonce: "abc"  |  "session_nonce":"abc"
    //   hidden input:              <input name="session_nonce" value="abc">
    // The old code matched only the bare `session_nonce=` param, so slug forms
    // (e.g. Equifax TWN Feed) fell back to Paycom's default-named download.
    const patterns = [
      /session_nonce=([A-Za-z0-9._\-]+)/,
      /["']?session_nonce["']?\s*[:=]\s*["']([A-Za-z0-9._\-]+)["']/i,
      /session_nonce["'\s:=]+([A-Za-z0-9._\-]{6,})/i,
    ];
    const tryHay = (hay) => { for (const re of patterns) { const m = (hay || '').match(re); if (m) return m[1]; } return ''; };
    for (const el of document.querySelectorAll('a[href*="session_nonce"], form[action*="session_nonce"], input[name*="session_nonce"]')) {
      const hit = tryHay((el.getAttribute('href') || '') + ' ' + (el.getAttribute('action') || '') + ' ' + (el.value || ''));
      if (hit) return hit;
    }
    return tryHay(location.href + ' ' + (document.documentElement.innerHTML || '') + ' ' + (document.cookie || ''));
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  // The actual file extension Paycom used (it may auto-switch XLSX→CSV for very
  // large reports), read from the report row's .filetype pill next to the button.
  function extForButton(btn) {
    const row = (btn.closest && (btn.closest('.recentReport') || btn.closest('.queued-item'))) || document;
    const ft = row.querySelector && row.querySelector('.filetype');
    if (ft) {
      const cls = Array.from(ft.classList).find(c => c !== 'filetype');
      if (cls) return cls === 'txtcsv' ? 'csv' : cls;
    }
    return 'xlsx';
  }

  // The report's transid lives right in the DOM: the row wrapping the Download
  // button is <div id="queued-report-<transid>">. So we don't need to click the
  // button or intercept any XHR — we read the transid and fetch the file straight
  // from rpt-generateproc.php. That means exactly ONE file, with OUR name, and no
  // Paycom-side (default-named) duplicate.
  function transidForButton(btn) {
    const item = btn.closest && btn.closest('[id^="queued-report-"]');
    if (item) { const m = /queued-report-(\d+)/.exec(item.id || ''); if (m) return m[1]; }
    // ARW Recent-Reports tab: the Download control is an <a> (or wraps one) whose
    // href / onclick carries transid=<n> — read it there so the file still gets
    // OUR name instead of falling back to Paycom's default download.
    const hay = [
      btn.getAttribute && btn.getAttribute('href'),
      btn.getAttribute && btn.getAttribute('onclick'),
      btn.href,
      (btn.closest && btn.closest('a[href]') || {}).href,
      (btn.querySelector && btn.querySelector('a[href]') || {}).href,
    ];
    for (const h of hay) { if (h) { const m = /transid[=\/_-](\d{4,})/i.exec(h); if (m) return m[1]; } }
    let n = btn;
    for (let i = 0; n && i < 8; i++) { const m = /(?:report|transid)[-=_]?(\d{5,})/i.exec(n.id || ''); if (m) return m[1]; n = n.parentElement; }
    return '';
  }

  // Report-center pages (slug reports like Equifax TWN Feed) have NO
  // session_nonce anywhere — their Download works differently: the Download
  // button carries a jQuery data('url') template ('…/report-center/download/{{ID}}')
  // and the .queued-item row carries data('id') (the transid). Paycom's own
  // handler substitutes and navigates. We substitute, fetch with cookies, and
  // save under OUR name. Verified live: GET web.php/report-center/download/<id>
  // → 200 application/octet-stream. Returns true on success; false = caller
  // falls back to the legacy transid+nonce path.
  async function tryReportCenterDownload(btn, fileName) {
    try {
      const $ = window.jQuery || window.$;
      // Row id via jQuery data first, else the queued-report-<id> DOM id (works
      // even when the page's jQuery data store isn't populated).
      let id = '', tmpl = '';
      if ($) {
        const $btn = $(btn);
        const item = $btn.closest('.queued-item');
        if (item.length) id = String(item.data('id') || '');
        tmpl = String($btn.data('url') || '');
      }
      if (!id) {
        const row = btn.closest && btn.closest('[id^="queued-report-"]');
        const m = row && /queued-report-(\d+)/.exec(row.id || '');
        if (m) id = m[1];
      }
      if (!id) return false;
      let url;
      if (tmpl && tmpl.includes('{{ID}}')) {
        url = tmpl.replace('{{ID}}', id);
      } else if (location.href.includes('/report-center/generate/')) {
        // Slug page whose Download button carries no data('url') template (seen
        // live on Salary Time Off Absence Tracking): the download endpoint is
        // fixed — web.php/report-center/download/<id> (verified 200 octet-stream).
        url = '/v4/cl/web.php/report-center/download/' + id;
      } else {
        return false; // legacy rpt-generate page → use the transid+nonce path
      }
      if (!/^https?:/i.test(url)) { if (!url.startsWith('/')) url = '/' + url; url = location.origin + url; }
      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), 180000);
      const resp = await fetch(url, { credentials: 'include', signal: ctrl.signal });
      clearTimeout(killer);
      if (!resp.ok) { log('report-center download HTTP ' + resp.status + ' — falling back'); return false; }
      const blob = await resp.blob();
      if (blob.size <= 512 || /text\/html/i.test(blob.type || '')) { log('report-center download gave unexpected content — falling back'); return false; }
      saveBlob(blob, fileName);
      uiLog(`✓ Saved ${fileName} (${Math.round(blob.size / 1024)} KB)`);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function downloadNewest(baseName) {
    const dls = getDownloadButtons().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const btn = dls[0];
    if (!btn) throw new Error('No Download button found');
    return downloadViaButton(btn, baseName);
  }

  // Download the report behind a SPECIFIC Download button, saved as <baseName>.<ext>.
  async function downloadViaButton(btn, baseName) {
    const fileName = `${baseName}.${extForButton(btn)}`;

    // Report-center style first (slug reports); falls through to legacy path.
    if (await tryReportCenterDownload(btn, fileName)) { return; }

    const transid = transidForButton(btn);
    const nonce = getSessionNonce();

    if (transid && nonce) {
      const url = 'https://www.paycomonline.net/v4/cl/rpt-generateproc.php'
        + `?session_nonce=${encodeURIComponent(nonce)}&download=1&transid=${encodeURIComponent(transid)}`;
      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), 180000);
      try {
        const resp = await fetch(url, { credentials: 'include', signal: ctrl.signal });
        clearTimeout(killer);
        if (resp.ok) {
          const blob = await resp.blob();
          const isHtml = /text\/html/i.test(blob.type || '');
          if (blob.size > 512 && !isHtml) {
            saveBlob(blob, fileName);
            uiLog(`✓ Saved ${fileName} (${Math.round(blob.size / 1024)} KB)`);
            return;
          }
          uiLog(`⚠ generateproc gave unexpected content (${blob.type || 'no-type'}, ${blob.size}B) — using Paycom download`);
        } else {
          uiLog(`⚠ generateproc HTTP ${resp.status} — using Paycom download`);
        }
      } catch (e) {
        clearTimeout(killer);
        uiLog('⚠ generateproc fetch failed — using Paycom download: ' + (e && e.message));
      }
    } else {
      uiLog(`⚠ Missing ${!transid ? 'transid' : 'session_nonce'} — using Paycom download (default name)`);
    }
    clickEl(btn); // fallback: Paycom's own download (default filename)
  }

  // Is there any XLSX/XLS output control on this form at all? (Some fixed-format
  // pages have none — those generate XLSX regardless and must not be blocked.)
  const hasExcelOutputControl = () =>
    !!(outputRowFor('xlsx') || outputRowFor('xls') || slugOutputRadio('xlsx') || slugOutputRadio('xls'));

  // Set Output Format LAST — right before Generate. "Select All" employees and
  // date changes re-render the form and reset Output Format back to HTML.
  // On slow forms (Employee Punch Change, 395 employees) that re-render can
  // land AFTER a one-shot set + check, so LOCK the format: set, settle, and
  // re-verify until XLSX survives the settle window. Generating in HTML is
  // never acceptable — Paycom redirects HTML reports to a view page, which
  // derails the whole queue — so if we can't lock XLSX, skip this report.
  async function lockExcelOutput(tag) {
    if (hasExcelOutputControl()) {
      let locked = false;
      for (let i = 0; i < 5 && !locked; i++) {
        selectOutputFormat();
        await sleep(400);
        if (isExcelSelected()) {
          await sleep(700); // survive a late re-render
          locked = isExcelSelected();
        }
        if (!locked) log(`Excel not locked yet (try ${i + 1}/5)`);
      }
      if (!locked) throw new Error(`${tag}: could not lock XLSX output format (form keeps reverting)`);
    } else {
      selectOutputFormat(); // logs a WARN; fixed-format pages proceed fine
      await sleep(300);
    }
  }

  // Click Generate with a FINAL fully-synchronous format assert — no awaits
  // between the check and the click, so no async re-render can flip the format
  // back to HTML in between.
  function clickGenerateAsserted(tag, gen) {
    if (hasExcelOutputControl() && !isExcelSelected()) {
      selectOutputFormat();
      if (!isExcelSelected()) throw new Error(`${tag}: XLSX reverted right before Generate — skipped to avoid an HTML run`);
    }
    clickEl(gen);
  }

  async function generateAndDownload(tag, baseName) {
    await lockExcelOutput(tag);

    const initial = getDownloadButtons().length;
    const gen = findGenerateReportButton();
    if (!gen) throw new Error(`${tag}: Generate Report button not found`);
    showBanner(`${tag}: generating…`);
    uiLog(`${tag}: generating…`);
    clickGenerateAsserted(tag, gen);
    // 30 min: the biggest quarters (Punch Change 2025-Q4, ~71k rows) can take
    // over 10 minutes to generate on Paycom's side — 10 min timed out for real.
    await waitFor(() => getDownloadButtons().length > initial, {
      timeout: 30 * 60 * 1000, interval: 800, label: `${tag} Download button`,
    });
    await downloadNewest(baseName);
    resetAttempt(getIndex()); // real progress → this report isn't redirect-looping
    await sleep(2500); // let the download commit before the next generate/navigation
  }

  // ── Pipelined multi-range flow: queue ALL ranges first, download as ready ──
  // Generating takes minutes per range; firing every Generate up-front lets
  // Paycom build all of them in parallel, and we harvest the Download buttons
  // as they appear. Mapping is by each queue row's creation TIMESTAMP: right
  // after clicking Generate we wait for the new row's timestamp to show up and
  // remember "that timestamp = this range" — so files get the right label no
  // matter what order the reports finish in.
  const QUEUE_STAMP_RE = /\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M/;
  function scanQueueStamps() {
    const out = new Map(); // stamp text -> smallest row-ish element containing it
    for (const el of document.querySelectorAll('div, li, tr')) {
      const t = el.innerText || '';
      if (!t || t.length > 600) continue;
      const m = t.match(QUEUE_STAMP_RE);
      if (m) out.set(m[0], el); // doc order: children overwrite parents → smallest block wins
    }
    return out;
  }
  // The stamp usually matches a tiny inner element (just the timestamp text);
  // the row's Download button lives several ancestors up. Walk upward until an
  // ancestor holds exactly ONE Download control — and stop the moment the
  // ancestor spans MORE than one timestamp (that's the whole-list container,
  // where picking a button would grab some OTHER row's file).
  function downloadButtonInRow(row) {
    const allStampsRe = new RegExp(QUEUE_STAMP_RE.source, 'g');
    let n = row;
    for (let i = 0; i < 8 && n; i++) {
      const stamps = ((n.innerText || '').match(allStampsRe) || []).length;
      if (stamps > 1) return null; // walked past the row into the list container
      const btns = Array.from(n.querySelectorAll('button, a, input[type="button"]')).filter(el =>
        visible(el) && (el.textContent || el.value || '').trim().toLowerCase() === 'download');
      if (btns.length === 1) return btns[0];
      n = n.parentElement;
    }
    return null;
  }

  // '08/06/2026 01:01:15 PM' → epoch ms (row creation time; TZ suffix ignored —
  // only the ORDER matters and all rows share one TZ).
  function parseStamp(s) {
    const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+([AP]M)/.exec(s);
    if (!m) return 0;
    let h = parseInt(m[4], 10) % 12; if (m[7] === 'PM') h += 12;
    return new Date(+m[3], +m[1] - 1, +m[2], h, +m[5], +m[6]).getTime();
  }

  // Wait until the queue list has finished (lazily) rendering: the stamp count
  // must hold steady across several polls. Without this the baseline right
  // after a page load misses the old rows (they render late), and they then
  // get counted as OURS — "expected 7, found 12" — wrecking the mapping.
  async function settledQueueStamps(maxMs = 15000) {
    let last = -1, stable = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const n = scanQueueStamps().size;
      if (n === last) { if (++stable >= 3) break; } else { stable = 0; last = n; }
      await sleep(450);
    }
    return scanQueueStamps();
  }

  // Pipeline state, persisted across page reloads: once the queue phase has
  // fired all Generates, a reload must NOT re-queue 7 duplicates — it should
  // resume watching for the same rows. Keyed by queue index.
  const PIPE_KEY = 'histbot.pipe';
  const getPipe = () => { try { return JSON.parse(localStorage.getItem(PIPE_KEY) || 'null'); } catch (_) { return null; } };
  const setPipe = (o) => { try { localStorage.setItem(PIPE_KEY, JSON.stringify(o)); } catch (_) {} };
  const clearPipe = () => { try { localStorage.removeItem(PIPE_KEY); } catch (_) {} };

  async function handleReportPipelined(report, ranges) {
    const qIdx = getIndex();
    const saved = getPipe();
    if (saved && saved.idx === qIdx && Array.isArray(saved.map) && saved.map.length) {
      // Queue phase already ran (we reloaded mid-harvest) — just resume downloads.
      uiLog(`▶ ${report.name} — resuming: waiting on ${saved.map.length} already-queued range(s)`);
      await harvestPipeline(report, new Map(saved.map), qIdx);
      return;
    }

    uiLog(`▶ ${report.name} — queueing ${ranges.length} ranges, downloading as they finish`);
    // Identity invariant: pre-existing junk rows are always OLDER (by their
    // creation timestamp) than anything this run creates — no baseline set
    // needed, and junk rows that lazily render mid-run can't poison anything.
    // Our rows = the ranges.length NEWEST stamps, which in chronological order
    // exactly follow generate order.
    for (let i = 0; i < ranges.length; i++) {
      if (!isRunning()) return;
      const rng = ranges[i];
      const from = resolveDate(rng.from), to = resolveDate(rng.to);
      const tag = `${report.name} ${rng.label}`;
      showBanner(`${tag}: queueing (${i + 1}/${ranges.length})…`);
      await setDateRange(from, to);
      await sleep(300);
      if (i === 0) { // employees + options stick across generates on the same form
        if (report.selectAll !== false) { await selectAllEmployees(); await sleep(400); }
        await tickChecks(report.checks);
      }
      await lockExcelOutput(tag);
      const gen = await waitFor(() => findGenerateReportButton(), { timeout: 15000, label: `${tag} Generate button` });
      // Newest stamp BEFORE this click — the new row must beat it.
      let prevMax = 0;
      for (const s of scanQueueStamps().keys()) prevMax = Math.max(prevMax, parseStamp(s));
      clickGenerateAsserted(tag, gen);
      uiLog(`${tag}: queued`);
      // Wait for a strictly NEWER stamp to appear before touching the form
      // again — it also guarantees consecutive ranges land on distinct seconds.
      try {
        await waitFor(() => {
          for (const s of scanQueueStamps().keys()) if (parseStamp(s) > prevMax) return true;
          return false;
        }, { timeout: 25000, interval: 500, label: `${tag} queue row` });
      } catch (e) {
        if (e && e.aborted) throw e;
        uiLog(`⚠ ${tag}: queue row slow to appear — continuing`);
      }
      await sleep(1600);
    }

    // Map rows → labels: the newest ranges.length stamps, oldest→newest =
    // generate order. Older (junk) rows fall out no matter when they rendered.
    const all = Array.from((await settledQueueStamps()).keys())
      .sort((a, b) => parseStamp(b) - parseStamp(a));       // newest first
    const ours = all.slice(0, ranges.length).reverse();      // generate order
    if (ours.length < ranges.length)
      uiLog(`⚠ ${report.name}: only ${ours.length}/${ranges.length} queue rows visible — mapping what's there`);
    const stampToLabel = new Map();
    for (let i = 0; i < ours.length; i++) stampToLabel.set(ours[i], ranges[i].label);
    setPipe({ idx: qIdx, map: Array.from(stampToLabel) }); // survive a reload mid-harvest

    await harvestPipeline(report, stampToLabel, qIdx);
  }

  // Harvest: poll the queue; whenever a mapped row's Download button appears,
  // fetch it under its range's label. Order of completion doesn't matter. Each
  // finished download is struck off the persisted state, so a reload resumes
  // with only the remaining ranges.
  async function harvestPipeline(report, stampToLabel, qIdx) {
    const done = new Set();
    const t0 = Date.now();
    while (done.size < stampToLabel.size) {
      if (!isRunning()) return;
      if (Date.now() - t0 > 30 * 60 * 1000) {
        const missing = Array.from(stampToLabel.entries()).filter(([s]) => !done.has(s)).map(([, l]) => l);
        clearPipe();
        throw new Error(`${report.name}: timed out waiting for ${missing.join(', ')}`);
      }
      const rows = scanQueueStamps();
      for (const [stamp, label] of stampToLabel) {
        if (done.has(stamp)) continue;
        const row = rows.get(stamp);
        const btn = row && downloadButtonInRow(row);
        if (!btn) continue;
        showBanner(`${report.name} ${label}: downloading…`);
        await downloadViaButton(btn, `${report.fileBase}_${label}`);
        done.add(stamp);
        setPipe({ idx: qIdx, map: Array.from(stampToLabel).filter(([s]) => !done.has(s)) });
        await sleep(2000); // let the download commit
      }
      const left = stampToLabel.size - done.size;
      if (left) { showBanner(`${report.name}: ${left} report(s) still generating…`); await sleep(4000); }
    }
    clearPipe();
    showBanner(`✓ ${report.name} — all ${stampToLabel.size} ranges downloaded`, true);
    uiLog(`✓ ${report.name}: all ${stampToLabel.size} ranges downloaded`);
  }

  // For reports with pickRanges: ask WHICH ranges to run (all ticked by
  // default). Lets the user untick already-downloaded quarters after a partial
  // run instead of re-generating everything. Resolves null = skip the report.
  function showRangePickDialog(report, ranges) {
    return new Promise((resolve) => {
      document.getElementById('histbot-rangepick')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'histbot-rangepick';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:400px;width:92%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.35);';
      const title = document.createElement('h3');
      title.textContent = `${report.name} — which ranges?`;
      title.style.cssText = 'margin:0 0 4px;color:#0b7dda;font-size:16px;';
      const sub = document.createElement('div');
      sub.textContent = 'Untick the ones you already downloaded — only ticked ranges will be generated.';
      sub.style.cssText = 'color:#666;font-size:12px;margin-bottom:12px;';
      const list = document.createElement('div');
      list.style.cssText = 'flex:1;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;padding:6px 12px;margin-bottom:14px;';
      const cbs = ranges.map((rng, i) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;padding:7px 0;cursor:pointer;border-bottom:1px solid #f0f0f0;';
        if (i === ranges.length - 1) row.style.borderBottom = 'none';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = true;
        cb.style.cssText = 'margin-right:10px;transform:scale(1.15);flex:0 0 auto;';
        const t = document.createElement('span');
        t.textContent = `${rng.label}  (${resolveDate(rng.from)} → ${resolveDate(rng.to)})`;
        t.style.cssText = 'flex:1;color:#333;';
        row.appendChild(cb); row.appendChild(t); list.appendChild(row);
        return cb;
      });
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
      const cancel = document.createElement('button');
      cancel.textContent = 'Skip report';
      cancel.style.cssText = 'padding:9px 18px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px;';
      cancel.onclick = () => { overlay.remove(); resolve(null); };
      const ok = document.createElement('button');
      ok.textContent = 'Run selected';
      ok.style.cssText = 'padding:9px 18px;border:0;background:#0b7dda;color:#fff;border-radius:5px;cursor:pointer;font-weight:600;font-size:13px;';
      ok.onclick = () => {
        const chosen = ranges.filter((_, i) => cbs[i].checked);
        if (!chosen.length) { alert('Select at least one range, or click "Skip report".'); return; }
        overlay.remove(); resolve(chosen);
      };
      btns.appendChild(cancel); btns.appendChild(ok);
      box.appendChild(title); box.appendChild(sub); box.appendChild(list); box.appendChild(btns);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  // For wizard reports offering an either/or choice (one combined pull vs one
  // pull per year) rather than a free-pick checklist. By convention ranges[0]
  // is the combined option and the rest are the per-year split. Resolves to
  // the chosen range array, or null (Skip report).
  function showRangeModeDialog(report, ranges) {
    const combined = ranges[0];
    const yearly = ranges.slice(1);
    return new Promise((resolve) => {
      document.getElementById('histbot-rangemode')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'histbot-rangemode';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:440px;width:92%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.35);';
      const title = document.createElement('h3');
      title.textContent = `${report.name} — how do you want to download it?`;
      title.style.cssText = 'margin:0 0 4px;color:#0b7dda;font-size:16px;';
      const sub = document.createElement('div');
      sub.textContent = 'Both options give you the exact same data — only the number of files is different.';
      sub.style.cssText = 'color:#666;font-size:12px;margin-bottom:14px;';

      const groupName = 'histbot-rangemode-choice';
      function makeOption(value, checked, headline, detail) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:10px 10px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:10px;cursor:pointer;';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = groupName; radio.value = value; radio.checked = checked;
        radio.style.cssText = 'margin-top:3px;transform:scale(1.15);flex:0 0 auto;';
        const textWrap = document.createElement('div');
        const h = document.createElement('div');
        h.textContent = headline;
        h.style.cssText = 'font-weight:600;color:#222;margin-bottom:4px;';
        const d = document.createElement('div');
        d.textContent = detail;
        d.style.cssText = 'color:#666;font-size:12px;line-height:1.45;';
        textWrap.appendChild(h); textWrap.appendChild(d);
        row.appendChild(radio); row.appendChild(textWrap);
        row.onclick = () => { radio.checked = true; };
        return { row, radio };
      }

      const combinedDates = `${resolveDate(combined.from)} → ${resolveDate(combined.to)}`;
      const yearlyExamples = yearly.map(r => `${report.fileBase}_${r.label}.xlsx`).join(', ');

      const opt1 = makeOption('combined', true,
        '⚡ Combined — 1 file',
        `Everything from ${combinedDates} in a single file. This is the quicker option, so try it first. `
        + `If Paycom keeps loading for a very long time or the download fails (this happens with clients that have a lot of employees), come back and choose the other option instead. `
        + `You'll get: ${report.fileBase}_Combined.xlsx`);
      const opt2 = makeOption('peryear', false,
        `📅 Year by year — ${yearly.length} separate files`,
        `The same data, just split into one file per year (${yearly.map(r => r.label).join(', ')}). `
        + `It takes longer overall, because the report is built ${yearly.length} times instead of once — but each file is much smaller, so it is far less likely to get stuck or fail. `
        + `Choose this for a big client, or if "Combined" did not work. `
        + `You'll get: ${yearlyExamples}`);

      const list = document.createElement('div');
      list.appendChild(opt1.row); list.appendChild(opt2.row);

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:4px;';
      const cancel = document.createElement('button');
      cancel.textContent = 'Skip report';
      cancel.style.cssText = 'padding:9px 18px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px;';
      cancel.onclick = () => { overlay.remove(); resolve(null); };
      const ok = document.createElement('button');
      ok.textContent = 'Run';
      ok.style.cssText = 'padding:9px 18px;border:0;background:#0b7dda;color:#fff;border-radius:5px;cursor:pointer;font-weight:600;font-size:13px;';
      ok.onclick = () => {
        const picked = opt1.radio.checked ? 'combined' : 'peryear';
        overlay.remove();
        resolve(picked === 'combined' ? [combined] : yearly);
      };
      btns.appendChild(cancel); btns.appendChild(ok);

      box.appendChild(title); box.appendChild(sub); box.appendChild(list); box.appendChild(btns);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  // Runs both years (last + current) on the same report page, no reload between them.
  async function handleReport(report) {
    showBanner(`${report.name}: loading form…`);
    await waitFor(() => findGenerateReportButton(), {
      timeout: 30000, label: `${report.name} report form`,
    });
    uiLog(`▶ ${report.name}`);

    // Snapshot reports (e.g. Historical Accrual Data): XLSX-only, no Date Range,
    // all-employees by default → a single file, no per-year loop.
    if (report.snapshot) {
      if (!isRunning()) return;
      showBanner(`${report.name}: setting up…`);
      if (report.selectAll !== false) { await selectAllEmployees(); await sleep(400); }
      await tickChecks(report.checks);
      await generateAndDownload(report.name, report.fileBase); // single file, no year suffix
      showBanner(`✓ ${report.name} downloaded`, true);
      return;
    }

    // Date-range reports: one file per range. Default = last + current year; a
    // report can override with its own `ranges` (e.g. HR & Audit's <last>→today).
    // STRICTLY SERIAL — generate one range, wait for ITS download, save it under
    // its label, then move to the next. The queue-all-then-harvest pipeline was
    // tried (v0.20.x–0.21.x) and repeatedly mislabeled files (late-rendering
    // junk rows, iframes, duplicate copies); serial is slower but can't mix
    // labels up: the newest Download button right after OUR generate is OURS.
    let ranges = report.ranges || YEARS;
    if (report.pickRanges && ranges.length > 1) {
      hideBanner();
      const chosen = await showRangePickDialog(report, ranges);
      if (!chosen) { uiLog(`↷ ${report.name}: skipped by user`); return; }
      uiLog(`${report.name}: running ${chosen.length}/${ranges.length} range(s): ${chosen.map(r => r.label).join(', ')}`);
      ranges = chosen;
    }
    for (const rng of ranges) {
      if (!isRunning()) return;
      const from = resolveDate(rng.from), to = resolveDate(rng.to);
      const tag = `${report.name} ${rng.label}`;
      showBanner(`${tag}: setting up…`);
      await setDateRange(from, to); // waits for the inputs (they can render late)
      await sleep(300);
      if (report.selectAll !== false) { await selectAllEmployees(); await sleep(400); }
      await tickChecks(report.checks); // extra option checkboxes, e.g. Show Effective Date
      // Output format is set inside generateAndDownload (last, so it can't be
      // reset by the Select-All re-render).
      await generateAndDownload(tag, `${report.fileBase}_${rng.label}`);
    }
    const summary = ranges.length === 1 ? ranges[0].label : ranges.map(r => r.label).join(' + ');
    showBanner(`✓ ${report.name} — ${summary} downloaded`, true);
  }

  // ── Loop guard ──────────────────────────────────────────────────────────
  // A report whose page redirects on completion (instead of showing an inline
  // Download button) would make the bot re-navigate + re-generate forever. We
  // count how many times we land on a report to run it; too many = abort.
  const ATT_KEY = 'histbot.attempts';
  function bumpAttempt(idx) {
    let a = {};
    try { a = JSON.parse(localStorage.getItem(ATT_KEY) || '{}') || {}; } catch (_) { a = {}; }
    a[idx] = (a[idx] || 0) + 1;
    try { localStorage.setItem(ATT_KEY, JSON.stringify(a)); } catch (_) {}
    return a[idx];
  }
  const clearAttempts = () => { try { localStorage.removeItem(ATT_KEY); } catch (_) {} };
  // Called after every successful download: the loop guard exists to catch a
  // report whose page REDIRECTS on completion (it would otherwise re-generate
  // forever), but a big multi-range report legitimately re-lands on its own page
  // a few times over a 20-minute run. Counting those as failed attempts skipped
  // Employee Punch Change mid-way (Q1-Q3 saved, then "redirects instead of an
  // inline Download" and it jumped to the next report). Any produced file proves
  // the page is NOT redirect-looping, so the budget starts fresh.
  function resetAttempt(idx) {
    let a = {};
    try { a = JSON.parse(localStorage.getItem(ATT_KEY) || '{}') || {}; } catch (_) { a = {}; }
    if (a[idx]) { delete a[idx]; try { localStorage.setItem(ATT_KEY, JSON.stringify(a)); } catch (_) {} }
  }

  // ═════════════════ Advanced Report Writer (multi-step wizard) ═════════════════
  // For custom reports built via the ARW (e.g. the 3-year Prior Payroll). Flow,
  // mirrored from the main Paycom bot's Census mode:
  //   any page → srw-reportwriter-savedReport.php (ARW landing)
  //   landing  → click "Create New Report" → pick the report type → wizard page
  //   wizard   → drive steps 1-5 in one context (SPA) → Generate → recent-reports
  //   recent   → download the generated file with our name → advance the queue
  const ARW_SAVED_URL = 'https://www.paycomonline.net/v4/cl/srw-reportwriter-savedReport.php?src=rptcenter&override-report-hub=1';

  function normalizeText(s) {
    return (s || '').replace(/ /g, ' ').replace(/[#_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function findByText(selectors, text) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const want = text.toLowerCase();
    for (const sel of list) for (const el of document.querySelectorAll(sel)) {
      if ((el.innerText || el.textContent || '').trim().toLowerCase() === want) return el;
    }
    for (const sel of list) for (const el of document.querySelectorAll(sel)) {
      if ((el.innerText || el.textContent || '').trim().toLowerCase().includes(want)) return el;
    }
    return null;
  }
  const getAllFilterCheckboxes = () => Array.from(document.querySelectorAll('input.filterCheckbox[type="checkbox"]'));
  const checkboxKey = (cb) => normalizeText(cb.getAttribute('aria-label') || cb.value || cb.getAttribute('value') || '');
  const isOnRecentReportsTab = () =>
    location.href.includes('/srw-reportwriter-savedReport.php') && location.search.includes('tab-index-advRptTab=1');

  // The active wizard step number, read from the step tab bar (reliable):
  //   <li class="tab completed tabActive" tabvalue="3. Filters">
  function currentWizardStep() {
    const a = document.querySelector('li.tab.tabActive');
    const m = a && (a.getAttribute('tabvalue') || '').match(/^(\d)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  // The wizard "Next" is <input class="js-button-next" value="Next">. Target that
  // class directly (the field lists have their own paginated "Next" links too).
  function findWizardNext() {
    const byClass = Array.from(document.querySelectorAll('.js-button-next')).find(x => visible(x) && !x.disabled);
    if (byClass) return byClass;
    const c = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'))
      .filter(el => visible(el) && !el.disabled && (el.value || el.innerText || el.textContent || '').trim() === 'Next');
    c.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return c[0] || null;
  }
  async function clickWizardNext(label) {
    const nx = await waitFor(() => findWizardNext(), { timeout: 15000, label: `${label} "Next" button` });
    clickEl(nx);
  }

  // Paycom loads each wizard step's fields via AJAX and re-renders a beat later,
  // so acting the instant the step tab flips misses everything. Resolve only once
  // the visible interactive-element count has held steady across several polls —
  // a cheap "the render finished" signal. Every long pause is abort-aware.
  async function settleDom(maxMs = 9000) {
    let last = -1, stable = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const n = document.querySelectorAll('input, .js-button-next, div[id^="prbox"]').length;
      if (n > 0 && n === last) { if (++stable >= 3) return; } else { stable = 0; last = n; }
      await sleep(220);
    }
  }
  // Wait until the wizard is truly on step `n` (tab active) AND its content has
  // settled. Optionally also wait for a per-step "ready" predicate.
  async function waitForWizardStep(n, label, ready) {
    await waitFor(() => currentWizardStep() === n, { timeout: 30000, label });
    if (ready) await waitFor(ready, { timeout: 25000, label: `${label} content` });
    await settleDom();
  }

  // The label for a field checkbox: aria-label / value first, else the nearest
  // enclosing row's text (some boxes render the name as sibling text, not aria).
  function fieldCheckboxLabel(cb) {
    const direct = cb.getAttribute('aria-label') || cb.value || cb.getAttribute('value') || '';
    if (direct && direct.trim()) return normalizeText(direct);
    let w = cb.parentElement;
    for (let i = 0; i < 3 && w; i++) {
      const t = (w.innerText || w.textContent || '').trim();
      if (t && t.length < 60) return normalizeText(t);
      w = w.parentElement;
    }
    return '';
  }
  // Step 1 — select specific fields by name across the field categories. Only
  // VISIBLE checkboxes count: Paycom keeps hidden duplicate copies in the DOM, and
  // ticking a hidden copy leaves the real form empty.
  async function wizardSelectFields(names) {
    const wanted = names.map(normalizeText);
    const found = new Set();
    const boxes = getAllFilterCheckboxes().filter(visible);
    for (const cb of boxes) {
      const key = fieldCheckboxLabel(cb);
      if (wanted.includes(key)) {
        found.add(key);
        if (!cb.checked) { clickEl(cb); uiLog(`  + field: ${cb.getAttribute('aria-label') || cb.value || key}`); await sleep(200); }
      }
    }
    for (const w of wanted) if (!found.has(w)) uiLog(`⚠ Step-1 field not found: "${w}" (visible boxes: ${boxes.length})`);
  }

  // Step 2 — each payroll field category is a div#prbox<N>.payroll with a
  // .filterSelectAll > input[name="selectcheck"]. Tick every one EXCEPT the
  // "Calculated Fields" box. Clicking a Select-All re-renders the Selected-Fields
  // panel (invalidating stale element refs), so we re-query FRESH each attempt
  // and verify + retry per category.
  // The Select-All checkbox that belongs to a specific box element.
  const boxSelectAll = (box) => box && box.querySelector('.filterSelectAll input[type="checkbox"]');
  async function wizardSelectAllCategories() {
    // CRITICAL: Paycom renders a hidden DUPLICATE of every payroll box (the page
    // shows two identical stacked panels). getElementById + naive querySelectorAll
    // hit the hidden copies too — ticking those leaves the real form empty and
    // still reports success. Work ONLY with VISIBLE box elements, by reference.
    const boxes = Array.from(document.querySelectorAll('div[id^="prbox"].payroll'))
      .filter(b => visible(b) && !(b.innerText || '').toLowerCase().includes('calculated field'));
    uiLog(`  payroll categories: ${boxes.length} visible (${boxes.map(b => b.id).join(', ')})`);
    if (!boxes.length) { uiLog('⚠ No visible payroll category boxes (div.payroll)'); return; }
    // A Select-All click can silently REVERT while a category's field list is still
    // loading, so sweep repeatedly (re-clicking any that fell back off) with a
    // settle delay until every VISIBLE category truly sticks.
    const isOn = (box) => { const c = boxSelectAll(box); return !!(c && c.checked); };
    for (let sweep = 0; sweep < 8; sweep++) {
      const remaining = boxes.filter(b => !isOn(b));
      if (!remaining.length) break;
      for (const box of remaining) {
        const cb = boxSelectAll(box);
        if (cb && !cb.checked) { clickEl(cb); await sleep(500); }
      }
      await sleep(1000); // let any reverts settle before re-checking
    }
    const done = boxes.filter(isOn);
    uiLog(`  Select All → ${done.length}/${boxes.length} categories`);
    const miss = boxes.filter(b => !isOn(b)).map(b => b.id);
    if (miss.length) uiLog(`  ✕ still off: ${miss.join(', ')}`);
  }

  // Step 5 (Review) — output XLSX, Checks distribution (reveals Period Start/End),
  // check those, set Specific Date Range dates, then Generate.
  async function configureReviewAndGenerate(report, range) {
    const xlsx = document.getElementById('outputFileFormat3') || (outputRowFor('xlsx') && outputRowFor('xlsx').radio);
    if (xlsx && !xlsx.checked) { xlsx.click(); uiLog('  output: XLSX'); await sleep(300); }

    const checks = document.getElementById('prlaboroption1');
    if (checks && !checks.checked) { checks.click(); uiLog('  distribution: Checks'); await sleep(700); }

    const ps = document.getElementById('chkPeriodStartDate');
    if (ps && !ps.checked) { ps.click(); uiLog('  ✓ Period Start Date'); await sleep(200); }
    const pe = document.getElementById('chkPeriodEndDate');
    if (pe && !pe.checked) { pe.click(); uiLog('  ✓ Period End Date'); await sleep(200); }

    const dtype = document.getElementById('selectDateType1');
    if (dtype && String(dtype.value) !== '0') { setInputValue(dtype, '0'); await sleep(300); }

    const from = resolveDate(range.from), to = resolveDate(range.to);
    const fromInp = document.getElementById('prdate1from');
    const toInp = document.getElementById('prdate1to');
    if (fromInp) setInputValue(fromInp, from);
    if (toInp) setInputValue(toInp, to);
    uiLog(`  dates: ${from} → ${to}`);
    await sleep(500);

    // Ticking "Checks" / the period dates re-renders the review panel, so the
    // Generate button may appear a beat later — wait for it instead of a snapshot.
    const gen = await waitFor(() => findGenerateReportButton(),
      { timeout: 15000, label: 'Generate Report button' });
    uiLog('Wizard: Generate Report…');
    clickEl(gen); // navigates to the recent-reports tab
  }

  // Drive the whole wizard on enh-srw-reportwriter.php (steps 1-4 transition via
  // AJAX in one context; Generate on step 5 navigates away).
  async function driveWizard(report, range) {
    // Step 1 — Employee Information. Wait for the field checkboxes to actually be
    // present AND the render to settle (not just the step tab) before selecting.
    await waitForWizardStep(1, 'wizard Step 1 (Employee Information)',
      () => getAllFilterCheckboxes().filter(visible).length > 0);
    uiLog('Wizard Step 1: selecting fields…');
    await wizardSelectFields(report.step1Fields);
    await sleep(500);
    await clickWizardNext('Step 1');

    // Step 2 — Payroll Specific Fields. Wait for a VISIBLE payroll box to render.
    await waitForWizardStep(2, 'wizard Step 2 (Payroll Specific Fields)',
      () => Array.from(document.querySelectorAll('div[id^="prbox"].payroll')).some(visible));
    await sleep(800); // let the field lists finish loading before Select-All
    uiLog('Wizard Step 2: Select All categories…');
    await wizardSelectAllCategories();
    await sleep(500);
    await clickWizardNext('Step 2');

    // Step 3 — Filters (nothing to select)
    await waitForWizardStep(3, 'wizard Step 3 (Filters)');
    uiLog('Wizard Step 3: Filters → Next');
    await clickWizardNext('Filters');

    // Step 4 — Sorting Options (nothing to select)
    await waitForWizardStep(4, 'wizard Step 4 (Sorting)');
    uiLog('Wizard Step 4: Sorting → Next');
    await clickWizardNext('Sorting');

    // Step 5 — Review. Wait for the output-format controls to render.
    await waitForWizardStep(5, 'wizard Step 5 (Review)',
      () => document.getElementById('outputFileFormat3') || outputRowFor('xlsx'));
    uiLog('Wizard Step 5: output + dates…');
    await configureReviewAndGenerate(report, range);
  }

  // What to call this report in banners/logs WHILE one specific range runs.
  // report.name carries the report's full scope (e.g. "Prior Payroll
  // (2023 → today)"), so pairing it with a single year reads as though the
  // whole range is being pulled — use the short name + the range's own
  // self-describing text instead.
  function runLabel(report, range) {
    const base = report.shortName || report.name;
    if (!range) return base;
    return `${base} — ${range.display || range.label}`;
  }

  // Stamp of the queue row downloaded for the PREVIOUS range of this wizard run,
  // so the next range can refuse to hand back the same row (see wizardDownload).
  const WZ_LAST_STAMP_KEY = 'histbot.wz.lastStamp';

  // Download the generated ARW report from the recent-reports tab.
  //
  // Do NOT use the "count the Download buttons, wait for the count to rise, take
  // the topmost" shortcut here. generateAndDownload can use it safely because it
  // snapshots the count on the SAME page immediately before clicking Generate.
  // The wizard can't: it clicks Generate on the wizard page and only then
  // navigates to the queue, so the snapshot is taken on a freshly-loading list
  // whose rows are still rendering. The count then rises because an OLD row
  // rendered late — not because our report finished — and the topmost row is
  // still the PREVIOUS range's. That silently saved 2023's file a second time as
  // PriorPayroll_2024.csv (byte-identical, confirmed by md5) while the log
  // happily reported both as downloaded.
  //
  // Our report is by definition the NEWEST row in the queue, so instead: wait
  // until the newest row actually has a Download button, and refuse the stamp we
  // downloaded for the previous range (that row being newest means ours has not
  // appeared yet). Stamps are only ever compared to EACH OTHER, never to the
  // clock — Paycom prints them in the client's timezone (CST here), which is not
  // the browser's.
  async function wizardDownload(report, range) {
    showBanner(`${runLabel(report, range)}: waiting for the report to finish…`);
    await sleep(1500);

    let lastStamp = '';
    try { lastStamp = localStorage.getItem(WZ_LAST_STAMP_KEY) || ''; } catch (_) {}

    const found = await waitFor(() => {
      const rows = [...scanQueueStamps().entries()]
        .map(([stamp, el]) => ({ stamp, el, t: parseStamp(stamp) }))
        .sort((a, b) => b.t - a.t); // newest first
      const newest = rows[0];
      if (!newest) return null;
      // Newest row is the one we just downloaded → our new report isn't in the
      // list yet. Keep waiting rather than handing back the same file again.
      if (lastStamp && newest.stamp === lastStamp) return null;
      const btn = downloadButtonInRow(newest.el);
      return btn ? { btn, stamp: newest.stamp } : null; // still generating → wait
    }, { timeout: 30 * 60 * 1000, interval: 900, label: `${runLabel(report, range)} queue row` });

    await downloadViaButton(found.btn, `${report.fileBase}_${range.label}`);
    try { localStorage.setItem(WZ_LAST_STAMP_KEY, found.stamp); } catch (_) {}
    showBanner(`✓ Downloaded: ${runLabel(report, range)}`, true);
    uiLog(`✓ Downloaded: ${runLabel(report, range)}`);
  }

  // Page-based state machine for a wizard report. Guarded against runaway loops.
  const WZ_KEY = 'histbot.wz';
  // A wizard report can offer multiple ranges (e.g. Prior Payroll: Combined vs
  // one-year-at-a-time). The chosen ranges + which one is currently in flight
  // are persisted here so they survive every page reload the wizard makes.
  const WZ_RANGES_KEY = 'histbot.wz.ranges';
  const WZ_RANGE_IDX_KEY = 'histbot.wz.rangeIdx';
  const clearWz = () => {
    try {
      localStorage.removeItem(WZ_KEY);
      localStorage.removeItem(WZ_RANGES_KEY);
      localStorage.removeItem(WZ_RANGE_IDX_KEY);
      // Must be cleared too — a stamp left over from a previous run would make
      // the next run's FIRST range sit and wait for a row newer than it.
      localStorage.removeItem(WZ_LAST_STAMP_KEY);
    } catch (_) {}
  };
  function getWzRanges() {
    try { const a = JSON.parse(localStorage.getItem(WZ_RANGES_KEY) || 'null'); return (Array.isArray(a) && a.length) ? a : null; }
    catch (_) { return null; }
  }
  function setWzRanges(ranges) { try { localStorage.setItem(WZ_RANGES_KEY, JSON.stringify(ranges)); } catch (_) {} }
  function getWzRangeIdx() { return parseInt(localStorage.getItem(WZ_RANGE_IDX_KEY) || '0', 10) || 0; }
  function setWzRangeIdx(n) { try { localStorage.setItem(WZ_RANGE_IDX_KEY, String(n)); } catch (_) {} }

  async function dispatchWizard(report, idx, queue) {
    // First entry into this wizard report: if it offers multiple ranges, ask
    // the user which to run — same picker dialog the quarterly-pipeline
    // reports use, but as a clear either/or choice (not a free-pick checklist,
    // since these two modes aren't meant to be combined): Combined for a
    // normal/small client, or Split by year for a large one where the
    // combined pull is too slow/heavy. The choice is persisted so it survives
    // every reload for the rest of this run.
    if (getWzRanges() === null) {
      if (report.ranges && report.ranges.length > 1 && report.pickMode) {
        hideBanner();
        const chosen = await showRangeModeDialog(report, report.ranges);
        if (!chosen) { uiLog(`↷ ${report.name}: skipped by user`); clearWz(); advanceTo(idx + 1, queue); return; }
        const base = report.shortName || report.name;
        uiLog(chosen.length === 1
          ? `${base}: downloading ${chosen[0].display || chosen[0].label}`
          : `${base}: downloading ${chosen.length} separate files — ${chosen.map(r => r.label).join(', ')}`);
        setWzRanges(chosen);
      } else {
        setWzRanges(report.ranges || [report.range]);
      }
      setWzRangeIdx(0);
    }
    const ranges = getWzRanges() || [];
    const range = ranges[getWzRangeIdx()] || ranges[0];

    const loads = (parseInt(localStorage.getItem(WZ_KEY) || '0', 10) || 0) + 1;
    try { localStorage.setItem(WZ_KEY, String(loads)); } catch (_) {}
    if (loads > 25) {
      uiLog(`✕ Skipped ${runLabel(report, range)}: didn't finish after many page loads`);
      clearWz(); advanceTo(idx + 1, queue); return;
    }

    const url = location.href;
    try {
      if (isOnRecentReportsTab()) {
        await wizardDownload(report, range);
        // Move on to the NEXT range for this same report, if any — the wizard
        // has to be re-driven from scratch per range (no in-page date-only
        // re-generate like the non-wizard reports get). Only advance the
        // outer queue once every chosen range has been generated.
        const nextIdx = getWzRangeIdx() + 1;
        if (nextIdx < ranges.length) {
          setWzRangeIdx(nextIdx);
          try { localStorage.setItem(WZ_KEY, '0'); } catch (_) {} // fresh loop-guard budget for the next pass
          uiLog(`→ next up: ${runLabel(report, ranges[nextIdx])} (${nextIdx + 1} of ${ranges.length})…`);
          location.href = ARW_SAVED_URL;
          return;
        }
        clearWz(); advanceTo(idx + 1, queue);
        return;
      }
      if (url.includes('/srw-reportwriter-savedReport.php')) {
        const createBtn = await waitFor(() => findByText(['button', 'a'], 'Create New Report'), { timeout: 20000, label: '"Create New Report"' });
        uiLog(`▶ ${runLabel(report, range)}: Create New Report…`);
        clickEl(createBtn); // open the menu (its items are <a class="ddbMenuItemLink" href="…">)
        const link = await waitFor(() =>
          Array.from(document.querySelectorAll('a.ddbMenuItemLink'))
            .find(a => (a.textContent || '').trim().toLowerCase() === report.reportType.toLowerCase()),
          { timeout: 15000, label: `report type "${report.reportType}"` });
        const href = link.getAttribute('href');
        uiLog(`  choosing type: ${report.reportType} → ${href || '(click)'}`);
        // Navigate straight to the menu item's URL — most reliable (a plain click
        // on the <a>/<li> sometimes doesn't fire the dropdown's navigation).
        if (href) location.href = new URL(href, location.href).href;
        else clickEl(link);
        return;
      }
      if (url.includes('/enh-srw-reportwriter.php')) {
        await driveWizard(report, range);
        return;
      }
      // Anywhere else → open the ARW.
      uiLog(`→ Opening Advanced Report Writer for ${runLabel(report, range)}…`);
      showBanner(`Opening Advanced Report Writer…`);
      location.href = ARW_SAVED_URL;
    } catch (err) {
      if (err && err.aborted) { log('Wizard aborted'); hideBanner(); return; }
      hideBanner();
      uiLog(`✕ Skipped ${runLabel(report, range)}: ${err && err.message ? err.message : err}`);
      clearWz(); advanceTo(idx + 1, queue);
    }
  }

  // ═════════════════ E-Verify (Human Resources → E-Verify → E-Verify Cases) ═════════════════
  // A live DataTables grid, not a rpt-generate.php form — two flows share it:
  //   1. everifyCasesExport — one click: the grid's own "Export filtered
  //      results as XLSX" action. Paycom names the file itself; we don't
  //      intercept it (see note in exportEverifyCasesXlsx).
  //   2. everifyCaseDetails — collect every case's (EE Code, Case Number) off
  //      the grid across all its pages, confirm the count with the user (this
  //      can be hundreds of pages), then visit each case's detail page and
  //      build one CSV of every field on it.

  function findEverifyGridTable() {
    return Array.from(document.querySelectorAll('table')).find(t =>
      visible(t) && /case number/i.test(t.textContent || '') && /ee code/i.test(t.textContent || ''));
  }

  // Column index lookup by header text, so a Paycom column-order change can't
  // silently scramble which cell we read as which field.
  function everifyColIndex(table, headerText) {
    const ths = Array.from(table.querySelectorAll('thead th, thead td'));
    return ths.findIndex(th => (th.textContent || '').trim().toLowerCase() === headerText);
  }

  function scrapeEverifyGridRows(table) {
    const caseCol = everifyColIndex(table, 'case number');
    const eeCol = everifyColIndex(table, 'ee code');
    if (caseCol < 0 || eeCol < 0) return [];
    const out = [];
    for (const row of table.querySelectorAll('tbody tr')) {
      if (!visible(row)) continue;
      const cells = row.querySelectorAll('td');
      const caseNumber = (cells[caseCol]?.textContent || '').trim();
      const eeCode = (cells[eeCol]?.textContent || '').trim();
      if (caseNumber && eeCode) out.push({ caseNumber, eeCode });
    }
    return out;
  }

  async function waitForEverifyGrid() {
    const table = await waitFor(() => {
      const t = findEverifyGridTable();
      return (t && scrapeEverifyGridRows(t).length) ? t : null;
    }, { timeout: 30000, label: 'E-Verify Cases grid' });
    await sleep(400);
    return table;
  }

  // A specific, fixed cutoff (not rolling) — the user wants every case since
  // Jan 1, 2023, same for every client, every run. An unfiltered grid would
  // include every case ever E-Verified, not just the migration-relevant set.
  const EVERIFY_HIRE_DATE = { month: '01', day: '01', year: '2023' };

  function everifyFilterAlreadyApplied() {
    return Array.from(document.querySelectorAll('*')).some(el =>
      el.children.length === 0 && visible(el) &&
      /hire date is on and after\s*1\/1\/2023/i.test((el.textContent || '').replace(/\s+/g, ' ').trim()));
  }

  // Opens the Filters drawer, sets Hire Date → "Is on and After" → 01/01/2023,
  // and clicks Apply. Skips the whole dance if that filter is already showing
  // as an applied chip (some clients may have it saved from a prior session).
  async function applyEverifyHireDateFilter() {
    if (everifyFilterAlreadyApplied()) { uiLog('Hire Date filter already applied (≥ 1/1/2023) — skipping'); return; }
    uiLog('Setting Hire Date filter: Is on and After 01/01/2023…');

    const filterIcon = document.querySelector('svg[data-testid="filter-icon"]');
    const filterBtn = filterIcon && (filterIcon.closest('button, [role="button"]') || filterIcon.parentElement);
    if (!filterBtn) throw new Error('Filters button (funnel icon) not found');
    clickEl(filterBtn);

    const opInput = await waitFor(() => {
      const el = document.querySelector('input[aria-label="Operator"]');
      return (el && visible(el)) ? el : null;
    }, { timeout: 15000, label: 'Hire Date "Operator" field' });
    clickEl(opInput);

    const opOption = await waitFor(() => {
      const p = Array.from(document.querySelectorAll('[data-testid="typography"]'))
        .find(el => visible(el) && (el.textContent || '').trim() === 'Is on and After');
      return p ? (p.closest('[role="option"], li, div[tabindex]') || p) : null;
    }, { timeout: 8000, label: '"Is on and After" option' });
    clickEl(opOption);
    await sleep(300);

    const monthInput = await waitFor(() => document.querySelector('input[aria-label="Value - Date Month"]'),
      { timeout: 8000, label: 'Hire Date month field' });
    const dayInput = document.querySelector('input[aria-label="Value - Date Day"]');
    const yearInput = document.querySelector('input[aria-label="Value - Date Year"]');
    setInputValue(monthInput, EVERIFY_HIRE_DATE.month);
    await sleep(150);
    setInputValue(dayInput, EVERIFY_HIRE_DATE.day);
    await sleep(150);
    setInputValue(yearInput, EVERIFY_HIRE_DATE.year);
    await sleep(150);

    const applyBtn = await waitFor(() => {
      const span = Array.from(document.querySelectorAll('span'))
        .find(el => visible(el) && (el.textContent || '').trim() === 'Apply');
      return span ? (span.closest('button, [role="button"]') || span) : null;
    }, { timeout: 8000, label: '"Apply" button' });
    clickEl(applyBtn);
    await sleep(1500);
    uiLog('Hire Date filter applied (Is on and After 01/01/2023)');
  }

  // DataTables pagination (same widget the daily bot's Doc Dashboard downloader
  // already drives — ids follow the pattern <table-id>_next / _info): read the
  // table's own id, then use its Next button + "Showing X to Y of Z" info text
  // to detect when a page-turn actually rendered new rows.
  const everifyGetInfoText = (tableId) => (document.getElementById(tableId + '_info')?.textContent || '').trim();
  const everifyGetNextBtn = (tableId) => document.getElementById(tableId + '_next');
  const everifyNextDisabled = (tableId) => {
    const b = everifyGetNextBtn(tableId);
    return !b || b.classList.contains('disabled') || b.getAttribute('aria-disabled') === 'true';
  };
  async function everifyWaitForPageChange(tableId, prevInfo) {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      await sleep(200);
      const cur = everifyGetInfoText(tableId);
      if (cur && cur !== prevInfo) return true;
    }
    return false;
  }

  // ── E-Verify Cases (grid export) ──
  async function dispatchEverifyCasesExport(report, idx, queue) {
    if (!location.href.includes('/web.php/Everify/Index/caseList')) {
      uiLog(`→ Opening ${report.name}…`);
      showBanner(`Opening ${report.name}…`);
      location.href = EVERIFY_CASES_URL;
      return;
    }
    try {
      await waitForEverifyGrid();
      showBanner(`${report.name}: setting Hire Date filter…`);
      await applyEverifyHireDateFilter();
      showBanner(`${report.name}: exporting…`);
      await exportEverifyCasesXlsx();
      uiLog(`✓ ${report.name}: export triggered — Paycom saves it under its own timestamped name`);
      showBanner(`✓ ${report.name} exported`, true);
      await sleep(2500); // let the browser's download start before we navigate away
    } catch (err) {
      if (err && err.aborted) { log('Aborted by user'); hideBanner(); return; }
      hideBanner();
      uiLog(`✕ Skipped ${report.name}: ${err && err.message ? err.message : err}`);
    }
    advanceTo(idx + 1, queue);
  }

  // The Actions trigger is a gear icon (no visible text — alt="Actions Gear
  // Menu Carat Icon" on its dropdown-arrow image), opening a ddb-menu whose
  // XLSX item is a stable id: #table-export-xlsx.
  async function exportEverifyCasesXlsx() {
    const trigger = await waitFor(() => {
      const img = document.querySelector('img[alt="Actions Gear Menu Carat Icon"]')
        || Array.from(document.querySelectorAll('img')).find(i => /carat_down\.png/i.test(i.src || ''));
      const el = img && (img.closest('button, a, [role="button"], div[onclick], span[onclick]') || img.parentElement);
      return (el && visible(el)) ? el : null;
    }, { timeout: 20000, label: 'E-Verify Cases "Actions" trigger' });
    clickEl(trigger);
    let xlsxBtn = await waitFor(() => {
      const b = document.getElementById('table-export-xlsx');
      return (b && visible(b)) ? b : null;
    }, { timeout: 8000, label: '"Export filtered results as XLSX"' }).catch(() => null);
    if (!xlsxBtn) { // menu may have closed before render — reopen once
      clickEl(trigger);
      xlsxBtn = await waitFor(() => {
        const b = document.getElementById('table-export-xlsx');
        return (b && visible(b)) ? b : null;
      }, { timeout: 8000, label: '"Export filtered results as XLSX" (retry)' });
    }
    clickEl(xlsxBtn);
    await sleep(1500);
  }

  // ── E-Verify Case Details (all cases) ──
  const EV_STATE_KEY = 'histbot.everify.state'; // '' | 'COLLECTING' | 'SCRAPING'
  const EV_QUEUE_KEY = 'histbot.everify.queue'; // [{caseNumber, eeCode}, …] collected off the grid
  const EV_IDX_KEY = 'histbot.everify.idx';     // index into the queue during SCRAPING
  const EV_RESULTS_KEY = 'histbot.everify.results'; // [{field: value, …}, …] one per scraped case

  function loadEverifyQueue() { try { return JSON.parse(localStorage.getItem(EV_QUEUE_KEY) || '[]'); } catch (_) { return []; } }
  function saveEverifyQueue(arr) { try { localStorage.setItem(EV_QUEUE_KEY, JSON.stringify(arr)); } catch (_) {} }
  function loadEverifyResults() { try { return JSON.parse(localStorage.getItem(EV_RESULTS_KEY) || '[]'); } catch (_) { return []; } }
  function saveEverifyResults(arr) { try { localStorage.setItem(EV_RESULTS_KEY, JSON.stringify(arr)); } catch (_) {} }
  function clearEverifyState() {
    try {
      localStorage.removeItem(EV_STATE_KEY);
      localStorage.removeItem(EV_QUEUE_KEY);
      localStorage.removeItem(EV_IDX_KEY);
      localStorage.removeItem(EV_RESULTS_KEY);
    } catch (_) {}
  }

  function everifyCaseUrl(c) {
    return `https://www.paycomonline.net/v4/cl/web.php/EverifyV30/Index/viewCase/`
      + `${encodeURIComponent(c.eeCode)}/${encodeURIComponent(c.caseNumber)}?fromNewHireId=0`;
  }

  // Confirmation dialog — shown ONLY after the full case count is known, since
  // the user asked to see the real number ("286 cases") before committing to
  // what will be a long, many-page pull.
  function showEverifyConfirmDialog(count) {
    return new Promise((resolve) => {
      document.getElementById('histbot-everify-confirm')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'histbot-everify-confirm';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:400px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,0.35);';
      const title = document.createElement('h3');
      title.textContent = 'E-Verify Case Details';
      title.style.cssText = 'margin:0 0 8px;color:#0b7dda;font-size:16px;';
      const msg = document.createElement('div');
      msg.textContent = `${count} case(s) found on the grid. Pulling full details for every one of them will take a while (roughly a couple of seconds per case, one page load each). Proceed?`;
      msg.style.cssText = 'color:#333;font-size:13px;margin-bottom:16px;line-height:1.45;';
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'padding:9px 18px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px;';
      cancel.onclick = () => { overlay.remove(); resolve(false); };
      const ok = document.createElement('button');
      ok.textContent = `Proceed — ${count} cases`;
      ok.style.cssText = 'padding:9px 18px;border:0;background:#0b7dda;color:#fff;border-radius:5px;cursor:pointer;font-weight:600;font-size:13px;';
      ok.onclick = () => { overlay.remove(); resolve(true); };
      btns.appendChild(cancel); btns.appendChild(ok);
      box.appendChild(title); box.appendChild(msg); box.appendChild(btns);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  async function dispatchEverifyCaseDetails(report, idx, queue) {
    try {
      const state = localStorage.getItem(EV_STATE_KEY) || '';
      if (!state) {
        localStorage.setItem(EV_STATE_KEY, 'COLLECTING');
        saveEverifyQueue([]);
        uiLog(`→ Opening ${report.name}…`);
        location.href = EVERIFY_CASES_URL;
        return;
      }
      if (state === 'COLLECTING') {
        if (!location.href.includes('/web.php/Everify/Index/caseList')) { location.href = EVERIFY_CASES_URL; return; }
        await everifyCollectPhase(report, idx, queue);
        return;
      }
      if (state === 'SCRAPING') {
        await everifyScrapePhase(report, idx, queue);
        return;
      }
      // Unknown/stale state — reset and bail rather than loop forever.
      clearEverifyState(); advanceTo(idx + 1, queue);
    } catch (err) {
      if (err && err.aborted) { log('Aborted by user'); hideBanner(); return; }
      hideBanner();
      uiLog(`✕ ${report.name} failed: ${err && err.message ? err.message : err}`);
      clearEverifyState();
      advanceTo(idx + 1, queue);
    }
  }

  // Walks every page of the grid (via its DataTables Next button), collecting
  // {caseNumber, eeCode} off each one, then hands off to the confirm dialog.
  async function everifyCollectPhase(report, idx, queue) {
    showBanner(`${report.name}: collecting the case list…`);
    await waitForEverifyGrid();
    await applyEverifyHireDateFilter();
    const table = await waitForEverifyGrid(); // grid re-renders after Apply — re-fetch the table reference
    const tableId = table.id;
    let collected = loadEverifyQueue();
    const seen = new Set(collected.map(c => c.caseNumber));
    let page = 1;
    while (true) {
      await sleep(0); // abort checkpoint — this file has no standalone checkAbort()
      for (const r of scrapeEverifyGridRows(table)) {
        if (!seen.has(r.caseNumber)) { seen.add(r.caseNumber); collected.push(r); }
      }
      saveEverifyQueue(collected);
      uiLog(`${report.name}: ${collected.length} case(s) collected so far (page ${page})…`);
      if (!tableId || everifyNextDisabled(tableId)) break;
      const prevInfo = everifyGetInfoText(tableId);
      clickEl(everifyGetNextBtn(tableId));
      const moved = await everifyWaitForPageChange(tableId, prevInfo);
      if (!moved) { uiLog(`${report.name}: pagination stopped responding — using what was collected`); break; }
      page++;
    }
    uiLog(`${report.name}: ${collected.length} total case(s) found`);
    hideBanner();
    const proceed = await showEverifyConfirmDialog(collected.length);
    if (!proceed || !collected.length) {
      uiLog(`↷ ${report.name}: cancelled by user`);
      clearEverifyState();
      advanceTo(idx + 1, queue);
      return;
    }
    localStorage.setItem(EV_STATE_KEY, 'SCRAPING');
    localStorage.setItem(EV_IDX_KEY, '0');
    saveEverifyResults([]);
    location.href = everifyCaseUrl(collected[0]);
  }

  // Every field on a case's view page is `<span [value="…"] aria-label="Label">`
  // inside a `div.row.formRowStandard#<field>-row` — a plain label→value walk.
  function scrapeEverifyCaseDetail(caseNumber) {
    const record = { 'Case Number': caseNumber };
    const rows = document.querySelectorAll('#v30ViewCaseForm .row.formRowStandard[id$="-row"]');
    for (const row of rows) {
      const label = (row.querySelector('label')?.textContent || '').trim();
      if (!label || label in record) continue;
      const valEl = row.querySelector('[value]');
      const value = valEl ? (valEl.getAttribute('value') || '').trim() : (row.querySelector('.formLine')?.textContent || '').trim();
      record[label] = value;
    }
    return record;
  }

  async function everifyScrapePhase(report, idx, queue) {
    const cases = loadEverifyQueue();
    const i = parseInt(localStorage.getItem(EV_IDX_KEY) || '0', 10) || 0;
    if (i >= cases.length) { await everifyFinishScrape(report, idx, queue); return; }
    const current = cases[i];
    showBanner(`${report.name}: ${i + 1}/${cases.length} (${current.caseNumber})…`);
    try {
      await waitFor(() => document.querySelector('#v30ViewCaseForm'), { timeout: 20000, label: `case ${current.caseNumber} detail page` });
      await sleep(350);
      const results = loadEverifyResults();
      results.push(scrapeEverifyCaseDetail(current.caseNumber));
      saveEverifyResults(results);
    } catch (err) {
      if (err && err.aborted) throw err;
      uiLog(`⚠ Case ${current.caseNumber}: ${err.message} — skipped`);
    }
    const next = i + 1;
    localStorage.setItem(EV_IDX_KEY, String(next));
    if (next < cases.length) { location.href = everifyCaseUrl(cases[next]); return; }
    await everifyFinishScrape(report, idx, queue);
  }

  function everifyResultsToCsv(records) {
    const headers = [];
    const seen = new Set();
    for (const r of records) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); headers.push(k); }
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(',')];
    for (const r of records) lines.push(headers.map(h => esc(r[h])).join(','));
    return lines.join('\r\n');
  }

  async function everifyFinishScrape(report, idx, queue) {
    const results = loadEverifyResults();
    const csv = everifyResultsToCsv(results);
    const fname = `EVerifyCaseDetails_${THISYEAR}.csv`;
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fname);
    uiLog(`✓ Saved ${fname} (${results.length} case(s))`);
    showBanner(`✓ ${report.name} — ${results.length} case(s) downloaded`, true);
    clearEverifyState();
    advanceTo(idx + 1, queue);
  }

  // ───────────────── Page-router state machine ─────────────────
  // Iterates over the run queue (the report keys the user ticked in the picker).
  async function dispatch() {
    if (!isRunning()) return;
    const queue = getQueue();
    const idx = getIndex();
    if (idx >= queue.length) { finishAll(); return; }

    const report = reportByKey(queue[idx]);
    if (!report) { setIndex(idx + 1); dispatch(); return; }

    if (report.wizard) { await dispatchWizard(report, idx, queue); return; }
    if (report.custom === 'everifyCasesExport') { await dispatchEverifyCasesExport(report, idx, queue); return; }
    if (report.custom === 'everifyCaseDetails') { await dispatchEverifyCaseDetails(report, idx, queue); return; }

    if (!isOnReportPage(report)) {
      uiLog(`→ Opening ${report.name}…`);
      showBanner(`Opening ${report.name}…`);
      location.href = reportNavUrl(report);
      return;
    }

    // Guard against the redirect-loop: a report should be handled once (both
    // years on the same page). Landing on it 3+ times means its completion
    // redirects the page instead of showing an inline Download — bail loudly.
    // Loop guard: a report should be handled once. Landing on it 3+ times means
    // its completion redirects the page instead of showing an inline Download —
    // skip it and move on (don't halt the whole batch).
    const attempt = bumpAttempt(idx);
    if (attempt > 2) {
      uiLog(`✕ Skipped ${report.name}: redirects instead of an inline Download (needs the Recent-Reports method)`);
      advanceTo(idx + 1, queue);
      return;
    }

    try {
      await handleReport(report);
      advanceTo(idx + 1, queue);
    } catch (err) {
      if (err && err.aborted) { log('Aborted by user'); hideBanner(); return; }
      hideBanner();
      // Skip the failing report and keep going — one bad report shouldn't stop
      // a long multi-report batch.
      uiLog(`✕ Skipped ${report.name}: ${err && err.message ? err.message : err}`);
      advanceTo(idx + 1, queue);
    }
  }

  // Move to the next queued report (navigate there), or finish if none left.
  function advanceTo(next, queue) {
    setIndex(next);
    if (next < queue.length) {
      const nextReport = reportByKey(queue[next]);
      if (nextReport) { location.href = reportNavUrl(nextReport); return; }
    }
    finishAll();
  }

  // Start a run over the given report keys (from the picker).
  function startRun(keys) {
    if (!keys || !keys.length) return;
    setQueue(keys);
    setIndex(0);
    clearAttempts();
    clearWz();
    clearPipe();
    clearLog();
    // Version in the very first log line — so a stale Tampermonkey copy is
    // obvious at a glance (we lost a debugging round to exactly that).
    let ver = '';
    try { ver = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) ? ` [v${GM_info.script.version}]` : ''; } catch (_) {}
    uiLog(`Started ${keys.length} report(s)${ver}: ${keys.map(k => (reportByKey(k) || {}).name || k).join(', ')} · ${LASTYEAR} + ${THISYEAR}`);
    becomeDriver(); // this tab drives; any other open Paycom tab stands by
    setState(STATES.RUNNING);
    dispatch();
  }

  function stopRun() {
    setState(STATES.IDLE);
    setIndex(0);
    clearQueue();
    clearAttempts();
    clearWz();
    clearPipe();
    releaseDriver();
    hideBanner();
    document.getElementById('histbot-picker')?.remove();
    document.getElementById('histbot-rangepick')?.remove();
    log('Stopped / reset');
  }

  function finishAll() {
    setState(STATES.IDLE);
    setIndex(0);
    clearQueue();
    clearAttempts();
    releaseDriver();
    hideBanner();
    showBanner(`✓ Historical Data Bot — selected reports downloaded (${LASTYEAR} + ${THISYEAR})`, true);
    uiLog(`✓ All selected reports downloaded (${LASTYEAR} + ${THISYEAR})`);
  }

  // ───────────────── Report picker dialog (one section at a time) ─────────────────
  // Same look as the main Paycom Bot's "Download All Reports" dialog: white card,
  // blue accent, checkbox per report + select-all/none. Selection persists.
  function showPickerDialog(section, onConfirm) {
    document.getElementById('histbot-picker')?.remove();
    const saved = getSelection();
    const reports = REPORTS.filter(r => r.section === section);

    const overlay = document.createElement('div');
    overlay.id = 'histbot-picker';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:440px;width:92%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.35);';

    const title = document.createElement('h3');
    title.textContent = `${section} — choose reports`;
    title.style.cssText = 'margin:0 0 4px;color:#0b7dda;font-size:16px;';
    box.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = `Each ticked report downloads as Excel for all employees — ${LASTYEAR} and ${THISYEAR}.`;
    subtitle.style.cssText = 'color:#666;font-size:12px;margin-bottom:14px;';
    box.appendChild(subtitle);

    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;padding:6px 12px;margin-bottom:14px;';
    const checkboxes = [];      // aligned with `reports` index
    reports.forEach((r, i) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;padding:8px 0;cursor:pointer;border-bottom:1px solid #f0f0f0;';
      if (i === reports.length - 1) row.style.borderBottom = 'none';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = saved[r.key];
      cb.style.cssText = 'margin-right:10px;transform:scale(1.15);flex:0 0 auto;';
      checkboxes.push(cb);
      const text = document.createElement('span');
      text.textContent = r.name;
      text.style.cssText = 'flex:1;color:#333;';
      row.appendChild(cb);
      row.appendChild(text);
      list.appendChild(row);
    });
    box.appendChild(list);

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;align-items:center;';

    const selectAllLink = document.createElement('a');
    selectAllLink.textContent = 'select all / none';
    selectAllLink.href = '#';
    selectAllLink.style.cssText = 'color:#0b7dda;font-size:12px;margin-right:auto;text-decoration:underline;';
    selectAllLink.onclick = (e) => {
      e.preventDefault();
      const all = checkboxes.every(c => c.checked);
      checkboxes.forEach(c => c.checked = !all);
    };
    buttons.appendChild(selectAllLink);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:9px 18px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px;';
    cancelBtn.onclick = () => overlay.remove();
    buttons.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Download selected';
    confirmBtn.style.cssText = 'padding:9px 18px;border:0;background:#0b7dda;color:#fff;border-radius:5px;cursor:pointer;font-weight:600;font-size:13px;';
    confirmBtn.onclick = () => {
      reports.forEach((r, i) => setSelected(r.key, checkboxes[i].checked));
      const keys = reports.filter((_, i) => checkboxes[i].checked).map(r => r.key);
      if (!keys.length) { alert('Select at least one report or click Cancel.'); return; }
      overlay.remove();
      onConfirm(keys);
    };
    buttons.appendChild(confirmBtn);

    box.appendChild(buttons);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function onStartClick(section) {
    if (isRunning()) { log('Already running — Stop first'); return; }
    showPickerDialog(section, (keys) => startRun(keys));
  }

  // ───────────────── Banner ─────────────────
  let bannerEl;
  function showBanner(msg, success) {
    hideBanner();
    bannerEl = document.createElement('div');
    bannerEl.id = 'histbot-banner';
    bannerEl.textContent = msg;
    bannerEl.style.cssText =
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
      'padding:10px 18px;border-radius:999px;font:600 13px "Segoe UI",system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45),0 0 12px rgba(132,169,140,.15);' +
      (success
        ? 'background:linear-gradient(135deg,#52796f,#3f5f56);color:#eafff3;border:1px solid rgba(132,169,140,.6)'
        : 'background:linear-gradient(135deg,#354f52,#2f3e46);color:#cad2c5;border:1px solid rgba(132,169,140,.5)');
    document.body.appendChild(bannerEl);
    if (success) setTimeout(hideBanner, 6000);
  }
  function hideBanner() { if (bannerEl) { bannerEl.remove(); bannerEl = null; } }

  // ───────────────── Inspect Element HTML (ported from the main Paycom Bot) ─────────────────
  // Click the button, then click any element on the page — its outer HTML (plus
  // ancestors + nearest interesting container) is copied to the clipboard so it
  // can be pasted here. Esc cancels. Clicks on the bot panel stay normal.
  let inspectActive = false;
  function startInspectCapture() {
    if (inspectActive) return;
    inspectActive = true;
    showBanner('Inspect: click any element to copy its HTML (Esc cancels)');

    const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + ' …[+' + (s.length - n) + ' chars]' : s; };
    const finish = () => {
      inspectActive = false;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      hideBanner();
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    const onClick = (e) => {
      if (panelEl && panelEl.contains(e.target)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const t = e.target;
      const out = [];
      out.push('=== HistBot Inspect ===');
      out.push('url: ' + location.href);
      const path = [];
      let n = t;
      for (let i = 0; n && n.tagName && i < 8; i++) {
        let desc = n.tagName.toLowerCase();
        if (n.id) desc += '#' + n.id;
        if (typeof n.className === 'string' && n.className.trim()) desc += '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.');
        path.push(desc); n = n.parentElement;
      }
      out.push('ancestors: ' + path.join('  <  '));
      out.push('--- clicked element outerHTML ---');
      out.push(clip(t.outerHTML, 4000));
      const container = t.closest('button, a, [role="button"], label, tr, li, form, table, [class*="format" i], [class*="output" i], [class*="filter" i]') || t.parentElement;
      if (container && container !== t) {
        out.push('--- closest interesting container outerHTML ---');
        out.push(clip(container.outerHTML, 6000));
      }
      const text = out.join('\n');
      console.log('%c[HistBot Inspect]\n' + text, 'color:#52796f');
      try {
        navigator.clipboard.writeText(text).then(
          () => showBanner('✓ HTML copied — paste it to Claude', true),
          () => showBanner('HTML logged to console ([HistBot Inspect])', true)
        );
      } catch (_) { showBanner('HTML logged to console ([HistBot Inspect])', true); }
      finish();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  // ───────────────── Floating panel (matches the main Paycom Bot theme) ─────────────────
  let panelEl;
  function ensurePanel() {
    if (panelEl && document.body.contains(panelEl)) return;
    if (!document.body) return;
    panelEl = document.createElement('div');
    panelEl.id = 'histbot-panel';
    panelEl.innerHTML = `
      <style>
        /* Palette matches the main Paycom Bot: #cad2c5 sage · #84a98c · #52796f teal · #354f52 slate · #2f3e46 dark */
        #histbot-panel{position:fixed;bottom:20px;left:20px;z-index:2147483646;width:268px;padding:0;color:#cad2c5;
          font:13px/1.45 'Segoe UI',system-ui,sans-serif;
          background:linear-gradient(160deg,#354f52 0%,#2f3e46 58%,#263238 100%);
          border:1px solid rgba(132,169,140,.4);border-radius:16px;overflow:hidden;
          box-shadow:0 14px 40px rgba(0,0,0,.55),0 0 0 1px rgba(82,121,111,.3),inset 0 1px 0 rgba(202,210,197,.12)}
        #histbot-panel.minimized{width:auto}
        #histbot-panel .hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:move;user-select:none;
          padding:12px 14px;background:linear-gradient(135deg,#52796f 0%,#3f5f56 100%);
          border-bottom:1px solid rgba(202,210,197,.22)}
        #histbot-panel.minimized .hdr{padding:8px 12px;border-bottom:0}
        #histbot-panel h4{margin:0;color:#cad2c5;font-size:14px;font-weight:700;letter-spacing:.4px;white-space:nowrap;
          display:flex;align-items:center;gap:8px}
        #histbot-panel h4::before{content:'';flex:none;width:9px;height:9px;border-radius:50%;
          background:#84a98c;box-shadow:0 0 8px rgba(132,169,140,.9)}
        #histbot-panel.running h4::before{background:#cad2c5;box-shadow:0 0 10px #cad2c5;
          animation:hb-pulse 1.1s ease-in-out infinite}
        @keyframes hb-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}
        #histbot-panel .body{padding:12px 14px 14px;max-height:calc(100vh - 96px);overflow-y:auto;overflow-x:hidden}
        #histbot-panel .body::-webkit-scrollbar{width:8px}
        #histbot-panel .body::-webkit-scrollbar-thumb{background:rgba(132,169,140,.5);border-radius:8px}
        #histbot-panel .body::-webkit-scrollbar-track{background:transparent}
        #histbot-panel .status{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 6px;
          color:rgba(202,210,197,.65);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px}
        #histbot-panel .status span{color:#cad2c5;font-weight:600;font-size:11px;text-transform:none;letter-spacing:0;
          background:rgba(132,169,140,.1);border:1px solid rgba(132,169,140,.28);padding:2px 9px;border-radius:999px;
          max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .25s ease}
        #histbot-panel .note{color:rgba(202,210,197,.62);font-size:10.5px;line-height:1.45;margin:2px 0 2px}
        #histbot-panel .hb-prog{font-size:11.5px;color:#cad2c5;font-weight:700;margin:0 0 6px;min-height:14px}
        #histbot-panel .hb-loglabel{font-size:10px;font-weight:800;letter-spacing:.8px;color:rgba(202,210,197,.6);
          text-transform:uppercase;margin:10px 0 4px;display:flex;align-items:center;gap:8px}
        #histbot-panel .hb-loglabel::after{content:'';flex:1;height:1px;background:rgba(202,210,197,.18)}
        #histbot-panel .hb-copylog, #histbot-panel .hb-dllog, #histbot-panel .hb-clearlog{
          display:inline-flex;align-items:center;width:auto;margin:0;padding:2px 8px;
          font-size:10px;font-weight:700;letter-spacing:.4px;border-radius:6px;cursor:pointer;
          background:rgba(132,169,140,.15);color:#cad2c5;border:1px solid rgba(132,169,140,.35)}
        #histbot-panel .hb-copylog:hover, #histbot-panel .hb-dllog:hover, #histbot-panel .hb-clearlog:hover{
          transform:none;box-shadow:none;background:rgba(132,169,140,.3)}
        #histbot-panel .hb-log{height:118px;overflow:auto;padding:7px 9px;border-radius:9px;
          background:rgba(20,28,26,.6);border:1px solid rgba(132,169,140,.25);color:#c9d6cc;
          font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
        #histbot-panel .hb-log::-webkit-scrollbar{width:7px}
        #histbot-panel .hb-log::-webkit-scrollbar-thumb{background:rgba(132,169,140,.45);border-radius:7px}
        #histbot-panel .hb-log::-webkit-scrollbar-track{background:transparent}
        #histbot-panel button{display:block;width:100%;margin-top:8px;padding:9px 12px;border:0;border-radius:9px;
          font-size:13px;font-weight:600;letter-spacing:.2px;cursor:pointer;
          transition:transform .12s ease,box-shadow .12s ease,filter .12s ease}
        #histbot-panel button:hover{transform:translateY(-1px);filter:brightness(1.1);box-shadow:0 7px 16px rgba(0,0,0,.4)}
        #histbot-panel button:active{transform:translateY(0) scale(.98)}
        #histbot-panel .min-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
          margin:0;padding:0;flex:none;background:rgba(47,62,70,.45);color:#cad2c5;
          border:1px solid rgba(202,210,197,.4);border-radius:7px;font-size:15px;font-weight:700;line-height:1;cursor:pointer}
        #histbot-panel .min-btn:hover{transform:none;box-shadow:none;background:rgba(47,62,70,.75)}
        #histbot-panel .start{background:linear-gradient(135deg,#84a98c 0%,#52796f 55%,#354f52 100%);color:#fff;
          margin-top:12px;font-weight:700;letter-spacing:.3px;box-shadow:0 4px 14px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.15)}
        #histbot-panel .inspect{background:transparent;color:#84a98c;border:1px dashed rgba(132,169,140,.6)}
        #histbot-panel .inspect:hover{background:rgba(132,169,140,.1)}
        #histbot-panel .stop{background:transparent;color:#cad2c5;border:1px solid rgba(202,210,197,.5)}
        #histbot-panel .stop:hover{background:rgba(202,210,197,.12)}
        #histbot-panel.minimized .body{display:none}
      </style>
      <div class="hdr">
        <h4>Historical Data Bot</h4>
        <button class="min-btn" title="Minimize panel">–</button>
      </div>
      <div class="body">
        <div class="status">Status <span class="hb-state">Idle</span></div>
        <div class="hb-prog"></div>
        <div class="note">🤖 Hi! I'm your report-downloading assistant.<br>Pick a section below and I'll grab those reports for you.</div>
        <div class="hb-starts"></div>
        <button class="inspect" title="Click this, then click any element on the page — its HTML is copied to the clipboard">🔍 Inspect Element HTML</button>
        <button class="stop">⏹ Stop / reset</button>
        <div class="hb-loglabel">Activity
          <button class="hb-copylog" title="Copy the whole activity log to the clipboard">📋 Copy</button>
          <button class="hb-dllog" title="Download the FULL session log as a .txt file — this one is never cleared by Stop/reset or a new run">⬇ Log file</button>
          <button class="hb-clearlog" title="Clear the saved full session log">🗑</button>
        </div>
        <div class="hb-log"></div>
      </div>
    `;
    document.body.appendChild(panelEl);

    // One Start button per report section (Time-Off, Time & Attendance, …).
    const starts = panelEl.querySelector('.hb-starts');
    SECTIONS.forEach(sec => {
      const b = document.createElement('button');
      b.className = 'start';
      b.dataset.label = `${SECTION_ICON[sec] || '▶'} ${sec} Reports`;
      b.textContent = b.dataset.label;
      b.addEventListener('click', () => onStartClick(sec));
      starts.appendChild(b);
    });

    panelEl.querySelector('.inspect').addEventListener('click', startInspectCapture);
    panelEl.querySelector('.stop').addEventListener('click', stopRun);
    panelEl.querySelector('.hb-copylog').addEventListener('click', () => {
      const btn = panelEl.querySelector('.hb-copylog');
      const txt = getLog().join('\n');
      const done = (ok) => { btn.textContent = ok ? '✓ Copied' : '✕ Copy failed'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => done(true), () => done(false));
      } else {
        const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
        ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
        ta.remove(); done(ok);
      }
    });
    panelEl.querySelector('.hb-dllog').addEventListener('click', () => {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(FULL_LOG_KEY) || '[]'); if (!Array.isArray(arr)) arr = []; } catch (_) { arr = []; }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      saveBlob(new Blob([arr.join('\n')], { type: 'text/plain;charset=utf-8;' }), `HistBotLog_${stamp}.txt`);
    });
    panelEl.querySelector('.hb-clearlog').addEventListener('click', () => {
      clearFullLog();
      const btn = panelEl.querySelector('.hb-clearlog');
      btn.textContent = '✓'; setTimeout(() => { btn.textContent = '🗑'; }, 1200);
    });

    // Minimize toggle — persisted so it survives Paycom's page reloads.
    const minBtn = panelEl.querySelector('.min-btn');
    const applyMin = (min) => {
      panelEl.classList.toggle('minimized', min);
      minBtn.textContent = min ? '+' : '–';
    };
    minBtn.addEventListener('click', () => {
      const min = !panelEl.classList.contains('minimized');
      try { min ? localStorage.setItem('histbot.min', '1') : localStorage.removeItem('histbot.min'); } catch (_) {}
      applyMin(min);
    });
    applyMin(localStorage.getItem('histbot.min') === '1'); // restore on (re)build

    // Drag by the header (minimize button excluded).
    (function makeDraggable() {
      const hdr = panelEl.querySelector('.hdr');
      let dragging = false, dx = 0, dy = 0;
      hdr.addEventListener('mousedown', (e) => {
        if (e.target.closest('.min-btn')) return;
        dragging = true;
        const r = panelEl.getBoundingClientRect();
        dx = e.clientX - r.left; dy = e.clientY - r.top;
        panelEl.style.left = r.left + 'px'; panelEl.style.top = r.top + 'px';
        panelEl.style.right = 'auto'; panelEl.style.bottom = 'auto';
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        let l = e.clientX - dx, t = e.clientY - dy;
        l = Math.max(0, Math.min(l, window.innerWidth - panelEl.offsetWidth));
        t = Math.max(0, Math.min(t, window.innerHeight - panelEl.offsetHeight));
        panelEl.style.left = l + 'px'; panelEl.style.top = t + 'px';
      });
      document.addEventListener('mouseup', () => { dragging = false; });
    })();

    refreshPanel();
  }

  function refreshPanel() {
    if (!panelEl) return;
    panelEl.classList.toggle('running', isRunning());
    const running = isRunning();
    panelEl.querySelectorAll('.start').forEach(b => {
      b.disabled = running;
      b.textContent = running ? '⏳ Running…' : (b.dataset.label || '▶ Start');
    });
    const st = panelEl.querySelector('.hb-state');
    if (st) st.textContent = isRunning() ? 'Running' : 'Idle';
    const prog = panelEl.querySelector('.hb-prog');
    if (prog) {
      const q = getQueue(), idx = getIndex();
      prog.textContent = (isRunning() && q.length) ? `Report ${Math.min(idx + 1, q.length)} of ${q.length}` : '';
    }
    renderLog();
  }

  // ───────────────── Init ─────────────────
  function init() {
    if (location.href.includes('cl-login.php') || location.href.includes('two-factor')) return;
    ensurePanel();
    if (!isRunning()) return;
    if (iAmDriver()) {
      becomeDriver();
      setTimeout(dispatch, 800);
    } else {
      // Another tab is actively driving this run — stand by. Take over only if
      // its heartbeat goes stale (that tab was closed mid-run).
      uiLog('⏸ Standing by — the bot is already running in another Paycom tab. Keep only ONE Paycom tab open during a run.');
      const watch = setInterval(() => {
        if (!isRunning()) { clearInterval(watch); return; }
        if (iAmDriver()) {
          clearInterval(watch);
          // Loud on purpose: if this ever fires while the other tab is actually
          // alive, two tabs are about to drive the same queue and reports will
          // interleave on one form. Seeing it in the log is the only way to tell
          // that apart from a normal "other tab was closed" handover.
          uiLog(`⚠ Taking over the run — the other tab has not checked in for over ${Math.round(LOCK_STALE_MS / 1000)}s.`);
          becomeDriver();
          dispatch();
        }
      }, 3000);
    }
  }

  // Keep the panel alive across Paycom's re-renders.
  setInterval(ensurePanel, 2000);

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
