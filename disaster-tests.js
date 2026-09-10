/* Dedicated deterministic tests for the Bureau event layer. */
'use strict';

var DS = require('./disasters.js');
var AN = require('./analytics.js');
var S = require('./scoring.js');

var results = [];
function ok(name, condition, detail) {
  results.push({ name: name, pass: !!condition, detail: detail });
}

function base() {
  return {
    n: 0, pending: 0, audits: 0, exactSpecimens: 0, maxWeightedGap: 0,
    rankCorrelation: 1, exactPct: 0, sameNumberOne: false, sameLast: false,
    oldestPendingDays: 0, pendingRyan: 0, pendingDevin: 0, auditImbalance: 0,
    cpiRange: 999, cpiSd: 999, repeatCount: 0, repeatRange: 0, repeatName: null,
    categoryGap: 0, categoryKey: null, perfects: 0, catastrophes: 0,
    exactCells: 1, disagreement: 0, dominanceRun: 0, dominanceKey: 'ryan',
    stableN: 0, stableSd: 999, stableKey: 'ryan', reversals: 0, negativeCats: 0,
    universalWeak: null, universalWeakMargin: 0, topOccupation: 0,
    topOccupationName: null, wholeRyan: 0, wholeDevin: 0,
    cpiCluster: 0, cpiClusterValue: null, specimen: null, restaurant: null
  };
}

function f(values) { return Object.assign(base(), values); }
function has(id, values) { return DS.evaluateFeatures(f(values)).some(function (e) { return e.id === id; }); }

var cases = [
  ['d01', { n: 1, exactSpecimens: 1 }, { n: 1, exactSpecimens: 0 }],
  ['d02', { n: 2, maxWeightedGap: 3.6 }, { n: 2, maxWeightedGap: 3.59 }],
  ['d03', { n: 5, rankCorrelation: -0.75 }, { n: 5, rankCorrelation: -0.74 }],
  ['d04', { n: 6, exactPct: 92, sameNumberOne: true, sameLast: true }, { n: 6, exactPct: 91.9, sameNumberOne: true, sameLast: true }],
  ['d05', { pending: 1, oldestPendingDays: 14 }, { pending: 1, oldestPendingDays: 13.99 }],
  ['d06', { auditImbalance: 4, pendingRyan: 4 }, { auditImbalance: 3, pendingRyan: 4 }],
  ['d07', { n: 7, cpiRange: 2.5, cpiSd: 1 }, { n: 7, cpiRange: 2.51, cpiSd: 1 }],
  ['d08', { n: 8, repeatCount: 4, repeatRange: 22 }, { n: 8, repeatCount: 3, repeatRange: 22 }],
  ['d09', { n: 6, categoryGap: 2.5 }, { n: 6, categoryGap: 2.49 }],
  ['d10', { perfects: 1 }, { perfects: 0 }],
  ['d11', { catastrophes: 1 }, { catastrophes: 0 }],
  ['d12', { n: 6, exactCells: 0, disagreement: 1 }, { n: 6, exactCells: 1, disagreement: 1 }],
  ['d13', { n: 5, dominanceRun: 5 }, { n: 5, dominanceRun: 4 }],
  ['d14', { stableN: 8, stableSd: 0.06 }, { stableN: 8, stableSd: 0.061 }],
  ['d15', { n: 9, reversals: 6 }, { n: 9, reversals: 5 }],
  ['d16', { n: 8, negativeCats: 4 }, { n: 8, negativeCats: 3 }],
  ['d17', { n: 6, universalWeak: 'fries', universalWeakMargin: 1 }, { n: 6, universalWeak: 'fries', universalWeakMargin: 0.99 }],
  ['d18', { n: 9, topOccupation: 4 }, { n: 9, topOccupation: 3 }],
  ['d19', { n: 10, wholeRyan: 96, wholeDevin: 96 }, { n: 10, wholeRyan: 95.9, wholeDevin: 96 }],
  ['d20', { n: 12, cpiCluster: 4 }, { n: 12, cpiCluster: 3 }]
];

var stats = DS.stats();
ok('registry contains exactly twenty systems', stats.systems === 20, stats);
ok('registry identifiers are unique', new Set(stats.ids).size === 20, stats.ids);
ok('registry and public identifier lists agree', DS.IDS.join('|') === stats.ids.join('|'));
ok('multi-stage inventory is stable', stats.multiStage === 8, stats.multiStage);
ok('empty state produces no event', DS.evaluateFeatures(base()).length === 0);

cases.forEach(function (entry) {
  ok(entry[0] + ' activates for its qualifying state', has(entry[0], entry[1]));
  ok(entry[0] + ' rejects its adjacent near-miss', !has(entry[0], entry[2]));
});

var phaseCases = [
  ['d02', { n: 2, maxWeightedGap: 4.5 }, { n: 2, maxWeightedGap: 6 }],
  ['d05', { pending: 1, oldestPendingDays: 30 }, { pending: 1, oldestPendingDays: 90 }],
  ['d06', { auditImbalance: 7, pendingRyan: 7 }, { auditImbalance: 10, pendingRyan: 10 }],
  ['d08', { n: 8, repeatCount: 4, repeatRange: 32 }, { n: 8, repeatCount: 4, repeatRange: 45 }],
  ['d10', { perfects: 2 }, { perfects: 3 }],
  ['d13', { n: 8, dominanceRun: 8 }, { n: 12, dominanceRun: 12 }],
  ['d16', { n: 8, negativeCats: 5 }, { n: 8, negativeCats: 6 }],
  ['d20', { n: 12, cpiCluster: 5 }, { n: 12, cpiCluster: 7 }]
];

phaseCases.forEach(function (entry) {
  var middle = DS.evaluateFeatures(f(entry[1])).filter(function (e) { return e.id === entry[0]; })[0];
  var final = DS.evaluateFeatures(f(entry[2])).filter(function (e) { return e.id === entry[0]; })[0];
  ok(entry[0] + ' enters its intermediate state deterministically', middle && middle.phase === 2, middle);
  ok(entry[0] + ' enters its final state deterministically', final && final.phase === 3, final);
});

var shared = f({ n: 12, cpiCluster: 5, cpiClusterValue: 81.2, exactCells: 0, disagreement: 1.2 });
var a = DS.evaluateFeatures(shared);
var b = DS.evaluateFeatures(Object.assign({}, shared));
ok('equivalent shared state yields identical ordered events', JSON.stringify(a) === JSON.stringify(b));
ok('event fingerprints are deterministic', a.every(function (event, i) { return event.fingerprint === b[i].fingerprint; }));
ok('detector does not depend on an auditor identity', !Object.prototype.hasOwnProperty.call(shared, 'me'));
ok('detector does not call randomness', !/Math\.random/.test(DS.evaluate.toString() + DS.evaluateFeatures.toString()));

/* The v2 model: the ranked entity is the establishment, and the event
   layer must read it without any of the old one-burger assumptions. */
function flat(v) {
  var out = {};
  S.INPUT_KEYS.forEach(function (key) { out[key] = v; });
  return out;
}

var AUDIT_N = 0;
function auditRow(auditorKey, scores, createdAt, opts) {
  opts = opts || {};
  AUDIT_N += 1;
  var row = {
    id: 'fa' + AUDIT_N,
    establishmentId: opts.establishmentId || 'fe1',
    auditorId: auditorKey === 'ryan' ? 'uuid-ryan' : 'uuid-devin',
    auditorKey: auditorKey,
    burger: opts.burger || 'Fixture Burger',
    locationId: 'floc-1',
    locationName: 'Fixture Location',
    schemaVersion: S.SCHEMA_VERSION,
    createdAt: createdAt,
    updatedAt: createdAt
  };
  S.INPUT_KEYS.forEach(function (key) { row[key] = scores[key]; });
  row.service = S.serviceScore(row);
  return row;
}

function fixture(id, audits, createdAt) {
  audits.forEach(function (a) { a.establishmentId = id; });
  return {
    id: id,
    fileNumber: 'BPS-' + id,
    name: 'Fixture Counter ' + id,
    nameKey: 'fixture counter ' + id,
    category: 'fast-food',
    createdBy: 'uuid-ryan',
    createdAt: createdAt,
    updatedAt: createdAt,
    audits: audits
  };
}

function registerOf(establishments) {
  return {
    establishments: establishments,
    locations: [{ id: 'floc-1', name: 'Fixture Location', nameKey: 'fixture location',
                  group: 'minneapolis', isPreset: true, archived: false }]
  };
}

var exactMetrics = AN.compute(registerOf([
  fixture('fe1', [
    auditRow('ryan', flat(8), '2026-08-01T12:00:00Z'),
    auditRow('devin', flat(8), '2026-08-01T13:00:00Z')
  ], '2026-08-01T12:00:00Z')
]));
ok('analytics output can activate a system without presentation state',
  DS.evaluate(exactMetrics).some(function (e) { return e.id === 'd01'; }));

var ceilingMetrics = AN.compute(registerOf([
  fixture('fe2', [
    auditRow('ryan', flat(10), '2026-08-02T12:00:00Z'),
    auditRow('devin', flat(10), '2026-08-02T13:00:00Z')
  ], '2026-08-02T12:00:00Z')
]));
ok('full-precision CPI feeds detector state',
  DS.evaluate(ceilingMetrics).some(function (e) { return e.id === 'd10'; }));

var old = new Date(Date.now() - 15 * 86400000).toISOString();
var pendingMetrics = AN.compute(registerOf([
  fixture('fe3', [auditRow('ryan', flat(7), old)], old)
]));
ok('shared filing timestamps feed elapsed-state detection',
  DS.evaluate(pendingMetrics).some(function (e) { return e.id === 'd05'; }));

/* Different branches and different burgers must still certify, and the
   event layer must read the resulting establishment without complaint. */
var splitMetrics = AN.compute(registerOf([
  fixture('fe4', [
    auditRow('ryan', flat(9), '2026-08-03T12:00:00Z', { burger: 'One Thing' }),
    auditRow('devin', flat(9), '2026-08-09T12:00:00Z', { burger: 'Another Thing' })
  ], '2026-08-03T12:00:00Z')
]));
ok('a divergent-burger certification reaches the event layer',
  splitMetrics.counts.certified === 1 && Array.isArray(DS.evaluate(splitMetrics)));

/* Service is now part of the scoring schema; an audit lacking it must
   never reach the event layer as a zero. */
var legacyScores = flat(8);
legacyScores.serviceSpeed = null;
legacyScores.serviceFriendliness = null;
var legacyMetrics = AN.compute(registerOf([
  fixture('fe5', [
    auditRow('ryan', legacyScores, '2026-08-04T12:00:00Z'),
    auditRow('devin', flat(8), '2026-08-04T13:00:00Z')
  ], '2026-08-04T12:00:00Z')
]));
ok('a superseded-schema audit does not certify for the event layer',
  legacyMetrics.counts.certified === 0);
ok('a superseded-schema audit produces no ceiling event',
  !DS.evaluate(legacyMetrics).some(function (e) { return e.id === 'd10'; }));

/* Repeat visits must not multiply the ranked entity. */
var repeatMetrics = AN.compute(registerOf([
  fixture('fe6', [
    auditRow('ryan', flat(9), '2026-08-05T12:00:00Z'),
    auditRow('ryan', flat(7), '2026-08-06T12:00:00Z'),
    auditRow('devin', flat(8), '2026-08-07T12:00:00Z')
  ], '2026-08-05T12:00:00Z')
]));
ok('repeat visits leave one entity for the event layer',
  repeatMetrics.certified.length === 1 && repeatMetrics.counts.audits === 3);
ok('the concentration feature reads visits, not duplicate rows',
  DS.featureVector(repeatMetrics).topOccupation === 3);

var before = JSON.stringify(exactMetrics.counts);
DS.evaluate(exactMetrics);
ok('detection does not mutate analytics output', JSON.stringify(exactMetrics.counts) === before);

var failed = results.filter(function (result) { return !result.pass; });
failed.forEach(function (result) {
  console.log('  FAIL  ' + result.name + (result.detail === undefined ? '' : ' ' + JSON.stringify(result.detail)));
});
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' disaster checks passed');
if (failed.length) process.exit(1);
