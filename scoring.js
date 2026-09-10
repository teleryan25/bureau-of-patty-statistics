/* =============================================================
   Bureau of Patty Statistics — scoring.js

   Pure calculation layer. No DOM, no events, no state, no I/O.
   Loaded as a plain <script> (exposes window.BPS.scoring) and also
   require()-able from Node so the test suite runs headlessly.

   PRECISION CONTRACT
   ------------------
   Every function here returns FULL PRECISION. Nothing rounds.
   Rounding happens only in formatScore() / formatCPI(), which exist
   solely for display. Ranking, analytics and the insight engine all
   consume the raw values, so a rounded figure on screen can never
   influence an ordering or a downstream statistic.

   CERTIFICATION CONTRACT
   ----------------------
   Certification describes AUDIT COMPLETENESS, never score quality.
   A burger both auditors have scored is CERTIFIED, however bad it is.
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.BPS = root.BPS || {};
  root.BPS.scoring = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- Categories ---------- */
  var CATEGORIES = [
    { key: 'patty',         label: 'Patty',                 column: 'patty' },
    { key: 'overallFlavor', label: 'Overall Flavor',        column: 'overall_flavor' },
    { key: 'bun',           label: 'Bun',                   column: 'bun' },
    { key: 'fries',         label: 'Fries',                 column: 'fries' },
    { key: 'value',         label: 'Value',                 column: 'value' },
    { key: 'condiments',    label: 'Condiments / Toppings', column: 'condiments' }
  ];

  var CATEGORY_KEYS = CATEGORIES.map(function (c) { return c.key; });

  function categoryLabel(key) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) return CATEGORIES[i].label;
    }
    return key;
  }

  /* ---------- SCORING_WEIGHTS ----------
     Whole percentages, not fractions: integers sum to exactly 100 with
     no floating-point drift, so "weights total 100%" is an exact check.
     THE single source of truth. Nothing else contains a percentage. */
  var SCORING_WEIGHTS = {
    patty:         30,
    overallFlavor: 25,
    bun:           15,
    fries:         10,
    value:         10,
    condiments:    10
  };

  var WEIGHT_TOTAL = 100;

  var SCALE = { min: 0, max: 10, step: 0.1, decimals: 1 };

  /* The two auditors. `key` is the durable application identity. */
  var AUDITORS = [
    { key: 'ryan',  name: 'Ryan' },
    { key: 'devin', name: 'Devin' }
  ];

  var AUDITOR_KEYS = AUDITORS.map(function (a) { return a.key; });

  function auditorName(key) {
    for (var i = 0; i < AUDITORS.length; i++) {
      if (AUDITORS[i].key === key) return AUDITORS[i].name;
    }
    return key;
  }

  function otherAuditor(key) {
    return key === 'ryan' ? 'devin' : 'ryan';
  }

  /* ---------- Display formatting ----------
     The ONLY place rounding is permitted. */
  function round1(n) {
    return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
  }

  function roundTo(n, places) {
    var f = Math.pow(10, places);
    var value = Number(n);
    var sign = value < 0 ? -1 : 1;
    return sign * Math.round((Math.abs(value) + Number.EPSILON) * f) / f;
  }

  /* toFixed() inherits the binary representation, so 7.35 (stored as
     7.34999...) would render as "7.3". Nudge through roundTo first so
     display rounding is predictable half-up at every call site. */
  function formatScore(n) {
    return (n == null || !isFinite(n)) ? '—' : roundTo(n, SCALE.decimals).toFixed(SCALE.decimals);
  }

  function formatCPI(n) {
    return (n == null || !isFinite(n)) ? '—' : roundTo(n, SCALE.decimals).toFixed(SCALE.decimals);
  }

  function formatSigned(n, places) {
    if (n == null || !isFinite(n)) return '—';
    var v = roundTo(n, places == null ? 1 : places);
    return (v > 0 ? '+' : '') + v.toFixed(places == null ? 1 : places);
  }

  function formatPct(n, places) {
    if (n == null || !isFinite(n)) return '—';
    return roundTo(n, places == null ? 0 : places).toFixed(places == null ? 0 : places) + '%';
  }

  /* ---------- Scale helpers ---------- */
  function clampToScale(n) {
    var v = Number(n);
    if (!isFinite(v)) return SCALE.min;
    if (v < SCALE.min) v = SCALE.min;
    if (v > SCALE.max) v = SCALE.max;
    return round1(v);   /* input snaps to tenths; this is data entry, not a calculation */
  }

  /* ---------- Validation ---------- */
  function weightsTotal() {
    return CATEGORY_KEYS.reduce(function (sum, key) {
      return sum + (SCORING_WEIGHTS[key] || 0);
    }, 0);
  }

  function weightsAreValid() {
    return weightsTotal() === WEIGHT_TOTAL;
  }

  function isScored(value) {
    if (value == null || value === '') return false;
    var n = Number(value);
    if (!isFinite(n) || n < SCALE.min || n > SCALE.max) return false;
    return Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;
  }

  function isCompleteScoreSet(scores) {
    if (!scores) return false;
    return CATEGORY_KEYS.every(function (key) { return isScored(scores[key]); });
  }

  function countScored(scores) {
    if (!scores) return 0;
    return CATEGORY_KEYS.filter(function (key) { return isScored(scores[key]); }).length;
  }

  /* ---------- Core calculations (full precision) ---------- */

  /**
   * One auditor's weighted personal score on the 0.0–10.0 scale.
   * NOT rounded — callers format for display.
   */
  function calculateWeightedReviewerScore(scores) {
    if (!isCompleteScoreSet(scores)) return null;
    var weighted = CATEGORY_KEYS.reduce(function (sum, key) {
      return sum + Number(scores[key]) * SCORING_WEIGHTS[key];
    }, 0);
    return weighted / WEIGHT_TOTAL;
  }

  /**
   * Composite Patty Index, 0.0–100.0, from the two UNROUNDED weighted
   * scores. Null until both audits are complete.
   */
  function calculateCPI(ryanScores, devinScores) {
    var ryan = calculateWeightedReviewerScore(ryanScores);
    var devin = calculateWeightedReviewerScore(devinScores);
    if (ryan == null || devin == null) return null;
    return ((ryan + devin) / 2) * 10;
  }

  /** Descriptive per-category means. Findings only — never feeds CPI. */
  function calculateCombinedCategoryAverages(ryanScores, devinScores) {
    var out = {};
    CATEGORY_KEYS.forEach(function (key) {
      var r = ryanScores && ryanScores[key];
      var d = devinScores && devinScores[key];
      out[key] = (isScored(r) && isScored(d)) ? (Number(r) + Number(d)) / 2 : null;
    });
    return out;
  }

  /* ---------- Burger shape helpers ----------
     Canonical in-app burger:
       { id, specimenNumber, restaurant, burger, createdBy, createdAt,
         audits: { ryan: <scores|null>, devin: <scores|null> } }
     An audit carries the six category keys plus createdAt / updatedAt. */

  function auditOf(burger, auditorKey) {
    return (burger && burger.audits && burger.audits[auditorKey]) || null;
  }

  function hasAudit(burger, auditorKey) {
    return isCompleteScoreSet(auditOf(burger, auditorKey));
  }

  function weightedFor(burger, auditorKey) {
    return calculateWeightedReviewerScore(auditOf(burger, auditorKey));
  }

  /** Certification = both audits filed. Never score-dependent. */
  function isCertified(burger) {
    return AUDITOR_KEYS.every(function (k) { return hasAudit(burger, k); });
  }

  function auditCount(burger) {
    return AUDITOR_KEYS.filter(function (k) { return hasAudit(burger, k); }).length;
  }

  /** The auditor who still owes an audit, or null. */
  function missingAuditor(burger) {
    var missing = AUDITOR_KEYS.filter(function (k) { return !hasAudit(burger, k); });
    return missing.length === 1 ? missing[0] : null;
  }

  var STATUS = {
    CERTIFIED: { key: 'certified', label: 'Certified' },
    PENDING:   { key: 'pending',   label: 'Pending Peer Review' },
    EMPTY:     { key: 'empty',     label: 'No Audits Filed' }
  };

  function statusOf(burger) {
    var n = auditCount(burger);
    if (n === AUDITOR_KEYS.length) return STATUS.CERTIFIED;
    if (n === 0) return STATUS.EMPTY;
    return STATUS.PENDING;
  }

  /** Official CPI. Null unless certified — a pending specimen has none. */
  function cpiOf(burger) {
    if (!isCertified(burger)) return null;
    return calculateCPI(auditOf(burger, 'ryan'), auditOf(burger, 'devin'));
  }

  function combinedOf(burger) {
    return calculateCombinedCategoryAverages(auditOf(burger, 'ryan'), auditOf(burger, 'devin'));
  }

  /* ---------- Rankings ----------
     Official rankings contain CERTIFIED specimens only, ordered by raw
     (unrounded) CPI. Array.prototype.sort is stable, so genuinely equal
     raw values keep their incoming order. */
  function certifiedOnly(burgers) {
    return (burgers || []).filter(isCertified);
  }

  function rankBurgers(burgers) {
    return certifiedOnly(burgers).slice().sort(function (a, b) {
      return cpiOf(b) - cpiOf(a);
    });
  }

  /**
   * One auditor's personal ranking, using only that auditor's weighted
   * score. Includes every burger they have audited, certified or not.
   */
  function personalRanking(burgers, auditorKey) {
    return (burgers || [])
      .filter(function (b) { return hasAudit(b, auditorKey); })
      .slice()
      .sort(function (a, b) {
        return weightedFor(b, auditorKey) - weightedFor(a, auditorKey);
      });
  }

  /** 1-based official rank, or null when not certified. */
  function officialRankOf(burgers, burgerId) {
    var ranked = rankBurgers(burgers);
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === burgerId) return i + 1;
    }
    return null;
  }

  function personalRankOf(burgers, auditorKey, burgerId) {
    var ranked = personalRanking(burgers, auditorKey);
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === burgerId) return i + 1;
    }
    return null;
  }

  /** Mean CPI across certified specimens, full precision. */
  function meanCPI(burgers) {
    var values = certifiedOnly(burgers).map(cpiOf).filter(function (v) { return v != null; });
    if (!values.length) return null;
    return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  }

  return {
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    categoryLabel: categoryLabel,
    SCORING_WEIGHTS: SCORING_WEIGHTS,
    WEIGHT_TOTAL: WEIGHT_TOTAL,
    SCALE: SCALE,
    AUDITORS: AUDITORS,
    AUDITOR_KEYS: AUDITOR_KEYS,
    auditorName: auditorName,
    otherAuditor: otherAuditor,
    STATUS: STATUS,

    round1: round1,
    roundTo: roundTo,
    formatScore: formatScore,
    formatCPI: formatCPI,
    formatSigned: formatSigned,
    formatPct: formatPct,
    clampToScale: clampToScale,

    weightsTotal: weightsTotal,
    weightsAreValid: weightsAreValid,
    isScored: isScored,
    isCompleteScoreSet: isCompleteScoreSet,
    countScored: countScored,

    calculateWeightedReviewerScore: calculateWeightedReviewerScore,
    calculateCPI: calculateCPI,
    calculateCombinedCategoryAverages: calculateCombinedCategoryAverages,

    auditOf: auditOf,
    hasAudit: hasAudit,
    weightedFor: weightedFor,
    isCertified: isCertified,
    auditCount: auditCount,
    missingAuditor: missingAuditor,
    statusOf: statusOf,
    cpiOf: cpiOf,
    combinedOf: combinedOf,

    certifiedOnly: certifiedOnly,
    rankBurgers: rankBurgers,
    personalRanking: personalRanking,
    officialRankOf: officialRankOf,
    personalRankOf: personalRankOf,
    meanCPI: meanCPI
  };
});
