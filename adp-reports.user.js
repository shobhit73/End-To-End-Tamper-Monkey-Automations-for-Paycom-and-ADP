// ==UserScript==
// @name         ADP Workforce Now - Unified Automation (Reports + Export Documents)
// @namespace    adp-doc-export-tools
// @version      1.3.2
// @description  Reports automation (Download All, Census, SIT/FIT, License/EC, Payroll History, Deduction, Direct Deposit, Qualified Overtime Wages and Tips) + Export Documents bot (auto-detect categories, sequential export, auto-download). One shared panel.
// @match        https://workforcenow.adp.com/*
// @noframes
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// =====================================================================
// MODULE 1 of 2 — Reports automation (Census / SIT-FIT / License-EC /
// Payroll History / Deduction / Direct Deposit). Self-contained IIFE.
// =====================================================================
(function () {
  'use strict';

  // ───────────────── column lists (verbatim from v9.2 ADP Multi-Mode Assistant) ─────────────────

  const SIT_FIT_COLUMNS = [
    "Associate ID (Employment Profile)",
    "Legal First Name (Personal Profile)",
    "Legal Last Name (Personal Profile)",
    "Legal Middle Name (Personal Profile)",
    "Salutation (Personal Profile)",
    "Do Not Calculate Federal Income Tax (Tax Withholdings)",
    "Do Not Calculate Federal Taxable (Tax Withholdings)",
    "Federal/W4 Additional Tax Type Description (Tax Withholdings)",
    "Federal Additional Tax Amount Percentage (Tax Withholdings)",
    "Federal Additional Tax Amount (Tax Withholdings)",
    "Federal/W4 Exemptions (Tax Withholdings)",
    "Federal/W4 Marital Status Description (Tax Withholdings)",
    "Federal/W4 Effective Date (Tax Withholdings)",
    "Federal/W4 Effective End Date (Tax Withholdings)",
    "Dependents (Tax Withholdings)",
    "Deductions (Tax Withholdings)",
    "Multiple Jobs indicator (Tax Withholdings)",
    "Other Income (Tax Withholdings)",
    "Non-Resident Alien (Tax Withholdings)",
    "Do not calculate Medicare (Tax Withholdings)",
    "Do not calculate Social Security (Tax Withholdings)",
    "Do not calculate State Tax (Tax Withholdings)",
    "Do not calculate State Taxable (Tax Withholdings)",
    "Lived In State Tax Code",
    "State Tax Code (Tax Withholdings)",
    "State Tax Description (Tax Withholdings)",
    "State Marital Status Code (Tax Withholdings)",
    "State Marital Status Description (Tax Withholdings)",
    "State Exemptions/Allowances (Tax Withholdings)",
    "Exemptions in Dollars (Tax Withholdings)",
    "State Additional Tax Type Description (Tax Withholdings)",
    "State Additional Tax Amount (Tax Withholdings)",
    "State Additional Tax Amount Percentage (Tax Withholdings)",
    "Household employee (Tax Withholdings)",
    "Itemized Deduction Allowance (Tax Withholdings)",
    "Itemized Deductions (Tax Withholdings)",
    "MD County Code (Tax Withholdings)",
    "Medical Leave Insurance",
    "NJ Tax Table (Tax Withholdings)",
    "ND Actual # of Dependents",
    "Parental Leave Insurance",
    "Family Leave Insurance",
    "Do not calculate SUI/SDI Tax (Tax Withholdings)",
    "Do not calculate Washington Cares Fund Tax (Tax Withholdings)",
    "Do not calculate workers compensation (Tax Withholdings)",
    "Do not calculate family leave insurance (FLI) tax (Tax Withholdings)",
    "CT Filing Status (Tax Withholdings)",
    "# of Dependent Children (Personal Profile)",
    "Primary Address: County (Personal Profile)",
    "Lived in State Code (Tax Withholdings)",
    "Lived in State Description (Tax Withholdings)",
    "Worked in State Code (Tax Withholding)",
    "Worked in State Description (Tax Withholding)"
  ];

  const CENSUS_COLUMNS = [
    "Legal First Name (Personal Profile)",
    "Legal Middle Name (Personal Profile)",
    "Legal Last Name (Personal Profile)",
    "Generation Suffix Code (Personal Profile)",
    "Generation Suffix Description (Personal Profile)",
    "Associate ID (Employment Profile)",
    "Position ID (Employment Profile)",
    "Birth Date (Personal Profile)",
    "Tax ID (SSN) (Personal Profile)",
    "Hire Date (Employment Profile)",
    "Hire/Rehire Date (Employment Profile)",
    "Termination Date (Employment Profile)",
    "Termination Reason Code (Employment Profile)",
    "Termination Reason Description (Employment Profile)",
    "Tobacco User (Personal Profile)",
    "Sex (Personal Profile)",
    "Gender / Sex (Self-ID) (Personal Profile)",
    "Marital Status Code (Personal Profile)",
    "Marital Status Description (Personal Profile)",
    "FLSA Description (Employment Profile)",
    "FLSA Code (Employment Profile)",
    "Worker category description (Employment Profile)",
    "Annual Salary (Employment Profile - Pay Rates)",
    "Job Title Description (Employment Profile)",
    "Position Start Date (Employment Profile)",
    "Reports To Associate ID (Employment Profile)",
    "EEOC Job Classification (Employment Profile)",
    "Race Description (Personal Profile)",
    "Primary Address: Address Line 1 (Personal Profile)",
    "Primary Address: Address Line 2 (Personal Profile)",
    "Primary Address: Address Line 3 (Personal Profile)",
    "Primary Address: City (Personal Profile)",
    "Primary Address: Country Code (Personal Profile)",
    "Primary Address: Country (Personal Profile)",
    "Primary Address: County (Personal Profile)",
    "Primary Address: State / Territory Code (Personal Profile)",
    "Primary Address: State / Territory Description (Personal Profile)",
    "Primary Address: Zip / Postal Code (Personal Profile)",
    "Personal Contact: Personal Email (Personal Profile)",
    "Personal Contact: Personal Mobile (Personal Profile)",
    "Protected Veteran Status (Statutory Compliance)",
    "Disabled Veteran (Statutory Compliance)",
    "Work Address: Address Line 1 (Personal Profile)",
    "Work Address: Address Line 2 (Personal Profile)",
    "Work Address: City (Personal Profile)",
    "Work Address: State / Territory Code (Personal Profile)",
    "Work Address: Zip / Postal Code (Personal Profile)",
    "Location Description (Employment Profile)",
    "SOC Code (Tax Withholdings)",
    "SOC Description (Tax Withholdings)",
    "Compensation Information",
    "Pay Frequency (Employment Profile - Pay Rates)",
    "Payroll Name (Personal Profile)",
    "Standard Hours (Employment Profile - Pay Rates)",
    "# of Dependents (Personal Profile)",
    "Work Contact: Work Email (Personal Profile)",
    "Regular Pay Rate Code (Employment Profile - Pay Rates)",
    "Regular Pay Rate Description (Employment Profile - Pay Rates)",
    "Regular Pay Rate",
    "Position Status (Employment Profile)",
    "NAICS Workers' Comp Code (Employment Profile)",
    "NAICS Workers' Comp Description (Employment Profile)",
    "NAICS Workers' Comp",
    "Legal / Preferred Address: Address Line 1 (Personal Profile)",
    "Legal / Preferred Address: Address Line 2 (Personal Profile)",
    "Legal / Preferred Address: City (Personal Profile)",
    "Legal / Preferred Address: Zip / Postal Code (Personal Profile)",
    "Legal / Preferred Address: State / Territory Code (Personal Profile)",
    "Pronouns (Personal Profile)",
    "Worked in State Code (Tax Withholding)"
  ];

  const LICENSE_EC_COLUMNS = [
    "Legal First Name (Personal Profile)",
    "Legal Last Name (Personal Profile)",
    "Associate ID (Employment Profile)",
    "License/Certification Description (Talent Profile)",
    "License/Certification ID (Talent Profile)",
    "Issued By (Talent Profile)",
    "Expiration Date (Talent Profile)",
    "Contact Name (personal profile)",
    "Relationship Description (personal profile)",
    "Mobile Phone (personal profile)"
  ];

  // Fields to select on the Payroll History "What's Displayed" panel.
  // These are the aria-label values on the checkbox buttons.
  const PAYROLL_HISTORY_FIELDS = [
    "Tax ID",
    "Associate ID",
    "Worked In State",
    "Period Beginning Date",
    "Period Ending Date",
    "Pay Date",
    "Check/Voucher #",
    "Gross Pay",
    "Take Home",
    "Direct Deposit",
    "Net Pay",
    "Regular Hours",
    "Overtime Hours",
    "Additional Hours",
    "Total Hours",
    "Regular Earnings",
    "Overtime Earnings",
    "Additional Earnings",
    "Total Earnings",
    "Voluntary Deductions",
    "Total Voluntary Deductions",
    "Memos",
    "Total Memos",
    "Federal Tax - Employee",
    "State Tax - Employee",
    "Local Tax - Employee",
    "Total Employee Tax",
    "Federal Tax - Employer",
    "State Tax- Employer",
    "Local tax - Employer",
    "Total Employer Tax",
    "Federal taxable",
    "State taxable",
    "Local taxable"
  ];

  const FIELD_NAME_CORRECTIONS = {
    "CT Filing Status (Tax Withholdings)": "CT Filing Status",
    "Tax ID (SSN) (Personal Profile)": "Tax ID (SSN)",
    "Sex (Personal Profile)": "Sex",
    "Gender / Sex (Self-ID) (Personal Profile)": "Gender / Sex",
    "Annual Salary (Employment Profile - Pay Rates)": "Annual Salary",
    "Reports To Associate ID (Employment Profile)": "Reports To"
  };

  // ───────────────── logging ─────────────────

  const LOG_LEVELS = {
    info: { color: '#a8c6ec', prefix: 'INFO ' },
    warn: { color: '#ffc66d', prefix: 'WARN ' },
    error: { color: '#ff8080', prefix: 'ERROR' },
    success: { color: '#4ade80', prefix: 'OK   ' },
    debug: { color: '#6b82a6', prefix: 'DEBUG' },
  };

  let logEl;
  const pendingLogs = [];
  const MAX_LOG_LINES = 200;

  function log(level, ...parts) {
    if (!LOG_LEVELS[level]) { parts.unshift(level); level = 'info'; }
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    const text = parts.map(p => {
      if (p == null) return String(p);
      if (typeof p === 'string') return p;
      try { return JSON.stringify(p); } catch (_) { return String(p); }
    }).join(' ');
    console.log('%c[ADPBot]%c ' + ts + ' ' + LOG_LEVELS[level].prefix, 'color:#d40511;font-weight:bold', 'color:' + LOG_LEVELS[level].color, ...parts);
    appendLogLine(level, ts, text);
  }
  const logInfo = (...p) => log('info', ...p);
  const logWarn = (...p) => log('warn', ...p);
  const logError = (...p) => log('error', ...p);
  const logSuccess = (...p) => log('success', ...p);
  const logDebug = (...p) => log('debug', ...p);

  function appendLogLine(level, ts, text) {
    const entry = { level, ts, text };
    if (!logEl) { pendingLogs.push(entry); return; }
    const line = document.createElement('div');
    line.style.cssText = 'color:' + LOG_LEVELS[level].color + ';white-space:pre-wrap;word-break:break-word;line-height:1.3;padding:1px 0;';
    const tsSpan = document.createElement('span');
    tsSpan.style.cssText = 'color:#52749e;';
    tsSpan.textContent = ts + ' ';
    const lvlSpan = document.createElement('span');
    lvlSpan.style.cssText = 'font-weight:bold;';
    lvlSpan.textContent = LOG_LEVELS[level].prefix + ' ';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = text;
    line.appendChild(tsSpan);
    line.appendChild(lvlSpan);
    line.appendChild(msgSpan);
    logEl.appendChild(line);
    while (logEl.children.length > MAX_LOG_LINES) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function flushPendingLogs() {
    while (pendingLogs.length) {
      const e = pendingLogs.shift();
      appendLogLine(e.level, e.ts, e.text);
    }
  }

  // ───────────────── DOM helpers ─────────────────

  // Walk every open shadow root AND every same-origin iframe. ADP's top nav
  // lives in a Stencil shadow root; the Reports module is a legacy MAS app
  // embedded as a same-origin iframe (Dojo dijit widgets); the field canvas
  // is a separate Angular view in the shell DOM.
  function deepQueryAll(selector, root = document) {
    const out = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      try {
        const matches = node.querySelectorAll(selector);
        for (const m of matches) out.push(m);
      } catch (_) { }
      let all;
      try { all = node.querySelectorAll('*'); } catch (_) { all = []; }
      for (const el of all) {
        if (el.shadowRoot) stack.push(el.shadowRoot);
        if (el.tagName === 'IFRAME') {
          try {
            const cd = el.contentDocument;
            if (cd) stack.push(cd);
          } catch (_) { /* cross-origin */ }
        }
      }
    }
    return out;
  }

  // ───────────────── abort plumbing ─────────────────

  // Set to true by the Stop button. Every sleep() call polls this so any
  // in-flight wait bails within ~100ms of the click. The flow's outer
  // try/catch checks err.aborted and exits gracefully.
  let aborted = false;
  function shouldAbort() { return aborted; }
  function resetAbort() { aborted = false; }
  function requestAbort() { aborted = true; }

  const sleep = (ms) => new Promise((resolve, reject) => {
    const start = Date.now();
    (function tick() {
      if (shouldAbort()) {
        const e = new Error('aborted');
        e.aborted = true;
        return reject(e);
      }
      const remaining = ms - (Date.now() - start);
      if (remaining <= 0) return resolve();
      setTimeout(tick, Math.min(100, remaining));
    })();
  });

  // Wrapper: throw if abort was requested. Use between sync steps that don't
  // sleep, so a Stop click between them still interrupts the flow.
  function checkAbort() {
    if (shouldAbort()) {
      const e = new Error('aborted');
      e.aborted = true;
      throw e;
    }
  }

  function clickEl(el) {
    if (!el) return;
    const ownerDoc = el.ownerDocument || document;
    const ownerWin = ownerDoc.defaultView || window;
    const MouseEventCtor = ownerWin.MouseEvent || MouseEvent;
    // Dispatch the pre-click pointer/mouse events. Note: 'click' is intentionally
    // NOT in this list — el.click() below produces the actual click event. If we
    // dispatched 'click' AND called el.click(), toggle-style buttons (e.g. the
    // Export menu) would open and immediately close again.
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(ev => {
      try {
        el.dispatchEvent(new MouseEventCtor(ev, { bubbles: true, cancelable: true, view: ownerWin, button: 0, buttons: 1 }));
      } catch (_) { }
    });
    // Native click — single fire. Also follows hrefs on <a>.
    try { el.click(); } catch (_) { }
    // Dojo dijit click event for legacy widgets.
    try {
      const Ev = ownerWin.Event || Event;
      el.dispatchEvent(new Ev('dijitclick', { bubbles: true, cancelable: true }));
    } catch (_) { }
  }

  function dblClickEl(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }));
    } catch (_) { }
  }

  function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    } catch (_) { }
    return true;
  }

  function setReactInputValue(input, value) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ───────────────── ADP-specific lookups ─────────────────

  function findReportsButton() {
    const buttons = deepQueryAll('button');
    for (const btn of buttons) {
      if (normalize(btn.textContent) === 'reports & analytics') return btn;
    }
    return null;
  }

  function findHiddenMegaMenuPanes() {
    return deepQueryAll('sdf-floating-pane').filter(p => {
      if (!p.classList.contains('floating-pane-hidden')) return false;
      if (p.querySelector('wfn-shell-mega-menu')) return true;
      return deepQueryAll('wfn-shell-mega-menu', p).length > 0;
    });
  }

  function findAllMegaMenuPanes() {
    return deepQueryAll('sdf-floating-pane').filter(p => {
      if (p.querySelector('wfn-shell-mega-menu')) return true;
      return deepQueryAll('wfn-shell-mega-menu', p).length > 0;
    });
  }

  function findAnchorByText(text) {
    const target = normalize(text);
    for (const a of deepQueryAll('a')) {
      if (normalize(a.textContent) === target) return a;
    }
    return null;
  }

  // ADP renders many controls (Create new report, Select Fields, Save + Run)
  // as Stencil web components (<sdf-button>) or Dojo dijit widgets
  // (<span role="button" class="dijit ...">) — neither has its label inside
  // an inner <button>'s textContent, so we search the host element types.
  const CLICKABLE_HOST_SELECTOR = [
    'button', 'a', 'input[type="button"]', 'input[type="submit"]',
    '[role="button"]', 'sdf-button', 'sdf-icon-button', 'sdf-link', 'sdf-menu-item',
  ].join(', ');

  function findVisibleClickableByText(text) {
    const target = normalize(text);
    for (const el of deepQueryAll(CLICKABLE_HOST_SELECTOR)) {
      if (!visible(el)) continue;
      const t = normalize(el.textContent || el.value);
      if (t === target) return el;
    }
    return null;
  }

  function dismissMegaMenuPanes() {
    const panes = findAllMegaMenuPanes();
    let added = 0;
    panes.forEach(p => {
      if (!p.classList.contains('floating-pane-hidden')) {
        p.classList.add('floating-pane-hidden');
        added++;
      }
    });
    return added;
  }

  // ───────────────── flow steps ─────────────────

  // Step 1: open the Reports & Analytics mega-menu (force-strip the hide class
  // because synthetic clicks don't trigger the visual reveal).
  async function stepOpenReportsMenu() {
    const btn = findReportsButton();
    if (!btn) {
      logError('Reports & Analytics button not found');
      return false;
    }
    logSuccess('Found Reports & Analytics button');
    clickEl(btn);
    const chevron = btn.querySelector('sdf-icon');
    if (chevron) clickEl(chevron);
    const svg = btn.querySelector('svg');
    if (svg) clickEl(svg);
    await sleep(600);

    const stillHidden = findHiddenMegaMenuPanes();
    if (stillHidden.length) {
      stillHidden.forEach(p => p.classList.remove('floating-pane-hidden'));
      logInfo('Stripped floating-pane-hidden on', stillHidden.length, 'pane(s)');
    }
    return true;
  }

  // Step 2: click the All Custom Reports anchor.
  async function stepClickAllCustomReports() {
    let a = null;
    for (let i = 0; i < 15 && !a; i++) {
      a = findAnchorByText('All Custom Reports');
      if (!a) await sleep(200);
    }
    if (!a) {
      logError('"All Custom Reports" anchor not found');
      return false;
    }
    const href = a.getAttribute('href');
    const startHash = location.hash;
    clickEl(a);
    logInfo('Clicked All Custom Reports (href=' + href + ')');
    await sleep(800);
    if (location.hash === startHash) {
      if (href && href.startsWith('#')) {
        location.hash = href;
        await sleep(400);
      } else {
        logError('Navigation failed — href is not a hash route');
        return false;
      }
    }
    // Cleanup: re-hide the manually-opened pane.
    await sleep(200);
    dismissMegaMenuPanes();
    const navBtn = findReportsButton();
    if (navBtn) navBtn.setAttribute('aria-expanded', 'false');
    logSuccess('Navigated to All Custom Reports');
    return true;
  }

  // Step 3: click "Create new report" (a Dojo dijit widget inside the iframe).
  async function stepCreateNewReport() {
    // Up to 60s — the All Custom Reports iframe can be slow to render.
    let createBtn = null;
    for (let i = 0; i < 120 && !createBtn; i++) {
      createBtn = findVisibleClickableByText('Create new report');
      if (!createBtn) await sleep(500);
    }
    if (!createBtn) {
      logError('"Create new report" button not found');
      return false;
    }
    clickEl(createBtn);
    logSuccess('Clicked Create new report');
    return true;
  }

  // Step 4: fill the Report Title input.
  async function stepFillReportTitle(title) {
    // Up to 60s — the "Set Up New Report" page can render slowly (ADP/Dojo,
    // worse on a throttled/backgrounded tab), and the title input appears late.
    let titleInput = null;
    for (let i = 0; i < 120 && !titleInput; i++) {
      titleInput = deepQueryAll('input').filter(visible)
        .find(inp => /report ?name|report ?title/i.test(inp.placeholder || ''));
      if (!titleInput) await sleep(500);
    }
    if (!titleInput) {
      logError('Report Title input not found');
      return false;
    }
    titleInput.focus();
    setReactInputValue(titleInput, title);
    await sleep(400);
    if ((titleInput.value || '').trim() !== title) {
      titleInput.focus();
      titleInput.select && titleInput.select();
      setReactInputValue(titleInput, title);
      await sleep(300);
    }
    logSuccess('Typed title: ' + title);
    return true;
  }

  // Step 5: click Select Fields.
  async function stepClickSelectFields() {
    // Up to 45s — the Set Up New Report page can render the button late.
    let sfBtn = null;
    for (let i = 0; i < 90 && !sfBtn; i++) {
      sfBtn = findVisibleClickableByText('Select Fields');
      if (!sfBtn) await sleep(500);
    }
    if (!sfBtn) {
      logError('Select Fields button not found');
      return false;
    }
    clickEl(sfBtn);
    logSuccess('Clicked Select Fields');
    return true;
  }

  // Step 6: wait for the field-selection canvas (signaled by the search input).
  async function stepWaitForCanvas() {
    for (let i = 0; i < 60; i++) { // up to 30s
      const search = deepQueryAll('input[name="search"].adpr-search-input').filter(visible)[0];
      if (search) {
        logSuccess('Field-selection canvas ready');
        return true;
      }
      await sleep(500);
    }
    logError('Field-selection canvas did not appear in time');
    return false;
  }

  // Step 7: click "Save + Run" on the field canvas (id=saveRunBtn).
  async function stepClickSaveAndRun() {
    let btn = null;
    for (let i = 0; i < 20 && !btn; i++) {
      btn = deepQueryAll('#saveRunBtn').filter(visible)[0]
        || deepQueryAll('button[aria-label="Save + Run"]').filter(visible)[0]
        || findVisibleClickableByText('Save + Run');
      if (!btn) await sleep(300);
    }
    if (!btn) { logError('Save + Run button not found'); return false; }
    clickEl(btn);
    logSuccess('Clicked Save + Run');
    return true;
  }

  // Step 8: in the Runtime Settings popup that appears, click "Run" (the
  // autofocus button inside the dialog — distinct from any "Run" button on the
  // outer page).
  async function stepClickRunInPopup() {
    let runBtn = null;
    for (let i = 0; i < 25 && !runBtn; i++) {
      // Prefer the autofocus button — that's the popup's primary action.
      const autofocusBtns = deepQueryAll('button[autofocus]').filter(visible);
      runBtn = autofocusBtns.find(b => normalize(b.textContent) === 'run');
      // Fallback: a button with text "Run" sitting inside any visible dialog.
      if (!runBtn) {
        const modals = deepQueryAll('.modal-dialog, [role="dialog"], .adpr-modal, .adp-modal').filter(visible);
        for (const m of modals) {
          const candidates = m.querySelectorAll('button');
          for (const b of candidates) {
            if (visible(b) && normalize(b.textContent) === 'run') { runBtn = b; break; }
          }
          if (runBtn) break;
        }
      }
      if (!runBtn) await sleep(400);
    }
    if (!runBtn) { logError('Run button in Runtime Settings popup not found'); return false; }
    clickEl(runBtn);
    logSuccess('Clicked Run in Runtime Settings popup');
    return true;
  }

  // Step 9: wait for the View Report page (signaled by the Export button).
  async function stepWaitForViewReport() {
    for (let i = 0; i < 120; i++) { // up to 60s — report generation can be slow
      const exportBtn = deepQueryAll('#exportBtn').filter(visible)[0];
      if (exportBtn) {
        logSuccess('View Report page ready');
        return true;
      }
      await sleep(500);
    }
    logError('View Report page did not appear in time');
    return false;
  }

  function findExportButton() {
    return deepQueryAll('#exportBtn').filter(visible)[0]
      || findVisibleClickableByText('Export');
  }

  function findCsvOption() {
    let opt = deepQueryAll('[role="tab"][aria-label="CSV"]').filter(visible)[0];
    if (opt) return opt;
    const items = deepQueryAll('li, [role="tab"], [role="menuitem"]').filter(visible);
    return items.find(el => normalize(el.textContent) === 'csv') || null;
  }

  // Step 10+11 combined: click Export, find CSV in the menu, click it. If the
  // menu doesn't appear (or briefly opens-then-closes), re-click Export and try
  // again — up to 4 attempts total.
  async function stepExportAsCSV() {
    let btn = null;
    for (let i = 0; i < 15 && !btn; i++) {
      btn = findExportButton();
      if (!btn) await sleep(300);
    }
    if (!btn) { logError('Export button not found'); return false; }

    for (let attempt = 1; attempt <= 4; attempt++) {
      clickEl(btn);
      logInfo('Clicked Export (attempt ' + attempt + '/4)');

      // Poll for CSV in the open menu.
      let opt = null;
      for (let i = 0; i < 16 && !opt; i++) { // ~4s per attempt
        opt = findCsvOption();
        if (!opt) await sleep(250);
      }
      if (opt) {
        clickEl(opt);
        logSuccess('Clicked CSV — file should download');
        return true;
      }

      logWarn('Export menu did not show CSV — retrying');
      await sleep(400);
    }

    logError('CSV export option not found after 4 attempts');
    return false;
  }

  // ───────────────── payroll history steps ─────────────────

  // Step P1: click "All Standard Reports" in the mega-menu.
  async function stepClickAllStandardReports() {
    let a = null;
    for (let i = 0; i < 15 && !a; i++) {
      a = findAnchorByText('All Standard Reports');
      if (!a) await sleep(200);
    }
    if (!a) {
      logError('"All Standard Reports" anchor not found');
      return false;
    }
    const href = a.getAttribute('href');
    const startHash = location.hash;
    clickEl(a);
    logInfo('Clicked All Standard Reports (href=' + href + ')');
    await sleep(800);
    if (location.hash === startHash) {
      if (href && href.startsWith('#')) {
        location.hash = href;
        await sleep(400);
      } else {
        logError('Navigation failed — href is not a hash route');
        return false;
      }
    }
    await sleep(200);
    dismissMegaMenuPanes();
    const navBtn = findReportsButton();
    if (navBtn) navBtn.setAttribute('aria-expanded', 'false');
    logSuccess('Navigated to All Standard Reports');
    return true;
  }

  // Step P2: search for "Payroll History" on the Standard Reports page.
  // The search box is a Dojo dijit TextBox (id="RevSearchInput_searchbox")
  // and the submit button is hidden (height:0) but clickable
  // (id="RevSearchInput_searchboxButton", data-dojo-attach-event="onClick:_onSearch").
  async function stepSearchPayrollHistory() {
    // Find the Dojo search input by its specific ID
    let searchInput = null;
    for (let i = 0; i < 30 && !searchInput; i++) {
      searchInput = deepQueryAll('#RevSearchInput_searchbox')
        .find(el => el.tagName && el.tagName.toLowerCase() === 'input');
      if (!searchInput) await sleep(300);
    }
    if (!searchInput) {
      logError('Dojo search input #RevSearchInput_searchbox not found');
      return false;
    }
    logInfo('Found Dojo search input');

    // Set value using multiple approaches for Dojo compatibility
    searchInput.focus();
    searchInput.value = 'Payroll History';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Also try the native setter (in case Dojo intercepts .value)
    try {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) {
        desc.set.call(searchInput, 'Payroll History');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (_) { }

    // Also try setting via the Dojo widget API if available
    try {
      const ownerDoc = searchInput.ownerDocument || document;
      const ownerWin = ownerDoc.defaultView || window;
      if (ownerWin.dijit && ownerWin.dijit.byId) {
        const widget = ownerWin.dijit.byId('RevSearchInput_searchbox');
        if (widget && widget.set) {
          widget.set('value', 'Payroll History');
          logInfo('Set value via Dojo widget API');
        }
      }
    } catch (e) {
      logDebug('Dojo widget API not available: ' + e);
    }

    await sleep(300);

    // Click the search button directly by ID (it has height:0 but click still works)
    let searchBtn = null;
    searchBtn = deepQueryAll('#RevSearchInput_searchboxButton')[0];
    if (searchBtn) {
      logInfo('Found search button by ID, clicking');
      // Use el.click() directly — Dojo's attach-event responds to native click
      try { searchBtn.click(); } catch (_) { }
      // Also dispatch dijitclick for good measure
      try {
        const ownerDoc = searchBtn.ownerDocument || document;
        const ownerWin = ownerDoc.defaultView || window;
        searchBtn.dispatchEvent(new (ownerWin.Event || Event)('dijitclick', { bubbles: true, cancelable: true }));
      } catch (_) { }
    } else {
      logWarn('Search button not found by ID — trying Enter key');
      searchInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
      }));
    }

    // Wait for results to load
    await sleep(3000);
    logSuccess('Search submitted for "Payroll History"');
    return true;
  }

  // Step P3: select "Payroll History" with Type "Standard" from results.
  // The report name is a Dojo dijit Button (<span role="button" title="Payroll History">)
  // — NOT an <a> tag. Use the title attribute for clean matching.
  async function stepSelectPayrollHistoryStandard() {
    let target = null;
    for (let attempt = 0; attempt < 20 && !target; attempt++) {
      // Find all elements with title="Payroll History" (exact match)
      const candidates = deepQueryAll('[title="Payroll History"]').filter(visible);
      for (const el of candidates) {
        // Verify this is in a row that also contains "Standard"
        const row = el.closest('tr, [role="row"], li, div[class*="row"]');
        if (row) {
          const rowText = (row.textContent || '');
          if (rowText.includes('Standard')) {
            target = el;
            break;
          }
        }
        // Fallback: if no row container found, check parent/grandparent
        if (!target) {
          let parent = el.parentElement;
          for (let depth = 0; depth < 5 && parent; depth++) {
            const txt = (parent.textContent || '');
            if (txt.includes('Standard') && txt.includes('Payroll History')) {
              target = el;
              break;
            }
            parent = parent.parentElement;
          }
        }
        if (target) break;
      }
      if (!target) await sleep(500);
    }

    if (!target) {
      logError('Payroll History (Standard) not found in search results');
      return false;
    }

    logInfo('Found Payroll History button:', target.tagName, target.id);
    clickEl(target);
    logSuccess('Selected Payroll History (Standard)');
    return true;
  }

  // Step P4: wait for the "Run Report" page to load after selecting Payroll History.
  // Instead of looking for a specific heading tag, we look for elements that only
  // appear on this page: "What's Displayed on the Report" or "Run as Excel".
  async function stepWaitForRunReportPage() {
    // Up to 60s — ADP's Dojo widgets can be slow to render the action area,
    // especially on a backgrounded/throttled tab. Callers that need the report
    // sections wait for them separately after this returns, so detecting the
    // page is enough here.
    for (let i = 0; i < 120; i++) { // up to 60s
      const clickables = deepQueryAll(CLICKABLE_HOST_SELECTOR).filter(visible);
      for (const el of clickables) {
        const text = normalize(el.textContent || el.value);
        if (text.includes("what's displayed on the report") ||
          text.includes("what’s displayed on the report") ||
          text === 'run as excel' || text === 'save my settings') {
          logSuccess('Run Report page loaded');
          return true;
        }
      }
      // Fallback: the "Run Report" page heading itself. The page shell often
      // appears before the Dojo action widgets finish; this avoids a false
      // timeout when the heading is clearly present.
      const headings = deepQueryAll('h1, h2, h3, [role="heading"]').filter(visible);
      for (const h of headings) {
        if (normalize(h.textContent) === 'run report') {
          logSuccess('Run Report page loaded (heading detected)');
          return true;
        }
      }
      await sleep(500);
    }
    logError('Run Report page did not load in time');
    return false;
  }

  // Step P5: click the pencil icon next to "What's Displayed on the Report".
  // The pencil is an SVG inside a clickable container near that text.
  async function stepClickWhatsDisplayed() {
    let target = null;
    for (let i = 0; i < 20 && !target; i++) {
      // Strategy 1: find a clickable element whose text contains "What's Displayed"
      const clickables = deepQueryAll('a, button, [role="button"], [role="link"]').filter(visible);
      for (const el of clickables) {
        const text = (el.textContent || '').trim();
        if (text.includes("What's Displayed on the Report") || text.includes("What’s Displayed on the Report")) {
          target = el;
          break;
        }
      }

      // Strategy 2: find the text, then look for a nearby SVG/pencil icon
      if (!target) {
        const allEls = deepQueryAll('span, div, a, h3, h4, p').filter(visible);
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (text.startsWith("What's Displayed") || text.startsWith("What’s Displayed")) {
            // Look for an SVG (pencil icon) inside or next to this element
            const parent = el.parentElement;
            if (parent) {
              const svg = parent.querySelector('svg');
              if (svg) {
                // Click the parent container that holds both the text and the icon
                target = parent;
                break;
              }
            }
            // Or the element itself might be the clickable container
            const svgInside = el.querySelector('svg');
            if (svgInside) {
              target = el;
              break;
            }
          }
        }
      }

      if (!target) await sleep(500);
    }

    if (!target) {
      logError('"What\'s Displayed on the Report" pencil not found');
      return false;
    }

    logInfo('Found What\'s Displayed target:', target.tagName);
    clickEl(target);
    logSuccess('Clicked "What\'s Displayed on the Report"');
    return true;
  }

  // Step P6b: on the "What's Displayed" panel, clear all defaults then select
  // only the fields in PAYROLL_HISTORY_FIELDS. Finally click Save.
  async function stepSelectPayrollDisplayFields() {
    // Wait for the field selection panel to appear
    let panelReady = false;
    for (let i = 0; i < 20 && !panelReady; i++) {
      const labels = deepQueryAll('.checkactionbubble-text').filter(visible);
      if (labels.length > 5) {
        panelReady = true;
        break;
      }
      await sleep(500);
    }
    if (!panelReady) {
      logError('Field selection panel did not load');
      return false;
    }
    logInfo('Field selection panel loaded');
    await sleep(500);

    // Step 1: Click "Select All" to enable "Clear All"
    const selectAllBtn = deepQueryAll('#stdrptlabel_selectAll')[0];
    if (selectAllBtn) {
      logInfo('Clicking Select All');
      clickEl(selectAllBtn);
      await sleep(800);
    }

    // Step 2: Click "Clear All" to uncheck everything
    let clearAllBtn = deepQueryAll('#stdrptlabel_RemoveAll')[0];
    if (clearAllBtn) {
      // Force-enable if disabled (DOM manipulation — per our lesson)
      if (clearAllBtn.hasAttribute('disabled')) {
        clearAllBtn.removeAttribute('disabled');
        clearAllBtn.removeAttribute('aria-disabled');
        clearAllBtn.classList.remove('disabled');
        clearAllBtn.setAttribute('tabindex', '0');
        logInfo('Force-enabled Clear All button');
      }
      logInfo('Clicking Clear All');
      clickEl(clearAllBtn);
      await sleep(800);
    } else {
      logWarn('Clear All button not found — will try to uncheck individually');
    }

    // Step 3: Select each field in PAYROLL_HISTORY_FIELDS by aria-label
    let selectedCount = 0;
    let failedFields = [];

    for (const fieldName of PAYROLL_HISTORY_FIELDS) {
      // Find the checkbox button by aria-label (exact match, case-insensitive)
      let fieldBtn = null;
      const allBtns = deepQueryAll('button[aria-label]').filter(visible);
      for (const btn of allBtns) {
        const label = (btn.getAttribute('aria-label') || '').trim();
        if (label.toLowerCase() === fieldName.toLowerCase()) {
          fieldBtn = btn;
          break;
        }
      }

      // Fallback: find by the checkactionbubble-text span
      if (!fieldBtn) {
        const textSpans = deepQueryAll('.checkactionbubble-text').filter(visible);
        for (const span of textSpans) {
          if (span.textContent.trim().toLowerCase() === fieldName.toLowerCase()) {
            // Find the button in the same row
            const container = span.closest('.flexSpaceBetween') || span.parentElement?.parentElement;
            if (container) {
              fieldBtn = container.querySelector('button');
            }
            break;
          }
        }
      }

      if (fieldBtn) {
        // Check if it's already selected (container has _selected class)
        const container = fieldBtn.closest('[class*="checkactionbubble-container"]');
        const isSelected = container && container.className.includes('_selected');
        if (!isSelected) {
          clickEl(fieldBtn);
          selectedCount++;
          logDebug('Selected: ' + fieldName);
        } else {
          selectedCount++;
          logDebug('Already selected: ' + fieldName);
        }
      } else {
        failedFields.push(fieldName);
        logWarn('Field not found: ' + fieldName);
      }
      await sleep(200); // brief pause between each
    }

    logInfo('Selected ' + selectedCount + '/' + PAYROLL_HISTORY_FIELDS.length + ' fields');
    if (failedFields.length) {
      logWarn('Failed to find: ' + failedFields.join(', '));
    }

    // Step 4: Click Save
    await sleep(500);
    let saveBtn = null;
    const buttons = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
    for (const btn of buttons) {
      const text = normalize(btn.textContent);
      if (text === 'save') {
        saveBtn = btn;
        break;
      }
    }
    if (saveBtn) {
      clickEl(saveBtn);
      logSuccess('Clicked Save — field selection complete');
      await sleep(1000);
    } else {
      logError('Save button not found on field selection panel');
      return false;
    }

    return failedFields.length === 0;
  }

  // ───────────────── generic standard-report helpers ─────────────────

  // Generic: search for any report in the Dojo search box on Standard Reports page
  async function stepSearchDojoReport(searchTerm) {
    let searchInput = null;
    for (let i = 0; i < 30 && !searchInput; i++) {
      searchInput = deepQueryAll('#RevSearchInput_searchbox')
        .find(el => el.tagName && el.tagName.toLowerCase() === 'input');
      if (!searchInput) await sleep(300);
    }
    if (!searchInput) {
      logError('Dojo search input not found');
      return false;
    }
    logInfo('Found Dojo search input');

    searchInput.focus();
    searchInput.value = searchTerm;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    try {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) {
        desc.set.call(searchInput, searchTerm);
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (_) { }

    try {
      const ownerDoc = searchInput.ownerDocument || document;
      const ownerWin = ownerDoc.defaultView || window;
      if (ownerWin.dijit && ownerWin.dijit.byId) {
        const widget = ownerWin.dijit.byId('RevSearchInput_searchbox');
        if (widget && widget.set) {
          widget.set('value', searchTerm);
          logInfo('Set value via Dojo widget API');
        }
      }
    } catch (_) { }

    await sleep(300);

    let searchBtn = deepQueryAll('#RevSearchInput_searchboxButton')[0];
    if (searchBtn) {
      logInfo('Clicking search button');
      try { searchBtn.click(); } catch (_) { }
      try {
        searchBtn.dispatchEvent(new Event('dijitclick', { bubbles: true, cancelable: true }));
      } catch (_) { }
    }

    await sleep(3000);
    logSuccess('Search submitted for "' + searchTerm + '"');
    return true;
  }

  // Generic: select a Standard report from search results by its title attribute
  async function stepSelectStandardReportByTitle(reportTitle) {
    let target = null;
    for (let attempt = 0; attempt < 20 && !target; attempt++) {
      const candidates = deepQueryAll('[title="' + reportTitle + '"]').filter(visible);
      for (const el of candidates) {
        const row = el.closest('tr, [role="row"], li, div[class*="row"]');
        if (row) {
          const rowText = (row.textContent || '');
          if (rowText.includes('Standard')) {
            target = el;
            break;
          }
        }
        if (!target) {
          let parent = el.parentElement;
          for (let depth = 0; depth < 5 && parent; depth++) {
            const txt = (parent.textContent || '');
            if (txt.includes('Standard') && txt.includes(reportTitle)) {
              target = el;
              break;
            }
            parent = parent.parentElement;
          }
        }
        if (target) break;
      }
      if (!target) await sleep(500);
    }
    if (!target) {
      logError(reportTitle + ' (Standard) not found in search results');
      return false;
    }
    clickEl(target);
    logSuccess('Selected ' + reportTitle + ' (Standard)');
    return true;
  }

  // Select a single field on the "What's Displayed" panel WITHOUT clearing others
  async function stepSelectSingleDisplayField(fieldName) {
    let panelReady = false;
    for (let i = 0; i < 20 && !panelReady; i++) {
      const labels = deepQueryAll('.checkactionbubble-text').filter(visible);
      if (labels.length > 3) { panelReady = true; break; }
      await sleep(500);
    }
    if (!panelReady) {
      logError('Field selection panel did not load');
      return false;
    }
    await sleep(500);

    // Find the field's checkbox button by aria-label
    const allBtns = deepQueryAll('button[aria-label]').filter(visible);
    for (const btn of allBtns) {
      const label = (btn.getAttribute('aria-label') || '').trim();
      if (label.toLowerCase() === fieldName.toLowerCase()) {
        const container = btn.closest('[class*="checkactionbubble-container"]');
        const isSelected = container && container.className.includes('_selected');
        if (!isSelected) {
          clickEl(btn);
          logInfo('Selected: ' + fieldName);
        } else {
          logInfo('Already selected: ' + fieldName);
        }

        // Click Save
        await sleep(500);
        const buttons = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
        for (const b of buttons) {
          if (normalize(b.textContent) === 'save') {
            clickEl(b);
            logSuccess('Clicked Save');
            await sleep(1000);
            return true;
          }
        }
        logError('Save button not found');
        return false;
      }
    }

    // Fallback: find by text span
    const textSpans = deepQueryAll('.checkactionbubble-text').filter(visible);
    for (const span of textSpans) {
      if (span.textContent.trim().toLowerCase() === fieldName.toLowerCase()) {
        const container = span.closest('.flexSpaceBetween') || span.parentElement?.parentElement;
        if (container) {
          const btn = container.querySelector('button');
          if (btn) {
            clickEl(btn);
            logInfo('Selected (fallback): ' + fieldName);
            await sleep(500);
            const buttons = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
            for (const b of buttons) {
              if (normalize(b.textContent) === 'save') {
                clickEl(b);
                logSuccess('Clicked Save');
                await sleep(1000);
                return true;
              }
            }
          }
        }
      }
    }

    logError('Field "' + fieldName + '" not found');
    return false;
  }

  // ───────────────── deduction report flow ─────────────────

  async function downloadDeductionReport(setStatus) {
    logInfo('=== Download Deduction Report ===');
    resetAbort();

    try {
      setStatus('Step 1: Opening Reports menu…');
      checkAbort();
      if (!await stepOpenReportsMenu()) { setStatus('Step 1 failed — see log'); return; }

      setStatus('Step 2: Navigating to All Standard Reports…');
      checkAbort();
      if (!await stepClickAllStandardReports()) { setStatus('Step 2 failed — see log'); return; }

      setStatus('Step 3: Searching for Voluntary Deduction…');
      checkAbort();
      if (!await stepSearchDojoReport('Voluntary Deduction')) { setStatus('Step 3 failed — see log'); return; }

      setStatus('Step 4: Selecting Voluntary Deduction (Standard)…');
      checkAbort();
      if (!await stepSelectStandardReportByTitle('Voluntary Deduction')) { setStatus('Step 4 failed — see log'); return; }

      setStatus('Step 5: Waiting for Run Report page…');
      checkAbort();
      if (!await stepWaitForRunReportPage()) { setStatus('Step 5 failed — see log'); return; }

      // Wait for page sections to fully populate
      logInfo('Waiting for report sections to populate...');
      for (let i = 0; i < 20; i++) {
        const allText = deepQueryAll('*').filter(visible);
        let found = false;
        for (const el of allText) {
          const txt = (el.textContent || '').trim();
          if (txt === 'Included Fields' || txt === 'Sort Order' || txt.startsWith('All Employees')) {
            found = true; break;
          }
        }
        if (found) { logSuccess('Report sections populated'); break; }
        await sleep(500);
      }
      await sleep(2000);

      setStatus('Step 6: Opening "What\'s Displayed on the Report"…');
      checkAbort();
      if (!await stepClickWhatsDisplayed()) { setStatus('Step 6 failed — see log'); return; }

      await sleep(1000);

      setStatus('Step 7: Selecting Associate ID…');
      checkAbort();
      if (!await stepSelectSingleDisplayField('Associate ID')) { setStatus('Step 7 failed — see log'); return; }

      setStatus('Step 8: Running report…');
      checkAbort();
      await sleep(1500);
      if (!await stepClickRunAsExcel()) { setStatus('Step 8 failed — see log'); return; }

      setStatus('Deduction Report triggered ✓');
      logSuccess('=== Deduction Report complete ===');

    } catch (err) {
      if (err && err.aborted) {
        setStatus('Deduction Report aborted');
        logWarn('Flow aborted by user');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + (err && err.message ? err.message : err));
    }
  }

  // ───────────────── qualified overtime wages and tips flow ─────────────────

  // Simplest standard-report flow: search → select first result → Run as Excel.
  // No "What's Displayed" / field-selection step (report runs with its defaults).
  async function downloadQualifiedOvertime(setStatus) {
    logInfo('=== Download Qualified Overtime Wages and Tips ===');
    resetAbort();

    try {
      setStatus('Step 1: Opening Reports menu…');
      checkAbort();
      if (!await stepOpenReportsMenu()) { setStatus('Step 1 failed — see log'); return; }

      setStatus('Step 2: Navigating to All Standard Reports…');
      checkAbort();
      if (!await stepClickAllStandardReports()) { setStatus('Step 2 failed — see log'); return; }

      setStatus('Step 3: Searching for Qualified Overtime Wages and Tips…');
      checkAbort();
      if (!await stepSearchDojoReport('Qualified Overtime Wages and Tips')) { setStatus('Step 3 failed — see log'); return; }

      setStatus('Step 4: Selecting Qualified Overtime Wages and Tips…');
      checkAbort();
      if (!await stepSelectStandardReportByTitle('Qualified Overtime Wages and Tips')) { setStatus('Step 4 failed — see log'); return; }

      setStatus('Step 5: Waiting for Run Report page…');
      checkAbort();
      if (!await stepWaitForRunReportPage()) { setStatus('Step 5 failed — see log'); return; }

      // stepWaitForRunReportPage returns as soon as the button TEXT appears, but
      // ADP is still rendering. Clicking too early makes ADP treat it as a bot
      // click and silently drop it, so wait for the page sections to populate
      // and then settle before clicking Run as Excel.
      setStatus('Step 5b: Waiting for report page to fully load…');
      logInfo('Waiting for report sections to populate...');
      let sectionsReady = false;
      for (let i = 0; i < 30; i++) { // up to ~15s
        checkAbort();
        const allText = deepQueryAll('*').filter(visible);
        for (const el of allText) {
          const txt = (el.textContent || '').trim();
          if (txt === 'Included Fields' || txt === 'Sort Order' ||
            txt === 'What\'s Displayed on the Report' || txt.startsWith('All Employees')) {
            sectionsReady = true; break;
          }
        }
        if (sectionsReady) { logSuccess('Report sections populated'); break; }
        await sleep(500);
      }
      // Extra settle so ADP finishes wiring up the page before we click.
      await sleep(3000);

      setStatus('Step 6: Running report…');
      checkAbort();
      if (!await stepClickRunAsExcel()) { setStatus('Step 6 failed — see log'); return; }

      setStatus('Qualified Overtime Report triggered ✓');
      logSuccess('=== Qualified Overtime Wages and Tips complete ===');

    } catch (err) {
      if (err && err.aborted) {
        setStatus('Qualified Overtime Report aborted');
        logWarn('Flow aborted by user');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + (err && err.message ? err.message : err));
    }
  }

  // ───────────────── direct deposit report flow ─────────────────

  // Configure Appearance for Direct Deposit: unmask both Tax ID and Bank Account dropdowns
  async function stepConfigureDirectDepositAppearance() {
    // Wait for page to load
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      const els = deepQueryAll('.vdl-dropdown-list__input, label, span').filter(visible);
      for (const el of els) {
        const txt = (el.textContent || '').trim().toLowerCase();
        if (txt.includes('masked') || txt === 'save') { ready = true; break; }
      }
      if (!ready) await sleep(500);
    }
    if (!ready) {
      logError('Direct Deposit Appearance page did not load');
      return false;
    }
    logInfo('Direct Deposit Appearance page ready');
    await sleep(1000);

    // Collect ALL dropdown inputs upfront, sorted by position (top to bottom)
    const allDropdowns = deepQueryAll('.vdl-dropdown-list__input').filter(visible)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    logInfo('Found ' + allDropdowns.length + ' dropdown(s) on page');

    let unmaskedCount = 0;

    // Process each dropdown by index — never re-scan
    for (let di = 0; di < allDropdowns.length; di++) {
      const dd = allDropdowns[di];
      const text = (dd.textContent || '').trim().toLowerCase();

      // Skip if already "not masked"
      if (text === 'not masked') {
        logInfo('Dropdown #' + (di + 1) + ' already "Not masked" — skipping');
        continue;
      }

      // Skip if not a masking dropdown (could be other unrelated dropdowns)
      if (!text.includes('partially') && !text.includes('masked') && !text.includes('full')) {
        logInfo('Dropdown #' + (di + 1) + ' is "' + dd.textContent.trim() + '" — not a masking dropdown, skipping');
        continue;
      }

      logInfo('Dropdown #' + (di + 1) + ': "' + dd.textContent.trim() + '" → changing to Not Masked');

      // Click to open this specific dropdown
      clickEl(dd);
      await sleep(1000);

      // Find "Not masked" option in the open dropdown list
      let found = false;
      const options = deepQueryAll('li, [role="option"], .vdl-dropdown-list__option').filter(visible);
      for (const opt of options) {
        const optText = (opt.textContent || '').trim().toLowerCase();
        if (optText === 'not masked') {
          clickEl(opt);
          logInfo('Selected "Not masked" for dropdown #' + (di + 1));
          found = true;
          break;
        }
      }

      if (!found) {
        // Fallback
        const allEls = deepQueryAll('span, div, li, a').filter(visible);
        for (const el of allEls) {
          const t = (el.textContent || '').trim().toLowerCase();
          if (t === 'not masked' && el.closest('[class*="dropdown"], [role="listbox"], ul')) {
            clickEl(el);
            logInfo('Selected "Not masked" (fallback) for dropdown #' + (di + 1));
            found = true;
            break;
          }
        }
      }

      await sleep(1500);

      // Click "Yes" on popup if it appears
      let yesBtn = null;
      for (let j = 0; j < 10 && !yesBtn; j++) {
        const btns = deepQueryAll('button, [role="button"], sdf-button').filter(visible);
        for (const btn of btns) {
          if (normalize(btn.textContent) === 'yes') { yesBtn = btn; break; }
        }
        if (!yesBtn) await sleep(400);
      }
      if (yesBtn) {
        clickEl(yesBtn);
        logSuccess('Clicked Yes on confirmation popup');
        await sleep(2000);
      } else {
        logInfo('No popup appeared for dropdown #' + (di + 1));
        await sleep(500);
      }

      unmaskedCount++;
      await sleep(1000);
    }

    logInfo('Unmasked ' + unmaskedCount + ' dropdown(s)');

    // Click Save
    await sleep(800);
    const saveBtns = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
    for (const btn of saveBtns) {
      if (normalize(btn.textContent) === 'save') {
        clickEl(btn);
        logSuccess('Clicked Save on Appearance settings');
        await sleep(1500);
        return true;
      }
    }
    logError('Save button not found');
    return false;
  }

  // Step: Click "Who Appears on This Report" → Employee List → All Employees → Save
  async function stepConfigureWhoAppears() {
    // 1. Click "Who Appears on This Report"
    let target = null;
    for (let i = 0; i < 20 && !target; i++) {
      const clickables = deepQueryAll('a, button, [role="button"], [role="link"], sdf-button').filter(visible);
      for (const el of clickables) {
        const text = (el.textContent || '').trim();
        if (text.includes('Who Appears on This Report')) {
          target = el;
          break;
        }
      }
      if (!target) await sleep(500);
    }
    if (!target) {
      logError('"Who Appears on This Report" not found');
      return false;
    }
    clickEl(target);
    logSuccess('Clicked "Who Appears on This Report"');
    await sleep(2000);

    // 2. Click "Employee List" accordion
    let empList = null;
    for (let i = 0; i < 20 && !empList; i++) {
      const els = deepQueryAll('div, span, a, button, [role="button"]').filter(visible);
      for (const el of els) {
        const text = (el.textContent || '').trim();
        if (text === 'Employee List') {
          empList = el;
          break;
        }
      }
      if (!empList) await sleep(500);
    }
    if (!empList) {
      logError('"Employee List" not found');
      return false;
    }
    clickEl(empList);
    logInfo('Clicked Employee List');
    await sleep(1500);

    // 3. Click the dropdown chevron to open it
    // The dropdown is a react-select style component with a chevron SVG
    let chevron = null;
    const svgs = deepQueryAll('svg.css-8mmkcg, svg[class*="css-"]').filter(visible);
    if (svgs.length > 0) {
      // Click the parent of the SVG (usually a div acting as the dropdown indicator)
      chevron = svgs[0].closest('[class*="indicator"], [class*="dropdown"]') || svgs[0].parentElement;
    }
    if (!chevron) {
      // Fallback: find the MDFSelectBox input and click it to open
      const selectInputs = deepQueryAll('#employeeFilterList, [id*="employeeFilter"], .MDFSelectBox__input').filter(visible);
      if (selectInputs.length > 0) {
        chevron = selectInputs[0];
      }
    }
    if (chevron) {
      clickEl(chevron);
      logInfo('Clicked dropdown');
      await sleep(1000);
    } else {
      logWarn('Dropdown chevron not found — trying to type in the input');
    }

    // 4. Select "All Employees" from the dropdown
    // Try clicking the option directly
    let found = false;
    for (let attempt = 0; attempt < 10 && !found; attempt++) {
      const options = deepQueryAll('[role="option"], [class*="option"], li, div[class*="menu"] div').filter(visible);
      for (const opt of options) {
        const text = (opt.textContent || '').trim();
        if (text === 'All Employees') {
          clickEl(opt);
          logSuccess('Selected "All Employees"');
          found = true;
          break;
        }
      }
      if (!found) await sleep(500);
    }

    if (!found) {
      // Fallback: type "All Employees" into the input to filter
      const input = deepQueryAll('#employeeFilterList').filter(visible)[0];
      if (input) {
        input.focus();
        setReactInputValue(input, 'All Employees');
        await sleep(1000);
        // Try selecting the filtered option
        const options = deepQueryAll('[role="option"], [class*="option"]').filter(visible);
        for (const opt of options) {
          if ((opt.textContent || '').trim() === 'All Employees') {
            clickEl(opt);
            logSuccess('Selected "All Employees" (via type filter)');
            found = true;
            break;
          }
        }
      }
    }

    if (!found) {
      logError('"All Employees" option not found');
      return false;
    }
    await sleep(1000);

    // 5. Click Save
    const saveBtns = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
    for (const btn of saveBtns) {
      if (normalize(btn.textContent) === 'save') {
        clickEl(btn);
        logSuccess('Clicked Save on Who Appears');
        await sleep(1500);
        return true;
      }
    }
    logError('Save button not found');
    return false;
  }

  async function downloadDirectDeposit(setStatus) {
    logInfo('=== Download Direct Deposit Report ===');
    resetAbort();

    try {
      setStatus('Step 1: Opening Reports menu…');
      checkAbort();
      if (!await stepOpenReportsMenu()) { setStatus('Step 1 failed — see log'); return; }

      setStatus('Step 2: Navigating to All Standard Reports…');
      checkAbort();
      if (!await stepClickAllStandardReports()) { setStatus('Step 2 failed — see log'); return; }

      setStatus('Step 3: Searching for Direct Deposit Information…');
      checkAbort();
      if (!await stepSearchDojoReport('Direct Deposit Information')) { setStatus('Step 3 failed — see log'); return; }

      setStatus('Step 4: Selecting Direct Deposit Information (Standard)…');
      checkAbort();
      if (!await stepSelectStandardReportByTitle('Direct Deposit Information')) { setStatus('Step 4 failed — see log'); return; }

      setStatus('Step 5: Waiting for Run Report page…');
      checkAbort();
      if (!await stepWaitForRunReportPage()) { setStatus('Step 5 failed — see log'); return; }

      // Wait for sections to populate
      logInfo('Waiting for report sections to populate...');
      for (let i = 0; i < 20; i++) {
        const allText = deepQueryAll('*').filter(visible);
        let found = false;
        for (const el of allText) {
          const txt = (el.textContent || '').trim();
          if (txt === 'Included Fields' || txt === 'Sort Order' || txt.startsWith('All Employees')) {
            found = true; break;
          }
        }
        if (found) { logSuccess('Report sections populated'); break; }
        await sleep(500);
      }
      await sleep(2000);

      setStatus('Step 6: Opening "What\'s Displayed on the Report"…');
      checkAbort();
      if (!await stepClickWhatsDisplayed()) { setStatus('Step 6 failed — see log'); return; }
      await sleep(1000);

      setStatus('Step 7: Selecting Associate ID…');
      checkAbort();
      if (!await stepSelectSingleDisplayField('Associate ID')) { setStatus('Step 7 failed — see log'); return; }

      setStatus('Step 8: Opening Appearance settings…');
      checkAbort();
      await sleep(2000);
      if (!await stepClickAppearanceSettings()) { setStatus('Step 8 failed — see log'); return; }

      setStatus('Step 9: Unmasking Tax ID and Bank Account…');
      checkAbort();
      if (!await stepConfigureDirectDepositAppearance()) { setStatus('Step 9 failed — see log'); return; }

      setStatus('Step 10: Configuring "Who Appears on This Report"…');
      checkAbort();
      await sleep(1500);
      if (!await stepConfigureWhoAppears()) { setStatus('Step 10 failed — see log'); return; }

      setStatus('Step 11: Running report…');
      checkAbort();
      await sleep(1500);
      if (!await stepClickRunAsExcel()) { setStatus('Step 11 failed — see log'); return; }

      setStatus('Direct Deposit Report triggered ✓');
      logSuccess('=== Direct Deposit Report complete ===');

    } catch (err) {
      if (err && err.aborted) {
        setStatus('Direct Deposit Report aborted');
        logWarn('Flow aborted by user');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + (err && err.message ? err.message : err));
    }
  }

  // ───────────────── payroll: appearance + quarterly download ─────────────────

  // Build the { quarter, label, from, to } descriptor for one quarter of a year.
  // ADP requires start date +1 day and end date +1 day for correct filtering.
  function buildQuarterInfo(q, year) {
    const startMonth = (q - 1) * 3 + 1; // 1, 4, 7, 10
    const endMonth = q * 3;              // 3, 6, 9, 12

    // From = quarter start + 1 day (e.g. Q1 = 01/02)
    const fromMM = String(startMonth).padStart(2, '0');
    const from = fromMM + '/02/' + year;

    // To = quarter end + 1 day (rolls into next month's 1st)
    let toMonth = endMonth + 1;
    let toYear = year;
    if (toMonth > 12) { toMonth = 1; toYear = year + 1; }
    const toMM = String(toMonth).padStart(2, '0');
    const to = toMM + '/01/' + toYear;

    return {
      quarter: q,                       // 1-4, used for selection + view logic
      label: 'Q' + q + ' ' + year,
      from: from,
      to: to
    };
  }

  // Quarters Q1 … currentQuarter. currentQuarter defaults to the calendar
  // quarter, but the caller (the picker dialog) can pass a user-chosen one.
  function getQuartersToDownload(currentQuarter) {
    const now = new Date();
    const year = now.getFullYear();
    const cq = currentQuarter || (Math.floor(now.getMonth() / 3) + 1);
    const quarters = [];
    for (let q = 1; q <= cq; q++) quarters.push(buildQuarterInfo(q, year));
    return quarters;
  }

  // Modal: choose the current (live) quarter and which quarters to download.
  // Resolves to { quarters: [...selected], currentQuarter: n }, or null if the
  // user cancels (or Stop/reset is pressed).
  //  - The "Current (live) quarter" selector (default = the calendar quarter)
  //    drives the split: quarters BEFORE it are consolidated (Totals Only), and
  //    the chosen quarter itself is detailed / per pay period.
  //  - The quarter list shows Q1 … currentQuarter, all ticked by default;
  //    unticking one skips it. Changing the selector rebuilds the list.
  // Styled to match the cobalt-blue panel.
  function showQuarterPickDialog(year, defaultCurrentQuarter) {
    return new Promise((resolve) => {
      const existing = document.getElementById('adp-quarter-pick');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'adp-quarter-pick';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,8,22,.62);z-index:2147483647;' +
        'display:flex;align-items:center;justify-content:center;font:14px "Segoe UI",system-ui,sans-serif;';

      const box = document.createElement('div');
      box.style.cssText = 'width:360px;max-width:92vw;color:#dce9ff;border-radius:16px;overflow:hidden;' +
        'background:linear-gradient(165deg,rgba(2,20,46,.98),rgba(0,36,86,.96));' +
        'border:1px solid rgba(90,159,255,.3);box-shadow:0 18px 50px rgba(0,0,0,.6);';

      const head = document.createElement('div');
      head.style.cssText = 'padding:14px 16px;font-weight:700;font-size:15px;color:#fff;' +
        'background:linear-gradient(90deg,rgba(0,71,171,.45),rgba(0,100,241,.12));border-bottom:1px solid rgba(90,159,255,.2);';
      head.textContent = 'Payroll History — choose quarters';
      box.appendChild(head);

      const body = document.createElement('div');
      body.style.cssText = 'padding:12px 16px;';

      // Current (live) quarter selector — drives the consolidated/detailed split.
      const cqLabel = document.createElement('div');
      cqLabel.style.cssText = 'font-size:11.5px;color:#9fc2ff;margin-bottom:5px;';
      cqLabel.textContent = 'Select the Quarter in which client will run first payroll in UZIO';
      body.appendChild(cqLabel);

      const cqSelect = document.createElement('select');
      cqSelect.style.cssText = 'width:100%;padding:8px 10px;margin-bottom:12px;border-radius:9px;' +
        'background:rgba(0,71,171,.3);color:#eaf2ff;border:1px solid rgba(125,179,255,.4);' +
        'font:600 13px "Segoe UI",system-ui,sans-serif;cursor:pointer;';
      [1, 2, 3, 4].forEach((q) => {
        const opt = document.createElement('option');
        opt.value = String(q);
        opt.textContent = 'Q' + q + ' ' + year;
        opt.style.cssText = 'color:#000;';
        if (q === defaultCurrentQuarter) opt.selected = true;
        cqSelect.appendChild(opt);
      });
      body.appendChild(cqSelect);

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11.5px;color:#9fc2ff;margin-bottom:10px;';
      hint.textContent = 'Untick any quarter to skip it.';
      body.appendChild(hint);

      // Rebuildable quarter checkbox list (Q1 … selected current quarter).
      const listWrap = document.createElement('div');
      body.appendChild(listWrap);
      let checks = [];
      let listQuarters = [];
      function rebuildList() {
        const cq = parseInt(cqSelect.value, 10);
        listWrap.innerHTML = '';
        checks = [];
        listQuarters = [];
        for (let q = 1; q <= cq; q++) listQuarters.push(buildQuarterInfo(q, year));
        listQuarters.forEach((q) => {
          const row = document.createElement('label');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 11px;margin-bottom:7px;cursor:pointer;' +
            'background:rgba(0,71,171,.22);border:1px solid rgba(125,179,255,.18);border-radius:10px;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = true;
          cb.style.cssText = 'width:16px;height:16px;accent-color:#0064f1;cursor:pointer;';
          const txt = document.createElement('span');
          txt.style.cssText = 'font-weight:600;color:#eaf2ff;';
          const tag = q.quarter < cq ? 'consolidated' : 'per pay period';
          txt.innerHTML = q.label + ' <span style="font-weight:400;color:#9fc2ff;font-size:11px;">(' + tag + ')</span>';
          row.appendChild(cb);
          row.appendChild(txt);
          listWrap.appendChild(row);
          checks.push(cb);
        });
      }
      rebuildList();
      cqSelect.addEventListener('change', rebuildList);

      box.appendChild(body);

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;padding:0 16px 16px;';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'flex:1;padding:10px;border:1px solid rgba(125,179,255,.35);background:transparent;' +
        'color:#9fc2ff;border-radius:10px;cursor:pointer;font-weight:600;';
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = 'Download selected';
      confirmBtn.style.cssText = 'flex:2;padding:10px;border:0;border-radius:10px;cursor:pointer;font-weight:700;color:#fff;' +
        'background:linear-gradient(120deg,#0055ce,#0064f1 45%,#00a4cc);';
      btns.appendChild(cancelBtn);
      btns.appendChild(confirmBtn);
      box.appendChild(btns);

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        clearInterval(poll);
        overlay.remove();
        resolve(val);
      };
      cancelBtn.addEventListener('click', () => finish(null));
      confirmBtn.addEventListener('click', () => finish({
        quarters: listQuarters.filter((_, i) => checks[i].checked),
        currentQuarter: parseInt(cqSelect.value, 10)
      }));
      // Stop/reset (requestAbort) or external removal closes the dialog as a cancel.
      const poll = setInterval(() => {
        if (shouldAbort() || !document.body.contains(overlay)) finish(null);
      }, 200);
    });
  }

  // Helper: click a VDL dropdown, then select an option by text
  async function selectVdlDropdownOption(dropdownText, optionText) {
    // Find the dropdown by its current displayed text
    const dropdowns = deepQueryAll('.vdl-dropdown-list__input, [class*="dropdown"]').filter(visible);
    let dropdown = null;
    for (const dd of dropdowns) {
      const text = (dd.textContent || '').trim().toLowerCase();
      if (text === dropdownText.toLowerCase()) {
        dropdown = dd;
        break;
      }
    }
    if (!dropdown) {
      // Fallback: find by partial match
      for (const dd of dropdowns) {
        const text = (dd.textContent || '').trim().toLowerCase();
        if (text.includes(dropdownText.toLowerCase())) {
          dropdown = dd;
          break;
        }
      }
    }
    if (!dropdown) {
      logError('Dropdown showing "' + dropdownText + '" not found');
      return false;
    }

    // Click to open
    clickEl(dropdown);
    await sleep(500);

    // Find and click the option
    const options = deepQueryAll('li, [role="option"], [role="menuitem"], [class*="dropdown"] [class*="option"], .vdl-dropdown-list__option').filter(visible);
    for (const opt of options) {
      const text = (opt.textContent || '').trim().toLowerCase();
      if (text === optionText.toLowerCase()) {
        clickEl(opt);
        logInfo('Selected "' + optionText + '" from dropdown');
        return true;
      }
    }

    // Fallback: search all visible elements for the option text
    const allEls = deepQueryAll('span, div, li, a').filter(visible);
    for (const el of allEls) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text === optionText.toLowerCase() && el.closest('[class*="dropdown"], [role="listbox"], ul')) {
        clickEl(el);
        logInfo('Selected "' + optionText + '" (fallback)');
        return true;
      }
    }

    logError('Option "' + optionText + '" not found in dropdown');
    return false;
  }

  // Step P8: click pencil next to "Appearance and Other Settings"
  async function stepClickAppearanceSettings() {
    let target = null;
    for (let i = 0; i < 20 && !target; i++) {
      const clickables = deepQueryAll('a, button, [role="button"], [role="link"], sdf-button').filter(visible);
      for (const el of clickables) {
        const text = (el.textContent || '').trim();
        if (text.includes('Appearance and Other Settings') || text.includes('Appearance And Other Settings')) {
          target = el;
          break;
        }
      }
      if (!target) await sleep(500);
    }
    if (!target) {
      logError('"Appearance and Other Settings" not found');
      return false;
    }
    clickEl(target);
    logSuccess('Clicked "Appearance and Other Settings"');
    await sleep(2000); // wait for page to load
    return true;
  }

  // Step P9: configure Sort By, Group By, Totals Only, Tax ID, and date range.
  // useTotals=true for closed quarters (Associate ID + Group By + Totals Only).
  // useTotals=false for current quarter (keep Name, no Group By, no Totals Only).
  async function stepConfigureAppearance(fromDate, toDate, useTotals) {
    // Wait for page content to load
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      const labels = deepQueryAll('label, span, div').filter(visible);
      for (const l of labels) {
        if ((l.textContent || '').trim() === 'Totals Only') { ready = true; break; }
      }
      if (!ready) await sleep(500);
    }
    if (!ready) {
      logError('Appearance settings page did not load fully');
      return false;
    }
    logInfo('Appearance settings page ready');
    await sleep(500);

    // 1-3: Only for closed quarters (totals view)
    if (useTotals) {
      // 1. Change 2nd Sort By dropdown to "Associate ID"
      logInfo('Changing Sort By #2 to Associate ID (closed quarter)');
      await sleep(1000);
      if (!await selectVdlDropdownOption('Name', 'Associate ID')) {
        logWarn('Could not change Sort By #2 — may already be set');
      }
      await sleep(1000);

      // 2. Check Group By checkbox for the 2nd row
      logInfo('Checking Group By for Sort By #2');
      const allCheckboxes = deepQueryAll('input[type="checkbox"]');
      const checkLabels = deepQueryAll('label').filter(visible);
      for (const label of checkLabels) {
        const forId = label.getAttribute('for');
        if (!forId) continue;
        const row = label.closest('tr, [role="row"], div[class*="row"]');
        if (!row) continue;
        const rowText = (row.textContent || '');
        if (rowText.includes('Associate ID') && !rowText.includes('Totals')) {
          const checkbox = deepQueryAll('#' + forId)[0];
          if (checkbox && !checkbox.checked) {
            clickEl(label);
            logInfo('Checked Group By for Associate ID row');
          } else if (checkbox && checkbox.checked) {
            logInfo('Group By already checked');
          }
          break;
        }
      }
      await sleep(800);

      // 3. Check "Totals Only"
      logInfo('Checking Totals Only');
      const totalsLabels = deepQueryAll('label').filter(visible);
      for (const label of totalsLabels) {
        if ((label.textContent || '').trim() === 'Totals Only') {
          const forId = label.getAttribute('for');
          if (forId) {
            const checkbox = deepQueryAll('#' + forId)[0];
            if (checkbox && !checkbox.checked) {
              clickEl(label);
              logInfo('Checked Totals Only');
            } else {
              logInfo('Totals Only already checked');
            }
          } else {
            clickEl(label);
            logInfo('Clicked Totals Only label');
          }
          break;
        }
      }
      await sleep(800);
    } else {
      logInfo('Current quarter — keeping Name, skipping Group By and Totals Only');
      await sleep(500);
    }

    // 4. Change Tax ID to "Not Masked"
    logInfo('Setting Tax ID to Not Masked');
    await sleep(1000);
    if (!await selectVdlDropdownOption('Partially', 'Not Masked')) {
      // Try alternate text
      if (!await selectVdlDropdownOption('Partially masked', 'Not Masked')) {
        await selectVdlDropdownOption('Partially Masked', 'Not masked');
      }
    }
    await sleep(1500);

    // 5. Click "Yes" on the confirmation popup — wait patiently for it
    let yesBtn = null;
    for (let i = 0; i < 25 && !yesBtn; i++) {
      const btns = deepQueryAll('button, [role="button"], sdf-button').filter(visible);
      for (const btn of btns) {
        const text = normalize(btn.textContent);
        if (text === 'yes') {
          yesBtn = btn;
          break;
        }
      }
      if (!yesBtn) await sleep(400);
    }
    if (yesBtn) {
      clickEl(yesBtn);
      logSuccess('Clicked Yes on Tax ID confirmation');
      await sleep(1500); // wait for popup to close and setting to apply
    } else {
      logWarn('Tax ID confirmation popup not found — may not have appeared');
    }
    await sleep(1000);

    // 6. Select "Custom Date Range" from Request Period
    logInfo('Setting Request Period to Custom Date Range');
    await sleep(1000);
    if (!await selectVdlDropdownOption('Last 30 Days', 'Custom Date Range')) {
      // Try other current values it might show
      if (!await selectVdlDropdownOption('Last 30', 'Custom Date Range')) {
        if (!await selectVdlDropdownOption('Year-to-Date', 'Custom Date Range')) {
          await selectVdlDropdownOption('Custom Date', 'Custom Date Range');
        }
      }
    }
    await sleep(1500);

    // 7. Enter From and To dates
    logInfo('Setting date range: ' + fromDate + ' to ' + toDate);
    const dateInputs = deepQueryAll('input').filter(visible).filter(inp => {
      const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
      return ph.includes('mm/dd/yyyy') || ph.includes('mm/dd');
    });

    if (dateInputs.length >= 2) {
      // First date input = From, second = To
      dateInputs[0].focus();
      await sleep(300);
      setReactInputValue(dateInputs[0], fromDate);
      await sleep(800);
      dateInputs[1].focus();
      await sleep(300);
      setReactInputValue(dateInputs[1], toDate);
      await sleep(800);
      // Click somewhere neutral to dismiss any datepicker
      dateInputs[1].blur();
      await sleep(500);
      logInfo('Dates entered: ' + fromDate + ' → ' + toDate);
    } else if (dateInputs.length === 1) {
      logWarn('Only 1 date input found — entering From date');
      setReactInputValue(dateInputs[0], fromDate);
    } else {
      logError('Date inputs not found');
    }
    await sleep(800);

    // 8. Click Save
    const saveBtns = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
    for (const btn of saveBtns) {
      if (normalize(btn.textContent) === 'save') {
        clickEl(btn);
        logSuccess('Clicked Save on Appearance settings');
        await sleep(1500);
        return true;
      }
    }
    logError('Save button not found');
    return false;
  }

  // Step P10: click "Run as Excel" on the Run Report page
  async function stepClickRunAsExcel() {
    let btn = null;
    for (let i = 0; i < 20 && !btn; i++) {
      const clickables = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
      for (const el of clickables) {
        const text = normalize(el.textContent);
        if (text === 'run as excel') {
          btn = el;
          break;
        }
      }
      if (!btn) await sleep(500);
    }
    if (!btn) {
      logError('Run as Excel button not found');
      return false;
    }
    clickEl(btn);
    logSuccess('Clicked Run as Excel');
    return true;
  }

  // ───────────────── field-selection (ported from v9.2) ─────────────────

  function findFieldSearchInput() {
    return deepQueryAll('input[name="search"].adpr-search-input').filter(visible)[0] || null;
  }

  function triggerFieldSearch(text) {
    const input = findFieldSearchInput();
    if (!input) return false;
    setReactInputValue(input, '');
    setReactInputValue(input, text);
    return true;
  }

  // Find a field by name and click its add button. Returns true on success or
  // when the field is already added.
  function findFieldAndAdd(targetName) {
    const originalTarget = normalize(targetName);
    const cleanTarget = FIELD_NAME_CORRECTIONS[targetName]
      ? normalize(FIELD_NAME_CORRECTIONS[targetName])
      : originalTarget;
    const baseTarget = originalTarget.split(' (')[0].trim();
    const baseTargetClean = cleanTarget.split(' (')[0].trim();

    const labels = deepQueryAll('.field-label-truncate, .adpr-column-label, span.field-label, span[data-ng-bind]')
      .filter(visible);

    let bestMatchContainer = null;

    for (const el of labels) {
      let txt = '';
      if (el.childNodes.length > 0 && el.childNodes[0].nodeType === 3) {
        txt = el.childNodes[0].textContent.toLowerCase().trim();
      } else {
        txt = (el.textContent || '').toLowerCase().trim();
      }
      const fullTxt = (el.textContent || '').toLowerCase().trim().replace(/\s+/g, ' ');

      const exactMatch =
        txt === originalTarget || txt === cleanTarget ||
        txt === baseTarget || txt === baseTargetClean ||
        fullTxt === originalTarget || fullTxt === cleanTarget;

      if (exactMatch) {
        const container = el.closest(
          '.field-item-wrapper, .field-item, .adpr-column-row, .list-group-item, li[data-ng-repeat], div[role="row"]'
        ) || el.parentElement;
        if (!container) continue;

        // Already added?
        if (container.querySelector(
          '.fa-check, .fa-minus-circle, [data-pendo-id="PENDO_ADPR_CANVAS_REMOVE_FIELD"], .icon-check, i[class*="check"]'
        )) return true;

        const addBtn = container.querySelector(
          '.fa-plus-circle, .fa-plus, .icon-plus, .icon-add, [data-pendo-id="PENDO_ADPR_CANVAS_ADD_FIELD"], i[class*="plus"]'
        );
        if (addBtn) { clickEl(addBtn); return true; }

        const dblTarget = container.closest('[data-ng-dblclick]')
          || (container.getAttribute && container.getAttribute('data-ng-dblclick') ? container : null);
        if (dblTarget) { dblClickEl(dblTarget); return true; }

        clickEl(container);
        return true;
      }

      if (!bestMatchContainer && (
        txt.indexOf(baseTarget) === 0 ||
        fullTxt.indexOf(cleanTarget) === 0 ||
        fullTxt.indexOf(originalTarget) === 0 ||
        fullTxt.indexOf(baseTarget) === 0
      )) {
        bestMatchContainer = el.closest(
          '.field-item-wrapper, .field-item, .adpr-column-row, .list-group-item, li[data-ng-repeat], div[role="row"]'
        ) || el.parentElement;
      }
    }

    if (bestMatchContainer) {
      if (bestMatchContainer.querySelector(
        '.fa-check, .fa-minus-circle, [data-pendo-id="PENDO_ADPR_CANVAS_REMOVE_FIELD"], .icon-check, i[class*="check"]'
      )) return true;

      const addBtn = bestMatchContainer.querySelector(
        '.fa-plus-circle, .fa-plus, .icon-plus, .icon-add, [data-pendo-id="PENDO_ADPR_CANVAS_ADD_FIELD"], i[class*="plus"]'
      );
      if (addBtn) { clickEl(addBtn); return true; }
      clickEl(bestMatchContainer);
      return true;
    }
    return false;
  }

  function detectAndCloseModal() {
    const modals = deepQueryAll('.adp-modal, .modal-dialog, [role="dialog"], .dijitDialog').filter(visible);
    for (const modal of modals) {
      const buttons = modal.querySelectorAll('button, a, i, span');
      for (const btn of buttons) {
        const txt = (btn.textContent || '').toLowerCase().trim();
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const cls = (btn.getAttribute('class') || '').toLowerCase();
        if (txt === 'cancel' || txt === 'close' || aria.includes('close') || cls.includes('close') || cls.includes('times')) {
          clickEl(btn);
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
          return true;
        }
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      return true;
    }
    return false;
  }

  async function selectFields(columns, setStatus) {
    const failed = [];

    // The canvas search INPUT appears a few seconds before the field ROWS
    // render. Without this, the very first field (e.g. "Associate ID") gets
    // searched against an empty list, its retry window expires before the rows
    // appear, and only that first field ends up missing. Prime the search with
    // the first column and wait until field rows are actually present.
    if (columns.length) {
      setStatus('Waiting for the field list to load…');
      const firstTerm = FIELD_NAME_CORRECTIONS[columns[0]] || columns[0].split(' (')[0];
      const fieldRowsPresent = () => deepQueryAll(
        '.field-label-truncate, .adpr-column-label, span.field-label, span[data-ng-bind]'
      ).filter(visible).length > 0;
      for (let i = 0; i < 60; i++) { // up to ~30s
        if (fieldRowsPresent()) break;
        if (i % 4 === 0) triggerFieldSearch(firstTerm); // nudge the search periodically
        await sleep(500);
      }
      await sleep(600); // let the filtered results settle
    }

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      setStatus('Selecting field ' + (i + 1) + '/' + columns.length + ': ' + col.slice(0, 40));

      const searchTerm = FIELD_NAME_CORRECTIONS[col] || col.split(' (')[0];
      triggerFieldSearch(searchTerm);
      await sleep(800); // wait for search filter to render

      let success = false;
      let attempts = 0;
      const maxAttempts = 14;
      while (!success && attempts < maxAttempts) {
        detectAndCloseModal();
        success = findFieldAndAdd(col);
        if (success) break;
        attempts++;
        if (attempts === 5) triggerFieldSearch(searchTerm); // re-trigger search
        await sleep(500);
      }

      if (success) {
        logSuccess('Added: ' + col);
      } else {
        logError('FAILED: ' + col);
        failed.push(col);
      }
      await sleep(300);
    }
    return failed;
  }

  // SSN unmask — 4-step Dojo-style menu sequence.
  async function unmaskSSN(setStatus) {
    setStatus('Unmasking SSN…');
    logInfo('Starting SSN unmask sequence');

    // Step 1: open the Tax ID (SSN) field-actions menu.
    let actionBtn = null;
    for (let i = 0; i < 25 && !actionBtn; i++) {
      actionBtn = deepQueryAll('.field-actions-trigger[aria-label="Tax ID (SSN)"]').filter(visible)[0];
      if (!actionBtn) {
        const candidates = deepQueryAll('[data-pendo-id="PENDO_ADPR_CANVAS_FIELD_MENU"]');
        for (const c of candidates) {
          if (!visible(c)) continue;
          const aria = c.getAttribute('aria-label');
          if (aria === 'Tax ID (SSN)' ||
            (c.parentElement && c.parentElement.parentElement &&
              (c.parentElement.parentElement.textContent || '').includes('Tax ID (SSN)'))) {
            actionBtn = c;
            break;
          }
        }
      }
      if (!actionBtn) await sleep(400);
    }
    if (!actionBtn) { logError('SSN: field-actions trigger not found'); return false; }

    try { actionBtn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); }
    catch (_) { try { actionBtn.scrollIntoView(); } catch (_) { } }
    await sleep(150);
    clickEl(actionBtn);

    // Step 2: click "Format" menu item.
    let formatTarget = null;
    for (let i = 0; i < 25 && !formatTarget; i++) {
      formatTarget = deepQueryAll('[data-pendo-id="PENDO_ADPR_CANVAS_FIELD_MENU_FORMAT"]').filter(visible)[0];
      if (!formatTarget) {
        const items = deepQueryAll('span, a, div').filter(visible);
        for (const m of items) {
          if ((m.textContent || '').trim() === 'Format') {
            formatTarget = m.closest('li, div[role="button"]') || m;
            break;
          }
        }
      }
      if (!formatTarget) await sleep(400);
    }
    if (!formatTarget) { logError('SSN: Format option not found'); return false; }
    clickEl(formatTarget);

    // Step 3: click "123-45-6789" (unmasked format).
    let unmaskTarget = null;
    for (let i = 0; i < 25 && !unmaskTarget; i++) {
      const opts = deepQueryAll('span, div').filter(visible);
      for (const o of opts) {
        if ((o.textContent || '').trim() === '123-45-6789') {
          unmaskTarget = o.closest('li, div.menu-item') || o;
          break;
        }
      }
      if (!unmaskTarget) await sleep(400);
    }
    if (!unmaskTarget) { logError('SSN: 123-45-6789 option not found'); return false; }
    clickEl(unmaskTarget);

    // Step 4: click CONTINUE confirmation.
    let continueTarget = null;
    for (let i = 0; i < 25 && !continueTarget; i++) {
      const items = deepQueryAll('span, button').filter(visible);
      for (const b of items) {
        if ((b.textContent || '').trim() === 'CONTINUE') {
          continueTarget = b.closest('button') || b;
          break;
        }
      }
      if (!continueTarget) await sleep(400);
    }
    if (!continueTarget) { logWarn('SSN: CONTINUE button not found — may already be applied'); return true; }
    clickEl(continueTarget);
    logSuccess('SSN unmasked');
    return true;
  }

  // ───────────────── full flows ─────────────────

  async function runFullFlow(opts) {
    const { type, columns, title, unmaskSsn, setStatus } = opts;
    logInfo('=== Download ' + type + ' ===');
    resetAbort();

    try {
      setStatus('Step 1/11: Opening Reports menu…');
      checkAbort();
      if (!await stepOpenReportsMenu()) { setStatus('Step 1 failed — see log'); return; }

      setStatus('Step 2/11: Navigating to All Custom Reports…');
      checkAbort();
      if (!await stepClickAllCustomReports()) { setStatus('Step 2 failed — see log'); return; }

      setStatus('Step 3/11: Clicking Create new report…');
      checkAbort();
      if (!await stepCreateNewReport()) { setStatus('Step 3 failed — see log'); return; }

      setStatus('Step 4/11: Filling title "' + title + '"…');
      checkAbort();
      if (!await stepFillReportTitle(title)) { setStatus('Step 4 failed — see log'); return; }

      setStatus('Step 5/11: Clicking Select Fields…');
      checkAbort();
      if (!await stepClickSelectFields()) { setStatus('Step 5 failed — see log'); return; }

      setStatus('Step 6/11: Waiting for field canvas…');
      checkAbort();
      if (!await stepWaitForCanvas()) { setStatus('Step 6 failed — see log'); return; }

      await sleep(1000); // give the canvas a moment to fully populate

      setStatus('Step 7/11: Selecting ' + columns.length + ' fields…');
      const failed = await selectFields(columns, setStatus);
      if (failed.length) logWarn('Failed to add ' + failed.length + ' field(s): ' + failed.join('; '));

      if (unmaskSsn) {
        const ssnFieldName = 'Tax ID (SSN) (Personal Profile)';
        if (!failed.includes(ssnFieldName)) {
          setStatus('Step 8/11: Unmasking SSN…');
          checkAbort();
          await unmaskSSN(setStatus);
        } else {
          logWarn('Skipping SSN unmask — Tax ID field was not added');
        }
      }

      setStatus('Step 9/11: Clicking Save + Run…');
      checkAbort();
      if (!await stepClickSaveAndRun()) { setStatus('Step 9 failed — see log'); return; }

      setStatus('Step 10/11: Clicking Run in Runtime Settings popup…');
      checkAbort();
      if (!await stepClickRunInPopup()) { setStatus('Step 10 failed — see log'); return; }

      setStatus('Waiting for report to generate…');
      checkAbort();
      if (!await stepWaitForViewReport()) { setStatus('Report generation timed out — see log'); return; }

      setStatus('Step 11/11: Exporting as CSV…');
      checkAbort();
      if (!await stepExportAsCSV()) { setStatus('Step 11 failed — see log'); return; }

      if (failed.length === 0) {
        setStatus(type + ' downloaded ✓');
        logSuccess('All fields added — CSV export triggered. Check your Downloads folder.');
      } else {
        setStatus(type + ' downloaded (' + failed.length + ' field(s) missing)');
        logWarn('CSV export triggered — but ' + failed.length + ' field(s) could not be added');
      }
    } catch (err) {
      if (err && err.aborted) {
        setStatus(type + ' aborted by user');
        logWarn('Flow aborted by user (Stop / reset)');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + (err && err.message ? err.message : err));
    }
  }

  function downloadCensus(setStatus) {
    return runFullFlow({
      type: 'Census',
      columns: CENSUS_COLUMNS,
      title: 'Census Report',
      unmaskSsn: true,
      setStatus,
    });
  }

  function downloadSitFit(setStatus) {
    return runFullFlow({
      type: 'SIT/FIT',
      columns: SIT_FIT_COLUMNS,
      title: 'SIT FIT Report',
      unmaskSsn: false,
      setStatus,
    });
  }

  function downloadLicenseEC(setStatus) {
    return runFullFlow({
      type: 'License/EC',
      columns: LICENSE_EC_COLUMNS,
      title: 'License and Emergency Contact',
      unmaskSsn: false,
      setStatus,
    });
  }

  // Payroll History uses a different flow: Standard Reports → search → select,
  // instead of Custom Reports → Create new → Select Fields. So it has its own
  // flow function rather than going through runFullFlow.
  async function downloadPayrollHistory(setStatus) {
    logInfo('=== Download Payroll History ===');
    resetAbort();

    // Payroll History runs against ADP's Dojo-heavy Standard Reports pages,
    // which are slow to wire up their widgets. PH_PAD is an extra settle pause
    // inserted before the click-heavy steps in THIS flow only, to avoid the
    // "DOJO not found" failures that force a re-run. Abort-aware (uses sleep).
    const PH_PAD = 2000;

    try {
      // Ask which quarters to download BEFORE any navigation. The user picks the
      // current (live) quarter (default = the calendar quarter): quarters before
      // it are consolidated, that quarter is per pay period. Every listed quarter
      // is ticked by default; unticked quarters are skipped. Cancel downloads
      // nothing.
      const now = new Date();
      const year = now.getFullYear();
      const calendarQuarter = Math.floor(now.getMonth() / 3) + 1;
      setStatus('Choose quarters to download…');
      const pick = await showQuarterPickDialog(year, calendarQuarter);
      if (pick === null) { setStatus('Payroll History cancelled'); logInfo('Quarter selection cancelled'); return; }
      const quarters = pick.quarters;
      const currentQuarter = pick.currentQuarter;
      if (!quarters.length) { setStatus('No quarters selected — nothing to download'); logWarn('No quarters selected'); return; }
      logInfo('Current (live) quarter: Q' + currentQuarter + '. Selected: ' + quarters.map(q => q.label).join(', '));

      setStatus('Step 1: Opening Reports menu…');
      checkAbort();
      if (!await stepOpenReportsMenu()) { setStatus('Step 1 failed — see log'); return; }

      setStatus('Step 2: Navigating to All Standard Reports…');
      checkAbort();
      if (!await stepClickAllStandardReports()) { setStatus('Step 2 failed — see log'); return; }

      setStatus('Step 3: Searching for Payroll History…');
      checkAbort();
      if (!await stepSearchPayrollHistory()) { setStatus('Step 3 failed — see log'); return; }

      setStatus('Step 4: Selecting Payroll History (Standard)…');
      checkAbort();
      await sleep(PH_PAD); // let the Dojo search results settle before clicking
      if (!await stepSelectPayrollHistoryStandard()) { setStatus('Step 4 failed — see log'); return; }

      setStatus('Step 5: Waiting for Run Report page…');
      checkAbort();
      if (!await stepWaitForRunReportPage()) { setStatus('Step 5 failed — see log'); return; }

      // Wait for the page content to fully initialize (Dojo widgets inside sections
      // need extra time after the outer shell appears). We look for "Included Fields"
      // text which only appears once the "What's Displayed" section is populated.
      setStatus('Step 5b: Waiting for report sections to fully load…');
      logInfo('Waiting for report sections to populate...');
      for (let i = 0; i < 20; i++) { // up to 10s
        const allText = deepQueryAll('*').filter(visible);
        let found = false;
        for (const el of allText) {
          const txt = (el.textContent || '').trim();
          if (txt === 'Included Fields' || txt === 'Sort Order' || txt.startsWith('All Employees')) {
            found = true;
            break;
          }
        }
        if (found) {
          logSuccess('Report sections fully populated');
          break;
        }
        await sleep(500);
      }
      await sleep(2000 + PH_PAD); // extra buffer for Dojo widget init

      setStatus('Step 6: Opening "What\'s Displayed on the Report"…');
      checkAbort();
      if (!await stepClickWhatsDisplayed()) { setStatus('Step 6 failed — see log'); return; }

      await sleep(1000); // let panel animate open

      setStatus('Step 7: Selecting payroll fields…');
      checkAbort();
      if (!await stepSelectPayrollDisplayFields()) {
        logWarn('Some payroll fields could not be selected — continuing anyway');
      }

      // `quarters` (the user-selected subset) was chosen via the dialog above.
      logInfo('Downloading ' + quarters.length + ' quarter(s): ' + quarters.map(q => q.label).join(', '));

      // Loop through each quarter
      for (let qi = 0; qi < quarters.length; qi++) {
        const q = quarters[qi];
        logInfo('───── Processing ' + q.label + ' (' + (qi + 1) + '/' + quarters.length + ') ─────');

        if (qi > 0) {
          // For subsequent quarters, navigate back to Payroll History from scratch
          setStatus('Navigating back for ' + q.label + '…');
          checkAbort();

          // Wait for the output page to settle, then re-navigate
          await sleep(3000);

          if (!await stepOpenReportsMenu()) { setStatus('Re-nav step 1 failed'); return; }
          checkAbort();
          if (!await stepClickAllStandardReports()) { setStatus('Re-nav step 2 failed'); return; }
          checkAbort();
          if (!await stepSearchPayrollHistory()) { setStatus('Re-nav step 3 failed'); return; }
          checkAbort();
          await sleep(PH_PAD); // let the Dojo search results settle before clicking
          if (!await stepSelectPayrollHistoryStandard()) { setStatus('Re-nav step 4 failed'); return; }
          checkAbort();
          if (!await stepWaitForRunReportPage()) { setStatus('Re-nav step 5 failed'); return; }

          // Wait for sections to fully populate
          logInfo('Waiting for report sections to populate...');
          for (let i = 0; i < 20; i++) {
            const allText = deepQueryAll('*').filter(visible);
            let found = false;
            for (const el of allText) {
              const txt = (el.textContent || '').trim();
              if (txt === 'Included Fields' || txt === 'Sort Order' || txt.startsWith('All Employees')) {
                found = true; break;
              }
            }
            if (found) break;
            await sleep(500);
          }
          await sleep(2000 + PH_PAD);

          // Re-select fields for this run
          setStatus('Re-selecting fields for ' + q.label + '…');
          checkAbort();
          if (!await stepClickWhatsDisplayed()) { setStatus('Re-nav field selection failed'); return; }
          await sleep(1000);
          if (!await stepSelectPayrollDisplayFields()) {
            logWarn('Some fields could not be re-selected');
          }
        }

        // Open Appearance settings and configure for this quarter.
        // Quarters BEFORE the user-selected current quarter get the totals
        // (consolidated) view; the selected current quarter gets the detailed /
        // per-pay-period view. Keyed on the chosen quarter number, so a partial
        // selection still classifies each quarter correctly.
        const isClosedQuarter = q.quarter < currentQuarter;
        const viewType = isClosedQuarter ? 'totals' : 'detailed';
        setStatus('Configuring ' + viewType + ' view for ' + q.label + ' (' + q.from + ' → ' + q.to + ')…');
        checkAbort();
        await sleep(2000 + PH_PAD);
        if (!await stepClickAppearanceSettings()) { setStatus('Appearance click failed for ' + q.label); return; }
        checkAbort();
        if (!await stepConfigureAppearance(q.from, q.to, isClosedQuarter)) { setStatus('Appearance config failed for ' + q.label); return; }

        // Run as Excel
        setStatus('Running report for ' + q.label + '…');
        checkAbort();
        await sleep(1500 + PH_PAD);
        if (!await stepClickRunAsExcel()) { setStatus('Run as Excel failed for ' + q.label); return; }

        logSuccess(q.label + ' report triggered!');

        // Wait for the report to process and redirect to output page
        await sleep(5000);
      }

      setStatus('All ' + quarters.length + ' quarter(s) downloaded ✓');
      logSuccess('=== Payroll History complete: ' + quarters.map(q => q.label).join(', ') + ' ===');

    } catch (err) {
      if (err && err.aborted) {
        setStatus('Payroll History aborted by user');
        logWarn('Flow aborted by user (Stop / reset)');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + (err && err.message ? err.message : err));
    }
  }

  // ───────────────── download all ─────────────────

  async function downloadAll(setStatus) {
    logInfo('=== Download All Reports ===');

    const flows = [
      { name: 'Census', fn: downloadCensus },
      { name: 'SIT/FIT', fn: downloadSitFit },
      { name: 'License/EC', fn: downloadLicenseEC },
      { name: 'Payroll History', fn: downloadPayrollHistory },
      { name: 'Deduction', fn: downloadDeductionReport },
      { name: 'Direct Deposit', fn: downloadDirectDeposit },
      { name: 'Qualified Overtime', fn: downloadQualifiedOvertime },
    ];

    for (let i = 0; i < flows.length; i++) {
      const flow = flows[i];

      // Check if user pressed Stop during the previous flow
      if (aborted) {
        setStatus('Download All stopped after ' + (i > 0 ? flows[i - 1].name : 'start'));
        logWarn('Download All aborted — remaining reports skipped');
        return;
      }

      logInfo('───── Starting ' + flow.name + ' (' + (i + 1) + '/' + flows.length + ') ─────');
      setStatus('Download All: ' + flow.name + ' (' + (i + 1) + '/' + flows.length + ')…');

      await flow.fn(setStatus);

      // Check abort again after the flow returned
      if (aborted) {
        setStatus('Download All stopped during ' + flow.name);
        logWarn('Download All aborted during ' + flow.name + ' — remaining reports skipped');
        return;
      }

      logSuccess(flow.name + ' done (' + (i + 1) + '/' + flows.length + ')');

      // Wait between flows for the page to settle before starting next
      if (i < flows.length - 1) {
        logInfo('Waiting before next report...');
        await sleep(5000);
      }
    }

    setStatus('All ' + flows.length + ' reports downloaded ✓');
    logSuccess('=== All reports complete! ===');
  }

  // ───────────────── diagnostic ─────────────────

  function dumpDiagnostic() {
    logInfo('=== Diagnostic dump ===');
    const buttons = deepQueryAll('button');
    logInfo('Total buttons (deep):', buttons.length);

    const clickables = deepQueryAll(CLICKABLE_HOST_SELECTOR).filter(visible);
    logInfo('Total visible clickable hosts:', clickables.length);
    logDebug('Clickable texts:', clickables.map(b => normalize(b.textContent || b.value)).filter(Boolean));

    const lis = deepQueryAll('li');
    logInfo('Total <li>:', lis.length);

    const panes = deepQueryAll('sdf-floating-pane');
    logInfo('Total <sdf-floating-pane>:', panes.length);

    const iframes = Array.from(document.querySelectorAll('iframe'));
    logInfo('Top-level iframes:', iframes.length);
    iframes.forEach((f, i) => {
      let ok = false;
      try { ok = !!f.contentDocument; } catch (_) { }
      logDebug('iframe[' + i + ']: src=' + (f.src || '(none)') + ' sameOrigin=' + ok);
    });

    const dijitButtons = deepQueryAll('[role="button"][class*="dijit"]');
    logInfo('Total dijit role=button:', dijitButtons.length);

    const fieldSearch = findFieldSearchInput();
    logInfo('Field-canvas search input present:', !!fieldSearch);

    logInfo('=== End diagnostic ===');
  }

  // ───────────────── panel ─────────────────

  // Inject the panel stylesheet once — modern "AI assistant" look on the
  // cobalt-blue palette: glassmorphism, glow, micro-animations.
  function injectStyles() {
    if (document.getElementById('adp-bot-style')) return;
    const css = document.createElement('style');
    css.id = 'adp-bot-style';
    css.textContent = [
      '#adp-bot-panel{position:fixed;bottom:24px;right:24px;z-index:2147483646;width:324px;',
      " font:13px/1.45 'Segoe UI',system-ui,-apple-system,sans-serif;color:#dce9ff;",
      ' background:linear-gradient(165deg,rgba(2,20,46,.97) 0%,rgba(0,36,86,.95) 55%,rgba(0,24,57,.97) 100%);',
      ' border:1px solid rgba(90,159,255,.28);border-radius:18px;overflow:hidden;',
      ' box-shadow:0 8px 40px rgba(0,12,30,.6),0 0 24px rgba(0,100,241,.18);backdrop-filter:blur(14px);}',
      '#adp-bot-panel *{box-sizing:border-box;font-family:inherit;}',
      '.adpbot-head{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:move;user-select:none;',
      ' background:linear-gradient(90deg,rgba(0,71,171,.38),rgba(0,100,241,.10));border-bottom:1px solid rgba(90,159,255,.15);}',
      '.adpbot-avatar{width:34px;height:34px;border-radius:11px;flex:0 0 34px;display:flex;align-items:center;justify-content:center;',
      ' background:linear-gradient(135deg,#0064f1,#00a4cc);font-size:17px;color:#fff;',
      ' box-shadow:0 0 14px rgba(0,100,241,.55);animation:adpbot-breathe 3.2s ease-in-out infinite;}',
      '@keyframes adpbot-breathe{0%,100%{box-shadow:0 0 10px rgba(0,100,241,.45)}50%{box-shadow:0 0 22px rgba(0,164,204,.75)}}',
      '.adpbot-titlebox{flex:1;min-width:0;}',
      '.adpbot-title{margin:0;font-size:14px;font-weight:700;color:#fff;letter-spacing:.3px;}',
      '.adpbot-sub{font-size:9.5px;color:#7db3ff;letter-spacing:1px;text-transform:uppercase;}',
      '.adpbot-ver{font-size:9px;color:#8fb9ff;background:rgba(0,71,171,.35);padding:2px 7px;border-radius:999px;border:1px solid rgba(90,159,255,.22);}',
      '.adpbot-chev{background:rgba(125,179,255,.1);border:1px solid rgba(125,179,255,.25);border-radius:8px;cursor:pointer;',
      ' width:26px;height:26px;color:#a0c7ff;font-size:11px;transition:all .25s;display:flex;align-items:center;justify-content:center;}',
      '.adpbot-chev:hover{background:rgba(125,179,255,.22);color:#fff;}',
      '.adpbot-chev.min{transform:rotate(180deg);}',
      '.adpbot-statuschip{display:flex;align-items:center;gap:8px;margin:10px 14px 8px;padding:7px 11px;border-radius:10px;',
      ' background:rgba(0,71,171,.18);border:1px solid rgba(90,159,255,.14);font-size:11px;color:#a8cbff;min-height:30px;}',
      '.adpbot-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;flex:0 0 8px;',
      ' box-shadow:0 0 8px rgba(74,222,128,.8);animation:adpbot-pulse 2s ease-in-out infinite;}',
      '@keyframes adpbot-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.78)}}',
      '#adp-bot-btnrow{display:grid;grid-template-columns:1fr;gap:7px;padding:2px 14px 6px;}',
      '.adpbot-hero{position:relative;border:none;border-radius:12px;padding:13px 14px;cursor:pointer;',
      ' background:linear-gradient(120deg,#0055ce,#0064f1 45%,#00a4cc);background-size:220% 100%;',
      ' color:#fff;font-weight:700;font-size:13.5px;letter-spacing:.2px;',
      ' box-shadow:0 4px 18px rgba(0,100,241,.4);transition:all .3s;}',
      '.adpbot-hero:hover{background-position:95% 0;transform:translateY(-1px);box-shadow:0 6px 26px rgba(0,120,241,.6);}',
      '.adpbot-hero:active{transform:translateY(0);}',
      '.adpbot-item{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid rgba(125,179,255,.16);',
      ' border-radius:11px;padding:9px 12px;cursor:pointer;background:rgba(0,71,171,.22);color:#d6e6ff;',
      ' font-weight:600;font-size:12.5px;transition:all .22s;}',
      '.adpbot-item:hover{background:rgba(0,100,241,.38);border-color:rgba(125,179,255,.45);transform:translateX(3px);color:#fff;}',
      '.adpbot-ico{width:26px;height:26px;border-radius:8px;flex:0 0 26px;display:flex;align-items:center;justify-content:center;',
      ' background:rgba(0,100,241,.28);font-size:13px;}',
      '.adpbot-doc{border-color:rgba(0,164,204,.45);background:rgba(0,130,210,.26);}',
      '.adpbot-doc:hover{background:rgba(0,164,204,.42);border-color:rgba(126,231,255,.6);}',
      '.adpbot-util{display:grid;grid-template-columns:1fr 1fr;gap:7px;}',
      '.adpbot-ghost{border:1px solid rgba(125,179,255,.3);background:transparent;border-radius:10px;padding:8px;color:#8fb9ff;',
      ' cursor:pointer;font-weight:600;font-size:11.5px;transition:all .22s;}',
      '.adpbot-ghost.stop:hover{border-color:rgba(255,120,120,.55);color:#ff9d9d;background:rgba(255,99,99,.1);}',
      '.adpbot-ghost.diag:hover{border-color:rgba(0,164,204,.55);color:#7ee7ff;background:rgba(0,164,204,.1);}',
      '.adpbot-logrow{display:flex;align-items:center;justify-content:space-between;margin:4px 14px 4px;}',
      '.adpbot-loglabel{font-size:9.5px;color:#6f9fe0;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;}',
      '.adpbot-mini{padding:3px 9px;border:1px solid rgba(125,179,255,.25);background:rgba(0,71,171,.25);color:#bcd6ff;',
      ' border-radius:7px;cursor:pointer;font-size:10px;transition:all .2s;margin-left:4px;}',
      '.adpbot-mini:hover{background:rgba(0,100,241,.45);color:#fff;}',
      "#adp-bot-log{height:130px;overflow-y:auto;margin:0 14px 14px;background:rgba(0,8,22,.55);",
      " border:1px solid rgba(90,159,255,.14);border-radius:11px;padding:8px 10px;font:10.5px/1.45 'Cascadia Code',Consolas,monospace;}",
      '#adp-bot-log::-webkit-scrollbar,#adp-bot-content::-webkit-scrollbar{width:6px;}',
      '#adp-bot-log::-webkit-scrollbar-thumb,#adp-bot-content::-webkit-scrollbar-thumb{background:rgba(90,159,255,.35);border-radius:3px;}',
      '#adp-bot-log::-webkit-scrollbar-track,#adp-bot-content::-webkit-scrollbar-track{background:transparent;}',
      '#adp-bot-content{max-height:calc(100vh - 110px);overflow-y:auto;overflow-x:hidden;}',
    ].join('\n');
    document.head.appendChild(css);
  }

  function buildPanel() {
    if (document.getElementById('adp-bot-panel')) return;
    injectStyles();

    const wrapper = document.createElement('div');
    wrapper.id = 'adp-bot-panel';

    // ── Header: glowing avatar + title/subtitle + version + collapse ──
    const titleRow = document.createElement('div');
    titleRow.className = 'adpbot-head';

    const avatar = document.createElement('div');
    avatar.className = 'adpbot-avatar';
    avatar.textContent = '🤖';
    titleRow.appendChild(avatar);

    const titleBox = document.createElement('div');
    titleBox.className = 'adpbot-titlebox';
    const title = document.createElement('div');
    title.className = 'adpbot-title';
    title.textContent = 'ADP Bot';
    const sub = document.createElement('div');
    sub.className = 'adpbot-sub';
    sub.textContent = 'AI Automation Assistant';
    titleBox.appendChild(title);
    titleBox.appendChild(sub);
    titleRow.appendChild(titleBox);

    const versionTag = document.createElement('span');
    versionTag.className = 'adpbot-ver';
    versionTag.textContent = 'v1.0';
    titleRow.appendChild(versionTag);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'adpbot-chev';
    toggleBtn.textContent = '▾';
    titleRow.appendChild(toggleBtn);
    wrapper.appendChild(titleRow);

    // Content wrapper — everything below the header goes here so we can toggle it
    const contentDiv = document.createElement('div');
    contentDiv.id = 'adp-bot-content';

    const HOME_MARGIN = 24;

    // Snap the panel back to its bottom-right home corner.
    function snapHome() {
      wrapper.style.left = 'auto';
      wrapper.style.top = 'auto';
      wrapper.style.right = HOME_MARGIN + 'px';
      wrapper.style.bottom = HOME_MARGIN + 'px';
    }

    // Cap the maximized panel's content so it never spills past the bottom of the
    // viewport — WITHOUT moving the panel (no jumping). Used after a drag/resize.
    function capContent() {
      const margin = 16;
      const rect = titleRow.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - margin;
      contentDiv.style.maxHeight = Math.max(150, below) + 'px';
    }

    // On maximize: keep the chip where it is and grow toward whichever vertical
    // side has more room (down if more space below the chip, up otherwise),
    // capping the content height so the whole panel stays on screen.
    function expandFromChip() {
      const margin = 16;
      const rect = titleRow.getBoundingClientRect();
      const headH = rect.height;
      wrapper.style.left = rect.left + 'px';
      wrapper.style.right = 'auto';
      const spaceBelow = window.innerHeight - rect.top; // header-top → viewport bottom
      const spaceAbove = rect.bottom;                   // viewport top → header bottom
      if (spaceBelow >= spaceAbove) {
        // Grow downward — header stays put, content flows below it.
        wrapper.style.top = rect.top + 'px';
        wrapper.style.bottom = 'auto';
        contentDiv.style.maxHeight = Math.max(150, spaceBelow - headH - margin) + 'px';
      } else {
        // Grow upward — pin the panel's bottom at the chip's bottom; header rises.
        wrapper.style.top = 'auto';
        wrapper.style.bottom = (window.innerHeight - rect.bottom) + 'px';
        contentDiv.style.maxHeight = Math.max(150, rect.bottom - headH - margin) + 'px';
      }
    }

    let minimized = false;
    function togglePanel() {
      minimized = !minimized;
      toggleBtn.classList.toggle('min', minimized);
      if (minimized) {
        // Collapse to the chip and return it to the bottom-right home corner.
        contentDiv.style.display = 'none';
        wrapper.style.width = 'auto';
        snapHome();
      } else {
        // Expand from wherever the chip is, toward the side with more room.
        contentDiv.style.display = 'block';
        wrapper.style.width = '324px';
        expandFromChip();
      }
    }
    toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    // On window resize, re-cap the content (no reposition) so it stays on-screen.
    window.addEventListener('resize', () => { if (!minimized) capContent(); });

    // ---- Drag the panel by its title bar (position persists across reloads) ----
    let dragMoved = false;
    (function makeDraggable() {
      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

      titleRow.addEventListener('mousedown', (e) => {
        if (e.target === toggleBtn) return; // don't drag when hitting the collapse button
        dragging = true; dragMoved = false;
        const r = wrapper.getBoundingClientRect();
        wrapper.style.left = r.left + 'px';
        wrapper.style.top = r.top + 'px';
        wrapper.style.right = 'auto';
        wrapper.style.bottom = 'auto';
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        let nl = Math.max(0, Math.min(ox + dx, window.innerWidth - wrapper.offsetWidth));
        let nt = Math.max(0, Math.min(oy + dy, window.innerHeight - wrapper.offsetHeight));
        wrapper.style.left = nl + 'px';
        wrapper.style.top = nt + 'px';
      });
      document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        // If the maximized panel was dragged, re-cap its content so it can't run
        // off the bottom. (A minimized chip drag just stays where it's dropped;
        // the next maximize decides the grow direction from there.)
        if (dragMoved && !minimized) capContent();
      });
    })();

    // One-time cleanup of the old persisted position (previous versions saved a
    // dragged spot that could restore off-screen). Safe to remove every load.
    try { localStorage.removeItem('adpBot.pos'); } catch (_) { }

    // A real click on the title (not a drag) toggles collapse.
    titleRow.addEventListener('click', () => {
      if (dragMoved) { dragMoved = false; return; }
      togglePanel();
    });

    // Status chip: pulsing dot + live status text (the dot sits OUTSIDE the
    // #adp-bot-status span, which gets textContent overwritten by both modules).
    const statusChip = document.createElement('div');
    statusChip.className = 'adpbot-statuschip';
    const statusDot = document.createElement('span');
    statusDot.className = 'adpbot-dot';
    statusChip.appendChild(statusDot);
    const status = document.createElement('span');
    status.id = 'adp-bot-status';
    status.textContent = 'Idle — ready to automate';
    statusChip.appendChild(status);
    contentDiv.appendChild(statusChip);

    const btnRow = document.createElement('div');
    btnRow.id = 'adp-bot-btnrow';

    let running = false;
    function withRunGuard(fn) {
      return () => {
        if (running) { logWarn('Already running — click Stop / reset to abort'); return; }
        running = true;
        resetAbort();
        status.textContent = 'Working…';
        Promise.resolve()
          .then(() => fn(msg => status.textContent = msg))
          .catch(err => {
            if (err && err.aborted) {
              logWarn('Aborted by user');
              status.textContent = 'Aborted';
            } else {
              logError('Run failed: ' + (err && err.message ? err.message : err));
              status.textContent = 'Error — see log';
            }
          })
          .finally(() => { running = false; });
      };
    }

    // Hero action: runs everything.
    const downloadAllBtn = document.createElement('button');
    downloadAllBtn.className = 'adpbot-hero';
    downloadAllBtn.textContent = '⚡ Download All Reports';
    downloadAllBtn.addEventListener('click', withRunGuard(downloadAll));
    btnRow.appendChild(downloadAllBtn);

    // Report rows: icon chip + label, hover slide.
    function mkItem(icon, label, handler) {
      const b = document.createElement('button');
      b.className = 'adpbot-item';
      const ico = document.createElement('span');
      ico.className = 'adpbot-ico';
      ico.textContent = icon;
      b.appendChild(ico);
      b.appendChild(document.createTextNode(label));
      b.addEventListener('click', handler);
      btnRow.appendChild(b);
      return b;
    }
    mkItem('👥', 'Census', withRunGuard(downloadCensus));
    mkItem('🧾', 'SIT / FIT', withRunGuard(downloadSitFit));
    mkItem('📜', 'License / EC', withRunGuard(downloadLicenseEC));
    mkItem('💰', 'Payroll History', withRunGuard(downloadPayrollHistory));
    mkItem('🧮', 'Deduction', withRunGuard(downloadDeductionReport));
    mkItem('🏦', 'Direct Deposit', withRunGuard(downloadDirectDeposit));
    mkItem('⏱️', 'Qualified Overtime', withRunGuard(downloadQualifiedOvertime));

    // Utility row: Stop + diagnostic as quiet ghost buttons.
    const utilRow = document.createElement('div');
    utilRow.className = 'adpbot-util';
    const stopBtn = document.createElement('button');
    stopBtn.className = 'adpbot-ghost stop';
    stopBtn.textContent = '⏹ Stop / reset';
    stopBtn.addEventListener('click', () => {
      if (!running) {
        logInfo('Stop / reset clicked — nothing running');
        status.textContent = 'Idle — ready to automate';
        resetAbort();
        return;
      }
      requestAbort();
      logWarn('Stop requested — aborting at next opportunity (≤100ms)');
      status.textContent = 'Stopping…';
    });
    utilRow.appendChild(stopBtn);

    const diagBtn = document.createElement('button');
    diagBtn.className = 'adpbot-ghost diag';
    diagBtn.textContent = '🩺 Diagnostic';
    diagBtn.addEventListener('click', dumpDiagnostic);
    utilRow.appendChild(diagBtn);
    btnRow.appendChild(utilRow);

    wrapper.appendChild(contentDiv); // add contentDiv to wrapper before filling it

    contentDiv.appendChild(btnRow);

    const logRow = document.createElement('div');
    logRow.className = 'adpbot-logrow';
    const logLabel = document.createElement('span');
    logLabel.textContent = '⌁ Activity Log';
    logLabel.className = 'adpbot-loglabel';
    logRow.appendChild(logLabel);
    const logActions = document.createElement('div');
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.className = 'adpbot-mini';
    clearBtn.addEventListener('click', () => { if (logEl) logEl.innerHTML = ''; });
    logActions.appendChild(clearBtn);
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'adpbot-mini';
    copyBtn.addEventListener('click', () => {
      if (!logEl) return;
      const text = Array.from(logEl.children).map(c => c.textContent).join('\n');
      navigator.clipboard.writeText(text).then(
        () => { copyBtn.textContent = 'Copied!'; setTimeout(() => copyBtn.textContent = 'Copy', 1200); },
        () => { copyBtn.textContent = 'Failed'; setTimeout(() => copyBtn.textContent = 'Copy', 1200); }
      );
    });
    logActions.appendChild(copyBtn);
    logRow.appendChild(logActions);
    contentDiv.appendChild(logRow);

    logEl = document.createElement('div');
    logEl.id = 'adp-bot-log';
    contentDiv.appendChild(logEl);

    document.body.appendChild(wrapper);
    flushPendingLogs();
    logInfo('Panel ready — start from the home page');
  }

  function init() {
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    buildPanel();
  }

  init();
})();

// =====================================================================
// MODULE 2 of 2 — Export Documents bot. Self-contained IIFE below.
// Adds one "Start Export All" button into the panel above (#adp-bot-btnrow)
// and shares its single log box (#adp-bot-log) and status line.
// =====================================================================

(function () {
  'use strict';

  // Only run in the top window (ADP loads helper iframes we must ignore).
  if (window.top !== window.self) return;

  // ======================================================================
  // CONFIG
  // ======================================================================
  const ROUTE = 'pracExportDocuments';        // hash route of the Export Documents page
  const ROUTE_HASH = '#/pracSetup/pracExportDocuments'; // full hash to navigate to
  const STORAGE_KEY = 'adpExportBot.v1';
  const SUBCATEGORY_LABEL = 'All';            // we always request the "All" subcategory
  const AUTO_DOWNLOAD = true;                 // after a category completes, download its files
  const FILE_DOWNLOAD_GAP_MS = 1500;          // stagger between file downloads
  const POLL_RELOAD_MS = 60000;               // how often to reload the page to refresh grid status while waiting
  const STEP_TIMEOUT_MS = 25000;              // max wait for any single UI step (dialog open, dropdown, etc.)
  const MAX_WAIT_PER_CATEGORY_MS = 40 * 60 * 1000; // safety: give up waiting on one category after 40 min

  // Categories differ per client, so nothing is hard-coded — they are detected
  // at runtime by reading the dialog's <sdf-select-item> options on Start.

  // ======================================================================
  // SHADOW-DOM-PIERCING QUERY HELPERS
  // ADP renders everything inside nested shadow roots, so normal
  // document.querySelector cannot reach the controls. We walk shadow roots.
  // ======================================================================
  function* walk(root) {
    const nodes = root.querySelectorAll('*');
    for (const el of nodes) {
      yield el;
      if (el.shadowRoot) yield* walk(el.shadowRoot);
    }
  }
  function deepFind(predicate) {
    for (const el of walk(document)) {
      try { if (predicate(el)) return el; } catch (e) { /* ignore */ }
    }
    return null;
  }
  function deepFindAll(predicate) {
    const out = [];
    for (const el of walk(document)) {
      try { if (predicate(el)) out.push(el); } catch (e) { /* ignore */ }
    }
    return out;
  }
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ======================================================================
  // GENERIC ASYNC HELPERS
  // ======================================================================
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Poll `fn` until it returns a truthy value or we time out.
  async function waitFor(fn, { timeout = STEP_TIMEOUT_MS, interval = 200, label = 'condition' } = {}) {
    const start = Date.now();
    for (; ;) {
      let v;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() - start > timeout) {
        throw new Error('Timed out waiting for: ' + label);
      }
      await sleep(interval);
    }
  }

  // ======================================================================
  // ROUTE
  // ======================================================================
  const onExportPage = () => location.hash.indexOf(ROUTE) !== -1;

  // Navigate the SPA to the Export Documents page (hash routing, no reload).
  function navigateToExport() {
    if (!onExportPage()) {
      log('Navigating to Export Documents…');
      location.hash = ROUTE_HASH;
    }
  }

  // ======================================================================
  // STATE (persisted so we survive page reloads during the long waits)
  // ======================================================================
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
    catch (e) { return null; }
  }
  function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function clearState() { localStorage.removeItem(STORAGE_KEY); }

  function newState(selected) {
    return {
      active: true,
      phase: 'submit',            // 'submit' | 'waiting'
      queue: selected.slice(),    // categories left to do (incl. current at [0])
      done: [],                   // labels completed
      current: selected[0] || null,
      baselineInProgress: 0,      // # of in-progress rows measured right before we submitted current
      submittedAt: 0,
      startedAt: Date.now(),
      lastError: '',
    };
  }

  // ======================================================================
  // GRID READING
  // ======================================================================
  function getRows() {
    // AG Grid data rows.
    const rows = deepFindAll((el) =>
      el.getAttribute &&
      el.getAttribute('role') === 'row' &&
      el.classList && el.classList.contains('ag-row')
    );
    return rows.map((row) => {
      const statusCell = row.querySelector('[col-id="status"]');
      const actionsCell = row.querySelector('[col-id="actions"]');
      const badge = statusCell ? statusCell.querySelector('sdf-badge') : null;
      const statusAttr = badge ? (badge.getAttribute('status') || '') : '';
      const statusText = (statusCell ? statusCell.textContent : '').trim();
      const downloadLink = actionsCell
        ? actionsCell.querySelector('sdf-link, a')
        : null;
      const hasDownload = /download/i.test(actionsCell ? actionsCell.textContent : '');
      return { row, statusAttr, statusText, hasDownload, downloadLink };
    });
  }
  function gridReady() {
    // The grid is "ready" once AG Grid has rendered — even with zero data rows.
    // A fresh client (or one whose export list is currently empty) shows a
    // "No Rows To Show" overlay instead of rows, so requiring getRows() > 0
    // would time out forever. Treat the grid header / viewport / no-rows
    // overlay as proof the grid loaded.
    if (getRows().length > 0) return true;
    const shell = deepFind((el) =>
      el.classList && (
        el.classList.contains('ag-overlay-no-rows-wrapper') ||
        el.classList.contains('ag-overlay-no-rows-center') ||
        el.classList.contains('ag-center-cols-viewport') ||
        el.classList.contains('ag-body-viewport') ||
        el.classList.contains('ag-header')
      ) && isVisible(el)
    );
    if (shell) return true;
    // Last-resort fallback: if the page's own "Request New Export" button is
    // present and visible, the Export Documents page has fully rendered even if
    // ADP re-themed the AG Grid class names. That button is all we actually
    // need to proceed (detection/submit both start by opening its dialog).
    const reqBtn = deepFind((el) =>
      el.tagName === 'SDF-BUTTON' &&
      el.getAttribute('aria-label') === 'Request New Export' &&
      isVisible(el)
    );
    return !!reqBtn;
  }
  function isInProgress(r) {
    // Robust: match by text or badge status attribute, not a single hard-coded value.
    return /in\s*progress|pending|processing|queued|requested/i.test(r.statusText) ||
      /progress|pending|processing|queued|requested/i.test(r.statusAttr);
  }
  function countInProgress() {
    return getRows().filter(isInProgress).length;
  }

  // ======================================================================
  // DIALOG INTERACTION
  // ======================================================================
  function clickEl(el) {
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }

  async function openDialog() {
    const btn = await waitFor(
      () => deepFind((el) =>
        el.tagName === 'SDF-BUTTON' &&
        el.getAttribute('aria-label') === 'Request New Export'),
      { label: 'Request New Export button' }
    );
    clickEl(btn);
    // Dialog open == the #category select is present and visible.
    await waitFor(
      () => {
        const c = deepFind((el) => el.id === 'category' && el.tagName === 'SDF-SELECT-SIMPLE');
        return c && isVisible(c) ? c : null;
      },
      { label: 'export dialog (category field)' }
    );
    await sleep(400);
  }

  // Open an sdf-select-simple and click the option matching value or label.
  async function selectSimple(hostId, { value, label }) {
    const host = await waitFor(
      () => deepFind((el) => el.id === hostId && el.tagName === 'SDF-SELECT-SIMPLE'),
      { label: hostId + ' select' }
    );

    // Open the dropdown via its inner trigger-button (falls back to the host).
    const trigger = (host.shadowRoot && host.shadowRoot.querySelector('.trigger-button')) || host;
    clickEl(trigger);

    // Wait for the matching, visible option to appear, then click it.
    const item = await waitFor(
      () => {
        const items = deepFindAll((el) =>
          el.tagName === 'SDF-SELECT-ITEM' && isVisible(el));
        return items.find((el) => {
          if (value != null) return el.getAttribute('value') === value;
          const al = (el.getAttribute('aria-label') || el.textContent || '').trim();
          return al.toLowerCase() === String(label).toLowerCase();
        }) || null;
      },
      { label: hostId + ' option ' + (value || label) }
    );
    clickEl(item);
    await sleep(400);
  }

  function confirmBtn() {
    return deepFind((el) =>
      el.id === 'confirm' && el.tagName === 'SDF-BUTTON' &&
      (el.getAttribute('aria-label') === 'Request export'));
  }
  function confirmEnabled() {
    const b = confirmBtn();
    return b && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true';
  }
  function subcategoryEnabled() {
    const s = deepFind((el) => el.id === 'subcategory' && el.tagName === 'SDF-SELECT-SIMPLE');
    if (!s) return false;
    return !s.classList.contains('is-disabled');
  }

  // Close the dialog without submitting.
  async function cancelDialog() {
    const c = deepFind((el) => el.id === 'cancel' && el.tagName === 'SDF-BUTTON');
    if (c) clickEl(c);
    await waitFor(
      () => {
        const cat = deepFind((el) => el.id === 'category' && el.tagName === 'SDF-SELECT-SIMPLE');
        return !cat || !isVisible(cat);
      },
      { label: 'dialog to close', timeout: 8000 }
    ).catch(() => { });
  }

  // Discover the available categories by opening the dialog and reading the
  // Category dropdown's options. Navigates to the Export page first if needed.
  async function detectCategories() {
    if (!onExportPage()) {
      navigateToExport();
      await waitFor(onExportPage, { label: 'Export route', timeout: STEP_TIMEOUT_MS });
    }
    await waitFor(gridReady, { label: 'grid to load', timeout: STEP_TIMEOUT_MS });
    await sleep(800);

    await openDialog();

    const host = await waitFor(
      () => deepFind((el) => el.id === 'category' && el.tagName === 'SDF-SELECT-SIMPLE'),
      { label: 'category select' }
    );
    const trigger = (host.shadowRoot && host.shadowRoot.querySelector('.trigger-button')) || host;
    clickEl(trigger);

    await waitFor(
      () => deepFindAll((el) => el.tagName === 'SDF-SELECT-ITEM' && isVisible(el)).length > 0,
      { label: 'category options' }
    );

    const seen = new Set();
    const cats = [];
    deepFindAll((el) => el.tagName === 'SDF-SELECT-ITEM' && isVisible(el)).forEach((el) => {
      const value = el.getAttribute('value');
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      const disabled = el.getAttribute('aria-disabled') === 'true';
      if (value && label && !disabled && !seen.has(value)) {
        seen.add(value);
        cats.push({ label, value });
      }
    });

    clickEl(trigger);        // close the dropdown
    await sleep(300);
    await cancelDialog();    // close the dialog

    return cats;
  }

  // ======================================================================
  // DOWNLOAD FLOW
  // ======================================================================
  function downloadPanelOpen() {
    // The "Download Document" panel has a file grid with a fileName column.
    const hdr = deepFind((el) =>
      el.getAttribute && el.getAttribute('col-id') === 'fileName' &&
      el.getAttribute('role') === 'columnheader');
    return hdr && isVisible(hdr);
  }
  function getDownloadFileLinks() {
    // Each file row's actions cell: <sdf-link> containing <sdf-icon icon="action-download">.
    return deepFindAll((el) =>
      el.tagName === 'SDF-LINK' && isVisible(el) &&
      el.querySelector && el.querySelector('sdf-icon[icon="action-download"]'));
  }
  function findBackButton() {
    return deepFind((el) =>
      el.tagName === 'SDF-BUTTON' &&
      (el.id === 'back-button-with-label' || el.getAttribute('aria-label') === 'Back'));
  }

  // After a category completes, click Download on the newest (top) completed row,
  // download every file in the panel, then go back to the grid.
  async function downloadTopCompletedRow() {
    const target = getRows().find((r) => !isInProgress(r) && r.hasDownload && r.downloadLink);
    if (!target) { log('No completed row with a Download link found.'); return; }

    clickEl(target.downloadLink);             // open the Download Document panel
    await waitFor(downloadPanelOpen, { label: 'Download Document panel', timeout: STEP_TIMEOUT_MS });
    await sleep(900);

    const links = getDownloadFileLinks();
    log('Downloading ' + links.length + ' file(s)…');
    for (const link of links) {
      clickEl(link);
      await sleep(FILE_DOWNLOAD_GAP_MS);
    }
    await sleep(800);

    const back = findBackButton();
    if (back) clickEl(back);
    await waitFor(() => !downloadPanelOpen() && gridReady(),
      { label: 'return to grid', timeout: 12000 }).catch(() => { });
    await sleep(600);
  }

  // Fill the dialog for one category and submit it.
  async function submitCategory(cat) {
    await openDialog();
    await selectSimple('category', { value: cat.value });

    // Subcategory may auto-default to "All". Only set it if submit isn't enabled yet.
    await waitFor(() => subcategoryEnabled() || confirmEnabled(),
      { label: 'subcategory to enable', timeout: STEP_TIMEOUT_MS });

    if (!confirmEnabled()) {
      try {
        await selectSimple('subcategory', { label: SUBCATEGORY_LABEL });
      } catch (e) {
        log('Subcategory "' + SUBCATEGORY_LABEL + '" not selectable: ' + e.message);
      }
    }

    const btn = await waitFor(() => (confirmEnabled() ? confirmBtn() : null),
      { label: 'Request export button to enable', timeout: STEP_TIMEOUT_MS });
    clickEl(btn);

    // Confirm submission: dialog closes (category field disappears) within timeout.
    await waitFor(
      () => {
        const c = deepFind((el) => el.id === 'category' && el.tagName === 'SDF-SELECT-SIMPLE');
        return !c || !isVisible(c);
      },
      { label: 'dialog to close after submit', timeout: STEP_TIMEOUT_MS }
    ).catch(() => log('Dialog did not visibly close; continuing.'));
  }

  // ======================================================================
  // HTML INSPECTOR (Shadow-DOM-piercing dump, same as the standalone tool)
  // ======================================================================
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function openTagStr(el) {
    let t = '<' + el.tagName.toLowerCase();
    for (const a of el.attributes) t += ` ${a.name}="${esc(a.value)}"`;
    return t + '>';
  }
  function serializeNode(node, depth) {
    const pad = '  '.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.textContent.trim();
      return txt ? `${pad}${esc(txt)}\n` : '';
    }
    if (node.nodeType === Node.COMMENT_NODE) return `${pad}<!-- ${esc(node.textContent.trim())} -->\n`;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    if (node.id === 'adp-export-bot') return ''; // skip our own panel
    if (tag === 'script' || tag === 'style' || tag === 'svg') {
      return `${pad}${openTagStr(node)} …(${tag} omitted)…\n`;
    }
    let out = `${pad}${openTagStr(node)}\n`;
    if (node.shadowRoot) {
      out += `${pad}  #shadow-root (open)\n`;
      for (const ch of node.shadowRoot.childNodes) out += serializeNode(ch, depth + 2);
    }
    for (const ch of node.childNodes) out += serializeNode(ch, depth + 1);
    if (tag === 'iframe' || tag === 'frame') {
      try {
        const d = node.contentDocument || (node.contentWindow && node.contentWindow.document);
        if (d) {
          out += `${pad}  ===== IFRAME (${node.src || 'no src'}) =====\n`;
          out += serializeNode(d.documentElement, depth + 2);
        }
      } catch (e) {
        out += `${pad}  --- CROSS-ORIGIN iframe: src=${node.src} ---\n`;
      }
    }
    return out;
  }
  function tstamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  async function dumpHTML() {
    let dump = 'ADP DOM dump\nCaptured: ' + new Date().toString() + '\nURL: ' + location.href + '\n';
    dump += '='.repeat(56) + '\n';
    dump += serializeNode(document.documentElement, 0);
    const blob = new Blob([dump], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'adp-dump_' + tstamp() + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    try { await navigator.clipboard.writeText(dump); } catch (e) { }
    console.log('[ADP Export Bot] HTML dump:\n', dump);
    log('Saved HTML dump (' + Math.round(dump.length / 1024) + ' KB) + copied to clipboard.');
  }

  // ======================================================================
  // CONTROL PANEL UI — one button injected into the shared "ADP Bot" panel,
  // reusing its single log box and status line (no separate section/log).
  // ======================================================================
  let startBtn;
  const sharedLog = () => document.getElementById('adp-bot-log');
  const sharedStatus = () => document.getElementById('adp-bot-status');

  function log(msg) {
    console.log('[ADP Export] ' + msg);
    const box = sharedLog();
    if (!box) return;
    const line = document.createElement('div');
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    line.style.cssText = 'color:#2dd4a7;white-space:pre-wrap;word-break:break-word;line-height:1.3;padding:1px 0;';
    line.textContent = ts + ' EXPORT ' + msg;
    box.appendChild(line);
    while (box.children.length > 200) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }
  function setStatus(msg) { const s = sharedStatus(); if (s) s.textContent = msg; }

  // Add a single "Start Export All" button to the shared button row. If the
  // Reports panel isn't present, create a minimal own panel as a fallback.
  function buildPanel() {
    if (startBtn) return;
    let grid = document.getElementById('adp-bot-btnrow');

    if (!grid) {
      const wrap = document.createElement('div');
      wrap.id = 'adp-export-bot';
      wrap.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:2147483647;background:linear-gradient(165deg,rgba(2,20,46,.97),rgba(0,36,86,.95));color:#dce9ff;border:1px solid rgba(90,159,255,.28);border-radius:16px;box-shadow:0 8px 40px rgba(0,12,30,.6);font:12px "Segoe UI",system-ui,sans-serif;width:300px;padding:12px;';
      const s = document.createElement('div'); s.id = 'adp-bot-status'; s.style.cssText = 'font-size:11px;color:#a8cbff;margin-bottom:6px;'; s.textContent = 'Export: idle';
      grid = document.createElement('div'); grid.id = 'adp-bot-btnrow'; grid.style.cssText = 'display:grid;gap:6px;margin-bottom:6px;';
      const lg = document.createElement('div'); lg.id = 'adp-bot-log'; lg.style.cssText = 'height:100px;overflow-y:auto;background:rgba(0,8,22,.55);border:1px solid rgba(90,159,255,.14);border-radius:10px;padding:6px;font:10px/1.4 Consolas,monospace;color:#a8c6ec;';
      wrap.appendChild(s); wrap.appendChild(grid); wrap.appendChild(lg);
      document.body.appendChild(wrap);
    }

    startBtn = document.createElement('button');
    startBtn.id = 'adp-export-start';
    startBtn.className = 'adpbot-item adpbot-doc';
    setIdleLabel();
    startBtn.addEventListener('click', onToggle);

    // Sit just above the utility row holding "Stop / reset" when present.
    const stopRef = Array.from(grid.children).find(b => (b.textContent || '').includes('Stop / reset'));
    if (stopRef) grid.insertBefore(startBtn, stopRef); else grid.appendChild(startBtn);
  }

  // Compose the icon-chip + label content to match the report rows' style.
  function setBtnContent(icon, label) {
    startBtn.innerHTML = '';
    const ico = document.createElement('span');
    ico.className = 'adpbot-ico';
    ico.textContent = icon;
    startBtn.appendChild(ico);
    startBtn.appendChild(document.createTextNode(label));
  }
  function setIdleLabel() { setBtnContent('📁', 'Download Documents'); }
  function setRunningLabel() { setBtnContent('⏹', 'Stop Download'); }

  // Update the button label, and the shared status line only while active
  // (so we don't clobber the Reports module's status when the export is idle).
  function renderPanel(state) {
    if (!startBtn) return;
    const running = state && state.active;
    const wasRunning = startBtn.dataset.running === '1';
    if (running !== wasRunning) {
      startBtn.dataset.running = running ? '1' : '0';
      if (running) setRunningLabel(); else setIdleLabel();
      startBtn.style.background = running ? 'rgba(255,99,99,.22)' : '';
      startBtn.style.borderColor = running ? 'rgba(255,120,120,.5)' : '';
    }
    if (!running) return;

    if (!onExportPage()) { setStatus('Export: opening Export Documents…'); return; }
    const total = state.done.length + state.queue.length;
    const cur = state.current ? state.current.label : '(none)';
    if (state.phase === 'waiting') {
      const mins = Math.floor((Date.now() - state.submittedAt) / 60000);
      const secs = Math.floor(((Date.now() - state.submittedAt) % 60000) / 1000);
      setStatus('Export: waiting for ' + cur + ' (' + mins + 'm ' + secs + 's) — done ' + state.done.length + '/' + total);
    } else {
      setStatus('Export: submitting ' + cur + ' — done ' + state.done.length + '/' + total);
    }
  }

  function onToggle() {
    const st = loadState();
    if (st && st.active) onStopExport();
    else onStartExport();
  }

  let starting = false;
  async function onStartExport() {
    if (starting) return;
    starting = true;
    try {
      log('Detecting categories…');
      setBtnContent('🔍', 'Detecting categories…');
      let cats;
      try {
        cats = await detectCategories();
      } catch (e) {
        log('Detect failed: ' + e.message);
        alert('Could not detect categories: ' + e.message);
        return;
      }
      if (!cats.length) { alert('No categories found.'); return; }
      log('Found ' + cats.length + ': ' + cats.map((c) => c.label).join(', '));

      const s = newState(cats);
      saveState(s);
      log('Started. Queue: ' + cats.map((c) => c.label).join(', '));
      renderPanel(s);
      tick(); // we are already on the Export page after detection
    } finally {
      starting = false;
      const st = loadState();
      if (!(st && st.active)) setIdleLabel(); // restore label if detect failed
      renderPanel(st);
    }
  }

  function onStopExport() {
    clearState();
    log('Export stopped by user.');
    setStatus('Export: stopped');
    renderPanel(null);
  }

  // ======================================================================
  // MAIN STATE-MACHINE TICK
  // ======================================================================
  let ticking = false;
  let reloadTimer = null;

  function scheduleReload() {
    if (reloadTimer) return;
    log('Will refresh in ' + Math.round(POLL_RELOAD_MS / 1000) + 's to check status…');
    reloadTimer = setTimeout(() => location.reload(), POLL_RELOAD_MS);
  }

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const state = loadState();
      renderPanel(state);
      if (!state || !state.active) return;
      if (!onExportPage()) { return; } // wait until user is on the page

      // Make sure the grid has loaded before reading/counting anything.
      await waitFor(gridReady, { label: 'grid to load', timeout: STEP_TIMEOUT_MS });
      await sleep(1200); // settle

      if (state.phase === 'submit') {
        // Measure baseline BEFORE submitting so we can detect our new request finishing.
        state.baselineInProgress = countInProgress();
        log('Submitting "' + state.current.label + '" (baseline in-progress=' + state.baselineInProgress + ')');
        saveState(state);

        await submitCategory(state.current);

        state.phase = 'waiting';
        state.submittedAt = Date.now();
        state.lastError = '';
        saveState(state);
        log('Submitted "' + state.current.label + '". Waiting for it to complete…');
        renderPanel(state);
        scheduleReload();

      } else if (state.phase === 'waiting') {
        const now = countInProgress();
        const elapsed = Date.now() - state.submittedAt;
        const finished = now <= state.baselineInProgress;
        const timedOut = elapsed > MAX_WAIT_PER_CATEGORY_MS;

        if (finished || timedOut) {
          log((timedOut ? '⚠️ Timeout on "' : '✅ Completed "') + state.current.label + '".');

          // Download the freshly-completed export (its row is newest = on top).
          if (AUTO_DOWNLOAD && !timedOut) {
            try {
              await downloadTopCompletedRow();
            } catch (e) {
              log('⚠️ Download step failed for "' + state.current.label + '": ' + e.message);
            }
          }

          state.done.push(state.current.label);
          state.queue.shift(); // remove current

          if (state.queue.length === 0) {
            state.active = false;
            state.phase = 'idle';
            saveState(state);
            renderPanel(state);
            log('🎉 All done: ' + state.done.join(', '));
            alert('ADP Export-All finished.\nCompleted: ' + state.done.join(', '));
          } else {
            state.current = state.queue[0];
            state.phase = 'submit';
            saveState(state);
            renderPanel(state);
            ticking = false;
            return tick(); // immediately submit the next category (no reload needed)
          }
        } else {
          log('Still in progress (' + now + ' in-progress rows; baseline ' + state.baselineInProgress + '). Elapsed ' + Math.round(elapsed / 60000) + 'm.');
          renderPanel(state);
          scheduleReload();
        }
      }
    } catch (e) {
      const state = loadState();
      log('❌ Error: ' + e.message);
      if (state && state.active) {
        state.lastError = e.message;
        saveState(state);
        // Back off and retry via a reload rather than getting stuck.
        scheduleReload();
      }
    } finally {
      ticking = false;
    }
  }

  // ======================================================================
  // BOOT
  // ======================================================================
  // When the SPA route changes (e.g. after navigateToExport), resume if needed.
  function onRouteChange() {
    const state = loadState();
    renderPanel(state);
    if (state && state.active && onExportPage()) {
      setTimeout(tick, 2000); // let the grid mount
    }
  }

  function boot() {
    const state = loadState();
    // Wait briefly for the Reports panel so we can dock into it; otherwise stand alone.
    let tries = 0;
    (function waitHost() {
      if (document.getElementById('adp-export-start')) return; // already built
      if (document.getElementById('adp-bot-btnrow') || tries++ > 12) { afterHost(); }
      else setTimeout(waitHost, 150);
    })();

    function afterHost() {
      buildPanel();
      renderPanel(state);
      // Keep the elapsed timer ticking in the panel.
      setInterval(() => renderPanel(loadState()), 1000);
      // Resume on SPA navigations without a full reload.
      window.addEventListener('hashchange', onRouteChange);

      if (state && state.active) {
        if (onExportPage()) {
          // Give ADP's SPA a moment to mount the grid after a (re)load.
          setTimeout(tick, 2500);
        } else {
          // Active run but landed off-route (e.g. opened on Home) -> go there.
          setTimeout(navigateToExport, 1200);
        }
      }
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 800);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
  }
})();