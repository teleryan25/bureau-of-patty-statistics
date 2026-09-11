/* =============================================================
   Bureau of Patty Statistics — public-test-support.js

   Shared by public-tests.js and public-browser-tests.js (Node only):
     * rowsFromRegister()   the canonical register as PostgREST rows,
                            private columns included, so a leak would show
     * createFakePostgrest  a local stand-in for Supabase's REST API that
                            honours ?select= projections and records every
                            request, so tests can prove the public endpoint
                            is read-only and selects nothing private
     * randomRegister()     seeded registers for exhaustive parity checks
     * loadHandler()        imports a Pages Function module
   ============================================================= */
'use strict';

var http = require('http');
var path = require('path');
var url = require('url');
var S = require('./scoring.js');
var T = require('./taxonomy.js');

var PRIVATE_EMAIL_DOMAIN = 'private.example';

function rowsFromRegister(register, options) {
  options = options || {};
  var profiles = (register.profiles || []).map(function (p, i) {
    return {
      id: p.id, auditor_key: p.auditorKey, display_name: p.displayName,
      email: p.email || (p.auditorKey + '@' + PRIVATE_EMAIL_DOMAIN),
      active: p.active !== false, role: p.role || 'auditor',
      invitation_status: p.status || 'active', created_at: '2026-01-0' + ((i % 9) + 1) + 'T00:00:00Z'
    };
  });
  var locations = (register.locations || []).map(function (l) {
    return {
      id: l.id, name: l.name, name_key: l.nameKey, location_group: l.group,
      is_preset: !!l.isPreset, archived: !!l.archived, created_by: l.createdBy || null,
      created_at: l.createdAt || '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
    };
  });
  var establishments = [];
  var audits = [];
  (register.establishments || []).forEach(function (e) {
    establishments.push({
      id: e.id, file_number: e.fileNumber, name: e.name, name_key: e.nameKey || T.normalizeName(e.name),
      category: e.category, created_by: e.createdBy || 'uuid-ryan', created_at: e.createdAt,
      updated_at: e.updatedAt || e.createdAt, archived_at: null
    });
    (e.audits || []).forEach(function (a) {
      var row = {
        id: a.id, establishment_id: e.id, auditor_id: a.auditorId, burger: a.burger,
        location_id: a.locationId, schema_version: a.schemaVersion, legacy_burger_id: null,
        created_at: a.createdAt, updated_at: a.updatedAt || a.createdAt
      };
      S.SCORE_COLUMNS.forEach(function (c) { row[c.column] = a[c.key] == null ? null : a[c.key]; });
      audits.push(row);
    });
  });
  if (options.archived) {
    establishments.push({
      id: 'est-archived', file_number: 'BPS-9998', name: 'Merged Duplicate', name_key: 'merged duplicate',
      category: 'other', created_by: 'uuid-ryan', created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z', archived_at: '2026-01-02T00:00:00Z'
    });
  }
  audits.sort(function (a, b) { return Date.parse(a.created_at) - Date.parse(b.created_at); });
  return {
    profiles: profiles,
    locations: locations,
    establishments: establishments,
    audits: audits,
    bureau_records: (options.records || []).map(function (id) {
      return { record_id: id, holder: 'ryan', value: 1, detail: {}, fingerprint: id + '-x', updated_by: 'uuid-ryan' };
    })
  };
}

/* PostgREST, as far as the public endpoint uses it. */
function createFakePostgrest(rows, options) {
  options = options || {};
  var requests = [];
  var server = http.createServer(function (req, res) {
    var parsed = new URL(req.url, 'http://127.0.0.1');
    var query = Object.fromEntries(parsed.searchParams);
    var match = /^\/rest\/v1\/([a-z_]+)$/.exec(parsed.pathname || '');
    requests.push({ method: req.method, table: match && match[1], query: query,
                    auth: req.headers.authorization || null, apikey: req.headers.apikey || null });
    if (req.method !== 'GET') { res.writeHead(405); res.end('{}'); return; }
    if (!match || !rows[match[1]]) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"code":"PGRST205"}'); return; }
    var table = match[1];
    if ((options.failTables || []).indexOf(table) !== -1) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'internal detail: relation ' + table + ' exploded', hint: 'secret-hint' }));
      return;
    }
    var list = rows[table].slice();
    Object.keys(query).forEach(function (key) {
      if (key === 'select' || key === 'order' || key === 'limit') return;
      if (query[key] === 'is.null') list = list.filter(function (r) { return r[key] == null; });
    });
    var select = String(query.select || '*');
    if (select !== '*') {
      var cols = select.split(',');
      list = list.map(function (r) {
        var out = {};
        cols.forEach(function (c) { if (Object.prototype.hasOwnProperty.call(r, c)) out[c] = r[c]; });
        return out;
      });
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(list));
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({
        server: server,
        requests: requests,
        url: 'http://127.0.0.1:' + server.address().port,
        close: function () { return new Promise(function (r) { server.close(r); }); }
      });
    });
  });
}

function loadHandler(relative) {
  return import(url.pathToFileURL(path.join(__dirname, relative)).href);
}

/* ---------- seeded registers ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function randomRegister(seed, options) {
  options = options || {};
  var rand = mulberry32(seed);
  function pick(list) { return list[Math.floor(rand() * list.length)]; }
  function tenth(lo) { return Math.round((lo + rand() * (10 - lo)) * 10) / 10; }

  var profiles = [
    { id: 'uuid-ryan', auditorKey: 'ryan', displayName: 'Ryan', email: 'ryan@private.example', active: true, role: 'admin' },
    { id: 'uuid-devin', auditorKey: 'devin', displayName: 'Devin', email: 'devin@private.example', active: true, role: 'auditor' },
    { id: 'uuid-chris', auditorKey: 'chris', displayName: 'Chris', email: 'chris@private.example', active: true, role: 'auditor' },
    { id: 'uuid-pat', auditorKey: 'pat', displayName: 'Pat', email: 'pat@private.example', active: false, role: 'auditor' }
  ];
  if (options.fourActive) profiles.push({ id: 'uuid-sam', auditorKey: 'sam', displayName: 'Sam', email: 'sam@private.example', active: true, role: 'auditor' });

  var presets = T.PRESET_LOCATIONS.slice();
  var locations = [];
  for (var i = 0; i < 14; i++) {
    var p = presets.splice(Math.floor(rand() * presets.length), 1)[0];
    locations.push({ id: 'loc-uuid-' + seed + '-' + i, name: p.name, nameKey: p.nameKey, group: p.group, isPreset: true, archived: false });
  }
  locations.push({ id: 'loc-uuid-' + seed + '-custom', name: 'Mankato', nameKey: 'mankato', group: 'added', isPreset: false, archived: false });

  var base = Date.parse('2026-05-01T12:00:00Z');
  var establishments = [];
  var nEst = options.establishments || 16;
  var auditSeq = 0;
  for (var e = 0; e < nEst; e++) {
    /* Several establishments open on the same day to exercise ordering. */
    var opened = base + Math.floor(rand() * 60) * 86400000 + Math.floor(rand() * 20) * 3600000;
    var audits = [];
    var nAud = Math.floor(rand() * 7);
    for (var a = 0; a < nAud; a++) {
      var who = pick(profiles);
      var loc = pick(locations);
      var legacy = rand() < 0.15;
      var scores = { patty: tenth(3), overallFlavor: tenth(3), bun: tenth(3), fries: tenth(2),
                     value: tenth(3), condiments: tenth(3), serviceSpeed: tenth(3), serviceFriendliness: tenth(3) };
      if (legacy) { scores.serviceSpeed = null; scores.serviceFriendliness = null; }
      auditSeq += 1;
      var at = new Date(opened + Math.floor(rand() * 45) * 86400000 + Math.floor(rand() * 12) * 3600000).toISOString();
      var audit = {
        id: 'aud-uuid-' + seed + '-' + auditSeq, establishmentId: 'est-uuid-' + seed + '-' + e,
        auditorId: who.id, auditorKey: who.auditorKey, burger: pick(['Cheeseburger', 'Smashburger', 'Jucy Lucy', 'Double Patty Melt', 'The Special']),
        locationId: rand() < 0.05 ? null : loc.id, locationName: loc.name,
        schemaVersion: legacy ? 1 : 2, createdAt: at, updatedAt: at
      };
      S.INPUT_KEYS.forEach(function (k) { audit[k] = scores[k]; });
      audit.service = S.serviceScore(audit);
      audits.push(audit);
    }
    audits.sort(function (x, y) { return Date.parse(x.createdAt) - Date.parse(y.createdAt); });
    establishments.push({
      id: 'est-uuid-' + seed + '-' + e, fileNumber: 'BPS-' + String(e + 1).padStart(4, '0'),
      name: 'Establishment ' + seed + '-' + e, nameKey: 'establishment ' + seed + ' ' + e,
      category: pick(T.CATEGORY_KEYS), createdBy: 'uuid-ryan',
      createdAt: new Date(opened).toISOString(), updatedAt: new Date(opened).toISOString(), audits: audits
    });
  }
  if (options.shuffle) {
    for (var s = establishments.length - 1; s > 0; s--) {
      var j = Math.floor(rand() * (s + 1));
      var tmp = establishments[s]; establishments[s] = establishments[j]; establishments[j] = tmp;
    }
  }
  return { profiles: profiles, locations: locations, establishments: establishments };
}

/* Keys and values that must never appear in anything served publicly. */
var PRIVATE_KEYS = ['email', 'role', 'status', 'invitation_status', 'auditorId', 'auditor_id',
  'createdBy', 'created_by', 'updatedBy', 'updated_by', 'updatedAt', 'updated_at', 'archived_at', 'fingerprint'];
var UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function findPrivate(value, trail, out) {
  out = out || [];
  trail = trail || '$';
  if (Array.isArray(value)) value.forEach(function (v, i) { findPrivate(v, trail + '[' + i + ']', out); });
  else if (value && typeof value === 'object') {
    Object.keys(value).forEach(function (k) {
      if (PRIVATE_KEYS.indexOf(k) !== -1) out.push(trail + '.' + k);
      findPrivate(value[k], trail + '.' + k, out);
    });
  } else if (typeof value === 'string') {
    if (value.indexOf('@') !== -1 || UUID_RE.test(value) || /uuid-/.test(value)) out.push(trail + ' = ' + value);
  }
  return out;
}

module.exports = {
  rowsFromRegister: rowsFromRegister,
  createFakePostgrest: createFakePostgrest,
  loadHandler: loadHandler,
  randomRegister: randomRegister,
  findPrivate: findPrivate,
  PRIVATE_KEYS: PRIVATE_KEYS
};
