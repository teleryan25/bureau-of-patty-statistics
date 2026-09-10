/* =============================================================
   Bureau of Patty Statistics — insight-rules.js

   The rule library. Registered against the engine in insights.js.
   Split into batches by family; each batch is its own IIFE.

   Every rule: reads precomputed metrics, never calculates statistics.
   ============================================================= */

/* ===== BATCH 1 — SMALL SAMPLE / ONE SPECIMEN ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt, gte = I.gte;
  var K = S.CATEGORY_KEYS;

  /* --- the register itself is embarrassing --- */
  R('ss-single-specimen', 'small-sample', { c: 1, pr: 9, x: 'sample-size' },
    function (m) { return m.counts.certified === 1; },
    function (m, H) { return { title: 'SAMPLE SIZE ADVISORY', body:
      'BPS currently possesses one certified specimen. This has not prevented the Office of Auditor Accountability from reaching several conclusions.' }; },
    function (m, H) { return { title: 'STATISTICAL DISCLAIMER', body:
      'All findings below are derived from a single hamburger. The Bureau considers this sufficient and has declined to hear objections.' }; },
    function (m, H) { return { title: 'PRELIMINARY REGISTER NOTICE', body:
      'The register contains exactly one certified specimen. Every trend identified in this report is, technically speaking, a single data point wearing a trenchcoat.' }; });

  R('ss-two-specimens', 'small-sample', { c: 2, pr: 8, x: 'sample-size' },
    function (m) { return m.counts.certified === 2; },
    function (m, H) { return { title: 'SAMPLE SIZE ADVISORY', body:
      'With two certified specimens on file, the Bureau has doubled its evidence base and quadrupled its confidence. Only one of those was justified.' }; },
    function (m, H) { return { title: 'METHODOLOGICAL NOTE', body:
      'Two specimens. The Office is now able to draw a straight line through all available data, which it regards as a trend.' }; });

  R('ss-three-specimens', 'small-sample', { c: 3, pr: 6, x: 'sample-size' },
    function (m) { return m.counts.certified === 3; },
    function (m, H) { return { title: 'SAMPLE SIZE ADVISORY', body:
      'Three certified specimens. The Bureau has begun using the word "pattern" in internal correspondence and no one has stopped it.' }; },
    function (m, H) { return { title: 'THRESHOLD REACHED', body:
      'At three specimens the Office of Auditor Accountability unlocks its medium-confidence vocabulary. Confidence itself remains unchanged.' }; });

  R('ss-under-five', 'small-sample', { c: 3, pr: 4, x: 'sample-size' },
    function (m) { return m.counts.certified >= 3 && m.counts.certified < 5; },
    function (m, H) { return { title: 'PROVISIONAL METHODOLOGY', body:
      'The register holds ' + m.counts.certified + ' certified specimens. Statistical convention suggests waiting for more. The Bureau has noted the suggestion.' }; });

  /* --- one-specimen structural findings --- */
  R('ss1-who-scored-higher', 'small-sample', { c: 1, pr: 8 },
    function (m) { return m.only && m.only.higher !== 'tie'; },
    function (m, H) { var v = m.only, w = v.higher;
      return { title: 'PREMATURE FINDING', body:
        'Following an exhaustive review of one hamburger, the Bureau is prepared to identify ' + H.name(w) +
        ' as the more generous auditor, by ' + H.abs2(v.weightedDelta) + ' points. Confidence in this conclusion is professionally indefensible.' }; },
    function (m, H) { var v = m.only, w = v.higher;
      return { title: 'EARLY EVIDENCE', body:
        H.name(w) + ' rated ' + H.bare(v) + ' higher overall than ' + H.other(w) +
        '. The Office has extrapolated from this to a general theory of ' + H.name(w) + "'s character." }; });

  R('ss1-dead-heat', 'small-sample', { c: 1, pr: 7, r: 'uncommon' },
    function (m) { return m.only && m.only.higher === 'tie'; },
    function (m, H) { return { title: 'INAUGURAL DEADLOCK', body:
      'On the register\'s only specimen, both auditors produced identical weighted scores. The Bureau has no procedure for this and is proceeding as though it did not happen.' }; });

  R('ss1-biggest-disagreement', 'small-sample', { c: 1, pr: 7 },
    function (m) { return m.only && gt(m.only.maxAbsDelta, 0.4); },
    function (m, H) { var v = m.only, c = v.maxAbsDeltaCat;
      return { title: 'EARLY EVIDENCE', body:
        'On ' + H.cat(c) + ', the auditors differ by ' + H.n1(v.maxAbsDelta) +
        ' points. The Bureau has opened an investigation based on absolutely no historical context.' }; },
    function (m, H) { var v = m.only, c = v.maxAbsDeltaCat;
      return { title: 'FIRST RECORDED DISPUTE', body:
        H.cat(c) + ' is the register\'s inaugural point of contention, at ' + H.n1(v.maxAbsDelta) +
        ' points apart. A precedent has been set that the Office will now treat as tradition.' }; });

  R('ss1-exact-agreements', 'small-sample', { c: 1, pr: 6 },
    function (m) { return m.only && m.only.exactCells >= 1; },
    function (m, H) { var v = m.only;
      return { title: 'CONCURRENCE LOGGED', body:
        'The auditors agreed to the decimal in ' + v.exactCells + ' of ' + K.length +
        ' categories on the register\'s only specimen. The Office regards this as either rigour or collusion.' }; });

  R('ss1-total-agreement', 'small-sample', { c: 1, pr: 9, r: 'rare' },
    function (m) { return m.only && m.only.exactCells === K.length; },
    function (m, H) { return { title: 'IDENTICAL FILING ALERT', body:
      'On the register\'s first specimen, Ryan and Devin submitted six identical category scores. The Bureau is required to note that independent auditing was, in theory, occurring.' }; });

  R('ss1-sweep', 'small-sample', { c: 1, pr: 8 },
    function (m) { return m.only && m.only.sweep; },
    function (m, H) { var v = m.only, w = v.sweep;
      return { title: 'CLEAN SWEEP RECORDED', body:
        H.name(w) + ' scored higher than ' + H.other(w) + ' in all six categories on the register\'s only specimen. ' +
        'The Office has flagged this as either enthusiasm or a systematic calibration difference, and cannot yet tell which.' }; },
    function (m, H) { var v = m.only, w = v.sweep;
      return { title: 'UNANIMOUS DIFFERENTIAL', body:
        'Every single category: ' + H.name(w) + ' higher. Six for six. The Bureau notes that with one specimen this proves nothing, and has recorded it as proof anyway.' }; });

  R('ss1-strongest-category', 'small-sample', { c: 1, pr: 6 },
    function (m) { return m.only && m.only.best.combined; },
    function (m, H) { var v = m.only, c = v.best.combined;
      return { title: 'CATEGORY FINDING', body:
        H.cat(c) + ' is the strongest attribute of the register\'s only specimen, at a combined ' + H.n1(v.combined[c]) +
        '. It is therefore also the strongest ' + H.lcat(c) + ' in Bureau history.' }; });

  R('ss1-weakest-category', 'small-sample', { c: 1, pr: 6 },
    function (m) { return m.only && m.only.worst.combined; },
    function (m, H) { var v = m.only, c = v.worst.combined;
      return { title: 'DEFICIENCY NOTED', body:
        H.cat(c) + ' scored lowest on the register\'s only specimen (' + H.n1(v.combined[c]) +
        '). By an unavoidable quirk of arithmetic it is simultaneously the best and worst ' + H.lcat(c) + ' ever recorded.' }; });

  R('ss1-flat-scoring', 'small-sample', { c: 1, pr: 6 },
    function (m) { return m.only && (lt(m.only.spread.ryan, 1.0) || lt(m.only.spread.devin, 1.0)); },
    function (m, H) { var v = m.only;
      var who = lt(v.spread.ryan, 1.0) && (v.spread.ryan <= v.spread.devin) ? 'ryan' : 'devin';
      return { title: 'FLATNESS ADVISORY', body:
        H.name(who) + ' rated all six categories within ' + H.n1(v.spread[who]) +
        ' points of each other. Either the burger was remarkably consistent or ' + H.name(who) + ' was not paying close attention.' }; });

  R('ss1-wide-scoring', 'small-sample', { c: 1, pr: 6 },
    function (m) { return m.only && (gt(m.only.spread.ryan, 3.0) || gt(m.only.spread.devin, 3.0)); },
    function (m, H) { var v = m.only;
      var who = gt(v.spread.ryan, 3.0) && (v.spread.ryan >= v.spread.devin) ? 'ryan' : 'devin';
      return { title: 'VOLATILITY NOTICE', body:
        H.name(who) + "'s six scores span " + H.n1(v.spread[who]) +
        ' points on a single hamburger. The Office notes that this was one object, consumed on one occasion.' }; });

  R('ss1-used-a-ten', 'small-sample', { c: 1, pr: 7 },
    function (m) {
      if (!m.only) return false;
      return K.some(function (c) { return Number(m.only.scores.ryan[c]) === 10 || Number(m.only.scores.devin[c]) === 10; });
    },
    function (m, H) { var v = m.only;
      var who = K.some(function (c) { return Number(v.scores.ryan[c]) === 10; }) ? 'ryan' : 'devin';
      var cat = K.filter(function (c) { return Number(v.scores[who][c]) === 10; })[0];
      return { title: 'MAXIMUM SCORE ISSUED', body:
        H.name(who) + ' awarded a 10.0 for ' + H.cat(cat) + ' on the first certified specimen in Bureau history. ' +
        'There is now nowhere left to go and ' + H.name(who) + ' has been informed.' }; });

  R('ss1-used-below-five', 'small-sample', { c: 1, pr: 7 },
    function (m) {
      if (!m.only) return false;
      return K.some(function (c) { return Number(m.only.scores.ryan[c]) < 5 || Number(m.only.scores.devin[c]) < 5; });
    },
    function (m, H) { var v = m.only;
      var who = K.some(function (c) { return Number(v.scores.ryan[c]) < 5; }) ? 'ryan' : 'devin';
      var cat = K.filter(function (c) { return Number(v.scores[who][c]) < 5; })[0];
      return { title: 'ADVERSE FINDING', body:
        H.name(who) + ' issued a ' + H.n1(v.scores[who][cat]) + ' for ' + H.cat(cat) +
        ' on the Bureau\'s inaugural specimen. A bold opening statement.' }; });

  R('ss1-strong-consensus', 'small-sample', { c: 1, pr: 7 },
    function (m) { return m.only && lt(m.only.meanAbsDelta, 0.25); },
    function (m, H) { var v = m.only;
      return { title: 'SUSPICIOUS HARMONY', body:
        'Mean disagreement on the register\'s only specimen: ' + H.n2(v.meanAbsDelta) +
        ' points. The auditors are either extremely well calibrated or were sitting close enough to see each other\'s phone.' }; });

  R('ss1-strong-dissent', 'small-sample', { c: 1, pr: 8 },
    function (m) { return m.only && gt(m.only.meanAbsDelta, 0.8); },
    function (m, H) { var v = m.only;
      return { title: 'INAUGURAL DISPUTE', body:
        'Mean category disagreement of ' + H.n2(v.meanAbsDelta) +
        ' points on the very first certified specimen. The Bureau has scheduled a hearing and cancelled it.' }; });

  R('ss1-patty-vs-fries', 'small-sample', { c: 1, pr: 5 },
    function (m) { return m.only && num(m.only.combined.patty) && num(m.only.combined.fries) && Math.abs(m.only.combined.patty - m.only.combined.fries) >= 1.5; },
    function (m, H) { var v = m.only, d = v.combined.patty - v.combined.fries;
      return d > 0
        ? { title: 'ACCOMPANIMENT DEFICIT', body: 'The patty outscores the fries by ' + H.n1(d) + ' points. The Bureau has, from a standing start, identified a systemic weakness in the side-order sector.' }
        : { title: 'SIDE-ORDER SUPREMACY', body: 'The fries outscore the patty by ' + H.abs1(d) + ' points on the register\'s only specimen. Investigators are asking what, exactly, is being sold here.' }; });

  R('ss1-bun-vs-patty', 'small-sample', { c: 1, pr: 5 },
    function (m) { return m.only && num(m.only.combined.bun) && num(m.only.combined.patty) && m.only.combined.bun > m.only.combined.patty; },
    function (m, H) { var v = m.only;
      return { title: 'STRUCTURAL ANOMALY', body:
        'The bun (' + H.n1(v.combined.bun) + ') outscored the patty (' + H.n1(v.combined.patty) +
        ') on the Bureau\'s first specimen. The Office considers this the wrong way round and has said so in writing.' }; });

  R('ss1-value-vs-flavor', 'small-sample', { c: 1, pr: 5 },
    function (m) { return m.only && num(m.only.combined.value) && num(m.only.combined.overallFlavor) && Math.abs(m.only.combined.value - m.only.combined.overallFlavor) >= 1.2; },
    function (m, H) { var v = m.only, d = v.combined.value - v.combined.overallFlavor;
      return d > 0
        ? { title: 'ECONOMIC FINDING', body: 'Value exceeds Overall Flavor by ' + H.n1(d) + ' points. The specimen is, in the Bureau\'s assessment, cheap rather than good.' }
        : { title: 'PRICING CONCERN', body: 'Overall Flavor exceeds Value by ' + H.abs1(d) + ' points. Delicious, and the auditors would like someone to know they noticed the bill.' }; });

  R('ss1-turnaround-fast', 'small-sample', { c: 1, pr: 6 },
    function (m) { return m.only && num(m.only.turnaroundMs) && m.only.turnaroundMs < 7200000; },
    function (m, H) { var v = m.only;
      return { title: 'PROCEDURAL EFFICIENCY', body:
        'Peer review of the register\'s first specimen was completed in ' + H.hours(v.turnaroundMs) +
        '. The Bureau notes this pace and expects it never to recur.' }; });

  R('ss1-turnaround-slow', 'small-sample', { c: 1, pr: 6 },
    function (m) { return m.only && num(m.only.turnaroundMs) && m.only.turnaroundMs > 3 * 86400000; },
    function (m, H) { var v = m.only;
      return { title: 'DELAY ON RECORD', body:
        'The Bureau\'s first specimen waited ' + H.days(v.turnaroundMs) +
        ' for peer review. The register is one hamburger old and already has a backlog culture.' }; });

  R('ss1-cpi-context', 'small-sample', { c: 1, pr: 5 },
    function (m) { return m.only && num(m.only.cpi); },
    function (m, H) { var v = m.only;
      return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
        'The mean Composite Patty Index across all certified specimens is ' + H.n1(v.cpi) +
        '. It is also the median, the maximum, the minimum and the mode. This information was expensive to calculate.' }; },
    function (m, H) { var v = m.only;
      return { title: 'DISTRIBUTION SUMMARY', body:
        'Register-wide CPI standard deviation: 0.0. The Bureau has achieved perfect statistical consistency by the simple method of having one hamburger.' }; });

  R('ss1-100pct-consumption', 'small-sample', { c: 1, pr: 3, r: 'uncommon' },
    function (m) { return m.counts.certified >= 1 && m.counts.certified <= 3; },
    function (m, H) { return { title: 'SAMPLE SIZE ADVISORY', body:
      'Following ' + (m.counts.certified === 1 ? 'one hamburger' : m.counts.certified + ' hamburgers') +
      ', the Bureau has detected a 100% rate of burger consumption during burger evaluations. Causality has not been established.' }; },
    function (m, H) { return { title: 'OBSERVATIONAL FINDING', body:
      '100% of specimens examined by this Bureau have been hamburgers. The Office is investigating whether this reflects sampling bias.' }; });

  R('ss1-both-auditors-participated', 'small-sample', { c: 1, pr: 2, r: 'uncommon' },
    function (m) { return m.counts.certified >= 1 && m.counts.certified <= 4; },
    function (m, H) { return { title: 'COMPLIANCE CONFIRMATION', body:
      'Both auditors have participated in 100% of certified evaluations. This is a requirement for certification, which makes the statistic technically flawless and completely uninformative.' }; });

  R('ss1-first-specimen-named', 'small-sample', { c: 1, pr: 4 },
    function (m) { return m.counts.certified >= 1 && m.counts.certified <= 5 && m.paired.first; },
    function (m, H) { var v = m.paired.first;
      return { title: 'HISTORICAL RECORD', body:
        'Specimen ' + v.specimen + ', ' + H.spec(v) + ', remains the Bureau\'s founding certified evaluation. ' +
        'A commemorative plaque has been proposed and rejected on cost grounds.' }; });

  R('ss2-first-comparison', 'small-sample', { c: 2, pr: 7 },
    function (m) { return m.counts.certified === 2 && num(m.paired.gap) && Math.abs(m.paired.gap) >= 0.2; },
    function (m, H) { var w = m.paired.moreGenerous;
      return { title: 'PROVISIONAL ACCUSATION', body:
        'After two certified specimens, ' + H.name(w) + ' appears ' + H.abs1(m.paired.gap) +
        ' points more generous overall. The sample size is laughable. The accusation stands.' }; });

  R('ss2-category-claim', 'small-sample', { c: 2, pr: 6 },
    function (m) { return m.counts.certified === 2 && m.paired.mostContestedCat && gt(m.paired.mostContestedVal, 0.3); },
    function (m, H) { var c = m.paired.mostContestedCat;
      return { title: 'EMERGING DISPUTE', body:
        'Across both certified specimens, ' + H.cat(c) + ' shows the widest average disagreement (' + H.n2(m.paired.mostContestedVal) +
        ' points). Two data points is not a pattern. The Bureau has filed it as one.' }; });

  R('ss-early-streak', 'small-sample', { c: 2, pr: 6 },
    function (m) {
      var s = m.paired.streaks;
      return m.counts.certified <= 4 && (s.ryanHigher.current === m.counts.certified || s.devinHigher.current === m.counts.certified);
    },
    function (m, H) {
      var s = m.paired.streaks;
      var who = s.ryanHigher.current >= s.devinHigher.current ? 'ryan' : 'devin';
      return { title: 'PATTERN ALLEGATION', body:
        H.name(who) + ' has scored higher on every certified specimen so far — all ' + m.counts.certified +
        ' of them. The Office is aware of how few that is and has issued the finding regardless.' }; });

  R('ss-no-certified-yet', 'small-sample', { c: 0, pr: 10, x: 'sample-size' },
    function (m) { return m.counts.certified === 0 && m.counts.burgers > 0; },
    function (m, H) { return { title: 'REGISTER NOT YET OPERATIONAL', body:
      'No specimen has completed peer review. The Bureau possesses ' + m.counts.burgers + ' ' + H.plural(m.counts.burgers, 'filing') +
      ' and zero certified findings, a ratio it considers characteristic.' }; },
    function (m, H) { return { title: 'AWAITING QUORUM', body:
      'The Office of Auditor Accountability cannot compute a Composite Patty Index until both auditors have examined at least one identical hamburger. The wait continues.' }; });

  R('ss-completely-empty', 'small-sample', { c: 0, pr: 10, x: 'sample-size' },
    function (m) { return m.counts.burgers === 0; },
    function (m, H) { return { title: 'REGISTER EMPTY', body:
      'The Bureau holds no specimens whatsoever. Analytical capability is presently theoretical. Staff morale is reported as unchanged.' }; },
    function (m, H) { return { title: 'NO DATA ON FILE', body:
      'The Office of Auditor Accountability has been fully staffed and funded in anticipation of a hamburger. None has arrived.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 2 — GENEROSITY / HARSHNESS ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt, gte = I.gte;
  var K = S.CATEGORY_KEYS;

  function gen(m) { return m.paired.moreGenerous; }
  function harsh(m) { return m.paired.moreGenerous === 'ryan' ? 'devin' : 'ryan'; }

  R('gen-gap-huge', 'generosity', { c: 5, pr: 9, x: 'generosity-gap' },
    function (m) { return gt(Math.abs(m.paired.gap), 0.8); },
    function (m, H) { return { title: 'ONGOING CALIBRATION FAILURE', body:
      H.name(gen(m)) + "'s average score remains " + H.abs1(m.paired.gap) + ' points above ' + H.name(harsh(m)) +
      "'s. The Bureau has ruled out coincidence and is now investigating whether " + H.name(gen(m)) + ' simply enjoys hamburgers too much.' }; },
    function (m, H) { return { title: 'SEVERE DIVERGENCE NOTICE', body:
      'Across ' + m.paired.n + ' certified specimens, ' + H.name(gen(m)) + ' averages ' + H.abs1(m.paired.gap) +
      ' points higher than ' + H.name(harsh(m)) + '. Two auditors, one hamburger, two entirely different afternoons.' }; },
    function (m, H) { return { title: 'CALIBRATION EMERGENCY', body:
      'The generosity gap has reached ' + H.abs2(m.paired.gap) + ' points. The Office recommends the auditors eat the same hamburger at the same time, which is what they have been doing.' }; });

  R('gen-gap-large', 'generosity', { c: 5, pr: 7, x: 'generosity-gap' },
    function (m) { return gt(Math.abs(m.paired.gap), 0.45) && !gt(Math.abs(m.paired.gap), 0.8); },
    function (m, H) { return { title: 'GENEROSITY DIFFERENTIAL', body:
      H.name(gen(m)) + ' averages ' + H.abs2(m.paired.gap) + ' points above ' + H.name(harsh(m)) +
      ' across ' + m.paired.n + ' certified specimens. The Bureau is monitoring and has no intention of intervening.' }; },
    function (m, H) { return { title: 'PERSISTENT SKEW', body:
      'Mean weighted scores: ' + H.name('ryan') + ' ' + H.n2(m.paired.ryanMean) + ', ' + H.name('devin') + ' ' + H.n2(m.paired.devinMean) +
      '. The difference has survived ' + m.paired.n + ' specimens and shows no sign of embarrassment.' }; });

  R('gen-gap-modest', 'generosity', { c: 4, pr: 5, x: 'generosity-gap' },
    function (m) { return gt(Math.abs(m.paired.gap), 0.15) && !gt(Math.abs(m.paired.gap), 0.45); },
    function (m, H) { return { title: 'MINOR CALIBRATION VARIANCE', body:
      H.name(gen(m)) + ' runs ' + H.abs2(m.paired.gap) + ' points warmer than ' + H.name(harsh(m)) +
      '. This is within tolerances the Bureau invented for this sentence.' }; });

  R('gen-gap-negligible', 'generosity', { c: 4, pr: 7, x: 'generosity-gap' },
    function (m) { return num(m.paired.gap) && Math.abs(m.paired.gap) <= 0.08; },
    function (m, H) { return { title: 'COMMENDATION FOR CALIBRATION', body:
      'Mean weighted scores differ by ' + H.abs2(m.paired.gap) + ' points across ' + m.paired.n +
      ' specimens. The Office of Auditor Accountability is disappointed to report that both auditors appear to be doing their jobs correctly.' }; },
    function (m, H) { return { title: 'NOTHING TO REPORT', body:
      'The generosity gap stands at ' + H.abs2(m.paired.gap) + ' points. Investigators have found no misconduct and are visibly frustrated.' }; });

  R('gen-high-absolute-ryan', 'generosity', { a: 4, pr: 6 },
    function (m) { return gt(m.auditors.ryan.scores.mean, 8.6); },
    function (m, H) { return { title: 'GENEROSITY INVESTIGATION', body:
      "Ryan's mean category score across all filed audits is " + H.n2(m.auditors.ryan.scores.mean) +
      '. The Bureau is reviewing whether he is aware the scale extends below that.' }; });

  R('gen-high-absolute-devin', 'generosity', { a: 4, pr: 6 },
    function (m) { return gt(m.auditors.devin.scores.mean, 8.6); },
    function (m, H) { return { title: 'GENEROSITY INVESTIGATION', body:
      "Devin's mean category score across all filed audits is " + H.n2(m.auditors.devin.scores.mean) +
      '. The Office notes that enthusiasm is not itself a violation, then notes it again more pointedly.' }; });

  R('gen-low-absolute-ryan', 'generosity', { a: 4, pr: 6 },
    function (m) { return lt(m.auditors.ryan.scores.mean, 6.8); },
    function (m, H) { return { title: 'SEVERITY REVIEW', body:
      "Ryan's mean category score is " + H.n2(m.auditors.ryan.scores.mean) +
      '. The Bureau wishes to confirm that he is eating the hamburgers and not merely inspecting them.' }; });

  R('gen-low-absolute-devin', 'generosity', { a: 4, pr: 6 },
    function (m) { return lt(m.auditors.devin.scores.mean, 6.8); },
    function (m, H) { return { title: 'SEVERITY REVIEW', body:
      "Devin's mean category score is " + H.n2(m.auditors.devin.scores.mean) +
      '. Whatever standard he is applying, no hamburger has yet met it.' }; });

  R('gen-both-generous', 'generosity', { c: 5, pr: 6, x: 'joint-generosity' },
    function (m) { return gt(m.auditors.ryan.scores.mean, 8.3) && gt(m.auditors.devin.scores.mean, 8.3); },
    function (m, H) { return { title: 'INSTITUTIONAL DRIFT', body:
      'Both auditors average above 8.3 across every score on file. Either Minnesota hamburgers are exceptional or this Bureau has lost the ability to be disappointed.' }; },
    function (m, H) { return { title: 'GRADE INFLATION NOTICE', body:
      'Mean scores of ' + H.n2(m.auditors.ryan.scores.mean) + ' and ' + H.n2(m.auditors.devin.scores.mean) +
      '. The Office has quietly reclassified 7.0 as a failing grade to preserve the appearance of rigour.' }; });

  R('gen-both-harsh', 'generosity', { c: 5, pr: 6, x: 'joint-generosity' },
    function (m) { return lt(m.auditors.ryan.scores.mean, 7.0) && lt(m.auditors.devin.scores.mean, 7.0); },
    function (m, H) { return { title: 'INSTITUTIONAL PESSIMISM', body:
      'Both auditors average below 7.0. The Bureau has considered whether the problem is the hamburgers and concluded, provisionally, that it is.' }; });

  R('gen-flip', 'generosity', { c: 6, pr: 8, r: 'uncommon' },
    function (m) {
      var r = m.auditors.ryan, d = m.auditors.devin;
      if (!r.trend || !d.trend) return false;
      return (r.trend.delta > 0.3 && d.trend.delta < -0.3) || (r.trend.delta < -0.3 && d.trend.delta > 0.3);
    },
    function (m, H) { var r = m.auditors.ryan.trend, d = m.auditors.devin.trend;
      var rising = r.delta > 0 ? 'ryan' : 'devin';
      return { title: 'DIVERGENT TRAJECTORIES', body:
        H.name(rising) + ' has grown more generous over time while ' + H.other(rising) +
        ' has grown harsher. The auditors are moving in opposite directions and neither has mentioned it.' }; });

  R('gen-getting-generous-ryan', 'generosity', { a: 6, pr: 6 },
    function (m) { return m.auditors.ryan.trend && gt(m.auditors.ryan.trend.delta, 0.4); },
    function (m, H) { var t = m.auditors.ryan.trend;
      return { title: 'SOFTENING DETECTED', body:
        "Ryan's recent audits average " + H.n2(t.delta) + ' points above his earlier ones. The Bureau is investigating whether standards are slipping or hamburgers are improving.' }; });

  R('gen-getting-generous-devin', 'generosity', { a: 6, pr: 6 },
    function (m) { return m.auditors.devin.trend && gt(m.auditors.devin.trend.delta, 0.4); },
    function (m, H) { var t = m.auditors.devin.trend;
      return { title: 'SOFTENING DETECTED', body:
        "Devin's later audits run " + H.n2(t.delta) + ' points above his early work. Whatever resistance he began with has not survived contact with cheese.' }; });

  R('gen-getting-harsh-ryan', 'generosity', { a: 6, pr: 6 },
    function (m) { return m.auditors.ryan.trend && lt(m.auditors.ryan.trend.delta, -0.4); },
    function (m, H) { var t = m.auditors.ryan.trend;
      return { title: 'HARDENING DETECTED', body:
        "Ryan's recent audits average " + H.abs2(t.delta) + ' points below his earlier ones. Prolonged exposure to hamburgers appears to be having the expected effect.' }; });

  R('gen-getting-harsh-devin', 'generosity', { a: 6, pr: 6 },
    function (m) { return m.auditors.devin.trend && lt(m.auditors.devin.trend.delta, -0.4); },
    function (m, H) { var t = m.auditors.devin.trend;
      return { title: 'HARDENING DETECTED', body:
        "Devin has become " + H.abs2(t.delta) + ' points harsher since the register opened. The Office regards this as either developing expertise or accumulating resentment.' }; });

  R('gen-category-generosity-split', 'generosity', { c: 5, pr: 7 },
    function (m) {
      var over = K.filter(function (c) { return m.paired.byCategory[c].delta > 0.2; }).length;
      var under = K.filter(function (c) { return m.paired.byCategory[c].delta < -0.2; }).length;
      return over >= 2 && under >= 2;
    },
    function (m, H) {
      var over = K.filter(function (c) { return m.paired.byCategory[c].delta > 0.2; });
      var under = K.filter(function (c) { return m.paired.byCategory[c].delta < -0.2; });
      return { title: 'SELECTIVE GENEROSITY', body:
        'Ryan scores higher on ' + over.map(H.lcat).join(' and ') + '; Devin scores higher on ' + under.map(H.lcat).join(' and ') +
        '. Neither auditor is generous. They are generous about different things, which is worse.' }; });

  R('gen-sweep-count-ryan', 'generosity', { c: 4, pr: 7 },
    function (m) { return m.paired.ryanSweeps >= 2 && m.paired.ryanSweeps > m.paired.devinSweeps; },
    function (m, H) { return { title: 'PATTERN OF TOTAL DIVERGENCE', body:
      'On ' + H.times(m.paired.ryanSweeps) + ', Ryan has scored higher than Devin in all six categories simultaneously. The Bureau considers a clean sweep suspicious in either direction.' }; });

  R('gen-sweep-count-devin', 'generosity', { c: 4, pr: 7 },
    function (m) { return m.paired.devinSweeps >= 2 && m.paired.devinSweeps > m.paired.ryanSweeps; },
    function (m, H) { return { title: 'PATTERN OF TOTAL DIVERGENCE', body:
      'Devin has out-scored Ryan in all six categories on ' + H.times(m.paired.devinSweeps) +
      '. Six-for-six is not a disagreement, it is a worldview.' }; });

  R('gen-higher-count-lopsided', 'generosity', { c: 6, pr: 8 },
    function (m) {
      var p = m.paired, tot = p.ryanHigherCount + p.devinHigherCount;
      return tot >= 6 && (p.ryanHigherCount / tot >= 0.8 || p.devinHigherCount / tot >= 0.8);
    },
    function (m, H) {
      var p = m.paired;
      var who = p.ryanHigherCount > p.devinHigherCount ? 'ryan' : 'devin';
      var n = Math.max(p.ryanHigherCount, p.devinHigherCount);
      return { title: 'SYSTEMATIC DIFFERENTIAL', body:
        H.name(who) + ' has recorded the higher weighted score on ' + n + ' of ' + (p.ryanHigherCount + p.devinHigherCount) +
        ' contested specimens. The Bureau no longer describes this as chance.' }; });

  R('gen-higher-count-even', 'generosity', { c: 6, pr: 6 },
    function (m) {
      var p = m.paired, tot = p.ryanHigherCount + p.devinHigherCount;
      return tot >= 6 && Math.abs(p.ryanHigherCount - p.devinHigherCount) <= 1;
    },
    function (m, H) { var p = m.paired;
      return { title: 'BALANCED DISAGREEMENT', body:
        'Ryan has scored higher on ' + p.ryanHigherCount + ' specimens; Devin on ' + p.devinHigherCount +
        '. The auditors disagree constantly and symmetrically, which the Office finds almost elegant.' }; });

  R('gen-median-vs-mean-ryan', 'generosity', { a: 6, pr: 4 },
    function (m) { var a = m.auditors.ryan; return num(a.scores.mean) && num(a.scores.median) && Math.abs(a.scores.mean - a.scores.median) >= 0.3; },
    function (m, H) { var a = m.auditors.ryan;
      return { title: 'DISTRIBUTIONAL SKEW', body:
        "Ryan's mean score is " + H.n2(a.scores.mean) + ' but his median is ' + H.n1(a.scores.median) +
        '. A handful of unusual ratings are dragging the average around.' }; });

  R('gen-median-vs-mean-devin', 'generosity', { a: 6, pr: 4 },
    function (m) { var a = m.auditors.devin; return num(a.scores.mean) && num(a.scores.median) && Math.abs(a.scores.mean - a.scores.median) >= 0.3; },
    function (m, H) { var a = m.auditors.devin;
      return { title: 'DISTRIBUTIONAL SKEW', body:
        "Devin's mean (" + H.n2(a.scores.mean) + ') and median (' + H.n1(a.scores.median) +
        ') have separated. Somewhere in the register there is an outlier doing a great deal of work.' }; });

  R('gen-highest-single-audit', 'generosity', { c: 3, pr: 5 },
    function (m) { return m.paired.n >= 3 && (gt(m.auditors.ryan.weighted.max, 9.2) || gt(m.auditors.devin.weighted.max, 9.2)); },
    function (m, H) {
      var who = (m.auditors.ryan.weighted.max || 0) >= (m.auditors.devin.weighted.max || 0) ? 'ryan' : 'devin';
      var a = m.auditors[who];
      return { title: 'PEAK ENTHUSIASM RECORDED', body:
        H.name(who) + "'s highest weighted audit stands at " + H.n2(a.weighted.max) + ', awarded to ' + H.spec(a.top) +
        '. No hamburger has moved him further.' }; });

  R('gen-lowest-single-audit', 'generosity', { c: 3, pr: 5 },
    function (m) { return m.paired.n >= 3 && (lt(m.auditors.ryan.weighted.min, 6.0) || lt(m.auditors.devin.weighted.min, 6.0)); },
    function (m, H) {
      var rMin = m.auditors.ryan.weighted.min, dMin = m.auditors.devin.weighted.min;
      var who = (rMin == null ? 99 : rMin) <= (dMin == null ? 99 : dMin) ? 'ryan' : 'devin';
      var a = m.auditors[who];
      return { title: 'MINIMUM ON RECORD', body:
        H.name(who) + ' issued a weighted score of ' + H.n2(a.weighted.min) + ' to ' + H.spec(a.bottom) +
        '. The Bureau has archived the filing under "Grievances".' }; });

  R('gen-narrow-personal-range', 'generosity', { a: 6, pr: 6 },
    function (m) { return lt(m.auditors.ryan.weighted.range, 1.2) || lt(m.auditors.devin.weighted.range, 1.2); },
    function (m, H) {
      var rr = m.auditors.ryan.weighted.range, dr = m.auditors.devin.weighted.range;
      var who = (rr == null ? 99 : rr) <= (dr == null ? 99 : dr) ? 'ryan' : 'devin';
      return { title: 'SCALE UTILIZATION REVIEW', body:
        'Every weighted score ' + H.name(who) + ' has ever issued falls within a ' + H.n2(m.auditors[who].weighted.range) +
        '-point band. The Bureau has provided him a scale of ten and he is using rather less of it.' }; });

  R('gen-wide-personal-range', 'generosity', { a: 6, pr: 6 },
    function (m) { return gt(m.auditors.ryan.weighted.range, 3.5) || gt(m.auditors.devin.weighted.range, 3.5); },
    function (m, H) {
      var rr = m.auditors.ryan.weighted.range || 0, dr = m.auditors.devin.weighted.range || 0;
      var who = rr >= dr ? 'ryan' : 'devin';
      return { title: 'FULL-SPECTRUM AUDITING', body:
        H.name(who) + "'s weighted scores span " + H.n2(m.auditors[who].weighted.range) +
        ' points, from ' + H.n1(m.auditors[who].weighted.min) + ' to ' + H.n1(m.auditors[who].weighted.max) +
        '. He is either highly discriminating or highly suggestible.' }; });

  R('gen-generous-but-consistent', 'generosity', { c: 6, pr: 6, r: 'uncommon' },
    function (m) {
      var g = gen(m); if (!g) return false;
      var a = m.auditors[g];
      return gt(Math.abs(m.paired.gap), 0.3) && lt(a.weighted.sd, 0.6);
    },
    function (m, H) { var g = gen(m);
      return { title: 'RELIABLE OPTIMISM', body:
        H.name(g) + ' is both the more generous auditor and the more consistent one (standard deviation ' +
        H.n2(m.auditors[g].weighted.sd) + '). He is wrong in a very dependable way.' }; });

  R('gen-harsh-and-volatile', 'generosity', { c: 6, pr: 6, r: 'uncommon' },
    function (m) {
      var h = harsh(m); if (!m.paired.moreGenerous) return false;
      var a = m.auditors[h];
      return gt(Math.abs(m.paired.gap), 0.3) && gt(a.weighted.sd, 0.9);
    },
    function (m, H) { var h = harsh(m);
      return { title: 'UNSTABLE SEVERITY', body:
        H.name(h) + ' is the harsher auditor and also the more erratic one (standard deviation ' +
        H.n2(m.auditors[h].weighted.sd) + '). His disapproval arrives without warning.' }; });

  R('gen-cpi-mean-high', 'generosity', { c: 5, pr: 5 },
    function (m) { return gt(m.paired.cpi.mean, 85); },
    function (m, H) { return { title: 'REGISTER-WIDE INFLATION', body:
      'The mean Composite Patty Index across ' + m.paired.n + ' certified specimens is ' + H.n1(m.paired.cpi.mean) +
      '. On a 0–100 scale, this Bureau has apparently never encountered a bad hamburger.' }; });

  R('gen-cpi-mean-low', 'generosity', { c: 5, pr: 5 },
    function (m) { return lt(m.paired.cpi.mean, 68); },
    function (m, H) { return { title: 'REGISTER-WIDE PESSIMISM', body:
      'Mean CPI stands at ' + H.n1(m.paired.cpi.mean) + ' across ' + m.paired.n +
      ' specimens. The auditors continue to eat hamburgers voluntarily, which complicates the analysis.' }; });

  R('gen-pending-generosity-note', 'generosity', { a: 3, p: 1, pr: 4 },
    function (m) {
      var r = m.auditors.ryan, d = m.auditors.devin;
      return m.counts.pending >= 1 && r.n >= 3 && d.n >= 3 && num(r.scores.mean) && num(d.scores.mean);
    },
    function (m, H) {
      var r = m.auditors.ryan, d = m.auditors.devin;
      var who = r.scores.mean > d.scores.mean ? 'ryan' : 'devin';
      return { title: 'UNMATCHED DATA CAUTION', body:
        'Across all filed audits — including specimens still awaiting peer review — ' + H.name(who) +
        ' averages higher. The Office stresses that these datasets are not paired and has published the comparison anyway.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 3 — CATEGORY BIAS ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;

  function cd(m, c) { return m.paired.byCategory[c]; }
  function leader(m, c) { return cd(m, c).delta > 0 ? 'ryan' : 'devin'; }

  /* --- one differential rule per category, each with its own voice --- */
  R('cat-patty-differential', 'category-bias', { c: 4, pr: 8 },
    function (m) { return gt(Math.abs(cd(m, 'patty').delta), 0.35); },
    function (m, H) { var c = cd(m, 'patty'), w = leader(m, 'patty');
      return { title: 'PATTY DIVERGENCE', body:
        H.name(w) + ' rates Patty ' + H.abs2(c.delta) + ' points above ' + H.other(w) +
        ' on average. Since Patty carries 30% of the Index, this single disagreement is quietly reshaping the entire register.' }; },
    function (m, H) { var c = cd(m, 'patty'), w = leader(m, 'patty');
      return { title: 'CORE COMPONENT DISPUTE', body:
        'Mean Patty scores: ' + H.name('ryan') + ' ' + H.n2(c.ryanMean) + ', ' + H.name('devin') + ' ' + H.n2(c.devinMean) +
        '. The auditors disagree most about the part of the hamburger that is the hamburger.' }; });

  R('cat-flavor-differential', 'category-bias', { c: 4, pr: 7 },
    function (m) { return gt(Math.abs(cd(m, 'overallFlavor').delta), 0.35); },
    function (m, H) { var c = cd(m, 'overallFlavor'), w = leader(m, 'overallFlavor');
      return { title: 'FLAVOR ASSESSMENT CONFLICT', body:
        H.name(w) + ' consistently rates Overall Flavor ' + H.abs2(c.delta) + ' points higher. As Overall Flavor is 25% of the Index, ' +
        H.other(w) + ' is effectively arguing against the outcome every time he eats.' }; });

  R('cat-bun-differential', 'category-bias', { c: 4, pr: 7 },
    function (m) { return gt(Math.abs(cd(m, 'bun').delta), 0.35); },
    function (m, H) { var c = cd(m, 'bun'), w = leader(m, 'bun');
      return { title: 'BUN-RELATED DIPLOMATIC INCIDENT', body:
        H.name(w) + ' rates Bun ' + H.abs2(c.delta) + ' points above ' + H.other(w) +
        '. Negotiations have not progressed.' }; },
    function (m, H) { var c = cd(m, 'bun');
      return { title: 'STRUCTURAL DISAGREEMENT', body:
        'Bun means stand at ' + H.n2(c.ryanMean) + ' (Ryan) and ' + H.n2(c.devinMean) +
        ' (Devin). One of these men has opinions about bread that the other cannot access.' }; });

  R('cat-fries-differential', 'category-bias', { c: 4, pr: 7 },
    function (m) { return gt(Math.abs(cd(m, 'fries').delta), 0.4); },
    function (m, H) { var c = cd(m, 'fries'), w = leader(m, 'fries');
      return { title: 'ACCOMPANIMENT DISPUTE', body:
        H.name(w) + ' scores Fries ' + H.abs2(c.delta) + ' points higher than ' + H.other(w) +
        '. The Bureau reminds both auditors that Fries carry only 10% of the Index and that this has never calmed anyone.' }; });

  R('cat-value-differential', 'category-bias', { c: 4, pr: 7 },
    function (m) { return gt(Math.abs(cd(m, 'value').delta), 0.4); },
    function (m, H) { var c = cd(m, 'value'), w = leader(m, 'value');
      return { title: 'ECONOMIC DISAGREEMENT', body:
        H.name(w) + ' assesses Value ' + H.abs2(c.delta) + ' points more favourably than ' + H.other(w) +
        '. The Office cannot determine whether this reflects economics or temperament, and suspects income.' }; });

  R('cat-condiments-differential', 'category-bias', { c: 4, pr: 7 },
    function (m) { return gt(Math.abs(cd(m, 'condiments').delta), 0.4); },
    function (m, H) { var c = cd(m, 'condiments'), w = leader(m, 'condiments');
      return { title: 'CONDIMENT-RELATED OFFENCE', body:
        H.name(w) + ' rates Condiments / Toppings ' + H.abs2(c.delta) + ' points above ' + H.other(w) +
        '. The Bureau has documented this under statutes that do not exist.' }; });

  /* --- most / least contested --- */
  R('cat-most-contested', 'category-bias', { c: 4, pr: 8, x: 'contested' },
    function (m) { return m.paired.mostContestedCat && gt(m.paired.mostContestedVal, 0.4); },
    function (m, H) { var c = m.paired.mostContestedCat;
      return { title: 'PERSISTENT CATEGORY DISPUTE', body:
        'Ryan and Devin disagree on ' + H.cat(c) + ' more than any other category. Mean variance: ' +
        H.n2(m.paired.mostContestedVal) + ' points. Negotiations have not progressed.' }; },
    function (m, H) { var c = m.paired.mostContestedCat;
      return { title: 'CATEGORY UNDER REVIEW', body:
        H.cat(c) + ' is the register\'s most contested attribute, averaging ' + H.n2(m.paired.mostContestedVal) +
        ' points of separation. The Office has recommended the auditors stop discussing it. They were not discussing it.' }; });

  R('cat-least-contested', 'category-bias', { c: 4, pr: 6, x: 'contested' },
    function (m) { return m.paired.leastContestedCat && lt(m.paired.leastContestedVal, 0.25); },
    function (m, H) { var c = m.paired.leastContestedCat;
      return { title: 'AREA OF AGREEMENT', body:
        'On ' + H.cat(c) + ' the auditors are within ' + H.n2(m.paired.leastContestedVal) +
        ' points on average. The Bureau has designated this the one safe topic.' }; });

  /* --- per-auditor favourite / least favourite category --- */
  R('cat-ryan-favourite', 'category-bias', { a: 4, pr: 6 },
    function (m) { return m.auditors.ryan.bestCat && gt(m.auditors.ryan.bestCatMean - m.auditors.ryan.scores.mean, 0.4); },
    function (m, H) { var a = m.auditors.ryan;
      return { title: 'CATEGORY SPECIALIZATION', body:
        'Ryan rates ' + H.cat(a.bestCat) + ' at ' + H.n2(a.bestCatMean) + ', well above his overall mean of ' +
        H.n2(a.scores.mean) + '. The Bureau has noted a preference and intends to hold it against him.' }; });

  R('cat-devin-favourite', 'category-bias', { a: 4, pr: 6 },
    function (m) { return m.auditors.devin.bestCat && gt(m.auditors.devin.bestCatMean - m.auditors.devin.scores.mean, 0.4); },
    function (m, H) { var a = m.auditors.devin;
      return { title: 'CATEGORY SPECIALIZATION', body:
        'Devin is at his most generous on ' + H.cat(a.bestCat) + ' (' + H.n2(a.bestCatMean) +
        ' against an overall mean of ' + H.n2(a.scores.mean) + '). Everyone has a weakness.' }; });

  R('cat-ryan-harshest', 'category-bias', { a: 4, pr: 6 },
    function (m) { return m.auditors.ryan.worstCat && gt(m.auditors.ryan.scores.mean - m.auditors.ryan.worstCatMean, 0.4); },
    function (m, H) { var a = m.auditors.ryan;
      return { title: 'AREA OF SEVERITY', body:
        'Ryan is harshest on ' + H.cat(a.worstCat) + ', averaging ' + H.n2(a.worstCatMean) +
        ' against his overall ' + H.n2(a.scores.mean) + '. Something happened once and he has not let it go.' }; });

  R('cat-devin-harshest', 'category-bias', { a: 4, pr: 6 },
    function (m) { return m.auditors.devin.worstCat && gt(m.auditors.devin.scores.mean - m.auditors.devin.worstCatMean, 0.4); },
    function (m, H) { var a = m.auditors.devin;
      return { title: 'AREA OF SEVERITY', body:
        'Devin reserves his lowest marks for ' + H.cat(a.worstCat) + ' (mean ' + H.n2(a.worstCatMean) +
        '). The Office has declined to ask why.' }; });

  R('cat-same-favourite', 'category-bias', { c: 4, pr: 6, r: 'uncommon' },
    function (m) { return m.auditors.ryan.bestCat && m.auditors.ryan.bestCat === m.auditors.devin.bestCat; },
    function (m, H) { var c = m.auditors.ryan.bestCat;
      return { title: 'SHARED ENTHUSIASM', body:
        'Both auditors rate ' + H.cat(c) + ' more highly than any other category. A rare instance of the Bureau speaking with one voice.' }; });

  R('cat-same-harshest', 'category-bias', { c: 4, pr: 6, r: 'uncommon' },
    function (m) { return m.auditors.ryan.worstCat && m.auditors.ryan.worstCat === m.auditors.devin.worstCat; },
    function (m, H) { var c = m.auditors.ryan.worstCat;
      return { title: 'SHARED GRIEVANCE', body:
        'Both auditors rate ' + H.cat(c) + ' lowest of all categories. The Office has forwarded this finding to no one in particular.' }; });

  R('cat-opposite-preferences', 'category-bias', { c: 5, pr: 8, r: 'rare' },
    function (m) {
      var r = m.auditors.ryan, d = m.auditors.devin;
      return r.bestCat && d.worstCat && r.bestCat === d.worstCat;
    },
    function (m, H) { var c = m.auditors.ryan.bestCat;
      return { title: 'IRRECONCILABLE POSITIONS', body:
        H.cat(c) + ' is the category Ryan rates most highly and the one Devin rates lowest. ' +
        'The Bureau has stopped treating this as a data problem and started treating it as a personality one.' }; },
    function (m, H) { var c = m.auditors.ryan.bestCat;
      return { title: 'FORMAL INCOMPATIBILITY NOTICE', body:
        'Ryan\'s favourite category is ' + H.cat(c) + '. Devin\'s least favourite category is ' + H.cat(c) +
        '. No mediation is scheduled.' }; });

  R('cat-opposite-preferences-reverse', 'category-bias', { c: 5, pr: 8, r: 'rare' },
    function (m) {
      var r = m.auditors.ryan, d = m.auditors.devin;
      return d.bestCat && r.worstCat && d.bestCat === r.worstCat;
    },
    function (m, H) { var c = m.auditors.devin.bestCat;
      return { title: 'IRRECONCILABLE POSITIONS', body:
        'Devin rates ' + H.cat(c) + ' higher than any other category. Ryan rates it lower than any other category. ' +
        'The Office regards the pairing of these two auditors as an ongoing experiment.' }; });

  /* --- register-wide category standing --- */
  R('cat-register-strongest', 'category-bias', { c: 4, pr: 6, x: 'register-cat' },
    function (m) { return m.strongestCat && num(m.categoryBoard[m.strongestCat].mean); },
    function (m, H) { var c = m.strongestCat, b = m.categoryBoard[c];
      return { title: 'SECTOR PERFORMANCE REVIEW', body:
        H.cat(c) + ' is the strongest sector in the register, averaging ' + H.n1(b.mean) +
        ' across ' + m.paired.n + ' certified specimens. The Bureau attributes this to competence somewhere in the supply chain.' }; });

  R('cat-register-weakest', 'category-bias', { c: 4, pr: 7, x: 'register-cat' },
    function (m) { return m.weakestCat && num(m.categoryBoard[m.weakestCat].mean); },
    function (m, H) { var c = m.weakestCat, b = m.categoryBoard[c];
      return { title: 'SECTOR DEFICIENCY', body:
        H.cat(c) + ' is the weakest category in the entire register at ' + H.n1(b.mean) +
        '. The Office has drafted a strongly worded letter addressed to the concept of ' + H.lcat(c) + '.' }; },
    function (m, H) { var c = m.weakestCat, b = m.categoryBoard[c];
      return { title: 'SYSTEMIC UNDERPERFORMANCE', body:
        'Across every certified specimen, ' + H.cat(c) + ' averages ' + H.n1(b.mean) +
        ' — lower than any other attribute. This is no longer a run of bad luck. It is an industry.' }; });

  R('cat-fries-hostility', 'category-bias', { c: 5, pr: 7 },
    function (m) { return num(m.categoryBoard.fries.mean) && num(m.paired.cpi.mean) && m.categoryBoard.fries.mean < (m.paired.cpi.mean / 10) - 0.6; },
    function (m, H) {
      return { title: 'FRY EMERGENCY', body:
        'Mean Fries score across the register: ' + H.n1(m.categoryBoard.fries.mean) +
        ', substantially below the equivalent overall standard. Either the region cannot fry, or this Bureau cannot be pleased.' }; });

  R('cat-value-skepticism', 'category-bias', { c: 5, pr: 6 },
    function (m) { return num(m.categoryBoard.value.mean) && num(m.paired.cpi.mean) && m.categoryBoard.value.mean < (m.paired.cpi.mean / 10) - 0.5; },
    function (m, H) { return { title: 'VALUE SKEPTICISM DETECTED', body:
      'Value averages ' + H.n1(m.categoryBoard.value.mean) + ' register-wide, below the general standard. ' +
      'Both auditors appear to enjoy the hamburgers and resent paying for them.' }; });

  R('cat-bun-obsession', 'category-bias', { c: 5, pr: 6 },
    function (m) { return num(m.categoryBoard.bun.mean) && num(m.categoryBoard.patty.mean) && m.categoryBoard.bun.mean > m.categoryBoard.patty.mean; },
    function (m, H) { return { title: 'STRUCTURAL PRIORITY INVERSION', body:
      'Register-wide, Bun (' + H.n1(m.categoryBoard.bun.mean) + ') outscores Patty (' + H.n1(m.categoryBoard.patty.mean) +
      '). The Bureau weights Patty at 30% and Bun at 15% precisely to prevent this, and it has happened anyway.' }; });

  R('cat-condiment-generosity', 'category-bias', { c: 5, pr: 5 },
    function (m) { return num(m.categoryBoard.condiments.mean) && num(m.categoryBoard.patty.mean) && m.categoryBoard.condiments.mean > m.categoryBoard.patty.mean + 0.3; },
    function (m, H) { return { title: 'TOPPINGS OVERPERFORMANCE', body:
      'Condiments / Toppings average ' + H.n1(m.categoryBoard.condiments.mean) + ', ahead of Patty at ' +
      H.n1(m.categoryBoard.patty.mean) + '. The auditors are being won over by garnish and the Bureau finds this undignified.' }; });

  R('cat-patty-dominant', 'category-bias', { c: 5, pr: 6 },
    function (m) {
      if (!num(m.categoryBoard.patty.mean)) return false;
      return K.every(function (c) { return c === 'patty' || m.categoryBoard.patty.mean >= m.categoryBoard[c].mean; });
    },
    function (m, H) { return { title: 'CORRECT PRIORITIES CONFIRMED', body:
      'Patty is the highest-scoring category in the register at ' + H.n1(m.categoryBoard.patty.mean) +
      '. The Bureau notes with relief that the hamburgers are, at least, mostly about the meat.' }; });

  R('cat-widest-category-spread', 'category-bias', { c: 5, pr: 5 },
    function (m) {
      var vals = K.map(function (c) { return m.categoryBoard[c].mean; }).filter(num);
      return vals.length === K.length && (Math.max.apply(null, vals) - Math.min.apply(null, vals)) >= 1.5;
    },
    function (m, H) {
      var vals = K.map(function (c) { return m.categoryBoard[c].mean; });
      var spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      return { title: 'UNEVEN SECTOR DEVELOPMENT', body:
        'The gap between the register\'s strongest category (' + H.cat(m.strongestCat) + ') and its weakest (' +
        H.cat(m.weakestCat) + ') is ' + H.n1(spread) + ' points. Hamburgers are not improving uniformly.' }; });

  R('cat-all-categories-close', 'category-bias', { c: 6, pr: 6, r: 'uncommon' },
    function (m) {
      var vals = K.map(function (c) { return m.categoryBoard[c].mean; }).filter(num);
      return vals.length === K.length && (Math.max.apply(null, vals) - Math.min.apply(null, vals)) < 0.5;
    },
    function (m, H) { return { title: 'SUSPICIOUS UNIFORMITY', body:
      'All six category means fall within half a point of each other. Either the region\'s hamburgers are extraordinarily balanced, or the auditors are scoring the general vibe six times.' }; });

  R('cat-ryan-category-sd', 'category-bias', { a: 5, pr: 5 },
    function (m) { return m.auditors.ryan.swingiestCat && gt(m.auditors.ryan.swingiestCatSd, 1.2); },
    function (m, H) { var a = m.auditors.ryan;
      return { title: 'CATEGORY VOLATILITY', body:
        "Ryan's " + H.cat(a.swingiestCat) + ' scores vary more than any of his other categories (standard deviation ' +
        H.n2(a.swingiestCatSd) + '). His opinion on ' + H.lcat(a.swingiestCat) + ' is entirely situational.' }; });

  R('cat-devin-category-sd', 'category-bias', { a: 5, pr: 5 },
    function (m) { return m.auditors.devin.swingiestCat && gt(m.auditors.devin.swingiestCatSd, 1.2); },
    function (m, H) { var a = m.auditors.devin;
      return { title: 'CATEGORY VOLATILITY', body:
        'Devin\'s ' + H.cat(a.swingiestCat) + ' ratings swing more than any other category he assesses (SD ' +
        H.n2(a.swingiestCatSd) + '). Consistency has been achieved everywhere else.' }; });

  R('cat-ryan-steady-category', 'category-bias', { a: 5, pr: 4 },
    function (m) { return m.auditors.ryan.steadiestCat && lt(m.auditors.ryan.steadiestCatSd, 0.5); },
    function (m, H) { var a = m.auditors.ryan;
      return { title: 'PROCEDURAL CONSISTENCY', body:
        'Ryan\'s ' + H.cat(a.steadiestCat) + ' scores vary by a standard deviation of only ' + H.n2(a.steadiestCatSd) +
        '. He has decided what ' + H.lcat(a.steadiestCat) + ' is worth and will not be moved.' }; });

  R('cat-devin-steady-category', 'category-bias', { a: 5, pr: 4 },
    function (m) { return m.auditors.devin.steadiestCat && lt(m.auditors.devin.steadiestCatSd, 0.5); },
    function (m, H) { var a = m.auditors.devin;
      return { title: 'PROCEDURAL CONSISTENCY', body:
        'Devin has issued ' + H.cat(a.steadiestCat) + ' scores within a standard deviation of ' + H.n2(a.steadiestCatSd) +
        '. The Bureau commends the discipline and questions the curiosity.' }; });

  R('cat-correlation-negative', 'category-bias', { c: 6, pr: 8, r: 'rare' },
    function (m) {
      return K.some(function (c) { return lt(m.paired.byCategory[c].correlation, -0.3); });
    },
    function (m, H) {
      var c = K.filter(function (k) { return lt(m.paired.byCategory[k].correlation, -0.3); })[0];
      return { title: 'INVERSE CORRELATION ALERT', body:
        'On ' + H.cat(c) + ', Ryan\'s and Devin\'s scores are negatively correlated (r = ' + H.n2(m.paired.byCategory[c].correlation) +
        '). When one goes up, the other goes down. This is not a disagreement; it is a mirror.' }; });

  R('cat-correlation-strong', 'category-bias', { c: 6, pr: 5 },
    function (m) { return K.some(function (c) { return gt(m.paired.byCategory[c].correlation, 0.85); }); },
    function (m, H) {
      var c = K.filter(function (k) { return gt(m.paired.byCategory[k].correlation, 0.85); })[0];
      return { title: 'SECTOR CONSENSUS', body:
        'Ryan and Devin\'s ' + H.cat(c) + ' scores correlate at r = ' + H.n2(m.paired.byCategory[c].correlation) +
        '. On this one attribute, the Bureau appears to contain a single opinion in two bodies.' }; });

  R('cat-patty-fries-inverse', 'category-bias', { c: 6, pr: 7, r: 'uncommon' },
    function (m) {
      var p = m.certified.map(function (v) { return v.combined.patty; });
      var f = m.certified.map(function (v) { return v.combined.fries; });
      var r = m.stats.correlation(p, f);
      return lt(r, -0.35);
    },
    function (m, H) {
      var p = m.certified.map(function (v) { return v.combined.patty; });
      var f = m.certified.map(function (v) { return v.combined.fries; });
      return { title: 'KITCHEN CAPACITY THEORY', body:
        'Across the register, Patty and Fries scores are inversely correlated (r = ' + H.n2(m.stats.correlation(p, f)) +
        '). The Bureau proposes that no kitchen can do both and has no evidence beyond this.' }; });

  R('cat-value-flavor-inverse', 'category-bias', { c: 6, pr: 6, r: 'uncommon' },
    function (m) {
      var a = m.certified.map(function (v) { return v.combined.value; });
      var b = m.certified.map(function (v) { return v.combined.overallFlavor; });
      return lt(m.stats.correlation(a, b), -0.3);
    },
    function (m, H) {
      var a = m.certified.map(function (v) { return v.combined.value; });
      var b = m.certified.map(function (v) { return v.combined.overallFlavor; });
      return { title: 'ECONOMIC LAW DISCOVERED', body:
        'Value and Overall Flavor are inversely correlated across the register (r = ' + H.n2(m.stats.correlation(a, b)) +
        '). The better it tastes, the worse the deal. The Bureau considers this the first genuine finding it has ever produced.' }; });

  R('cat-bun-patty-linked', 'category-bias', { c: 6, pr: 5 },
    function (m) {
      var a = m.certified.map(function (v) { return v.combined.bun; });
      var b = m.certified.map(function (v) { return v.combined.patty; });
      return gt(m.stats.correlation(a, b), 0.7);
    },
    function (m, H) {
      var a = m.certified.map(function (v) { return v.combined.bun; });
      var b = m.certified.map(function (v) { return v.combined.patty; });
      return { title: 'ESTABLISHMENT COMPETENCE INDEX', body:
        'Bun and Patty scores correlate at r = ' + H.n2(m.stats.correlation(a, b)) +
        '. Kitchens that can cook meat also appear able to buy bread. The Bureau finds this unremarkable and has published it.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 4 — DISAGREEMENT ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;

  R('dis-mean-very-high', 'disagreement', { c: 4, pr: 9, x: 'mean-disagreement' },
    function (m) { return gt(m.paired.meanAbsDisagreement, 0.9); },
    function (m, H) { return { title: 'AUDIT INTEGRITY WARNING', body:
      'Mean category disagreement across the register is ' + H.n2(m.paired.meanAbsDisagreement) +
      ' points. At this level the Bureau can no longer claim its two auditors are measuring the same object.' }; },
    function (m, H) { return { title: 'CALIBRATION BREAKDOWN', body:
      'Ryan and Devin differ by an average of ' + H.n2(m.paired.meanAbsDisagreement) +
      ' points per category. The Office has proposed joint training and been ignored twice.' }; });

  R('dis-mean-high', 'disagreement', { c: 4, pr: 7, x: 'mean-disagreement' },
    function (m) { return gt(m.paired.meanAbsDisagreement, 0.55) && !gt(m.paired.meanAbsDisagreement, 0.9); },
    function (m, H) { return { title: 'ELEVATED DISAGREEMENT', body:
      'Mean absolute category disagreement: ' + H.n2(m.paired.meanAbsDisagreement) +
      ' points across ' + m.paired.n + ' certified specimens. Within the range the Bureau describes as "spirited".' }; });

  R('dis-mean-low', 'disagreement', { c: 4, pr: 7, x: 'mean-disagreement' },
    function (m) { return lt(m.paired.meanAbsDisagreement, 0.25); },
    function (m, H) { return { title: 'COLLUSION REVIEW', body:
      'Mean category disagreement is only ' + H.n2(m.paired.meanAbsDisagreement) +
      ' points. Two independent auditors should not agree this closely. The Office is obliged to raise the possibility of conferring.' }; },
    function (m, H) { return { title: 'COMMENDATION FOR CONCORDANCE', body:
      'Across ' + m.paired.n + ' specimens the auditors differ by an average of ' + H.n2(m.paired.meanAbsDisagreement) +
      ' points. Exemplary calibration, or a shared inability to taste anything unusual.' }; });

  R('dis-biggest-cell-ever', 'disagreement', { c: 3, pr: 8 },
    function (m) { return m.paired.biggestCellDisagreement && gt(m.paired.biggestCellValue, 1.5); },
    function (m, H) { var v = m.paired.biggestCellDisagreement, c = v.maxAbsDeltaCat;
      var hi = Number(v.scores.ryan[c]) > Number(v.scores.devin[c]) ? 'ryan' : 'devin';
      return { title: 'LARGEST RECORDED DISPUTE', body:
        'On ' + H.spec(v) + ', the auditors differ by ' + H.n1(v.maxAbsDelta) + ' points on ' + H.cat(c) +
        ' — ' + H.name(hi) + ' ' + H.n1(v.scores[hi][c]) + ', ' + H.other(hi) + ' ' + H.n1(v.scores[S.otherAuditor(hi)][c]) +
        '. This remains the widest single gap in Bureau history.' }; });

  R('dis-biggest-weighted', 'disagreement', { c: 3, pr: 8 },
    function (m) { return m.paired.biggestWeightedDisagreement && gt(m.paired.biggestWeightedValue, 1.0); },
    function (m, H) { var v = m.paired.biggestWeightedDisagreement;
      var hi = v.weightedDelta > 0 ? 'ryan' : 'devin';
      return { title: 'MOST CONTROVERSIAL SPECIMEN', body:
        H.spec(v) + ' divides the Bureau more than any other filing: ' + H.name(hi) + ' rated it ' +
        H.abs2(v.weightedDelta) + ' points higher than ' + H.other(hi) + '. Both men were present at the same table.' }; },
    function (m, H) { var v = m.paired.biggestWeightedDisagreement;
      return { title: 'SPECIMEN UNDER DISPUTE', body:
        'Specimen ' + v.specimen + ' carries the register\'s widest weighted disagreement at ' + H.abs2(v.weightedDelta) +
        ' points. Its Composite Patty Index of ' + H.cpi(v) + ' is therefore a compromise nobody endorses.' }; });

  R('dis-strongest-consensus', 'disagreement', { c: 4, pr: 6 },
    function (m) { return m.paired.closestSpecimen && lt(m.paired.closestValue, 0.15); },
    function (m, H) { var v = m.paired.closestSpecimen;
      return { title: 'STRONGEST CONSENSUS', body:
        'The auditors agree most completely on ' + H.spec(v) + ', separated by ' + H.abs2(v.weightedDelta) +
        ' points. The Bureau regards this specimen as settled law.' }; });

  R('dis-exact-agreement-rate-high', 'disagreement', { c: 4, pr: 7 },
    function (m) { return gt(m.paired.exactPct, 25); },
    function (m, H) { return { title: 'IDENTICAL SCORING REVIEW', body:
      'Ryan and Devin have entered the exact same number in ' + H.pct(m.paired.exactPct) + ' of all category cells (' +
      m.paired.exactCells + ' of ' + m.paired.totalCells + '). Independent auditing is meant to look messier than this.' }; });

  R('dis-exact-agreement-rate-low', 'disagreement', { c: 5, pr: 5 },
    function (m) { return num(m.paired.exactPct) && m.paired.exactPct < 6 && m.paired.totalCells >= 30; },
    function (m, H) { return { title: 'ABSENCE OF CONCURRENCE', body:
      'In ' + m.paired.totalCells + ' opportunities, the auditors have written down the same number only ' +
      m.paired.exactCells + ' ' + H.plural(m.paired.exactCells, 'time') + ' (' + H.pct(m.paired.exactPct) + '). ' +
      'They are examining identical hamburgers under identical conditions.' }; });

  R('dis-near-agreement-high', 'disagreement', { c: 4, pr: 5 },
    function (m) { return gt(m.paired.nearPct, 55); },
    function (m, H) { return { title: 'BROAD ALIGNMENT', body:
      H.pct(m.paired.nearPct) + ' of category scores fall within 0.2 points of each other. The disagreements are real but small, which the Bureau finds far less interesting.' }; });

  R('dis-category-specific-worst', 'disagreement', { c: 5, pr: 7 },
    function (m) { return m.paired.mostContestedCat && gt(m.paired.byCategory[m.paired.mostContestedCat].maxAbs, 2.0); },
    function (m, H) { var c = m.paired.mostContestedCat, b = m.paired.byCategory[c];
      return { title: 'CATEGORY CRISIS', body:
        H.cat(c) + ' has produced a single disagreement of ' + H.n1(b.maxAbs) + ' points and averages ' +
        H.n2(b.meanAbs) + '. The Office has recommended removing the category and been overruled by itself.' }; });

  R('dis-all-categories-contested', 'disagreement', { c: 5, pr: 7, r: 'uncommon' },
    function (m) { return K.every(function (c) { return gt(m.paired.byCategory[c].meanAbs, 0.4); }); },
    function (m, H) { return { title: 'COMPREHENSIVE DISCORD', body:
      'Every one of the six categories shows a mean disagreement above 0.4 points. There is no attribute of a hamburger on which these two men can be relied upon to concur.' }; });

  R('dis-one-category-peaceful', 'disagreement', { c: 5, pr: 6, r: 'uncommon' },
    function (m) {
      var quiet = K.filter(function (c) { return lt(m.paired.byCategory[c].meanAbs, 0.2); });
      var loud = K.filter(function (c) { return gt(m.paired.byCategory[c].meanAbs, 0.5); });
      return quiet.length === 1 && loud.length >= 2;
    },
    function (m, H) {
      var quiet = K.filter(function (c) { return lt(m.paired.byCategory[c].meanAbs, 0.2); })[0];
      return { title: 'SINGLE POINT OF ACCORD', body:
        'Amid widespread disagreement, ' + H.cat(quiet) + ' remains the one category where Ryan and Devin reliably align (' +
        H.n2(m.paired.byCategory[quiet].meanAbs) + ' points apart). The Bureau has designated it neutral territory.' }; });

  R('dis-streak-current', 'disagreement', { c: 4, pr: 8 },
    function (m) { return m.paired.streaks.disagreement.current >= 3; },
    function (m, H) { var n = m.paired.streaks.disagreement.current;
      return { title: 'ESCALATING DISPUTE', body:
        'The last ' + n + ' certified specimens have each produced mean disagreement of 0.7 points or more. ' +
        'The Office is monitoring the relationship as much as the data.' }; });

  R('dis-streak-longest', 'disagreement', { c: 6, pr: 6 },
    function (m) { return m.paired.streaks.disagreement.longest >= 4 && m.paired.streaks.disagreement.current < m.paired.streaks.disagreement.longest; },
    function (m, H) { var s = m.paired.streaks.disagreement;
      return { title: 'HISTORICAL DISPUTE PERIOD', body:
        'The register\'s longest run of high-disagreement specimens reached ' + s.longest +
        ' consecutive filings. Relations have since improved, or the hamburgers have become less interesting.' }; });

  R('dis-agreement-streak', 'disagreement', { c: 4, pr: 7 },
    function (m) { return m.paired.streaks.agreement.current >= 3; },
    function (m, H) { var n = m.paired.streaks.agreement.current;
      return { title: 'SUSTAINED CONCORDANCE', body:
        'The auditors have now agreed closely on ' + n + ' consecutive specimens (mean disagreement under 0.3). ' +
        'The Bureau is pleased and faintly suspicious.' }; });

  R('dis-controversial-but-highly-ranked', 'disagreement', { c: 5, pr: 8, r: 'uncommon' },
    function (m) {
      var v = m.paired.biggestWeightedDisagreement;
      return v && v.rank != null && v.rank <= 3 && gt(Math.abs(v.weightedDelta), 0.8);
    },
    function (m, H) { var v = m.paired.biggestWeightedDisagreement;
      return { title: 'CONTESTED PODIUM PLACEMENT', body:
        H.spec(v) + ' currently sits at ' + H.ord(v.rank) + ' in the Official Rankings despite being the register\'s most disputed specimen (' +
        H.abs2(v.weightedDelta) + ' points apart). Its position represents the average of two incompatible opinions.' }; });

  R('dis-sweep-recent', 'disagreement', { c: 3, pr: 7 },
    function (m) { return m.paired.streaks.sweeps.current >= 2; },
    function (m, H) { var n = m.paired.streaks.sweeps.current;
      return { title: 'CONSECUTIVE CLEAN SWEEPS', body:
        'On each of the last ' + n + ' specimens, one auditor scored higher in all six categories. ' +
        'The Bureau notes that partial agreement is permitted and apparently unfashionable.' }; });

  R('dis-total-sweeps', 'disagreement', { c: 6, pr: 6 },
    function (m) { return (m.paired.ryanSweeps + m.paired.devinSweeps) >= 4; },
    function (m, H) { var t = m.paired.ryanSweeps + m.paired.devinSweeps;
      return { title: 'SWEEP FREQUENCY REVIEW', body:
        'On ' + t + ' of ' + m.paired.n + ' certified specimens, one auditor out-scored the other in every single category. ' +
        'Ryan: ' + m.paired.ryanSweeps + '. Devin: ' + m.paired.devinSweeps + '.' }; });

  R('dis-no-sweeps', 'disagreement', { c: 6, pr: 5 },
    function (m) { return (m.paired.ryanSweeps + m.paired.devinSweeps) === 0 && m.paired.n >= 6; },
    function (m, H) { return { title: 'ABSENCE OF TOTAL DIVERGENCE', body:
      'Across ' + m.paired.n + ' certified specimens, neither auditor has ever out-scored the other in all six categories at once. ' +
      'Every disagreement so far has been partial, which is the civilised form.' }; });

  R('dis-tie-recorded', 'disagreement', { c: 2, pr: 7, r: 'rare' },
    function (m) { return m.paired.tieCount >= 1; },
    function (m, H) { return { title: 'WEIGHTED DEADLOCK', body:
      H.times(m.paired.tieCount).charAt(0).toUpperCase() + H.times(m.paired.tieCount).slice(1) +
      ' the two auditors have produced identical weighted scores on the same specimen. The Bureau has no tie-breaking procedure and no intention of writing one.' }; });

  R('dis-disagreement-narrowing', 'disagreement', { c: 6, pr: 7 },
    function (m) {
      var v = m.paired.views.map(function (x) { return x.meanAbsDelta; });
      if (v.length < 6) return false;
      var h = Math.floor(v.length / 2);
      var early = m.stats.mean(v.slice(0, h)), late = m.stats.mean(v.slice(-h));
      return num(early) && num(late) && (early - late) > 0.2;
    },
    function (m, H) {
      var v = m.paired.views.map(function (x) { return x.meanAbsDelta; });
      var h = Math.floor(v.length / 2);
      var early = m.stats.mean(v.slice(0, h)), late = m.stats.mean(v.slice(-h));
      return { title: 'CONVERGENCE DETECTED', body:
        'Mean disagreement has fallen from ' + H.n2(early) + ' points in the register\'s early specimens to ' + H.n2(late) +
        ' more recently. The auditors are slowly becoming the same person.' }; });

  R('dis-disagreement-widening', 'disagreement', { c: 6, pr: 7 },
    function (m) {
      var v = m.paired.views.map(function (x) { return x.meanAbsDelta; });
      if (v.length < 6) return false;
      var h = Math.floor(v.length / 2);
      var early = m.stats.mean(v.slice(0, h)), late = m.stats.mean(v.slice(-h));
      return num(early) && num(late) && (late - early) > 0.2;
    },
    function (m, H) {
      var v = m.paired.views.map(function (x) { return x.meanAbsDelta; });
      var h = Math.floor(v.length / 2);
      var early = m.stats.mean(v.slice(0, h)), late = m.stats.mean(v.slice(-h));
      return { title: 'DIVERGENCE OVER TIME', body:
        'Mean disagreement has risen from ' + H.n2(early) + ' to ' + H.n2(late) +
        ' points as the register has grown. Familiarity is not producing consensus.' }; });

  R('dis-flavor-vs-patty-conflict', 'disagreement', { c: 5, pr: 6, r: 'uncommon' },
    function (m) {
      var p = m.paired.byCategory.patty.delta, f = m.paired.byCategory.overallFlavor.delta;
      return num(p) && num(f) && Math.sign(p) !== Math.sign(f) && Math.abs(p) > 0.25 && Math.abs(f) > 0.25;
    },
    function (m, H) {
      var p = m.paired.byCategory.patty.delta;
      var pw = p > 0 ? 'ryan' : 'devin';
      return { title: 'INTERNAL CONTRADICTION', body:
        H.name(pw) + ' rates the Patty higher while ' + H.other(pw) + ' rates the Overall Flavor higher. ' +
        'The Bureau cannot determine where, precisely, either man thinks the flavour is coming from.' }; });

  R('dis-value-conflict', 'disagreement', { c: 5, pr: 6 },
    function (m) { return gt(Math.abs(m.paired.byCategory.value.delta), 0.5); },
    function (m, H) { var d = m.paired.byCategory.value.delta, w = d > 0 ? 'ryan' : 'devin';
      return { title: 'FISCAL DISAGREEMENT', body:
        H.name(w) + ' rates Value ' + H.abs2(d) + ' points higher than ' + H.other(w) +
        ' across the register. One of these men is happier to pay for lunch and the Bureau has a strong suspicion which.' }; });

  R('dis-most-cells-disputed', 'disagreement', { c: 4, pr: 6 },
    function (m) {
      var v = m.paired.views;
      return v.some(function (x) { return x.exactCells === 0 && gt(x.meanAbsDelta, 0.5); });
    },
    function (m, H) {
      var v = m.paired.views.filter(function (x) { return x.exactCells === 0 && gt(x.meanAbsDelta, 0.5); });
      var worst = v[v.length - 1];
      return { title: 'ZERO CONCURRENCE FILING', body:
        'On ' + H.spec(worst) + ', the auditors failed to match on a single one of the six categories, averaging ' +
        H.n2(worst.meanAbsDelta) + ' points apart. A complete absence of common ground.' }; });

  R('dis-perfect-cell-match', 'disagreement', { c: 3, pr: 8, r: 'rare' },
    function (m) { return m.paired.views.some(function (v) { return v.exactCells === K.length; }); },
    function (m, H) {
      var v = m.paired.views.filter(function (x) { return x.exactCells === K.length; })[0];
      return { title: 'IDENTICAL FILING ALERT', body:
        'On ' + H.spec(v) + ', Ryan and Devin submitted six identical category scores. ' +
        'The Bureau is required to note that the audits are meant to be conducted independently.' }; });

  R('dis-half-match', 'disagreement', { c: 3, pr: 5 },
    function (m) { return m.paired.views.some(function (v) { return v.exactCells >= 3 && v.exactCells < K.length; }); },
    function (m, H) {
      var v = m.paired.views.filter(function (x) { return x.exactCells >= 3 && x.exactCells < K.length; }).slice(-1)[0];
      return { title: 'PARTIAL CONCURRENCE', body:
        'On ' + H.spec(v) + ' the auditors matched exactly in ' + v.exactCells + ' of ' + K.length +
        ' categories. Enough agreement to be reassuring, enough disagreement to remain employed.' }; });

  R('dis-rank-correlation-low', 'disagreement', { c: 5, pr: 8 },
    function (m) { return num(m.paired.rankCorrelation) && m.paired.rankCorrelation < 0.4; },
    function (m, H) { return { title: 'RANKING INCOMPATIBILITY', body:
      'The correlation between Ryan\'s ordering and Devin\'s ordering of the register is r = ' + H.n2(m.paired.rankCorrelation) +
      '. The Official Rankings are an average of two substantially different opinions about hamburgers.' }; });

  R('dis-rank-correlation-high', 'disagreement', { c: 5, pr: 5 },
    function (m) { return gt(m.paired.rankCorrelation, 0.9); },
    function (m, H) { return { title: 'RANKING CONCORDANCE', body:
      'Ryan\'s and Devin\'s personal rankings correlate at r = ' + H.n2(m.paired.rankCorrelation) +
      '. They disagree about numbers but almost never about order, which is arguably the only thing that matters.' }; });

  R('dis-negative-rank-correlation', 'disagreement', { c: 5, pr: 9, r: 'legendary' },
    function (m) { return num(m.paired.rankCorrelation) && m.paired.rankCorrelation < 0; },
    function (m, H) { return { title: 'EMERGENCY HEARING CONVENED', body:
      'Ryan\'s and Devin\'s rankings are negatively correlated (r = ' + H.n2(m.paired.rankCorrelation) +
      '). The burgers one prefers are, on balance, the burgers the other rejects. The Official Rankings currently represent the opinion of no living person.' }; });

  R('dis-turnaround-vs-agreement', 'disagreement', { c: 6, pr: 5, r: 'uncommon' },
    function (m) {
      var t = m.paired.views.filter(function (v) { return num(v.turnaroundMs) && num(v.meanAbsDelta); });
      if (t.length < 5) return false;
      var r = m.stats.correlation(t.map(function (v) { return v.turnaroundMs; }), t.map(function (v) { return v.meanAbsDelta; }));
      return gt(r, 0.4);
    },
    function (m, H) {
      var t = m.paired.views.filter(function (v) { return num(v.turnaroundMs) && num(v.meanAbsDelta); });
      var r = m.stats.correlation(t.map(function (v) { return v.turnaroundMs; }), t.map(function (v) { return v.meanAbsDelta; }));
      return { title: 'DELAY CORRELATION', body:
        'The longer a specimen waits for peer review, the more the auditors disagree about it (r = ' + H.n2(r) +
        '). The Bureau advises prompt filing, primarily to protect the relationship.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 5 — SCORE DISTRIBUTION / SCALE USE ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;

  function A(m, k) { return m.auditors[k]; }
  function both(m, fn) { return fn(m.auditors.ryan) || fn(m.auditors.devin); }
  function whichever(m, fn, dir) {
    var r = fn(m.auditors.ryan), d = fn(m.auditors.devin);
    if (!num(r)) return 'devin';
    if (!num(d)) return 'ryan';
    return (dir === 'max' ? r >= d : r <= d) ? 'ryan' : 'devin';
  }

  R('dist-nine-rate-ryan', 'distribution', { a: 4, pr: 7 },
    function (m) { return gt(A(m, 'ryan').pct9, 28); },
    function (m, H) { var a = A(m, 'ryan');
      return { title: 'GENEROSITY INVESTIGATION', body:
        'Ryan has awarded a 9.0 or above to ' + H.pct(a.pct9) + ' of all category scores (' + a.count9 + ' of ' + a.totalCells +
        '). The Bureau is reviewing whether he understands the upper end of the scale.' }; });

  R('dist-nine-rate-devin', 'distribution', { a: 4, pr: 7 },
    function (m) { return gt(A(m, 'devin').pct9, 28); },
    function (m, H) { var a = A(m, 'devin');
      return { title: 'GENEROSITY INVESTIGATION', body:
        'Devin has issued ' + a.count9 + ' scores of 9.0 or higher, being ' + H.pct(a.pct9) +
        ' of everything he has ever recorded. The Office has requested he explain what a 10 would look like.' }; });

  R('dist-nine-rate-low', 'distribution', { a: 6, pr: 6 },
    function (m) { return both(m, function (a) { return num(a.pct9) && a.pct9 < 5; }); },
    function (m, H) {
      var who = whichever(m, function (a) { return a.pct9; }, 'min');
      return { title: 'RESTRAINT COMMENDATION', body:
        H.name(who) + ' has awarded 9.0 or above in only ' + H.pct(A(m, who).pct9) +
        ' of category scores. The Bureau recognises this as either exacting standards or joylessness.' }; });

  R('dist-no-tens-ever', 'distribution', { c: 8, pr: 7, x: 'tens' },
    function (m) { return A(m, 'ryan').count10 === 0 && A(m, 'devin').count10 === 0; },
    function (m, H) { return { title: 'COMMENDATION FOR PROCEDURAL RESTRAINT', body:
      'Neither auditor has awarded a 10.0 through the first ' + m.counts.certified +
      ' certified specimens. The Bureau recognises this rare display of institutional discipline.' }; },
    function (m, H) { return { title: 'PERFECTION WITHHELD', body:
      'Across ' + (A(m, 'ryan').totalCells + A(m, 'devin').totalCells) +
      ' individual category scores, not one 10.0 has been issued. Somewhere out there is a hamburger neither man has met.' }; });

  R('dist-tens-ryan', 'distribution', { a: 3, pr: 6, x: 'tens' },
    function (m) { return A(m, 'ryan').count10 >= 2 && A(m, 'ryan').count10 > A(m, 'devin').count10; },
    function (m, H) { var a = A(m, 'ryan');
      return { title: 'MAXIMUM SCORE FREQUENCY', body:
        'Ryan has issued ' + a.count10 + ' perfect 10.0 scores (' + H.pct(a.pct10, 1) + ' of his ratings). ' +
        'Devin has issued ' + A(m, 'devin').count10 + '. One of them believes in perfection.' }; });

  R('dist-tens-devin', 'distribution', { a: 3, pr: 6, x: 'tens' },
    function (m) { return A(m, 'devin').count10 >= 2 && A(m, 'devin').count10 > A(m, 'ryan').count10; },
    function (m, H) { var a = A(m, 'devin');
      return { title: 'MAXIMUM SCORE FREQUENCY', body:
        'Devin has awarded ' + a.count10 + ' scores of exactly 10.0 against Ryan\'s ' + A(m, 'ryan').count10 +
        '. The Office notes that the scale has an upper bound for a reason.' }; });

  R('dist-tens-excessive', 'distribution', { a: 5, pr: 8, x: 'tens' },
    function (m) { return both(m, function (a) { return gt(a.pct10, 8); }); },
    function (m, H) {
      var who = whichever(m, function (a) { return a.pct10; }, 'max');
      return { title: 'SCALE INTEGRITY WARNING', body:
        H.pct(A(m, who).pct10, 1) + ' of ' + H.name(who) + "'s scores are a perfect 10.0. " +
        'At this rate the top of the scale ceases to mean anything and the Bureau will be forced to invent an 11.' }; });

  R('dist-below-five-ryan', 'distribution', { a: 4, pr: 6, x: 'sub5' },
    function (m) { return gt(A(m, 'ryan').pctBelow5, 8); },
    function (m, H) { var a = A(m, 'ryan');
      return { title: 'ADVERSE RATING FREQUENCY', body:
        'Ryan has issued ' + a.countBelow5 + ' scores below 5.0, being ' + H.pct(a.pctBelow5, 1) +
        ' of his output. He is willing to use the bottom half of the scale, which the Bureau finds unusual and slightly alarming.' }; });

  R('dist-below-five-devin', 'distribution', { a: 4, pr: 6, x: 'sub5' },
    function (m) { return gt(A(m, 'devin').pctBelow5, 8); },
    function (m, H) { var a = A(m, 'devin');
      return { title: 'ADVERSE RATING FREQUENCY', body:
        H.pct(a.pctBelow5, 1) + ' of Devin\'s scores fall below 5.0. The Office has confirmed he continues to attend evaluations voluntarily.' }; });

  R('dist-never-below-five', 'distribution', { a: 8, pr: 6, x: 'sub5' },
    function (m) { return A(m, 'ryan').countBelow5 === 0 && A(m, 'devin').countBelow5 === 0; },
    function (m, H) { return { title: 'LOWER SCALE UNUSED', body:
      'Neither auditor has ever recorded a score below 5.0. Half of the Bureau\'s scoring instrument has never been touched and is presumed decorative.' }; });

  R('dist-never-below-seven', 'distribution', { a: 8, pr: 7, r: 'uncommon', x: 'sub5' },
    function (m) { return both(m, function (a) { return a.n >= 8 && a.countBelow7 === 0; }); },
    function (m, H) {
      var who = A(m, 'ryan').countBelow7 === 0 ? 'ryan' : 'devin';
      return { title: 'COMPRESSED SCALE NOTICE', body:
        H.name(who) + ' has never issued a score below 7.0 in ' + A(m, who).n + ' audits. ' +
        'He is operating on a three-point scale and calling it ten.' }; });

  R('dist-narrow-range-ryan', 'distribution', { a: 6, pr: 7, x: 'range' },
    function (m) { return lt(A(m, 'ryan').scores.sd, 0.8); },
    function (m, H) { var a = A(m, 'ryan');
      return { title: 'SCALE UTILIZATION REVIEW', body:
        'Ryan\'s scores have a standard deviation of ' + H.n2(a.scores.sd) + ' around a mean of ' + H.n2(a.scores.mean) +
        '. Nearly everything he tastes lands in the same narrow band, which is either consistency or indifference.' }; });

  R('dist-narrow-range-devin', 'distribution', { a: 6, pr: 7, x: 'range' },
    function (m) { return lt(A(m, 'devin').scores.sd, 0.8); },
    function (m, H) { var a = A(m, 'devin');
      return { title: 'SCALE UTILIZATION REVIEW', body:
        'Devin\'s entire scoring history has a standard deviation of ' + H.n2(a.scores.sd) +
        '. The Bureau supplied one hundred and one possible values and he is using roughly nine of them.' }; });

  R('dist-wide-range', 'distribution', { a: 6, pr: 6, x: 'range' },
    function (m) { return both(m, function (a) { return gt(a.scores.sd, 1.6); }); },
    function (m, H) {
      var who = whichever(m, function (a) { return a.scores.sd; }, 'max');
      return { title: 'FULL-SPECTRUM SCORING', body:
        H.name(who) + "'s scores span from " + H.n1(A(m, who).scores.min) + ' to ' + H.n1(A(m, who).scores.max) +
        ' with a standard deviation of ' + H.n2(A(m, who).scores.sd) + '. He uses the whole instrument and the Bureau appreciates the effort.' }; });

  R('dist-favourite-bucket-ryan', 'distribution', { a: 5, pr: 6 },
    function (m) { var a = A(m, 'ryan'); return a.favouriteBucketCount >= 6 && (a.favouriteBucketCount / a.totalCells) > 0.2; },
    function (m, H) { var a = A(m, 'ryan'); var lo = Number(a.favouriteBucket);
      return { title: 'SCALE UTILIZATION REVIEW', body:
        'Ryan has issued a score between ' + lo.toFixed(1) + ' and ' + (lo + 0.4).toFixed(1) + ' ' +
        H.times(a.favouriteBucketCount) + '. Statistical analysis suggests he may be afraid of commitment.' }; });

  R('dist-favourite-bucket-devin', 'distribution', { a: 5, pr: 6 },
    function (m) { var a = A(m, 'devin'); return a.favouriteBucketCount >= 6 && (a.favouriteBucketCount / a.totalCells) > 0.2; },
    function (m, H) { var a = A(m, 'devin'); var lo = Number(a.favouriteBucket);
      return { title: 'CLUSTERING DETECTED', body:
        H.pct((a.favouriteBucketCount / a.totalCells) * 100) + ' of Devin\'s scores fall in the ' + lo.toFixed(1) + '–' + (lo + 0.4).toFixed(1) +
        ' band. The Office has begun referring to this as "the Devin zone".' }; });

  R('dist-whole-numbers-ryan', 'distribution', { a: 5, pr: 6 },
    function (m) { return gt(A(m, 'ryan').pctWhole, 45); },
    function (m, H) { var a = A(m, 'ryan');
      return { title: 'DECIMAL AVOIDANCE', body:
        H.pct(a.pctWhole) + ' of Ryan\'s scores are whole numbers. The Bureau went to considerable trouble to provide tenths.' }; });

  R('dist-whole-numbers-devin', 'distribution', { a: 5, pr: 6 },
    function (m) { return gt(A(m, 'devin').pctWhole, 45); },
    function (m, H) { var a = A(m, 'devin');
      return { title: 'DECIMAL AVOIDANCE', body:
        'Devin records a whole number ' + H.pct(a.pctWhole) + ' of the time. Precision is available to him and he has declined it.' }; });

  R('dist-decimal-preference-ryan', 'distribution', { a: 6, pr: 5 },
    function (m) { var a = A(m, 'ryan'); return a.favouriteDecimal > 0 && a.favouriteDecimalCount >= 6 && (a.favouriteDecimalCount / a.totalCells) > 0.22; },
    function (m, H) { var a = A(m, 'ryan');
      return { title: 'DECIMAL FIXATION', body:
        'Ryan ends a score with .' + a.favouriteDecimal + ' more often than any other decimal — ' + a.favouriteDecimalCount +
        ' times. The Office has no theory and would like one.' }; });

  R('dist-decimal-preference-devin', 'distribution', { a: 6, pr: 5 },
    function (m) { var a = A(m, 'devin'); return a.favouriteDecimal > 0 && a.favouriteDecimalCount >= 6 && (a.favouriteDecimalCount / a.totalCells) > 0.22; },
    function (m, H) { var a = A(m, 'devin');
      return { title: 'DECIMAL FIXATION', body:
        'Devin reaches for .' + a.favouriteDecimal + ' with unusual frequency (' + a.favouriteDecimalCount +
        ' occurrences). The Bureau has classified this as a personal quirk rather than misconduct.' }; });

  R('dist-median-mean-gap', 'distribution', { c: 5, pr: 5 },
    function (m) { return num(m.paired.cpi.mean) && num(m.paired.cpi.median) && Math.abs(m.paired.cpi.mean - m.paired.cpi.median) >= 2.5; },
    function (m, H) { var p = m.paired.cpi;
      return { title: 'SKEWED REGISTER', body:
        'Mean CPI is ' + H.n1(p.mean) + ' but median CPI is ' + H.n1(p.median) +
        '. A small number of specimens are pulling the entire register around.' }; });

  R('dist-cpi-tight', 'distribution', { c: 6, pr: 6, x: 'cpi-spread' },
    function (m) { return lt(m.paired.cpi.sd, 5); },
    function (m, H) { return { title: 'HOMOGENEOUS REGISTER', body:
      'Composite Patty Index standard deviation across ' + m.paired.n + ' specimens: ' + H.n2(m.paired.cpi.sd) +
      '. Every hamburger examined has been approximately as good as every other hamburger examined.' }; });

  R('dist-cpi-wide', 'distribution', { c: 6, pr: 6, x: 'cpi-spread' },
    function (m) { return gt(m.paired.cpi.sd, 12); },
    function (m, H) { return { title: 'HIGHLY VARIED REGISTER', body:
      'CPI ranges from ' + H.n1(m.paired.cpi.min) + ' to ' + H.n1(m.paired.cpi.max) + ' (SD ' + H.n2(m.paired.cpi.sd) +
      '). The auditors are visiting genuinely different establishments, which the Bureau encourages.' }; });

  R('dist-cpi-range-record', 'distribution', { c: 4, pr: 6 },
    function (m) { return gt(m.paired.cpi.range, 25); },
    function (m, H) {
      var best = m.paired.official[0], worst = m.paired.official[m.paired.official.length - 1];
      return { title: 'SPREAD OF THE REGISTER', body:
        H.n1(m.paired.cpi.range) + ' CPI points separate ' + H.spec(best) + ' from ' + H.spec(worst) +
        '. Both are, formally, hamburgers.' }; });

  R('dist-scale-bottom-untouched', 'distribution', { a: 6, pr: 5 },
    function (m) { return gt(A(m, 'ryan').scores.min, 5.5) && gt(A(m, 'devin').scores.min, 5.5); },
    function (m, H) { return { title: 'UNUSED CAPACITY NOTICE', body:
      'The lowest score ever recorded by either auditor is ' + H.n1(Math.min(A(m, 'ryan').scores.min, A(m, 'devin').scores.min)) +
      '. Values from 0.0 upward remain available and unloved.' }; });

  R('dist-scale-top-untouched', 'distribution', { a: 6, pr: 5 },
    function (m) { return lt(A(m, 'ryan').scores.max, 9.3) && lt(A(m, 'devin').scores.max, 9.3); },
    function (m, H) { return { title: 'CEILING UNAPPROACHED', body:
      'The highest score either auditor has ever awarded is ' + H.n1(Math.max(A(m, 'ryan').scores.max, A(m, 'devin').scores.max)) +
      '. Neither man has yet encountered a hamburger worth the top of the scale, or neither is capable of admitting it.' }; });

  R('dist-both-used-full-scale', 'distribution', { a: 8, pr: 7, r: 'rare' },
    function (m) {
      return both(m, function (a) { return num(a.scores.min) && num(a.scores.max) && a.scores.min <= 4 && a.scores.max >= 9.5; });
    },
    function (m, H) {
      var who = A(m, 'ryan').scores.range >= A(m, 'devin').scores.range ? 'ryan' : 'devin';
      return { title: 'FULL INSTRUMENT DEPLOYED', body:
        H.name(who) + ' has recorded scores from ' + H.n1(A(m, who).scores.min) + ' to ' + H.n1(A(m, who).scores.max) +
        ', spanning almost the entire permitted range. The Bureau considers this exemplary use of public equipment.' }; });

  R('dist-personal-sd-compare', 'distribution', { c: 6, pr: 7 },
    function (m) {
      var r = A(m, 'ryan').weighted.sd, d = A(m, 'devin').weighted.sd;
      return num(r) && num(d) && Math.abs(r - d) > 0.35;
    },
    function (m, H) {
      var r = A(m, 'ryan').weighted.sd, d = A(m, 'devin').weighted.sd;
      var steady = r < d ? 'ryan' : 'devin';
      return { title: 'VOLATILITY COMPARISON', body:
        H.name(steady) + ' is the steadier auditor (SD ' + H.n2(Math.min(r, d)) + ' against ' + H.n2(Math.max(r, d)) +
        '). ' + H.other(steady) + "'s opinions arrive with considerably more weather." }; });

  R('dist-clustered-around-eight', 'distribution', { a: 8, pr: 6, r: 'uncommon' },
    function (m) {
      return both(m, function (a) {
        if (a.totalCells < 24) return false;
        var inBand = a.scores.values.filter(function (x) { return x >= 7.5 && x < 9; }).length;
        return (inBand / a.totalCells) > 0.6;
      });
    },
    function (m, H) {
      var who = whichever(m, function (a) {
        return a.totalCells ? a.scores.values.filter(function (x) { return x >= 7.5 && x < 9; }).length / a.totalCells : 0;
      }, 'max');
      var a = A(m, who);
      var inBand = a.scores.values.filter(function (x) { return x >= 7.5 && x < 9; }).length;
      return { title: 'SUSPICIOUS CLUSTERING', body:
        H.pct((inBand / a.totalCells) * 100) + ' of ' + H.name(who) + "'s scores fall between 7.5 and 8.9. " +
        'The Office has begun to suspect the existence of a default.' }; });

  R('dist-mode-heavy', 'distribution', { a: 8, pr: 6 },
    function (m) {
      return both(m, function (a) {
        if (a.totalCells < 24) return false;
        var counts = {};
        a.scores.values.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
        var top = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }));
        return (top / a.totalCells) > 0.16;
      });
    },
    function (m, H) {
      var who = whichever(m, function (a) {
        if (!a.totalCells) return 0;
        var counts = {};
        a.scores.values.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
        return Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; })) / a.totalCells;
      }, 'max');
      var a = A(m, who);
      var counts = {};
      a.scores.values.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
      var best = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; })[0];
      return { title: 'DEFAULT VALUE DETECTED', body:
        H.name(who) + ' has written ' + Number(best).toFixed(1) + ' exactly ' + counts[best] + ' times, more than any other value. ' +
        'The Bureau suspects this is what he reaches for when he has no opinion.' }; });

  R('dist-pct9-gap', 'distribution', { c: 5, pr: 6 },
    function (m) {
      var r = A(m, 'ryan').pct9, d = A(m, 'devin').pct9;
      return num(r) && num(d) && Math.abs(r - d) > 12;
    },
    function (m, H) {
      var r = A(m, 'ryan').pct9, d = A(m, 'devin').pct9;
      var who = r > d ? 'ryan' : 'devin';
      return { title: 'TOP-END DIVERGENCE', body:
        H.name(who) + ' awards 9.0+ at ' + H.pct(Math.max(r, d)) + ' against ' + H.other(who) + "'s " + H.pct(Math.min(r, d)) +
        '. The two men have materially different definitions of excellence.' }; });

  R('dist-symmetric', 'distribution', { c: 8, pr: 5, r: 'uncommon' },
    function (m) {
      return num(m.paired.cpi.mean) && num(m.paired.cpi.median) && Math.abs(m.paired.cpi.mean - m.paired.cpi.median) < 0.4;
    },
    function (m, H) { return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
      'Mean CPI (' + H.n1(m.paired.cpi.mean) + ') and median CPI (' + H.n1(m.paired.cpi.median) +
      ') are almost identical, indicating a symmetric distribution. This changes nothing and cost a great deal to determine.' }; });

  R('dist-spread-within-audit', 'distribution', { a: 5, pr: 5 },
    function (m) { return num(A(m, 'ryan').meanSpread) && num(A(m, 'devin').meanSpread) && Math.abs(A(m, 'ryan').meanSpread - A(m, 'devin').meanSpread) > 0.6; },
    function (m, H) {
      var who = A(m, 'ryan').meanSpread > A(m, 'devin').meanSpread ? 'ryan' : 'devin';
      return { title: 'INTRA-SPECIMEN VARIATION', body:
        'Within a single hamburger, ' + H.name(who) + "'s six category scores spread across " + H.n2(A(m, who).meanSpread) +
        ' points on average, against ' + H.n2(A(m, S.otherAuditor(who)).meanSpread) + ' for ' + H.other(who) +
        '. One of them differentiates between the components. The other tastes a hamburger.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 6 — CONSISTENCY & STREAKS ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;
  function A(m, k) { return m.auditors[k]; }
  function st(m) { return m.paired.streaks; }

  /* --- streaks: who has been higher --- */
  R('str-higher-current-long', 'streaks', { c: 4, pr: 9, x: 'higher-streak' },
    function (m) { return st(m).ryanHigher.current >= 4 || st(m).devinHigher.current >= 4; },
    function (m, H) {
      var who = st(m).ryanHigher.current >= st(m).devinHigher.current ? 'ryan' : 'devin';
      var n = st(m)[who + 'Higher'].current;
      return { title: 'UNBROKEN DIFFERENTIAL', body:
        H.name(who) + ' has scored higher than ' + H.other(who) + ' on ' + n +
        ' consecutive certified specimens. This is no longer variance; it is policy.' }; },
    function (m, H) {
      var who = st(m).ryanHigher.current >= st(m).devinHigher.current ? 'ryan' : 'devin';
      var n = st(m)[who + 'Higher'].current;
      return { title: 'STREAK NOTICE', body:
        'Current run: ' + n + ' specimens in a row where ' + H.name(who) + ' recorded the higher weighted score. ' +
        H.other(who) + ' has been informed and has not responded.' }; });

  R('str-higher-current-short', 'streaks', { c: 3, pr: 6, x: 'higher-streak' },
    function (m) { var s = st(m); return (s.ryanHigher.current === 2 || s.ryanHigher.current === 3) || (s.devinHigher.current === 2 || s.devinHigher.current === 3); },
    function (m, H) {
      var who = st(m).ryanHigher.current >= st(m).devinHigher.current ? 'ryan' : 'devin';
      var n = st(m)[who + 'Higher'].current;
      return { title: 'EMERGING RUN', body:
        H.name(who) + ' has taken the higher score on the last ' + n + ' specimens. The Bureau is watching without comment.' }; });

  R('str-higher-longest-historic', 'streaks', { c: 8, pr: 6 },
    function (m) {
      var s = st(m);
      var longest = Math.max(s.ryanHigher.longest, s.devinHigher.longest);
      var current = Math.max(s.ryanHigher.current, s.devinHigher.current);
      return longest >= 5 && current < longest;
    },
    function (m, H) {
      var s = st(m);
      var who = s.ryanHigher.longest >= s.devinHigher.longest ? 'ryan' : 'devin';
      return { title: 'HISTORICAL RECORD', body:
        'The longest run of consecutive higher scores belongs to ' + H.name(who) + ' at ' + s[who + 'Higher'].longest +
        ' specimens. That period is now regarded internally as a golden age.' }; });

  R('str-nine-streak-ryan', 'streaks', { c: 3, pr: 7 },
    function (m) { return st(m).ryanNine.current >= 3; },
    function (m, H) { return { title: 'SUSTAINED ENTHUSIASM', body:
      'Ryan has issued a weighted score of 9.0 or above on ' + st(m).ryanNine.current +
      ' consecutive specimens. The Office is checking whether he has simply found a good street.' }; });

  R('str-nine-streak-devin', 'streaks', { c: 3, pr: 7 },
    function (m) { return st(m).devinNine.current >= 3; },
    function (m, H) { return { title: 'SUSTAINED ENTHUSIASM', body:
      'Devin\'s last ' + st(m).devinNine.current + ' weighted scores have all exceeded 9.0. ' +
      'Either standards are collapsing or the hamburgers have improved dramatically. The Bureau suspects the former.' }; });

  R('str-no-tens-streak', 'streaks', { c: 6, pr: 6 },
    function (m) { return st(m).noTens.current >= 6; },
    function (m, H) { return { title: 'RESTRAINT STREAK', body:
      st(m).noTens.current + ' consecutive certified specimens without a single 10.0 from either auditor. ' +
      'The Bureau recognises this as either rigour or a shared failure of imagination.' }; });

  R('str-patty-dominance', 'streaks', { c: 3, pr: 7 },
    function (m) { return st(m).pattyTop.current >= 3; },
    function (m, H) { return { title: 'PATTY SUPREMACY STREAK', body:
      'Patty has been the highest-scoring category on ' + st(m).pattyTop.current +
      ' consecutive specimens. The Bureau considers this the correct outcome and is suspicious of how reliably it occurs.' }; });

  R('str-patty-dominance-long', 'streaks', { c: 6, pr: 8, r: 'uncommon' },
    function (m) { return st(m).pattyTop.longest >= 5; },
    function (m, H) { return { title: 'STRUCTURAL PATTY ADVANTAGE', body:
      'At its peak, Patty led all categories on ' + st(m).pattyTop.longest +
      ' specimens in a row. The Office has reviewed whether the 30% weighting is doing this and confirmed that it is not — the raw scores are simply higher.' }; });

  R('str-fries-disappointment', 'streaks', { c: 3, pr: 7 },
    function (m) { return st(m).friesBottom.current >= 3; },
    function (m, H) { return { title: 'ONGOING FRY EMERGENCY', body:
      'Fries have been the weakest category on ' + st(m).friesBottom.current +
      ' consecutive specimens. The Bureau has begun to regard this as a regional failing rather than a series of accidents.' }; });

  R('str-fries-disappointment-long', 'streaks', { c: 6, pr: 8, r: 'uncommon' },
    function (m) { return st(m).friesBottom.longest >= 5; },
    function (m, H) { return { title: 'SUSTAINED SIDE-ORDER CRISIS', body:
      'Fries have finished last on as many as ' + st(m).friesBottom.longest +
      ' consecutive specimens. No establishment has yet been held accountable.' }; });

  R('str-value-bottom', 'streaks', { c: 3, pr: 6 },
    function (m) { return st(m).valueBottom.current >= 3; },
    function (m, H) { return { title: 'CONSECUTIVE VALUE FAILURES', body:
      'Value has been the lowest-scoring category on ' + st(m).valueBottom.current +
      ' specimens running. The auditors keep going back, which weakens their position considerably.' }; });

  R('str-agreement-longest', 'streaks', { c: 6, pr: 6 },
    function (m) { return st(m).agreement.longest >= 4; },
    function (m, H) { return { title: 'PERIOD OF ACCORD', body:
      'The register\'s longest run of close agreement is ' + st(m).agreement.longest +
      ' consecutive specimens under 0.3 points of mean disagreement. The Office remembers it fondly.' }; });

  R('str-broken-streak', 'streaks', { c: 5, pr: 7, r: 'uncommon' },
    function (m) {
      var s = st(m);
      return (s.ryanHigher.longest >= 4 && s.ryanHigher.current === 0) || (s.devinHigher.longest >= 4 && s.devinHigher.current === 0);
    },
    function (m, H) {
      var s = st(m);
      var who = s.ryanHigher.longest >= s.devinHigher.longest ? 'ryan' : 'devin';
      return { title: 'STREAK TERMINATED', body:
        H.name(who) + "'s run of " + s[who + 'Higher'].longest + ' consecutive higher scores has ended. ' +
        H.other(who) + ' has not commented publicly.' }; });

  /* --- consistency --- */
  R('con-most-consistent', 'consistency', { c: 5, pr: 7, x: 'consistency' },
    function (m) {
      var r = A(m, 'ryan').weighted.sd, d = A(m, 'devin').weighted.sd;
      return num(r) && num(d) && Math.abs(r - d) > 0.2;
    },
    function (m, H) {
      var r = A(m, 'ryan').weighted.sd, d = A(m, 'devin').weighted.sd;
      var steady = r < d ? 'ryan' : 'devin';
      return { title: 'CONSISTENCY REVIEW', body:
        H.name(steady) + ' is the more internally consistent auditor, with a weighted-score standard deviation of ' +
        H.n2(Math.min(r, d)) + ' against ' + H.n2(Math.max(r, d)) + '. Consistency is not accuracy, as the Bureau reminds itself constantly.' }; });

  R('con-both-very-consistent', 'consistency', { c: 6, pr: 6, x: 'consistency' },
    function (m) { return lt(A(m, 'ryan').weighted.sd, 0.5) && lt(A(m, 'devin').weighted.sd, 0.5); },
    function (m, H) { return { title: 'INSTITUTIONAL PREDICTABILITY', body:
      'Both auditors post weighted-score standard deviations below 0.5. The Bureau could replace either of them with a constant and lose very little.' }; });

  R('con-both-volatile', 'consistency', { c: 6, pr: 6, x: 'consistency' },
    function (m) { return gt(A(m, 'ryan').weighted.sd, 1.1) && gt(A(m, 'devin').weighted.sd, 1.1); },
    function (m, H) { return { title: 'SHARED VOLATILITY', body:
      'Both auditors show weighted-score standard deviations above 1.1. Either the hamburgers vary wildly or neither man has settled on what a hamburger should be.' }; });

  R('con-category-consistency-ryan', 'consistency', { a: 5, pr: 5 },
    function (m) {
      var a = A(m, 'ryan');
      var sds = K.map(function (c) { return a.cat[c].sd; }).filter(num);
      return sds.length === K.length && (Math.max.apply(null, sds) - Math.min.apply(null, sds)) > 1.0;
    },
    function (m, H) { var a = A(m, 'ryan');
      return { title: 'UNEVEN ATTENTION', body:
        'Ryan is highly consistent on ' + H.cat(a.steadiestCat) + ' (SD ' + H.n2(a.steadiestCatSd) + ') and highly erratic on ' +
        H.cat(a.swingiestCat) + ' (SD ' + H.n2(a.swingiestCatSd) + '). He has firm views about some parts of a hamburger and none about others.' }; });

  R('con-category-consistency-devin', 'consistency', { a: 5, pr: 5 },
    function (m) {
      var a = A(m, 'devin');
      var sds = K.map(function (c) { return a.cat[c].sd; }).filter(num);
      return sds.length === K.length && (Math.max.apply(null, sds) - Math.min.apply(null, sds)) > 1.0;
    },
    function (m, H) { var a = A(m, 'devin');
      return { title: 'UNEVEN ATTENTION', body:
        'Devin\'s ' + H.cat(a.swingiestCat) + ' scores vary more than twice as much as his ' + H.cat(a.steadiestCat) +
        ' scores. The Office declines to speculate as to why.' }; });

  R('con-recent-vs-prior-ryan', 'consistency', { a: 6, pr: 6 },
    function (m) { var a = A(m, 'ryan'); return num(a.recentMean) && num(a.priorMean) && Math.abs(a.recentMean - a.priorMean) > 0.5; },
    function (m, H) { var a = A(m, 'ryan');
      var dir = a.recentMean > a.priorMean ? 'above' : 'below';
      return { title: 'RECENT FORM', body:
        "Ryan's last three audits average " + H.n2(a.recentMean) + ', ' + H.abs2(a.recentMean - a.priorMean) + ' points ' + dir +
        ' his prior record. Something has changed and he has not filed a report about it.' }; });

  R('con-recent-vs-prior-devin', 'consistency', { a: 6, pr: 6 },
    function (m) { var a = A(m, 'devin'); return num(a.recentMean) && num(a.priorMean) && Math.abs(a.recentMean - a.priorMean) > 0.5; },
    function (m, H) { var a = A(m, 'devin');
      var dir = a.recentMean > a.priorMean ? 'higher' : 'lower';
      return { title: 'RECENT FORM', body:
        "Devin's three most recent audits run " + H.abs2(a.recentMean - a.priorMean) + ' points ' + dir +
        ' than his earlier work. The Bureau has recorded the shift without endorsing it.' }; });

  R('con-stable-over-time', 'consistency', { a: 8, pr: 6, r: 'uncommon' },
    function (m) {
      var r = A(m, 'ryan').trend, d = A(m, 'devin').trend;
      return r && d && Math.abs(r.delta) < 0.15 && Math.abs(d.delta) < 0.15;
    },
    function (m, H) { return { title: 'COMMENDATION FOR STABILITY', body:
      'Neither auditor\'s average has moved meaningfully between the first and second halves of the register. ' +
      'The Bureau recognises sustained calibration and finds it slightly boring.' }; });

  R('con-spread-narrow-both', 'consistency', { a: 5, pr: 5 },
    function (m) { return lt(A(m, 'ryan').meanSpread, 1.2) && lt(A(m, 'devin').meanSpread, 1.2); },
    function (m, H) { return { title: 'UNDIFFERENTIATED SCORING', body:
      'Within a given hamburger, both auditors rate all six categories within roughly a point of each other. ' +
      'The Bureau provided six categories in the hope of six opinions.' }; });

  R('con-spread-wide-both', 'consistency', { a: 5, pr: 5 },
    function (m) { return gt(A(m, 'ryan').meanSpread, 2.5) && gt(A(m, 'devin').meanSpread, 2.5); },
    function (m, H) { return { title: 'HIGH COMPONENT DIFFERENTIATION', body:
      'Both auditors routinely spread their six category scores across more than 2.5 points on a single specimen. ' +
      'They are evaluating components rather than impressions, which the Office grudgingly respects.' }; });

  R('con-most-consistent-restaurant', 'consistency', { c: 6, pr: 6 },
    function (m) { return m.repeatRestaurants.some(function (r) { return r.count >= 2 && lt(r.rangeCPI, 3); }); },
    function (m, H) {
      var r = m.repeatRestaurants.filter(function (x) { return x.count >= 2 && lt(x.rangeCPI, 3); })[0];
      return { title: 'ESTABLISHMENT CONSISTENCY COMMENDATION', body:
        r.name + ' has produced ' + r.count + ' certified specimens within ' + H.n1(r.rangeCPI) +
        ' CPI points of each other. Reliability of this order is rare and largely unrewarded.' }; });

  R('con-inconsistent-restaurant', 'consistency', { c: 6, pr: 7 },
    function (m) { return m.repeatRestaurants.some(function (r) { return r.count >= 2 && gt(r.rangeCPI, 12); }); },
    function (m, H) {
      var r = m.repeatRestaurants.filter(function (x) { return x.count >= 2 && gt(x.rangeCPI, 12); })[0];
      return { title: 'ESTABLISHMENT VOLATILITY NOTICE', body:
        r.name + "'s specimens span " + H.n1(r.rangeCPI) + ' CPI points. ' +
        'The Bureau cannot determine whether the kitchen is inconsistent or the auditors are.' }; });

  R('con-ryan-predicts-outcome', 'consistency', { c: 6, pr: 7, r: 'uncommon' },
    function (m) {
      var rw = m.paired.views.map(function (v) { return v.weighted.ryan; });
      var cp = m.paired.views.map(function (v) { return v.cpi; });
      var dw = m.paired.views.map(function (v) { return v.weighted.devin; });
      var rr = m.stats.correlation(rw, cp), dr = m.stats.correlation(dw, cp);
      return num(rr) && num(dr) && Math.abs(rr - dr) > 0.08;
    },
    function (m, H) {
      var rw = m.paired.views.map(function (v) { return v.weighted.ryan; });
      var cp = m.paired.views.map(function (v) { return v.cpi; });
      var dw = m.paired.views.map(function (v) { return v.weighted.devin; });
      var rr = m.stats.correlation(rw, cp), dr = m.stats.correlation(dw, cp);
      var who = rr > dr ? 'ryan' : 'devin';
      return { title: 'BPS PREDICTIVE ALIGNMENT INDEX', body:
        H.name(who) + "'s individual scores track the final Composite Patty Index more closely (r = " + H.n2(Math.max(rr, dr)) +
        ' against ' + H.n2(Math.min(rr, dr)) + '). The Bureau stresses that both auditors contribute to the Index, ' +
        'making this a measure of alignment rather than of correctness.' }; });

  R('con-agreement-with-peer', 'consistency', { c: 5, pr: 6 },
    function (m) { return num(m.paired.meanAbsDisagreement); },
    function (m, H) {
      var closeness = 10 - m.paired.meanAbsDisagreement;
      return { title: 'BPS PEER PROXIMITY SCORE', body:
        'Mean category proximity between the two auditors stands at ' + H.n2(closeness) + ' of a possible 10.0. ' +
        'The Bureau invented this metric to avoid implying that either auditor is right.' }; });

  R('con-scale-utilization-metric', 'consistency', { a: 6, pr: 6 },
    function (m) {
      var r = A(m, 'ryan'), d = A(m, 'devin');
      return num(r.scores.range) && num(d.scores.range) && Math.abs(r.scores.range - d.scores.range) > 1.0;
    },
    function (m, H) {
      var r = A(m, 'ryan'), d = A(m, 'devin');
      var who = r.scores.range > d.scores.range ? 'ryan' : 'devin';
      var lead = Math.abs(r.scores.range - d.scores.range);
      return { title: 'AUDITOR PERFORMANCE REVIEW', body:
        H.name(who) + ' leads in BPS Scale Utilization by ' + H.n1(lead) + ' points of deployed range. ' +
        'The Bureau invented this metric approximately fourteen milliseconds ago.' }; });

  R('con-contrarian-index', 'consistency', { c: 6, pr: 7 },
    function (m) {
      var p = m.paired, tot = p.ryanHigherCount + p.devinHigherCount;
      return tot >= 5;
    },
    function (m, H) {
      var p = m.paired, tot = p.ryanHigherCount + p.devinHigherCount;
      var who = p.ryanHigherCount > p.devinHigherCount ? 'ryan' : 'devin';
      var rate = (Math.max(p.ryanHigherCount, p.devinHigherCount) / tot) * 100;
      return { title: 'BPS CONTRARIAN INDEX', body:
        H.name(who) + ' posts a Contrarian Index of ' + H.pct(rate) + ', meaning he takes the higher position that often when the two disagree. ' +
        'A perfectly balanced auditor would score 50%. Nobody has ever asked for one.' }; });

  R('con-ranking-stability', 'consistency', { c: 6, pr: 6 },
    function (m) { return num(m.paired.rankCorrelation); },
    function (m, H) {
      var stability = ((m.paired.rankCorrelation + 1) / 2) * 100;
      return { title: 'BPS RANKING STABILITY SCORE', body:
        'The two auditors\' orderings align at ' + H.pct(stability) + ' on the Bureau\'s Ranking Stability Score. ' +
        'The scale was designed so that this number would sound reassuring regardless of the input.' }; });

  R('con-internal-consistency-metric', 'consistency', { a: 6, pr: 5 },
    function (m) {
      var r = A(m, 'ryan'), d = A(m, 'devin');
      return num(r.weighted.sd) && num(d.weighted.sd);
    },
    function (m, H) {
      var r = A(m, 'ryan'), d = A(m, 'devin');
      var rScore = Math.max(0, 10 - r.weighted.sd * 3);
      var dScore = Math.max(0, 10 - d.weighted.sd * 3);
      var who = rScore > dScore ? 'ryan' : 'devin';
      return { title: 'AUDITOR PERFORMANCE REVIEW', body:
        'BPS Internal Consistency ratings: Ryan ' + H.n1(rScore) + ', Devin ' + H.n1(dScore) + '. ' +
        H.name(who) + ' leads. The formula is arbitrary, undocumented, and now permanent.' }; });

  R('con-volatility-gap-large', 'consistency', { c: 6, pr: 6 },
    function (m) {
      var r = A(m, 'ryan').weighted.sd, d = A(m, 'devin').weighted.sd;
      return num(r) && num(d) && Math.max(r, d) > Math.min(r, d) * 1.8;
    },
    function (m, H) {
      var r = A(m, 'ryan').weighted.sd, d = A(m, 'devin').weighted.sd;
      var wild = r > d ? 'ryan' : 'devin';
      return { title: 'UNEXPLAINED VOLATILITY', body:
        H.name(wild) + "'s scores vary nearly twice as much as " + H.other(wild) + "'s. " +
        'The Office attributes the excess to unexplained volatility, a term it uses to mean "mood".' }; });

  R('con-consecutive-identical-cpi', 'consistency', { c: 3, pr: 9, r: 'legendary' },
    function (m) {
      var v = m.paired.views;
      for (var i = 2; i < v.length; i++) {
        var a = Math.round(v[i].cpi * 10), b = Math.round(v[i - 1].cpi * 10), c = Math.round(v[i - 2].cpi * 10);
        if (a === b && b === c) return true;
      }
      return false;
    },
    function (m, H) {
      var v = m.paired.views, hit = null;
      for (var i = 2; i < v.length; i++) {
        if (Math.round(v[i].cpi * 10) === Math.round(v[i - 1].cpi * 10) &&
            Math.round(v[i - 1].cpi * 10) === Math.round(v[i - 2].cpi * 10)) { hit = v[i]; break; }
      }
      return { title: 'STATISTICAL IMPROBABILITY LOGGED', body:
        'Three consecutive specimens produced an identical Composite Patty Index of ' + H.cpi(hit) +
        '. The Bureau has verified the arithmetic twice and remains uncomfortable.' }; });

  R('con-alternating-pattern', 'consistency', { c: 6, pr: 8, r: 'rare' },
    function (m) {
      var v = m.paired.views.filter(function (x) { return x.higher !== 'tie'; });
      if (v.length < 6) return false;
      var tail = v.slice(-6);
      for (var i = 1; i < tail.length; i++) if (tail[i].higher === tail[i - 1].higher) return false;
      return true;
    },
    function (m, H) { return { title: 'ALTERNATION DETECTED', body:
      'Over the last six contested specimens, the higher score has alternated between auditors without exception. ' +
      'The Bureau cannot rule out that they are taking turns.' }; });

  R('con-both-improving', 'consistency', { c: 6, pr: 6 },
    function (m) {
      var r = A(m, 'ryan').trend, d = A(m, 'devin').trend;
      return r && d && r.delta > 0.25 && d.delta > 0.25;
    },
    function (m, H) { return { title: 'REGISTER-WIDE DRIFT', body:
      'Both auditors are scoring higher than they did early on. Either their hamburger selection has improved or the Bureau\'s standards have quietly relaxed.' }; });

  R('con-both-declining', 'consistency', { c: 6, pr: 6 },
    function (m) {
      var r = A(m, 'ryan').trend, d = A(m, 'devin').trend;
      return r && d && r.delta < -0.25 && d.delta < -0.25;
    },
    function (m, H) { return { title: 'DECLINING SENTIMENT', body:
      'Both auditors have grown harsher since the register opened. The Office regards prolonged hamburger exposure as the likely cause.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 7 — RANKING COMPARISONS ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;
  function P(m) { return m.paired; }

  R('rank-biggest-inversion', 'ranking', { c: 4, pr: 9, x: 'inversion' },
    function (m) { return P(m).biggestInversion && P(m).biggestInversionValue >= 3; },
    function (m, H) { var row = P(m).biggestInversion;
      return { title: 'RANKING CRIME', body:
        'Ryan ranks ' + H.spec(row.view) + ' at ' + H.ord(row.ryanRank) + '. Devin ranks it ' + H.ord(row.devinRank) +
        '. A hearing has been scheduled. Neither auditor has been invited.' }; },
    function (m, H) { var row = P(m).biggestInversion;
      return { title: 'MAXIMUM RANKING DIVERGENCE', body:
        H.bare(row.view) + ' sits ' + row.diff + ' places apart in the two personal rankings (' +
        H.name('ryan') + ' ' + H.ord(row.ryanRank) + ', ' + H.name('devin') + ' ' + H.ord(row.devinRank) +
        '). Its official position of ' + H.ord(row.officialRank) + ' satisfies nobody.' }; });

  R('rank-small-inversion', 'ranking', { c: 4, pr: 5, x: 'inversion' },
    function (m) { return P(m).biggestInversion && P(m).biggestInversionValue > 0 && P(m).biggestInversionValue < 3; },
    function (m, H) { return { title: 'MINOR ORDERING DISPUTE', body:
      'The largest ranking disagreement in the register is ' + P(m).biggestInversionValue +
      ' ' + H.plural(P(m).biggestInversionValue, 'place') + '. The auditors order hamburgers almost identically, which removes most of the entertainment.' }; });

  R('rank-same-number-one', 'ranking', { c: 3, pr: 7, x: 'top' },
    function (m) { return P(m).sameNumberOne && P(m).n >= 3; },
    function (m, H) { var v = P(m).ryanOrder[0];
      return { title: 'UNCONTESTED CHAMPION', body:
        'Both auditors independently rank ' + H.spec(v) + ' as the finest specimen in the register. ' +
        'It holds ' + H.ord(v.rank) + ' officially with a CPI of ' + H.cpi(v) + '. The Bureau considers the matter closed.' }; });

  R('rank-different-number-one', 'ranking', { c: 3, pr: 8, x: 'top' },
    function (m) { return !P(m).sameNumberOne && P(m).n >= 3; },
    function (m, H) {
      var r = P(m).ryanOrder[0], d = P(m).devinOrder[0];
      return { title: 'DISPUTED CHAMPIONSHIP', body:
        'Ryan\'s favourite specimen is ' + H.spec(r) + '. Devin\'s is ' + H.spec(d) +
        '. The Official Rankings currently award the top position to ' + H.bare(P(m).official[0]) + ', which is at best a compromise.' }; },
    function (m, H) {
      var r = P(m).ryanOrder[0], d = P(m).devinOrder[0];
      return { title: 'NO CONSENSUS AT THE TOP', body:
        'The two auditors do not agree on the best hamburger they have eaten. Ryan: ' + H.bare(r) +
        '. Devin: ' + H.bare(d) + '. The Bureau publishes an official #1 anyway, as is its right.' }; });

  R('rank-same-last', 'ranking', { c: 3, pr: 6, x: 'bottom' },
    function (m) { return P(m).sameLast && P(m).n >= 3; },
    function (m, H) { var v = P(m).ryanOrder[P(m).n - 1];
      return { title: 'UNANIMOUS CONDEMNATION', body:
        'Both auditors rank ' + H.spec(v) + ' last. It is the only thing they have ever completely agreed about, and it is a failure.' }; });

  R('rank-different-last', 'ranking', { c: 4, pr: 6, x: 'bottom' },
    function (m) { return !P(m).sameLast && P(m).n >= 4; },
    function (m, H) {
      var r = P(m).ryanOrder[P(m).n - 1], d = P(m).devinOrder[P(m).n - 1];
      return { title: 'DISPUTED WORST SPECIMEN', body:
        'Ryan\'s lowest-ranked specimen is ' + H.bare(r) + '; Devin\'s is ' + H.bare(d) +
        '. The auditors cannot even agree on failure.' }; });

  R('rank-top3-overlap-full', 'ranking', { c: 4, pr: 6, x: 'top3' },
    function (m) { return P(m).top3Overlap === 3; },
    function (m, H) { return { title: 'PODIUM CONCORDANCE', body:
      'Ryan and Devin nominate the same three specimens for their personal top three, though not necessarily in the same order. ' +
      'The Bureau regards this as the outer limit of agreement between these two men.' }; });

  R('rank-top3-overlap-none', 'ranking', { c: 5, pr: 9, x: 'top3', r: 'rare' },
    function (m) { return P(m).top3Overlap === 0 && P(m).n >= 5; },
    function (m, H) { return { title: 'TOTAL PODIUM DIVERGENCE', body:
      'Not one specimen appears in both auditors\' personal top three. Zero overlap. ' +
      'The Official Rankings are the arithmetic mean of two entirely separate opinions about hamburgers.' }; });

  R('rank-top3-overlap-partial', 'ranking', { c: 4, pr: 5, x: 'top3' },
    function (m) { return P(m).top3Overlap === 1 || P(m).top3Overlap === 2; },
    function (m, H) { return { title: 'PARTIAL PODIUM AGREEMENT', body:
      P(m).top3Overlap + ' of 3 specimens appear in both auditors\' personal top three. ' +
      'The Bureau describes this level of concordance as "adequate" because it has no better word.' }; });

  R('rank-top5-overlap', 'ranking', { c: 6, pr: 5 },
    function (m) { return num(P(m).top5Overlap) && P(m).top5Overlap <= 2; },
    function (m, H) { return { title: 'UPPER REGISTER DISPUTE', body:
      'Only ' + P(m).top5Overlap + ' of the top five specimens are common to both personal rankings. ' +
      'The Bureau publishes a single Official Top Five and declines to explain how it was reached.' }; });

  R('rank-bottom3-overlap-full', 'ranking', { c: 5, pr: 5 },
    function (m) { return P(m).bottom3Overlap === 3; },
    function (m, H) { return { title: 'CONSENSUS ON FAILURE', body:
      'Both auditors identify the same three worst specimens in the register. ' +
      'Agreement is evidently easier to reach in the negative.' }; });

  R('rank-official-mismatch-ryan', 'ranking', { c: 5, pr: 7 },
    function (m) {
      return P(m).rankRows.some(function (r) { return Math.abs(r.officialRank - r.ryanRank) >= 3; });
    },
    function (m, H) {
      var row = P(m).rankRows.filter(function (r) { return Math.abs(r.officialRank - r.ryanRank) >= 3; })
        .sort(function (a, b) { return Math.abs(b.officialRank - b.ryanRank) - Math.abs(a.officialRank - a.ryanRank); })[0];
      return { title: 'OFFICIAL DEVIATION NOTICE', body:
        'Ryan places ' + H.bare(row.view) + ' at ' + H.ord(row.ryanRank) + ', but its official position is ' + H.ord(row.officialRank) +
        '. Devin\'s dissent has moved it ' + Math.abs(row.officialRank - row.ryanRank) + ' places.' }; });

  R('rank-official-mismatch-devin', 'ranking', { c: 5, pr: 7 },
    function (m) {
      return P(m).rankRows.some(function (r) { return Math.abs(r.officialRank - r.devinRank) >= 3; });
    },
    function (m, H) {
      var row = P(m).rankRows.filter(function (r) { return Math.abs(r.officialRank - r.devinRank) >= 3; })
        .sort(function (a, b) { return Math.abs(b.officialRank - b.devinRank) - Math.abs(a.officialRank - a.devinRank); })[0];
      return { title: 'OFFICIAL DEVIATION NOTICE', body:
        'Devin ranks ' + H.bare(row.view) + ' ' + H.ord(row.devinRank) + '; officially it stands at ' + H.ord(row.officialRank) +
        '. The gap is entirely attributable to Ryan.' }; });

  R('rank-loved-and-tolerated', 'ranking', { c: 5, pr: 8 },
    function (m) {
      return P(m).rankRows.some(function (r) { return r.ryanRank <= 2 && r.devinRank >= Math.max(5, P(m).n - 2); }) ||
             P(m).rankRows.some(function (r) { return r.devinRank <= 2 && r.ryanRank >= Math.max(5, P(m).n - 2); });
    },
    function (m, H) {
      var row = P(m).rankRows.filter(function (r) {
        return (r.ryanRank <= 2 && r.devinRank >= Math.max(5, P(m).n - 2)) ||
               (r.devinRank <= 2 && r.ryanRank >= Math.max(5, P(m).n - 2));
      })[0];
      var lover = row.ryanRank < row.devinRank ? 'ryan' : 'devin';
      return { title: 'IRRECONCILABLE ASSESSMENT', body:
        H.name(lover) + ' considers ' + H.spec(row.view) + ' one of the best hamburgers in the register. ' +
        H.other(lover) + ' ranks it ' + H.ord(lover === 'ryan' ? row.devinRank : row.ryanRank) +
        '. One of these men is wrong and the Bureau lacks the authority to say which.' }; });

  R('rank-official-top-is-nobodys', 'ranking', { c: 5, pr: 9, r: 'rare' },
    function (m) {
      var top = P(m).official[0];
      if (!top) return false;
      var row = P(m).rankRows.filter(function (r) { return r.view.id === top.id; })[0];
      return row && row.ryanRank > 1 && row.devinRank > 1;
    },
    function (m, H) {
      var top = P(m).official[0];
      var row = P(m).rankRows.filter(function (r) { return r.view.id === top.id; })[0];
      return { title: 'CHAMPION BY COMMITTEE', body:
        'The official #1 specimen, ' + H.spec(top) + ', is the personal favourite of neither auditor — Ryan ranks it ' +
        H.ord(row.ryanRank) + ' and Devin ' + H.ord(row.devinRank) + '. ' +
        'It leads the register purely by being nobody\'s disappointment.' }; });

  R('rank-personal-vs-official-spread', 'ranking', { c: 6, pr: 6 },
    function (m) {
      var diffs = P(m).rankRows.map(function (r) { return r.diff; });
      return gt(m.stats.mean(diffs), 1.5);
    },
    function (m, H) {
      var diffs = P(m).rankRows.map(function (r) { return r.diff; });
      return { title: 'ORDERING INSTABILITY', body:
        'On average, a specimen sits ' + H.n1(m.stats.mean(diffs)) +
        ' places apart in the two personal rankings. The Official Rankings are considerably more confident than the auditors are.' }; });

  R('rank-perfect-agreement-order', 'ranking', { c: 5, pr: 9, r: 'legendary' },
    function (m) { return P(m).n >= 5 && P(m).rankRows.every(function (r) { return r.ryanRank === r.devinRank; }); },
    function (m, H) { return { title: 'PERFECT ORDINAL CONCORDANCE', body:
      'Ryan and Devin rank all ' + P(m).n + ' certified specimens in exactly the same order. ' +
      'The Bureau has verified this result and asks that the auditors continue to file independently, as required.' }; });

  R('rank-top-heavy-gap', 'ranking', { c: 4, pr: 6 },
    function (m) {
      var o = P(m).official;
      return o.length >= 2 && (o[0].cpi - o[1].cpi) >= 5;
    },
    function (m, H) {
      var o = P(m).official;
      return { title: 'DOMINANT SPECIMEN', body:
        H.spec(o[0]) + ' leads the register by ' + H.n1(o[0].cpi - o[1].cpi) + ' CPI points over ' + H.bare(o[1]) +
        '. The gap between first and second exceeds most gaps in the register.' }; });

  R('rank-tight-top', 'ranking', { c: 4, pr: 6 },
    function (m) {
      var o = P(m).official;
      return o.length >= 3 && (o[0].cpi - o[2].cpi) < 1.5;
    },
    function (m, H) {
      var o = P(m).official;
      return { title: 'CONTESTED SUMMIT', body:
        'The top three specimens are separated by only ' + H.n1(o[0].cpi - o[2].cpi) +
        ' CPI points. At this margin the Bureau would prefer not to be asked which is actually best.' }; });

  R('rank-bottom-outlier', 'ranking', { c: 5, pr: 6 },
    function (m) {
      var o = P(m).official, n = o.length;
      return n >= 4 && (o[n - 2].cpi - o[n - 1].cpi) >= 8;
    },
    function (m, H) {
      var o = P(m).official, n = o.length;
      return { title: 'ISOLATED FAILURE', body:
        H.spec(o[n - 1]) + ' trails the next-worst specimen by ' + H.n1(o[n - 2].cpi - o[n - 1].cpi) +
        ' CPI points. It is not merely last; it is alone.' }; });

  R('rank-mid-table-congestion', 'ranking', { c: 7, pr: 5 },
    function (m) {
      var o = P(m).official, n = o.length;
      if (n < 7) return false;
      var mid = o.slice(Math.floor(n / 3), Math.ceil(n * 2 / 3));
      return mid.length >= 3 && (mid[0].cpi - mid[mid.length - 1].cpi) < 3;
    },
    function (m, H) {
      var o = P(m).official, n = o.length;
      var mid = o.slice(Math.floor(n / 3), Math.ceil(n * 2 / 3));
      return { title: 'MID-TABLE CONGESTION', body:
        mid.length + ' specimens occupy a band just ' + H.n1(mid[0].cpi - mid[mid.length - 1].cpi) +
        ' CPI points wide. Their relative positions should not be taken personally.' }; });

  R('rank-newest-debut-high', 'ranking', { c: 4, pr: 7 },
    function (m) { var l = P(m).latest; return l && l.rank != null && l.rank <= Math.max(2, Math.ceil(P(m).n * 0.2)); },
    function (m, H) { var l = P(m).latest;
      return { title: 'HIGH DEBUT', body:
        'The most recently certified specimen, ' + H.spec(l) + ', has entered the Official Rankings at ' + H.ord(l.rank) +
        ' with a CPI of ' + H.cpi(l) + '. The Bureau notes that recency bias is a documented phenomenon.' }; });

  R('rank-newest-debut-low', 'ranking', { c: 4, pr: 6 },
    function (m) { var l = P(m).latest; return l && l.rank != null && l.rank === P(m).n && P(m).n >= 4; },
    function (m, H) { var l = P(m).latest;
      return { title: 'DEBUT AT THE FOOT', body:
        'The register\'s newest certified specimen, ' + H.spec(l) + ', has entered directly in last place at ' +
        H.cpi(l) + '. An inauspicious beginning.' }; });

  R('rank-personal-top-differs-from-official', 'ranking', { c: 5, pr: 6 },
    function (m) {
      var r = P(m).ryanOrder[0], d = P(m).devinOrder[0], o = P(m).official[0];
      return r && d && o && (r.id !== o.id || d.id !== o.id);
    },
    function (m, H) {
      var o = P(m).official[0];
      var row = P(m).rankRows.filter(function (x) { return x.view.id === o.id; })[0];
      return { title: 'OFFICIAL RANKING NOTICE', body:
        'The Official #1, ' + H.bare(o) + ', is ranked ' + H.ord(row.ryanRank) + ' by Ryan and ' + H.ord(row.devinRank) +
        ' by Devin. The Bureau reminds readers that the Index is a weighted average, not a verdict.' }; });

  R('rank-ryan-personal-summary', 'ranking', { a: 3, pr: 5 },
    function (m) { return m.auditors.ryan.top && m.auditors.ryan.n >= 3; },
    function (m, H) { var a = m.auditors.ryan;
      return { title: 'PERSONNEL FILE: RYAN', body:
        'Ryan\'s personal #1 is ' + H.spec(a.top) + ' at a weighted ' + H.n2(a.weighted.max) +
        '. His lowest is ' + H.spec(a.bottom) + ' at ' + H.n2(a.weighted.min) + '.' }; });

  R('rank-devin-personal-summary', 'ranking', { a: 3, pr: 5 },
    function (m) { return m.auditors.devin.top && m.auditors.devin.n >= 3; },
    function (m, H) { var a = m.auditors.devin;
      return { title: 'PERSONNEL FILE: DEVIN', body:
        'Devin rates ' + H.spec(a.top) + ' highest at ' + H.n2(a.weighted.max) +
        ' and ' + H.spec(a.bottom) + ' lowest at ' + H.n2(a.weighted.min) + '.' }; });

  R('rank-inversion-at-top', 'ranking', { c: 5, pr: 8, r: 'uncommon' },
    function (m) {
      return P(m).rankRows.some(function (r) { return r.officialRank <= 3 && Math.abs(r.ryanRank - r.devinRank) >= 4; });
    },
    function (m, H) {
      var row = P(m).rankRows.filter(function (r) { return r.officialRank <= 3 && Math.abs(r.ryanRank - r.devinRank) >= 4; })[0];
      return { title: 'CONTESTED PODIUM', body:
        H.spec(row.view) + ' holds ' + H.ord(row.officialRank) + ' officially, yet the auditors place it ' +
        Math.abs(row.ryanRank - row.devinRank) + ' places apart (' + H.ord(row.ryanRank) + ' / ' + H.ord(row.devinRank) +
        '). Its standing is an accident of averaging.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 8 — TIME / HISTORY / RESTAURANTS ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var DAY = 86400000;

  /* --- peer review turnaround --- */
  R('time-fastest-review', 'time', { c: 3, pr: 6 },
    function (m) { var t = m.paired.turnaround; return t.fastest && num(t.min) && t.min < 4 * 3600000; },
    function (m, H) { var v = m.paired.turnaround.fastest.item;
      return { title: 'PROCEDURAL EFFICIENCY COMMENDATION', body:
        'Peer review of ' + H.spec(v) + ' was completed in ' + H.hours(v.turnaroundMs) +
        ' — the fastest certification in Bureau history. Both auditors were, evidently, at the same table.' }; });

  R('time-slowest-review', 'time', { c: 3, pr: 7 },
    function (m) { var t = m.paired.turnaround; return t.slowest && num(t.max) && t.max > 5 * DAY; },
    function (m, H) { var v = m.paired.turnaround.slowest.item;
      return { title: 'DELAY OF RECORD', body:
        H.spec(v) + ' waited ' + H.days(v.turnaroundMs) +
        ' for peer review. The Office has filed this under "Institutional Memory" and taken no further action.' }; });

  R('time-mean-turnaround-fast', 'time', { c: 4, pr: 5, x: 'turnaround' },
    function (m) { return num(m.paired.turnaround.mean) && m.paired.turnaround.mean < DAY; },
    function (m, H) { return { title: 'REVIEW CADENCE', body:
      'Mean peer-review turnaround across the register is ' + H.hours(m.paired.turnaround.mean) +
      '. The Bureau operates with a promptness it did not anticipate and cannot explain.' }; });

  R('time-mean-turnaround-slow', 'time', { c: 4, pr: 6, x: 'turnaround' },
    function (m) { return num(m.paired.turnaround.mean) && m.paired.turnaround.mean > 2 * DAY; },
    function (m, H) { return { title: 'SYSTEMIC REVIEW DELAY', body:
      'Specimens wait an average of ' + H.days(m.paired.turnaround.mean) +
      ' between the first filing and peer review. The Office has described this internally as "the lag" and stopped short of assigning blame.' }; });

  /* --- pending backlog --- */
  R('time-pending-backlog-ryan', 'time', { p: 2, pr: 8 },
    function (m) { return m.pendingFor.ryan.length >= 2; },
    function (m, H) { var n = m.pendingFor.ryan.length;
      return { title: 'OUTSTANDING REVIEW OBLIGATIONS', body:
        'Devin currently has ' + n + ' ' + H.plural(n, 'specimen') + ' awaiting Ryan\'s peer review. ' +
        'The Office has declined to characterise this as a backlog pending legal advice.' }; },
    function (m, H) { var n = m.pendingFor.ryan.length;
      return { title: 'REVIEW NOTICE: RYAN', body:
        n + ' ' + H.plural(n, 'filing') + ' cannot be certified until Ryan files. Devin has done his part and would like that noted.' }; });

  R('time-pending-backlog-devin', 'time', { p: 2, pr: 8 },
    function (m) { return m.pendingFor.devin.length >= 2; },
    function (m, H) { var n = m.pendingFor.devin.length;
      return { title: 'OUTSTANDING REVIEW OBLIGATIONS', body:
        'Ryan currently has ' + n + ' ' + H.plural(n, 'specimen') + ' awaiting Devin\'s peer review. ' +
        'The Office has declined to characterise this as a backlog pending legal advice.' }; },
    function (m, H) { var n = m.pendingFor.devin.length;
      return { title: 'REVIEW NOTICE: DEVIN', body:
        n + ' ' + H.plural(n, 'specimen') + ' sit uncertified because Devin has not yet filed. The Composite Patty Index waits for no one, except him.' }; });

  R('time-pending-single', 'time', { p: 1, pr: 6 },
    function (m) { return m.counts.pending === 1 && m.oldestPending; },
    function (m, H) { var v = m.oldestPending;
      return { title: 'AWAITING PEER REVIEW', body:
        H.spec(v) + ' has been awaiting ' + H.name(v.missing) + "'s review for " + H.days(v.pendingAgeMs) +
        '. It has no Composite Patty Index and no official rank until he acts.' }; });

  R('time-oldest-pending-stale', 'time', { p: 1, pr: 9 },
    function (m) { return num(m.oldestPendingMs) && m.oldestPendingMs > 10 * DAY; },
    function (m, H) { var v = m.oldestPending;
      return { title: 'PROCEDURAL NEGLECT', body:
        H.spec(v) + ' has been pending peer review for ' + H.days(v.pendingAgeMs) +
        '. ' + H.name(v.missing) + ' has been notified by every means short of a subpoena.' }; },
    function (m, H) { var v = m.oldestPending;
      return { title: 'AGED FILING ALERT', body:
        'The register\'s oldest unreviewed specimen has now waited ' + H.days(v.pendingAgeMs) +
        '. The hamburger in question no longer exists in any physical form.' }; });

  R('time-no-pending', 'time', { c: 4, pr: 6 },
    function (m) { return m.counts.pending === 0 && m.counts.certified >= 4; },
    function (m, H) { return { title: 'FULL COMPLIANCE', body:
      'Every specimen in the register has completed peer review. No filing is outstanding. ' +
      'The Office of Auditor Accountability finds itself, briefly, with nothing to accuse anyone of.' }; });

  R('time-both-have-pending', 'time', { p: 2, pr: 7, r: 'uncommon' },
    function (m) { return m.pendingFor.ryan.length >= 1 && m.pendingFor.devin.length >= 1; },
    function (m, H) { return { title: 'MUTUAL DELINQUENCY', body:
      'Ryan owes ' + m.pendingFor.ryan.length + ' ' + H.plural(m.pendingFor.ryan.length, 'review') +
      ' and Devin owes ' + m.pendingFor.devin.length + '. Both auditors are simultaneously waiting on the other. ' +
      'The Bureau regards this as the natural equilibrium.' }; });

  /* --- activity cadence --- */
  R('time-long-inactivity', 'time', { c: 2, pr: 7 },
    function (m) { return num(m.activity.sinceLastMs) && m.activity.sinceLastMs > 21 * DAY; },
    function (m, H) { return { title: 'BUREAUCRATIC DORMANCY', body:
      'No specimen has been filed for ' + H.days(m.activity.sinceLastMs) +
      '. The Office of Auditor Accountability continues to operate at full cost.' }; });

  R('time-recent-activity', 'time', { c: 2, pr: 4 },
    function (m) { return num(m.activity.sinceLastMs) && m.activity.sinceLastMs < 2 * DAY; },
    function (m, H) { return { title: 'ACTIVE CASELOAD', body:
      'A specimen was filed within the last ' + H.hours(m.activity.sinceLastMs) +
      '. The register is currently in an operational phase, which historically does not last.' }; });

  R('time-longest-gap', 'time', { c: 5, pr: 5 },
    function (m) { return num(m.activity.longestGapMs) && m.activity.longestGapMs > 14 * DAY; },
    function (m, H) { return { title: 'HISTORICAL DORMANCY', body:
      'The longest gap between filings in Bureau history is ' + H.days(m.activity.longestGapMs) +
      '. No explanation was ever entered into the record.' }; });

  R('time-burst-activity', 'time', { c: 4, pr: 6 },
    function (m) {
      var g = m.activity.gaps.filter(function (x) { return x < DAY; });
      return g.length >= 2;
    },
    function (m, H) {
      var g = m.activity.gaps.filter(function (x) { return x < DAY; });
      return { title: 'ACTIVITY BURST DETECTED', body:
        'On ' + H.times(g.length) + ', two specimens were filed within a single day of each other. ' +
        'The Bureau does not require auditors to pace themselves and is beginning to wonder if it should.' }; });

  R('time-first-vs-latest', 'time', { c: 5, pr: 6 },
    function (m) {
      var f = m.paired.first, l = m.paired.latest;
      return f && l && f.id !== l.id && num(f.cpi) && num(l.cpi) && Math.abs(l.cpi - f.cpi) > 8;
    },
    function (m, H) {
      var f = m.paired.first, l = m.paired.latest;
      var dir = l.cpi > f.cpi ? 'improved' : 'declined';
      return { title: 'REGISTER TRAJECTORY', body:
        'The Bureau\'s first certified specimen scored ' + H.cpi(f) + '. Its most recent scored ' + H.cpi(l) +
        '. Hamburger selection has ' + dir + ' by ' + H.abs1(l.cpi - f.cpi) + ' points, or the auditors have.' }; });

  R('time-register-age', 'time', { c: 3, pr: 4 },
    function (m) {
      var f = m.paired.first;
      return f && num(f.createdTs) && (Date.now() - f.createdTs) > 30 * DAY;
    },
    function (m, H) {
      var f = m.paired.first;
      return { title: 'INSTITUTIONAL LONGEVITY', body:
        'The Bureau has been in continuous operation for ' + H.days(Date.now() - f.createdTs) +
        ' and has certified ' + m.counts.certified + ' ' + H.plural(m.counts.certified, 'specimen') + '. ' +
        'Productivity metrics have not been published.' }; });

  R('time-review-faster-over-time', 'time', { c: 6, pr: 6 },
    function (m) {
      var t = m.paired.views.map(function (v) { return v.turnaroundMs; }).filter(num);
      if (t.length < 6) return false;
      var h = Math.floor(t.length / 2);
      return m.stats.mean(t.slice(0, h)) - m.stats.mean(t.slice(-h)) > DAY / 2;
    },
    function (m, H) {
      var t = m.paired.views.map(function (v) { return v.turnaroundMs; }).filter(num);
      var h = Math.floor(t.length / 2);
      return { title: 'IMPROVING RESPONSIVENESS', body:
        'Mean peer-review turnaround has fallen from ' + H.days(m.stats.mean(t.slice(0, h))) + ' to ' +
        H.days(m.stats.mean(t.slice(-h))) + '. The Bureau is becoming alarmingly functional.' }; });

  R('time-review-slower-over-time', 'time', { c: 6, pr: 6 },
    function (m) {
      var t = m.paired.views.map(function (v) { return v.turnaroundMs; }).filter(num);
      if (t.length < 6) return false;
      var h = Math.floor(t.length / 2);
      return m.stats.mean(t.slice(-h)) - m.stats.mean(t.slice(0, h)) > DAY / 2;
    },
    function (m, H) {
      var t = m.paired.views.map(function (v) { return v.turnaroundMs; }).filter(num);
      var h = Math.floor(t.length / 2);
      return { title: 'DECLINING RESPONSIVENESS', body:
        'Peer review now takes ' + H.days(m.stats.mean(t.slice(-h))) + ' on average, up from ' +
        H.days(m.stats.mean(t.slice(0, h))) + ' in the register\'s early period. Enthusiasm is a depreciating asset.' }; });

  R('time-same-day-certifications', 'time', { c: 4, pr: 6 },
    function (m) {
      return m.paired.views.filter(function (v) { return num(v.turnaroundMs) && v.turnaroundMs < 6 * 3600000; }).length >= 3;
    },
    function (m, H) {
      var n = m.paired.views.filter(function (v) { return num(v.turnaroundMs) && v.turnaroundMs < 6 * 3600000; }).length;
      return { title: 'SIMULTANEOUS EXAMINATION PATTERN', body:
        n + ' specimens were peer-reviewed within six hours of the initial filing. ' +
        'The Bureau requires independent audits and has never specified that they occur in different postcodes.' }; });

  /* --- restaurants --- */
  R('rest-repeat-establishment', 'restaurants', { c: 3, pr: 6 },
    function (m) { return m.counts.repeatRestaurants >= 1; },
    function (m, H) {
      var r = m.repeatRestaurants[0];
      return { title: 'REPEAT ESTABLISHMENT', body:
        r.name + ' has now been examined ' + H.times(r.count) + ', averaging a CPI of ' + H.n1(r.meanCPI) +
        '. The Bureau notes that returning to an establishment constitutes an endorsement it did not authorise.' }; });

  R('rest-strongest', 'restaurants', { c: 5, pr: 7, x: 'rest-standing' },
    function (m) { return m.topRestaurant && m.topRestaurant.count >= 2; },
    function (m, H) { var r = m.topRestaurant;
      return { title: 'LEADING ESTABLISHMENT', body:
        r.name + ' holds the highest mean Composite Patty Index of any repeat establishment at ' + H.n1(r.meanCPI) +
        ' across ' + r.count + ' specimens. A certificate has been drafted and not sent.' }; });

  R('rest-weakest', 'restaurants', { c: 5, pr: 7, x: 'rest-standing' },
    function (m) { return m.worstRestaurant && m.worstRestaurant.count >= 2 && m.topRestaurant && m.worstRestaurant.key !== m.topRestaurant.key; },
    function (m, H) { var r = m.worstRestaurant;
      return { title: 'ESTABLISHMENT UNDER REVIEW', body:
        r.name + ' averages ' + H.n1(r.meanCPI) + ' CPI across ' + r.count + ' specimens, the weakest repeat record in the register. ' +
        'The auditors have nonetheless returned, which the Office regards as evidence against them rather than the restaurant.' }; });

  R('rest-auditor-preference', 'restaurants', { c: 4, pr: 7 },
    function (m) { return m.repeatRestaurants.some(function (r) { return gt(Math.abs(r.gap), 0.5); }); },
    function (m, H) {
      var r = m.repeatRestaurants.filter(function (x) { return gt(Math.abs(x.gap), 0.5); })[0];
      var who = r.gap > 0 ? 'ryan' : 'devin';
      return { title: 'ESTABLISHMENT-SPECIFIC BIAS', body:
        'At ' + r.name + ', ' + H.name(who) + ' scores ' + H.abs2(r.gap) + ' points higher than ' + H.other(who) +
        ' on average. The Bureau has considered whether one of them is friendly with staff.' }; });

  R('rest-many-establishments', 'restaurants', { c: 6, pr: 5 },
    function (m) { return m.counts.restaurants >= 6 && m.counts.repeatRestaurants === 0; },
    function (m, H) { return { title: 'SAMPLING BREADTH NOTICE', body:
      m.counts.restaurants + ' distinct establishments, not one visited twice. ' +
      'The Bureau commends the breadth and observes that nothing has been verified.' }; });

  R('rest-concentration', 'restaurants', { c: 6, pr: 6 },
    function (m) {
      if (!m.restaurants.length) return false;
      return (m.restaurants[0].count / m.counts.certified) > 0.35 && m.restaurants[0].count >= 3;
    },
    function (m, H) {
      var r = m.restaurants[0];
      return { title: 'SAMPLING CONCENTRATION WARNING', body:
        H.pct((r.count / m.counts.certified) * 100) + ' of all certified specimens originate from ' + r.name +
        '. The Bureau\'s findings should be understood as largely a description of one kitchen.' }; });

  R('rest-best-single-specimen', 'restaurants', { c: 4, pr: 5 },
    function (m) { return m.paired.official.length >= 3; },
    function (m, H) {
      var top = m.paired.official[0];
      return { title: 'ESTABLISHMENT OF RECORD', body:
        'The highest Composite Patty Index yet recorded, ' + H.cpi(top) + ', belongs to ' + top.restaurant +
        ' for its ' + top.burger + '. No establishment has been asked to comment.' }; });

  R('rest-consistency-champion', 'restaurants', { c: 6, pr: 6 },
    function (m) { return m.repeatRestaurants.some(function (r) { return r.count >= 3 && lt(r.sdCPI, 2); }); },
    function (m, H) {
      var r = m.repeatRestaurants.filter(function (x) { return x.count >= 3 && lt(x.sdCPI, 2); })[0];
      return { title: 'COMMENDATION FOR OPERATIONAL CONSISTENCY', body:
        r.name + ' has produced ' + r.count + ' specimens with a CPI standard deviation of just ' + H.n2(r.sdCPI) +
        '. Whatever they are doing, they do it the same way every time.' }; });

  R('rest-gap-vs-register', 'restaurants', { c: 6, pr: 6 },
    function (m) {
      return m.repeatRestaurants.some(function (r) { return num(r.meanCPI) && num(m.paired.cpi.mean) && (r.meanCPI - m.paired.cpi.mean) > 6; });
    },
    function (m, H) {
      var r = m.repeatRestaurants.filter(function (x) { return (x.meanCPI - m.paired.cpi.mean) > 6; })[0];
      return { title: 'OUTPERFORMANCE NOTICE', body:
        r.name + ' averages ' + H.n1(r.meanCPI - m.paired.cpi.mean) + ' CPI points above the register mean. ' +
        'The Office has not investigated why and does not intend to.' }; });

  R('rest-underperformance', 'restaurants', { c: 6, pr: 6 },
    function (m) {
      return m.repeatRestaurants.some(function (r) { return num(r.meanCPI) && num(m.paired.cpi.mean) && (m.paired.cpi.mean - r.meanCPI) > 6; });
    },
    function (m, H) {
      var r = m.repeatRestaurants.filter(function (x) { return (m.paired.cpi.mean - x.meanCPI) > 6; })[0];
      return { title: 'UNDERPERFORMANCE NOTICE', body:
        r.name + ' trails the register mean by ' + H.n1(m.paired.cpi.mean - r.meanCPI) +
        ' CPI points across ' + r.count + ' visits. Two visits is a pattern; three is a decision.' }; });

  R('rest-single-visit-majority', 'restaurants', { c: 5, pr: 4 },
    function (m) {
      var singles = m.restaurants.filter(function (r) { return r.count === 1; }).length;
      return m.restaurants.length >= 4 && (singles / m.restaurants.length) > 0.7;
    },
    function (m, H) {
      var singles = m.restaurants.filter(function (r) { return r.count === 1; }).length;
      return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
        singles + ' of ' + m.restaurants.length + ' establishments have been visited exactly once. ' +
        'Their entire reputation with this Bureau rests on a single afternoon.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 9 — INDIVIDUAL SPECIMENS ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;

  function board(m, c) { return m.categoryBoard[c]; }

  /* --- best / worst in each category, each with its own voice --- */
  R('spec-best-patty', 'specimens', { c: 3, pr: 6, x: 'cat-best' },
    function (m) { return board(m, 'patty').best && gt(board(m, 'patty').bestValue, 8.5); },
    function (m, H) { var b = board(m, 'patty');
      return { title: 'PATTY OF RECORD', body:
        'The finest patty in the register belongs to ' + H.spec(b.best) + ' at a combined ' + H.n1(b.bestValue) +
        '. It is the reference against which all future meat will be judged.' }; });

  R('spec-worst-patty', 'specimens', { c: 4, pr: 6, x: 'cat-worst' },
    function (m) { return board(m, 'patty').worst && lt(board(m, 'patty').worstValue, 6.5); },
    function (m, H) { var b = board(m, 'patty');
      return { title: 'PATTY DEFICIENCY OF RECORD', body:
        H.spec(b.worst) + ' holds the register\'s lowest patty score at ' + H.n1(b.worstValue) +
        '. Since Patty carries 30% of the Index, this single failure did most of the damage.' }; });

  R('spec-best-bun', 'specimens', { c: 3, pr: 5, x: 'cat-best' },
    function (m) { return board(m, 'bun').best && gt(board(m, 'bun').bestValue, 8.5); },
    function (m, H) { var b = board(m, 'bun');
      return { title: 'BUN OF RECORD', body:
        'The highest-rated bun on file belongs to ' + H.spec(b.best) + ' (' + H.n1(b.bestValue) +
        '). The Bureau rarely gets to praise bread and has taken the opportunity.' }; });

  R('spec-worst-bun', 'specimens', { c: 4, pr: 5, x: 'cat-worst' },
    function (m) { return board(m, 'bun').worst && lt(board(m, 'bun').worstValue, 6.5); },
    function (m, H) { var b = board(m, 'bun');
      return { title: 'STRUCTURAL FAILURE ON RECORD', body:
        H.spec(b.worst) + ' recorded the register\'s worst bun at ' + H.n1(b.worstValue) +
        '. The Office has no photographs and has decided that is for the best.' }; });

  R('spec-best-fries', 'specimens', { c: 3, pr: 5, x: 'cat-best' },
    function (m) { return board(m, 'fries').best && gt(board(m, 'fries').bestValue, 8.5); },
    function (m, H) { var b = board(m, 'fries');
      return { title: 'ACCOMPANIMENT EXCELLENCE', body:
        'The best fries in the register accompany ' + H.spec(b.best) + ', at ' + H.n1(b.bestValue) +
        '. In a category this consistently disappointing, the achievement should be recorded.' }; });

  R('spec-worst-fries', 'specimens', { c: 4, pr: 6, x: 'cat-worst' },
    function (m) { return board(m, 'fries').worst && lt(board(m, 'fries').worstValue, 6.0); },
    function (m, H) { var b = board(m, 'fries');
      return { title: 'FRY EMERGENCY', body:
        H.spec(b.worst) + ' produced the worst fries yet recorded (' + H.n1(b.worstValue) +
        '). Investigators are attempting to determine what happened in that kitchen.' }; });

  R('spec-best-value', 'specimens', { c: 3, pr: 5, x: 'cat-best' },
    function (m) { return board(m, 'value').best && gt(board(m, 'value').bestValue, 8.5); },
    function (m, H) { var b = board(m, 'value');
      return { title: 'ECONOMIC COMMENDATION', body:
        H.spec(b.best) + ' holds the register\'s best Value rating at ' + H.n1(b.bestValue) +
        '. Both auditors briefly felt they had got away with something.' }; });

  R('spec-worst-value', 'specimens', { c: 4, pr: 6, x: 'cat-worst' },
    function (m) { return board(m, 'value').worst && lt(board(m, 'value').worstValue, 6.0); },
    function (m, H) { var b = board(m, 'value');
      return { title: 'PRICING GRIEVANCE ON RECORD', body:
        'The worst Value score in Bureau history, ' + H.n1(b.worstValue) + ', belongs to ' + H.spec(b.worst) +
        '. The auditors paid it anyway and have never fully recovered.' }; });

  R('spec-best-condiments', 'specimens', { c: 3, pr: 5, x: 'cat-best' },
    function (m) { return board(m, 'condiments').best && gt(board(m, 'condiments').bestValue, 8.5); },
    function (m, H) { var b = board(m, 'condiments');
      return { title: 'TOPPINGS COMMENDATION', body:
        H.spec(b.best) + ' leads the register for Condiments / Toppings at ' + H.n1(b.bestValue) +
        '. Somebody in that kitchen is making decisions.' }; });

  R('spec-worst-condiments', 'specimens', { c: 4, pr: 5, x: 'cat-worst' },
    function (m) { return board(m, 'condiments').worst && lt(board(m, 'condiments').worstValue, 6.0); },
    function (m, H) { var b = board(m, 'condiments');
      return { title: 'CONDIMENT-RELATED OFFENCE', body:
        H.spec(b.worst) + ' recorded the lowest Condiments score in the register (' + H.n1(b.worstValue) +
        '). The Bureau treats condiment failure as a choice rather than an accident.' }; });

  R('spec-best-flavor', 'specimens', { c: 3, pr: 6, x: 'cat-best' },
    function (m) { return board(m, 'overallFlavor').best && gt(board(m, 'overallFlavor').bestValue, 8.5); },
    function (m, H) { var b = board(m, 'overallFlavor');
      return { title: 'PEAK FLAVOR ON RECORD', body:
        H.spec(b.best) + ' holds the highest Overall Flavor rating at ' + H.n1(b.bestValue) +
        '. At 25% of the Index, this is the second most consequential number a hamburger can earn.' }; });

  R('spec-worst-flavor', 'specimens', { c: 4, pr: 6, x: 'cat-worst' },
    function (m) { return board(m, 'overallFlavor').worst && lt(board(m, 'overallFlavor').worstValue, 6.0); },
    function (m, H) { var b = board(m, 'overallFlavor');
      return { title: 'FLAVOR DEFICIENCY', body:
        'The register\'s weakest Overall Flavor score, ' + H.n1(b.worstValue) + ', belongs to ' + H.spec(b.worst) +
        '. Both auditors were present and both were disappointed.' }; });

  /* --- structural oddities within one specimen --- */
  R('spec-elite-bad-fries', 'specimens', { c: 5, pr: 8, r: 'uncommon' },
    function (m) {
      return m.certified.some(function (v) { return v.rank != null && v.rank <= 3 && v.combined.fries < 6.5; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.rank != null && x.rank <= 3 && x.combined.fries < 6.5; })[0];
      return { title: 'FRY EMERGENCY', body:
        'The current ' + H.ord(v.rank) + ' specimen, ' + H.spec(v) + ', carries a Fries score of just ' + H.n1(v.combined.fries) +
        '. Investigators are attempting to determine how it got this far.' }; });

  R('spec-bad-burger-great-bun', 'specimens', { c: 5, pr: 8, r: 'uncommon' },
    function (m) {
      return m.certified.some(function (v) { return v.cpi < 70 && v.combined.bun >= 8.5; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.cpi < 70 && x.combined.bun >= 8.5; })[0];
      return { title: 'ANOMALOUS COMPONENT', body:
        H.spec(v) + ' scored a Composite Patty Index of only ' + H.cpi(v) + ' while posting a bun rating of ' + H.n1(v.combined.bun) +
        '. Somewhere in that establishment is one employee doing excellent work in isolation.' }; });

  R('spec-flavor-exceeds-patty', 'specimens', { c: 4, pr: 7 },
    function (m) {
      return m.certified.some(function (v) { return (v.combined.overallFlavor - v.combined.patty) >= 1.2; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return (x.combined.overallFlavor - x.combined.patty) >= 1.2; })[0];
      return { title: 'GREATER THAN THE SUM OF PARTS', body:
        H.spec(v) + ' rates ' + H.n1(v.combined.overallFlavor - v.combined.patty) +
        ' points higher on Overall Flavor than on Patty. The whole exceeds its central component, which the Bureau finds philosophically troubling.' }; });

  R('spec-patty-exceeds-flavor', 'specimens', { c: 4, pr: 7 },
    function (m) {
      return m.certified.some(function (v) { return (v.combined.patty - v.combined.overallFlavor) >= 1.2; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return (x.combined.patty - x.combined.overallFlavor) >= 1.2; })[0];
      return { title: 'ASSEMBLY FAILURE', body:
        'On ' + H.spec(v) + ', the Patty outscores Overall Flavor by ' + H.n1(v.combined.patty - v.combined.overallFlavor) +
        ' points. An excellent piece of meat has been let down by everything around it.' }; });

  R('spec-fries-beat-patty', 'specimens', { c: 4, pr: 7 },
    function (m) { return m.certified.some(function (v) { return v.combined.fries > v.combined.patty; }); },
    function (m, H) {
      var list = m.certified.filter(function (x) { return x.combined.fries > x.combined.patty; });
      return { title: 'OFFICE OF INTERNAL AFFAIRS', body:
        'On ' + H.times(list.length) + ', the fries have outscored the patty. Most recently: ' + H.spec(list[list.length - 1]) +
        '. No statute explicitly prohibits this.' }; });

  R('spec-category-winner-loser', 'specimens', { c: 5, pr: 8, r: 'uncommon' },
    function (m) {
      return m.certified.some(function (v) {
        if (v.best.combined !== 'patty') return false;
        var others = K.filter(function (c) { return c !== 'patty'; });
        return others.every(function (c) { return v.combined[c] < m.categoryBoard[c].mean; });
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) {
        if (x.best.combined !== 'patty') return false;
        return K.filter(function (c) { return c !== 'patty'; }).every(function (c) { return x.combined[c] < m.categoryBoard[c].mean; });
      })[0];
      return { title: 'ONE-DIMENSIONAL SPECIMEN', body:
        H.spec(v) + ' wins on Patty and falls below the register average in every other category. ' +
        'It is, in the Bureau\'s formal terminology, a good burger surrounded by disappointments.' }; });

  R('spec-flat-profile', 'specimens', { c: 4, pr: 6 },
    function (m) { return m.certified.some(function (v) { return num(v.combinedSpread) && v.combinedSpread < 0.6; }); },
    function (m, H) {
      var v = m.certified.filter(function (x) { return num(x.combinedSpread) && x.combinedSpread < 0.6; })[0];
      return { title: 'UNIFORM SPECIMEN', body:
        'All six of ' + H.bare(v) + "'s category scores fall within " + H.n1(v.combinedSpread) +
        ' points of each other. A hamburger of remarkable internal agreement.' }; });

  R('spec-jagged-profile', 'specimens', { c: 4, pr: 6 },
    function (m) { return m.certified.some(function (v) { return gt(v.combinedSpread, 3.5); }); },
    function (m, H) {
      var v = m.certified.filter(function (x) { return gt(x.combinedSpread, 3.5); })[0];
      return { title: 'ERRATIC SPECIMEN PROFILE', body:
        H.spec(v) + ' spans ' + H.n1(v.combinedSpread) + ' points between its strongest category (' + H.cat(v.best.combined) +
        ') and its weakest (' + H.cat(v.worst.combined) + '). Parts of this hamburger were made by different people with different goals.' }; });

  R('spec-highest-cpi', 'specimens', { c: 3, pr: 7, x: 'cpi-extreme' },
    function (m) { return m.paired.official.length >= 3 && num(m.paired.cpi.max); },
    function (m, H) {
      var v = m.paired.official[0];
      return { title: 'REGISTER LEADER', body:
        H.spec(v) + ' holds the highest Composite Patty Index on record at ' + H.cpi(v) +
        '. Specimen ' + v.specimen + ' remains the standard.' }; });

  R('spec-lowest-cpi', 'specimens', { c: 3, pr: 7, x: 'cpi-extreme' },
    function (m) { return m.paired.official.length >= 3 && lt(m.paired.cpi.min, 70); },
    function (m, H) {
      var v = m.paired.official[m.paired.official.length - 1];
      return { title: 'ADVERSE FINDING OF RECORD', body:
        H.spec(v) + ' holds the lowest Composite Patty Index in the register at ' + H.cpi(v) +
        '. It remains certified, because certification reflects procedure rather than quality.' }; });

  R('spec-certified-but-bad', 'specimens', { c: 3, pr: 7 },
    function (m) { return m.certified.some(function (v) { return v.cpi < 60; }); },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.cpi < 60; })[0];
      return { title: 'CERTIFICATION CLARIFICATION', body:
        H.spec(v) + ' is fully CERTIFIED with a Composite Patty Index of ' + H.cpi(v) +
        '. The Bureau reminds readers that certification confirms both auditors filed, not that anyone enjoyed themselves.' }; });

  R('spec-both-loved', 'specimens', { c: 3, pr: 6 },
    function (m) { return m.certified.some(function (v) { return v.weighted.ryan >= 9 && v.weighted.devin >= 9; }); },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.weighted.ryan >= 9 && x.weighted.devin >= 9; })[0];
      return { title: 'JOINT COMMENDATION', body:
        'Both auditors independently issued weighted scores above 9.0 for ' + H.spec(v) +
        '. Instances of shared enthusiasm are recorded because they are rare.' }; });

  R('spec-both-hated', 'specimens', { c: 3, pr: 6 },
    function (m) { return m.certified.some(function (v) { return v.weighted.ryan < 6 && v.weighted.devin < 6; }); },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.weighted.ryan < 6 && x.weighted.devin < 6; })[0];
      return { title: 'JOINT CONDEMNATION', body:
        'Both auditors scored ' + H.spec(v) + ' below 6.0. The Bureau notes that unanimity is easier to achieve in adversity.' }; });

  R('spec-most-recent-summary', 'specimens', { c: 2, pr: 5 },
    function (m) { return m.paired.latest && num(m.paired.latest.cpi); },
    function (m, H) { var v = m.paired.latest;
      return { title: 'MOST RECENT CERTIFICATION', body:
        'Specimen ' + v.specimen + ', ' + H.spec(v) + ', certified at ' + H.cpi(v) + ' CPI and entered the register at ' +
        H.ord(v.rank) + ' of ' + m.counts.certified + '.' }; });

  R('spec-above-average-count', 'specimens', { c: 5, pr: 4 },
    function (m) { return num(m.paired.cpi.mean); },
    function (m, H) {
      var above = m.certified.filter(function (v) { return v.cpi > m.paired.cpi.mean; }).length;
      return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
        above + ' of ' + m.counts.certified + ' certified specimens score above the register mean of ' + H.n1(m.paired.cpi.mean) +
        '. This is approximately what a mean is, and the Bureau has published it regardless.' }; });

  R('spec-value-vs-rank-mismatch', 'specimens', { c: 6, pr: 7, r: 'uncommon' },
    function (m) {
      return m.certified.some(function (v) { return v.rank != null && v.rank > m.counts.certified * 0.6 && v.combined.value >= 8.8; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.rank != null && x.rank > m.counts.certified * 0.6 && x.combined.value >= 8.8; })[0];
      return { title: 'ECONOMIC ANOMALY', body:
        H.spec(v) + ' ranks ' + H.ord(v.rank) + ' overall yet posts a Value score of ' + H.n1(v.combined.value) +
        '. It is a poor hamburger that both auditors nevertheless consider fairly priced. This may be the most damning finding available.' }; });

  R('spec-premium-poor-value', 'specimens', { c: 5, pr: 7 },
    function (m) {
      return m.certified.some(function (v) { return v.rank != null && v.rank <= 3 && v.combined.value < 7; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.rank != null && x.rank <= 3 && x.combined.value < 7; })[0];
      return { title: 'PREMIUM PRICING NOTICE', body:
        H.spec(v) + ' sits at ' + H.ord(v.rank) + ' in the register despite a Value rating of only ' + H.n1(v.combined.value) +
        '. Excellence has been achieved and invoiced.' }; });

  R('spec-turnaround-outlier', 'specimens', { c: 5, pr: 5 },
    function (m) {
      var t = m.paired.turnaround;
      return num(t.max) && num(t.median) && t.max > t.median * 4;
    },
    function (m, H) {
      var v = m.paired.turnaround.slowest.item;
      return { title: 'OUTLIER FILING', body:
        H.spec(v) + ' took ' + H.days(v.turnaroundMs) + ' to certify, against a register median of ' +
        H.days(m.paired.turnaround.median) + '. Something happened and it was not recorded.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== BATCH 10 — REGULATORY / PERFORMANCE REVIEW ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;
  function A(m, k) { return m.auditors[k]; }

  R('reg-audit-volume-imbalance', 'regulatory', { a: 3, pr: 7 },
    function (m) { return Math.abs(m.counts.ryanAudits - m.counts.devinAudits) >= 2; },
    function (m, H) {
      var who = m.counts.ryanAudits > m.counts.devinAudits ? 'ryan' : 'devin';
      return { title: 'WORKLOAD IRREGULARITY', body:
        H.name(who) + ' has filed ' + Math.max(m.counts.ryanAudits, m.counts.devinAudits) + ' audits against ' +
        H.other(who) + "'s " + Math.min(m.counts.ryanAudits, m.counts.devinAudits) +
        '. The Office has noted the disparity in a file that no one reads.' }; });

  R('reg-audit-volume-equal', 'regulatory', { a: 4, pr: 5 },
    function (m) { return m.counts.ryanAudits === m.counts.devinAudits && m.counts.ryanAudits >= 4; },
    function (m, H) { return { title: 'COMMENDATION FOR PARITY', body:
      'Both auditors have filed exactly ' + m.counts.ryanAudits + ' audits. ' +
      'The Bureau recognises balanced participation and has nothing further to add.' }; });

  R('reg-certification-rate', 'regulatory', { c: 3, pr: 6 },
    function (m) { return m.counts.burgers >= 4 && (m.counts.certified / m.counts.burgers) < 0.75; },
    function (m, H) {
      var rate = (m.counts.certified / m.counts.burgers) * 100;
      return { title: 'CERTIFICATION RATE ADVISORY', body:
        'Only ' + H.pct(rate) + ' of filed specimens have achieved certification (' + m.counts.certified + ' of ' + m.counts.burgers +
        '). The remainder await peer review and the Bureau is not naming anyone.' }; });

  R('reg-perfect-certification', 'regulatory', { c: 5, pr: 6 },
    function (m) { return m.counts.pending === 0 && m.counts.certified === m.counts.burgers && m.counts.burgers >= 5; },
    function (m, H) { return { title: 'COMMENDATION FOR PROCEDURAL COMPLIANCE', body:
      'All ' + m.counts.burgers + ' specimens on file have completed peer review. ' +
      'A 100% certification rate. The Office of Auditor Accountability is briefly without purpose.' }; });

  R('reg-statistical-misconduct', 'regulatory', { c: 6, pr: 7, r: 'uncommon' },
    function (m) { return gt(m.paired.exactPct, 30) && lt(m.paired.meanAbsDisagreement, 0.3); },
    function (m, H) { return { title: 'INVESTIGATION: AUDIT INDEPENDENCE', body:
      'Exact score matches in ' + H.pct(m.paired.exactPct) + ' of cells, with mean disagreement of just ' +
      H.n2(m.paired.meanAbsDisagreement) + '. The Bureau requires independent audits and is formally asking whether it is receiving them.' }; });

  R('reg-calibration-failure-notice', 'regulatory', { c: 6, pr: 8 },
    function (m) { return gt(Math.abs(m.paired.gap), 0.6) && gt(m.paired.meanAbsDisagreement, 0.6); },
    function (m, H) {
      var who = m.paired.moreGenerous;
      return { title: 'FORMAL CALIBRATION FAILURE', body:
        'The Bureau records a generosity gap of ' + H.abs2(m.paired.gap) + ' points combined with mean disagreement of ' +
        H.n2(m.paired.meanAbsDisagreement) + '. ' + H.name(who) + ' and ' + H.other(who) +
        ' are not merely disagreeing; they are operating different instruments.' }; });

  R('reg-commendation-procedural-excellence', 'regulatory', { c: 6, pr: 6 },
    function (m) { return lt(Math.abs(m.paired.gap), 0.15) && lt(m.paired.meanAbsDisagreement, 0.4) && m.counts.pending === 0; },
    function (m, H) { return { title: 'COMMENDATION FOR PROCEDURAL EXCELLENCE', body:
      'Close calibration, low disagreement and no outstanding reviews. ' +
      'The Bureau has reviewed the conduct of both auditors and, with visible reluctance, found it satisfactory.' }; });

  R('reg-scale-abuse-warning', 'regulatory', { a: 6, pr: 7 },
    function (m) { return lt(A(m, 'ryan').scores.sd, 0.6) || lt(A(m, 'devin').scores.sd, 0.6); },
    function (m, H) {
      var who = (A(m, 'ryan').scores.sd || 9) < (A(m, 'devin').scores.sd || 9) ? 'ryan' : 'devin';
      return { title: 'NOTICE OF UNDERUTILISED INSTRUMENT', body:
        H.name(who) + ' operates within a standard deviation of ' + H.n2(A(m, who).scores.sd) +
        '. The Bureau issued a ten-point scale in tenths, comprising 101 values, and is entitled to ask why most remain unused.' }; });

  R('reg-emergency-hearing', 'regulatory', { c: 5, pr: 9, r: 'rare' },
    function (m) { return m.paired.biggestCellValue >= 3; },
    function (m, H) {
      var v = m.paired.biggestCellDisagreement, c = v.maxAbsDeltaCat;
      return { title: 'EMERGENCY HEARING CONVENED', body:
        'A category disagreement of ' + H.n1(v.maxAbsDelta) + ' points has been recorded on ' + H.cat(c) +
        ' for ' + H.spec(v) + '. Under Bureau procedure, a gap of three points or more triggers a hearing. ' +
        'The hearing will be chaired by nobody and minuted by no one.' }; });

  R('reg-audit-irregularity', 'regulatory', { c: 4, pr: 7, r: 'uncommon' },
    function (m) {
      return m.certified.some(function (v) { return v.spread.ryan === 0 || v.spread.devin === 0; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.spread.ryan === 0 || x.spread.devin === 0; })[0];
      var who = v.spread.ryan === 0 ? 'ryan' : 'devin';
      return { title: 'AUDIT IRREGULARITY', body:
        'On ' + H.spec(v) + ', ' + H.name(who) + ' entered the identical score in all six categories. ' +
        'The Bureau provides six categories on the assumption that they differ.' }; });

  R('reg-compliance-notice-pending', 'regulatory', { p: 1, pr: 7 },
    function (m) { return m.counts.pending >= 1; },
    function (m, H) {
      var who = m.pendingFor.ryan.length >= m.pendingFor.devin.length ? 'ryan' : 'devin';
      var n = Math.max(m.pendingFor.ryan.length, m.pendingFor.devin.length);
      if (!n) return { title: 'COMPLIANCE NOTICE', body: 'Specimens remain pending peer review.' };
      return { title: 'COMPLIANCE NOTICE', body:
        H.name(who) + ' is the limiting factor on ' + n + ' ' + H.plural(n, 'certification') +
        '. The Bureau does not issue penalties and has occasionally regretted that.' }; });

  R('reg-perf-review-generosity', 'regulatory', { c: 5, pr: 6 },
    function (m) { return num(m.paired.gap); },
    function (m, H) {
      var who = m.paired.moreGenerous || 'ryan';
      var idx = 50 + (m.paired.gap * 25);
      return { title: 'AUDITOR PERFORMANCE REVIEW', body:
        'BPS Generosity Index: Ryan ' + H.n1(Math.max(0, Math.min(100, idx))) + ', Devin ' +
        H.n1(Math.max(0, Math.min(100, 100 - idx))) + '. A score of 50 denotes perfect neutrality. ' +
        'The scale was calibrated by dividing something by something else.' }; });

  R('reg-perf-review-calibration', 'regulatory', { c: 5, pr: 6 },
    function (m) { return num(m.paired.meanAbsDisagreement); },
    function (m, H) {
      var eff = Math.max(0, 100 - m.paired.meanAbsDisagreement * 40);
      return { title: 'AUDITOR PERFORMANCE REVIEW', body:
        'Joint BPS Calibration Efficiency stands at ' + H.pct(eff, 1) + '. ' +
        'The Bureau invented this metric approximately fourteen milliseconds ago and intends to cite it indefinitely.' }; });

  R('reg-perf-review-specialization', 'regulatory', { a: 5, pr: 5 },
    function (m) { return A(m, 'ryan').bestCat && A(m, 'devin').bestCat; },
    function (m, H) { return { title: 'CATEGORY SPECIALIZATION REGISTRY', body:
      'The Bureau records Ryan as specialising in ' + H.cat(A(m, 'ryan').bestCat) + ' and Devin in ' +
      H.cat(A(m, 'devin').bestCat) + '. Neither auditor requested a specialisation, and neither may resign it.' }; });

  R('reg-violation-fries-over-patty', 'regulatory', { c: 4, pr: 7 },
    function (m) {
      var count = m.certified.filter(function (v) { return v.scores.ryan && Number(v.scores.ryan.fries) > Number(v.scores.ryan.patty); }).length;
      return count >= 3;
    },
    function (m, H) {
      var count = m.certified.filter(function (v) { return v.scores.ryan && Number(v.scores.ryan.fries) > Number(v.scores.ryan.patty); }).length;
      return { title: 'OFFICE OF INTERNAL AFFAIRS', body:
        'Ryan has rated Fries higher than Patty on ' + count + ' occasions. No statute explicitly prohibits this.' }; });

  R('reg-violation-fries-over-patty-devin', 'regulatory', { c: 4, pr: 7 },
    function (m) {
      var count = m.certified.filter(function (v) { return v.scores.devin && Number(v.scores.devin.fries) > Number(v.scores.devin.patty); }).length;
      return count >= 3;
    },
    function (m, H) {
      var count = m.certified.filter(function (v) { return v.scores.devin && Number(v.scores.devin.fries) > Number(v.scores.devin.patty); }).length;
      return { title: 'OFFICE OF INTERNAL AFFAIRS', body:
        'Devin has placed Fries above Patty ' + H.times(count) + '. The Bureau weights Patty at three times the value of Fries ' +
        'and finds this behaviour difficult to reconcile with that.' }; });

  R('reg-notice-bun-above-patty', 'regulatory', { c: 4, pr: 6 },
    function (m) {
      return m.certified.filter(function (v) { return v.combined.bun > v.combined.patty; }).length >= 3;
    },
    function (m, H) {
      var n = m.certified.filter(function (v) { return v.combined.bun > v.combined.patty; }).length;
      return { title: 'FORMAL FINDING: STRUCTURAL INVERSION', body:
        'On ' + n + ' certified specimens, the bun outperformed the patty. ' +
        'The Bureau has begun to suspect that regional bakeries are outcompeting regional kitchens.' }; });

  R('reg-warning-extreme-scores', 'regulatory', { a: 5, pr: 6 },
    function (m) { return gt(A(m, 'ryan').pct10 + A(m, 'ryan').pctBelow5, 15) || gt(A(m, 'devin').pct10 + A(m, 'devin').pctBelow5, 15); },
    function (m, H) {
      var rr = A(m, 'ryan').pct10 + A(m, 'ryan').pctBelow5;
      var dd = A(m, 'devin').pct10 + A(m, 'devin').pctBelow5;
      var who = rr > dd ? 'ryan' : 'devin';
      return { title: 'EXTREME VALUE WARNING', body:
        H.pct(Math.max(rr, dd)) + ' of ' + H.name(who) + "'s scores sit at the extremes of the scale — a perfect 10.0 or below 5.0. " +
        'The Bureau prefers its auditors ambivalent.' }; });

  R('reg-commendation-restraint', 'regulatory', { a: 8, pr: 6 },
    function (m) {
      return A(m, 'ryan').count10 === 0 && A(m, 'devin').count10 === 0 &&
             A(m, 'ryan').countBelow5 === 0 && A(m, 'devin').countBelow5 === 0;
    },
    function (m, H) { return { title: 'COMMENDATION FOR INSTITUTIONAL MODERATION', body:
      'Neither auditor has ever issued a 10.0 or a score below 5.0. ' +
      'Every judgement this Bureau has ever made lives in the comfortable middle, where judgements are safest.' }; });

  R('reg-investigation-opened', 'regulatory', { c: 4, pr: 7, r: 'uncommon' },
    function (m) { return m.paired.streaks.sweeps.longest >= 3; },
    function (m, H) { return { title: 'INVESTIGATION OPENED', body:
      'The register contains a run of ' + m.paired.streaks.sweeps.longest +
      ' consecutive specimens on which one auditor out-scored the other in every category. ' +
      'The Office has opened an investigation and assigned it to itself.' }; });

  R('reg-unnecessary-notice-1', 'regulatory', { c: 3, pr: 3 },
    function (m) { return num(m.auditors.ryan.cat.patty.median); },
    function (m, H) { return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
      "Ryan's median Patty score is " + H.n1(m.auditors.ryan.cat.patty.median) +
      '. This information was expensive to calculate and changes nothing.' }; },
    function (m, H) { return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
      "Devin's median Bun score is " + H.n1(m.auditors.devin.cat.bun.median) +
      '. The Office has recorded it in triplicate.' }; });

  R('reg-unnecessary-notice-2', 'regulatory', { c: 4, pr: 3 },
    function (m) { return num(m.paired.totalCells); },
    function (m, H) { return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
      'The Bureau has recorded ' + (m.auditors.ryan.totalCells + m.auditors.devin.totalCells) +
      ' individual category scores across its entire operating history. Each was entered by hand.' }; });

  R('reg-unnecessary-notice-3', 'regulatory', { c: 4, pr: 3 },
    function (m) { return m.counts.restaurants >= 2; },
    function (m, H) { return { title: 'UNNECESSARY STATISTICAL NOTICE', body:
      'The register spans ' + m.counts.restaurants + ' establishments and ' + m.counts.certified +
      ' certified specimens, a ratio of ' + H.n2(m.counts.certified / m.counts.restaurants) +
      ' hamburgers per establishment. No decision depends on this figure.' }; });

  R('reg-mathematically-true', 'regulatory', { c: 2, pr: 3, r: 'uncommon' },
    function (m) { return m.counts.certified >= 2; },
    function (m, H) { return { title: 'OBSERVATIONAL FINDING', body:
      'Every certified specimen in the register has been examined by exactly two auditors. ' +
      'This is required for certification, which makes the observation flawless and useless in equal measure.' }; },
    function (m, H) { return { title: 'OBSERVATIONAL FINDING', body:
      'The Composite Patty Index of every certified specimen falls between 0.0 and 100.0. ' +
      'The Bureau has verified this across all ' + m.counts.certified + ' specimens and found no exceptions.' }; });

  R('reg-hearing-scheduled', 'regulatory', { c: 5, pr: 6, r: 'uncommon' },
    function (m) { return m.paired.biggestInversionValue >= 4; },
    function (m, H) {
      var row = m.paired.biggestInversion;
      return { title: 'HEARING SCHEDULED', body:
        'A ranking discrepancy of ' + row.diff + ' places has been recorded for ' + H.bare(row.view) +
        '. A hearing has been scheduled. Neither auditor has been invited.' }; });

  R('reg-audit-trail-notice', 'regulatory', { c: 3, pr: 4 },
    function (m) { return m.paired.first && m.paired.latest && m.paired.first.id !== m.paired.latest.id; },
    function (m, H) { return { title: 'RECORDS RETENTION NOTICE', body:
      'The Bureau maintains a complete audit trail from specimen ' + m.paired.first.specimen + ' to ' + m.paired.latest.specimen +
      '. No filing has ever been amended, withdrawn, or successfully appealed.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);


/* ===== BATCH 11 — RARE / EASTER EGGS ===== */
(function (root) {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var I = isNode ? require('./insights.js') : root.BPS.insights;
  var S = isNode ? require('./scoring.js') : root.BPS.scoring;
  var R = I.R, num = I.num, gt = I.gt, lt = I.lt;
  var K = S.CATEGORY_KEYS;

  R('egg-cpi-exactly-100', 'rare', { c: 1, pr: 10, r: 'legendary' },
    function (m) { return m.certified.some(function (v) { return Math.abs(v.cpi - 100) < 0.001; }); },
    function (m, H) {
      var v = m.certified.filter(function (x) { return Math.abs(x.cpi - 100) < 0.001; })[0];
      return { title: 'PERFECT SPECIMEN CERTIFIED', body:
        H.spec(v) + ' has achieved a Composite Patty Index of exactly 100.0. ' +
        'Both auditors awarded 10.0 in all six categories. The Bureau has closed the register in celebration and reopened it immediately.' }; });

  R('egg-cpi-exactly-zero', 'rare', { c: 1, pr: 10, r: 'legendary' },
    function (m) { return m.certified.some(function (v) { return Math.abs(v.cpi) < 0.001; }); },
    function (m, H) {
      var v = m.certified.filter(function (x) { return Math.abs(x.cpi) < 0.001; })[0];
      return { title: 'TOTAL FAILURE CERTIFIED', body:
        H.spec(v) + ' has recorded a Composite Patty Index of exactly 0.0. ' +
        'Twelve category scores of zero. The Bureau is obliged to ask why either auditor finished the meal.' }; });

  R('egg-cpi-exactly-50', 'rare', { c: 1, pr: 9, r: 'legendary' },
    function (m) { return m.certified.some(function (v) { return Math.abs(v.cpi - 50) < 0.001; }); },
    function (m, H) { return { title: 'PERFECT MEDIOCRITY', body:
      'A specimen has recorded a Composite Patty Index of exactly 50.0 — the precise midpoint of the scale. ' +
      'The Bureau regards this as the most accurate description of a hamburger it has ever produced.' }; });

  R('egg-identical-vectors', 'rare', { c: 1, pr: 10, r: 'legendary' },
    function (m) {
      return m.certified.some(function (v) {
        return K.every(function (c) { return Number(v.scores.ryan[c]) === Number(v.scores.devin[c]); });
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) {
        return K.every(function (c) { return Number(x.scores.ryan[c]) === Number(x.scores.devin[c]); });
      })[0];
      return { title: 'IDENTICAL FILING — FULL VECTOR', body:
        'On ' + H.spec(v) + ', Ryan and Devin submitted six identical category scores. ' +
        'The probability of this occurring independently is small enough that the Office has stopped calculating it and started asking questions.' }; });

  R('egg-shared-ten', 'rare', { c: 1, pr: 9, r: 'rare' },
    function (m) {
      return m.certified.some(function (v) {
        return K.some(function (c) { return Number(v.scores.ryan[c]) === 10 && Number(v.scores.devin[c]) === 10; });
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) {
        return K.some(function (c) { return Number(x.scores.ryan[c]) === 10 && Number(x.scores.devin[c]) === 10; });
      })[0];
      var c = K.filter(function (k) { return Number(v.scores.ryan[k]) === 10 && Number(v.scores.devin[k]) === 10; })[0];
      return { title: 'JOINT MAXIMUM AWARD', body:
        'Both auditors independently awarded a perfect 10.0 for ' + H.cat(c) + ' on ' + H.spec(v) +
        '. The Bureau recognises this as the highest honour it is capable of conferring, and notes that it confers nothing.' }; });

  R('egg-ascending-pattern', 'rare', { c: 1, pr: 9, r: 'rare' },
    function (m) {
      return m.certified.some(function (v) {
        return ['ryan', 'devin'].some(function (k) {
          if (!v.scores[k]) return false;
          for (var i = 1; i < K.length; i++) if (Number(v.scores[k][K[i]]) <= Number(v.scores[k][K[i - 1]])) return false;
          return true;
        });
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) {
        return ['ryan', 'devin'].some(function (k) {
          if (!x.scores[k]) return false;
          for (var i = 1; i < K.length; i++) if (Number(x.scores[k][K[i]]) <= Number(x.scores[k][K[i - 1]])) return false;
          return true;
        });
      })[0];
      var who = (function () {
        for (var i = 1; i < K.length; i++) if (Number(v.scores.ryan[K[i]]) <= Number(v.scores.ryan[K[i - 1]])) return 'devin';
        return 'ryan';
      })();
      return { title: 'MONOTONIC FILING DETECTED', body:
        'On ' + H.spec(v) + ', ' + H.name(who) + "'s six scores ascend in perfect order from Patty through to Condiments. " +
        'The Bureau has no procedure for this and finds it faintly unnerving.' }; });

  R('egg-descending-pattern', 'rare', { c: 1, pr: 9, r: 'rare' },
    function (m) {
      return m.certified.some(function (v) {
        return ['ryan', 'devin'].some(function (k) {
          if (!v.scores[k]) return false;
          for (var i = 1; i < K.length; i++) if (Number(v.scores[k][K[i]]) >= Number(v.scores[k][K[i - 1]])) return false;
          return true;
        });
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) {
        return ['ryan', 'devin'].some(function (k) {
          if (!x.scores[k]) return false;
          for (var i = 1; i < K.length; i++) if (Number(x.scores[k][K[i]]) >= Number(x.scores[k][K[i - 1]])) return false;
          return true;
        });
      })[0];
      return { title: 'MONOTONIC DECLINE DETECTED', body:
        'One auditor\'s six scores for ' + H.spec(v) + ' descend in perfect order, category by category. ' +
        'Either the hamburger deteriorated as it was eaten, or a mood did.' }; });

  R('egg-all-same-score', 'rare', { c: 1, pr: 9, r: 'rare' },
    function (m) {
      return m.certified.some(function (v) {
        return ['ryan', 'devin'].some(function (k) { return v.scores[k] && v.spread[k] === 0; });
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return x.spread.ryan === 0 || x.spread.devin === 0; })[0];
      var who = v.spread.ryan === 0 ? 'ryan' : 'devin';
      return { title: 'UNIFORM VECTOR FILED', body:
        H.name(who) + ' awarded exactly ' + H.n1(v.scores[who].patty) + ' in all six categories for ' + H.spec(v) +
        '. The Bureau has confirmed the filing was intentional and remains unsatisfied.' }; });

  R('egg-patty-wins-loses-everything', 'rare', { c: 3, pr: 9, r: 'rare' },
    function (m) {
      return m.certified.some(function (v) {
        var others = K.filter(function (c) { return c !== 'patty'; });
        return v.best.combined === 'patty' &&
               others.every(function (c) { return v.combined.patty - v.combined[c] >= 1.5; });
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) {
        var others = K.filter(function (c) { return c !== 'patty'; });
        return x.best.combined === 'patty' && others.every(function (c) { return x.combined.patty - x.combined[c] >= 1.5; });
      })[0];
      return { title: 'ISOLATED EXCELLENCE', body:
        H.spec(v) + ' scores at least 1.5 points higher on Patty than on every other category. ' +
        'One component is carrying this hamburger entirely, and the Bureau salutes it.' }; });

  R('egg-perfect-symmetry', 'rare', { c: 4, pr: 9, r: 'legendary' },
    function (m) {
      return m.certified.some(function (v) {
        var pos = 0, neg = 0;
        K.forEach(function (c) { if (v.deltas[c] > 0) pos += v.deltas[c]; if (v.deltas[c] < 0) neg -= v.deltas[c]; });
        return pos > 1 && Math.abs(pos - neg) < 0.001 && v.exactCells === 0;
      });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) {
        var pos = 0, neg = 0;
        K.forEach(function (c) { if (x.deltas[c] > 0) pos += x.deltas[c]; if (x.deltas[c] < 0) neg -= x.deltas[c]; });
        return pos > 1 && Math.abs(pos - neg) < 0.001 && x.exactCells === 0;
      })[0];
      return { title: 'PERFECT DISAGREEMENT SYMMETRY', body:
        'On ' + H.spec(v) + ', the auditors disagreed in every category yet their differences cancel out exactly. ' +
        'Identical weighted scores by entirely different routes. The Bureau considers this the purest result it has ever recorded.' }; });

  R('egg-three-same-cpi', 'rare', { c: 3, pr: 9, r: 'legendary' },
    function (m) {
      var counts = {};
      m.certified.forEach(function (v) {
        var k = v.cpi.toFixed(1);
        counts[k] = (counts[k] || 0) + 1;
      });
      return Object.keys(counts).some(function (k) { return counts[k] >= 3; });
    },
    function (m, H) {
      var counts = {};
      m.certified.forEach(function (v) { var k = v.cpi.toFixed(1); counts[k] = (counts[k] || 0) + 1; });
      var hit = Object.keys(counts).filter(function (k) { return counts[k] >= 3; })[0];
      return { title: 'IMPROBABLE CONVERGENCE', body:
        counts[hit] + ' separate specimens share an identical Composite Patty Index of ' + hit +
        '. The Bureau has checked the arithmetic and would prefer that you did not.' }; });

  R('egg-total-inversion', 'rare', { c: 5, pr: 10, r: 'legendary' },
    function (m) {
      if (m.paired.n < 5) return false;
      return m.paired.rankRows.every(function (r) { return r.ryanRank + r.devinRank === m.paired.n + 1; });
    },
    function (m, H) { return { title: 'COMPLETE ORDINAL INVERSION', body:
      'Ryan\'s ranking of the register is the exact reverse of Devin\'s. Every specimen. ' +
      'The Bureau has never recorded a more total failure of agreement and is, professionally speaking, impressed.' }; });

  R('egg-both-perfect-audit', 'rare', { c: 1, pr: 10, r: 'legendary' },
    function (m) {
      return ['ryan', 'devin'].some(function (k) {
        return m.certified.some(function (v) { return v.scores[k] && K.every(function (c) { return Number(v.scores[k][c]) === 10; }); });
      });
    },
    function (m, H) {
      var who = null, v = null;
      ['ryan', 'devin'].forEach(function (k) {
        m.certified.forEach(function (x) {
          if (!v && x.scores[k] && K.every(function (c) { return Number(x.scores[k][c]) === 10; })) { who = k; v = x; }
        });
      });
      return { title: 'FLAWLESS AUDIT FILED', body:
        H.name(who) + ' awarded a perfect 10.0 in all six categories to ' + H.spec(v) +
        '. The Bureau has no higher score available and has begun quietly drafting one.' }; });

  R('egg-zero-audit', 'rare', { c: 1, pr: 10, r: 'legendary' },
    function (m) {
      return ['ryan', 'devin'].some(function (k) {
        return m.certified.some(function (v) { return v.scores[k] && K.every(function (c) { return Number(v.scores[k][c]) === 0; }); });
      });
    },
    function (m, H) {
      var who = null;
      ['ryan', 'devin'].forEach(function (k) {
        m.certified.forEach(function (x) {
          if (!who && x.scores[k] && K.every(function (c) { return Number(x.scores[k][c]) === 0; })) who = k;
        });
      });
      return { title: 'TOTAL REJECTION FILED', body:
        H.name(who) + ' has awarded 0.0 in all six categories. ' +
        'The Bureau has never seen this and has scheduled a wellness check.' }; });

  R('egg-same-score-every-specimen', 'rare', { c: 3, pr: 9, r: 'legendary' },
    function (m) {
      return ['ryan', 'devin'].some(function (k) {
        var a = m.auditors[k];
        return a.n >= 3 && num(a.weighted.range) && a.weighted.range < 0.001;
      });
    },
    function (m, H) {
      var who = m.auditors.ryan.weighted.range < 0.001 ? 'ryan' : 'devin';
      return { title: 'CONSTANT AUDITOR DETECTED', body:
        H.name(who) + ' has produced an identical weighted score on every specimen he has ever audited. ' +
        'The Bureau could replace him with a single number and lose no information whatsoever.' }; });

  R('egg-mirror-categories', 'rare', { c: 4, pr: 8, r: 'rare' },
    function (m) {
      return K.every(function (c) { return Math.abs(m.paired.byCategory[c].delta) > 0.15; }) &&
             K.filter(function (c) { return m.paired.byCategory[c].delta > 0; }).length === 3;
    },
    function (m, H) { return { title: 'PERFECT DIVISION OF OPINION', body:
      'Across the six categories, Ryan leads on exactly three and Devin on exactly three, all by meaningful margins. ' +
      'The Bureau has divided the hamburger between them and neither has objected.' }; });

  R('egg-value-is-highest', 'rare', { c: 5, pr: 8, r: 'rare' },
    function (m) { return m.strongestCat === 'value'; },
    function (m, H) { return { title: 'UNPRECEDENTED ECONOMIC SATISFACTION', body:
      'Value is now the highest-scoring category in the entire register, at ' + H.n1(m.categoryBoard.value.mean) +
      '. In the Bureau\'s experience, auditors complain about price as a reflex. Something has gone right.' }; });

  R('egg-fries-is-highest', 'rare', { c: 5, pr: 8, r: 'rare' },
    function (m) { return m.strongestCat === 'fries'; },
    function (m, H) { return { title: 'ACCOMPANIMENT SUPREMACY', body:
      'Fries have overtaken every other category, including Patty, as the register\'s strongest attribute (' +
      H.n1(m.categoryBoard.fries.mean) + '). The Bureau is investigating whether these are hamburger evaluations at all.' }; });

  R('egg-patty-is-weakest', 'rare', { c: 5, pr: 9, r: 'rare' },
    function (m) { return m.weakestCat === 'patty'; },
    function (m, H) { return { title: 'CATASTROPHIC SECTOR FAILURE', body:
      'Patty is now the weakest category in the register at ' + H.n1(m.categoryBoard.patty.mean) +
      '. It carries 30% of the Index. The Bureau has considered whether to continue and has decided, reluctantly, to continue.' }; });

  R('egg-cpi-round-number', 'rare', { c: 2, pr: 7, r: 'rare' },
    function (m) {
      return m.certified.some(function (v) { return Math.abs(v.cpi - Math.round(v.cpi)) < 0.001 && Math.round(v.cpi) % 10 === 0 && v.cpi > 0 && v.cpi < 100; });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return Math.abs(x.cpi - Math.round(x.cpi)) < 0.001 && Math.round(x.cpi) % 10 === 0 && x.cpi > 0 && x.cpi < 100; })[0];
      return { title: 'SUSPICIOUSLY ROUND FIGURE', body:
        H.spec(v) + ' has certified at exactly ' + H.cpi(v) + ' CPI. ' +
        'The Bureau has re-run the calculation from the raw scores and confirms no rounding was involved.' }; });

  R('egg-every-category-contested-one-spec', 'rare', { c: 2, pr: 8, r: 'rare' },
    function (m) {
      return m.certified.some(function (v) { return K.every(function (c) { return v.absDeltas[c] >= 1; }); });
    },
    function (m, H) {
      var v = m.certified.filter(function (x) { return K.every(function (c) { return x.absDeltas[c] >= 1; }); })[0];
      return { title: 'TOTAL EVALUATIVE COLLAPSE', body:
        'On ' + H.spec(v) + ', every single category shows a disagreement of a full point or more. ' +
        'The Bureau cannot establish that both auditors ate the same hamburger.' }; });

  R('egg-perfect-half-point', 'rare', { c: 6, pr: 7, r: 'rare' },
    function (m) {
      return ['ryan', 'devin'].some(function (k) {
        var a = m.auditors[k];
        return a.totalCells >= 30 && a.scores.values.every(function (x) { return Math.abs(x * 2 - Math.round(x * 2)) < 0.001; });
      });
    },
    function (m, H) {
      var who = m.auditors.ryan.scores.values.every(function (x) { return Math.abs(x * 2 - Math.round(x * 2)) < 0.001; }) ? 'ryan' : 'devin';
      return { title: 'GRID ADHERENCE DETECTED', body:
        'Every score ' + H.name(who) + ' has ever issued falls on a half-point. Not one odd tenth in ' +
        m.auditors[who].totalCells + ' opportunities. The Bureau supplied tenths and he has quietly declined them.' }; });

})(typeof globalThis !== 'undefined' ? globalThis : this);
