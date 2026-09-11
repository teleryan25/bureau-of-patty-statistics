/* =============================================================
   Bureau of Patty Statistics — data.js

   The ONLY module that knows where data lives. Two adapters share
   one interface, so the rest of the app never branches on backend:

     supabaseAdapter — production: Supabase Auth + Postgres + RLS
     mockAdapter     — local dev and the automated test suite

   Canonical register handed to the app (identical from both):
     {
       locations:      [ { id, name, nameKey, group, isPreset, archived, ... } ],
       establishments: [ { id, fileNumber, name, nameKey, category,
                           createdBy, createdAt, updatedAt, audits: [...] } ]
     }

   Canonical audit:
     { id, establishmentId, auditorId, auditorKey, burger, locationId,
       locationName, schemaVersion, createdAt, updatedAt,
       patty, overallFlavor, bun, fries, value, condiments,
       serviceSpeed, serviceFriendliness, service }
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.data = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var S = isNode ? require('./scoring.js')  : root.BPS.scoring;
  var T = isNode ? require('./taxonomy.js') : root.BPS.taxonomy;

  /* ---------- shared helpers ---------- */

  /** A typed error the UI can branch on without matching prose. */
  function fail(code, message, detail) {
    var err = new Error(message);
    err.code = code;
    if (detail) err.detail = detail;
    return err;
  }

  function scoresToColumns(scores) {
    var out = {};
    S.SCORE_COLUMNS.forEach(function (c) {
      out[c.column] = scores[c.key] == null ? null : Number(scores[c.key]);
    });
    return out;
  }

  function rowToScores(row) {
    var out = {};
    S.SCORE_COLUMNS.forEach(function (c) {
      out[c.key] = row[c.column] == null ? null : Number(row[c.column]);
    });
    out.service = S.serviceScore(out);
    return out;
  }

  function cleanEstablishmentInput(input) {
    var name = T.cleanDisplayName(input && input.name);
    if (!name) throw fail('invalid-name', 'An establishment name is required.');
    return { name: name, nameKey: T.normalizeName(name), category: T.coerceCategory(input && input.category) };
  }

  function cleanLocationInput(name) {
    var clean = T.cleanDisplayName(name);
    if (!clean) throw fail('invalid-name', 'A location name is required.');
    if (clean.length > 80) throw fail('invalid-name', 'Location names are limited to 80 characters.');
    return { name: clean, nameKey: T.normalizeName(clean) };
  }

  /** Everything an audit must carry before the Bureau will accept it. */
  function cleanAuditInput(input) {
    var burger = T.cleanDisplayName(input && input.burger);
    if (!burger) throw fail('invalid-burger', 'The burger examined must be recorded.');
    if (!input || !input.establishmentId) throw fail('invalid-establishment', 'An establishment is required.');
    if (!input.locationId) throw fail('invalid-location', 'A location is required.');
    var scores = {};
    S.INPUT_KEYS.forEach(function (k) { scores[k] = input[k]; });
    if (!S.isCurrentSchemaScores(scores)) {
      throw fail('invalid-scores',
        'Every category and both Service sub-scores must be tenths between 0.0 and 10.0.');
    }
    S.INPUT_KEYS.forEach(function (k) { scores[k] = Number(scores[k]); });
    return {
      establishmentId: input.establishmentId,
      locationId: input.locationId,
      burger: burger,
      scores: scores
    };
  }

  /* Retained for callers that only want the score-set check. */
  function requireCompleteScores(scores) {
    if (!S.isCurrentSchemaScores(scores)) {
      throw fail('invalid-scores',
        'Every category and both Service sub-scores must be tenths between 0.0 and 10.0.');
    }
  }

  function nowIso() { return new Date().toISOString(); }

  /* ===========================================================
     MOCK ADAPTER
     In-memory. Simulates a dynamic auditor roster, the shared location
     register, independent audits, the Records Office store and an
     email/password sign-in without touching the network.
     =========================================================== */
  function createMockAdapter(options) {
    options = options || {};
    var MOCK_PASSWORD = 'bps-demo';

    var profiles = {
      ryan:  { id: 'uuid-ryan', auditorKey: 'ryan', displayName: 'Ryan', email: 'ryanburtonwi@gmail.com', active: true, role: 'admin', status: 'active' },
      devin: { id: 'uuid-devin', auditorKey: 'devin', displayName: 'Devin', email: 'devinreiter907@gmail.com', active: true, role: 'auditor', status: 'active' },
      chris: { id: 'uuid-chris', auditorKey: 'chris', displayName: 'Chris', email: 'chris@example.com', active: true, role: 'auditor', status: 'active' }
    };

    var state = {
      session: null,
      establishments: [],
      locations: [],
      audits: [],
      records: {},
      recordHistory: [],
      acks: {},          /* auditorId -> { recordId: fingerprint } */
      seq: 0,
      ids: 0
    };

    function uid(prefix) { state.ids += 1; return prefix + '-' + state.ids; }

    function newFileNumber() {
      state.seq += 1;
      return 'BPS-' + String(state.seq).padStart(4, '0');
    }

    function profileByEmail(email) {
      var e = String(email || '').trim().toLowerCase();
      return Object.keys(profiles).map(function (k) { return profiles[k]; })
        .filter(function (p) { return p.email.toLowerCase() === e; })[0] || null;
    }

    function profileById(id) {
      return Object.keys(profiles).map(function (k) { return profiles[k]; })
        .filter(function (p) { return p.id === id; })[0] || null;
    }

    function requireSession() {
      if (!state.session) throw fail('unauthenticated', 'Not authenticated.');
      if (!state.session.profile.active) throw fail('inactive-profile', 'These Bureau credentials have been deactivated.');
      return state.session;
    }

    function locationById(id) {
      return state.locations.filter(function (l) { return l.id === id; })[0] || null;
    }

    function seedPresetLocations() {
      T.PRESET_LOCATIONS.forEach(function (preset) {
        state.locations.push({
          id: uid('loc'), name: preset.name, nameKey: preset.nameKey, group: preset.group,
          isPreset: true, archived: false, createdBy: null, createdAt: '2026-01-01T00:00:00.000Z'
        });
      });
    }

    function assembleAudit(a) {
      var p = profileById(a.auditorId);
      var loc = locationById(a.locationId);
      var out = {
        id: a.id,
        establishmentId: a.establishmentId,
        auditorId: a.auditorId,
        auditorKey: p ? p.auditorKey : null,
        burger: a.burger,
        locationId: a.locationId,
        locationName: loc ? loc.name : null,
        schemaVersion: a.schemaVersion,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      };
      S.INPUT_KEYS.forEach(function (k) { out[k] = a[k] == null ? null : Number(a[k]); });
      out.service = S.serviceScore(out);
      return out;
    }

    function assemble() {
      var byEst = {};
      state.audits.forEach(function (a) {
        (byEst[a.establishmentId] = byEst[a.establishmentId] || []).push(assembleAudit(a));
      });
      Object.keys(byEst).forEach(function (k) {
        byEst[k].sort(function (x, y) { return Date.parse(x.createdAt) - Date.parse(y.createdAt); });
      });
      return {
        profiles: Object.keys(profiles).map(function (k) { return Object.assign({}, profiles[k]); }),
        locations: state.locations.map(function (l) {
          return { id: l.id, name: l.name, nameKey: l.nameKey, group: l.group,
                   isPreset: l.isPreset, archived: l.archived, createdBy: l.createdBy, createdAt: l.createdAt };
        }),
        establishments: state.establishments
          .filter(function (e) { return !e.archivedAt; })
          .map(function (e) {
            return {
              id: e.id, fileNumber: e.fileNumber, name: e.name, nameKey: e.nameKey,
              category: e.category, createdBy: e.createdBy, createdAt: e.createdAt,
              updatedAt: e.updatedAt, audits: byEst[e.id] || []
            };
          })
      };
    }

    var adapter = {
      mode: 'mock',

      /* ---- auth ---- */
      auth: {
        getSession: function () {
          return Promise.resolve(state.session);
        },
        signIn: function (email, password) {
          var p = profileByEmail(email);
          if (!p || !p.active || String(password) !== MOCK_PASSWORD) {
            return Promise.reject(fail('bad-credentials', 'Invalid email or password.'));
          }
          state.session = { userId: p.id, email: p.email, profile: p };
          return Promise.resolve(state.session);
        },
        signOut: function () {
          state.session = null;
          return Promise.resolve();
        },
        requestPasswordReset: function (email) {
          return profileByEmail(email) ? Promise.resolve() : Promise.reject(fail('unknown-auditor', 'No Bureau credentials were found.'));
        },
        updatePassword: function (password) {
          requireSession();
          if (!String(password || '').length) return Promise.reject(fail('invalid-password', 'A password is required.'));
          return Promise.resolve();
        },
        /** Test hook: bypass the login form entirely. */
        signInAs: function (auditorKey) {
          var p = profiles[auditorKey];
          if (!p) return Promise.reject(fail('unknown-auditor', 'Unknown mock auditor.'));
          state.session = { userId: p.id, email: p.email, profile: p };
          return Promise.resolve(state.session);
        }
      },

      personnel: {
        list: function () { requireSession(); return Promise.resolve(assemble().profiles); },
        invite: function (input) {
          var session = requireSession();
          if (session.profile.role !== 'admin') return Promise.reject(fail('forbidden', 'Administrator credentials required.'));
          var key = T.normalizeName(input.displayName).replace(/\s+/g, '-');
          if (!key) return Promise.reject(fail('invalid-name', 'A display name is required.'));
          profiles[key] = { id: uid('uuid'), auditorKey: key, displayName: input.displayName,
            email: String(input.email).toLowerCase(), active: false, role: 'auditor', status: 'invited' };
          return Promise.resolve(profiles[key]);
        },
        resend: function () { var s = requireSession(); return s.profile.role === 'admin' ? Promise.resolve() : Promise.reject(fail('forbidden', 'Administrator credentials required.')); },
        setActive: function (id, active) {
          var s = requireSession();
          if (s.profile.role !== 'admin') return Promise.reject(fail('forbidden', 'Administrator credentials required.'));
          var p = profileById(id); if (!p) return Promise.reject(fail('not-found', 'Personnel record not found.'));
          p.active = !!active; p.status = active ? 'active' : 'deactivated'; return Promise.resolve(p);
        }
      },

      /* ---- register ---- */
      listRegister: function () {
        return Promise.resolve(assemble());
      },

      createEstablishment: function (input) {
        try {
          requireSession();
          var clean = cleanEstablishmentInput(input);
          var existing = state.establishments.filter(function (e) {
            return e.nameKey === clean.nameKey && !e.archivedAt;
          })[0];
          if (existing) return Promise.resolve(assemble().establishments
            .filter(function (e) { return e.id === existing.id; })[0]);
          var e = {
            id: uid('est'), fileNumber: newFileNumber(), name: clean.name, nameKey: clean.nameKey,
            category: clean.category, createdBy: state.session.userId,
            createdAt: input.createdAt || nowIso(), updatedAt: input.createdAt || nowIso(), archivedAt: null
          };
          state.establishments.push(e);
          return Promise.resolve({ id: e.id, fileNumber: e.fileNumber, name: e.name, nameKey: e.nameKey,
                                   category: e.category, createdBy: e.createdBy, createdAt: e.createdAt,
                                   updatedAt: e.updatedAt, audits: [] });
        } catch (err) { return Promise.reject(err); }
      },

      /* Shared metadata — either auditor may correct it. A rename that
         would collide with another establishment is refused with a typed
         error so the UI can offer a merge instead of corrupting state. */
      updateEstablishment: function (id, patch) {
        try {
          requireSession();
          var e = state.establishments.filter(function (x) { return x.id === id; })[0];
          if (!e) throw fail('not-found', 'Establishment not found.');
          if (patch.name != null) {
            var clean = cleanEstablishmentInput({ name: patch.name, category: e.category });
            var clash = state.establishments.filter(function (x) {
              return x.id !== id && x.nameKey === clean.nameKey && !x.archivedAt;
            })[0];
            if (clash) {
              throw fail('name-collision',
                'An establishment named ' + clash.name + ' is already on file.',
                { establishmentId: clash.id, name: clash.name });
            }
            e.name = clean.name;
            e.nameKey = clean.nameKey;
          }
          if (patch.category != null) e.category = T.coerceCategory(patch.category);
          e.updatedAt = nowIso();
          return Promise.resolve(assemble().establishments.filter(function (x) { return x.id === id; })[0]);
        } catch (err) { return Promise.reject(err); }
      },

      /** Move every audit onto `targetId`, then retire the empty source. */
      mergeEstablishments: function (sourceId, targetId) {
        try {
          requireSession();
          if (sourceId === targetId) throw fail('invalid-merge', 'An establishment cannot merge into itself.');
          var source = state.establishments.filter(function (x) { return x.id === sourceId; })[0];
          var target = state.establishments.filter(function (x) { return x.id === targetId; })[0];
          if (!source || !target) throw fail('not-found', 'Establishment not found.');
          state.audits.forEach(function (a) { if (a.establishmentId === sourceId) a.establishmentId = targetId; });
          source.archivedAt = nowIso();
          target.updatedAt = nowIso();
          return Promise.resolve(assemble().establishments.filter(function (x) { return x.id === targetId; })[0]);
        } catch (err) { return Promise.reject(err); }
      },

      /* ---- locations ---- */

      /* Adding a location that already exists (in any casing or
         punctuation) returns the existing row rather than a duplicate. */
      createLocation: function (name) {
        try {
          requireSession();
          var clean = cleanLocationInput(name);
          var existing = state.locations.filter(function (l) { return l.nameKey === clean.nameKey; })[0];
          if (existing) {
            if (existing.archived) existing.archived = false;
            return Promise.resolve(existing);
          }
          var l = {
            id: uid('loc'), name: clean.name, nameKey: clean.nameKey, group: T.CUSTOM_GROUP.key,
            isPreset: false, archived: false, createdBy: state.session.userId, createdAt: nowIso()
          };
          state.locations.push(l);
          return Promise.resolve(l);
        } catch (err) { return Promise.reject(err); }
      },

      renameLocation: function (id, name) {
        try {
          requireSession();
          var clean = cleanLocationInput(name);
          var l = locationById(id);
          if (!l) throw fail('not-found', 'Location not found.');
          var clash = state.locations.filter(function (x) {
            return x.id !== id && x.nameKey === clean.nameKey;
          })[0];
          if (clash) {
            throw fail('name-collision', 'A location named ' + clash.name + ' is already on file.',
              { locationId: clash.id, name: clash.name });
          }
          l.name = clean.name;
          l.nameKey = clean.nameKey;
          return Promise.resolve(l);
        } catch (err) { return Promise.reject(err); }
      },

      /* Locations are never hard-deleted; archiving only removes them
         from future selection. Historical audits keep their reference. */
      setLocationArchived: function (id, archived) {
        try {
          requireSession();
          var l = locationById(id);
          if (!l) throw fail('not-found', 'Location not found.');
          l.archived = !!archived;
          return Promise.resolve(l);
        } catch (err) { return Promise.reject(err); }
      },

      /* ---- audits ---- */

      /** File a NEW audit owned by the current user. */
      createAudit: function (input) {
        try {
          var session = requireSession();
          var clean = cleanAuditInput(input);
          if (!state.establishments.some(function (e) { return e.id === clean.establishmentId; })) {
            throw fail('not-found', 'Establishment not found.');
          }
          if (!locationById(clean.locationId)) throw fail('not-found', 'Location not found.');
          var when = input.createdAt || nowIso();
          var audit = {
            id: uid('aud'), establishmentId: clean.establishmentId, auditorId: session.userId,
            burger: clean.burger, locationId: clean.locationId, schemaVersion: S.SCHEMA_VERSION,
            createdAt: when, updatedAt: when
          };
          S.INPUT_KEYS.forEach(function (k) { audit[k] = clean.scores[k]; });
          state.audits.push(audit);
          return Promise.resolve(assembleAudit(audit));
        } catch (err) { return Promise.reject(err); }
      },

      /** Amend an audit — strictly the caller's own. */
      updateAudit: function (auditId, input) {
        try {
          var session = requireSession();
          var audit = state.audits.filter(function (a) { return a.id === auditId; })[0];
          if (!audit) throw fail('not-found', 'Audit not found.');
          if (audit.auditorId !== session.userId) {
            throw fail('not-owner', 'An auditor may only amend their own audit.');
          }
          var clean = cleanAuditInput(Object.assign({ establishmentId: audit.establishmentId }, input));
          if (!locationById(clean.locationId)) throw fail('not-found', 'Location not found.');
          audit.burger = clean.burger;
          audit.locationId = clean.locationId;
          audit.schemaVersion = S.SCHEMA_VERSION;
          S.INPUT_KEYS.forEach(function (k) { audit[k] = clean.scores[k]; });
          audit.updatedAt = nowIso();
          return Promise.resolve(assembleAudit(audit));
        } catch (err) { return Promise.reject(err); }
      },

      /* ---- Records Office ---- */
      listRecords: function () {
        return Promise.resolve(Object.keys(state.records).map(function (k) {
          return Object.assign({}, state.records[k]);
        }));
      },

      listRecordHistory: function () {
        return Promise.resolve(state.recordHistory.slice());
      },

      /** Insert or advance records, archiving whatever they replaced. */
      saveRecords: function (rows) {
        try {
          var session = requireSession();
          var written = [];
          (rows || []).forEach(function (row) {
            var previous = state.records[row.recordId] || null;
            if (previous && previous.fingerprint === row.fingerprint) return;
            if (previous) {
              state.recordHistory.push(Object.assign({}, previous, { endedAt: nowIso() }));
            }
            state.records[row.recordId] = {
              recordId: row.recordId,
              holder: row.holder == null ? null : row.holder,
              establishmentId: row.establishmentId == null ? null : row.establishmentId,
              establishmentName: row.establishmentName == null ? null : row.establishmentName,
              value: row.value == null ? null : Number(row.value),
              valueText: row.valueText == null ? null : String(row.valueText),
              detail: row.detail || {},
              fingerprint: row.fingerprint,
              version: previous ? (previous.version || 1) + 1 : 1,
              establishedAt: row.establishedAt || nowIso(),
              previous: previous ? {
                holder: previous.holder, value: previous.value, valueText: previous.valueText,
                establishmentName: previous.establishmentName, establishedAt: previous.establishedAt
              } : null,
              updatedBy: session.userId
            };
            written.push(row.recordId);
          });
          return Promise.resolve(written);
        } catch (err) { return Promise.reject(err); }
      },

      listRecordAcks: function () {
        try {
          var session = requireSession();
          return Promise.resolve(Object.assign({}, state.acks[session.userId] || {}));
        } catch (err) { return Promise.reject(err); }
      },

      /** Per-user acknowledgement: Ryan dismissing never mutes Devin. */
      ackRecords: function (map) {
        try {
          var session = requireSession();
          var mine = state.acks[session.userId] = state.acks[session.userId] || {};
          Object.keys(map || {}).forEach(function (k) { mine[k] = map[k]; });
          return Promise.resolve(Object.assign({}, mine));
        } catch (err) { return Promise.reject(err); }
      },

      /* ---- test helpers (mock only) ---- */
      _reset: function (opts) {
        state.establishments = []; state.locations = []; state.audits = [];
        state.records = {}; state.recordHistory = []; state.acks = {};
        state.seq = 0; state.ids = 0; state.session = null;
        if (!opts || opts.presets !== false) seedPresetLocations();
      },
      _locationIdByName: function (name) {
        var key = T.normalizeName(name);
        var hit = state.locations.filter(function (l) { return l.nameKey === key; })[0];
        return hit ? hit.id : null;
      },
      /** Seed an establishment plus any number of audits, bypassing auth. */
      _seed: function (name, category, audits, meta) {
        meta = meta || {};
        var key = T.normalizeName(name);
        var e = state.establishments.filter(function (x) { return x.nameKey === key; })[0];
        if (!e) {
          e = {
            id: meta.id || uid('est'), fileNumber: newFileNumber(), name: name, nameKey: key,
            category: T.coerceCategory(category), createdBy: meta.createdBy || profiles.ryan.id,
            createdAt: meta.createdAt || nowIso(), updatedAt: meta.createdAt || nowIso(), archivedAt: null
          };
          state.establishments.push(e);
        }
        (audits || []).forEach(function (a) {
          var locId = a.locationId || adapter._locationIdByName(a.location || 'Uptown');
          var when = a.at || e.createdAt;
          var row = {
            id: uid('aud'), establishmentId: e.id, auditorId: profiles[a.auditor].id,
            burger: a.burger, locationId: a.legacy ? null : locId,
            schemaVersion: a.legacy ? S.LEGACY_SCHEMA_VERSION : S.SCHEMA_VERSION,
            createdAt: when, updatedAt: when
          };
          S.INPUT_KEYS.forEach(function (k) {
            row[k] = a.scores && a.scores[k] != null ? Number(a.scores[k]) : null;
          });
          state.audits.push(row);
        });
        return e;
      },
      _seedRecord: function (row) {
        state.records[row.recordId] = Object.assign({ version: 1, detail: {} }, row);
        return state.records[row.recordId];
      },
      _profiles: profiles,
      _state: state
    };

    seedPresetLocations();
    if (options.seed !== false) seedDemoData(adapter);
    return adapter;
  }

  /* A small demo register so mock mode has something to analyse.
     Deliberately mixed: repeat establishments, several branches, both
     auditors on different burgers, and a legacy filing that predates
     the Service schema. */
  function seedDemoData(adapter) {
    function sc(p, o, b, f, v, c, speed, friend) {
      return { patty: p, overallFlavor: o, bun: b, fries: f, value: v, condiments: c,
               serviceSpeed: speed, serviceFriendliness: friend };
    }
    var day = 86400000;
    var t0 = Date.parse('2026-06-02T18:30:00Z');
    function at(d, h) { return new Date(t0 + d * day + (h || 0) * 3600000).toISOString(); }

    adapter._seed('Matt’s Bar', 'bar-pub', [
      { auditor: 'ryan',  burger: 'Jucy Lucy', location: 'Longfellow', at: at(0),
        scores: sc(9.4, 9.6, 8.2, 7.1, 8.8, 8.4, 7.6, 8.9) },
      { auditor: 'devin', burger: 'Jucy Lucy', location: 'Longfellow', at: at(1, 3),
        scores: sc(9.1, 9.2, 8.6, 7.8, 8.4, 8.0, 8.2, 8.4) },
      { auditor: 'ryan',  burger: 'Jucy Lucy', location: 'Longfellow', at: at(35),
        scores: sc(9.2, 9.4, 8.0, 7.4, 8.6, 8.2, 7.2, 8.6) }
    ], { createdAt: at(0) });

    adapter._seed('The 5-8 Club', 'casual-dining', [
      { auditor: 'ryan',  burger: 'Original Juicy Lucy', location: 'Nokomis', at: at(6),
        scores: sc(8.8, 8.9, 8.0, 8.6, 8.2, 7.9, 8.0, 8.3) },
      { auditor: 'devin', burger: 'Saucy Sally', location: 'Maplewood', at: at(6, 2),
        scores: sc(8.4, 8.5, 8.4, 8.1, 8.6, 8.2, 7.8, 8.8) }
    ], { createdAt: at(6) });

    adapter._seed('Culver’s', 'fast-food', [
      { auditor: 'devin', burger: 'ButterBurger Cheese', location: 'Eden Prairie', at: at(11),
        scores: sc(9.0, 8.8, 8.6, 9.2, 9.0, 8.4, 9.1, 9.4) },
      { auditor: 'ryan',  burger: 'ButterBurger Cheese', location: 'Richfield', at: at(12),
        scores: sc(8.8, 8.6, 8.8, 9.0, 8.8, 8.2, 8.9, 9.2) },
      { auditor: 'ryan',  burger: 'The Culver’s Deluxe', location: 'Shakopee', at: at(24),
        scores: sc(9.1, 9.0, 8.4, 9.3, 8.6, 8.5, 8.4, 9.0) },
      { auditor: 'devin', burger: 'ButterBurger Deluxe', location: 'Bloomington', at: at(30),
        scores: sc(8.6, 8.7, 8.5, 9.1, 8.9, 8.3, 8.8, 9.5) }
    ], { createdAt: at(11), createdBy: 'uuid-devin' });

    adapter._seed('Hensley’s Counter', 'fast-casual', [
      { auditor: 'ryan',  burger: 'Smash Protocol No. 7', location: 'North Loop', at: at(17),
        scores: sc(9.2, 9.0, 8.6, 8.4, 8.8, 8.7, 8.1, 7.9) },
      { auditor: 'devin', burger: 'Smash Protocol No. 7', location: 'North Loop', at: at(19),
        scores: sc(8.8, 9.1, 8.4, 8.6, 9.0, 8.5, 7.7, 8.2) }
    ], { createdAt: at(17) });

    adapter._seed('Route 9 Drive-In', 'food-truck', [
      { auditor: 'ryan',  burger: 'The Provisional Cheeseburger', location: 'Stillwater', at: at(23),
        scores: sc(8.2, 8.4, 7.6, 9.1, 8.9, 7.8, 9.4, 8.0) },
      { auditor: 'devin', burger: 'The Midnight Filing', location: 'Stillwater', at: at(24, 6),
        scores: sc(7.6, 7.9, 7.9, 8.8, 9.2, 8.1, 9.6, 7.6) }
    ], { createdAt: at(23) });

    adapter._seed('Nook', 'bar-pub', [
      { auditor: 'ryan',  burger: 'Juicy Nookie', location: 'Highland Park', at: at(41),
        scores: sc(9.8, 9.7, 8.8, 9.4, 8.6, 8.9, 7.4, 9.1) },
      { auditor: 'devin', burger: 'Juicy Nookie', location: 'Highland Park', at: at(42),
        scores: sc(9.2, 9.4, 9.0, 9.6, 8.2, 9.2, 7.0, 8.8) }
    ], { createdAt: at(41) });

    adapter._seed('Wellness Annex', 'other', [
      { auditor: 'ryan',  burger: 'Turkey Substitute Filing', location: 'Edina', at: at(47),
        scores: sc(4.6, 4.8, 6.4, 5.2, 6.8, 5.4, 6.0, 5.8) },
      { auditor: 'devin', burger: 'Turkey Substitute Filing', location: 'Edina', at: at(52),
        scores: sc(3.9, 4.2, 6.0, 4.8, 7.2, 5.0, 5.4, 6.2) }
    ], { createdAt: at(47) });

    adapter._seed('Blue Door Pub', 'bar-pub', [
      { auditor: 'ryan', burger: 'Blucy', location: 'West Seventh', at: at(58),
        scores: sc(9.0, 9.2, 8.4, 8.8, 8.0, 8.6, 8.5, 8.7) }
    ], { createdAt: at(58) });

    /* Filed before Service existed: preserved verbatim, not yet current. */
    adapter._seed('Parlour', 'bar-pub', [
      { auditor: 'devin', burger: 'Parlour Burger', at: at(60), legacy: true,
        scores: { patty: 9.5, overallFlavor: 9.6, bun: 9.0, fries: 8.4, value: 8.2, condiments: 8.8 } }
    ], { createdAt: at(60), createdBy: 'uuid-devin' });
  }

  /* ===========================================================
     SUPABASE ADAPTER
     =========================================================== */
  function createSupabaseAdapter(config) {
    var lib = root.supabase;
    if (!lib || typeof lib.createClient !== 'function') {
      throw fail('service-unavailable', 'supabase-js failed to load.');
    }
    var client = lib.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    function loadProfile(userId) {
      return client.from('profiles').select('id, auditor_key, display_name, email, active, role, invitation_status, created_at')
        .eq('id', userId).single()
        .then(function (res) {
          if (res.error) throw res.error;
          if (res.data.active === false) throw fail('inactive-profile', 'These Bureau credentials have been deactivated.');
          return { id: res.data.id, auditorKey: res.data.auditor_key, displayName: res.data.display_name,
            email: res.data.email, active: res.data.active, role: res.data.role,
            status: res.data.invitation_status, createdAt: res.data.created_at };
        });
    }

    function sessionFrom(sbSession) {
      if (!sbSession || !sbSession.user) return null;
      return client.rpc('activate_invited_profile', {}).then(function () { return loadProfile(sbSession.user.id); }).then(function (profile) {
        return { userId: sbSession.user.id, email: sbSession.user.email, profile: profile };
      });
    }

    function currentUser() {
      return client.auth.getUser().then(function (res) {
        var user = res.data && res.data.user;
        if (!user) throw fail('unauthenticated', 'Not authenticated.');
        return user;
      });
    }

    function unwrap(res) {
      if (res.error) throw res.error;
      return res.data;
    }

    /* If the v2 migration has not been applied yet, PostgREST reports a
       missing relation. Say so plainly rather than failing as a generic
       network problem. */
    function isMissingSchema(err) {
      if (!err) return false;
      var code = String(err.code || '');
      if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') return true;
      return /does not exist|schema cache/i.test(String(err.message || ''));
    }

    function guardSchema(err) {
      if (isMissingSchema(err)) {
        throw fail('schema-outdated',
          'The Bureau database has not yet been upgraded to the current schema. ' +
          'Run supabase/migrations/002_bps_v2.sql in the Supabase SQL editor.');
      }
      throw err;
    }

    function locationRow(l) {
      return { id: l.id, name: l.name, nameKey: l.name_key, group: l.location_group,
               isPreset: !!l.is_preset, archived: !!l.archived, createdBy: l.created_by,
               createdAt: l.created_at };
    }

    /* Postgres raises 23505 on the unique name_key indexes. Translate it
       into the same typed error the mock adapter produces so the UI has
       one code path for "that name is already on file". */
    function translate(err, code, message) {
      if (err && err.code === '23505') return fail(code, message);
      return err;
    }

    return {
      mode: 'supabase',
      client: client,

      auth: {
        getSession: function () {
          return client.auth.getSession().then(function (res) {
            return sessionFrom(res.data && res.data.session);
          }).catch(function () { return null; });
        },
        signIn: function (email, password) {
          return client.auth.signInWithPassword({
            email: String(email).trim(), password: String(password)
          }).then(function (res) {
            if (res.error) throw res.error;
            return sessionFrom(res.data.session);
          });
        },
        signOut: function () {
          return client.auth.signOut().then(function (res) {
            if (res && res.error) throw res.error;
          });
        },
        requestPasswordReset: function (email) {
          return client.auth.resetPasswordForEmail(String(email).trim(), {
            redirectTo: window.location.origin + window.location.pathname + '?auth=recovery'
          }).then(function (res) { if (res.error) throw res.error; });
        },
        updatePassword: function (password) {
          return client.auth.updateUser({ password: String(password) })
            .then(function (res) { if (res.error) throw res.error; return res.data; });
        }
      },

      personnel: {
        list: function () {
          return client.from('profiles').select('id, auditor_key, display_name, email, active, role, invitation_status, created_at')
            .order('created_at').then(function (res) {
              return (unwrap(res) || []).map(function (p) { return { id: p.id, auditorKey: p.auditor_key,
                displayName: p.display_name, email: p.email, active: p.active, role: p.role,
                status: p.invitation_status, createdAt: p.created_at }; });
            });
        },
        request: function (action, payload) {
          return client.auth.getSession().then(function (res) {
            var token = res.data && res.data.session && res.data.session.access_token;
            if (!token) throw fail('unauthenticated', 'Not authenticated.');
            return fetch('/api/personnel', { method: 'POST', headers: {
              'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token
            }, body: JSON.stringify(Object.assign({ action: action }, payload || {})) });
          }).then(function (res) { return res.json().then(function (body) {
            if (!res.ok) throw fail(body.code || 'personnel-error', body.error || 'Personnel action failed.');
            return body;
          }); });
        },
        invite: function (input) { return this.request('invite', input); },
        resend: function (id) { return this.request('resend', { id: id }); },
        setActive: function (id, active) { return this.request('set-active', { id: id, active: !!active }); }
      },

      listRegister: function () {
        return Promise.all([
          client.from('establishments').select('*').is('archived_at', null)
            .order('created_at', { ascending: true }),
          client.from('audits').select('*').order('created_at', { ascending: true }),
          client.from('locations').select('*').order('name', { ascending: true }),
          client.from('profiles').select('id, auditor_key, display_name, email, active, role, invitation_status, created_at')
        ]).then(function (results) {
          results.forEach(function (r) { if (r.error) guardSchema(r.error); });
          var establishments = results[0].data || [];
          var audits = results[1].data || [];
          var locations = (results[2].data || []).map(locationRow);
          var profiles = results[3].data || [];

          var keyById = {};
          profiles.forEach(function (p) { keyById[p.id] = p.auditor_key; });
          var locById = {};
          locations.forEach(function (l) { locById[l.id] = l; });

          var byEst = {};
          audits.forEach(function (a) {
            var loc = a.location_id ? locById[a.location_id] : null;
            var row = Object.assign(rowToScores(a), {
              id: a.id,
              establishmentId: a.establishment_id,
              auditorId: a.auditor_id,
              auditorKey: keyById[a.auditor_id] || null,
              burger: a.burger,
              locationId: a.location_id,
              locationName: loc ? loc.name : null,
              schemaVersion: a.schema_version,
              createdAt: a.created_at,
              updatedAt: a.updated_at
            });
            if (!row.auditorKey) return;
            (byEst[a.establishment_id] = byEst[a.establishment_id] || []).push(row);
          });

          return {
            profiles: profiles.map(function (p) { return { id: p.id, auditorKey: p.auditor_key,
              displayName: p.display_name, email: p.email, active: p.active, role: p.role,
              status: p.invitation_status, createdAt: p.created_at }; }),
            locations: locations,
            establishments: establishments.map(function (e) {
              return {
                id: e.id, fileNumber: e.file_number, name: e.name, nameKey: e.name_key,
                category: T.coerceCategory(e.category), createdBy: e.created_by,
                createdAt: e.created_at, updatedAt: e.updated_at,
                audits: byEst[e.id] || []
              };
            })
          };
        });
      },

      createEstablishment: function (input) {
        var clean;
        try { clean = cleanEstablishmentInput(input); }
        catch (err) { return Promise.reject(err); }
        return currentUser().then(function (user) {
          /* Reuse an existing establishment rather than minting a twin.
             A record retired by a merge must not be resurrected. */
          return client.from('establishments').select('*')
            .eq('name_key', clean.nameKey).is('archived_at', null).maybeSingle()
            .then(function (res) {
              if (res.error) throw res.error;
              if (res.data) return res.data;
              return client.from('establishments').insert({
                name: clean.name, name_key: clean.nameKey,
                category: clean.category, created_by: user.id
              }).select().single().then(unwrap);
            });
        }).then(function (row) {
          return { id: row.id, fileNumber: row.file_number, name: row.name, nameKey: row.name_key,
                   category: T.coerceCategory(row.category), createdBy: row.created_by,
                   createdAt: row.created_at, updatedAt: row.updated_at, audits: [] };
        });
      },

      updateEstablishment: function (id, patch) {
        var payload = {};
        try {
          if (patch.name != null) {
            var clean = cleanEstablishmentInput({ name: patch.name, category: patch.category });
            payload.name = clean.name;
            payload.name_key = clean.nameKey;
          }
          if (patch.category != null) payload.category = T.coerceCategory(patch.category);
        } catch (err) { return Promise.reject(err); }

        var guard = payload.name_key
          ? client.from('establishments').select('id, name')
              .eq('name_key', payload.name_key).neq('id', id).is('archived_at', null).maybeSingle()
              .then(function (res) {
                if (res.error) throw res.error;
                if (res.data) {
                  throw fail('name-collision',
                    'An establishment named ' + res.data.name + ' is already on file.',
                    { establishmentId: res.data.id, name: res.data.name });
                }
              })
          : Promise.resolve();

        return guard
          .then(function () { return client.from('establishments').update(payload).eq('id', id).select().single(); })
          .then(function (res) {
            if (res.error) {
              throw translate(res.error, 'name-collision', 'That establishment name is already on file.');
            }
            var row = res.data;
            return { id: row.id, fileNumber: row.file_number, name: row.name, nameKey: row.name_key,
                     category: T.coerceCategory(row.category), createdBy: row.created_by,
                     createdAt: row.created_at, updatedAt: row.updated_at };
          });
      },

      /* Reassign audits first, then retire the emptied source record.
         Nothing is deleted, so the merge is reversible by hand. */
      mergeEstablishments: function (sourceId, targetId) {
        if (sourceId === targetId) {
          return Promise.reject(fail('invalid-merge', 'An establishment cannot merge into itself.'));
        }
        return client.from('audits').update({ establishment_id: targetId }).eq('establishment_id', sourceId)
          .then(function (res) {
            if (res.error) throw res.error;
            return client.from('establishments').update({ archived_at: nowIso() }).eq('id', sourceId);
          })
          .then(function (res) {
            if (res.error) throw res.error;
            return client.from('establishments').select('*').eq('id', targetId).single();
          })
          .then(function (res) {
            var row = unwrap(res);
            return { id: row.id, fileNumber: row.file_number, name: row.name, nameKey: row.name_key,
                     category: T.coerceCategory(row.category), createdBy: row.created_by,
                     createdAt: row.created_at, updatedAt: row.updated_at };
          });
      },

      createLocation: function (name) {
        var clean;
        try { clean = cleanLocationInput(name); }
        catch (err) { return Promise.reject(err); }
        return client.from('locations').select('*').eq('name_key', clean.nameKey).maybeSingle()
          .then(function (res) {
            if (res.error) throw res.error;
            if (res.data) {
              if (!res.data.archived) return res.data;
              return client.from('locations').update({ archived: false }).eq('id', res.data.id)
                .select().single().then(unwrap);
            }
            return currentUser().then(function (user) {
              return client.from('locations').insert({
                name: clean.name, name_key: clean.nameKey,
                location_group: T.CUSTOM_GROUP.key, is_preset: false, created_by: user.id
              }).select().single();
            }).then(function (res2) {
              if (res2.error) throw translate(res2.error, 'name-collision', 'That location is already on file.');
              return res2.data;
            });
          }).then(locationRow);
      },

      renameLocation: function (id, name) {
        var clean;
        try { clean = cleanLocationInput(name); }
        catch (err) { return Promise.reject(err); }
        return client.from('locations').select('id, name').eq('name_key', clean.nameKey).neq('id', id).maybeSingle()
          .then(function (res) {
            if (res.error) throw res.error;
            if (res.data) {
              throw fail('name-collision', 'A location named ' + res.data.name + ' is already on file.',
                { locationId: res.data.id, name: res.data.name });
            }
            return client.from('locations').update({ name: clean.name, name_key: clean.nameKey })
              .eq('id', id).select().single();
          })
          .then(function (res) {
            if (res.error) throw translate(res.error, 'name-collision', 'That location is already on file.');
            return locationRow(res.data);
          });
      },

      setLocationArchived: function (id, archived) {
        return client.from('locations').update({ archived: !!archived }).eq('id', id).select().single()
          .then(function (res) { return locationRow(unwrap(res)); });
      },

      createAudit: function (input) {
        var clean;
        try { clean = cleanAuditInput(input); }
        catch (err) { return Promise.reject(err); }
        return currentUser().then(function (user) {
          var payload = Object.assign({
            establishment_id: clean.establishmentId,
            auditor_id: user.id,
            burger: clean.burger,
            location_id: clean.locationId,
            schema_version: S.SCHEMA_VERSION
          }, scoresToColumns(clean.scores));
          return client.from('audits').insert(payload).select().single();
        }).then(function (res) { return unwrap(res); });
      },

      /* RLS restricts UPDATE to auditor_id = auth.uid(), so an auditor
         can neither overwrite nor reassign the peer's audit. */
      updateAudit: function (auditId, input) {
        var clean;
        try {
          if (!auditId) throw fail('not-found', 'Audit not found.');
          /* The parent establishment never moves on an amendment, so the
             identity check is satisfied by the audit's own row. */
          clean = cleanAuditInput(Object.assign({}, input, {
            establishmentId: input.establishmentId || auditId
          }));
        } catch (err) { return Promise.reject(err); }
        var payload = Object.assign({
          burger: clean.burger,
          location_id: clean.locationId,
          schema_version: S.SCHEMA_VERSION
        }, scoresToColumns(clean.scores));
        return client.from('audits').update(payload).eq('id', auditId).select().single()
          .then(function (res) { return unwrap(res); });
      },

      /* ---- Records Office ---- */
      listRecords: function () {
        return client.from('bureau_records').select('*').then(function (res) {
          if (res.error) guardSchema(res.error);
          return (res.data || []).map(function (r) {
            return {
              recordId: r.record_id, holder: r.holder, establishmentId: r.establishment_id,
              establishmentName: r.establishment_name, value: r.value == null ? null : Number(r.value),
              valueText: r.value_text, detail: r.detail || {}, fingerprint: r.fingerprint,
              version: r.version, establishedAt: r.established_at, previous: r.previous || null,
              updatedBy: r.updated_by
            };
          });
        });
      },

      listRecordHistory: function () {
        return client.from('bureau_record_history').select('*').order('ended_at', { ascending: false })
          .then(function (res) {
            return (unwrap(res) || []).map(function (r) {
              return {
                recordId: r.record_id, holder: r.holder, establishmentId: r.establishment_id,
                establishmentName: r.establishment_name, value: r.value == null ? null : Number(r.value),
                valueText: r.value_text, detail: r.detail || {}, version: r.version,
                establishedAt: r.established_at, endedAt: r.ended_at
              };
            });
          });
      },

      /* One RPC for the whole batch, so the archive-previous /
         bump-version / write-current sequence cannot half-apply when
         both devices file at once. */
      saveRecords: function (rows) {
        var payload = (rows || []).map(function (row) {
          return {
            recordId: row.recordId,
            holder: row.holder == null ? null : row.holder,
            establishmentId: row.establishmentId == null ? null : row.establishmentId,
            establishmentName: row.establishmentName == null ? null : row.establishmentName,
            value: row.value == null ? null : Number(row.value),
            valueText: row.valueText == null ? null : String(row.valueText),
            detail: row.detail || {},
            fingerprint: row.fingerprint,
            establishedAt: row.establishedAt || nowIso()
          };
        });
        if (!payload.length) return Promise.resolve([]);
        return client.rpc('bps_records_sync', { p_rows: payload }).then(function (res) {
          if (res.error) throw res.error;
          return res.data || [];
        });
      },

      listRecordAcks: function () {
        return currentUser().then(function (user) {
          return client.from('bureau_record_acks').select('record_id, fingerprint').eq('auditor_id', user.id);
        }).then(function (res) {
          var out = {};
          (unwrap(res) || []).forEach(function (r) { out[r.record_id] = r.fingerprint; });
          return out;
        });
      },

      ackRecords: function (map) {
        var ids = Object.keys(map || {});
        if (!ids.length) return Promise.resolve({});
        return currentUser().then(function (user) {
          var rows = ids.map(function (id) {
            return { auditor_id: user.id, record_id: id, fingerprint: map[id], acknowledged_at: nowIso() };
          });
          return client.from('bureau_record_acks').upsert(rows, { onConflict: 'auditor_id,record_id' });
        }).then(function (res) {
          if (res && res.error) throw res.error;
          return Object.assign({}, map);
        });
      }
    };
  }

  /* ===========================================================
     Selection
     =========================================================== */
  function chooseAdapter(config, force) {
    var cfg = config || {};
    var mode = force || cfg.ADAPTER || 'auto';
    var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

    if (mode === 'mock') return createMockAdapter();
    if (mode === 'supabase') return createSupabaseAdapter(cfg);
    /* A configured production build must fail closed. Falling back to seeded
       mock data when the Supabase library fails to load would present a fake
       register and mock authentication on the live site. */
    if (configured) return createSupabaseAdapter(cfg);
    return createMockAdapter();
  }

  return {
    createMockAdapter: createMockAdapter,
    createSupabaseAdapter: createSupabaseAdapter,
    chooseAdapter: chooseAdapter,
    scoresToColumns: scoresToColumns,
    rowToScores: rowToScores,
    cleanEstablishmentInput: cleanEstablishmentInput,
    cleanLocationInput: cleanLocationInput,
    cleanAuditInput: cleanAuditInput,
    requireCompleteScores: requireCompleteScores,
    fail: fail
  };
});
