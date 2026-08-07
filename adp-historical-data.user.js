// ==UserScript==
// @name         ADP — Historical Data Bot
// @namespace    https://workforcenow.adp.com/
// @author       Rohit Kaushik
// @version      1.1.3
// @description  Downloads one consolidated Payroll History file per prior calendar year from ADP Workforce Now.
// @match        https://workforcenow.adp.com/*
// @noframes
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// =====================================================================
//  Historical Data Bot — Phase A: Payroll History, one file per prior year.
//
//  Deliberately SEPARATE from adp-reports.user.js. That script handles the
//  day-to-day / current-year reports; this one handles prior-year history only.
//  Neither script touches the other. Both panels can be open at once — this one
//  docks bottom-LEFT, the other bottom-right.
//
//  Per selected year: navigate to Payroll History (Standard), pick the 34
//  payroll fields, unmask the Tax ID, set a full-calendar-year custom date
//  range, Run as Excel, then capture the finished file from Reports Output and
//  save it as HistoricalPayroll_<year>.xlsx.
//
//  Output is DETAILED, not consolidated: Totals Only and Group By are left
//  unticked on purpose, so each pay period appears as its own row inside the
//  single yearly file.
// =====================================================================

(function () {
  'use strict';

  // ───────────────────────────── constants ─────────────────────────────

  const PANEL_ID = 'hd-bot-panel';
  const SCRIPT_VERSION = '1.1.3';

  const YEARS_KEY = 'historicalBot.adp.years';

  const REPORT_SEARCH_TERM = 'Payroll History';
  // The row's title attribute is the BARE report name. "Standard" is the Type
  // column's text, used only to disambiguate it from same-named custom reports
  // — it is NOT part of the title. Matching on "Payroll History (Standard)"
  // finds nothing.
  const REPORT_TITLE = 'Payroll History';
  const REPORT_TYPE = 'Standard';

  // Time Off: reached through the left-hand category list on All Standard
  // Reports, not the Dojo search box. These four are ADP's standard Time Off
  // reports (global names, not per-client), all downloaded with the same steps.
  const TIME_OFF_CATEGORY = 'Time Off';
  const TIME_OFF_REPORTS = [
    'Time Off Balance Detail',
    'Time Off Balance Summary',
    'Time Off Policy Assignment',
    'Time Off Request',
  ];
  const TIMEOFF_KEY = 'historicalBot.adp.timeoff';

  // Extra settle before click-heavy Dojo steps. The Standard Reports pages are
  // slow to wire up their widgets; without this pad, clicks land on dead nodes
  // and the step fails with a "not found" that a retry would have fixed.
  const DOJO_PAD = 2000;

  // A full year is a bigger report than a quarter, so allow longer than the
  // 10 minutes the day-to-day script uses.
  const OUTPUT_WAIT_MS = 15 * 60 * 1000;
  const OUTPUT_POLL_MS = 1500;

  const MAX_LOG_LINES = 200;

  // Fields to select on the Payroll History "What's Displayed" panel.
  // These are the aria-label values on the checkbox buttons — do not reword.
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

  // ────────────────────────────── logging ──────────────────────────────

  const LOG_LEVELS = {
    info: { color: '#c6b8ec', prefix: 'INFO ' },
    warn: { color: '#ffc66d', prefix: 'WARN ' },
    error: { color: '#ff8080', prefix: 'ERROR' },
    success: { color: '#4ade80', prefix: 'OK   ' },
    debug: { color: '#8b7fa6', prefix: 'DEBUG' },
  };

  let logEl;
  const pendingLogs = [];

  function log(level, ...parts) {
    if (!LOG_LEVELS[level]) { parts.unshift(level); level = 'info'; }
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    const text = parts.map(p => {
      if (p == null) return String(p);
      if (typeof p === 'string') return p;
      try { return JSON.stringify(p); } catch (_) { return String(p); }
    }).join(' ');
    console.log('%c[HistBot]%c ' + ts + ' ' + LOG_LEVELS[level].prefix,
      'color:#8c46dc;font-weight:bold', 'color:' + LOG_LEVELS[level].color, ...parts);
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
    tsSpan.style.cssText = 'color:#7a5fa6;';
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

  function setStatus(msg) {
    const el = document.getElementById('hd-bot-status');
    if (el) el.textContent = msg;
  }

  // ───────────────────────────── DOM helpers ────────────────────────────

  // Walk every open shadow root AND every same-origin iframe. ADP's top nav
  // lives in a Stencil shadow root; the Reports module is a legacy MAS app
  // embedded as a same-origin iframe (Dojo dijit widgets).
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

  function clickEl(el) {
    if (!el) return;
    const ownerDoc = el.ownerDocument || document;
    const ownerWin = ownerDoc.defaultView || window;
    const MouseEventCtor = ownerWin.MouseEvent || MouseEvent;
    // 'click' is intentionally NOT dispatched here — el.click() below produces
    // the real click. Doing both makes toggle-style buttons open then close.
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(ev => {
      try {
        el.dispatchEvent(new MouseEventCtor(ev, { bubbles: true, cancelable: true, view: ownerWin, button: 0, buttons: 1 }));
      } catch (_) { }
    });
    try { el.click(); } catch (_) { }
    try {
      const Ev = ownerWin.Event || Event;
      el.dispatchEvent(new Ev('dijitclick', { bubbles: true, cancelable: true }));
    } catch (_) { }
  }

  function setReactInputValue(input, value) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ──────────────────────────── control flow ────────────────────────────

  let aborted = false;
  let paused = false;
  let running = false;

  function shouldAbort() { return aborted; }
  function resetAbort() { aborted = false; paused = false; }
  function requestAbort() { aborted = true; paused = false; }

  function isPaused() { return paused; }
  function requestPause() { paused = true; }
  function requestResume() { paused = false; }

  function isRunning() { return running; }
  function setRunning(on) { running = !!on; }

  function abortError() { const e = new Error('aborted'); e.aborted = true; return e; }
  function pauseError() { const e = new Error('paused'); e.paused = true; return e; }

  // Ticks every <=100ms so Stop AND Pause both take effect within ~100ms,
  // even in the middle of a 15-minute wait.
  const sleep = (ms) => new Promise((resolve, reject) => {
    const start = Date.now();
    (function tick() {
      if (shouldAbort()) return reject(abortError());
      if (isPaused()) return reject(pauseError());
      const remaining = ms - (Date.now() - start);
      if (remaining <= 0) return resolve();
      setTimeout(tick, Math.min(100, remaining));
    })();
  });

  function checkAbort() {
    if (shouldAbort()) throw abortError();
    if (isPaused()) throw pauseError();
  }

  // Holds execution while paused. This is the ONE place allowed to call
  // setTimeout directly: sleep() REJECTS on pause, so it cannot be used to wait
  // THROUGH a pause. Stop still escapes, because the loop re-checks it.
  async function waitWhilePaused() {
    if (!isPaused()) {
      if (shouldAbort()) throw abortError();
      return;
    }
    while (isPaused()) {
      if (shouldAbort()) throw abortError();
      await new Promise((r) => setTimeout(r, 100));
    }
    if (shouldAbort()) throw abortError();
    logInfo('Resumed');
  }

  // Runs an ordered step list. On pause it holds WITHOUT advancing the index,
  // so Resume re-runs the same step from its start. A step returning false is a
  // failure and throws; the caller decides what that means.
  async function runSteps(steps, ctx) {
    let i = 0;
    while (i < steps.length) {
      await waitWhilePaused();
      checkAbort();
      const step = steps[i];
      const tag = 'Step ' + (i + 1) + '/' + steps.length + ': ' + step.name;
      setStatus(tag + '…');
      logInfo('── ' + tag);
      try {
        const ok = await step.fn(ctx);
        if (ok === false) throw new Error('Step failed: ' + step.name);
      } catch (err) {
        if (err && err.aborted) throw err;
        if (err && err.paused) {
          setStatus('Paused at ' + tag);
          logWarn('Paused during "' + step.name + '" — Resume will retry this step');
          await waitWhilePaused();
          continue; // same index — retry this step
        }
        throw err;
      }
      i++;
    }
  }

  // ────────────────────────── ADP-specific lookups ──────────────────────

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

  // ADP renders many controls as Stencil web components (<sdf-button>) or Dojo
  // dijit widgets (<span role="button" class="dijit ...">) — neither has its
  // label inside an inner <button>, so we search the host element types.
  const CLICKABLE_HOST_SELECTOR = [
    'button', 'a', 'input[type="button"]', 'input[type="submit"]',
    '[role="button"]', 'sdf-button', 'sdf-icon-button', 'sdf-link', 'sdf-menu-item',
  ].join(', ');

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

  // ──────────────────────────────── steps ───────────────────────────────

  // Step 1: open the Reports & Analytics mega-menu. Synthetic clicks crash
  // ADP's own showMenu() handler, so we click (which still sets aria-expanded)
  // and then strip the hiding class ourselves. The menu is already rendered.
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

  // Step 2: click the All Standard Reports anchor.
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

  // Step 3: type into the Dojo search box. Value is set three ways because the
  // dijit TextBox ignores a plain assignment; the submit button is hidden
  // (height:0) but clickable.
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

    const searchBtn = deepQueryAll('#RevSearchInput_searchboxButton')[0];
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

  // Step 4: pick the report out of the search results.
  //
  // Three strategies, tried in order, because ADP renders this list two
  // different ways depending on which search UI the tenant is on:
  //   A. <span role="button" title="Payroll History"> in a row whose text also
  //      contains the Type ("Standard") — the classic Dojo grid.
  //   B. exactly one element carries title="Payroll History" — unambiguous even
  //      if the Type column isn't exposed as text.
  //   C. a visible link/button whose exact text is "Payroll History" — the
  //      newer results UI, where names render as anchors with no title attr.
  // Whichever wins is logged, so a future failure says which shape ADP served.
  async function stepSelectStandardReportByTitle(reportTitle, reportType) {
    // Compare NORMALIZED text throughout: normalize() lowercases and collapses
    // every run of whitespace (including non-breaking spaces) to one space.
    // Raw string equality is too brittle — ADP's grid serves some report names
    // with an nbsp or a double space, which is invisible on screen but makes an
    // exact [title="…"] selector match nothing.
    const wanted = normalize(reportTitle);
    let target = null;
    let how = '';

    // NEVER filter candidates by child count. An ADP dijit button is
    // <span role="button" title="Payroll History"> wrapping several inner
    // spans, so a "leaf elements only" filter discards the very element we
    // want — that regression is what broke this step in v1.1.1.
    // Ambiguity is resolved by RANKING instead: a real title attribute beats a
    // text-only match, something clickable beats a plain container, then the
    // shallowest and topmost wins.
    const titleness = (el) => (normalize(el.getAttribute && el.getAttribute('title')) === wanted ? 0 : 1);
    const clickableness = (el) => {
      const role = (el.getAttribute && el.getAttribute('role')) || '';
      const tag = el.tagName.toLowerCase();
      return (role === 'button' || role === 'link' || tag === 'a' || tag === 'button') ? 0 : 1;
    };
    const rank = (a, b) =>
      (titleness(a) - titleness(b)) ||
      (clickableness(a) - clickableness(b)) ||
      (a.children.length - b.children.length) ||
      (a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    const collect = () => {
      const out = [];
      const seen = new Set();
      for (const el of deepQueryAll('[title], a, [role="button"], [role="link"], button, span, td')) {
        if (seen.has(el) || !visible(el)) continue;
        const t = normalize(el.getAttribute && el.getAttribute('title'));
        const x = normalize(el.textContent);
        if (t === wanted || x === wanted) { seen.add(el); out.push(el); }
      }
      return out;
    };

    // Does the Type column ("Standard") appear alongside this name?
    const hasType = (el) => {
      const row = el.closest('tr, [role="row"], li, div[class*="row"]');
      if (row && (row.textContent || '').includes(reportType)) return true;
      let p = el.parentElement;
      for (let d = 0; d < 5 && p; d++) {
        const txt = (p.textContent || '');
        if (txt.includes(reportType) && txt.includes(reportTitle)) return true;
        p = p.parentElement;
      }
      return false;
    };

    let hits = [];
    for (let attempt = 0; attempt < 20 && !target; attempt++) {
      hits = collect();
      if (hits.length) {
        const typed = hits.filter(hasType);
        if (typed.length) {
          typed.sort(rank);
          target = typed[0];
          how = 'name + "' + reportType + '" nearby';
        } else {
          hits.sort(rank);
          target = hits[0];
          how = 'name match (' + hits.length + ' candidate(s), took deepest/topmost; no "' +
            reportType + '" text nearby)';
        }
        break;
      }
      await sleep(500);
    }

    // Last resort: a single element whose title CONTAINS the wanted name.
    // Catches a trailing qualifier ADP appends but does not display.
    if (!target) {
      const loose = deepQueryAll('[title]').filter(visible)
        .filter(el => normalize(el.getAttribute('title')).indexOf(wanted) >= 0);
      if (loose.length === 1) {
        target = loose[0];
        how = 'partial title match "' + (loose[0].getAttribute('title') || '').trim() + '"';
        logWarn('Exact name not found — using the only partial match');
      }
    }

    if (!target) {
      // Dump what IS on the page, so the next run does not need another guess.
      const names = [];
      const seenNames = new Set();
      for (const el of deepQueryAll('[title]')) {
        if (!visible(el)) continue;
        const t = (el.getAttribute('title') || '').trim();
        if (t && t.length < 80 && !seenNames.has(t)) { seenNames.add(t); names.push(t); }
      }
      logError(reportTitle + ' (' + reportType + ') not found on this page.');
      logError('Titles actually present (' + names.length + '): ' + JSON.stringify(names.slice(0, 40)));
      return false;
    }

    logInfo('Matched via ' + how + ' → <' + target.tagName.toLowerCase() + '>' +
      (target.id ? ' #' + target.id : '') +
      ' title=' + JSON.stringify((target.getAttribute('title') || '').trim()));
    clickEl(target);
    logSuccess('Selected ' + reportTitle + ' (' + reportType + ')');
    return true;
  }

  // Step 5: wait for the Run Report page shell.
  async function stepWaitForRunReportPage() {
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

  // Step 5b: Dojo widgets inside the report sections wire up AFTER the outer
  // shell renders. "Included Fields" / "Sort Order" / "All Employees…" only
  // appear once that has happened, so poll for one before clicking anything.
  async function stepWaitForSectionsPopulated() {
    for (let i = 0; i < 20; i++) { // up to 10s
      const els = deepQueryAll('*').filter(visible);
      for (const el of els) {
        const txt = (el.textContent || '').trim();
        if (txt === 'Included Fields' || txt === 'Sort Order' || txt.startsWith('All Employees')) {
          logSuccess('Report sections populated');
          await sleep(2000 + DOJO_PAD);
          return true;
        }
      }
      await sleep(500);
    }
    logWarn('Section marker never appeared — continuing anyway after a settle');
    await sleep(2000 + DOJO_PAD);
    return true;
  }

  // Step 6a: click the pencil next to "What's Displayed on the Report".
  async function stepClickWhatsDisplayed() {
    let target = null;
    for (let i = 0; i < 20 && !target; i++) {
      const clickables = deepQueryAll('a, button, [role="button"], [role="link"]').filter(visible);
      for (const el of clickables) {
        const text = (el.textContent || '').trim();
        if (text.includes("What's Displayed on the Report") || text.includes("What’s Displayed on the Report")) {
          target = el;
          break;
        }
      }

      if (!target) {
        const allEls = deepQueryAll('span, div, a, h3, h4, p').filter(visible);
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (text.startsWith("What's Displayed") || text.startsWith("What’s Displayed")) {
            const parent = el.parentElement;
            if (parent) {
              const svg = parent.querySelector('svg');
              if (svg) { target = parent; break; }
            }
            const svgInside = el.querySelector('svg');
            if (svgInside) { target = el; break; }
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

  // Step 6b: Select All → Clear All → tick only PAYROLL_HISTORY_FIELDS → Save.
  async function stepSelectPayrollDisplayFields() {
    let panelReady = false;
    for (let i = 0; i < 20 && !panelReady; i++) {
      const labels = deepQueryAll('.checkactionbubble-text').filter(visible);
      if (labels.length > 5) { panelReady = true; break; }
      await sleep(500);
    }
    if (!panelReady) {
      logError('Field selection panel did not load');
      return false;
    }
    logInfo('Field selection panel loaded');
    await sleep(500);

    const selectAllBtn = deepQueryAll('#stdrptlabel_selectAll')[0];
    if (selectAllBtn) {
      logInfo('Clicking Select All');
      clickEl(selectAllBtn);
      await sleep(800);
    }

    const clearAllBtn = deepQueryAll('#stdrptlabel_RemoveAll')[0];
    if (clearAllBtn) {
      // Force-enable if disabled — DOM manipulation beats fighting the widget.
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

    let selectedCount = 0;
    const failedFields = [];

    for (const fieldName of PAYROLL_HISTORY_FIELDS) {
      let fieldBtn = null;
      const allBtns = deepQueryAll('button[aria-label]').filter(visible);
      for (const btn of allBtns) {
        const label = (btn.getAttribute('aria-label') || '').trim();
        if (label.toLowerCase() === fieldName.toLowerCase()) { fieldBtn = btn; break; }
      }

      if (!fieldBtn) {
        const textSpans = deepQueryAll('.checkactionbubble-text').filter(visible);
        for (const span of textSpans) {
          if (span.textContent.trim().toLowerCase() === fieldName.toLowerCase()) {
            const container = span.closest('.flexSpaceBetween') ||
              (span.parentElement && span.parentElement.parentElement);
            if (container) fieldBtn = container.querySelector('button');
            break;
          }
        }
      }

      if (fieldBtn) {
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
      await sleep(200);
    }

    logInfo('Selected ' + selectedCount + '/' + PAYROLL_HISTORY_FIELDS.length + ' fields');
    if (failedFields.length) logWarn('Failed to find: ' + failedFields.join(', '));

    await sleep(500);
    let saveBtn = null;
    const buttons = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
    for (const btn of buttons) {
      if (normalize(btn.textContent) === 'save') { saveBtn = btn; break; }
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

  // Open a VDL dropdown by its currently-displayed text, then pick an option.
  async function selectVdlDropdownOption(dropdownText, optionText) {
    const dropdowns = deepQueryAll('.vdl-dropdown-list__input, [class*="dropdown"]').filter(visible);
    let dropdown = null;
    for (const dd of dropdowns) {
      const text = (dd.textContent || '').trim().toLowerCase();
      if (text === dropdownText.toLowerCase()) { dropdown = dd; break; }
    }
    if (!dropdown) {
      for (const dd of dropdowns) {
        const text = (dd.textContent || '').trim().toLowerCase();
        if (text.includes(dropdownText.toLowerCase())) { dropdown = dd; break; }
      }
    }
    if (!dropdown) {
      // DEBUG, not ERROR: callers try several possible current values in turn,
      // so a miss here is expected. The caller reports the real failure.
      logDebug('No dropdown currently showing "' + dropdownText + '"');
      return false;
    }

    clickEl(dropdown);
    await sleep(500);

    const options = deepQueryAll('li, [role="option"], [role="menuitem"], [class*="dropdown"] [class*="option"], .vdl-dropdown-list__option').filter(visible);
    for (const opt of options) {
      const text = (opt.textContent || '').trim().toLowerCase();
      if (text === optionText.toLowerCase()) {
        clickEl(opt);
        logInfo('Selected "' + optionText + '" from dropdown');
        return true;
      }
    }

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

  // Step 7a: click the pencil next to "Appearance and Other Settings".
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
    await sleep(2000);
    return true;
  }

  // Plain calendar year. The day-to-day script uses a +1-day convention
  // (01/02 → 01/01 of the next year); that is deliberately NOT used here.
  function yearDateRange(year) {
    return { from: '01/01/' + year, to: '12/31/' + year };
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Time Off range: 1 January of LAST year → today. Both derived from the
  // system clock, so it rolls forward on its own.
  // Running on 03/08/2026 gives 01/01/2025 → 03/08/2026.
  function timeOffDateRange() {
    const d = new Date();
    return {
      from: '01/01/' + (d.getFullYear() - 1),
      to: pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + d.getFullYear(),
    };
  }

  // "Time Off Balance Detail" → "Time_Off_Balance_Detail"
  function safeFileName(name) {
    return String(name || '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // Click a category in the left-hand STANDARD REPORTS list (Time Off, Payroll,
  // Benefits, …). The sidebar item is the LEFTMOST and SHALLOWEST element whose
  // text is exactly the category name — sorting that way avoids grabbing a
  // wrapper <div> or a same-named cell out in the grid.
  async function stepClickStandardCategory(categoryName) {
    let target = null;
    for (let i = 0; i < 30 && !target; i++) {
      const hits = deepQueryAll('a, li, div, span, [role="button"], [role="link"]')
        .filter(visible)
        .filter(el => (el.textContent || '').trim() === categoryName);
      if (hits.length) {
        hits.sort((a, b) => {
          const dc = a.children.length - b.children.length;
          if (dc !== 0) return dc;
          return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
        });
        target = hits[0];
        break;
      }
      await sleep(400);
    }
    if (!target) {
      logError('Standard Reports category "' + categoryName + '" not found in the left sidebar');
      return false;
    }
    const r = target.getBoundingClientRect();
    logInfo('Clicking category "' + categoryName + '" — <' + target.tagName.toLowerCase() +
      '> at x=' + Math.round(r.left) + ', y=' + Math.round(r.top));
    clickEl(target);
    await sleep(1500);
    const names = await waitForGridToSettle();
    logSuccess('Opened the ' + categoryName + ' category — ' + names.length + ' report(s) listed');
    if (names.length) logDebug('Listed: ' + JSON.stringify(names.slice(0, 20)));
    return true;
  }

  // The category grid repaints asynchronously after the category is clicked.
  // Clicking a report before it settles finds nothing — the observed failure
  // mode where step 4 polls 12s and matches zero elements while a retry a
  // minute later matches in 1s. Wait until the set of titled elements stops
  // changing across two consecutive polls, then hand back what is on screen.
  async function waitForGridToSettle() {
    let prev = '';
    let stable = 0;
    for (let i = 0; i < 40; i++) { // up to ~20s
      const names = [];
      const seen = new Set();
      for (const el of deepQueryAll('[title]')) {
        if (!visible(el)) continue;
        const t = (el.getAttribute('title') || '').trim();
        if (t && t.length < 80 && !seen.has(t)) { seen.add(t); names.push(t); }
      }
      const sig = names.slice().sort().join('|');
      if (names.length && sig === prev) {
        stable++;
        if (stable >= 2) return names;
      } else {
        stable = 0;
      }
      prev = sig;
      await sleep(500);
    }
    logWarn('Grid never settled — continuing anyway');
    return [];
  }

  // "What's Displayed" variant that just ticks EVERYTHING and saves. Time Off
  // reports take every available column, unlike Payroll History's fixed 34.
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

  // Appearance variant that ONLY sets the custom date range. Everything else on
  // the page — sorting, masking, grouping — is left exactly as ADP had it.
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

  // Step 7b: Tax ID → Not Masked, Request Period → Custom Date Range, dates, Save.
  //
  // Sort By #2, Group By and Totals Only are deliberately LEFT ALONE. ADP
  // defaults Sort By #2 to "Name", and leaving Totals Only unticked is exactly
  // what makes the output detailed — one row per pay period inside the year.
  async function stepConfigureAppearanceForYear(year) {
    const range = yearDateRange(year);

    // "Totals Only" is the reliable marker that the section has rendered.
    // We wait for it; we never tick it.
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

    // Best-effort visibility into the dropdowns, for debugging only.
    try {
      const dds = deepQueryAll('.vdl-dropdown-list__input').filter(visible);
      logDebug('Dropdowns currently read: ' +
        dds.map(d => JSON.stringify((d.textContent || '').trim())).join(', '));
    } catch (_) {
      logDebug('Could not read dropdown values (non-fatal)');
    }

    // 1. Tax ID → Not Masked
    logInfo('Setting Tax ID to Not Masked');
    await sleep(1000);
    let taxIdSet = false;
    for (const attempt of [['Partially', 'Not Masked'], ['Partially masked', 'Not Masked'], ['Partially Masked', 'Not masked']]) {
      if (await selectVdlDropdownOption(attempt[0], attempt[1])) { taxIdSet = true; break; }
    }
    if (!taxIdSet) logWarn('Could not switch Tax ID to Not Masked — the SSN column may stay masked');
    await sleep(1500);

    // 2. Confirm the unmask popup.
    let yesBtn = null;
    for (let i = 0; i < 25 && !yesBtn; i++) {
      const btns = deepQueryAll('button, [role="button"], sdf-button').filter(visible);
      for (const btn of btns) {
        if (normalize(btn.textContent) === 'yes') { yesBtn = btn; break; }
      }
      if (!yesBtn) await sleep(400);
    }
    if (yesBtn) {
      clickEl(yesBtn);
      logSuccess('Clicked Yes on Tax ID confirmation');
      await sleep(1500);
    } else {
      logWarn('Tax ID confirmation popup not found — may not have appeared');
    }
    await sleep(1000);

    // 3. Request Period → Custom Date Range
    logInfo('Setting Request Period to Custom Date Range');
    await sleep(1000);
    let periodSet = false;
    for (const current of ['Last 30 Days', 'Last 30', 'Year-to-Date', 'Custom Date', 'Current']) {
      if (await selectVdlDropdownOption(current, 'Custom Date Range')) { periodSet = true; break; }
    }
    if (!periodSet) logError('Could not switch Request Period to Custom Date Range');
    await sleep(1500);

    // 4. Dates
    logInfo('Setting date range: ' + range.from + ' to ' + range.to);
    const dateInputs = deepQueryAll('input').filter(visible).filter(inp => {
      const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
      return ph.includes('mm/dd/yyyy') || ph.includes('mm/dd');
    });

    if (dateInputs.length >= 2) {
      dateInputs[0].focus();
      await sleep(300);
      setReactInputValue(dateInputs[0], range.from);
      await sleep(800);
      dateInputs[1].focus();
      await sleep(300);
      setReactInputValue(dateInputs[1], range.to);
      await sleep(800);
      dateInputs[1].blur();
      await sleep(500);
      logInfo('Dates entered: ' + range.from + ' → ' + range.to);
    } else {
      logError('Expected 2 date inputs, found ' + dateInputs.length);
      return false;
    }
    await sleep(800);

    // 5. Save
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

  // Step 8: submit the report.
  async function stepClickRunAsExcel() {
    let btn = null;
    for (let i = 0; i < 20 && !btn; i++) {
      const clickables = deepQueryAll('button, sdf-button, [role="button"]').filter(visible);
      for (const el of clickables) {
        if (normalize(el.textContent) === 'run as excel') { btn = el; break; }
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

  // ─────────────────────── download capture (steps 9-10) ────────────────

  // Run Date-Time signatures of report rows already downloaded THIS run, so a
  // multi-year run never re-downloads the previous year's (still-topmost,
  // just-completed) row while the new report is still rendering.
  let downloadedSigs = new Set();

  // The Run Date-Time text of the row nearest `top` (e.g. "07/16/2026 - 03:45
  // AM"), used to tell one report row from another. '' if none is visible.
  function rowSignatureNear(top) {
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

  // Arm URL-capture hooks on a window (the Reports area lives in an iframe, so
  // hooks must go on the ANCHOR'S OWN window, not just the top one). window.open
  // is suppressed — we fetch the file ourselves instead of letting ADP pop a tab
  // (which pop-up blockers eat anyway).
  function armSniffer(win) {
    const st = { urls: [], forms: [] };
    const looks = (u) => typeof u === 'string' && u && u !== '#!' && !/#!$/.test(u) && !/^(javascript:|about:blank$)/i.test(u);
    const push = (u) => { try { if (looks(u) && st.urls.indexOf(String(u)) < 0) st.urls.push(String(u)); } catch (_) { } };
    const oOpen = win.open;
    const oFetch = win.fetch;
    const XP = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    const oXo = XP && XP.open;
    const FP = win.HTMLFormElement && win.HTMLFormElement.prototype;
    const oSub = FP && FP.submit;
    // Capture the URL AND hand back a FAKE window: ADP opens a launcher page
    // first and only then assigns the real file URL to the popup's location.
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
    // ADP may POST a form targeting the popup instead of using the handle.
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
  // iframe's window, fetch it with session cookies, and save it as `fileName`.
  // Any failure falls back to ADP's native behaviour — the file is never blocked.
  //
  // Returns { ok, sig }. The caller records `sig` so the NEXT year waits for a
  // genuinely new row; it is deliberately NOT recorded here, so that a paused
  // and resumed retry of this step can re-claim the same row.
  async function downloadRenamed(fileName, label) {
    setStatus('Waiting for ' + label + ' to finish generating…');
    const completedNear = (top) => deepQueryAll('*').filter(visible).some(el =>
      (el.textContent || '').trim() === 'Completed' &&
      Math.abs(el.getBoundingClientRect().top - top) < 30);

    let trigger = null, topSig = '';
    let loggedProc = false, loggedPrev = false;
    const maxPolls = Math.ceil(OUTPUT_WAIT_MS / OUTPUT_POLL_MS);
    for (let i = 0; i < maxPolls && !trigger; i++) {
      checkAbort();
      const trigs = deepQueryAll('.fa-ellipsis-h').filter(visible)
        .map(t => t.closest('[role="button"], .revitButton') || t.parentElement || t)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (trigs.length) {
        const topEl = trigs[0];
        const top = topEl.getBoundingClientRect().top;
        const sig = rowSignatureNear(top);
        // Ignore a PREVIOUS year's row: on a multi-year run it can still be
        // topmost (and already Completed) for a moment before the new row renders.
        if (sig && downloadedSigs.has(sig)) {
          if (!loggedPrev) { logInfo('Previous report still topmost — waiting for the new row…'); loggedPrev = true; }
        } else if (completedNear(top)) {
          trigger = topEl; topSig = sig;
          break;
        } else if (!loggedProc) {
          logInfo('Newest report row is still processing — waiting for Completed…');
          loggedProc = true;
        }
      }
      await sleep(OUTPUT_POLL_MS);
    }
    if (!trigger) throw new Error('report row did not reach Completed in time');
    logInfo('Newest report row is Completed — opening its options menu');

    setStatus('Downloading ' + fileName + '…');
    // The ⋯ options button is a Dojo DROPDOWN widget — it opens on MOUSEDOWN,
    // which a plain .click() never fires.
    const mouseSeq = (el) => {
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
    const clickRevit = (el) => {
      const host = el.closest('[role="button"], .revitButton') || el;
      try { host.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) { }
      mouseSeq(host);
      try { host.dispatchEvent(new Event('dijitclick', { bubbles: true, cancelable: true })); } catch (_) { }
    };
    // The grid re-renders when the row flips to Completed, which can leave the
    // ⋯ node DETACHED — events on a detached node go nowhere, so the menu
    // "never opens". Re-locate it by row signature whenever ours is stale.
    const freshTrigger = () => {
      const trigs = deepQueryAll('.fa-ellipsis-h').filter(visible)
        .map(t => t.closest('[role="button"], .revitButton') || t.parentElement || t)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (!trigs.length) return null;
      if (topSig) {
        const same = trigs.find(t => rowSignatureNear(t.getBoundingClientRect().top) === topSig);
        if (same) return same;
      }
      return trigs[0];
    };
    const clickTrigger = () => {
      if (!trigger.isConnected) {
        const fresh = freshTrigger();
        if (fresh) { logInfo('⋯ button was re-rendered by a grid refresh — re-located it'); trigger = fresh; }
        else logWarn('⋯ button is detached and no replacement was found');
      }
      clickRevit(trigger);
    };
    clickTrigger();
    await sleep(800);

    const findXlsAnchor = () =>
      deepQueryAll('[data-pendo-id="PENDO_ADPR_DATAGRID_VIEW_EXTERNAL"]').filter(visible)[0]
      || deepQueryAll('a, [role="menuitem"], td, div').filter(visible)
        .find(el => /view as xls/i.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 30)
      || null;
    let anchor = null;
    for (let i = 0; i < 24 && !anchor; i++) {
      anchor = findXlsAnchor();
      if (!anchor) {
        if (i > 0 && i % 8 === 0) {
          logInfo('Options menu not open yet — re-clicking the ⋯ button');
          clickTrigger();
        }
        await sleep(500);
      }
    }
    if (!anchor) throw new Error('"View as XLS" menu item not found (trigger still in DOM: ' + trigger.isConnected + ')');

    const win = (anchor.ownerDocument && anchor.ownerDocument.defaultView) || window;
    const sn1 = armSniffer(win);
    const sn2 = (win === window) ? null : armSniffer(window);
    const baseHref = anchor.ownerDocument.baseURI;
    // The real spreadsheet lives at …/downloadTemplate/?instanceRefId=BIRT…;
    // the first thing ADP opens is usually a launcher page (auditOutput.do).
    const isFileUrl = (u) => /downloadTemplate|instanceRefId|\.(xlsx?|csv)(\?|$)/i.test(u);
    const capturedUrls = () => sn1.urls.concat(sn2 ? sn2.urls : []);
    const capturedForms = () => sn1.forms.concat(sn2 ? sn2.forms : []);
    let url = '';
    try {
      clickEl(anchor);
      try { anchor.dispatchEvent(new Event('dijitclick', { bubbles: true, cancelable: true })); } catch (_) { }
      for (let i = 0; i < 40; i++) { // up to 12s for the handler to fire
        const arr = capturedUrls();
        const good = arr.find(isFileUrl);
        if (good) { url = good; break; }
        if (!url) url = arr[0] || '';
        if (url && i >= 20) break; // give the real URL ~6s, then work with the viewer
        checkAbort();
        await sleep(300);
      }
    } finally {
      sn1.restore();
      if (sn2) sn2.restore();
    }
    if (!url) {
      logWarn(label + ': could not capture the file URL — the file keeps ADP\'s default name');
      return { ok: false, sig: topSig };
    }
    const abs = new URL(url, baseHref).href;
    logInfo('Captured report file URL: ' + abs);

    const isHtml = (r) => /text\/html/i.test((r && r.headers.get('content-type')) || '');
    const fetchBlob = async (u, opts) => {
      const r = await fetch(u, Object.assign({ credentials: 'include' }, opts || {}));
      if (!r.ok) { logWarn('Fetch failed (HTTP ' + r.status + ') for ' + u); return null; }
      return { resp: r, blob: await r.blob() };
    };
    let got = await fetchBlob(abs);
    if (!got || !got.blob.size) throw new Error('file download returned an empty body');
    let viewerHtml = '';
    if (isHtml(got.resp)) {
      // Not the spreadsheet yet: we fetched the launcher page, or the server
      // wants the launcher loaded in-session BEFORE serving the file.
      try { viewerHtml = await got.blob.text(); } catch (_) { }
      logInfo(label + ': captured URL is a viewer page — mining it for the real file URL');
      const launcher = capturedUrls().map(u => { try { return new URL(u, baseHref).href; } catch (_) { return ''; } })
        .find(u => u && /auditOutput\.do/i.test(u) && u !== abs);
      if (launcher) { try { await fetch(launcher, { credentials: 'include' }); } catch (_) { } }

      const mineHtml = (html, base) => {
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

      let cur = abs;
      for (let att = 0; att < 6 && isHtml(got.resp); att++) {
        checkAbort();
        const next = mineHtml(viewerHtml, cur);
        if (next && next !== cur) { logInfo('Viewer page references: ' + next); cur = next; }
        else await sleep(2500);
        const r = await fetchBlob(cur, launcher ? { referrer: launcher } : null);
        if (r && r.blob.size) {
          got = r;
          if (isHtml(r.resp)) { try { viewerHtml = await r.blob.text(); } catch (_) { } }
        }
      }

      // Still no spreadsheet? Replay any form submissions ADP made.
      if (!got || !got.blob.size || isHtml(got.resp)) {
        for (const f of capturedForms()) {
          checkAbort();
          try {
            const action = new URL(f.action || '', baseHref).href;
            const post = /post/i.test(f.method);
            const u = post ? action : action + (f.query ? (action.indexOf('?') >= 0 ? '&' : '?') + f.query : '');
            logInfo('Replaying captured ' + f.method.toUpperCase() + ' form: ' + action);
            const r = await fetchBlob(u, post ? { method: 'POST', body: f.query, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : null);
            if (r && r.blob.size && !isHtml(r.resp)) { got = r; break; }
          } catch (_) { }
        }
      }
    }

    if (!got || !got.blob.size || isHtml(got.resp)) {
      // ADP's concurrent-session guard: the file server refuses downloads when
      // the account is also logged in elsewhere. No retry fixes this.
      if (/logged in to ADP Workforce Now in another browser|another browser/i.test(viewerHtml)) {
        logError(label + ': ADP refused the download — this account is logged in to ADP in ANOTHER browser/profile. Close the other ADP session (or log out there), then re-run.');
        return { ok: false, sig: topSig };
      }
      logWarn(label + ': could not reach the real file — opening the viewer normally (default name)');
      logInfo('Diagnostics — URLs: ' + JSON.stringify(capturedUrls()) +
        ' | forms: ' + JSON.stringify(capturedForms().map(f => f.method + ' ' + f.action)) +
        ' | viewer HTML (' + viewerHtml.length + ' chars) mentions instanceRefId=' + /instanceRefId/i.test(viewerHtml) +
        ' BIRT=' + /BIRT/.test(viewerHtml) + ' downloadTemplate=' + /downloadTemplate/i.test(viewerHtml) +
        ' | body: ' + JSON.stringify(viewerHtml.slice(0, 300)));
      try { window.open(abs); } catch (_) { }
      return { ok: false, sig: topSig };
    }

    const blob = got.blob;
    let fname = fileName;
    if (!fname) {
      const cd = got.resp.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i);
      if (m) { try { fname = decodeURIComponent(m[1].trim()); } catch (_) { fname = m[1].trim(); } }
      if (!fname) {
        const pathName = (got.resp.url || '').split('?')[0].split('/').pop() || '';
        if (/\.(xlsx?|csv)$/i.test(pathName)) fname = pathName;
      }
      if (!fname) fname = 'HistoricalPayroll.xlsx';
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
    return { ok: true, sig: topSig };
  }

  // ────────────────────────── step-list assembly ────────────────────────

  const NAV_STEPS = [
    { name: 'Open Reports & Analytics menu', fn: () => stepOpenReportsMenu() },
    { name: 'Open All Standard Reports', fn: () => stepClickAllStandardReports() },
    { name: 'Search for ' + REPORT_SEARCH_TERM, fn: () => stepSearchDojoReport(REPORT_SEARCH_TERM) },
    {
      // Wait for the results list to stop repainting, then match. If it still
      // isn't there, re-run the search and look again — the results grid
      // intermittently renders nothing at all (observed: a dump of 0 titled
      // elements on one pass, 51 on the next).
      name: 'Select ' + REPORT_TITLE + ' (' + REPORT_TYPE + ')', fn: async () => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await sleep(DOJO_PAD);
          await waitForGridToSettle();
          if (await stepSelectStandardReportByTitle(REPORT_TITLE, REPORT_TYPE)) return true;
          if (attempt < 3) {
            logWarn('Attempt ' + attempt + '/3 found nothing — re-running the search');
            await stepSearchDojoReport(REPORT_SEARCH_TERM);
          }
        }
        return false;
      }
    },
    { name: 'Wait for Run Report page', fn: () => stepWaitForRunReportPage() },
    { name: 'Wait for report sections', fn: () => stepWaitForSectionsPopulated() },
  ];

  const FIELD_STEPS = [
    { name: "Open What's Displayed", fn: async () => { const ok = await stepClickWhatsDisplayed(); await sleep(1000); return ok; } },
    {
      name: 'Select the ' + PAYROLL_HISTORY_FIELDS.length + ' payroll fields', fn: async () => {
        const ok = await stepSelectPayrollDisplayFields();
        if (!ok) logWarn('Some payroll fields could not be selected — continuing anyway');
        return true; // partial field selection is not fatal
      }
    },
  ];

  function appearanceSteps(year) {
    return [
      { name: 'Open Appearance settings', fn: async () => { await sleep(2000 + DOJO_PAD); return stepClickAppearanceSettings(); } },
      { name: 'Configure appearance for ' + year, fn: () => stepConfigureAppearanceForYear(year) },
    ];
  }

  const RUN_STEPS = [
    { name: 'Run as Excel', fn: async () => { await sleep(1500 + DOJO_PAD); return stepClickRunAsExcel(); } },
    // ADP redirects to Reports Output by itself once the run is submitted.
    { name: 'Wait for Reports Output redirect', fn: async () => { await sleep(5000); return true; } },
  ];

  function downloadSteps(year) {
    const fileName = 'HistoricalPayroll_' + year + '.xlsx';
    return [
      {
        name: 'Download ' + fileName, fn: async () => {
          try {
            const res = await downloadRenamed(fileName, String(year));
            // Claim the row only once the attempt has finished, so a paused and
            // resumed retry can re-claim the same row instead of hanging.
            if (res && res.sig) downloadedSigs.add(res.sig);
            return true;
          } catch (err) {
            if (err && (err.aborted || err.paused)) throw err;
            logWarn('Download failed for ' + year + ' — fetch it from Reports Output manually (' +
              ((err && err.message) || err) + ')');
            return true; // the report ran; a naming failure must not fail the year
          }
        }
      },
    ];
  }

  // Full 13-step chain for ONE Time Off report. Navigation restarts from the
  // top each time, because running a report navigates away to Reports Output.
  function timeOffSteps(reportName, fromDate, toDate) {
    const fileName = safeFileName(reportName) + '.xlsx';
    return [
      { name: 'Open Reports & Analytics menu', fn: () => stepOpenReportsMenu() },
      { name: 'Open All Standard Reports', fn: () => stepClickAllStandardReports() },
      { name: 'Open the ' + TIME_OFF_CATEGORY + ' category', fn: async () => { await sleep(DOJO_PAD); return stepClickStandardCategory(TIME_OFF_CATEGORY); } },
      {
        // Re-open the category and try again if the row isn't there. The grid
        // intermittently serves a stale or empty list; a second look almost
        // always finds it. Three attempts, ~40s worst case, then give up.
        name: 'Select ' + reportName, fn: async () => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            await sleep(1000);
            if (await stepSelectStandardReportByTitle(reportName, REPORT_TYPE)) return true;
            if (attempt < 3) {
              logWarn('Attempt ' + attempt + '/3 found nothing — re-opening the ' +
                TIME_OFF_CATEGORY + ' category and looking again');
              await stepClickStandardCategory(TIME_OFF_CATEGORY);
            }
          }
          return false;
        }
      },
      { name: 'Wait for Run Report page', fn: () => stepWaitForRunReportPage() },
      { name: 'Wait for report sections', fn: () => stepWaitForSectionsPopulated() },
      { name: "Open What's Displayed", fn: async () => { const ok = await stepClickWhatsDisplayed(); await sleep(1000); return ok; } },
      { name: 'Select all fields', fn: () => stepSelectAllDisplayFields() },
      { name: 'Open Appearance settings', fn: async () => { await sleep(2000 + DOJO_PAD); return stepClickAppearanceSettings(); } },
      { name: 'Set date range ' + fromDate + ' → ' + toDate, fn: () => stepConfigureDateRangeOnly(fromDate, toDate) },
      { name: 'Run as Excel', fn: async () => { await sleep(1500 + DOJO_PAD); return stepClickRunAsExcel(); } },
      { name: 'Wait for Reports Output redirect', fn: async () => { await sleep(5000); return true; } },
      {
        name: 'Download ' + fileName, fn: async () => {
          try {
            const res = await downloadRenamed(fileName, reportName);
            if (res && res.sig) downloadedSigs.add(res.sig);
            return true;
          } catch (err) {
            if (err && (err.aborted || err.paused)) throw err;
            logWarn('Download failed for ' + reportName + ' — fetch it from Reports Output manually (' +
              ((err && err.message) || err) + ')');
            return true; // the report ran; a naming failure must not fail it
          }
        }
      },
    ];
  }

  // ────────────────────────────── the flow ──────────────────────────────

  async function downloadPayrollHistoryByYear() {
    if (isRunning()) { logWarn('Already running — click Stop first.'); return; }

    logInfo('=== Historical Payroll History ===');
    resetAbort();

    const picked = await showYearPickDialog();
    if (picked === null) { setStatus('Cancelled'); logInfo('Year selection cancelled'); return; }
    if (!picked.length) { setStatus('Nothing selected'); logWarn('No years selected — nothing to download'); return; }

    setRunning(true);
    downloadedSigs = new Set(); // fresh per run: de-dups Reports Output rows across years
    logInfo('Selected year(s): ' + picked.join(', '));

    const succeeded = [];
    const failed = [];

    try {
      for (let i = 0; i < picked.length; i++) {
        const year = picked[i];
        logInfo('───── ' + year + ' (' + (i + 1) + '/' + picked.length + ') ─────');
        setStatus(year + ' (' + (i + 1) + '/' + picked.length + ')…');

        const steps = NAV_STEPS
          .concat(FIELD_STEPS)
          .concat(appearanceSteps(year))
          .concat(RUN_STEPS)
          .concat(downloadSteps(year));

        try {
          await runSteps(steps, { year: year });
          succeeded.push(year);
          logSuccess(year + ' complete');
        } catch (err) {
          if (err && err.aborted) throw err; // Stop kills the whole run
          failed.push(year);
          logError(year + ' failed: ' + ((err && err.message) || err));
          logWarn(year + ' failed — continuing with remaining years');
          // Clear any half-open mega-menu so the next year starts clean.
          try { dismissMegaMenuPanes(); } catch (_) { }
          await sleep(3000);
        }
      }

      const summary = 'Done: ' + succeeded.length + ' of ' + picked.length + ' succeeded' +
        (failed.length ? '. Failed: ' + failed.join(', ') : '');
      logSuccess('───── ' + summary + ' ─────');
      setStatus(summary);

    } catch (err) {
      if (err && err.aborted) {
        setStatus('Aborted by user');
        logWarn('Flow aborted by user (Stop / reset)');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + ((err && err.message) || err));
    } finally {
      setRunning(false);
    }
  }

  async function downloadTimeOffReports() {
    if (isRunning()) { logWarn('Already running — click Stop first.'); return; }

    logInfo('=== Time Off (Standard Reports) ===');
    resetAbort();

    const picked = await showItemPickDialog({
      title: 'Time Off — choose report(s)',
      hint: 'Each report downloads as its own .xlsx, with every field selected.',
      items: TIME_OFF_REPORTS,
      storageKey: TIMEOFF_KEY,
    });
    if (picked === null) { setStatus('Cancelled'); logInfo('Time Off selection cancelled'); return; }
    if (!picked.length) { setStatus('Nothing selected'); logWarn('No reports selected — nothing to download'); return; }

    setRunning(true);
    downloadedSigs = new Set(); // fresh per run: de-dups Reports Output rows across reports

    const range = timeOffDateRange();
    logInfo('Selected report(s): ' + picked.join(', '));
    logInfo('Date range for every report: ' + range.from + ' → ' + range.to);

    const succeeded = [];
    const failed = [];

    try {
      for (let i = 0; i < picked.length; i++) {
        const reportName = picked[i];
        logInfo('───── ' + reportName + ' (' + (i + 1) + '/' + picked.length + ') ─────');
        setStatus(reportName + ' (' + (i + 1) + '/' + picked.length + ')…');

        try {
          await runSteps(timeOffSteps(reportName, range.from, range.to), { report: reportName });
          succeeded.push(reportName);
          logSuccess(reportName + ' complete');
        } catch (err) {
          if (err && err.aborted) throw err; // Stop kills the whole run
          failed.push(reportName);
          logError(reportName + ' failed: ' + ((err && err.message) || err));
          logWarn(reportName + ' failed — continuing with the remaining reports');
          try { dismissMegaMenuPanes(); } catch (_) { }
          await sleep(3000);
        }
      }

      const summary = 'Done: ' + succeeded.length + ' of ' + picked.length + ' succeeded' +
        (failed.length ? '. Failed: ' + failed.join(', ') : '');
      logSuccess('───── ' + summary + ' ─────');
      setStatus(summary);

    } catch (err) {
      if (err && err.aborted) {
        setStatus('Aborted by user');
        logWarn('Flow aborted by user (Stop / reset)');
        return;
      }
      setStatus('Error — see log');
      logError('Flow error: ' + ((err && err.message) || err));
    } finally {
      setRunning(false);
    }
  }

  // Phase B adds a data set by appending one entry here plus one flow function.
  // The panel's button rail is generated from this list.
  const HISTORICAL_REPORTS = [
    { key: 'payhist', icon: '💰', label: 'Payroll History', fn: downloadPayrollHistoryByYear },
    { key: 'timeoff', icon: '🏖️', label: 'Time Off', fn: downloadTimeOffReports },
  ];

  // ───────────────────────────── year dialog ────────────────────────────

  // Prior three calendar years, ascending. The CURRENT year is deliberately
  // EXCLUDED — it is covered by the day-to-day adp-reports bot. Derived from
  // the system clock, so this rolls over on its own each January.
  function historicalYears() {
    const y = new Date().getFullYear();
    return [y - 3, y - 2, y - 1];
  }

  // Default on first run: every year ticked.
  function loadYearSelection(years) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(YEARS_KEY) || '{}') || {}; } catch (_) { saved = {}; }
    const sel = {};
    years.forEach((y) => {
      sel[y] = Object.prototype.hasOwnProperty.call(saved, String(y)) ? !!saved[String(y)] : true;
    });
    return sel;
  }

  function saveYearSelection(sel) {
    try { localStorage.setItem(YEARS_KEY, JSON.stringify(sel)); } catch (_) { }
  }

  // Generic vertical checkbox picker for a list of named items (report names).
  // Resolves to the selected names, or null on Cancel / Stop.
  function showItemPickDialog(cfg) {
    return new Promise((resolve) => {
      const existing = document.getElementById('hd-item-pick');
      if (existing) existing.remove();

      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(cfg.storageKey) || '{}') || {}; } catch (_) { saved = {}; }

      const overlay = document.createElement('div');
      overlay.id = 'hd-item-pick';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,0,22,.62);z-index:2147483647;' +
        'display:flex;align-items:center;justify-content:center;font:14px "Segoe UI",system-ui,sans-serif;';

      const box = document.createElement('div');
      box.style.cssText = 'width:380px;max-width:92vw;color:#e9dcff;border-radius:16px;overflow:hidden;' +
        'background:linear-gradient(165deg,rgba(22,2,46,.98),rgba(58,0,86,.96));' +
        'border:1px solid rgba(170,120,255,.3);box-shadow:0 18px 50px rgba(0,0,0,.6);';

      const head = document.createElement('div');
      head.style.cssText = 'padding:14px 16px;font-weight:700;font-size:15px;color:#fff;' +
        'background:linear-gradient(90deg,rgba(90,40,160,.45),rgba(140,70,220,.12));' +
        'border-bottom:1px solid rgba(170,120,255,.2);';
      head.textContent = cfg.title;
      box.appendChild(head);

      const body = document.createElement('div');
      body.style.cssText = 'padding:12px 16px;';

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11.5px;color:#c2a8ff;margin-bottom:9px;';
      hint.textContent = cfg.hint;
      body.appendChild(hint);

      const checks = [];
      cfg.items.forEach((item) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 11px;margin-bottom:7px;cursor:pointer;' +
          'background:rgba(90,40,160,.26);border:1px solid rgba(170,120,255,.2);border-radius:10px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = Object.prototype.hasOwnProperty.call(saved, item) ? !!saved[item] : true;
        cb.style.cssText = 'width:16px;height:16px;accent-color:#8c46dc;cursor:pointer;';
        const txt = document.createElement('span');
        txt.style.cssText = 'font-weight:600;color:#f2eaff;font-size:12.5px;';
        txt.textContent = item;
        row.appendChild(cb);
        row.appendChild(txt);
        body.appendChild(row);
        checks.push({ item: item, cb: cb });
      });

      const toggleRow = document.createElement('div');
      toggleRow.style.cssText = 'display:flex;gap:8px;margin-top:2px;';
      const allBtn = document.createElement('button');
      allBtn.textContent = 'Select all';
      const noneBtn = document.createElement('button');
      noneBtn.textContent = 'Select none';
      [allBtn, noneBtn].forEach((b) => {
        b.style.cssText = 'flex:1;padding:6px;border:1px solid rgba(170,120,255,.25);background:transparent;' +
          'color:#c2a8ff;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;';
      });
      allBtn.addEventListener('click', (e) => { e.preventDefault(); checks.forEach(c => { c.cb.checked = true; }); });
      noneBtn.addEventListener('click', (e) => { e.preventDefault(); checks.forEach(c => { c.cb.checked = false; }); });
      toggleRow.appendChild(allBtn);
      toggleRow.appendChild(noneBtn);
      body.appendChild(toggleRow);

      box.appendChild(body);

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;padding:12px 16px 16px;';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'flex:1;padding:10px;border:1px solid rgba(170,120,255,.35);background:transparent;' +
        'color:#c2a8ff;border-radius:10px;cursor:pointer;font-weight:600;';
      const okBtn = document.createElement('button');
      okBtn.textContent = 'Download selected';
      okBtn.style.cssText = 'flex:2;padding:10px;border:0;border-radius:10px;cursor:pointer;font-weight:700;color:#fff;' +
        'background:linear-gradient(120deg,#5a28a0,#8c46dc 45%,#b26cf0);';
      btns.appendChild(cancelBtn);
      btns.appendChild(okBtn);
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
      okBtn.addEventListener('click', () => {
        const out = {};
        checks.forEach((c) => { out[c.item] = c.cb.checked; });
        try { localStorage.setItem(cfg.storageKey, JSON.stringify(out)); } catch (_) { }
        finish(checks.filter((c) => c.cb.checked).map((c) => c.item));
      });

      const poll = setInterval(() => {
        if (shouldAbort() || !document.body.contains(overlay)) finish(null);
      }, 200);
    });
  }

  function showYearPickDialog() {
    return new Promise((resolve) => {
      const existing = document.getElementById('hd-year-pick');
      if (existing) existing.remove();

      const years = historicalYears();
      const sel = loadYearSelection(years);

      const overlay = document.createElement('div');
      overlay.id = 'hd-year-pick';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,0,22,.62);z-index:2147483647;' +
        'display:flex;align-items:center;justify-content:center;font:14px "Segoe UI",system-ui,sans-serif;';

      const box = document.createElement('div');
      box.style.cssText = 'width:360px;max-width:92vw;color:#e9dcff;border-radius:16px;overflow:hidden;' +
        'background:linear-gradient(165deg,rgba(22,2,46,.98),rgba(58,0,86,.96));' +
        'border:1px solid rgba(170,120,255,.3);box-shadow:0 18px 50px rgba(0,0,0,.6);';

      const head = document.createElement('div');
      head.style.cssText = 'padding:14px 16px;font-weight:700;font-size:15px;color:#fff;' +
        'background:linear-gradient(90deg,rgba(90,40,160,.45),rgba(140,70,220,.12));' +
        'border-bottom:1px solid rgba(170,120,255,.2);';
      head.textContent = 'Payroll History — choose year(s)';
      box.appendChild(head);

      const body = document.createElement('div');
      body.style.cssText = 'padding:12px 16px;';

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11.5px;color:#c2a8ff;margin-bottom:8px;';
      hint.textContent = 'Select the year(s) to download. One consolidated file per year.';
      body.appendChild(hint);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:7px;margin-bottom:4px;';
      const checks = [];
      years.forEach((y) => {
        const chip = document.createElement('label');
        chip.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;gap:6px;' +
          'padding:10px 4px;cursor:pointer;border-radius:10px;' +
          'background:rgba(90,40,160,.28);border:1px solid rgba(170,120,255,.22);';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!sel[y];
        cb.style.cssText = 'width:15px;height:15px;accent-color:#8c46dc;cursor:pointer;';
        const txt = document.createElement('span');
        txt.style.cssText = 'font-weight:600;color:#f2eaff;font-size:13px;';
        txt.textContent = String(y);
        chip.appendChild(cb);
        chip.appendChild(txt);
        row.appendChild(chip);
        checks.push({ year: y, cb: cb });
      });
      body.appendChild(row);
      box.appendChild(body);

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;padding:12px 16px 16px;';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'flex:1;padding:10px;border:1px solid rgba(170,120,255,.35);background:transparent;' +
        'color:#c2a8ff;border-radius:10px;cursor:pointer;font-weight:600;';
      const okBtn = document.createElement('button');
      okBtn.textContent = 'Download selected';
      okBtn.style.cssText = 'flex:2;padding:10px;border:0;border-radius:10px;cursor:pointer;font-weight:700;color:#fff;' +
        'background:linear-gradient(120deg,#5a28a0,#8c46dc 45%,#b26cf0);';
      btns.appendChild(cancelBtn);
      btns.appendChild(okBtn);
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
      okBtn.addEventListener('click', () => {
        const out = {};
        checks.forEach((c) => { out[c.year] = c.cb.checked; });
        saveYearSelection(out);
        finish(checks.filter((c) => c.cb.checked).map((c) => c.year));
      });

      const poll = setInterval(() => {
        if (shouldAbort() || !document.body.contains(overlay)) finish(null);
      }, 200);
    });
  }

  // ─────────────────────────────── panel ────────────────────────────────

  function injectStyles() {
    if (document.getElementById('hd-bot-style')) return;
    const css = document.createElement('style');
    css.id = 'hd-bot-style';
    css.textContent = [
      // Bottom-LEFT, so it never collides with the day-to-day ADP Bot panel.
      '#hd-bot-panel{position:fixed;bottom:24px;left:24px;z-index:2147483646;width:324px;',
      " font:13px/1.45 'Segoe UI',system-ui,-apple-system,sans-serif;color:#e4d9ff;",
      ' background:linear-gradient(165deg,rgba(20,2,42,.97) 0%,rgba(48,0,80,.95) 55%,rgba(26,0,48,.97) 100%);',
      ' border:1px solid rgba(170,120,255,.28);border-radius:18px;overflow:hidden;',
      ' box-shadow:0 8px 40px rgba(10,0,30,.6),0 0 24px rgba(140,70,220,.18);backdrop-filter:blur(14px);}',
      '#hd-bot-panel *{box-sizing:border-box;font-family:inherit;}',
      '.hdbot-head{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:move;user-select:none;',
      ' background:linear-gradient(90deg,rgba(90,40,160,.45),rgba(140,70,220,.12));border-bottom:1px solid rgba(170,120,255,.15);}',
      '.hdbot-avatar{width:34px;height:34px;border-radius:11px;flex:0 0 34px;display:flex;align-items:center;justify-content:center;',
      ' background:linear-gradient(135deg,#8c46dc,#b26cf0);font-size:17px;color:#fff;',
      ' box-shadow:0 0 14px rgba(140,70,220,.55);animation:hdbot-breathe 3.2s ease-in-out infinite;}',
      '@keyframes hdbot-breathe{0%,100%{box-shadow:0 0 10px rgba(140,70,220,.45)}50%{box-shadow:0 0 22px rgba(178,108,240,.75)}}',
      '.hdbot-titlebox{flex:1;min-width:0;}',
      '.hdbot-title{margin:0;font-size:14px;font-weight:700;color:#fff;letter-spacing:.3px;}',
      '.hdbot-sub{font-size:9.5px;color:#c2a8ff;letter-spacing:1px;text-transform:uppercase;}',
      '.hdbot-ver{font-size:9px;color:#d3bcff;background:rgba(90,40,160,.4);padding:2px 7px;border-radius:999px;border:1px solid rgba(170,120,255,.22);}',
      '.hdbot-chev{background:rgba(190,150,255,.1);border:1px solid rgba(190,150,255,.25);border-radius:8px;cursor:pointer;',
      ' width:26px;height:26px;color:#cbb0ff;font-size:11px;transition:all .25s;display:flex;align-items:center;justify-content:center;}',
      '.hdbot-chev:hover{background:rgba(190,150,255,.22);color:#fff;}',
      '.hdbot-chev.min{transform:rotate(180deg);}',
      '.hdbot-statuschip{display:flex;align-items:center;gap:8px;margin:10px 14px 8px;padding:7px 11px;border-radius:10px;',
      ' background:rgba(90,40,160,.22);border:1px solid rgba(170,120,255,.14);font-size:11px;color:#d3bcff;min-height:30px;}',
      '.hdbot-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;flex:0 0 8px;',
      ' box-shadow:0 0 8px rgba(74,222,128,.8);animation:hdbot-pulse 2s ease-in-out infinite;}',
      '@keyframes hdbot-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.78)}}',
      '#hd-bot-btnrow{display:grid;grid-template-columns:1fr;gap:7px;padding:2px 14px 6px;}',
      '.hdbot-item{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid rgba(190,150,255,.16);',
      ' border-radius:11px;padding:11px 12px;cursor:pointer;background:rgba(90,40,160,.26);color:#eadfff;',
      ' font-weight:600;font-size:12.5px;transition:all .22s;}',
      '.hdbot-item:hover{background:rgba(140,70,220,.42);border-color:rgba(190,150,255,.45);transform:translateX(3px);color:#fff;}',
      '.hdbot-ico{width:26px;height:26px;border-radius:8px;flex:0 0 26px;display:flex;align-items:center;justify-content:center;',
      ' background:rgba(140,70,220,.32);font-size:13px;}',
      '.hdbot-util{display:grid;grid-template-columns:1fr 1fr;gap:7px;}',
      '.hdbot-ghost{border:1px solid rgba(190,150,255,.3);background:transparent;border-radius:10px;padding:8px;color:#c2a8ff;',
      ' cursor:pointer;font-weight:600;font-size:11.5px;transition:all .22s;}',
      '.hdbot-ghost:disabled{opacity:.4;cursor:default;}',
      '.hdbot-ghost.pause:hover:not(:disabled){border-color:rgba(255,205,120,.55);color:#ffd79d;background:rgba(255,190,99,.1);}',
      '.hdbot-ghost.resume{border-color:rgba(120,230,150,.5);color:#8bf0ab;}',
      '.hdbot-ghost.resume:hover{background:rgba(99,255,150,.1);}',
      '.hdbot-ghost.stop:hover{border-color:rgba(255,120,120,.55);color:#ff9d9d;background:rgba(255,99,99,.1);}',
      '.hdbot-logrow{display:flex;align-items:center;justify-content:space-between;margin:4px 14px 4px;}',
      '.hdbot-loglabel{font-size:9.5px;color:#a483d8;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;}',
      '.hdbot-mini{padding:3px 9px;border:1px solid rgba(190,150,255,.25);background:rgba(90,40,160,.3);color:#dcc8ff;',
      ' border-radius:7px;cursor:pointer;font-size:10px;transition:all .2s;margin-left:4px;}',
      '.hdbot-mini:hover{background:rgba(140,70,220,.5);color:#fff;}',
      "#hd-bot-log{height:130px;overflow-y:auto;margin:0 14px 14px;background:rgba(10,0,22,.55);",
      " border:1px solid rgba(170,120,255,.14);border-radius:11px;padding:8px 10px;font:10.5px/1.45 'Cascadia Code',Consolas,monospace;}",
      '#hd-bot-log::-webkit-scrollbar,#hd-bot-content::-webkit-scrollbar{width:6px;}',
      '#hd-bot-log::-webkit-scrollbar-thumb,#hd-bot-content::-webkit-scrollbar-thumb{background:rgba(170,120,255,.35);border-radius:3px;}',
      '#hd-bot-log::-webkit-scrollbar-track,#hd-bot-content::-webkit-scrollbar-track{background:transparent;}',
      '#hd-bot-content{max-height:calc(100vh - 110px);overflow-y:auto;overflow-x:hidden;}',
    ].join('\n');
    document.head.appendChild(css);
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    injectStyles();

    const wrapper = document.createElement('div');
    wrapper.id = PANEL_ID;

    // ── Header ──
    const titleRow = document.createElement('div');
    titleRow.className = 'hdbot-head';

    const avatar = document.createElement('div');
    avatar.className = 'hdbot-avatar';
    avatar.textContent = '📚';
    titleRow.appendChild(avatar);

    const titleBox = document.createElement('div');
    titleBox.className = 'hdbot-titlebox';
    const title = document.createElement('div');
    title.className = 'hdbot-title';
    title.textContent = 'Historical Data Bot';
    const sub = document.createElement('div');
    sub.className = 'hdbot-sub';
    sub.textContent = 'Prior-year extracts';
    titleBox.appendChild(title);
    titleBox.appendChild(sub);
    titleRow.appendChild(titleBox);

    const versionTag = document.createElement('span');
    versionTag.className = 'hdbot-ver';
    versionTag.textContent = 'v' + SCRIPT_VERSION;
    titleRow.appendChild(versionTag);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'hdbot-chev';
    toggleBtn.textContent = '▾';
    titleRow.appendChild(toggleBtn);
    wrapper.appendChild(titleRow);

    const contentDiv = document.createElement('div');
    contentDiv.id = 'hd-bot-content';

    const HOME_MARGIN = 24;

    // Snap back to the bottom-LEFT home corner.
    function snapHome() {
      wrapper.style.right = 'auto';
      wrapper.style.top = 'auto';
      wrapper.style.left = HOME_MARGIN + 'px';
      wrapper.style.bottom = HOME_MARGIN + 'px';
    }

    // Cap the maximized panel's content so it never spills past the viewport
    // bottom — WITHOUT moving the panel (no jumping).
    function capContent() {
      const margin = 16;
      const rect = titleRow.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - margin;
      contentDiv.style.maxHeight = Math.max(150, below) + 'px';
    }

    // On maximize: keep the chip where it is and grow toward whichever vertical
    // side has more room.
    function expandFromChip() {
      const margin = 16;
      const rect = titleRow.getBoundingClientRect();
      const headH = rect.height;
      wrapper.style.left = rect.left + 'px';
      wrapper.style.right = 'auto';
      const spaceBelow = window.innerHeight - rect.top;
      const spaceAbove = rect.bottom;
      if (spaceBelow >= spaceAbove) {
        wrapper.style.top = rect.top + 'px';
        wrapper.style.bottom = 'auto';
        contentDiv.style.maxHeight = Math.max(150, spaceBelow - headH - margin) + 'px';
      } else {
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
        contentDiv.style.display = 'none';
        wrapper.style.width = 'auto';
        snapHome();
      } else {
        contentDiv.style.display = 'block';
        wrapper.style.width = '324px';
        expandFromChip();
      }
    }
    toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    window.addEventListener('resize', () => { if (!minimized) capContent(); });

    // ── Drag by the title bar ──
    let dragMoved = false;
    (function makeDraggable() {
      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

      titleRow.addEventListener('mousedown', (e) => {
        if (e.target === toggleBtn) return;
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
        const nl = Math.max(0, Math.min(ox + dx, window.innerWidth - wrapper.offsetWidth));
        const nt = Math.max(0, Math.min(oy + dy, window.innerHeight - wrapper.offsetHeight));
        wrapper.style.left = nl + 'px';
        wrapper.style.top = nt + 'px';
      });
      document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        if (dragMoved && !minimized) capContent();
      });
    })();

    // A real click on the title (not a drag) toggles collapse.
    titleRow.addEventListener('click', () => {
      if (dragMoved) { dragMoved = false; return; }
      togglePanel();
    });

    // ── Status chip ──
    const statusChip = document.createElement('div');
    statusChip.className = 'hdbot-statuschip';
    const statusDot = document.createElement('span');
    statusDot.className = 'hdbot-dot';
    statusChip.appendChild(statusDot);
    const status = document.createElement('span');
    status.id = 'hd-bot-status';
    status.textContent = 'Idle — ready';
    statusChip.appendChild(status);
    contentDiv.appendChild(statusChip);

    // ── Report buttons, generated from the registry ──
    const btnRow = document.createElement('div');
    btnRow.id = 'hd-bot-btnrow';

    for (const report of HISTORICAL_REPORTS) {
      const b = document.createElement('button');
      b.className = 'hdbot-item';
      b.id = 'hd-btn-' + report.key;
      const ico = document.createElement('span');
      ico.className = 'hdbot-ico';
      ico.textContent = report.icon;
      b.appendChild(ico);
      b.appendChild(document.createTextNode(report.label));
      b.addEventListener('click', () => {
        if (isRunning()) { logWarn('Already running — click Stop first.'); return; }
        Promise.resolve()
          .then(() => report.fn())
          .catch((err) => {
            if (err && err.aborted) { logWarn('Aborted by user'); setStatus('Aborted'); }
            else { logError('Run failed: ' + ((err && err.message) || err)); setStatus('Error — see log'); }
            setRunning(false);
          });
      });
      btnRow.appendChild(b);
    }

    // ── Pause / Stop ──
    const utilRow = document.createElement('div');
    utilRow.className = 'hdbot-util';

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hdbot-ghost pause';
    pauseBtn.id = 'hd-bot-pause';
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.addEventListener('click', () => {
      if (isPaused()) {
        requestResume();
        logInfo('Resume requested');
      } else {
        if (!isRunning()) { logInfo('Nothing running to pause'); return; }
        requestPause();
        logWarn('Pause requested — holding at the current step (≤100ms)');
        setStatus('Pausing…');
      }
      renderControls();
    });
    utilRow.appendChild(pauseBtn);

    const stopBtn = document.createElement('button');
    stopBtn.className = 'hdbot-ghost stop';
    stopBtn.textContent = '⏹ Stop / reset';
    stopBtn.addEventListener('click', () => {
      if (!isRunning()) {
        logInfo('Stop / reset clicked — nothing running');
        setStatus('Idle — ready');
        resetAbort();
        renderControls();
        return;
      }
      requestAbort();
      logWarn('Stop requested — aborting at next opportunity (≤100ms)');
      setStatus('Stopping…');
      renderControls();
    });
    utilRow.appendChild(stopBtn);
    btnRow.appendChild(utilRow);

    // Keep the Pause button's label and enabled state honest while a flow runs.
    function renderControls() {
      if (isPaused()) {
        pauseBtn.textContent = '▶ Resume';
        pauseBtn.classList.add('resume');
        pauseBtn.disabled = false;
      } else {
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.classList.remove('resume');
        pauseBtn.disabled = !isRunning();
      }
    }
    setInterval(renderControls, 300);
    renderControls();

    wrapper.appendChild(contentDiv);
    contentDiv.appendChild(btnRow);

    // ── Activity log ──
    const logRow = document.createElement('div');
    logRow.className = 'hdbot-logrow';
    const logLabel = document.createElement('span');
    logLabel.textContent = '⌁ Activity Log';
    logLabel.className = 'hdbot-loglabel';
    logRow.appendChild(logLabel);
    const logActions = document.createElement('div');
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.className = 'hdbot-mini';
    clearBtn.addEventListener('click', () => { if (logEl) logEl.innerHTML = ''; });
    logActions.appendChild(clearBtn);
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'hdbot-mini';
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
    logEl.id = 'hd-bot-log';
    contentDiv.appendChild(logEl);

    document.body.appendChild(wrapper);
    flushPendingLogs();
    logInfo('Historical Data Bot ready (v' + SCRIPT_VERSION + ') — start from the ADP home page');
  }

  // ─────────────────────────────── init ─────────────────────────────────

  function init() {
    // Belt and braces alongside @noframes: ADP embeds a SAME-ORIGIN Dojo iframe,
    // and without this guard Tampermonkey builds a second panel inside it.
    if (window.top !== window.self) return;
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    buildPanel();
  }

  init();
})();
