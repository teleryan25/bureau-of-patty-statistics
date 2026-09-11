/* =============================================================
   Bureau of Patty Statistics — public-tests.js

   node public-tests.js

   The public website's data layer, endpoint and routing:
     * public rankings equal the auditor app's rankings exactly, for every
       basis and every location / area / class filter, on seeded registers
     * Overall, Burger Quality and Fries orderings on a hand-computed fixture
     * certification still needs two distinct active current-schema auditors
     * nothing private leaves the endpoint; it is GET-only and selects no
       private column; RLS gains no anon grant
     * / and /app/ routing, auth-callback forwarding, SEO metadata
   ============================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var T = require('./taxonomy.js');
var S = require('./scoring.js');
var AN = require('./analytics.js');
var D = require('./data.js');
var PR = require('./public-register.js');
var X = require('./public-test-support.js');

var results = [];
function ok(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail }); }
function eq(name, actual, expected) {
  var pass;
  try { assert.deepStrictEqual(actual, expected); pass = true; } catch (err) { pass = false; }
  results.push({ name: name, pass: pass, detail: pass ? undefined : { actual: actual, expected: expected } });
}
function read(file) { return fs.readFileSync(path.join(__dirname, file), 'utf8'); }

/* ---------- fixtures ---------- */
var PROFILES = [
  { id: 'uuid-ryan', auditorKey: 'ryan', displayName: 'Ryan', email: 'ryan@private.example', active: true, role: 'admin' },
  { id: 'uuid-devin', auditorKey: 'devin', displayName: 'Devin', email: 'devin@private.example', active: true, role: 'auditor' },
  { id: 'uuid-chris', auditorKey: 'chris', displayName: 'Chris', email: 'chris@private.example', active: true, role: 'auditor' },
  { id: 'uuid-pat', auditorKey: 'pat', displayName: 'Pat', email: 'pat@private.example', active: false, role: 'auditor' }
];
var LOCS = [
  { id: 'l-long', name: 'Longfellow', nameKey: 'longfellow', group: 'minneapolis', isPreset: true },
  { id: 'l-nloop', name: 'North Loop', nameKey: 'north loop', group: 'minneapolis', isPreset: true },
  { id: 'l-edina', name: 'Edina', nameKey: 'edina', group: 'inner-ring', isPreset: true },
  { id: 'l-grand', name: 'Grand Avenue', nameKey: 'grand avenue', group: 'saint-paul', isPreset: true }
];
var SEQ = 0;
function sc(p, o, b, f, v, c, speed, friend) {
  return { patty: p, overallFlavor: o, bun: b, fries: f, value: v, condiments: c, serviceSpeed: speed, serviceFriendliness: friend };
}
function flat(n) { return sc(n, n, n, n, n, n, n, n); }
function audit(who, scores, opts) {
  opts = opts || {};
  SEQ += 1;
  var loc = LOCS.filter(function (l) { return l.id === (opts.loc || 'l-long'); })[0];
  var at = opts.at || '2026-06-01T18:00:00Z';
  var a = { id: 'aud-' + SEQ, auditorId: 'uuid-' + who, auditorKey: who, burger: opts.burger || 'Cheeseburger',
            locationId: opts.legacy ? null : loc.id, locationName: loc.name, schemaVersion: opts.legacy ? 1 : 2,
            createdAt: at, updatedAt: at };
  S.INPUT_KEYS.forEach(function (k) { a[k] = scores[k] == null ? null : scores[k]; });
  if (opts.legacy) { a.serviceSpeed = null; a.serviceFriendliness = null; }
  a.service = S.serviceScore(a);
  return a;
}
function est(n, name, category, audits, at) {
  return { id: 'est-' + n, fileNumber: 'BPS-' + String(n).padStart(4, '0'), name: name, nameKey: T.normalizeName(name),
           category: category, createdBy: 'uuid-ryan', createdAt: at || '2026-06-01T12:00:00Z', audits: audits };
}
function register(establishments) { return { profiles: PROFILES, locations: LOCS, establishments: establishments }; }

/* The auditor app's own path: analytics over the FULL register, then the shared sort. */
function appRows(full, filter) {
  var opts = {};
  if (filter.location) {
    var loc = full.locations.filter(function (l) { return PR.slugOf(l.nameKey || l.name) === filter.location; })[0];
    opts.locationId = loc ? loc.id : '__nowhere__';
  }
  if (filter.area) opts.locationIds = full.locations.filter(function (l) { return l.group === filter.area; }).map(function (l) { return l.id; });
  if (filter.category) opts.category = filter.category;
  var basis = S.rankingBasis(filter.basis);
  return S.rankByBasis(AN.compute(full, opts).ranked, basis.key).map(function (v) { return { id: v.fileNumber, score: basis.getScore(v) }; });
}
function publicRows(pub, filter) {
  return PR.rankings(pub.register, filter).rows.map(function (r) { return { id: r.id, score: r.score }; });
}
function allFilters(full) {
  var locs = [null], areas = [], cats = [null].concat(T.CATEGORY_KEYS);
  full.locations.forEach(function (l) {
    locs.push(PR.slugOf(l.nameKey || l.name));
    if (areas.indexOf(l.group) === -1) areas.push(l.group);
  });
  var out = [];
  Object.keys(S.RANKING_BASES).forEach(function (basis) {
    cats.forEach(function (category) {
      locs.forEach(function (location) { out.push({ basis: basis, location: location, category: category }); });
      areas.forEach(function (area) { out.push({ basis: basis, area: area, category: category }); });
    });
  });
  return out;
}
function parity(label, full) {
  var pub = PR.buildPublicRegister(full);
  var filters = allFilters(full);
  var mismatches = [];
  var nonEmpty = 0;
  filters.forEach(function (f) {
    var want = appRows(full, f);
    var got = publicRows(pub, f);
    if (want.length) nonEmpty += 1;
    /* Exact: same ids, same order, bit-identical scores. */
    var same = want.length === got.length && want.every(function (w, i) { return w.id === got[i].id && Object.is(w.score, got[i].score); });
    if (!same && mismatches.length < 3) mismatches.push({ filter: f, want: want, got: got });
  });
  ok(label + ': public rankings equal app rankings across ' + filters.length + ' basis/filter combinations', mismatches.length === 0, mismatches);
  ok(label + ': parity exercised non-empty rankings (' + nonEmpty + ')', nonEmpty > 0);
  return pub;
}

(async function run() {
  /* =====================================================
     1. Shared modules
     ===================================================== */
  var mock = D.createMockAdapter();
  var mockRegister = await mock.listRegister();

  var rows = X.rowsFromRegister(mockRegister, { archived: true });
  var rebuilt = D.registerFromRows({ establishments: rows.establishments.filter(function (e) { return !e.archived_at; }),
    audits: rows.audits, locations: rows.locations, profiles: rows.profiles });
  eq('registerFromRows rebuilds the establishments the app ranks',
    rebuilt.establishments.map(function (e) { return e.id + ':' + e.audits.length; }),
    mockRegister.establishments.map(function (e) { return e.id + ':' + e.audits.length; }));
  eq('registerFromRows yields the same official ranking as the adapter register',
    AN.compute(rebuilt).ranked.map(function (v) { return v.id + '=' + v.cpi; }),
    AN.compute(mockRegister).ranked.map(function (v) { return v.id + '=' + v.cpi; }));
  var orphan = D.registerFromRows({ establishments: [{ id: 'e', file_number: 'BPS-1', name: 'X', category: 'nonsense' }],
    audits: [{ id: 'a', establishment_id: 'e', auditor_id: 'nobody', location_id: null }], locations: [], profiles: [] });
  ok('registerFromRows drops audits with no mapped auditor', orphan.establishments[0].audits.length === 0);
  eq('registerFromRows coerces unknown classes', orphan.establishments[0].category, 'other');

  ok('app.js ranks through the shared S.rankByBasis', /S\.rankByBasis\(state\.metrics\.ranked, basis\.key\)/.test(read('app.js')));
  ok('public-register.js ranks through the shared S.rankByBasis', /S\.rankByBasis\(metrics\.ranked, basis\.key\)/.test(read('public-register.js')));
  ok('public-site.js contains no scoring weights or Supabase access',
    !/SCORING_WEIGHTS\s*=|supabase|\/rest\/v1|service_role/i.test(read('public-site.js')));

  var areaReg = register([
    est(1, 'Split Evidence', 'bar-pub', [audit('ryan', flat(8), { loc: 'l-long' }), audit('devin', flat(9), { loc: 'l-nloop' })])
  ]);
  ok('an area certifies on evidence spread across its locations',
    AN.compute(areaReg, { locationIds: ['l-long', 'l-nloop'] }).ranked.length === 1);
  ok('a single location inside the area does not', AN.compute(areaReg, { locationId: 'l-long' }).ranked.length === 0);
  ok('area filter is reported as active', AN.compute(areaReg, { locationIds: ['l-long'] }).filter.active === true);

  /* =====================================================
     2. Parity — the public site cannot drift from the app
     ===================================================== */
  parity('mock register', mockRegister);
  [11, 23, 42, 77, 101, 256].forEach(function (seed) {
    parity('seeded register ' + seed, X.randomRegister(seed));
  });
  parity('seeded register 5 (shuffled input, five examiners)', X.randomRegister(5, { shuffle: true, fourActive: true, establishments: 22 }));

  /* =====================================================
     3. Orderings, computed by hand
       E1 great burger / poor fries   CPI 82.0  BQI 100.0  Fries 2.0
       E2 poor burger / great fries   CPI 72.0  BQI  60.0  Fries 10.0
       E3 balanced                    CPI 85.5  BQI  85.0  Fries 9.0
     ===================================================== */
  var burgerFirst = sc(10, 10, 10, 2, 5, 10, 5, 5);
  var friesFirst = sc(6, 6, 6, 10, 10, 6, 10, 10);
  var balanced = sc(8.5, 8.5, 8.5, 9, 8.5, 8.5, 8.5, 8.5);
  var orderReg = register([
    est(1, 'Burger Palace', 'bar-pub', [audit('ryan', burgerFirst), audit('devin', burgerFirst, { loc: 'l-edina' })]),
    est(2, 'Fry Depot', 'fast-food', [audit('ryan', friesFirst), audit('devin', friesFirst)]),
    est(3, 'Even Keel', 'bar-pub', [audit('ryan', balanced), audit('devin', balanced)])
  ]);
  var orderPub = PR.buildPublicRegister(orderReg);
  function names(filter) { return PR.rankings(orderPub.register, filter).rows.map(function (r) { return r.view.name; }); }
  function scores(filter) { return PR.rankings(orderPub.register, filter).rows.map(function (r) { return S.formatCPI(r.score); }); }
  eq('Overall orders by CPI', names({ basis: 'overall' }), ['Even Keel', 'Burger Palace', 'Fry Depot']);
  eq('Overall CPI figures', scores({ basis: 'overall' }), ['85.5', '82.0', '72.0']);
  eq('Burger Quality orders by BQI', names({ basis: 'burger-quality' }), ['Burger Palace', 'Even Keel', 'Fry Depot']);
  eq('Burger Quality figures', scores({ basis: 'burger-quality' }), ['100.0', '85.0', '60.0']);
  eq('Fries orders by the Fries category alone', names({ basis: 'fries' }), ['Fry Depot', 'Even Keel', 'Burger Palace']);
  eq('Fries figures stay on the ten-point scale', scores({ basis: 'fries' }), ['10.0', '9.0', '2.0']);
  eq('Fries is labelled Fries, never CPI', PR.rankings(orderPub.register, { basis: 'fries' }).basis.scoreLabel, 'Fries');
  eq('Burger Quality is labelled BQI', PR.rankings(orderPub.register, { basis: 'burger-quality' }).basis.scoreLabel, 'BQI');
  eq('Fries + Longfellow + Bar / Pub combine', names({ basis: 'fries', location: 'longfellow', category: 'bar-pub' }), ['Even Keel']);
  eq('Burger Quality + Bar / Pub', names({ basis: 'burger-quality', category: 'bar-pub' }), ['Burger Palace', 'Even Keel']);
  eq('Overall + all of Minneapolis', names({ basis: 'overall', area: 'minneapolis' }), ['Even Keel', 'Fry Depot']);
  eq('Burger Quality + Inner-Ring Suburbs has no two-examiner evidence', names({ basis: 'burger-quality', area: 'inner-ring' }), []);
  eq('an unknown basis falls back to Overall', names({ basis: 'vibes' }), ['Even Keel', 'Burger Palace', 'Fry Depot']);

  var opts = PR.filterOptions(orderPub.register);
  eq('filter options list only classes that are ranked', opts.categories.map(function (c) { return c.key + ':' + c.count; }), ['fast-food:1', 'bar-pub:2']);
  ok('filter options offer locations that produce a ranking',
    opts.locationGroups.some(function (g) { return g.locations.some(function (l) { return l.id === 'longfellow' && l.count === 2; }); }));
  ok('filter options omit locations that cannot rank anything (Edina holds one examiner)',
    !opts.locationGroups.some(function (g) { return g.locations.some(function (l) { return l.id === 'edina'; }); }));

  /* =====================================================
     4. Certification is unchanged
     ===================================================== */
  var certReg = register([
    est(1, 'Solo Twice', 'diner-cafe', [audit('ryan', flat(9)), audit('ryan', flat(8), { at: '2026-06-03T12:00:00Z' })]),
    est(2, 'Pair', 'diner-cafe', [audit('ryan', flat(7)), audit('devin', flat(9))]),
    est(3, 'Departed Peer', 'diner-cafe', [audit('ryan', flat(8)), audit('pat', flat(8))]),
    est(4, 'Legacy Peer', 'diner-cafe', [audit('ryan', flat(8)), audit('devin', flat(8), { legacy: true })]),
    est(5, 'Balanced Trio', 'diner-cafe', [
      audit('ryan', flat(6)), audit('ryan', flat(6), { at: '2026-06-02T12:00:00Z' }), audit('ryan', flat(9), { at: '2026-06-03T12:00:00Z' }),
      audit('devin', flat(9)), audit('chris', flat(7.5), { loc: 'l-grand' })
    ])
  ]);
  var certPub = PR.buildPublicRegister(certReg);
  var certNames = certPub.register.establishments.map(function (e) { return e.name; });
  eq('only establishments with two distinct active current-schema auditors are published', certNames, ['Pair', 'Balanced Trio']);
  ok('one auditor filing twice stays pending', certPub.summary.investigations.some(function (x) { return x.name === 'Solo Twice' && x.examiners === 1; }));
  ok('an inactive auditor does not certify', certNames.indexOf('Departed Peer') === -1);
  ok('a legacy audit does not certify', certNames.indexOf('Legacy Peer') === -1);
  var trio = PR.rankings(certPub.register, { basis: 'overall' }).rows.filter(function (r) { return r.view.name === 'Balanced Trio'; })[0];
  /* ryan (6, 6, 9) averages to 7 first; then (7 + 9 + 7.5) / 3 = 7.8333… */
  ok('repeat visits are averaged per auditor before auditors are averaged', Math.abs(trio.score - (7 + 9 + 7.5) / 3 * 10) < 1e-9, trio.score);
  ok('a third auditor joins the aggregate on equal terms', trio.view.contributorCount === 3);
  ok('pending investigations carry no score', certPub.summary.investigations.every(function (x) {
    return Object.keys(x).every(function (k) { return ['name', 'category', 'categoryLabel', 'examiners', 'required', 'openedOn'].indexOf(k) !== -1; });
  }));
  eq('summary counts come from the full register', [certPub.summary.counts.certified, certPub.summary.counts.pending], [2, 3]);

  /* =====================================================
     5. Nothing private is published
     ===================================================== */
  var leakyReg = X.randomRegister(99);
  leakyReg.profiles[1].displayName = 'devin@private.example';
  var leakyPub = PR.buildPublicRegister(leakyReg, { recordsOnFile: 4 });
  eq('the public register carries no private key or value', X.findPrivate(leakyPub), []);
  ok('a display name shaped like an address is withheld', leakyPub.register.profiles[1].displayName === 'Examiner');
  ok('departed examiners are anonymised', leakyPub.register.profiles.filter(function (p) { return !p.active; })
    .every(function (p) { return p.displayName === 'Former Examiner' && /^former-\d+$/.test(p.auditorKey); }));
  ok('public dates carry no time of day', leakyPub.register.establishments.every(function (e) {
    return /^\d{4}-\d{2}-\d{2}$/.test(e.createdAt) && e.audits.every(function (a) { return /^\d{4}-\d{2}-\d{2}$/.test(a.createdAt); });
  }));
  ok('establishments are keyed by file number, not row id', leakyPub.register.establishments.every(function (e) { return /^BPS-/.test(e.id); }));
  ok('only current-schema audits are published', leakyPub.register.establishments.every(function (e) { return e.audits.every(S.auditIsCompliant); }));
  eq('Records Office publishes a count only', leakyPub.summary.recordsOnFile, 4);

  /* =====================================================
     6. Movement, findings, the public file
     ===================================================== */
  var moveReg = register([
    est(1, 'Old Guard', 'bar-pub', [audit('ryan', flat(9), { at: '2026-05-01T12:00:00Z' }), audit('devin', flat(9), { at: '2026-05-02T12:00:00Z' })], '2026-05-01T12:00:00Z'),
    /* 88.0 before the cutoff; (8.8 + 8.8 + 10) / 3 = 92.0 after it. */
    est(2, 'Climber', 'bar-pub', [audit('ryan', flat(8.8), { at: '2026-05-03T12:00:00Z' }), audit('devin', flat(8.8), { at: '2026-05-04T12:00:00Z' }),
      audit('chris', flat(10), { at: '2026-06-20T12:00:00Z' })], '2026-05-03T12:00:00Z'),
    est(3, 'Newcomer', 'bar-pub', [audit('ryan', flat(8.5), { at: '2026-06-25T12:00:00Z' }), audit('devin', flat(8.5), { at: '2026-06-26T12:00:00Z' })], '2026-06-25T12:00:00Z')
  ]);
  var movePub = PR.buildPublicRegister(moveReg, { now: Date.parse('2026-07-01T12:00:00Z') });
  var cutoff = PR.movementCutoff(movePub.summary.generatedAt);
  eq('movement window is thirty days', cutoff, '2026-06-01');
  var mv = PR.movement(movePub.register, { basis: 'overall' }, cutoff);
  eq('movement: climber up, incumbent down, newcomer new',
    [mv['BPS-0002'].status, mv['BPS-0002'].delta, mv['BPS-0001'].status, mv['BPS-0003'].status], ['up', 1, 'down', 'new']);

  var m1 = AN.compute(leakyPub.register);
  var f1 = PR.findings(m1);
  eq('findings are deterministic', JSON.stringify(PR.findings(AN.compute(leakyPub.register))), JSON.stringify(f1));
  var widest = AN.extremeBy(m1.certified, function (v) { return v.maxAbsDelta; }, 'max');
  ok('the disagreement notice reports the analytics figure', f1.disagreement && Object.is(f1.disagreement.spread, widest.value));
  ok('fry bulletin mean is the analytics category mean', f1.fries && Object.is(f1.fries.mean, m1.categoryBoard.fries.mean));
  var noFindings = PR.findings(AN.compute({ profiles: PROFILES, locations: LOCS, establishments: [] }));
  eq('no certified establishments, no bulletins', Object.keys(noFindings), ['certified']);

  var byBasis = {};
  Object.keys(S.RANKING_BASES).forEach(function (k) { byBasis[k] = PR.rankings(certPub.register, { basis: k }).rows; });
  var file = PR.establishmentFile(AN.compute(certPub.register), byBasis, 'BPS-0005');
  ok('the public file lists every current audit, newest first', file.history.length === 5 && file.history[0].date >= file.history[4].date);
  eq('the public file names its examiners', file.examiners.map(function (e) { return e.name + ':' + e.audits; }), ['Ryan:3', 'Devin:1', 'Chris:1']);
  ok('the public file carries ranks on every basis', ['overall', 'burger-quality', 'fries'].every(function (k) { return file.ranks[k] && file.ranks[k].of === 2; }));
  eq('the public file certifies on the second examiner\'s first filing', file.certifiedOn, '2026-06-01');
  ok('an uncertified file is not served', PR.establishmentFile(AN.compute(certPub.register), byBasis, 'BPS-0001') === null);

  /* =====================================================
     7. GET /api/public/register
     ===================================================== */
  var endpoint = (await X.loadHandler('functions/api/public/register.js')).onRequest;
  var fakeRows = X.rowsFromRegister(mockRegister, { archived: true, records: ['r1', 'r2', 'r3'] });
  var pg = await X.createFakePostgrest(fakeRows);
  var env = { SUPABASE_URL: pg.url, SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-DO-NOT-LEAK' };
  function call(method, e) {
    return endpoint({ request: new Request('https://pattybureau.com/api/public/register', { method: method }), env: e || env, waitUntil: function () {} });
  }

  var res = await call('GET');
  var text = await res.text();
  var body = JSON.parse(text);
  eq('GET answers 200', res.status, 200);
  eq('GET is cacheable for one minute', res.headers.get('cache-control'), 'public, max-age=60');
  ok('the response never contains the service-role key', text.indexOf(env.SUPABASE_SERVICE_ROLE_KEY) === -1 &&
    Array.from(res.headers.values()).every(function (v) { return v.indexOf(env.SUPABASE_SERVICE_ROLE_KEY) === -1; }));
  eq('the endpoint response carries no private key or value', X.findPrivate(body), []);
  ok('the endpoint response contains no mock email address', !/@/.test(text));
  var expected = PR.buildPublicRegister(mockRegister, { recordsOnFile: 3, now: Date.parse(body.summary.generatedAt) });
  eq('the endpoint serves exactly the public projection of the register', body, JSON.parse(JSON.stringify(expected)));
  ok('the archived (merged) establishment is excluded', text.indexOf('Merged Duplicate') === -1);
  ok('every Supabase request was a GET', pg.requests.length > 0 && pg.requests.every(function (r) { return r.method === 'GET'; }), pg.requests);
  ok('no Supabase request selects a private column', pg.requests.every(function (r) {
    var sel = String(r.query.select || '');
    return sel !== '*' && !/email|role|invitation|created_by|updated_by|updated_at|fingerprint|detail|holder/.test(sel);
  }), pg.requests.map(function (r) { return r.table + ':' + r.query.select; }));
  ok('Supabase is read with the service-role key server-side', pg.requests.every(function (r) { return r.apikey === env.SUPABASE_SERVICE_ROLE_KEY; }));

  var before = pg.requests.length;
  for (var mi = 0; mi < 4; mi++) {
    var method = ['POST', 'PUT', 'PATCH', 'DELETE'][mi];
    var refused = await call(method);
    ok(method + ' is refused with 405', refused.status === 405 && /GET/.test(refused.headers.get('allow') || ''));
  }
  ok('refused methods never reach Supabase', pg.requests.length === before);
  var head = await call('HEAD');
  ok('HEAD answers without a body', head.status === 200 && (await head.text()) === '');
  var unconfigured = await call('GET', {});
  ok('an unconfigured endpoint answers 503 without data', unconfigured.status === 503 && !/register"/.test(await unconfigured.text()));
  await pg.close();

  var broken = await X.createFakePostgrest(fakeRows, { failTables: ['audits'] });
  var failed = await call('GET', { SUPABASE_URL: broken.url, SUPABASE_SERVICE_ROLE_KEY: 'k' });
  var failedText = await failed.text();
  ok('a Supabase failure answers 502, uncached', failed.status === 502 && failed.headers.get('cache-control') === 'no-store');
  ok('a Supabase failure leaks no internal detail', !/exploded|secret-hint|audits/.test(failedText));
  await broken.close();

  var noRecords = await X.createFakePostgrest(fakeRows, { failTables: ['bureau_records'] });
  var partial = JSON.parse(await (await call('GET', { SUPABASE_URL: noRecords.url, SUPABASE_SERVICE_ROLE_KEY: 'k' })).text());
  ok('an unreadable Records Office leaves the register published, count withheld', partial.summary.recordsOnFile === null && partial.register.establishments.length > 0);
  await noRecords.close();

  var endpointSource = read('functions/api/public/register.js');
  ok('the endpoint issues no writes or RPCs', !/method:\s*'(POST|PATCH|PUT|DELETE)'|\/rpc\//.test(endpointSource));

  /* RLS: the anon role gains nothing. */
  var sql = fs.readdirSync(path.join(__dirname, 'supabase', 'migrations')).map(function (f) { return read(path.join('supabase', 'migrations', f)); })
    .concat([read('supabase/setup.sql')]).join('\n');
  ok('no SQL grants anything to anon', !/grant[^;]*\bto\s+[^;]*\banon\b/i.test(sql));
  ok('no RLS policy targets anon or public', !/create policy[^;]*\bto\s+(anon|public)\b/i.test(sql));

  /* =====================================================
     8. Routing
     ===================================================== */
  var root = (await X.loadHandler('functions/index.js')).onRequest;
  var appRoute = (await X.loadHandler('functions/app/[[path]].js')).onRequest;
  function assets() {
    var seen = [];
    return { seen: seen, fetch: function (req) { seen.push(new URL(req.url).pathname); return Promise.resolve(new Response('asset:' + new URL(req.url).pathname)); } };
  }
  async function routeRoot(href) {
    var a = assets(), nexted = false;
    var r = await root({ request: new Request(href), env: { ASSETS: a }, next: function () { nexted = true; return new Response('next'); } });
    return { res: r, assets: a.seen, nexted: nexted };
  }
  var apex = await routeRoot('https://pattybureau.com/');
  eq('pattybureau.com/ serves the public site', apex.assets, ['/public-site']);
  eq('www.pattybureau.com/ serves the public site', (await routeRoot('https://www.pattybureau.com/')).assets, ['/public-site']);
  var shareable = await routeRoot('https://pattybureau.com/?basis=fries&location=longfellow');
  eq('shared ranking links still serve the public site', shareable.assets, ['/public-site']);
  var fallback = await routeRoot('https://patty-stats.pages.dev/');
  ok('patty-stats.pages.dev/ keeps the auditor app', fallback.nexted && fallback.assets.length === 0);
  var recovery = await routeRoot('https://pattybureau.com/?auth=recovery');
  ok('a recovery link on the public root forwards to /app/ with its query', recovery.res.status === 302 &&
    recovery.res.headers.get('location') === 'https://pattybureau.com/app/?auth=recovery');
  var pkce = await routeRoot('https://pattybureau.com/?code=abc123');
  eq('a PKCE code on the public root forwards to /app/', pkce.res.headers.get('location'), 'https://pattybureau.com/app/?code=abc123');

  async function routeApp(href) {
    var a = assets();
    await appRoute({ request: new Request(href), env: { ASSETS: a } });
    return a.seen[0];
  }
  eq('/app/ serves the auditor app shell', await routeApp('https://pattybureau.com/app/'), '/');
  eq('/app/?auth=invite serves the app shell', await routeApp('https://pattybureau.com/app/?auth=invite'), '/');
  eq('/app/style.css serves app assets', await routeApp('https://pattybureau.com/app/style.css'), '/style.css');
  eq('/app/icons/icon-192.png serves app icons', await routeApp('https://pattybureau.com/app/icons/icon-192.png'), '/icons/icon-192.png');
  eq('/app/manifest.webmanifest serves the manifest', await routeApp('https://pattybureau.com/app/manifest.webmanifest'), '/manifest.webmanifest');

  var personnel = (await X.loadHandler('functions/api/personnel.js')).onRequestPost;
  var p1 = await personnel({ request: new Request('https://pattybureau.com/api/personnel', { method: 'POST', body: '{}' }), env: {} });
  eq('personnel endpoint still refuses when unconfigured', p1.status, 503);
  var p2 = await personnel({ request: new Request('https://pattybureau.com/api/personnel', { method: 'POST', body: '{}' }),
    env: { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'k' } });
  eq('personnel endpoint still requires authentication', p2.status, 401);

  /* =====================================================
     9. PWA, SEO and social metadata
     ===================================================== */
  var manifest = JSON.parse(read('manifest.webmanifest'));
  eq('installed app opens /app/ on the canonical domain',
    new URL(manifest.start_url, 'https://pattybureau.com/app/manifest.webmanifest').href, 'https://pattybureau.com/app/');
  eq('installed app scope is /app/ on the canonical domain',
    new URL(manifest.scope, 'https://pattybureau.com/app/manifest.webmanifest').href, 'https://pattybureau.com/app/');
  eq('installed app still opens / on the fallback host',
    new URL(manifest.start_url, 'https://patty-stats.pages.dev/manifest.webmanifest').href, 'https://patty-stats.pages.dev/');

  var html = read('public-site.html');
  function meta(attr, key) {
    var m = new RegExp('<meta ' + attr + '="' + key + '" content="([^"]+)"').exec(html);
    return m && m[1];
  }
  eq('public title', /<title>([^<]+)<\/title>/.exec(html)[1], 'Bureau of Patty Statistics — Official Burger Rankings');
  ok('public description', (meta('name', 'description') || '').length > 80);
  ok('canonical URL', /<link rel="canonical" href="https:\/\/pattybureau\.com\/" \/>/.test(html));
  eq('og:url', meta('property', 'og:url'), 'https://pattybureau.com/');
  eq('og:image', meta('property', 'og:image'), 'https://pattybureau.com/icons/og-card.png');
  ok('og:title and og:description', meta('property', 'og:title') && meta('property', 'og:description'));
  eq('twitter card', meta('name', 'twitter:card'), 'summary_large_image');
  var ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  ok('structured data describes an Organization, not a government body', ld['@graph'][0]['@type'] === 'Organization');
  ok('the public page links to the examiner portal', /href="\/app\/"/.test(html));
  ok('the public page loads the shared scoring modules', ['/taxonomy.js', '/scoring.js', '/analytics.js', '/public-register.js']
    .every(function (src) { return html.indexOf('src="' + src + '"') !== -1; }));
  ok('the public page does not claim the app manifest', !/rel="manifest"/.test(html));
  ok('the auditor app is marked noindex', /<meta name="robots" content="noindex, nofollow" \/>/.test(read('index.html')));
  var robots = read('robots.txt');
  ok('robots.txt keeps crawlers out of /app/', /Disallow: \/app\//.test(robots));
  ok('robots.txt lets rendered pages read the public register', /Allow: \/api\/public\//.test(robots));
  ok('robots.txt points at the sitemap', /Sitemap: https:\/\/pattybureau\.com\/sitemap\.xml/.test(robots));
  ok('sitemap lists the canonical root', /<loc>https:\/\/pattybureau\.com\/<\/loc>/.test(read('sitemap.xml')));
  var png = fs.readFileSync(path.join(__dirname, 'icons', 'og-card.png'));
  eq('og-card.png is 1200×630', [png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);

  report();
})().catch(function (err) {
  console.error(err && err.stack || err);
  process.exitCode = 1;
  report();
});

function report() {
  var failed = results.filter(function (r) { return !r.pass; });
  failed.forEach(function (r) { console.log('  FAIL  ' + r.name + (r.detail === undefined ? '' : '  ' + JSON.stringify(r.detail).slice(0, 900))); });
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' public checks passed');
  if (failed.length) process.exitCode = 1;
}
