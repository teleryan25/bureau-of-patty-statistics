/* Bureau event detection. Pure data in, deterministic state out. */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.BPS = root.BPS || {};
  root.BPS.disasters = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var IDS = [];
  for (var i = 1; i <= 20; i++) IDS.push('d' + String(i).padStart(2, '0'));

  function finite(n, fallback) {
    return n != null && isFinite(n) ? Number(n) : (fallback == null ? 0 : fallback);
  }

  function countWhere(list, fn) {
    return (list || []).reduce(function (n, item) { return n + (fn(item) ? 1 : 0); }, 0);
  }

  function normal(s) {
    return String(s || '').toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function categorySeparation(m) {
    var rows = Object.keys(m.categoryBoard || {}).map(function (key) {
      return { key: key, mean: finite(m.categoryBoard[key].mean, null) };
    }).filter(function (row) { return row.mean != null; }).sort(function (a, b) { return a.mean - b.mean; });
    return rows.length > 1 ? { key: rows[0].key, gap: rows[1].mean - rows[0].mean } : { key: null, gap: 0 };
  }

  /* Concentration at the summit of the register. The ranked entity is the
     establishment, so occupation is measured by how much of the evidence
     base the leader holds rather than by repeated rows. */
  function topOccupation(m) {
    var leader = (m.ranked || [])[0];
    if (!leader) return { count: 0, name: null };
    var group = (m.restaurants || []).filter(function (r) { return r.key === leader.id; })[0];
    var count = group ? group.count : (leader.visits || 0);
    return { count: count, name: leader.name || leader.restaurant };
  }

  function categoryCount(m) {
    var board = (m && m.categoryBoard) || {};
    var n = Object.keys(board).length;
    return n || 7;
  }

  function cpiCluster(views) {
    var groups = {};
    (views || []).forEach(function (v) {
      if (v.cpi == null || !isFinite(v.cpi)) return;
      var key = Number(v.cpi).toFixed(3);
      groups[key] = (groups[key] || 0) + 1;
    });
    return Object.keys(groups).reduce(function (best, key) {
      return groups[key] > best.count ? { count: groups[key], value: Number(key) } : best;
    }, { count: 0, value: null });
  }

  function oscillation(views) {
    var values = (views || []).map(function (v) { return v.cpi; }).filter(function (n) { return n != null && isFinite(n); });
    var priorDirection = 0;
    var reversals = 0;
    for (var i = 1; i < values.length; i++) {
      var delta = values[i] - values[i - 1];
      if (Math.abs(delta) < 15) { priorDirection = 0; continue; }
      var direction = delta > 0 ? 1 : -1;
      if (priorDirection && direction !== priorDirection) reversals += 1;
      priorDirection = direction;
    }
    return reversals;
  }

  function featureVector(m) {
    m = m || {};
    var p = m.paired || {};
    var views = m.certified || p.views || [];
    var pendingFor = m.pendingFor || {};
    var ryan = (m.auditors && m.auditors.ryan) || {};
    var devin = (m.auditors && m.auditors.devin) || {};
    var catGap = categorySeparation(m);
    var occupation = topOccupation(m);
    var cluster = cpiCluster(views);
    var streaks = p.streaks || {};
    var ryanRun = finite(streaks.ryanHigher && streaks.ryanHigher.current);
    var devinRun = finite(streaks.devinHigher && streaks.devinHigher.current);
    var stable = [
      { key: 'ryan', n: finite(ryan.n), sd: finite(ryan.weighted && ryan.weighted.sd, 999) },
      { key: 'devin', n: finite(devin.n), sd: finite(devin.weighted && devin.weighted.sd, 999) }
    ].sort(function (a, b) { return a.sd - b.sd; })[0];
    var negativeCats = countWhere(Object.keys(p.byCategory || {}), function (key) {
      return finite(p.byCategory[key].correlation, 1) <= -0.65;
    });
    var universalWeak = null;
    if (views.length) {
      universalWeak = views[0].worst && views[0].worst.combined;
      if (!universalWeak || !views.every(function (v) { return v.worst && v.worst.combined === universalWeak; })) {
        universalWeak = null;
      }
    }
    var repeats = (m.restaurants || []).slice().sort(function (a, b) { return b.count - a.count; })[0] || {};
    var cells = categoryCount(m);
    var exactSpecimens = countWhere(views, function (v) { return v.exactCells === cells; });
    var perfects = countWhere(views, function (v) { return finite(v.cpi, -1) >= 99.95; });
    var catastrophes = countWhere(views, function (v) { return finite(v.cpi, 101) <= 12; });
    var oldestDays = Math.max(0, finite(m.oldestPendingMs) / 86400000);

    return {
      n: finite(m.counts && m.counts.certified),
      pending: finite(m.counts && m.counts.pending),
      audits: finite(m.counts && m.counts.audits),
      exactSpecimens: exactSpecimens,
      maxWeightedGap: finite(p.biggestWeightedValue),
      rankCorrelation: p.rankCorrelation == null ? 1 : finite(p.rankCorrelation, 1),
      exactPct: finite(p.exactPct),
      sameNumberOne: !!p.sameNumberOne,
      sameLast: !!p.sameLast,
      oldestPendingDays: oldestDays,
      pendingRyan: (pendingFor.ryan || []).length,
      pendingDevin: (pendingFor.devin || []).length,
      auditImbalance: Math.abs(finite(ryan.n) - finite(devin.n)),
      cpiRange: finite(p.cpi && p.cpi.range, 999),
      cpiSd: finite(p.cpi && p.cpi.sd, 999),
      repeatCount: finite(repeats.count),
      repeatRange: finite(repeats.rangeCPI),
      repeatName: repeats.name || null,
      categoryGap: catGap.gap,
      categoryKey: catGap.key,
      perfects: perfects,
      catastrophes: catastrophes,
      exactCells: finite(p.exactCells),
      disagreement: finite(p.meanAbsDisagreement),
      dominanceRun: Math.max(ryanRun, devinRun),
      dominanceKey: ryanRun >= devinRun ? 'ryan' : 'devin',
      stableN: stable.n,
      stableSd: stable.sd,
      stableKey: stable.key,
      reversals: oscillation(p.views || views),
      negativeCats: negativeCats,
      universalWeak: universalWeak,
      universalWeakMargin: universalWeak === catGap.key ? catGap.gap : 0,
      topOccupation: occupation.count,
      topOccupationName: occupation.name,
      wholeRyan: finite(ryan.pctWhole),
      wholeDevin: finite(devin.pctWhole),
      cpiCluster: cluster.count,
      cpiClusterValue: cluster.value,
      specimen: p.biggestWeightedDisagreement ? p.biggestWeightedDisagreement.burger : null,
      restaurant: p.biggestWeightedDisagreement ? p.biggestWeightedDisagreement.restaurant : null
    };
  }

  var DEFINITIONS = [];
  function R(id, priority, stages, test, phase) {
    DEFINITIONS.push({ id: id, priority: priority, stages: stages, test: test, phase: phase || function () { return 1; } });
  }

  R('d01', 82, 1, function (f) { return f.n >= 1 && f.exactSpecimens >= 1; });
  R('d02', 94, 3, function (f) { return f.n >= 2 && f.maxWeightedGap >= 3.6; },
    function (f) { return f.maxWeightedGap >= 6 ? 3 : (f.maxWeightedGap >= 4.5 ? 2 : 1); });
  R('d03', 91, 1, function (f) { return f.n >= 5 && f.rankCorrelation <= -0.75; });
  R('d04', 80, 1, function (f) { return f.n >= 6 && f.exactPct >= 92 && f.sameNumberOne && f.sameLast; });
  R('d05', 72, 3, function (f) { return f.pending >= 1 && f.oldestPendingDays >= 14; },
    function (f) { return f.oldestPendingDays >= 90 ? 3 : (f.oldestPendingDays >= 30 ? 2 : 1); });
  R('d06', 78, 3, function (f) {
    return f.auditImbalance >= 4 && Math.max(f.pendingRyan, f.pendingDevin) >= 4;
  }, function (f) { return f.auditImbalance >= 10 ? 3 : (f.auditImbalance >= 7 ? 2 : 1); });
  R('d07', 67, 1, function (f) { return f.n >= 7 && f.cpiRange <= 2.5 && f.cpiSd <= 1; });
  R('d08', 76, 3, function (f) { return f.n >= 8 && f.repeatCount >= 4 && f.repeatRange >= 22; },
    function (f) { return f.repeatRange >= 45 ? 3 : (f.repeatRange >= 32 ? 2 : 1); });
  R('d09', 70, 1, function (f) { return f.n >= 6 && f.categoryGap >= 2.5; });
  R('d10', 99, 3, function (f) { return f.perfects >= 1; },
    function (f) { return f.perfects >= 3 ? 3 : (f.perfects >= 2 ? 2 : 1); });
  R('d11', 98, 1, function (f) { return f.catastrophes >= 1; });
  R('d12', 74, 1, function (f) { return f.n >= 6 && f.exactCells === 0 && f.disagreement >= 1; });
  R('d13', 79, 3, function (f) { return f.n >= 5 && f.dominanceRun >= 5; },
    function (f) { return f.dominanceRun >= 12 ? 3 : (f.dominanceRun >= 8 ? 2 : 1); });
  R('d14', 69, 1, function (f) { return f.stableN >= 8 && f.stableSd <= 0.06; });
  R('d15', 77, 1, function (f) { return f.n >= 9 && f.reversals >= 6; });
  R('d16', 86, 3, function (f) { return f.n >= 8 && f.negativeCats >= 4; },
    function (f) { return f.negativeCats >= 6 ? 3 : (f.negativeCats >= 5 ? 2 : 1); });
  R('d17', 73, 1, function (f) { return f.n >= 6 && !!f.universalWeak && f.universalWeakMargin >= 1; });
  R('d18', 75, 1, function (f) { return f.n >= 9 && f.topOccupation >= 4; });
  R('d19', 66, 1, function (f) { return f.n >= 10 && f.wholeRyan >= 96 && f.wholeDevin >= 96; });
  R('d20', 83, 3, function (f) { return f.n >= 12 && f.cpiCluster >= 4; },
    function (f) { return f.cpiCluster >= 7 ? 3 : (f.cpiCluster >= 5 ? 2 : 1); });

  function hash(input) {
    var h = 2166136261;
    for (var i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function fromFeatures(features) {
    return DEFINITIONS.filter(function (d) {
      try { return !!d.test(features); } catch (e) { return false; }
    }).map(function (d) {
      var phase = Math.max(1, Math.min(d.stages, d.phase(features)));
      var signature = [d.id, phase, features.n, features.pending, features.audits,
        features.exactCells, features.cpiCluster, features.dominanceRun].join('|');
      return {
        id: d.id,
        phase: phase,
        stages: d.stages,
        priority: d.priority,
        fingerprint: d.id + '-' + phase + '-' + hash(signature),
        data: Object.assign({}, features)
      };
    }).sort(function (a, b) { return b.priority - a.priority || a.id.localeCompare(b.id); });
  }

  function evaluate(metrics) { return fromFeatures(featureVector(metrics)); }
  function primary(metrics) { return evaluate(metrics)[0] || null; }
  function stats() {
    return {
      systems: DEFINITIONS.length,
      multiStage: DEFINITIONS.filter(function (d) { return d.stages > 1; }).length,
      ids: DEFINITIONS.map(function (d) { return d.id; })
    };
  }

  return {
    IDS: IDS,
    DEFINITIONS: DEFINITIONS,
    featureVector: featureVector,
    evaluateFeatures: fromFeatures,
    evaluate: evaluate,
    primary: primary,
    stats: stats
  };
});
