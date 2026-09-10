/* =============================================================
   Bureau of Patty Statistics — analytics.js

   Real statistics. No prose, no DOM, no randomness.
   compute(burgers) returns one precomputed metrics object that the
   insight rules read. Rules must never recalculate statistics.

   All arithmetic uses full-precision values from scoring.js.

   IMPORTANT — paired vs all audits (see Part 19 of the brief):
     m.auditors.<key>  covers EVERY audit that auditor has filed,
                       including specimens still awaiting peer review.
     m.paired          covers ONLY certified specimens, and is the only
                       valid basis for direct Ryan-vs-Devin comparison.
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.analytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var S = (typeof module !== 'undefined' && module.exports)
    ? require('./scoring.js')
    : root.BPS.scoring;

  var KEYS = S.CATEGORY_KEYS;
  var DAY = 86400000;

  /* ---------- descriptive statistics ---------- */
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* Population standard deviation — we hold the entire register, not a sample. */
  function sd(a) {
    if (a.length < 2) return null;
    var mu = mean(a);
    return Math.sqrt(a.reduce(function (t, v) { return t + (v - mu) * (v - mu); }, 0) / a.length);
  }

  function variance(a) { var s = sd(a); return s == null ? null : s * s; }
  function min(a) { return a.length ? Math.min.apply(null, a) : null; }
  function max(a) { return a.length ? Math.max.apply(null, a) : null; }
  function range(a) { return a.length ? max(a) - min(a) : null; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function pct(part, whole) { return whole ? (part / whole) * 100 : null; }

  /** Pearson correlation; null when undefined (constant series or n<3). */
  function correlation(xs, ys) {
    var n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    var mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n));
    var num = 0, dx = 0, dy = 0;
    for (var i = 0; i < n; i++) {
      var a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    if (dx === 0 || dy === 0) return null;
    return num / Math.sqrt(dx * dy);
  }

  /** Spearman rank correlation over two arrays of ranks. */
  function spearman(ranksA, ranksB) { return correlation(ranksA, ranksB); }

  function extremeBy(list, fn, dir) {
    var best = null, bestVal = null;
    list.forEach(function (item) {
      var v = fn(item);
      if (v == null || !isFinite(v)) return;
      if (bestVal == null || (dir === 'max' ? v > bestVal : v < bestVal)) { bestVal = v; best = item; }
    });
    return best == null ? null : { item: best, value: bestVal };
  }

  /** Longest and current run of a boolean predicate over a chronological list. */
  function streak(list, predicate) {
    var longest = 0, current = 0, run = 0;
    list.forEach(function (item) {
      if (predicate(item)) { run += 1; if (run > longest) longest = run; }
      else run = 0;
    });
    for (var i = list.length - 1; i >= 0; i--) {
      if (predicate(list[i])) current += 1; else break;
    }
    return { longest: longest, current: current };
  }

  function normalizeName(s) {
    return String(s || '').toLowerCase()
      .replace(/[‘’']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /* ---------- per-burger enrichment ---------- */
  function buildView(burger) {
    var ryan = S.auditOf(burger, 'ryan');
    var devin = S.auditOf(burger, 'devin');
    var hasR = S.hasAudit(burger, 'ryan');
    var hasD = S.hasAudit(burger, 'devin');
    var certified = hasR && hasD;

    var v = {
      id: burger.id,
      specimen: burger.specimenNumber,
      restaurant: burger.restaurant,
      burger: burger.burger,
      label: burger.burger,
      createdAt: burger.createdAt,
      createdTs: Date.parse(burger.createdAt) || 0,
      createdBy: burger.createdBy,
      certified: certified,
      status: S.statusOf(burger).key,
      missing: S.missingAuditor(burger),
      filedBy: hasR && !hasD ? 'ryan' : (!hasR && hasD ? 'devin' : null),
      scores: { ryan: hasR ? ryan : null, devin: hasD ? devin : null },
      weighted: {
        ryan: hasR ? S.calculateWeightedReviewerScore(ryan) : null,
        devin: hasD ? S.calculateWeightedReviewerScore(devin) : null
      },
      cpi: certified ? S.cpiOf(burger) : null,
      rank: null,
      combined: {}, deltas: {}, absDeltas: {},
      meanAbsDelta: null, maxAbsDelta: null, maxAbsDeltaCat: null,
      weightedDelta: null, higher: null, sweep: null,
      exactCells: 0,
      spread: { ryan: null, devin: null },
      best: {}, worst: {},
      turnaroundMs: null, pendingAgeMs: null
    };

    ['ryan', 'devin'].forEach(function (k) {
      var a = v.scores[k];
      if (!a) return;
      var vals = KEYS.map(function (key) { return Number(a[key]); });
      v.spread[k] = range(vals);
      var hi = extremeBy(KEYS, function (key) { return Number(a[key]); }, 'max');
      var lo = extremeBy(KEYS, function (key) { return Number(a[key]); }, 'min');
      v.best[k] = hi && hi.item;
      v.worst[k] = lo && lo.item;
    });

    if (certified) {
      var absList = [];
      var sweepR = true, sweepD = true;
      KEYS.forEach(function (key) {
        var r = Number(ryan[key]), d = Number(devin[key]);
        v.combined[key] = (r + d) / 2;
        v.deltas[key] = r - d;
        v.absDeltas[key] = Math.abs(r - d);
        absList.push(Math.abs(r - d));
        if (r === d) v.exactCells += 1;
        if (!(r > d)) sweepR = false;
        if (!(d > r)) sweepD = false;
      });
      v.meanAbsDelta = mean(absList);
      var worstCell = extremeBy(KEYS, function (key) { return v.absDeltas[key]; }, 'max');
      v.maxAbsDelta = worstCell && worstCell.value;
      v.maxAbsDeltaCat = worstCell && worstCell.item;
      v.weightedDelta = v.weighted.ryan - v.weighted.devin;
      v.higher = v.weightedDelta > 0 ? 'ryan' : (v.weightedDelta < 0 ? 'devin' : 'tie');
      v.sweep = sweepR ? 'ryan' : (sweepD ? 'devin' : null);

      var cHi = extremeBy(KEYS, function (key) { return v.combined[key]; }, 'max');
      var cLo = extremeBy(KEYS, function (key) { return v.combined[key]; }, 'min');
      v.best.combined = cHi && cHi.item;
      v.worst.combined = cLo && cLo.item;
      v.combinedSpread = range(KEYS.map(function (key) { return v.combined[key]; }));

      var tr = Date.parse(ryan.createdAt || burger.createdAt);
      var td = Date.parse(devin.createdAt || burger.createdAt);
      if (isFinite(tr) && isFinite(td)) v.turnaroundMs = Math.abs(tr - td);
    } else if (v.filedBy) {
      var filedAt = Date.parse(v.scores[v.filedBy].createdAt || burger.createdAt);
      if (isFinite(filedAt)) v.pendingAgeMs = Date.now() - filedAt;
    }

    return v;
  }

  /* ---------- per-auditor block (ALL of that auditor's audits) ---------- */
  function buildAuditor(key, views) {
    var name = S.auditorName(key);
    var mine = views.filter(function (v) { return v.scores[key]; });
    mine.sort(function (a, b) { return a.createdTs - b.createdTs; });

    var allScores = [];
    var byCat = {};
    KEYS.forEach(function (c) { byCat[c] = []; });

    mine.forEach(function (v) {
      KEYS.forEach(function (c) {
        var n = Number(v.scores[key][c]);
        allScores.push(n);
        byCat[c].push(n);
      });
    });

    var weightedVals = mine.map(function (v) { return v.weighted[key]; }).filter(function (n) { return n != null; });

    var cat = {};
    KEYS.forEach(function (c) {
      cat[c] = {
        values: byCat[c], mean: mean(byCat[c]), median: median(byCat[c]),
        sd: sd(byCat[c]), min: min(byCat[c]), max: max(byCat[c]), range: range(byCat[c])
      };
    });

    var bestCat = extremeBy(KEYS, function (c) { return cat[c].mean; }, 'max');
    var worstCat = extremeBy(KEYS, function (c) { return cat[c].mean; }, 'min');
    var steadiest = extremeBy(KEYS, function (c) { return cat[c].sd; }, 'min');
    var swingiest = extremeBy(KEYS, function (c) { return cat[c].sd; }, 'max');

    var count = function (fn) { return allScores.filter(fn).length; };
    var n9 = count(function (x) { return x >= 9; });
    var n10 = count(function (x) { return x === 10; });
    var nSub5 = count(function (x) { return x < 5; });
    var nSub7 = count(function (x) { return x < 7; });
    var nWhole = count(function (x) { return Number.isInteger(x); });

    /* Which tenth-decimals does this auditor reach for? */
    var decimals = {};
    allScores.forEach(function (x) {
      var d = Math.round((x - Math.floor(x)) * 10);
      decimals[d] = (decimals[d] || 0) + 1;
    });
    var favouriteDecimal = extremeBy(Object.keys(decimals), function (d) { return decimals[d]; }, 'max');

    /* Half-point buckets, for "afraid of commitment" style findings. */
    var buckets = {};
    allScores.forEach(function (x) {
      var b = (Math.floor(x * 2) / 2).toFixed(1);
      buckets[b] = (buckets[b] || 0) + 1;
    });
    var favouriteBucket = extremeBy(Object.keys(buckets), function (b) { return buckets[b]; }, 'max');

    var personal = mine.slice().sort(function (a, b) { return b.weighted[key] - a.weighted[key]; });

    /* Chronological trend: first half vs second half of their own audits. */
    var trend = null;
    if (weightedVals.length >= 4) {
      var halfAt = Math.floor(weightedVals.length / 2);
      var early = mean(weightedVals.slice(0, halfAt));
      var late = mean(weightedVals.slice(weightedVals.length - halfAt));
      trend = { early: early, late: late, delta: late - early };
    }
    var recent = weightedVals.length >= 3 ? mean(weightedVals.slice(-3)) : null;
    var prior = weightedVals.length >= 6 ? mean(weightedVals.slice(0, -3)) : null;

    return {
      key: key, name: name, n: mine.length, views: mine,
      weighted: {
        values: weightedVals, mean: mean(weightedVals), median: median(weightedVals),
        sd: sd(weightedVals), min: min(weightedVals), max: max(weightedVals), range: range(weightedVals)
      },
      scores: {
        values: allScores, mean: mean(allScores), median: median(allScores),
        sd: sd(allScores), min: min(allScores), max: max(allScores), range: range(allScores)
      },
      cat: cat,
      bestCat: bestCat && bestCat.item, bestCatMean: bestCat && bestCat.value,
      worstCat: worstCat && worstCat.item, worstCatMean: worstCat && worstCat.value,
      steadiestCat: steadiest && steadiest.item, steadiestCatSd: steadiest && steadiest.value,
      swingiestCat: swingiest && swingiest.item, swingiestCatSd: swingiest && swingiest.value,
      totalCells: allScores.length,
      count9: n9, count10: n10, countBelow5: nSub5, countBelow7: nSub7, countWhole: nWhole,
      pct9: pct(n9, allScores.length), pct10: pct(n10, allScores.length),
      pctBelow5: pct(nSub5, allScores.length), pctBelow7: pct(nSub7, allScores.length),
      pctWhole: pct(nWhole, allScores.length),
      decimals: decimals,
      favouriteDecimal: favouriteDecimal && Number(favouriteDecimal.item),
      favouriteDecimalCount: favouriteDecimal && favouriteDecimal.value,
      buckets: buckets,
      favouriteBucket: favouriteBucket && favouriteBucket.item,
      favouriteBucketCount: favouriteBucket && favouriteBucket.value,
      personal: personal,
      top: personal[0] || null,
      bottom: personal[personal.length - 1] || null,
      trend: trend, recentMean: recent, priorMean: prior,
      meanSpread: mean(mine.map(function (v) { return v.spread[key]; }).filter(function (n) { return n != null; }))
    };
  }

  /* ---------- paired block (CERTIFIED specimens only) ---------- */
  function buildPaired(certified) {
    var chrono = certified.slice().sort(function (a, b) { return a.createdTs - b.createdTs; });
    var n = chrono.length;

    var ryanW = chrono.map(function (v) { return v.weighted.ryan; });
    var devinW = chrono.map(function (v) { return v.weighted.devin; });
    var absDeltas = chrono.map(function (v) { return v.meanAbsDelta; });

    var byCategory = {};
    KEYS.forEach(function (c) {
      var r = chrono.map(function (v) { return Number(v.scores.ryan[c]); });
      var d = chrono.map(function (v) { return Number(v.scores.devin[c]); });
      var diffs = chrono.map(function (v) { return v.deltas[c]; });
      var abs = diffs.map(Math.abs);
      byCategory[c] = {
        key: c, label: S.categoryLabel(c),
        ryanMean: mean(r), devinMean: mean(d),
        ryanSd: sd(r), devinSd: sd(d),
        delta: mean(diffs),
        meanAbs: mean(abs), maxAbs: max(abs),
        exact: diffs.filter(function (x) { return x === 0; }).length,
        combinedMean: mean(chrono.map(function (v) { return v.combined[c]; })),
        correlation: correlation(r, d)
      };
    });

    var contested = extremeBy(KEYS, function (c) { return byCategory[c].meanAbs; }, 'max');
    var harmonious = extremeBy(KEYS, function (c) { return byCategory[c].meanAbs; }, 'min');
    var biggestGapCat = extremeBy(KEYS, function (c) { return Math.abs(byCategory[c].delta); }, 'max');

    var totalCells = n * KEYS.length;
    var exactCells = chrono.reduce(function (t, v) { return t + v.exactCells; }, 0);
    var nearCells = 0;
    chrono.forEach(function (v) {
      KEYS.forEach(function (c) { if (v.absDeltas[c] <= 0.2) nearCells += 1; });
    });

    var biggestCell = extremeBy(chrono, function (v) { return v.maxAbsDelta; }, 'max');
    var biggestWeighted = extremeBy(chrono, function (v) { return Math.abs(v.weightedDelta); }, 'max');
    var closest = extremeBy(chrono, function (v) { return Math.abs(v.weightedDelta); }, 'min');

    /* Ranking comparison: official vs each personal ordering. */
    var official = chrono.slice().sort(function (a, b) { return b.cpi - a.cpi; });
    var ryanOrder = chrono.slice().sort(function (a, b) { return b.weighted.ryan - a.weighted.ryan; });
    var devinOrder = chrono.slice().sort(function (a, b) { return b.weighted.devin - a.weighted.devin; });

    var posIn = function (order, id) {
      for (var i = 0; i < order.length; i++) if (order[i].id === id) return i + 1;
      return null;
    };

    var rankRows = chrono.map(function (v) {
      var r = posIn(ryanOrder, v.id), d = posIn(devinOrder, v.id);
      return { view: v, officialRank: posIn(official, v.id), ryanRank: r, devinRank: d, diff: Math.abs(r - d) };
    });
    var biggestInversion = extremeBy(rankRows, function (row) { return row.diff; }, 'max');

    function overlap(a, b, k) {
      var A = a.slice(0, k).map(function (v) { return v.id; });
      var B = b.slice(0, k).map(function (v) { return v.id; });
      return A.filter(function (id) { return B.indexOf(id) !== -1; }).length;
    }
    function tailOverlap(a, b, k) {
      var A = a.slice(-k).map(function (v) { return v.id; });
      var B = b.slice(-k).map(function (v) { return v.id; });
      return A.filter(function (id) { return B.indexOf(id) !== -1; }).length;
    }

    var rankCorr = n >= 3
      ? spearman(rankRows.map(function (r) { return r.ryanRank; }), rankRows.map(function (r) { return r.devinRank; }))
      : null;

    /* Chronological streaks over certified specimens. */
    var streaks = {
      ryanHigher: streak(chrono, function (v) { return v.higher === 'ryan'; }),
      devinHigher: streak(chrono, function (v) { return v.higher === 'devin'; }),
      agreement: streak(chrono, function (v) { return v.meanAbsDelta <= 0.3; }),
      disagreement: streak(chrono, function (v) { return v.meanAbsDelta >= 0.7; }),
      ryanNine: streak(chrono, function (v) { return v.weighted.ryan >= 9; }),
      devinNine: streak(chrono, function (v) { return v.weighted.devin >= 9; }),
      pattyTop: streak(chrono, function (v) { return v.best.combined === 'patty'; }),
      friesBottom: streak(chrono, function (v) { return v.worst.combined === 'fries'; }),
      valueBottom: streak(chrono, function (v) { return v.worst.combined === 'value'; }),
      noTens: streak(chrono, function (v) {
        return !KEYS.some(function (c) {
          return Number(v.scores.ryan[c]) === 10 || Number(v.scores.devin[c]) === 10;
        });
      }),
      sweeps: streak(chrono, function (v) { return !!v.sweep; })
    };

    var cpis = chrono.map(function (v) { return v.cpi; });

    /* Turnaround between the two filings. */
    var turnarounds = chrono.map(function (v) { return v.turnaroundMs; })
      .filter(function (t) { return t != null && isFinite(t); });

    return {
      n: n, views: chrono, official: official,
      ryanOrder: ryanOrder, devinOrder: devinOrder,
      rankRows: rankRows,
      ryanMean: mean(ryanW), devinMean: mean(devinW),
      ryanMedian: median(ryanW), devinMedian: median(devinW),
      ryanSd: sd(ryanW), devinSd: sd(devinW),
      gap: (mean(ryanW) == null || mean(devinW) == null) ? null : mean(ryanW) - mean(devinW),
      absGap: (mean(ryanW) == null || mean(devinW) == null) ? null : Math.abs(mean(ryanW) - mean(devinW)),
      moreGenerous: mean(ryanW) == null ? null : (mean(ryanW) > mean(devinW) ? 'ryan' : (mean(ryanW) < mean(devinW) ? 'devin' : null)),
      meanAbsDisagreement: mean(absDeltas),
      maxAbsDisagreement: max(absDeltas),
      minAbsDisagreement: min(absDeltas),
      byCategory: byCategory,
      mostContestedCat: contested && contested.item, mostContestedVal: contested && contested.value,
      leastContestedCat: harmonious && harmonious.item, leastContestedVal: harmonious && harmonious.value,
      biggestGapCat: biggestGapCat && biggestGapCat.item,
      totalCells: totalCells, exactCells: exactCells, exactPct: pct(exactCells, totalCells),
      nearCells: nearCells, nearPct: pct(nearCells, totalCells),
      biggestCellDisagreement: biggestCell && biggestCell.item,
      biggestCellValue: biggestCell && biggestCell.value,
      biggestWeightedDisagreement: biggestWeighted && biggestWeighted.item,
      biggestWeightedValue: biggestWeighted && biggestWeighted.value,
      closestSpecimen: closest && closest.item,
      closestValue: closest && closest.value,
      ryanHigherCount: chrono.filter(function (v) { return v.higher === 'ryan'; }).length,
      devinHigherCount: chrono.filter(function (v) { return v.higher === 'devin'; }).length,
      tieCount: chrono.filter(function (v) { return v.higher === 'tie'; }).length,
      ryanSweeps: chrono.filter(function (v) { return v.sweep === 'ryan'; }).length,
      devinSweeps: chrono.filter(function (v) { return v.sweep === 'devin'; }).length,
      biggestInversion: biggestInversion && biggestInversion.item,
      biggestInversionValue: biggestInversion && biggestInversion.value,
      top3Overlap: n >= 3 ? overlap(ryanOrder, devinOrder, 3) : null,
      top5Overlap: n >= 5 ? overlap(ryanOrder, devinOrder, 5) : null,
      bottom3Overlap: n >= 3 ? tailOverlap(ryanOrder, devinOrder, 3) : null,
      sameNumberOne: n >= 1 && ryanOrder[0].id === devinOrder[0].id,
      sameLast: n >= 2 && ryanOrder[n - 1].id === devinOrder[n - 1].id,
      rankCorrelation: rankCorr,
      streaks: streaks,
      cpi: { values: cpis, mean: mean(cpis), median: median(cpis), sd: sd(cpis), min: min(cpis), max: max(cpis), range: range(cpis) },
      turnaround: {
        values: turnarounds, mean: mean(turnarounds), median: median(turnarounds),
        min: min(turnarounds), max: max(turnarounds),
        fastest: extremeBy(chrono, function (v) { return v.turnaroundMs == null ? null : -v.turnaroundMs; }, 'max'),
        slowest: extremeBy(chrono, function (v) { return v.turnaroundMs; }, 'max')
      },
      first: chrono[0] || null,
      latest: chrono[n - 1] || null
    };
  }

  /* ---------- restaurants ---------- */
  function buildRestaurants(certified) {
    var groups = {};
    certified.forEach(function (v) {
      var k = normalizeName(v.restaurant);
      (groups[k] = groups[k] || { key: k, name: v.restaurant, views: [] }).views.push(v);
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      var cpis = g.views.map(function (v) { return v.cpi; });
      var rw = g.views.map(function (v) { return v.weighted.ryan; });
      var dw = g.views.map(function (v) { return v.weighted.devin; });
      return {
        key: g.key, name: g.name, views: g.views, count: g.views.length,
        meanCPI: mean(cpis), sdCPI: sd(cpis), minCPI: min(cpis), maxCPI: max(cpis), rangeCPI: range(cpis),
        ryanMean: mean(rw), devinMean: mean(dw),
        gap: (mean(rw) == null || mean(dw) == null) ? null : mean(rw) - mean(dw)
      };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  /* ---------- entry point ---------- */
  function compute(burgers) {
    var list = burgers || [];
    var views = list.map(buildView).sort(function (a, b) { return a.createdTs - b.createdTs; });
    var certified = views.filter(function (v) { return v.certified; });
    var pending = views.filter(function (v) { return v.status === 'pending'; });

    /* Official ranks, by full-precision CPI. */
    var ranked = certified.slice().sort(function (a, b) { return b.cpi - a.cpi; });
    ranked.forEach(function (v, i) { v.rank = i + 1; });

    var auditors = {
      ryan: buildAuditor('ryan', views),
      devin: buildAuditor('devin', views)
    };
    var paired = buildPaired(certified);
    var restaurants = buildRestaurants(certified);
    var repeatRestaurants = restaurants.filter(function (r) { return r.count >= 2; });

    var pendingFor = {
      ryan: pending.filter(function (v) { return v.missing === 'ryan'; }),
      devin: pending.filter(function (v) { return v.missing === 'devin'; })
    };

    var oldestPending = extremeBy(pending, function (v) { return v.pendingAgeMs; }, 'max');

    /* Register-wide category picture across certified specimens. */
    var categoryBoard = {};
    KEYS.forEach(function (c) {
      var combined = certified.map(function (v) { return v.combined[c]; });
      var best = extremeBy(certified, function (v) { return v.combined[c]; }, 'max');
      var worst = extremeBy(certified, function (v) { return v.combined[c]; }, 'min');
      categoryBoard[c] = {
        key: c, label: S.categoryLabel(c),
        mean: mean(combined), median: median(combined), sd: sd(combined),
        min: min(combined), max: max(combined),
        best: best && best.item, bestValue: best && best.value,
        worst: worst && worst.item, worstValue: worst && worst.value
      };
    });
    var strongestCat = extremeBy(KEYS, function (c) { return categoryBoard[c].mean; }, 'max');
    var weakestCat = extremeBy(KEYS, function (c) { return categoryBoard[c].mean; }, 'min');

    /* Activity cadence. */
    var days = views.map(function (v) { return v.createdTs; }).filter(Boolean).sort();
    var gaps = [];
    for (var i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
    var longestGap = max(gaps);
    var sinceLast = days.length ? Date.now() - days[days.length - 1] : null;

    return {
      generatedAt: Date.now(),
      counts: {
        burgers: views.length,
        certified: certified.length,
        pending: pending.length,
        empty: views.filter(function (v) { return v.status === 'empty'; }).length,
        audits: auditors.ryan.n + auditors.devin.n,
        ryanAudits: auditors.ryan.n,
        devinAudits: auditors.devin.n,
        restaurants: restaurants.length,
        repeatRestaurants: repeatRestaurants.length
      },
      views: views,
      certified: certified,
      /* The single certified specimen, when that is all we have. Lets the
         one-specimen rules stay readable. */
      only: certified.length === 1 ? certified[0] : null,
      ranked: ranked,
      pending: pending,
      pendingFor: pendingFor,
      oldestPending: oldestPending && oldestPending.item,
      oldestPendingMs: oldestPending && oldestPending.value,
      auditors: auditors,
      paired: paired,
      restaurants: restaurants,
      repeatRestaurants: repeatRestaurants,
      topRestaurant: repeatRestaurants.length
        ? repeatRestaurants.slice().sort(function (a, b) { return b.meanCPI - a.meanCPI; })[0] : null,
      worstRestaurant: repeatRestaurants.length
        ? repeatRestaurants.slice().sort(function (a, b) { return a.meanCPI - b.meanCPI; })[0] : null,
      categoryBoard: categoryBoard,
      strongestCat: strongestCat && strongestCat.item,
      weakestCat: weakestCat && weakestCat.item,
      activity: { longestGapMs: longestGap, sinceLastMs: sinceLast, gaps: gaps },
      stats: { mean: mean, median: median, sd: sd, variance: variance, min: min, max: max,
               range: range, sum: sum, pct: pct, correlation: correlation, streak: streak },
      DAY: DAY
    };
  }

  return {
    compute: compute,
    mean: mean, median: median, sd: sd, variance: variance,
    min: min, max: max, range: range, sum: sum, pct: pct,
    correlation: correlation, spearman: spearman,
    streak: streak, extremeBy: extremeBy, normalizeName: normalizeName
  };
});
