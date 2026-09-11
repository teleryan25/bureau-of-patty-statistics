'use strict';
const assert = require('node:assert/strict');
const S = require('./scoring.js');
const AN = require('./analytics.js');
const D = require('./data.js');

const profiles = ['ryan', 'devin', 'chris', 'pat'].map((key, i) => ({
  id: `uuid-${key}`, auditorKey: key, displayName: key[0].toUpperCase() + key.slice(1),
  active: true, role: i === 0 ? 'admin' : 'auditor'
}));
S.configureAuditors(profiles);
const scores = n => ({ patty:n, overallFlavor:n, bun:n, fries:n, value:n, condiments:n,
  serviceSpeed:n, serviceFriendliness:n });
const audit = (key, n, id) => Object.assign({ id, auditorKey:key, auditorId:`uuid-${key}`,
  establishmentId:'e', burger:'Filed Burger', locationId:'loc', locationName:'Uptown', schemaVersion:2,
  createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' }, scores(n));
const establishment = audits => ({ id:'e', fileNumber:'BPS-0001', name:'Dynamic Grill', category:'bar-pub',
  createdAt:'2026-01-01T00:00:00Z', audits });
const register = establishments => ({ profiles, locations:[], establishments });

assert.equal(S.isCertified(establishment([audit('chris', 7, 'a1')])), false, 'one distinct auditor is pending');
assert.equal(S.isCertified(establishment([audit('chris', 7, 'a1'), audit('pat', 9, 'a2')])), true, 'any two certify');
assert.equal(S.calculateCPI([scores(6), scores(8), scores(10)]), 80, 'three-way CPI mean');
assert.equal(S.calculateCPI([scores(4), scores(6), scores(8), scores(10)]), 70, 'four-way CPI mean');

const ranked = establishment([audit('ryan', 6, 'a1'), audit('devin', 8, 'a2'), audit('chris', 10, 'a3')]);
const metrics = AN.compute(register([ranked]));
assert.equal(metrics.ranked[0].cpi, 80, 'third contribution enters official score');
assert.equal(metrics.coverage.pat.remaining, 1, 'ranked place remains in fourth auditor backlog');
assert.equal(metrics.coverage.chris.remaining, 0, 'coverage recognizes a third auditor filing');
assert.equal(S.rankingBasis('fries').getScore(metrics.ranked[0]), 8, 'fries basis reads only aggregate fries');
assert.equal(S.rankingBasis('fries').scoreLabel, 'Fries', 'fries is never labeled CPI');

(async () => {
  const mock = D.createMockAdapter({ seed:false });
  const session = await mock.auth.signInAs('chris');
  assert.equal(session.profile.auditorKey, 'chris', 'third mock auditor authenticates');
  await assert.rejects(mock.personnel.invite({ displayName:'New', email:'new@example.com' }), /Administrator/);
  await mock.auth.signOut();
  await mock.auth.signInAs('ryan');
  const invited = await mock.personnel.invite({ displayName:'Taylor', email:'taylor@example.com' });
  assert.equal(invited.status, 'invited', 'admin can issue an invitation');
  console.log('multi-auditor tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
