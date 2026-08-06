// ==UserScript==
// @name         Paycom Historical Data Bot
// @namespace    https://www.paycomonline.net/
// @version      0.18.3
// @description  Historical Data Bot — downloads Paycom historical reports as Excel for all employees. All dates are computed at run time (previous year + current year; Prior Payroll goes back 3 years) — nothing is hardcoded. Sections: Time-Off, Time & Attendance, Accrual, HR & Audit, Payroll (ARW wizard). User opens Paycom, picks a section, ticks reports, and the bot navigates, configures, generates, and downloads each file with a clean name.
// @match        https://www.paycomonline.net/v4/cl/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

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
    { section: 'Time & Attendance', key: 'employee-punch-change', name: 'Employee Punch Change', rptId: 419, fileBase: 'EmployeePunchChange' },
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
    // ── Payroll ── (Advanced Report Writer wizard — 3-year prior payroll)
    // Range is DYNAMIC: 01/01/(this year − 3) → today. So in 2026 it's 2023→today,
    // in 2027 it's 2024→today, etc. The `name`/`fileBase` follow the same year so
    // nothing is ever hardcoded. (STARTYEAR is computed once below.)
    {
      section: 'Payroll', key: 'prior-payroll-3yr', name: `Prior Payroll (${STARTYEAR} → today)`, wizard: true,
      reportType: 'Payroll',
      step1Fields: ['Employee Code', 'Employee Name', 'Pay Class Code'],
      step2SelectAll: ['Earnings', 'Deductions', 'Taxes', 'Employer Liability', 'Accruals', 'Net', 'Taxable Wages'],
      range: { from: `01/01/${STARTYEAR}`, to: 'TODAY' },
      fileBase: `PriorPayroll_${STARTYEAR}-to-date`,
    },
  ];
  const reportByKey = (k) => REPORTS.find(r => r.key === k);
  // Distinct sections, in first-seen order — each gets its own Start button.
  const SECTIONS = REPORTS.reduce((acc, r) => acc.includes(r.section) ? acc : acc.concat(r.section), []);
  const SECTION_ICON = { 'Time-Off': '🗓️', 'Time & Attendance': '⏱️', 'Accrual': '📈', 'HR & Audit': '🧑‍💼', 'Payroll': '💵' };

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
  const log = (...args) => console.log('[HistBot]', ...args);

  // Live activity log, persisted so it survives the page reloads between reports
  // (the panel shows the last ~50 lines: which report/year is processing, saves…).
  const LOG_KEY = 'histbot.log';
  function getLog() { try { const a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function clearLog() { try { localStorage.removeItem(LOG_KEY); } catch (_) {} renderLog(); }
  function uiLog(msg) {
    log(msg);
    const arr = getLog();
    let t = '';
    try { t = new Date().toLocaleTimeString(); } catch (_) {}
    arr.push((t ? t + '  ' : '') + msg);
    while (arr.length > 50) arr.shift();
    try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (_) {}
    renderLog();
  }
  function renderLog() {
    if (!panelEl) return;
    const el = panelEl.querySelector('.hb-log');
    if (el) { el.textContent = getLog().join('\n'); el.scrollTop = el.scrollHeight; }
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
    const badge = document.querySelector(`#rpt_output .filetype.${cls}`);
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

  async function generateAndDownload(tag, baseName) {
    // Set Output Format LAST — right before Generate. "Select All" employees and
    // date changes re-render the form and reset Output Format back to HTML, so
    // setting it here (after those steps) guarantees XLSX at generation time.
    selectOutputFormat();
    await sleep(300);
    if (!isExcelSelected()) { log('Excel not selected — retrying'); selectOutputFormat(); await sleep(400); }
    if (!isExcelSelected()) log('WARN: Excel still not confirmed selected right before Generate');

    const initial = getDownloadButtons().length;
    const gen = findGenerateReportButton();
    if (!gen) throw new Error(`${tag}: Generate Report button not found`);
    showBanner(`${tag}: generating…`);
    uiLog(`${tag}: generating…`);
    clickEl(gen);
    await waitFor(() => getDownloadButtons().length > initial, {
      timeout: 10 * 60 * 1000, interval: 800, label: `${tag} Download button`,
    });
    await downloadNewest(baseName);
    await sleep(2500); // let the download commit before the next generate/navigation
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
    const ranges = report.ranges || YEARS;
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
  async function configureReviewAndGenerate(report) {
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

    const from = resolveDate(report.range.from), to = resolveDate(report.range.to);
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
  async function driveWizard(report) {
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
    await configureReviewAndGenerate(report);
  }

  // Download the generated ARW report from the recent-reports tab.
  async function wizardDownload(report) {
    showBanner(`${report.name}: waiting for the report to finish…`);
    await sleep(1500);
    const initial = getDownloadButtons().length;
    await waitFor(() => getDownloadButtons().length > initial, {
      timeout: 10 * 60 * 1000, interval: 900, label: 'wizard report Download',
    });
    await downloadNewest(report.fileBase);
    showBanner(`✓ ${report.name} downloaded`, true);
    uiLog(`✓ ${report.name} downloaded`);
  }

  // Page-based state machine for a wizard report. Guarded against runaway loops.
  const WZ_KEY = 'histbot.wz';
  const clearWz = () => { try { localStorage.removeItem(WZ_KEY); } catch (_) {} };
  async function dispatchWizard(report, idx, queue) {
    const loads = (parseInt(localStorage.getItem(WZ_KEY) || '0', 10) || 0) + 1;
    try { localStorage.setItem(WZ_KEY, String(loads)); } catch (_) {}
    if (loads > 25) {
      uiLog(`✕ Skipped ${report.name}: wizard didn't finish after many page loads`);
      clearWz(); advanceTo(idx + 1, queue); return;
    }

    const url = location.href;
    try {
      if (isOnRecentReportsTab()) {
        await wizardDownload(report);
        clearWz(); advanceTo(idx + 1, queue);
        return;
      }
      if (url.includes('/srw-reportwriter-savedReport.php')) {
        const createBtn = await waitFor(() => findByText(['button', 'a'], 'Create New Report'), { timeout: 20000, label: '"Create New Report"' });
        uiLog(`▶ ${report.name} — Create New Report…`);
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
        await driveWizard(report);
        return;
      }
      // Anywhere else → open the ARW.
      uiLog(`→ Opening Advanced Report Writer for ${report.name}…`);
      showBanner(`Opening Advanced Report Writer…`);
      location.href = ARW_SAVED_URL;
    } catch (err) {
      if (err && err.aborted) { log('Wizard aborted'); hideBanner(); return; }
      hideBanner();
      uiLog(`✕ Skipped ${report.name} (wizard): ${err && err.message ? err.message : err}`);
      clearWz(); advanceTo(idx + 1, queue);
    }
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
    clearLog();
    uiLog(`Started ${keys.length} report(s): ${keys.map(k => (reportByKey(k) || {}).name || k).join(', ')} · ${LASTYEAR} + ${THISYEAR}`);
    setState(STATES.RUNNING);
    dispatch();
  }

  function stopRun() {
    setState(STATES.IDLE);
    setIndex(0);
    clearQueue();
    clearAttempts();
    clearWz();
    hideBanner();
    document.getElementById('histbot-picker')?.remove();
    log('Stopped / reset');
  }

  function finishAll() {
    setState(STATES.IDLE);
    setIndex(0);
    clearQueue();
    clearAttempts();
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
        #histbot-panel .hb-copylog{display:inline-flex;align-items:center;width:auto;margin:0;padding:2px 8px;
          font-size:10px;font-weight:700;letter-spacing:.4px;border-radius:6px;cursor:pointer;
          background:rgba(132,169,140,.15);color:#cad2c5;border:1px solid rgba(132,169,140,.35)}
        #histbot-panel .hb-copylog:hover{transform:none;box-shadow:none;background:rgba(132,169,140,.3)}
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
        <div class="hb-loglabel">Activity <button class="hb-copylog" title="Copy the whole activity log to the clipboard">📋 Copy</button></div>
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
    if (isRunning()) setTimeout(dispatch, 800);
  }

  // Keep the panel alive across Paycom's re-renders.
  setInterval(ensurePanel, 2000);

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
