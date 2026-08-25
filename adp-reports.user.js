// ==UserScript==
// @name         ADP Workforce Now - Unified Automation (Reports + Export Documents)
// @namespace    adp-doc-export-tools
// @version      1.10.0
// @description  Reports automation (Download All, Census, SIT/FIT, License/EC, Tax Validation, Payroll History, Deduction, Direct Deposit, Qualified Overtime Wages and Tips) + Export Documents bot (auto-detect categories, sequential export, auto-download). One shared panel.
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

  // Version shown in the panel badge — read from Tampermonkey so it can never
  // drift from @version the way a hardcoded copy does.
  const SCRIPT_VERSION = (() => {
    try {
      if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) {
        return GM_info.script.version;
      }
    } catch (_) { }
    return '1.7.1';
  })();

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

  const TAX_VALIDATION_COLUMNS = [
    "Associate ID (Employment Profile)",
    "Payroll Company Code (Employment Profile)",
    "File Number (Employment Profile)",
    "Legal First Name (Personal Profile)",
    "Legal Last Name (Personal Profile)",
    "Position Status (Employment Profile)",
    "Primary Address: City (Personal Profile)",
    "Primary Address: State / Territory Code (Personal Profile)",
    "Worked in State Code (Tax Withholdings)",
    "Lived in State Code (Tax Withholdings)",
    "Worked in Local Jurisdiction Code (Tax Withholdings)",
    "Worked in Local Jurisdiction Description (Tax Withholdings)",
    "Lived in Local Jurisdiction Code (Tax Withholdings)",
    "Lived in Local Jurisdiction Description (Tax Withholdings)",
    "SUI/SDI Tax Code (Tax Withholdings)",
    "SUI/SDI Tax Code Description (Tax Withholdings)"
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
    // Wait for the field selection panel to appear — up to 45s; slow tenants
    // take well over the old 10s to render the slider.
    let panelReady = false;
    for (let i = 0; i < 90 && !panelReady; i++) {
      const labels = deepQueryAll('.checkactionbubble-text').filter(visible);
      if (labels.length > 5) {
        panelReady = true;
        break;
      }
      if (i > 0 && i % 20 === 0) logInfo('Field panel still loading… (' + (i / 2) + 's)');
      await sleep(500);
    }
    if (!panelReady) {
      logError('Field selection panel did not load (waited 45s)');
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

  // Is the field already listed on the run page's "What's Displayed" CARD?
  // The card shows Included Fields as plain text — when the field is already
  // there, the whole panel trip is unnecessary (and on some tenants the slider
  // never exposes the classic checkactionbubble markup at all, so skipping is
  // the only way through).
  function fieldAlreadyIncluded(fieldName) {
    const re = new RegExp(fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i');
    for (const el of deepQueryAll('div, section, td, li')) {
      if (!visible(el)) continue;
      const t = (el.textContent || '');
      if (t.length < 2000 && t.indexOf('Included Fields') >= 0 && re.test(t)) return true;
    }
    return false;
  }

  // Select a single field on the "What's Displayed" panel WITHOUT clearing others.
  // Slow tenants (Lazo, North Star) take well over 10s to render the slider —
  // the panel WAS loading fine, the old 10s wait just gave up too early. Wait
  // up to 45s with progress notes.
  async function stepSelectSingleDisplayField(fieldName) {
    let panelReady = false;
    for (let i = 0; i < 90 && !panelReady; i++) {
      const labels = deepQueryAll('.checkactionbubble-text').filter(visible);
      if (labels.length > 3) { panelReady = true; break; }
      if (i > 0 && i % 20 === 0) logInfo('Field panel still loading… (' + (i / 2) + 's)');
      await sleep(500);
    }
    if (!panelReady) {
      logError('Field selection panel did not load (waited 45s)');
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

      checkAbort();
      if (fieldAlreadyIncluded('Associate ID')) {
        logSuccess('Associate ID is already in Included Fields — skipping the field panel (Steps 6-7)');
      } else {
        setStatus('Step 6: Opening "What\'s Displayed on the Report"…');
        if (!await stepClickWhatsDisplayed()) { setStatus('Step 6 failed — see log'); return; }

        await sleep(1000);

        setStatus('Step 7: Selecting Associate ID…');
        checkAbort();
        let fieldOk = await stepSelectSingleDisplayField('Associate ID');
        if (!fieldOk) {
          // Slow tenant: the first click may have landed before the page was truly
          // wired up. Re-open the panel once and try again.
          logWarn('Retrying: re-opening "What\'s Displayed" and waiting again');
          await sleep(2000);
          if (await stepClickWhatsDisplayed()) {
            await sleep(1000);
            fieldOk = await stepSelectSingleDisplayField('Associate ID');
          }
        }
        if (!fieldOk) { setStatus('Step 7 failed — see log'); return; }
      }

      setStatus('Step 8: Running report…');
      checkAbort();
      await sleep(1500);
      if (!await stepClickRunAsExcel()) { setStatus('Step 8 failed — see log'); return; }

      logSuccess('Deduction Report triggered — waiting for it on Reports Output');
      const saved = await downloadFinishedReport('Deduction Report', setStatus);
      setStatus(saved ? 'Deduction Report downloaded ✓' : 'Deduction Report triggered ✓ (download it from Reports Output)');
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

      logSuccess('Qualified Overtime Report triggered — waiting for it on Reports Output');
      const saved = await downloadFinishedReport('Qualified Overtime Report', setStatus);
      setStatus(saved ? 'Qualified Overtime Report downloaded ✓' : 'Qualified Overtime Report triggered ✓ (download it from Reports Output)');
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

  // ───────────────── Time Off Balance Summary flow ─────────────────

  // Year-to-date only: 01/01 of the CURRENT year → today, both ends derived
  // from the system clock so the range rolls forward on its own each January.
  // (The Historical Data Bot pulls this same report for a wider window; that
  // flow is separate and untouched.)
  function tobsDateRange() {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    return {
      from: '01/01/' + d.getFullYear(),
      to: p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + '/' + d.getFullYear(),
    };
  }

  async function downloadTimeOffBalanceSummary(setStatus) {
    const REPORT = 'Time Off Balance Summary';
    logInfo('=== Download ' + REPORT + ' ===');
    resetAbort();

    const range = tobsDateRange();
    logInfo('Date range (year-to-date): ' + range.from + ' → ' + range.to);

    try {
      setStatus('Step 1: Opening Reports menu…');
      checkAbort();
      if (!await stepOpenReportsMenu()) { setStatus('Step 1 failed — see log'); return; }

      setStatus('Step 2: Navigating to All Standard Reports…');
      checkAbort();
      if (!await stepClickAllStandardReports()) { setStatus('Step 2 failed — see log'); return; }

      setStatus('Step 3: Searching for ' + REPORT + '…');
      checkAbort();
      if (!await stepSearchDojoReport(REPORT)) { setStatus('Step 3 failed — see log'); return; }

      setStatus('Step 4: Selecting ' + REPORT + '…');
      checkAbort();
      if (!await stepSelectStandardReportByTitle(REPORT)) { setStatus('Step 4 failed — see log'); return; }

      setStatus('Step 5: Waiting for Run Report page…');
      checkAbort();
      if (!await stepWaitForRunReportPage()) { setStatus('Step 5 failed — see log'); return; }

      // stepWaitForRunReportPage returns as soon as the button TEXT appears, but
      // ADP is still rendering. Clicking too early makes ADP treat it as a bot
      // click and silently drop it, so wait for the page sections to populate
      // and then settle before going on.
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
      await sleep(3000); // extra settle so ADP finishes wiring up the page

      setStatus('Step 6: Opening "What\'s Displayed on the Report"…');
      checkAbort();
      if (!await stepClickWhatsDisplayed()) { setStatus('Step 6 failed — see log'); return; }
      await sleep(1000);

      setStatus('Step 7: Selecting all fields…');
      checkAbort();
      if (!await stepSelectAllDisplayFields()) { setStatus('Step 7 failed — see log'); return; }

      setStatus('Step 8: Opening Appearance settings…');
      checkAbort();
      await sleep(2000);
      if (!await stepClickAppearanceSettings()) { setStatus('Step 8 failed — see log'); return; }

      setStatus('Step 9: Setting date range ' + range.from + ' → ' + range.to + '…');
      checkAbort();
      if (!await stepConfigureDateRangeOnly(range.from, range.to)) { setStatus('Step 9 failed — see log'); return; }

      setStatus('Step 10: Running report…');
      checkAbort();
      await sleep(1500);
      if (!await stepClickRunAsExcel()) { setStatus('Step 10 failed — see log'); return; }

      logSuccess(REPORT + ' triggered — waiting for it on Reports Output');
      const saved = await downloadFinishedReport(REPORT, setStatus);
      setStatus(saved ? REPORT + ' downloaded ✓' : REPORT + ' triggered ✓ (download it from Reports Output)');
      logSuccess('=== ' + REPORT + ' complete ===');

    } catch (err) {
      if (err && err.aborted) {
        setStatus(REPORT + ' aborted');
        logWarn('Flow aborted by user');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + (err && err.message ? err.message : err));
    }
  }

  // ───────────────── Employee Lien Detail flow ─────────────────

  // A "Standard" report on ADP's Angular ("adpr") run page: Language / As of
  // date / Company Codes dual-select / Sort by / Group By / Archived
  // Employees / Employees with Payroll History, then a single "Run As PDF"
  // button — this report has no Excel option at all.
  //
  // There is no date RANGE here, only a single "As of date". The daily bot
  // runs it ONCE, as of TODAY — that snapshot is the set of liens currently
  // active on the employer. (The Historical Data Bot additionally pulls a
  // prior-year-end snapshot; that flow is separate and untouched.)
  const LIEN_REPORT = 'Employee Lien Detail';

  function lienTodayDate() {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    return p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + '/' + d.getFullYear();
  }

  function findLienAsOfDateInput() {
    return deepQueryAll('input[name="EmployeeLienDetail-AsOfDate"]').filter(visible)[0] || null;
  }

  async function stepWaitForLienRunPage() {
    for (let i = 0; i < 120; i++) { // up to 60s
      checkAbort();
      if (findLienAsOfDateInput()) { logSuccess('Employee Lien Detail Run page is up'); await sleep(2000); return true; }
      await sleep(500);
    }
    logError('Employee Lien Detail Run page (As of date field) did not load');
    return false;
  }

  // The As of date input is a flatpickr text field bound via Angular ngModel
  // (it commits on blur) — the same prototype-setter + input/change/blur
  // dispatch used for every other framework's date fields in this file.
  async function stepSetLienAsOfDate(value) {
    const input = findLienAsOfDateInput();
    if (!input) { logError('As of date field not found'); return false; }
    setReactInputValue(input, value);
    await sleep(500);
    logSuccess('As of date set to ' + value);
    return true;
  }

  // Company Codes is a required dual-select (Available → Selected) with its own
  // "Move all right" button. Sort by / Group By on the SAME page carry the
  // identical .move-all-right class, so the button is found scoped to the field
  // group whose label reads "Company Codes" (tolerating the required-field "*").
  async function stepSelectAllCompanyCodes() {
    const label = deepQueryAll('*').filter(visible)
      .find(el => el.children.length === 0 && /^Company Codes\s*\*?\s*$/.test((el.textContent || '').trim()));
    if (!label) { logError('"Company Codes" label not found'); return false; }
    let group = label.parentElement, btn = null;
    for (let d = 0; d < 8 && group && !btn; d++) {
      btn = group.querySelector && group.querySelector('button.move-all-right[aria-label="Move all right"]');
      group = group.parentElement;
    }
    if (!btn) { logError('Company Codes "Move all right" button not found'); return false; }
    clickEl(btn);
    await sleep(500);
    logSuccess('Company Codes: moved all available codes to Selected');
    return true;
  }

  async function stepClickLienRunAsPdf() {
    const btn = deepQueryAll('button').filter(visible).find(el => normalize(el.textContent) === 'run as pdf');
    if (!btn) { logError('"Run As PDF" button not found'); return false; }
    clickEl(btn);
    logSuccess('Clicked Run As PDF');
    return true;
  }

  async function downloadEmployeeLienDetail(setStatus) {
    logInfo('=== Download ' + LIEN_REPORT + ' ===');
    resetAbort();

    const asOf = lienTodayDate();
    logInfo('As of date: ' + asOf + ' (today — current active liens)');

    try {
      setStatus('Step 1: Opening Reports menu…');
      checkAbort();
      if (!await stepOpenReportsMenu()) { setStatus('Step 1 failed — see log'); return; }

      setStatus('Step 2: Navigating to All Standard Reports…');
      checkAbort();
      if (!await stepClickAllStandardReports()) { setStatus('Step 2 failed — see log'); return; }

      setStatus('Step 3: Searching for ' + LIEN_REPORT + '…');
      checkAbort();
      if (!await stepSearchDojoReport(LIEN_REPORT)) { setStatus('Step 3 failed — see log'); return; }

      setStatus('Step 4: Selecting ' + LIEN_REPORT + '…');
      checkAbort();
      if (!await stepSelectStandardReportByTitle(LIEN_REPORT)) { setStatus('Step 4 failed — see log'); return; }

      setStatus('Step 5: Waiting for Run Report page…');
      checkAbort();
      if (!await stepWaitForLienRunPage()) { setStatus('Step 5 failed — see log'); return; }

      setStatus('Step 6: Setting As of date to ' + asOf + '…');
      checkAbort();
      if (!await stepSetLienAsOfDate(asOf)) { setStatus('Step 6 failed — see log'); return; }

      setStatus('Step 7: Selecting all Company Codes…');
      checkAbort();
      if (!await stepSelectAllCompanyCodes()) { setStatus('Step 7 failed — see log'); return; }

      setStatus('Step 8: Running report…');
      checkAbort();
      await sleep(800);
      if (!await stepClickLienRunAsPdf()) { setStatus('Step 8 failed — see log'); return; }

      logSuccess(LIEN_REPORT + ' triggered — waiting for it on Reports Output');
      const saved = await downloadFinishedReport(LIEN_REPORT, setStatus, 'pdf');
      setStatus(saved ? LIEN_REPORT + ' downloaded ✓' : LIEN_REPORT + ' triggered ✓ (download it from Reports Output)');
      logSuccess('=== ' + LIEN_REPORT + ' complete ===');

    } catch (err) {
      if (err && err.aborted) {
        setStatus(LIEN_REPORT + ' aborted');
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

      checkAbort();
      if (fieldAlreadyIncluded('Associate ID')) {
        logSuccess('Associate ID is already in Included Fields — skipping the field panel (Steps 6-7)');
      } else {
        setStatus('Step 6: Opening "What\'s Displayed on the Report"…');
        if (!await stepClickWhatsDisplayed()) { setStatus('Step 6 failed — see log'); return; }
        await sleep(1000);

        setStatus('Step 7: Selecting Associate ID…');
        checkAbort();
        let fieldOk = await stepSelectSingleDisplayField('Associate ID');
        if (!fieldOk) {
          // Slow tenant: the first click may have landed before the page was truly
          // wired up. Re-open the panel once and try again.
          logWarn('Retrying: re-opening "What\'s Displayed" and waiting again');
          await sleep(2000);
          if (await stepClickWhatsDisplayed()) {
            await sleep(1000);
            fieldOk = await stepSelectSingleDisplayField('Associate ID');
          }
        }
        if (!fieldOk) { setStatus('Step 7 failed — see log'); return; }
      }

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

      logSuccess('Direct Deposit Report triggered — waiting for it on Reports Output');
      const saved = await downloadFinishedReport('Direct Deposit Report', setStatus);
      setStatus(saved ? 'Direct Deposit Report downloaded ✓' : 'Direct Deposit Report triggered ✓ (download it from Reports Output)');
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
  // Dates are the TRUE calendar quarter boundaries (1st of the quarter → last
  // day of the quarter). An earlier +1-day-on-both-ends convention turned out
  // to be a wrong understanding of ADP's filtering and was removed.
  function buildQuarterInfo(q, year) {
    const startMonth = (q - 1) * 3 + 1; // 1, 4, 7, 10
    const endMonth = q * 3;              // 3, 6, 9, 12

    const fromMM = String(startMonth).padStart(2, '0');
    const from = fromMM + '/01/' + year;

    // Last day of the quarter's final month (new Date(y, m, 0) = last day of month m).
    const lastDay = new Date(year, endMonth, 0).getDate();
    const toMM = String(endMonth).padStart(2, '0');
    const to = toMM + '/' + String(lastDay).padStart(2, '0') + '/' + year;

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

  // Modal: choose the current year's quarters to download. Resolves to
  // { quarters: [...quarter tasks], currentQuarter: n } — or null if the user
  // cancels (or Stop/reset is pressed). Past-year consolidated (FY) downloads
  // were removed from this bot — the ADP Historical Data Bot handles those.
  //  - The first-payroll-quarter selector (default = the calendar quarter)
  //    drives the split: quarters BEFORE it are consolidated (Totals Only),
  //    and the chosen quarter itself is detailed / per pay period.
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

      // ── Quarter section (current year) ──
      const qSection = document.createElement('div');
      body.appendChild(qSection);

      const cqLabel = document.createElement('div');
      cqLabel.style.cssText = 'font-size:11.5px;color:#9fc2ff;margin-bottom:5px;';
      cqLabel.textContent = 'Select the Quarter in which client will run first payroll in UZIO';
      qSection.appendChild(cqLabel);

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
      qSection.appendChild(cqSelect);

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11.5px;color:#9fc2ff;margin-bottom:10px;';
      hint.textContent = 'Untick any quarter to skip it.';
      qSection.appendChild(hint);

      // Rebuildable quarter checkbox list (Q1 … selected current quarter).
      const listWrap = document.createElement('div');
      qSection.appendChild(listWrap);

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
      confirmBtn.addEventListener('click', () => {
        finish({
          quarters: listQuarters.filter((_, i) => checks[i].checked),
          currentQuarter: parseInt(cqSelect.value, 10)
        });
      });
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

  // ── Time Off Balance Summary helpers ──
  // Both are ports of the Historical Data Bot's equivalents (which stay
  // untouched). They are kept separate from stepConfigureAppearance above
  // because that one is Payroll-History-specific: it also flips Group By,
  // Totals Only and Tax ID masking. This report wants ONLY the date range —
  // sorting, masking and grouping are left exactly as ADP had them.

  // Open the field panel's "Select All", then Save.
  async function stepSelectAllDisplayFields() {
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
    logInfo('Field selection panel loaded');
    await sleep(500);

    let clicked = false;
    const selectAllBtn = deepQueryAll('#stdrptlabel_selectAll')[0];
    if (selectAllBtn) {
      clickEl(selectAllBtn);
      logSuccess('Clicked Select All');
      clicked = true;
    } else {
      const alt = deepQueryAll('button, a, [role="button"]').filter(visible)
        .find(el => normalize(el.textContent) === 'select all');
      if (alt) {
        clickEl(alt);
        logSuccess('Clicked Select All (matched by text)');
        clicked = true;
      }
    }
    if (!clicked) {
      logError('Select All button not found on the field panel');
      return false;
    }
    await sleep(1200);

    const buttons = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
    for (const btn of buttons) {
      if (normalize(btn.textContent) === 'save') {
        clickEl(btn);
        logSuccess('Clicked Save — all fields selected');
        await sleep(1200);
        return true;
      }
    }
    logError('Save button not found on field selection panel');
    return false;
  }

  // Appearance variant that ONLY sets the custom date range, then saves.
  async function stepConfigureDateRangeOnly(fromDate, toDate) {
    let ready = false;
    for (let i = 0; i < 24 && !ready; i++) {
      const els = deepQueryAll('label, span, div').filter(visible);
      for (const el of els) {
        const t = (el.textContent || '').trim();
        if (t === 'Request Period' || t === 'Totals Only') { ready = true; break; }
      }
      if (!ready) await sleep(500);
    }
    if (!ready) logWarn('Appearance page marker not seen — continuing anyway');
    await sleep(800);

    // ADP shows a different default here per report, so try each known current
    // value until one of the dropdowns responds.
    logInfo('Setting Request Period to Custom Date Range');
    let periodSet = false;
    for (const current of ['Last 30 Days', 'Last 30', 'Year-to-Date', 'Custom Date', 'Current']) {
      if (await selectVdlDropdownOption(current, 'Custom Date Range')) { periodSet = true; break; }
    }
    if (!periodSet) logError('Could not switch Request Period to Custom Date Range');
    await sleep(1500);

    logInfo('Setting date range: ' + fromDate + ' to ' + toDate);
    const dateInputs = deepQueryAll('input').filter(visible).filter(inp => {
      const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
      return ph.includes('mm/dd/yyyy') || ph.includes('mm/dd');
    });

    if (dateInputs.length >= 2) {
      dateInputs[0].focus();
      await sleep(300);
      setReactInputValue(dateInputs[0], fromDate);
      await sleep(800);
      dateInputs[1].focus();
      await sleep(300);
      setReactInputValue(dateInputs[1], toDate);
      await sleep(800);
      dateInputs[1].blur();
      await sleep(500);
      logInfo('Dates entered: ' + fromDate + ' → ' + toDate);
    } else {
      logError('Expected 2 date inputs, found ' + dateInputs.length);
      return false;
    }
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

  function downloadTaxValidation(setStatus) {
    return runFullFlow({
      type: 'Tax Validation',
      columns: TAX_VALIDATION_COLUMNS,
      title: 'Tax Validation Report',
      unmaskSsn: false,
      setStatus,
    });
  }

  // ───────────────── payroll history: pay-period dates → PriorPayroll filenames ─────────────────
  // Consolidated (Totals Only) quarter/FY files lack Pay Period Begin/End Date
  // and Pay Date, so the downstream Sanity Check tool reads them from the
  // FILENAME: PriorPayroll_<begin>_<end>_<paydate>.xlsx (all MMDDYYYY).
  //   Begin   = period start of the FIRST pay period in the task's range
  //   End/Pay = period end + pay date of the LAST pay period in the range
  //   (a pay period belongs to a task iff its PAY DATE falls in the range)
  // Source: Process → Payroll Dashboard → Payroll Schedule (ag-grid list gives
  // Pay Date + End Date per row; Period Start comes from the row's "Payroll
  // Dates" side panel, read once per task). Detailed (current-quarter) reports
  // already contain the three columns → they keep ADP's default filename.

  const PH_SCHEDULE_HASH = '#/Process/ProcessTabPayrollCategoryPayrollCycle';

  // Run Date-Time signatures of report rows already downloaded THIS run, so a
  // multi-file run never re-downloads the previous task's (still-topmost, just-
  // completed) row while the new report is still rendering. Reset per flow.
  let phDownloadedSigs = new Set();

  // The Run Date-Time text of the row nearest `top` (e.g. "07/16/2026 - 03:45
  // AM"), used to tell one report row from another. '' if none is visible.
  function phRowSignatureNear(top) {
    for (const el of deepQueryAll('*')) {
      if (!visible(el) || el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (t.length < 40 &&
        /\d{2}\/\d{2}\/\d{4}\s*[-–]\s*\d{1,2}:\d{2}\s*(AM|PM)/i.test(t) &&
        Math.abs(el.getBoundingClientRect().top - top) < 30) {
        return t;
      }
    }
    return '';
  }

  function phDate(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || '').trim());
    return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
  }
  function phCompact(s) { return (s || '').replace(/\//g, ''); }

  // Real calendar bounds of a task (same boundaries the report dates now use).
  function phTaskRange(task, calendarYear) {
    if (task.fullYear) return { s: new Date(task.year, 0, 1), e: new Date(task.year, 11, 31) };
    const q = task.quarter;
    return { s: new Date(calendarYear, (q - 1) * 3, 1), e: new Date(calendarYear, q * 3, 0) };
  }

  // Navigate the admin SPA to the Payroll Schedule page and wait for the grid.
  // The Process route lands on the Payroll Dashboard first — the schedule grid
  // only appears after clicking the "Payroll Schedule" smart-link (an
  // <sdf-button id="smart-link-PSCHEDULE"> Stencil component in shadow DOM,
  // which deepQueryAll pierces).
  async function phOpenSchedulePage() {
    logInfo('Opening Payroll Schedule page…');
    location.hash = PH_SCHEDULE_HASH;
    let clickedLink = false;
    for (let i = 0; i < 120; i++) { // up to 60s
      checkAbort();
      if (deepQueryAll('.ag-header-cell[col-id], [role="columnheader"][col-id]').length) {
        await sleep(2000); // let rows render after the header appears
        return true;
      }
      if (!clickedLink) {
        const link = deepQueryAll('#smart-link-PSCHEDULE').filter(visible)[0]
          || deepQueryAll('sdf-button[aria-label="Payroll Schedule"]').filter(visible)[0];
        if (link) {
          logInfo('Clicking the "Payroll Schedule" link on the Payroll Dashboard');
          clickEl(link);
          clickedLink = true;
          await sleep(1500); // let the schedule view start loading
          continue;
        }
      }
      await sleep(500);
    }
    return false;
  }

  // Pick a year in the Payroll Schedule "Year" dropdown (native select expected).
  async function phSelectYear(year) {
    const sel = deepQueryAll('select').filter(visible).find(s =>
      Array.from(s.options || []).some(o => /^\d{4}$/.test((o.textContent || '').trim())));
    if (!sel) return false;
    const opt = Array.from(sel.options).find(o => (o.textContent || '').trim() === String(year));
    if (!opt) return false;
    if (sel.value !== opt.value) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(3000); // grid reloads for the new year
    }
    return true;
  }

  // Map the grid's header names → col-ids, then read the visible rows.
  function phCollectVisibleRows() {
    const headers = deepQueryAll('.ag-header-cell[col-id], [role="columnheader"][col-id]');
    const col = {};
    for (const h of headers) {
      const t = (h.textContent || '').trim().toLowerCase();
      const id = h.getAttribute('col-id');
      // Exact match first — the grid also has a "Holiday Pay Date" column
      // (usually empty) that a substring match would wrongly grab.
      if (!col.pay && t === 'pay date') col.pay = id;
      if (!col.end && t === 'end date') col.end = id;
    }
    for (const h of headers) { // lenient fallback, still excluding Holiday
      const t = (h.textContent || '').trim().toLowerCase();
      const id = h.getAttribute('col-id');
      if (!col.pay && t.includes('pay date') && !t.includes('holiday')) col.pay = id;
      if (!col.end && t.includes('end date')) col.end = id;
    }
    if (!col.pay || !col.end) return null;
    const out = [];
    for (const r of deepQueryAll('.ag-row')) {
      const get = (cid) => { const c = r.querySelector('[col-id="' + cid + '"]'); return c ? (c.textContent || '').trim() : ''; };
      const pay = get(col.pay), end = get(col.end);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(pay)) out.push({ pay, end });
    }
    return out;
  }

  // Total row count from the grid's paging summary ("1 to 20 of 27" → 27).
  function phGridTotalRows() {
    for (const el of deepQueryAll('*')) {
      const t = (el.textContent || '').trim();
      if (t.length < 40 && visible(el)) {
        const m = /^\d+\s+to\s+\d+\s+of\s+(\d+)$/.exec(t);
        if (m) return parseInt(m[1], 10);
      }
    }
    return 0;
  }

  // Best effort: bump the paging "Page Size" dropdown to its largest option so
  // one page holds every pay period. Returns true if it changed anything.
  async function phTrySetMaxPageSize() {
    const sel = deepQueryAll('select').filter(visible).find(s =>
      Array.from(s.options || []).some(o => /^(50|100|200|500)$/.test((o.textContent || '').trim())));
    if (!sel) return false;
    let best = null;
    for (const o of sel.options) {
      const n = parseInt((o.textContent || '').trim(), 10);
      if (Number.isFinite(n) && (!best || n > parseInt(best.textContent, 10))) best = o;
    }
    if (!best || sel.value === best.value) return false;
    logInfo('Setting Payroll Schedule page size to ' + (best.textContent || '').trim());
    sel.value = best.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(2500);
    return true;
  }

  // Click the paging "next page" control. Returns false when missing/disabled.
  function phClickNextPage() {
    const icon = deepQueryAll('.ag-icon-next, [aria-label="Next Page"], [ref="btNext"]').filter(visible)[0];
    if (!icon) return false;
    const host = icon.closest('[role="button"], .ag-paging-button') || icon;
    const state = (host.className || '') + ' ' + (host.getAttribute('aria-disabled') || '');
    if (/disabled|true/i.test(state)) return false;
    clickEl(host);
    return true;
  }
  function phClickFirstPage() {
    const icon = deepQueryAll('.ag-icon-first, [aria-label="First Page"], [ref="btFirst"]').filter(visible)[0];
    if (!icon) return false;
    clickEl(icon.closest('[role="button"], .ag-paging-button') || icon);
    return true;
  }

  // Sweep the current page's (virtualized) viewport, grabbing at every stop.
  async function phSweepGrid(grab) {
    const vp = deepQueryAll('.ag-body-viewport').filter(visible)[0];
    grab();
    if (!vp) return;
    const step = Math.max(80, Math.floor(vp.clientHeight * 0.5));
    vp.scrollTop = 0;
    await sleep(450);
    grab();
    for (let pos = step, i = 0; i < 80; pos += step, i++) {
      checkAbort();
      const max = Math.max(0, vp.scrollHeight - vp.clientHeight);
      vp.scrollTop = Math.min(pos, max);
      await sleep(450);
      grab();
      if (pos >= max) break; // bottom reached (and grabbed)
    }
    vp.scrollTop = 0; await sleep(300); grab();
  }

  // Collect every pay period of the year. The grid is PAGINATED (e.g.
  // "1 to 20 of 27", Page 1 of 2) — first try raising the page size, then walk
  // the remaining pages until the collected count reaches the "of N" total.
  async function phScrapeYearRows() {
    const seen = new Map();
    const grab = () => { const rows = phCollectVisibleRows(); if (rows) for (const r of rows) seen.set(r.pay + '|' + r.end, r); };
    // The grid renders its headers before the data rows arrive — wait (up to
    // ~15s) for the first date-bearing row.
    for (let i = 0; i < 30; i++) {
      grab();
      if (seen.size) break;
      checkAbort();
      await sleep(500);
    }
    await phTrySetMaxPageSize(); // one page for everything, when possible
    // GOTCHA: the grid can open on the page holding TODAY's pay period (a
    // weekly client in July starts on page 2 of 3), and the walk below only
    // pages FORWARD — start from page 1 or the earlier pages are never seen.
    if (phClickFirstPage()) await sleep(1200);
    const phWalkPages = async () => {
      for (let page = 0; page < 12; page++) {
        checkAbort();
        const total = phGridTotalRows();
        if (total && seen.size >= total) break;
        if (!phClickNextPage()) break;
        await sleep(1200);
        await phSweepGrid(grab);
      }
    };
    await phSweepGrid(grab);
    await phWalkPages(); // weekly clients can have 3+ pages
    let total = phGridTotalRows();
    if (total && seen.size < total) { // safety net: one more pass from page 1
      logInfo('Re-walking the schedule from page 1 (' + seen.size + ' of ' + total + ' so far)');
      if (phClickFirstPage()) await sleep(1200);
      await phSweepGrid(grab);
      await phWalkPages();
      total = phGridTotalRows();
    }
    if (total && seen.size < total) {
      logWarn('Payroll Schedule: collected ' + seen.size + ' of ' + total + ' rows — some pages may be missing');
    }
    phClickFirstPage(); // leave the grid on page 1 for the Period-Start click
    await sleep(800);
    return Array.from(seen.values()).filter(r => phDate(r.pay))
      .sort((a, b) => phDate(a.pay) - phDate(b.pay));
  }

  // Read a single-date value sitting under a side-panel label (e.g. "Period
  // Start Date" → 12/14/2025). The label's near ancestors hold only its value.
  function phPanelValue(labelText) {
    const labels = deepQueryAll('*').filter(el =>
      visible(el) && el.children.length === 0 && (el.textContent || '').trim() === labelText);
    for (const lb of labels) {
      let p = lb.parentElement;
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        const dates = ((p.innerText || '').match(/\d{2}\/\d{2}\/\d{4}/g)) || [];
        if (dates.length === 1) return dates[0];
        if (dates.length > 1) break; // walked too far — ambiguous container
      }
    }
    return '';
  }

  // Click the schedule row with the given Pay Date and read its Period Start
  // Date from the "Payroll Dates" panel. Scrolls the grid to find the row.
  async function phReadPeriodStartFor(payDate) {
    // The target row can sit on ANY page (a Q2 task's first pay period lands
    // mid-year), so sweep the current page top-to-bottom and page forward
    // until the Pay Date cell is found.
    phClickFirstPage();
    await sleep(800);
    for (let page = 0; page < 12; page++) {
      checkAbort();
      const vp = deepQueryAll('.ag-body-viewport').filter(visible)[0];
      if (vp) { vp.scrollTop = 0; await sleep(350); }
      for (let i = 0; i < 25; i++) {
        checkAbort();
        const cell = deepQueryAll('.ag-row [col-id]').filter(visible)
          .find(c => (c.textContent || '').trim() === payDate);
        if (cell) {
          clickEl(cell.closest('.ag-row') || cell);
          // Wait for the panel to show THIS row (its Pay Date matches).
          for (let j = 0; j < 16; j++) {
            await sleep(500);
            if (phPanelValue('Pay Date') === payDate) {
              const start = phPanelValue('Period Start Date');
              if (start) return start;
            }
          }
          return '';
        }
        if (!vp) break;
        const max = Math.max(0, vp.scrollHeight - vp.clientHeight);
        if (vp.scrollTop >= max) break; // bottom of this page — try the next
        vp.scrollTop = vp.scrollTop + Math.max(100, vp.clientHeight * 0.8);
        await sleep(350);
      }
      if (!phClickNextPage()) break;
      await sleep(1200);
    }
    return '';
  }

  // For every consolidated task, compute the three dates and stash the target
  // filename on the task (task.phFileName). Missing data → warn + default name.
  async function phCaptureScheduleDates(tasks, calendarYear) {
    if (!await phOpenSchedulePage()) {
      logWarn('Payroll Schedule page did not load — files keep ADP default names');
      return;
    }
    const byYear = new Map();
    for (const t of tasks) {
      const y = t.fullYear ? t.year : calendarYear;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(t);
    }
    for (const [y, list] of Array.from(byYear.entries()).sort((a, b) => a[0] - b[0])) {
      checkAbort();
      const picked = await phSelectYear(y);
      if (!picked && y !== calendarYear) {
        logWarn('Year ' + y + ' not selectable on Payroll Schedule — default names for that year');
        continue;
      }
      const rows = await phScrapeYearRows();
      logInfo('Payroll Schedule ' + y + ': ' + rows.length + ' pay period(s) scraped');
      for (const t of list) {
        checkAbort();
        const range = phTaskRange(t, calendarYear);
        const inRange = rows.filter(r => { const d = phDate(r.pay); return d && d >= range.s && d <= range.e; });
        if (!inRange.length) { logWarn('No pay periods with a pay date inside ' + t.label + ' — default name'); continue; }
        const first = inRange[0], last = inRange[inRange.length - 1];
        const begin = await phReadPeriodStartFor(first.pay);
        if (!begin) { logWarn('Could not read Period Start Date for ' + t.label + ' — default name'); continue; }
        // Client prefix here too, so Payroll History files sit alongside the
        // other reports' <Client>_… names instead of being the odd one out.
        const phClient = detectClientName();
        t.phFileName = (phClient ? safeFileName(phClient) + '_' : '') +
          'PriorPayroll_' + phCompact(begin) + '_' + phCompact(last.end) + '_' + phCompact(last.pay) + '.xlsx';
        logSuccess(t.label + ' → ' + t.phFileName);
      }
    }
  }

  // Arm URL-capture hooks on a window (the Reports area lives in an iframe, so
  // hooks must go on the ANCHOR'S OWN window, not just the top one). window.open
  // is also suppressed — we fetch the file ourselves instead of letting ADP pop
  // a tab (which pop-up blockers eat anyway).
  function phArmSniffer(win) {
    const st = { urls: [], forms: [] };
    const looks = (u) => typeof u === 'string' && u && u !== '#!' && !/#!$/.test(u) && !/^(javascript:|about:blank$)/i.test(u);
    const push = (u) => { try { if (looks(u) && st.urls.indexOf(String(u)) < 0) st.urls.push(String(u)); } catch (_) { } };
    const oOpen = win.open;
    const oFetch = win.fetch;
    const XP = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    const oXo = XP && XP.open;
    const FP = win.HTMLFormElement && win.HTMLFormElement.prototype;
    const oSub = FP && FP.submit;
    // window.open: capture the URL AND hand back a fake window, because ADP
    // often opens a launcher page first and only then assigns the real file
    // URL to the popup's location (or writes a form into it). The fake window
    // records location assignments instead of opening a tab.
    win.open = function (u) {
      push(u);
      const fake = {
        closed: false, opener: win,
        focus() { }, blur() { }, close() { this.closed = true; },
        addEventListener() { }, removeEventListener() { }, postMessage() { },
        document: { write() { }, writeln() { }, open() { }, close() { }, addEventListener() { } },
      };
      try {
        Object.defineProperty(fake, 'location', {
          configurable: true,
          get() { return { get href() { return ''; }, set href(v) { push(v); }, assign: push, replace: push }; },
          set(v) { push(v); },
        });
      } catch (_) { }
      return fake;
    };
    if (oFetch) win.fetch = function (u) { const s = typeof u === 'string' ? u : (u && u.url) || ''; if (/xls|export|download|external|output|instanceRefId/i.test(s)) push(s); return oFetch.apply(this, arguments); };
    if (oXo) XP.open = function (m, u) { if (/xls|export|download|external|output|instanceRefId/i.test(String(u))) push(String(u)); return oXo.apply(this, arguments); };
    // form.submit: ADP may POST a form targeting the popup instead of using
    // the window handle. Record action + fields so the request can be replayed
    // with fetch() if URL capture alone doesn't yield the file.
    if (oSub) FP.submit = function () {
      try {
        const action = this.getAttribute('action') || this.action || '';
        const fields = [];
        for (const el of this.elements || []) {
          if (el.name) fields.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(el.value || ''));
        }
        st.forms.push({ action: String(action), method: String(this.method || 'get'), query: fields.join('&') });
        if (action) push(String(action));
      } catch (_) { }
      return oSub.apply(this, arguments);
    };
    st.restore = () => { try { win.open = oOpen; if (oFetch) win.fetch = oFetch; if (oXo) XP.open = oXo; if (oSub) FP.submit = oSub; } catch (_) { } };
    return st;
  }

  // After Run as Excel: wait for the report row to complete on Reports Output,
  // open its ⋯ menu, click "View as XLS", capture the real file URL from the
  // iframe's window, fetch it with session cookies, and save it — under the
  // computed PriorPayroll_* name when task.phFileName is set (consolidated
  // tasks), else under ADP's own default filename (per-pay-period tasks).
  // Any failure falls back to ADP's native behavior.
  async function phDownloadRenamed(task, setStatus) {
    setStatus('Waiting for ' + task.label + ' to finish generating…');
    // The report we just ran is the NEWEST row → topmost on Reports Output
    // (sorted by Run Date desc). Wait until THAT specific row shows "Completed".
    // Older completed rows from previous runs sit below it and must be ignored,
    // or we'd click the wrong (or a still-processing) row's menu.
    const completedNear = (top) => deepQueryAll('*').filter(visible).some(el =>
      (el.textContent || '').trim() === 'Completed' &&
      Math.abs(el.getBoundingClientRect().top - top) < 30);
    let trigger = null, topSig = '';
    let loggedProc = false, loggedPrev = false;
    for (let i = 0; i < 400 && !trigger; i++) { // up to ~10 min
      checkAbort();
      const trigs = deepQueryAll('.fa-ellipsis-h').filter(visible)
        .map(t => t.closest('[role="button"], .revitButton') || t.parentElement || t)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (trigs.length) {
        const topEl = trigs[0];
        const top = topEl.getBoundingClientRect().top;
        const sig = phRowSignatureNear(top);
        // Ignore the PREVIOUS task's row: on a multi-file run it can still be
        // topmost (and already Completed) for a moment before the new report's
        // row renders. Only accept a row we haven't downloaded this run.
        if (sig && phDownloadedSigs.has(sig)) {
          if (!loggedPrev) { logInfo('Previous report still topmost — waiting for the new row…'); loggedPrev = true; }
        } else if (completedNear(top)) {
          trigger = topEl; topSig = sig; // a NEW row that is Completed
          break;
        } else if (!loggedProc) {
          logInfo('Newest report row is still processing — waiting for Completed…');
          loggedProc = true;
        }
      }
      await sleep(1500);
    }
    if (!trigger) throw new Error('report row did not reach Completed in time');
    // Mark this row done now (whatever the download outcome), so the NEXT task
    // waits for a genuinely new row instead of re-grabbing this one.
    if (topSig) phDownloadedSigs.add(topSig);
    logInfo('Newest report row is Completed — opening its options menu');

    setStatus('Downloading ' + task.label + (task.phFileName ? ' as ' + task.phFileName : ' (ADP default name)') + '…');
    // The ⋯ options button is a Dojo DROPDOWN widget — it opens on MOUSEDOWN,
    // which a plain .click() never fires. Dispatch the full pointer/mouse
    // sequence (pointerdown → mousedown → pointerup → mouseup → click) on the
    // widget host, plus dijitclick for good measure.
    const phMouseSeq = (el) => {
      let cx = 0, cy = 0;
      try {
        const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      } catch (_) { }
      const base = { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView || window, button: 0, clientX: cx, clientY: cy };
      const PE = (el.ownerDocument.defaultView || window).PointerEvent || MouseEvent;
      const fire = (Ctor, type, extra) => { try { el.dispatchEvent(new Ctor(type, Object.assign({}, base, extra || {}))); } catch (_) { } };
      fire(PE, 'pointerover', { pointerId: 1, isPrimary: true });
      fire(MouseEvent, 'mouseover');
      fire(PE, 'pointerdown', { pointerId: 1, isPrimary: true });
      fire(MouseEvent, 'mousedown');
      fire(PE, 'pointerup', { pointerId: 1, isPrimary: true });
      fire(MouseEvent, 'mouseup');
      fire(MouseEvent, 'click');
    };
    const phClickRevit = (el) => {
      const host = el.closest('[role="button"], .revitButton') || el;
      try { host.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) { }
      phMouseSeq(host);
      try { host.dispatchEvent(new Event('dijitclick', { bubbles: true, cancelable: true })); } catch (_) { }
    };
    // The grid re-renders when the row flips to Completed, which can leave the
    // ⋯ node we captured DETACHED from the DOM — events dispatched on a
    // detached node go nowhere, so the menu "never opens". Re-locate the
    // trigger fresh (same row, matched by signature) whenever ours is stale.
    const phFreshTrigger = () => {
      const trigs = deepQueryAll('.fa-ellipsis-h').filter(visible)
        .map(t => t.closest('[role="button"], .revitButton') || t.parentElement || t)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (!trigs.length) return null;
      if (topSig) {
        const same = trigs.find(t => phRowSignatureNear(t.getBoundingClientRect().top) === topSig);
        if (same) return same;
      }
      return trigs[0];
    };
    const phClickTrigger = () => {
      if (!trigger.isConnected) {
        const fresh = phFreshTrigger();
        if (fresh) { logInfo('⋯ button was re-rendered by a grid refresh — re-located it'); trigger = fresh; }
        else logWarn('⋯ button is detached and no replacement was found');
      }
      phClickRevit(trigger);
    };
    phClickTrigger();
    await sleep(800);
    // Find the "View as …" item in the opened menu — by its stable pendo id
    // first, then by text. If the menu didn't open, re-click and retry.
    const findXlsAnchor = () => {
      const pendo = deepQueryAll('[data-pendo-id="PENDO_ADPR_DATAGRID_VIEW_EXTERNAL"]').filter(visible)[0];
      if (pendo) return pendo;
      const combined = deepQueryAll('a, [role="menuitem"], td, div').filter(visible)
        .find(el => {
          const t = (el.textContent || '').trim();
          return t.length < 30 && /view as xls|view as excel|^download$/i.test(t);
        });
      if (combined) return combined;
      // PDF-only reports (Employee Lien Detail) render a "View as" HEADER with
      // separate short items under it — "PDF" / "Query" — instead of one
      // combined "View as PDF" row. Find the header, then the nearest item
      // beneath it whose whole text is just the format name.
      const header = deepQueryAll('*').filter(visible)
        .find(el => el.children.length === 0 && (el.textContent || '').trim().toLowerCase() === 'view as');
      if (header) {
        let container = header.parentElement;
        for (let d = 0; d < 4 && container; d++) {
          const item = Array.from(container.querySelectorAll('a, [role="menuitem"], li, div, button'))
            .filter(visible)
            .find(el => /^(pdf|xls|excel|csv)$/i.test((el.textContent || '').trim()));
          if (item) return item;
          container = container.parentElement;
        }
      }
      return null;
    };
    let anchor = null;
    for (let i = 0; i < 24 && !anchor; i++) {
      anchor = findXlsAnchor();
      if (!anchor) {
        if (i > 0 && i % 8 === 0) { // menu didn't open — try the trigger again
          logInfo('Options menu not open yet — re-clicking the ⋯ button');
          phClickTrigger();
        }
        await sleep(500);
      }
    }
    if (!anchor) throw new Error('"View as" menu item (XLS/Excel/PDF) not found (trigger still in DOM: ' + trigger.isConnected + ')');

    const win = (anchor.ownerDocument && anchor.ownerDocument.defaultView) || window;
    const sn1 = phArmSniffer(win);
    const sn2 = (win === window) ? null : phArmSniffer(window);
    const baseHref = anchor.ownerDocument.baseURI;
    // The real spreadsheet lives at …/downloadTemplate/?instanceRefId=BIRT…;
    // the first thing ADP opens is usually a launcher/viewer page
    // (auditOutput.do). Prefer a URL that looks like the file itself.
    // Two known file-URL shapes (varies by client/backend):
    //   /wfn/chr/reporting/downloadTemplate/?instanceRefId=BIRT<id>_PROD_DCn
    //   /mascsr/wfn/ireporting/metaservices/reportviewer/download/BIRT<id>_PROD_DCn
    // (same matcher the ADP Historical bot uses since its v1.15.0)
    const phIsFileUrl = (u) => /downloadTemplate|instanceRefId|downloadreport|reportviewer\/download|\/BIRT\d|referenceId=|\.(xlsx?|csv)(\?|$)/i.test(u);
    const capturedUrls = () => sn1.urls.concat(sn2 ? sn2.urls : []);
    const capturedForms = () => sn1.forms.concat(sn2 ? sn2.forms : []);
    let url = '';
    try {
      clickEl(anchor);
      try { anchor.dispatchEvent(new Event('dijitclick', { bubbles: true, cancelable: true })); } catch (_) { }
      for (let i = 0; i < 40; i++) { // up to 12s for the handler to fire
        const arr = capturedUrls();
        const good = arr.find(phIsFileUrl);
        if (good) { url = good; break; }
        if (!url) url = arr[0] || '';
        if (url && i >= 20) break; // give the real file URL ~6s to appear, then work with the viewer
        checkAbort();
        await sleep(300);
      }
    } finally {
      sn1.restore();
      if (sn2) sn2.restore();
    }
    if (!url) {
      logWarn(task.label + ': could not capture the file URL — the file keeps ADP\'s default name');
      return false;
    }
    const abs = new URL(url, baseHref).href;
    logInfo('Captured report file URL: ' + abs);

    const isHtml = (r) => /text\/html/i.test((r && r.headers.get('content-type')) || '');
    const phFetchBlob = async (u, opts) => {
      const r = await fetch(u, Object.assign({ credentials: 'include' }, opts || {}));
      if (!r.ok) { logWarn('Fetch failed (HTTP ' + r.status + ') for ' + u); return null; }
      return { resp: r, blob: await r.blob() };
    };
    let got = await phFetchBlob(abs);
    if (!got || !got.blob.size) throw new Error('file download returned an empty body');
    let viewerHtml = '';
    if (isHtml(got.resp)) {
      // Not the spreadsheet yet. Known causes: we fetched the launcher page
      // itself; the server wants the auditOutput.do launcher loaded in-session
      // BEFORE serving the file; or the file simply isn't servable yet.
      try { viewerHtml = await got.blob.text(); } catch (_) { }
      logInfo(task.label + ': captured URL is a viewer page — mining it for the real file URL');
      // Prime the session the way the real popup does: load the launcher
      // before (re-)requesting the file.
      const launcher = capturedUrls().map(u => { try { return new URL(u, baseHref).href; } catch (_) { return ''; } })
        .find(u => u && /auditOutput\.do/i.test(u) && u !== abs);
      if (launcher) { try { await fetch(launcher, { credentials: 'include' }); } catch (_) { } }
      // Mine an HTML page for wherever the file actually is: an explicit
      // downloadTemplate link, a BIRT… instanceRefId, or a redirect stub
      // (meta refresh / location assignment).
      const phMineHtml = (html, base) => {
        const mRv = html.match(/[\w\/.:-]*reportviewer\/download\/[\w.-]+/i);
        if (mRv) { try { return new URL(mRv[0], base).href; } catch (_) { } }
        const mLink = html.match(/[\w\/.:-]*downloadTemplate\/?\?[^"'<>\s\\]+/i);
        if (mLink) { try { return new URL(mLink[0].replace(/&amp;/g, '&'), base).href; } catch (_) { } }
        const mId = html.match(/instanceRefId['"=:\s]+["']?([\w.-]+)/i) || html.match(/\b(BIRT[\w.-]+)\b/);
        if (mId) { try { return new URL('/wfn/chr/reporting/downloadTemplate/?instanceRefId=' + encodeURIComponent(mId[1]), base).href; } catch (_) { } }
        const mRedir = html.match(/http-equiv=["']?refresh["'][^>]*url=([^"'>\s]+)/i)
          || html.match(/location(?:\.href)?\s*=\s*["']([^"']+)["']/i)
          || html.match(/location\.replace\(\s*["']([^"']+)/i);
        if (mRedir) { try { return new URL(mRedir[1].replace(/&amp;/g, '&'), base).href; } catch (_) { } }
        return '';
      };
      // Follow whatever each HTML response points at; when it points nowhere
      // new, wait and re-request the same URL (report file may need a moment).
      let cur = abs;
      for (let att = 0; att < 6 && isHtml(got.resp); att++) {
        checkAbort();
        const next = phMineHtml(viewerHtml, cur);
        if (next && next !== cur) { logInfo('Viewer page references: ' + next); cur = next; }
        else await sleep(2500);
        const r = await phFetchBlob(cur, launcher ? { referrer: launcher } : null);
        if (r && r.blob.size) {
          got = r;
          if (isHtml(r.resp)) { try { viewerHtml = await r.blob.text(); } catch (_) { } }
        }
      }
      // Still no spreadsheet? Replay any form submissions ADP made toward the
      // popup (POST forms carry their params outside the URL).
      if (!got || !got.blob.size || isHtml(got.resp)) {
        for (const f of capturedForms()) {
          checkAbort();
          try {
            const action = new URL(f.action || '', baseHref).href;
            const post = /post/i.test(f.method);
            const u = post ? action : action + (f.query ? (action.indexOf('?') >= 0 ? '&' : '?') + f.query : '');
            logInfo('Replaying captured ' + f.method.toUpperCase() + ' form: ' + action);
            const r = await phFetchBlob(u, post ? { method: 'POST', body: f.query, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : null);
            if (r && r.blob.size && !isHtml(r.resp)) { got = r; break; }
          } catch (_) { }
        }
      }
    }
    if (!got || !got.blob.size || isHtml(got.resp)) {
      // ADP's concurrent-session guard: the file server refuses downloads when
      // the account is also logged in elsewhere (e.g. normal Chrome + incognito
      // at once). No retry can fix this — the user must close the other session.
      if (/logged in to ADP Workforce Now in another browser|another browser/i.test(viewerHtml)) {
        logError(task.label + ': ADP refused the download — this account is logged in to ADP in ANOTHER browser/profile. Close the other ADP session (or log out there), then re-run.');
        return false;
      }
      // Everything above failed — log evidence for diagnosis, then fall back
      // to ADP's own behavior (viewer tab, default filename).
      logWarn(task.label + ': could not reach the real file — opening the viewer normally (default name)');
      logInfo('Diagnostics — URLs: ' + JSON.stringify(capturedUrls()) +
        ' | forms: ' + JSON.stringify(capturedForms().map(f => f.method + ' ' + f.action)) +
        ' | viewer HTML (' + viewerHtml.length + ' chars) mentions instanceRefId=' + /instanceRefId/i.test(viewerHtml) +
        ' BIRT=' + /BIRT/.test(viewerHtml) + ' downloadTemplate=' + /downloadTemplate/i.test(viewerHtml) +
        ' | body: ' + JSON.stringify(viewerHtml.slice(0, 300)));
      try { window.open(abs); } catch (_) { }
      return false;
    }
    const blob = got.blob;
    // Per-pay-period tasks have no computed name — keep ADP's own filename:
    // Content-Disposition first, then the URL's basename, then a label-based
    // fallback so the download never silently vanishes.
    let fname = task.phFileName;
    if (!fname) {
      const cd = got.resp.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i);
      if (m) { try { fname = decodeURIComponent(m[1].trim()); } catch (_) { fname = m[1].trim(); } }
      if (!fname) {
        const pathName = (got.resp.url || '').split('?')[0].split('/').pop() || '';
        if (/\.(xlsx?|csv)$/i.test(pathName)) fname = pathName;
      }
      if (!fname) fname = 'PayrollHistory_' + task.label.replace(/\s+/g, '_') + '.xlsx';
    }
    const bu = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = bu;
    a.download = fname;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(bu); } catch (_) { } }, 15000);
    logSuccess('Saved ' + fname + ' (' + blob.size + ' bytes)');
    return true;
  }

  function safeFileName(name) {
    return String(name || '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // Client name for file prefixes, read from ADP's persistent top bar
  // (same detection as the Historical Data bot).
  // Any hyphenated phrase satisfies a bare company-code chip pattern, so plain
  // page text was liable to be read as the client: "Year-to-Date" (the
  // Appearance request-period dropdown) parses as code "Year" + name "to-Date"
  // and would prefix files with to_Date_. The Historical bot hit exactly this
  // and named files after its own "Prior-year extracts" panel subtitle. Two
  // defences, either of which alone fixes it:
  //   1. never read the bot's own UI (panel + its dialogs)
  //   2. require a digit in the code — ADP company codes have one (0MJ, 0PY79)
  const CHIP_RE = /^([A-Za-z0-9.]{2,6})\s*-\s*([A-Za-z].*)$/;
  const OWN_UI_SEL = '#adp-bot-panel, #adp-quarter-pick, #adp-downloadall-pick';

  function parseCompanyChip(text) {
    const m = (text || '').match(CHIP_RE);
    if (!m) return '';
    if (!/[0-9]/.test(m[1])) return ''; // "Year-to-Date", "Non-Exempt" — not a code
    return m[2].trim();
  }

  // ADP's masthead carries the employer on EVERY page — crucially including
  // Reports Output, which is where this bot builds the file name (it looks for
  // the client AFTER Run as Excel has already navigated away from the report
  // page). The company-code chips the other strategies rely on do not exist
  // there, which is why Direct Deposit and friends downloaded with no prefix.
  //
  //   <sfc-shell-app-bar …>InnovDel Inc<wfn-shell-app-bar-search>…
  //
  // The name is a DIRECT TEXT NODE of the app bar (slotted into .branding-area
  // inside the component's shadow DOM), so read only the element's own text
  // nodes: .textContent would drag in every icon label after it — Things to
  // Do, Calendar, Learn, Bridge, Support, Marketplace, Chat.
  function clientFromAppBar() {
    for (const bar of deepQueryAll('sfc-shell-app-bar')) {
      const own = Array.from(bar.childNodes || [])
        .filter(n => n.nodeType === 3) // text nodes only
        .map(n => (n.textContent || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (own.length >= 2 && own.length <= 60) return own;
    }
    return '';
  }

  function detectClientName() {
    // 0) The app bar — present on every page, including Reports Output.
    const fromBar = clientFromAppBar();
    if (fromBar) return fromBar;

    const texts = deepQueryAll('div, span, li, h1, h2, b')
      .filter(visible)
      .filter(el => !(el.closest && el.closest(OWN_UI_SEL)))
      .map(el => (el.textContent || '').trim())
      .filter(t => t && t.length >= 4 && t.length < 60);
    // 1) "0MJ - Flash Hub Delivery" style company-code chips (any case).
    for (const t of texts) {
      if (/no company/i.test(t) || /^https?:/i.test(t)) continue;
      const name = parseCompanyChip(t);
      if (name) return name;
    }
    // 2) Top-bar brand: "ADP | <client>".
    const brand = texts.find(t => /^ADP\s*\|\s*\S/.test(t));
    if (brand) return brand.replace(/^ADP\s*\|\s*/, '').trim();
    return '';
  }

  // End-of-run download for the single-report flows (Deduction / Direct
  // Deposit / Qualified Overtime). After Run as Excel, ADP redirects to
  // Reports Output on its own — wait for the new row to complete there and
  // save it as <Client>_<Report>.xlsx (no prefix when the client chip can't
  // be found). On any failure the file stays on Reports Output for a manual
  // fetch; the flow itself still counts as triggered.
  // `ext` defaults to xlsx — pass 'pdf' for the reports ADP only offers as PDF
  // (Employee Lien Detail), otherwise the saved file gets the wrong extension
  // and Windows opens it with the wrong app.
  async function downloadFinishedReport(reportLabel, setStatus, ext) {
    await sleep(5000); // let ADP land on Reports Output and render the new row
    phDownloadedSigs = new Set();
    const client = detectClientName();
    if (client) logInfo('Client detected: ' + client);
    else logWarn('Client name not detected — file name will have no client prefix');
    const fname = (client ? safeFileName(client) + '_' : '') + safeFileName(reportLabel) + '.' + (ext || 'xlsx');
    try {
      return await phDownloadRenamed({ label: reportLabel, phFileName: fname }, setStatus);
    } catch (err) {
      if (err && err.aborted) throw err;
      logWarn('Download failed for ' + reportLabel + ' — fetch it from Reports Output manually (' +
        ((err && err.message) || err) + ')');
      return false;
    }
  }

  // Payroll History uses a different flow: Standard Reports → search → select,
  // instead of Custom Reports → Create new → Select Fields. So it has its own
  // flow function rather than going through runFullFlow.
  async function downloadPayrollHistory(setStatus) {
    logInfo('=== Download Payroll History ===');
    resetAbort();
    phDownloadedSigs = new Set(); // fresh per run (multi-file de-dup by row)

    // Payroll History runs against ADP's Dojo-heavy Standard Reports pages,
    // which are slow to wire up their widgets. PH_PAD is an extra settle pause
    // inserted before the click-heavy steps in THIS flow only, to avoid the
    // "DOJO not found" failures that force a re-run. Abort-aware (uses sleep).
    const PH_PAD = 2000;

    try {
      // Ask which years + quarters to download BEFORE any navigation. Past
      // years arrive as one consolidated FY task each (quarter 0 → always the
      // closed-quarter treatment); the current year's quarters split
      // consolidated / per-pay-period around the user-picked first-payroll
      // quarter. Tasks are already ordered ascending (past years first, then
      // Q1 → Qn of the current year). Cancel downloads nothing.
      const now = new Date();
      const year = now.getFullYear();
      const calendarQuarter = Math.floor(now.getMonth() / 3) + 1;
      setStatus('Choose years & quarters to download…');
      const pick = await showQuarterPickDialog(year, calendarQuarter);
      if (pick === null) { setStatus('Payroll History cancelled'); logInfo('Year/quarter selection cancelled'); return; }
      const quarters = pick.quarters; // combined [FY tasks…, quarter tasks…]
      const currentQuarter = pick.currentQuarter;
      if (!quarters.length) { setStatus('Nothing selected — nothing to download'); logWarn('No years/quarters selected'); return; }
      logInfo('First-payroll quarter: Q' + currentQuarter + '. Selected: ' + quarters.map(q => q.label).join(', '));

      // Step 0 — CONSOLIDATED tasks only: read the Payroll Schedule to compute
      // each task's PriorPayroll_<begin>_<end>_<paydate>.xlsx filename. Any
      // failure logs a warning and the affected file keeps ADP's default name;
      // the downloads themselves are never blocked.
      const consolidatedTasks = quarters.filter(q => q.quarter < currentQuarter);
      if (consolidatedTasks.length) {
        setStatus('Step 0: Reading the Payroll Schedule for pay-period dates…');
        checkAbort();
        try {
          await phCaptureScheduleDates(consolidatedTasks, year);
        } catch (err) {
          if (err && err.aborted) throw err;
          logWarn('Payroll Schedule capture failed — files keep ADP default names (' +
            ((err && err.message) || err) + ')');
        }
      }

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

      // `quarters` is the combined task list from the dialog: full past years
      // first (ascending), then the current year's selected quarters.
      logInfo('Downloading ' + quarters.length + ' report(s): ' + quarters.map(q => q.label).join(', '));

      // Loop through each task (full-year or quarter — same steps either way)
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

        // Open Appearance settings and configure for this task. Quarters BEFORE
        // the user-selected current quarter get the totals (consolidated) view;
        // the selected current quarter gets the detailed / per-pay-period view.
        // Full-year tasks carry quarter 0, so they always classify as closed →
        // consolidated (Totals Only + Group By + unmasked), by design.
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

        // EVERY task fetches its finished file from Reports Output. Tasks with
        // a computed date-set save as PriorPayroll_<begin>_<end>_<paydate>.xlsx;
        // detailed/per-pay-period tasks (and tasks whose dates couldn't be
        // captured) download under ADP's own default filename.
        try {
          await phDownloadRenamed(q, setStatus);
        } catch (err) {
          if (err && err.aborted) throw err;
          logWarn('Download failed for ' + q.label + ' — fetch it from Reports Output manually (' +
            ((err && err.message) || err) + ')');
        }
      }

      setStatus('All ' + quarters.length + ' report(s) downloaded ✓');
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

  // Canonical list of the reports the "Download All" hero runs, in run order.
  // Each row in the panel gets a checkbox (persisted per key) so the user can
  // run a subset — e.g. grab 5 of 7 and skip the rest. downloadAll() and the
  // panel both read from this one list so the two never drift apart.
  const ADP_REPORTS = [
    { key: 'census', icon: '👥', label: 'Census', fn: downloadCensus },
    { key: 'sitfit', icon: '🧾', label: 'SIT / FIT', fn: downloadSitFit },
    { key: 'license', icon: '📜', label: 'License / EC', fn: downloadLicenseEC },
    { key: 'taxval', icon: '✅', label: 'Tax Validation', fn: downloadTaxValidation },
    { key: 'payhist', icon: '💰', label: 'Payroll History', fn: downloadPayrollHistory },
    { key: 'deduction', icon: '🧮', label: 'Deduction', fn: downloadDeductionReport },
    { key: 'directdeposit', icon: '🏦', label: 'Direct Deposit', fn: downloadDirectDeposit },
    { key: 'qualot', icon: '⏱️', label: 'Qualified Overtime', fn: downloadQualifiedOvertime },
    { key: 'tobs', icon: '🏖️', label: 'Time Off Balance Summary', fn: downloadTimeOffBalanceSummary },
    { key: 'lien', icon: '⚖️', label: 'Employee Lien Detail', fn: downloadEmployeeLienDetail },
  ];

  const REPORT_SEL_KEY = 'adpBot.reportSelection';
  // Returns a { key: bool } map. Any report missing from storage defaults to
  // selected (true), so first-run / newly-added reports are included by default.
  function getReportSelection() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(REPORT_SEL_KEY) || '{}') || {}; } catch (_) { stored = {}; }
    const sel = {};
    for (const r of ADP_REPORTS) sel[r.key] = stored[r.key] !== false;
    return sel;
  }
  function setReportSelected(key, on) {
    const sel = getReportSelection();
    sel[key] = !!on;
    try { localStorage.setItem(REPORT_SEL_KEY, JSON.stringify(sel)); } catch (_) { }
  }

  // Modal: pick which reports "Download All" should run. Pre-ticked from the
  // last saved selection (all on first run). Resolves to an array of selected
  // report keys, or null if the user cancels / Stop is pressed. Persists the
  // selection so it's remembered next time. Styled to match the cobalt panel.
  function showDownloadAllDialog() {
    return new Promise((resolve) => {
      const existing = document.getElementById('adp-downloadall-pick');
      if (existing) existing.remove();

      const saved = getReportSelection();

      const overlay = document.createElement('div');
      overlay.id = 'adp-downloadall-pick';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,8,22,.62);z-index:2147483647;' +
        'display:flex;align-items:center;justify-content:center;font:14px "Segoe UI",system-ui,sans-serif;';

      const box = document.createElement('div');
      box.style.cssText = 'width:360px;max-width:92vw;color:#dce9ff;border-radius:16px;overflow:hidden;' +
        'background:linear-gradient(165deg,rgba(2,20,46,.98),rgba(0,36,86,.96));' +
        'border:1px solid rgba(90,159,255,.3);box-shadow:0 18px 50px rgba(0,0,0,.6);';

      const head = document.createElement('div');
      head.style.cssText = 'padding:14px 16px;font-weight:700;font-size:15px;color:#fff;' +
        'background:linear-gradient(90deg,rgba(0,71,171,.45),rgba(0,100,241,.12));border-bottom:1px solid rgba(90,159,255,.2);';
      head.textContent = 'Download All Reports — choose reports';
      box.appendChild(head);

      const body = document.createElement('div');
      body.style.cssText = 'padding:12px 16px;';

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11.5px;color:#9fc2ff;margin-bottom:10px;';
      hint.textContent = 'Untick any report to skip it. They download in this order.';
      body.appendChild(hint);

      // Select all / none toggle.
      const allRow = document.createElement('label');
      allRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 11px;margin-bottom:10px;cursor:pointer;' +
        'background:rgba(0,71,171,.12);border:1px dashed rgba(125,179,255,.3);border-radius:10px;';
      const allCb = document.createElement('input');
      allCb.type = 'checkbox';
      allCb.style.cssText = 'width:16px;height:16px;accent-color:#0064f1;cursor:pointer;';
      const allTxt = document.createElement('span');
      allTxt.style.cssText = 'font-weight:600;color:#eaf2ff;font-size:12.5px;';
      allTxt.textContent = 'Select all / none';
      allRow.appendChild(allCb);
      allRow.appendChild(allTxt);
      body.appendChild(allRow);

      const checks = [];
      ADP_REPORTS.forEach((r) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 11px;margin-bottom:7px;cursor:pointer;' +
          'background:rgba(0,71,171,.22);border:1px solid rgba(125,179,255,.18);border-radius:10px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = saved[r.key];
        cb.style.cssText = 'width:16px;height:16px;accent-color:#0064f1;cursor:pointer;';
        const txt = document.createElement('span');
        txt.style.cssText = 'font-weight:600;color:#eaf2ff;';
        txt.textContent = r.icon + '  ' + r.label;
        row.appendChild(cb);
        row.appendChild(txt);
        body.appendChild(row);
        checks.push(cb);
      });

      const syncAllCb = () => {
        allCb.checked = checks.every(c => c.checked);
        allCb.indeterminate = !allCb.checked && checks.some(c => c.checked);
      };
      syncAllCb();
      allCb.addEventListener('change', () => { checks.forEach(c => { c.checked = allCb.checked; }); });
      checks.forEach(c => c.addEventListener('change', syncAllCb));

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
      confirmBtn.addEventListener('click', () => {
        ADP_REPORTS.forEach((r, i) => setReportSelected(r.key, checks[i].checked));
        finish(ADP_REPORTS.filter((_, i) => checks[i].checked).map(r => r.key));
      });
      // Stop/reset or external removal closes the dialog as a cancel.
      const poll = setInterval(() => {
        if (shouldAbort() || !document.body.contains(overlay)) finish(null);
      }, 200);
    });
  }

  async function downloadAll(setStatus) {
    logInfo('=== Download All Reports ===');

    // Only run the reports whose checkbox is ticked.
    const sel = getReportSelection();
    const flows = ADP_REPORTS.filter(r => sel[r.key]);

    if (flows.length === 0) {
      setStatus('No reports selected — tick at least one report');
      logWarn('Download All: nothing selected — skipped');
      return;
    }
    logInfo('Selected ' + flows.length + '/' + ADP_REPORTS.length + ' reports: ' + flows.map(f => f.label).join(', '));

    for (let i = 0; i < flows.length; i++) {
      const flow = flows[i];

      // Check if user pressed Stop during the previous flow
      if (aborted) {
        setStatus('Download All stopped after ' + (i > 0 ? flows[i - 1].label : 'start'));
        logWarn('Download All aborted — remaining reports skipped');
        return;
      }

      logInfo('───── Starting ' + flow.label + ' (' + (i + 1) + '/' + flows.length + ') ─────');
      setStatus('Download All: ' + flow.label + ' (' + (i + 1) + '/' + flows.length + ')…');

      await flow.fn(setStatus);

      // Check abort again after the flow returned
      if (aborted) {
        setStatus('Download All stopped during ' + flow.label);
        logWarn('Download All aborted during ' + flow.label + ' — remaining reports skipped');
        return;
      }

      logSuccess(flow.label + ' done (' + (i + 1) + '/' + flows.length + ')');

      // Wait between flows for the page to settle before starting next
      if (i < flows.length - 1) {
        logInfo('Waiting before next report...');
        await sleep(5000);
      }
    }

    setStatus('All ' + flows.length + ' selected report(s) downloaded ✓');
    logSuccess('=== All selected reports complete! ===');
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
    // Never hardcode this: the badge read 'v1.0' while @version was 1.7.0, so
    // the panel could not be used to tell which build was actually loaded.
    versionTag.textContent = 'v' + SCRIPT_VERSION;
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

    // Hero action: opens the report picker, then runs the selected reports.
    const downloadAllBtn = document.createElement('button');
    downloadAllBtn.className = 'adpbot-hero';
    downloadAllBtn.textContent = '⚡ Download All Reports';
    downloadAllBtn.addEventListener('click', async () => {
      if (running) { logWarn('Already running — click Stop / reset to abort'); return; }
      const picked = await showDownloadAllDialog();
      if (picked === null) { logInfo('Download All cancelled'); return; }
      if (picked.length === 0) {
        logWarn('No reports selected — nothing to download');
        status.textContent = 'No reports selected — pick at least one';
        return;
      }
      withRunGuard(downloadAll)();
    });
    btnRow.appendChild(downloadAllBtn);

    // Report rows: icon chip + label, hover slide. Clicking a row runs just that
    // one report. (Bulk selection lives in the "Download All Reports" dialog.)
    function mkItem(report, handler) {
      const b = document.createElement('button');
      b.className = 'adpbot-item';
      const ico = document.createElement('span');
      ico.className = 'adpbot-ico';
      ico.textContent = report.icon;
      b.appendChild(ico);
      b.appendChild(document.createTextNode(report.label));
      b.addEventListener('click', handler);
      btnRow.appendChild(b);
      return b;
    }
    for (const r of ADP_REPORTS) mkItem(r, withRunGuard(r.fn));

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
  const GRID_READY_TIMEOUT_MS = 60000;        // grid/page can be slow to render on this SPA route — be generous
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
    await waitFor(gridReady, { label: 'grid to load', timeout: GRID_READY_TIMEOUT_MS });
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
      await waitFor(gridReady, { label: 'grid to load', timeout: GRID_READY_TIMEOUT_MS });
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