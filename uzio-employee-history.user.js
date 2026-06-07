// ==UserScript==
// @name         UZIO Bulk Employee Profile Change Report Downloader
// @namespace    https://uzio.com/
// @version      0.12.0
// @description  Paste visible Employee IDs (e.g. VBP8L5UJZ) — the script resolves each to its internal GUID from the Employees grid, then triggers "Download Employee Profile Change Report" for each in sequence.
// @match        *://*.uzio.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // The AngularJS scope method behind the per-employee button:
  //   <button ng-click="triggerEmployeeHistoryDownload('<guid>')">…
  const FN_NAME = 'triggerEmployeeHistoryDownload';

  // ───────────────── page-context runner (injected) ─────────────────
  // Tampermonkey runs in an isolated world; AngularJS scopes live in the page
  // world. We inject this runner so angular.element(el).scope() resolves against
  // the page's real Angular, then talk to it over window.postMessage.
  function pageRunner(FN_NAME) {
    var GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

    function post(type, payload) {
      window.postMessage({ source: 'uzioBot-page', type: type, payload: payload }, '*');
    }

    // ── network sniffer ───────────────────────────────────────────────
    // The download is delivered by a service method we can't read. Hook XHR +
    // fetch so that when a report is triggered we capture its exact URL/method,
    // which lets us re-issue it as an independent blob download.
    var netLog = [];
    function recordNet(info) { netLog.push(info); if (netLog.length > 60) netLog.shift(); }
    (function hookNet() {
      try {
        var XO = window.XMLHttpRequest;
        if (XO && XO.prototype && !XO.prototype.__uzioHooked) {
          var open = XO.prototype.open, send = XO.prototype.send;
          XO.prototype.open = function (method, url) {
            this.__uzio = { method: method, url: url, ts: Date.now(), via: 'xhr' };
            return open.apply(this, arguments);
          };
          XO.prototype.send = function (body) {
            var info = this.__uzio || { via: 'xhr' };
            try { info.body = (typeof body === 'string') ? body.slice(0, 400) : (body ? '[' + (body && body.constructor && body.constructor.name) + ']' : null); } catch (e) {}
            recordNet(info);
            var self = this;
            try {
              this.addEventListener('load', function () {
                try {
                  info.status = self.status;
                  info.cdisp = self.getResponseHeader && self.getResponseHeader('Content-Disposition');
                  info.ctype = self.getResponseHeader && self.getResponseHeader('Content-Type');
                } catch (e) {}
              });
            } catch (e) {}
            return send.apply(this, arguments);
          };
          XO.prototype.__uzioHooked = true;
        }
      } catch (e) {}
      try {
        if (window.fetch && !window.fetch.__uzioHooked) {
          var of = window.fetch;
          var nf = function (input, init) {
            var url = (typeof input === 'string') ? input : (input && input.url);
            var method = (init && init.method) || (input && input.method) || 'GET';
            recordNet({ method: method, url: url, ts: Date.now(), via: 'fetch' });
            return of.apply(this, arguments);
          };
          nf.__uzioHooked = true;
          window.fetch = nf;
        }
      } catch (e) {}
      // Hidden-form downloads (most common Angular file-download pattern).
      try {
        var FP = window.HTMLFormElement && window.HTMLFormElement.prototype;
        function hookFormFn(name) {
          if (!FP || !FP[name] || FP['__uzioHooked_' + name]) return;
          var orig = FP[name];
          FP[name] = function () {
            try {
              var inputs = {};
              Array.prototype.forEach.call(this.querySelectorAll('input,textarea,select'), function (el) {
                inputs[el.name || el.id || '?'] = String(el.value || '').slice(0, 80);
              });
              recordNet({ via: 'form.' + name, method: String(this.method || 'GET').toUpperCase(), url: this.action, target: this.target, body: JSON.stringify(inputs).slice(0, 400), ts: Date.now() });
            } catch (e) {}
            return orig.apply(this, arguments);
          };
          FP['__uzioHooked_' + name] = true;
        }
        hookFormFn('submit');
        hookFormFn('requestSubmit');
      } catch (e) {}
      // window.open downloads.
      try {
        if (window.open && !window.open.__uzioHooked) {
          var oopen = window.open;
          var nopen = function (url) { recordNet({ via: 'window.open', method: 'GET', url: url, ts: Date.now() }); return oopen.apply(this, arguments); };
          nopen.__uzioHooked = true;
          window.open = nopen;
        }
      } catch (e) {}
      // Temporary <a download> clicks.
      try {
        var AP = window.HTMLAnchorElement && window.HTMLAnchorElement.prototype;
        if (AP && AP.click && !AP.__uzioHookedClick) {
          var aclick = AP.click;
          AP.click = function () {
            try {
              if (this.href && (this.hasAttribute('download') || /blob:|data:|\.csv|\.xls|\.pdf|download|report|history|profile/i.test(this.href))) {
                recordNet({ via: 'a.click', method: 'GET', url: String(this.href).slice(0, 300), body: this.download ? 'download="' + this.download + '"' : '', ts: Date.now() });
              }
            } catch (e) {}
            return aclick.apply(this, arguments);
          };
          AP.__uzioHookedClick = true;
        }
      } catch (e) {}
      // iframe.src navigations (hidden-iframe download pattern).
      try {
        var IFP = window.HTMLIFrameElement && window.HTMLIFrameElement.prototype;
        var sd = IFP && Object.getOwnPropertyDescriptor(IFP, 'src');
        if (IFP && sd && sd.set && sd.get && !IFP.__uzioHookedSrc) {
          Object.defineProperty(IFP, 'src', {
            configurable: true, enumerable: sd.enumerable,
            get: function () { return sd.get.call(this); },
            set: function (v) { try { recordNet({ via: 'iframe.src', method: 'GET', url: String(v).slice(0, 300), ts: Date.now() }); } catch (e) {} return sd.set.call(this, v); }
          });
          IFP.__uzioHookedSrc = true;
        }
      } catch (e) {}
      // Element.setAttribute('src', …) on iframes (covers attr-based set).
      try {
        var EP = window.Element && window.Element.prototype;
        if (EP && EP.setAttribute && !EP.__uzioHookedSetAttr) {
          var osa = EP.setAttribute;
          EP.setAttribute = function (name, value) {
            try {
              if (this.tagName === 'IFRAME' && String(name).toLowerCase() === 'src') {
                recordNet({ via: 'iframe.setAttribute', method: 'GET', url: String(value).slice(0, 300), ts: Date.now() });
              }
            } catch (e) {}
            return osa.apply(this, arguments);
          };
          EP.__uzioHookedSetAttr = true;
        }
      } catch (e) {}
      // PerformanceObserver — catches EVERY resource the browser fetches no
      // matter how it was triggered (location.href, iframe, form, img, …).
      // Filter to download-ish URLs to keep the log readable.
      try {
        if (window.PerformanceObserver && !window.__uzioPerfHooked) {
          var po = new window.PerformanceObserver(function (list) {
            list.getEntries().forEach(function (en) {
              var it = en.initiatorType || '';
              var url = en.name || '';
              var interesting =
                /report|download|export|history|profile|audit|\.csv|\.xls|\.pdf|\.zip|\.doc/i.test(url) ||
                it === 'iframe' || it === 'other' || it === 'navigation' || it === 'object' || it === 'embed' || it === 'form';
              if (interesting) recordNet({ via: 'perf:' + it, method: '-', url: String(url).slice(0, 300), ts: Date.now() });
            });
          });
          po.observe({ entryTypes: ['resource'] });
          window.__uzioPerfHooked = true;
        }
      } catch (e) {}
    })();

    function ng() { return window.angular || null; }

    // Find a row's actual "Download Employee Profile Change Report" button by GUID.
    function findDownloadButton(guid) {
      var all = document.querySelectorAll('[ng-click*="' + FN_NAME + '"]');
      for (var i = 0; i < all.length; i++) {
        var oc = all[i].getAttribute('ng-click') || '';
        if (oc.indexOf(guid) >= 0) return all[i];
      }
      return null;
    }

    // Drive the real UI: open the row's ⋮ actions menu, click the real download
    // button (a genuine gesture path), then close the menu. Returns true if the
    // button was found and clicked.
    function downloadViaUI(guid) {
      var btn = findDownloadButton(guid);
      if (!btn) return false;
      var menu = btn.closest('.action-menu');
      var toggle = menu && menu.querySelector('.hc-three-dots, [data-toggle="dropdown"]');
      // Open the dropdown so the item is the active, visible target.
      if (toggle) { try { toggle.click(); } catch (e) {} }
      try { btn.click(); } catch (e) {}
      // Close the dropdown again to leave the UI tidy for the next row.
      if (toggle) { setTimeout(function () { try { toggle.click(); } catch (e) {} }, 150); }
      return true;
    }

    // Locate a scope that actually exposes the download function.
    function findFnScope() {
      var a = ng(); if (!a) return null;
      var direct = document.querySelector('[ng-click*="' + FN_NAME + '"]');
      if (direct) {
        try { var s = a.element(direct).scope(); if (s && typeof s[FN_NAME] === 'function') return s; } catch (e) {}
      }
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var sc; try { sc = a.element(all[i]).scope(); } catch (e) { continue; }
        if (sc && typeof sc[FN_NAME] === 'function') return sc;
      }
      return null;
    }

    // Pull the GUID out of a row's data object (any string property shaped like a GUID).
    function guidOf(obj) {
      if (!obj || typeof obj !== 'object') return null;
      for (var k in obj) {
        try { if (typeof obj[k] === 'string' && GUID_RE.test(obj[k].trim())) return obj[k].trim(); } catch (e) {}
      }
      return null;
    }

    // Find the employee-like object hanging off a row scope (depth <= 2).
    function rowObject(scope) {
      if (!scope) return null;
      function scan(o, depth) {
        if (!o || typeof o !== 'object' || depth > 2) return null;
        if (guidOf(o)) return o;
        for (var k in o) {
          if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
          if (k.charAt(0) === '$') continue;
          var v;
          try { v = o[k]; } catch (e) { continue; }
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            var hit = scan(v, depth + 1);
            if (hit) return hit;
          }
        }
        return null;
      }
      // check own props of the scope itself
      for (var k in scope) {
        if (!Object.prototype.hasOwnProperty.call(scope, k)) continue;
        if (k.charAt(0) === '$') continue;
        var v; try { v = scope[k]; } catch (e) { continue; }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          var hit = scan(v, 1);
          if (hit) return hit;
        }
      }
      return null;
    }

    // Collect a row's per-cell text values. The grid renders each column as its
    // own <td>; the Employee ID is a cell of its own (e.g. "VBP8L5UJZ"), so
    // cell-level exact matching beats whole-row text (cells concatenate with no
    // separators, which merges the ID into its neighbours).
    function cellsOf(rowEl) {
      var cells = [];
      if (!rowEl || !rowEl.querySelectorAll) return cells;
      var tds = rowEl.querySelectorAll('td');
      Array.prototype.forEach.call(tds, function (td) {
        var t = (td.textContent || '').trim();
        if (t) cells.push(t);
      });
      return cells;
    }

    // Build an index of every employee row visible on the page:
    //   { guid, obj, cells, text }
    function buildIndex() {
      var a = ng();
      var rows = [];
      var seenGuid = {};

      // Primary: rows that already have a rendered download button (GUID is authoritative).
      var btns = Array.prototype.slice.call(document.querySelectorAll('[ng-click*="' + FN_NAME + '"]'));
      btns.forEach(function (btn) {
        var m = (btn.getAttribute('ng-click') || '').match(/['"]([^'"]+)['"]/);
        var guid = m ? m[1].trim() : null;
        var rowEl = btn.closest('tr') || btn.closest('[ng-repeat]') || btn.closest('li') || btn.parentElement;
        var obj = null;
        if (a && rowEl) { try { obj = rowObject(a.element(rowEl).scope()); } catch (e) {} }
        if (!guid && obj) guid = guidOf(obj);
        if (guid && !seenGuid[guid]) {
          seenGuid[guid] = true;
          rows.push({ guid: guid, obj: obj, cells: cellsOf(rowEl), text: rowEl ? (rowEl.textContent || '') : '' });
        }
      });

      // Secondary: ng-repeat / table rows whose data object carries a GUID
      // (covers grids where the action button isn't rendered until its menu opens).
      if (a) {
        var rowEls = Array.prototype.slice.call(document.querySelectorAll('[ng-repeat], [data-ng-repeat], tr'));
        rowEls.forEach(function (rowEl) {
          var obj; try { obj = rowObject(a.element(rowEl).scope()); } catch (e) { return; }
          var guid = guidOf(obj);
          if (guid && !seenGuid[guid]) {
            seenGuid[guid] = true;
            rows.push({ guid: guid, obj: obj, cells: cellsOf(rowEl), text: rowEl.textContent || '' });
          }
        });
      }

      return rows;
    }

    // Resolve a user token (visible Employee ID or a raw GUID) to a GUID.
    function resolveToken(token, index) {
      var t = String(token).trim();
      if (!t) return null;
      if (GUID_RE.test(t)) return { guid: t, label: t, via: 'guid' };
      var low = t.toLowerCase();
      for (var i = 0; i < index.length; i++) {
        var row = index[i];
        // a) exact match on an individual grid cell (the Employee ID is its own <td>)
        if (row.cells) {
          for (var c = 0; c < row.cells.length; c++) {
            if (row.cells[c].trim().toLowerCase() === low) {
              return { guid: row.guid, label: t, via: 'cell' };
            }
          }
        }
        // b) exact match on any string field of the row data object
        if (row.obj) {
          for (var k in row.obj) {
            var v; try { v = row.obj[k]; } catch (e) { continue; }
            if (typeof v === 'string' && v.trim().toLowerCase() === low) {
              return { guid: row.guid, label: t, via: 'field' };
            }
          }
        }
        // c) substring fallback in the whole-row text
        if (row.text && row.text.toLowerCase().indexOf(low) >= 0) {
          return { guid: row.guid, label: t, via: 'text' };
        }
      }
      return null;
    }

    function resolveAll(tokens) {
      var index = buildIndex();
      var resolved = [], unresolved = [];
      tokens.forEach(function (tok) {
        var r = resolveToken(tok, index);
        if (r) resolved.push({ token: tok, guid: r.guid, via: r.via });
        else unresolved.push(tok);
      });
      return { indexSize: index.length, resolved: resolved, unresolved: unresolved };
    }

    // ── diagnostics (Inspect) ─────────────────────────────────────────
    function truncate(s, n) {
      s = String(s == null ? '' : s);
      return s.length > n ? s.slice(0, n) + ' …[+' + (s.length - n) + ' chars]' : s;
    }

    // Flatten an object's primitive fields up to depth 2 — reveals which key
    // holds the visible Employee ID and which holds the GUID.
    function objDump(o) {
      if (!o || typeof o !== 'object') return '(null)';
      var lines = [];
      function walk(obj, prefix, depth) {
        if (depth > 2) return;
        for (var k in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
          if (k.charAt(0) === '$') continue;
          var v; try { v = obj[k]; } catch (e) { continue; }
          var t = typeof v;
          if (v === null || t === 'string' || t === 'number' || t === 'boolean') {
            lines.push(prefix + k + ' = ' + truncate(String(v), 80));
          } else if (Array.isArray(v)) {
            lines.push(prefix + k + ' = [array len ' + v.length + ']');
          } else if (t === 'object') {
            walk(v, prefix + k + '.', depth + 1);
          }
        }
      }
      walk(o, '', 1);
      return lines.length ? '\n    ' + lines.join('\n    ') : '(no primitive fields)';
    }

    function inspect(ids) {
      var a = ng();
      var out = [];
      out.push('=== UZIO Inspect ===');
      out.push('url: ' + location.href);
      out.push('angular present: ' + (!!a));

      var btns = document.querySelectorAll('[ng-click*="' + FN_NAME + '"]');
      out.push('download buttons (' + FN_NAME + ') in DOM: ' + btns.length);
      if (btns.length) {
        out.push('--- first download button outerHTML ---');
        out.push(truncate(btns[0].outerHTML, 1500));
        var btnTr = btns[0].closest('tr');
        if (btnTr) { out.push('--- that button\'s <tr> outerHTML ---'); out.push(truncate(btnTr.outerHTML, 3500)); }
      }

      // Find the <tr> whose visible text contains the first requested Employee ID.
      var firstId = (ids && ids[0] ? String(ids[0]) : '').toLowerCase();
      var trs = document.querySelectorAll('tr');
      var matchTr = null;
      if (firstId) {
        for (var i = 0; i < trs.length; i++) {
          var cells = cellsOf(trs[i]).map(function (c) { return c.toLowerCase(); });
          if (cells.indexOf(firstId) >= 0) { matchTr = trs[i]; break; }
        }
      }
      out.push('total <tr> on page: ' + trs.length);
      if (matchTr) {
        out.push('--- <tr> containing "' + ids[0] + '" outerHTML ---');
        out.push(truncate(matchTr.outerHTML, 4500));
        if (a) {
          try {
            var sc = a.element(matchTr).scope();
            out.push('--- matched <tr> scope.$id=' + (sc && sc.$id) + ' own object fields ---');
            out.push(objDump(rowObject(sc) || sc));
          } catch (e) { out.push('scope read failed: ' + e); }
        }
      } else {
        out.push('No <tr> text-contains "' + (ids && ids[0]) + '".');
      }

      // Dump the download function's source so we can see how it delivers the
      // file (location.href vs iframe vs window.open vs $http+blob).
      var fnScope = findFnScope();
      if (fnScope && typeof fnScope[FN_NAME] === 'function') {
        out.push('--- ' + FN_NAME + ' source ---');
        out.push(truncate(fnScope[FN_NAME].toString(), 4000));
      } else {
        out.push('--- ' + FN_NAME + ' source: scope/function NOT found ---');
      }

      // The scope method is a thin wrapper (function(e){o.X(e)}). Walk the
      // controller object(s) reachable from the scope to find the REAL
      // implementation whose body contains the download URL.
      out.push('--- real ' + FN_NAME + ' implementation(s) found by walking scope ---');
      try {
        var impls = [];
        var visited = [];
        function consider(obj, path, depth) {
          if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return;
          if (visited.indexOf(obj) >= 0) return;
          visited.push(obj);
          if (visited.length > 800 || depth > 4) return;
          for (var k in obj) {
            if (k.charAt(0) === '$') continue;
            var v; try { v = obj[k]; } catch (e) { continue; }
            if (typeof v === 'function') {
              if (k === FN_NAME) {
                var src = ''; try { src = v.toString(); } catch (e) {}
                // Skip the trivial wrapper; keep anything with a URL/real body.
                if (src && src.length > 60) impls.push(path + '.' + k + ' ::\n' + truncate(src, 1500));
              }
            } else if (v && typeof v === 'object') {
              consider(v, path + '.' + k, depth + 1);
            }
          }
        }
        var fs = findFnScope();
        if (fs) {
          consider(fs, 'scope', 0);
          // also walk the controller of any ng-controller ancestor
          var ctrlEl = document.querySelector('[ng-controller]');
          if (a && ctrlEl) {
            try { var ctrl = a.element(ctrlEl).controller(); if (ctrl) consider(ctrl, 'controller', 0); } catch (e) {}
          }
        }
        if (impls.length) { impls.forEach(function (s) { out.push(s); }); }
        else { out.push('(none reachable — the impl lives in a closure var; will hook location instead)'); }
      } catch (e) { out.push('impl-walk error: ' + e); }

      // Recent network requests — used to identify the real download endpoint.
      out.push('--- recent network requests (last 20) ---');
      if (!netLog.length) {
        out.push('(none captured yet — trigger ONE download, then click Inspect again)');
      } else {
        netLog.slice(-20).forEach(function (n) {
          out.push((n.via || '') + ' ' + (n.method || '') + ' ' + (n.url || '') +
            (n.status ? ' [' + n.status + ']' : '') +
            (n.ctype ? ' ctype=' + n.ctype : '') +
            (n.cdisp ? ' cdisp=' + n.cdisp : ''));
        });
      }

      var idx = buildIndex();
      out.push('--- buildIndex() rows: ' + idx.length + ' (first 3) ---');
      idx.slice(0, 3).forEach(function (r, n) {
        out.push('row#' + n + ' guid=' + r.guid);
        out.push('  text: ' + truncate((r.text || '').replace(/\s+/g, ' ').trim(), 160));
        out.push('  obj:' + objDump(r.obj));
      });

      return out.join('\n');
    }

    var running = false;

    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.source !== 'uzioBot-cs') return;

      if (d.type === 'stop') { running = false; return; }

      if (d.type === 'scan') {
        var res = resolveAll(d.ids || []);
        post('resolved', res);
        return;
      }

      if (d.type === 'inspect') {
        var report;
        try { report = inspect(d.ids || []); }
        catch (e) { report = 'Inspect error: ' + (e && e.message ? e.message : e); }
        post('inspect', report);
        return;
      }

      if (d.type === 'trace') {
        var rr = resolveAll(d.ids || []);
        if (!rr.resolved.length) { post('inspect', 'TRACE: no resolved Employee ID to trigger. Paste one valid ID first.'); return; }
        var tscope = findFnScope();
        if (!tscope) { post('inspect', 'TRACE: download scope/function not found.'); return; }
        var startLen = netLog.length;
        var tguid = rr.resolved[0].guid;
        post('log', 'TRACE: triggering ' + rr.resolved[0].token + ' → ' + tguid + ', watching network for 9s…');
        try { tscope.$apply(function () { tscope[FN_NAME](tguid); }); }
        catch (e) { try { tscope[FN_NAME](tguid); } catch (e2) {} }
        setTimeout(function () {
          var nw = netLog.slice(startLen);
          var lines = ['=== TRACE: ' + nw.length + ' new network event(s) after triggering ' + tguid + ' ==='];
          nw.forEach(function (n) {
            lines.push((n.via || '') + ' ' + (n.method || '') + ' ' + (n.url || '') +
              (n.status ? ' [' + n.status + ']' : '') +
              (n.target ? ' target=' + n.target : '') +
              (n.ctype ? ' ctype=' + n.ctype : '') +
              (n.cdisp ? ' cdisp=' + n.cdisp : '') +
              (n.body ? ' body=' + n.body : ''));
          });
          if (!nw.length) {
            lines.push('(NO network event captured — delivery uses an un-hooked channel, e.g. document.location assignment.)');
          }
          post('inspect', lines.join('\n'));
        }, 9000);
        return;
      }

      if (d.type !== 'start') return;
      if (running) { post('log', 'Already running — ignoring Start.'); return; }
      running = true;

      var res2 = resolveAll(d.ids || []);
      post('resolved', res2);

      if (!res2.resolved.length) {
        post('error', 'None of the pasted Employee IDs matched a row on this page. Make sure the matching employees are visible in the grid.');
        running = false; post('done'); return;
      }

      var list = res2.resolved;
      var delay = d.delay || 5000;
      post('log', 'Downloading ' + list.length + ' report(s) by clicking each row button, ' + delay + 'ms apart.');
      post('log', 'NOTE: each file is delivered by a page navigation, so they MUST be spaced out. If some are skipped, raise the Delay and re-run just those.');

      var i = 0;
      function next() {
        if (!running) { post('log', 'Stopped at ' + i + '/' + list.length + '.'); post('done'); return; }
        if (i >= list.length) { post('log', 'All ' + list.length + ' report(s) triggered.'); running = false; post('done'); return; }
        var item = list[i];
        var clicked = downloadViaUI(item.guid);
        if (clicked) post('log', '[' + (i + 1) + '/' + list.length + '] clicked ' + item.token + ' → ' + item.guid);
        else post('error', '[' + (i + 1) + '/' + list.length + '] button not found for ' + item.token + ' (' + item.guid + ') — is the row visible?');
        i++;
        setTimeout(next, delay);
      }
      next();
    });

    post('ready', {});
  }

  function injectRunner() {
    var s = document.createElement('script');
    s.textContent = '(' + pageRunner.toString() + ')(' + JSON.stringify(FN_NAME) + ');';
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }

  // ───────────────── content-script UI + messaging ─────────────────

  let logEl, statusEl, startBtn, scanBtn, inspectBtn, traceBtn;

  function log(kind, text) {
    if (!logEl) return;
    const colors = { info: '#ddd', ok: '#7CFC9B', err: '#ff7b7b', warn: '#ffd479' };
    const line = document.createElement('div');
    line.style.cssText = 'white-space:pre-wrap;word-break:break-word;line-height:1.35;color:' + (colors[kind] || '#ddd') + ';';
    line.textContent = new Date().toLocaleTimeString('en-US', { hour12: false }) + '  ' + text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  function parseIds(raw) {
    return raw.split(/[\s,;\n\r\t]+/).map(s => s.trim()).filter(Boolean);
  }

  function reportResolution(res) {
    log('info', 'Scanned grid: ' + res.indexSize + ' employee row(s) found.');
    if (res.resolved.length) {
      log('ok', 'Matched ' + res.resolved.length + ':');
      res.resolved.forEach(r => log('ok', '  ' + r.token + ' → ' + r.guid + '  (' + r.via + ')'));
    }
    if (res.unresolved.length) {
      log('warn', 'No match for ' + res.unresolved.length + ' (not on the visible grid?):');
      log('warn', '  ' + res.unresolved.join(', '));
    }
  }

  window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d || d.source !== 'uzioBot-page') return;
    if (d.type === 'ready') { log('info', 'Ready. Paste IDs and Scan.'); return; }
    if (d.type === 'log') { log('info', d.payload); return; }
    if (d.type === 'error') { log('err', d.payload); setStatus('Error — see log'); return; }
    if (d.type === 'resolved') { reportResolution(d.payload); return; }
    if (d.type === 'inspect') {
      const text = d.payload || '';
      console.log('%c[UZIO Inspect]\n' + text, 'color:#3b82f6');
      try {
        navigator.clipboard.writeText(text).then(
          () => log('ok', 'Inspect report copied to clipboard — paste it back to me.'),
          () => log('warn', 'Could not copy automatically — see DevTools console ([UZIO Inspect]).')
        );
      } catch (e) {
        log('warn', 'Clipboard blocked — open DevTools console and copy the [UZIO Inspect] block.');
      }
      // Also dump into the panel log so it is visible/selectable.
      text.split('\n').forEach(ln => log('info', ln));
      setStatus('Inspect done — report copied / in console.');
      return;
    }
    if (d.type === 'done') {
      setStatus('Done.');
      if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start Downloads'; }
    }
  });

  function buildPanel() {
    if (document.getElementById('uzio-bot-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'uzio-bot-panel';
    panel.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647', 'width:360px',
      'background:#1f2430', 'color:#e8e8e8', 'font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif',
      'border:1px solid #3a4150', 'border-radius:10px', 'box-shadow:0 6px 24px rgba(0,0,0,.4)', 'overflow:hidden'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'background:#2b3242;padding:9px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;cursor:move;';
    header.innerHTML = '<span>UZIO • Bulk History Reports</span>';
    const collapse = document.createElement('span');
    collapse.textContent = '–';
    collapse.style.cssText = 'cursor:pointer;padding:0 6px;user-select:none;';
    header.appendChild(collapse);

    const body = document.createElement('div');
    body.style.cssText = 'padding:12px;';

    const help = document.createElement('div');
    help.style.cssText = 'color:#9aa4b2;margin-bottom:8px;';
    help.textContent = 'On the Employees grid, paste visible Employee IDs (e.g. VBP8L5UJZ), comma/newline separated. Click Scan to verify, then Start.';

    const ta = document.createElement('textarea');
    ta.placeholder = 'VBP8L5UJZ, J91PS1JQ0, H7UX37MD4';
    ta.style.cssText = 'width:100%;height:80px;box-sizing:border-box;background:#141821;color:#e8e8e8;border:1px solid #3a4150;border-radius:6px;padding:8px;resize:vertical;font:12px monospace;';

    const delayRow = document.createElement('div');
    delayRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;';
    const delayLabel = document.createElement('label');
    delayLabel.textContent = 'Delay (ms):';
    delayLabel.style.cssText = 'color:#9aa4b2;';
    const delayInput = document.createElement('input');
    delayInput.type = 'number'; delayInput.value = '5000'; delayInput.min = '500'; delayInput.step = '500';
    delayInput.style.cssText = 'width:90px;background:#141821;color:#e8e8e8;border:1px solid #3a4150;border-radius:6px;padding:4px 6px;';
    delayRow.appendChild(delayLabel); delayRow.appendChild(delayInput);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;';
    inspectBtn = document.createElement('button');
    inspectBtn.textContent = 'Inspect';
    inspectBtn.title = 'Dump the employee row outerHTML + data fields so the mapping can be fixed';
    inspectBtn.style.cssText = 'background:#0d9488;color:#fff;border:0;border-radius:6px;padding:8px 10px;font-weight:600;cursor:pointer;';
    traceBtn = document.createElement('button');
    traceBtn.textContent = 'Trace 1 DL';
    traceBtn.title = 'Trigger ONE download for the first ID and capture exactly what network/iframe it uses';
    traceBtn.style.cssText = 'background:#9333ea;color:#fff;border:0;border-radius:6px;padding:8px 10px;font-weight:600;cursor:pointer;';
    scanBtn = document.createElement('button');
    scanBtn.textContent = 'Scan & Resolve';
    scanBtn.style.cssText = 'background:#6b7280;color:#fff;border:0;border-radius:6px;padding:8px 10px;font-weight:600;cursor:pointer;';
    startBtn = document.createElement('button');
    startBtn.textContent = 'Start Downloads';
    startBtn.style.cssText = 'flex:1;background:#3b82f6;color:#fff;border:0;border-radius:6px;padding:8px;font-weight:600;cursor:pointer;';
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.style.cssText = 'background:#ef4444;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer;';
    btnRow.appendChild(inspectBtn); btnRow.appendChild(traceBtn); btnRow.appendChild(scanBtn); btnRow.appendChild(startBtn); btnRow.appendChild(stopBtn);

    statusEl = document.createElement('div');
    statusEl.style.cssText = 'color:#9aa4b2;margin-bottom:6px;min-height:16px;';
    statusEl.textContent = 'Idle.';

    logEl = document.createElement('div');
    logEl.style.cssText = 'background:#0f131b;border:1px solid #2a313e;border-radius:6px;padding:8px;height:150px;overflow:auto;font:11px monospace;';

    body.appendChild(help); body.appendChild(ta); body.appendChild(delayRow);
    body.appendChild(btnRow); body.appendChild(statusEl); body.appendChild(logEl);
    panel.appendChild(header); panel.appendChild(body);
    document.body.appendChild(panel);

    collapse.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      collapse.textContent = hidden ? '–' : '+';
    });

    (function makeDraggable() {
      let dx = 0, dy = 0, dragging = false;
      header.addEventListener('mousedown', (e) => {
        if (e.target === collapse) return;
        dragging = true; dx = e.clientX - panel.offsetLeft; dy = e.clientY - panel.offsetTop; e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - dx) + 'px'; panel.style.top = (e.clientY - dy) + 'px';
        panel.style.right = 'auto'; panel.style.bottom = 'auto';
      });
      document.addEventListener('mouseup', () => { dragging = false; });
    })();

    inspectBtn.addEventListener('click', () => {
      const ids = parseIds(ta.value);
      logEl.innerHTML = '';
      setStatus('Inspecting…');
      log('info', 'Inspecting page (paste at least one ID to target a specific row)…');
      window.postMessage({ source: 'uzioBot-cs', type: 'inspect', ids: ids }, '*');
    });

    traceBtn.addEventListener('click', () => {
      const ids = parseIds(ta.value);
      if (!ids.length) { log('warn', 'Paste one Employee ID to trace.'); return; }
      logEl.innerHTML = '';
      setStatus('Tracing one download…');
      log('info', 'Trace: triggering one download and watching network for ~7s…');
      window.postMessage({ source: 'uzioBot-cs', type: 'trace', ids: ids }, '*');
    });

    scanBtn.addEventListener('click', () => {
      const ids = parseIds(ta.value);
      if (!ids.length) { log('warn', 'Paste at least one Employee ID.'); return; }
      logEl.innerHTML = '';
      setStatus('Scanning…');
      window.postMessage({ source: 'uzioBot-cs', type: 'scan', ids: ids }, '*');
    });

    startBtn.addEventListener('click', () => {
      const ids = parseIds(ta.value);
      if (!ids.length) { setStatus('No IDs entered.'); log('warn', 'Paste at least one Employee ID.'); return; }
      let delay = parseInt(delayInput.value, 10);
      if (isNaN(delay) || delay < 500) delay = 3000;
      logEl.innerHTML = '';
      log('info', 'Resolving + downloading ' + ids.length + ' employee(s)…');
      setStatus('Running…');
      startBtn.disabled = true; startBtn.textContent = 'Running…';
      window.postMessage({ source: 'uzioBot-cs', type: 'start', ids: ids, delay: delay }, '*');
    });

    stopBtn.addEventListener('click', () => {
      window.postMessage({ source: 'uzioBot-cs', type: 'stop' }, '*');
      setStatus('Stopping…'); log('warn', 'Stop requested.');
      startBtn.disabled = false; startBtn.textContent = 'Start Downloads';
    });
  }

  // ───────────────── init ─────────────────
  injectRunner();
  if (document.body) buildPanel();
  else document.addEventListener('DOMContentLoaded', buildPanel);
})();
