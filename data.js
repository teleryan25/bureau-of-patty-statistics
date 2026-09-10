/* =============================================================
   Bureau of Patty Statistics — data.js

   The ONLY module that knows where data lives. Two adapters share
   one interface, so the rest of the app never branches on backend:

     supabaseAdapter — production: Supabase Auth + Postgres + RLS
     mockAdapter     — local dev and the automated test suite

   Canonical burger shape handed to the app (identical from both):
     { id, specimenNumber, restaurant, burger, createdBy, createdAt,
       audits: { ryan: <audit|null>, devin: <audit|null> } }
   An audit is the six category keys plus createdAt / updatedAt / auditorId.
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.data = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var S = (typeof module !== 'undefined' && module.exports)
    ? require('./scoring.js')
    : root.BPS.scoring;

  /* Category key <-> Postgres column. Defined once, in scoring.js. */
  function scoresToColumns(scores) {
    var out = {};
    S.CATEGORIES.forEach(function (c) { out[c.column] = Number(scores[c.key]); });
    return out;
  }

  function rowToScores(row) {
    var out = {};
    S.CATEGORIES.forEach(function (c) { out[c.key] = row[c.column] == null ? null : Number(row[c.column]); });
    return out;
  }

  function cleanBurgerInput(input) {
    var restaurant = String(input && input.restaurant || '').trim();
    var burger = String(input && input.burger || '').trim();
    if (!restaurant || !burger) throw new Error('Establishment and specimen names are required.');
    return { restaurant: restaurant, burger: burger };
  }

  function requireCompleteScores(scores) {
    if (!S.isCompleteScoreSet(scores)) {
      throw new Error('All six scores must be tenths between 0.0 and 10.0.');
    }
  }

  /* ===========================================================
     MOCK ADAPTER
     In-memory. Simulates both auditors, independent audits and a
     email/password sign-in without touching the network.
     =========================================================== */
  function createMockAdapter(options) {
    options = options || {};
    var MOCK_PASSWORD = 'bps-demo';

    var profiles = {
      ryan:  { id: 'uuid-ryan',  auditorKey: 'ryan',  displayName: 'Ryan',  email: 'ryanburtonwi@gmail.com' },
      devin: { id: 'uuid-devin', auditorKey: 'devin', displayName: 'Devin', email: 'devinreiter907@gmail.com' }
    };

    var state = {
      session: null,
      burgers: [],
      audits: [],
      seq: 0
    };

    function newSpecimen() {
      state.seq += 1;
      return 'BPS-' + String(state.seq).padStart(4, '0');
    }

    function profileByEmail(email) {
      var e = String(email || '').trim().toLowerCase();
      if (e === profiles.devin.email) return profiles.devin;
      if (e === profiles.ryan.email) return profiles.ryan;
      return null;
    }

    function profileById(id) {
      return profiles.ryan.id === id ? profiles.ryan
           : profiles.devin.id === id ? profiles.devin
           : null;
    }

    function assemble() {
      return state.burgers.map(function (b) {
        var audits = { ryan: null, devin: null };
        state.audits.forEach(function (a) {
          if (a.burgerId !== b.id) return;
          var p = profileById(a.auditorId);
          if (p) audits[p.auditorKey] = a;
        });
        return {
          id: b.id,
          specimenNumber: b.specimenNumber,
          restaurant: b.restaurant,
          burger: b.burger,
          createdBy: b.createdBy,
          createdAt: b.createdAt,
          audits: audits
        };
      });
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
          if (!p || String(password) !== MOCK_PASSWORD) {
            return Promise.reject(new Error('Invalid email or password.'));
          }
          state.session = { userId: p.id, email: p.email, profile: p };
          return Promise.resolve(state.session);
        },
        signOut: function () {
          state.session = null;
          return Promise.resolve();
        },
        /** Test hook: bypass the login form entirely. */
        signInAs: function (auditorKey) {
          var p = profiles[auditorKey];
          if (!p) return Promise.reject(new Error('Unknown mock auditor.'));
          state.session = { userId: p.id, email: p.email, profile: p };
          return Promise.resolve(state.session);
        }
      },

      /* ---- data ---- */
      listBurgers: function () {
        return Promise.resolve(assemble());
      },

      createBurger: function (input) {
        if (!state.session) return Promise.reject(new Error('Not authenticated.'));
        var clean;
        try { clean = cleanBurgerInput(input); }
        catch (err) { return Promise.reject(err); }
        var b = {
          id: 'b-' + (state.burgers.length + 1) + '-' + Math.random().toString(36).slice(2, 7),
          specimenNumber: newSpecimen(),
          restaurant: clean.restaurant,
          burger: clean.burger,
          createdBy: state.session.userId,
          createdAt: input.createdAt || new Date().toISOString()
        };
        state.burgers.push(b);
        return Promise.resolve(b);
      },

      /** Insert or update the CURRENT user's audit. Never the peer's. */
      saveAudit: function (burgerId, scores, when) {
        if (!state.session) return Promise.reject(new Error('Not authenticated.'));
        if (!state.burgers.some(function (b) { return b.id === burgerId; })) {
          return Promise.reject(new Error('Specimen not found.'));
        }
        try { requireCompleteScores(scores); }
        catch (err) { return Promise.reject(err); }
        var auditorId = state.session.userId;
        var existing = state.audits.filter(function (a) {
          return a.burgerId === burgerId && a.auditorId === auditorId;
        })[0];
        var now = when || new Date().toISOString();

        if (existing) {
          S.CATEGORY_KEYS.forEach(function (k) { existing[k] = Number(scores[k]); });
          existing.updatedAt = now;
          return Promise.resolve(existing);
        }
        var audit = { id: 'a-' + state.audits.length, burgerId: burgerId, auditorId: auditorId,
                      createdAt: now, updatedAt: now };
        S.CATEGORY_KEYS.forEach(function (k) { audit[k] = Number(scores[k]); });
        state.audits.push(audit);
        return Promise.resolve(audit);
      },

      /* ---- test helpers (mock only) ---- */
      _reset: function () {
        state.burgers = []; state.audits = []; state.seq = 0; state.session = null;
      },
      /** Seed a burger with whichever audits are supplied. */
      _seed: function (restaurant, burger, ryanScores, devinScores, meta) {
        meta = meta || {};
        var b = {
          id: meta.id || ('b-seed-' + (state.burgers.length + 1)),
          specimenNumber: newSpecimen(),
          restaurant: restaurant,
          burger: burger,
          createdBy: meta.createdBy || profiles.ryan.id,
          createdAt: meta.createdAt || new Date().toISOString()
        };
        state.burgers.push(b);
        [['ryan', ryanScores], ['devin', devinScores]].forEach(function (pair) {
          if (!pair[1]) return;
          var audit = { id: 'a-' + state.audits.length, burgerId: b.id,
                        auditorId: profiles[pair[0]].id,
                        createdAt: meta[pair[0] + 'At'] || b.createdAt,
                        updatedAt: meta[pair[0] + 'At'] || b.createdAt };
          S.CATEGORY_KEYS.forEach(function (k) { audit[k] = Number(pair[1][k]); });
          state.audits.push(audit);
        });
        return b;
      },
      _profiles: profiles
    };

    if (options.seed !== false) seedDemoData(adapter);
    return adapter;
  }

  /* A small demo register so mock mode has something to analyse. */
  function seedDemoData(adapter) {
    function sc(p, o, b, f, v, c) {
      return { patty: p, overallFlavor: o, bun: b, fries: f, value: v, condiments: c };
    }
    var day = 86400000;
    var t0 = Date.parse('2026-06-02T18:30:00Z');
    function at(d, h) { return new Date(t0 + d * day + (h || 0) * 3600000).toISOString(); }

    adapter._seed('Matt’s Bar', 'Jucy Lucy',
      sc(9.4, 9.6, 8.2, 7.1, 8.8, 8.4), sc(9.1, 9.2, 8.6, 7.8, 8.4, 8.0),
      { createdAt: at(0), ryanAt: at(0), devinAt: at(1, 3) });
    adapter._seed('The 5-8 Club', 'Original Juicy Lucy',
      sc(8.8, 8.9, 8.0, 8.6, 8.2, 7.9), sc(8.4, 8.5, 8.4, 8.1, 8.6, 8.2),
      { createdAt: at(6), ryanAt: at(6), devinAt: at(6, 2) });
    adapter._seed('Municipal Diner, District 4', 'The Standard Double',
      sc(9.6, 9.4, 9.0, 8.8, 9.2, 9.3), sc(9.4, 9.5, 8.8, 9.0, 9.0, 9.1),
      { createdAt: at(11), ryanAt: at(11), devinAt: at(12) });
    adapter._seed('Hensley’s Counter', 'Smash Protocol No. 7',
      sc(9.2, 9.0, 8.6, 8.4, 8.8, 8.7), sc(8.8, 9.1, 8.4, 8.6, 9.0, 8.5),
      { createdAt: at(17), ryanAt: at(17), devinAt: at(19) });
    adapter._seed('Route 9 Drive-In', 'The Provisional Cheeseburger',
      sc(8.2, 8.4, 7.6, 9.1, 8.9, 7.8), sc(7.6, 7.9, 7.9, 8.8, 9.2, 8.1),
      { createdAt: at(23), ryanAt: at(23), devinAt: at(24, 6) });
    adapter._seed('Cafeteria, Sub-Basement 2', 'Mushroom Swiss, Variant B',
      sc(7.4, 7.2, 8.0, 6.8, 8.4, 7.6), sc(6.9, 7.0, 7.8, 7.2, 8.8, 7.4),
      { createdAt: at(29), ryanAt: at(29), devinAt: at(33) });
    adapter._seed('Matt’s Bar', 'Jucy Lucy (Second Filing)',
      sc(9.2, 9.4, 8.0, 7.4, 8.6, 8.2), sc(8.9, 9.0, 8.4, 7.6, 8.2, 8.6),
      { createdAt: at(35), ryanAt: at(35), devinAt: at(35, 1) });
    adapter._seed('Nook, St. Paul', 'Juicy Nookie',
      sc(9.8, 9.7, 8.8, 9.4, 8.6, 8.9), sc(9.2, 9.4, 9.0, 9.6, 8.2, 9.2),
      { createdAt: at(41), ryanAt: at(41), devinAt: at(42) });
    adapter._seed('Wellness Annex', 'Turkey Substitute Filing',
      sc(4.6, 4.8, 6.4, 5.2, 6.8, 5.4), sc(3.9, 4.2, 6.0, 4.8, 7.2, 5.0),
      { createdAt: at(47), ryanAt: at(47), devinAt: at(52) });
    adapter._seed('Route 9 Drive-In', 'The Midnight Filing',
      sc(8.6, 8.8, 7.4, 9.2, 8.4, 8.0), sc(8.2, 8.4, 7.8, 9.0, 8.8, 8.4),
      { createdAt: at(53), ryanAt: at(53), devinAt: at(54) });
    /* Awaiting Devin's peer review. */
    adapter._seed('Blue Door Pub', 'Blucy',
      sc(9.0, 9.2, 8.4, 8.8, 8.0, 8.6), null,
      { createdAt: at(58), ryanAt: at(58) });
    /* Awaiting Ryan's peer review. */
    adapter._seed('Parlour', 'Parlour Burger',
      null, sc(9.5, 9.6, 9.0, 8.4, 8.2, 8.8),
      { createdAt: at(60), devinAt: at(60), createdBy: 'uuid-devin' });
  }

  /* ===========================================================
     SUPABASE ADAPTER
     =========================================================== */
  function createSupabaseAdapter(config) {
    var lib = root.supabase;
    if (!lib || typeof lib.createClient !== 'function') {
      throw new Error('supabase-js failed to load.');
    }
    var client = lib.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    var profileCache = null;

    function loadProfile(userId) {
      return client.from('profiles').select('id, auditor_key, display_name')
        .eq('id', userId).single()
        .then(function (res) {
          if (res.error) throw res.error;
          return { id: res.data.id, auditorKey: res.data.auditor_key, displayName: res.data.display_name };
        });
    }

    function sessionFrom(sbSession) {
      if (!sbSession || !sbSession.user) return null;
      return loadProfile(sbSession.user.id).then(function (profile) {
        profileCache = profile;
        return { userId: sbSession.user.id, email: sbSession.user.email, profile: profile };
      });
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
          profileCache = null;
          return client.auth.signOut().then(function (res) {
            if (res && res.error) throw res.error;
          });
        }
      },

      listBurgers: function () {
        return Promise.all([
          client.from('burgers').select('*').order('created_at', { ascending: true }),
          client.from('audits').select('*'),
          client.from('profiles').select('id, auditor_key, display_name')
        ]).then(function (results) {
          results.forEach(function (r) { if (r.error) throw r.error; });
          var burgers = results[0].data || [];
          var audits = results[1].data || [];
          var profiles = results[2].data || [];

          var keyById = {};
          profiles.forEach(function (p) { keyById[p.id] = p.auditor_key; });

          var byBurger = {};
          audits.forEach(function (a) {
            var key = keyById[a.auditor_id];
            if (!key) return;
            (byBurger[a.burger_id] = byBurger[a.burger_id] || {})[key] =
              Object.assign(rowToScores(a), {
                id: a.id, auditorId: a.auditor_id,
                createdAt: a.created_at, updatedAt: a.updated_at
              });
          });

          return burgers.map(function (b) {
            var pair = byBurger[b.id] || {};
            return {
              id: b.id,
              specimenNumber: b.specimen_number,
              restaurant: b.restaurant,
              burger: b.burger,
              createdBy: b.created_by,
              createdAt: b.created_at,
              audits: { ryan: pair.ryan || null, devin: pair.devin || null }
            };
          });
        });
      },

      createBurger: function (input) {
        var clean;
        try { clean = cleanBurgerInput(input); }
        catch (err) { return Promise.reject(err); }
        return client.auth.getUser().then(function (res) {
          var user = res.data && res.data.user;
          if (!user) throw new Error('Not authenticated.');
          return client.from('burgers').insert({
            restaurant: clean.restaurant,
            burger: clean.burger,
            created_by: user.id
          }).select().single();
        }).then(function (res) {
          if (res.error) throw res.error;
          return {
            id: res.data.id,
            specimenNumber: res.data.specimen_number,
            restaurant: res.data.restaurant,
            burger: res.data.burger,
            createdBy: res.data.created_by,
            createdAt: res.data.created_at
          };
        });
      },

      /* onConflict on the unique pair makes this an idempotent
         "file or amend MY audit" — RLS forbids touching the peer's. */
      saveAudit: function (burgerId, scores) {
        try { requireCompleteScores(scores); }
        catch (err) { return Promise.reject(err); }
        return client.auth.getUser().then(function (res) {
          var user = res.data && res.data.user;
          if (!user) throw new Error('Not authenticated.');
          var payload = Object.assign(
            { burger_id: burgerId, auditor_id: user.id },
            scoresToColumns(scores)
          );
          return client.from('audits')
            .upsert(payload, { onConflict: 'burger_id,auditor_id' })
            .select().single();
        }).then(function (res) {
          if (res.error) throw res.error;
          return res.data;
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
    cleanBurgerInput: cleanBurgerInput,
    requireCompleteScores: requireCompleteScores
  };
});
