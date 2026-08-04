// ==UserScript==
// @name         Paycom Historical Data Bot
// @namespace    https://www.paycomonline.net/
// @version      0.7.0
// @description  Historical Data Bot — downloads Paycom Report-Center Time-Off reports as Excel for all employees, once per year (2025 + 2026). User opens Paycom, clicks Start; the bot navigates to each report's generate page, sets Excel + Select All employees + the date range, generates and downloads twice (previous year + current year). Separate from, and visually consistent with, the main "Paycom Bot" script. Currently: Employee Time-Off (184), Holiday/Blackout (185), Time-Off Audit (182), Time-Off Summary (186); Salary Time Off Absence Tracking (slug URL) pending. More historical-data sources to follow.
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
  // fileBase drives the saved filename: `<fileBase>_<year>.xlsx`.
  const REPORTS = [
    { key: 'employee-timeoff', name: 'Employee Time-Off', rptId: 184, fileBase: 'EmployeeTimeOff' },
    { key: 'holiday-blackout', name: 'Holiday/Blackout', rptId: 185, fileBase: 'HolidayBlackout' },
    // Salary Time Off Absence Tracking (slug URL, not rpt_id) is inserted here
    // once its generate-page form is confirmed — it uses
    // web.php/report-center/generate/salary-time-off-absence-tracking-report
    { key: 'timeoff-audit', name: 'Time-Off Audit', rptId: 182, fileBase: 'TimeOffAudit' },
    { key: 'timeoff-summary', name: 'Time-Off Summary', rptId: 186, fileBase: 'TimeOffSummary' },
  ];
  const reportByKey = (k) => REPORTS.find(r => r.key === k);

  // Each report is downloaded once per date range — previous year + current year.
  const YEARS = [
    { label: '2025', from: '01/01/2025', to: '12/31/2025' },
    { label: '2026', from: '01/01/2026', to: '12/31/2026' },
  ];

  const reportUrl = (id) => `https://www.paycomonline.net/v4/cl/rpt-generate.php?rpt_id=${id}`;

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

  function isExcelSelected() {
    const r = outputRowFor('xlsx') || outputRowFor('xls');
    return !!(r && r.radio && r.radio.checked);
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
    log('WARN: XLSX/XLS output radio not found (#rpt_output missing?)');
    return false;
  }

  function ensureDateRangeMode() {
    const r = findRadioByLabel('Date Range');
    if (r && !r.checked) { clickEl(r); log('Date Range mode selected'); }
  }

  function setDateRange(from, to) {
    const dr = findDateRangeInputs();
    if (!dr || !dr.from || !dr.to) throw new Error('Date Range inputs not found');
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

  // ── Download with a proper filename ──────────────────────────────────────
  // Paycom's "Download" is a <button class="js-report-download"> (no href), so
  // we can't just fetch a link. Instead we mirror the main bot's technique:
  // clicking it fires a one-time-password XHR (…&transid=N); we hook XHR to grab
  // that transid and abort the request (so Paycom's own default-named download
  // never fires), then fetch rpt-generateproc.php?…&transid=N ourselves and save
  // the blob under our name. Falls back to a plain click if anything fails.
  function getSessionNonce() {
    const re = /session_nonce=([A-Za-z0-9._\-]+)/;
    for (const el of document.querySelectorAll('a[href*="session_nonce="], form[action*="session_nonce="]')) {
      const m = ((el.getAttribute('href') || '') + ' ' + (el.getAttribute('action') || '')).match(re);
      if (m) return m[1];
    }
    const m = (location.href + ' ' + (document.documentElement.innerHTML || '')).match(re);
    return m ? m[1] : '';
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
    let n = btn;
    for (let i = 0; n && i < 8; i++) { const m = /(?:report|transid)[-=_]?(\d{5,})/i.exec(n.id || ''); if (m) return m[1]; n = n.parentElement; }
    return '';
  }

  async function downloadNewest(baseName) {
    const dls = getDownloadButtons().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const btn = dls[0];
    if (!btn) throw new Error('No Download button found');
    const fileName = `${baseName}.${extForButton(btn)}`;
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

  // Runs both years (2025 + 2026) on the same report page, no reload between them.
  async function handleReport(report) {
    showBanner(`${report.name}: loading form…`);
    await waitFor(() => findGenerateReportButton(), {
      timeout: 30000, label: `${report.name} report form`,
    });
    uiLog(`▶ ${report.name}`);

    for (const yr of YEARS) {
      if (!isRunning()) return;
      const tag = `${report.name} ${yr.label}`;
      showBanner(`${tag}: setting up…`);
      ensureDateRangeMode();
      await sleep(200);
      setDateRange(yr.from, yr.to);
      await sleep(300);
      await selectAllEmployees();
      await sleep(400);
      // Output format is set inside generateAndDownload (last, so it can't be
      // reset by the Select-All re-render).
      await generateAndDownload(tag, `${report.fileBase}_${yr.label}`);
    }
    showBanner(`✓ ${report.name} — 2025 + 2026 downloaded`, true);
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

  // ───────────────── Page-router state machine ─────────────────
  // Iterates over the run queue (the report keys the user ticked in the picker).
  async function dispatch() {
    if (!isRunning()) return;
    const queue = getQueue();
    const idx = getIndex();
    if (idx >= queue.length) { finishAll(); return; }

    const report = reportByKey(queue[idx]);
    if (!report) { setIndex(idx + 1); dispatch(); return; }

    const onPage = location.href.includes('/rpt-generate.php')
      && new RegExp(`[?&]rpt_id=${report.rptId}(?:[&#]|$)`).test(location.href);

    if (!onPage) {
      uiLog(`→ Opening ${report.name}…`);
      showBanner(`Opening ${report.name}…`);
      location.href = reportUrl(report.rptId);
      return;
    }

    // Guard against the redirect-loop: a report should be handled once (both
    // years on the same page). Landing on it 3+ times means its completion
    // redirects the page instead of showing an inline Download — bail loudly.
    const attempt = bumpAttempt(idx);
    if (attempt > 2) {
      hideBanner();
      setState(STATES.IDLE);
      clearQueue();
      clearAttempts();
      alert('Historical Data Bot: "' + report.name + '" keeps re-generating without an inline Download button ' +
        '(Paycom redirects this report once it finishes, instead of offering a Download link on the same page). ' +
        'This report needs the "Recent Reports" download method — tell me what the page shows after Generate and I\'ll wire it. Stopped to avoid a loop.');
      log(`Loop guard tripped for ${report.name} (attempt ${attempt})`);
      return;
    }

    try {
      await handleReport(report);
      const next = idx + 1;
      setIndex(next);
      if (next < queue.length) {
        const nextReport = reportByKey(queue[next]);
        location.href = reportUrl(nextReport.rptId);
      } else {
        finishAll();
      }
    } catch (err) {
      if (err && err.aborted) { log('Aborted by user'); hideBanner(); return; }
      hideBanner();
      uiLog(`✕ Error in ${report.name}: ${err && err.message ? err.message : err}`);
      alert('Historical Data Bot: ' + (err && err.message ? err.message : err));
      setState(STATES.IDLE);
    }
  }

  // Start a run over the given report keys (from the picker).
  function startRun(keys) {
    if (!keys || !keys.length) return;
    setQueue(keys);
    setIndex(0);
    clearAttempts();
    clearLog();
    uiLog(`Started ${keys.length} report(s): ${keys.map(k => (reportByKey(k) || {}).name || k).join(', ')} · 2025 + 2026`);
    setState(STATES.RUNNING);
    dispatch();
  }

  function stopRun() {
    setState(STATES.IDLE);
    setIndex(0);
    clearQueue();
    clearAttempts();
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
    showBanner('✓ Historical Data Bot — selected reports downloaded (2025 + 2026)', true);
    uiLog('✓ All selected reports downloaded (2025 + 2026)');
  }

  // ───────────────── Report picker dialog ─────────────────
  // Same look as the main Paycom Bot's "Download All Reports" dialog: white card,
  // blue accent, checkbox per report + select-all/none. Selection persists.
  function showPickerDialog(onConfirm) {
    document.getElementById('histbot-picker')?.remove();
    const saved = getSelection();

    const overlay = document.createElement('div');
    overlay.id = 'histbot-picker';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px sans-serif;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:10px;padding:20px;max-width:440px;width:92%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.35);';

    const title = document.createElement('h3');
    title.textContent = 'Historical Data — choose reports';
    title.style.cssText = 'margin:0 0 4px;color:#0b7dda;font-size:16px;';
    box.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Each ticked report downloads as Excel for all employees — 2025 and 2026.';
    subtitle.style.cssText = 'color:#666;font-size:12px;margin-bottom:14px;';
    box.appendChild(subtitle);

    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;padding:6px 12px;margin-bottom:14px;';
    const checkboxes = [];
    REPORTS.forEach((r, i) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;padding:9px 0;cursor:pointer;border-bottom:1px solid #f0f0f0;';
      if (i === REPORTS.length - 1) row.style.borderBottom = 'none';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = saved[r.key];
      cb.style.cssText = 'margin-right:10px;transform:scale(1.2);';
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
      REPORTS.forEach((r, i) => setSelected(r.key, checkboxes[i].checked));
      const keys = REPORTS.filter((_, i) => checkboxes[i].checked).map(r => r.key);
      if (!keys.length) { alert('Select at least one report or click Cancel.'); return; }
      overlay.remove();
      onConfirm(keys);
    };
    buttons.appendChild(confirmBtn);

    box.appendChild(buttons);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function onStartClick() {
    if (isRunning()) { log('Already running — Stop first'); return; }
    showPickerDialog((keys) => startRun(keys));
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
        <div class="note">Pick reports → Excel · all employees · 2025 + 2026<br>(Salary report pending)</div>
        <button class="start">🗓️ Start Time-Off Downloads</button>
        <button class="inspect" title="Click this, then click any element on the page — its HTML is copied to the clipboard">🔍 Inspect Element HTML</button>
        <button class="stop">⏹ Stop / reset</button>
        <div class="hb-loglabel">Activity</div>
        <div class="hb-log"></div>
      </div>
    `;
    document.body.appendChild(panelEl);
    panelEl.querySelector('.start').addEventListener('click', onStartClick);
    panelEl.querySelector('.inspect').addEventListener('click', startInspectCapture);
    panelEl.querySelector('.stop').addEventListener('click', stopRun);

    // Minimize toggle.
    const minBtn = panelEl.querySelector('.min-btn');
    minBtn.addEventListener('click', () => {
      panelEl.classList.toggle('minimized');
      minBtn.textContent = panelEl.classList.contains('minimized') ? '+' : '–';
    });

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
    const startBtn = panelEl.querySelector('.start');
    if (startBtn) startBtn.textContent = isRunning() ? '⏳ Running…' : '🗓️ Start Time-Off Downloads';
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
