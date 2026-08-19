  // ==UserScript==
  // @name         Paycom Daily Reports Automation
  // @namespace    https://www.paycomonline.net/
  // @version      0.24.0
  // @description  Census report (full) + Prior Payroll YTD report (Mantle schedule page → confirm dialog → fill → generate → download as PriorPayroll_*.csv → loop, past quarters consolidated / current quarter per-pay-period) + Scheduled Deductions report (rpt_id=8) + Tax Profile report (rpt_id=15) + Doc Dashboard: Download All Documents (fetch→blob, paginated, resumable, persistent per-document run log + CSV export)
  // @match        https://www.paycomonline.net/v4/cl/*
  // @run-at       document-end
  // @grant        none
  // ==/UserScript==

  (function () {
    'use strict';

    // Shown in the panel header. Read from Tampermonkey, never hardcoded — a
    // second copy of the version silently goes stale, and then the panel cannot
    // be used to tell which build is actually loaded during a live run.
    const SCRIPT_VERSION = (() => {
      try {
        if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) {
          return GM_info.script.version;
        }
      } catch (_) { }
      return '0.23.1';
    })();

    const STATE_KEY = 'paycomBot.state';
    const STATES = { IDLE: 'IDLE', RUNNING: 'RUNNING' };

    const CONFIG = {
      reportType: 'Employee',
      arwSavedReportsUrl: 'https://www.paycomonline.net/v4/cl/srw-reportwriter-savedReport.php?src=rptcenter&override-report-hub=1',
    };

    // ====== REQUIRED FIELDS (verbatim from existing script) ======
    const RAW_REQUIRED_FIELDS = `
  Employee Code
  Legal Firstname
  Legal Middle Name
  Legal Lastname
  SS Number
  Position
  Department Desc
  Personal Email
  Work Email
  Position Level
  Annual Salary
  # Fed Allowances
  Bonus Acct Code
  Birth Date (MM/DD/YYYY)
  Act. Marital Status
  Legal Employee Suffix
  Salary
  #State Exemptions/Allowances
  Bonus Bank
  Employee Status
  Hire Date
  Most Recent Hire Date
  Termination Date
  DOL Status
  Exempt Status
  Commission Only
  1099 Electronic Only Election
  Bonus Deposit Method
  Emergency 1 Contact
  Emergency 1 Phone
  Emergency 1 Language
  Emergency 1 Relationship
  Emergency 2 Contact
  Emergency 2 Phone
  Emergency 2 Language
  Emergency 2 Relationship
  Emergency 3 Phone
  Emergency 3 Language
  Emergency 3 Contact
  Emergency 3 Relationship
  DriversLicense
  StateLicenseIssued
  DLExpirationDate
  Pay Frequency
  ACA Electronic Only Election
  Bonus Rout Code
  EEO1 Category
  Pay Type
  Additional
  Bonus Status
  Last _Pay_ Change
  EEO1 Disabled Status
  Scheduled Pay Period Hours
  Adopted Dependent Exemptions
  Bonus Type Code
  EEO1 Ethnicity
  Work Location
  Workers Comp Code
  Age/Blindness (VAW)
  Commission Acct Code
  Workers Comp Desc
  Block FUTA
  Commission Bank
  SOC Code
  Position Code
  Workers Comp Rate
  Block Fed Tax?
  Commission Deposit Method
  Gender
  Full-Time Employee Factor
  Rate_1
  Block MED
  Commission Rout Code
  Tobacco User
  Primary Address Line 1
  Block SSC
  Commission Status
  Union Code
  Primary Address Line 2
  Block SUI
  Commission Type Code
  Termination Reason
  Primary City/Municipality
  Block State Tax?
  Dist 1 Acct Code
  Supervisor Primary Code
  Primary State/Province
  Blocked Local Taxes?
  Dist 1 Amount
  Supervisor Primary Legal Name
  Primary Zip/Postal Code
  Client Local Tax 1
  Dist 1 Bank
  Supervisor Primary
  Primary Country Code
  Client Local Tax 2
  Dist 1 Deposit Method
  Termination Type
  Mailing Address Line 1
  Client Local Tax 3
  Dist 1 Rout Code
  Mailing Address Line 2
  Client Local Tax 4
  Dist 1 Status
  Mailing City/Municipality
  Client Local Tax 5
  Dist 1 Type Code
  Mailing State/Province
  Dist 2 Acct Code
  Delaware Paid Leave EE %
  Dist 2 Amount
  Mailing Country Code
  Mailing Zip/Postal Code
  Delaware Paid Leave EE Exempt
  Dist 2 Bank
  Street
  Delaware Paid Leave ER %
  Dist 2 Deposit Method
  City
  Dependent Exemptions
  Dist 2 Rout Code
  State
  Dependents Claimed
  Dist 2 Status
  Zipcode
  EIC File Status
  Dist 2 Type Code
  Primary Phone
  Estimated Deductions
  Dist 3 Amount
  Manager Level
  Fed Addl %
  Fed Deductions $
  Fed Multiple Jobs?
  Dist 3 Rout Code
  Company FEIN
  Fed Filing Status
  Dist 3 Status
  Independent Contractor
  Fed Filing Status Description
  Dist 3 Type Code
  Dist 3 Acct Code
  Dist 3 Bank
  Dist 3 Deposit Method
  Work Location Address
  Fed Multiple Jobs?
  Dist 4 Acct Code
  Work Location State
  Fed Other Income $
  Dist 4 Amount
  Work Location Country
  First-time qualifying dependent exemption
  Dist 4 Bank
  Work _Location_City
  Line 2 Allowances
  Dist 4 Deposit Method
  Work _Location_ID
  Lives-in State
  Dist 4 Status
  Department
  Dist 4 Type Code
  Local Exemptions
  Dist 4 Type Code
  Dist 4 Rout Code
  Local Tax
  Dist 5 Acct Code
  Pronoun
  Dist 5 Amount
  Dist 5 Bank
  Local Tax 2
  Dist 5 Deposit Method
  Local Tax 3
  Dist 5 Rout Code
  Local Tax 4
  Dist 5 Status
  Local Tax 6
  Dist 5 Type Code
  MA Blindness (Employee)
  Dist 6 Acct Code
  MA Blindness (Spouse)
  Dist 6 Amount
  Maine EE PFML %
  Dist 6 Bank
  Maine ER PFML %
  Dist 6 Deposit Method
  Minnesota Location
  Dist 6 Rout Code
  Non-Resident Alien
  Dist 6 Status
  Non-Resident Alien WH Adj
  Dist 6 Type Code
  Part C Allowances
  Dist 7 Acct Code
  Personal
  Dist 7 Amount
  SUI State
  Dist 7 Bank
  Spouse Income
  Dist 7 Deposit Method
  State Addl $
  Dist 7 Rout Code
  State Addl %
  Dist 7 Status
  State Exemption Amt
  Dist 7 Type Code
  State Filing Status
  Dist 8 Acct Code
  State Filing Status Desc
  Dist 8 Amount
  Tax EIC
  Dist 8 Bank
  Use Employee Address
  Dist 8 Deposit Method
  Vermont Child Care EE %
  Dist 8 Rout Code
  Vermont Child Care ER %
  Dist 8 Status
  W2 Electronic Only Election
  Dist 8 Type Code
  W2 Info 12DD (2011)
  W2 Info 12DD (2022)
  Fund Distributions Before Net Pay
  Has D. Deposit
  W2 Info 12DD (2013)
  Net Acct Code
  W2 Info 12DD (2014)
  Net Bank
  W2 Info 12DD (2015)
  Net Deposit Method
  W2 Info 12DD (2016)
  Net Rout Code
  W2 Info 12DD (2017)
  Net Status
  W2 Info 12DD (2018)
  Net Type Code
  W2 Info 12DD (2019)
  W2 Info 12DD (2020)
  W2 Info 12DD (2021)
  W2 Info 12DD (2022)
  W2 Info 12DD (2023)
  W2 Info 12DD (2024)
  W2 Info 12DD (2025)
  WA EE Family Leave %
  WA EE Medical Leave %
  WA ER Family Leave %
  WA ER Medical Leave %
  Works-in State
  UniformBottom
  UniformTop
  `;
    // ====== END field list ======

    // Activity log, persisted so it survives page reloads between steps. Two
    // stores: a rolling ~50-line one the panel displays live, and a FULL one
    // (5000-line safety cap, not a normal limit) that is never trimmed and is
    // NOT cleared by Stop/reset or starting a new flow — only an explicit
    // "Clear" in the panel empties it. Without this, a long flow (Prior
    // Payroll across many pay periods, Download All Reports) would lose most
    // of its history by the time it finished, and the only visible trace was
    // ever a single rotating banner line with no history at all.
    const LOG_KEY = 'paycomBot.log';
    const FULL_LOG_KEY = 'paycomBot.fulllog';
    function getLogLines() { try { const a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
    function clearLogLines() { try { localStorage.removeItem(LOG_KEY); } catch (_) {} renderLogPanel(); }
    function clearFullLog() { try { localStorage.removeItem(FULL_LOG_KEY); } catch (_) {} }
    function appendFullLog(line) {
      let arr;
      try { arr = JSON.parse(localStorage.getItem(FULL_LOG_KEY) || '[]'); if (!Array.isArray(arr)) arr = []; } catch (_) { arr = []; }
      arr.push(line);
      while (arr.length > 5000) arr.shift();
      try { localStorage.setItem(FULL_LOG_KEY, JSON.stringify(arr)); } catch (_) {}
    }
    function renderLogPanel() {
      if (!panelEl) return;
      const el = panelEl.querySelector('.pcb-log');
      if (el) { el.textContent = getLogLines().join('\n'); el.scrollTop = el.scrollHeight; }
    }

    const log = (...args) => {
      console.log('[PaycomBot]', ...args);
      let t = ''; try { t = new Date().toLocaleTimeString(); } catch (_) {}
      const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      const line = (t ? t + '  ' : '') + msg;
      const arr = getLogLines();
      arr.push(line);
      while (arr.length > 50) arr.shift();
      try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (_) {}
      appendFullLog(line);
      renderLogPanel();
      // Mirror single-string step messages to the on-screen banner while a flow
      // is running, so the user sees each step as it happens. Multi-arg logs
      // (e.g. "PP state →", s) are technical and skipped.
      if (args.length === 1 && typeof args[0] === 'string' && !shouldAbort()) {
        try {
          const m = args[0];
          showProgressBanner(m.length > 90 ? m.slice(0, 90) + '…' : m);
        } catch (_) {}
      }
    };

    // Both modes IDLE means the user clicked Stop / reset. Used by sleep + waitFor
    // so any in-flight async work bails within ~100ms of the click.
    function shouldAbort() {
      return !isRunning() && !isPpRunning() && !isSdRunning() && !isTpRunning() && !isQpRunning();
    }

    // Abort-aware sleep: rejects with err.aborted=true if the user clicks Stop
    // partway through. Without this, the Census field-selection loop and wizard
    // transitions would keep marching through their sleeps after Stop was pressed.
    const sleep = (ms) => new Promise((resolve, reject) => {
      const start = Date.now();
      (function tick() {
        if (shouldAbort()) {
          const e = new Error('Aborted during sleep');
          e.aborted = true;
          return reject(e);
        }
        const remaining = ms - (Date.now() - start);
        if (remaining <= 0) return resolve();
        setTimeout(tick, Math.min(100, remaining));
      })();
    });

    const getState = () => localStorage.getItem(STATE_KEY) || STATES.IDLE;
    const setState = (s) => {
      if (s === STATES.IDLE) localStorage.removeItem(STATE_KEY);
      else localStorage.setItem(STATE_KEY, s);
      refreshPanel();
      log('state →', s);
    };
    const isRunning = () => getState() === STATES.RUNNING;

    function uniq(arr) {
      const seen = new Set();
      const out = [];
      for (const x of arr) { const k = String(x); if (seen.has(k)) continue; seen.add(k); out.push(x); }
      return out;
    }

    const REQUIRED_FIELDS = uniq(
      RAW_REQUIRED_FIELDS.split('\n').map(s => s.trim()).filter(Boolean)
    );

    function visible(el) {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      const st = window.getComputedStyle(el);
      return st.visibility !== 'hidden' && st.display !== 'none';
    }

    function normalize(s) {
      return (s || '')
        .replace(/ /g, ' ')
        .replace(/[‐-―−]/g, '-')
        .replace(/[#_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    function findByText(selectors, text) {
      const list = Array.isArray(selectors) ? selectors : [selectors];
      for (const sel of list) {
        for (const el of document.querySelectorAll(sel)) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t === text || t.toLowerCase() === text.toLowerCase()) return el;
        }
      }
      for (const sel of list) {
        for (const el of document.querySelectorAll(sel)) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t.toLowerCase().includes(text.toLowerCase())) return el;
        }
      }
      return null;
    }

    function makeAbortError(label) {
      const e = new Error(`Aborted by user (was waiting for ${label})`);
      e.aborted = true;
      return e;
    }

    function waitFor(predicate, { timeout = 30000, interval = 250, label = 'element' } = {}) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        (function tick() {
          if (shouldAbort()) return reject(makeAbortError(label));
          let r;
          try { r = predicate(); } catch (_) { r = null; }
          if (r) return resolve(r);
          if (Date.now() - start > timeout) return reject(new Error(`Timed out waiting for ${label}`));
          setTimeout(tick, interval);
        })();
      });
    }

    function dismissPrivacyBanner() {
      const okBtn = findByText(['button', 'a'], 'Ok');
      if (okBtn && /privacy/i.test(document.body.innerText)) {
        log('Dismissing privacy banner');
        okBtn.click();
      }
    }

    // ───────────────── Field-selection logic (from existing script) ─────────────────

    function getAllFilterCheckboxes() {
      return Array.from(document.querySelectorAll('input.filterCheckbox[type="checkbox"]'));
    }

    function getTaxSectionCheckboxes() {
      const headers = Array.from(document.querySelectorAll('.filterHeader, .filterHeaderView, .underlinedHeader'));
      const taxHeader = headers.find(h => normalize(h.textContent).includes('tax information'));
      if (!taxHeader) return [];

      let container = taxHeader;
      for (let i = 0; i < 10 && container; i++) {
        container = container.parentElement;
        if (!container) break;
        const cbs = container.querySelectorAll('input.filterCheckbox[type="checkbox"]');
        if (cbs && cbs.length > 10) return Array.from(cbs);
      }
      const direct = taxHeader.parentElement
        ? Array.from(taxHeader.parentElement.querySelectorAll('input.filterCheckbox[type="checkbox"]'))
        : [];
      return direct;
    }

    // Returns the filterCheckboxes that live inside a single category box (e.g. "HR",
    // "Position Data"). Some field labels — notably "DOL Status" — appear in more than
    // one box, so we need to disambiguate by which box a checkbox belongs to.
    // Strategy: find the box header whose direct text matches exactly, then walk up to
    // the nearest ancestor that actually contains checkboxes (that ancestor is the box
    // wrapper) and return only that box's checkboxes.
    function getSectionCheckboxes(headerText) {
      const want = normalize(headerText);
      const headers = Array.from(document.querySelectorAll('.filterHeader, .filterHeaderView, .underlinedHeader'));
      const header = headers.find(h => normalize(h.textContent) === want);
      if (!header) return [];

      let container = header;
      for (let i = 0; i < 10 && container; i++) {
        container = container.parentElement;
        if (!container) break;
        const cbs = container.querySelectorAll('input.filterCheckbox[type="checkbox"]');
        if (cbs && cbs.length > 0) return Array.from(cbs);
      }
      return [];
    }

    function checkboxKey(cb) {
      return normalize(cb.getAttribute('aria-label') || cb.value || cb.getAttribute('value') || '');
    }

    function scrollAndClick(cb) {
      cb.scrollIntoView({ behavior: 'instant', block: 'center' });
      if (!cb.checked) cb.click();
    }

    function findNextButton() {
      const candidates = Array.from(document.querySelectorAll(
        'input[type="button"], input[type="submit"], button, a, [role="button"], [onclick]'
      )).filter(el => {
        if (!visible(el)) return false;
        if (el.disabled) return false;
        if (el.getAttribute('aria-disabled') === 'true') return false;
        const text = (el.value || el.innerText || el.textContent || '').trim();
        return text === 'Next';
      });
      const ranked = candidates.sort((a, b) => {
        const order = { INPUT: 0, BUTTON: 1, A: 2 };
        return (order[a.tagName] ?? 99) - (order[b.tagName] ?? 99);
      });
      return ranked[0] || null;
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

    function detectWizardStep() {
      if (findVisibleByExactText('Output Format')) return 4;
      if (findVisibleByExactText('Selected Sorts')) return 3;
      if (findVisibleByExactText('Section Type')) return 2;
      if (getAllFilterCheckboxes().length > 100) return 1;
      return 0;
    }

    // Briefly outline an element so the user can see the script clicking it.
    // Non-blocking: the script does not wait for the flash to fade, and outline
    // / box-shadow don't affect layout, so this adds no delay and no reflow.
    function flashEl(el) {
      try {
        const o = {
          outline: el.style.outline,
          outlineOffset: el.style.outlineOffset,
          boxShadow: el.style.boxShadow,
        };
        el.style.outline = '3px solid #ff5722';
        el.style.outlineOffset = '2px';
        el.style.boxShadow = '0 0 0 4px rgba(255,87,34,0.45)';
        setTimeout(() => {
          try {
            el.style.outline = o.outline;
            el.style.outlineOffset = o.outlineOffset;
            el.style.boxShadow = o.boxShadow;
          } catch (_) {}
        }, 450);
      } catch (_) {}
    }

    function clickEl(el) {
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
      flashEl(el);
      el.click();
    }

    // A more thorough click than clickEl: dispatches the full pointer + mouse
    // event sequence. Needed for React components (e.g. the Mantle vertical
    // stepper) that bind handlers to mousedown / pointerdown rather than a plain
    // onClick — a bare element.click() never fires those.
    function robustClick(el) {
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
      flashEl(el);
      let cx = 0, cy = 0;
      try {
        const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      } catch (_) {}
      const base = { bubbles: true, cancelable: true, view: window, button: 0, clientX: cx, clientY: cy };
      const PE = window.PointerEvent || MouseEvent;
      const fire = (Ctor, type, extra) => {
        try { el.dispatchEvent(new Ctor(type, Object.assign({}, base, extra || {}))); } catch (_) {}
      };
      fire(PE, 'pointerover', { pointerId: 1, isPrimary: true });
      fire(MouseEvent, 'mouseover');
      fire(PE, 'pointerdown', { pointerId: 1, isPrimary: true });
      fire(MouseEvent, 'mousedown');
      try { if (el.focus) el.focus(); } catch (_) {}
      fire(PE, 'pointerup', { pointerId: 1, isPrimary: true });
      fire(MouseEvent, 'mouseup');
      fire(MouseEvent, 'click');
    }

    // Find a React-internal property on a DOM node by key prefix.
    function getReactKey(el, prefix) {
      try { for (const k in el) { if (k.startsWith(prefix)) return k; } } catch (_) {}
      return null;
    }
    // Read the React props stashed on a DOM node (React 16/17/18).
    function getReactProps(el) {
      const k = getReactKey(el, '__reactProps$') || getReactKey(el, '__reactEventHandlers$');
      return k ? el[k] : null;
    }

    // Last-resort click: find the React interaction handler bound to the element
    // — either as DOM-node props OR on a component fiber up the tree — and
    // invoke it directly. Per the golden rule, "when synthetic events fail,
    // manipulate directly". Returns a short diagnostic string of what it did.
    function reactClick(el) {
      if (!el) return 'reactClick: no element';
      const fake = {
        type: 'click', bubbles: true, cancelable: true, button: 0, buttons: 1,
        target: el, currentTarget: el, nativeEvent: {},
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
        isDefaultPrevented() { return false; }, isPropagationStopped() { return false; },
        persist() {},
      };
      const HANDLERS = ['onClick', 'onMouseDown', 'onMouseUp', 'onPointerDown', 'onPointerUp'];
      const fireFrom = (props, label) => {
        if (!props) return null;
        const present = HANDLERS.filter(h => typeof props[h] === 'function');
        if (!present.length) return null;
        const fired = [];
        for (const h of present) {
          try {
            props[h](Object.assign({}, fake, { type: h.slice(2).toLowerCase() }));
            fired.push(h);
          } catch (_) {}
        }
        return fired.length ? ('called [' + fired.join(',') + '] on ' + label) : null;
      };

      // 1. __reactProps$ on the element, its ancestors, then its descendants.
      const domNodes = [el];
      let p = el.parentElement;
      for (let i = 0; i < 8 && p; i++) { domNodes.push(p); p = p.parentElement; }
      try { domNodes.push(...el.querySelectorAll('*')); } catch (_) {}
      for (const n of domNodes) {
        const r = fireFrom(getReactProps(n), '<' + (n.tagName || '?').toLowerCase() + '>');
        if (r) { const m = 'reactClick: ' + r; log(m); return m; }
      }

      // 2. Walk the React fiber tree upward — catches handlers bound on a
      //    component fiber rather than a host DOM node.
      const fkey = getReactKey(el, '__reactFiber$') || getReactKey(el, '__reactInternalInstance$');
      let fiber = fkey ? el[fkey] : null;
      let depth = 0;
      while (fiber && depth < 40) {
        const t = fiber.type;
        const name = (t && (t.displayName || t.name)) || (typeof t === 'string' ? t : '?');
        const r = fireFrom(fiber.memoizedProps, 'fiber<' + name + '>');
        if (r) { const m = 'reactClick: ' + r; log(m); return m; }
        fiber = fiber.return;
        depth++;
      }

      const m = 'reactClick: NO handler found (' + domNodes.length + ' DOM nodes, ' + depth + ' fibers checked)';
      log(m);
      return m;
    }

    function showResultPanel(notFound) {
      const old = document.getElementById('paycom_field_result');
      if (old) old.remove();

      const totalChecked = getAllFilterCheckboxes().filter(cb => cb.checked).length;
      const panel = document.createElement('div');
      panel.id = 'paycom_field_result';
      Object.assign(panel.style, {
        position: 'fixed', right: '16px', bottom: '180px', zIndex: '2147483647',
        background: '#fff', borderRadius: '10px', padding: '14px 18px',
        boxShadow: '0 2px 12px rgba(0,0,0,.3)',
        fontFamily: 'system-ui, sans-serif', fontSize: '13px',
        maxWidth: '360px', width: 'max-content',
        borderLeft: notFound.length ? '4px solid #e74c3c' : '4px solid #27ae60',
      });

      const summary = document.createElement('div');
      if (notFound.length === 0) {
        summary.innerHTML =
          `<span style="color:#27ae60;font-weight:700">✓ All Required Fields Selected</span>` +
          `<br><span style="color:#888;font-size:11px">${totalChecked} total fields checked on page</span>`;
      } else {
        summary.innerHTML =
          `<span style="color:#27ae60;font-weight:700">✓ ${totalChecked} fields checked</span>` +
          ` &nbsp;|&nbsp; <span style="color:#e74c3c;font-weight:700">✗ ${notFound.length} not found</span>`;
      }
      panel.appendChild(summary);

      if (notFound.length) {
        const list = document.createElement('div');
        list.style.cssText = 'margin-top:10px;max-height:220px;overflow-y:auto;';
        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:0;padding-left:18px;';
        notFound.forEach(f => {
          const li = document.createElement('li');
          li.style.cssText = 'margin-bottom:4px;color:#c0392b;font-size:12px;';
          li.textContent = f;
          ul.appendChild(li);
        });
        list.appendChild(ul);
        panel.appendChild(list);
      }

      const closeBtn = document.createElement('span');
      closeBtn.textContent = '✕';
      Object.assign(closeBtn.style, {
        position: 'absolute', top: '6px', right: '10px',
        cursor: 'pointer', color: '#aaa', fontSize: '14px', fontWeight: '700',
      });
      closeBtn.onclick = () => panel.remove();
      panel.appendChild(closeBtn);
      document.body.appendChild(panel);
    }

    async function selectRequiredFieldsAndNext() {
      log('Starting field selection...');

      const remaining = new Map();
      for (const f of REQUIRED_FIELDS) remaining.set(normalize(f), f);

      const taxCbSet = new Set(getTaxSectionCheckboxes());
      log(`Tax section: ${taxCbSet.size} checkboxes`);

      // "DOL Status" appears in both the HR box and the Position Data box. We want the
      // HR one. Restrict that key to HR-box checkboxes — but only if we can actually
      // find the HR "DOL Status", otherwise fall back to old (match-any) behaviour.
      const DOL_KEY = normalize('DOL Status');
      const hrCbSet = new Set(getSectionCheckboxes('HR'));
      const restrictDolToHr = [...hrCbSet].some(cb => checkboxKey(cb) === DOL_KEY);
      log(`HR section: ${hrCbSet.size} checkboxes; restrict DOL Status to HR box: ${restrictDolToHr}`);

      const allCbs = getAllFilterCheckboxes();
      log(`Total checkboxes: ${allCbs.length}`);

      for (const cb of allCbs) {
        const key = checkboxKey(cb);
        if (taxCbSet.has(cb)) {
          scrollAndClick(cb);
          remaining.delete(key);
          await sleep(10);
          continue;
        }
        // Skip a non-HR "DOL Status" so the HR-box one gets matched instead.
        if (restrictDolToHr && key === DOL_KEY && !hrCbSet.has(cb)) continue;
        if (remaining.has(key)) {
          scrollAndClick(cb);
          remaining.delete(key);
          await sleep(15);
        }
      }

      if (remaining.size > 0) {
        log(`Pass 2: ${remaining.size} fields unmatched, fuzzy match…`);
        for (const cb of allCbs) {
          if (cb.checked) continue;
          const key = checkboxKey(cb);
          if (!key) continue;
          if (restrictDolToHr && key === DOL_KEY && !hrCbSet.has(cb)) continue;
          for (const [norm, orig] of remaining) {
            if (key.includes(norm) || norm.includes(key)) {
              scrollAndClick(cb);
              remaining.delete(norm);
              log(`Fuzzy matched: "${orig}" → "${key}"`);
              await sleep(15);
              break;
            }
          }
          if (remaining.size === 0) break;
        }
      }

      const notFound = [...remaining.values()];
      log('Field selection done. Not found:', notFound.length);
      if (notFound.length) log('Not found:', notFound);
      showResultPanel(notFound);

      const nextBtn = findNextButton();
      if (!nextBtn) throw new Error("Could not find visible 'Next' button.");
      log('Clicking Next...');
      nextBtn.click();
    }

    // ───────────────── Wizard steps 2-4 + Generate Report ─────────────────

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

    async function runWizardAfterStep1() {
      // We just clicked Next on Step 1. Wait until the page actually transitions.
      await waitFor(() => detectWizardStep() >= 2, {
        timeout: 15000,
        label: 'transition past Step 1 (Employee Information)',
      });

      // Click Next on each intermediate step, waiting for the step number to advance.
      for (let attempt = 0; attempt < 6; attempt++) {
        const step = detectWizardStep();
        log(`Detected wizard step: ${step}`);

        if (step === 4) {
          log('Reached Review step');
          break;
        }

        if (step === 0) {
          throw new Error('Could not detect wizard step — page DOM may have changed');
        }

        const nextBtn = findNextButton();
        if (!nextBtn) {
          throw new Error(`Step ${step}: Next button not found`);
        }
        log(`Step ${step}: clicking Next`);
        clickEl(nextBtn);

        const startStep = step;
        await waitFor(() => detectWizardStep() > startStep, {
          timeout: 12000,
          label: `transition past Step ${startStep}`,
        });
        await sleep(300);
      }

      // Step 4: Review — select CSV, click Generate Report
      await waitFor(() => findGenerateReportButton(), {
        timeout: 15000,
        label: 'Generate Report button on Review step',
      });

      const csvRadio = findRadioByLabel('CSV');
      if (csvRadio) {
        if (!csvRadio.checked) {
          log('Selecting CSV radio');
          csvRadio.click();
        } else {
          log('CSV already selected');
        }
      } else {
        log('Warning: CSV radio not found, proceeding with default format');
      }
      await sleep(400);

      log('Clicking Generate Report');
      const genBtn = findGenerateReportButton();
      if (!genBtn) throw new Error('Generate Report button vanished');
      genBtn.click();
      // Page navigates to /srw-reportwriter-savedReport.php (Recent tab) — dispatcher fires there
    }

    // ───────────────── Recent Advanced Reports — wait for + click Download ─────────────────

    function getDownloadButtons() {
      return Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
        .filter(el => {
          if (!visible(el)) return false;
          const text = (el.textContent || el.value || '').trim().toLowerCase();
          return text === 'download';
        });
    }

    function isOnRecentReportsTab() {
      return location.href.includes('/srw-reportwriter-savedReport.php')
        && location.search.includes('tab-index-advRptTab=1');
    }

    async function waitForReportAndDownload() {
      await sleep(1500);
      const initialCount = getDownloadButtons().length;
      log(`Recent reports tab. Initial Download buttons: ${initialCount}. Waiting for new one (up to 10 min)...`);

      showProgressBanner('Generating report — waiting for Download button…');

      await waitFor(() => getDownloadButtons().length > initialCount, {
        timeout: 10 * 60 * 1000,
        interval: 800,
        label: 'new Download button (report finished generating)',
      });

      const buttons = getDownloadButtons();
      buttons.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      log('Clicking topmost (newest) Download button');
      buttons[0].click();

      hideProgressBanner();
      showSuccessBanner('✓ Download triggered. Check your Downloads folder.');
      setState(STATES.IDLE);
    }

    let progressBannerEl;
    function showProgressBanner(msg) {
      hideProgressBanner();
      progressBannerEl = document.createElement('div');
      progressBannerEl.textContent = msg;
      progressBannerEl.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#354f52,#2f3e46);color:#cad2c5;border:1px solid rgba(132,169,140,.5);padding:10px 18px;border-radius:999px;font:600 13px "Segoe UI",system-ui,sans-serif;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.45),0 0 12px rgba(132,169,140,.15)';
      document.body.appendChild(progressBannerEl);
    }
    function hideProgressBanner() {
      if (progressBannerEl && progressBannerEl.parentNode) progressBannerEl.remove();
      progressBannerEl = null;
    }
    function showSuccessBanner(msg) {
      const b = document.createElement('div');
      b.textContent = msg;
      b.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#cad2c5,#84a98c);color:#2f3e46;padding:10px 18px;border-radius:999px;font:600 14px "Segoe UI",system-ui,sans-serif;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 14px rgba(132,169,140,.35)';
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 6000);
    }

    // ═════════════════ Prior Payroll mode (YTD Balances Report) ═════════════════
    // Independent flow from the Census report. State, tasks, and dispatch are separate.

    const PP_STATE_KEY = 'paycomBot.pp.state';
    const PP_TASKS_KEY = 'paycomBot.pp.tasks';
    const PP_INDEX_KEY = 'paycomBot.pp.index';
    const PP_NAV_KEY = 'paycomBot.pp.navAttempts';
    const PP_STATES = {
      IDLE: 'IDLE',
      GO_TO_SCHEDULE: 'PP_GO_TO_SCHEDULE',
      AT_SCHEDULE: 'PP_AT_SCHEDULE',
      AT_REPORT: 'PP_AT_REPORT',
    };
    // Schedule ID is per-client, so we don't hardcode it. We navigate to the
    // listing page and click whichever schedule appears there. Report ID 58
    // (Employee YTD Balances Report) is a Paycom global ID that's stable
    // across clients.
    const PP_CONFIG = {
      ytdReportId: 58,
    };
    // The processing-schedules listing was migrated to a card-based "Mantle" UI.
    // The old /paygrid/processingschedules/indexTable URL now redirects here.
    const PP_MANTLE_SCHEDULE_PATH = '/payrollMantleApi/payrollSetup/processingSchedules';
    // The per-schedule editor (Properties / Schedule Dates / Summary wizard).
    // NOTE: this URL also CONTAINS PP_MANTLE_SCHEDULE_PATH as a substring, so the
    // dispatcher must test for the editor path BEFORE the list path.
    const PP_MANTLE_EDITOR_PATH = PP_MANTLE_SCHEDULE_PATH + '/editor/';
    const ppScheduleListUrl = () =>
      'https://www.paycomonline.net/v4/cl/web.php' + PP_MANTLE_SCHEDULE_PATH;
    // Legacy (pre-Mantle) table-based processing-schedules listing. Some Paycom
    // clients are still on this UI; for them the Mantle URL above doesn't apply.
    // The dispatcher detects whichever page it lands on and runs the matching
    // handler (Mantle vs. legacy) — see dispatchPriorPayroll's AT_SCHEDULE state.
    const PP_LEGACY_SCHEDULE_PATH = '/paygrid/processingschedules/indexTable';
    const ppLegacyScheduleListUrl = () =>
      'https://www.paycomonline.net/v4/cl/web.php' + PP_LEGACY_SCHEDULE_PATH;
    const ppYtdReportUrl = () =>
      `https://www.paycomonline.net/v4/cl/rpt-generate.php?rpt_id=${PP_CONFIG.ytdReportId}`;

    // Loop guard: each time the dispatcher lands on an unrecognized page and has
    // to re-navigate, this counter increments. Recognized pages reset it to 0.
    // After PP_MAX_NAV_ATTEMPTS the flow stops with an alert instead of
    // refreshing forever (e.g. when Paycom redirects somewhere unexpected).
    const PP_MAX_NAV_ATTEMPTS = 4;
    const getPpNavAttempts = () => parseInt(localStorage.getItem(PP_NAV_KEY) || '0', 10);
    const setPpNavAttempts = (n) => {
      if (n <= 0) localStorage.removeItem(PP_NAV_KEY);
      else localStorage.setItem(PP_NAV_KEY, String(n));
    };

    const getPpState = () => localStorage.getItem(PP_STATE_KEY) || PP_STATES.IDLE;
    const setPpState = (s) => {
      if (s === PP_STATES.IDLE) {
        localStorage.removeItem(PP_STATE_KEY);
        setPpNavAttempts(0); // clear loop guard whenever the mode goes idle
      } else {
        localStorage.setItem(PP_STATE_KEY, s);
      }
      refreshPanel();
      log('PP state →', s);
    };
    const isPpRunning = () => getPpState() !== PP_STATES.IDLE;
    const getPpTasks = () => {
      try { return JSON.parse(localStorage.getItem(PP_TASKS_KEY) || '[]'); } catch (_) { return []; }
    };
    const setPpTasks = (tasks) => localStorage.setItem(PP_TASKS_KEY, JSON.stringify(tasks));
    const getPpIndex = () => parseInt(localStorage.getItem(PP_INDEX_KEY) || '0', 10);
    const setPpIndex = (i) => localStorage.setItem(PP_INDEX_KEY, String(i));

    function startPriorPayroll() {
      setState(STATES.IDLE);
      setPpTasks([]);
      setPpIndex(0);
      setPpNavAttempts(0);
      setPpState(PP_STATES.GO_TO_SCHEDULE);
      dispatch();
    }

    // ── Schedule Dates scraper (new card-based Mantle UI, legacy fallback) ──

    // The six field labels shown on each pay-period card.
    const PP_CARD_LABELS = [
      'Start Date', 'End Date', 'Days In Period',
      'Transaction Start Date', 'Transaction Submit Date', 'Check Date',
    ];

    // Read each field of one pay-period card. The Mantle markup per field is:
    //   <div><span class="ui-typography-caption">Start Date</span>
    //        <p class="ui-typography-body2">12/21/2025</p></div>
    // i.e. the label is a <span> and the value is its sibling <p>.
    function scrapeCardFields(cardEl) {
      const out = {};
      const norm = s => (s || '').replace(/ /g, ' ').trim();
      for (const span of cardEl.querySelectorAll('span')) {
        const label = norm(span.textContent);
        const key = PP_CARD_LABELS.find(L => L.toLowerCase() === label.toLowerCase());
        if (!key) continue;
        let value = '';
        const wrapper = span.parentElement;
        if (wrapper) {
          const p = wrapper.querySelector('p');
          if (p) value = norm(p.textContent);
        }
        if (!value && span.nextElementSibling) value = norm(span.nextElementSibling.textContent);
        if (value) out[key] = value;
      }
      return out;
    }

    // Calendar quarter (1-4) for an MM/DD/YYYY date string.
    function quarterFromDate(dateStr) {
      const m = (dateStr || '').match(/^(\d{1,2})\//);
      if (!m) return 0;
      const month = parseInt(m[1], 10);
      if (month < 1 || month > 12) return 0;
      return Math.floor((month - 1) / 3) + 1;
    }

    // Scrape the new card-based "Schedule Dates" view. Each pay-period card is a
    // .uiLibListItemContainer holding a "Check N" heading and the date fields.
    // The card title is nested malformed markup (<h4> inside <h3>), so we read
    // the check number from the card's whole text rather than an exact element.
    // The quarter is derived from the check date (Paycom groups cards the same
    // way), so we don't depend on scraping the "Quarter N" section headers.
    function scrapeMantleSchedule() {
      const periods = [];
      const cards = Array.from(document.querySelectorAll('.uiLibListItemContainer'))
        .filter(card => {
          if (!visible(card)) return false;
          const txt = (card.textContent || '').replace(/ /g, ' ');
          return /Check\s+\d+/i.test(txt) && /Check Date/i.test(txt)
            && /Start Date/i.test(txt) && /End Date/i.test(txt);
        });

      for (const card of cards) {
        const txt = (card.textContent || '').replace(/ /g, ' ');
        const f = scrapeCardFields(card);
        if (!f['Start Date'] || !f['End Date'] || !f['Check Date']) continue;

        const checkM = txt.match(/Check\s+(\d+)/i);
        const cycleM = txt.match(/(On-Cycle|Off-Cycle)/i);
        // Status MUST come from the badge element, not card.textContent:
        // textContent jams the badge against the next field ("ProcessedStart
        // Date"), which breaks any word-boundary test. The badge is:
        //   <div data-testid="label-text">Processed</div>
        const badge = card.querySelector('[data-testid="label-text"]');
        const status = badge ? (badge.textContent || '').trim() : 'Open';
        periods.push({
          quarter: quarterFromDate(f['Check Date']),
          payrollNum: checkM ? parseInt(checkM[1], 10) : 0,
          cycle: cycleM ? cycleM[1] : '',
          status: status,
          periodStart: f['Start Date'],
          periodEnd: f['End Date'],
          txStart: f['Transaction Start Date'] || '',
          txSubmit: f['Transaction Submit Date'] || '',
          checkDate: f['Check Date'],
        });
      }
      return periods;
    }

    // Legacy <tr>-table scraper — kept as a fallback for un-migrated clients.
    function scrapeLegacyTrSchedule() {
      const periods = [];
      const rows = Array.from(document.querySelectorAll('tr')).filter(visible);
      const qMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };
      let currentQuarter = 0;
      for (const row of rows) {
        const text = (row.innerText || '').trim();
        const qMatch = text.match(/^(1st|2nd|3rd|4th)\s+Quarter\b/i);
        if (qMatch && text.length < 30) { currentQuarter = qMap[qMatch[1].toLowerCase()]; continue; }
        if (currentQuarter === 0) continue;
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 7) continue;
        const payrollNumText = (cells[1]?.innerText || '').trim();
        if (!/^\d+$/.test(payrollNumText)) continue;
        const dateInputs = Array.from(row.querySelectorAll('input[type="text"]'))
          .filter(inp => visible(inp) && /\d{2}\/\d{2}\/\d{4}/.test(inp.value || ''));
        if (dateInputs.length < 5) continue;
        periods.push({
          quarter: currentQuarter,
          payrollNum: parseInt(payrollNumText, 10),
          cycle: (cells[2]?.innerText || '').trim(),
          status: (cells[3]?.innerText || '').trim(),
          periodStart: dateInputs[0].value,
          periodEnd: dateInputs[1].value,
          txStart: dateInputs[2].value,
          txSubmit: dateInputs[3].value,
          checkDate: dateInputs[4].value,
        });
      }
      return periods;
    }

    // Scrape the Schedule Dates view for the active year. Returns array of
    // { quarter, payrollNum, cycle, status, periodStart, periodEnd, txStart,
    //   txSubmit, checkDate }. Tries the new Mantle card UI first, then the
    // legacy table.
    function scrapePayrollSchedule() {
      let periods = scrapeMantleSchedule();
      let source = 'Mantle cards';
      if (!periods.length) { periods = scrapeLegacyTrSchedule(); source = 'legacy table'; }
      log(`scrapePayrollSchedule (${source}) found ${periods.length}: ` +
        periods.map(p => `[Q${p.quarter} #${p.payrollNum} "${p.status}" chk=${p.checkDate}]`).join(' '));
      return periods;
    }

    // Calendar quarter the script is being run in (1-4). Drives the
    // consolidated-vs-per-pay-period bucketing in generateTaskList.
    function getCurrentCalendarQuarter() {
      return Math.floor(new Date().getMonth() / 3) + 1;
    }

    // From scraped periods, build the task list using the current calendar quarter:
    //  - q <  currentQuarter → 1 consolidated task from that quarter's Processed rows
    //  - q == currentQuarter → 1 task per Processed row (per-pay-period)
    //  - q >  currentQuarter → skip (future quarter)
    //  - any quarter with zero Processed rows → skip
    function generateTaskList(periods) {
      const byQuarter = { 1: [], 2: [], 3: [], 4: [] };
      for (const p of periods) {
        if (byQuarter[p.quarter]) byQuarter[p.quarter].push(p);
      }
      const currentQuarter = getCurrentCalendarQuarter();
      log(`generateTaskList: current calendar quarter = Q${currentQuarter}`);
      // Diagnostic: how periods bucketed per quarter + what statuses look like.
      for (const q of [1, 2, 3, 4]) {
        const arr = byQuarter[q];
        const proc = arr.filter(p => /processed/i.test(p.status));
        const statuses = [...new Set(arr.map(p => JSON.stringify(p.status)))].join(', ');
        log(`  Q${q}: ${arr.length} periods, ${proc.length} processed | statuses: ${statuses || '(none)'}`);
      }
      const dropped = periods.filter(p => !byQuarter[p.quarter]);
      if (dropped.length) {
        log(`  WARNING: ${dropped.length} period(s) had an unrecognized quarter: ` +
          dropped.map(p => `quarter=${JSON.stringify(p.quarter)} chk=${p.checkDate}`).join(', '));
      }
      const tasks = [];
      for (const q of [1, 2, 3, 4]) {
        if (q > currentQuarter) continue;
        const all = byQuarter[q];
        if (!all.length) continue;
        const processed = all.filter(p => /processed/i.test(p.status));
        if (!processed.length) continue;

        if (q < currentQuarter) {
          // Past quarter → consolidated. If only partially processed, consolidate
          // across whatever Processed rows are present (Processed rows only).
          const last = processed[processed.length - 1];
          tasks.push({
            type: 'quarterly',
            quarter: q,
            from: processed[0].checkDate,
            to: last.checkDate,
            // For "Save Report as" filename: consolidated quarter window.
            periodStart: processed[0].periodStart,
            periodEnd: last.periodEnd,
            checkDate: last.checkDate,
            label: `Q${q} quarterly: ${processed[0].checkDate} → ${last.checkDate}`,
          });
        } else {
          // q === currentQuarter → per pay period
          for (const p of processed) {
            tasks.push({
              type: 'individual',
              quarter: q,
              payrollNum: p.payrollNum,
              from: p.checkDate,
              to: p.checkDate,
              // For "Save Report as" filename: this row's own window.
              periodStart: p.periodStart,
              periodEnd: p.periodEnd,
              checkDate: p.checkDate,
              label: `Q${q} payroll #${p.payrollNum}: ${p.checkDate}`,
            });
          }
        }
      }
      return tasks;
    }

    // React-style input setter so the framework registers the change.
    function setInputValue(input, value) {
      const proto = Object.getPrototypeOf(input);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function findDateRangeInputs() {
      const label = findVisibleByExactText('Date Range');
      if (!label) return null;
      let container = label;
      for (let i = 0; i < 6 && container; i++) {
        container = container.parentElement;
        if (!container) break;
        const inputs = Array.from(container.querySelectorAll('input[type="text"]'))
          .filter(inp => /\d{2}\/\d{2}\/\d{4}/.test(inp.value || ''));
        if (inputs.length >= 2) return { from: inputs[0], to: inputs[1] };
      }
      return null;
    }

    // First "Select All" checkbox positioned below the Employee Filters header.
    // Position Title's "Select All" appears below the Employees one in DOM order, so the topmost wins.
    function findEmployeeSelectAllCheckbox() {
      const header = findVisibleByExactText('Employee Filters');
      if (!header) return null;
      const headerTop = header.getBoundingClientRect().top;
      const candidates = Array.from(document.querySelectorAll('input[type="checkbox"]'))
        .filter(cb => visible(cb) && cb.getBoundingClientRect().top > headerTop)
        .map(cb => {
          let walker = cb.parentElement;
          for (let i = 0; i < 4 && walker; i++) {
            const text = (walker.innerText || '').trim();
            if (/Select All/i.test(text) && text.length < 60) {
              return { cb, top: cb.getBoundingClientRect().top };
            }
            walker = walker.parentElement;
          }
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.top - b.top);
      return candidates[0]?.cb || null;
    }

    function showInfoPanel(msg) {
      let panel = document.getElementById('paycom-bot-info');
      if (panel) panel.remove();
      panel = document.createElement('div');
      panel.id = 'paycom-bot-info';
      panel.style.cssText = 'position:fixed;top:80px;right:20px;background:#fff;border:2px solid #0b7dda;border-radius:8px;padding:14px 30px 14px 14px;font:13px sans-serif;z-index:2147483647;max-width:420px;white-space:pre-line;box-shadow:0 4px 16px rgba(0,0,0,.18);line-height:1.4';
      panel.textContent = msg;
      const close = document.createElement('span');
      close.textContent = '✕';
      close.style.cssText = 'position:absolute;top:6px;right:10px;cursor:pointer;color:#888;font-weight:700';
      close.onclick = () => panel.remove();
      panel.appendChild(close);
      document.body.appendChild(panel);
    }

    // Modal dialog showing the task list with checkboxes. User must click Confirm or Cancel.
    function showTaskConfirmDialog(tasks, periods, onConfirm, onCancel) {
      const old = document.getElementById('paycom-bot-confirm');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = 'paycom-bot-confirm';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:640px;width:92%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.35);';

      const title = document.createElement('h3');
      title.textContent = 'Prior Payroll — confirm before downloading';
      title.style.cssText = 'margin:0 0 4px;color:#0b7dda;font-size:16px;';
      box.appendChild(title);

      const processedCount = periods.filter(p => /processed/i.test(p.status)).length;
      const currentQuarter = getCurrentCalendarQuarter();
      const subtitle = document.createElement('div');
      subtitle.innerHTML = `Year: <b>${new Date().getFullYear()}</b> &nbsp; • &nbsp; Current quarter: <b>Q${currentQuarter}</b> &nbsp; • &nbsp; ${periods.length} rows scraped (${processedCount} Processed) &nbsp; • &nbsp; ${tasks.length} task${tasks.length === 1 ? '' : 's'} planned`;
      subtitle.style.cssText = 'color:#666;font-size:12px;margin-bottom:14px;';
      box.appendChild(subtitle);

      const list = document.createElement('div');
      list.style.cssText = 'flex:1;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;padding:6px 12px;margin-bottom:14px;';
      const checkboxes = [];
      tasks.forEach((task, i) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;padding:8px 0;cursor:pointer;border-bottom:1px solid #f0f0f0;';
        if (i === tasks.length - 1) row.style.borderBottom = 'none';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.style.cssText = 'margin-right:10px;transform:scale(1.2);';
        checkboxes.push(cb);

        const num = document.createElement('span');
        num.textContent = `${i + 1}.`;
        num.style.cssText = 'min-width:24px;color:#888;';

        const badge = document.createElement('span');
        badge.textContent = task.type === 'quarterly' ? 'QUARTERLY' : 'PAY PERIOD';
        badge.style.cssText = `display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-right:8px;color:#fff;background:${task.type === 'quarterly' ? '#27ae60' : '#0b7dda'};`;

        const text = document.createElement('span');
        text.textContent = task.label;
        text.style.cssText = 'flex:1;color:#333;';

        row.appendChild(cb);
        row.appendChild(num);
        row.appendChild(badge);
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
        const allChecked = checkboxes.every(c => c.checked);
        checkboxes.forEach(c => c.checked = !allChecked);
      };
      buttons.appendChild(selectAllLink);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'padding:9px 18px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px;';
      cancelBtn.onclick = () => { overlay.remove(); onCancel(); };
      buttons.appendChild(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = 'Confirm and download selected';
      confirmBtn.style.cssText = 'padding:9px 18px;border:0;background:#0b7dda;color:#fff;border-radius:5px;cursor:pointer;font-weight:600;font-size:13px;';
      confirmBtn.onclick = () => {
        const selected = tasks.filter((_, i) => checkboxes[i].checked);
        if (!selected.length) {
          alert('Select at least one task or click Cancel.');
          return;
        }
        overlay.remove();
        onConfirm(selected);
      };
      buttons.appendChild(confirmBtn);

      box.appendChild(buttons);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    // Click the year tab matching the current calendar year so we always scrape
    // the active year's schedule (not whatever the page was last left on).
    async function ensureCurrentYearTab() {
      const currentYear = String(new Date().getFullYear());
      // Legacy UI labels the tab just "2026"; the new Mantle UI labels it
      // "2026 (Current)". Match either.
      const yearTab = findVisibleByExactText(currentYear)
        || findVisibleByExactText(currentYear + ' (Current)')
        || Array.from(document.querySelectorAll('button, [role="tab"], a, div, span'))
            .find(el => visible(el)
              && new RegExp('^' + currentYear + '\\b').test((el.textContent || '').trim())
              && (el.textContent || '').trim().length < 24);
      if (yearTab) {
        log(`Clicking year ${currentYear} tab`);
        clickEl(yearTab);
      } else {
        log(`Year tab for ${currentYear} not found — waiting for whatever year is active`);
      }
      // Paycom re-fetches the table via AJAX after a year-tab click — rows briefly
      // disappear and the spinner shows. Wait for at least one row whose check date
      // ends with the year we want (or any year, if our tab wasn't found) before
      // returning. Otherwise scrapePayrollSchedule() runs against an empty table.
      await waitFor(
        () => {
          const rows = scrapePayrollSchedule();
          if (!rows.length) return null;
          if (!yearTab) return rows;
          return rows.some(r => (r.checkDate || '').endsWith('/' + currentYear)) ? rows : null;
        },
        { timeout: 30000, interval: 500, label: `schedule rows for ${currentYear}` }
      );
    }

    // Modal asking the user to pick one schedule when multiple have processed periods.
    function showSchedulePickDialog(schedules, onPick, onCancel) {
      const old = document.getElementById('paycom-bot-schedule-pick');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = 'paycom-bot-schedule-pick';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:520px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,0.35);';

      const title = document.createElement('h3');
      title.textContent = 'Multiple schedules with processed payrolls';
      title.style.cssText = 'margin:0 0 4px;color:#0b7dda;font-size:16px;';
      box.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.textContent = 'Pick which schedule to use for this run.';
      subtitle.style.cssText = 'color:#666;font-size:12px;margin-bottom:14px;';
      box.appendChild(subtitle);

      const list = document.createElement('div');
      list.style.cssText = 'margin-bottom:14px;';
      schedules.forEach((s, i) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;padding:10px;cursor:pointer;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:6px;';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = 'paycom-schedule-pick';
        r.value = String(i);
        if (i === 0) r.checked = true;
        r.style.cssText = 'margin-right:10px;transform:scale(1.2);';
        const text = document.createElement('div');
        const safeName = s.name.replace(/</g, '&lt;');
        text.innerHTML = `<b>${safeName}</b><br><span style="color:#666;font-size:12px">${s.processed} of ${s.total} periods processed</span>`;
        row.appendChild(r);
        row.appendChild(text);
        list.appendChild(row);
      });
      box.appendChild(list);

      const buttons = document.createElement('div');
      buttons.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'padding:9px 18px;border:1px solid #bbb;background:#fff;border-radius:5px;cursor:pointer;font-size:13px;';
      cancel.onclick = () => { overlay.remove(); onCancel(); };
      buttons.appendChild(cancel);

      const confirm = document.createElement('button');
      confirm.textContent = 'Use this schedule';
      confirm.style.cssText = 'padding:9px 18px;border:0;background:#0b7dda;color:#fff;border-radius:5px;cursor:pointer;font-weight:600;font-size:13px;';
      confirm.onclick = () => {
        const picked = overlay.querySelector('input[name="paycom-schedule-pick"]:checked');
        const idx = parseInt(picked?.value || '0', 10);
        overlay.remove();
        onPick(schedules[idx]);
      };
      buttons.appendChild(confirm);
      box.appendChild(buttons);

      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    // ── New card-based "Mantle" Processing Schedules page ──
    // Each schedule is a card anchored on a bold name div like
    //   <div style="display:inline;font-weight:600;">Bi-Weekly [5293] </div>
    // with an "Active" badge and a "Processed Periods  N of M" stat nearby.
    function findMantleScheduleCards() {
      // Bold name divs whose text ends with a "[<id>]" token.
      const nameDivs = Array.from(document.querySelectorAll('div'))
        .filter(d => {
          if (!visible(d)) return false;
          const t = (d.textContent || '').trim();
          return /\[\d+\]\s*$/.test(t) && t.length > 0 && t.length < 80;
        });
      // Keep only innermost matches (drop ancestors that wrap a matched div).
      const leaves = nameDivs.filter(d => !nameDivs.some(o => o !== d && d.contains(o)));

      return leaves.map(nameDiv => {
        const name = (nameDiv.textContent || '').trim();
        const idMatch = name.match(/\[(\d+)\]/);
        const scheduleId = idMatch ? idMatch[1] : '';
        // Walk up to the smallest ancestor that also carries the period stats.
        let container = nameDiv;
        for (let i = 0; i < 8 && container.parentElement; i++) {
          container = container.parentElement;
          if (/Processed\s+Periods/i.test(container.innerText || '')) break;
        }
        const text = container.innerText || '';
        const active = /\bActive\b/i.test(text);
        const m = text.match(/Processed\s+Periods[\s\S]*?(\d+)\s+of\s+(\d+)/i);
        const processed = m ? parseInt(m[1], 10) : 0;
        const total = m ? parseInt(m[2], 10) : 0;
        // Click target: a real anchor if present, else the name div itself
        // (Paycom's React app attaches the handler to the bold name element).
        const clickTarget = nameDiv.closest('a') || nameDiv;
        return { name, scheduleId, active, processed, total, link: clickTarget };
      });
    }

    // Handle the Mantle Processing Schedules page: pick the Active pay schedule.
    async function ppHandleMantleScheduleList() {
      log('On Mantle Processing Schedules page, parsing schedule cards');
      await waitFor(
        () => findMantleScheduleCards().length > 0,
        { timeout: 60000, label: 'Mantle schedule cards' }
      );

      const schedules = findMantleScheduleCards();
      log(`Found ${schedules.length} schedule card(s):`,
        schedules.map(s => `${s.name} active=${s.active} processed=${s.processed}/${s.total}`));

      // Per requirement: select the Active pay schedule (frequency varies per
      // employer — weekly / bi-weekly / etc. — so match on Active, not name).
      let usable = schedules.filter(s => s.active && s.processed > 0);
      if (!usable.length) usable = schedules.filter(s => s.active); // Active but 0 processed
      if (!usable.length) usable = schedules.filter(s => s.processed > 0); // last resort

      if (!usable.length) {
        throw new Error(
          `Found ${schedules.length} schedule(s) but none are Active with processed periods. ` +
          `Nothing to download for prior payroll yet.`
        );
      }

      if (usable.length === 1) {
        log(`Auto-picking the Active schedule: ${usable[0].name}`);
        clickEl(usable[0].link);
        await ppProceedAfterScheduleClick();
        return;
      }

      // More than one Active schedule → let the user choose.
      showSchedulePickDialog(
        usable,
        (chosen) => {
          log(`User picked schedule: ${chosen.name}`);
          clickEl(chosen.link);
          ppProceedAfterScheduleClick().catch(err => {
            if (err && err.aborted) { log('PP schedule aborted by user'); return; }
            alert('Paycom Bot (PP, schedule): ' + ((err && err.message) || err));
            setPpState(PP_STATES.IDLE);
          });
        },
        () => { log('User cancelled schedule picker'); setPpState(PP_STATES.IDLE); }
      );
    }

    // After clicking a schedule card, Mantle (a React SPA) may route to the
    // editor client-side WITHOUT a full page reload — in which case dispatch()
    // never re-fires on its own. Detect that and continue manually.
    //  - SPA route   → this code keeps running; URL flips to the editor → we
    //                  call ppHandleSchedulePage() ourselves.
    //  - full reload → this JS context is destroyed mid-wait; the freshly
    //                  loaded page's init()/dispatch() takes over instead.
    // Either way the schedule editor gets handled exactly once.
    async function ppProceedAfterScheduleClick() {
      log('Waiting for schedule editor to open (SPA route or full reload)…');
      await waitFor(
        () => location.href.includes(PP_MANTLE_EDITOR_PATH),
        { timeout: 20000, label: 'schedule editor page (after clicking schedule)' }
      );
      // Reaching here means it was an SPA route (a full reload would have torn
      // down this context). Let the editor render, then handle it.
      log('SPA route detected — schedule editor open, continuing');
      setPpNavAttempts(0); // forward progress
      await sleep(900);
      await ppHandleSchedulePage();
    }

    // On the legacy schedule listing page (/processingschedules/indexTable),
    // parse all schedule rows, filter to ones with processed periods > 0, then
    // auto-pick (if 1 valid) or prompt the user (if multiple).
    async function ppHandleScheduleList() {
      log('On schedule listing page, parsing schedules table');
      await waitFor(
        () => Array.from(document.querySelectorAll('a[href*="/processingschedules/index/"]'))
          .filter(a => visible(a) && (a.textContent || '').trim().length > 0)[0],
        { timeout: 15000, label: 'schedule listing rows' }
      );

      // Find the "Processed Period" column index from the table headers.
      const headers = Array.from(document.querySelectorAll('th'));
      const procColIdx = headers.findIndex(h => /Processed\s+Period/i.test(h.innerText || ''));

      const schedules = [];
      for (const row of Array.from(document.querySelectorAll('tr'))) {
        const link = Array.from(row.querySelectorAll('a[href*="/processingschedules/index/"]'))
          .filter(a => visible(a) && (a.textContent || '').trim().length > 0)[0];
        if (!link) continue;

        const cells = row.querySelectorAll('td');
        const processedText = procColIdx >= 0 ? (cells[procColIdx]?.innerText || '').trim() : '';
        const m = processedText.match(/^(\d+)\s+of\s+(\d+)$/i);
        const processed = m ? parseInt(m[1], 10) : 0;
        const total = m ? parseInt(m[2], 10) : 0;

        schedules.push({
          name: (link.textContent || '').trim(),
          link,
          href: link.href,
          processed,
          total,
        });
      }

      log(`Found ${schedules.length} schedule(s):`,
        schedules.map(s => `${s.name} processed=${s.processed}/${s.total}`));

      const usable = schedules.filter(s => s.processed > 0);

      if (!usable.length) {
        throw new Error(
          `Found ${schedules.length} schedule(s), but none have any processed periods. ` +
          `Nothing to download for prior payroll yet.`
        );
      }

      if (usable.length === 1) {
        log(`Auto-picking the only schedule with processed periods: ${usable[0].name}`);
        clickEl(usable[0].link);
        return;
      }

      // Multiple usable schedules → ask the user.
      showSchedulePickDialog(
        usable,
        (chosen) => {
          log(`User picked schedule: ${chosen.name}`);
          clickEl(chosen.link);
        },
        () => {
          log('User cancelled schedule picker');
          setPpState(PP_STATES.IDLE);
        }
      );
    }

    async function ppHandleSchedulePage() {
      // Decide UI type by URL — the dispatcher already routed us here, and a
      // text search is unreliable (Paycom keeps a HIDDEN <h2>/<div> "Schedule
      // Dates" content heading in the DOM, which a text search wrongly grabs
      // before the real stepper step renders).
      const isMantleEditor = location.href.includes(PP_MANTLE_EDITOR_PATH);
      log('On schedule editor (' + (isMantleEditor ? 'Mantle' : 'legacy') +
        ') — opening Schedule Dates');
      let clickDiag = '';

      if (isMantleEditor) {
        // Mantle vertical-stepper wizard: wait specifically for the stepper
        // <li data-testid="N-Step-Schedule Dates">. Then (1) fire a full
        // pointer+mouse sequence on the inner label and (2) invoke the React
        // handler directly — the stepper has no native clickable element.
        const stepLi = await waitFor(
          () => document.querySelector('li[data-testid*="Step-Schedule Dates" i]'),
          { timeout: 20000, label: 'Mantle "Schedule Dates" stepper step' }
        );
        const target = Array.from(stepLi.querySelectorAll('p, span, div'))
          .find(x => (x.textContent || '').trim() === 'Schedule Dates') || stepLi;
        robustClick(target);
        await sleep(150);
        clickDiag = reactClick(stepLi);
      } else {
        // Legacy detail page: "Schedule Dates" is a normal clickable tab.
        const tab = await waitFor(
          () => findByText(['li', 'a', 'div', 'span', 'button'], 'Schedule Dates'),
          { timeout: 15000, label: 'legacy "Schedule Dates" tab' }
        );
        clickEl(tab.closest('[role="button"], button, a, li') || tab);
      }

      log('Waiting for the Schedule Dates view to render');
      // Wait for the actual thing we need: at least one scrapeable pay-period
      // card (new Mantle UI) or a legacy "1st Quarter" row. If it times out,
      // surface the click diagnostic in the error so we can see what happened.
      try {
        await waitFor(
          () => scrapeMantleSchedule().length > 0
            || Array.from(document.querySelectorAll('tr')).some(r =>
                 visible(r) && /1st Quarter/i.test(r.innerText || '')),
          { timeout: 30000, interval: 400, label: 'Schedule Dates view (pay-period cards)' }
        );
      } catch (err) {
        if (err && err.aborted) throw err;
        throw new Error('Timed out waiting for the Schedule Dates view. ' +
          (clickDiag || '(legacy click path)'));
      }

      await ensureCurrentYearTab();

      const periods = scrapePayrollSchedule();
      log(`Scraped ${periods.length} pay periods (year=${new Date().getFullYear()})`);
      if (!periods.length) throw new Error('No pay periods scraped from schedule');

      const tasks = generateTaskList(periods);
      log(`Generated ${tasks.length} tasks`, tasks);
      if (!tasks.length) throw new Error('No Processed pay periods found in current year — nothing to download');

      // Show modal — user must Confirm or Cancel before we proceed.
      showTaskConfirmDialog(
        tasks,
        periods,
        (selected) => {
          log(`User confirmed ${selected.length}/${tasks.length} tasks`);
          setPpTasks(selected);
          setPpIndex(0);
          setPpState(PP_STATES.AT_REPORT);
          location.href = ppYtdReportUrl();
        },
        () => {
          log('User cancelled prior payroll');
          setPpTasks([]);
          setPpIndex(0);
          setPpState(PP_STATES.IDLE);
        }
      );
    }

    async function ppFillReportForm(task) {
      const csvRadio = findRadioByLabel('CSV');
      if (csvRadio && !csvRadio.checked) {
        log('Selecting CSV');
        clickEl(csvRadio);
      }
      await sleep(150);

      const dr = findDateRangeInputs();
      if (!dr) throw new Error('Date Range inputs not found');
      log(`Setting From=${task.from}, To=${task.to}`);
      setInputValue(dr.from, task.from);
      setInputValue(dr.to, task.to);
      await sleep(200);

      const detailedRadio = findRadioByLabel('Detailed Report');
      if (detailedRadio && !detailedRadio.checked) {
        log('Selecting Detailed Report');
        clickEl(detailedRadio);
      }
      await sleep(150);

      const selectAll = findEmployeeSelectAllCheckbox();
      if (selectAll) {
        if (!selectAll.checked) {
          log('Clicking Employee Select All');
          clickEl(selectAll);
          await sleep(2000); // paginated employee list takes a moment to load
        } else {
          log('Employee Select All already checked (carries over from prior task)');
        }
      } else {
        log('Warning: Employee Select All checkbox not found');
      }
    }

    // ───────────────── Prior Payroll: report file download ─────────────────

    // MM/DD/YYYY → MMDDYYYY (filename-safe).
    function stripSlashes(d) { return (d || '').replace(/\//g, ''); }

    // Downloaded-file name: PriorPayroll_<periodStart>_<periodEnd>_<checkDate>.csv.
    // For quarterly tasks these come from the first row's periodStart + the last
    // row's periodEnd + the last row's checkDate (set in generateTaskList); for
    // individual tasks all three are that one row's own values.
    function downloadFileName(task) {
      return `PriorPayroll_${stripSlashes(task.periodStart)}_${stripSlashes(task.periodEnd)}_${stripSlashes(task.checkDate)}.csv`;
    }

    // The per-session token Paycom embeds in its URLs (needed to build the
    // report download URL). It appears in many links/forms on every page.
    function getSessionNonce() {
      const re = /session_nonce=([A-Za-z0-9._\-]+)/;
      for (const el of document.querySelectorAll('a[href*="session_nonce="], form[action*="session_nonce="]')) {
        const m = ((el.getAttribute('href') || '') + ' ' + (el.getAttribute('action') || '')).match(re);
        if (m) return m[1];
      }
      const m = (document.documentElement.innerHTML || '').match(re);
      return m ? m[1] : '';
    }

    // Download the report file OURSELVES so we control the filename.
    //
    // PRIMARY path (robust): every queue row is <div id="queued-report-N"
    // class="queued-item">…<button class="js-report-download">…</div> — N
    // *is* the transid. We read it straight off the DOM the moment the
    // Download button appears, so we never have to click anything or wait on
    // a click's side effect. This is what makes it reliable for reports
    // Paycom auto-reformats for being "too big for the selected output" —
    // for those, the Download click does NOT fire the one-time-password XHR
    // the old code depended on (Paycom serves the file some other,
    // unintercepted way under its own default name instead), which used to
    // time out and force a manual rename every single time.
    //
    // FALLBACK path: if a queue row somehow lacks that id (different page
    // layout, a future Paycom change), fall back to the old click + intercept
    // technique — clicking fires an XHR to
    //   …/report-center/reportaction/one-time-password?…&transid=N
    // which we hook to (a) capture the transid and (b) abort it so Paycom's
    // own (default-named) download never happens.
    //
    // Either way we then fetch rpt-generateproc.php ourselves and save the
    // file as PriorPayroll_<dates>.csv — the fetch completing IS the
    // "download done" signal, so the caller moves to the next task immediately.
    async function ppDownloadReportFile(task, downloadBtn) {
      const fileName = downloadFileName(task);
      const nonce = getSessionNonce();
      if (!nonce) throw new Error('Could not find session_nonce on the page');

      const queueRow = downloadBtn.closest('[id^="queued-report-"]');
      const rowMatch = queueRow && /^queued-report-(\d+)$/.exec(queueRow.id);
      let capturedTransid = rowMatch ? rowMatch[1] : '';

      if (capturedTransid) {
        log(`PP: transid=${capturedTransid} read directly from the queue row's own id — no click needed`);
      } else {
        log('PP: queue row id not found (unexpected layout) — falling back to click + intercept');
        const proto = window.XMLHttpRequest.prototype;
        const origOpen = proto.open;
        const origSend = proto.send;
        proto.open = function (method, url, ...rest) {
          this.__ppUrl = url;
          return origOpen.call(this, method, url, ...rest);
        };
        proto.send = function (...args) {
          if (/one-time-password/i.test(this.__ppUrl || '')) {
            const m = (this.__ppUrl || '').match(/transid=(\d+)/i);
            if (m) capturedTransid = m[1];
            log(`PP: captured transid=${capturedTransid} from one-time-password XHR; ` +
              `aborting it to suppress Paycom's own (default-named) download`);
            const r = origSend.apply(this, args);
            try { this.abort(); } catch (_) {}
            return r;
          }
          return origSend.apply(this, args);
        };
        const restore = () => { proto.open = origOpen; proto.send = origSend; };

        try {
          clickEl(downloadBtn); // fires Paycom's one-time-password XHR (intercepted)
          await waitFor(() => !!capturedTransid,
            { timeout: 20000, interval: 100, label: 'report transid (one-time-password XHR)' });
        } catch (waitErr) {
          if (waitErr && waitErr.aborted) throw waitErr;
          const e = new Error('No queue-row id and no one-time-password XHR fired for this report — '
            + 'could not determine its transid. Check Downloads for a "…Employee_YTD_Balances_Report…" '
            + 'file and rename it by hand if needed.');
          e.otpNotFired = true;
          throw e;
        } finally {
          restore();
        }
      }

      const url = 'https://www.paycomonline.net/v4/cl/rpt-generateproc.php'
        + `?session_nonce=${encodeURIComponent(nonce)}&download=1&transid=${encodeURIComponent(capturedTransid)}`;
      log(`PP: fetching report file directly (transid=${capturedTransid})`);

      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), 180000); // 3-min safety cap
      let blob;
      try {
        const resp = await fetch(url, { credentials: 'include', signal: ctrl.signal });
        if (!resp.ok) throw new Error(`Report download failed (HTTP ${resp.status})`);
        blob = await resp.blob();
      } finally {
        clearTimeout(killer);
      }
      if (!blob || !blob.size) throw new Error('Report download returned an empty file');

      // Save the blob under our filename. A blob URL is same-origin, so the
      // <a download> name is always honored (and pre-fills the Save dialog if
      // "ask where to save" is on).
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      log(`PP: saved "${fileName}" (${blob.size} bytes)`);
    }

    async function ppHandleReportPage() {
      const tasks = getPpTasks();
      if (!tasks.length) throw new Error('No tasks in storage — re-run Prior Payroll from the start');

      // Wait for the form to be live before doing anything.
      await waitFor(
        () => findVisibleByExactText('Date Range') && findDateRangeInputs(),
        { timeout: 20000, label: 'YTD report form (Date Range)' }
      );

      while (true) {
        // Cooperative abort — Stop / reset clears the running flag.
        if (!isPpRunning()) {
          log('Aborted by user mid-loop — exiting Prior Payroll task loop');
          hideProgressBanner();
          return;
        }
        const index = getPpIndex();
        if (index >= tasks.length) {
          hideProgressBanner();
          showSuccessBanner(`✓ All ${tasks.length} prior-payroll reports downloaded`);
          showInfoPanel(`✓ Done — ${tasks.length} report${tasks.length === 1 ? '' : 's'} downloaded.\nCheck your Downloads folder.`);
          setPpState(PP_STATES.IDLE);
          return;
        }
        const task = tasks[index];
        log(`Task ${index + 1}/${tasks.length}: ${task.label}`);
        showProgressBanner(`Prior Payroll ${index + 1}/${tasks.length}: ${task.label}`);

        await ppFillReportForm(task);
        await sleep(400);

        const initialDownloads = getDownloadButtons().length;
        log(`Initial Download buttons before generate: ${initialDownloads}`);

        const genBtn = findGenerateReportButton();
        if (!genBtn) throw new Error(`Task ${index + 1}: Generate Report button not found`);
        log('Clicking Generate Report');
        clickEl(genBtn);

        log(`Waiting for Download button to appear (up to 10 min)...`);
        await waitFor(
          () => getDownloadButtons().length > initialDownloads,
          { timeout: 10 * 60 * 1000, interval: 800, label: `Download for task ${index + 1}` }
        );

        const downloads = getDownloadButtons();
        downloads.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        log(`Task ${index + 1}: downloading report as ${downloadFileName(task)}`);
        // Script-controlled download: captures the transid, suppresses Paycom's
        // own download, fetches the file directly, saves it as PriorPayroll_*.csv.
        // Resolves the instant the file is fully fetched.
        try {
          await ppDownloadReportFile(task, downloads[0]);
        } catch (dlErr) {
          if (dlErr && dlErr.aborted) throw dlErr;
          if (!dlErr || !dlErr.otpNotFired) throw dlErr;
          // Non-fatal: this one task's file likely already saved itself under
          // Paycom's own default name (see ppDownloadReportFile). Don't let one
          // oversized report kill the rest of the batch — log it and move on.
          log(`Task ${index + 1} (${task.label}): ${dlErr.message}`);
          showProgressBanner(`⚠ Task ${index + 1}/${tasks.length} needs a manual rename — continuing…`);
        }

        // Move straight to the next task in the lineup.
        setPpIndex(index + 1);
        await sleep(2000); // brief settle before next task
      }
    }

    async function dispatchPriorPayroll() {
      if (!isPpRunning()) return;
      dismissPrivacyBanner();
      const url = location.href;
      const state = getPpState();
      log('PP dispatch on', location.pathname, 'state=', state);

      if (state === PP_STATES.GO_TO_SCHEDULE) {
        setPpNavAttempts(0);
        setPpState(PP_STATES.AT_SCHEDULE);
        location.href = ppScheduleListUrl();
        return;
      }

      if (state === PP_STATES.AT_SCHEDULE) {
        // Mantle per-schedule EDITOR wizard (Properties / Schedule Dates /
        // Summary). Must be tested BEFORE the list path below, because the
        // editor URL contains the list path as a substring. Reaching this page
        // IS forward progress, so reset the loop guard.
        if (url.includes(PP_MANTLE_EDITOR_PATH)) {
          setPpNavAttempts(0);
          try {
            await ppHandleSchedulePage();
          } catch (err) {
            if (err.aborted) { log('PP schedule aborted by user'); return; }
            alert('Paycom Bot (PP, schedule): ' + err.message);
            setPpState(PP_STATES.IDLE);
          }
          return;
        }
        // New card-based "Mantle" Processing Schedules list → pick Active schedule.
        // NOTE: do NOT reset the loop guard here — the listing page is where a
        // bounce loop returns to, so resetting here would defeat the guard.
        // Only genuine forward progress (the editor page above) resets it.
        if (url.includes(PP_MANTLE_SCHEDULE_PATH)) {
          try {
            await ppHandleMantleScheduleList();
          } catch (err) {
            if (err.aborted) { log('PP Mantle list aborted by user'); return; }
            alert('Paycom Bot (PP, schedules): ' + err.message);
            setPpState(PP_STATES.IDLE);
          }
          return;
        }
        // Legacy table listing page → click first schedule link
        if (url.includes('/processingschedules/indexTable')) {
          try {
            await ppHandleScheduleList();
          } catch (err) {
            if (err.aborted) { log('PP list aborted by user'); return; }
            alert('Paycom Bot (PP, list): ' + err.message);
            setPpState(PP_STATES.IDLE);
          }
          return;
        }
        // Detail page (schedule ID in path) → click Schedule Dates, scrape.
        // Reaching this page IS forward progress, so reset the loop guard.
        if (/\/processingschedules\/index\/\d+/.test(url)) {
          setPpNavAttempts(0);
          try {
            await ppHandleSchedulePage();
          } catch (err) {
            if (err.aborted) { log('PP schedule aborted by user'); return; }
            alert('Paycom Bot (PP, schedule): ' + err.message);
            setPpState(PP_STATES.IDLE);
          }
          return;
        }
        // Unrecognized page → bounce back to listing, but guard against an
        // infinite redirect loop if Paycom keeps redirecting elsewhere.
        const schedAttempts = getPpNavAttempts();
        if (schedAttempts >= PP_MAX_NAV_ATTEMPTS) {
          setPpState(PP_STATES.IDLE);
          hideProgressBanner();
          alert('Paycom Bot: stopped after ' + PP_MAX_NAV_ATTEMPTS +
            ' navigation attempts — kept getting stuck on "' + location.pathname +
            '". Open the Processing Schedules page (and the schedule) manually, ' +
            'then click Run Prior Payroll again.');
          return;
        }
        // Alternate between the legacy table URL and the new Mantle URL so the
        // script auto-detects whichever UI this client is on. Once it lands on a
        // recognized page, the branches above run the matching handler.
        const tryLegacy = (schedAttempts % 2 === 0);
        const nextUrl = tryLegacy ? ppLegacyScheduleListUrl() : ppScheduleListUrl();
        log(`Unrecognized schedule page — bounce attempt ${schedAttempts + 1}/` +
          `${PP_MAX_NAV_ATTEMPTS} (trying ${tryLegacy ? 'legacy table' : 'Mantle'} UI)`);
        setPpNavAttempts(schedAttempts + 1);
        location.href = nextUrl;
        return;
      }

      if (state === PP_STATES.AT_REPORT) {
        if (!url.includes('/rpt-generate.php')) {
          const rptAttempts = getPpNavAttempts();
          if (rptAttempts >= PP_MAX_NAV_ATTEMPTS) {
            setPpState(PP_STATES.IDLE);
            hideProgressBanner();
            alert('Paycom Bot: could not reach the report page after ' +
              PP_MAX_NAV_ATTEMPTS + ' attempts (kept landing on "' + location.pathname +
              '"). Re-run Prior Payroll once you are logged in to the client.');
            return;
          }
          log(`Not on report page — bounce attempt ${rptAttempts + 1}/${PP_MAX_NAV_ATTEMPTS}`);
          setPpNavAttempts(rptAttempts + 1);
          location.href = ppYtdReportUrl();
          return;
        }
        setPpNavAttempts(0); // on the report page — reset loop guard
        try {
          await ppHandleReportPage();
        } catch (err) {
          if (err.aborted) { log('PP report aborted by user'); hideProgressBanner(); return; }
          alert('Paycom Bot (PP, report): ' + err.message);
          setPpState(PP_STATES.IDLE);
        }
        return;
      }
    }

    // ───────────────── Scheduled Deductions (rpt_id=8) ─────────────────

    const SD_STATE_KEY = 'paycomBot.sd.state';
    const SD_STATES = {
      IDLE: 'IDLE',
      AT_REPORT: 'SD_AT_REPORT',
    };
    const SD_CONFIG = {
      reportId: 8,
    };
    const sdReportUrl = () =>
      `https://www.paycomonline.net/v4/cl/rpt-generate.php?rpt_id=${SD_CONFIG.reportId}`;

    const getSdState = () => localStorage.getItem(SD_STATE_KEY) || SD_STATES.IDLE;
    const setSdState = (s) => {
      if (s === SD_STATES.IDLE) localStorage.removeItem(SD_STATE_KEY);
      else localStorage.setItem(SD_STATE_KEY, s);
      refreshPanel();
      log('SD state →', s);
    };
    const isSdRunning = () => getSdState() !== SD_STATES.IDLE;

    function startScheduledDeductions() {
      setState(STATES.IDLE);
      setPpState(PP_STATES.IDLE);
      setTpState(TP_STATES.IDLE);
      setSdState(SD_STATES.AT_REPORT);
      dispatch();
    }

    async function sdHandleReportPage() {
      log('SD: waiting for report form');
      await waitFor(
        () => findRadioByLabel('CSV') || findGenerateReportButton(),
        { timeout: 20000, label: 'Scheduled Deductions form' }
      );

      const csvRadio = findRadioByLabel('CSV');
      if (csvRadio && !csvRadio.checked) {
        log('SD: selecting CSV');
        clickEl(csvRadio);
      } else if (csvRadio) {
        log('SD: CSV already selected');
      } else {
        log('SD: Warning — CSV radio not found, using default format');
      }
      await sleep(200);

      const selectAll = findEmployeeSelectAllCheckbox();
      if (selectAll) {
        if (!selectAll.checked) {
          log('SD: clicking Employee Select All');
          clickEl(selectAll);
          await sleep(2000); // employee list takes a moment to load
        } else {
          log('SD: Employee Select All already checked');
        }
      } else {
        log('SD: Warning — Employee Select All checkbox not found');
      }
      await sleep(400);

      const initialDownloads = getDownloadButtons().length;
      log(`SD: initial Download buttons before generate: ${initialDownloads}`);

      const genBtn = findGenerateReportButton();
      if (!genBtn) throw new Error('SD: Generate Report button not found');
      log('SD: clicking Generate Report');
      showProgressBanner('Scheduled Deductions: generating…');
      clickEl(genBtn);

      log('SD: waiting for Download button (up to 10 min)');
      await waitFor(
        () => getDownloadButtons().length > initialDownloads,
        { timeout: 10 * 60 * 1000, interval: 800, label: 'Scheduled Deductions Download' }
      );

      const downloads = getDownloadButtons();
      downloads.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      log('SD: clicking newest Download button');
      clickEl(downloads[0]);

      await sleep(1500);
      hideProgressBanner();
      showSuccessBanner('✓ Scheduled Deductions downloaded');
      setSdState(SD_STATES.IDLE);
    }

    async function dispatchScheduledDeductions() {
      if (!isSdRunning()) return;
      dismissPrivacyBanner();
      const url = location.href;
      log('SD dispatch on', location.pathname);

      // Distinguish from Prior Payroll's rpt-generate page by rpt_id.
      const onSdReport = url.includes('/rpt-generate.php') &&
        /[?&]rpt_id=8(?:[&#]|$)/.test(url);

      if (!onSdReport) {
        location.href = sdReportUrl();
        return;
      }

      try {
        await sdHandleReportPage();
      } catch (err) {
        if (err.aborted) { log('SD aborted by user'); hideProgressBanner(); return; }
        hideProgressBanner();
        alert('Paycom Bot (Scheduled Deductions): ' + err.message);
        setSdState(SD_STATES.IDLE);
      }
    }

    // ───────────────── Tax Profile Report (rpt_id=15) ─────────────────

    const TP_STATE_KEY = 'paycomBot.tp.state';
    const TP_STATES = {
      IDLE: 'IDLE',
      AT_REPORT: 'TP_AT_REPORT',
    };
    const TP_CONFIG = {
      reportId: 15,
    };
    const tpReportUrl = () =>
      `https://www.paycomonline.net/v4/cl/rpt-generate.php?rpt_id=${TP_CONFIG.reportId}`;

    const getTpState = () => localStorage.getItem(TP_STATE_KEY) || TP_STATES.IDLE;
    const setTpState = (s) => {
      if (s === TP_STATES.IDLE) localStorage.removeItem(TP_STATE_KEY);
      else localStorage.setItem(TP_STATE_KEY, s);
      refreshPanel();
      log('TP state →', s);
    };
    const isTpRunning = () => getTpState() !== TP_STATES.IDLE;

    function startTaxProfile() {
      setState(STATES.IDLE);
      setPpState(PP_STATES.IDLE);
      setSdState(SD_STATES.IDLE);
      setTpState(TP_STATES.AT_REPORT);
      // Immediate feedback so the button doesn't look unresponsive while the
      // report page loads (the banner is re-shown on the loaded page below).
      showProgressBanner('Tax Profile Report: opening…');
      dispatch();
    }

    async function tpHandleReportPage() {
      showProgressBanner('Tax Profile Report: loading report form…');
      log('TP: waiting for report form');
      await waitFor(
        () => findRadioByLabel('Excel') || findGenerateReportButton(),
        { timeout: 20000, label: 'Tax Profile Report form' }
      );

      // The Excel/XLSX format option's label text varies between Paycom
      // reports — try the common spellings.
      const excelRadio = findRadioByLabel('XLSX')
        || findRadioByLabel('Excel')
        || findRadioByLabel('MS Excel')
        || findRadioByLabel('Excel (XLSX)')
        || findRadioByLabel('Excel (xlsx)');
      if (excelRadio && !excelRadio.checked) {
        log('TP: selecting Excel/XLSX');
        clickEl(excelRadio);
      } else if (excelRadio) {
        log('TP: Excel/XLSX already selected');
      } else {
        log('TP: Warning — Excel/XLSX radio not found, using default format');
      }
      await sleep(200);

      const selectAll = findEmployeeSelectAllCheckbox();
      if (selectAll) {
        if (!selectAll.checked) {
          log('TP: clicking Employee Select All');
          clickEl(selectAll);
          await sleep(2000); // employee list takes a moment to load
        } else {
          log('TP: Employee Select All already checked');
        }
      } else {
        log('TP: Warning — Employee Select All checkbox not found');
      }
      await sleep(400);

      const initialDownloads = getDownloadButtons().length;
      log(`TP: initial Download buttons before generate: ${initialDownloads}`);

      const genBtn = findGenerateReportButton();
      if (!genBtn) throw new Error('TP: Generate Report button not found');
      log('TP: clicking Generate Report');
      showProgressBanner('Tax Profile Report: generating…');
      clickEl(genBtn);

      log('TP: waiting for Download button (up to 10 min)');
      await waitFor(
        () => getDownloadButtons().length > initialDownloads,
        { timeout: 10 * 60 * 1000, interval: 800, label: 'Tax Profile Report Download' }
      );

      const downloads = getDownloadButtons();
      downloads.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      log('TP: clicking newest Download button');
      clickEl(downloads[0]);

      await sleep(1500);
      hideProgressBanner();
      showSuccessBanner('✓ Tax Profile Report downloaded');
      setTpState(TP_STATES.IDLE);
    }

    async function dispatchTaxProfile() {
      if (!isTpRunning()) return;
      dismissPrivacyBanner();
      // Re-show the banner the instant this page's script runs — the previous
      // page's banner was destroyed by the navigation.
      showProgressBanner('Tax Profile Report: opening report page…');
      const url = location.href;
      log('TP dispatch on', location.pathname);

      // Distinguish from the other rpt-generate reports by rpt_id.
      const onTpReport = url.includes('/rpt-generate.php') &&
        /[?&]rpt_id=15(?:[&#]|$)/.test(url);

      if (!onTpReport) {
        location.href = tpReportUrl();
        return;
      }

      try {
        await tpHandleReportPage();
      } catch (err) {
        if (err.aborted) { log('TP aborted by user'); hideProgressBanner(); return; }
        hideProgressBanner();
        alert('Paycom Bot (Tax Profile Report): ' + err.message);
        setTpState(TP_STATES.IDLE);
      }
    }

    // ───────────────── Qualified Premiums Report (Report Center slug) ─────────────────
    // Path-based Report Center URL (no rpt_id). Flow: navigate → set the Date
    // Range start to 01/01/2026 → Generate → download. Default output format,
    // no Employee Select-All (the report only needs the date + Generate).

    const QP_STATE_KEY = 'paycomBot.qp.state';
    const QP_STATES = {
      IDLE: 'IDLE',
      AT_REPORT: 'QP_AT_REPORT',
    };
    const QP_CONFIG = {
      // Report Center slug URL the user provided.
      slug: 'report-center/generate/estimated-qualified-overtime-ta-report',
      startDate: '01/01/2026',
    };
    const qpReportUrl = () =>
      'https://www.paycomonline.net/v4/cl/web.php/' + QP_CONFIG.slug;

    const getQpState = () => localStorage.getItem(QP_STATE_KEY) || QP_STATES.IDLE;
    const setQpState = (s) => {
      if (s === QP_STATES.IDLE) localStorage.removeItem(QP_STATE_KEY);
      else localStorage.setItem(QP_STATE_KEY, s);
      refreshPanel();
      log('QP state →', s);
    };
    const isQpRunning = () => getQpState() !== QP_STATES.IDLE;

    function startQualifiedPremiums() {
      setState(STATES.IDLE);
      setPpState(PP_STATES.IDLE);
      setSdState(SD_STATES.IDLE);
      setTpState(TP_STATES.IDLE);
      setQpState(QP_STATES.AT_REPORT);
      showProgressBanner('Qualified Premiums Report: opening…');
      dispatch();
    }

    async function qpHandleReportPage() {
      showProgressBanner('Qualified Premiums Report: loading report form…');
      log('QP: waiting for report form');
      await waitFor(
        () => findGenerateReportButton(),
        { timeout: 25000, label: 'Qualified Premiums Report form' }
      );
      await sleep(500); // settle so the date field is wired up

      // Set the Date Range START date only; leave the end date at the default.
      // findDateRangeInputs requires both inputs to already hold MM/DD/YYYY, so
      // fall back to a looser finder if the fields are empty on this report.
      let dr = findDateRangeInputs();
      if (!dr) {
        const label = findVisibleByExactText('Date Range');
        let container = label;
        for (let i = 0; label && i < 6 && container; i++) {
          container = container.parentElement;
          if (!container) break;
          const inputs = Array.from(container.querySelectorAll('input[type="text"]')).filter(visible);
          if (inputs.length >= 1) { dr = { from: inputs[0], to: inputs[1] || null }; break; }
        }
      }
      if (!dr || !dr.from) throw new Error('QP: Date Range start input not found');
      log('QP: setting start date = ' + QP_CONFIG.startDate);
      setInputValue(dr.from, QP_CONFIG.startDate);
      await sleep(400);

      const initialDownloads = getDownloadButtons().length;
      const genBtn = findGenerateReportButton();
      if (!genBtn) throw new Error('QP: Generate Report button not found');
      log('QP: clicking Generate Report');
      showProgressBanner('Qualified Premiums Report: generating…');
      clickEl(genBtn);

      log('QP: waiting for Download button (up to 10 min)');
      await waitFor(
        () => getDownloadButtons().length > initialDownloads,
        { timeout: 10 * 60 * 1000, interval: 800, label: 'Qualified Premiums Report Download' }
      );

      const downloads = getDownloadButtons();
      downloads.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      log('QP: clicking newest Download button');
      clickEl(downloads[0]);

      await sleep(1500);
      hideProgressBanner();
      showSuccessBanner('✓ Qualified Premiums Report downloaded');
      setQpState(QP_STATES.IDLE);
    }

    async function dispatchQualifiedPremiums() {
      if (!isQpRunning()) return;
      dismissPrivacyBanner();
      showProgressBanner('Qualified Premiums Report: opening report page…');
      const url = location.href;
      log('QP dispatch on', location.pathname);

      const onQpReport = url.includes(QP_CONFIG.slug);
      if (!onQpReport) {
        location.href = qpReportUrl();
        return;
      }

      try {
        await qpHandleReportPage();
      } catch (err) {
        if (err.aborted) { log('QP aborted by user'); hideProgressBanner(); return; }
        hideProgressBanner();
        alert('Paycom Bot (Qualified Premiums Report): ' + err.message);
        setQpState(QP_STATES.IDLE);
      }
    }

    // ───────────────── Page-router state machine ─────────────────

    async function dispatch() {
      if (isRunning()) return await dispatchCensus();
      if (isPpRunning()) return await dispatchPriorPayroll();
      if (isSdRunning()) return await dispatchScheduledDeductions();
      if (isTpRunning()) return await dispatchTaxProfile();
      if (isQpRunning()) return await dispatchQualifiedPremiums();
    }

    async function dispatchCensus() {
      if (!isRunning()) return;

      dismissPrivacyBanner();
      const url = location.href;
      log('dispatch on', location.pathname);

      if (url.includes('/srw-reportwriter-savedReport.php')) {
        // Two cases: Recent reports tab (wait + download) or ARW landing (start wizard)
        if (isOnRecentReportsTab()) {
          try {
            await waitForReportAndDownload();
          } catch (err) {
            hideProgressBanner();
            if (err.aborted) { log('Census download aborted by user'); return; }
            alert('Paycom Bot (download): ' + err.message);
            setState(STATES.IDLE);
          }
          return;
        }

        try {
          const createBtn = await waitFor(
            () => findByText(['button', 'a'], 'Create New Report'),
            { label: '"Create New Report" button' }
          );
          log('Clicking Create New Report');
          createBtn.click();
          const option = await waitFor(
            () => findByText(['a', 'li', 'button', 'div', 'span'], CONFIG.reportType),
            { label: `dropdown option "${CONFIG.reportType}"` }
          );
          log('Clicking option', CONFIG.reportType);
          option.click();
        } catch (err) {
          if (err.aborted) { log('Census aborted by user'); return; }
          alert('Paycom Bot: ' + err.message);
          setState(STATES.IDLE);
        }
        return;
      }

      if (url.includes('/enh-srw-reportwriter.php')) {
        try {
          await waitFor(() => getAllFilterCheckboxes().length > 0, {
            timeout: 30000,
            label: 'filter checkboxes',
          });
          await selectRequiredFieldsAndNext();
          // Continue: click Next on Filters & Sorting, select CSV, click Generate Report.
          // Page then navigates to Recent reports — dispatcher fires there.
          await runWizardAfterStep1();
        } catch (err) {
          if (err.aborted) { log('Census builder aborted by user'); return; }
          alert('Paycom Bot (builder): ' + err.message);
          setState(STATES.IDLE);
        }
        return;
      }

      // Anything else (dashboard, post-login landing, etc.) → kick off ARW navigation
      location.href = CONFIG.arwSavedReportsUrl;
    }

    // ───────────────── Documents: Download All (fetch + blob) ─────────────────
    // The Doc Dashboard URL the "Download All Documents" button navigates to.
    const DOC_DASHBOARD_URL = 'https://www.paycomonline.net/v4/cl/web.php/Doc/Dashboard';
    // Set by setupDocDownloader() once its controls mount on the Doc Dashboard.
    let docsStartFresh = null;     // start a fresh document download run
    let docsResume = null;         // resume an interrupted run
    let docsRunAfterReload = null; // continue a run after Apply Filters reloaded the page
    let docsStop = null;           // abort an in-flight run (wired to Stop / reset)

    // Poll until the Doc Dashboard DataTables grid has rendered rows (or time out).
    function waitForDocTable(cb) {
      const start = Date.now();
      (function poll() {
        const rows = document.querySelectorAll('#ee-doc-table tbody tr[role="row"]');
        if (rows.length || Date.now() - start > 20000) return cb();
        setTimeout(poll, 300);
      })();
    }

    // Ask the user which year to START from. The END date is always Dec 31 of
    // the current year (auto-updates each year). Returns
    // { from:'MM/DD/YYYY', to:'MM/DD/YYYY' } or null if the user cancels.
    function computeFilterRange() {
      const currentYear = new Date().getFullYear();
      const toStr = `12/31/${currentYear}`;
      const def = String(Math.max(1990, currentYear - 4));
      while (true) {
        const raw = window.prompt(
          'Download All Documents — enter the START YEAR for the "Last Modified" filter.\n' +
          `From = 01/01/<year>, To = 12/31/${currentYear} (end of the current year).`,
          def
        );
        if (raw === null) return null; // cancelled
        const n = parseInt(String(raw).trim(), 10);
        if (Number.isInteger(n) && n >= 1990 && n <= currentYear) {
          return { from: `01/01/${n}`, to: toStr };
        }
        alert(`Please enter a 4-digit year between 1990 and ${currentYear}.`);
      }
    }

    // Entry point for the panel's "Download All Documents" button. Prompts for
    // the start year first, then: if already on the Doc Dashboard, start
    // immediately; otherwise flag an auto-start and navigate there — init()
    // picks up the flag (and the stored range) after the page loads.
    function startDocs() {
      const range = computeFilterRange();
      if (!range) return; // user cancelled
      try { localStorage.setItem('paycomBot.docs.range', JSON.stringify(range)); } catch (_) {}
      if (/\/Doc\/Dashboard/i.test(location.href)) {
        waitForDocTable(() => { if (docsStartFresh) docsStartFresh(); });
      } else {
        try { localStorage.setItem('paycomBot.docs.autostart', '1'); } catch (_) {}
        location.href = DOC_DASHBOARD_URL;
      }
    }

    // Self-contained module: its own state key (`paycom_dl_state`) and its own
    // helpers (dlSleep, loadDlState, …) so nothing collides with the census /
    // prior-payroll state machine. Bulk-downloads every document on the Doc
    // Dashboard by fetch()→Blob→save (no browser-queue drops), paginating the
    // DataTables grid. The Start trigger is the panel's "Download All Documents"
    // button; this section shows status + pause/resume while a run is active.
    function setupDocDownloader(container) {
      if (!container || container.dataset.docDlMounted) return;
      container.dataset.docDlMounted = '1';

      const CFG = {
        DELAY_BETWEEN_ROWS: 100,   // short — no queue pressure with fetch+blob
        POLL_MS: 150,
        MAX_PAGE_WAIT: 60000,
        FETCH_TIMEOUT: 15000,      // 15s per file download
        MAX_RETRIES: 2,            // retry failed fetches
        STATE_KEY: 'paycom_dl_state',
      };

      // ═════════════════ persistent run log ═════════════════
      // clearDlState() wipes `paycom_dl_state` both on completion AND on Stop,
      // so after a long unattended run nothing is left to answer "what actually
      // happened?". These two keys are independent of it and survive reloads,
      // browser restarts and Stop/reset — only the panel's "Clear stored log"
      // button removes them.
      //   LOG_KEY  → one row per document attempt (ok / fail / dup)
      //   RUNS_KEY → one row per run (start, end, counts, how it ended)
      const LOG = {
        LOG_KEY: 'paycom_dl_log',
        RUNS_KEY: 'paycom_dl_runs',
        FLUSH_EVERY: 25,      // batched: a write per row is O(n^2) over 9k+ rows
        MAX_ENTRIES: 40000,   // ring-buffer cap so localStorage cannot overflow
        MAX_RUNS: 50,
      };

      let logBuf = [];        // entries not yet persisted
      let logCount = 0;       // entries already persisted
      let currentRunId = null;

      const two = (n) => String(n).padStart(2, '0');
      function stamp(d) {
        d = d || new Date();
        return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}` +
          `_${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
      }
      function isoLocal(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ` +
          `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
      }

      function downloadText(text, filename, mime) {
        const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      function logRead() {
        try { return JSON.parse(localStorage.getItem(LOG.LOG_KEY) || '[]'); }
        catch (_) { return []; }
      }
      function runsRead() {
        try { return JSON.parse(localStorage.getItem(LOG.RUNS_KEY) || '[]'); }
        catch (_) { return []; }
      }
      function runsWrite(runs) {
        try {
          const t = runs.length > LOG.MAX_RUNS ? runs.slice(runs.length - LOG.MAX_RUNS) : runs;
          localStorage.setItem(LOG.RUNS_KEY, JSON.stringify(t));
        } catch (e) { console.warn('[DL] runs write failed', e); }
      }

      // Merge the in-memory buffer into localStorage. If the quota blows, dump
      // everything to a CSV in Downloads rather than lose the run silently.
      function logFlush(force) {
        if (!logBuf.length && !force) return;
        try {
          const all = logRead().concat(logBuf);
          const t = all.length > LOG.MAX_ENTRIES ? all.slice(all.length - LOG.MAX_ENTRIES) : all;
          localStorage.setItem(LOG.LOG_KEY, JSON.stringify(t));
          logCount = t.length;
          logBuf = [];
        } catch (e) {
          console.warn('[DL] log flush failed (quota?) — auto-exporting to file', e);
          try {
            downloadText(logToCsv(logRead().concat(logBuf)),
              'paycom_dl_log_overflow_' + stamp() + '.csv');
            localStorage.setItem(LOG.LOG_KEY, '[]');
          } catch (_) {}
          logCount = 0;
          logBuf = [];
        }
      }
      function logAppend(entry) {
        logBuf.push(entry);
        if (logBuf.length >= LOG.FLUSH_EVERY) logFlush();
      }
      function logClearAll() {
        logBuf = []; logCount = 0;
        try {
          localStorage.removeItem(LOG.LOG_KEY);
          localStorage.removeItem(LOG.RUNS_KEY);
        } catch (_) {}
      }
      const logAll = () => logRead().concat(logBuf);

      // One log row. Short keys keep 9k+ entries inside the localStorage quota.
      function logRow(info, state, status, extra) {
        return Object.assign({
          t: Date.now(),
          run: currentRunId,
          p: state.currentPage,
          ec: info.empCode,
          en: info.empName,
          dn: info.docName,
          ft: info.fileTemplate,
          id: info.docId,
          s: status,
        }, extra || {});
      }

      // CSV helpers. Deliberately backslash-free (fromCharCode / indexOf rather
      // than escapes and regex literals) so the block survives future patching.
      const CRLF = String.fromCharCode(13, 10);
      function csvCell(v) {
        const str = String(v === null || v === undefined ? '' : v);
        const needsQuote = str.indexOf('"') >= 0 || str.indexOf(',') >= 0 ||
          str.indexOf(String.fromCharCode(10)) >= 0 ||
          str.indexOf(String.fromCharCode(13)) >= 0;
        return needsQuote ? '"' + str.split('"').join('""') + '"' : str;
      }
      const LOG_COLS = [
        ['when',          (e) => isoLocal(e.t)],
        ['run_id',        (e) => e.run || ''],
        ['status',        (e) => e.s],
        ['page',          (e) => e.p],
        ['emp_code',      (e) => e.ec],
        ['emp_name',      (e) => e.en],
        ['doc_name',      (e) => e.dn],
        ['file_template', (e) => e.ft],
        ['doc_id',        (e) => e.id],
        ['saved_as',      (e) => e.f || ''],
        ['size_kb',       (e) => (e.kb === undefined ? '' : e.kb)],
        ['content_type',  (e) => e.ct || ''],
        ['attempts',      (e) => (e.a === undefined ? '' : e.a)],
        ['reason',        (e) => e.r || ''],
      ];
      function logToCsv(entries) {
        const head = LOG_COLS.map((c) => c[0]).join(',');
        const rows = entries.map((e) => LOG_COLS.map((c) => csvCell(c[1](e))).join(','));
        return [head].concat(rows).join(CRLF);
      }
      function runsToCsv(runs) {
        const head = 'run_id,started,ended,how_it_ended,pages_seen,attempted,saved,failed,already_done';
        const rows = runs.map((r) => [
          r.id, isoLocal(r.start), isoLocal(r.end), r.status,
          r.pages, r.attempted, r.ok, r.fail, r.dup,
        ].map(csvCell).join(','));
        return [head].concat(rows).join(CRLF);
      }

      function exportFullLog() {
        logFlush(true);
        const entries = logAll();
        if (!entries.length) { alert('No document log entries stored yet.'); return; }
        downloadText(logToCsv(entries), 'paycom_dl_log_' + stamp() + '.csv');
        const runs = runsRead();
        if (runs.length) downloadText(runsToCsv(runs), 'paycom_dl_runs_' + stamp() + '.csv');
      }
      function exportFailedLog() {
        logFlush(true);
        const bad = logAll().filter((e) => e.s !== 'ok');
        if (!bad.length) { alert('No failed or skipped documents logged.'); return; }
        downloadText(logToCsv(bad), 'paycom_dl_FAILED_' + stamp() + '.csv');
      }

      // ── run-summary bookkeeping ──
      function runStart(state) {
        currentRunId = 'run_' + stamp();
        const runs = runsRead();
        runs.push({
          id: currentRunId, start: Date.now(), end: null, status: 'running',
          pages: 0, attempted: 0, ok: 0, fail: 0, dup: 0,
          resumedFromPage: state.currentPage,
        });
        runsWrite(runs);
        console.log(`[DL] ── run ${currentRunId} started (from page ${state.currentPage}) ──`);
        return currentRunId;
      }
      function runEnd(state, status, pagesSeen) {
        logFlush(true);
        const runs = runsRead();
        const r = runs.filter((x) => x.id === currentRunId)[0];
        if (r) {
          r.end = Date.now();
          r.status = status;
          r.pages = pagesSeen;
          r.attempted = state.totalAttempted;
          r.ok = state.downloadedDocIds.size;
          r.fail = state.skippedDocs.length;
          r.dup = state.dupSkips || 0;
          runsWrite(runs);
        }
        console.log(`[DL] ── run ${currentRunId} ended: ${status} ──`);
      }

      // Last-ditch flush if the tab is closed or navigates away mid-run.
      window.addEventListener('beforeunload', () => { try { logFlush(); } catch (_) {} });

      const dlSleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let paused = false;
      // Set by docsStop() (the panel's Stop / reset button). Every loop in the
      // run checks it so an in-flight download halts within a row or two.
      let stopRequested = false;
      async function waitWhilePaused() { while (paused && !stopRequested) await dlSleep(200); }

      // ── state (persisted to localStorage after every row) ──
      function loadDlState() {
        try {
          const raw = localStorage.getItem(CFG.STATE_KEY);
          if (!raw) return null;
          const s = JSON.parse(raw);
          s.downloadedDocIds = new Set(s.downloadedDocIds || []);
          return s;
        } catch (_) { return null; }
      }
      function saveDlState(s) {
        try {
          localStorage.setItem(CFG.STATE_KEY, JSON.stringify({
            ...s, downloadedDocIds: [...s.downloadedDocIds],
          }));
        } catch (e) { console.warn('[DL] saveState failed', e); }
      }
      function clearDlState() { localStorage.removeItem(CFG.STATE_KEY); }
      function freshDlState() {
        return {
          currentPage: getCurrentPage(),
          totalAttempted: 0,
          downloadedDocIds: new Set(),
          skippedDocs: [],
          dupSkips: 0,
          isComplete: false,
        };
      }

      // ── DOM helpers ──
      const getNextBtn = () => document.getElementById('ee-doc-table_next');
      const isNextDisabled = () => { const b = getNextBtn(); return !b || b.classList.contains('disabled'); };
      const getInfoText = () => { const e = document.getElementById('ee-doc-table_info'); return e ? e.textContent.trim() : ''; };
      const getCurrentPage = () => {
        const el = document.querySelector('#ee-doc-table_paginate .paginate_button.current');
        return el ? parseInt(el.textContent, 10) : 1;
      };
      function escHtml(s) {
        return String(s ?? '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }
      async function waitForPageChange(prev) {
        const end = Date.now() + CFG.MAX_PAGE_WAIT;
        while (Date.now() < end) {
          if (stopRequested) return false;
          await dlSleep(CFG.POLL_MS);
          const cur = getInfoText();
          if (cur && cur !== prev) return true;
        }
        return false;
      }

      // ── row info extraction ──
      function getRowInfo(row) {
        const empLink = row.querySelector('td:nth-child(2) a');
        const empFull = empLink ? empLink.textContent.trim() : 'Unknown';
        const codeM = empFull.match(/\(([^)]+)\)\s*$/);
        const empCode = codeM ? codeM[1] : '';

        const docLink = row.querySelector('td:nth-child(5) a[target="_self"]');
        const docName = docLink ? docLink.textContent.trim() : 'Unknown Document';

        const ftCell = row.querySelector('td:nth-child(6)');
        const fileTemplate = ftCell ? ftCell.textContent.trim() : '';

        let docId = null;
        const dlHidden = row.querySelector('a.ddbMenuItemLink[href*="downloadfile=1"]');
        if (dlHidden) { const m = dlHidden.href.match(/docid=(\d+)/); if (m) docId = m[1]; }
        if (!docId) {
          const cb = row.querySelector('input[type="checkbox"]');
          if (cb) { const m = cb.value.match(/\[(\d+)\]$/); if (m) docId = m[1]; }
        }

        const dlUrl = dlHidden ? dlHidden.href : null;

        return {
          empName: empFull,
          empCode,
          docName,
          fileTemplate,
          docId: docId || `noid-${Math.random().toString(36).slice(2)}`,
          dlUrl,
        };
      }

      // ── core: fetch() file → Blob → save to disk ──
      function extractFilename(response, fallback) {
        const cd = response.headers.get('Content-Disposition');
        if (cd) {
          const m = cd.match(/filename\*?=(?:UTF-8''|"?)([^";]+)"?/i);
          if (m) return decodeURIComponent(m[1].trim());
        }
        return fallback;
      }
      async function fetchAndSave(url, fallbackFilename) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CFG.FETCH_TIMEOUT);
        try {
          const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
          clearTimeout(timer);
          if (!res.ok) return { ok: false, reason: `HTTP ${res.status} ${res.statusText}` };
          const blob = await res.blob();
          if (blob.size === 0) return { ok: false, reason: 'Server returned empty file (0 bytes)' };
          const ctype = String(blob.type || res.headers.get('Content-Type') || '').toLowerCase();
          const filename = extractFilename(res, fallbackFilename);
          // Paycom sometimes answers 200 OK with its HTML document-viewer page
          // instead of the file (documents that only open in the inline viewer
          // do this). Without this guard they land in Downloads as ~205 KB .htm
          // files AND get counted as successes, silently corrupting the run.
          const lowerName = filename.toLowerCase();
          if (ctype.indexOf('text/html') >= 0 ||
              lowerName.endsWith('.htm') || lowerName.endsWith('.html')) {
            return {
              ok: false,
              contentType: ctype,
              reason: 'Server returned an HTML page, not a file (' +
                (ctype || 'no content-type') +
                ') — this document probably only opens in the inline viewer',
            };
          }
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
          return { ok: true, filename, size: blob.size, type: blob.type || res.headers.get('Content-Type') || 'unknown' };
        } catch (e) {
          clearTimeout(timer);
          if (e.name === 'AbortError') return { ok: false, reason: `Timeout after ${CFG.FETCH_TIMEOUT / 1000}s` };
          return { ok: false, reason: `Network error: ${e.message}` };
        }
      }

      // ── process one table page ──
      async function processPage(state, statusEl) {
        const rows = Array.from(document.querySelectorAll('#ee-doc-table tbody tr[role="row"]'));
        console.log(`[DL] Page ${state.currentPage} — ${rows.length} rows`);

        for (let i = 0; i < rows.length; i++) {
          if (stopRequested) { console.log('[DL] Stop requested — halting at row ' + (i + 1)); return; }
          const info = getRowInfo(rows[i]);
          await waitWhilePaused();
          if (stopRequested) { console.log('[DL] Stop requested — halting at row ' + (i + 1)); return; }

          statusEl.textContent =
            `Docs: p${state.currentPage} row ${i + 1}/${rows.length}` +
            ` | ✓ ${state.downloadedDocIds.size} ✗ ${state.skippedDocs.length}`;

          if (state.downloadedDocIds.has(info.docId)) {
            console.log(`[DL] Skip (already done): ${info.empName}`);
            state.dupSkips = (state.dupSkips || 0) + 1;
            logAppend(logRow(info, state, 'dup', { r: 'Already downloaded earlier in this run' }));
            continue;
          }

          state.totalAttempted++;

          if (!info.dlUrl) {
            const noUrl = 'No download URL found in row DOM';
            state.skippedDocs.push({ ...info, reason: noUrl, page: state.currentPage });
            logAppend(logRow(info, state, 'fail', { r: noUrl, a: 0 }));
            saveDlState(state);
            continue;
          }

          const fallbackName = info.fileTemplate && info.fileTemplate !== 'N/A'
            ? `${info.empCode}_${info.fileTemplate}`
            : `${info.empCode}_${info.docName.replace(/\s+/g, '_')}.pdf`;

          let result = null;
          let attemptsUsed = 0;
          for (let attempt = 0; attempt <= CFG.MAX_RETRIES; attempt++) {
            if (stopRequested) return;
            attemptsUsed = attempt + 1;
            if (attempt > 0) {
              console.log(`[DL] Retry ${attempt}/${CFG.MAX_RETRIES} for ${info.empName}`);
              statusEl.textContent = `Docs: p${state.currentPage} row ${i + 1}/${rows.length} | RETRY ${attempt}`;
              await dlSleep(2000 * attempt);
            }
            result = await fetchAndSave(info.dlUrl, fallbackName);
            if (result.ok) break;
          }

          if (result.ok) {
            state.downloadedDocIds.add(info.docId);
            logAppend(logRow(info, state, 'ok', {
              f: result.filename,
              kb: Math.round(result.size / 1024),
              ct: result.type,
              a: attemptsUsed,
            }));
            saveDlState(state);
            console.log(`[DL] ✓ ${info.empName} → ${result.filename} (${(result.size / 1024).toFixed(0)} KB, ${result.type})`);
          } else {
            console.warn(`[DL] ✗ ${info.empName}: ${result.reason}`);
            state.skippedDocs.push({ ...info, reason: result.reason, page: state.currentPage });
            logAppend(logRow(info, state, 'fail', {
              r: result.reason,
              ct: result.contentType || '',
              a: attemptsUsed,
            }));
            saveDlState(state);
          }

          await dlSleep(CFG.DELAY_BETWEEN_ROWS);
        }
      }

      // ── pagination ──
      async function gotoPage(target) {
        if (getCurrentPage() === target) return;
        const goInput = document.querySelector('#ee-doc-table_goToPage input[type="number"]');
        if (goInput) {
          const prev = getInfoText();
          goInput.focus();
          goInput.value = String(target);
          ['input', 'change'].forEach(t => goInput.dispatchEvent(new Event(t, { bubbles: true })));
          ['keydown', 'keypress', 'keyup'].forEach(t =>
            goInput.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', keyCode: 13, which: 13, charCode: 13, bubbles: true })));
          const changed = await waitForPageChange(prev);
          if (changed && getCurrentPage() === target) return;
        }
        while (getCurrentPage() < target && !isNextDisabled()) {
          const prev = getInfoText();
          getNextBtn().click();
          await waitForPageChange(prev);
        }
      }

      // ── orchestrator ──
      async function run(state, statusEl) {
        runStart(state);
        let pagesSeen = 0;
        let endStatus = 'complete';
        try {
          if (state.currentPage > 1) {
            statusEl.textContent = `Navigating to page ${state.currentPage}…`;
            await gotoPage(state.currentPage);
            await dlSleep(800);
          }

          await processPage(state, statusEl);
          pagesSeen++;

          await dlSleep(500);
          while (!isNextDisabled() && !stopRequested) {
            const prevInfo = getInfoText();
            getNextBtn().click();
            const moved = await waitForPageChange(prevInfo);
            if (!moved) {
              if (!stopRequested) {
                console.warn('[DL] Pagination stuck — timed out waiting for page change. Stopping.');
                endStatus = 'stalled-pagination';
              }
              break;
            }
            state.currentPage = getCurrentPage();
            saveDlState(state);
            await processPage(state, statusEl);
            pagesSeen++;
            await dlSleep(500);
          }

          if (stopRequested) {
            endStatus = 'stopped-by-user';
            console.log(`[DL] Stopped by user: ✓ ${state.downloadedDocIds.size} ✗ ${state.skippedDocs.length}`);
            statusEl.textContent = 'Documents: stopped';
            return;
          }

          // A pagination stall is NOT a finished run. Keep the saved state so
          // Resume can pick it up from the stuck page; previously this fell
          // through and wiped it, marking a half-done run as complete.
          if (endStatus === 'stalled-pagination') {
            showSummary(state);
            statusEl.textContent =
              `Docs STALLED on page ${state.currentPage} — use Resume ` +
              `(✓ ${state.downloadedDocIds.size} ✗ ${state.skippedDocs.length})`;
            return;
          }

          state.isComplete = true;
          saveDlState(state);
          showSummary(state);
          clearDlState();
          statusEl.textContent = `Docs done: ✓ ${state.downloadedDocIds.size} ✗ ${state.skippedDocs.length}`;
        } catch (e) {
          endStatus = 'error: ' + (e && e.message ? e.message : String(e));
          throw e;
        } finally {
          runEnd(state, endStatus, pagesSeen);
          refreshLogInfo();
        }
      }

      // ── summary overlay ──
      function showSummary(state) {
        const dl = state.downloadedDocIds.size;
        const sk = state.skippedDocs.length;
        const tot = state.totalAttempted;

        console.log(`[DL] ══ COMPLETE ══  attempted:${tot}  saved:${dl}  skipped:${sk}`);
        if (sk) {
          console.group('[DL] Skipped:');
          state.skippedDocs.forEach((d, i) =>
            console.warn(`  ${i + 1}. [p${d.page}] ${d.empName} – "${d.docName}"\n     ↳ ${d.reason}`));
          console.groupEnd();
        }

        document.getElementById('paycom_dl_summary')?.remove();

        const ov = document.createElement('div');
        ov.id = 'paycom_dl_summary';
        Object.assign(ov.style, {
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: '#fff', border: '2px solid #0b7dda', borderRadius: '12px', padding: '24px 28px',
          zIndex: '9999999', maxWidth: '580px', width: '92%', maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,.45)', fontFamily: 'system-ui,sans-serif', fontSize: '14px', lineHeight: '1.6',
        });
        ov.innerHTML = `
          <h3 style="margin:0 0 16px;color:#0b7dda;font-size:18px">Download Summary</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px">
            <tr style="border-bottom:1px solid #eee"><td style="padding:6px 0;color:#555">Rows attempted</td><td style="padding:6px 0;font-weight:700">${tot}</td></tr>
            <tr style="border-bottom:1px solid #eee"><td style="padding:6px 0;color:#555">Files fetched + saved</td><td style="padding:6px 0;font-weight:700;color:#27ae60">${dl}</td></tr>
            <tr><td style="padding:6px 0;color:#555">Skipped / Failed</td><td style="padding:6px 0;font-weight:700;color:#e74c3c">${sk}</td></tr>
          </table>
          <p style="font-size:11px;color:#999;margin:0 0 14px">Each file was fully downloaded into memory via fetch() and verified (status + size) before being saved — no browser queue drops possible.</p>
        `;

        if (sk > 0) {
          const h = document.createElement('p');
          h.innerHTML = '<strong>Skipped / Failed Documents:</strong>';
          h.style.marginBottom = '8px';
          ov.appendChild(h);
          const ul = document.createElement('ul');
          ul.style.cssText = 'margin:0 0 16px;padding-left:20px;';
          state.skippedDocs.forEach(d => {
            const li = document.createElement('li');
            li.style.marginBottom = '10px';
            li.innerHTML =
              `<strong>${escHtml(d.empName)}</strong> — "<span style="color:#333">${escHtml(d.docName)}</span>"` +
              ` <span style="color:#999;font-size:12px">(page ${d.page})</span><br>` +
              `<span style="color:#c0392b;font-size:12px">Reason: ${escHtml(d.reason)}</span>`;
            ul.appendChild(li);
          });
          ov.appendChild(ul);
        }

        // Export straight from the summary. The persistent log outlives the
        // run state, so this still works after the state has been cleared.
        const exportRow = document.createElement('div');
        exportRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px';
        const mkExp = (label, bg, fn) => {
          const b = document.createElement('button');
          b.textContent = label;
          Object.assign(b.style, {
            padding: '8px 14px', background: bg, color: '#fff', border: '0',
            borderRadius: '7px', cursor: 'pointer', fontWeight: '600', fontSize: '13px',
          });
          b.onclick = fn;
          return b;
        };
        exportRow.appendChild(mkExp('📄 Export full log CSV', '#2980b9', exportFullLog));
        exportRow.appendChild(mkExp('⚠️ Export failed only', '#c0392b', exportFailedLog));
        ov.appendChild(exportRow);

        const close = document.createElement('button');
        close.textContent = 'Close';
        Object.assign(close.style, {
          padding: '9px 24px', background: '#0b7dda', color: '#fff', border: '0',
          borderRadius: '7px', cursor: 'pointer', fontWeight: '600', fontSize: '14px',
        });
        close.onclick = () => ov.remove();
        ov.appendChild(close);
        document.body.appendChild(ov);
      }

      // ── pre-download filter: set the Last Modified date range ──
      // The CORRECT trigger is the funnel icon (with a "(N)" badge) in the
      // table-controls row above the document grid — it opens the
      // "Filter Document View" modal. The page-level "Filters" text button is
      // a DIFFERENT (global) filter and must not be used; it's kept only as a
      // last-resort candidate. We click candidates in priority order and
      // verify the modal actually opened before touching any inputs.
      function filterModalOpen() {
        return findVisibleByExactText('Filter Document View');
      }

      function findGlobalFiltersButton() {
        const cands = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'))
          .filter(el => visible(el) && (el.textContent || '').trim() === 'Filters');
        cands.sort((a, b) => {
          const rank = t => (t === 'BUTTON' || t === 'A' ? 0 : 1);
          return rank(a.tagName) - rank(b.tagName);
        });
        return cands[0] || null;
      }

      function docFilterCandidates() {
        const out = [];
        const seen = new Set();
        const push = (el) => {
          if (!el || seen.has(el) || !visible(el)) return;
          seen.add(el);
          out.push(el);
        };
        // 1) The funnel control showing a "(N)" applied-filter badge.
        for (const el of document.querySelectorAll('button, a, [role="button"], span, div')) {
          if (!visible(el)) continue;
          const txt = (el.textContent || '').replace(/\s+/g, '');
          if (/^\(\d+\)$/.test(txt)) push(el.closest('button, a, [role="button"]') || el);
        }
        // 2) Small controls labeled/classed/id'd like a filter — excluding the
        //    global "Filters" text button and big containers.
        for (const el of document.querySelectorAll(
          '[aria-label*="filter" i], [title*="filter" i], [id*="filter" i], [class*="filter" i]'
        )) {
          if (!visible(el)) continue;
          if ((el.textContent || '').trim() === 'Filters') continue;
          const r = el.getBoundingClientRect();
          if (r.width > 160 || r.height > 80) continue;
          push(el.closest('button, a, [role="button"]') || el);
        }
        // 3) Last resort: the global "Filters" button.
        push(findGlobalFiltersButton());
        return out;
      }

      async function openFilterModal() {
        if (filterModalOpen()) return true;
        const cands = docFilterCandidates();
        console.log(`[DL] Filter trigger candidates: ${cands.length}`);
        for (const el of cands) {
          clickEl(el);
          for (let i = 0; i < 10; i++) { // ~2.5s per candidate
            await dlSleep(250);
            if (filterModalOpen()) return true;
          }
        }
        return !!filterModalOpen();
      }

      // The modal element that contains the "Filter Document View" heading —
      // all input searches are scoped inside it so we never touch page inputs.
      function getFilterModalRoot() {
        const heading = filterModalOpen();
        if (!heading) return null;
        let c = heading;
        for (let i = 0; i < 10 && c; i++) {
          if (c.querySelectorAll('select, input').length >= 4) return c;
          c = c.parentElement;
        }
        return heading.parentElement || document.body;
      }

      function findFilterDateInputs() {
        const root = getFilterModalRoot();
        if (!root) return null;
        const dateRe = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
        // Prefer inputs under the "Last Modified Date Range" label inside the modal.
        for (const span of root.querySelectorAll('label, span, div, p, h4, h5, strong, b')) {
          const txt = (span.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt !== 'Last Modified Date Range') continue;
          let c = span;
          for (let i = 0; i < 6 && c && root.contains(c); i++) {
            c = c.parentElement;
            if (!c) break;
            const ins = Array.from(c.querySelectorAll('input'))
              .filter(inp => visible(inp) && dateRe.test((inp.value || '').trim()));
            if (ins.length >= 2) return { from: ins[0], to: ins[1] };
          }
          break;
        }
        // Fallback: the only two MM/DD/YYYY inputs inside the modal.
        const all = Array.from(root.querySelectorAll('input'))
          .filter(inp => visible(inp) && dateRe.test((inp.value || '').trim()));
        if (all.length >= 2) return { from: all[0], to: all[1] };
        return null;
      }

      async function applyLastModifiedFilter(fromStr, toStr) {
        try {
          statusEl.textContent = 'Docs: opening filter…';
          const opened = await openFilterModal();
          if (!opened) {
            console.warn('[DL] Could not open the "Filter Document View" modal — skipping date filter. ' +
              'Use the panel\'s "Inspect Element HTML" button on the funnel icon and share the HTML.');
            return;
          }

          let inputs = null;
          for (let i = 0; i < 40 && !inputs; i++) { inputs = findFilterDateInputs(); if (!inputs) await dlSleep(250); }
          if (!inputs) { console.warn('[DL] Last Modified date inputs not found in the modal — skipping date filter'); return; }

          statusEl.textContent = `Docs: date range ${fromStr} → ${toStr}…`;
          setInputValue(inputs.from, fromStr);
          setInputValue(inputs.to, toStr);
          await dlSleep(300);

          const prevInfo = getInfoText();
          const root = getFilterModalRoot() || document;
          const applyBtn = Array.from(root.querySelectorAll('button, a'))
            .find(el => visible(el) && (el.textContent || '').trim() === 'Apply Filters')
            || findByText(['button', 'a'], 'Apply Filters');
          if (applyBtn) {
            // Applying the filter may trigger a FULL PAGE RELOAD on some Paycom
            // builds, killing this script before the download loop starts. Set
            // a flag first so init() restarts the run on the fresh page.
            try { localStorage.setItem('paycomBot.docs.postFilterStart', '1'); } catch (_) {}
            clickEl(applyBtn);
          } else {
            console.warn('[DL] "Apply Filters" button not found — filter may not be applied');
          }

          // Wait for the modal to close; a plain .click() sometimes doesn't
          // register on this React button — retry with the full event sequence.
          let closed = false;
          for (let i = 0; i < 16; i++) { // ~4s
            await dlSleep(250);
            if (!filterModalOpen()) { closed = true; break; }
          }
          if (!closed && applyBtn) {
            console.warn('[DL] Modal still open after Apply click — retrying with full pointer/mouse sequence');
            robustClick(applyBtn);
          }

          // Wait for the grid to reload (modal closed + info text changed), then settle.
          for (let i = 0; i < 50; i++) {
            await dlSleep(250);
            const cur = getInfoText();
            if (!filterModalOpen() && cur && cur !== prevInfo) break;
          }
          await dlSleep(800);
          console.log(`[DL] Applied Last Modified filter ${fromStr} → ${toStr}`);
        } catch (e) {
          console.warn('[DL] applyLastModifiedFilter error (continuing without filter):', e);
        }
      }

      // ── UI: status + pause/resume in the panel section. The Start trigger is
      //    the main-list "Download All Documents" button (see startDocs()), so
      //    this section has no Start of its own. ──
      let running = false;

      const statusEl = document.createElement('div');
      statusEl.className = 'status';
      statusEl.textContent = 'Documents: idle';

      const mkBtn = (text, bg) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.background = bg;
        b.style.color = '#fff';
        return b;
      };
      const resumeBtn = mkBtn('', '#e67e22'); resumeBtn.style.display = 'none';
      const pauseBtn = mkBtn('⏸  Pause', '#7f8c8d'); pauseBtn.style.display = 'none';

      // Persistent-log controls. These stay useful after a run ends (or dies)
      // because the log is stored separately from the run state.
      const logInfoEl = document.createElement('div');
      logInfoEl.className = 'status dl-log-info';

      const exportBtn = mkBtn('📄 Export log CSV', '#2980b9');
      const failedBtn = mkBtn('⚠️ Export failed CSV', '#c0392b');
      const clearLogBtn = mkBtn('🗑 Clear stored log', '#7f8c8d');

      container.appendChild(statusEl);
      container.appendChild(resumeBtn);
      container.appendChild(pauseBtn);
      container.appendChild(logInfoEl);
      container.appendChild(exportBtn);
      container.appendChild(failedBtn);
      container.appendChild(clearLogBtn);

      exportBtn.addEventListener('click', exportFullLog);
      failedBtn.addEventListener('click', exportFailedLog);
      clearLogBtn.addEventListener('click', () => {
        if (!window.confirm('Delete the stored document log and run history?' +
          String.fromCharCode(10, 10) + 'Export it first if you still need it.')) return;
        logClearAll();
        refreshLogInfo();
      });

      // Looked up from the DOM each time so this is safe to call from run()'s
      // finally block regardless of mount order.
      function refreshLogInfo() {
        const el = container.querySelector('.dl-log-info');
        if (!el) return;
        const n = logCount + logBuf.length;
        const runs = runsRead();
        if (!n) { el.textContent = 'Log: empty'; return; }
        const last = runs.length ? runs[runs.length - 1] : null;
        el.textContent = `Log: ${n.toLocaleString()} rows · ${runs.length} run(s)` +
          (last ? ` · last: ${last.status}` : '');
      }

      logCount = logRead().length;   // pick up whatever a previous run left
      refreshLogInfo();

      pauseBtn.addEventListener('click', () => {
        paused = !paused;
        pauseBtn.textContent = paused ? '▶  Resume' : '⏸  Pause';
        pauseBtn.style.background = paused ? '#27ae60' : '#7f8c8d';
      });

      const refreshResume = () => {
        const saved = loadDlState();
        if (saved && !saved.isComplete) {
          resumeBtn.textContent = `Resume docs from page ${saved.currentPage} (✓${saved.downloadedDocIds.size} ✗${saved.skippedDocs.length})`;
          resumeBtn.style.display = 'block';
        } else {
          resumeBtn.style.display = 'none';
        }
      };
      refreshResume();

      const runWith = async (state) => {
        if (running) return;
        running = true;
        resumeBtn.disabled = true;
        paused = false;
        pauseBtn.textContent = '⏸  Pause';
        pauseBtn.style.background = '#7f8c8d';
        pauseBtn.style.display = 'block';
        try {
          await run(state, statusEl);
        } catch (e) {
          console.error('[DL] Fatal:', e);
          alert('Document download error: ' + (e?.message || String(e)));
        } finally {
          running = false;
          resumeBtn.disabled = false;
          pauseBtn.style.display = 'none';
          paused = false;
          refreshResume();
        }
      };

      // The date range chosen by startDocs() (persisted so it survives the
      // navigation to the Doc Dashboard). Falls back to prompting if absent.
      const readStoredRange = () => {
        try {
          const r = JSON.parse(localStorage.getItem('paycomBot.docs.range') || 'null');
          if (r && r.from && r.to) return r;
        } catch (_) {}
        return null;
      };

      // Expose start/resume so the panel's "Download All Documents" button and
      // the post-navigation auto-start can trigger a run on this page. Both
      // apply the Last Modified date filter first, then run.
      let starting = false;
      docsStartFresh = async () => {
        if (running || starting) return;
        starting = true;
        stopRequested = false;
        try {
          const range = readStoredRange() || computeFilterRange();
          if (!range) { statusEl.textContent = 'Documents: cancelled'; return; }
          clearDlState();
          await applyLastModifiedFilter(range.from, range.to);
          if (stopRequested) { statusEl.textContent = 'Documents: stopped'; return; }
          // Still here → Apply did NOT reload the page; clear the reload flag
          // and run inline.
          try { localStorage.removeItem('paycomBot.docs.postFilterStart'); } catch (_) {}
          const s = freshDlState();
          saveDlState(s);
          runWith(s);
        } finally { starting = false; }
      };
      docsResume = async () => {
        if (running || starting) return;
        starting = true;
        stopRequested = false;
        try {
          const range = computeFilterRange(); // ask fresh on a manual resume
          if (!range) { statusEl.textContent = 'Documents: cancelled'; return; }
          await applyLastModifiedFilter(range.from, range.to);
          if (stopRequested) { statusEl.textContent = 'Documents: stopped'; return; }
          try { localStorage.removeItem('paycomBot.docs.postFilterStart'); } catch (_) {}
          const s = loadDlState() || freshDlState();
          runWith(s);
        } finally { starting = false; }
      };
      // Called by init() when Apply Filters caused a full page reload: the
      // filter is already applied, so start/resume the run WITHOUT reopening
      // the filter modal.
      docsRunAfterReload = () => {
        if (running || starting) return;
        stopRequested = false;
        const s = loadDlState() || freshDlState();
        saveDlState(s);
        runWith(s);
      };
      // Wired to the panel's Stop / reset button: abort any in-flight run
      // (within a row or two), clear the saved doc state, and tidy the UI.
      docsStop = () => {
        stopRequested = true;
        paused = false;
        clearDlState();
        statusEl.textContent = 'Documents: stopped';
        pauseBtn.style.display = 'none';
        refreshResume();
      };

      resumeBtn.addEventListener('click', () => docsResume());

      console.log('[Paycom DL] doc-downloader mounted on Doc Dashboard.');
    }

    // ───────────────── Inspect: capture any element's outerHTML ─────────────────
    // One-shot capture mode for debugging selectors: click the panel button,
    // then click any element on the page. The click is intercepted (so it
    // doesn't trigger the page), and the element's outerHTML + a parent
    // container's outerHTML are copied to the clipboard and logged to the
    // console — paste the result to Claude to fix selectors. Esc cancels.
    let inspectActive = false;
    function startInspectCapture() {
      if (inspectActive) return;
      inspectActive = true;
      showProgressBanner('Inspect: click any element to copy its HTML (Esc cancels)');

      const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + ' …[+' + (s.length - n) + ' chars]' : s; };

      const finish = () => {
        inspectActive = false;
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        hideProgressBanner();
      };
      const onKey = (e) => { if (e.key === 'Escape') finish(); };
      const onClick = (e) => {
        // Clicks on the bot's own panel keep working normally.
        if (panelEl && panelEl.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const t = e.target;
        const out = [];
        out.push('=== Paycom Inspect ===');
        out.push('url: ' + location.href);
        const path = [];
        let n = t;
        for (let i = 0; n && n.tagName && i < 8; i++) {
          let desc = n.tagName.toLowerCase();
          if (n.id) desc += '#' + n.id;
          if (typeof n.className === 'string' && n.className.trim()) {
            desc += '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.');
          }
          path.push(desc);
          n = n.parentElement;
        }
        out.push('ancestors: ' + path.join('  <  '));
        out.push('--- clicked element outerHTML ---');
        out.push(clip(t.outerHTML, 4000));
        const container = t.closest('button, a, [role="button"], tr, li, form, table, [class*="modal" i], [class*="filter" i]') || t.parentElement;
        if (container && container !== t) {
          out.push('--- closest interesting container outerHTML ---');
          out.push(clip(container.outerHTML, 6000));
        }
        const text = out.join('\n');
        console.log('%c[PaycomBot Inspect]\n' + text, 'color:#077A7D');
        try {
          navigator.clipboard.writeText(text).then(
            () => showSuccessBanner('✓ HTML copied — paste it to Claude'),
            () => showSuccessBanner('HTML logged to console ([PaycomBot Inspect])')
          );
        } catch (_) {
          showSuccessBanner('HTML logged to console ([PaycomBot Inspect])');
        }
        finish();
      };
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    }

    // ───────────────── Floating panel ─────────────────

    let panelEl;
    function ensurePanel() {
      if (panelEl && document.body.contains(panelEl)) return panelEl;
      panelEl = document.createElement('div');
      panelEl.id = 'paycom-bot-panel';
      panelEl.innerHTML = `
        <style>
          /* Palette: #cad2c5 (light sage) #84a98c (sage) #52796f (teal) #354f52 (slate) #2f3e46 (dark) */
          #paycom-bot-panel{position:fixed;bottom:20px;right:20px;z-index:2147483647;width:268px;padding:0;color:#cad2c5;
            font:13px/1.45 'Segoe UI',system-ui,sans-serif;
            background:linear-gradient(160deg,#354f52 0%,#2f3e46 58%,#263238 100%);
            border:1px solid rgba(132,169,140,.4);border-radius:16px;overflow:hidden;
            box-shadow:0 14px 40px rgba(0,0,0,.55),0 0 0 1px rgba(82,121,111,.3),inset 0 1px 0 rgba(202,210,197,.12)}
          #paycom-bot-panel.minimized{width:auto}
          #paycom-bot-panel .hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:move;user-select:none;
            padding:12px 14px;background:linear-gradient(135deg,#52796f 0%,#3f5f56 100%);
            border-bottom:1px solid rgba(202,210,197,.22)}
          #paycom-bot-panel.minimized .hdr{padding:8px 12px;border-bottom:0}
          #paycom-bot-panel h4{margin:0;color:#cad2c5;font-size:14px;font-weight:700;letter-spacing:.4px;white-space:nowrap;
            display:flex;align-items:center;gap:8px}
          #paycom-bot-panel .pcb-ver{flex:none;font-size:10px;font-weight:700;letter-spacing:.3px;color:#cad2c5;
            background:rgba(47,62,70,.45);border:1px solid rgba(202,210,197,.35);border-radius:999px;padding:1px 7px}
          #paycom-bot-panel h4::before{content:'';flex:none;width:9px;height:9px;border-radius:50%;
            background:#84a98c;box-shadow:0 0 8px rgba(132,169,140,.9)}
          #paycom-bot-panel.running h4::before{background:#cad2c5;box-shadow:0 0 10px #cad2c5;
            animation:pcb-pulse 1.1s ease-in-out infinite}
          @keyframes pcb-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}
          #paycom-bot-panel .body{padding:12px 14px 14px;max-height:calc(100vh - 96px);overflow-y:auto;overflow-x:hidden}
          #paycom-bot-panel .body::-webkit-scrollbar{width:8px}
          #paycom-bot-panel .body::-webkit-scrollbar-thumb{background:rgba(132,169,140,.5);border-radius:8px}
          #paycom-bot-panel .body::-webkit-scrollbar-track{background:transparent}
          #paycom-bot-panel .status{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 6px;
            color:rgba(202,210,197,.65);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px}
          #paycom-bot-panel .status span{color:#cad2c5;font-weight:600;font-size:11px;text-transform:none;letter-spacing:0;
            background:rgba(132,169,140,.1);border:1px solid rgba(132,169,140,.28);padding:2px 9px;border-radius:999px;
            max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .25s ease}
          #paycom-bot-panel .status span.on{color:#cad2c5;background:rgba(132,169,140,.22);border-color:rgba(132,169,140,.6);
            box-shadow:0 0 8px rgba(132,169,140,.3)}
          #paycom-bot-panel button{display:block;width:100%;margin-top:8px;padding:9px 12px;border:0;border-radius:9px;
            font-size:13px;font-weight:600;letter-spacing:.2px;cursor:pointer;
            transition:transform .12s ease,box-shadow .12s ease,filter .12s ease}
          #paycom-bot-panel button:hover{transform:translateY(-1px);filter:brightness(1.1);box-shadow:0 7px 16px rgba(0,0,0,.4)}
          #paycom-bot-panel button:active{transform:translateY(0) scale(.98)}
          #paycom-bot-panel .min-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
            margin:0;padding:0;flex:none;background:rgba(47,62,70,.45);color:#cad2c5;
            border:1px solid rgba(202,210,197,.4);border-radius:7px;font-size:15px;font-weight:700;line-height:1;cursor:pointer}
          #paycom-bot-panel .min-btn:hover{transform:none;box-shadow:none;background:rgba(47,62,70,.75)}
          #paycom-bot-panel .start-all{background:linear-gradient(135deg,#84a98c 0%,#52796f 55%,#354f52 100%);color:#fff;
            margin-top:12px;font-weight:700;letter-spacing:.3px;box-shadow:0 4px 14px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.15)}
          #paycom-bot-panel .start{background:linear-gradient(135deg,#52796f 0%,#3f5f56 100%);color:#cad2c5;margin-top:8px}
          #paycom-bot-panel .start-pp{background:linear-gradient(135deg,#84a98c 0%,#6d9079 100%);color:#2f3e46}
          #paycom-bot-panel .start-sd{background:linear-gradient(135deg,#cad2c5 0%,#aebfb0 100%);color:#2f3e46}
          #paycom-bot-panel .start-tp{background:linear-gradient(135deg,#3f5f56 0%,#354f52 100%);color:#cad2c5}
          #paycom-bot-panel .start-qp{background:linear-gradient(135deg,#84a98c 0%,#52796f 100%);color:#2f3e46}
          #paycom-bot-panel .start-docs{background:linear-gradient(135deg,#6d9079 0%,#52796f 100%);color:#cad2c5}
          #paycom-bot-panel .inspect-html{background:transparent;color:#84a98c;border:1px dashed rgba(132,169,140,.6)}
          #paycom-bot-panel .inspect-html:hover{background:rgba(132,169,140,.1)}
          #paycom-bot-panel .stop{background:transparent;color:#cad2c5;border:1px solid rgba(202,210,197,.5)}
          #paycom-bot-panel .stop:hover{background:rgba(202,210,197,.12)}
          #paycom-bot-panel .doc-dl-section{border-top:1px dashed rgba(132,169,140,.3)!important;margin-top:12px!important;padding-top:8px!important}
          #paycom-bot-panel .doc-dl-section .status{display:block;text-transform:none;letter-spacing:0;font-size:12px;color:#cad2c5;font-weight:500}
          #paycom-bot-panel.minimized .body{display:none}
          #paycom-bot-panel .pcb-loglabel{font-size:10px;font-weight:800;letter-spacing:.8px;color:rgba(202,210,197,.6);
            text-transform:uppercase;margin:12px 0 4px;display:flex;align-items:center;gap:8px}
          #paycom-bot-panel .pcb-loglabel::after{content:'';flex:1;height:1px;background:rgba(202,210,197,.18)}
          #paycom-bot-panel .pcb-copylog, #paycom-bot-panel .pcb-dllog, #paycom-bot-panel .pcb-clearlog{
            display:inline-flex;align-items:center;width:auto;margin:0;padding:2px 8px;
            font-size:10px;font-weight:700;letter-spacing:.4px;border-radius:6px;cursor:pointer;
            background:rgba(132,169,140,.15);color:#cad2c5;border:1px solid rgba(132,169,140,.35)}
          #paycom-bot-panel .pcb-copylog:hover, #paycom-bot-panel .pcb-dllog:hover, #paycom-bot-panel .pcb-clearlog:hover{
            transform:none;box-shadow:none;background:rgba(132,169,140,.3)}
          #paycom-bot-panel .pcb-log{height:118px;overflow:auto;padding:7px 9px;border-radius:9px;
            background:rgba(20,28,26,.6);border:1px solid rgba(132,169,140,.25);color:#c9d6cc;
            font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
        </style>
        <div class="hdr">
          <h4>Paycom Bot<span class="pcb-ver">v${SCRIPT_VERSION}</span></h4>
          <button class="min-btn" title="Minimize panel">–</button>
        </div>
        <div class="body">
          <div class="status">URL <span class="url"></span></div>
          <div class="status">Census <span class="state"></span></div>
          <div class="status">Prior Payroll <span class="pp-state"></span></div>
          <div class="status">Sched Deductions <span class="sd-state"></span></div>
          <div class="status">Tax Profile <span class="tp-state"></span></div>
          <div class="status">Qual Premiums <span class="qp-state"></span></div>
          <button class="start-all">⚡ Download All Reports</button>
          <button class="start">📊 Start Census Report</button>
          <button class="start-pp">🗓️ Run Prior Payroll</button>
          <button class="start-sd">💸 Run Scheduled Deductions</button>
          <button class="start-tp">🧾 Run Tax Profile Report</button>
          <button class="start-qp">📋 Run Qualified Premiums</button>
          <button class="start-docs">📥 Download All Documents</button>
          <button class="inspect-html" title="Click this, then click any element on the page — its HTML is copied to the clipboard">🔍 Inspect Element HTML</button>
          <button class="stop">⏹ Stop / reset</button>
          <div class="doc-dl-section" style="display:none"></div>
          <div class="pcb-loglabel">Activity
            <button class="pcb-copylog" title="Copy the visible activity log to the clipboard">📋 Copy</button>
            <button class="pcb-dllog" title="Download the FULL session log as a .txt file — this one is never cleared by Stop/reset or a new run">⬇ Log file</button>
            <button class="pcb-clearlog" title="Clear the saved full session log">🗑</button>
          </div>
          <div class="pcb-log"></div>
        </div>
      `;
      document.body.appendChild(panelEl);
      // Always start at the bottom-right home corner. (Previous versions saved a
      // dragged position that could restore off-screen — clear it once.)
      try { localStorage.removeItem('paycomBot.panelPos'); } catch (_) {}
      panelEl.querySelector('.start-all').addEventListener('click', () => {
        // Bulk sequential run. Guard against starting on top of anything already
        // in flight; the batch driver (batchTick) chains the selected reports.
        if (anyModeRunning() || batchActive()) {
          alert('A report is already running. Click "Stop / reset" first, then try again.');
          return;
        }
        showDownloadAllReportsDialog((keys) => startReportBatch(keys));
      });
      panelEl.querySelector('.start').addEventListener('click', () => {
        clearBatch();
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
        setQpState(QP_STATES.IDLE);
        setState(STATES.RUNNING);
        dispatch();
      });
      panelEl.querySelector('.start-pp').addEventListener('click', () => {
        clearBatch();
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
        setQpState(QP_STATES.IDLE);
        startPriorPayroll();
      });
      panelEl.querySelector('.start-sd').addEventListener('click', () => {
        clearBatch();
        setQpState(QP_STATES.IDLE);
        startScheduledDeductions();
      });
      panelEl.querySelector('.start-tp').addEventListener('click', () => {
        clearBatch();
        setQpState(QP_STATES.IDLE);
        startTaxProfile();
      });
      panelEl.querySelector('.start-qp').addEventListener('click', () => {
        clearBatch();
        startQualifiedPremiums();
      });
      panelEl.querySelector('.start-docs').addEventListener('click', () => {
        // Clear the other modes (this isn't part of their state machine) and
        // either start now (on Doc Dashboard) or navigate there + auto-start.
        clearBatch();
        setState(STATES.IDLE);
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
        setQpState(QP_STATES.IDLE);
        startDocs();
      });
      panelEl.querySelector('.inspect-html').addEventListener('click', () => {
        startInspectCapture();
      });
      panelEl.querySelector('.pcb-copylog').addEventListener('click', () => {
        const btn = panelEl.querySelector('.pcb-copylog');
        const txt = getLogLines().join('\n');
        const done = (ok) => { btn.textContent = ok ? '✓ Copied' : '✕ Copy failed'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(() => done(true), () => done(false));
        } else {
          const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
          ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
          ta.remove(); done(ok);
        }
      });
      panelEl.querySelector('.pcb-dllog').addEventListener('click', () => {
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(FULL_LOG_KEY) || '[]'); if (!Array.isArray(arr)) arr = []; } catch (_) { arr = []; }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const blob = new Blob([arr.join('\n')], { type: 'text/plain;charset=utf-8;' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl; a.download = `PaycomBotLog_${stamp}.txt`; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      });
      panelEl.querySelector('.pcb-clearlog').addEventListener('click', () => {
        clearFullLog();
        const btn = panelEl.querySelector('.pcb-clearlog');
        btn.textContent = '✓'; setTimeout(() => { btn.textContent = '🗑'; }, 1200);
      });
      renderLogPanel();
      panelEl.querySelector('.stop').addEventListener('click', () => {
        log('Stop / reset clicked — clearing state and tearing down UI');
        clearBatch();
        setState(STATES.IDLE);
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
        setQpState(QP_STATES.IDLE);
        // Abort the document downloader (if mounted on this page) and clear
        // its flags either way, so a queued auto-start can't fire later.
        if (docsStop) docsStop();
        try {
          localStorage.removeItem('paycom_dl_state');
          localStorage.removeItem('paycomBot.docs.autostart');
          localStorage.removeItem('paycomBot.docs.postFilterStart');
          localStorage.removeItem('paycomBot.docs.range');
        } catch (_) {}
        // Close any modal dialogs the user might be looking at.
        document.getElementById('paycom-bot-confirm')?.remove();
        document.getElementById('paycom-bot-schedule-pick')?.remove();
        document.getElementById('paycom-bot-info')?.remove();
        // Hide banners.
        hideProgressBanner();
      });
      panelEl.querySelector('.min-btn').addEventListener('click', () => {
        setPanelMinimized(!panelEl.classList.contains('minimized'));
      });
      // Drag the panel by its header. Position is persisted so it stays put
      // across the page reloads Paycom triggers on every click. Clicks on the
      // minimize button are excluded so it still toggles.
      (function makeDraggable() {
        const hdr = panelEl.querySelector('.hdr');
        let dragging = false, dx = 0, dy = 0;
        hdr.addEventListener('mousedown', (e) => {
          if (e.target.closest('.min-btn')) return;
          dragging = true;
          const r = panelEl.getBoundingClientRect();
          dx = e.clientX - r.left;
          dy = e.clientY - r.top;
          panelEl.style.right = 'auto';
          panelEl.style.bottom = 'auto';
          panelEl.style.left = r.left + 'px';
          panelEl.style.top = r.top + 'px';
          e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
          if (!dragging) return;
          let left = e.clientX - dx;
          let top = e.clientY - dy;
          left = Math.max(0, Math.min(left, window.innerWidth - panelEl.offsetWidth));
          top = Math.max(0, Math.min(top, window.innerHeight - panelEl.offsetHeight));
          panelEl.style.left = left + 'px';
          panelEl.style.top = top + 'px';
        });
        document.addEventListener('mouseup', () => {
          if (!dragging) return;
          dragging = false;
          // A maximized panel dragged low could overflow — re-cap its content so
          // it stays on screen. A minimized chip just stays where it's dropped;
          // the next maximize decides the grow direction from there.
          if (!panelEl.classList.contains('minimized')) pcCapContent();
        });
      })();
      // Keep the panel on-screen when the window is resized.
      window.addEventListener('resize', () => {
        if (panelEl && !panelEl.classList.contains('minimized')) pcCapContent();
      });
      // Mount the Documents downloader only on the Doc Dashboard page.
      const docSection = panelEl.querySelector('.doc-dl-section');
      if (docSection && /\/Doc\/Dashboard/i.test(location.href)) {
        docSection.style.display = 'block';
        setupDocDownloader(docSection);
      }
      // Restore the minimize state chosen on a previous page load.
      setPanelMinimized(localStorage.getItem('paycomBot.panelMinimized') === '1');
      refreshPanel();
      return panelEl;
    }

    // Snap the panel back to its bottom-right home corner.
    function pcSnapHome() {
      if (!panelEl) return;
      panelEl.style.left = 'auto';
      panelEl.style.top = 'auto';
      panelEl.style.right = '20px';
      panelEl.style.bottom = '20px';
    }

    // Cap the maximized panel's body so it never spills past the bottom of the
    // viewport — WITHOUT moving the panel (no jumping). Used after drag/resize.
    function pcCapContent() {
      if (!panelEl || panelEl.classList.contains('minimized')) return;
      const body = panelEl.querySelector('.body');
      const hdr = panelEl.querySelector('.hdr');
      if (!body || !hdr) return;
      const margin = 16;
      const below = window.innerHeight - hdr.getBoundingClientRect().bottom - margin;
      body.style.maxHeight = Math.max(150, below) + 'px';
      body.style.overflowY = 'auto';
      body.style.overflowX = 'hidden';
    }

    // On maximize: keep the chip where it is and grow toward whichever vertical
    // side has more room (down if more space below the chip, up otherwise),
    // capping the body height so the whole panel stays on screen.
    function pcExpandFromChip() {
      if (!panelEl) return;
      const body = panelEl.querySelector('.body');
      const hdr = panelEl.querySelector('.hdr');
      if (!body || !hdr) return;
      const rect = hdr.getBoundingClientRect();
      const headH = rect.height;
      const margin = 16;
      panelEl.style.left = rect.left + 'px';
      panelEl.style.right = 'auto';
      const spaceBelow = window.innerHeight - rect.top; // header-top → viewport bottom
      const spaceAbove = rect.bottom;                   // viewport top → header bottom
      if (spaceBelow >= spaceAbove) {
        // Grow downward — header stays put, body flows below it.
        panelEl.style.top = rect.top + 'px';
        panelEl.style.bottom = 'auto';
        body.style.maxHeight = Math.max(150, spaceBelow - headH - margin) + 'px';
      } else {
        // Grow upward — pin the panel's bottom at the chip's bottom; header rises.
        panelEl.style.top = 'auto';
        panelEl.style.bottom = (window.innerHeight - rect.bottom) + 'px';
        body.style.maxHeight = Math.max(150, rect.bottom - headH - margin) + 'px';
      }
      body.style.overflowY = 'auto';
      body.style.overflowX = 'hidden';
    }

    // Collapse/expand the panel body. The collapsed state is persisted so it
    // stays minimized across the page reloads Paycom triggers on every click.
    // Minimizing snaps the chip back to the bottom-right home; maximizing grows
    // from the chip toward whichever side has more room.
    function setPanelMinimized(min) {
      if (!panelEl) return;
      panelEl.classList.toggle('minimized', min);
      const btn = panelEl.querySelector('.min-btn');
      if (btn) {
        btn.textContent = min ? '+' : '–';
        btn.title = min ? 'Expand panel' : 'Minimize panel';
      }
      try { localStorage.setItem('paycomBot.panelMinimized', min ? '1' : '0'); } catch (_) {}
      if (min) pcSnapHome();
      else pcExpandFromChip();
    }

    function refreshPanel() {
      if (!panelEl) return;
      const urlEl = panelEl.querySelector('.url');
      if (urlEl) {
        urlEl.textContent = location.pathname;
        urlEl.title = location.pathname; // full path on hover (chip ellipsizes)
      }
      // State chips light up (mint glow) whenever a mode is not IDLE.
      const setChip = (sel, val) => {
        const el = panelEl.querySelector(sel);
        if (!el) return;
        el.textContent = val;
        el.classList.toggle('on', val !== STATES.IDLE);
      };
      setChip('.state', getState());
      setChip('.pp-state', getPpState());
      setChip('.sd-state', getSdState());
      setChip('.tp-state', getTpState());
      setChip('.qp-state', getQpState());
      // Pulsing header dot while anything is running.
      panelEl.classList.toggle('running',
        isRunning() || isPpRunning() || isSdRunning() || isTpRunning() || isQpRunning());
    }

    // ───────────────── Download All Reports (sequential batch) ─────────────────
    // Unlike ADP (one JS context, a simple loop), each Paycom report runs across
    // several page reloads via its own state machine. So "run them all" is a
    // queue in localStorage: batchTick() starts the head report, waits — across
    // reloads — until every mode is IDLE (the invariant that means the report
    // finished / errored / was cancelled), then advances to the next.
    // NOTE: "Download All Documents" is intentionally NOT in this list — it's a
    // separate document-dashboard job, not a report (per the user's request).
    const PC_REPORTS = [
      { key: 'census', icon: '📊', label: 'Census Report' },
      { key: 'pp', icon: '🗓️', label: 'Prior Payroll' },
      { key: 'sd', icon: '💸', label: 'Scheduled Deductions' },
      { key: 'tp', icon: '🧾', label: 'Tax Profile' },
      { key: 'qp', icon: '📋', label: 'Qualified Premiums' },
    ];
    const pcReport = (key) => PC_REPORTS.find(r => r.key === key);
    const anyModeRunning = () => isRunning() || isPpRunning() || isSdRunning() || isTpRunning() || isQpRunning();

    // Persisted { key: bool } picker selection; anything missing defaults to on.
    const PC_SEL_KEY = 'paycomBot.reportSelection';
    function getReportSelection() {
      let stored = {};
      try { stored = JSON.parse(localStorage.getItem(PC_SEL_KEY) || '{}') || {}; } catch (_) { stored = {}; }
      const sel = {};
      for (const r of PC_REPORTS) sel[r.key] = stored[r.key] !== false;
      return sel;
    }
    function setReportSelected(key, on) {
      const sel = getReportSelection();
      sel[key] = !!on;
      try { localStorage.setItem(PC_SEL_KEY, JSON.stringify(sel)); } catch (_) { }
    }

    // The batch queue: { queue: [keys…], started: bool }. queue[0] is the report
    // currently being run (once started === true).
    const PC_BATCH_KEY = 'paycomBot.batch';
    function getBatch() {
      try {
        const b = JSON.parse(localStorage.getItem(PC_BATCH_KEY) || 'null');
        if (b && Array.isArray(b.queue)) return b;
      } catch (_) { }
      return null;
    }
    function setBatch(b) { try { localStorage.setItem(PC_BATCH_KEY, JSON.stringify(b)); } catch (_) { } }
    function clearBatch() { try { localStorage.removeItem(PC_BATCH_KEY); } catch (_) { } }
    const batchActive = () => { const b = getBatch(); return !!(b && b.queue.length); };

    // Clear every mode, then kick off ONE report by key. Mirrors the individual
    // panel buttons; must NOT clear the batch (it's the batch that calls this).
    function startReportByKey(key) {
      setState(STATES.IDLE);
      setPpState(PP_STATES.IDLE);
      setSdState(SD_STATES.IDLE);
      setTpState(TP_STATES.IDLE);
      setQpState(QP_STATES.IDLE);
      switch (key) {
        case 'census': setState(STATES.RUNNING); dispatch(); break;
        case 'pp': startPriorPayroll(); break;
        case 'sd': startScheduledDeductions(); break;
        case 'tp': startTaxProfile(); break;
        case 'qp': startQualifiedPremiums(); break;
        default: log('[Batch] unknown report key: ' + key);
      }
    }

    // Advance the batch. Called after dispatch() on every load, and once right
    // after the user confirms the picker. No-ops when no batch exists.
    async function batchTick() {
      const batch = getBatch();
      if (!batch || !batch.queue.length) return;
      if (anyModeRunning()) return; // head report still working (across reloads)

      if (!batch.started) {
        // Kick off the head report.
        batch.started = true;
        setBatch(batch);
        const key = batch.queue[0];
        log(`[Batch] starting "${key}" — ${batch.queue.length} report(s) queued`);
        showProgressBanner(`Download All Reports — starting ${pcReport(key)?.label || key}…`);
        startReportByKey(key);
        return;
      }

      // Head report was started and nothing is running now → it's done. Advance.
      const finished = batch.queue.shift();
      log(`[Batch] "${finished}" finished; ${batch.queue.length} report(s) left`);
      if (batch.queue.length) {
        batch.started = true;
        setBatch(batch);
        const key = batch.queue[0];
        showProgressBanner(`Download All Reports — starting ${pcReport(key)?.label || key}…`);
        startReportByKey(key);
      } else {
        clearBatch();
        hideProgressBanner();
        showSuccessBanner('✓ Download All Reports — all selected reports done');
        log('[Batch] all reports complete');
      }
    }

    // Store a fresh queue from the selected keys (ordered per PC_REPORTS) and go.
    function startReportBatch(keys) {
      if (!keys || !keys.length) return;
      setBatch({ queue: keys.slice(), started: false });
      log('[Batch] queue set: ' + keys.join(', '));
      batchTick();
    }

    // Picker modal — same behaviour as ADP's dialog, styled to match the Paycom
    // panel's confirm dialog. Calls onConfirm(selectedKeys) on "Download selected".
    function showDownloadAllReportsDialog(onConfirm) {
      const old = document.getElementById('paycom-bot-dlall');
      if (old) old.remove();

      const saved = getReportSelection();

      const overlay = document.createElement('div');
      overlay.id = 'paycom-bot-dlall';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:460px;width:92%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.35);';

      const title = document.createElement('h3');
      title.textContent = 'Download All Reports — choose reports';
      title.style.cssText = 'margin:0 0 4px;color:#0b7dda;font-size:16px;';
      box.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.textContent = 'They run one after another in this order. Untick any report to skip it.';
      subtitle.style.cssText = 'color:#666;font-size:12px;margin-bottom:14px;';
      box.appendChild(subtitle);

      const list = document.createElement('div');
      list.style.cssText = 'flex:1;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;padding:6px 12px;margin-bottom:14px;';
      const checkboxes = [];
      PC_REPORTS.forEach((r, i) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;padding:9px 0;cursor:pointer;border-bottom:1px solid #f0f0f0;';
        if (i === PC_REPORTS.length - 1) row.style.borderBottom = 'none';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = saved[r.key];
        cb.style.cssText = 'margin-right:10px;transform:scale(1.2);';
        checkboxes.push(cb);

        const text = document.createElement('span');
        text.textContent = r.icon + '  ' + r.label;
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
        const allChecked = checkboxes.every(c => c.checked);
        checkboxes.forEach(c => c.checked = !allChecked);
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
        PC_REPORTS.forEach((r, i) => setReportSelected(r.key, checkboxes[i].checked));
        const selected = PC_REPORTS.filter((_, i) => checkboxes[i].checked).map(r => r.key);
        if (!selected.length) { alert('Select at least one report or click Cancel.'); return; }
        overlay.remove();
        onConfirm(selected);
      };
      buttons.appendChild(confirmBtn);

      box.appendChild(buttons);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    function init() {
      if (location.href.includes('cl-login.php') || location.href.includes('two-factor')) return;
      ensurePanel();
      if (anyModeRunning() || batchActive()) {
        setTimeout(async () => {
          // Drive whatever mode is running to completion, THEN let the batch
          // advance. batchActive() with no mode running means "start the next".
          try { await dispatch(); } catch (err) { if (!(err && err.aborted)) log('dispatch error: ' + (err && err.message)); }
          try { await batchTick(); } catch (err) { log('batchTick error: ' + (err && err.message)); }
        }, 800);
      }
      // Auto-start the document download after navigating here from the panel button.
      if (/\/Doc\/Dashboard/i.test(location.href) && localStorage.getItem('paycomBot.docs.autostart') === '1') {
        localStorage.removeItem('paycomBot.docs.autostart');
        waitForDocTable(() => { if (docsStartFresh) docsStartFresh(); });
      } else if (/\/Doc\/Dashboard/i.test(location.href) && localStorage.getItem('paycomBot.docs.postFilterStart') === '1') {
        // Apply Filters reloaded the page mid-start — the filter is already
        // applied, so continue straight into the download run.
        localStorage.removeItem('paycomBot.docs.postFilterStart');
        log('Docs: resuming download after the filter-apply page reload');
        waitForDocTable(() => { if (docsRunAfterReload) docsRunAfterReload(); });
      }
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
  })();
