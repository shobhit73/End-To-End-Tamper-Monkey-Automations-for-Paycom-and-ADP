  // ==UserScript==
  // @name         Paycom Daily Reports Automation
  // @namespace    https://www.paycomonline.net/
  // @version      0.5.8
  // @description  Census report (full) + Prior Payroll YTD report (scrape → confirm dialog → fill → generate → download → loop) + Scheduled Deductions report (rpt_id=8)
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

    const log = (...args) => console.log('[PaycomBot]', ...args);

    // Both modes IDLE means the user clicked Stop / reset. Used by sleep + waitFor
    // so any in-flight async work bails within ~100ms of the click.
    function shouldAbort() {
      return !isRunning() && !isPpRunning() && !isSdRunning();
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

    function clickEl(el) {
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
      el.click();
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
        interval: 2500,
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
    const ppScheduleListUrl = () =>
      'https://www.paycomonline.net/v4/cl/web.php/paygrid/processingschedules/indexTable';
    const ppYtdReportUrl = () =>
      `https://www.paycomonline.net/v4/cl/rpt-generate.php?rpt_id=${PP_CONFIG.ytdReportId}`;

    const getPpState = () => localStorage.getItem(PP_STATE_KEY) || PP_STATES.IDLE;
    const setPpState = (s) => {
      if (s === PP_STATES.IDLE) localStorage.removeItem(PP_STATE_KEY);
      else localStorage.setItem(PP_STATE_KEY, s);
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
      setPpState(PP_STATES.GO_TO_SCHEDULE);
      dispatch();
    }

    // Scrape the Schedule Dates table for the active year.
    // Returns array of { quarter, payrollNum, status, periodStart, periodEnd, txStart, txSubmit, checkDate }.
    // Skips hidden rows (e.g., other-year tabs that stay in DOM behind the active year).
    function scrapePayrollSchedule() {
      const periods = [];
      const rows = Array.from(document.querySelectorAll('tr')).filter(visible);
      const qMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };
      let currentQuarter = 0;

      for (const row of rows) {
        const text = (row.innerText || '').trim();

        const qMatch = text.match(/^(1st|2nd|3rd|4th)\s+Quarter\b/i);
        if (qMatch && text.length < 30) {
          currentQuarter = qMap[qMatch[1].toLowerCase()];
          continue;
        }
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
      log(`scrapePayrollSchedule found ${periods.length} visible rows:`,
        periods.map(p => `Q${p.quarter} #${p.payrollNum} status="${p.status}" check=${p.checkDate}`));
      return periods;
    }

    // From scraped periods, build the task list:
    //  - completed quarter (all rows Processed) → 1 quarterly task with first→last check date
    //  - active quarter (mix Processed + not) → 1 task per Processed row, single check date
    //  - quarter with zero Processed → skip
    function generateTaskList(periods) {
      const byQuarter = { 1: [], 2: [], 3: [], 4: [] };
      for (const p of periods) {
        if (byQuarter[p.quarter]) byQuarter[p.quarter].push(p);
      }
      const tasks = [];
      for (const q of [1, 2, 3, 4]) {
        const all = byQuarter[q];
        if (!all.length) continue;
        const processed = all.filter(p => /processed/i.test(p.status));
        if (!processed.length) continue;

        if (processed.length === all.length) {
          tasks.push({
            type: 'quarterly',
            quarter: q,
            from: processed[0].checkDate,
            to: processed[processed.length - 1].checkDate,
            label: `Q${q} quarterly: ${processed[0].checkDate} → ${processed[processed.length - 1].checkDate}`,
          });
        } else {
          for (const p of processed) {
            tasks.push({
              type: 'individual',
              quarter: q,
              payrollNum: p.payrollNum,
              from: p.checkDate,
              to: p.checkDate,
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
      const subtitle = document.createElement('div');
      subtitle.innerHTML = `Year: <b>${new Date().getFullYear()}</b> &nbsp; • &nbsp; ${periods.length} rows scraped (${processedCount} Processed) &nbsp; • &nbsp; ${tasks.length} task${tasks.length === 1 ? '' : 's'} planned`;
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
      const yearTab = findVisibleByExactText(currentYear);
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

    // On the schedule listing page (/processingschedules/indexTable), parse all
    // schedule rows, filter to ones with processed periods > 0, then auto-pick
    // (if 1 valid) or prompt the user (if multiple).
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
      log('On schedule page, clicking "2. Schedule Dates" tab');
      const datesTab = await waitFor(
        () => findByText(['li', 'a', 'div', 'span', 'button'], 'Schedule Dates'),
        { timeout: 15000, label: '"Schedule Dates" tab' }
      );
      clickEl(datesTab);

      log('Waiting for schedule table to load');
      await waitFor(
        () => Array.from(document.querySelectorAll('tr'))
          .filter(visible)
          .some(r => /1st Quarter/i.test(r.innerText || '')),
        { timeout: 30000, label: 'schedule dates table (visible 1st Quarter row)' }
      );

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
          { timeout: 10 * 60 * 1000, interval: 2500, label: `Download for task ${index + 1}` }
        );

        const downloads = getDownloadButtons();
        downloads.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        log(`Clicking topmost (newest) Download button for task ${index + 1}`);
        clickEl(downloads[0]);

        setPpIndex(index + 1);
        await sleep(2500); // brief settle before next task
      }
    }

    async function dispatchPriorPayroll() {
      if (!isPpRunning()) return;
      dismissPrivacyBanner();
      const url = location.href;
      const state = getPpState();
      log('PP dispatch on', location.pathname, 'state=', state);

      if (state === PP_STATES.GO_TO_SCHEDULE) {
        setPpState(PP_STATES.AT_SCHEDULE);
        location.href = ppScheduleListUrl();
        return;
      }

      if (state === PP_STATES.AT_SCHEDULE) {
        // Listing page → click first schedule link
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
        // Detail page (schedule ID in path) → click Schedule Dates, scrape
        if (/\/processingschedules\/index\/\d+/.test(url)) {
          try {
            await ppHandleSchedulePage();
          } catch (err) {
            if (err.aborted) { log('PP schedule aborted by user'); return; }
            alert('Paycom Bot (PP, schedule): ' + err.message);
            setPpState(PP_STATES.IDLE);
          }
          return;
        }
        // Wrong page → bounce back to listing
        location.href = ppScheduleListUrl();
        return;
      }

      if (state === PP_STATES.AT_REPORT) {
        if (!url.includes('/rpt-generate.php')) {
          location.href = ppYtdReportUrl();
          return;
        }
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
        { timeout: 10 * 60 * 1000, interval: 2500, label: 'Scheduled Deductions Download' }
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

    // ───────────────── Page-router state machine ─────────────────

    async function dispatch() {
      if (isRunning()) return await dispatchCensus();
      if (isPpRunning()) return await dispatchPriorPayroll();
      if (isSdRunning()) return await dispatchScheduledDeductions();
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

    // ───────────────── Floating panel ─────────────────

    let panelEl;
    function ensurePanel() {
      if (panelEl && document.body.contains(panelEl)) return panelEl;
      panelEl = document.createElement('div');
      panelEl.id = 'paycom-bot-panel';
      panelEl.innerHTML = `
        <style>
          #paycom-bot-panel{position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#fff;border:2px solid #008f3e;border-radius:8px;padding:12px;font:13px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.18);width:240px}
          #paycom-bot-panel h4{margin:0 0 6px;color:#008f3e;font-size:14px}
          #paycom-bot-panel .status{margin:6px 0;color:#444;font-size:12px}
          #paycom-bot-panel button{display:block;width:100%;margin-top:6px;padding:7px 10px;border:0;border-radius:4px;font-size:13px;cursor:pointer}
          #paycom-bot-panel .start{background:#008f3e;color:#fff}
          #paycom-bot-panel .stop{background:#888;color:#fff}
        </style>
        <h4>Paycom Bot</h4>
        <div class="status">URL: <span class="url"></span></div>
        <div class="status">Census: <span class="state"></span></div>
        <div class="status">Prior Payroll: <span class="pp-state"></span></div>
        <div class="status">Sched Deductions: <span class="sd-state"></span></div>
        <button class="start">Start Census Report</button>
        <button class="start-pp" style="background:#0b7dda;color:#fff">Run Prior Payroll</button>
        <button class="start-sd" style="background:#e67e22;color:#fff">Run Scheduled Deductions</button>
        <button class="stop">Stop / reset</button>
      `;
      document.body.appendChild(panelEl);
      panelEl.querySelector('.start').addEventListener('click', () => {
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        setState(STATES.RUNNING);
        dispatch();
      });
      panelEl.querySelector('.start-pp').addEventListener('click', () => {
        setSdState(SD_STATES.IDLE);
        startPriorPayroll();
      });
      panelEl.querySelector('.start-sd').addEventListener('click', () => {
        startScheduledDeductions();
      });
      panelEl.querySelector('.stop').addEventListener('click', () => {
        log('Stop / reset clicked — clearing state and tearing down UI');
        setState(STATES.IDLE);
        setPpState(PP_STATES.IDLE);
        setSdState(SD_STATES.IDLE);
        // Close any modal dialogs the user might be looking at.
        document.getElementById('paycom-bot-confirm')?.remove();
        document.getElementById('paycom-bot-schedule-pick')?.remove();
        document.getElementById('paycom-bot-info')?.remove();
        // Hide banners.
        hideProgressBanner();
      });
      refreshPanel();
      return panelEl;
    }

    function refreshPanel() {
      if (!panelEl) return;
      panelEl.querySelector('.url').textContent = location.pathname;
      panelEl.querySelector('.state').textContent = getState();
      const ppEl = panelEl.querySelector('.pp-state');
      if (ppEl) ppEl.textContent = getPpState();
      const sdEl = panelEl.querySelector('.sd-state');
      if (sdEl) sdEl.textContent = getSdState();
    }

    function init() {
      if (location.href.includes('cl-login.php') || location.href.includes('two-factor')) return;
      ensurePanel();
      if (isRunning() || isPpRunning() || isSdRunning()) setTimeout(dispatch, 800);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
  })();
