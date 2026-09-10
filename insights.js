/* =============================================================
   Bureau of Patty Statistics — insights.js

   The rule registry and the rotation engine.

   Separation of concerns:
     analytics.js  computes real statistics
     insights.js   interprets them as bureaucratic prose  <- here
     app.js        renders them

   A rule NEVER calculates statistics. It reads precomputed metrics,
   decides whether it applies, and returns wording.

   Rule shape (built by the R() helper below):
     { id, family, minCertified, minAudits, minPending, priority,
       rarity, exclusive, test(m), variants: [ fn(m, H) -> {title, body} ] }

   Rarity affects selection weight, not eligibility: a 'legendary'
   condition is strongly favoured on the rare occasions it is true.
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.insights = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var S = (typeof module !== 'undefined' && module.exports)
    ? require('./scoring.js')
    : root.BPS.scoring;

  /* ---------- wording helpers handed to every rule ---------- */
  function fixed(x, places) {
    return S.roundTo(Number(x), places).toFixed(places);
  }

  var H = {
    n1: function (x) { return fixed(x, 1); },
    n2: function (x) { return fixed(x, 2); },
    n0: function (x) { return String(Math.round(Number(x))); },
    pct: function (x, places) { var p = places == null ? 0 : places; return fixed(x, p) + '%'; },
    abs1: function (x) { return fixed(Math.abs(Number(x)), 1); },
    abs2: function (x) { return fixed(Math.abs(Number(x)), 2); },
    sgn: function (x) { var v = Number(x); return (v > 0 ? '+' : '') + fixed(v, 1); },
    cat: function (key) { return S.categoryLabel(key); },
    lcat: function (key) { return S.categoryLabel(key).toLowerCase(); },
    name: function (key) { return S.auditorName(key); },
    other: function (key) { return S.auditorName(S.otherAuditor(key)); },
    ord: function (n) { return '#' + Math.round(Number(n)); },
    /** "the Jucy Lucy (Matt's Bar)" */
    spec: function (v) { return v ? v.burger + ' (' + v.restaurant + ')' : 'an unidentified specimen'; },
    bare: function (v) { return v ? v.burger : 'an unidentified specimen'; },
    cpi: function (v) { return v && v.cpi != null ? fixed(v.cpi, 1) : '—'; },
    days: function (ms) {
      var d = ms / 86400000;
      if (d < 1) return H.hours(ms);
      var r = Math.round(d);
      return r + (r === 1 ? ' day' : ' days');
    },
    hours: function (ms) {
      var h = ms / 3600000;
      if (h < 1) { var mn = Math.max(1, Math.round(ms / 60000)); return mn + (mn === 1 ? ' minute' : ' minutes'); }
      var r = Math.round(h);
      return r + (r === 1 ? ' hour' : ' hours');
    },
    plural: function (n, one, many) { return Math.round(n) === 1 ? one : (many || one + 's'); },
    times: function (n) { var r = Math.round(n); return r === 1 ? 'once' : (r === 2 ? 'twice' : r + ' times'); },
    pick: function (arr, seed) { return arr[Math.abs(seed || 0) % arr.length]; }
  };

  /* ---------- registry ---------- */
  var RULES = [];
  var byId = {};

  /**
   * R(id, family, gates, test, ...variants)
   *   gates: { c: minCertified, a: minAuditsEither, p: minPending,
   *            pr: priority 1-10, r: rarity, x: exclusive-tag }
   */
  function R(id, family, gates, test) {
    var variants = Array.prototype.slice.call(arguments, 4);
    if (byId[id]) throw new Error('Duplicate insight rule id: ' + id);
    var rule = {
      id: id,
      family: family,
      minCertified: gates.c || 0,
      minAudits: gates.a || 0,
      minPending: gates.p || 0,
      priority: gates.pr == null ? 5 : gates.pr,
      rarity: gates.r || 'common',
      exclusive: gates.x || null,
      test: test,
      variants: variants
    };
    RULES.push(rule);
    byId[id] = rule;
    return rule;
  }

  /* Guards used constantly by rules; keep them tiny and null-safe. */
  function num(x) { return x != null && isFinite(x); }
  function gt(x, n) { return num(x) && x > n; }
  function lt(x, n) { return num(x) && x < n; }
  function gte(x, n) { return num(x) && x >= n; }
  function lte(x, n) { return num(x) && x <= n; }

  /* ---------- eligibility ---------- */
  function isEligible(rule, m) {
    if (m.counts.certified < rule.minCertified) return false;
    if (rule.minPending > 0 && m.counts.pending < rule.minPending) return false;
    if (rule.minAudits > 0 &&
        m.auditors.ryan.n < rule.minAudits &&
        m.auditors.devin.n < rule.minAudits) return false;
    try {
      return !!rule.test(m);
    } catch (err) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[BPS] insight rule threw during test:', rule.id, err.message);
      }
      return false;
    }
  }

  function eligibleRules(m) {
    return RULES.filter(function (r) { return isEligible(r, m); });
  }

  /* ---------- rendering ---------- */
  var BAD = /(NaN|undefined|Infinity|\[object|null)/;

  function render(rule, m, variantIndex) {
    var idx = variantIndex == null
      ? Math.floor(Math.random() * rule.variants.length)
      : variantIndex % rule.variants.length;
    try {
      var out = rule.variants[idx](m, H);
      if (!out || !out.title || !out.body) return null;
      if (BAD.test(out.title) || BAD.test(out.body)) return null;
      return {
        id: rule.id, family: rule.family, rarity: rule.rarity,
        priority: rule.priority, variant: idx,
        title: out.title, body: out.body
      };
    } catch (err) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[BPS] insight rule threw during build:', rule.id, err.message);
      }
      return null;
    }
  }

  /* ---------- rotation ----------
     Goals: 6–12 findings, a couple of genuinely meaningful ones,
     no family monoculture, rare conditions strongly favoured when
     they actually occur, and a different set on the next visit. */
  var RARITY_WEIGHT = { common: 1, uncommon: 1.8, rare: 3.4, legendary: 7 };
  var RECENT_KEY = 'bps.insights.recent';
  var RECENT_MAX = 24;

  function loadRecent(storage) {
    try {
      var raw = (storage || root.localStorage).getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveRecent(ids, storage) {
    try {
      var merged = ids.concat(loadRecent(storage)).slice(0, RECENT_MAX);
      (storage || root.localStorage).setItem(RECENT_KEY, JSON.stringify(merged));
    } catch (e) { /* private mode, quota, no storage — non-fatal */ }
  }

  function select(m, options) {
    options = options || {};
    var rng = options.rng || Math.random;
    var min = options.min || 6;
    var max = options.max || 12;
    var familyCap = options.familyCap || 2;
    var recent = options.ignoreRecent ? [] : loadRecent(options.storage);

    var pool = eligibleRules(m);
    if (!pool.length) return [];

    /* Score each candidate: priority, rarity boost, a recency penalty
       and jitter so repeat visits reshuffle. */
    var scored = pool.map(function (rule) {
      var weight = (rule.priority + 1) * (RARITY_WEIGHT[rule.rarity] || 1);
      if (recent.indexOf(rule.id) !== -1) weight *= 0.22;
      return { rule: rule, score: weight * (0.55 + rng() * 0.9) };
    }).sort(function (a, b) { return b.score - a.score; });

    var target = Math.min(max, Math.max(min, Math.min(max, pool.length)));
    var chosen = [];
    var familyCount = {};
    var usedExclusive = {};

    function tryTake(entry, capOverride) {
      var rule = entry.rule;
      var cap = capOverride == null ? familyCap : capOverride;
      if ((familyCount[rule.family] || 0) >= cap) return false;
      if (rule.exclusive && usedExclusive[rule.exclusive]) return false;
      var built = render(rule, m, options.variantIndex);
      if (!built) return false;
      chosen.push(built);
      familyCount[rule.family] = (familyCount[rule.family] || 0) + 1;
      if (rule.exclusive) usedExclusive[rule.exclusive] = true;
      return true;
    }

    /* 1. Lead with up to three genuinely important findings. */
    scored.filter(function (e) { return e.rule.priority >= 8; })
      .slice(0, 6)
      .forEach(function (e) { if (chosen.length < 3) tryTake(e); });

    /* 2. Fill the body with family diversity enforced. */
    scored.forEach(function (e) {
      if (chosen.length >= target) return;
      if (chosen.some(function (c) { return c.id === e.rule.id; })) return;
      tryTake(e);
    });

    /* 3. If diversity caps starved us, relax them to reach the minimum. */
    if (chosen.length < min) {
      scored.forEach(function (e) {
        if (chosen.length >= min) return;
        if (chosen.some(function (c) { return c.id === e.rule.id; })) return;
        tryTake(e, 99);
      });
    }

    if (!options.noStore) saveRecent(chosen.map(function (c) { return c.id; }), options.storage);
    return chosen;
  }

  /* ---------- introspection for tests ---------- */
  function stats() {
    var families = {};
    var rarities = {};
    var variants = 0;
    RULES.forEach(function (r) {
      families[r.family] = (families[r.family] || 0) + 1;
      rarities[r.rarity] = (rarities[r.rarity] || 0) + 1;
      variants += r.variants.length;
    });
    return {
      rules: RULES.length, variants: variants,
      families: families, rarities: rarities,
      familyCount: Object.keys(families).length
    };
  }

  var api = {
    R: R, RULES: RULES, byId: byId, H: H,
    num: num, gt: gt, lt: lt, gte: gte, lte: lte,
    isEligible: isEligible, eligibleRules: eligibleRules,
    render: render, select: select, stats: stats,
    loadRecent: loadRecent, saveRecent: saveRecent,
    RECENT_KEY: RECENT_KEY
  };

  /* Rule library is appended below by insight-rules.js */
  return api;
});
