// ==UserScript==
// @name         ADP Census + SIT/FIT Report Automation
// @namespace    https://workforcenow.adp.com/
// @version      0.2.1
// @description  Two-button automation: Download Census or Download SIT/FIT. End-to-end from the home page through Reports & Analytics → All Custom Reports → Create new report → field selection (v9.2 column lists embedded) → SSN unmask.
// @match        https://workforcenow.adp.com/theme/admin.html*
// @run-at       document-end
// @grant        none
// ==/UserScript==

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
    "Pronouns (Personal Profile)"
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
    info:    { color: '#444', prefix: 'INFO ' },
    warn:    { color: '#b8860b', prefix: 'WARN ' },
    error:   { color: '#c0392b', prefix: 'ERROR' },
    success: { color: '#28a745', prefix: 'OK   ' },
    debug:   { color: '#888', prefix: 'DEBUG' },
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
  const logInfo    = (...p) => log('info',    ...p);
  const logWarn    = (...p) => log('warn',    ...p);
  const logError   = (...p) => log('error',   ...p);
  const logSuccess = (...p) => log('success', ...p);
  const logDebug   = (...p) => log('debug',   ...p);

  function appendLogLine(level, ts, text) {
    const entry = { level, ts, text };
    if (!logEl) { pendingLogs.push(entry); return; }
    const line = document.createElement('div');
    line.style.cssText = 'color:' + LOG_LEVELS[level].color + ';white-space:pre-wrap;word-break:break-word;line-height:1.3;padding:1px 0;';
    const tsSpan = document.createElement('span');
    tsSpan.style.cssText = 'color:#aaa;';
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
      } catch (_) {}
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
      } catch (_) {}
    });
    // Native click — single fire. Also follows hrefs on <a>.
    try { el.click(); } catch (_) {}
    // Dojo dijit click event for legacy widgets.
    try {
      const Ev = ownerWin.Event || Event;
      el.dispatchEvent(new Ev('dijitclick', { bubbles: true, cancelable: true }));
    } catch (_) {}
  }

  function dblClickEl(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }));
    } catch (_) {}
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
    } catch (_) {}
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
    let createBtn = null;
    for (let i = 0; i < 30 && !createBtn; i++) {
      createBtn = findVisibleClickableByText('Create new report');
      if (!createBtn) await sleep(300);
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
    let titleInput = null;
    for (let i = 0; i < 30 && !titleInput; i++) {
      titleInput = deepQueryAll('input').filter(visible)
        .find(inp => /report ?name|report ?title/i.test(inp.placeholder || ''));
      if (!titleInput) await sleep(300);
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
    let sfBtn = null;
    for (let i = 0; i < 15 && !sfBtn; i++) {
      sfBtn = findVisibleClickableByText('Select Fields');
      if (!sfBtn) await sleep(300);
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
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      setStatus('Selecting field ' + (i + 1) + '/' + columns.length + ': ' + col.slice(0, 40));

      const searchTerm = FIELD_NAME_CORRECTIONS[col] || col.split(' (')[0];
      triggerFieldSearch(searchTerm);
      await sleep(800); // wait for search filter to render

      let success = false;
      let attempts = 0;
      const maxAttempts = 10;
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
    catch (_) { try { actionBtn.scrollIntoView(); } catch (_) {} }
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
      try { ok = !!f.contentDocument; } catch (_) {}
      logDebug('iframe[' + i + ']: src=' + (f.src || '(none)') + ' sameOrigin=' + ok);
    });

    const dijitButtons = deepQueryAll('[role="button"][class*="dijit"]');
    logInfo('Total dijit role=button:', dijitButtons.length);

    const fieldSearch = findFieldSearchInput();
    logInfo('Field-canvas search input present:', !!fieldSearch);

    logInfo('=== End diagnostic ===');
  }

  // ───────────────── panel ─────────────────

  function buildPanel() {
    if (document.getElementById('adp-bot-panel')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'adp-bot-panel';
    wrapper.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483646;background:#fff;border:2px solid #d40511;padding:10px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.25);font:12px sans-serif;width:340px;';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
    const title = document.createElement('h4');
    title.textContent = 'ADP Bot';
    title.style.cssText = 'margin:0;color:#d40511;font-size:14px;';
    titleRow.appendChild(title);
    const versionTag = document.createElement('span');
    versionTag.textContent = 'v0.2.0';
    versionTag.style.cssText = 'color:#888;font-size:10px;';
    titleRow.appendChild(versionTag);
    wrapper.appendChild(titleRow);

    const status = document.createElement('div');
    status.style.cssText = 'font-size:11px;color:#555;margin-bottom:6px;min-height:14px;';
    status.textContent = 'Idle';
    wrapper.appendChild(status);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:grid;grid-template-columns:1fr;gap:4px;margin-bottom:6px;';

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

    const censusBtn = document.createElement('button');
    censusBtn.textContent = 'Download Census';
    censusBtn.style.cssText = 'padding:10px;border:none;border-radius:4px;background:#28a745;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;';
    censusBtn.addEventListener('click', withRunGuard(downloadCensus));
    btnRow.appendChild(censusBtn);

    const sitFitBtn = document.createElement('button');
    sitFitBtn.textContent = 'Download SIT/FIT';
    sitFitBtn.style.cssText = 'padding:10px;border:none;border-radius:4px;background:#0056b3;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;';
    sitFitBtn.addEventListener('click', withRunGuard(downloadSitFit));
    btnRow.appendChild(sitFitBtn);

    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop / reset';
    stopBtn.style.cssText = 'padding:8px;border:none;border-radius:4px;background:#c0392b;color:#fff;font-weight:bold;cursor:pointer;font-size:12px;';
    stopBtn.addEventListener('click', () => {
      if (!running) {
        logInfo('Stop / reset clicked — nothing running');
        status.textContent = 'Idle';
        resetAbort();
        return;
      }
      requestAbort();
      logWarn('Stop requested — aborting at next opportunity (≤100ms)');
      status.textContent = 'Stopping…';
    });
    btnRow.appendChild(stopBtn);

    const diagBtn = document.createElement('button');
    diagBtn.textContent = 'Run diagnostic';
    diagBtn.style.cssText = 'padding:6px;border:none;border-radius:4px;background:#6c5ce7;color:#fff;font-weight:bold;cursor:pointer;font-size:11px;';
    diagBtn.addEventListener('click', dumpDiagnostic);
    btnRow.appendChild(diagBtn);

    wrapper.appendChild(btnRow);

    const logRow = document.createElement('div');
    logRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;';
    const logLabel = document.createElement('span');
    logLabel.textContent = 'Log';
    logLabel.style.cssText = 'font-size:10px;color:#888;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;';
    logRow.appendChild(logLabel);
    const logActions = document.createElement('div');
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = 'padding:2px 6px;border:1px solid #ccc;background:#f7f7f7;border-radius:3px;cursor:pointer;font-size:10px;margin-right:3px;';
    clearBtn.addEventListener('click', () => { if (logEl) logEl.innerHTML = ''; });
    logActions.appendChild(clearBtn);
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = 'padding:2px 6px;border:1px solid #ccc;background:#f7f7f7;border-radius:3px;cursor:pointer;font-size:10px;';
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
    wrapper.appendChild(logRow);

    logEl = document.createElement('div');
    logEl.style.cssText = 'height:200px;overflow-y:auto;background:#fafafa;border:1px solid #e0e0e0;border-radius:4px;padding:6px;font:10px/1.3 monospace;';
    wrapper.appendChild(logEl);

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
