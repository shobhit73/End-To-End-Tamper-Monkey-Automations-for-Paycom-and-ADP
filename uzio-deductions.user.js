// ==UserScript==
// @name         UZIO Setup Auto-Create (Earnings + Deductions + Contributions from Payroll Setup Helper xlsx)
// @namespace    https://uzio.com/
// @version      0.34.0
// @description  Reads the Earnings, Deductions and Contributions tabs of the Payroll Setup Helper .xlsx and auto-creates each in UZIO. Buttons: Start Earnings / Deductions / Contributions. Each save is positively verified (form must reset/close) so silent failures pause instead of being skipped. On failure: pause with Save & Continue / Resume / Skip, or skip & continue; manual Pause; end-of-run reconciliation.
// @match        https://app.uzio.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// @connect      cdnjs.cloudflare.com
// @connect      unpkg.com
// ==/UserScript==
//
// NOTE: SheetJS is loaded at runtime via GM_xmlhttpRequest (NOT @require),
// because UZIO's Content-Security-Policy blocks @require'd CDN scripts. The
// loader (loadSheetJS) fetches the library through Tampermonkey's privileged
// XHR — which bypasses page CSP — and evaluates it, then the panel boots.

/*
 * HOW THIS WORKS
 *  1. Floating "UZIO Deduction Bot" panel appears bottom-right.
 *  2. "Choose .xlsx" → pick <Client>_Payroll_Setup_Helper.xlsx (reads the
 *     "Deductions" tab via SheetJS).
 *  3. Open ONE "Add Deduction" form manually.
 *  4. "Start" → fully automatic: fills every field per the xlsx and clicks Save
 *     (Save and Add more between rows, Save and Exit on the last). Already-
 *     existing deductions are skipped. "Other" rows acknowledge the warning modal.
 *  5. "Stop" aborts within ~100ms. "Inspect Form" dumps the live DOM.
 *
 *  Every selector/label/timing lives in CONFIG. The per-field step trace ("·")
 *  shows exactly where a row is if it ever stalls; a per-row watchdog
 *  (rowTimeoutMs) guarantees the run never freezes silently.
 */

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════════════════
  //  CONFIG
  // ═════════════════════════════════════════════════════════════════════════
  const CONFIG = {
    sheetName: 'Deductions',
    columns: {
      master:        'UZIO Master Deductions List',
      dedType:       'UZIO Deduction Type',
      name:          'UZIO Deduction Name',
      method:        'UZIO Method',
      amount:        'Amount per pay',
      autoSync:      'Auto-Sync from Uzio Benefits',
      assignAll:     'Assign to all employees',
      schedule:      'Deduction Schedule',
      trackArrears:  'Track arrears',
      arrearsMethod: 'Arrears Processing Method',
      w2box:         'W-2 Box',
    },

    // Values meaning "do not type this".
    skipValues: new Set([
      '', 'n/a', 'na', '(auto-filled by uzio - do not set)', '<needs review>',
    ]),

    // Stable element IDs (AngularJS + jQuery-UI selectmenu). The "-button" span
    // opens a menu; its backing <select> shares the id without "-button".
    ids: {
      masterButton:        'masterDeduction-button',
      typeButton:          'masterDeductionTypeList-button',
      methodButton:        'deductionMethod-button',
      w2boxButton:         'w2Box-button',
      nameInput:           'deductionDisplayName',
      amountComponent:     'amount',                       // host wrapping the dynamic amount input
      arrearsMethodButton: 'arrearsProcessingMethod-button',
    },

    // Amount Per Pay is REQUIRED; always 0 at setup time.
    amountDefault: '0',

    // Radio groups (name + Yes/No id-suffix convention).
    radios: {
      autoSync:     'syncFromBenefit',    // syncFromBenefityes / syncFromBenefitno
      assignAll:    'autoAssignToEE',     // autoAssignToEEyes / autoAssignToEEno
      trackArrears: 'arrearsApplicable',  // arrearsApplicableYes / arrearsApplicableNo
    },

    // Label fallback (matched by "contains"; labels carry help-text blobs).
    labels: {
      amount: 'Amount Per Pay',
    },

    addDeductionText:    ['Add Deduction', 'Add New Deduction', '+ Add Deduction'],
    addContributionText: ['Add Contribution', 'Add New Contribution', '+ Add Contribution'],
    saveAndAddMoreText:  ['Save and Add more', 'Save and add more', 'Save & Add more'],
    saveAndExitText:     ['Save and Exit', 'Save and exit', 'Save & Exit'],
    cancelButtonText:    ['Cancel'],

    existingDeductionRowSelector: 'table tbody tr, .deduction-row, [data-deduction-name]',

    // ── Contributions (separate tab + form) ──────────────────────────────
    contribSheetName: 'Contributions',
    contribColumns: {
      name:        'Contribution Name',
      link:        'Link to Company Deduction',   // Yes / No
      linkedDed:   'Linked Deduction',            // deduction name when linked
      method:      'Method',                      // Formula / Fixed $ / % of Gross Pay
      monthlyLim:  'Monthly Limit',
      annualLim:   'Annual Limit',
      w2box:       'W-2 Box',
      assignAll:   'Assign to all employees',
    },
    contribIds: {
      nameInput:      'displayName',
      linkDedButton:  'deductionLink-button',
      methodButton:   'contributionMethodType-button',
      w2boxButton:    'w2BoxName-button',
      // Formula tiers: companyContri<N>_1 = match %, employeeContri<N>_1 = up-to %.
      tier0Match:     'companyContri0_1',
      tier0Upto:      'employeeContri0_1',
      tier1Match:     'companyContri1_1',
      tier1Upto:      'employeeContri1_1',
    },
    contribRadios: {
      link:      'linkContribution',  // linkContributionyes / linkContributionno
      assignAll: 'autoAssignToEE',    // shared with deductions
    },
    // Inputs whose id is empty — addressed by name.
    contribNames: {
      monthlyLimit: 'monthlyLimit_1',
      annualLimit:  'annualLimit_1',
    },
    // The standard 401k/Roth match formula: tier1 = 100% of first 1%,
    // tier2 = 50% of next 4%. (match%, upTo%) per tier.
    contribFormulaTiers: [
      { match: '100', upto: '1' },
      { match: '50',  upto: '4' },
    ],
    addMoreText: ['Add More', 'Add more', '+ Add More'],

    // ── Earnings (separate tab + form) ───────────────────────────────────
    earnSheetName: 'Earnings',
    earnColumns: {
      type:       'Earning Type',
      name:       'Earning Name',
      order:      'Display Order',
      paid:       'Paid Earning',
      hourly:     'Hourly Based Earning',
      rateFactor: 'Rate Determination Factor',
      rate:       'Rate',
      includeOT:  'Include Bonus in Overtime Calculation',
      disposable: 'Subject to garnishment disposable income',
      workersComp:'Subject to Workers Compensation',
      taxability: 'Taxability Type',
      w2box:      'W-2 Box',
    },
    earnIds: {
      typeButton:        'earningType-button',
      // Taxability / W-2 / Rate-Determination selectmenus use jQuery-UI
      // generated button ids (ui-id-N) that SHIFT between loads, so we target
      // them by their stable backing-<select> NAME via setSelectMenuByName.
    },
    // Backing <select> NAMES (stable) for the earning selectmenus.
    earnSelectNames: {
      taxability: 'taxabilityType',
      w2box:      'w2box',
      rateFactor: 'wageDeterminationFactor',  // "Multiples of Regular Wage Rate" / "Flat $ Per Hour Rate"
    },
    // Inputs addressed by name (their id is empty).
    earnNames: {
      nameInput:  'earningName',
      orderInput: 'displayOrder',
      rateInput:  'amountMultiplier',   // the "Rate" box under Rate Determination Factor
    },
    earnRadios: {
      paid:           'paidEarning',      // Yes_paidEarning / No_paidEarning  (prefix style!)
      hourly:         'timeBounded',      // Yes_timeBounded / No_timeBounded
      disposable:     'disposable',       // Yes_disposable / No_disposable
      workersComp:    'subjectToWC',      // Yes_subjectToWC / No_subjectToWC
      includeInOT:    'includeInOvertime',// Yes_includeInOvertime / No_includeInOvertime (Bonus)
    },
    addEarningText: ['Add Earning', 'Add New Earning', '+ Add Earning'],
    // The earning form uses "Save & Exit" / "Save & Add more" (ampersand).
    saveAndAddMoreTextE: ['Save & Add more', 'Save and Add more', 'Save & Add More'],
    saveAndExitTextE:    ['Save & Exit', 'Save and Exit'],

    // Timing (trimmed for speed; selectmenu verify-and-retry covers the slack).
    afterClickMs:   700,   // settle after a click
    afterTypeMs:    250,   // settle after typing / picking a value
    formAppearMs:   8000,  // max wait for the Add form to appear
    lowerFieldsMs:  1500,  // wait after master selection for lower fields
    formResetMs:    1200,  // wait after Save+Add-more for blank form to render
    saveSettleMs:   1000,  // wait after Save before verifying / next row
    confirmSaveMs:  1200,  // max poll for a saved name to appear in the live list
    otherModalWaitMs: 1800, // wait for the "Other" warning modal
    postSaveModalWaitMs: 1000, // short poll for other post-save popups (e.g. 401k Roth)
    rowTimeoutMs:   45000, // watchdog: max time per deduction before bailing
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  ABORT-AWARE PRIMITIVES
  // ═════════════════════════════════════════════════════════════════════════
  let aborted = false;
  let running = false;
  // Pause / resume / skip state (in-memory; UZIO add-forms don't full-reload, so
  // the run loop stays alive across saves and can genuinely pause + resume).
  let failMode = 'pause';     // 'pause' (default) | 'skip' — behavior on a row failure
  let pauseRequested = false; // user hit Pause; honored at the next row boundary
  let pauseKind = null;       // null | 'manual' | 'fail' — why we're paused right now
  let resumeAction = null;    // 'resume' | 'skip' — set by the fail-pause buttons

  const sleep = (ms) => new Promise((resolve, reject) => {
    const start = Date.now();
    (function tick() {
      if (aborted) { const e = new Error('aborted'); e.aborted = true; return reject(e); }
      if (Date.now() - start >= ms) return resolve();
      setTimeout(tick, Math.min(100, ms - (Date.now() - start)));
    })();
  });

  function checkAbort() {
    if (aborted) { const e = new Error('aborted'); e.aborted = true; throw e; }
  }

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
          try { const cd = el.contentDocument; if (cd) stack.push(cd); } catch (_) {}
        }
      }
    }
    return out;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  // Subtle, non-intrusive marker on the element the script clicks, so you can
  // confirm it hit the right control without the old alarm-red flash: a thin
  // purple outline (no fill) that gently fades + barely expands, gone in ~0.5s.
  function flashClick(el) {
    try {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const ring = document.createElement('div');
      ring.style.cssText = [
        'position:fixed',
        'left:' + (r.left - 2) + 'px', 'top:' + (r.top - 2) + 'px',
        'width:' + (r.width + 4) + 'px', 'height:' + (r.height + 4) + 'px',
        'border:2px solid rgba(108,43,217,0.85)', 'border-radius:6px',
        'background:transparent', 'box-shadow:0 0 0 2px rgba(108,43,217,0.12)',
        'z-index:2147483646', 'pointer-events:none', 'opacity:0.9',
        'transition:opacity .45s ease, transform .45s ease',
      ].join(';');
      document.body.appendChild(ring);
      // Next frame: fade out while gently expanding, so it reads as a soft pulse.
      requestAnimationFrame(() => {
        ring.style.opacity = '0';
        ring.style.transform = 'scale(1.04)';
      });
      setTimeout(() => { try { ring.remove(); } catch (_) {} }, 520);
    } catch (_) {}
  }

  function clickEl(el) {
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    flashClick(el);  // visual confirmation of what's being clicked
    // NOTE: do NOT pass `view: window`. Under @grant (Tampermonkey sandbox),
    // `window` is a wrapper that fails MouseEvent's Window conversion ("Failed
    // to read the 'view' property"). MouseEvent works fine without `view`.
    const opts = { bubbles: true, cancelable: true };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    return true;
  }

  // Native setter so AngularJS-controlled fields register the change. Picks the
  // prototype by element type — using the input setter on a <select> throws
  // "Illegal invocation".
  function setNativeValue(el, value) {
    let proto;
    if (el.tagName === 'SELECT') proto = window.HTMLSelectElement.prototype;
    else if (el.tagName === 'TEXTAREA') proto = window.HTMLTextAreaElement.prototype;
    else if (el.tagName === 'INPUT') proto = window.HTMLInputElement.prototype;
    else proto = null;
    if (proto) {
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
    } else {
      try { el.value = value; } catch (_) {}
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  const norm = (s) => (s == null ? '' : String(s)).trim();
  const lc = (s) => norm(s).toLowerCase();
  // Collapse ALL whitespace runs (newlines/tabs included) to single spaces, then
  // lowercase. Needed because UZIO renders some buttons as "Add\n\t\tMore".
  const lcFlat = (s) => norm(s).replace(/\s+/g, ' ').toLowerCase();
  const shouldSkipValue = (v) => CONFIG.skipValues.has(lc(v));

  async function waitFor(fn, timeoutMs, intervalMs = 200) {
    const start = Date.now();
    for (;;) {
      checkAbort();
      let r;
      try { r = fn(); } catch (_) { r = null; }
      if (r) return r;
      if (Date.now() - start >= timeoutMs) return null;
      await sleep(intervalMs);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  LABEL → CONTROL resolution (fallback path)
  // ═════════════════════════════════════════════════════════════════════════
  function findLabelEl(labelText, { contains = false } = {}) {
    const want = lc(labelText);
    const cands = deepQueryAll('label, .form-label, .control-label, span, div, legend, p').filter(visible);
    let hit = cands.find(el => lc(el.textContent) === want && directText(el));
    if (!hit && contains) {
      hit = cands
        .filter(el => lc(el.textContent).includes(want))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    }
    return hit || null;
  }

  function directText(el) {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return norm(t).length > 0;
  }

  function controlForLabel(labelEl) {
    if (!labelEl) return null;
    const forId = labelEl.getAttribute && labelEl.getAttribute('for');
    if (forId) {
      const byId = deepQueryAll('#' + CSS.escape(forId))[0];
      if (byId) return byId;
    }
    let inner = labelEl.querySelector && labelEl.querySelector('input, select, textarea');
    if (inner) return inner;
    const scopes = [labelEl.parentElement, labelEl.parentElement && labelEl.parentElement.parentElement];
    for (const scope of scopes) {
      if (!scope) continue;
      const ctrl = Array.from(scope.querySelectorAll('input, select, textarea')).filter(visible)[0];
      if (ctrl) return ctrl;
    }
    let sib = labelEl.nextElementSibling;
    for (let i = 0; i < 4 && sib; i++, sib = sib.nextElementSibling) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(sib.tagName) && visible(sib)) return sib;
      const ctrl = sib.querySelector && Array.from(sib.querySelectorAll('input, select, textarea')).filter(visible)[0];
      if (ctrl) return ctrl;
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  FIELD SETTERS
  // ═════════════════════════════════════════════════════════════════════════
  function deepById(id) { return deepQueryAll('#' + CSS.escape(id))[0] || null; }

  async function setText(labelText, value, { contains = false } = {}) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const label = findLabelEl(labelText, { contains });
    const ctrl = controlForLabel(label);
    if (!ctrl) return { ok: false, reason: `no input for label "${labelText}"` };
    setNativeValue(ctrl, norm(value));
    await sleep(CONFIG.afterTypeMs);
    return { ok: true };
  }

  async function setTextById(inputId, value) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const el = deepById(inputId);
    if (!el) return { ok: false, reason: `input #${inputId} not found` };
    setNativeValue(el, norm(value));
    await sleep(CONFIG.afterTypeMs);
    return { ok: true };
  }

  // Generic label-based dropdown (used only as a fallback).
  async function setDropdown(labelText, value, { contains = false } = {}) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const want = lc(value);
    const label = findLabelEl(labelText, { contains });
    const ctrl = controlForLabel(label);
    if (ctrl && ctrl.tagName === 'SELECT') {
      const opt = Array.from(ctrl.options).find(o => lc(o.textContent) === want)
               || Array.from(ctrl.options).find(o => lc(o.textContent).includes(want));
      if (!opt) return { ok: false, reason: `option "${value}" not in <select> "${labelText}"` };
      setNativeValue(ctrl, opt.value);
      await sleep(CONFIG.afterTypeMs);
      return { ok: true };
    }
    const opener = ctrl || (label && label.parentElement.querySelector('[class*="select"], [role="combobox"], .dropdown'));
    if (!opener) return { ok: false, reason: `no dropdown control for "${labelText}"` };
    clickEl(opener);
    await sleep(CONFIG.afterClickMs);
    const option = await waitFor(() => {
      const opts = deepQueryAll('[role="option"], li, .option, .dropdown-item').filter(visible);
      return opts.find(o => lc(o.textContent) === want) || opts.find(o => lc(o.textContent).includes(want));
    }, 3000, 150);
    if (!option) return { ok: false, reason: `dropdown option "${value}" not found for "${labelText}"` };
    clickEl(option);
    await sleep(CONFIG.afterTypeMs);
    return { ok: true };
  }

  function selectmenuDisabled(buttonId, selectId) {
    const button = deepById(buttonId);
    const sel = deepById(selectId);
    if (sel && sel.disabled) return true;
    if (button) {
      const cls = button.className || '';
      if (/ui-selectmenu-disabled|ui-state-disabled/.test(cls)) return true;
      if (button.getAttribute('aria-disabled') === 'true') return true;
    }
    return false;
  }

  function selectmenuButtonMatches(buttonId, want, contains) {
    const btn = deepById(buttonId);
    if (!btn) return false;
    const txt = lc(btn.textContent);
    return txt === want || (contains && txt.includes(want));
  }

  function pickMenuOption(selectId, want, contains) {
    const menus = [
      deepById(selectId + '-menu'),
      ...deepQueryAll('ul.ui-menu, .ui-selectmenu-menu ul, [role="listbox"]').filter(visible),
    ].filter(Boolean);
    for (const menu of menus) {
      if (!visible(menu)) continue;
      const items = Array.from(menu.querySelectorAll('li, [role="option"]')).filter(visible);
      const exact = items.find(li => lc(li.textContent) === want);
      if (exact) return exact;
      if (contains) {
        const part = items
          .filter(li => lc(li.textContent).includes(want))
          .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        if (part) return part;
      }
    }
    return null;
  }

  async function selectBackingNative(selectId, want, contains) {
    const sel = deepById(selectId);
    if (!sel || sel.tagName !== 'SELECT') return false;
    const opt = Array.from(sel.options).find(o => lc(o.textContent) === want)
             || (contains && Array.from(sel.options).find(o => lc(o.textContent).includes(want)));
    if (!opt) return false;
    setNativeValue(sel, opt.value);
    try { if (window.jQuery) window.jQuery(sel).val(opt.value).trigger('change'); } catch (_) {}
    await sleep(CONFIG.afterTypeMs);
    return true;
  }

  // Primary dropdown path: open menu → click option → VERIFY the button text
  // changed; retry up to 3×; fall back to the backing <select>. The verify step
  // is what prevents the "previous value sticks" bug.
  async function setSelectMenuById(buttonId, value, { contains = true } = {}) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const want = lc(value);
    const selectId = buttonId.replace(/-button$/, '');

    if (selectmenuDisabled(buttonId, selectId)) {
      return { ok: true, skipped: true, reason: 'disabled (auto-set)' };
    }
    if (selectmenuButtonMatches(buttonId, want, contains)) return { ok: true };

    for (let attempt = 1; attempt <= 3; attempt++) {
      const button = deepById(buttonId);
      if (!button) {
        const ok = await selectBackingNative(selectId, want, contains);
        if (ok) return { ok: true };
      } else {
        clickEl(button);
        await sleep(CONFIG.afterClickMs);
        const option = await waitFor(() => pickMenuOption(selectId, want, contains), 3000, 150);
        if (option) {
          clickEl(option);
          await sleep(CONFIG.afterTypeMs);
        } else {
          button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await selectBackingNative(selectId, want, contains);
        }
        const settled = await waitFor(
          () => (selectmenuButtonMatches(buttonId, want, contains) ? true : null), 800, 100
        );
        if (settled) return { ok: true };
      }
      await sleep(CONFIG.afterClickMs);
    }
    return { ok: false, reason: `could not set "${value}" on #${buttonId} (shows "${norm((deepById(buttonId) || {}).textContent)}")` };
  }

  // Set a jQuery-UI selectmenu whose BUTTON id is generated/unstable (ui-id-N)
  // but whose backing <select> has a stable NAME (earnings Taxability / W-2).
  // Resolves the current button id from the select's aria/owns linkage, then
  // delegates to setSelectMenuById.
  async function setSelectMenuByName(selectName, value, fallbackButtonId) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const sel = deepQueryAll(`select[name="${selectName}"]`)[0];
    let buttonId = fallbackButtonId;
    if (sel && sel.id) {
      // jQuery-UI names the button "<selectId>-button".
      const candidate = sel.id + '-button';
      if (deepById(candidate)) buttonId = candidate;
    }
    if (buttonId && deepById(buttonId)) {
      return setSelectMenuById(buttonId, value);
    }
    // Last resort: set the backing select directly.
    const ok = await selectBackingNative(sel ? sel.id : '', lc(value), true);
    return ok ? { ok: true } : { ok: false, reason: `selectmenu name="${selectName}" not settable to "${value}"` };
  }

  // Amount Per Pay renders only after Method is chosen; its input id/name is
  // dynamic (amount_1 for Fixed $, percentageAmount_1 for %).
  async function setAmount(value) {
    const find = () => {
      const host = deepById(CONFIG.ids.amountComponent);
      if (host) {
        if (host.tagName === 'INPUT') return host;
        const inner = host.querySelector && host.querySelector('input');
        if (inner) return inner;
      }
      const byAttr = deepQueryAll(
        'input[id^="amount"], input[name^="amount"], input[id^="percentageAmount"], input[name^="percentageAmount"]'
      ).filter(visible);
      return byAttr[0] || null;
    };
    const el = await waitFor(find, 3000, 150);
    if (!el) return { ok: false, reason: 'Amount Per Pay input not found' };
    setNativeValue(el, norm(value));
    await sleep(CONFIG.afterTypeMs);
    return { ok: true };
  }

  // Radio setter by group name. Matches the Yes/No member by id — handles BOTH
  // conventions UZIO uses: suffix ("...yes"/"...no", deductions/contributions)
  // AND prefix ("Yes_..."/"No_...", earnings) — then falls back to value/aria.
  async function setRadioByName(groupName, value) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const want = lc(value); // "yes" / "no"
    const radios = deepQueryAll(`input[type="radio"][name="${groupName}"]`);
    if (!radios.length) return { ok: false, reason: `radio group "${groupName}" not found` };
    let target = radios.find(r => {
      const idl = lc(r.id);
      if (want === 'yes') return idl.endsWith('yes') || idl.startsWith('yes_') || idl.startsWith('yes');
      return idl.endsWith('no') || idl.startsWith('no_') || idl.startsWith('no');
    });
    if (!target) target = radios.find(r => lc(r.value) === want || lc(r.getAttribute('aria-label')) === want);
    if (!target) return { ok: false, reason: `"${value}" not in radio group "${groupName}"` };
    // Skip locked/disabled radios (e.g. fields auto-filled by Earning Type).
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') {
      return { ok: true, skipped: true, reason: 'disabled (auto-set)' };
    }
    const lbl = deepQueryAll(`label[for="${target.id}"]`)[0];
    if (lbl) clickEl(lbl);
    clickEl(target);
    if (!target.checked) { try { target.checked = true; } catch (_) {} }
    target.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(CONFIG.afterTypeMs);
    return { ok: true };
  }

  // Text-scoped Yes/No (fallback when a radio group name isn't known).
  async function setYesNo(questionText, value) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const want = lc(value);
    const q = findLabelEl(questionText, { contains: true });
    if (!q) return { ok: false, reason: `question "${questionText}" not found` };
    const scope = q.closest('div, fieldset, section, form') || q.parentElement;
    if (!scope) return { ok: false, reason: `no scope for "${questionText}"` };
    const choices = Array.from(scope.querySelectorAll('label, span, button, [role="radio"], input[type="radio"]')).filter(visible);
    let target = choices.find(el => lc(el.textContent) === want);
    if (target) { clickEl(target); await sleep(CONFIG.afterTypeMs); return { ok: true }; }
    const radios = scope.querySelectorAll('input[type="radio"]');
    for (const radio of radios) {
      const v = lc(radio.value) || lc(radio.getAttribute('aria-label'));
      if (v === want) { clickEl(radio); await sleep(CONFIG.afterTypeMs); return { ok: true }; }
    }
    return { ok: false, reason: `Yes/No "${value}" not found for "${questionText}"` };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  BUTTONS
  // ═════════════════════════════════════════════════════════════════════════
  function findButtonByText(textList) {
    const wants = textList.map(lcFlat);
    const btns = deepQueryAll('button, a, [role="button"], input[type="submit"], input[type="button"]').filter(visible);
    for (const w of wants) {
      const exact = btns.find(b => lcFlat(b.textContent || b.value) === w);
      if (exact) return exact;
    }
    for (const w of wants) {
      const part = btns.find(b => lcFlat(b.textContent || b.value).includes(w));
      if (part) return part;
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  "Other" warning modal
  // ═════════════════════════════════════════════════════════════════════════
  async function handleNonStandardWarning(waitMs = 1800) {
    const continueBtn = await waitFor(() => {
      const btns = deepQueryAll('button, [role="button"], .btn').filter(visible);
      return btns.find(b => {
        const t = lc(b.textContent);
        if (!t.includes('continue')) return false;
        const modal = b.closest('.modal, [role="dialog"], .modal-content, .modal-dialog');
        const scopeText = lc((modal || document.body).textContent);
        // Recognized post-save modals:
        //  - "Other"/non-standard warning (acknowledge checkbox + Continue)
        //  - 401k "Roth Deduction will be Auto-Created" info popup (Continue)
        return scopeText.includes('acknowledge')
            || scopeText.includes('permitted list')
            || scopeText.includes('warning')
            || scopeText.includes('auto-created')
            || scopeText.includes('auto created')
            || scopeText.includes('will be created');
      });
    }, waitMs, 150);
    if (!continueBtn) return false;

    const modal = continueBtn.closest('.modal, [role="dialog"], .modal-content, .modal-dialog') || document;
    const checkbox = Array.from(modal.querySelectorAll('input[type="checkbox"]')).filter(visible)[0];
    if (checkbox && !checkbox.checked) {
      const lbl = checkbox.id ? deepQueryAll(`label[for="${checkbox.id}"]`)[0] : null;
      if (lbl) clickEl(lbl);
      clickEl(checkbox);
      if (!checkbox.checked) { try { checkbox.checked = true; } catch (_) {} }
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(CONFIG.afterTypeMs);
    } else if (!checkbox) {
      warn('warning modal: acknowledge checkbox not found (continuing anyway)');
    }
    clickEl(continueBtn);
    log('  ↳ acknowledged non-standard deduction warning.');
    await sleep(CONFIG.afterClickMs);
    return true;
  }

  // Some earnings (PTO/Vacation, Station Closure, Other+Hourly) raise a Yes/No
  // confirmation popup on Save where the answer should be "No". Clicks the modal
  // "No" button. No-ops cleanly if no such modal appears.
  async function handleSavePopupNo(waitMs = 1800) {
    const noBtn = await waitFor(() => {
      const btns = deepQueryAll('button, [role="button"], .btn, a').filter(visible);
      return btns.find(b => {
        const t = lcFlat(b.textContent);
        if (t !== 'no' && t !== 'no, continue' && t !== 'no thanks') return false;
        const modal = b.closest('.modal, [role="dialog"], .modal-content, .modal-dialog');
        return !!modal && visible(modal);
      });
    }, waitMs, 150);
    if (!noBtn) return false;
    clickEl(noBtn);
    log('  ↳ answered "No" on the save confirmation popup.');
    await sleep(CONFIG.afterClickMs);
    return true;
  }

  function captureValidationErrors() {
    const sels = ['.help-block', '.text-danger', '.invalid-feedback', '.error-message', '.field-error', '[class*="errorMsg"]'];
    const msgs = new Set();
    for (const sel of sels) {
      for (const el of deepQueryAll(sel).filter(visible)) {
        const t = norm(el.textContent);
        if (t && t.length > 1 && t.length < 160 && !el.closest('#uzio-bot-panel')) msgs.add(t);
      }
    }
    return Array.from(msgs).slice(0, 6).join(' | ');
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  EXISTING-DEDUCTION (skip) detection — exact name match
  // ═════════════════════════════════════════════════════════════════════════
  function existingDeductionNames() {
    const names = new Set();
    const rows = deepQueryAll(CONFIG.existingDeductionRowSelector).filter(visible);
    for (const row of rows) {
      const cells = row.querySelectorAll ? Array.from(row.querySelectorAll('td, th, .cell, a, span, div')) : [];
      const texts = cells.length ? cells.map(c => norm(c.textContent)).filter(Boolean) : [norm(row.textContent)];
      for (const t of texts) if (t) names.add(lc(t));
    }
    return names;
  }

  function alreadyExists(name, existingSet) {
    const n = lc(name);
    if (!n) return false;
    return existingSet.has(n);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  PER-DEDUCTION FLOW
  // ═════════════════════════════════════════════════════════════════════════
  async function createOneDeduction(row, { isLast, formAlreadyOpen }) {
    const C = CONFIG.columns, I = CONFIG.ids, L = CONFIG.labels, R = CONFIG.radios;
    const master = norm(row[C.master]);
    const name   = norm(row[C.name]);

    log(`▶ Creating "${name}" (master: ${master})`);
    const step = (s) => log(`   · ${s}`);

    // 1) Ensure the Add Deduction form is open.
    if (!formAlreadyOpen && !deepById(I.masterButton)) {
      step('opening Add Deduction form');
      const addBtn = findButtonByText(CONFIG.addDeductionText);
      if (!addBtn) return fail('Add Deduction form not open and "Add Deduction" button not found — open the form manually, then press Start.');
      clickEl(addBtn);
      await sleep(CONFIG.afterClickMs);
    }

    // 2) Wait for the form anchor.
    const formReady = await waitFor(() => deepById(I.masterButton), CONFIG.formAppearMs, 250);
    if (!formReady) return fail('Add Deduction form did not appear');

    // 2a) After "Save and Add more", wait for the blank form / Master reset.
    if (formAlreadyOpen) {
      step('waiting for blank form to reset');
      await sleep(CONFIG.formResetMs);
      await waitFor(() => {
        const t = lc((deepById(I.masterButton) || {}).textContent);
        return (t === '' || t.includes('select')) ? true : null;
      }, 2500, 150);
    }

    // 3) Master FIRST (drives the form). FATAL if it can't be set.
    step(`setting master "${master}"`);
    let r = await setSelectMenuById(I.masterButton, master);
    if (!r.ok && !r.skipped) {
      return { ok: false, fatal: true,
        reason: `master NOT set for "${name}" — ${r.reason}. Aborting before it fills the wrong deduction.` };
    }
    await sleep(CONFIG.lowerFieldsMs);

    // 4) Deduction Type — auto-locked for real masters; only "Other" sets it.
    if (lc(master) === 'other') {
      step('setting deduction type (Other)');
      r = await setSelectMenuById(I.typeButton, row[C.dedType]);
      if (!r.ok && !r.skipped) warn(`type: ${r.reason}`);
    }

    // 5) Name.
    step('setting name');
    r = await setTextById(I.nameInput, name);
    if (!r.ok && !r.skipped) warn(`name: ${r.reason}`);

    // 6) Auto-Sync (benefit only; "N/A" skips). "Yes" hides Assign-to-all.
    const autoSyncVal = lc(row[C.autoSync]);
    step(`setting auto-sync = ${row[C.autoSync] || '(skip)'}`);
    r = await setRadioByName(R.autoSync, row[C.autoSync]);
    if (!r.ok && !r.skipped) warn(`auto-sync: ${r.reason}`);
    if (!r.skipped) await sleep(CONFIG.afterClickMs);

    // 7) Method (reveals Amount Per Pay).
    step(`setting method "${row[C.method]}"`);
    r = await setSelectMenuById(I.methodButton, row[C.method]);
    if (!r.ok && !r.skipped) warn(`method: ${r.reason}`);
    await sleep(CONFIG.afterClickMs);

    // 8) Amount Per Pay — required; force 0 when blank.
    const amountVal = norm(row[C.amount]) || CONFIG.amountDefault;
    step(`setting amount = ${amountVal}`);
    r = await setAmount(amountVal);
    if (!r.ok && !r.skipped) warn(`amount: ${r.reason}`);

    // 9) W-2 Box — auto-locked for real masters; "Not Required" for Other.
    step('setting W-2 box');
    r = await setSelectMenuById(I.w2boxButton, row[C.w2box]);
    if (!r.ok && !r.skipped) warn(`w2box: ${r.reason}`);

    // 10) Assign-to-all — only when Auto-Sync ≠ Yes.
    if (autoSyncVal !== 'yes') {
      step(`setting assign-all = ${row[C.assignAll]}`);
      r = await setRadioByName(R.assignAll, row[C.assignAll]);
      if (!r.ok && !r.skipped) warn(`assign-all: ${r.reason}`);
    }

    // 11) Track arrears (+ method when Yes).
    step(`setting track-arrears = ${row[C.trackArrears]}`);
    r = await setRadioByName(R.trackArrears, row[C.trackArrears]);
    if (!r.ok && !r.skipped) warn(`track-arrears: ${r.reason}`);
    if (lc(row[C.trackArrears]) === 'yes') {
      await sleep(CONFIG.afterClickMs);
      step('setting arrears method');
      r = await setSelectMenuById(I.arrearsMethodButton, row[C.arrearsMethod]);
      if (!r.ok && !r.skipped) warn(`arrears-method: ${r.reason}`);
    }

    // NOTE: Deduction Schedule defaults to "Every Paycheck" — left untouched.

    // 12) Save.
    const useAddMore = !isLast;
    const saveBtn = useAddMore
      ? (findButtonByText(CONFIG.saveAndAddMoreText) || findButtonByText(CONFIG.saveAndExitText))
      : (findButtonByText(CONFIG.saveAndExitText) || findButtonByText(CONFIG.saveAndAddMoreText));
    if (!saveBtn) return fail('Save button not found — NOT saved');
    const clickedAddMore = lc(saveBtn.textContent).includes('add more');
    const errsBefore = captureValidationErrors();
    step(`clicking ${clickedAddMore ? 'Save and Add more' : 'Save and Exit'}`);
    clickEl(saveBtn);

    // 12a) Post-save confirmation modals. "Other" raises a non-standard warning
    //      (acknowledge + Continue); 401k raises a "Roth Deduction will be Auto-
    //      Created" info popup (Continue). Both are handled here. "Other" waits
    //      longer; everything else gets a short poll that no-ops when no modal.
    const modalWait = (lc(master) === 'other') ? CONFIG.otherModalWaitMs : CONFIG.postSaveModalWaitMs;
    await handleNonStandardWarning(modalWait);

    await sleep(CONFIG.saveSettleMs);

    // 12b) Verify the save. If a NEW validation error shows while the form is
    //      still here, the save failed — stop instead of cascading.
    const formStillHere = !!deepById(I.masterButton);
    if (formStillHere) {
      const errsAfter = captureValidationErrors();
      if (errsAfter && errsAfter !== errsBefore) {
        return { ok: false, fatal: true, reason: `save FAILED for "${name}" — UZIO validation: ${errsAfter}` };
      }
    }

    log(`✓ Saved "${name}"${clickedAddMore ? ' (Save and Add more)' : ' (Save and Exit)'}`);
    return { ok: true, formAlreadyOpen: clickedAddMore };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  MAIN RUN
  // ═════════════════════════════════════════════════════════════════════════
  let deductionRows = [];
  let contributionRows = [];
  let earningRows = [];

  // ═════════════════════════════════════════════════════════════════════════
  //  RUN ENGINE — one generic queue runner for all three entity types, with
  //  pause / resume / skip, a manual Pause, a failure-mode toggle, and an
  //  end-of-run "did everything actually save?" reconciliation.
  // ═════════════════════════════════════════════════════════════════════════

  // Show/hide/enable the panel controls to match the current run state.
  function updateControls() {
    const p = document.getElementById('uzio-bot-panel'); if (!p) return;
    const q = (id) => p.querySelector('#' + id);
    const paused = !!pauseKind;
    ['uziobot-starte', 'uziobot-start', 'uziobot-startc', 'uziobot-file', 'uziobot-skipmode'].forEach((id) => {
      const b = q(id); if (!b) return;
      b.disabled = running;
      b.style.opacity = running ? '0.5' : '1';
      if (b.tagName === 'BUTTON') b.style.cursor = running ? 'not-allowed' : 'pointer';
    });
    const show = (id, on) => { const b = q(id); if (b) b.style.display = on ? '' : 'none'; };
    show('uziobot-pause', running && !paused);
    show('uziobot-resume', paused);
    show('uziobot-savecont', pauseKind === 'fail');
    show('uziobot-skip', pauseKind === 'fail');
    const stopBtn = q('uziobot-stop'); if (stopBtn) stopBtn.disabled = !running;
  }

  function onPauseBtn()        { if (running && !pauseKind) { pauseRequested = true; setStatus('⏸ Pause requested — will pause after this row.'); } }
  function onResumeBtn()       { if (pauseKind === 'manual') pauseRequested = false; else if (pauseKind === 'fail') resumeAction = 'resume'; }
  function onSaveContinueBtn() { if (pauseKind === 'fail') resumeAction = 'save'; }
  function onSkipBtn()         { if (pauseKind === 'fail') resumeAction = 'skip'; }

  // Manual-pause gate — honored BETWEEN rows so we never pause mid-form.
  async function gateManualPause() {
    if (!pauseRequested) return;
    pauseKind = 'manual';
    setStatus('⏸ Paused. Click Resume to continue.');
    log('⏸ Paused (manual).'); updateControls();
    while (pauseRequested) { checkAbort(); await sleep(120); }
    pauseKind = null; updateControls(); log('▶ Resumed.');
  }

  // Fail-pause gate — waits for the Resume or Skip button; returns which.
  async function awaitFailDecision(name) {
    pauseKind = 'fail'; resumeAction = null;
    setStatus(`⏸ Paused at "${name}". Fix the field → "Save & Continue" (I'll save) · or "Resume" if you already saved it · or "Skip".`);
    updateControls();
    while (!resumeAction) { checkAbort(); await sleep(120); }
    const a = resumeAction; resumeAction = null; pauseKind = null; updateControls();
    return a;
  }

  // Best-effort: confirm a freshly-saved name appears in the live list.
  async function confirmInList(name, readExisting) {
    const target = lc(name);
    if (!target) return false;
    return !!(await waitFor(() => (readExisting().has(target) ? true : null), CONFIG.confirmSaveMs, 250));
  }

  // Best-effort: cancel/close an open Add form so the next row starts clean.
  async function cancelOpenForm() {
    const btn = deepQueryAll('button, [role="button"], .btn, a').filter(visible)
      .find((b) => CONFIG.cancelButtonText.some((t) => lcFlat(b.textContent) === lcFlat(t)));
    if (!btn) return false;
    clickEl(btn);
    await sleep(CONFIG.afterClickMs);
    await handleNonStandardWarning(CONFIG.postSaveModalWaitMs); // dismiss a "discard changes?" confirm, if any
    return true;
  }

  // "Save & Continue": click Save on the Add form the run is paused on (after you
  // fixed the field), handle any post-save popups generically, and settle.
  // Returns { ok, formAlreadyOpen } or { ok:false, reason }. Both popup handlers
  // no-op when their modal isn't present, so this is safe for every entity type.
  async function forceSaveOpenForm(cfg, isLast) {
    const addMore = cfg.saveAddMoreText || CONFIG.saveAndAddMoreText;
    const exit    = cfg.saveExitText    || CONFIG.saveAndExitText;
    const btn = isLast
      ? (findButtonByText(exit) || findButtonByText(addMore))
      : (findButtonByText(addMore) || findButtonByText(exit));
    if (!btn) return { ok: false, reason: 'Save button not found on the open form' };
    const clickedAddMore = lcFlat(btn.textContent).includes('add more');
    clickEl(btn);
    await sleep(CONFIG.afterClickMs);
    await handleSavePopupNo(CONFIG.postSaveModalWaitMs);     // earnings "No" confirm (no-op otherwise)
    await handleNonStandardWarning(CONFIG.otherModalWaitMs); // Other/Roth acknowledge+Continue (no-op otherwise)
    await sleep(CONFIG.saveSettleMs);
    return { ok: true, formAlreadyOpen: clickedAddMore };
  }

  // Positive proof a save actually took — independent of the (possibly hidden)
  // company list and of whether an inline error was captured:
  //   • Save & Add more  → the form must RESET (its name field clears).
  //   • Save & Exit       → the form must CLOSE (its anchor element disappears).
  // A failed save leaves the form populated/open, so this reliably catches the
  // "no error shown but nothing saved" case that slipped through before.
  async function verifySaveTookEffect(cfg, clickedAddMore) {
    if (clickedAddMore) {
      const ok = await waitFor(() => (cfg.readNameField() === '' ? true : null),
                               CONFIG.formResetMs + 1500, 200);
      return !!ok;
    }
    const ok = await waitFor(() => (!deepById(cfg.formAnchorId) ? true : null),
                             CONFIG.formResetMs + 1500, 200);
    return !!ok;
  }

  // True if the form looks saved/cleared after a manual save (Resume path):
  // either the form closed, or its name field was cleared by a reset.
  function formLooksCleared(cfg) {
    return (!deepById(cfg.formAnchorId)) || (cfg.readNameField() === '');
  }

  // cfg = { label, emptyMsg, startStatus, rows(), nameOf(row), readExisting(), createOne(row,ctx) }
  async function runQueue(cfg) {
    if (running) return;
    const rows = cfg.rows();
    if (!rows.length) { alert(cfg.emptyMsg); return; }
    aborted = false; running = true;
    pauseRequested = false; pauseKind = null; resumeAction = null;
    setStatus(cfg.startStatus); updateControls();
    const expected = []; // names we believe we created — reconciled against the list at the end
    try {
      const existing = cfg.readExisting();
      log(`Found ${existing.size} existing ${cfg.label.toLowerCase()} name(s) (skip detection).`);
      const toCreate = [];
      let skipped = 0;
      for (const row of rows) {
        const name = norm(cfg.nameOf(row));
        if (alreadyExists(name, existing)) { log(`⏭ Skipping "${name}" — already exists.`); skipped++; }
        else toCreate.push(row);
      }
      log(`${toCreate.length} to create, ${skipped} skipped. (On failure: ${failMode})`);

      let created = 0, formAlreadyOpen = false;
      const failures = [];
      for (let i = 0; i < toCreate.length; i++) {
        checkAbort();
        await gateManualPause();      // manual-pause boundary
        checkAbort();
        const row = toCreate[i];
        const name = norm(cfg.nameOf(row));
        const isLast = i === toCreate.length - 1;
        setStatus(`${cfg.label} (${i + 1}/${toCreate.length}) ${name}`);

        let res;
        try {
          // Watchdog: a row must finish within rowTimeoutMs or we treat it as failed.
          res = await Promise.race([
            cfg.createOne(row, { isLast, formAlreadyOpen }),
            (async () => {
              await sleep(CONFIG.rowTimeoutMs);
              const e = new Error(`timed out after ${CONFIG.rowTimeoutMs}ms — stuck on a field (see last "·" step line).`);
              e.rowTimeout = true; throw e;
            })(),
          ]);
        } catch (e) {
          if (e.aborted) throw e;
          res = { ok: false, reason: `${e.rowTimeout ? '⏱ ' : ''}${e.message}` };
        }

        // ── success (claimed) → PROVE it actually saved ──────────────────────
        if (res && res.ok) {
          const took = await verifySaveTookEffect(cfg, !!res.formAlreadyOpen);
          if (took) {
            created++; expected.push(name); formAlreadyOpen = !!res.formAlreadyOpen;
            continue;
          }
          // The form didn't reset/close → the save silently failed. Convert to a
          // failure so we pause (or skip) instead of moving on to the next row.
          res = { ok: false, reason: `save did NOT take for "${name}" — the form didn't ${res.formAlreadyOpen ? 'reset to a blank form' : 'close'} (a required field is likely missing/invalid, e.g. a blank "Paid Earning")` };
          // fall through to the failure handling below
        }

        // ── failure: pause (default) or skip ─────────────────────────────────
        const reason = res ? res.reason : 'unknown failure';
        warn(`✗ ${reason}`);
        let resolved = false;
        while (!resolved) {
          if (failMode === 'skip') {
            failures.push({ name, reason });
            await cancelOpenForm(); formAlreadyOpen = false;
            log(`   ↳ skip-mode: abandoned "${name}", continuing.`);
            resolved = true; break;
          }
          const action = await awaitFailDecision(name);   // pause on the filled form
          if (action === 'skip') {
            failures.push({ name, reason: reason + ' (skipped)' });
            await cancelOpenForm(); formAlreadyOpen = false;
            log(`   ↳ skipped "${name}".`);
            resolved = true; break;
          }
          if (action === 'save') {
            // "Save & Continue": you fixed the field — the script clicks Save.
            // First make sure you didn't already save it yourself.
            let cur = cfg.readExisting();
            if (cur.has(lc(name))) {
              created++; expected.push(name); formAlreadyOpen = false;
              log(`   ▶ "${name}" already in the list — continuing.`);
              resolved = true; break;
            }
            const sres = await forceSaveOpenForm(cfg, isLast);
            if (!sres.ok) {
              warn(`   couldn't click Save for "${name}": ${sres.reason}. Fix & Save manually, then Resume — or Skip.`);
              continue; // re-pause
            }
            // Prove it took (form reset/closed). If not, it's still blocked — pause.
            const took = await verifySaveTookEffect(cfg, sres.formAlreadyOpen);
            if (!took) {
              const errs = captureValidationErrors();
              warn(`   Save still didn't take for "${name}"${errs ? ` — ${errs}` : ` (form didn't ${sres.formAlreadyOpen ? 'reset' : 'close'})`}. Fix it, then Save & Continue again — or Skip.`);
              continue; // re-pause
            }
            created++; expected.push(name); formAlreadyOpen = !!sres.formAlreadyOpen;
            log(`   ▶ saved "${name}" for you — continuing.`);
            resolved = true; break;
          }
          // Resume: continue once we can confirm YOU saved it during the pause —
          // either it now shows in the list, or the form reset/closed.
          let now = cfg.readExisting();
          if (!now.has(lc(name))) { await sleep(CONFIG.afterClickMs); now = cfg.readExisting(); }
          if (now.has(lc(name)) || formLooksCleared(cfg)) {
            created++; expected.push(name); formAlreadyOpen = false;
            log(`   ▶ "${name}" confirmed saved — continuing.`);
            resolved = true; break;
          }
          warn(`   Still don't see "${name}" saved. Save it in UZIO, then Resume — or Skip.`);
          // loop back and pause again
        }
      }

      // ── post-run reconciliation: list is fully visible now, so this is the
      //    authoritative "did each one really save?" check. ──────────────────
      const finalList = cfg.readExisting();
      const missing = expected.filter((n) => !finalList.has(lc(n)));
      log(`Done. created=${created}, skipped=${skipped}, failed=${failures.length}, unconfirmed=${missing.length}`);
      if (failures.length) { log('Failed:'); failures.forEach((f) => log(`  • ${f.name} — ${f.reason}`)); }
      if (missing.length) warn(`⚠ ${missing.length} show NO error but are NOT in the list (possible silent fail) — re-run to retry: ${missing.join(', ')}`);
      if (!aborted) setStatus(`Done. created=${created}, skipped=${skipped}, failed=${failures.length}${missing.length ? `, unconfirmed=${missing.length}` : ''}`);
    } catch (e) {
      if (e.aborted) { log('Stopped.'); setStatus('Stopped.'); }
      else { warn('Run error: ' + e.message); setStatus('Error.'); }
    } finally {
      running = false; pauseRequested = false; pauseKind = null; resumeAction = null;
      updateControls();
    }
  }

  function run() {
    return runQueue({
      label: 'Deduction',
      emptyMsg: 'Load an .xlsx first (Choose .xlsx).',
      startStatus: 'Running deductions…',
      rows: () => deductionRows,
      nameOf: (r) => r[CONFIG.columns.name],
      readExisting: existingDeductionNames,
      createOne: createOneDeduction,
      saveAddMoreText: CONFIG.saveAndAddMoreText,
      saveExitText: CONFIG.saveAndExitText,
      formAnchorId: CONFIG.ids.masterButton,
      readNameField: () => { const el = deepById(CONFIG.ids.nameInput); return el ? norm(el.value) : null; },
    });
  }

  function stop() { aborted = true; setStatus('Stopping…'); updateControls(); }

  // ═════════════════════════════════════════════════════════════════════════
  //  CONTRIBUTIONS — per-row flow (reuses the deduction engine helpers)
  // ═════════════════════════════════════════════════════════════════════════
  // Set a contribution Formula tier: match% into companyContri<N>_1, up-to%
  // into employeeContri<N>_1. Returns {ok}.
  async function setFormulaTier(idx, matchPct, uptoPct) {
    const CI = CONFIG.contribIds;
    const matchId = idx === 0 ? CI.tier0Match : CI.tier1Match;
    const uptoId  = idx === 0 ? CI.tier0Upto  : CI.tier1Upto;
    const m = await waitFor(() => deepById(matchId), 3000, 150);
    const u = await waitFor(() => deepById(uptoId), 3000, 150);
    if (!m || !u) return { ok: false, reason: `formula tier ${idx + 1} inputs not found (${matchId}/${uptoId})` };
    setNativeValue(m, String(matchPct));
    await sleep(CONFIG.afterTypeMs);
    setNativeValue(u, String(uptoPct));
    await sleep(CONFIG.afterTypeMs);
    return { ok: true };
  }

  // Find the formula "Add More" button. Must NOT match "Save and Add more".
  // Primary: the AngularJS handler ng-click="addMoreFormula()" (most robust).
  // Fallbacks: whitespace-collapsed text match.
  function findAddMoreButton() {
    // Most robust: the button is bound to addMoreFormula().
    const byNg = deepQueryAll('[ng-click*="addMoreFormula"], button[ng-click*="addMore"]').filter(visible)[0];
    if (byNg) return byNg;
    const els = deepQueryAll('button, a, [role="button"], .btn').filter(visible);
    let hit = els.find(b => lcFlat(b.textContent) === 'add more');
    if (hit) return hit;
    hit = els.find(b => {
      const t = lcFlat(b.textContent);
      return t.includes('add more') && !t.includes('save');
    });
    return hit || null;
  }

  async function createOneContribution(row, { isLast, formAlreadyOpen }) {
    const C = CONFIG.contribColumns, I = CONFIG.contribIds, R = CONFIG.contribRadios, N = CONFIG.contribNames;
    const name   = norm(row[C.name]);
    const linkYN = lc(row[C.link]);
    const linked = norm(row[C.linkedDed]);
    const method = norm(row[C.method]);

    log(`▶ Creating contribution "${name}" (method: ${method})`);
    const step = (s) => log(`   · ${s}`);

    // 1) Ensure the Add Contribution form is open.
    if (!formAlreadyOpen && !deepById(I.nameInput)) {
      step('opening Add Contribution form');
      const addBtn = findButtonByText(CONFIG.addContributionText);
      if (!addBtn) return fail('Add Contribution form not open and "Add Contribution" button not found — open the form manually, then press Start.');
      clickEl(addBtn);
      await sleep(CONFIG.afterClickMs);
    }

    // 2) Wait for the form (Contribution Name input is the anchor).
    const formReady = await waitFor(() => deepById(I.nameInput), CONFIG.formAppearMs, 250);
    if (!formReady) return fail('Add Contribution form did not appear');

    // 2a) After "Save and Add more", wait for the blank form to reset.
    if (formAlreadyOpen) {
      step('waiting for blank form to reset');
      await sleep(CONFIG.formResetMs);
      await waitFor(() => {
        const v = lc((deepById(I.nameInput) || {}).value);
        return v === '' ? true : null;
      }, 2500, 150);
    }

    // 3) Contribution Name.
    step('setting name');
    let r = await setTextById(I.nameInput, name);
    if (!r.ok && !r.skipped) warn(`name: ${r.reason}`);

    // 4) Link to a company deduction? (radio). If Yes, pick the deduction.
    step(`setting link = ${row[C.link]}`);
    r = await setRadioByName(R.link, row[C.link]);
    if (!r.ok && !r.skipped) warn(`link: ${r.reason}`);
    if (linkYN === 'yes' && linked) {
      await sleep(CONFIG.afterClickMs);
      step(`linking deduction "${linked}"`);
      r = await setSelectMenuById(I.linkDedButton, linked);
      if (!r.ok && !r.skipped) warn(`linked-deduction: ${r.reason}`);
    }

    // 5) Method (Formula reveals the tier inputs; Fixed $ reveals an amount).
    step(`setting method "${method}"`);
    r = await setSelectMenuById(I.methodButton, method);
    if (!r.ok && !r.skipped) warn(`method: ${r.reason}`);
    await sleep(CONFIG.afterClickMs);

    // 6) Formula tiers (only for the Formula method).
    if (lc(method) === 'formula') {
      const tiers = CONFIG.contribFormulaTiers;
      step(`formula tier 1 = ${tiers[0].match}% of first ${tiers[0].upto}%`);
      r = await setFormulaTier(0, tiers[0].match, tiers[0].upto);
      if (!r.ok) warn(`formula tier 1: ${r.reason}`);
      if (tiers.length > 1) {
        // Tier 2 inputs only exist AFTER "Add More" is clicked. Wait for the
        // button (it renders a beat after tier 1), click it, then confirm the
        // tier-2 input appeared before filling.
        step('clicking Add More');
        const addMore = await waitFor(findAddMoreButton, 4000, 150);
        if (addMore) {
          clickEl(addMore);
          await sleep(CONFIG.afterClickMs);
          await waitFor(() => deepById(CONFIG.contribIds.tier1Match), 3000, 150);
        } else {
          warn('formula: "Add More" button not found');
        }
        step(`formula tier 2 = ${tiers[1].match}% of next ${tiers[1].upto}%`);
        r = await setFormulaTier(1, tiers[1].match, tiers[1].upto);
        if (!r.ok) warn(`formula tier 2: ${r.reason}`);
      }
    }

    // 7) Monthly / Annual limits (optional → skip when blank).
    if (norm(row[C.monthlyLim])) {
      const mEl = deepQueryAll(`input[name="${N.monthlyLimit}"]`).filter(visible)[0];
      if (mEl) { setNativeValue(mEl, norm(row[C.monthlyLim])); await sleep(CONFIG.afterTypeMs); }
    }
    if (norm(row[C.annualLim])) {
      const aEl = deepQueryAll(`input[name="${N.annualLimit}"]`).filter(visible)[0];
      if (aEl) { setNativeValue(aEl, norm(row[C.annualLim])); await sleep(CONFIG.afterTypeMs); }
    }

    // 8) W-2 Box.
    step('setting W-2 box');
    r = await setSelectMenuById(I.w2boxButton, row[C.w2box]);
    if (!r.ok && !r.skipped) warn(`w2box: ${r.reason}`);

    // 9) Assign to all employees.
    step(`setting assign-all = ${row[C.assignAll]}`);
    r = await setRadioByName(R.assignAll, row[C.assignAll]);
    if (!r.ok && !r.skipped) warn(`assign-all: ${r.reason}`);

    // 10) Save.
    const useAddMore = !isLast;
    const saveBtn = useAddMore
      ? (findButtonByText(CONFIG.saveAndAddMoreText) || findButtonByText(CONFIG.saveAndExitText))
      : (findButtonByText(CONFIG.saveAndExitText) || findButtonByText(CONFIG.saveAndAddMoreText));
    if (!saveBtn) return fail('Save button not found — NOT saved');
    const clickedAddMore = lc(saveBtn.textContent).includes('add more');
    const errsBefore = captureValidationErrors();
    step(`clicking ${clickedAddMore ? 'Save and Add more' : 'Save and Exit'}`);
    clickEl(saveBtn);
    await sleep(CONFIG.afterClickMs);

    // Any post-save confirmation modal (best-effort).
    await handleNonStandardWarning(CONFIG.postSaveModalWaitMs);
    await sleep(CONFIG.saveSettleMs);

    const formStillHere = !!deepById(I.nameInput);
    if (formStillHere) {
      const errsAfter = captureValidationErrors();
      if (errsAfter && errsAfter !== errsBefore) {
        return { ok: false, fatal: true, reason: `save FAILED for "${name}" — UZIO validation: ${errsAfter}` };
      }
    }

    log(`✓ Saved contribution "${name}"${clickedAddMore ? ' (Save and Add more)' : ' (Save and Exit)'}`);
    return { ok: true, formAlreadyOpen: clickedAddMore };
  }

  // Read existing contribution names from the list (skip detection + reconcile).
  function existingContributionNames() {
    const names = new Set();
    const rows = deepQueryAll(CONFIG.existingDeductionRowSelector).filter(visible);
    for (const row of rows) {
      const cells = row.querySelectorAll ? Array.from(row.querySelectorAll('td, th, .cell, a, span, div')) : [];
      const texts = cells.length ? cells.map((c) => norm(c.textContent)).filter(Boolean) : [norm(row.textContent)];
      for (const t of texts) if (t) names.add(lc(t));
    }
    return names;
  }

  function runContributions() {
    return runQueue({
      label: 'Contribution',
      emptyMsg: 'No contributions loaded. Choose an .xlsx with a "Contributions" tab.',
      startStatus: 'Running contributions…',
      rows: () => contributionRows,
      nameOf: (r) => r[CONFIG.contribColumns.name],
      readExisting: existingContributionNames,
      createOne: createOneContribution,
      saveAddMoreText: CONFIG.saveAndAddMoreText,
      saveExitText: CONFIG.saveAndExitText,
      formAnchorId: CONFIG.contribIds.nameInput,
      readNameField: () => { const el = deepById(CONFIG.contribIds.nameInput); return el ? norm(el.value) : null; },
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  EARNINGS — per-row flow + run loop
  // ═════════════════════════════════════════════════════════════════════════
  async function setTextByName(name, value) {
    if (shouldSkipValue(value)) return { ok: true, skipped: true };
    const el = deepQueryAll(`input[name="${name}"]`).filter(visible)[0];
    if (!el) return { ok: false, reason: `input name="${name}" not found` };
    setNativeValue(el, norm(value));
    await sleep(CONFIG.afterTypeMs);
    return { ok: true };
  }

  // Read existing earning names from the UZIO Earnings list (for skip).
  function existingEarningNames() {
    const names = new Set();
    const rows = deepQueryAll(CONFIG.existingDeductionRowSelector).filter(visible);
    for (const row of rows) {
      const cells = row.querySelectorAll ? Array.from(row.querySelectorAll('td, th, .cell, a, span, div')) : [];
      const texts = cells.length ? cells.map(c => norm(c.textContent)).filter(Boolean) : [norm(row.textContent)];
      for (const t of texts) if (t) names.add(lc(t));
    }
    return names;
  }

  async function createOneEarning(row, { isLast, formAlreadyOpen }) {
    const C = CONFIG.earnColumns, I = CONFIG.earnIds, N = CONFIG.earnNames, R = CONFIG.earnRadios;
    const name = norm(row[C.name]);
    const etype = norm(row[C.type]);

    log(`▶ Creating earning "${name}" (type: ${etype})`);
    const step = (s) => log(`   · ${s}`);

    // 1) Ensure the Add Earning form is open.
    if (!formAlreadyOpen && !deepById(I.typeButton)) {
      step('opening Add Earning form');
      const addBtn = findButtonByText(CONFIG.addEarningText);
      if (!addBtn) return fail('Add Earning form not open and "Add Earning" button not found — open the form manually, then press Start.');
      clickEl(addBtn);
      await sleep(CONFIG.afterClickMs);
    }

    // 2) Wait for the form (Earning Type selectmenu is the anchor).
    const formReady = await waitFor(() => deepById(I.typeButton), CONFIG.formAppearMs, 250);
    if (!formReady) return fail('Add Earning form did not appear');

    // 2a) After "Save & Add more", wait for the blank form to reset.
    if (formAlreadyOpen) {
      step('waiting for blank form to reset');
      await sleep(CONFIG.formResetMs);
      await waitFor(() => {
        const t = lc((deepById(I.typeButton) || {}).textContent);
        return (t === '' || t.includes('select')) ? true : null;
      }, 2500, 150);
    }

    // 3) Earning Type FIRST (driver). FATAL if it can't be set — like Master.
    step(`setting earning type "${etype}"`);
    let r = await setSelectMenuById(I.typeButton, etype);
    if (!r.ok && !r.skipped) {
      return { ok: false, fatal: true,
        reason: `earning type NOT set for "${name}" — ${r.reason}. Aborting before it fills the wrong earning.` };
    }
    await sleep(CONFIG.lowerFieldsMs);

    // 3a) Type-dependent EXTRA fields that some Earning Types reveal:
    //   - Bonus -> "Include Bonus in Overtime Rate Calculation?" radio => No
    //     (group name="includeInOvertime", ids Yes_/No_includeInOvertime).
    //   - Vacation/PTO -> "Time off Policies" dropdown => All.
    const etl = lc(etype);
    if (etl === 'bonus') {
      // Value comes from the xlsx "Include Bonus in Overtime Calculation"
      // column (Yes = non-discretionary, No = discretionary). "NA" no-ops.
      const incOT = norm(row[C.includeOT]) || 'No';
      step(`include bonus in overtime = ${incOT}`);
      const rr = await setRadioByName(R.includeInOT, incOT);
      if (!rr.ok && !rr.skipped) warn(`include-in-overtime: ${rr.reason}`);
    }
    if (etl === 'vacation') {
      step('time off policies = All');
      const rr = await setDropdown('time off polic', 'All', { contains: true });
      if (!rr.ok && !rr.skipped) warn(`time-off-policies: ${rr.reason}`);
    }

    // 4) Earning Name (verbatim).
    step('setting name');
    r = await setTextByName(N.nameInput, name);
    if (!r.ok && !r.skipped) warn(`name: ${r.reason}`);

    // 5) Display Order.
    step(`setting display order ${row[C.order]}`);
    r = await setTextByName(N.orderInput, row[C.order]);
    if (!r.ok && !r.skipped) warn(`display-order: ${r.reason}`);

    // 6) Yes/No + taxability + W-2: for a REAL Earning Type these are auto-
    //    filled AND LOCKED by UZIO (like Master Deductions), so we must NOT
    //    touch them. Only "Other" earnings expose them as editable. The radio
    //    setter also self-skips disabled radios as a safety net.
    const SN = CONFIG.earnSelectNames;
    if (lc(etype) === 'other') {
      step(`paid earning = ${row[C.paid]}`);
      r = await setRadioByName(R.paid, row[C.paid]);
      if (!r.ok && !r.skipped) warn(`paid: ${r.reason}`);

      step(`hourly based = ${row[C.hourly]}`);
      r = await setRadioByName(R.hourly, row[C.hourly]);
      if (!r.ok && !r.skipped) warn(`hourly: ${r.reason}`);
    } else {
      step('mapped Earning Type — Paid/Hourly/Taxability/WC auto-filled & locked, skipping');
    }

    // Rate Determination Factor + Rate: driven by the xlsx (non-"NA" means the
    // field is present and must be set). Applies to "Other"+Hourly (Rate 1) AND
    // mapped types like Unpaid Time Off (Rate 0). No-ops when the xlsx says NA.
    if (!shouldSkipValue(row[C.rateFactor])) {
      await sleep(CONFIG.afterClickMs); // let the RDF field render
      step(`rate determination factor = ${row[C.rateFactor]}`);
      r = await setSelectMenuByName(SN.rateFactor, row[C.rateFactor]);
      if (!r.ok && !r.skipped) warn(`rate-factor: ${r.reason}`);
      await sleep(CONFIG.afterClickMs); // let the Rate box render
      step(`rate = ${row[C.rate]}`);
      const rr = await setTextByName(N.rateInput, row[C.rate]);
      if (!rr.ok && !rr.skipped) warn(`rate: ${rr.reason}`);
    }

    // Disposable income / Workers' Comp: editable for "Other" AND a few named
    // types (Reimbursements, DA Recognition - TWA) where UZIO leaves them open.
    // setRadioByName self-skips a locked/disabled radio, so attempting this is
    // safe for every type.
    const DISP_WC_TYPES = new Set(['other', 'reimbursements', 'da recognition - twa']);
    if (DISP_WC_TYPES.has(etl)) {
      step(`disposable = ${row[C.disposable]}`);
      r = await setRadioByName(R.disposable, row[C.disposable]);
      if (!r.ok && !r.skipped) warn(`disposable: ${r.reason}`);

      step(`workers-comp = ${row[C.workersComp]}`);
      r = await setRadioByName(R.workersComp, row[C.workersComp]);
      if (!r.ok && !r.skipped) warn(`workers-comp: ${r.reason}`);
    }

    // Taxability / W-2: only editable for "Other" (mapped types auto-fill+lock).
    if (lc(etype) === 'other') {
      step(`taxability = ${row[C.taxability]}`);
      r = await setSelectMenuByName(SN.taxability, row[C.taxability]);
      if (!r.ok && !r.skipped) warn(`taxability: ${r.reason}`);

      step('setting W-2 box');
      r = await setSelectMenuByName(SN.w2box, row[C.w2box]);
      if (!r.ok && !r.skipped) warn(`w2box: ${r.reason}`);
    }

    // 9) Save.
    const useAddMore = !isLast;
    const saveBtn = useAddMore
      ? (findButtonByText(CONFIG.saveAndAddMoreTextE) || findButtonByText(CONFIG.saveAndExitTextE))
      : (findButtonByText(CONFIG.saveAndExitTextE) || findButtonByText(CONFIG.saveAndAddMoreTextE));
    if (!saveBtn) return fail('Save button not found — NOT saved');
    const clickedAddMore = lcFlat(saveBtn.textContent).includes('add more');
    const errsBefore = captureValidationErrors();
    step(`clicking ${clickedAddMore ? 'Save & Add more' : 'Save & Exit'}`);
    clickEl(saveBtn);
    await sleep(CONFIG.afterClickMs);
    // Save-time confirmation popup → answer "No" (Vacation/PTO, Unpaid Time Off,
    // Station Closure, and Other earnings with Hourly=Yes raise it). No-ops if
    // the popup doesn't appear.
    const otherHourly = (etl === 'other') && lc(row[C.hourly]) === 'yes';
    if (etl === 'vacation' || etl === 'unpaid time off' || etl === 'station closure' || otherHourly) {
      await handleSavePopupNo(CONFIG.postSaveModalWaitMs);
    }
    await handleNonStandardWarning(CONFIG.postSaveModalWaitMs);
    await sleep(CONFIG.saveSettleMs);

    const formStillHere = !!deepById(I.typeButton);
    if (formStillHere) {
      const errsAfter = captureValidationErrors();
      if (errsAfter && errsAfter !== errsBefore) {
        return { ok: false, fatal: true, reason: `save FAILED for "${name}" — UZIO validation: ${errsAfter}` };
      }
    }

    log(`✓ Saved earning "${name}"${clickedAddMore ? ' (Save & Add more)' : ' (Save & Exit)'}`);
    return { ok: true, formAlreadyOpen: clickedAddMore };
  }

  function runEarnings() {
    return runQueue({
      label: 'Earning',
      emptyMsg: 'No earnings loaded. Choose an .xlsx with an "Earnings" tab.',
      startStatus: 'Running earnings…',
      rows: () => earningRows,
      nameOf: (r) => r[CONFIG.earnColumns.name],
      readExisting: existingEarningNames,
      createOne: createOneEarning,
      saveAddMoreText: CONFIG.saveAndAddMoreTextE,
      saveExitText: CONFIG.saveAndExitTextE,
      formAnchorId: CONFIG.earnIds.typeButton,
      readNameField: () => { const el = deepQueryAll(`input[name="${CONFIG.earnNames.nameInput}"]`).filter(visible)[0]; return el ? norm(el.value) : null; },
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  INSPECT FORM
  // ═════════════════════════════════════════════════════════════════════════
  function inspectForm() {
    const report = [];
    const clip = (s, n = 120) => { s = norm(s).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; };
    report.push('=== UZIO ADD-DEDUCTION FORM INSPECTION ===');
    report.push('TIP: open Add Deduction AND select a real Master before inspecting.');

    const labels = deepQueryAll('label, .form-label, .control-label, legend').filter(visible);
    report.push(`\n-- ${labels.length} label-ish elements --`);
    labels.forEach((l, i) => {
      const ctrl = controlForLabel(l);
      report.push(`[${i}] label="${clip(l.textContent)}" for="${l.getAttribute && l.getAttribute('for') || ''}" -> ${ctrl ? ctrl.tagName + (ctrl.type ? ':' + ctrl.type : '') + ' name=' + (ctrl.name || '') + ' id=' + (ctrl.id || '') : 'NO CONTROL'}`);
    });

    const selects = deepQueryAll('select');
    report.push(`\n-- ${selects.length} <select> (incl. hidden) --`);
    selects.forEach((s, i) => {
      report.push(`select[${i}] id=${s.id} name=${s.name} vis=${visible(s)} options=[${Array.from(s.options).map(o => o.textContent.trim()).filter(Boolean).join(' | ')}]`);
    });

    const smButtons = deepQueryAll('[id$="-button"], .ui-selectmenu-button').filter(visible);
    report.push(`\n-- ${smButtons.length} selectmenu buttons --`);
    smButtons.forEach((b, i) => report.push(`smbtn[${i}] id=${b.id} text="${clip(b.textContent, 60)}"`));

    const radios = deepQueryAll('input[type="radio"]').filter(visible);
    report.push(`\n-- ${radios.length} radios --`);
    radios.forEach((r, i) => report.push(`radio[${i}] name=${r.name} value=${r.value} id=${r.id}`));

    const inputs = deepQueryAll('input[type="text"], input[type="number"], input:not([type])').filter(visible);
    report.push(`\n-- ${inputs.length} text/number inputs --`);
    inputs.forEach((inp, i) => report.push(`input[${i}] id=${inp.id} name=${inp.name} placeholder="${inp.placeholder || ''}"`));

    const btns = deepQueryAll('button, [role="button"], input[type="submit"]').filter(visible);
    report.push(`\n-- ${btns.length} buttons --`);
    btns.forEach((b, i) => report.push(`btn[${i}] "${clip(b.textContent || b.value, 40)}" id=${b.id} class=${clip(b.className, 50)}`));

    const text = report.join('\n');
    console.log(text);
    log('Inspection dumped to console + clipboard.');
    try { navigator.clipboard.writeText(text); } catch (_) {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  XLSX LOADING
  // ═════════════════════════════════════════════════════════════════════════
  async function handleFile(file) {
    // Ensure SheetJS is available (it loads async via GM_xmlhttpRequest).
    if (typeof XLSX === 'undefined') {
      log('Loading Excel library…');
      const ok = await loadSheetJS();
      if (!ok) { alert('Excel library (SheetJS) failed to load. Check network/CSP and reload.'); return; }
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        // Deductions tab (required).
        if (wb.SheetNames.includes(CONFIG.sheetName)) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[CONFIG.sheetName], { defval: '' });
          deductionRows = rows.filter(r => norm(r[CONFIG.columns.name]));
          log(`Loaded ${deductionRows.length} deduction row(s) from "${file.name}".`);
        } else {
          deductionRows = [];
          log(`No "${CONFIG.sheetName}" tab. Tabs: ${wb.SheetNames.join(', ')}`);
        }
        // Contributions tab (optional).
        if (wb.SheetNames.includes(CONFIG.contribSheetName)) {
          const crows = XLSX.utils.sheet_to_json(wb.Sheets[CONFIG.contribSheetName], { defval: '' });
          contributionRows = crows.filter(r => norm(r[CONFIG.contribColumns.name]));
          log(`Loaded ${contributionRows.length} contribution row(s).`);
        } else {
          contributionRows = [];
        }
        // Earnings tab (optional).
        if (wb.SheetNames.includes(CONFIG.earnSheetName)) {
          const erows = XLSX.utils.sheet_to_json(wb.Sheets[CONFIG.earnSheetName], { defval: '' });
          earningRows = erows.filter(r => norm(r[CONFIG.earnColumns.name]));
          log(`Loaded ${earningRows.length} earning row(s).`);
        } else {
          earningRows = [];
        }
        setStatus(`${deductionRows.length} ded, ${contributionRows.length} contrib, ${earningRows.length} earn loaded.`);
      } catch (err) {
        alert('Failed to read xlsx: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  FLOATING PANEL
  // ═════════════════════════════════════════════════════════════════════════
  let logEl, statusEl;
  function log(msg)  { console.log('[UZIO Bot]', msg); if (logEl) { logEl.textContent += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; } }
  function warn(msg) { console.warn('[UZIO Bot]', msg); log('⚠ ' + msg); }
  function fail(msg) { warn(msg); return { ok: false, reason: msg }; }
  function setStatus(s) { if (statusEl) statusEl.textContent = s; }

  function buildPanel() {
    if (document.getElementById('uzio-bot-panel')) return;
    const wrap = document.createElement('div');
    wrap.id = 'uzio-bot-panel';
    wrap.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'width:320px', 'background:#fff', 'border:2px solid #6c2bd9', 'border-radius:10px',
      'box-shadow:0 6px 24px rgba(0,0,0,.25)', 'font:13px/1.4 system-ui,sans-serif',
      'color:#222', 'padding:10px',
    ].join(';');
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-weight:700;color:#6c2bd9">UZIO Setup Bot <span style="font-weight:400;color:#888">v0.34.0</span></span>
        <button id="uziobot-min" title="Minimize / expand" style="border:1px solid #ccc;background:#f7f7f7;border-radius:6px;cursor:pointer;width:26px;height:22px;line-height:1;font-weight:700">–</button>
      </div>
      <div id="uziobot-body">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <button id="uziobot-file" style="flex:1;padding:6px;border:1px solid #6c2bd9;background:#f3effd;border-radius:6px;cursor:pointer">Choose .xlsx</button>
          <button id="uziobot-inspect" style="flex:1;padding:6px;border:1px solid #888;background:#f7f7f7;border-radius:6px;cursor:pointer">Inspect Form</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button id="uziobot-starte" style="flex:1;padding:6px;border:0;background:#fd7e14;color:#fff;border-radius:6px;cursor:pointer">Start Earnings</button>
          <button id="uziobot-start" style="flex:1;padding:6px;border:0;background:#28a745;color:#fff;border-radius:6px;cursor:pointer">Start Deductions</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button id="uziobot-startc" style="flex:1;padding:6px;border:0;background:#0d6efd;color:#fff;border-radius:6px;cursor:pointer">Start Contributions</button>
          <button id="uziobot-stop" style="flex:1;padding:6px;border:0;background:#dc3545;color:#fff;border-radius:6px;cursor:pointer">Stop</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <button id="uziobot-pause" style="display:none;flex:1 1 90px;padding:6px;border:0;background:#f0ad4e;color:#fff;border-radius:6px;cursor:pointer">Pause</button>
          <button id="uziobot-savecont" style="display:none;flex:1 1 90px;padding:6px;border:0;background:#0d6efd;color:#fff;border-radius:6px;cursor:pointer" title="I fixed the field — you click Save">Save &amp; Continue</button>
          <button id="uziobot-resume" style="display:none;flex:1 1 90px;padding:6px;border:0;background:#28a745;color:#fff;border-radius:6px;cursor:pointer" title="I already saved it myself — just continue">Resume</button>
          <button id="uziobot-skip" style="display:none;flex:1 1 90px;padding:6px;border:0;background:#6c757d;color:#fff;border-radius:6px;cursor:pointer">Skip this one</button>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:6px">
          <input type="checkbox" id="uziobot-skipmode"> On failure: <b>skip &amp; continue</b> (default: pause on the form)
        </label>
        <div id="uziobot-status" style="font-size:12px;color:#555;margin-bottom:4px">Idle.</div>
        <pre id="uziobot-log" style="height:140px;overflow:auto;background:#0d1117;color:#d1d5da;padding:6px;border-radius:6px;margin:0;font-size:11px;white-space:pre-wrap"></pre>
      </div>
      <input id="uziobot-fileinput" type="file" accept=".xlsx,.xls" style="display:none" />
    `;
    document.body.appendChild(wrap);

    logEl = wrap.querySelector('#uziobot-log');
    statusEl = wrap.querySelector('#uziobot-status');
    const fileInput = wrap.querySelector('#uziobot-fileinput');

    wrap.querySelector('#uziobot-file').onclick = () => fileInput.click();
    fileInput.onchange = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
    wrap.querySelector('#uziobot-inspect').onclick = inspectForm;
    wrap.querySelector('#uziobot-starte').onclick = runEarnings;
    wrap.querySelector('#uziobot-start').onclick = run;
    wrap.querySelector('#uziobot-startc').onclick = runContributions;
    wrap.querySelector('#uziobot-stop').onclick = stop;
    wrap.querySelector('#uziobot-pause').onclick = onPauseBtn;
    wrap.querySelector('#uziobot-savecont').onclick = onSaveContinueBtn;
    wrap.querySelector('#uziobot-resume').onclick = onResumeBtn;
    wrap.querySelector('#uziobot-skip').onclick = onSkipBtn;
    wrap.querySelector('#uziobot-skipmode').onchange = (e) => {
      failMode = e.target.checked ? 'skip' : 'pause';
      log(`Failure mode set to: ${failMode === 'skip' ? 'skip & continue' : 'pause on the form'}.`);
    };
    updateControls();

    // Minimize / expand: collapse the body, leaving just the title bar.
    const body = wrap.querySelector('#uziobot-body');
    const minBtn = wrap.querySelector('#uziobot-min');
    minBtn.onclick = () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      minBtn.textContent = hidden ? '–' : '+';
    };

    log('Ready. Choose .xlsx, open the matching Add form, then Start Deductions or Start Contributions.');
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  PERSISTENT INJECTION (SPA-safe)
  // ═════════════════════════════════════════════════════════════════════════
  // Only show the bot on the employer home app (post-login):
  //   https://app.uzio.com/employer/home#/...
  // @match can't filter on the "#/" hash route, so we gate at runtime here.
  function shouldShowPanel() {
    try { return location.href.indexOf('app.uzio.com/employer/home') !== -1; }
    catch (_) { return false; }
  }

  function ensurePanel() {
    try {
      if (!document.body) return;
      const existing = document.getElementById('uzio-bot-panel');
      if (shouldShowPanel()) {
        if (!existing) buildPanel();              // on employer/home → show
      } else if (existing) {
        existing.remove();                        // anywhere else (e.g. login) → hide
      }
    } catch (e) { console.error('[UZIO Bot] ensurePanel error', e); }
  }

  function startInjector() {
    ensurePanel();
    try {
      const mo = new MutationObserver(() => {
        if (!document.getElementById('uzio-bot-panel')) ensurePanel();
      });
      if (document.documentElement) mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { console.error('[UZIO Bot] observer error', e); }
    setInterval(ensurePanel, 2000);
    window.addEventListener('hashchange', ensurePanel);
    window.addEventListener('popstate', ensurePanel);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  SheetJS loader (CSP-safe via GM_xmlhttpRequest)
  //  UZIO's CSP blocks @require'd CDN scripts, so we fetch SheetJS through
  //  Tampermonkey's privileged XHR (bypasses page CSP) and eval it into scope.
  //  Tries multiple CDNs; on total failure the bot still loads but xlsx parsing
  //  is disabled (the panel warns).
  // ═════════════════════════════════════════════════════════════════════════
  const SHEETJS_URLS = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  ];

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest unavailable'));
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 20000,
        onload: (res) => (res.status >= 200 && res.status < 300)
          ? resolve(res.responseText)
          : reject(new Error('HTTP ' + res.status + ' for ' + url)),
        onerror: () => reject(new Error('network error for ' + url)),
        ontimeout: () => reject(new Error('timeout for ' + url)),
      });
    });
  }

  async function loadSheetJS() {
    if (typeof XLSX !== 'undefined') return true;
    for (const url of SHEETJS_URLS) {
      try {
        const code = await gmGet(url);
        // Evaluate in this scope so `XLSX` becomes available to the script.
        // eslint-disable-next-line no-eval
        (0, eval)(code);
        if (typeof XLSX !== 'undefined') {
          console.log('[UZIO Bot] SheetJS loaded from', url);
          return true;
        }
      } catch (e) {
        console.warn('[UZIO Bot] SheetJS load failed:', e.message);
      }
    }
    return false;
  }

  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    startInjector();              // panel appears immediately (don't block on CDN)
    const ok = await loadSheetJS();
    if (ok) {
      log('Ready. Choose .xlsx, open the matching Add form, then Start (Earnings / Deductions / Contributions).');
    } else {
      warn('Could not load the Excel library (SheetJS) — .xlsx reading is disabled. Check that jsdelivr/cdnjs/unpkg are reachable, then reload.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
    setTimeout(boot, 0);
  } else {
    boot();
  }
})();
