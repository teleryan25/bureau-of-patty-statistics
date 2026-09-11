/* =============================================================
   Bureau of Patty Statistics — public-site.js

   The public website (pattybureau.com). Rendering and interaction only.
   Every figure comes from public-register.js, which runs the auditor
   app's own scoring.js and analytics.js over the public-safe register
   served by /api/public/register. Nothing here computes a score, a
   weight or an order; it formats what those modules return.
   ============================================================= */
(function () {
  'use strict';

  var BPS = window.BPS || {};
  var S = BPS.scoring;
  var PR = BPS.publicRegister;

  var ENDPOINT = '/api/public/register';
  var STALE_AFTER_MS = 5 * 60 * 1000;

  var BASES = S ? Object.keys(S.RANKING_BASES) : [];
  var BASIS_TITLES = { overall: 'Composite Patty Index', 'burger-quality': 'Burger Quality Index', fries: 'Fries' };
  var BASIS_ROLES = { overall: 'Overall leader', 'burger-quality': 'Best burger', fries: 'Best fries' };
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  /* Table 4 swatches: one quiet ramp; Service, the derived one, set apart. */
  var TONES = { patty: '#00684a', overallFlavor: '#15845f', bun: '#3c9f79', fries: '#6fba98',
                value: '#9ed1b8', condiments: '#cbe8d9', service: '#1c2d38' };

  var state = {
    register: null,
    summary: null,
    global: null,
    byBasis: {},
    options: null,
    findings: null,
    cutoff: null,
    filter: { basis: 'overall', location: null, area: null, category: null },
    fetchedAt: 0,
    fileId: null,
    fileTrigger: null,
    filePushed: false,
    baseTitle: document.title
  };

  /* ---------- tiny DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function h(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null || child === false) continue;
      parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return parent;
  }
  function option(value, label) { var o = h('option', null, label); o.value = value; return o; }
  function fileButton(id, name, className) {
    var b = h('button', className || 'file-link', name);
    b.type = 'button';
    b.dataset.file = id;
    return b;
  }

  /* ---------- wording helpers ---------- */
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function words(n) { return n >= 0 && n < WORDS.length ? WORDS[n] : String(n); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function count(n, one, many) { return n + ' ' + plural(n, one, many); }
  function f1(n) { return S.formatScore(n); }
  function f2(n) { return n == null || !isFinite(n) ? '—' : S.roundTo(n, 2).toFixed(2); }
  function scoreText(basis, value) { return basis.scale === 100 ? S.formatCPI(value) : S.formatScore(value); }
  /* Difference of the two DISPLAYED figures, so the prose agrees with the table. */
  function shownGap(a, b) { return S.roundTo(S.roundTo(a, 1) - S.roundTo(b, 1), 1).toFixed(1); }
  function listPhrase(items) {
    if (!items || !items.length) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  function locationsPhrase(list) {
    if (!list || !list.length) return 'no recorded location';
    return list.length <= 2 ? listPhrase(list) : list.length + ' locations';
  }
  function dayDate(day, month) {
    if (!day) return '—';
    var d = new Date(day + 'T12:00:00Z');
    return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: month || 'long', day: 'numeric', timeZone: 'UTC' });
  }
  function stampTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  }

  /* =============================================================
     METHODOLOGY — generated from scoring.js, never typed in
     ============================================================= */
  function bind(name, text) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bind="' + name + '"]'), function (node) {
      node.textContent = text;
    });
  }

  function bqShare(key) { return S.BURGER_QUALITY_WEIGHTS[key] / S.BURGER_QUALITY_WEIGHT_TOTAL * 100; }

  function renderMethodology() {
    bind('min-examiners', words(S.CERTIFICATION_MIN_AUDITORS));
    bind('scale', S.formatScore(S.SCALE.min) + ' to ' + S.formatScore(S.SCALE.max));
    bind('service-parts', listPhrase(S.SERVICE_SUBSCORES.map(function (c) { return c.label; })));
    bind('bq-weights', listPhrase(Object.keys(S.BURGER_QUALITY_WEIGHTS).map(function (key) {
      return S.categoryLabel(key) + ' (' + S.SCORING_WEIGHTS[key] + ' ÷ ' + S.BURGER_QUALITY_WEIGHT_TOTAL +
        ' = ' + f1(bqShare(key)) + '%)';
    })));

    var body = $('weights-table').tBodies[0];
    var bar = $('weightbar');
    body.replaceChildren();
    bar.replaceChildren();
    var bqTotal = 0;
    S.CATEGORIES.forEach(function (c) {
      var tr = h('tr');
      var th = h('th');
      th.scope = 'row';
      var sw = h('span', 'swatch');
      sw.style.background = TONES[c.key] || '#5c6c75';
      add(th, sw, c.label);
      if (c.derived) {
        add(th, h('span', 'dt__sub', 'Derived: mean of ' + listPhrase(S.SERVICE_SUBSCORES.map(function (s) { return s.label; }))));
      }
      var inBq = S.BURGER_QUALITY_WEIGHTS[c.key] != null;
      if (inBq) bqTotal += bqShare(c.key);
      add(tr, th, h('td', 'num', S.SCORING_WEIGHTS[c.key] + '%'), h('td', 'num', inBq ? f1(bqShare(c.key)) + '%' : '—'));
      body.appendChild(tr);

      var seg = h('span', 'weightbar__seg');
      seg.style.flex = S.SCORING_WEIGHTS[c.key] + ' 0 0';
      seg.style.background = TONES[c.key] || '#5c6c75';
      seg.title = c.label + ': ' + S.SCORING_WEIGHTS[c.key] + '%';
      bar.appendChild(seg);
    });
    var foot = $('weights-table').tFoot;
    foot.replaceChildren(add(h('tr'), h('th', null, 'Total'), h('td', 'num', S.weightsTotal() + '%'), h('td', 'num', f1(bqTotal) + '%')));

    /* Illustration 1, computed by the scoring module itself. */
    function flat(value) {
      var scores = { locationId: 'illustration', burger: 'Illustrative Burger' };
      S.INPUT_KEYS.forEach(function (k) { scores[k] = value; });
      return scores;
    }
    function index(scores) { return S.calculateWeightedReviewerScore(S.withService(scores)) * 10; }
    var examinerA = [flat(8.0), flat(8.4), flat(8.8)];
    var examinerB = [flat(9.0)];
    var meanA = S.calculateWeightedReviewerScore(S.meanScoreSet(examinerA)) * 10;
    var meanB = S.calculateWeightedReviewerScore(S.meanScoreSet(examinerB)) * 10;
    var official = S.calculateCPI([S.meanScoreSet(examinerA), S.meanScoreSet(examinerB)]);
    var all = examinerA.concat(examinerB).map(index);
    var pooled = all.reduce(function (a, b) { return a + b; }, 0) / all.length;
    function row(who, audits, mean) {
      return add(h('div', 'illus__row'), h('p', 'illus__who', who),
        h('p', 'illus__audits', audits.map(function (a) { return S.formatCPI(index(a)); }).join(' · ')),
        h('p', 'illus__mean', S.formatCPI(mean)));
    }
    $('illustration-body').replaceChildren(add(h('div', 'illus'),
      row('Examiner A · three audits', examinerA, meanA),
      row('Examiner B · one audit', examinerB, meanB)),
      h('p', 'eq eq--official', 'CPI = (' + S.formatCPI(meanA) + ' + ' + S.formatCPI(meanB) + ') ÷ 2 = ' + S.formatCPI(official)),
      h('p', 'eq eq--rejected', '(' + all.map(S.formatCPI).join(' + ') + ') ÷ ' + all.length + ' = ' + S.formatCPI(pooled)),
      h('p', 'illus__moral', 'Examiner A does not receive three votes for eating three times.'));
  }

  /* =============================================================
     URL <-> filter
     ============================================================= */
  function readUrl() {
    var p = new URLSearchParams(window.location.search);
    var basis = p.get('basis');
    state.filter.basis = S.RANKING_BASES[basis] ? basis : 'overall';
    state.filter.location = p.get('location') || null;
    state.filter.area = state.filter.location ? null : (p.get('area') || null);
    state.filter.category = p.get('class') || null;
  }

  function writeUrl() {
    var p = new URLSearchParams(window.location.search);
    ['basis', 'location', 'area', 'class'].forEach(function (k) { p.delete(k); });
    var f = state.filter;
    if (f.basis !== 'overall') p.set('basis', f.basis);
    if (f.location) p.set('location', f.location);
    if (f.area) p.set('area', f.area);
    if (f.category) p.set('class', f.category);
    var q = p.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
  }

  /* A shared link may name a filter the register no longer supports. */
  function validateFilter() {
    var f = state.filter, o = state.options;
    var locations = [], areas = [];
    o.locationGroups.forEach(function (g) {
      if (g.area) areas.push(g.area.key);
      g.locations.forEach(function (l) { locations.push(l.id); });
    });
    if (f.location && locations.indexOf(f.location) === -1) f.location = null;
    if (f.area && areas.indexOf(f.area) === -1) f.area = null;
    if (f.category && !o.categories.some(function (c) { return c.key === f.category; })) f.category = null;
  }

  function filterActive() { var f = state.filter; return !!(f.location || f.area || f.category); }

  function filterPlace() {
    var f = state.filter, name = null;
    state.options.locationGroups.forEach(function (g) {
      if (f.area && g.area && g.area.key === f.area) name = 'anywhere in ' + g.area.label;
      g.locations.forEach(function (l) { if (l.id === f.location) name = l.name; });
    });
    return name;
  }

  function filterClass() {
    var hit = state.options.categories.filter(function (c) { return c.key === state.filter.category; })[0];
    return hit ? hit.label : null;
  }

  /* =============================================================
     DATA
     ============================================================= */
  function load(silent) {
    return fetch(ENDPOINT, { headers: { accept: 'application/json' }, cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.register || !payload.summary) throw new Error('Malformed register');
        accept(payload);
      })
      .catch(function (err) {
        if (window.console) console.warn('[BPS] The public register could not be consulted:', err && err.message);
        if (!silent || !state.register) showUnavailable();
      });
  }

  function accept(payload) {
    state.register = payload.register;
    state.summary = payload.summary;
    state.fetchedAt = Date.now();
    state.byBasis = {};
    BASES.forEach(function (key) { state.byBasis[key] = PR.rankings(state.register, { basis: key }); });
    state.global = state.byBasis.overall.metrics;
    state.options = PR.filterOptions(state.register);
    state.findings = PR.findings(state.global);
    state.cutoff = PR.movementCutoff(state.summary.generatedAt);
    validateFilter();
    writeUrl();

    renderHero();
    renderLede();
    renderFilters();
    renderTable();
    renderStatistics();
    renderBulletins();
    document.documentElement.classList.add('is-ready');

    var id = fileIdFromHash();
    if (id) openFile(id);
  }

  function showUnavailable() {
    var frame = add(h('div', 'cert__frame'),
      add(h('p', 'cert__kicker'), h('span', 'label label--accent', 'Certificate of Standing'), h('span', 'cert__serial', 'Unavailable')),
      h('p', 'cert__name', 'The register could not be consulted.'),
      h('p', 'cert__meta', 'The Bureau regrets the inconvenience and has filed a report with itself.'));
    $('leader').replaceChildren(frame);
    $('headline-grid').replaceChildren(add(h('div', 'hl'), h('span', 'hl__label', 'Table A'), h('span', 'hl__note', 'Headline figures are unavailable.')));
    $('release-stamp').textContent = 'Register unavailable';
    $('release-stamp').parentNode.classList.add('release--down');
    $('release-text').textContent = 'The Bureau register is temporarily unavailable. Figures will resume when it is.';
    $('rank-table').hidden = true;
    $('rank-empty').hidden = false;
    $('rank-empty-stamp').textContent = 'Unavailable';
    $('rank-empty-title').textContent = 'The register is temporarily unavailable.';
    $('rank-empty-text').textContent = 'The Official Rankings could not be retrieved. No figures have been estimated in their absence.';
    $('rank-retry').hidden = false;
  }

  /* =============================================================
     HERO
     ============================================================= */
  function renderHero() {
    var rows = state.byBasis.overall.rows;
    var top = rows[0];
    var frame = add(h('div', 'cert__frame'),
      add(h('p', 'cert__kicker'), h('span', 'label label--accent', 'Certificate of Standing'),
        h('span', 'cert__serial', top ? 'No. 1 · CPI' : 'Vacant')));

    if (!top) {
      add(frame, h('p', 'cert__name', 'No establishment has yet been certified.'),
        h('p', 'cert__meta', 'Certification requires current audits from ' + words(S.CERTIFICATION_MIN_AUDITORS) +
          ' distinct examiners. The Bureau continues to eat.'));
    } else {
      var v = top.view, second = rows[1];
      var stamp = h('p', 'cert__stamp', 'Certified');
      stamp.setAttribute('aria-hidden', 'true');
      var open = h('button', 'btn cert__open');
      open.type = 'button';
      open.dataset.file = v.id;
      add(open, h('span', null, 'Open establishment file'), add(h('span', 'cert__arrow', '→')));
      open.lastChild.setAttribute('aria-hidden', 'true');
      add(frame,
        add(h('div', 'cert__rankrow'), add(h('p', 'cert__rank'), 'No. ', h('span', null, '1')), stamp),
        h('p', 'cert__name', v.name),
        h('p', 'cert__meta', v.categoryLabel + ' · ' + locationsPhrase(v.locations)),
        add(h('div', 'cert__figure'), h('span', 'cert__value', S.formatCPI(top.score)),
          add(h('span', 'cert__unit'), 'Composite', h('br'), 'Patty Index')),
        h('p', 'cert__margin', (second
          ? 'Leads No. 2, ' + second.view.name + ', by ' + shownGap(top.score, second.score) + ' points. '
          : 'The only certified establishment on the register. ') +
          capital(count(v.contributorCount, 'examiner')) + ' · ' + count(v.visits, 'audit') + ' on file.'),
        open);
    }
    $('leader').replaceChildren(frame);

    var grid = $('headline-grid');
    grid.replaceChildren();
    BASES.forEach(function (key) {
      var r = state.byBasis[key], leader = r.rows[0], basis = r.basis;
      var cell = h(leader ? 'button' : 'div', 'hl');
      if (leader) {
        cell.type = 'button';
        cell.dataset.file = leader.id;
        cell.setAttribute('aria-label', BASIS_ROLES[key] + ' by ' + BASIS_TITLES[key] + ': ' + leader.view.name +
          ', ' + basis.scoreLabel + ' ' + scoreText(basis, leader.score) + '. Open establishment file.');
      }
      add(cell, h('span', 'hl__label', BASIS_TITLES[key]),
        add(h('span', 'hl__row'), h('span', 'hl__name', leader ? leader.view.name : 'Vacant'),
          leader ? add(h('span', 'hl__value', scoreText(basis, leader.score)), h('small', null, basis.scoreLabel)) : null),
        h('span', 'hl__note', BASIS_ROLES[key] + (r.rows.length ? ' · of ' + count(r.rows.length, 'certified establishment') : '')));
      grid.appendChild(cell);
    });
    $('release-stamp').parentNode.classList.remove('release--down');
    $('release-stamp').textContent = 'Register as of ' + stampTime(state.summary.generatedAt) + ' · Updated as audits are filed';
  }

  /* The news-release lede: every clause is a live figure. */
  function renderLede() {
    var s = state.summary, n = s.counts.certified;
    var rows = state.byBasis.overall.rows;
    var parts = ['The Bureau of Patty Statistics reports that ' + words(n) + ' ' + plural(n, 'establishment') +
      ' ' + (n === 1 ? 'holds' : 'hold') + ' certification.'];
    if (rows[0]) {
      var lead = rows[0], second = rows[1];
      parts.push(lead.view.name + ' leads the Official Rankings with a Composite Patty Index of ' +
        S.formatCPI(lead.score) + (second ? ', ' + shownGap(lead.score, second.score) + ' points ahead of ' +
        second.view.name : '') + '.');
      var bq = state.byBasis['burger-quality'].rows[0];
      var fr = state.byBasis.fries.rows[0];
      if (bq && rows.length > 1) {
        parts.push(bq.id === lead.id
          ? 'It also holds the Burger Quality lead (BQI ' + S.formatCPI(bq.score) + ').'
          : bq.view.name + ' serves the best burger by Burger Quality Index (' + S.formatCPI(bq.score) + ').');
      }
      if (fr && rows.length > 1) {
        parts.push((fr.id === lead.id ? 'Its fries' : fr.view.name + '’s fries') +
          ' return the highest Fries score on the register (' + f1(fr.score) + ').');
      }
      if (s.meanCPI != null && rows.length > 1) parts.push('The Bureau mean stands at ' + S.formatCPI(s.meanCPI) + '.');
    }
    var p = s.counts.pending;
    if (p) parts.push(capital(words(p)) + ' further ' + plural(p, 'establishment') + ' ' + (p === 1 ? 'remains' : 'remain') + ' under examination.');
    $('release-text').textContent = parts.join(' ');
    var dateline = document.querySelector('#release-lede .dateline');
    dateline.textContent = 'Minneapolis–St. Paul, ' + dayDate(PR.dayOf(s.generatedAt), 'short') + ' —';
  }

  /* =============================================================
     FILTERS + TABLE 1
     ============================================================= */
  function renderFilters() {
    var f = state.filter, o = state.options;
    var loc = $('f-location');
    var frag = document.createDocumentFragment();
    frag.appendChild(option('', 'All Locations'));
    o.locationGroups.forEach(function (g) {
      var group = document.createElement('optgroup');
      group.label = g.label;
      if (g.area) group.appendChild(option('area:' + g.area.key, 'Anywhere in ' + g.area.label + ' (' + g.area.count + ')'));
      g.locations.forEach(function (l) { group.appendChild(option('location:' + l.id, l.name + ' (' + l.count + ')')); });
      frag.appendChild(group);
    });
    loc.replaceChildren(frag);
    loc.value = f.location ? 'location:' + f.location : (f.area ? 'area:' + f.area : '');

    var cls = $('f-class');
    var cfrag = document.createDocumentFragment();
    cfrag.appendChild(option('', 'All Categories'));
    o.categories.forEach(function (c) { cfrag.appendChild(option(c.key, c.label + ' (' + c.count + ')')); });
    cls.replaceChildren(cfrag);
    cls.value = f.category || '';

    syncBasisRadios();
    $('f-clear').hidden = !filterActive();
  }

  function syncBasisRadios() {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="basis"]'), function (r) {
      r.checked = r.value === state.filter.basis;
    });
  }

  function onFilterChange() {
    var f = state.filter;
    var v = $('f-location').value;
    f.location = v.indexOf('location:') === 0 ? v.slice(9) : null;
    f.area = v.indexOf('area:') === 0 ? v.slice(5) : null;
    f.category = $('f-class').value || null;
    var checked = document.querySelector('input[name="basis"]:checked');
    f.basis = checked && S.RANKING_BASES[checked.value] ? checked.value : 'overall';
    $('f-clear').hidden = !filterActive();
    writeUrl();
    if (state.register) renderTable();
  }

  function basisDefinition(basis) {
    if (basis.key === 'overall') {
      return 'CPI: 0–100. All seven categories at their official weights (Table 4).';
    }
    if (basis.key === 'burger-quality') {
      var kept = Object.keys(S.BURGER_QUALITY_WEIGHTS);
      var dropped = S.CATEGORY_KEYS.filter(function (k) { return kept.indexOf(k) === -1; });
      return 'BQI: 0–100. ' + listPhrase(kept.map(S.categoryLabel)) + ' only, reweighted to 100%. ' +
        listPhrase(dropped.map(S.categoryLabel)) + ' are disregarded.';
    }
    return basis.scoreLabel + ': ' + S.formatScore(S.SCALE.min) + '–' + S.formatScore(S.SCALE.max) +
      '. The combined examiner mean for the Fries category alone. A category score, not an index.';
  }

  function subline(v) {
    return v.categoryLabel + ' · ' + locationsPhrase(v.locations);
  }

  function moveCell(move) {
    var td = h('td', 'rt__mv');
    if (!move || move.status === 'same') {
      var same = h('span', 'mv mv--same', '—');
      same.setAttribute('aria-hidden', 'true');
      return add(td, same, h('span', 'vh', 'No change'));
    }
    if (move.status === 'new') {
      var badge = h('span', 'mv mv--new', 'New');
      badge.title = 'Not ranked in this view before ' + dayDate(state.cutoff);
      return add(td, badge);
    }
    var up = move.status === 'up', n = Math.abs(move.delta);
    var mark = h('span', 'mv mv--' + move.status, (up ? '▲' : '▼') + n);
    mark.setAttribute('aria-hidden', 'true');
    return add(td, mark, h('span', 'vh', (up ? 'Up ' : 'Down ') + count(n, 'place')));
  }

  function buildRow(row, basis, move, i) {
    var v = row.view;
    var tr = h('tr', 'rt__row' + (row.rank === 1 ? ' is-first' : ''));
    tr.dataset.file = v.id;
    tr.style.setProperty('--i', Math.min(i, 14));
    var est = h('th', 'rt__est');
    est.scope = 'row';
    var name = fileButton(v.id, v.name, 'rt__name');
    name.setAttribute('aria-label', v.name + ', rank ' + row.rank + ', ' + basis.scoreLabel + ' ' +
      scoreText(basis, row.score) + '. Open establishment file.');
    add(est, name, h('span', 'rt__sub', subline(v)),
      h('span', 'rt__sub rt__sub--compact', count(v.contributorCount, 'examiner') + ' · ' + count(v.visits, 'audit')));
    add(tr,
      add(h('td', 'rt__rank'), h('span', 'rt__ranknum', String(row.rank).padStart(2, '0'))),
      est,
      h('td', 'rt__num rt__ex', String(v.contributorCount)),
      h('td', 'rt__num rt__au', String(v.visits)),
      moveCell(move),
      add(h('td', 'rt__score'), h('span', 'rt__val', scoreText(basis, row.score))));
    return tr;
  }

  function renderTable() {
    var f = state.filter;
    var result = PR.rankings(state.register, f);
    var basis = result.basis;
    var moves = PR.movement(state.register, f, state.cutoff);

    var scope = [filterPlace() || 'all locations', filterClass() || 'all classes'];
    $('rank-caption').textContent = 'Certified establishments ranked by ' + BASIS_TITLES[basis.key] +
      (basis.key === 'fries' ? ' score' : ' (' + basis.scoreLabel + ')') + ' — ' + scope.join(', ') + '.';
    $('rank-basis').textContent = basisDefinition(basis);
    $('score-head').textContent = basis.scoreLabel;
    $('movement-note').textContent = '30-day movement compares the current register with the same register restricted to ' +
      'audits filed before ' + dayDate(state.cutoff) + '. NEW marks an establishment not ranked in this view at that date.';

    var body = $('rank-body');
    body.replaceChildren();
    result.rows.forEach(function (row, i) { body.appendChild(buildRow(row, basis, moves[row.id], i)); });

    var any = result.rows.length > 0;
    $('rank-table').hidden = !any;
    $('rank-empty').hidden = any;
    $('rank-retry').hidden = true;
    if (!any) {
      $('rank-empty-stamp').textContent = 'No Data';
      if (filterActive()) {
        $('rank-empty-title').textContent = 'No certified establishments under this filter.';
        $('rank-empty-text').textContent = (f.location || f.area)
          ? 'Within a location, an establishment certifies only when ' + words(S.CERTIFICATION_MIN_AUDITORS) +
            ' distinct examiners have audited it there. Clear the filters to consult the full register.'
          : 'No establishment of this class has been certified. Clear the filters to consult the full register.';
      } else {
        $('rank-empty-title').textContent = 'No certified establishments.';
        $('rank-empty-text').textContent = 'An establishment enters the Official Rankings once ' +
          words(S.CERTIFICATION_MIN_AUDITORS) + ' distinct active examiners hold current-schema audits for it.';
      }
    }
  }

  /* =============================================================
     STATISTICS
     ============================================================= */
  function renderStatistics() {
    var s = state.summary, c = s.counts;
    var records = s.recordsOnFile;
    var items = [
      { value: c.certified, label: 'Certified establishments', note: 'Current-schema audits on file from at least ' + words(S.CERTIFICATION_MIN_AUDITORS) + ' distinct examiners.' },
      { value: c.audits, label: 'Audits filed', note: 'Current-schema examinations. One examiner, one visit, one burger.' },
      { value: c.examiners, label: 'Active examiners', note: 'Credentialed Bureau personnel. Unpaid.' },
      { value: c.locations, label: 'Locations examined', note: 'Distinct audit locations on the register.' },
      { value: S.formatCPI(s.meanCPI), unit: 'CPI', label: 'Bureau mean', note: 'Mean Composite Patty Index across certified establishments.' },
      { value: c.pending, label: 'Pending peer review', note: 'Establishments awaiting a further independent examiner.' },
      { value: c.burgers, label: 'Burgers examined', note: 'Distinct burgers on file. Fries are not burgers.' },
      { value: records == null ? 'Withheld' : records, label: 'Records Office entries', note: 'Entries in the permanent record. Contents withheld.' }
    ];
    var grid = $('indicators');
    grid.replaceChildren();
    items.forEach(function (item) {
      var value = h('p', 'ind__value' + (typeof item.value === 'string' && !/^[\d.—]+$/.test(item.value) ? ' ind__value--text' : ''), String(item.value));
      if (item.unit) value.appendChild(h('span', 'ind__unit', item.unit));
      grid.appendChild(add(h('div', 'ind'), value, h('p', 'ind__label', item.label), h('p', 'ind__note', item.note)));
    });

    var f = state.findings;
    var classBody = $('class-table').tBodies[0];
    classBody.replaceChildren();
    (f.classes || []).forEach(function (row) {
      var fill = h('span', 'dt__fill');
      fill.style.width = Math.max(0, Math.min(100, row.meanCPI)) + '%';
      var th = h('th', null, row.label);
      th.scope = 'row';
      add(th, add(h('span', 'dt__bar'), fill));
      classBody.appendChild(add(h('tr'), th, h('td', 'num', String(row.certified)), h('td', 'num', S.formatCPI(row.meanCPI))));
    });
    if (!classBody.children.length) {
      classBody.appendChild(add(h('tr'), add(h('td', null, 'No class has a certified establishment yet.'))));
      classBody.firstChild.firstChild.colSpan = 3;
    }

    var awarded = {};
    (f.examiners || []).forEach(function (e) { awarded[e.key] = e.meanIndex; });
    var staffBody = $('staff-table').tBodies[0];
    staffBody.replaceChildren();
    s.examiners.forEach(function (e) {
      var th = h('th', null, e.name);
      th.scope = 'row';
      if (!e.audits) th.appendChild(h('span', 'dt__sub', 'Awaiting first assignment'));
      staffBody.appendChild(add(h('tr'), th, h('td', 'num', String(e.audits)), h('td', 'num', String(e.establishments)),
        h('td', 'num', awarded[e.key] == null ? '—' : S.formatCPI(awarded[e.key]))));
    });
  }

  /* =============================================================
     BULLETINS — every notice is conditional on the data
     ============================================================= */
  function renderBulletins() {
    var f = state.findings, s = state.summary;
    var notices = [];
    function push(n) { notices.push(n); }

    if (f.disagreement) {
      var d = f.disagreement;
      push({ tone: 'alert', type: 'Notice of Material Disagreement', subject: d,
        title: d.name + ': examiners ' + f1(d.spread) + ' points apart on ' + d.categoryName,
        body: 'The widest single-category divergence on the register' +
          (d.examiners > 2 ? ', measured between the highest and lowest of ' + words(d.examiners) + ' examiners' : '') +
          '. Both findings stand. The Bureau averages; it does not adjudicate.',
        fig: f1(d.spread), unit: 'Point spread' });
    }
    if (f.concurrence) {
      var c = f.concurrence;
      push({ tone: 'good', type: 'Statement of Examiner Concurrence', subject: c,
        title: c.name + ': the register’s most harmonious file',
        body: 'Examiners’ category findings differed by an average of ' + f2(c.meanSpread) + ' points' +
          (c.exactCategories ? ', with identical findings in ' + words(c.exactCategories) + ' of ' + words(c.categories) + ' categories' : '') +
          '. The Office of Auditor Accountability finds this suspicious but not actionable.',
        fig: f2(c.meanSpread), unit: 'Mean spread' });
    }
    if (f.fries && f.fries.best) {
      var fr = f.fries;
      push({ type: 'Fry Performance Bulletin', subject: fr.best,
        title: 'Register mean fry score stands at ' + f1(fr.mean),
        body: 'Highest: ' + fr.best.name + ' (' + f1(fr.best.value) + ').' +
          (fr.worst ? ' Lowest: ' + fr.worst.name + ' (' + f1(fr.worst.value) + ').' : '') +
          ' Fries were the weakest category at ' + words(fr.weakestAt) + ' of ' + words(fr.of) + ' certified ' +
          plural(fr.of, 'establishment') + '.',
        fig: f1(fr.mean), unit: 'Mean · 0–10' });
    }
    if (f.burgerOverFries) {
      var b = f.burgerOverFries;
      push({ tone: 'alert', type: 'Fries Underperformance Advisory', subject: b,
        title: b.name + ': burger outperforms its fries by ' + f1(b.gap) + ' points',
        body: 'Burger Quality ' + f1(b.burger) + ' against Fries ' + f1(b.fries) +
          ', both on the ten-point scale. The Bureau recommends the burger.',
        fig: f1(b.gap), unit: 'Point gap' });
    }
    if (f.friesOverBurger) {
      var inv = f.friesOverBurger;
      push({ tone: 'alert', type: 'Notice of Inverted Priorities', subject: inv,
        title: inv.name + ': fries outscore the burger',
        body: 'Fries ' + f1(inv.fries) + ' against Burger Quality ' + f1(inv.burger) +
          ' on the ten-point scale. The establishment is reminded which item is the hamburger.',
        fig: f1(inv.gap), unit: 'Point gap' });
    }
    if (f.mostExamined) {
      var m = f.mostExamined;
      push({ type: 'Notice of Repeated Examination', subject: m,
        title: m.name + ': ' + count(m.audits, 'current audit') + ' on file',
        body: capital(words(m.audits)) + ' audits by ' + words(m.examiners) + ' ' + plural(m.examiners, 'examiner') +
          ' across ' + words(m.locations) + ' ' + plural(m.locations, 'location') + '. The Bureau is aware of how this looks.',
        fig: String(m.audits), unit: 'Audits' });
    }
    if (f.strongest && f.weakest) {
      push({ tone: 'good', type: 'Register-Wide Finding',
        title: f.strongest.label + ' is the register’s strongest category; ' + f.weakest.label + ' its weakest',
        body: 'Mean combined finding of ' + f1(f.strongest.mean) + ' for ' + f.strongest.label + ' across certified establishments, against ' +
          f1(f.weakest.mean) + ' for ' + f.weakest.label + '.',
        fig: shownGap(f.strongest.mean, f.weakest.mean), unit: 'Point gap' });
    }

    var year = String(new Date(s.generatedAt).getUTCFullYear()).slice(2);
    var host = $('notices');
    host.replaceChildren();
    if (!notices.length) {
      host.appendChild(add(h('article', 'notice'),
        add(h('div', 'notice__head'), h('p', 'notice__type', 'Administrative Notice'), h('p', 'notice__serial', 'PB-' + year + '/00')),
        h('h3', 'notice__title', 'No bulletins may be issued until an establishment is certified.'),
        h('p', 'notice__body', 'The Bureau does not publish findings it cannot support.')));
    }
    notices.forEach(function (n, i) {
      var article = h('article', 'notice' + (n.tone ? ' notice--' + n.tone : ''));
      article.style.setProperty('--i', i);
      var foot = add(h('div', 'notice__foot'),
        add(h('p', 'notice__fig'), h('span', 'notice__figval', n.fig), h('span', 'notice__figunit', n.unit)));
      if (n.subject) foot.appendChild(fileButton(n.subject.id, 'File ' + n.subject.id + ' →', 'subject'));
      add(article,
        add(h('div', 'notice__head'), h('p', 'notice__type', n.type), h('p', 'notice__serial', 'No. PB-' + year + '/' + String(i + 1).padStart(2, '0'))),
        h('h3', 'notice__title', n.title),
        h('p', 'notice__body', n.body),
        foot);
      host.appendChild(article);
    });

    var ext = $('extremes-table').tBodies[0];
    ext.replaceChildren();
    (f.categories || []).forEach(function (row) {
      function cell(entry) {
        var td = h('td');
        if (!entry) return add(td, h('span', 'dt__sub', '—'));
        return add(td, fileButton(entry.id, entry.name), h('span', 'dt__sub', f1(entry.value)));
      }
      var th = h('th', null, row.label);
      th.scope = 'row';
      ext.appendChild(add(h('tr'), th, h('td', 'num', row.weight + '%'), cell(row.best), cell(row.worst)));
    });
    $('extremes-table').closest('.ledger').hidden = !(f.categories && f.categories.length);

    var recent = $('recent-list');
    recent.replaceChildren();
    (f.recent || []).forEach(function (r) {
      recent.appendChild(add(h('li'), fileButton(r.id, r.name, 'file-link roll__name'),
        h('span', 'roll__meta', r.categoryLabel + ' · certified ' + dayDate(r.on)),
        add(h('span', 'roll__fig', S.formatCPI(r.cpi)), h('small', null, 'CPI'))));
    });
    if (!recent.children.length) recent.appendChild(h('li', 'roll__empty', 'No establishment has been certified.'));

    var inv2 = $('investigation-list');
    inv2.replaceChildren();
    s.investigations.forEach(function (x) {
      inv2.appendChild(add(h('li'), h('span', 'roll__name', x.name),
        h('span', 'roll__meta', x.categoryLabel + ' · ' + x.examiners + ' of ' + x.required + ' examiners on file · opened ' + dayDate(x.openedOn)),
        add(h('span', 'roll__stamp'), h('span', 'stamp', 'Under examination'))));
    });
    if (!inv2.children.length) {
      inv2.appendChild(h('li', 'roll__empty', 'No establishments are under examination. The Office of Auditor Accountability is, briefly, without grievance.'));
    }
  }

  /* =============================================================
     ESTABLISHMENT FILE
     ============================================================= */
  function fileIdFromHash() {
    var m = /^#file\/(.+)$/.exec(window.location.hash);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (err) { return m[1]; }
  }

  function rowsByBasis() {
    var out = {};
    BASES.forEach(function (key) { out[key] = state.byBasis[key].rows; });
    return out;
  }

  function fig(label, value, note, accent) {
    return add(h('div', 'fig' + (accent ? ' fig--accent' : '')), h('p', 'fig__label', label),
      h('p', 'fig__value', value), note ? h('p', 'fig__note', note) : null);
  }

  function section(letter, title) {
    var sec = h('section', 'file__sec');
    sec.appendChild(add(h('h3'), h('span', 'label', letter), title));
    return sec;
  }

  function renderFile(file) {
    var ranks = file.ranks;
    function rankNote(key, suffix) {
      var r = ranks[key];
      return r ? '#' + r.rank + ' of ' + r.of + ' · ' + suffix : suffix;
    }
    $('file-number').textContent = 'Establishment File ' + file.fileNumber;
    $('file-title').textContent = file.name;
    $('file-sub').textContent = file.categoryLabel + ' · ' + listPhrase(file.locations);
    $('file-figs').replaceChildren(
      fig('Official rank', ranks.overall ? '#' + ranks.overall.rank : '—', ranks.overall ? 'of ' + count(ranks.overall.of, 'certified establishment') : null),
      fig('Composite Patty Index', S.formatCPI(file.cpi), 'CPI · 0–100', true),
      fig('Burger Quality', S.formatCPI(file.bqi), rankNote('burger-quality', 'BQI')),
      fig('Fries', S.formatScore(file.fries), rankNote('fries', '0–10')));

    var body = $('file-body');
    body.replaceChildren();

    if (filterActive()) {
      body.appendChild(h('p', 'file__note', 'The table you came from is restricted to ' +
        [filterPlace(), filterClass()].filter(Boolean).join(', ') + '. This file reports the full register.'));
    }

    var particulars = h('dl', 'kv');
    [['Establishment class', file.categoryLabel],
     ['Locations examined', listPhrase(file.locations)],
     ['Burgers examined', listPhrase(file.burgers)],
     ['Examiners on file', count(file.examinerCount, 'examiner') + ': ' + listPhrase(file.examiners.map(function (e) { return e.name; }))],
     ['Audits on file', count(file.audits, 'current audit')],
     ['File opened', dayDate(file.openedOn)],
     ['Certified', dayDate(file.certifiedOn)],
     ['Examiner spread', f2(file.meanSpread) + ' points per category, on average']
    ].forEach(function (pair) { add(particulars, h('dt', null, pair[0]), h('dd', null, pair[1])); });
    body.appendChild(add(section('A', 'Particulars'), particulars));

    var bars = h('ol', 'bars');
    S.CATEGORIES.forEach(function (c) {
      var value = file.combined[c.key];
      var fill = h('span', 'bars__fill');
      fill.style.width = (value == null ? 0 : value / S.SCALE.max * 100) + '%';
      bars.appendChild(add(h('li'),
        add(h('span', 'bars__label', c.label), h('small', null, S.SCORING_WEIGHTS[c.key] + '% of CPI')),
        add(h('span', 'bars__track'), fill),
        h('span', 'bars__val', f1(value))));
    });
    body.appendChild(add(section('B', 'Category findings'),
      h('p', 'tnote', 'Combined mean of the examiners’ findings, 0–10. Descriptive; the index is weighted.'), bars));

    var ex = h('ol', 'exlist');
    file.examiners.forEach(function (e) {
      ex.appendChild(add(h('li'), h('span', 'exlist__name', e.name),
        h('span', 'exlist__meta', count(e.audits, 'audit') + ' averaged into one vote'),
        add(h('span', 'exlist__val', S.formatCPI(e.index)), h('small', null, 'Index'))));
    });
    body.appendChild(add(section('C', 'Examiner aggregates'), ex));

    var hist = h('ol', 'hist');
    file.history.forEach(function (a) {
      hist.appendChild(add(h('li'), h('span', 'hist__what', a.burger + (a.location ? ' — ' + a.location : '')),
        h('span', 'hist__when', dayDate(a.date, 'short') + ' · ' + a.examiner),
        add(h('span', 'hist__val', S.formatCPI(a.index)), h('small', null, 'Index'))));
    });
    body.appendChild(add(section('D', 'Examination history'),
      h('p', 'tnote', 'Every current-schema filing on record, newest first. Dates only; the Bureau does not publish where its examiners were at what hour.'), hist));

    var url = window.location.origin + window.location.pathname + '#file/' + encodeURIComponent(file.id);
    var copy = h('button', 'btn btn--ghost', 'Copy link to this file');
    copy.type = 'button';
    var foot = add(h('div', 'file__foot'), copy, h('p', 'file__legal', 'Source: Bureau Register of Audits. Provisional.'));
    copy.addEventListener('click', function () {
      function fallback() {
        copy.textContent = 'Copy this link:';
        if (!foot.querySelector('.file__url')) foot.appendChild(h('p', 'file__url', url));
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { copy.textContent = 'Link copied'; }, fallback);
      } else fallback();
    });
    body.appendChild(foot);
  }

  function renderMissing(id) {
    $('file-number').textContent = 'Establishment File';
    $('file-title').textContent = 'File not found';
    $('file-sub').textContent = 'No certified establishment holds file ' + id + '.';
    $('file-figs').replaceChildren();
    $('file-body').replaceChildren(h('p', 'file__note',
      'The establishment may still be under examination, or the file number may have been mistyped. ' +
      'The Bureau publishes a file only once it is certified.'));
  }

  function openFile(id) {
    if (!state.register) return;
    var file = PR.establishmentFile(state.global, rowsByBasis(), id);
    state.fileId = id;
    if (file) renderFile(file); else renderMissing(id);
    var dialog = $('file');
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    $('file-sheet').scrollTop = 0;
    document.title = (file ? file.name : 'File not found') + ' — Bureau of Patty Statistics';
  }

  function openFromUser(id, trigger) {
    state.fileTrigger = trigger || document.activeElement;
    var hash = '#file/' + encodeURIComponent(id);
    if (window.location.hash === hash) { openFile(id); return; }
    state.filePushed = true;
    window.location.hash = hash;
  }

  function closeDialog() {
    var dialog = $('file');
    if (dialog.open) dialog.close();
  }

  /* However the file closes — button, Escape, backdrop or Back — the
     'close' event lands here and puts the URL right. Browsers may close a
     modal on Escape without honouring a cancelled 'cancel' event, so the
     URL is never managed from the close request itself. */
  function onDialogClosed() {
    if (fileIdFromHash()) {
      if (state.filePushed) window.history.back();
      else window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
    state.filePushed = false;
    state.fileId = null;
    document.title = state.baseTitle;
    var trigger = state.fileTrigger;
    state.fileTrigger = null;
    if (trigger && document.contains(trigger) && trigger.focus) trigger.focus({ preventScroll: true });
  }

  function onHash() {
    var id = fileIdFromHash();
    if (id) { openFile(id); return; }
    state.filePushed = false;
    closeDialog();
  }

  /* =============================================================
     WIRING
     ============================================================= */
  function bindDialog() {
    var dialog = $('file');
    $('file-close').addEventListener('click', closeDialog);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });
    dialog.addEventListener('close', onDialogClosed);
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', function (e) {
      var target = e.target && e.target.closest ? e.target.closest('[data-file]') : null;
      if (!target) return;
      e.preventDefault();
      var trigger = target.tagName === 'TR' ? target.querySelector('.rt__name') : target;
      openFromUser(target.dataset.file, trigger);
    });
  }

  function bindFilters() {
    var form = $('filters');
    form.addEventListener('change', onFilterChange);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    $('f-clear').addEventListener('click', function () {
      state.filter.location = null;
      state.filter.area = null;
      state.filter.category = null;
      renderFilters();
      writeUrl();
      if (state.register) renderTable();
      $('f-location').focus();
    });
    $('rank-retry').addEventListener('click', function () { load(); });
  }

  function bindChrome() {
    var toggle = document.querySelector('.govbar__toggle');
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      $('govbar-panel').hidden = open;
    });

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var reveal = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!('IntersectionObserver' in window) || reduce) {
      reveal.forEach(function (node) { node.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
      reveal.forEach(function (node) { io.observe(node); });

      var links = {};
      Array.prototype.forEach.call(document.querySelectorAll('.sitenav a'), function (a) {
        links[a.getAttribute('href').slice(1)] = a;
      });
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          Object.keys(links).forEach(function (k) { links[k].removeAttribute('aria-current'); });
          if (links[entry.target.id]) links[entry.target.id].setAttribute('aria-current', 'true');
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      Object.keys(links).forEach(function (k) { if ($(k)) spy.observe($(k)); });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.fetchedAt && Date.now() - state.fetchedAt > STALE_AFTER_MS) load(true);
    });
  }

  function init() {
    if (!S || !PR || !BPS.analytics) { showUnavailable(); return; }
    readUrl();
    renderMethodology();
    syncBasisRadios();
    bindChrome();
    bindDialog();
    bindFilters();
    load();
  }

  init();
  BPS.site = { state: state, reload: load, openFile: openFromUser };
  window.BPS = BPS;
})();
