/* =============================================================
   Bureau of Patty Statistics — records.js

   The Records Office detection engine.

   Pure data in, deterministic state out. No DOM, no randomness, no
   wall-clock reads: every figure comes from stored audit data, so the
   same register always produces the same records on both devices.

   A DEFINITION describes a superlative. A RECORD is the stored row a
   definition currently holds. Definitions are internal; only records
   that have actually been set are ever rendered.

   Definition shape:
     { id, title, family, kind, unit, detect(m, X) }

   kind decides when a candidate replaces the stored record:
     'high'      strictly greater value
     'low'       strictly lesser value
     'first'     never replaced once set
     'identity'  replaced when detail.key changes (holder changes hands)

   detect() returns null, or:
     { value, holder, establishmentId, establishmentName, valueText,
       detail, at }
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.records = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var S = isNode ? require('./scoring.js')   : root.BPS.scoring;
  var T = isNode ? require('./taxonomy.js')  : root.BPS.taxonomy;

  var KEYS = S.CATEGORY_KEYS;
  var DAY = 86400000;

  /* ---------- tiny statistics, local to detection ---------- */
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function sd(a) {
    if (a.length < 2) return null;
    var mu = mean(a);
    return Math.sqrt(a.reduce(function (t, v) { return t + (v - mu) * (v - mu); }, 0) / a.length);
  }
  function finite(list) { return (list || []).filter(function (n) { return n != null && isFinite(n); }); }
  function best(list, fn) {
    var item = null, value = null;
    (list || []).forEach(function (x) {
      var v = fn(x);
      if (v == null || !isFinite(v)) return;
      if (value == null || v > value) { value = v; item = x; }
    });
    return item == null ? null : { item: item, value: value };
  }
  function least(list, fn) {
    var item = null, value = null;
    (list || []).forEach(function (x) {
      var v = fn(x);
      if (v == null || !isFinite(v)) return;
      if (value == null || v < value) { value = v; item = x; }
    });
    return item == null ? null : { item: item, value: value };
  }
  function longestRun(list, predicate) {
    var longest = 0, run = 0, endItem = null, bestEnd = null;
    (list || []).forEach(function (item) {
      if (predicate(item)) {
        run += 1; endItem = item;
        if (run > longest) { longest = run; bestEnd = endItem; }
      } else run = 0;
    });
    return { length: longest, last: bestEnd };
  }
  function dayKey(iso) { return String(iso || '').slice(0, 10); }
  function isoWeekKey(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    return String(Math.floor(t / (7 * DAY)));
  }
  function groupCount(list, keyFn) {
    var out = {};
    (list || []).forEach(function (item) {
      var k = keyFn(item);
      if (k == null || k === '') return;
      (out[k] = out[k] || { key: k, items: [] }).items.push(item);
    });
    return Object.keys(out).map(function (k) { return out[k]; });
  }
  /** The highest milestone step a running total has passed. */
  function milestone(total, steps) {
    var reached = null;
    steps.forEach(function (s) { if (total >= s) reached = s; });
    return reached;
  }
  var MILESTONES = [5, 10, 25, 50, 100, 200, 400];
  var SMALL_MILESTONES = [3, 5, 10, 20, 40, 80];

  /* ---------- registry ---------- */
  var DEFINITIONS = [];
  var byId = {};

  function R(id, title, opts) {
    if (byId[id]) throw new Error('Duplicate record definition id: ' + id);
    var def = {
      id: id,
      title: title,
      family: opts.family || 'register',
      kind: opts.kind || 'high',
      unit: opts.unit || 'score',
      subject: opts.subject || 'establishment',
      detect: opts.detect
    };
    DEFINITIONS.push(def);
    byId[id] = def;
    return def;
  }

  /* Detection context helpers handed to every definition. */
  var X = {
    mean: mean, sd: sd, best: best, least: least, finite: finite,
    longestRun: longestRun, groupCount: groupCount, dayKey: dayKey,
    isoWeekKey: isoWeekKey, milestone: milestone,
    MILESTONES: MILESTONES, SMALL_MILESTONES: SMALL_MILESTONES,
    cat: function (scores, key) { return S.categoryValue(scores, key); },
    label: function (key) { return S.categoryLabel(key); },
    name: function (key) { return S.auditorName(key); }
  };

  function est(view, value, extra) {
    if (!view) return null;
    return Object.assign({
      value: value,
      establishmentId: view.id,
      establishmentName: view.name || view.establishmentName,
      at: view.createdAt,
      detail: {}
    }, extra || {});
  }

  function fromAudit(auditView, value, extra) {
    if (!auditView) return null;
    return Object.assign({
      value: value,
      holder: auditView.auditor,
      establishmentId: auditView.establishmentId,
      establishmentName: auditView.establishmentName,
      at: auditView.createdAt,
      valueText: auditView.burger,
      detail: { burger: auditView.burger, location: auditView.locationName }
    }, extra || {});
  }

  /* =============================================================
     BATCH 1 — REGISTER MILESTONES AND FIRST OCCURRENCES
     ============================================================= */

  R('r001', 'First Certified Establishment', { family: 'register', kind: 'first', unit: 'cpi',
    detect: function (m) {
      var first = m.paired.first;
      return first ? est(first, first.cpi) : null;
    } });

  R('r002', 'First Establishment Above 90.0', { family: 'register', kind: 'first', unit: 'cpi',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return v.cpi >= 90; })[0];
      return hit ? est(hit, hit.cpi) : null;
    } });

  R('r003', 'First Establishment Below 50.0', { family: 'register', kind: 'first', unit: 'cpi',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return v.cpi < 50; })[0];
      return hit ? est(hit, hit.cpi) : null;
    } });

  R('r004', 'Highest Composite Patty Index', { family: 'register', kind: 'high', unit: 'cpi',
    detect: function (m) { var b = best(m.certified, function (v) { return v.cpi; }); return b ? est(b.item, b.value) : null; } });

  R('r005', 'Lowest Composite Patty Index', { family: 'register', kind: 'low', unit: 'cpi',
    detect: function (m) { var b = least(m.certified, function (v) { return v.cpi; }); return b ? est(b.item, b.value) : null; } });

  R('r006', 'Widest Spread From Summit to Floor', { family: 'register', kind: 'high', unit: 'cpi',
    detect: function (m) {
      if (m.counts.certified < 3) return null;
      var top = m.ranked[0], bottom = m.ranked[m.ranked.length - 1];
      return est(top, top.cpi - bottom.cpi, { valueText: top.name + ' over ' + bottom.name,
        detail: { top: top.name, bottom: bottom.name } });
    } });

  R('r007', 'Certified Establishments on File', { family: 'register', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var v = milestone(m.counts.certified, MILESTONES);
      return v ? { value: v, detail: { total: m.counts.certified } } : null;
    } });

  R('r008', 'Audits Accepted by the Bureau', { family: 'register', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var v = milestone(m.counts.audits, MILESTONES);
      return v ? { value: v, detail: { total: m.counts.audits } } : null;
    } });

  R('r009', 'First Perfect 10.0 Awarded', { family: 'register', kind: 'first', unit: 'score',
    detect: function (m) {
      var hit = null;
      m.auditViews.some(function (v) {
        var scores = v.scores[v.auditor];
        var key = S.INPUT_KEYS.filter(function (k) { return Number(scores[k]) === 10; })[0];
        if (!key) return false;
        hit = fromAudit(v, 10, { valueText: S.categoryLabel(key), detail: { category: key, burger: v.burger } });
        return true;
      });
      return hit;
    } });

  R('r010', 'First 0.0 Awarded', { family: 'register', kind: 'first', unit: 'score',
    detect: function (m) {
      var hit = null;
      m.auditViews.some(function (v) {
        var scores = v.scores[v.auditor];
        var key = S.INPUT_KEYS.filter(function (k) { return Number(scores[k]) === 0; })[0];
        if (!key) return false;
        hit = fromAudit(v, 0, { valueText: S.categoryLabel(key), detail: { category: key, burger: v.burger } });
        return true;
      });
      return hit;
    } });

  R('r011', 'Highest Register Mean Index', { family: 'register', kind: 'high', unit: 'cpi', subject: 'register',
    detect: function (m) {
      if (m.counts.certified < 3) return null;
      return { value: m.paired.cpi.mean, detail: { n: m.counts.certified } };
    } });

  R('r012', 'Lowest Register Mean Index', { family: 'register', kind: 'low', unit: 'cpi', subject: 'register',
    detect: function (m) {
      if (m.counts.certified < 3) return null;
      return { value: m.paired.cpi.mean, detail: { n: m.counts.certified } };
    } });

  R('r013', 'First Establishment Revisited', { family: 'register', kind: 'first', unit: 'count',
    detect: function (m) {
      var hit = m.views.filter(function (v) { return v.revisited; })[0];
      return hit ? est(hit, hit.visits, { valueText: hit.visits + ' visits' }) : null;
    } });

  R('r014', 'Most Audits at One Establishment', { family: 'register', kind: 'high', unit: 'count',
    detect: function (m) {
      var b = best(m.views, function (v) { return v.visits; });
      return b && b.value >= 2 ? est(b.item, b.value) : null;
    } });

  R('r015', 'First Matched-Burger Certification', { family: 'register', kind: 'first', unit: 'cpi',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return v.sameBurger; })[0];
      return hit ? est(hit, hit.cpi, { valueText: hit.burgers[0] }) : null;
    } });

  R('r016', 'First Divergent-Burger Certification', { family: 'register', kind: 'first', unit: 'cpi',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return !v.sameBurger && v.burgers.length >= 2; })[0];
      return hit ? est(hit, hit.cpi, { valueText: hit.burgers.slice(0, 2).join(' / ') }) : null;
    } });

  R('r017', 'First Cross-Branch Certification', { family: 'register', kind: 'first', unit: 'cpi',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return !v.sameLocation && v.locations.length >= 2; })[0];
      return hit ? est(hit, hit.cpi, { valueText: hit.locations.slice(0, 2).join(' / ') }) : null;
    } });

  R('r018', 'Fastest Certification Turnaround', { family: 'register', kind: 'low', unit: 'hours',
    detect: function (m) {
      var b = least(m.paired.views, function (v) { return v.turnaroundMs; });
      return b ? est(b.item, b.value / 3600000) : null;
    } });

  R('r019', 'Slowest Certification Turnaround', { family: 'register', kind: 'high', unit: 'days',
    detect: function (m) {
      var b = best(m.paired.views, function (v) { return v.turnaroundMs; });
      return b ? est(b.item, b.value / DAY) : null;
    } });

  R('r020', 'Longest Dormancy Between Filings', { family: 'register', kind: 'high', unit: 'days', subject: 'register',
    detect: function (m) {
      var gaps = finite(m.activity.gaps);
      if (!gaps.length) return null;
      return { value: Math.max.apply(null, gaps) / DAY, detail: { filings: m.counts.audits } };
    } });

  /* =============================================================
     BATCH 2 — ESTABLISHMENT SUPERLATIVES
     ============================================================= */

  [['r021', 'ryan'], ['r022', 'devin']].forEach(function (pair) {
    R(pair[0], 'Highest ' + S.auditorName(pair[1]) + ' Aggregate at an Establishment',
      { family: 'establishment', kind: 'high', unit: 'score',
        detect: function (m) {
          var b = best(m.views, function (v) { return v.weighted[pair[1]]; });
          return b ? est(b.item, b.value, { holder: pair[1] }) : null;
        } });
  });

  [['r023', 'ryan'], ['r024', 'devin']].forEach(function (pair) {
    R(pair[0], 'Lowest ' + S.auditorName(pair[1]) + ' Aggregate at an Establishment',
      { family: 'establishment', kind: 'low', unit: 'score',
        detect: function (m) {
          var b = least(m.views, function (v) { return v.weighted[pair[1]]; });
          return b ? est(b.item, b.value, { holder: pair[1] }) : null;
        } });
  });

  R('r025', 'Most Branches Audited for One Establishment', { family: 'establishment', kind: 'high', unit: 'count',
    detect: function (m) {
      var b = best(m.views, function (v) { return v.locations.length; });
      return b && b.value >= 2 ? est(b.item, b.value, { valueText: b.item.locations.join(', ') }) : null;
    } });

  R('r026', 'Most Burgers Examined at One Establishment', { family: 'establishment', kind: 'high', unit: 'count',
    detect: function (m) {
      var b = best(m.views, function (v) { return v.burgers.length; });
      return b && b.value >= 2 ? est(b.item, b.value, { valueText: b.item.burgers.join(', ') }) : null;
    } });

  R('r027', 'Most Reproducible Establishment', { family: 'establishment', kind: 'low', unit: 'cpi',
    detect: function (m) {
      var pool = m.restaurants.filter(function (r) { return r.count >= 3 && r.rangeCPI != null; });
      var b = least(pool, function (r) { return r.rangeCPI; });
      return b ? est(b.item.view, b.value, { detail: { visits: b.item.count } }) : null;
    } });

  R('r028', 'Least Reproducible Establishment', { family: 'establishment', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var pool = m.restaurants.filter(function (r) { return r.count >= 3 && r.rangeCPI != null; });
      var b = best(pool, function (r) { return r.rangeCPI; });
      return b ? est(b.item.view, b.value, { detail: { visits: b.item.count } }) : null;
    } });

  R('r029', 'Highest Single-Visit Index', { family: 'establishment', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var b = best(m.auditViews, function (v) { return v.index; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  R('r030', 'Lowest Single-Visit Index', { family: 'establishment', kind: 'low', unit: 'cpi',
    detect: function (m) {
      var b = least(m.auditViews, function (v) { return v.index; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  R('r031', 'Highest Index Certified Across Branches', { family: 'establishment', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var pool = m.certified.filter(function (v) { return v.locations.length >= 2; });
      var b = best(pool, function (v) { return v.cpi; });
      return b ? est(b.item, b.value, { valueText: b.item.locations.join(', ') }) : null;
    } });

  R('r032', 'Highest Index on a Matched Burger', { family: 'establishment', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var pool = m.certified.filter(function (v) { return v.sameBurger; });
      var b = best(pool, function (v) { return v.cpi; });
      return b ? est(b.item, b.value, { valueText: b.item.burgers[0] }) : null;
    } });

  R('r033', 'Most Filings Accepted in One Day', { family: 'establishment', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var days = groupCount(m.auditViews, function (v) { return dayKey(v.createdAt); });
      var b = best(days, function (d) { return d.items.length; });
      return b && b.value >= 2 ? { value: b.value, at: b.item.items[0].createdAt, valueText: b.item.key,
        detail: { day: b.item.key } } : null;
    } });

  R('r034', 'Highest Category Mean at One Establishment', { family: 'establishment', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.certified, function (v) {
        return mean(KEYS.map(function (k) { return v.combined[k]; }));
      });
      return b ? est(b.item, b.value) : null;
    } });

  R('r035', 'Flattest Category Profile', { family: 'establishment', kind: 'low', unit: 'score',
    detect: function (m) {
      var b = least(m.certified, function (v) { return v.combinedSpread; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r036', 'Steepest Category Profile', { family: 'establishment', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.certified, function (v) { return v.combinedSpread; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r037', 'Highest Index on a Single Visit Each', { family: 'establishment', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var pool = m.certified.filter(function (v) { return v.auditCounts.ryan === 1 && v.auditCounts.devin === 1; });
      var b = best(pool, function (v) { return v.cpi; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r038', 'Holder of the Summit', { family: 'establishment', kind: 'identity', unit: 'cpi',
    detect: function (m) {
      var top = m.ranked[0];
      return top ? est(top, top.cpi, { detail: { key: top.id } }) : null;
    } });

  [['r039', 'ryan'], ['r040', 'devin']].forEach(function (pair) {
    R(pair[0], 'Most ' + S.auditorName(pair[1]) + ' Visits to One Establishment',
      { family: 'establishment', kind: 'high', unit: 'count',
        detect: function (m) {
          var b = best(m.views, function (v) { return v.auditCounts[pair[1]]; });
          return b && b.value >= 2 ? est(b.item, b.value, { holder: pair[1] }) : null;
        } });
  });

  /* =============================================================
     BATCH 3 — CATEGORY EXTREMES (r041–r068)
     ============================================================= */
  var CAT_HIGH = ['r041', 'r042', 'r043', 'r044', 'r045', 'r046', 'r047'];
  var CAT_LOW  = ['r048', 'r049', 'r050', 'r051', 'r052', 'r053', 'r054'];
  var CELL_HIGH = ['r055', 'r056', 'r057', 'r058', 'r059', 'r060', 'r061'];
  var CELL_LOW  = ['r062', 'r063', 'r064', 'r065', 'r066', 'r067', 'r068'];

  KEYS.forEach(function (key, i) {
    var label = S.categoryLabel(key);

    R(CAT_HIGH[i], 'Highest Certified ' + label, { family: 'category', kind: 'high', unit: 'score',
      detect: function (m) {
        var b = best(m.certified, function (v) { return v.combined[key]; });
        return b ? est(b.item, b.value, { detail: { category: key } }) : null;
      } });

    R(CAT_LOW[i], 'Lowest Certified ' + label, { family: 'category', kind: 'low', unit: 'score',
      detect: function (m) {
        var b = least(m.certified, function (v) { return v.combined[key]; });
        return b ? est(b.item, b.value, { detail: { category: key } }) : null;
      } });

    R(CELL_HIGH[i], 'Highest ' + label + ' on a Single Audit', { family: 'category', kind: 'high', unit: 'score',
      detect: function (m) {
        var b = best(m.auditViews, function (v) { return S.categoryValue(v.scores[v.auditor], key); });
        return b ? fromAudit(b.item, b.value, { detail: { category: key, burger: b.item.burger } }) : null;
      } });

    R(CELL_LOW[i], 'Lowest ' + label + ' on a Single Audit', { family: 'category', kind: 'low', unit: 'score',
      detect: function (m) {
        var b = least(m.auditViews, function (v) { return S.categoryValue(v.scores[v.auditor], key); });
        return b ? fromAudit(b.item, b.value, { detail: { category: key, burger: b.item.burger } }) : null;
      } });
  });

  /* =============================================================
     BATCH 4 — AUDITOR SUPERLATIVES (r069–r094)
     ============================================================= */
  function auditorPair(ids, title, opts) {
    S.AUDITOR_KEYS.forEach(function (who, i) {
      R(ids[i], title.replace('{name}', S.auditorName(who)), {
        family: 'auditor', kind: opts.kind, unit: opts.unit, subject: 'auditor',
        detect: function (m) { return opts.detect(m, who); }
      });
    });
  }

  auditorPair(['r069', 'r070'], 'Highest {name} Audit on Record', { kind: 'high', unit: 'score',
    detect: function (m, who) {
      var b = best(m.auditors[who].views, function (v) { return v.weighted[who]; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  auditorPair(['r071', 'r072'], 'Lowest {name} Audit on Record', { kind: 'low', unit: 'score',
    detect: function (m, who) {
      var b = least(m.auditors[who].views, function (v) { return v.weighted[who]; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  auditorPair(['r073', 'r074'], 'Highest {name} Career Mean', { kind: 'high', unit: 'score',
    detect: function (m, who) {
      var a = m.auditors[who];
      if (a.n < 5) return null;
      return { value: a.weighted.mean, holder: who, detail: { n: a.n } };
    } });

  auditorPair(['r075', 'r076'], 'Steadiest {name} Career Interval', { kind: 'low', unit: 'score',
    detect: function (m, who) {
      var a = m.auditors[who];
      if (a.n < 5 || a.weighted.sd == null) return null;
      return { value: a.weighted.sd, holder: who, detail: { n: a.n } };
    } });

  auditorPair(['r077', 'r078'], 'Audits Filed by {name}', { kind: 'high', unit: 'count',
    detect: function (m, who) {
      var v = milestone(m.auditors[who].n, MILESTONES);
      return v ? { value: v, holder: who, detail: { total: m.auditors[who].n } } : null;
    } });

  auditorPair(['r079', 'r080'], 'Locations Visited by {name}', { kind: 'high', unit: 'count',
    detect: function (m, who) {
      var a = m.auditors[who];
      var v = milestone(a.locationsVisited, SMALL_MILESTONES);
      return v ? { value: v, holder: who, valueText: a.locations.slice(-3).join(', '),
                   detail: { total: a.locationsVisited } } : null;
    } });

  auditorPair(['r081', 'r082'], 'Distinct Burgers Examined by {name}', { kind: 'high', unit: 'count',
    detect: function (m, who) {
      var a = m.auditors[who];
      var v = milestone(a.burgersEaten, SMALL_MILESTONES);
      return v ? { value: v, holder: who, detail: { total: a.burgersEaten } } : null;
    } });

  auditorPair(['r083', 'r084'], 'Widest {name} Scorecard', { kind: 'high', unit: 'score',
    detect: function (m, who) {
      var b = best(m.auditors[who].views, function (v) { return v.spread[who]; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  auditorPair(['r085', 'r086'], 'Narrowest {name} Scorecard', { kind: 'low', unit: 'score',
    detect: function (m, who) {
      var b = least(m.auditors[who].views, function (v) { return v.spread[who]; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  auditorPair(['r087', 'r088'], 'Perfect Scores Awarded by {name}', { kind: 'high', unit: 'count',
    detect: function (m, who) {
      var a = m.auditors[who];
      var v = milestone(a.count10, SMALL_MILESTONES);
      return v ? { value: v, holder: who, detail: { total: a.count10 } } : null;
    } });

  auditorPair(['r089', 'r090'], 'Scores Below 5.0 Issued by {name}', { kind: 'high', unit: 'count',
    detect: function (m, who) {
      var a = m.auditors[who];
      var v = milestone(a.countBelow5, SMALL_MILESTONES);
      return v ? { value: v, holder: who, detail: { total: a.countBelow5 } } : null;
    } });

  auditorPair(['r091', 'r092'], 'Longest {name} Run Above 9.0', { kind: 'high', unit: 'count',
    detect: function (m, who) {
      var run = longestRun(m.auditors[who].views, function (v) { return v.weighted[who] >= 9; });
      if (run.length < 2) return null;
      return { value: run.length, holder: who, at: run.last && run.last.createdAt,
               establishmentId: run.last && run.last.establishmentId,
               establishmentName: run.last && run.last.establishmentName };
    } });

  auditorPair(['r093', 'r094'], 'Sharpest {name} Recalibration', { kind: 'high', unit: 'score',
    detect: function (m, who) {
      var t = m.auditors[who].trend;
      if (!t || t.delta == null) return null;
      return { value: Math.abs(t.delta), holder: who,
               valueText: t.delta > 0 ? 'upward' : 'downward',
               detail: { early: t.early, late: t.late } };
    } });

  /* =============================================================
     BATCH 5 — AGREEMENT AND DISAGREEMENT (r095–r112)
     ============================================================= */

  R('r095', 'Closest Inter-Auditor Agreement', { family: 'agreement', kind: 'low', unit: 'score',
    detect: function (m) {
      var b = least(m.certified, function (v) { return v.meanAbsDelta; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r096', 'Widest Inter-Auditor Disagreement', { family: 'agreement', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.certified, function (v) { return v.meanAbsDelta; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r097', 'Largest Single-Category Dispute', { family: 'agreement', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.certified, function (v) { return v.maxAbsDelta; });
      return b ? est(b.item, b.value, { valueText: S.categoryLabel(b.item.maxAbsDeltaCat),
        detail: { category: b.item.maxAbsDeltaCat } }) : null;
    } });

  R('r098', 'Most Exact Category Matches at One Establishment', { family: 'agreement', kind: 'high', unit: 'count',
    detect: function (m) {
      var b = best(m.certified, function (v) { return v.exactCells; });
      return b && b.value >= 1 ? est(b.item, b.value) : null;
    } });

  R('r099', 'First Cell-for-Cell Concurrence', { family: 'agreement', kind: 'first', unit: 'count',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return v.exactCells === KEYS.length; })[0];
      return hit ? est(hit, KEYS.length) : null;
    } });

  R('r100', 'Highest Register Concurrence Rate', { family: 'agreement', kind: 'high', unit: 'pct', subject: 'register',
    detect: function (m) {
      if (m.counts.certified < 4) return null;
      return { value: m.paired.exactPct, detail: { n: m.counts.certified } };
    } });

  R('r101', 'Longest Run of Concurrence', { family: 'agreement', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var n = m.paired.streaks.agreement.longest;
      return n >= 2 ? { value: n, detail: { n: m.counts.certified } } : null;
    } });

  R('r102', 'Longest Run of Dispute', { family: 'agreement', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var n = m.paired.streaks.disagreement.longest;
      return n >= 2 ? { value: n, detail: { n: m.counts.certified } } : null;
    } });

  [['r103', 'ryan'], ['r104', 'devin']].forEach(function (pair) {
    R(pair[0], 'Longest ' + S.auditorName(pair[1]) + ' Ascendancy',
      { family: 'agreement', kind: 'high', unit: 'count', subject: 'auditor',
        detect: function (m) {
          var n = m.paired.streaks[pair[1] + 'Higher'].longest;
          return n >= 2 ? { value: n, holder: pair[1] } : null;
        } });
  });

  [['r105', 'ryan'], ['r106', 'devin']].forEach(function (pair) {
    R(pair[0], 'Clean Sweeps Recorded by ' + S.auditorName(pair[1]),
      { family: 'agreement', kind: 'high', unit: 'count', subject: 'auditor',
        detect: function (m) {
          var n = m.paired[pair[1] + 'Sweeps'];
          return n >= 1 ? { value: n, holder: pair[1] } : null;
        } });
  });

  R('r107', 'Narrowest Weighted Margin', { family: 'agreement', kind: 'low', unit: 'score',
    detect: function (m) {
      var b = least(m.certified, function (v) { return Math.abs(v.weightedDelta); });
      return b ? est(b.item, b.value) : null;
    } });

  R('r108', 'Widest Weighted Margin', { family: 'agreement', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.certified, function (v) { return Math.abs(v.weightedDelta); });
      return b ? est(b.item, b.value, { valueText: b.item.higher === 'tie' ? null : S.auditorName(b.item.higher),
        holder: b.item.higher === 'tie' ? null : b.item.higher }) : null;
    } });

  R('r109', 'Highest Ordering Concordance', { family: 'agreement', kind: 'high', unit: 'score', subject: 'register',
    detect: function (m) {
      var r = m.paired.rankCorrelation;
      return (r != null && m.counts.certified >= 4) ? { value: r, detail: { n: m.counts.certified } } : null;
    } });

  R('r110', 'Lowest Ordering Concordance', { family: 'agreement', kind: 'low', unit: 'score', subject: 'register',
    detect: function (m) {
      var r = m.paired.rankCorrelation;
      return (r != null && m.counts.certified >= 4) ? { value: r, detail: { n: m.counts.certified } } : null;
    } });

  R('r111', 'Largest Ranking Inversion', { family: 'agreement', kind: 'high', unit: 'count',
    detect: function (m) {
      var v = m.paired.biggestInversion;
      var n = m.paired.biggestInversionValue;
      return (v && n >= 2) ? est(v.view, n, { detail: { ryan: v.ryanRank, devin: v.devinRank } }) : null;
    } });

  R('r112', 'First Shared Number One', { family: 'agreement', kind: 'first', unit: 'cpi',
    detect: function (m) {
      if (!(m.counts.certified >= 3 && m.paired.sameNumberOne)) return null;
      var top = m.paired.ryanOrder[0];
      return est(top, top.cpi);
    } });

  /* =============================================================
     BATCH 6 — LOCATION ACHIEVEMENTS (r113–r132)
     ============================================================= */
  function locationRows(m, minCertified) {
    return m.activeLocations.map(function (l) {
      var views = m.certified.filter(function (v) { return v.locationIds.indexOf(l.id) !== -1; });
      var audits = m.auditViews.filter(function (a) { return a.locationId === l.id; });
      var cpis = finite(views.map(function (v) { return v.cpi; }));
      return {
        loc: l, views: views, audits: audits, cpis: cpis,
        meanCPI: mean(cpis), certified: views.length,
        establishments: l.establishments,
        indices: finite(audits.map(function (a) { return a.index; })),
        service: mean(finite(audits.map(function (a) { return S.categoryValue(a.scores[a.auditor], 'service'); })))
      };
    }).filter(function (row) { return row.certified >= (minCertified || 0); });
  }

  function locResult(row, value, extra) {
    if (!row) return null;
    return Object.assign({
      value: value,
      valueText: row.loc.name,
      at: row.audits.length ? row.audits[0].createdAt : null,
      detail: { key: row.loc.id, location: row.loc.name }
    }, extra || {});
  }

  R('r113', 'Strongest Location in the Metro', { family: 'location', kind: 'high', unit: 'cpi', subject: 'location',
    detect: function (m) {
      var b = best(locationRows(m, 2), function (r) { return r.meanCPI; });
      return b ? locResult(b.item, b.value) : null;
    } });

  R('r114', 'Weakest Location in the Metro', { family: 'location', kind: 'low', unit: 'cpi', subject: 'location',
    detect: function (m) {
      var b = least(locationRows(m, 2), function (r) { return r.meanCPI; });
      return b ? locResult(b.item, b.value) : null;
    } });

  R('r115', 'Most Audits at One Location', { family: 'location', kind: 'high', unit: 'count', subject: 'location',
    detect: function (m) {
      var b = best(m.activeLocations, function (l) { return l.audits; });
      return b && b.value >= 2 ? { value: b.value, valueText: b.item.name,
        detail: { key: b.item.id, location: b.item.name } } : null;
    } });

  R('r116', 'Most Establishments in One Location', { family: 'location', kind: 'high', unit: 'count', subject: 'location',
    detect: function (m) {
      var b = best(m.activeLocations, function (l) { return l.establishments; });
      return b && b.value >= 2 ? { value: b.value, valueText: b.item.name,
        detail: { key: b.item.id, location: b.item.name } } : null;
    } });

  R('r117', 'First Location to Reach Five Audits', { family: 'location', kind: 'first', unit: 'count', subject: 'location',
    detect: function (m) {
      var hit = m.activeLocations.filter(function (l) { return l.audits >= 5; })[0];
      return hit ? { value: hit.audits, valueText: hit.name, detail: { key: hit.id, location: hit.name } } : null;
    } });

  R('r118', 'Highest Index Recorded at Any Location', { family: 'location', kind: 'high', unit: 'cpi', subject: 'location',
    detect: function (m) {
      var rows = locationRows(m, 1);
      var b = best(rows, function (r) { return r.cpis.length ? Math.max.apply(null, r.cpis) : null; });
      return b ? locResult(b.item, b.value, {
        establishmentId: best(b.item.views, function (v) { return v.cpi; }).item.id,
        establishmentName: best(b.item.views, function (v) { return v.cpi; }).item.name
      }) : null;
    } });

  R('r119', 'Locations Entered in the Register', { family: 'location', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var v = milestone(m.counts.locations, SMALL_MILESTONES);
      return v ? { value: v, detail: { total: m.counts.locations } } : null;
    } });

  R('r120', 'First Bureau-Added Location Placed in Service', { family: 'location', kind: 'first', unit: 'count', subject: 'location',
    detect: function (m) {
      var hit = m.activeLocations.filter(function (l) { return !l.isPreset; })[0];
      return hit ? { value: hit.audits, valueText: hit.name, detail: { key: hit.id, location: hit.name } } : null;
    } });

  R('r121', 'Most Uneven Location', { family: 'location', kind: 'high', unit: 'cpi', subject: 'location',
    detect: function (m) {
      var b = best(locationRows(m, 2), function (r) {
        return r.cpis.length >= 2 ? Math.max.apply(null, r.cpis) - Math.min.apply(null, r.cpis) : null;
      });
      return b ? locResult(b.item, b.value) : null;
    } });

  R('r122', 'Most Uniform Location', { family: 'location', kind: 'low', unit: 'cpi', subject: 'location',
    detect: function (m) {
      var b = least(locationRows(m, 3), function (r) {
        return r.cpis.length >= 3 ? Math.max.apply(null, r.cpis) - Math.min.apply(null, r.cpis) : null;
      });
      return b ? locResult(b.item, b.value) : null;
    } });

  [['r123', 'ryan'], ['r124', 'devin']].forEach(function (pair) {
    R(pair[0], 'Most ' + S.auditorName(pair[1]) + ' Audits at One Location',
      { family: 'location', kind: 'high', unit: 'count', subject: 'location',
        detect: function (m) {
          var b = best(m.activeLocations, function (l) { return l[pair[1] + 'Audits']; });
          return b && b.value >= 2 ? { value: b.value, holder: pair[1], valueText: b.item.name,
            detail: { key: b.item.id, location: b.item.name } } : null;
        } });
  });

  R('r125', 'First Location Worked by Both Auditors', { family: 'location', kind: 'first', unit: 'count', subject: 'location',
    detect: function (m) {
      var hit = m.activeLocations.filter(function (l) { return l.ryanAudits > 0 && l.devinAudits > 0; })[0];
      return hit ? { value: hit.audits, valueText: hit.name, detail: { key: hit.id, location: hit.name } } : null;
    } });

  R('r126', 'Best-Served Location', { family: 'location', kind: 'high', unit: 'score', subject: 'location',
    detect: function (m) {
      var b = best(locationRows(m, 1).filter(function (r) { return r.audits.length >= 2; }),
        function (r) { return r.service; });
      return b ? locResult(b.item, b.value) : null;
    } });

  R('r127', 'Worst-Served Location', { family: 'location', kind: 'low', unit: 'score', subject: 'location',
    detect: function (m) {
      var b = least(locationRows(m, 1).filter(function (r) { return r.audits.length >= 2; }),
        function (r) { return r.service; });
      return b ? locResult(b.item, b.value) : null;
    } });

  R('r128', 'Most Certified Establishments in One Location', { family: 'location', kind: 'high', unit: 'count', subject: 'location',
    detect: function (m) {
      var b = best(locationRows(m, 1), function (r) { return r.certified; });
      return b && b.value >= 2 ? locResult(b.item, b.value) : null;
    } });

  R('r129', 'Seat of the Leading Establishment', { family: 'location', kind: 'identity', unit: 'cpi', subject: 'location',
    detect: function (m) {
      var top = m.ranked[0];
      if (!top || !top.locations.length) return null;
      return est(top, top.cpi, { valueText: top.locations[0], detail: { key: top.locations[0] + '|' + top.id } });
    } });

  R('r130', 'Most Burgers Examined in One Location', { family: 'location', kind: 'high', unit: 'count', subject: 'location',
    detect: function (m) {
      var rows = locationRows(m, 0).map(function (r) {
        var names = {};
        r.audits.forEach(function (a) { names[T.normalizeName(a.burger)] = true; });
        r.burgers = Object.keys(names).length;
        return r;
      });
      var b = best(rows, function (r) { return r.burgers; });
      return b && b.value >= 2 ? locResult(b.item, b.value) : null;
    } });

  R('r131', 'Best Value in the Metro', { family: 'location', kind: 'high', unit: 'score', subject: 'location',
    detect: function (m) {
      var b = best(locationRows(m, 1).filter(function (r) { return r.audits.length >= 2; }), function (r) {
        return mean(finite(r.audits.map(function (a) { return S.categoryValue(a.scores[a.auditor], 'value'); })));
      });
      return b ? locResult(b.item, b.value) : null;
    } });

  R('r132', 'First Certification Outside the Preset Register', { family: 'location', kind: 'first', unit: 'cpi', subject: 'location',
    detect: function (m) {
      var custom = {};
      m.activeLocations.forEach(function (l) { if (!l.isPreset) custom[l.id] = l.name; });
      var hit = m.paired.views.filter(function (v) {
        return v.locationIds.some(function (id) { return custom[id]; });
      })[0];
      if (!hit) return null;
      var id = hit.locationIds.filter(function (x) { return custom[x]; })[0];
      return est(hit, hit.cpi, { valueText: custom[id], detail: { key: id, location: custom[id] } });
    } });

  /* =============================================================
     BATCH 7 — ESTABLISHMENT CATEGORY ACHIEVEMENTS (r133–r148)
     ============================================================= */
  function categoryRows(m, minCertified) {
    return m.categoryIndex.filter(function (c) { return c.certified >= (minCertified || 0); });
  }

  R('r133', 'Strongest Establishment Class', { family: 'class', kind: 'high', unit: 'cpi', subject: 'class',
    detect: function (m) {
      var b = best(categoryRows(m, 2), function (c) { return c.meanCPI; });
      return b ? { value: b.value, valueText: b.item.label, detail: { key: b.item.key, category: b.item.label } } : null;
    } });

  R('r134', 'Weakest Establishment Class', { family: 'class', kind: 'low', unit: 'cpi', subject: 'class',
    detect: function (m) {
      var b = least(categoryRows(m, 2), function (c) { return c.meanCPI; });
      return b ? { value: b.value, valueText: b.item.label, detail: { key: b.item.key, category: b.item.label } } : null;
    } });

  R('r135', 'Largest Establishment Class', { family: 'class', kind: 'high', unit: 'count', subject: 'class',
    detect: function (m) {
      var b = best(m.categoryIndex, function (c) { return c.establishments; });
      return b && b.value >= 2 ? { value: b.value, valueText: b.item.label,
        detail: { key: b.item.key, category: b.item.label } } : null;
    } });

  R('r136', 'Most Audited Establishment Class', { family: 'class', kind: 'high', unit: 'count', subject: 'class',
    detect: function (m) {
      var b = best(m.categoryIndex, function (c) { return c.audits; });
      return b && b.value >= 3 ? { value: b.value, valueText: b.item.label,
        detail: { key: b.item.key, category: b.item.label } } : null;
    } });

  var CLASS_IDS = ['r137', 'r138', 'r139', 'r140', 'r141', 'r142', 'r143', 'r144'];
  var CLASS_KEYS = ['fast-food', 'bar-pub', 'casual-dining', 'fast-casual',
                    'diner-cafe', 'brewery', 'fine-dining', 'food-truck'];
  CLASS_KEYS.forEach(function (key, i) {
    R(CLASS_IDS[i], 'Champion of ' + T.categoryLabel(key), { family: 'class', kind: 'high', unit: 'cpi',
      detect: function (m) {
        var pool = m.certified.filter(function (v) { return v.category === key; });
        var b = best(pool, function (v) { return v.cpi; });
        return b ? est(b.item, b.value, { detail: { category: key } }) : null;
      } });
  });

  R('r145', 'Establishment Classes Represented', { family: 'class', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var v = milestone(m.counts.categories, [3, 5, 7, 9]);
      return v ? { value: v, detail: { total: m.counts.categories } } : null;
    } });

  R('r146', 'Best-Served Establishment Class', { family: 'class', kind: 'high', unit: 'score', subject: 'class',
    detect: function (m) {
      var rows = m.categoryIndex.map(function (c) {
        var views = m.certified.filter(function (v) { return v.category === c.key; });
        return { c: c, n: views.length, service: mean(finite(views.map(function (v) { return v.combined.service; }))) };
      }).filter(function (r) { return r.n >= 2; });
      var b = best(rows, function (r) { return r.service; });
      return b ? { value: b.value, valueText: b.item.c.label,
        detail: { key: b.item.c.key, category: b.item.c.label } } : null;
    } });

  R('r147', 'Poorest Value Class', { family: 'class', kind: 'low', unit: 'score', subject: 'class',
    detect: function (m) {
      var rows = m.categoryIndex.map(function (c) {
        var views = m.certified.filter(function (v) { return v.category === c.key; });
        return { c: c, n: views.length, value: mean(finite(views.map(function (v) { return v.combined.value; }))) };
      }).filter(function (r) { return r.n >= 2; });
      var b = least(rows, function (r) { return r.value; });
      return b ? { value: b.value, valueText: b.item.c.label,
        detail: { key: b.item.c.key, category: b.item.c.label } } : null;
    } });

  R('r148', 'First Class to Hold Three Certifications', { family: 'class', kind: 'first', unit: 'count', subject: 'class',
    detect: function (m) {
      var hit = m.categoryIndex.filter(function (c) { return c.certified >= 3; })[0];
      return hit ? { value: hit.certified, valueText: hit.label,
        detail: { key: hit.key, category: hit.label } } : null;
    } });

  /* =============================================================
     BATCH 8 — SERVICE (r149–r164)
     ============================================================= */

  R('r149', 'Largest Service Advantage Over the Register', { family: 'service', kind: 'high', unit: 'score',
    detect: function (m) {
      if (m.counts.certified < 3) return null;
      var par = m.categoryBoard.service.mean;
      if (par == null) return null;
      var b = best(m.certified, function (v) { return v.combined.service - par; });
      return b && b.value > 0 ? est(b.item, b.value, { detail: { par: par } }) : null;
    } });

  R('r150', 'Largest Service Deficit Against the Register', { family: 'service', kind: 'high', unit: 'score',
    detect: function (m) {
      if (m.counts.certified < 3) return null;
      var par = m.categoryBoard.service.mean;
      if (par == null) return null;
      var b = best(m.certified, function (v) { return par - v.combined.service; });
      return b && b.value > 0 ? est(b.item, b.value, { detail: { par: par } }) : null;
    } });

  [['r151', 'serviceSpeed', 'high', 'Fastest Service Recorded'],
   ['r152', 'serviceSpeed', 'low', 'Slowest Service Recorded'],
   ['r153', 'serviceFriendliness', 'high', 'Warmest Service Recorded'],
   ['r154', 'serviceFriendliness', 'low', 'Coldest Service Recorded']].forEach(function (row) {
    R(row[0], row[3], { family: 'service', kind: row[2], unit: 'score',
      detect: function (m) {
        var pick = row[2] === 'high' ? best : least;
        var b = pick(m.auditViews, function (v) { return Number(v.scores[v.auditor][row[1]]); });
        return b ? fromAudit(b.item, b.value, { detail: { subscore: row[1], burger: b.item.burger } }) : null;
      } });
  });

  R('r155', 'Most Divided Service Assessment', { family: 'service', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.auditViews, function (v) {
        var s = v.scores[v.auditor];
        return Math.abs(Number(s.serviceSpeed) - Number(s.serviceFriendliness));
      });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  R('r156', 'First Perfectly Balanced Service', { family: 'service', kind: 'first', unit: 'score',
    detect: function (m) {
      var hit = m.auditViews.filter(function (v) {
        var s = v.scores[v.auditor];
        return Number(s.serviceSpeed) === Number(s.serviceFriendliness);
      })[0];
      return hit ? fromAudit(hit, S.categoryValue(hit.scores[hit.auditor], 'service')) : null;
    } });

  [['r157', 'ryan'], ['r158', 'devin']].forEach(function (pair) {
    R(pair[0], 'Highest ' + S.auditorName(pair[1]) + ' Service Mean',
      { family: 'service', kind: 'high', unit: 'score', subject: 'auditor',
        detect: function (m) {
          var a = m.auditors[pair[1]];
          if (a.n < 4) return null;
          return { value: a.cat.service.mean, holder: pair[1], detail: { n: a.n } };
        } });
  });

  R('r159', 'Widest Service Dispute', { family: 'service', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.certified, function (v) { return v.absDeltas.service; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r160', 'First Establishment Carried by Service', { family: 'service', kind: 'first', unit: 'score',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return v.best.combined === 'service'; })[0];
      return hit ? est(hit, hit.combined.service) : null;
    } });

  R('r161', 'First Establishment Undone by Service', { family: 'service', kind: 'first', unit: 'score',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return v.worst.combined === 'service'; })[0];
      return hit ? est(hit, hit.combined.service) : null;
    } });

  R('r162', 'Longest Run of Service Failure', { family: 'service', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var n = m.paired.streaks.serviceBottom.longest;
      return n >= 2 ? { value: n } : null;
    } });

  R('r163', 'Highest Register Service Mean', { family: 'service', kind: 'high', unit: 'score', subject: 'register',
    detect: function (m) {
      if (m.counts.certified < 4) return null;
      return { value: m.categoryBoard.service.mean, detail: { n: m.counts.certified } };
    } });

  R('r164', 'Perfect Friendliness Citations', { family: 'service', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var n = m.auditViews.filter(function (v) { return Number(v.scores[v.auditor].serviceFriendliness) === 10; }).length;
      var v = milestone(n, SMALL_MILESTONES);
      return v ? { value: v, detail: { total: n } } : null;
    } });

  /* =============================================================
     BATCH 9 — STREAKS AND CHRONOLOGY (r165–r180)
     ============================================================= */

  R('r165', 'Longest Drought of Perfect Scores', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var n = m.paired.streaks.noTens.longest;
      return n >= 3 ? { value: n } : null;
    } });

  [['r166', 'pattyTop', 'Longest Reign of the Patty'],
   ['r167', 'friesBottom', 'Longest Collapse of the Fries'],
   ['r168', 'valueBottom', 'Longest Failure of Value']].forEach(function (row) {
    R(row[0], row[2], { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
      detect: function (m) {
        var n = m.paired.streaks[row[1]].longest;
        return n >= 2 ? { value: n } : null;
      } });
  });

  R('r169', 'Busiest Single Day', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var days = groupCount(m.auditViews, function (v) { return dayKey(v.createdAt); });
      var b = best(days, function (d) { return d.items.length; });
      return b && b.value >= 3 ? { value: b.value, valueText: b.item.key, at: b.item.items[0].createdAt } : null;
    } });

  R('r170', 'Busiest Single Week', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var weeks = groupCount(m.auditViews, function (v) { return isoWeekKey(v.createdAt); });
      var b = best(weeks, function (d) { return d.items.length; });
      return b && b.value >= 4 ? { value: b.value, at: b.item.items[0].createdAt } : null;
    } });

  R('r171', 'Longest Run of Consecutive Filing Days', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var days = Object.keys(m.auditViews.reduce(function (acc, v) { acc[dayKey(v.createdAt)] = true; return acc; }, {})).sort();
      if (days.length < 2) return null;
      var run = 1, longest = 1, at = days[0];
      for (var i = 1; i < days.length; i++) {
        var gap = (Date.parse(days[i]) - Date.parse(days[i - 1])) / DAY;
        if (gap === 1) { run += 1; if (run > longest) { longest = run; at = days[i]; } }
        else run = 1;
      }
      return longest >= 2 ? { value: longest, at: at + 'T12:00:00.000Z' } : null;
    } });

  R('r172', 'Longest Institutional Silence', { family: 'streak', kind: 'high', unit: 'days', subject: 'register',
    detect: function (m) {
      var gaps = finite(m.activity.gaps);
      if (!gaps.length) return null;
      var v = Math.max.apply(null, gaps) / DAY;
      return v >= 1 ? { value: v } : null;
    } });

  R('r173', 'Shortest Interval Between Filings', { family: 'streak', kind: 'low', unit: 'hours', subject: 'register',
    detect: function (m) {
      var gaps = finite(m.activity.gaps).filter(function (g) { return g > 0; });
      if (!gaps.length) return null;
      return { value: Math.min.apply(null, gaps) / 3600000 };
    } });

  R('r174', 'Most Certifications in One Day', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var rows = m.paired.views.map(function (v) {
        var later = Math.max(Date.parse(v.auditsBy.ryan[0].createdAt), Date.parse(v.auditsBy.devin[0].createdAt));
        return { key: dayKey(new Date(later).toISOString()), view: v };
      });
      var days = groupCount(rows, function (r) { return r.key; });
      var b = best(days, function (d) { return d.items.length; });
      return b && b.value >= 2 ? { value: b.value, valueText: b.item.key } : null;
    } });

  R('r175', 'Longest Run of Distinction', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var run = longestRun(m.paired.views, function (v) { return v.cpi >= 80; });
      return run.length >= 3 ? { value: run.length, at: run.last && run.last.createdAt } : null;
    } });

  R('r176', 'Longest Run of Mediocrity', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var run = longestRun(m.paired.views, function (v) { return v.cpi < 70; });
      return run.length >= 3 ? { value: run.length, at: run.last && run.last.createdAt } : null;
    } });

  R('r177', 'Longest Unanswered Run by One Auditor', { family: 'streak', kind: 'high', unit: 'count', subject: 'auditor',
    detect: function (m) {
      var list = m.auditViews;
      var longest = 0, run = 0, who = null, current = null, at = null;
      list.forEach(function (v) {
        if (v.auditor === current) run += 1;
        else { current = v.auditor; run = 1; }
        if (run > longest) { longest = run; who = current; at = v.createdAt; }
      });
      return longest >= 3 ? { value: longest, holder: who, at: at } : null;
    } });

  R('r178', 'Longest Run Within a Tenth', { family: 'streak', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var run = longestRun(m.paired.views, function (v) { return v.meanAbsDelta <= 0.1; });
      return run.length >= 2 ? { value: run.length, at: run.last && run.last.createdAt } : null;
    } });

  R('r179', 'Earliest Filing of the Day', { family: 'streak', kind: 'low', unit: 'hour',
    detect: function (m) {
      var b = least(m.auditViews, function (v) {
        var d = new Date(v.createdAt);
        return isFinite(d.getTime()) ? d.getUTCHours() + d.getUTCMinutes() / 60 : null;
      });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  R('r180', 'Latest Filing of the Day', { family: 'streak', kind: 'high', unit: 'hour',
    detect: function (m) {
      var b = best(m.auditViews, function (v) {
        var d = new Date(v.createdAt);
        return isFinite(d.getTime()) ? d.getUTCHours() + d.getUTCMinutes() / 60 : null;
      });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  /* =============================================================
     BATCH 10 — COMPOSITE AND RARE (r181–r200)
     ============================================================= */

  R('r181', 'Highest Index Under Sustained Examination', { family: 'rare', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var pool = m.certified.filter(function (v) { return v.visits >= 4; });
      var b = best(pool, function (v) { return v.cpi; });
      return b ? est(b.item, b.value, { detail: { visits: b.item.visits } }) : null;
    } });

  R('r182', 'Highest Index Across Three Branches', { family: 'rare', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var pool = m.certified.filter(function (v) { return v.locations.length >= 3; });
      var b = best(pool, function (v) { return v.cpi; });
      return b ? est(b.item, b.value, { valueText: b.item.locations.join(', ') }) : null;
    } });

  R('r183', 'Most Examined Establishment Still in Agreement', { family: 'rare', kind: 'high', unit: 'count',
    detect: function (m) {
      var pool = m.certified.filter(function (v) { return v.visits >= 3 && v.meanAbsDelta <= 0.4; });
      var b = best(pool, function (v) { return v.visits; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r184', 'Largest Deviation From an Establishment Composite', { family: 'rare', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var rows = [];
      m.certified.forEach(function (v) {
        v.compliantAudits.forEach(function (a) {
          var w = S.calculateWeightedReviewerScore(S.withService(a));
          if (w == null) return;
          rows.push({ view: v, audit: a, delta: Math.abs(w * 10 - v.cpi) });
        });
      });
      var b = best(rows, function (r) { return r.delta; });
      return b && b.value > 0 ? est(b.item.view, b.value, {
        holder: b.item.audit.auditorKey, at: b.item.audit.createdAt,
        valueText: b.item.audit.burger, detail: { location: b.item.audit.locationName }
      }) : null;
    } });

  R('r185', 'Highest Index Without a Single 9.0', { family: 'rare', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var pool = m.certified.filter(function (v) {
        return !v.compliantAudits.some(function (a) {
          return S.INPUT_KEYS.some(function (k) { return Number(a[k]) >= 9; });
        });
      });
      var b = best(pool, function (v) { return v.cpi; });
      return b ? est(b.item, b.value) : null;
    } });

  R('r186', 'Lowest Index Containing a 9.0', { family: 'rare', kind: 'low', unit: 'cpi',
    detect: function (m) {
      var pool = m.certified.filter(function (v) {
        return v.compliantAudits.some(function (a) {
          return S.INPUT_KEYS.some(function (k) { return Number(a[k]) >= 9; });
        });
      });
      var b = least(pool, function (v) { return v.cpi; });
      return b ? est(b.item, b.value) : null;
    } });

  function driftRows(m) {
    var rows = [];
    m.certified.forEach(function (v) {
      if (v.visits < 3) return;
      var ordered = v.compliantAudits.slice().sort(function (a, b) {
        return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      }).map(function (a) { return S.calculateWeightedReviewerScore(S.withService(a)); }).filter(function (n) { return n != null; });
      if (ordered.length < 3) return;
      var half = Math.floor(ordered.length / 2);
      var early = mean(ordered.slice(0, half));
      var late = mean(ordered.slice(ordered.length - half));
      rows.push({ view: v, delta: (late - early) * 10 });
    });
    return rows;
  }

  R('r187', 'Most Improved Establishment', { family: 'rare', kind: 'high', unit: 'cpi',
    detect: function (m) {
      var b = best(driftRows(m), function (r) { return r.delta; });
      return b && b.value > 0 ? est(b.item.view, b.value) : null;
    } });

  R('r188', 'Most Deteriorated Establishment', { family: 'rare', kind: 'low', unit: 'cpi',
    detect: function (m) {
      var b = least(driftRows(m), function (r) { return r.delta; });
      return b && b.value < 0 ? est(b.item.view, b.value) : null;
    } });

  R('r189', 'Widest Gulf Within One Class', { family: 'rare', kind: 'high', unit: 'cpi', subject: 'class',
    detect: function (m) {
      var rows = m.categoryIndex.map(function (c) {
        var views = m.certified.filter(function (v) { return v.category === c.key; });
        if (views.length < 2) return null;
        var cpis = views.map(function (v) { return v.cpi; });
        return { c: c, gap: Math.max.apply(null, cpis) - Math.min.apply(null, cpis) };
      }).filter(Boolean);
      var b = best(rows, function (r) { return r.gap; });
      return b ? { value: b.value, valueText: b.item.c.label,
        detail: { key: b.item.c.key, category: b.item.c.label } } : null;
    } });

  R('r190', 'Widest Category Separation in the Register', { family: 'rare', kind: 'high', unit: 'score', subject: 'register',
    detect: function (m) {
      if (m.counts.certified < 3) return null;
      var means = finite(KEYS.map(function (k) { return m.categoryBoard[k].mean; }));
      if (means.length < 2) return null;
      return { value: Math.max.apply(null, means) - Math.min.apply(null, means),
               valueText: S.categoryLabel(m.strongestCat) + ' over ' + S.categoryLabel(m.weakestCat) };
    } });

  R('r191', 'Certifications Built on Different Burgers', { family: 'rare', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var n = m.paired.views.filter(function (v) { return !v.sameBurger; }).length;
      var v = milestone(n, SMALL_MILESTONES);
      return v ? { value: v, detail: { total: n } } : null;
    } });

  R('r192', 'First Establishment Certified Across Three Branches', { family: 'rare', kind: 'first', unit: 'count',
    detect: function (m) {
      var hit = m.paired.views.filter(function (v) { return v.locations.length >= 3; })[0];
      return hit ? est(hit, hit.locations.length, { valueText: hit.locations.join(', ') }) : null;
    } });

  R('r193', 'Highest Weighted Score Ever Filed', { family: 'rare', kind: 'high', unit: 'score',
    detect: function (m) {
      var b = best(m.auditViews, function (v) { return v.weighted[v.auditor]; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  R('r194', 'Lowest Weighted Score Ever Filed', { family: 'rare', kind: 'low', unit: 'score',
    detect: function (m) {
      var b = least(m.auditViews, function (v) { return v.weighted[v.auditor]; });
      return b ? fromAudit(b.item, b.value) : null;
    } });

  R('r195', 'Most Branches Held by One Establishment', { family: 'rare', kind: 'high', unit: 'count',
    detect: function (m) {
      var b = best(m.certified, function (v) { return v.locations.length; });
      return b && b.value >= 3 ? est(b.item, b.value, { valueText: b.item.locations.join(', ') }) : null;
    } });

  R('r196', 'Cumulative Filings Milestone', { family: 'rare', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var v = milestone(m.counts.audits, [100, 250, 500, 1000]);
      return v ? { value: v, detail: { total: m.counts.audits } } : null;
    } });

  R('r197', 'Highest Proportion of the Register Certified', { family: 'rare', kind: 'high', unit: 'pct', subject: 'register',
    detect: function (m) {
      if (m.counts.establishments < 5) return null;
      return { value: (m.counts.certified / m.counts.establishments) * 100,
               detail: { certified: m.counts.certified, total: m.counts.establishments } };
    } });

  R('r198', 'First Register Cleared of All Pending Work', { family: 'rare', kind: 'first', unit: 'count', subject: 'register',
    detect: function (m) {
      if (m.counts.establishments < 4) return null;
      if (m.counts.pending !== 0 || m.counts.empty !== 0) return null;
      return { value: m.counts.certified, detail: { total: m.counts.establishments } };
    } });

  R('r199', 'Category Cells Scored', { family: 'rare', kind: 'high', unit: 'count', subject: 'register',
    detect: function (m) {
      var n = m.auditors.ryan.totalCells + m.auditors.devin.totalCells;
      var v = milestone(n, [50, 100, 250, 500, 1000, 2500]);
      return v ? { value: v, detail: { total: n } } : null;
    } });

  R('r200', 'Longest-Standing Entry in the Records Office', { family: 'rare', kind: 'identity', unit: 'text', subject: 'register',
    detect: function (m, ctx) {
      var existing = (ctx && ctx.existing) || [];
      var pool = existing.filter(function (r) { return r.recordId !== 'r200' && r.establishedAt; });
      if (pool.length < 3) return null;
      var oldest = pool.slice().sort(function (a, b) {
        return Date.parse(a.establishedAt) - Date.parse(b.establishedAt);
      })[0];
      var def = byId[oldest.recordId];
      return {
        value: null,
        valueText: def ? def.title : oldest.recordId,
        at: oldest.establishedAt,
        holder: oldest.holder,
        establishmentId: oldest.establishmentId,
        establishmentName: oldest.establishmentName,
        detail: { key: oldest.recordId, since: oldest.establishedAt }
      };
    } });

  /* =============================================================
     DETECTION AND DIFFING
     ============================================================= */

  function hash(input) {
    var h = 2166136261;
    var s = String(input);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function fingerprintOf(def, candidate) {
    var value = candidate.value == null ? '-' : S.roundTo(Number(candidate.value), 6);
    return def.id + '-' + hash([
      def.id, candidate.holder || '-', candidate.establishmentId || '-',
      value, candidate.valueText || '-', (candidate.detail && candidate.detail.key) || '-'
    ].join('|'));
  }

  /** Should `candidate` displace `current`? */
  function beats(def, candidate, current) {
    if (!candidate) return false;
    if (!current) return true;
    if (def.kind === 'first') return false;
    if (def.kind === 'identity') {
      var a = (candidate.detail && candidate.detail.key) || null;
      var b = (current.detail && current.detail.key) || null;
      return a !== b;
    }
    if (candidate.value == null || current.value == null) return false;
    var next = Number(candidate.value), now = Number(current.value);
    if (!isFinite(next) || !isFinite(now)) return false;
    /* Strict comparison: an equal result never displaces the holder. */
    return def.kind === 'low' ? next < now : next > now;
  }

  function runDetect(def, m, ctx) {
    try {
      var out = def.detect(m, ctx);
      if (!out) return null;
      if (out.value != null && !isFinite(Number(out.value))) return null;
      return out;
    } catch (err) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[BPS] record detector threw:', def.id, err.message);
      }
      return null;
    }
  }

  /**
   * Compare live metrics against the stored register.
   * Returns { changes: [row], byId: {...} } — never writes anything.
   */
  function detect(m, existingRows) {
    var existing = existingRows || [];
    var current = {};
    existing.forEach(function (r) { current[r.recordId] = r; });
    var ctx = { existing: existing, byId: current };

    var changes = [];
    DEFINITIONS.forEach(function (def) {
      var candidate = runDetect(def, m, ctx);
      if (!candidate) return;
      var now = current[def.id] || null;
      if (!beats(def, candidate, now)) return;
      var row = {
        recordId: def.id,
        holder: candidate.holder == null ? null : candidate.holder,
        establishmentId: candidate.establishmentId == null ? null : candidate.establishmentId,
        establishmentName: candidate.establishmentName == null ? null : candidate.establishmentName,
        value: candidate.value == null ? null : Number(candidate.value),
        valueText: candidate.valueText == null ? null : String(candidate.valueText),
        detail: candidate.detail || {},
        establishedAt: candidate.at || new Date().toISOString(),
        broke: !!now,
        previous: now ? {
          holder: now.holder, value: now.value, valueText: now.valueText,
          establishmentName: now.establishmentName, establishedAt: now.establishedAt
        } : null
      };
      row.fingerprint = fingerprintOf(def, candidate);
      /* A rewritten candidate that hashes identically is not news. */
      if (now && now.fingerprint === row.fingerprint) return;
      changes.push(row);
    });
    return { changes: changes, current: current };
  }

  /* ---------- presentation helpers (no DOM) ---------- */
  function definition(id) { return byId[id] || null; }

  function titleOf(id) {
    var def = byId[id];
    return def ? def.title : 'Unlisted Bureau Record';
  }

  function formatValue(record) {
    var def = byId[record.recordId];
    var unit = def ? def.unit : 'score';
    var v = record.value;
    if (v == null || !isFinite(v)) return record.valueText || '—';
    switch (unit) {
      case 'cpi':   return S.formatCPI(v);
      case 'score': return S.formatScore(v);
      case 'pct':   return S.formatPct(v, 1);
      case 'count': return String(Math.round(v));
      case 'days':  return S.roundTo(v, 1) + (S.roundTo(v, 1) === 1 ? ' day' : ' days');
      case 'hours': return S.roundTo(v, 1) + (S.roundTo(v, 1) === 1 ? ' hour' : ' hours');
      case 'hour':  {
        var h = Math.floor(v), mn = Math.round((v - h) * 60);
        return String(h).padStart(2, '0') + ':' + String(mn).padStart(2, '0') + ' UTC';
      }
      default: return String(S.roundTo(v, 2));
    }
  }

  function subjectOf(record) {
    var def = byId[record.recordId];
    if (record.establishmentName) return record.establishmentName;
    if (record.valueText) return record.valueText;
    if (record.holder) return S.auditorName(record.holder);
    return def && def.subject === 'register' ? 'The Register' : '—';
  }

  function stats() {
    var families = {};
    var kinds = {};
    DEFINITIONS.forEach(function (d) {
      families[d.family] = (families[d.family] || 0) + 1;
      kinds[d.kind] = (kinds[d.kind] || 0) + 1;
    });
    return {
      definitions: DEFINITIONS.length,
      families: families,
      familyCount: Object.keys(families).length,
      kinds: kinds,
      ids: DEFINITIONS.map(function (d) { return d.id; })
    };
  }

  return {
    DEFINITIONS: DEFINITIONS,
    byId: byId,
    definition: definition,
    titleOf: titleOf,
    detect: detect,
    beats: beats,
    fingerprintOf: fingerprintOf,
    formatValue: formatValue,
    subjectOf: subjectOf,
    stats: stats,
    helpers: X
  };
});
