  // ==UserScript==
  // @name         Paycom Daily Reports Automation
  // @namespace    https://www.paycomonline.net/
  // @version      0.12.0
  // @description  Census report (full) + Prior Payroll YTD report (Mantle schedule page → confirm dialog → fill → generate → download as PriorPayroll_*.csv → loop, past quarters consolidated / current quarter per-pay-period) + Scheduled Deductions report (rpt_id=8) + Tax Profile report (rpt_id=15) + Doc Dashboard: Download All Documents (fetch→blob, paginated, resumable)
  // @match        https://www.paycomonline.net/v4/cl/*
  // @run-at       document-end
  // @grant        none
  // ==/UserScript==

  (function () {
    'use strict';

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

    const log = (...args) => {
      console.log('[PaycomBot]', ...args);
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
      return !isRunning() && !isPpRunning() && !isSdRunning() && !isTpRunning();
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
      progressBannerEl.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#0b7dda;color:#fff;padding:10px 16px;border-radius:6px;font:13px sans-serif;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.2)';
      document.body.appendChild(progressBannerEl);
    }
    function hideProgressBanner() {
      if (progressBannerEl && progressBannerEl.parentNode) progressBannerEl.remove();
      progressBannerEl = null;
    }
    function showSuccessBanner(msg) {
      const b = document.createElement('div');
      b.textContent = msg;
      b.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#27ae60;color:#fff;padding:10px 16px;border-radius:6px;font:14px sans-serif;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.2)';
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
    // Clicking Paycom's Download button fires an XHR to
    //   …/report-center/reportaction/one-time-password?…&transid=N
    // and then Paycom navigates to rpt-generateproc.php to download the file
    // (with its own default name). We hook that XHR to (a) capture the transid
    // and (b) abort it so Paycom's success handler never runs — no Paycom-side
    // download, hence no duplicate file. Then we fetch the file directly and
    // save it as PriorPayroll_<dates>.csv. The fetch completing IS the
    // "download done" signal, so the caller moves to the next task immediately.
    async function ppDownloadReportFile(task, downloadBtn) {
      const fileName = downloadFileName(task);
      const nonce = getSessionNonce();
      if (!nonce) throw new Error('Could not find session_nonce on the page');

      let capturedTransid = '';
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
          { timeout: 10000, interval: 100, label: 'report transid (one-time-password XHR)' });
      } finally {
        restore();
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
        await ppDownloadReportFile(task, downloads[0]);

        // File downloaded — move straight to the next task in the lineup.
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

    // ───────────────── Page-router state machine ─────────────────

    async function dispatch() {
      if (isRunning()) return await dispatchCensus();
      if (isPpRunning()) return await dispatchPriorPayroll();
      if (isSdRunning()) return await dispatchScheduledDeductions();
      if (isTpRunning()) return await dispatchTaxProfile();
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
    let docsStartFresh = null;   // start a fresh document download run
    let docsResume = null;       // resume an interrupted run

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

      const dlSleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let paused = false;
      async function waitWhilePaused() { while (paused) await dlSleep(200); }

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
          const filename = extractFilename(res, fallbackFilename);
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
          const info = getRowInfo(rows[i]);
          await waitWhilePaused();

          statusEl.textContent =
            `Docs: p${state.currentPage} row ${i + 1}/${rows.length}` +
            ` | ✓ ${state.downloadedDocIds.size} ✗ ${state.skippedDocs.length}`;

          if (state.downloadedDocIds.has(info.docId)) {
            console.log(`[DL] Skip (already done): ${info.empName}`);
            continue;
          }

          state.totalAttempted++;

          if (!info.dlUrl) {
            state.skippedDocs.push({ ...info, reason: 'No download URL found in row DOM', page: state.currentPage });
            saveDlState(state);
            continue;
          }

          const fallbackName = info.fileTemplate && info.fileTemplate !== 'N/A'
            ? `${info.empCode}_${info.fileTemplate}`
            : `${info.empCode}_${info.docName.replace(/\s+/g, '_')}.pdf`;

          let result = null;
          for (let attempt = 0; attempt <= CFG.MAX_RETRIES; attempt++) {
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
            saveDlState(state);
            console.log(`[DL] ✓ ${info.empName} → ${result.filename} (${(result.size / 1024).toFixed(0)} KB, ${result.type})`);
          } else {
            console.warn(`[DL] ✗ ${info.empName}: ${result.reason}`);
            state.skippedDocs.push({ ...info, reason: result.reason, page: state.currentPage });
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
        if (state.currentPage > 1) {
          statusEl.textContent = `Navigating to page ${state.currentPage}…`;
          await gotoPage(state.currentPage);
          await dlSleep(800);
        }

        await processPage(state, statusEl);

        await dlSleep(500);
        while (!isNextDisabled()) {
          const prevInfo = getInfoText();
          getNextBtn().click();
          const moved = await waitForPageChange(prevInfo);
          if (!moved) {
            console.warn('[DL] Pagination stuck — timed out waiting for page change. Stopping.');
            break;
          }
          state.currentPage = getCurrentPage();
          saveDlState(state);
          await processPage(state, statusEl);
          await dlSleep(500);
        }
        state.isComplete = true;
        saveDlState(state);
        showSummary(state);
        clearDlState();
        statusEl.textContent = `Docs done: ✓ ${state.downloadedDocIds.size} ✗ ${state.skippedDocs.length}`;
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
      // Open the Doc Dashboard "Filters" panel, set Last Modified From/To, and
      // click Apply so the download covers the whole window (not just the
      // default recent range). Best-effort — logs and continues if the UI
      // differs. Reuses the outer helpers (visible, clickEl, setInputValue,
      // findByText, findVisibleByExactText).
      function findFiltersButton() {
        const cands = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'))
          .filter(el => visible(el) && (el.textContent || '').trim() === 'Filters');
        cands.sort((a, b) => {
          const rank = t => (t === 'BUTTON' || t === 'A' ? 0 : 1);
          return rank(a.tagName) - rank(b.tagName);
        });
        return cands[0] || null;
      }

      function findFilterDateInputs() {
        const dateRe = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
        const label = findVisibleByExactText('Last Modified Date Range');
        if (label) {
          let c = label;
          for (let i = 0; i < 6 && c; i++) {
            c = c.parentElement;
            if (!c) break;
            const ins = Array.from(c.querySelectorAll('input'))
              .filter(inp => visible(inp) && dateRe.test((inp.value || '').trim()));
            if (ins.length >= 2) return { from: ins[0], to: ins[1] };
          }
        }
        const all = Array.from(document.querySelectorAll('input'))
          .filter(inp => visible(inp) && dateRe.test((inp.value || '').trim()));
        if (all.length >= 2) return { from: all[0], to: all[1] };
        return null;
      }

      async function applyLastModifiedFilter(fromStr, toStr) {
        try {
          const btn = findFiltersButton();
          if (!btn) { console.warn('[DL] "Filters" button not found — skipping date filter'); return; }
          statusEl.textContent = 'Docs: opening filter…';
          clickEl(btn);

          let inputs = null;
          for (let i = 0; i < 40 && !inputs; i++) { inputs = findFilterDateInputs(); if (!inputs) await dlSleep(250); }
          if (!inputs) { console.warn('[DL] Filter date inputs not found — skipping date filter'); return; }

          statusEl.textContent = `Docs: date range ${fromStr} → ${toStr}…`;
          setInputValue(inputs.from, fromStr);
          setInputValue(inputs.to, toStr);
          await dlSleep(300);

          const prevInfo = getInfoText();
          const applyBtn = findByText(['button', 'a'], 'Apply Filters');
          if (applyBtn) clickEl(applyBtn);
          else console.warn('[DL] "Apply Filters" button not found — filter may not be applied');

          // Wait for the grid to reload (info text changes), then settle.
          for (let i = 0; i < 60; i++) {
            await dlSleep(250);
            const cur = getInfoText();
            if (cur && cur !== prevInfo) break;
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

      container.appendChild(statusEl);
      container.appendChild(resumeBtn);
      container.appendChild(pauseBtn);

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
        try {
          const range = readStoredRange() || computeFilterRange();
          if (!range) { statusEl.textContent = 'Documents: cancelled'; return; }
          clearDlState();
          await applyLastModifiedFilter(range.from, range.to);
          const s = freshDlState();
          saveDlState(s);
          runWith(s);
        } finally { starting = false; }
      };
      docsResume = async () => {
        if (running || starting) return;
        starting = true;
        try {
          const range = computeFilterRange(); // ask fresh on a manual resume
          if (!range) { statusEl.textContent = 'Documents: cancelled'; return; }
          await applyLastModifiedFilter(range.from, range.to);
          const s = loadDlState() || freshDlState();
          runWith(s);
        } finally { starting = false; }
      };

      resumeBtn.addEventListener('click', () => docsResume());

      console.log('[Paycom DL] doc-downloader mounted on Doc Dashboard.');
    }

    // ───────────────── Floating panel ─────────────────

    let panelEl;
    function ensurePanel() {
      if (panelEl && document.body.contains(panelEl)) return panelEl;
      panelEl = document.createElement('div');
      panelEl.id = 'paycom-bot-panel';
      panelEl.innerHTML = `
        <style>
          /* Palette: #FDEB9E (yellow) #7AE2CF (mint) #077A7D (teal) #06202B (navy) */
          #paycom-bot-panel{position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#06202B;border:2px solid #077A7D;border-radius:10px;padding:12px;font:13px sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.45);width:240px;color:#7AE2CF}
          #paycom-bot-panel.minimized{width:auto;padding:6px 10px}
          #paycom-bot-panel .hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:move;user-select:none}
          #paycom-bot-panel h4{margin:0;color:#FDEB9E;font-size:14px;white-space:nowrap}
          #paycom-bot-panel .status{margin:6px 0;color:#7AE2CF;font-size:12px}
          #paycom-bot-panel .status span{color:#FDEB9E}
          #paycom-bot-panel button{display:block;width:100%;margin-top:6px;padding:7px 10px;border:0;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;background:#077A7D;color:#FDEB9E}
          #paycom-bot-panel button:hover{filter:brightness(1.12)}
          #paycom-bot-panel .min-btn{display:inline-block;width:24px;height:24px;margin:0;padding:0;background:#077A7D;color:#FDEB9E;border:1px solid #7AE2CF;border-radius:4px;font-size:16px;font-weight:bold;line-height:1;cursor:pointer;flex:none}
          #paycom-bot-panel .start{background:#077A7D;color:#FDEB9E}
          #paycom-bot-panel .start-pp{background:#7AE2CF;color:#06202B}
          #paycom-bot-panel .start-sd{background:#FDEB9E;color:#06202B}
          #paycom-bot-panel .start-tp{background:#077A7D;color:#7AE2CF}
          #paycom-bot-panel .start-docs{background:#7AE2CF;color:#06202B}
          #paycom-bot-panel .stop{background:transparent;color:#FDEB9E;border:1px solid #FDEB9E}
          #paycom-bot-panel.minimized .body{display:none}
        </style>
        <div class="hdr">
          <h4>Paycom Bot</h4>
          <button class="min-btn" title="Minimize panel">–</button>
        </div>
        <div class="body">
          <div class="status">URL: <span class="url"></span></div>
          <div class="status">Census: <span class="state"></span></div>
          <div class="status">Prior Payroll: <span class="pp-state"></span></div>
          <div class="status">Sched Deductions: <span class="sd-state"></span></div>
          <div class="status">Tax Profile: <span class="tp-state"></span></div>
          <button class="start">Start Census Report</button>
          <button class="start-pp">Run Prior Payroll</button>
          <button class="start-sd">Run Scheduled Deductions</button>
          <button class="start-tp">Run Tax Profile Report</button>
          <button class="start-docs">Download All Documents</button>
          <button class="stop">Stop / reset</button>
          <div class="doc-dl-section" style="display:none;border-top:1px solid #077A7D;margin-top:10px;padding-top:4px"></div>
        </div>
      `;
      document.body.appendChild(panelEl);
      // Restore a position the user dragged the panel to on a previous page load.
      try {
        const pos = JSON.parse(localStorage.getItem('paycomBot.panelPos') || 'null');
        if (pos && pos.left && pos.top) {
          panelEl.style.left = pos.left;
          panelEl.style.top = pos.top;
          panelEl.style.right = 'auto';
          panelEl.style.bottom = 'auto';
        }
      } catch (_) {}
      panelEl.querySelector('.start').addEventListener('click', () => {
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
        setState(STATES.RUNNING);
        dispatch();
      });
      panelEl.querySelector('.start-pp').addEventListener('click', () => {
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
        startPriorPayroll();
      });
      panelEl.querySelector('.start-sd').addEventListener('click', () => {
        startScheduledDeductions();
      });
      panelEl.querySelector('.start-tp').addEventListener('click', () => {
        startTaxProfile();
      });
      panelEl.querySelector('.start-docs').addEventListener('click', () => {
        // Clear the other modes (this isn't part of their state machine) and
        // either start now (on Doc Dashboard) or navigate there + auto-start.
        setState(STATES.IDLE);
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
        startDocs();
      });
      panelEl.querySelector('.stop').addEventListener('click', () => {
        log('Stop / reset clicked — clearing state and tearing down UI');
        setState(STATES.IDLE);
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        setTpState(TP_STATES.IDLE);
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
          try {
            localStorage.setItem('paycomBot.panelPos',
              JSON.stringify({ left: panelEl.style.left, top: panelEl.style.top }));
          } catch (_) {}
        });
      })();
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

    // Collapse/expand the panel body. Persisted so it stays minimized across the
    // page reloads that Paycom triggers on every click.
    function setPanelMinimized(min) {
      if (!panelEl) return;
      panelEl.classList.toggle('minimized', min);
      const btn = panelEl.querySelector('.min-btn');
      if (btn) {
        btn.textContent = min ? '+' : '–';
        btn.title = min ? 'Expand panel' : 'Minimize panel';
      }
      try { localStorage.setItem('paycomBot.panelMinimized', min ? '1' : '0'); } catch (_) {}
    }

    function refreshPanel() {
      if (!panelEl) return;
      panelEl.querySelector('.url').textContent = location.pathname;
      panelEl.querySelector('.state').textContent = getState();
      const ppEl = panelEl.querySelector('.pp-state');
      if (ppEl) ppEl.textContent = getPpState();
      const sdEl = panelEl.querySelector('.sd-state');
      if (sdEl) sdEl.textContent = getSdState();
      const tpEl = panelEl.querySelector('.tp-state');
      if (tpEl) tpEl.textContent = getTpState();
    }

    function init() {
      if (location.href.includes('cl-login.php') || location.href.includes('two-factor')) return;
      ensurePanel();
      if (isRunning() || isPpRunning() || isSdRunning() || isTpRunning()) setTimeout(dispatch, 800);
      // Auto-start the document download after navigating here from the panel button.
      if (/\/Doc\/Dashboard/i.test(location.href) && localStorage.getItem('paycomBot.docs.autostart') === '1') {
        localStorage.removeItem('paycomBot.docs.autostart');
        waitForDocTable(() => { if (docsStartFresh) docsStartFresh(); });
      }
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
  })();
