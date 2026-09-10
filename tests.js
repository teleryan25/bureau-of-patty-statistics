/* =============================================================
   Bureau of Patty Statistics — tests.js

   Runs two ways:
     node tests.js         headless, exits non-zero on failure
     index.html?test=1     logs a summary to the browser console

   Covers: scoring precision, peer-review lifecycle, analytics,
   and the insight engine. Browser interaction is tested separately.
   ============================================================= */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);

  var S  = isNode ? require('./scoring.js')   : root.BPS.scoring;
  var AN = isNode ? require('./analytics.js') : root.BPS.analytics;
  var IN = isNode ? require('./insights.js')  : root.BPS.insights;
  var D  = isNode ? require('./data.js')      : root.BPS.data;
  if (isNode) require('./insight-rules.js');

  var results = [];
  var K = S.CATEGORY_KEYS;

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

  function flat(v) { var o = {}; K.forEach(function (k) { o[k] = v; }); return o; }
  function sc(p, o, b, f, va, c) { return { patty: p, overallFlavor: o, bun: b, fries: f, value: va, condiments: c }; }
  function burger(id, rest, name, r, d, at) {
    at = at || '2026-06-01T12:00:00Z';
    return {
      id: id, specimenNumber: 'BPS-' + id, restaurant: rest, burger: name,
      createdBy: 'u1', createdAt: at,
      audits: {
        ryan:  r ? Object.assign({}, r, { createdAt: at, updatedAt: at }) : null,
        devin: d ? Object.assign({}, d, { createdAt: at, updatedAt: at }) : null
      }
    };
  }

  /* =====================================================
     1. SCORING — weights and full precision
     ===================================================== */
  check('weights total exactly 100', S.weightsTotal(), 100);
  ok('weightsAreValid()', S.weightsAreValid());
  check('six categories', K.length, 6);
  check('patty weight 30', S.SCORING_WEIGHTS.patty, 30);
  check('overallFlavor weight 25', S.SCORING_WEIGHTS.overallFlavor, 25);
  check('bun weight 15', S.SCORING_WEIGHTS.bun, 15);
  check('fries weight 10', S.SCORING_WEIGHTS.fries, 10);
  check('value weight 10', S.SCORING_WEIGHTS.value, 10);
  check('condiments weight 10', S.SCORING_WEIGHTS.condiments, 10);

  check('all 10.0 -> weighted 10.0', S.calculateWeightedReviewerScore(flat(10)), 10);
  check('all 0.0 -> weighted 0.0', S.calculateWeightedReviewerScore(flat(0)), 0);
  check('both all 10 -> CPI 100', S.calculateCPI(flat(10), flat(10)), 100);
  check('both all 0 -> CPI 0', S.calculateCPI(flat(0), flat(0)), 0);
  check('both all 5 -> CPI 50', S.calculateCPI(flat(5), flat(5)), 50);

  /* Spec worked example: 270+230+120+75+85+90 = 870 / 100 = 8.7 */
  near('spec example -> 8.7', S.calculateWeightedReviewerScore(sc(9.0, 9.2, 8.0, 7.5, 8.5, 9.0)), 8.7);
  near('spec CPI 9.1 / 8.7 -> 89.0', S.calculateCPI(flat(9.1), flat(8.7)), 89);

  /* THE PRECISION CORRECTION.
     Ryan raw 7.475 (displays 7.5), Devin raw 7.975 (displays 8.0).
     Full precision CPI = ((7.475+7.975)/2)*10 = 77.25
     Rounded-first CPI would be ((7.5+8.0)/2)*10 = 77.5 */
  var pr = sc(7.0, 7.5, 8.0, 8.5, 7.0, 7.5);
  var pd = sc(8.0, 8.5, 7.0, 7.5, 8.0, 8.5);
  near('weighted keeps full precision (ryan)', S.calculateWeightedReviewerScore(pr), 7.475);
  near('weighted keeps full precision (devin)', S.calculateWeightedReviewerScore(pd), 7.975);
  near('CPI uses UNROUNDED weighted scores', S.calculateCPI(pr, pd), 77.25);
  ok('CPI differs from the rounded-first result',
    Math.abs(S.calculateCPI(pr, pd) - 77.5) > 0.2,
    S.calculateCPI(pr, pd));
  check('display rounds to one decimal', S.formatCPI(S.calculateCPI(pr, pd)), '77.3');
  check('weighted display rounds', S.formatScore(S.calculateWeightedReviewerScore(pr)), '7.5');
  check('signed display rounds negative ties symmetrically', S.formatSigned(-1.05, 1), '-1.1');
  ok('calculation value is NOT the display value',
    S.calculateWeightedReviewerScore(pr) !== Number(S.formatScore(S.calculateWeightedReviewerScore(pr))));

  /* Combined category averages keep precision too. */
  var comb = S.calculateCombinedCategoryAverages(flat(7.3), flat(7.4));
  near('combined average full precision', comb.patty, 7.35);
  check('combined display rounds', S.formatScore(comb.patty), '7.4');

  /* Weighting bites: patty moves more than fries. */
  var base = flat(5), up = flat(5); up.patty = 6;
  var fup = flat(5); fup.fries = 6;
  near('+1.0 patty -> 5.3', S.calculateWeightedReviewerScore(up), 5.3);
  near('+1.0 fries -> 5.1', S.calculateWeightedReviewerScore(fup), 5.1);
  ok('patty delta > fries delta',
    (S.calculateWeightedReviewerScore(up) - S.calculateWeightedReviewerScore(base)) >
    (S.calculateWeightedReviewerScore(fup) - S.calculateWeightedReviewerScore(base)));

  /* Tenths and boundaries. */
  near('tenths weighted', S.calculateWeightedReviewerScore(sc(7.3, 8.4, 9.7, 6.1, 5.9, 8.8)), 7.825);
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
  ok('negative score rejected', !S.isScored(-0.1));
  ok('non-tenth score rejected', !S.isScored(7.34));
  ok('numeric tenth string accepted', S.isScored('7.3'));

  /* Ranking uses raw CPI, not the displayed value.
     A: 7.44 & 7.46 -> raw 74.5 ; B: flat 7.45 -> raw 74.5 ... construct a
     pair that displays identically but differs in the third decimal. */
  var aR = flat(8.9);
  var aD = sc(6.2, 8.4, 7.5, 6.6, 8.8, 7.9); /* raw CPI 81.575 */
  var bR = sc(8.2, 9.0, 6.7, 7.5, 8.3, 6.0);
  var bD = sc(8.6, 8.5, 8.4, 8.3, 8.2, 8.1); /* raw CPI 81.6 */
  var rawA = S.calculateCPI(aR, aD), rawB = S.calculateCPI(bR, bD);
  check('both display the same CPI', S.formatCPI(rawA), S.formatCPI(rawB));
  ok('raw CPIs actually differ', rawA !== rawB, rawA + ' vs ' + rawB);
  var ranked = S.rankBurgers([burger('a', 'R', 'A', aR, aD), burger('b', 'R', 'B', bR, bD)]);
  check('higher RAW cpi ranks first despite equal display', ranked[0].id, 'b');

  /* Genuine ties keep insertion order (stable). */
  var tie = S.rankBurgers([
    burger('first', 'R', 'F', flat(8), flat(8)),
    burger('second', 'R', 'S', flat(8), flat(8)),
    burger('top', 'R', 'T', flat(9), flat(9))
  ]);
  check('tie: highest first', tie[0].id, 'top');
  check('tie: original order kept (1)', tie[1].id, 'first');
  check('tie: original order kept (2)', tie[2].id, 'second');

  var personalTie = S.personalRanking([
    burger('personal-first', 'R', 'F', flat(8), null),
    burger('personal-second', 'R', 'S', flat(8), null)
  ], 'ryan');
  check('personal tie keeps insertion order (1)', personalTie[0].id, 'personal-first');
  check('personal tie keeps insertion order (2)', personalTie[1].id, 'personal-second');

  /* =====================================================
     2. PEER REVIEW LIFECYCLE
     ===================================================== */
  var ryanOnly = burger('p1', 'Rest', 'Solo', flat(8), null);
  var devinOnly = burger('p2', 'Rest', 'Solo2', null, flat(8));
  var bothDone = burger('p3', 'Rest', 'Done', flat(8), flat(7));

  check('ryan-only -> pending', S.statusOf(ryanOnly).key, 'pending');
  check('devin-only -> pending', S.statusOf(devinOnly).key, 'pending');
  check('both -> certified', S.statusOf(bothDone).key, 'certified');
  check('no audits -> empty', S.statusOf(burger('p4', 'R', 'None', null, null)).key, 'empty');
  ok('ryan-only not certified', !S.isCertified(ryanOnly));
  ok('both certified', S.isCertified(bothDone));
  check('missing auditor is devin', S.missingAuditor(ryanOnly), 'devin');
  check('missing auditor is ryan', S.missingAuditor(devinOnly), 'ryan');
  check('pending has NO official CPI', S.cpiOf(ryanOnly), null);
  check('certified has CPI', S.cpiOf(bothDone), 75);

  /* Certification is completeness, never score quality. */
  var terrible = burger('bad', 'R', 'Terrible', flat(0.5), flat(0.5));
  check('a terrible burger is still CERTIFIED', S.statusOf(terrible).key, 'certified');
  check('terrible CPI is genuinely low', S.cpiOf(terrible), 5);

  /* Pending burgers stay out of the official rankings. */
  var mixed = [ryanOnly, devinOnly, bothDone];
  check('rankings contain certified only', S.rankBurgers(mixed).length, 1);
  check('pending has no official rank', S.officialRankOf(mixed, 'p1'), null);
  check('certified has an official rank', S.officialRankOf(mixed, 'p3'), 1);

  /* Personal rankings include a reviewer's own pending work. */
  check('ryan personal ranking includes his pending', S.personalRanking(mixed, 'ryan').length, 2);
  check('devin personal ranking includes his pending', S.personalRanking(mixed, 'devin').length, 2);
  ok('personal rank uses only that auditor', S.personalRankOf(mixed, 'ryan', 'p1') != null);

  /* Adapter-level: one audit per auditor per burger, own audit only. */
  var adapter = D.createMockAdapter({ seed: false });
  var lifecycle = adapter.auth.signInAs('ryan')
    .then(function () { return adapter.createBurger({ restaurant: 'Matt’s Bar', burger: 'Jucy Lucy' }); })
    .then(function (b) {
      return adapter.saveAudit(b.id, flat(9)).then(function () { return b; });
    })
    .then(function (b) {
      return adapter.listBurgers().then(function (list) {
        check('one burger row after ryan files', list.length, 1);
        check('status pending after one audit', S.statusOf(list[0]).key, 'pending');
        /* Same auditor files again -> updates, never duplicates. */
        return adapter.saveAudit(b.id, flat(8.5)).then(function () {
          return adapter.listBurgers().then(function (l2) {
            check('re-filing does not create a second burger', l2.length, 1);
            check('own audit is editable', Number(S.auditOf(l2[0], 'ryan').patty), 8.5);
            check('peer audit untouched by ryan', S.auditOf(l2[0], 'devin'), null);
            return b;
          });
        });
      });
    })
    .then(function (b) {
      /* Devin signs in and completes peer review on the SAME record. */
      return adapter.auth.signInAs('devin')
        .then(function () { return adapter.saveAudit(b.id, flat(8)); })
        .then(function () { return adapter.listBurgers(); })
        .then(function (list) {
          check('still one burger after peer review', list.length, 1);
          check('status becomes certified', S.statusOf(list[0]).key, 'certified');
          near('CPI available once certified', S.cpiOf(list[0]), 82.5);
          check('ryan audit preserved', Number(S.auditOf(list[0], 'ryan').patty), 8.5);
          check('devin audit stored separately', Number(S.auditOf(list[0], 'devin').patty), 8);
          /* Devin cannot reach Ryan's row: saveAudit only ever targets self. */
          return adapter.saveAudit(b.id, flat(6)).then(function () {
            return adapter.listBurgers().then(function (l3) {
              check('devin edit changed only devin', Number(S.auditOf(l3[0], 'devin').patty), 6);
              check('ryan audit still intact after devin edit', Number(S.auditOf(l3[0], 'ryan').patty), 8.5);
            });
          });
        });
    });

  /* =====================================================
     3. ANALYTICS
     ===================================================== */
  var m0 = AN.compute([]);
  check('analytics: 0 specimens does not crash', m0.counts.certified, 0);
  check('analytics: mean CPI null when empty', m0.paired.cpi.mean, null);
  check('analytics: no ranked entries', m0.ranked.length, 0);

  var m1audit = AN.compute([ryanOnly]);
  check('analytics: 1 audit, 0 certified', m1audit.counts.certified, 0);
  check('analytics: 1 pending', m1audit.counts.pending, 1);
  check('analytics: ryan has 1 audit', m1audit.auditors.ryan.n, 1);
  check('analytics: devin has 0 audits', m1audit.auditors.devin.n, 0);
  check('analytics: pendingFor devin', m1audit.pendingFor.devin.length, 1);

  var one = burger('c1', 'Matt’s Bar', 'Jucy Lucy', sc(9, 8.5, 7, 6.5, 8, 9), sc(8.2, 8.8, 7.5, 6, 8.4, 8.5));
  var mOne = AN.compute([one]);
  check('analytics: 1 certified', mOne.counts.certified, 1);
  ok('analytics: m.only set at n=1', !!mOne.only);
  near('analytics: combined patty', mOne.certified[0].combined.patty, 8.6);
  near('analytics: delta patty', mOne.certified[0].deltas.patty, 0.8);
  check('analytics: rank assigned', mOne.certified[0].rank, 1);

  /* Known dataset for the descriptive statistics. */
  var set = [
    burger('s1', 'A', 'One',   flat(9),   flat(8),   '2026-06-01T12:00:00Z'),
    burger('s2', 'B', 'Two',   flat(7),   flat(7),   '2026-06-05T12:00:00Z'),
    burger('s3', 'A', 'Three', flat(8),   flat(6),   '2026-06-09T12:00:00Z'),
    burger('s4', 'C', 'Four',  flat(6),   flat(7),   '2026-06-13T12:00:00Z')
  ];
  var mS = AN.compute(set);
  near('mean of ryan weighted (9,7,8,6)', mS.auditors.ryan.weighted.mean, 7.5);
  near('median of ryan weighted', mS.auditors.ryan.weighted.median, 7.5);
  near('mean of devin weighted (8,7,6,7)', mS.auditors.devin.weighted.mean, 7);
  near('population sd of (9,7,8,6)', mS.auditors.ryan.weighted.sd, Math.sqrt(1.25), 1e-9);
  near('population variance of (9,7,8,6)', AN.variance([9, 7, 8, 6]), 1.25, 1e-9);
  near('paired gap ryan-devin', mS.paired.gap, 0.5);
  check('more generous is ryan', mS.paired.moreGenerous, 'ryan');
  near('mean abs disagreement', mS.paired.meanAbsDisagreement, 1);
  near('category delta patty', mS.paired.byCategory.patty.delta, 0.5);
  check('exact agreement cells', mS.paired.exactCells, 6);
  near('exact agreement pct', mS.paired.exactPct, 25);
  check('ryan higher count', mS.paired.ryanHigherCount, 2);
  check('devin higher count', mS.paired.devinHigherCount, 1);
  check('tie count', mS.paired.tieCount, 1);
  check('ryan sweeps', mS.paired.ryanSweeps, 2);
  check('restaurant grouping', mS.counts.restaurants, 3);
  check('repeat restaurants', mS.counts.repeatRestaurants, 1);
  check('official order top', mS.ranked[0].id, 's1');
  check('official order bottom', mS.ranked[3].id, 's4');
  check('largest personal-rank difference', mS.paired.biggestInversionValue, 2);
  near('mean CPI', mS.paired.cpi.mean, 72.5);

  /* Streaks. */
  var streakSet = [
    burger('k1', 'A', '1', flat(9), flat(8), '2026-06-01T12:00:00Z'),
    burger('k2', 'A', '2', flat(9), flat(8), '2026-06-02T12:00:00Z'),
    burger('k3', 'A', '3', flat(9), flat(8), '2026-06-03T12:00:00Z'),
    burger('k4', 'A', '4', flat(7), flat(8), '2026-06-04T12:00:00Z')
  ];
  var mK = AN.compute(streakSet);
  check('longest ryan-higher streak', mK.paired.streaks.ryanHigher.longest, 3);
  check('current ryan-higher streak broken', mK.paired.streaks.ryanHigher.current, 0);
  check('current devin-higher streak', mK.paired.streaks.devinHigher.current, 1);

  /* Trend. */
  var trendSet = [];
  [6, 6, 6, 9, 9, 9].forEach(function (v, i) {
    trendSet.push(burger('t' + i, 'A', 'T' + i, flat(v), flat(v), '2026-06-0' + (i + 1) + 'T12:00:00Z'));
  });
  var mT = AN.compute(trendSet);
  ok('trend detects rising scores', mT.auditors.ryan.trend && mT.auditors.ryan.trend.delta > 2.5,
    mT.auditors.ryan.trend && mT.auditors.ryan.trend.delta);

  /* Turnaround. */
  var turn = burger('tr1', 'A', 'Turn', flat(8), flat(8), '2026-06-01T12:00:00Z');
  turn.audits.devin.createdAt = '2026-06-03T12:00:00Z';
  var mTurn = AN.compute([turn]);
  near('turnaround measured in ms', mTurn.certified[0].turnaroundMs, 2 * 86400000);
  near('turnaround median', mTurn.paired.turnaround.median, 2 * 86400000);

  var normalizedRestaurants = AN.compute([
    burger('nr1', 'Matt\u2019s Bar', 'One', flat(8), flat(8)),
    burger('nr2', '  MATTS   BAR ', 'Two', flat(7), flat(7), '2026-06-02T12:00:00Z')
  ]);
  check('restaurant normalization groups punctuation/case/spacing', normalizedRestaurants.counts.restaurants, 1);
  check('normalized restaurant is recognized as repeat', normalizedRestaurants.repeatRestaurants[0].count, 2);

  var cadence = AN.compute([
    burger('cd1', 'A', 'One', flat(8), flat(8), '2026-06-01T12:00:00Z'),
    burger('cd2', 'B', 'Two', flat(8), flat(8), '2026-06-03T12:00:00Z'),
    burger('cd3', 'C', 'Three', flat(8), flat(8), '2026-06-10T12:00:00Z')
  ]);
  near('activity longest gap', cadence.activity.longestGapMs, 7 * 86400000);

  /* All audits vs paired — the datasets must not be conflated. */
  var mixSet = [
    burger('x1', 'A', 'Paired', flat(8), flat(8), '2026-06-01T12:00:00Z'),
    burger('x2', 'A', 'RyanOnly', flat(2), null, '2026-06-02T12:00:00Z')
  ];
  var mMix = AN.compute(mixSet);
  check('all-audits count includes pending', mMix.auditors.ryan.n, 2);
  check('paired count excludes pending', mMix.paired.n, 1);
  near('ryan all-audit mean includes the 2.0', mMix.auditors.ryan.weighted.mean, 5);
  near('paired comparison uses certified only', mMix.paired.ryanMean, 8);
  ok('paired mean != all-audit mean here',
    mMix.paired.ryanMean !== mMix.auditors.ryan.weighted.mean);

  /* =====================================================
     4. INSIGHT ENGINE
     ===================================================== */
  var stats = IN.stats();
  ok('at least 250 distinct rules', stats.rules >= 250, stats.rules);
  check('no duplicate rule ids', IN.RULES.length, Object.keys(IN.byId).length);
  ok('multiple wording variants exist', stats.variants > stats.rules, stats.variants);
  ok('several rule families', stats.familyCount >= 8, stats.familyCount);
  ok('rare tiers present', (stats.rarities.rare || 0) + (stats.rarities.legendary || 0) >= 10);

  var badMeta = IN.RULES.filter(function (r) {
    return !r.id || !r.family || typeof r.test !== 'function' || !r.variants.length ||
      r.variants.some(function (v) { return typeof v !== 'function'; }) ||
      ['common', 'uncommon', 'rare', 'legendary'].indexOf(r.rarity) === -1 ||
      typeof r.priority !== 'number' || r.priority < 1 || r.priority > 10;
  });
  check('all rules have valid metadata', badMeta.length, 0);

  /* Every rule must survive every dataset shape without throwing. */
  var probeSets = {
    empty: [], oneAudit: [ryanOnly], oneCertified: [one], four: set,
    perfect: [burger('pf', 'A', 'Perfect', flat(10), flat(10))],
    zero: [burger('z', 'A', 'Zero', flat(0), flat(0))],
    identical: [burger('id', 'A', 'Same', flat(7.5), flat(7.5))],
    streaks: streakSet, trend: trendSet, mixed: mixSet
  };
  var threw = [], badOutput = [], renders = 0;
  Object.keys(probeSets).forEach(function (name) {
    var m = AN.compute(probeSets[name]);
    IN.RULES.forEach(function (rule) {
      var eligible;
      try { eligible = !!rule.test(m); }
      catch (e) { threw.push(name + '/' + rule.id + ' (test): ' + e.message); return; }
      if (eligible && !IN.isEligible(rule, m)) eligible = false;
      if (!eligible) return;
      rule.variants.forEach(function (_, i) {
        var out;
        try {
          var direct = rule.variants[i](m, IN.H);
          out = direct && { title: direct.title, body: direct.body };
        }
        catch (e) { threw.push(name + '/' + rule.id + ' (build): ' + e.message); return; }
        if (!out) return;
        renders += 1;
        if (/(NaN|undefined|Infinity|\[object)/.test(out.title + ' ' + out.body)) {
          badOutput.push(name + '/' + rule.id + '#' + i);
        }
      });
    });
  });
  check('no rule throws on any dataset', threw.length, 0);
  check('no NaN / undefined / Infinity in output', badOutput.length, 0);
  ok('many variants rendered during probing', renders > 200, renders);

  /* Findings are available immediately after one certified specimen. */
  var eligibleOne = IN.eligibleRules(mOne);
  ok('n=1 yields multiple eligible rules', eligibleOne.length >= 5, eligibleOne.length);
  var selOne = IN.select(mOne, { noStore: true, ignoreRecent: true });
  ok('n=1 produces findings (not "not enough data")', selOne.length >= 4, selOne.length);
  ok('n=1 findings carry real text', selOne.every(function (f) { return f.title && f.body.length > 20; }));

  /* Sample-size gates hold. */
  var gated = IN.RULES.filter(function (r) { return r.minCertified >= 5; });
  var firedEarly = gated.filter(function (r) { return IN.isEligible(r, mOne); });
  check('rules needing 5+ do not fire at n=1', firedEarly.length, 0);
  var gated10 = IN.RULES.filter(function (r) { return r.minCertified >= 8; });
  check('rules needing 8+ do not fire at n=4', gated10.filter(function (r) { return IN.isEligible(r, mS); }).length, 0);

  /* A threshold rule becomes eligible exactly when the gate is met. */
  var big = [];
  for (var i = 0; i < 9; i++) {
    big.push(burger('b' + i, 'R' + (i % 3), 'B' + i, flat(7 + (i % 3)), flat(6 + (i % 3)), '2026-06-0' + (i + 1) + 'T12:00:00Z'));
  }
  var mBig = AN.compute(big);
  ok('more rules eligible with more data',
    IN.eligibleRules(mBig).length > IN.eligibleRules(mOne).length,
    IN.eligibleRules(mBig).length + ' vs ' + IN.eligibleRules(mOne).length);

  /* Rotation behaviour. */
  var memStore = { _d: {}, getItem: function (k) { return this._d[k] || null; }, setItem: function (k, v) { this._d[k] = v; } };
  var sel = IN.select(mBig, { storage: memStore });
  var ids = sel.map(function (f) { return f.id; });
  check('no duplicate ids within one render', ids.filter(function (x, ix) { return ids.indexOf(x) !== ix; }).length, 0);
  ok('render size within 6-12', sel.length >= 6 && sel.length <= 12, sel.length);
  var famCount = {};
  sel.forEach(function (f) { famCount[f.family] = (famCount[f.family] || 0) + 1; });
  ok('family diversity enforced (max 2 per family)',
    Math.max.apply(null, Object.keys(famCount).map(function (k) { return famCount[k]; })) <= 2, famCount);
  ok('multiple families represented', Object.keys(famCount).length >= 3, Object.keys(famCount).length);

  var second = IN.select(mBig, { storage: memStore });
  var overlap = second.filter(function (f) { return ids.indexOf(f.id) !== -1; }).length;
  ok('revisit rotates the set', overlap < second.length, overlap + '/' + second.length + ' repeated');

  /* Rare conditions are strongly favoured when actually true. */
  var mPerfect = AN.compute([burger('pf', 'A', 'Perfect', flat(10), flat(10))]);
  var perfectSel = IN.select(mPerfect, { noStore: true, ignoreRecent: true });
  ok('a legendary condition surfaces when it occurs',
    perfectSel.some(function (f) { return f.rarity === 'legendary' || f.rarity === 'rare'; }),
    perfectSel.map(function (f) { return f.id + ':' + f.rarity; }).join(','));

  /* Auditor names render properly. */
  var allText = perfectSel.concat(selOne).map(function (f) { return f.title + ' ' + f.body; }).join(' ');
  ok('no placeholder auditor keys leak into prose', !/\bryan\b|\bdevin\b/.test(allText), 'lowercase keys found');
  var nameSel = IN.select(mS, { noStore: true, ignoreRecent: true });
  ok('auditor names appear correctly capitalised',
    /Ryan|Devin/.test(nameSel.map(function (f) { return f.body; }).join(' ')));

  /* Numeric interpolation is sensibly formatted (no 8.700000000000001). */
  var longDecimals = nameSel.concat(perfectSel).filter(function (f) { return /\d\.\d{4,}/.test(f.body); });
  check('no runaway decimals in prose', longDecimals.length, 0);
  check('wording helper rounds decimal ties predictably', IN.H.n1(7.35), '7.4');
  check('two-decimal wording helper rounds predictably', IN.H.n2(1.005), '1.01');

  var adapterChecks = D.createMockAdapter({ seed: false });
  var adapterValidation = adapterChecks.createBurger({ restaurant: 'R', burger: 'B' })
    .then(function () { ok('mock rejects unauthenticated burger creation', false); })
    .catch(function () { ok('mock rejects unauthenticated burger creation', true); })
    .then(function () { return adapterChecks.auth.signIn('ryanburtonwi@gmail.com', 'wrong'); })
    .then(function () { ok('mock rejects an invalid password', false); })
    .catch(function () { ok('mock rejects an invalid password', true); })
    .then(function () { return adapterChecks.auth.signIn('outsider@example.com', 'bps-demo'); })
    .then(function () { ok('mock rejects an unauthorized email', false); })
    .catch(function () { ok('mock rejects an unauthorized email', true); })
    .then(function () { return adapterChecks.auth.signIn('ryanburtonwi@gmail.com', 'bps-demo'); })
    .then(function (session) { check('mock password sign-in maps auditor identity', session.profile.auditorKey, 'ryan'); })
    .then(function () { return adapterChecks.createBurger({ restaurant: '  ', burger: 'B' }); })
    .then(function () { ok('mock rejects blank identity', false); })
    .catch(function () { ok('mock rejects blank identity', true); })
    .then(function () { return adapterChecks.createBurger({ restaurant: 'R', burger: 'B' }); })
    .then(function (b) {
      return adapterChecks.saveAudit(b.id, Object.assign(flat(8), { patty: 10.1 }))
        .then(function () { ok('mock rejects invalid score range', false); })
        .catch(function () { ok('mock rejects invalid score range', true); });
    })
    .then(function () {
      return adapterChecks.saveAudit('missing', flat(8))
        .then(function () { ok('mock rejects an audit for a missing specimen', false); })
        .catch(function () { ok('mock rejects an audit for a missing specimen', true); });
    });

  /* Supabase adapter contract: exercise auth arguments, column mapping and
     response normalization without requiring a live project. */
  var supabaseContract = Promise.resolve();
  if (isNode) {
    var savedSupabase = globalThis.supabase;
    delete globalThis.supabase;
    var failedClosed = false;
    try {
      D.chooseAdapter({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'publishable' });
    } catch (err) { failedClosed = true; }
    ok('configured production adapter fails closed when Supabase is unavailable', failedClosed);
    globalThis.supabase = savedSupabase;

    var calls = { auth: {}, inserts: [], upserts: [], failSignOut: false };
    var fakeClient = {
      auth: {
        getSession: function () {
          return Promise.resolve({ data: { session: { user: { id: 'uuid-ryan', email: 'ryan@bps.test' } } } });
        },
        getUser: function () {
          return Promise.resolve({ data: { user: { id: 'uuid-ryan', email: 'ryan@bps.test' } } });
        },
        signInWithPassword: function (args) {
          calls.auth.signIn = args;
          return Promise.resolve({ data: { session: { user: { id: 'uuid-ryan', email: args.email } } }, error: null });
        },
        signOut: function () {
          return Promise.resolve({ error: calls.failSignOut ? new Error('sign-out failed') : null });
        }
      },
      from: function (table) {
        var q = { table: table, op: 'select', eqValue: null, payload: null, conflict: null };
        function response() {
          if (table === 'profiles' && q.eqValue) {
            return { data: { id: q.eqValue, auditor_key: q.eqValue === 'uuid-devin' ? 'devin' : 'ryan',
                             display_name: q.eqValue === 'uuid-devin' ? 'Devin' : 'Ryan' }, error: null };
          }
          if (table === 'profiles') return { data: [
            { id: 'uuid-ryan', auditor_key: 'ryan', display_name: 'Ryan' },
            { id: 'uuid-devin', auditor_key: 'devin', display_name: 'Devin' }
          ], error: null };
          if (table === 'burgers' && q.op === 'insert') return { data: {
            id: 'burger-new', specimen_number: 'BPS-0002', restaurant: q.payload.restaurant,
            burger: q.payload.burger, created_by: q.payload.created_by, created_at: '2026-06-02T00:00:00Z'
          }, error: null };
          if (table === 'burgers') return { data: [{
            id: 'burger-1', specimen_number: 'BPS-0001', restaurant: 'Counter', burger: 'Standard',
            created_by: 'uuid-ryan', created_at: '2026-06-01T00:00:00Z'
          }], error: null };
          if (table === 'audits' && q.op === 'upsert') return { data: Object.assign({
            id: 'audit-new', created_at: '2026-06-02T00:00:00Z', updated_at: '2026-06-02T00:00:00Z'
          }, q.payload), error: null };
          return { data: [{
            id: 'audit-1', burger_id: 'burger-1', auditor_id: 'uuid-ryan', patty: '8.1',
            overall_flavor: '8.2', bun: '8.3', fries: '8.4', value: '8.5', condiments: '8.6',
            created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z'
          }], error: null };
        }
        q.select = function () { return q; };
        q.eq = function (_, value) { q.eqValue = value; return q; };
        q.order = function () { return Promise.resolve(response()); };
        q.insert = function (payload) { q.op = 'insert'; q.payload = payload; calls.inserts.push(payload); return q; };
        q.upsert = function (payload, opts) {
          q.op = 'upsert'; q.payload = payload; q.conflict = opts && opts.onConflict;
          calls.upserts.push({ payload: payload, conflict: q.conflict }); return q;
        };
        q.single = function () { return Promise.resolve(response()); };
        q.then = function (resolve, reject) { return Promise.resolve(response()).then(resolve, reject); };
        return q;
      }
    };
    globalThis.supabase = { createClient: function () { return fakeClient; } };
    var supabaseAdapter = D.createSupabaseAdapter({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'publishable' });
    supabaseContract = supabaseAdapter.auth.getSession()
      .then(function (session) {
        check('Supabase session maps UUID to auditor profile', session.profile.auditorKey, 'ryan');
        return supabaseAdapter.auth.signIn('ryan@bps.test', 'test-password');
      })
      .then(function (session) {
        check('Supabase password sign-in passes the email', calls.auth.signIn.email, 'ryan@bps.test');
        check('Supabase password sign-in passes the password', calls.auth.signIn.password, 'test-password');
        check('Supabase password session includes profile', session.profile.displayName, 'Ryan');
        return supabaseAdapter.listBurgers();
      })
      .then(function (list) {
        check('Supabase rows normalize to one canonical burger', list.length, 1);
        check('Supabase numeric columns normalize to numbers', list[0].audits.ryan.patty, 8.1);
        check('Supabase auditor UUID maps to Ryan audit slot', list[0].audits.ryan.auditorId, 'uuid-ryan');
        return supabaseAdapter.createBurger({ restaurant: ' Counter ', burger: ' Standard ' });
      })
      .then(function (created) {
        check('Supabase burger insert trims identity', created.restaurant + '/' + created.burger, 'Counter/Standard');
        check('Supabase burger insert owns row with auth UUID', calls.inserts[0].created_by, 'uuid-ryan');
        return supabaseAdapter.saveAudit(created.id, sc(8.1, 8.2, 8.3, 8.4, 8.5, 8.6));
      })
      .then(function () {
        check('Supabase audit upsert targets unique owner pair', calls.upserts[0].conflict, 'burger_id,auditor_id');
        check('Supabase audit maps overallFlavor column', calls.upserts[0].payload.overall_flavor, 8.2);
        calls.failSignOut = true;
        return supabaseAdapter.auth.signOut()
          .then(function () { ok('Supabase sign-out errors reject', false); })
          .catch(function () { ok('Supabase sign-out errors reject', true); });
      });
  }

  /* =====================================================
     Report
     ===================================================== */
  Promise.all([lifecycle, adapterValidation, supabaseContract]).then(function () {
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
