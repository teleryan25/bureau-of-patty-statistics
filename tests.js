/* =============================================================
   Bureau of Patty Statistics — tests.js

   Runs two ways:
     node tests.js         headless, exits non-zero on failure
     index.html?test=1     logs a summary to the browser console

   Covers: scoring precision and the new weights, Service, schema
   versioning and recertification, the establishment model, locations,
   categories, filtering, editing rules, the Records Office, analytics
   and the insight engine. Browser interaction is tested separately.
   ============================================================= */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);

  var T  = isNode ? require('./taxonomy.js')  : root.BPS.taxonomy;
  var S  = isNode ? require('./scoring.js')   : root.BPS.scoring;
  var AN = isNode ? require('./analytics.js') : root.BPS.analytics;
  var IN = isNode ? require('./insights.js')  : root.BPS.insights;
  var RC = isNode ? require('./records.js')   : root.BPS.records;
  var DS = isNode ? require('./disasters.js') : root.BPS.disasters;
  var D  = isNode ? require('./data.js')      : root.BPS.data;
  if (isNode) require('./insight-rules.js');

  var results = [];
  var K = S.CATEGORY_KEYS;
  var INPUTS = S.INPUT_KEYS;

  function check(name, actual, expected) {
    results.push({ name: name, pass: Object.is(actual, expected) || actual === expected, actual: actual, expected: expected });
  }
  function near(name, actual, expected, eps) {
    var ok = actual != null && Math.abs(actual - expected) < (eps || 1e-9);
    results.push({ name: name, pass: ok, actual: actual, expected: expected });
  }
  function ok(name, cond, detail) {
    results.push({ name: name, pass: !!cond, actual: detail === undefined ? cond : detail, expected: true });
  }

  /* ---- fixtures ---- */
  function flat(v) { var o = {}; INPUTS.forEach(function (k) { o[k] = v; }); return o; }
  function sc(p, o, b, f, va, c, speed, friend) {
    return { patty: p, overallFlavor: o, bun: b, fries: f, value: va, condiments: c,
             serviceSpeed: speed, serviceFriendliness: friend };
  }
  var AUDIT_SEQ = 0;
  function audit(auditorKey, scores, opts) {
    opts = opts || {};
    AUDIT_SEQ += 1;
    var a = {
      id: opts.id || ('a' + AUDIT_SEQ),
      establishmentId: opts.establishmentId || 'e1',
      auditorId: auditorKey === 'ryan' ? 'uuid-ryan' : 'uuid-devin',
      auditorKey: auditorKey,
      burger: opts.burger === undefined ? 'Standard Burger' : opts.burger,
      locationId: opts.locationId === undefined ? 'loc-1' : opts.locationId,
      locationName: opts.locationName === undefined ? 'Uptown' : opts.locationName,
      schemaVersion: opts.legacy ? S.LEGACY_SCHEMA_VERSION : S.SCHEMA_VERSION,
      createdAt: opts.at || '2026-06-01T12:00:00Z',
      updatedAt: opts.at || '2026-06-01T12:00:00Z'
    };
    INPUTS.forEach(function (k) { a[k] = scores && scores[k] != null ? Number(scores[k]) : null; });
    a.service = S.serviceScore(a);
    return a;
  }
  function establishment(id, name, category, audits, opts) {
    opts = opts || {};
    (audits || []).forEach(function (a) { a.establishmentId = id; });
    return {
      id: id, fileNumber: 'BPS-' + id, name: name, nameKey: T.normalizeName(name),
      category: category || 'other', createdBy: 'uuid-ryan',
      createdAt: opts.createdAt || '2026-06-01T12:00:00Z',
      updatedAt: opts.createdAt || '2026-06-01T12:00:00Z',
      audits: audits || []
    };
  }
  function register(establishments, locations) {
    return {
      establishments: establishments,
      locations: locations || [
        { id: 'loc-1', name: 'Uptown', nameKey: 'uptown', group: 'minneapolis', isPreset: true, archived: false },
        { id: 'loc-2', name: 'Richfield', nameKey: 'richfield', group: 'inner-ring', isPreset: true, archived: false },
        { id: 'loc-3', name: 'Eden Prairie', nameKey: 'eden prairie', group: 'greater-metro', isPreset: true, archived: false }
      ]
    };
  }

  /* =====================================================
     1. SCORING — weights, Service and full precision
     ===================================================== */
  check('weights total exactly 100', S.weightsTotal(), 100);
  ok('weightsAreValid()', S.weightsAreValid());
  check('seven scoring categories', K.length, 7);
  check('eight entered figures', INPUTS.length, 8);
  check('patty weight 25', S.SCORING_WEIGHTS.patty, 25);
  check('overallFlavor weight 25', S.SCORING_WEIGHTS.overallFlavor, 25);
  check('bun weight 15', S.SCORING_WEIGHTS.bun, 15);
  check('fries weight 10', S.SCORING_WEIGHTS.fries, 10);
  check('value weight 10', S.SCORING_WEIGHTS.value, 10);
  check('condiments weight 5', S.SCORING_WEIGHTS.condiments, 5);
  check('service weight 10', S.SCORING_WEIGHTS.service, 10);
  check('weights sum by hand', 25 + 25 + 15 + 10 + 10 + 5 + 10, 100);

  /* Service is derived, never entered as one figure. */
  check('service = mean of speed and friendliness',
    S.serviceScore({ serviceSpeed: 8, serviceFriendliness: 6 }), 7);
  near('service keeps full precision',
    S.serviceScore({ serviceSpeed: 7.3, serviceFriendliness: 7.4 }), 7.35);
  check('service is null when speed is missing',
    S.serviceScore({ serviceFriendliness: 8 }), null);
  check('service is null when friendliness is missing',
    S.serviceScore({ serviceSpeed: 8 }), null);
  ok('missing service is NOT treated as zero',
    S.serviceScore({ serviceSpeed: 8 }) !== 0);
  check('service is not directly entered',
    S.CATEGORIES.filter(function (c) { return c.key === 'service'; })[0].derived, true);
  check('service has exactly two sub-scores', S.SERVICE_SUBSCORES.length, 2);

  check('all 10.0 -> weighted 10.0', S.calculateWeightedReviewerScore(flat(10)), 10);
  check('all 0.0 -> weighted 0.0', S.calculateWeightedReviewerScore(flat(0)), 0);
  check('both all 10 -> CPI 100', S.calculateCPI(flat(10), flat(10)), 100);
  check('both all 0 -> CPI 0', S.calculateCPI(flat(0), flat(0)), 0);
  check('both all 5 -> CPI 50', S.calculateCPI(flat(5), flat(5)), 50);

  /* Burger Quality is a Rankings-only view: exact 70-point denominator,
     full precision, and the same current-schema gate as CPI. */
  check('Burger Quality source weights sum exactly to 70',
    Object.keys(S.BURGER_QUALITY_WEIGHTS).reduce(function (sum, key) {
      return sum + S.BURGER_QUALITY_WEIGHTS[key];
    }, 0), S.BURGER_QUALITY_WEIGHT_TOTAL);
  check('Burger Quality normalized weights sum mathematically to 100%',
    Object.keys(S.BURGER_QUALITY_WEIGHTS).reduce(function (sum, key) {
      return sum + S.BURGER_QUALITY_WEIGHTS[key] / S.BURGER_QUALITY_WEIGHT_TOTAL;
    }, 0), 1);
  var bqBase = flat(5), bqExcluded = flat(5), bqIncluded = flat(5);
  bqExcluded.fries = 10; bqExcluded.value = 10;
  bqExcluded.serviceSpeed = 10; bqExcluded.serviceFriendliness = 10;
  bqIncluded.patty = 6;
  near('excluded categories do not affect Burger Quality',
    S.calculateBurgerQualityScore(bqExcluded), S.calculateBurgerQualityScore(bqBase));
  ok('included categories affect Burger Quality',
    S.calculateBurgerQualityScore(bqIncluded) > S.calculateBurgerQualityScore(bqBase));
  near('Burger Quality retains full precision internally',
    S.calculateBurgerQualityScore(sc(7.3, 7.4, 7.5, 0, 0, 7.5, 0, 0)), 7.392857142857143);

  /* Worked example under the v2 weights:
     patty 9.0*25 + flavor 9.2*25 + bun 8.0*15 + fries 7.5*10
     + value 8.5*10 + condiments 9.0*5 + service 8.0*10
     = 225 + 230 + 120 + 75 + 85 + 45 + 80 = 860 / 100 = 8.60 */
  near('v2 worked example -> 8.60',
    S.calculateWeightedReviewerScore(sc(9.0, 9.2, 8.0, 7.5, 8.5, 9.0, 7.0, 9.0)), 8.6);

  /* Service really is worth 10%: +1.0 on both halves moves 0.1. */
  var svcBase = flat(5), svcUp = flat(5);
  svcUp.serviceSpeed = 6; svcUp.serviceFriendliness = 6;
  near('+1.0 service -> +0.1 weighted',
    S.calculateWeightedReviewerScore(svcUp) - S.calculateWeightedReviewerScore(svcBase), 0.1);
  var halfSvc = flat(5); halfSvc.serviceSpeed = 7;   /* service 6.0 */
  near('one service half moves half as far',
    S.calculateWeightedReviewerScore(halfSvc) - S.calculateWeightedReviewerScore(svcBase), 0.1);

  /* THE PRECISION CONTRACT. */
  /* Ryan raw 7.455 (displays 7.5), Devin raw 7.955 (displays 8.0).
     Full precision CPI = ((7.455 + 7.955) / 2) * 10 = 77.05
     Rounded-first CPI would be ((7.5 + 8.0) / 2) * 10 = 77.5 */
  var pr = sc(7.0, 7.5, 8.0, 8.5, 7.0, 7.5, 6.9, 7.2);
  var pd = sc(8.0, 8.5, 7.0, 7.5, 8.0, 8.5, 7.9, 8.2);
  near('weighted keeps full precision (ryan)', S.calculateWeightedReviewerScore(pr), 7.455);
  near('weighted keeps full precision (devin)', S.calculateWeightedReviewerScore(pd), 7.955);
  near('CPI uses UNROUNDED weighted scores', S.calculateCPI(pr, pd), 77.05);
  ok('CPI differs from the rounded-first result',
    Math.abs(S.calculateCPI(pr, pd) - 77.5) > 0.2, S.calculateCPI(pr, pd));
  check('display rounds to one decimal', S.formatCPI(S.calculateCPI(pr, pd)), '77.1');
  ok('calculation value is NOT the display value',
    S.calculateWeightedReviewerScore(pr) !== Number(S.formatScore(S.calculateWeightedReviewerScore(pr))));
  check('weighted display rounds', S.formatScore(S.calculateWeightedReviewerScore(pr)), '7.5');
  check('signed display rounds negative ties symmetrically', S.formatSigned(-1.05, 1), '-1.1');

  var comb = S.calculateCombinedCategoryAverages(flat(7.3), flat(7.4));
  near('combined average full precision', comb.patty, 7.35);
  check('combined display rounds', S.formatScore(comb.patty), '7.4');
  near('combined service average', comb.service, 7.35);

  /* Weighting bites: patty and flavour move more than condiments. */
  var up = flat(5); up.patty = 6;
  var cup = flat(5); cup.condiments = 6;
  near('+1.0 patty -> 5.25', S.calculateWeightedReviewerScore(up), 5.25);
  near('+1.0 condiments -> 5.05', S.calculateWeightedReviewerScore(cup), 5.05);
  ok('patty delta > condiments delta',
    (S.calculateWeightedReviewerScore(up) - 5) > (S.calculateWeightedReviewerScore(cup) - 5));

  check('clamp to 0', S.clampToScale(-4), 0);
  check('clamp to 10', S.clampToScale(14), 10);
  check('clamp snaps tenths', S.clampToScale(7.34), 7.3);
  check('formatCPI(0)', S.formatCPI(0), '0.0');
  check('formatCPI(100)', S.formatCPI(100), '100.0');
  check('formatScore(null)', S.formatScore(null), '—');
  check('incomplete -> null weighted', S.calculateWeightedReviewerScore({ patty: 8 }), null);
  ok('0.0 counts as scored', S.isScored(0));
  ok('10.0 counts as scored', S.isScored(10));
  ok('out-of-range score rejected', !S.isScored(10.1));
  ok('non-tenth score rejected', !S.isScored(7.34));
  ok('numeric tenth string accepted', S.isScored('7.3'));

  /* =====================================================
     2. SCHEMA VERSIONING AND COMPLIANCE
     ===================================================== */
  check('current schema version', S.SCHEMA_VERSION, 2);
  var currentAudit = audit('ryan', flat(8));
  var noService = audit('ryan', sc(8, 8, 8, 8, 8, 8, null, null));
  var noLocation = audit('ryan', flat(8), { locationId: null, locationName: null });
  var noBurger = audit('ryan', flat(8), { burger: '' });

  ok('a complete v2 audit is compliant', S.auditIsCompliant(currentAudit));
  ok('an audit without Service is NOT compliant', !S.auditIsCompliant(noService));
  ok('an audit without a location is NOT compliant', !S.auditIsCompliant(noLocation));
  ok('an audit without a burger is NOT compliant', !S.auditIsCompliant(noBurger));
  check('missing Service is reported by name', S.missingRequirements(noService).join(), 'service');
  check('missing location is reported by name', S.missingRequirements(noLocation).join(), 'location');
  check('legacy audit reports the legacy version', S.auditSchemaVersion(noService), 1);
  check('compliant audit reports the current version', S.auditSchemaVersion(currentAudit), 2);
  ok('legacy scores are preserved untouched', Number(noService.patty) === 8);
  ok('legacy audit yields no weighted score rather than a zero',
    S.calculateWeightedReviewerScore(S.withService(noService)) === null);

  /* =====================================================
     3. THE ESTABLISHMENT MODEL
     ===================================================== */
  var oneSided = establishment('e1', "Culver's", 'fast-food', [
    audit('devin', flat(8), { burger: 'ButterBurger Cheese', locationId: 'loc-3', locationName: 'Eden Prairie' })
  ]);
  ok('one auditor only -> pending', S.statusOf(oneSided).key === 'pending');
  check('pending establishment has no CPI', S.cpiOf(oneSided), null);
  check('the other auditor is named as missing', S.missingAuditor(oneSided), 'ryan');

  /* Different branch, different burger — still certifies. */
  var twoSided = establishment('e1', "Culver's", 'fast-food', [
    audit('devin', flat(8), { burger: 'ButterBurger Cheese', locationId: 'loc-3', locationName: 'Eden Prairie', at: '2026-06-01T12:00:00Z' }),
    audit('ryan', flat(9), { burger: 'The Deluxe', locationId: 'loc-2', locationName: 'Richfield', at: '2026-06-05T12:00:00Z' })
  ]);
  ok('both auditors -> certified', S.isCertified(twoSided));
  check('different branches still certify', S.statusOf(twoSided).key, 'certified');
  near('composite averages the two auditors', S.cpiOf(twoSided), 85);

  /* Same burger is equally valid. */
  var sameBurger = establishment('e2', 'Matt’s Bar', 'bar-pub', [
    audit('ryan', flat(9), { burger: 'Jucy Lucy' }),
    audit('devin', flat(8), { burger: 'Jucy Lucy' })
  ]);
  ok('the same burger is allowed', S.isCertified(sameBurger));
  near('same-burger composite', S.cpiOf(sameBurger), 85);

  /* A repeat visit moves the composite, it does not add a ranked row. */
  var repeat = establishment('e1', "Culver's", 'fast-food', [
    audit('devin', flat(8), { locationId: 'loc-3', locationName: 'Eden Prairie', at: '2026-06-01T12:00:00Z' }),
    audit('ryan', flat(9), { locationId: 'loc-2', locationName: 'Richfield', at: '2026-06-05T12:00:00Z' }),
    audit('ryan', flat(7), { locationId: 'loc-1', locationName: 'Uptown', at: '2026-06-09T12:00:00Z' })
  ]);

  var balancedBQ = establishment('ebq', 'Balanced Burger', 'fast-food', [
    audit('ryan', flat(10)), audit('ryan', flat(10)), audit('ryan', flat(10)),
    audit('devin', flat(0))
  ]);
  near('Burger Quality is auditor-balanced across repeated audits', S.bqiOf(balancedBQ), 50);
  balancedBQ.audits.push(audit('ryan', flat(4)));
  near('a repeated audit changes only that auditor mean', S.bqiOf(balancedBQ), 42.5);

  var overallWinner = establishment('overall', 'Overall Winner', 'fast-food', [
    audit('ryan', sc(7, 7, 7, 10, 10, 7, 10, 10)),
    audit('devin', sc(7, 7, 7, 10, 10, 7, 10, 10))
  ]);
  var qualityWinner = establishment('quality', 'Quality Winner', 'fast-food', [
    audit('ryan', sc(9, 9, 9, 0, 0, 9, 0, 0)),
    audit('devin', sc(9, 9, 9, 0, 0, 9, 0, 0))
  ]);
  check('Overall ranking remains ordered by CPI',
    S.rankEstablishments([overallWinner, qualityWinner])[0].id, 'overall');
  check('Burger Quality can produce a different order',
    S.rankEstablishmentsByBurgerQuality([overallWinner, qualityWinner])[0].id, 'quality');

  var legacyBQ = establishment('legacy-bq', 'Legacy Quality', 'fast-food', [
    audit('ryan', flat(9)),
    audit('devin', sc(9, 9, 9, 9, 9, 9, null, null), { legacy: true, locationId: null })
  ]);
  ok('Burger Quality preserves current-schema certification', !S.isCertified(legacyBQ));
  check('legacy incomplete audits have no Burger Quality index', S.bqiOf(legacyBQ), null);
  near('ryan aggregate is the mean of his audits', S.weightedFor(repeat, 'ryan'), 8);
  near('a repeat visit recalculates the composite', S.cpiOf(repeat), 80);
  check('repeat visits do not multiply the ranked entity',
    S.rankEstablishments([repeat]).length, 1);
  check('compliant audit count', S.auditCount(repeat), 3);

  /* Weighting between auditors is 50/50 regardless of visit counts. */
  var lopsided = establishment('e3', 'Lopsided Grill', 'diner-cafe', [
    audit('ryan', flat(10)), audit('ryan', flat(10)), audit('ryan', flat(10)),
    audit('devin', flat(4))
  ]);
  near('each auditor contributes exactly half the composite', S.cpiOf(lopsided), 70);

  /* Recertification: legacy audits do not count toward certification. */
  var legacyPair = establishment('e4', 'Parlour', 'bar-pub', [
    audit('devin', sc(9.5, 9.6, 9.0, 8.4, 8.2, 8.8, null, null), { legacy: true }),
    audit('ryan', flat(9))
  ]);
  ok('a legacy audit does not certify', !S.isCertified(legacyPair));
  check('legacy audit leaves the establishment pending', S.statusOf(legacyPair).key, 'pending');
  check('the legacy owner is named as missing', S.missingAuditor(legacyPair), 'devin');
  check('legacy audits stay on file', S.legacyAuditsOf(legacyPair, 'devin').length, 1);
  ok('legacy scores survive intact',
    Number(S.legacyAuditsOf(legacyPair, 'devin')[0].patty) === 9.5);

  var recertified = establishment('e4', 'Parlour', 'bar-pub', [
    audit('devin', sc(9.5, 9.6, 9.0, 8.4, 8.2, 8.8, 8.0, 8.0)),
    audit('ryan', flat(9))
  ]);
  ok('supplying Service re-certifies the establishment', S.isCertified(recertified));
  ok('recertified establishment has a CPI', S.cpiOf(recertified) != null);

  /* =====================================================
     4. ANALYTICS OVER THE ESTABLISHMENT MODEL
     ===================================================== */
  var reg = register([
    establishment('e1', "Culver's", 'fast-food', [
      audit('devin', flat(8), { burger: 'ButterBurger Cheese', locationId: 'loc-3', locationName: 'Eden Prairie', at: '2026-06-01T12:00:00Z' }),
      audit('ryan', flat(9), { burger: 'The Deluxe', locationId: 'loc-2', locationName: 'Richfield', at: '2026-06-05T12:00:00Z' }),
      audit('ryan', flat(7), { burger: 'The Deluxe', locationId: 'loc-3', locationName: 'Eden Prairie', at: '2026-06-09T12:00:00Z' })
    ], { createdAt: '2026-06-01T12:00:00Z' }),
    establishment('e2', 'Matt’s Bar', 'bar-pub', [
      audit('ryan', flat(9.5), { burger: 'Jucy Lucy', locationId: 'loc-1', locationName: 'Uptown', at: '2026-06-02T12:00:00Z' }),
      audit('devin', flat(9), { burger: 'Jucy Lucy', locationId: 'loc-1', locationName: 'Uptown', at: '2026-06-03T12:00:00Z' })
    ], { createdAt: '2026-06-02T12:00:00Z' }),
    establishment('e3', 'Blue Door Pub', 'bar-pub', [
      audit('ryan', flat(6), { burger: 'Blucy', locationId: 'loc-1', locationName: 'Uptown', at: '2026-06-04T12:00:00Z' })
    ], { createdAt: '2026-06-04T12:00:00Z' }),
    establishment('e4', 'Parlour', 'bar-pub', [
      audit('devin', sc(9, 9, 9, 9, 9, 9, null, null), { legacy: true, burger: 'Parlour Burger',
        locationId: null, locationName: null, at: '2026-06-06T12:00:00Z' })
    ], { createdAt: '2026-06-06T12:00:00Z' })
  ]);
  var m = AN.compute(reg);

  check('one view per establishment', m.views.length, 4);
  check('certified establishments', m.counts.certified, 2);
  check('pending establishments', m.counts.pending, 1);
  check('compliant audits counted per filing', m.counts.audits, 6);
  check('legacy audits counted separately', m.counts.legacyAudits, 1);
  check('establishments awaiting recertification', m.counts.awaitingRecertification, 1);
  check('audit views are one per filing', m.auditViews.length, 6);
  check('ryan filed four current audits', m.auditors.ryan.n, 4);
  check('devin filed two current audits', m.auditors.devin.n, 2);
  check('ryan visited three locations', m.auditors.ryan.locationsVisited, 3);
  check('rankings are establishments', m.ranked.length, 2);
  check('top establishment', m.ranked[0].name, 'Matt’s Bar');
  near('top CPI', m.ranked[0].cpi, 92.5);
  check('revisited establishment detected', m.counts.revisits, 1);
  check("Culver's records two branches", m.views.filter(function (v) { return v.id === 'e1'; })[0].locations.length, 2);
  check("Culver's records two burgers", m.views.filter(function (v) { return v.id === 'e1'; })[0].burgers.length, 2);
  ok('different-burger certification is flagged',
    m.views.filter(function (v) { return v.id === 'e1'; })[0].sameBurger === false);
  ok('same-burger certification is flagged',
    m.views.filter(function (v) { return v.id === 'e2'; })[0].sameBurger === true);
  check('pending queue targets the missing auditor', m.pendingFor.devin[0].name, 'Blue Door Pub');
  check('service reaches the category board', typeof m.categoryBoard.service.mean, 'number');
  check('service reaches the paired comparison', typeof m.paired.byCategory.service.meanAbs, 'number');

  /* =====================================================
     5. LOCATIONS AND CATEGORIES
     ===================================================== */
  ok('preset location register is populated', T.PRESET_LOCATIONS.length >= 40);
  ok('preset location register stays usable', T.PRESET_LOCATIONS.length <= 90);
  ok('preset locations are unique',
    new Set(T.PRESET_LOCATIONS.map(function (l) { return l.nameKey; })).size === T.PRESET_LOCATIONS.length);
  ok('presets include a Minneapolis district', T.isPresetLocation('North Loop'));
  ok('presets include a suburb', T.isPresetLocation('Eden Prairie'));

  check('normalisation folds punctuation', T.normalizeName('St. Louis Park'), 'st louis park');
  check('normalisation folds case', T.normalizeName('ST LOUIS PARK'), 'st louis park');
  check('normalisation folds spacing', T.normalizeName('  st   louis  park '), 'st louis park');
  check('normalisation folds apostrophes', T.normalizeName("Lion's Den"), 'lions den');
  ok('two spellings of one location match', T.sameName('St. Louis Park', 'st louis park'));
  ok('two different locations do not match', !T.sameName('Edina', 'Eden Prairie'));

  ok('categories are a controlled set', T.CATEGORY_KEYS.length >= 5 && T.CATEGORY_KEYS.length <= 10);
  ok('an unknown category coerces to Other', T.coerceCategory('gastropub-fusion') === 'other');
  ok('a known category survives coercion', T.coerceCategory('fast-food') === 'fast-food');
  ok('categories are never freeform', !T.isCategory('Fast Food'));

  /* Location filtering restricts the evidence, not the identity. */
  var epId = 'loc-3';
  var filtered = AN.compute(reg, { locationId: epId, locationName: 'Eden Prairie' });
  check('location filter keeps only relevant establishments', filtered.views.length, 1);
  check('location filter keeps the establishment identity', filtered.views[0].name, "Culver's");
  check('location filter judges certification on that evidence', filtered.views[0].status, 'certified');
  near('location filter recomputes the composite from local audits', filtered.views[0].cpi, 75);
  near('Location + Burger Quality uses the filtered auditor profiles',
    S.calculateBQI(filtered.views[0].scores.ryan, filtered.views[0].scores.devin), 75);
  ok('unfiltered composite differs from the filtered one',
    m.views.filter(function (v) { return v.id === 'e1'; })[0].cpi !== filtered.views[0].cpi);

  var richfield = AN.compute(reg, { locationId: 'loc-2' });
  check('a one-sided location leaves the establishment pending', richfield.views[0].status, 'pending');
  check('a one-sided location yields no certified rows', richfield.counts.certified, 0);

  var bars = AN.compute(reg, { category: 'bar-pub' });
  check('category filter selects by class', bars.views.length, 3);
  ok('category filter excludes other classes',
    bars.views.every(function (v) { return v.category === 'bar-pub'; }));
  ok('Class + Burger Quality scores only certified class results',
    bars.ranked.every(function (v) {
      return v.category === 'bar-pub' && S.calculateBQI(v.scores.ryan, v.scores.devin) != null;
    }));

  var both = AN.compute(reg, { locationId: 'loc-1', category: 'bar-pub' });
  check('location and category filters combine', both.views.length, 2);
  ok('combined filter keeps only matching rows',
    both.views.every(function (v) { return v.category === 'bar-pub'; }));
  check('combined filter certification', both.counts.certified, 1);
  near('Location + Class + Burger Quality uses the combined evidence set',
    S.calculateBQI(both.ranked[0].scores.ryan, both.ranked[0].scores.devin), 92.5);

  var fastFoodAtUptown = AN.compute(reg, { locationId: 'loc-1', category: 'fast-food' });
  check('a filter with no matches yields nothing', fastFoodAtUptown.views.length, 0);

  check('location index reports usage', m.locationIndex.filter(function (l) { return l.id === 'loc-1'; })[0].audits, 3);
  check('location index counts establishments', m.locationIndex.filter(function (l) { return l.id === 'loc-1'; })[0].establishments, 2);
  check('category index counts establishments',
    m.categoryIndex.filter(function (c) { return c.key === 'bar-pub'; })[0].establishments, 3);

  /* =====================================================
     6. RECORDS OFFICE
     ===================================================== */
  var recordStats = RC.stats();
  check('exactly 200 record definitions exist', recordStats.definitions, 200);
  check('record identifiers are unique', new Set(recordStats.ids).size, 200);
  ok('records span many families', recordStats.familyCount >= 8, recordStats.familyCount);
  ok('records are not all one comparison kind',
    Object.keys(recordStats.kinds).length >= 3, recordStats.kinds);
  ok('every definition supplies a detector',
    RC.DEFINITIONS.every(function (d) { return typeof d.detect === 'function'; }));
  ok('every definition supplies a title',
    RC.DEFINITIONS.every(function (d) { return typeof d.title === 'string' && d.title.length > 3; }));
  ok('record titles are unique',
    new Set(RC.DEFINITIONS.map(function (d) { return d.title; })).size === 200);

  var firstPass = RC.detect(m, []);
  ok('an empty office discovers records from a live register', firstPass.changes.length > 0,
    firstPass.changes.length);
  ok('discovery does not reveal the whole catalogue', firstPass.changes.length < 200,
    firstPass.changes.length);
  ok('every discovered record carries a fingerprint',
    firstPass.changes.every(function (r) { return !!r.fingerprint; }));
  ok('a first discovery is not marked as broken',
    firstPass.changes.every(function (r) { return r.broke === false; }));

  /* Detection converges: re-running against its own output is quiet. */
  var stored = firstPass.changes.map(function (r) { return Object.assign({}, r, { version: 1 }); });
  var secondPass = RC.detect(m, stored);
  var thirdStore = stored.slice();
  secondPass.changes.forEach(function (c) {
    thirdStore = thirdStore.filter(function (x) { return x.recordId !== c.recordId; });
    thirdStore.push(Object.assign({}, c, { version: 1 }));
  });
  check('re-detection settles', RC.detect(m, thirdStore).changes.length, 0);

  /* Records change hands when a filing beats them. */
  var better = register([
    establishment('e5', 'Record Breaker', 'fast-casual', [
      audit('ryan', flat(10), { burger: 'The Maximum', at: '2026-07-01T12:00:00Z' }),
      audit('devin', flat(10), { burger: 'The Maximum', at: '2026-07-02T12:00:00Z' })
    ], { createdAt: '2026-07-01T12:00:00Z' })
  ].concat(reg.establishments), reg.locations);
  var afterBreak = RC.detect(AN.compute(better), thirdStore);
  var highest = afterBreak.changes.filter(function (r) { return r.recordId === 'r004'; })[0];
  ok('a higher figure breaks the standing record', !!highest, afterBreak.changes.length);
  ok('a broken record is flagged as broken', highest && highest.broke === true);
  ok('a broken record preserves the previous holder',
    highest && highest.previous && highest.previous.establishmentName === 'Matt’s Bar');
  near('the new record carries the new figure', highest && highest.value, 100);

  /* Comparator rules. */
  var high = RC.definition('r004');
  var low = RC.definition('r005');
  ok('a strictly higher value beats a high record',
    RC.beats(high, { value: 91 }, { value: 90 }));
  ok('an equal value does NOT displace the holder',
    !RC.beats(high, { value: 90 }, { value: 90 }));
  ok('a lower value does not beat a high record',
    !RC.beats(high, { value: 89 }, { value: 90 }));
  ok('a strictly lower value beats a low record',
    RC.beats(low, { value: 40 }, { value: 41 }));
  ok('a first-ever record is never displaced',
    !RC.beats({ kind: 'first' }, { value: 1 }, { value: 0 }));
  ok('an identity record changes only when the subject changes',
    RC.beats({ kind: 'identity' }, { detail: { key: 'b' } }, { detail: { key: 'a' } }) &&
    !RC.beats({ kind: 'identity' }, { detail: { key: 'a' } }, { detail: { key: 'a' } }));

  /* Fingerprints drive per-user acknowledgement. */
  var fp1 = RC.fingerprintOf(high, { value: 90, establishmentId: 'e1' });
  var fp2 = RC.fingerprintOf(high, { value: 90, establishmentId: 'e1' });
  var fp3 = RC.fingerprintOf(high, { value: 91, establishmentId: 'e1' });
  check('fingerprints are stable for identical state', fp1, fp2);
  ok('fingerprints change when the record changes', fp1 !== fp3);

  ok('an empty register discovers nothing that needs data',
    RC.detect(AN.compute(register([])), []).changes.length === 0);

  /* =====================================================
     7. INSIGHT AND EVENT ENGINES
     ===================================================== */
  var insightStats = IN.stats();
  ok('insight library survived the migration', insightStats.rules >= 330, insightStats.rules);
  ok('insight families remain diverse', insightStats.familyCount >= 13, insightStats.familyCount);

  var renderFailures = [];
  IN.RULES.forEach(function (rule) {
    if (!IN.isEligible(rule, m)) return;
    rule.variants.forEach(function (_, i) {
      if (!IN.render(rule, m, i)) renderFailures.push(rule.id + '#' + i);
    });
  });
  check('every eligible insight renders cleanly', renderFailures.length, 0);
  ok('insights are actually eligible on a live register', IN.eligibleRules(m).length >= 20,
    IN.eligibleRules(m).length);

  var leaks = [];
  IN.RULES.forEach(function (rule) {
    if (!IN.isEligible(rule, m)) return;
    rule.variants.forEach(function (_, i) {
      var out = IN.render(rule, m, i);
      if (!out) return;
      var text = out.title + ' ' + out.body;
      if (/same (?:burger|hamburger)(?! at| as)/i.test(text) && !/permitted|not required|valid/i.test(text)) {
        leaks.push(rule.id);
      }
    });
  });
  check('no insight asserts the auditors must eat the same burger', leaks.length, 0, leaks);

  var svcRules = IN.RULES.filter(function (r) { return r.family === 'service'; });
  ok('the insight library reasons about Service', svcRules.length >= 5, svcRules.length);
  ok('the insight library reasons about locations',
    IN.RULES.filter(function (r) { return r.family === 'locations'; }).length >= 5);
  ok('the insight library reasons about establishment classes',
    IN.RULES.filter(function (r) { return r.family === 'classes'; }).length >= 4);
  ok('the insight library reasons about schema compliance',
    IN.RULES.filter(function (r) { return r.family === 'compliance'; }).length >= 2);
  ok('the insight library reasons about repeat visits',
    IN.RULES.filter(function (r) { return r.family === 'visits'; }).length >= 4);

  var disasterStats = DS.stats();
  check('all twenty event systems survived', disasterStats.systems, 20);
  check('event identifiers remain unique', new Set(disasterStats.ids).size, 20);
  ok('the event layer reads the new metrics without throwing',
    Array.isArray(DS.evaluate(m)));
  ok('an empty register triggers no event', DS.evaluate(AN.compute(register([]))).length === 0);
  var featureBefore = JSON.stringify(m.counts);
  DS.evaluate(m);
  check('event detection does not mutate analytics', JSON.stringify(m.counts), featureBefore);

  /* =====================================================
     8. ADAPTER CONTRACT — mock
     ===================================================== */
  var lifecycle = (function () {
    var a = D.createMockAdapter({ seed: false });
    var uptownId, addedId, culversId, ryanAuditId;

    return a.auth.signInAs('ryan').then(function () {
      uptownId = a._locationIdByName('Uptown');
      ok('preset locations are seeded into the register', !!uptownId);
      return a.listRegister();
    }).then(function (reg0) {
      check('a fresh register has no establishments', reg0.establishments.length, 0);
      check('a fresh register has the preset locations', reg0.locations.length, T.PRESET_LOCATIONS.length);
      return a.createEstablishment({ name: "  Culver's  ", category: 'fast-food' });
    }).then(function (e) {
      culversId = e.id;
      check('establishment names are trimmed', e.name, "Culver's");
      check('establishment category is stored', e.category, 'fast-food');
      ok('establishments receive a file number', /^BPS-\d{4}$/.test(e.fileNumber));
      return a.createEstablishment({ name: 'culvers', category: 'casual-dining' });
    }).then(function (again) {
      check('a matching name reuses the existing establishment', again.id, culversId);
      return a.createAudit(Object.assign({
        establishmentId: culversId, burger: 'ButterBurger Cheese', locationId: uptownId
      }, flat(8)));
    }).then(function (auditRow) {
      ryanAuditId = auditRow.id;
      check('a filed audit records its schema version', auditRow.schemaVersion, S.SCHEMA_VERSION);
      /* An audit missing Service must be refused outright. */
      return a.createAudit(Object.assign({
        establishmentId: culversId, burger: 'No Service Burger', locationId: uptownId
      }, sc(8, 8, 8, 8, 8, 8, null, null)))
        .then(function () { ok('an audit without Service is refused', false); })
        .catch(function (err) { check('an audit without Service is refused', err.code, 'invalid-scores'); });
    }).then(function () {
      return a.createAudit(Object.assign({
        establishmentId: culversId, burger: 'Homeless Burger', locationId: null
      }, flat(8)))
        .then(function () { ok('an audit without a location is refused', false); })
        .catch(function (err) { check('an audit without a location is refused', err.code, 'invalid-location'); });
    }).then(function () {
      return a.createAudit(Object.assign({
        establishmentId: culversId, burger: '   ', locationId: uptownId
      }, flat(8)))
        .then(function () { ok('an audit without a burger is refused', false); })
        .catch(function (err) { check('an audit without a burger is refused', err.code, 'invalid-burger'); });
    }).then(function () {
      return a.listRegister();
    }).then(function (r1) {
      var mm = AN.compute(r1);
      check('one auditor leaves the establishment pending', mm.counts.pending, 1);
      check('a pending establishment is not ranked', mm.ranked.length, 0);
      /* Devin now files at a different branch, on a different burger. */
      return a.createLocation('  eden   prairie ');
    }).then(function (loc) {
      check('an existing location is matched rather than duplicated', loc.name, 'Eden Prairie');
      return a.createLocation('Mankato');
    }).then(function (loc) {
      addedId = loc.id;
      check('a new location is registered', loc.name, 'Mankato');
      check('a new location is not a preset', loc.isPreset, false);
      return a.createLocation('MANKATO');
    }).then(function (loc) {
      check('a differently cased duplicate is folded into one record', loc.id, addedId);
      return a.auth.signInAs('devin');
    }).then(function () {
      return a.listRegister();
    }).then(function (r2) {
      var mankato = r2.locations.filter(function (l) { return l.id === addedId; })[0];
      ok('a location added by one auditor is visible to the other', !!mankato);
      check('the shared location keeps its name', mankato && mankato.name, 'Mankato');
      return a.createAudit(Object.assign({
        establishmentId: culversId, burger: 'The Deluxe', locationId: addedId
      }, flat(9)));
    }).then(function () {
      return a.listRegister();
    }).then(function (r3) {
      var mm = AN.compute(r3);
      check('both auditors certify the establishment', mm.counts.certified, 1);
      near('the composite averages both auditors', mm.ranked[0].cpi, 85);
      check('different branches did not split the establishment', mm.views.length, 1);
      /* Devin may not amend Ryan's audit. */
      return a.updateAudit(ryanAuditId, Object.assign({
        establishmentId: culversId, burger: 'Hijacked', locationId: uptownId
      }, flat(1)))
        .then(function () { ok('an auditor cannot amend the peer audit', false); })
        .catch(function (err) { check('an auditor cannot amend the peer audit', err.code, 'not-owner'); });
    }).then(function () {
      /* Either auditor may correct shared establishment metadata. */
      return a.updateEstablishment(culversId, { name: 'Culver’s', category: 'fast-food' });
    }).then(function (e) {
      check('either auditor may correct the establishment name', e.name, 'Culver’s');
      return a.createEstablishment({ name: 'Lions Den', category: 'bar-pub' });
    }).then(function (lions) {
      return a.updateEstablishment(lions.id, { name: "Culver's" })
        .then(function () { ok('a colliding rename is refused', false); })
        .catch(function (err) {
          check('a colliding rename is refused', err.code, 'name-collision');
          ok('the collision names the existing record', !!(err.detail && err.detail.establishmentId));
          return a.updateEstablishment(lions.id, { name: "Lion's Den" });
        });
    }).then(function (fixed) {
      check('a typo in an establishment name can be corrected', fixed.name, "Lion's Den");
      return a.listRegister();
    }).then(function (r4) {
      check('correcting a name does not create a duplicate', r4.establishments.length, 2);
      /* Archiving keeps historical references intact. */
      return a.setLocationArchived(addedId, true);
    }).then(function () {
      return a.listRegister();
    }).then(function (r5) {
      var mankato = r5.locations.filter(function (l) { return l.id === addedId; })[0];
      check('an archived location is still on file', mankato.archived, true);
      var mm = AN.compute(r5);
      var stillThere = mm.views[0].compliantAudits.some(function (x) { return x.locationId === addedId; });
      ok('an archived location keeps its historical audits', stillThere);
      check('an archived location keeps the establishment certified', mm.counts.certified, 1);
      return a.renameLocation(addedId, 'Mankato, MN');
    }).then(function (loc) {
      check('a location can be corrected', loc.name, 'Mankato, MN');
      return a.listRegister();
    }).then(function (r6) {
      var mm = AN.compute(r6);
      check('renaming a location preserves the audit that used it',
        mm.views[0].compliantAudits.filter(function (x) { return x.locationId === addedId; }).length, 1);
      return a.renameLocation(addedId, 'Uptown')
        .then(function () { ok('a colliding location rename is refused', false); })
        .catch(function (err) { check('a colliding location rename is refused', err.code, 'name-collision'); });
    });
  })();

  /* Establishment merge preserves every audit. */
  var mergeContract = (function () {
    var a = D.createMockAdapter({ seed: false });
    var sourceId, targetId;
    return a.auth.signInAs('ryan')
      .then(function () { return a.createEstablishment({ name: 'Lions Den', category: 'bar-pub' }); })
      .then(function (e) {
        sourceId = e.id;
        return a.createAudit(Object.assign({
          establishmentId: sourceId, burger: 'Den Burger', locationId: a._locationIdByName('Uptown')
        }, flat(8)));
      })
      .then(function () { return a.createEstablishment({ name: "Lion's Den No. 2", category: 'bar-pub' }); })
      .then(function (e) {
        targetId = e.id;
        return a.createAudit(Object.assign({
          establishmentId: targetId, burger: 'Den Burger', locationId: a._locationIdByName('Edina')
        }, flat(9)));
      })
      .then(function () { return a.mergeEstablishments(sourceId, targetId); })
      .then(function () { return a.listRegister(); })
      .then(function (r) {
        check('a merge leaves one live establishment', r.establishments.length, 1);
        check('a merge preserves every audit', r.establishments[0].audits.length, 2);
        check('a merge keeps the surviving identity', r.establishments[0].id, targetId);
      });
  })();

  /* Records persistence and per-auditor acknowledgement. */
  var recordContract = (function () {
    var a = D.createMockAdapter({ seed: false });
    var rows;
    return a.auth.signInAs('ryan')
      .then(function () { return a.saveRecords(RC.detect(m, []).changes); })
      .then(function (written) {
        ok('records are written to shared storage', written.length > 0, written.length);
        return a.listRecords();
      })
      .then(function (list) {
        rows = list;
        ok('records read back from shared storage', rows.length > 0);
        ok('a first entry is version 1', rows.every(function (r) { return r.version === 1; }));
        return a.listRecordAcks();
      })
      .then(function (acks) {
        check('a new auditor has acknowledged nothing', Object.keys(acks).length, 0);
        var map = {};
        rows.forEach(function (r) { map[r.recordId] = r.fingerprint; });
        return a.ackRecords(map);
      })
      .then(function () { return a.listRecordAcks(); })
      .then(function (acks) {
        check('acknowledgement persists for that auditor', Object.keys(acks).length, rows.length);
        return a.auth.signInAs('devin');
      })
      .then(function () { return a.listRecordAcks(); })
      .then(function (acks) {
        check('the peer has acknowledged nothing of their own', Object.keys(acks).length, 0);
        return a.listRecords();
      })
      .then(function (list) {
        check('but the peer sees the same shared records', list.length, rows.length);
        /* Breaking a record archives the previous holder. */
        var breakChanges = RC.detect(AN.compute(better), rows).changes;
        return a.saveRecords(breakChanges);
      })
      .then(function () { return a.listRecords(); })
      .then(function (list) {
        var top = list.filter(function (r) { return r.recordId === 'r004'; })[0];
        check('a broken record advances its version', top.version, 2);
        ok('a broken record stores what it replaced', !!top.previous);
        ok('a broken record changes its fingerprint',
          top.fingerprint !== rows.filter(function (r) { return r.recordId === 'r004'; })[0].fingerprint);
        return a.listRecordHistory();
      })
      .then(function (history) {
        ok('the superseded entry is archived, not deleted',
          history.some(function (h) { return h.recordId === 'r004'; }));
        return a.saveRecords(RC.detect(AN.compute(better), []).changes.slice(0, 0));
      })
      .then(function (written) {
        check('an empty batch writes nothing', written.length, 0);
      });
  })();

  /* Adapter selection must never fall back to mock in production. */
  var adapterSelection = (function () {
    var closed = false;
    var lib = globalThis.supabase;
    globalThis.supabase = null;
    try {
      D.chooseAdapter({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'publishable' });
    } catch (e) { closed = true; }
    globalThis.supabase = lib;
    ok('a configured production build fails closed rather than using mock data', closed);
    ok('an unconfigured build uses the mock adapter', D.chooseAdapter({}).mode === 'mock');
    ok('an explicit mock request is honoured', D.chooseAdapter({}, 'mock').mode === 'mock');
    return Promise.resolve();
  })();

  /* =====================================================
     9. ADAPTER CONTRACT — Supabase wire format
     ===================================================== */
  var supabaseContract = Promise.resolve();
  if (isNode) {
    var calls = { inserts: [], updates: [], rpc: [], upserts: [], auth: {}, failSignOut: false };
    var tables = {
      establishments: [{ id: 'e-1', file_number: 'BPS-0001', name: 'Counter', name_key: 'counter',
                         category: 'fast-food', created_by: 'uuid-ryan',
                         created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' }],
      audits: [{ id: 'a-1', establishment_id: 'e-1', auditor_id: 'uuid-ryan', burger: 'Standard',
                 location_id: 'l-1', patty: '8.1', overall_flavor: '8.2', bun: '8.3', fries: '8.4',
                 value: '8.5', condiments: '8.6', service_speed: '8.7', service_friendliness: '8.9',
                 schema_version: 2, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' }],
      locations: [{ id: 'l-1', name: 'Uptown', name_key: 'uptown', location_group: 'minneapolis',
                    is_preset: true, archived: false, created_by: null, created_at: '2026-01-01T00:00:00Z' }],
      profiles: [{ id: 'uuid-ryan', auditor_key: 'ryan', display_name: 'Ryan' }],
      bureau_records: [{ record_id: 'r004', holder: null, establishment_id: 'e-1',
                         establishment_name: 'Counter', value: '91.5', value_text: null,
                         detail: {}, fingerprint: 'fp', version: 1,
                         established_at: '2026-06-01T00:00:00Z', previous: null, updated_by: 'uuid-ryan' }],
      bureau_record_acks: [{ record_id: 'r004', fingerprint: 'fp' }],
      bureau_record_history: []
    };
    var fakeClient = {
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: { user: { id: 'uuid-ryan', email: 'ryan@bps.test' } } } }); },
        getUser: function () { return Promise.resolve({ data: { user: { id: 'uuid-ryan' } } }); },
        signInWithPassword: function (payload) {
          calls.auth.signIn = payload;
          return Promise.resolve({ data: { session: { user: { id: 'uuid-ryan', email: payload.email } } }, error: null });
        },
        signOut: function () { return Promise.resolve({ error: calls.failSignOut ? new Error('network') : null }); }
      },
      rpc: function (name, args) {
        calls.rpc.push({ name: name, args: args });
        return Promise.resolve({ data: (args.p_rows || []).map(function (r) { return r.recordId; }), error: null });
      },
      from: function (table) {
        var rows = tables[table] || [];
        var q = { table: table };
        function response() { return { data: q._single ? (rows[0] || null) : rows, error: null }; }
        q.select = function () { return q; };
        q.eq = function () { return q; };
        q.neq = function () { return q; };
        q.is = function () { return q; };
        q.order = function () { return q; };
        q.single = function () { q._single = true; return Promise.resolve(response()); };
        q.maybeSingle = function () { q._single = true; return Promise.resolve(response()); };
        q.insert = function (payload) { calls.inserts.push({ table: table, payload: payload }); return q; };
        q.update = function (payload) { calls.updates.push({ table: table, payload: payload }); return q; };
        q.upsert = function (payload, options) {
          calls.upserts.push({ table: table, payload: payload, conflict: options && options.onConflict });
          return q;
        };
        q.then = function (resolve, reject) { return Promise.resolve(response()).then(resolve, reject); };
        return q;
      }
    };
    globalThis.supabase = { createClient: function () { return fakeClient; } };
    var sb = D.createSupabaseAdapter({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'publishable' });

    supabaseContract = sb.auth.getSession()
      .then(function (session) {
        check('Supabase session maps UUID to auditor profile', session.profile.auditorKey, 'ryan');
        return sb.auth.signIn('ryan@bps.test', 'test-password');
      })
      .then(function (session) {
        check('Supabase password sign-in passes the email', calls.auth.signIn.email, 'ryan@bps.test');
        check('Supabase password session includes profile', session.profile.displayName, 'Ryan');
        return sb.listRegister();
      })
      .then(function (reg2) {
        check('Supabase rows normalize to one establishment', reg2.establishments.length, 1);
        check('Supabase locations normalize', reg2.locations[0].name, 'Uptown');
        var a0 = reg2.establishments[0].audits[0];
        check('Supabase numeric columns normalize to numbers', a0.patty, 8.1);
        check('Supabase maps the service columns', a0.serviceSpeed, 8.7);
        near('Supabase derives Service from its two halves', a0.service, 8.8);
        check('Supabase resolves the location name', a0.locationName, 'Uptown');
        check('Supabase maps the auditor UUID to a key', a0.auditorKey, 'ryan');
        return sb.createAudit(Object.assign({
          establishmentId: 'e-1', burger: ' Standard ', locationId: 'l-1'
        }, flat(8)));
      })
      .then(function () {
        var payload = calls.inserts.filter(function (c) { return c.table === 'audits'; })[0].payload;
        check('Supabase audit insert owns the row with the auth UUID', payload.auditor_id, 'uuid-ryan');
        check('Supabase audit insert trims the burger', payload.burger, 'Standard');
        check('Supabase audit insert records the location', payload.location_id, 'l-1');
        check('Supabase audit insert maps overall_flavor', payload.overall_flavor, 8);
        check('Supabase audit insert maps service_speed', payload.service_speed, 8);
        check('Supabase audit insert maps service_friendliness', payload.service_friendliness, 8);
        check('Supabase audit insert stamps the schema version', payload.schema_version, S.SCHEMA_VERSION);
        return sb.saveRecords([{ recordId: 'r004', value: 99, fingerprint: 'fp2', detail: {} }]);
      })
      .then(function () {
        var rpc = calls.rpc[0];
        check('Supabase writes records through one atomic RPC', rpc.name, 'bps_records_sync');
        check('Supabase record sync sends a batch', rpc.args.p_rows.length, 1);
        return sb.ackRecords({ r004: 'fp2' });
      })
      .then(function () {
        var upsert = calls.upserts.filter(function (c) { return c.table === 'bureau_record_acks'; })[0];
        check('Supabase acknowledgement is keyed per auditor', upsert.conflict, 'auditor_id,record_id');
        check('Supabase acknowledgement stores the auditor UUID', upsert.payload[0].auditor_id, 'uuid-ryan');
        return sb.listRecordAcks();
      })
      .then(function (acks) {
        check('Supabase acknowledgements read back by record id', acks.r004, 'fp');
        calls.failSignOut = true;
        return sb.auth.signOut()
          .then(function () { ok('Supabase sign-out errors reject', false); })
          .catch(function () { ok('Supabase sign-out errors reject', true); });
      });
  }

  /* =====================================================
     Report
     ===================================================== */
  Promise.all([lifecycle, mergeContract, recordContract, adapterSelection, supabaseContract])
    .catch(function (err) {
      results.push({ name: 'async contracts completed without throwing', pass: false,
                     actual: (err && err.stack) || String(err), expected: true });
    })
    .then(function () {
      var failed = results.filter(function (r) { return !r.pass; });
      if (isNode) {
        failed.forEach(function (r) {
          console.log('  FAIL  ' + r.name + '   expected ' + JSON.stringify(r.expected) + ', got ' + JSON.stringify(r.actual));
        });
        console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
        if (failed.length) process.exit(1);
      } else {
        console.log('%c[BPS] tests: ' + (results.length - failed.length) + '/' + results.length + ' passed',
          'color:' + (failed.length ? '#da1e28' : '#00684a') + ';font-weight:600');
        if (failed.length) console.table(failed);
        root.BPS.testResults = { total: results.length, failed: failed.length, failures: failed };
      }
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
