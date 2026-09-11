/* =============================================================
   Bureau of Patty Statistics — public-register.js

   The public-safe projection of the Bureau register, and the read-only
   views the public website (pattybureau.com) draws from it.

   No DOM, no I/O, no scoring of its own. Every figure is produced by
   scoring.js and analytics.js — the same modules the auditor app runs —
   so the public rankings cannot drift from the official ones.

   TWO HALVES
     buildPublicRegister(register)       server side, in the Pages
        Function behind /api/public/register. Takes the full canonical
        register and keeps only what the public may see:
          * CERTIFIED establishments only, keyed by file number
          * their current-schema audits: examiner key, burger, location,
            filing DATE (never time of day) and the eight entered scores
          * active examiners' display names; departed examiners are
            anonymised and still never count toward anything
          * no emails, auth UUIDs, row ids, roles or invitation state
        plus register-wide counts that genuinely need the full register
        (pending establishments, total filings, examiner workloads).

     rankings(), filterOptions(), movement(), findings() …   browser
        side. They run analytics.compute() on the public register exactly
        as the auditor app runs it on the full register.

   WHY THE PUBLIC REGISTER RANKS IDENTICALLY
     A ranking reads only certified establishments' current-schema
     audits. Legacy audits never count, and an establishment that is not
     certified on the full register cannot certify under any location or
     class filter, because a filter can only remove evidence. Order is
     preserved throughout (examiners, establishments, audits), so even
     full-precision floating-point sums run in the same order.
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.publicRegister = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var S  = isNode ? require('./scoring.js')   : root.BPS.scoring;
  var T  = isNode ? require('./taxonomy.js')  : root.BPS.taxonomy;
  var AN = isNode ? require('./analytics.js') : root.BPS.analytics;

  var DAY = 86400000;
  var FORMAT_VERSION = 1;

  /* Ranking movement compares the register with itself as it stood this
     many days earlier: the same audits, minus those filed since. */
  var MOVEMENT_WINDOW_DAYS = 30;
  var FORMER_EXAMINER = 'Former Examiner';

  function ts(iso) { return Date.parse(iso) || 0; }

  /** UTC calendar day. The public register never carries a time of day. */
  function dayOf(iso) {
    var t = Date.parse(iso);
    return isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }

  function slugOf(value) { return T.normalizeName(value).replace(/\s+/g, '-'); }

  /* Display names are public; anything resembling an address is not. */
  function publicName(name) {
    var clean = T.cleanDisplayName(name);
    return !clean || clean.indexOf('@') !== -1 ? 'Examiner' : clean;
  }

  /* The establishment's opening date exactly as analytics.buildView reads it. */
  function openedAt(establishment) {
    if (establishment.createdAt) return establishment.createdAt;
    var first = (establishment.audits || []).slice()
      .sort(function (a, b) { return ts(a.createdAt) - ts(b.createdAt); })[0];
    return first ? first.createdAt : null;
  }

  /* =============================================================
     SERVER SIDE — the projection
     ============================================================= */
  function buildPublicRegister(register, options) {
    options = options || {};
    var reg = register || {};
    var m = AN.compute(reg);
    var certified = {};
    m.certified.forEach(function (v) { certified[v.id] = true; });

    /* Examiners keep the register's own order: it fixes summation order. */
    var alias = {};
    var former = 0;
    var profiles = [];
    (reg.profiles || []).forEach(function (p) {
      var key = p.auditorKey || p.auditor_key || p.key;
      if (!key || alias[key]) return;
      if (p.active !== false) {
        alias[key] = key;
        profiles.push({ auditorKey: key, displayName: publicName(p.displayName || p.display_name || key), active: true });
        return;
      }
      former += 1;
      alias[key] = 'former-' + former;
      profiles.push({ auditorKey: alias[key], displayName: FORMER_EXAMINER, active: false });
    });
    function aliasOf(key) {
      if (!alias[key]) { former += 1; alias[key] = 'former-' + former; }
      return alias[key];
    }

    var locationById = {};
    (reg.locations || []).forEach(function (l) { locationById[l.id] = l; });

    /* analytics sorts establishments by opening time (stably). Doing the
       same here, before dates lose their time of day, means the public
       copy arrives already in the official order and stays in it. */
    var ordered = (reg.establishments || []).map(function (e, i) {
      return { e: e, i: i, t: ts(openedAt(e)) };
    }).sort(function (a, b) { return a.t - b.t || a.i - b.i; });

    var used = {};
    var usedOrder = [];
    var establishments = [];
    ordered.forEach(function (entry) {
      var e = entry.e;
      if (!certified[e.id]) return;
      var fileNumber = e.fileNumber || ('BPS-P' + String(establishments.length + 1).padStart(3, '0'));
      var audits = [];
      (e.audits || []).filter(S.auditIsCompliant).forEach(function (a) {
        var loc = locationById[a.locationId] || null;
        var name = loc ? loc.name : a.locationName;
        var id = slugOf(loc ? (loc.nameKey || loc.name) : a.locationName) || 'unrecorded';
        if (!used[id]) {
          used[id] = { id: id, name: name, nameKey: T.normalizeName(name),
                       group: (loc && loc.group) || T.presetGroupOf(name) || T.CUSTOM_GROUP.key,
                       isPreset: loc ? !!loc.isPreset : T.isPresetLocation(name) };
          usedOrder.push(id);
        }
        var out = {
          id: fileNumber + '/' + (audits.length + 1),
          auditorKey: aliasOf(a.auditorKey),
          burger: a.burger,
          locationId: id,
          locationName: name,
          schemaVersion: S.SCHEMA_VERSION,
          createdAt: dayOf(a.createdAt)
        };
        S.INPUT_KEYS.forEach(function (k) { out[k] = Number(a[k]); });
        audits.push(out);
      });
      establishments.push({
        id: fileNumber, fileNumber: fileNumber, name: e.name,
        category: T.coerceCategory(e.category), createdAt: dayOf(openedAt(e)),
        audits: audits
      });
    });

    var burgers = AN.unique(m.auditViews.map(function (v) { return v.burger; }));
    var summary = {
      generatedAt: new Date(options.now == null ? Date.now() : options.now).toISOString(),
      certificationMinimum: S.CERTIFICATION_MIN_AUDITORS,
      counts: {
        certified: m.counts.certified,
        pending: m.counts.pending,
        establishments: m.counts.establishments,
        audits: m.counts.audits,
        examiners: m.counts.auditors,
        locations: m.counts.locations,
        classes: m.counts.categories,
        burgers: burgers.length,
        awaitingRecertification: m.counts.legacyAudits
      },
      meanCPI: AN.mean(m.ranked.map(function (v) { return v.cpi; })),
      /* Named, never scored: a pending establishment has no official figure. */
      investigations: m.pending.slice().reverse().map(function (v) {
        return { name: v.name, category: v.category, categoryLabel: v.categoryLabel,
                 examiners: v.contributorCount, required: S.CERTIFICATION_MIN_AUDITORS,
                 openedOn: dayOf(v.createdAt) };
      }),
      examiners: m.auditorKeys.map(function (key) {
        var a = m.auditors[key];
        return { key: key, name: publicName(S.auditorName(key)), audits: a.n,
                 establishments: a.establishments, locations: a.locationsVisited };
      }),
      recordsOnFile: options.recordsOnFile == null ? null : Number(options.recordsOnFile)
    };

    return {
      version: FORMAT_VERSION,
      register: {
        profiles: profiles,
        locations: usedOrder.map(function (id) { return used[id]; }),
        establishments: establishments
      },
      summary: summary
    };
  }

  /* =============================================================
     BROWSER SIDE — read-only views over the public register
     filter = { basis, location, area, category }
     ============================================================= */
  function areaLocationIds(register, area) {
    return (register.locations || []).filter(function (l) { return l.group === area; })
      .map(function (l) { return l.id; });
  }

  function locationById(register, id) {
    return (register.locations || []).filter(function (l) { return l.id === id; })[0] || null;
  }

  /** The options analytics.compute() receives for a public filter. */
  function analyticsOptions(register, filter) {
    var f = filter || {};
    var opts = {};
    if (f.location) {
      var loc = locationById(register, f.location);
      opts.locationId = f.location;
      opts.locationName = loc ? loc.name : null;
    } else if (f.area) {
      opts.locationIds = areaLocationIds(register, f.area);
      opts.locationName = T.groupLabel(f.area);
    }
    if (f.category) opts.category = f.category;
    return opts;
  }

  /** Ranked rows for one basis + filter, via the app's own ordering. */
  function rankings(register, filter) {
    var f = filter || {};
    var metrics = AN.compute(register, analyticsOptions(register, f));
    var basis = S.rankingBasis(f.basis);
    var rows = S.rankByBasis(metrics.ranked, basis.key).map(function (v, i) {
      return { rank: i + 1, id: v.id, view: v, score: basis.getScore(v) };
    });
    return { metrics: metrics, basis: basis, rows: rows };
  }

  /* Only choices that actually produce a ranking are offered. An area
     (e.g. all of Minneapolis) is offered when it spans two or more
     audited locations, since it can certify on evidence no single
     neighbourhood holds. */
  function filterOptions(register) {
    var m = AN.compute(register);
    var groups = {};
    m.locationIndex.filter(function (l) { return l.audits > 0; }).forEach(function (l) {
      (groups[l.group] = groups[l.group] || []).push(l);
    });
    var order = T.LOCATION_GROUPS.map(function (g) { return g.key; }).concat([T.CUSTOM_GROUP.key]);
    function pos(key) { var i = order.indexOf(key); return i === -1 ? order.length : i; }

    var locationGroups = Object.keys(groups).sort(function (a, b) { return pos(a) - pos(b); })
      .map(function (key) {
        var area = null;
        if (key !== T.CUSTOM_GROUP.key && groups[key].length > 1) {
          var n = rankings(register, { area: key }).rows.length;
          if (n) area = { key: key, label: T.groupLabel(key), count: n };
        }
        var items = groups[key].map(function (l) {
          return { id: l.id, name: l.name, count: rankings(register, { location: l.id }).rows.length };
        }).filter(function (l) { return l.count > 0; })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });
        return { key: key, label: T.groupLabel(key), area: area, locations: items };
      })
      .filter(function (g) { return g.area || g.locations.length; });

    var categories = m.categoryIndex.filter(function (c) { return c.certified > 0; })
      .map(function (c) { return { key: c.key, label: c.label, count: c.certified }; });

    return { locationGroups: locationGroups, categories: categories };
  }

  /* ---------- ranking movement ---------- */
  function movementCutoff(generatedAt, days) {
    var t = Date.parse(generatedAt);
    if (!isFinite(t)) t = Date.now();
    return dayOf(new Date(t - (days == null ? MOVEMENT_WINDOW_DAYS : days) * DAY).toISOString());
  }

  /** The register restricted to audits filed before `cutoffDay` (YYYY-MM-DD). */
  function registerAsOf(register, cutoffDay) {
    return {
      profiles: register.profiles,
      locations: register.locations,
      establishments: (register.establishments || []).map(function (e) {
        var copy = {};
        Object.keys(e).forEach(function (k) { copy[k] = e[k]; });
        copy.audits = (e.audits || []).filter(function (a) { return dayOf(a.createdAt) < cutoffDay; });
        return copy;
      })
    };
  }

  function movement(register, filter, cutoffDay) {
    var now = rankings(register, filter).rows;
    var before = rankings(registerAsOf(register, cutoffDay), filter).rows;
    var prior = {};
    before.forEach(function (r) { prior[r.id] = r.rank; });
    var out = {};
    now.forEach(function (r) {
      var p = prior[r.id];
      out[r.id] = p == null
        ? { status: 'new', prior: null, delta: null }
        : { status: p > r.rank ? 'up' : (p < r.rank ? 'down' : 'same'), prior: p, delta: p - r.rank };
    });
    return out;
  }

  /** The day the Nth distinct examiner first filed a current audit. */
  function certifiedOn(view) {
    var firsts = (view.contributorKeys || []).map(function (key) {
      return Math.min.apply(null, (view.auditsBy[key] || []).map(function (a) { return ts(a.createdAt); }));
    }).filter(isFinite).sort(function (a, b) { return a - b; });
    var at = firsts[S.CERTIFICATION_MIN_AUDITORS - 1];
    return at == null ? null : dayOf(new Date(at).toISOString());
  }

  /* ---------- one establishment, as the public file shows it ---------- */
  function establishmentFile(metrics, rowsByBasis, id) {
    var view = (metrics.views || []).filter(function (v) { return v.id === id; })[0];
    if (!view || !view.certified) return null;
    var ranks = {};
    Object.keys(rowsByBasis || {}).forEach(function (key) {
      var rows = rowsByBasis[key] || [];
      rows.forEach(function (row) {
        if (row.id === id) ranks[key] = { rank: row.rank, of: rows.length, score: row.score };
      });
    });
    var history = view.compliantAudits.map(function (a, i) { return { a: a, i: i }; })
      .sort(function (x, y) { return ts(y.a.createdAt) - ts(x.a.createdAt) || y.i - x.i; })
      .map(function (x) {
        var w = S.calculateWeightedReviewerScore(S.withService(x.a));
        return { date: dayOf(x.a.createdAt), examiner: S.auditorName(x.a.auditorKey),
                 burger: x.a.burger, location: x.a.locationName, index: w == null ? null : w * 10 };
      });
    return {
      id: view.id, fileNumber: view.fileNumber, name: view.name,
      category: view.category, categoryLabel: view.categoryLabel,
      locations: view.locations, burgers: view.burgers,
      examiners: view.contributorKeys.map(function (k) {
        return { key: k, name: S.auditorName(k), audits: view.auditCounts[k],
                 index: view.weighted[k] == null ? null : view.weighted[k] * 10 };
      }),
      examinerCount: view.contributorCount, audits: view.visits,
      cpi: view.cpi, bqi: view.bqi, fries: view.combined.fries, combined: view.combined,
      meanSpread: view.meanAbsDelta,
      openedOn: dayOf(view.createdAt), certifiedOn: certifiedOn(view),
      ranks: ranks, history: history
    };
  }

  /* =============================================================
     FINDINGS — facts only. The website supplies the wording; every
     value here is read from analytics output, and a finding exists
     only when the data supports it.
     ============================================================= */
  function ref(v, extra) {
    var out = { id: v.id, name: v.name, categoryLabel: v.categoryLabel };
    Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  function findings(m) {
    var certified = m.certified || [];
    var out = { certified: certified.length };
    if (!certified.length) return out;
    var ex = AN.extremeBy;
    var board = m.categoryBoard;
    var several = certified.length >= 2;

    var split = ex(certified, function (v) { return v.maxAbsDelta; }, 'max');
    if (split && split.value > 0) {
      out.disagreement = ref(split.item, { category: split.item.maxAbsDeltaCat,
        categoryName: S.categoryLabel(split.item.maxAbsDeltaCat), spread: split.value,
        examiners: split.item.contributorCount });
    }

    if (several) {
      var calm = ex(certified, function (v) { return v.meanAbsDelta; }, 'min');
      if (calm) out.concurrence = ref(calm.item, { meanSpread: calm.value,
        exactCategories: calm.item.exactCells, categories: S.CATEGORY_KEYS.length,
        examiners: calm.item.contributorCount });
    }

    var fries = board.fries;
    out.fries = {
      mean: fries.mean,
      best: fries.best ? ref(fries.best, { value: fries.bestValue }) : null,
      worst: several && fries.worst ? ref(fries.worst, { value: fries.worstValue }) : null,
      weakestAt: certified.filter(function (v) { return v.worst.combined === 'fries'; }).length,
      of: certified.length
    };

    /* Burger quality and fries share the ten-point scale (BQI / 10). */
    function gap(v) { return v.bqi / 10 - v.combined.fries; }
    var burgerLed = ex(certified, gap, 'max');
    if (burgerLed && burgerLed.value > 0) {
      out.burgerOverFries = ref(burgerLed.item, { burger: burgerLed.item.bqi / 10,
        fries: burgerLed.item.combined.fries, gap: burgerLed.value });
    }
    var friesLed = ex(certified, gap, 'min');
    if (friesLed && friesLed.value < 0) {
      out.friesOverBurger = ref(friesLed.item, { burger: friesLed.item.bqi / 10,
        fries: friesLed.item.combined.fries, gap: -friesLed.value });
    }

    var busiest = ex(certified, function (v) { return v.visits; }, 'max');
    if (busiest && busiest.value >= 3) {
      out.mostExamined = ref(busiest.item, { audits: busiest.value,
        examiners: busiest.item.contributorCount, locations: busiest.item.locations.length });
    }

    out.categories = S.CATEGORY_KEYS.map(function (key) {
      var b = board[key];
      return {
        key: key, label: S.categoryLabel(key), weight: S.SCORING_WEIGHTS[key], mean: b.mean,
        best: b.best ? ref(b.best, { value: b.bestValue }) : null,
        worst: several && b.worst ? ref(b.worst, { value: b.worstValue }) : null
      };
    });
    if (m.strongestCat && m.weakestCat && m.strongestCat !== m.weakestCat) {
      out.strongest = { key: m.strongestCat, label: S.categoryLabel(m.strongestCat), mean: board[m.strongestCat].mean };
      out.weakest = { key: m.weakestCat, label: S.categoryLabel(m.weakestCat), mean: board[m.weakestCat].mean };
    }

    out.recent = certified.map(function (v, i) { return { v: v, i: i, on: certifiedOn(v) }; })
      .sort(function (a, b) {
        if (a.on !== b.on) return a.on < b.on ? 1 : -1;
        return b.i - a.i;
      })
      .slice(0, 5)
      .map(function (x) { return ref(x.v, { on: x.on, cpi: x.v.cpi }); });

    out.classes = m.categoryIndex.filter(function (c) { return c.certified > 0; })
      .map(function (c) { return { key: c.key, label: c.label, certified: c.certified, meanCPI: c.meanCPI }; })
      .sort(function (a, b) { return b.meanCPI - a.meanCPI; });

    /* Mean weighted index each examiner has awarded on certified files. */
    out.examiners = m.auditorKeys.map(function (key) {
      var a = m.auditors[key];
      return { key: key, name: S.auditorName(key), audits: a.n,
               meanIndex: a.weighted.mean == null ? null : a.weighted.mean * 10 };
    });

    return out;
  }

  return {
    FORMAT_VERSION: FORMAT_VERSION,
    MOVEMENT_WINDOW_DAYS: MOVEMENT_WINDOW_DAYS,
    dayOf: dayOf,
    slugOf: slugOf,
    buildPublicRegister: buildPublicRegister,
    areaLocationIds: areaLocationIds,
    analyticsOptions: analyticsOptions,
    rankings: rankings,
    filterOptions: filterOptions,
    movementCutoff: movementCutoff,
    registerAsOf: registerAsOf,
    movement: movement,
    certifiedOn: certifiedOn,
    establishmentFile: establishmentFile,
    findings: findings
  };
});
