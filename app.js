/* =============================================================
   Bureau of Patty Statistics — app.js

   State, rendering, events. Contains no statistics and no weights:
     taxonomy.js        categories, preset locations, name matching
     scoring.js         arithmetic, schema compliance
     analytics.js       metrics
     insights.js        rule engine + rotation
     insight-rules.js   the rule library
     records.js         Records Office detection
     records-office.js  Records Office ceremony + sound
     data.js            Supabase / mock adapters

   THE RANKED ENTITY IS THE ESTABLISHMENT. Every audit belongs to one,
   and an establishment certifies once both auditors hold a current
   audit for it — regardless of branch, burger or date.
   ============================================================= */
(function () {
  'use strict';

  var T = window.BPS.taxonomy;
  var S = window.BPS.scoring;
  var AN = window.BPS.analytics;
  var IN = window.BPS.insights;
  var DS = window.BPS.disasters;
  var DT = window.BPS.disasterTheater;
  var RC = window.BPS.records;
  var RO = window.BPS.recordsOffice;
  var DATA = window.BPS.data;

  var CATEGORIES = S.CATEGORIES;
  var DIRECT = S.DIRECT_CATEGORIES;
  var SERVICE = S.SERVICE_SUBSCORES;
  var INPUT_KEYS = S.INPUT_KEYS;
  var SCALE = S.SCALE;

  /* At most this many proclamations are performed in one sitting; the
     rest are entered into the Records Office without ceremony. */
  var MAX_CEREMONIES = 5;

  /* Entries revealed per page in the Records Office. */
  var RECORDS_PAGE = 25;

  var DEF_ORDER = {};
  RC.DEFINITIONS.forEach(function (d, i) { DEF_ORDER[d.id] = i; });

  /* ---------- state ---------- */
  var state = {
    adapter: null,
    session: null,
    me: null,              /* 'ryan' | 'devin' */
    register: { establishments: [], locations: [] },
    metrics: null,         /* filtered — drives Rankings */
    globalMetrics: null,   /* unfiltered — drives everything else */
    filter: { locationId: null, category: null },
    records: [],
    recordAcks: {},
    disasterEvents: [],
    view: 'auth',
    recordId: null,
    evalMode: { type: 'new', establishmentId: null, auditId: null },
    draft: {},
    draftLocationId: null,
    submitAttempted: false,
    authEpoch: 0,
    justAddedTimer: null,
    justAddedId: null,
    recordsSort: 'recent',
    recordsShown: 25
  };
  var disasterDirector = null;
  var ceremony = null;

  var el = {};
  function $(id) { return document.getElementById(id); }
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(className, d) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, 3600);
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'date unrecorded';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function hasAuditorIdentity() {
    return S.AUDITOR_KEYS.indexOf(state.me) !== -1;
  }

  function hasAuthenticatedState() {
    return !!(state.session && hasAuditorIdentity() && state.metrics && state.globalMetrics);
  }

  function sessionToken() {
    return state.session
      ? { epoch: state.authEpoch, userId: state.session.userId }
      : null;
  }

  function isCurrentSession(token) {
    return !!(token && state.session && token.epoch === state.authEpoch &&
      token.userId === state.session.userId);
  }

  function clearSessionState() {
    state.authEpoch += 1;
    state.session = null;
    state.me = null;
    state.register = { establishments: [], locations: [] };
    state.metrics = null;
    state.globalMetrics = null;
    state.records = [];
    state.recordAcks = {};
    state.disasterEvents = [];
    state.recordId = null;
    state.justAddedId = null;
    state.filter = { locationId: null, category: null };
    if (ceremony) ceremony.clear();
    if (state.justAddedTimer) {
      clearTimeout(state.justAddedTimer);
      state.justAddedTimer = null;
    }
  }

  function cacheDom() {
    el = {
      masthead: $('masthead'),
      authchipName: $('authchip-name'),
      pendingBadge: $('pending-badge'),
      toast: $('toast'),
      footerSession: $('footer-session'),
      footerSessionName: $('footer-session-name'),
      signout: $('signout-btn'),
      views: {
        auth: $('view-auth'), rankings: $('view-rankings'), pending: $('view-pending'),
        evaluate: $('view-evaluate'), record: $('view-record'), records: $('view-records'),
        insights: $('view-insights')
      },
      tabs: qsa('[data-view]'),
      /* auth */
      authForm: $('auth-login-form'), authEmail: $('auth-email'), authPassword: $('auth-password'),
      authErr: $('auth-error'), authBtn: $('auth-login-btn'), authModeNote: $('auth-mode-note'),
      /* rankings */
      rankingsList: $('rankings-list'), rankingsEmpty: $('rankings-empty'),
      rankingsEmptyTitle: $('rankings-empty-title'), rankingsEmptyText: $('rankings-empty-text'),
      statSpecimens: qs('[data-stat="specimens"]'), statMean: qs('[data-stat="mean"]'),
      statAudits: qs('[data-stat="audits"]'), statPending: qs('[data-stat="pending"]'),
      filterLocation: $('filter-location'), filterCategory: $('filter-category'),
      filterClear: $('filter-clear'), filterNote: $('filter-note'),
      /* pending */
      pendingRecertWrap: $('pending-recert-wrap'), pendingRecert: $('pending-recert'),
      pendingRecertMeta: $('pending-recert-meta'),
      pendingMineWrap: $('pending-mine-wrap'), pendingMine: $('pending-mine'), pendingMineMeta: $('pending-mine-meta'),
      pendingTheirsWrap: $('pending-theirs-wrap'), pendingTheirs: $('pending-theirs'),
      pendingTheirsTitle: $('pending-theirs-title'), pendingTheirsMeta: $('pending-theirs-meta'),
      pendingEmpty: $('pending-empty'),
      /* evaluate */
      evalTitle: $('eval-title'), evalSub: $('eval-sub'), evalFormLabel: $('eval-form-label'),
      evalPendingWrap: $('eval-pending-wrap'), evalPendingList: $('eval-pending-list'),
      identityNew: $('eval-identity-new'), identityReview: $('eval-identity-review'),
      form: $('evaluate-form'),
      inputEstablishment: $('f-establishment'), establishmentOptions: $('establishment-options'),
      selectCategory: $('f-category'), hintEstablishment: $('hint-establishment'),
      inputBurger: $('f-burger'), burgerOptions: $('burger-options'),
      selectLocation: $('f-location'), addLocation: $('add-location'),
      inputNewLocation: $('f-newlocation'), addLocationSave: $('add-location-save'),
      errEstablishment: $('err-establishment'), errBurger: $('err-burger'), errLocation: $('err-location'),
      reviewSpecimen: $('review-specimen'), reviewBurger: $('review-burger'),
      reviewRestaurant: $('review-restaurant'), reviewNote: $('review-note'), reviewCancel: $('review-cancel'),
      evalAuditorName: $('eval-auditor-name'), evalWeighted: $('eval-weighted'),
      evalProgress: $('eval-progress'), evalScores: $('eval-scores'), evalService: $('eval-service'),
      serviceDerived: $('service-derived'), serviceWeight: $('service-weight'),
      tallyLabel: $('tally-label'), tallyValue: $('tally-value'), tallyHint: $('tally-hint'),
      submitBtn: $('submit-btn'),
      /* establishment file */
      recordFile: $('record-file'), recordBurger: $('record-burger'), recordRestaurant: $('record-restaurant'),
      recordMeta: $('record-meta'), recordFigures: $('record-figures'), recordCta: $('record-cta'),
      recordExaminers: $('record-examiners'), recordFindingsWrap: $('record-findings-wrap'),
      recordFindings: $('record-findings'), recordHistory: $('record-history'),
      recordHistoryMeta: $('record-history-meta'),
      editName: $('edit-name'), editCategory: $('edit-category'), editSave: $('edit-save'),
      editError: $('edit-error'), mergeWarning: $('merge-warning'), mergeText: $('merge-text'),
      mergeConfirm: $('merge-confirm'),
      /* records office */
      recordsSummary: $('records-summary'), recordsList: $('records-list'),
      recordsEmpty: $('records-empty'), recordsMeta: $('records-meta'),
      recordsSort: $('records-sort'), recordsSound: $('records-sound'),
      recordsMore: $('records-more'),
      ceremonyHost: $('records-ceremony'),
      /* findings */
      insightsSummary: $('insights-summary'), personnel: $('personnel-files'),
      findingsList: $('findings-list'), findingsMeta: $('findings-meta'), reroll: $('reroll-btn'),
      disputesWrap: $('disputes-wrap'), disputes: $('disputes'),
      differentialsWrap: $('differentials-wrap'), differentials: $('differentials'),
      locationsWrap: $('locations-wrap'), locationsList: $('locations-list'),
      locationsNote: $('locations-note'),
      disasterStage: $('bureau-event-stage')
    };
  }

  /* =============================================================
     AUTH
     ============================================================= */
  function showAuthMode() {
    var mode = state.adapter.mode;
    el.authModeNote.textContent = mode === 'mock'
      ? 'Local mode — use either configured auditor email with the password bps-demo.'
      : 'Sessions persist on this device.';
  }

  function bindAuth() {
    el.authForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = el.authEmail.value.trim();
      var password = el.authPassword.value;
      el.authErr.hidden = true;
      if (!email || email.indexOf('@') === -1) {
        el.authErr.textContent = 'A valid email address is required.';
        el.authErr.hidden = false;
        return;
      }
      if (!password) {
        el.authErr.textContent = 'A password is required.';
        el.authErr.hidden = false;
        return;
      }
      el.authBtn.disabled = true;
      el.authBtn.textContent = 'Signing in…';
      state.adapter.auth.signIn(email, password).then(function (session) {
        el.authPassword.value = '';
        return onSignedIn(session);
      }).catch(function (err) {
        el.authErr.textContent = err.message || 'The credentials were not accepted.';
        el.authErr.hidden = false;
      }).finally(function () {
        el.authBtn.disabled = false;
        el.authBtn.textContent = 'Sign In';
      });
    });

    el.signout.addEventListener('click', function () {
      el.signout.disabled = true;
      state.adapter.auth.signOut().then(function () {
        clearSessionState();
        el.masthead.hidden = true;
        el.footerSession.hidden = true;
        el.authPassword.value = '';
        el.authErr.hidden = true;
        setView('auth');
      }).catch(function (err) {
        console.error('[BPS] Sign-out failed:', err);
        toast('Unable to sign out. Please try again.');
      }).finally(function () {
        el.signout.disabled = false;
      });
    });
  }

  function onSignedIn(session) {
    if (!session || !session.profile || S.AUDITOR_KEYS.indexOf(session.profile.auditorKey) === -1) {
      return Promise.reject(new Error('This account is not mapped to a Bureau auditor profile.'));
    }
    state.authEpoch += 1;
    state.session = session;
    state.me = session.profile.auditorKey;
    el.masthead.hidden = false;
    el.authchipName.textContent = session.profile.displayName;
    el.footerSession.hidden = false;
    el.footerSessionName.textContent = 'Signed in as ' + session.profile.displayName;
    el.evalAuditorName.textContent = session.profile.displayName;
    return refresh().then(function (loaded) {
      if (!loaded) return;
      var hash = window.location.hash.slice(1);
      routeFromHash(hash && hash !== 'auth' ? hash : 'rankings');
    });
  }

  /* =============================================================
     DATA REFRESH
     ============================================================= */
  function recompute() {
    state.globalMetrics = AN.compute(state.register);
    var f = state.filter;
    state.metrics = (f.locationId || f.category)
      ? AN.compute(state.register, {
          locationId: f.locationId,
          locationName: locationName(f.locationId),
          category: f.category
        })
      : state.globalMetrics;
    state.disasterEvents = DS.evaluate(state.globalMetrics);
  }

  function refresh(options) {
    options = options || {};
    var token = sessionToken();
    if (!token || !hasAuditorIdentity()) return Promise.resolve(false);
    return state.adapter.listRegister().then(function (register) {
      if (!isCurrentSession(token)) return false;
      state.register = register;
      recompute();
      renderAll();
      return syncRecords(token, options).then(function () { return true; });
    }).catch(function (err) {
      if (!isCurrentSession(token)) return false;
      console.error('[BPS] Unable to load the register:', err);
      toast(err && err.code === 'schema-outdated'
        ? 'The Bureau register is being upgraded. Please try again shortly.'
        : 'Unable to load the register.');
      return false;
    });
  }

  function renderAll() {
    if (!hasAuthenticatedState()) return false;
    refreshFormOptions();
    renderFilters();
    renderStats();
    renderRankings();
    renderPending();
    renderEvalPending();
    renderRecordsOffice();
    updateBadge();
    return true;
  }

  function updateBadge() {
    var m = state.globalMetrics;
    var mine = m && m.pendingFor && m.pendingFor[state.me];
    var n = Array.isArray(mine) ? mine.length : 0;
    el.pendingBadge.textContent = String(n);
    el.pendingBadge.hidden = n === 0;
  }

  /* =============================================================
     RECORDS OFFICE — detection, persistence, ceremony
     ============================================================= */
  function loadRecordState() {
    return Promise.all([
      state.adapter.listRecords(),
      state.adapter.listRecordAcks()
    ]).then(function (r) { return { rows: r[0] || [], acks: r[1] || {} }; });
  }

  function syncRecords(token, options) {
    if (!state.adapter.listRecords) return Promise.resolve();
    return loadRecordState().then(function (loaded) {
      if (!isCurrentSession(token)) return null;
      var result = RC.detect(state.globalMetrics, loaded.rows);
      if (!result.changes.length) return loaded;
      return state.adapter.saveRecords(result.changes)
        .then(function () { return loadRecordState(); })
        .catch(function (err) {
          console.error('[BPS] Unable to enter records:', err);
          return loaded;
        });
    }).then(function (loaded) {
      if (!loaded || !isCurrentSession(token)) return;
      state.records = loaded.rows;
      state.recordAcks = loaded.acks;
      renderRecordsOffice();

      var unseen = loaded.rows.filter(function (r) {
        return state.recordAcks[r.recordId] !== r.fingerprint;
      }).sort(function (a, b) {
        return (DEF_ORDER[a.recordId] || 0) - (DEF_ORDER[b.recordId] || 0);
      });
      if (!unseen.length) return;

      /* First sight of the Records Office for this auditor: take the
         existing history as read rather than performing all of it. */
      var baseline = Object.keys(loaded.acks).length === 0;
      if (baseline || options.silent) return acknowledgeRecords(unseen);

      var perform = unseen.slice(0, MAX_CEREMONIES);
      var quiet = unseen.slice(MAX_CEREMONIES);
      if (quiet.length) {
        acknowledgeRecords(quiet);
        toast(quiet.length + ' further ' + (quiet.length === 1 ? 'entry was' : 'entries were') +
          ' filed to the Records Office.');
      }
      ceremony.present(perform);
    }).catch(function (err) {
      console.error('[BPS] Records Office unavailable:', err);
    });
  }

  function acknowledgeRecords(rows) {
    var map = {};
    (rows || []).forEach(function (r) { map[r.recordId] = r.fingerprint; });
    if (!Object.keys(map).length) return Promise.resolve();
    Object.keys(map).forEach(function (k) { state.recordAcks[k] = map[k]; });
    return state.adapter.ackRecords(map).catch(function (err) {
      console.error('[BPS] Unable to acknowledge records:', err);
    });
  }

  function renderRecordsOffice() {
    if (!el.recordsList) return;
    var rows = state.records.slice();

    el.recordsSummary.replaceChildren();
    var superseded = rows.filter(function (r) { return (r.version || 1) > 1; }).length;
    var newest = rows.slice().sort(function (a, b) {
      return Date.parse(b.establishedAt) - Date.parse(a.establishedAt);
    })[0];
    el.recordsSummary.appendChild(summaryTile('Entries on Record', String(rows.length)));
    el.recordsSummary.appendChild(summaryTile('Superseded', String(superseded)));

    var soundOn = RO.soundEnabled();
    el.recordsSound.textContent = soundOn ? 'Sound on' : 'Sound off';
    el.recordsSound.setAttribute('aria-pressed', String(soundOn));
    el.recordsSound.setAttribute('aria-label',
      'Ceremonial sound is ' + (soundOn ? 'on' : 'off') + '. Activate to turn it ' + (soundOn ? 'off' : 'on') + '.');

    if (!rows.length) {
      el.recordsList.replaceChildren();
      el.recordsEmpty.hidden = false;
      el.recordsMore.hidden = true;
      el.recordsMeta.textContent = 'Entries appear here once they have actually been set.';
      return;
    }
    el.recordsEmpty.hidden = true;
    /* The latest date belongs in the sentence, not in a tile too narrow
       to hold it on a phone. */
    el.recordsMeta.textContent = rows.length + ' ' + (rows.length === 1 ? 'entry stands' : 'entries stand') +
      ' in the permanent history of the Bureau' +
      (newest ? ', the most recent entered ' + formatDate(newest.establishedAt) : '') + '.';

    if (state.recordsSort === 'oldest') {
      rows.sort(function (a, b) { return Date.parse(a.establishedAt) - Date.parse(b.establishedAt); });
    } else if (state.recordsSort === 'contested') {
      rows.sort(function (a, b) {
        return (b.version || 1) - (a.version || 1) ||
               Date.parse(b.establishedAt) - Date.parse(a.establishedAt);
      });
    } else {
      rows.sort(function (a, b) { return Date.parse(b.establishedAt) - Date.parse(a.establishedAt); });
    }

    var shown = Math.min(state.recordsShown, rows.length);
    var frag = document.createDocumentFragment();
    rows.slice(0, shown).forEach(function (row) { frag.appendChild(buildRecordCard(row)); });
    el.recordsList.replaceChildren(frag);

    var remaining = rows.length - shown;
    el.recordsMore.hidden = remaining <= 0;
    if (remaining > 0) {
      el.recordsMore.textContent = 'Show ' + Math.min(remaining, RECORDS_PAGE) +
        ' more of ' + remaining + ' remaining';
    }
  }

  function buildRecordCard(row) {
    var def = RC.definition(row.recordId);
    var card = node('article', 'recentry');
    var broke = (row.version || 1) > 1 && row.previous;

    card.appendChild(node('p', 'recentry__title', def ? def.title : 'Bureau Record'));
    var main = node('div', 'recentry__main');
    main.appendChild(node('p', 'recentry__subject', RC.subjectOf(row)));
    main.appendChild(node('span', 'recentry__value', RC.formatValue(row)));
    card.appendChild(main);

    var meta = node('ul', 'recentry__meta');
    function metaItem(label, value) {
      if (value == null || value === '') return;
      var li = node('li', 'recentry__metaitem');
      li.appendChild(node('span', 'recentry__metakey', label));
      li.appendChild(node('span', 'recentry__metaval', String(value)));
      meta.appendChild(li);
    }
    if (row.holder) metaItem('Auditor', S.auditorName(row.holder));
    if (row.establishmentName && RC.subjectOf(row) !== row.establishmentName) {
      metaItem('Establishment', row.establishmentName);
    }
    if (row.detail && row.detail.location) metaItem('Location', row.detail.location);
    if (row.detail && row.detail.burger) metaItem('Burger', row.detail.burger);
    metaItem('Established', RO.formatDate(row.establishedAt));
    if (broke) {
      var prev = row.previous;
      var prevValue = prev.value == null ? (prev.valueText || '—')
        : RC.formatValue({ recordId: row.recordId, value: prev.value, valueText: prev.valueText });
      metaItem('Previous', prevValue + (prev.establishmentName ? ' · ' + prev.establishmentName
        : (prev.holder ? ' · ' + S.auditorName(prev.holder) : '')));
      var stood = RO.daysBetween(prev.establishedAt, row.establishedAt);
      if (stood != null) metaItem('Stood for', stood === 1 ? '1 day' : stood + ' days');
      metaItem('Times superseded', String((row.version || 1) - 1));
    }
    card.appendChild(meta);

    if (broke) card.appendChild(node('span', 'recentry__flag', 'Record Broken'));
    if (row.establishmentId) {
      var open = node('button', 'linkbtn recentry__open', 'Open establishment file');
      open.type = 'button';
      open.addEventListener('click', function () { openRecord(row.establishmentId); });
      card.appendChild(open);
    }
    return card;
  }

  /* =============================================================
     SCORE CONTROLS
     Slider for coarse travel + steppers for exact tenths.
     ============================================================= */
  function buildScoreControl(field, initial, weightLabel) {
    var wrap = node('div', 'score');
    wrap.dataset.category = field.key;

    var head = node('div', 'score__head');
    var lw = node('span', 'score__labelwrap');
    lw.appendChild(node('span', 'score__label', field.label));
    if (weightLabel) lw.appendChild(node('span', 'score__weight', weightLabel));
    head.appendChild(lw);
    var out = node('output', 'score__value', '—');
    head.appendChild(out);
    wrap.appendChild(head);

    var controls = node('div', 'score__controls');
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'score__slider';
    slider.min = String(SCALE.min); slider.max = String(SCALE.max); slider.step = String(SCALE.step);
    slider.value = initial == null ? '5' : String(initial);
    slider.setAttribute('aria-label', field.label);

    function paint(value, scored) {
      wrap.style.setProperty('--pct', ((value - SCALE.min) / (SCALE.max - SCALE.min)) * 100 + '%');
      wrap.classList.toggle('is-unset', !scored);
      out.textContent = scored ? S.formatScore(value) : '—';
      slider.setAttribute('aria-valuetext', scored ? S.formatScore(value) : 'Not yet scored');
    }

    function commit(v) {
      var val = S.clampToScale(v);
      slider.value = String(val);
      state.draft[field.key] = val;
      paint(val, true);
      renderEvalLive();
    }

    slider.addEventListener('input', function () { commit(slider.value); });
    /* A tap landing on the current thumb position fires no input event. */
    slider.addEventListener('pointerdown', function () { commit(slider.value); });

    var minus = node('button', 'score__step', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Decrease ' + field.label + ' by 0.1');
    var plus = node('button', 'score__step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Increase ' + field.label + ' by 0.1');

    function step(delta) {
      var cur = state.draft[field.key];
      commit(S.round1((cur == null ? Number(slider.value) : cur) + delta));
    }
    minus.addEventListener('click', function () { step(-SCALE.step); });
    plus.addEventListener('click', function () { step(SCALE.step); });

    controls.appendChild(minus);
    controls.appendChild(slider);
    controls.appendChild(plus);
    wrap.appendChild(controls);

    paint(initial == null ? 5 : initial, initial != null);
    return wrap;
  }

  function buildScoreList(existing) {
    var frag = document.createDocumentFragment();
    DIRECT.forEach(function (c) {
      frag.appendChild(buildScoreControl(c, existing ? existing[c.key] : null,
        S.SCORING_WEIGHTS[c.key] + '%'));
    });
    el.evalScores.replaceChildren(frag);

    var svc = document.createDocumentFragment();
    SERVICE.forEach(function (c) {
      svc.appendChild(buildScoreControl(c, existing ? existing[c.key] : null, null));
    });
    el.evalService.replaceChildren(svc);
    el.serviceWeight.textContent = S.SCORING_WEIGHTS.service + '%';
  }

  function renderEvalLive() {
    var weighted = S.calculateWeightedReviewerScore(state.draft);
    var scored = S.countScored(state.draft);
    el.evalWeighted.textContent = S.formatScore(weighted);
    el.evalProgress.textContent = weighted != null
      ? 'All ' + INPUT_KEYS.length + ' scores entered'
      : scored + ' of ' + INPUT_KEYS.length + ' scores entered';
    el.serviceDerived.textContent = S.formatScore(S.serviceScore(state.draft));
    el.tallyValue.textContent = S.formatScore(weighted);

    if (weighted == null) {
      el.tallyHint.textContent = 'Awaiting scores';
    } else {
      var target = targetEstablishment();
      var peerKey = S.otherAuditor(state.me);
      var peerHas = target ? S.hasAudit(target, peerKey) : false;
      if (!target) {
        el.tallyHint.textContent = 'A new establishment enters the register as Pending until ' +
          S.auditorName(peerKey) + ' files.';
      } else if (peerHas) {
        el.tallyHint.textContent = 'Projected Composite Patty Index ' +
          S.formatCPI(projectedCPI(target, weighted));
      } else {
        el.tallyHint.textContent = 'Awaiting ' + S.auditorName(peerKey) + ' for certification.';
      }
    }
    if (state.submitAttempted) validate(false);
  }

  /** What the establishment composite becomes if this draft is filed. */
  function projectedCPI(establishment, weighted) {
    var peerKey = S.otherAuditor(state.me);
    var peer = S.weightedFor(establishment, peerKey);
    if (peer == null) return null;
    var mine = S.compliantAuditsOf(establishment, state.me).map(function (a) {
      return S.calculateWeightedReviewerScore(S.withService(a));
    });
    if (state.evalMode.type === 'amend') {
      /* An amendment replaces one existing figure rather than adding one. */
      var idx = S.compliantAuditsOf(establishment, state.me)
        .map(function (a) { return a.id; }).indexOf(state.evalMode.auditId);
      if (idx !== -1) mine[idx] = weighted; else mine.push(weighted);
    } else {
      mine.push(weighted);
    }
    var mean = mine.reduce(function (a, b) { return a + b; }, 0) / mine.length;
    return ((mean + peer) / 2) * 10;
  }

  /* =============================================================
     LOOKUPS
     ============================================================= */
  function establishmentById(id) {
    return state.register.establishments.filter(function (e) { return e.id === id; })[0] || null;
  }
  function establishmentByName(name) {
    var key = T.normalizeName(name);
    if (!key) return null;
    return state.register.establishments.filter(function (e) { return e.nameKey === key; })[0] || null;
  }
  function viewById(id) {
    var m = state.globalMetrics;
    return m && m.views ? m.views.filter(function (v) { return v.id === id; })[0] || null : null;
  }
  function locationById(id) {
    return state.register.locations.filter(function (l) { return l.id === id; })[0] || null;
  }
  function locationName(id) {
    var l = locationById(id);
    return l ? l.name : null;
  }
  function auditById(id) {
    var found = null;
    state.register.establishments.forEach(function (e) {
      (e.audits || []).forEach(function (a) { if (a.id === id) found = a; });
    });
    return found;
  }

  /** The establishment this draft would be filed against, if it exists. */
  function targetEstablishment() {
    if (state.evalMode.establishmentId) return establishmentById(state.evalMode.establishmentId);
    return establishmentByName(el.inputEstablishment.value);
  }

  /* =============================================================
     FILTERS
     ============================================================= */
  function renderFilters() {
    var m = state.globalMetrics;
    var previousLocation = state.filter.locationId || '';
    var previousCategory = state.filter.category || '';

    /* Locations: those actually used, plus anything still selectable. */
    var options = document.createDocumentFragment();
    var all = node('option', null, 'All Locations');
    all.value = '';
    options.appendChild(all);

    var used = m.locationIndex.filter(function (l) { return l.audits > 0; });
    var groups = {};
    used.forEach(function (l) { (groups[l.group] = groups[l.group] || []).push(l); });
    Object.keys(groups).forEach(function (key) {
      var group = document.createElement('optgroup');
      group.label = T.groupLabel(key);
      groups[key].sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (l) {
          var o = node('option', null, l.name + ' (' + l.audits + ')');
          o.value = l.id;
          group.appendChild(o);
        });
      options.appendChild(group);
    });
    el.filterLocation.replaceChildren(options);
    el.filterLocation.value = previousLocation;
    if (el.filterLocation.value !== previousLocation) {
      state.filter.locationId = null;
      el.filterLocation.value = '';
    }

    var catOptions = document.createDocumentFragment();
    var allCats = node('option', null, 'All Categories');
    allCats.value = '';
    catOptions.appendChild(allCats);
    m.categoryIndex.filter(function (c) { return c.establishments > 0; }).forEach(function (c) {
      var o = node('option', null, c.label + ' (' + c.establishments + ')');
      o.value = c.key;
      catOptions.appendChild(o);
    });
    el.filterCategory.replaceChildren(catOptions);
    el.filterCategory.value = previousCategory;
    if (el.filterCategory.value !== previousCategory) {
      state.filter.category = null;
      el.filterCategory.value = '';
    }

    var active = !!(state.filter.locationId || state.filter.category);
    el.filterClear.hidden = !active;
    el.filterNote.hidden = !active;
    if (active) {
      var parts = [];
      if (state.filter.locationId) parts.push(locationName(state.filter.locationId));
      if (state.filter.category) parts.push(T.categoryLabel(state.filter.category));
      el.filterNote.textContent = state.filter.locationId
        ? 'Showing ' + parts.join(' · ') + '. Within a location filter an establishment certifies only ' +
          'on audits taken there, so some entries appear as Pending.'
        : 'Showing ' + parts.join(' · ') + '.';
    }
  }

  function applyFilterChange() {
    state.filter.locationId = el.filterLocation.value || null;
    state.filter.category = el.filterCategory.value || null;
    recompute();
    renderAll();
  }

  function bindFilters() {
    el.filterLocation.addEventListener('change', applyFilterChange);
    el.filterCategory.addEventListener('change', applyFilterChange);
    el.filterClear.addEventListener('click', function () {
      el.filterLocation.value = '';
      el.filterCategory.value = '';
      applyFilterChange();
    });
  }

  /* =============================================================
     RANKINGS
     ============================================================= */
  function statusTag(view) {
    return node('span', 'tag tag--' + (view.certified ? 'certified' : 'pending'),
      view.certified ? 'Certified' : 'Pending Peer Review');
  }

  function summaryLine(view) {
    var bits = [view.categoryLabel];
    if (view.visits) bits.push(view.visits + (view.visits === 1 ? ' audit' : ' audits'));
    if (view.locations.length === 1) bits.push(view.locations[0]);
    else if (view.locations.length > 1) bits.push(view.locations.length + ' branches');
    return bits.join(' · ');
  }

  function buildEstablishmentRow(view, opts) {
    opts = opts || {};
    var item = node('li', 'ranking');
    item.dataset.id = view.id;
    if (view.id === state.justAddedId) item.classList.add('is-new');

    var btn = node('button', 'ranking__btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', view.name + '. Open establishment file.');

    var rankText = opts.rank === false ? '—' : (view.rank != null ? String(view.rank).padStart(2, '0') : '··');
    btn.appendChild(node('span', 'ranking__rank', rankText));

    var body = node('span', 'ranking__body');
    var text = node('span', 'ranking__text');
    text.appendChild(node('span', 'ranking__name', view.name));
    text.appendChild(node('span', 'ranking__origin', summaryLine(view)));
    body.appendChild(text);

    var meta = node('span', 'ranking__meta');
    meta.appendChild(node('span', 'ranking__file', view.fileNumber || '—'));
    if (opts.status !== false) meta.appendChild(statusTag(view));
    if (opts.note) meta.appendChild(node('span', 'tag tag--legacy', opts.note));
    body.appendChild(meta);
    btn.appendChild(body);

    var score = node('span', 'ranking__score', view.certified ? S.formatCPI(view.cpi) : '—');
    score.appendChild(node('small', null, view.certified ? 'CPI' : 'Pending'));
    btn.appendChild(score);
    btn.appendChild(icon('ranking__chev', 'M6 3l5 5-5 5'));
    btn.addEventListener('click', function () { openRecord(view.id); });

    item.appendChild(btn);

    if (opts.action) {
      var bar = node('div', 'ranking__action');
      var go = node('button', 'btn btn--primary btn--small', opts.action.label);
      go.type = 'button';
      go.addEventListener('click', opts.action.onClick);
      bar.appendChild(go);
      item.appendChild(bar);
    }
    return item;
  }

  function renderStats() {
    var m = state.metrics;
    el.statSpecimens.textContent = String(m.counts.certified);
    el.statMean.textContent = S.formatCPI(m.paired.cpi.mean);
    el.statAudits.textContent = String(m.counts.audits);
    el.statPending.textContent = String(m.counts.pending);
  }

  function renderRankings() {
    var ranked = state.metrics.ranked;
    el.rankingsList.replaceChildren();
    if (ranked.length) {
      var frag = document.createDocumentFragment();
      ranked.forEach(function (v) { frag.appendChild(buildEstablishmentRow(v)); });
      el.rankingsList.appendChild(frag);
    }
    el.rankingsList.hidden = !ranked.length;
    el.rankingsEmpty.hidden = !!ranked.length;

    if (!ranked.length) {
      if (state.filter.locationId || state.filter.category) {
        el.rankingsEmptyTitle.textContent = 'No certified establishments under this filter.';
        el.rankingsEmptyText.textContent = state.filter.locationId
          ? 'Within a location filter, an establishment certifies only when both auditors have audited it ' +
            'there. Clear the filter to see the register as a whole.'
          : 'No establishment of this class has been certified yet.';
      } else {
        el.rankingsEmptyTitle.textContent = 'No certified establishments.';
        el.rankingsEmptyText.textContent = 'An establishment enters the Official Rankings once both auditors ' +
          'hold at least one current-schema audit for it. They need not have eaten the same burger, ' +
          'or visited the same branch.';
      }
    }
  }

  /* =============================================================
     PENDING
     ============================================================= */
  function renderPending() {
    var m = state.globalMetrics;
    if (!hasAuthenticatedState() || !m.pendingFor) {
      [el.pendingMine, el.pendingTheirs, el.pendingRecert].forEach(function (list) { list.replaceChildren(); });
      el.pendingMineWrap.hidden = true;
      el.pendingTheirsWrap.hidden = true;
      el.pendingRecertWrap.hidden = true;
      el.pendingEmpty.hidden = true;
      return;
    }
    var mine = m.pendingFor[state.me];
    var peerKey = S.otherAuditor(state.me);
    var theirs = m.pendingFor[peerKey];
    var recert = m.views.filter(function (v) { return v.awaitingRecertification; });

    el.pendingRecert.replaceChildren();
    recert.forEach(function (v) {
      var owed = v.legacyCounts[state.me] > 0;
      el.pendingRecert.appendChild(buildEstablishmentRow(v, {
        rank: false,
        note: 'Superseded schema',
        action: owed ? {
          label: 'Bring my audit up to schema',
          onClick: function () { amendAudit(v.legacyBy[state.me][0].id); }
        } : null
      }));
    });
    el.pendingRecertWrap.hidden = recert.length === 0;
    el.pendingRecertMeta.textContent = recert.length +
      (recert.length === 1 ? ' establishment holds an audit' : ' establishments hold audits') +
      ' filed under a superseded scoring schema. The original scores are preserved; the missing fields ' +
      'must be supplied before the audit counts again.';

    el.pendingMine.replaceChildren();
    mine.forEach(function (v) {
      el.pendingMine.appendChild(buildEstablishmentRow(v, {
        rank: false,
        action: { label: 'File my audit', onClick: function () { startForEstablishment(v.id); } }
      }));
    });
    el.pendingMineWrap.hidden = mine.length === 0;
    el.pendingMineMeta.textContent = mine.length +
      (mine.length === 1 ? ' establishment requires your audit.' : ' establishments require your audit.') +
      ' Any branch, any burger.';

    el.pendingTheirs.replaceChildren();
    theirs.forEach(function (v) { el.pendingTheirs.appendChild(buildEstablishmentRow(v, { rank: false })); });
    el.pendingTheirsWrap.hidden = theirs.length === 0;
    el.pendingTheirsTitle.textContent = 'Awaiting ' + S.auditorName(peerKey);
    el.pendingTheirsMeta.textContent = 'You have filed. ' + S.auditorName(peerKey) +
      ' has not. No action is required from you.';

    el.pendingEmpty.hidden = (mine.length + theirs.length + recert.length) > 0;
  }

  function renderEvalPending() {
    if (!hasAuthenticatedState() || !state.globalMetrics.pendingFor) {
      el.evalPendingList.replaceChildren();
      el.evalPendingWrap.hidden = true;
      return;
    }
    var mine = state.globalMetrics.pendingFor[state.me];
    el.evalPendingList.replaceChildren();
    mine.forEach(function (v) {
      el.evalPendingList.appendChild(buildEstablishmentRow(v, {
        rank: false,
        action: { label: 'File my audit', onClick: function () { startForEstablishment(v.id); } }
      }));
    });
    el.evalPendingWrap.hidden = mine.length === 0 || state.evalMode.type === 'amend';
  }

  /* =============================================================
     THE AUDIT FORM
     ============================================================= */
  function fillCategorySelect(select, selected) {
    var frag = document.createDocumentFragment();
    T.ESTABLISHMENT_CATEGORIES.forEach(function (c) {
      var o = node('option', null, c.label);
      o.value = c.key;
      frag.appendChild(o);
    });
    select.replaceChildren(frag);
    select.value = T.coerceCategory(selected);
  }

  function fillLocationSelect(selectedId) {
    var frag = document.createDocumentFragment();
    var first = node('option', null, 'Select a location…');
    first.value = '';
    frag.appendChild(first);

    var groups = {};
    state.register.locations.forEach(function (l) {
      /* Archived locations stay selectable only where already in use. */
      if (l.archived && l.id !== selectedId) return;
      (groups[l.group] = groups[l.group] || []).push(l);
    });
    var order = T.LOCATION_GROUPS.map(function (g) { return g.key; }).concat([T.CUSTOM_GROUP.key]);
    Object.keys(groups).sort(function (a, b) {
      var ai = order.indexOf(a), bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }).forEach(function (key) {
      var group = document.createElement('optgroup');
      group.label = T.groupLabel(key);
      groups[key].sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (l) {
        var o = node('option', null, l.name);
        o.value = l.id;
        group.appendChild(o);
      });
      frag.appendChild(group);
    });

    var add = node('option', null, '＋ Add a new location…');
    add.value = '__add__';
    frag.appendChild(add);

    el.selectLocation.replaceChildren(frag);
    el.selectLocation.value = selectedId || '';
    state.draftLocationId = el.selectLocation.value === '__add__' ? null : (el.selectLocation.value || null);
  }

  function fillEstablishmentOptions() {
    var frag = document.createDocumentFragment();
    state.register.establishments.slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (e) {
        var o = document.createElement('option');
        o.value = e.name;
        frag.appendChild(o);
      });
    el.establishmentOptions.replaceChildren(frag);
  }

  function fillBurgerOptions(establishment) {
    var frag = document.createDocumentFragment();
    var seen = {};
    if (establishment) {
      (establishment.audits || []).forEach(function (a) {
        var key = T.normalizeName(a.burger);
        if (!a.burger || seen[key]) return;
        seen[key] = true;
        var o = document.createElement('option');
        o.value = a.burger;
        frag.appendChild(o);
      });
    }
    el.burgerOptions.replaceChildren(frag);
  }

  /** React to the establishment field naming a record already on file. */
  function syncEstablishmentContext(options) {
    options = options || {};
    var match = targetEstablishment();
    fillBurgerOptions(match);
    if (match) {
      if (options.adoptCategory !== false) el.selectCategory.value = T.coerceCategory(match.category);
      var view = viewById(match.id);
      var visits = view ? view.visits : 0;
      el.hintEstablishment.textContent = 'On file as ' + match.fileNumber + ' · ' +
        T.categoryLabel(match.category) +
        (visits ? ' · ' + visits + (visits === 1 ? ' audit' : ' audits') + ' recorded' : '') +
        '. This audit joins that file.';
    } else {
      el.hintEstablishment.textContent = 'Choose an establishment already on file, or type a new one. ' +
        'The brand is ranked, not the branch.';
    }
    renderEvalLive();
  }

  /* The audit form's option lists come from shared data, so they have to
     be rebuilt whenever the register is reloaded — not only when the form
     is reset. The auditor's current selection is preserved. */
  function refreshFormOptions() {
    fillEstablishmentOptions();
    var keep = state.draftLocationId;
    fillLocationSelect(keep);
    if (keep && el.selectLocation.value !== keep) {
      /* The selected location vanished (archived or renamed away). */
      state.draftLocationId = el.selectLocation.value || null;
    }
    fillBurgerOptions(targetEstablishment());
  }

  function startNew(establishmentId) {
    state.evalMode = { type: 'new', establishmentId: establishmentId || null, auditId: null };
    state.draft = {};
    state.submitAttempted = false;

    el.identityNew.hidden = false;
    el.identityReview.hidden = true;
    el.evalTitle.innerHTML = 'File an <span class="accent-rule">Audit</span>';
    el.evalSub.textContent = 'You file only your own audit. Your peer files theirs independently, at ' +
      'whichever branch and on whichever burger they choose.';
    el.evalFormLabel.textContent = 'Form BPS-2';
    el.tallyLabel.textContent = 'Your Weighted Score';
    el.submitBtn.textContent = 'File Audit';

    var target = establishmentId ? establishmentById(establishmentId) : null;
    fillEstablishmentOptions();
    el.inputEstablishment.value = target ? target.name : '';
    el.inputEstablishment.readOnly = !!target;
    fillCategorySelect(el.selectCategory, target ? target.category : T.DEFAULT_CATEGORY);
    el.inputBurger.value = '';
    fillLocationSelect(null);
    el.addLocation.hidden = true;
    el.inputNewLocation.value = '';
    [el.errEstablishment, el.errBurger, el.errLocation].forEach(function (e) { e.hidden = true; });
    [el.inputEstablishment, el.inputBurger, el.selectLocation].forEach(function (e) {
      e.classList.remove('is-invalid');
    });

    buildScoreList(null);
    syncEstablishmentContext();
    renderEvalPending();
  }

  function startForEstablishment(establishmentId) {
    startNew(establishmentId);
    setView('evaluate', { focus: true });
  }

  function amendAudit(auditId) {
    var audit = auditById(auditId);
    if (!audit) return;
    if (audit.auditorKey !== state.me) { toast('An auditor may only amend their own audit.'); return; }
    var establishment = establishmentById(audit.establishmentId);
    if (!establishment) return;

    state.evalMode = { type: 'amend', establishmentId: establishment.id, auditId: auditId };
    state.draft = {};
    INPUT_KEYS.forEach(function (k) {
      if (audit[k] != null) state.draft[k] = Number(audit[k]);
    });
    state.submitAttempted = false;

    el.identityNew.hidden = true;
    el.identityReview.hidden = false;
    el.reviewSpecimen.textContent = 'Establishment ' + establishment.fileNumber;
    el.reviewBurger.textContent = audit.burger || 'Burger not recorded';
    el.reviewRestaurant.textContent = establishment.name +
      (audit.locationName ? ' · ' + audit.locationName : '');

    var missing = S.missingRequirementLabels(audit);
    el.reviewNote.textContent = missing.length
      ? 'This audit predates the current scoring schema. Supply ' + missing.join(' and ') +
        ' to return it to service. Its original scores are unchanged.'
      : 'Amending your own filed audit. Your peer\'s scores are untouched.';

    el.evalTitle.innerHTML = missing.length
      ? 'Bring Audit <span class="accent-rule">Up to Schema</span>'
      : 'Amend Your <span class="accent-rule">Audit</span>';
    el.evalSub.textContent = 'You may only edit your own audit.';
    el.evalFormLabel.textContent = missing.length ? 'Form BPS-2/S' : 'Form BPS-2/A';
    el.tallyLabel.textContent = 'Your Weighted Score';
    el.submitBtn.textContent = missing.length ? 'Recertify Audit' : 'Amend Audit';

    el.inputBurger.value = audit.burger || '';
    fillBurgerOptions(establishment);
    fillLocationSelect(audit.locationId || null);
    el.addLocation.hidden = true;
    el.inputNewLocation.value = '';

    buildScoreList(state.draft);
    renderEvalLive();
    el.evalPendingWrap.hidden = true;
    setView('evaluate', { focus: true });
  }

  function validate(focusFirst) {
    var problems = [];
    var isAmend = state.evalMode.type === 'amend';

    if (!isAmend) {
      var eBad = el.inputEstablishment.value.trim() === '';
      el.errEstablishment.hidden = !eBad;
      el.inputEstablishment.classList.toggle('is-invalid', eBad);
      if (eBad) problems.push({ el: el.inputEstablishment, msg: 'An establishment name is required.' });
    }

    var bBad = el.inputBurger.value.trim() === '';
    el.errBurger.hidden = !bBad;
    el.inputBurger.classList.toggle('is-invalid', bBad);
    if (bBad) problems.push({ el: el.inputBurger, msg: 'The burger examined is required.' });

    var lBad = !state.draftLocationId;
    el.errLocation.hidden = !lBad;
    el.selectLocation.classList.toggle('is-invalid', lBad);
    if (lBad) problems.push({ el: el.selectLocation, msg: 'A location is required.' });

    var complete = S.isCurrentSchemaScores(state.draft);
    INPUT_KEYS.forEach(function (key) {
      var scope = S.SERVICE_KEYS.indexOf(key) === -1 ? el.evalScores : el.evalService;
      var ctrl = scope.querySelector('.score[data-category="' + key + '"]');
      if (ctrl) ctrl.classList.toggle('is-missing', !S.isScored(state.draft[key]));
    });
    if (!complete) {
      problems.push({
        el: el.evalScores,
        msg: (INPUT_KEYS.length - S.countScored(state.draft)) + ' of ' + INPUT_KEYS.length +
          ' scores still require a figure.'
      });
    }

    if (focusFirst && problems.length) {
      problems[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof problems[0].el.focus === 'function') problems[0].el.focus({ preventScroll: true });
    }
    return problems;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!hasAuthenticatedState()) { setView('auth'); return; }
    var token = sessionToken();
    state.submitAttempted = true;
    var problems = validate(true);
    if (problems.length) { el.tallyHint.textContent = problems[0].msg; return; }

    el.submitBtn.disabled = true;
    var original = el.submitBtn.textContent;
    el.submitBtn.textContent = 'Filing…';

    var scores = {};
    INPUT_KEYS.forEach(function (k) { scores[k] = state.draft[k]; });
    var burger = el.inputBurger.value.trim();
    var locationId = state.draftLocationId;
    var isAmend = state.evalMode.type === 'amend';

    var establishmentPromise;
    if (isAmend || state.evalMode.establishmentId) {
      var known = establishmentById(state.evalMode.establishmentId);
      establishmentPromise = maybeUpdateCategory(known, isAmend);
    } else {
      var typed = el.inputEstablishment.value.trim();
      var existing = establishmentByName(typed);
      establishmentPromise = existing
        ? maybeUpdateCategory(existing, false)
        : state.adapter.createEstablishment({ name: typed, category: el.selectCategory.value });
    }

    establishmentPromise.then(function (establishment) {
      if (!isCurrentSession(token)) return null;
      var payload = Object.assign({
        establishmentId: establishment.id,
        burger: burger,
        locationId: locationId
      }, scores);
      return (isAmend
        ? state.adapter.updateAudit(state.evalMode.auditId, payload)
        : state.adapter.createAudit(payload)
      ).then(function () { return establishment.id; });
    }).then(function (establishmentId) {
      if (!establishmentId || !isCurrentSession(token)) return false;
      state.justAddedId = establishmentId;
      return refresh().then(function (loaded) {
        if (!loaded || !isCurrentSession(token)) return false;
        var v = viewById(establishmentId);
        startNew();
        if (v && v.certified) {
          toast(v.name + ' certified. Composite Patty Index ' + S.formatCPI(v.cpi) + '.');
          openRecord(establishmentId);
        } else {
          var peer = S.auditorName(S.otherAuditor(state.me));
          toast(S.auditorName(state.me) + ' audit filed. Awaiting ' + peer + '.');
          setView('rankings', { focus: true });
        }
        if (state.justAddedTimer) clearTimeout(state.justAddedTimer);
        state.justAddedTimer = setTimeout(function () {
          state.justAddedTimer = null;
          if (!isCurrentSession(token)) return;
          state.justAddedId = null;
          renderAll();
        }, 2800);
        return true;
      });
    }).catch(function (err) {
      if (!isCurrentSession(token)) return;
      console.error('[BPS] Filing failed:', err);
      toast(err.message || 'The Bureau was unable to accept this filing.');
    }).finally(function () {
      el.submitBtn.disabled = false;
      el.submitBtn.textContent = original;
    });
  }

  /* Establishment class is shared metadata: changing it on the form
     changes it for everybody, which is the intended behaviour. */
  function maybeUpdateCategory(establishment, skip) {
    if (!establishment) return Promise.reject(new Error('Establishment not found.'));
    var chosen = el.selectCategory.value;
    if (skip || !chosen || chosen === establishment.category) return Promise.resolve(establishment);
    return state.adapter.updateEstablishment(establishment.id, { category: chosen })
      .then(function () { return establishment; })
      .catch(function () { return establishment; });
  }

  function bindEvaluate() {
    el.form.addEventListener('submit', handleSubmit);

    el.inputEstablishment.addEventListener('input', function () {
      syncEstablishmentContext();
      if (state.submitAttempted) validate(false);
    });
    el.inputEstablishment.addEventListener('change', function () { syncEstablishmentContext(); });

    el.inputBurger.addEventListener('input', function () {
      if (state.submitAttempted) validate(false);
    });

    el.selectLocation.addEventListener('change', function () {
      if (el.selectLocation.value === '__add__') {
        el.addLocation.hidden = false;
        state.draftLocationId = null;
        el.inputNewLocation.focus();
      } else {
        el.addLocation.hidden = true;
        state.draftLocationId = el.selectLocation.value || null;
      }
      if (state.submitAttempted) validate(false);
      renderEvalLive();
    });

    el.addLocationSave.addEventListener('click', addLocationFromForm);
    el.inputNewLocation.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addLocationFromForm(); }
    });

    el.reviewCancel.addEventListener('click', function () { startNew(); });
    el.selectCategory.addEventListener('change', function () { renderEvalLive(); });
  }

  /* A location added by either auditor becomes permanent shared data. */
  function addLocationFromForm() {
    var name = el.inputNewLocation.value.trim();
    if (!name) { el.inputNewLocation.focus(); return; }
    var token = sessionToken();
    el.addLocationSave.disabled = true;
    state.adapter.createLocation(name).then(function (location) {
      if (!isCurrentSession(token)) return;
      return state.adapter.listRegister().then(function (register) {
        if (!isCurrentSession(token)) return;
        state.register = register;
        recompute();
        fillLocationSelect(location.id);
        el.addLocation.hidden = true;
        el.inputNewLocation.value = '';
        renderFilters();
        renderEvalLive();
        var existed = T.isPresetLocation(name) ||
          T.normalizeName(location.name) !== T.normalizeName(name);
        toast(existed
          ? location.name + ' was already on file and has been selected.'
          : location.name + ' added to the shared location register.');
      });
    }).catch(function (err) {
      console.error('[BPS] Unable to add location:', err);
      toast(err.message || 'The Bureau was unable to register that location.');
    }).finally(function () {
      el.addLocationSave.disabled = false;
    });
  }

  /* =============================================================
     ESTABLISHMENT FILE
     ============================================================= */
  function figure(label, value, accent) {
    var f = node('div', 'figure' + (accent ? ' figure--wide' : ''));
    f.appendChild(node('p', 'figure__label', label));
    f.appendChild(node('p', 'figure__value', value));
    return f;
  }

  function buildRecordExaminer(auditorKey, establishment, view) {
    var scores = S.profileOf(establishment, auditorKey);
    var name = S.auditorName(auditorKey);
    var card = node('section', 'exrec');

    var head = node('div', 'exrec__head');
    head.appendChild(node('h3', 'exrec__name', name));
    var w = node('div', 'exrec__weighted');
    w.appendChild(node('span', 'exrec__weightedlabel', 'Weighted'));
    w.appendChild(node('span', 'exrec__weightedvalue', S.formatScore(S.weightedFor(establishment, auditorKey))));
    head.appendChild(w);
    card.appendChild(head);

    var legacy = S.legacyAuditsOf(establishment, auditorKey);

    if (!scores) {
      card.classList.add('exrec--missing');
      card.appendChild(node('p', 'exrec__missing', legacy.length
        ? name + ' has ' + legacy.length + ' audit' + (legacy.length === 1 ? '' : 's') +
          ' on file under a superseded schema. No Composite Patty Index can be issued until one is brought up to date.'
        : name + ' has not filed a current audit for this establishment. No Composite Patty Index can be issued until they do.'));
      if (auditorKey === state.me) {
        var go = node('button', 'btn btn--primary btn--small',
          legacy.length ? 'Bring my audit up to schema' : 'File my audit');
        go.type = 'button';
        go.addEventListener('click', function () {
          if (legacy.length) amendAudit(legacy[0].id);
          else startForEstablishment(establishment.id);
        });
        card.appendChild(go);
      }
      return card;
    }

    var n = S.compliantAuditsOf(establishment, auditorKey).length;
    card.appendChild(node('p', 'exrec__basis',
      'Mean of ' + n + ' current ' + (n === 1 ? 'audit' : 'audits') + '.'));

    var list = node('dl', 'catlist');
    CATEGORIES.forEach(function (c) {
      var value = S.categoryValue(scores, c.key);
      var row = node('div', 'catlist__row');
      var dt = node('dt', 'catlist__label', c.label);
      dt.appendChild(node('span', 'catlist__weight', S.SCORING_WEIGHTS[c.key] + '%'));
      row.appendChild(dt);
      var bar = node('span', 'catlist__bar');
      var fill = node('span', 'catlist__fill');
      fill.style.width = ((Number(value) / SCALE.max) * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(node('dd', 'catlist__val', S.formatScore(value)));
      list.appendChild(row);
    });
    card.appendChild(list);

    var sub = node('p', 'exrec__sub', SERVICE.map(function (c) {
      return c.label + ' ' + S.formatScore(scores[c.key]);
    }).join(' · '));
    card.appendChild(sub);

    if (legacy.length) {
      card.appendChild(node('p', 'exrec__legacy', legacy.length +
        ' further ' + (legacy.length === 1 ? 'audit is' : 'audits are') +
        ' on file under a superseded schema and do not count toward this figure.'));
    }

    if (auditorKey === state.me) {
      var add = node('button', 'btn btn--outline btn--small', 'File another audit here');
      add.type = 'button';
      add.addEventListener('click', function () { startForEstablishment(establishment.id); });
      card.appendChild(add);
    }
    return card;
  }

  function buildAuditRow(audit, establishment) {
    var compliant = S.auditIsCompliant(audit);
    var row = node('article', 'auditrow' + (compliant ? '' : ' auditrow--legacy'));
    var head = node('div', 'auditrow__head');
    var who = node('span', 'auditrow__who', S.auditorName(audit.auditorKey));
    head.appendChild(who);
    head.appendChild(node('span', 'auditrow__score',
      compliant ? S.formatScore(S.calculateWeightedReviewerScore(S.withService(audit))) : '—'));
    row.appendChild(head);

    row.appendChild(node('p', 'auditrow__burger', audit.burger || 'Burger not recorded'));
    var bits = [];
    if (audit.locationName) bits.push(audit.locationName);
    bits.push(formatDate(audit.createdAt));
    row.appendChild(node('p', 'auditrow__meta', bits.join(' · ')));

    if (compliant) {
      var cells = node('div', 'auditrow__cells');
      CATEGORIES.forEach(function (c) {
        var cell = node('span', 'auditrow__cell');
        cell.appendChild(node('span', 'auditrow__cellkey', c.short || c.label));
        cell.appendChild(node('span', 'auditrow__cellval', S.formatScore(S.categoryValue(audit, c.key))));
        cells.appendChild(cell);
      });
      row.appendChild(cells);
      row.appendChild(node('p', 'auditrow__service', SERVICE.map(function (c) {
        return c.label + ' ' + S.formatScore(audit[c.key]);
      }).join(' · ')));
    } else {
      row.appendChild(node('p', 'auditrow__flag',
        'Superseded schema — requires ' + S.missingRequirementLabels(audit).join(', ') + '.'));
    }

    if (audit.auditorKey === state.me) {
      var edit = node('button', 'btn btn--outline btn--small',
        compliant ? 'Amend this audit' : 'Bring up to schema');
      edit.type = 'button';
      edit.addEventListener('click', function () { amendAudit(audit.id); });
      row.appendChild(edit);
    }
    return row;
  }

  function renderRecord(establishment) {
    var view = viewById(establishment.id);
    if (!view) { setView('rankings'); return; }
    var certified = view.certified;

    el.recordFile.textContent = 'Establishment File ' + (establishment.fileNumber || '—');
    el.recordBurger.textContent = establishment.name;
    el.recordRestaurant.textContent = view.categoryLabel +
      (view.locations.length ? ' · ' + view.locations.join(', ') : '');
    el.recordMeta.textContent = 'Opened ' + formatDate(establishment.createdAt) + ' · ' +
      view.visits + ' current ' + (view.visits === 1 ? 'audit' : 'audits') +
      (view.legacyCounts.total ? ' · ' + view.legacyCounts.total + ' superseded' : '');

    el.recordFigures.replaceChildren();
    if (certified) {
      el.recordFigures.appendChild(figure('Official Rank', view.rank != null ? '#' + view.rank : '—'));
      el.recordFigures.appendChild(figure('Composite Patty Index', S.formatCPI(view.cpi), true));
      el.recordFigures.appendChild(figure('Status', 'Certified'));
    } else {
      el.recordFigures.appendChild(figure('Status', 'Pending Peer Review', true));
      el.recordFigures.appendChild(figure('Awaiting',
        view.missing ? S.auditorName(view.missing) : 'Both auditors'));
    }

    el.recordCta.replaceChildren();
    if (!certified && (view.missing === state.me || view.missing === null)) {
      var cta = node('button', 'btn btn--primary btn--block', 'File my audit here');
      cta.type = 'button';
      cta.addEventListener('click', function () { startForEstablishment(establishment.id); });
      el.recordCta.appendChild(cta);
    } else if (!certified) {
      el.recordCta.appendChild(node('p', 'record__await',
        'This establishment has no official Composite Patty Index or rank until ' +
        S.auditorName(view.missing) + ' files a current audit.'));
    }

    /* Shared particulars */
    el.editName.value = establishment.name;
    fillCategorySelect(el.editCategory, establishment.category);
    el.editError.hidden = true;
    el.mergeWarning.hidden = true;

    var frag = document.createDocumentFragment();
    S.AUDITOR_KEYS.forEach(function (k) { frag.appendChild(buildRecordExaminer(k, establishment, view)); });
    el.recordExaminers.replaceChildren(frag);

    if (certified) {
      var combined = S.combinedOf(establishment);
      var list = node('dl', 'catlist catlist--findings');
      CATEGORIES.forEach(function (c) {
        var row = node('div', 'catlist__row');
        row.appendChild(node('dt', 'catlist__label', c.label));
        var bar = node('span', 'catlist__bar');
        var fill = node('span', 'catlist__fill');
        fill.style.width = combined[c.key] == null ? '0%' : ((combined[c.key] / SCALE.max) * 100) + '%';
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(node('dd', 'catlist__val', S.formatScore(combined[c.key])));
        list.appendChild(row);
      });
      el.recordFindings.replaceChildren(list);
      el.recordFindingsWrap.hidden = false;
    } else {
      el.recordFindingsWrap.hidden = true;
    }

    var history = (establishment.audits || []).slice().sort(function (a, b) {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    var hist = document.createDocumentFragment();
    history.forEach(function (a) { hist.appendChild(buildAuditRow(a, establishment)); });
    el.recordHistory.replaceChildren(hist);
    el.recordHistoryMeta.textContent = history.length
      ? history.length + ' ' + (history.length === 1 ? 'filing' : 'filings') + ' on record, newest first.'
      : 'No filings on record.';
  }

  function saveParticulars() {
    var establishment = establishmentById(state.recordId);
    if (!establishment) return;
    var token = sessionToken();
    var name = el.editName.value.trim();
    var category = el.editCategory.value;
    el.editError.hidden = true;
    el.mergeWarning.hidden = true;
    if (!name) {
      el.editError.textContent = 'An establishment name is required.';
      el.editError.hidden = false;
      return;
    }
    el.editSave.disabled = true;
    state.adapter.updateEstablishment(establishment.id, { name: name, category: category })
      .then(function () {
        if (!isCurrentSession(token)) return;
        return refresh({ silent: true }).then(function () {
          if (!isCurrentSession(token)) return;
          var again = establishmentById(establishment.id);
          if (again) renderRecord(again);
          toast('Establishment particulars amended.');
        });
      })
      .catch(function (err) {
        if (!isCurrentSession(token)) return;
        if (err && err.code === 'name-collision' && err.detail) {
          el.mergeText.textContent = 'An establishment named ' + err.detail.name +
            ' is already on file. Merging moves every audit from this record onto that one. ' +
            'No score is lost and nothing is deleted.';
          el.mergeConfirm.dataset.target = err.detail.establishmentId;
          el.mergeWarning.hidden = false;
          return;
        }
        el.editError.textContent = (err && err.message) || 'The amendment was refused.';
        el.editError.hidden = false;
      })
      .finally(function () { el.editSave.disabled = false; });
  }

  function confirmMerge() {
    var targetId = el.mergeConfirm.dataset.target;
    var sourceId = state.recordId;
    if (!targetId || !sourceId) return;
    var token = sessionToken();
    el.mergeConfirm.disabled = true;
    state.adapter.mergeEstablishments(sourceId, targetId)
      .then(function () {
        if (!isCurrentSession(token)) return;
        return refresh({ silent: true }).then(function () {
          if (!isCurrentSession(token)) return;
          toast('Records merged. Every audit was preserved.');
          openRecord(targetId);
        });
      })
      .catch(function (err) {
        console.error('[BPS] Merge failed:', err);
        toast((err && err.message) || 'The Bureau was unable to merge those records.');
      })
      .finally(function () { el.mergeConfirm.disabled = false; });
  }

  function openRecord(id) {
    var e = establishmentById(id);
    if (!e) { setView('rankings'); return; }
    state.recordId = id;
    renderRecord(e);
    setView('record', { focus: true, hash: 'record/' + id });
  }

  /* =============================================================
     FINDINGS
     ============================================================= */
  function summaryTile(label, value) {
    var d = node('div', 'stat');
    d.appendChild(node('dt', 'stat__label', label));
    d.appendChild(node('dd', 'stat__value', value));
    return d;
  }

  function renderInsights() {
    var m = state.globalMetrics;

    el.insightsSummary.replaceChildren();
    el.insightsSummary.appendChild(summaryTile('Certified', String(m.counts.certified)));
    el.insightsSummary.appendChild(summaryTile('Pending', String(m.counts.pending)));
    el.insightsSummary.appendChild(summaryTile('Ryan Mean', S.formatScore(m.auditors.ryan.weighted.mean)));
    el.insightsSummary.appendChild(summaryTile('Devin Mean', S.formatScore(m.auditors.devin.weighted.mean)));

    el.personnel.replaceChildren();
    S.AUDITOR_KEYS.forEach(function (k) {
      var a = m.auditors[k];
      var card = node('section', 'exrec');
      var head = node('div', 'exrec__head');
      head.appendChild(node('h3', 'exrec__name', a.name));
      var w = node('div', 'exrec__weighted');
      w.appendChild(node('span', 'exrec__weightedlabel', 'Mean weighted'));
      w.appendChild(node('span', 'exrec__weightedvalue', S.formatScore(a.weighted.mean)));
      head.appendChild(w);
      card.appendChild(head);

      if (!a.n) {
        card.appendChild(node('p', 'exrec__missing', a.name + ' has not filed any current-schema audits.'));
        el.personnel.appendChild(card);
        return;
      }

      var dl = node('dl', 'kv');
      function kv(label, value) {
        var row = node('div', 'kv__row');
        row.appendChild(node('dt', 'kv__key', label));
        row.appendChild(node('dd', 'kv__val', value));
        dl.appendChild(row);
      }
      kv('Audits filed', String(a.n));
      kv('Establishments audited', String(a.establishments));
      kv('Locations visited', String(a.locationsVisited));
      kv('Distinct burgers', String(a.burgersEaten));
      kv('Most generous category', a.bestCat ? S.categoryLabel(a.bestCat) + ' · ' + S.formatScore(a.bestCatMean) : '—');
      kv('Harshest category', a.worstCat ? S.categoryLabel(a.worstCat) + ' · ' + S.formatScore(a.worstCatMean) : '—');
      kv('Service mean', S.formatScore(a.cat.service.mean));
      kv('Scores of 9.0+', a.count9 + ' (' + S.formatPct(a.pct9) + ')');
      kv('Scores below 5.0', a.countBelow5 + ' (' + S.formatPct(a.pctBelow5) + ')');
      kv('Scale used', S.formatScore(a.scores.min) + ' – ' + S.formatScore(a.scores.max));
      kv('Personal #1', a.top ? a.top.name : '—');
      card.appendChild(dl);
      el.personnel.appendChild(card);
    });

    renderFindings();

    var p = m.paired;
    if (p.n >= 2) {
      el.disputes.replaceChildren();
      var cols = node('div', 'disputes');
      [['Official', p.official], ['Ryan', p.ryanOrder], ['Devin', p.devinOrder]].forEach(function (pair) {
        var col = node('div', 'disputes__col');
        col.appendChild(node('p', 'disputes__title', pair[0]));
        var ol = node('ol', 'disputes__list');
        pair[1].slice(0, 5).forEach(function (v, i) {
          var li = node('li', 'disputes__item');
          li.appendChild(node('span', 'disputes__rank', String(i + 1)));
          li.appendChild(node('span', 'disputes__name', v.name));
          ol.appendChild(li);
        });
        col.appendChild(ol);
        cols.appendChild(col);
      });
      el.disputes.appendChild(cols);
      el.disputesWrap.hidden = false;
    } else {
      el.disputesWrap.hidden = true;
    }

    if (p.n >= 1) {
      var wrap = node('div', 'diffs');
      CATEGORIES.forEach(function (c) {
        var b = p.byCategory[c.key];
        var row = node('div', 'diff');
        var head = node('div', 'diff__head');
        head.appendChild(node('span', 'diff__label', c.label));
        var delta = b.delta;
        var lead = delta === 0 ? 'level' : (delta > 0 ? 'Ryan +' + S.roundTo(Math.abs(delta), 2).toFixed(2)
                                                      : 'Devin +' + S.roundTo(Math.abs(delta), 2).toFixed(2));
        head.appendChild(node('span', 'diff__delta', lead));
        row.appendChild(head);

        var bars = node('div', 'diff__bars');
        [['ryan', b.ryanMean], ['devin', b.devinMean]].forEach(function (pairv) {
          var line = node('div', 'diff__line');
          line.appendChild(node('span', 'diff__who', S.auditorName(pairv[0])));
          var track = node('span', 'diff__track');
          var fill = node('span', 'diff__fill diff__fill--' + pairv[0]);
          fill.style.width = ((Number(pairv[1]) / SCALE.max) * 100) + '%';
          track.appendChild(fill);
          line.appendChild(track);
          line.appendChild(node('span', 'diff__num', S.formatScore(pairv[1])));
          bars.appendChild(line);
        });
        row.appendChild(bars);
        wrap.appendChild(row);
      });
      el.differentials.replaceChildren(wrap);
      el.differentialsWrap.hidden = false;
    } else {
      el.differentialsWrap.hidden = true;
    }

    renderLocationRegistry();

    disasterDirector.render(state.disasterEvents, 'insights');
  }

  /* =============================================================
     LOCATION REGISTRY

     Shared reference data. Either auditor may correct a name that was
     typed wrong; nothing is ever deleted, because historical audits
     point at these rows. Archiving only removes a location from future
     selection.
     ============================================================= */
  function renderLocationRegistry() {
    var index = state.globalMetrics.locationIndex;
    /* Preset locations nobody has used need no administration. */
    var managed = index.filter(function (l) { return l.inUse || !l.isPreset; })
      .sort(function (a, b) { return b.audits - a.audits || a.name.localeCompare(b.name); });

    el.locationsList.replaceChildren();
    if (!managed.length) {
      el.locationsWrap.hidden = true;
      return;
    }
    el.locationsWrap.hidden = false;
    var frag = document.createDocumentFragment();
    managed.forEach(function (l) { frag.appendChild(buildLocationRow(l)); });
    el.locationsList.appendChild(frag);
    el.locationsNote.textContent = managed.length + ' of ' + index.length +
      ' registered locations are in use or were added by the auditing staff. ' +
      'The remaining preset locations are available in the filing form.';
  }

  function buildLocationRow(l) {
    var row = node('div', 'locrow' + (l.archived ? ' locrow--archived' : ''));
    var head = node('div', 'locrow__head');
    head.appendChild(node('span', 'locrow__name', l.name));
    head.appendChild(node('span', 'locrow__meta', l.audits
      ? l.audits + (l.audits === 1 ? ' audit' : ' audits') + ' · ' + l.establishments +
        (l.establishments === 1 ? ' establishment' : ' establishments')
      : 'unused'));
    row.appendChild(head);

    var actions = node('div', 'locrow__actions');
    var rename = node('button', 'btn btn--outline btn--small', 'Correct name');
    rename.type = 'button';
    actions.appendChild(rename);

    var toggle = node('button', 'btn btn--outline btn--small', l.archived ? 'Restore' : 'Archive');
    toggle.type = 'button';
    toggle.addEventListener('click', function () {
      toggle.disabled = true;
      var token = sessionToken();
      state.adapter.setLocationArchived(l.id, !l.archived).then(function () {
        if (!isCurrentSession(token)) return;
        return refresh({ silent: true }).then(function () {
          if (!isCurrentSession(token)) return;
          renderInsights();
          toast(l.name + (l.archived ? ' restored to the register.' : ' archived. Existing audits keep it.'));
        });
      }).catch(function (err) {
        toast((err && err.message) || 'The Bureau was unable to amend that location.');
      }).finally(function () { toggle.disabled = false; });
    });
    actions.appendChild(toggle);
    row.appendChild(actions);

    var edit = node('div', 'locrow__edit');
    edit.hidden = true;
    var editRow = node('div', 'locrow__editrow');
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.value = l.name;
    input.setAttribute('aria-label', 'Corrected name for ' + l.name);
    var save = node('button', 'btn btn--primary btn--small', 'Save');
    save.type = 'button';
    editRow.appendChild(input);
    editRow.appendChild(save);
    edit.appendChild(editRow);
    var error = node('p', 'locrow__error');
    error.hidden = true;
    edit.appendChild(error);
    row.appendChild(edit);

    rename.addEventListener('click', function () {
      edit.hidden = !edit.hidden;
      if (!edit.hidden) input.focus();
    });

    function commit() {
      var name = input.value.trim();
      error.hidden = true;
      if (!name || name === l.name) { edit.hidden = true; return; }
      save.disabled = true;
      var token = sessionToken();
      state.adapter.renameLocation(l.id, name).then(function () {
        if (!isCurrentSession(token)) return;
        return refresh({ silent: true }).then(function () {
          if (!isCurrentSession(token)) return;
          renderInsights();
          toast('Location corrected to ' + name + '. Every audit that used it is unchanged.');
        });
      }).catch(function (err) {
        error.textContent = (err && err.message) || 'That correction was refused.';
        error.hidden = false;
      }).finally(function () { save.disabled = false; });
    }
    save.addEventListener('click', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
    });
    return row;
  }

  function renderFindings() {
    var m = state.globalMetrics;
    var found = IN.select(m, { min: 6, max: 12 });
    el.findingsList.replaceChildren();

    if (!found.length) {
      var empty = node('div', 'empty');
      empty.appendChild(node('p', 'empty__stamp', 'No Findings'));
      empty.appendChild(node('h3', 'empty__title', 'The Office has nothing to report.'));
      empty.appendChild(node('p', 'empty__text',
        'No establishment has yet completed peer review. The Bureau requires at least one certified ' +
        'establishment before it will begin making accusations.'));
      el.findingsList.appendChild(empty);
      el.findingsMeta.textContent = 'Awaiting the first certified establishment.';
      return;
    }

    found.forEach(function (f) {
      var card = node('article', 'finding finding--' + f.rarity);
      card.appendChild(node('p', 'finding__title', f.title));
      card.appendChild(node('p', 'finding__body', f.body));
      if (f.rarity === 'rare' || f.rarity === 'legendary') {
        card.appendChild(node('span', 'finding__flag', f.rarity === 'legendary' ? 'Exceptional' : 'Uncommon'));
      }
      el.findingsList.appendChild(card);
    });
    el.findingsMeta.textContent = found.length + ' findings issued from ' +
      IN.eligibleRules(m).length + ' currently applicable. Revisit for others.';
  }

  /* =============================================================
     ROUTER
     ============================================================= */
  function setView(name, options) {
    options = options || {};
    if (!el.views[name]) name = 'rankings';
    if (name !== 'auth' && !hasAuthenticatedState()) name = 'auth';
    state.view = name;

    Object.keys(el.views).forEach(function (k) { el.views[k].hidden = k !== name; });
    el.masthead.hidden = !state.session;

    var active = name === 'record' ? 'rankings' : name;
    el.tabs.forEach(function (t) {
      if (t.dataset.view) t.setAttribute('aria-selected', String(t.dataset.view === active));
    });

    if (name === 'insights') renderInsights();
    else if (disasterDirector) disasterDirector.clear();
    if (name === 'records') renderRecordsOffice();
    if (name === 'evaluate' && state.evalMode.type === 'new') renderEvalPending();

    var hash = options.hash || name;
    if (window.location.hash.slice(1) !== hash) window.history.replaceState(null, '', '#' + hash);
    if (options.focus) {
      window.scrollTo(0, 0);
      el.views[name].focus({ preventScroll: true });
    }
  }

  function routeFromHash(explicit) {
    var hash = explicit != null ? explicit : window.location.hash.slice(1);
    if (!state.session) { setView('auth'); return; }
    if (hash.indexOf('record/') === 0) { openRecord(hash.slice(7)); return; }
    setView(hash || 'rankings');
  }

  function bindNav() {
    qsa('[data-view], [data-goto]').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = b.dataset.view || b.dataset.goto;
        if (target === 'evaluate' && state.evalMode.type === 'amend') startNew();
        setView(target, { focus: true });
      });
    });
    window.addEventListener('hashchange', function () { routeFromHash(); });
    el.reroll.addEventListener('click', function () { renderFindings(); });
    el.editSave.addEventListener('click', saveParticulars);
    el.mergeConfirm.addEventListener('click', confirmMerge);
    el.recordsSort.addEventListener('change', function () {
      state.recordsSort = el.recordsSort.value;
      state.recordsShown = RECORDS_PAGE;
      renderRecordsOffice();
    });
    el.recordsMore.addEventListener('click', function () {
      state.recordsShown += RECORDS_PAGE;
      renderRecordsOffice();
    });
    el.recordsSound.addEventListener('click', function () {
      var on = RO.setSoundEnabled(!RO.soundEnabled());
      renderRecordsOffice();
      if (on) RO.playSting();
    });
  }

  /* =============================================================
     INIT
     ============================================================= */
  function init() {
    cacheDom();
    disasterDirector = DT.createDirector({ host: el.disasterStage });
    ceremony = RO.createCeremony({
      host: el.ceremonyHost,
      onAcknowledge: function (row) {
        acknowledgeRecords([row]);
        renderRecordsOffice();
      }
    });

    if (!S.weightsAreValid()) {
      console.error('[BPS] SCORING_WEIGHTS total ' + S.weightsTotal() + ', expected ' + S.WEIGHT_TOTAL);
    }

    var params = new URLSearchParams(window.location.search);
    var force = params.get('adapter');
    try {
      state.adapter = DATA.chooseAdapter(window.BPS.config, force);
    } catch (err) {
      console.error('[BPS] Secure data service unavailable:', err);
      el.authBtn.disabled = true;
      el.authModeNote.textContent = 'The secure Bureau data service is unavailable. Please try again later.';
      setView('auth');
      return;
    }

    bindAuth();
    bindNav();
    bindEvaluate();
    bindFilters();
    showAuthMode();
    fillCategorySelect(el.selectCategory, T.DEFAULT_CATEGORY);
    fillCategorySelect(el.editCategory, T.DEFAULT_CATEGORY);
    startNew();

    /* Test hook: ?as=ryan bypasses the login form in mock mode only. */
    var as = params.get('as');
    if (as && state.adapter.mode === 'mock' && state.adapter.auth.signInAs) {
      state.adapter.auth.signInAs(as).then(onSignedIn);
      return;
    }

    state.adapter.auth.getSession().then(function (session) {
      if (session) onSignedIn(session);
      else setView('auth');
    }).catch(function () { setView('auth'); });
  }

  init();
  window.BPS.app = {
    state: state,
    refresh: refresh,
    setView: setView,
    openRecord: openRecord,
    amendAudit: amendAudit,
    startForEstablishment: startForEstablishment,
    acknowledgeRecords: acknowledgeRecords,
    disasterDirector: disasterDirector,
    ceremony: ceremony
  };
})();
