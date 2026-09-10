/* =============================================================
   Bureau of Patty Statistics — scoring.js

   Pure calculation layer. No DOM, no events, no state, no I/O.
   Loaded as a plain <script> (exposes window.BPS.scoring) and also
   require()-able from Node so the test suite runs headlessly.

   PRECISION CONTRACT
   ------------------
   Every function here returns FULL PRECISION. Nothing rounds.
   Rounding happens only in formatScore() / formatCPI(), which exist
   solely for display. Ranking, analytics, records and the insight
   engine all consume the raw values, so a rounded figure on screen
   can never influence an ordering or a downstream statistic.

   RANKED ENTITY
   -------------
   The ranked entity is the ESTABLISHMENT. An establishment holds many
   audits; each audit is one auditor's visit — one burger, at one
   location, on one date. Neither the burger nor the branch is ranked.

   CERTIFICATION CONTRACT
   ----------------------
   Certification describes AUDIT COMPLETENESS, never score quality.
   An establishment is CERTIFIED once BOTH auditors hold at least one
   audit that satisfies the CURRENT scoring schema. They need not have
   eaten the same burger, visited the same branch, or filed together.

   SCHEMA VERSIONING
   -----------------
   When the scoring schema gains a requirement, historical audits are
   preserved untouched and simply stop counting as current. They are
   never deleted and never silently zero-filled: the establishment
   returns to Pending until each auditor has one compliant audit again.
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.scoring = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var T = (typeof module !== 'undefined' && module.exports)
    ? require('./taxonomy.js')
    : root.BPS.taxonomy;

  /* =============================================================
     SCHEMA VERSION
     v1  six categories, one burger per record
     v2  adds Service (Speed + Friendliness) and a required location
     ============================================================= */
  var SCHEMA_VERSION = 2;
  var LEGACY_SCHEMA_VERSION = 1;

  /* ---------- Categories ----------
     Six are entered directly. Service is DERIVED from two sub-scores
     and is never typed in as a single figure. */
  /* `short` is the label for dense grids on a phone, where the full
     name would have to be clipped to fit. */
  var CATEGORIES = [
    { key: 'patty',         label: 'Patty',                 short: 'Patty',      column: 'patty' },
    { key: 'overallFlavor', label: 'Overall Flavor',        short: 'Flavor',     column: 'overall_flavor' },
    { key: 'bun',           label: 'Bun',                   short: 'Bun',        column: 'bun' },
    { key: 'fries',         label: 'Fries',                 short: 'Fries',      column: 'fries' },
    { key: 'value',         label: 'Value',                 short: 'Value',      column: 'value' },
    { key: 'condiments',    label: 'Condiments / Toppings', short: 'Condiments', column: 'condiments' },
    { key: 'service',       label: 'Service',               short: 'Service',    column: null, derived: true }
  ];

  /* The two halves of Service. Each is scored 0.0–10.0 in tenths. */
  var SERVICE_SUBSCORES = [
    { key: 'serviceSpeed',        label: 'Speed',        column: 'service_speed' },
    { key: 'serviceFriendliness', label: 'Friendliness', column: 'service_friendliness' }
  ];

  var CATEGORY_KEYS = CATEGORIES.map(function (c) { return c.key; });
  var DIRECT_CATEGORIES = CATEGORIES.filter(function (c) { return !c.derived; });
  var DIRECT_KEYS = DIRECT_CATEGORIES.map(function (c) { return c.key; });
  var SERVICE_KEYS = SERVICE_SUBSCORES.map(function (c) { return c.key; });
  /* Everything an auditor physically enters: six categories + two sub-scores. */
  var INPUT_KEYS = DIRECT_KEYS.concat(SERVICE_KEYS);
  /* Every persisted numeric column, in a stable order. */
  var SCORE_COLUMNS = DIRECT_CATEGORIES.concat(SERVICE_SUBSCORES);

  function categoryLabel(key) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) return CATEGORIES[i].label;
    }
    for (var j = 0; j < SERVICE_SUBSCORES.length; j++) {
      if (SERVICE_SUBSCORES[j].key === key) return 'Service ' + SERVICE_SUBSCORES[j].label;
    }
    return key;
  }

  /* ---------- SCORING_WEIGHTS ----------
     Whole percentages, not fractions: integers sum to exactly 100 with
     no floating-point drift, so "weights total 100%" is an exact check.
     THE single source of truth. Nothing else contains a percentage. */
  var SCORING_WEIGHTS = {
    patty:         25,
    overallFlavor: 25,
    bun:           15,
    fries:         10,
    value:         10,
    condiments:     5,
    service:       10
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

  /* A derived mean is a real number on the scale but need not land on a
     tenth, so aggregates are checked with this looser test. */
  function isOnScale(value) {
    if (value == null || value === '') return false;
    var n = Number(value);
    return isFinite(n) && n >= SCALE.min && n <= SCALE.max;
  }

  /* ---------- Service ----------
     Service = (Speed + Friendliness) / 2, full precision.
     Null — never zero — when either half is absent. */
  function serviceScore(scores) {
    if (!scores) return null;
    var speed = scores.serviceSpeed;
    var friendliness = scores.serviceFriendliness;
    if (isOnScale(speed) && isOnScale(friendliness)) {
      return (Number(speed) + Number(friendliness)) / 2;
    }
    /* An aggregate carries `service` directly; a raw audit never does. */
    return isOnScale(scores.service) ? Number(scores.service) : null;
  }

  function hasServiceDetail(scores) {
    return !!scores && isScored(scores.serviceSpeed) && isScored(scores.serviceFriendliness);
  }

  /** Resolve one scoring category from a score set. Service is derived. */
  function categoryValue(scores, key) {
    if (!scores) return null;
    if (key === 'service') return serviceScore(scores);
    return isOnScale(scores[key]) ? Number(scores[key]) : null;
  }

  /** A copy carrying the derived `service` value alongside the inputs. */
  function withService(scores) {
    if (!scores) return null;
    var out = {};
    Object.keys(scores).forEach(function (k) { out[k] = scores[k]; });
    out.service = serviceScore(scores);
    return out;
  }

  /** Every scoring category resolvable — enough to compute a weighted score. */
  function isCompleteScoreSet(scores) {
    if (!scores) return false;
    return CATEGORY_KEYS.every(function (key) { return categoryValue(scores, key) != null; });
  }

  /** Entered by hand, on the tenths, under the CURRENT scoring schema. */
  function isCurrentSchemaScores(scores) {
    if (!scores) return false;
    return DIRECT_KEYS.every(function (key) { return isScored(scores[key]); }) && hasServiceDetail(scores);
  }

  function countScored(scores) {
    if (!scores) return 0;
    return INPUT_KEYS.filter(function (key) { return isScored(scores && scores[key]); }).length;
  }

  /* =============================================================
     AUDIT COMPLIANCE

     Canonical in-app audit:
       { id, establishmentId, auditorKey, auditorId, burger, locationId,
         locationName, schemaVersion, createdAt, updatedAt,
         patty, overallFlavor, bun, fries, value, condiments,
         serviceSpeed, serviceFriendliness, service }

     An audit counts toward certification, ranking and records only
     when it satisfies EVERY current requirement. Legacy audits stay on
     file, keep their scores, and are simply not current.
     ============================================================= */
  var REQUIREMENTS = [
    { key: 'scores',   label: 'Category scores',
      test: function (a) { return !!a && DIRECT_KEYS.every(function (k) { return isScored(a[k]); }); } },
    { key: 'service',  label: 'Service (Speed & Friendliness)',
      test: function (a) { return hasServiceDetail(a); } },
    { key: 'location', label: 'Location',
      test: function (a) { return !!(a && a.locationId); } },
    { key: 'burger',   label: 'Burger examined',
      test: function (a) { return !!(a && String(a.burger || '').trim()); } }
  ];

  function missingRequirements(audit) {
    return REQUIREMENTS.filter(function (r) { return !r.test(audit); })
      .map(function (r) { return r.key; });
  }

  function missingRequirementLabels(audit) {
    return REQUIREMENTS.filter(function (r) { return !r.test(audit); })
      .map(function (r) { return r.label; });
  }

  function auditIsCompliant(audit) {
    return missingRequirements(audit).length === 0;
  }

  /* Legacy audits are recognised by what they LACK, not by their label:
     a row may declare the current version and still be missing a field,
     and the missing field is what decides. */
  function auditSchemaVersion(audit) {
    if (auditIsCompliant(audit)) return SCHEMA_VERSION;
    var declared = Number(audit && audit.schemaVersion);
    if (!isFinite(declared) || declared < LEGACY_SCHEMA_VERSION) return LEGACY_SCHEMA_VERSION;
    return Math.min(declared, SCHEMA_VERSION - 1);
  }

  /* ---------- Core calculations (full precision) ---------- */

  /**
   * One auditor's weighted score for a single score set, 0.0–10.0.
   * NOT rounded — callers format for display.
   */
  function calculateWeightedReviewerScore(scores) {
    if (!isCompleteScoreSet(scores)) return null;
    var weighted = CATEGORY_KEYS.reduce(function (sum, key) {
      return sum + categoryValue(scores, key) * SCORING_WEIGHTS[key];
    }, 0);
    return weighted / WEIGHT_TOTAL;
  }

  /**
   * Composite Patty Index, 0.0–100.0, from the two UNROUNDED weighted
   * scores. Null until both sides are complete.
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
      var r = categoryValue(ryanScores, key);
      var d = categoryValue(devinScores, key);
      out[key] = (r != null && d != null) ? (r + d) / 2 : null;
    });
    return out;
  }

  /**
   * The auditor's establishment-level profile: the per-field mean of
   * every compliant audit they hold there, at full precision.
   *
   * Because the weighting is linear, the weighted score of the mean is
   * identical to the mean of the weighted scores — so a repeat visit
   * moves the establishment composite exactly as far as it should.
   */
  function meanScoreSet(audits) {
    var list = (audits || []).filter(auditIsCompliant);
    if (!list.length) return null;
    var out = {};
    INPUT_KEYS.forEach(function (key) {
      var total = list.reduce(function (sum, a) { return sum + Number(a[key]); }, 0);
      out[key] = total / list.length;
    });
    out.service = serviceScore(out);
    return out;
  }

  /* =============================================================
     ESTABLISHMENT SHAPE HELPERS

     Canonical in-app establishment:
       { id, fileNumber, name, nameKey, category, createdBy, createdAt,
         updatedAt, audits: [ ...audit ] }
     ============================================================= */

  function auditsOf(establishment, auditorKey) {
    var list = (establishment && establishment.audits) || [];
    return auditorKey ? list.filter(function (a) { return a.auditorKey === auditorKey; }) : list.slice();
  }

  function compliantAuditsOf(establishment, auditorKey) {
    return auditsOf(establishment, auditorKey).filter(auditIsCompliant);
  }

  function legacyAuditsOf(establishment, auditorKey) {
    return auditsOf(establishment, auditorKey).filter(function (a) { return !auditIsCompliant(a); });
  }

  /** The aggregate score set this auditor's compliant audits produce. */
  function profileOf(establishment, auditorKey) {
    return meanScoreSet(compliantAuditsOf(establishment, auditorKey));
  }

  /* Retained name: "does this auditor hold a current audit here?" */
  function hasAudit(establishment, auditorKey) {
    return compliantAuditsOf(establishment, auditorKey).length > 0;
  }

  function weightedFor(establishment, auditorKey) {
    return calculateWeightedReviewerScore(profileOf(establishment, auditorKey));
  }

  /** Certification = both auditors hold a current-schema audit. */
  function isCertified(establishment) {
    return AUDITOR_KEYS.every(function (k) { return hasAudit(establishment, k); });
  }

  /** Total compliant audits on file for this establishment. */
  function auditCount(establishment) {
    return compliantAuditsOf(establishment).length;
  }

  /** The auditor who still owes a current audit, or null. */
  function missingAuditor(establishment) {
    var missing = AUDITOR_KEYS.filter(function (k) { return !hasAudit(establishment, k); });
    return missing.length === 1 ? missing[0] : null;
  }

  var STATUS = {
    CERTIFIED: { key: 'certified', label: 'Certified' },
    PENDING:   { key: 'pending',   label: 'Pending Peer Review' },
    EMPTY:     { key: 'empty',     label: 'No Current Audits' }
  };

  function statusOf(establishment) {
    var n = AUDITOR_KEYS.filter(function (k) { return hasAudit(establishment, k); }).length;
    if (n === AUDITOR_KEYS.length) return STATUS.CERTIFIED;
    if (n === 0) return STATUS.EMPTY;
    return STATUS.PENDING;
  }

  /** Official CPI. Null unless certified — a pending establishment has none. */
  function cpiOf(establishment) {
    if (!isCertified(establishment)) return null;
    return calculateCPI(profileOf(establishment, 'ryan'), profileOf(establishment, 'devin'));
  }

  function combinedOf(establishment) {
    return calculateCombinedCategoryAverages(
      profileOf(establishment, 'ryan'), profileOf(establishment, 'devin'));
  }

  /** Audits on file that predate the current schema and could be updated. */
  function recertifiableAudits(establishment, auditorKey) {
    return legacyAuditsOf(establishment, auditorKey);
  }

  /* ---------- Rankings ----------
     Official rankings contain CERTIFIED establishments only, ordered by
     raw (unrounded) CPI. Array.prototype.sort is stable, so genuinely
     equal raw values keep their incoming order. */
  function certifiedOnly(establishments) {
    return (establishments || []).filter(isCertified);
  }

  function rankEstablishments(establishments) {
    return certifiedOnly(establishments).slice().sort(function (a, b) {
      return cpiOf(b) - cpiOf(a);
    });
  }

  /**
   * One auditor's personal ranking, using only that auditor's aggregate
   * weighted score. Includes every establishment they have audited under
   * the current schema, certified or not.
   */
  function personalRanking(establishments, auditorKey) {
    return (establishments || [])
      .filter(function (e) { return hasAudit(e, auditorKey); })
      .slice()
      .sort(function (a, b) {
        return weightedFor(b, auditorKey) - weightedFor(a, auditorKey);
      });
  }

  /** 1-based official rank, or null when not certified. */
  function officialRankOf(establishments, establishmentId) {
    var ranked = rankEstablishments(establishments);
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === establishmentId) return i + 1;
    }
    return null;
  }

  function personalRankOf(establishments, auditorKey, establishmentId) {
    var ranked = personalRanking(establishments, auditorKey);
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === establishmentId) return i + 1;
    }
    return null;
  }

  /** Mean CPI across certified establishments, full precision. */
  function meanCPI(establishments) {
    var values = certifiedOnly(establishments).map(cpiOf).filter(function (v) { return v != null; });
    if (!values.length) return null;
    return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  }

  /** A copy of the establishment holding only audits the filter admits. */
  function restrictToAudits(establishment, predicate) {
    var copy = {};
    Object.keys(establishment).forEach(function (k) { copy[k] = establishment[k]; });
    copy.audits = (establishment.audits || []).filter(predicate);
    return copy;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    LEGACY_SCHEMA_VERSION: LEGACY_SCHEMA_VERSION,

    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    DIRECT_CATEGORIES: DIRECT_CATEGORIES,
    DIRECT_KEYS: DIRECT_KEYS,
    SERVICE_SUBSCORES: SERVICE_SUBSCORES,
    SERVICE_KEYS: SERVICE_KEYS,
    INPUT_KEYS: INPUT_KEYS,
    SCORE_COLUMNS: SCORE_COLUMNS,
    REQUIREMENTS: REQUIREMENTS,
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
    isOnScale: isOnScale,
    serviceScore: serviceScore,
    hasServiceDetail: hasServiceDetail,
    categoryValue: categoryValue,
    withService: withService,
    isCompleteScoreSet: isCompleteScoreSet,
    isCurrentSchemaScores: isCurrentSchemaScores,
    countScored: countScored,

    missingRequirements: missingRequirements,
    missingRequirementLabels: missingRequirementLabels,
    auditIsCompliant: auditIsCompliant,
    auditSchemaVersion: auditSchemaVersion,

    calculateWeightedReviewerScore: calculateWeightedReviewerScore,
    calculateCPI: calculateCPI,
    calculateCombinedCategoryAverages: calculateCombinedCategoryAverages,
    meanScoreSet: meanScoreSet,

    auditsOf: auditsOf,
    compliantAuditsOf: compliantAuditsOf,
    legacyAuditsOf: legacyAuditsOf,
    recertifiableAudits: recertifiableAudits,
    profileOf: profileOf,
    hasAudit: hasAudit,
    weightedFor: weightedFor,
    isCertified: isCertified,
    auditCount: auditCount,
    missingAuditor: missingAuditor,
    statusOf: statusOf,
    cpiOf: cpiOf,
    combinedOf: combinedOf,

    certifiedOnly: certifiedOnly,
    rankEstablishments: rankEstablishments,
    personalRanking: personalRanking,
    officialRankOf: officialRankOf,
    personalRankOf: personalRankOf,
    meanCPI: meanCPI,
    restrictToAudits: restrictToAudits
  };
});
