/* =============================================================
   Bureau of Patty Statistics — analytics.js

   Real statistics. No prose, no DOM, no randomness.
   compute(register, options) returns one precomputed metrics object
   that the insight rules, the event layer and the Records Office read.
   Consumers must never recalculate statistics.

   All arithmetic uses full-precision values from scoring.js.

   THE RANKED ENTITY IS THE ESTABLISHMENT.
   m.views holds one entry per establishment. Each auditor's figures on
   an establishment are the MEAN of every current-schema audit they hold
   there, so a repeat visit moves the composite rather than creating a
   second ranked row.

   IMPORTANT — paired vs all audits:
     m.auditors.<key>  covers EVERY current-schema audit that auditor has
                       filed, one entry per visit, including establishments
                       still awaiting peer review.
     m.paired          covers ONLY certified establishments, and is the only
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

  var isNode = (typeof module !== 'undefined' && module.exports);
  var S = isNode ? require('./scoring.js')   : root.BPS.scoring;
  var T = isNode ? require('./taxonomy.js')  : root.BPS.taxonomy;

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

  /* Name comparison is defined once, in taxonomy.js. */
  var normalizeName = T.normalizeName;

  function unique(list) {
    var seen = {}, out = [];
    list.forEach(function (item) {
      if (item == null || item === '') return;
      var key = normalizeName(item);
      if (seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function ts(iso) { return Date.parse(iso) || 0; }

  /* ---------- per-audit enrichment ----------
     One entry per current-schema audit. Shaped like an establishment
     view so the per-auditor block can consume either. */
  function buildAuditView(audit, establishment) {
    var scores = S.withService(audit);
    var v = {
      kind: 'audit',
      id: audit.id,
      auditId: audit.id,
      establishmentId: establishment.id,
      establishmentName: establishment.name,
      category: establishment.category,
      categoryLabel: T.categoryLabel(establishment.category),
      specimen: establishment.fileNumber,
      /* `restaurant` / `burger` stay populated for wording helpers. */
      restaurant: establishment.name,
      burger: audit.burger,
      label: establishment.name,
      locationId: audit.locationId,
      locationName: audit.locationName,
      auditor: audit.auditorKey,
      createdAt: audit.createdAt,
      createdTs: ts(audit.createdAt),
      updatedAt: audit.updatedAt,
      compliant: true,
      scores: { ryan: null, devin: null },
      weighted: { ryan: null, devin: null },
      spread: { ryan: null, devin: null },
      best: {}, worst: {},
      certified: false, cpi: null, rank: null,
      combined: {}, deltas: {}, absDeltas: {}
    };
    v.scores[audit.auditorKey] = scores;
    var weighted = S.calculateWeightedReviewerScore(scores);
    v.weighted[audit.auditorKey] = weighted;
    v.index = weighted == null ? null : weighted * 10;
    var vals = KEYS.map(function (k) { return S.categoryValue(scores, k); });
    v.spread[audit.auditorKey] = range(vals);
    var hi = extremeBy(KEYS, function (k) { return S.categoryValue(scores, k); }, 'max');
    var lo = extremeBy(KEYS, function (k) { return S.categoryValue(scores, k); }, 'min');
    v.best[audit.auditorKey] = hi && hi.item;
    v.worst[audit.auditorKey] = lo && lo.item;
    return v;
  }

  /* ---------- per-establishment enrichment ---------- */
  function buildView(establishment) {
    var all = Array.isArray(establishment.audits) ? establishment.audits : [];
    var compliant = all.filter(S.auditIsCompliant);
    var legacy = all.filter(function (a) { return !S.auditIsCompliant(a); });

    var byAuditor = { ryan: [], devin: [] };
    var legacyBy = { ryan: [], devin: [] };
    compliant.forEach(function (a) { if (byAuditor[a.auditorKey]) byAuditor[a.auditorKey].push(a); });
    legacy.forEach(function (a) { if (legacyBy[a.auditorKey]) legacyBy[a.auditorKey].push(a); });

    var ryan = S.meanScoreSet(byAuditor.ryan);
    var devin = S.meanScoreSet(byAuditor.devin);
    var hasR = !!ryan, hasD = !!devin;
    var certified = hasR && hasD;

    var firstAudit = all.slice().sort(function (a, b) { return ts(a.createdAt) - ts(b.createdAt); })[0];
    var createdAt = establishment.createdAt || (firstAudit && firstAudit.createdAt);

    var v = {
      kind: 'establishment',
      id: establishment.id,
      specimen: establishment.fileNumber,
      fileNumber: establishment.fileNumber,
      name: establishment.name,
      establishmentName: establishment.name,
      /* Retained aliases: every wording helper reads these. */
      restaurant: establishment.name,
      burger: establishment.name,
      label: establishment.name,
      category: establishment.category,
      categoryLabel: T.categoryLabel(establishment.category),
      createdAt: createdAt,
      createdTs: ts(createdAt),
      createdBy: establishment.createdBy,
      audits: all,
      compliantAudits: compliant,
      legacyAudits: legacy,
      auditsBy: byAuditor,
      legacyBy: legacyBy,
      auditCounts: { ryan: byAuditor.ryan.length, devin: byAuditor.devin.length, total: compliant.length },
      legacyCounts: { ryan: legacyBy.ryan.length, devin: legacyBy.devin.length, total: legacy.length },
      visits: compliant.length,
      revisited: byAuditor.ryan.length > 1 || byAuditor.devin.length > 1,
      locations: unique(compliant.map(function (a) { return a.locationName; })),
      locationIds: unique(compliant.map(function (a) { return a.locationId; })),
      burgers: unique(compliant.map(function (a) { return a.burger; })),
      certified: certified,
      status: (hasR && hasD) ? 'certified' : ((!hasR && !hasD) ? 'empty' : 'pending'),
      missing: (hasR && !hasD) ? 'devin' : ((!hasR && hasD) ? 'ryan' : null),
      filedBy: hasR && !hasD ? 'ryan' : (!hasR && hasD ? 'devin' : null),
      /* Legacy filings on record that could be brought up to schema. */
      awaitingRecertification: legacy.length > 0,
      scores: { ryan: ryan, devin: devin },
      weighted: {
        ryan: hasR ? S.calculateWeightedReviewerScore(ryan) : null,
        devin: hasD ? S.calculateWeightedReviewerScore(devin) : null
      },
      cpi: null,
      rank: null,
      combined: {}, deltas: {}, absDeltas: {},
      meanAbsDelta: null, maxAbsDelta: null, maxAbsDeltaCat: null,
      weightedDelta: null, higher: null, sweep: null,
      exactCells: 0,
      spread: { ryan: null, devin: null },
      best: {}, worst: {},
      turnaroundMs: null, pendingAgeMs: null,
      sameBurger: false
    };

    if (certified) v.cpi = ((v.weighted.ryan + v.weighted.devin) / 2) * 10;

    ['ryan', 'devin'].forEach(function (k) {
      var a = v.scores[k];
      if (!a) return;
      var vals = KEYS.map(function (key) { return S.categoryValue(a, key); });
      v.spread[k] = range(vals);
      var hi = extremeBy(KEYS, function (key) { return S.categoryValue(a, key); }, 'max');
      var lo = extremeBy(KEYS, function (key) { return S.categoryValue(a, key); }, 'min');
      v.best[k] = hi && hi.item;
      v.worst[k] = lo && lo.item;
    });

    if (certified) {
      var absList = [];
      var sweepR = true, sweepD = true;
      KEYS.forEach(function (key) {
        var r = S.categoryValue(ryan, key), d = S.categoryValue(devin, key);
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

      /* Turnaround = the wait between the two auditors' FIRST current
         filings here. Different branches and different burgers are fine;
         certification is what is being timed. */
      var tr = ts(byAuditor.ryan[0].createdAt);
      var td = ts(byAuditor.devin[0].createdAt);
      if (isFinite(tr) && isFinite(td)) v.turnaroundMs = Math.abs(tr - td);

      /* A genuine same-burger comparison, when one exists. */
      var ryanBurgers = byAuditor.ryan.map(function (a) { return normalizeName(a.burger); });
      v.sameBurger = byAuditor.devin.some(function (a) {
        return ryanBurgers.indexOf(normalizeName(a.burger)) !== -1;
      });
      v.sameLocation = byAuditor.devin.some(function (a) {
        return byAuditor.ryan.some(function (b) { return b.locationId === a.locationId; });
      });
    } else if (v.filedBy) {
      var filedAt = ts(byAuditor[v.filedBy][0].createdAt);
      if (isFinite(filedAt) && filedAt) v.pendingAgeMs = Date.now() - filedAt;
    }

    return v;
  }

  /* ---------- per-auditor block (ALL of that auditor's current audits) ---------- */
  function buildAuditor(key, auditViews, establishmentViews) {
    var name = S.auditorName(key);
    var mine = auditViews.filter(function (v) { return v.auditor === key; });
    mine.sort(function (a, b) { return a.createdTs - b.createdTs; });

    var allScores = [];
    var byCat = {};
    KEYS.forEach(function (c) { byCat[c] = []; });

    mine.forEach(function (v) {
      KEYS.forEach(function (c) {
        var n = S.categoryValue(v.scores[key], c);
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

    /* Which tenth-decimals does this auditor reach for? Derived Service
       lands on halves, so only entered figures are counted. */
    var enteredScores = [];
    mine.forEach(function (v) {
      S.INPUT_KEYS.forEach(function (k) {
        var n = v.scores[key] && v.scores[key][k];
        if (n != null) enteredScores.push(Number(n));
      });
    });
    var decimals = {};
    enteredScores.forEach(function (x) {
      var d = Math.round((x - Math.floor(x)) * 10);
      decimals[d] = (decimals[d] || 0) + 1;
    });
    var favouriteDecimal = extremeBy(Object.keys(decimals), function (d) { return decimals[d]; }, 'max');

    /* Half-point buckets, for "afraid of commitment" style findings. */
    var buckets = {};
    enteredScores.forEach(function (x) {
      var b = (Math.floor(x * 2) / 2).toFixed(1);
      buckets[b] = (buckets[b] || 0) + 1;
    });
    var favouriteBucket = extremeBy(Object.keys(buckets), function (b) { return buckets[b]; }, 'max');

    var enteredWhole = enteredScores.filter(function (x) { return Number.isInteger(x); }).length;

    /* Personal ordering is over ESTABLISHMENTS — the ranked entity. */
    var personal = (establishmentViews || [])
      .filter(function (v) { return v.weighted[key] != null; })
      .slice()
      .sort(function (a, b) { return b.weighted[key] - a.weighted[key]; });

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

    var locations = unique(mine.map(function (v) { return v.locationName; }));
    var burgers = unique(mine.map(function (v) { return v.burger; }));

    return {
      key: key, name: name, n: mine.length, views: mine,
      establishments: personal.length,
      locationsVisited: locations.length, locations: locations,
      burgersEaten: burgers.length, burgers: burgers,
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
      pctWhole: pct(enteredWhole, enteredScores.length),
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

  /* ---------- paired block (CERTIFIED establishments only) ---------- */
  function buildPaired(certified) {
    var chrono = certified.slice().sort(function (a, b) { return a.createdTs - b.createdTs; });
    var n = chrono.length;

    var ryanW = chrono.map(function (v) { return v.weighted.ryan; });
    var devinW = chrono.map(function (v) { return v.weighted.devin; });
    var absDeltas = chrono.map(function (v) { return v.meanAbsDelta; });

    var byCategory = {};
    KEYS.forEach(function (c) {
      var r = chrono.map(function (v) { return S.categoryValue(v.scores.ryan, c); });
      var d = chrono.map(function (v) { return S.categoryValue(v.scores.devin, c); });
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

    /* Chronological streaks over certified establishments. */
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
      serviceBottom: streak(chrono, function (v) { return v.worst.combined === 'service'; }),
      noTens: streak(chrono, function (v) {
        return !KEYS.some(function (c) {
          return S.categoryValue(v.scores.ryan, c) === 10 || S.categoryValue(v.scores.devin, c) === 10;
        });
      }),
      sweeps: streak(chrono, function (v) { return !!v.sweep; })
    };

    var cpis = chrono.map(function (v) { return v.cpi; });

    /* Turnaround between each auditor's first filing. */
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
      sameBurgerCount: chrono.filter(function (v) { return v.sameBurger; }).length,
      sameLocationCount: chrono.filter(function (v) { return v.sameLocation; }).length,
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

  /* ---------- establishment standings ----------
     `m.restaurants` is one entry per certified establishment. `count` is
     the number of current-schema visits it holds, and the CPI spread
     describes how much those individual visits disagreed. */
  function buildEstablishmentStandings(certified) {
    return certified.map(function (v) {
      var indices = v.compliantAudits
        .map(function (a) { return S.calculateWeightedReviewerScore(S.withService(a)); })
        .filter(function (n) { return n != null; })
        .map(function (n) { return n * 10; });
      return {
        key: v.id, id: v.id, name: v.name, view: v, views: [v],
        category: v.category, categoryLabel: v.categoryLabel,
        count: v.visits, revisited: v.revisited,
        ryanVisits: v.auditCounts.ryan, devinVisits: v.auditCounts.devin,
        locations: v.locations, burgers: v.burgers,
        cpi: v.cpi,
        meanCPI: v.cpi,
        visitIndices: indices,
        sdCPI: sd(indices), minCPI: min(indices), maxCPI: max(indices), rangeCPI: range(indices),
        ryanMean: v.weighted.ryan, devinMean: v.weighted.devin,
        gap: (v.weighted.ryan == null || v.weighted.devin == null) ? null : v.weighted.ryan - v.weighted.devin
      };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  /* ---------- location + category indexes (unfiltered) ---------- */
  function buildLocationIndex(views, locations) {
    var stats = {};
    views.forEach(function (v) {
      v.compliantAudits.forEach(function (a) {
        if (!a.locationId) return;
        var s = stats[a.locationId] = stats[a.locationId] || {
          id: a.locationId, name: a.locationName, audits: 0,
          establishments: {}, byAuditor: { ryan: 0, devin: 0 }
        };
        s.audits += 1;
        s.establishments[v.id] = true;
        if (s.byAuditor[a.auditorKey] != null) s.byAuditor[a.auditorKey] += 1;
      });
    });
    return (locations || []).map(function (l) {
      var s = stats[l.id];
      return {
        id: l.id, name: l.name, nameKey: l.nameKey, group: l.group,
        isPreset: l.isPreset, archived: l.archived, createdBy: l.createdBy,
        audits: s ? s.audits : 0,
        establishments: s ? Object.keys(s.establishments).length : 0,
        ryanAudits: s ? s.byAuditor.ryan : 0,
        devinAudits: s ? s.byAuditor.devin : 0,
        inUse: !!s
      };
    });
  }

  function buildCategoryIndex(views) {
    return T.ESTABLISHMENT_CATEGORIES.map(function (c) {
      var mine = views.filter(function (v) { return v.category === c.key; });
      var certified = mine.filter(function (v) { return v.certified; });
      return {
        key: c.key, label: c.label,
        establishments: mine.length,
        certified: certified.length,
        audits: mine.reduce(function (t, v) { return t + v.visits; }, 0),
        meanCPI: mean(certified.map(function (v) { return v.cpi; }))
      };
    });
  }

  /* ---------- filtering ----------
     A location filter restricts the EVIDENCE, not the identity. Culver's
     stays Culver's; only its Eden Prairie audits are considered, and its
     certification is judged on that restricted evidence. */
  function applyFilter(establishments, options) {
    var locationId = options && options.locationId;
    var category = options && options.category;
    var list = establishments;
    if (category) list = list.filter(function (e) { return e.category === category; });
    if (locationId) {
      list = list.map(function (e) {
        return S.restrictToAudits(e, function (a) { return a.locationId === locationId; });
      }).filter(function (e) { return e.audits.length > 0; });
    }
    return list;
  }

  /* ---------- entry point ---------- */
  function compute(register, options) {
    options = options || {};
    var reg = Array.isArray(register) ? { establishments: register, locations: [] } : (register || {});
    var allEstablishments = reg.establishments || [];
    var locations = reg.locations || [];

    var filtered = applyFilter(allEstablishments, options);

    var views = filtered.map(buildView).sort(function (a, b) { return a.createdTs - b.createdTs; });
    var unfilteredViews = (options.locationId || options.category)
      ? allEstablishments.map(buildView).sort(function (a, b) { return a.createdTs - b.createdTs; })
      : views;

    var certified = views.filter(function (v) { return v.certified; });
    var pending = views.filter(function (v) { return v.status === 'pending'; });

    /* Official ranks, by full-precision CPI. */
    var ranked = certified.slice().sort(function (a, b) { return b.cpi - a.cpi; });
    ranked.forEach(function (v, i) { v.rank = i + 1; });

    var auditViews = [];
    views.forEach(function (v) {
      v.compliantAudits.forEach(function (a) { auditViews.push(buildAuditView(a, v)); });
    });
    auditViews.sort(function (a, b) { return a.createdTs - b.createdTs; });

    var legacyAudits = [];
    views.forEach(function (v) { v.legacyAudits.forEach(function (a) { legacyAudits.push({ audit: a, view: v }); }); });

    var auditors = {
      ryan: buildAuditor('ryan', auditViews, views),
      devin: buildAuditor('devin', auditViews, views)
    };
    var paired = buildPaired(certified);
    var restaurants = buildEstablishmentStandings(certified);
    var repeatRestaurants = restaurants.filter(function (r) { return r.revisited; });

    var pendingFor = {
      ryan: pending.filter(function (v) { return v.missing === 'ryan'; }),
      devin: pending.filter(function (v) { return v.missing === 'devin'; })
    };

    var oldestPending = extremeBy(pending, function (v) { return v.pendingAgeMs; }, 'max');

    /* Register-wide category picture across certified establishments. */
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

    /* Activity cadence, over actual filings. */
    var days = auditViews.map(function (v) { return v.createdTs; }).filter(Boolean).sort();
    var gaps = [];
    for (var i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
    var longestGap = max(gaps);
    var sinceLast = days.length ? Date.now() - days[days.length - 1] : null;

    var locationIndex = buildLocationIndex(unfilteredViews, locations);
    var activeLocations = locationIndex.filter(function (l) { return l.inUse; });
    var categoryIndex = buildCategoryIndex(unfilteredViews);

    return {
      generatedAt: Date.now(),
      filter: {
        locationId: options.locationId || null,
        locationName: options.locationName || null,
        category: options.category || null,
        active: !!(options.locationId || options.category)
      },
      counts: {
        /* `burgers` retained as the register-size figure many rules read. */
        burgers: views.length,
        establishments: views.length,
        certified: certified.length,
        pending: pending.length,
        empty: views.filter(function (v) { return v.status === 'empty'; }).length,
        audits: auditors.ryan.n + auditors.devin.n,
        ryanAudits: auditors.ryan.n,
        devinAudits: auditors.devin.n,
        legacyAudits: legacyAudits.length,
        awaitingRecertification: views.filter(function (v) { return v.awaitingRecertification; }).length,
        restaurants: restaurants.length,
        repeatRestaurants: repeatRestaurants.length,
        locations: activeLocations.length,
        locationsOnFile: locationIndex.length,
        categories: categoryIndex.filter(function (c) { return c.establishments > 0; }).length,
        revisits: views.filter(function (v) { return v.revisited; }).length,
        sameBurgerPairs: paired.sameBurgerCount
      },
      views: views,
      certified: certified,
      /* The single certified establishment, when that is all we have. */
      only: certified.length === 1 ? certified[0] : null,
      ranked: ranked,
      pending: pending,
      pendingFor: pendingFor,
      oldestPending: oldestPending && oldestPending.item,
      oldestPendingMs: oldestPending && oldestPending.value,
      auditViews: auditViews,
      legacyAudits: legacyAudits,
      auditors: auditors,
      paired: paired,
      restaurants: restaurants,
      repeatRestaurants: repeatRestaurants,
      topRestaurant: restaurants.length
        ? restaurants.slice().sort(function (a, b) { return b.meanCPI - a.meanCPI; })[0] : null,
      worstRestaurant: restaurants.length
        ? restaurants.slice().sort(function (a, b) { return a.meanCPI - b.meanCPI; })[0] : null,
      locationIndex: locationIndex,
      activeLocations: activeLocations,
      categoryIndex: categoryIndex,
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
    applyFilter: applyFilter,
    buildView: buildView,
    buildAuditView: buildAuditView,
    mean: mean, median: median, sd: sd, variance: variance,
    min: min, max: max, range: range, sum: sum, pct: pct,
    correlation: correlation, spearman: spearman,
    streak: streak, extremeBy: extremeBy, normalizeName: normalizeName, unique: unique
  };
});
