// ==UserScript==
// @name         ADP Report Catalog Harvester
// @namespace    https://workforcenow.adp.com/
// @version      0.2.1
// @description  Report metadata catalog tool (companion to adp-historical-data.user.js, which does the actual downloads). On the Reports page it walks every report row (with pagination), opens each report's Information dialog, scrapes the metadata (Name, Report ID, Category, Owner, Created/Edited, Default Format, Description, Fields in Report), and exports one CSV — so we can decide which reports deserve download automation. Records accumulate across runs (dedup by Report ID/Name); harvest per-category or use the "All Reports" category for full coverage. Also includes the shadow-DOM + iframe Inspect Element HTML tool.
// @match        https://workforcenow.adp.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ── Duplicate-instance guards (lessons from the Paycom bot) ──
  try { if (window.top !== window.self) return; } catch (_) { return; }
  if (window.__adpCatalogLoaded) { console.warn('[ADPCatalog] duplicate copy — standing down'); return; }
  window.__adpCatalogLoaded = true;

  const log = (...a) => console.log('[ADPHist]', ...a);

  // ───────────────── tiny utils ─────────────────
  let stopRequested = false;
  const sleep = (ms) => new Promise((res, rej) => {
    const t0 = Date.now();
    (function tick() {
      if (stopRequested) { const e = new Error('Stopped'); e.aborted = true; return rej(e); }
      const left = ms - (Date.now() - t0);
      if (left <= 0) return res();
      setTimeout(tick, Math.min(120, left));
    })();
  });
  function waitFor(pred, { timeout = 20000, interval = 300, label = 'element' } = {}) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      (function tick() {
        if (stopRequested) { const e = new Error(`Stopped (waiting for ${label})`); e.aborted = true; return rej(e); }
        let r; try { r = pred(); } catch (_) { r = null; }
        if (r) return res(r);
        if (Date.now() - t0 > timeout) return rej(new Error(`Timed out waiting for ${label}`));
        setTimeout(tick, interval);
      })();
    });
  }
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const w = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    const st = w.getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
  }

  // ADP renders the Reports grid inside same-origin IFRAMES (found live: the
  // top document has zero .dojoxGridRow). Query across the top document plus
  // every reachable frame, recursively.
  function allDocs() {
    const out = [document];
    (function walk(doc) {
      let frames = [];
      try { frames = doc.querySelectorAll('iframe, frame'); } catch (_) { return; }
      for (const fr of frames) {
        try { if (fr.contentDocument) { out.push(fr.contentDocument); walk(fr.contentDocument); } } catch (_) {}
      }
    })(document);
    return out;
  }
  function qa(sel) {
    const res = [];
    for (const d of allDocs()) { try { res.push(...d.querySelectorAll(sel)); } catch (_) {} }
    return res;
  }
  function realClick(el) {
    try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
    // Dojo/Angular widgets sometimes need the full mouse sequence.
    for (const type of ['mousedown', 'mouseup', 'click']) {
      try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch (_) {}
    }
  }

  // ───────────────── persisted catalog ─────────────────
  const CAT_KEY = 'adphist.catalog';
  function getCatalog() { try { const a = JSON.parse(localStorage.getItem(CAT_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function saveCatalog(a) { try { localStorage.setItem(CAT_KEY, JSON.stringify(a)); } catch (_) {} }
  const recKey = (r) => (r['Report ID'] || '') + '|' + (r['Report Name'] || '');

  // ───────────────── page pieces (selectors from live Inspect evidence) ─────────────────
  // Grid rows live in the TOP document (Dojo grid, no iframe). Each title cell:
  //   div#reporting_grid_CellReportTitle_<n>.rptCellReportTitle
  // with hover actions incl. div.rptCellReportTitleInfoAction > [role=button]
  // (aria-label="Report Information", icon fa-info-circle).
  function gridRows() {
    return qa('.dojoxGridRow').filter(visible);
  }
  function rowName(row) {
    const cell = row.querySelector('.rptCellReportTitle');
    const t = (cell ? cell.innerText : row.innerText) || '';
    return t.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  }
  function rowInfoButton(row) {
    const holder = row.querySelector('.rptCellReportTitleInfoAction');
    if (!holder) return null;
    return holder.querySelector('[role="button"]') || holder.querySelector('.fa-info-circle') || holder;
  }

  // The full "Report Information" dialog (Angular side):
  //   report-detail-cart-dialog > adpr-dialog#reportdetailCartDialog
  //   … .adpr-dialog-body .report-detail-content .report-info-item
  //        > .info-label / .info-value
  function infoDialog() {
    const d = qa('report-detail-cart-dialog .adpr-dialog-box, adpr-dialog#reportdetailCartDialog .adpr-dialog-box').find(visible);
    return d || null;
  }
  // The hover tooltip variant has a "CLICK TO VIEW MORE" link that opens the
  // full dialog — click it if the small tooltip appeared instead.
  function viewMoreLink() {
    for (const el of qa('a, span, div')) {
      if (!visible(el)) continue;
      const t = (el.innerText || '').trim().toUpperCase();
      if (t === 'CLICK TO VIEW MORE' || t === 'VIEW MORE') return el;
    }
    return null;
  }
  function dialogCloseButton(dlg) {
    for (const b of dlg.querySelectorAll('button, [role="button"], .fa-times, .fa-close, i')) {
      const t = ((b.innerText || b.getAttribute('aria-label') || b.className) + '').toLowerCase();
      if (!visible(b)) continue;
      if (/(^|\s)close(\s|$)|fa-times|fa-close/.test(t)) return b;
    }
    return null;
  }

  function scrapeDialog(dlg) {
    const rec = {};
    for (const item of dlg.querySelectorAll('.report-info-item')) {
      const label = (item.querySelector('.info-label') || {}).innerText || '';
      const value = (item.querySelector('.info-value') || {}).innerText || '';
      if (label.trim()) rec[normalizeLabel(label)] = value.trim();
    }
    // Fields in Report — chips; markup unknown, so try common shapes and fall
    // back to a raw-text capture (nothing gets lost; we parse offline).
    const chips = [];
    for (const sel of ['.report-fields span', '.fields-in-report span', '.report-info-section .adpr-chip', '.adpr-tag', '[class*="chip" i]', '[class*="pill" i]']) {
      for (const c of dlg.querySelectorAll(sel)) {
        const t = (c.innerText || '').trim();
        if (t && t.length < 60 && !chips.includes(t)) chips.push(t);
      }
      if (chips.length) break;
    }
    if (chips.length) rec['Fields'] = chips.join('; ');
    rec['_rawText'] = (dlg.innerText || '').replace(/\s+\n/g, '\n').trim().slice(0, 4000);
    return rec;
  }
  function normalizeLabel(s) {
    const t = s.trim().toLowerCase();
    if (t.startsWith('report name')) return 'Report Name';
    if (t.startsWith('report id')) return 'Report ID';
    if (t.startsWith('category')) return 'Category';
    if (t.startsWith('report owner') || t === 'owner') return 'Report Owner';
    if (t.startsWith('created')) return 'Created On';
    if (t.startsWith('edited')) return 'Edited On';
    if (t.startsWith('default format')) return 'Default Format';
    if (t.startsWith('description')) return 'Description';
    return s.trim();
  }

  // Pagination: look for a "next page" control near the grid (exact markup not
  // captured yet — try aria-labels and common arrow icons; log if not found).
  function nextPageButton() {
    const cands = [];
    for (const el of qa('[aria-label], [title], [data-pendo-id]')) {
      if (!visible(el)) continue;
      const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('data-pendo-id') || '')).toLowerCase();
      if (/next\s*page|nextpage/.test(t)) cands.push(el);
    }
    const en = cands.find(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !/disabled/i.test(el.className || ''));
    return en || null;
  }

  // Category nav (left accordion): span[role=menuitem] with aria-label.
  // Category ids vary: ExternalRunStandard_item_a_17, …_item_all ("All Reports")
  function categoryItems() {
    return qa('span[id^="ExternalRunStandard_item_"][role="menuitem"]')
      .filter(visible)
      .map(el => ({ el, name: (el.getAttribute('aria-label') || el.innerText || '').trim() }))
      .filter(x => x.name);
  }

  // ───────────────── harvest flow ─────────────────
  let running = false;

  async function harvestRow(row, seen) {
    const name = rowName(row);
    if (!name) return 'no-name';
    const btn = rowInfoButton(row);
    if (!btn) { uiLog(`⚠ ${name}: info button not found`); return 'no-btn'; }
    // hover first (the actions render on row hover), then click
    try { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); } catch (_) {}
    await sleep(250);
    realClick(btn);
    // Full dialog directly, or tooltip → "CLICK TO VIEW MORE"
    let dlg = null;
    try {
      dlg = await waitFor(() => infoDialog(), { timeout: 5000, label: 'info dialog' });
    } catch (_) {
      const more = viewMoreLink();
      if (more) { realClick(more); try { dlg = await waitFor(() => infoDialog(), { timeout: 6000, label: 'info dialog (via view-more)' }); } catch (_) {} }
    }
    if (!dlg) { uiLog(`⚠ ${name}: info dialog didn't open`); return 'no-dialog'; }
    await sleep(700); // let the dialog's Angular content settle
    const rec = scrapeDialog(dlg);
    if (!rec['Report Name']) rec['Report Name'] = name;
    rec['_harvestedFrom'] = location.hash || location.pathname;
    const key = recKey(rec);
    if (!seen.has(key)) {
      seen.add(key);
      const cat = getCatalog();
      const idx = cat.findIndex(r => recKey(r) === key);
      if (idx >= 0) cat[idx] = rec; else cat.push(rec);
      saveCatalog(cat);
      uiLog(`✓ ${rec['Report Name']}${rec['Report ID'] ? ' (' + rec['Report ID'] + ')' : ''}`);
    } else {
      log('dup skipped:', name);
    }
    // close the dialog
    const close = dialogCloseButton(dlg);
    if (close) realClick(close);
    else (dlg.ownerDocument || document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    try { await waitFor(() => !infoDialog(), { timeout: 5000, label: 'dialog close' }); } catch (_) {}
    await sleep(400);
    return 'ok';
  }

  async function harvestCurrentList() {
    const seen = new Set(getCatalog().map(recKey));
    let page = 1;
    while (true) {
      await waitFor(() => gridRows().length > 0, { timeout: 20000, label: 'report rows' });
      await sleep(800);
      const rows = gridRows();
      uiLog(`— page ${page}: ${rows.length} rows —`);
      for (let i = 0; i < rows.length; i++) {
        if (stopRequested) return;
        // re-query fresh each time (the grid re-renders)
        const fresh = gridRows()[i];
        if (!fresh) continue;
        setProgress(`Row ${i + 1}/${rows.length} (page ${page})`);
        await harvestRow(fresh, seen);
      }
      const next = nextPageButton();
      if (!next) { uiLog(page === 1 ? 'ℹ No next-page control found — single page done' : `ℹ Last page (${page}) done`); break; }
      const firstName = rowName(gridRows()[0] || {});
      realClick(next);
      page++;
      try {
        await waitFor(() => { const r = gridRows()[0]; return r && rowName(r) !== firstName; }, { timeout: 15000, label: 'next page rows' });
      } catch (_) { uiLog('ℹ Page did not change — stopping pagination'); break; }
    }
  }

  async function harvestAllCategories() {
    const items = categoryItems();
    if (!items.length) { uiLog('⚠ Category nav not found — harvesting the current list only'); await harvestCurrentList(); return; }
    uiLog(`Categories found: ${items.map(i => i.name).join(', ')}`);
    // Prefer the single "All Reports" pass when present (covers everything;
    // each report's own Category comes from its info dialog anyway).
    const all = items.find(i => /^all reports$/i.test(i.name));
    if (all) {
      uiLog('Using "All Reports" for one full pass…');
      realClick(all.el);
      await sleep(2500);
      await harvestCurrentList();
      return;
    }
    for (const it of items) {
      if (stopRequested) return;
      uiLog(`▶ Category: ${it.name}`);
      realClick(it.el);
      await sleep(2500);
      await harvestCurrentList();
    }
  }

  // ───────────────── CSV export ─────────────────
  const COLS = ['Report Name', 'Report ID', 'Category', 'Report Owner', 'Created On', 'Edited On', 'Default Format', 'Description', 'Fields', '_harvestedFrom'];
  function csvEscape(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadCsv() {
    const cat = getCatalog();
    if (!cat.length) { alert('Catalog is empty — run a harvest first.'); return; }
    const lines = [COLS.join(',')];
    for (const r of cat) lines.push(COLS.map(c => csvEscape(r[c])).join(','));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ADP_Report_Catalog.csv'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    uiLog(`⬇ Exported ${cat.length} reports → ADP_Report_Catalog.csv`);
  }
  // Raw JSON export too — keeps _rawText for offline parsing of anything missed.
  function downloadJson() {
    const cat = getCatalog();
    if (!cat.length) { alert('Catalog is empty — run a harvest first.'); return; }
    const blob = new Blob([JSON.stringify(cat, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ADP_Report_Catalog.json'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    uiLog(`⬇ Exported ${cat.length} reports → ADP_Report_Catalog.json`);
  }

  // ───────────────── Inspect Element HTML (shadow DOM + iframes) ─────────────────
  // Click the button, then click ANY element — its outerHTML + ancestor chain is
  // copied to the clipboard, piercing shadow roots (composedPath) and every
  // same-origin iframe. Esc cancels.
  const clipStr = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + ' …[+' + (s.length - n) + ' chars]' : s; };
  function describeEl(el) {
    if (!el || !el.tagName) return String((el && el.nodeName) || '?');
    let d = el.tagName.toLowerCase();
    if (el.id) d += '#' + el.id;
    if (typeof el.className === 'string' && el.className.trim()) d += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
    return d;
  }
  function inspChain(e, doc) {
    const parts = [];
    const path = (e.composedPath && e.composedPath()) || [];
    for (const n of path) {
      if (n === window || n === document) break;
      if (typeof ShadowRoot !== 'undefined' && n instanceof ShadowRoot) { parts.push('⇧shadow-root'); continue; }
      if (n && n.tagName) { parts.push(describeEl(n)); if (parts.length > 18) break; }
    }
    try {
      let w = doc.defaultView;
      while (w && w !== w.parent) {
        const fe = w.frameElement;
        if (!fe) break;
        parts.push('⇪iframe: ' + describeEl(fe));
        w = w.parent;
      }
    } catch (_) {}
    return parts.join('  <  ');
  }
  function inspDeepTarget(e) {
    const p = (e.composedPath && e.composedPath()) || [];
    for (const n of p) if (n && n.tagName) return n;
    return e.target;
  }
  function inspFallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove(); return ok;
    } catch (_) { return false; }
  }
  let inspActive = false;
  const inspHooked = new Set();
  let inspRehook = null;
  function inspReport(e, doc) {
    const t = inspDeepTarget(e);
    const out = [];
    out.push('=== ADP Inspect ===');
    out.push('page: ' + location.href);
    try { if (doc !== document) out.push('frame: ' + (doc.defaultView.location.pathname || '(same-origin frame)')); } catch (_) {}
    out.push('ancestors: ' + inspChain(e, doc));
    out.push('--- clicked element outerHTML ---');
    out.push(clipStr(t.outerHTML, 6000));
    const container = (t.closest && t.closest('[role="dialog"], .modal, table, tr, li, button, a, [class*="modal" i], [class*="dialog" i], [class*="popup" i], [class*="report" i], [class*="grid" i], [class*="pag" i]')) || t.parentElement;
    if (container && container !== t) {
      out.push('--- closest interesting container outerHTML ---');
      out.push(clipStr(container.outerHTML, 10000));
    }
    const root = t.getRootNode && t.getRootNode();
    if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host) {
      out.push('--- shadow host ---');
      out.push(clipStr(root.host.outerHTML.replace(root.host.innerHTML || '~', '…'), 1200));
    }
    const text = out.join('\n');
    console.log('%c[ADPHist Inspect]\n' + text, 'color:#c8102e');
    const done = (ok) => uiLog(ok ? '✓ HTML copied — paste it to Claude' : 'HTML logged to console ([ADPHist Inspect])');
    try { navigator.clipboard.writeText(text).then(() => done(true), () => done(inspFallbackCopy(text))); }
    catch (_) { done(inspFallbackCopy(text)); }
  }
  function inspOnClick(e) {
    if (!inspActive) return;
    if (panel && panel.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const doc = e.currentTarget instanceof Document ? e.currentTarget : document;
    inspStop();
    inspReport(e, doc);
  }
  function inspOnKey(e) { if (e.key === 'Escape') { inspStop(); uiLog('Inspect cancelled'); } }
  function inspHookAll() {
    for (const doc of allDocs()) {
      if (inspHooked.has(doc)) continue;
      try {
        doc.addEventListener('click', inspOnClick, true);
        doc.addEventListener('keydown', inspOnKey, true);
        inspHooked.add(doc);
      } catch (_) {}
    }
  }
  function inspStart() {
    if (inspActive) return;
    inspActive = true;
    const b = panel && panel.querySelector('.ah-inspect');
    if (b) b.textContent = '⏹ Cancel Inspect (Esc)';
    uiLog('Inspect: click any element — shadow DOM & iframes covered (Esc cancels)');
    inspHookAll();
    inspRehook = setInterval(inspHookAll, 1500); // ADP loads frames lazily
  }
  function inspStop() {
    inspActive = false;
    const b = panel && panel.querySelector('.ah-inspect');
    if (b) b.textContent = '🔍 Inspect Element HTML';
    if (inspRehook) { clearInterval(inspRehook); inspRehook = null; }
    for (const doc of inspHooked) {
      try { doc.removeEventListener('click', inspOnClick, true); doc.removeEventListener('keydown', inspOnKey, true); } catch (_) {}
    }
    inspHooked.clear();
  }

  // ───────────────── panel ─────────────────
  let panel;
  function uiLog(msg) {
    log(msg);
    if (!panel) return;
    const el = panel.querySelector('.ah-log');
    if (el) {
      const t = (() => { try { return new Date().toLocaleTimeString(); } catch (_) { return ''; } })();
      el.textContent += (el.textContent ? '\n' : '') + (t ? t + '  ' : '') + msg;
      el.scrollTop = el.scrollHeight;
    }
  }
  function setProgress(t) { const p = panel && panel.querySelector('.ah-prog'); if (p) p.textContent = t || ''; }
  function setRunning(on) {
    running = on;
    if (!panel) return;
    panel.querySelectorAll('.ah-start').forEach(b => { b.disabled = on; });
    const st = panel.querySelector('.ah-state'); if (st) st.textContent = on ? 'Running' : 'Idle';
    if (!on) setProgress('');
  }

  async function runHarvest(allCats) {
    if (running) return;
    stopRequested = false;
    setRunning(true);
    uiLog(`Started catalog harvest [v0.1.0] — ${allCats ? 'all categories' : 'current list'}; already have ${getCatalog().length} record(s)`);
    try {
      if (allCats) await harvestAllCategories(); else await harvestCurrentList();
      uiLog(`✓ Harvest finished — catalog now has ${getCatalog().length} report(s). Click "Download CSV".`);
    } catch (e) {
      if (e && e.aborted) uiLog('⏹ Stopped');
      else uiLog('✕ ' + (e && e.message ? e.message : e));
    }
    setRunning(false);
  }

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return;
    if (!document.body) return;
    panel = document.createElement('div');
    panel.id = 'adphist-panel';
    panel.innerHTML = `
      <style>
        #adphist-panel{position:fixed;bottom:18px;right:18px;z-index:2147483646;width:280px;color:#eaf1f7;
          font:13px/1.45 'Segoe UI',system-ui,sans-serif;background:linear-gradient(160deg,#1c2b3a 0%,#152230 60%,#0f1a26 100%);
          border:1px solid rgba(200,16,46,.45);border-radius:14px;overflow:hidden;
          box-shadow:0 14px 40px rgba(0,0,0,.55)}
        #adphist-panel .hdr{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;cursor:move;user-select:none;
          background:linear-gradient(135deg,#c8102e 0%,#8f0c21 100%)}
        #adphist-panel h4{margin:0;font-size:13.5px;font-weight:700;color:#fff;letter-spacing:.3px}
        #adphist-panel .min{width:24px;height:24px;border:1px solid rgba(255,255,255,.5);border-radius:6px;background:rgba(0,0,0,.2);
          color:#fff;font-weight:700;cursor:pointer;line-height:1}
        #adphist-panel .body{padding:12px 14px 14px}
        #adphist-panel.minimized .body{display:none}
        #adphist-panel .st{display:flex;justify-content:space-between;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;
          color:rgba(234,241,247,.6);margin-bottom:6px}
        #adphist-panel .st span{color:#fff;text-transform:none;letter-spacing:0;background:rgba(200,16,46,.18);
          border:1px solid rgba(200,16,46,.4);padding:1px 9px;border-radius:999px;font-size:11px}
        #adphist-panel .ah-prog{font-size:11.5px;font-weight:700;min-height:14px;margin-bottom:6px;color:#ffd9de}
        #adphist-panel .note{font-size:10.5px;color:rgba(234,241,247,.55);margin-bottom:8px}
        #adphist-panel button.ah-btn{display:block;width:100%;margin-top:7px;padding:9px 12px;border:0;border-radius:8px;
          font-size:12.5px;font-weight:700;cursor:pointer;transition:filter .12s}
        #adphist-panel button.ah-btn:hover{filter:brightness(1.12)}
        #adphist-panel .ah-start{background:linear-gradient(135deg,#c8102e,#8f0c21);color:#fff}
        #adphist-panel .ah-sec{background:transparent;color:#ffb3bd;border:1px dashed rgba(200,16,46,.55)}
        #adphist-panel .ah-stop{background:transparent;color:#eaf1f7;border:1px solid rgba(234,241,247,.4)}
        #adphist-panel .ah-log{height:120px;overflow:auto;margin-top:9px;padding:7px 9px;border-radius:8px;background:rgba(0,0,0,.35);
          border:1px solid rgba(200,16,46,.3);font:10.5px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#dbe7f1}
      </style>
      <div class="hdr"><h4>📋 ADP Report Catalog</h4><button class="min">–</button></div>
      <div class="body">
        <div class="st">Status <span class="ah-state">Idle</span></div>
        <div class="ah-prog"></div>
        <div class="note">Phase 1 — Report Catalog: har report ka metadata (ID, category, fields…) collect karke CSV deta hai. Reports page kholo, phir Start.</div>
        <button class="ah-btn ah-start" data-mode="all">📋 Harvest ALL categories</button>
        <button class="ah-btn ah-start" data-mode="cur">📄 Harvest current list only</button>
        <button class="ah-btn ah-sec ah-csv">⬇ Download CSV (<span class="ah-count">0</span>)</button>
        <button class="ah-btn ah-sec ah-json">⬇ Download JSON (raw)</button>
        <button class="ah-btn ah-sec ah-clear">🗑 Clear collected data</button>
        <button class="ah-btn ah-sec ah-inspect">🔍 Inspect Element HTML</button>
        <button class="ah-btn ah-stop">⏹ Stop</button>
        <div class="ah-log"></div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelectorAll('.ah-start').forEach(b =>
      b.addEventListener('click', () => runHarvest(b.dataset.mode === 'all')));
    panel.querySelector('.ah-csv').addEventListener('click', downloadCsv);
    panel.querySelector('.ah-json').addEventListener('click', downloadJson);
    panel.querySelector('.ah-clear').addEventListener('click', () => {
      if (confirm('Clear all collected catalog records?')) { saveCatalog([]); refreshCount(); uiLog('🗑 Catalog cleared'); }
    });
    panel.querySelector('.ah-inspect').addEventListener('click', () => (inspActive ? (inspStop(), uiLog('Inspect cancelled')) : inspStart()));
    panel.querySelector('.ah-stop').addEventListener('click', () => { stopRequested = true; uiLog('⏹ Stop requested…'); });
    const minBtn = panel.querySelector('.min');
    const applyMin = (m) => { panel.classList.toggle('minimized', m); minBtn.textContent = m ? '+' : '–'; };
    minBtn.addEventListener('click', () => {
      const m = !panel.classList.contains('minimized');
      try { m ? localStorage.setItem('adphist.min', '1') : localStorage.removeItem('adphist.min'); } catch (_) {}
      applyMin(m);
    });
    applyMin(localStorage.getItem('adphist.min') === '1');

    // drag by header
    (function () {
      const hdr = panel.querySelector('.hdr');
      let drag = false, dx = 0, dy = 0;
      hdr.addEventListener('mousedown', (e) => {
        if (e.target.closest('.min')) return;
        drag = true;
        const r = panel.getBoundingClientRect();
        dx = e.clientX - r.left; dy = e.clientY - r.top;
        panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
        panel.style.right = 'auto'; panel.style.bottom = 'auto';
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!drag) return;
        panel.style.left = Math.max(0, Math.min(e.clientX - dx, innerWidth - panel.offsetWidth)) + 'px';
        panel.style.top = Math.max(0, Math.min(e.clientY - dy, innerHeight - panel.offsetHeight)) + 'px';
      });
      document.addEventListener('mouseup', () => { drag = false; });
    })();

    refreshCount();
  }
  function refreshCount() {
    const c = panel && panel.querySelector('.ah-count');
    if (c) c.textContent = String(getCatalog().length);
  }
  setInterval(() => { ensurePanel(); refreshCount(); }, 2000);
  ensurePanel();
})();
