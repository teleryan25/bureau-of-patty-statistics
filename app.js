/* =============================================================
   Bureau of Patty Statistics — app.js

   State, rendering, events. Contains no statistics and no weights:
     scoring.js       arithmetic
     analytics.js     metrics
     insights.js      rule engine + rotation
     insight-rules.js the rule library
     data.js          Supabase / mock adapters
   ============================================================= */
(function () {
  'use strict';

  var S = window.BPS.scoring;
  var AN = window.BPS.analytics;
  var IN = window.BPS.insights;
  var DATA = window.BPS.data;

  var CATEGORIES = S.CATEGORIES;
  var K = S.CATEGORY_KEYS;
  var SCALE = S.SCALE;

  /* ---------- state ---------- */
  var state = {
    adapter: null,
    session: null,
    me: null,              /* 'ryan' | 'devin' */
    burgers: [],
    metrics: null,
    view: 'auth',
    recordId: null,
    evalMode: { type: 'new', burgerId: null },
    draft: {},
    submitAttempted: false,
    authEpoch: 0,
    justAddedTimer: null
  };

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
    toast._t = setTimeout(function () { el.toast.hidden = true; }, 3200);
  }

  function hasAuditorIdentity() {
    return S.AUDITOR_KEYS.indexOf(state.me) !== -1;
  }

  function hasAuthenticatedState() {
    return !!(state.session && hasAuditorIdentity() && state.metrics);
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
    state.burgers = [];
    state.metrics = null;
    state.recordId = null;
    state.justAddedId = null;
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
        evaluate: $('view-evaluate'), record: $('view-record'), insights: $('view-insights')
      },
      tabs: qsa('[data-view]'),
      /* auth */
      authForm: $('auth-login-form'), authEmail: $('auth-email'), authPassword: $('auth-password'),
      authErr: $('auth-error'), authBtn: $('auth-login-btn'), authModeNote: $('auth-mode-note'),
      /* rankings */
      rankingsList: $('rankings-list'), rankingsEmpty: $('rankings-empty'),
      statSpecimens: qs('[data-stat="specimens"]'), statMean: qs('[data-stat="mean"]'),
      statPending: qs('[data-stat="pending"]'),
      /* pending */
      pendingMineWrap: $('pending-mine-wrap'), pendingMine: $('pending-mine'), pendingMineMeta: $('pending-mine-meta'),
      pendingTheirsWrap: $('pending-theirs-wrap'), pendingTheirs: $('pending-theirs'),
      pendingTheirsTitle: $('pending-theirs-title'), pendingTheirsMeta: $('pending-theirs-meta'),
      pendingEmpty: $('pending-empty'),
      /* evaluate */
      evalTitle: $('eval-title'), evalSub: $('eval-sub'), evalFormLabel: $('eval-form-label'),
      evalPendingWrap: $('eval-pending-wrap'), evalPendingList: $('eval-pending-list'),
      identityNew: $('eval-identity-new'), identityReview: $('eval-identity-review'),
      form: $('evaluate-form'), inputRestaurant: $('f-restaurant'), inputBurger: $('f-burger'),
      errRestaurant: $('err-restaurant'), errBurger: $('err-burger'),
      dupWarning: $('dup-warning'), dupText: $('dup-text'), dupOpen: $('dup-open'),
      reviewSpecimen: $('review-specimen'), reviewBurger: $('review-burger'),
      reviewRestaurant: $('review-restaurant'), reviewNote: $('review-note'), reviewCancel: $('review-cancel'),
      evalAuditorName: $('eval-auditor-name'), evalWeighted: $('eval-weighted'),
      evalProgress: $('eval-progress'), evalScores: $('eval-scores'),
      tallyLabel: $('tally-label'), tallyValue: $('tally-value'), tallyHint: $('tally-hint'),
      submitBtn: $('submit-btn'),
      /* record */
      recordFile: $('record-file'), recordBurger: $('record-burger'), recordRestaurant: $('record-restaurant'),
      recordMeta: $('record-meta'), recordFigures: $('record-figures'), recordCta: $('record-cta'),
      recordExaminers: $('record-examiners'), recordFindingsWrap: $('record-findings-wrap'),
      recordFindings: $('record-findings'),
      /* insights */
      insightsSummary: $('insights-summary'), personnel: $('personnel-files'),
      findingsList: $('findings-list'), findingsMeta: $('findings-meta'), reroll: $('reroll-btn'),
      disputesWrap: $('disputes-wrap'), disputes: $('disputes'),
      differentialsWrap: $('differentials-wrap'), differentials: $('differentials')
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
  function refresh() {
    var token = sessionToken();
    if (!token || !hasAuditorIdentity()) return Promise.resolve(false);
    return state.adapter.listBurgers().then(function (burgers) {
      if (!isCurrentSession(token)) return false;
      state.burgers = burgers;
      state.metrics = AN.compute(burgers);
      renderAll();
      return true;
    }).catch(function (err) {
      if (!isCurrentSession(token)) return false;
      console.error('[BPS] Unable to load the register:', err);
      toast('Unable to load the register.');
      return false;
    });
  }

  function renderAll() {
    if (!hasAuthenticatedState()) return false;
    renderStats();
    renderRankings();
    renderPending();
    renderEvalPending();
    updateBadge();
    return true;
  }

  function updateBadge() {
    var pending = state.metrics && state.metrics.pendingFor;
    var mine = pending && pending[state.me];
    var n = Array.isArray(mine) ? mine.length : 0;
    el.pendingBadge.textContent = String(n);
    el.pendingBadge.hidden = n === 0;
  }

  /* =============================================================
     SCORE CONTROLS
     Slider for coarse travel + steppers for exact tenths.
     ============================================================= */
  function buildScoreControl(category, initial) {
    var wrap = node('div', 'score');
    wrap.dataset.category = category.key;

    var head = node('div', 'score__head');
    var lw = node('span', 'score__labelwrap');
    lw.appendChild(node('span', 'score__label', category.label));
    lw.appendChild(node('span', 'score__weight', S.SCORING_WEIGHTS[category.key] + '%'));
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
    slider.setAttribute('aria-label', category.label);

    function paint(value, scored) {
      wrap.style.setProperty('--pct', ((value - SCALE.min) / (SCALE.max - SCALE.min)) * 100 + '%');
      wrap.classList.toggle('is-unset', !scored);
      out.textContent = scored ? S.formatScore(value) : '—';
      slider.setAttribute('aria-valuetext', scored ? S.formatScore(value) : 'Not yet scored');
    }

    function commit(v) {
      var val = S.clampToScale(v);
      slider.value = String(val);
      state.draft[category.key] = val;
      paint(val, true);
      renderEvalLive();
    }

    slider.addEventListener('input', function () { commit(slider.value); });
    /* A tap landing on the current thumb position fires no input event. */
    slider.addEventListener('pointerdown', function () { commit(slider.value); });

    var minus = node('button', 'score__step', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Decrease ' + category.label + ' by 0.1');
    var plus = node('button', 'score__step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Increase ' + category.label + ' by 0.1');

    function step(delta) {
      var cur = state.draft[category.key];
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
    CATEGORIES.forEach(function (c) {
      frag.appendChild(buildScoreControl(c, existing ? existing[c.key] : null));
    });
    el.evalScores.replaceChildren(frag);
  }

  function renderEvalLive() {
    var weighted = S.calculateWeightedReviewerScore(state.draft);
    var scored = S.countScored(state.draft);
    el.evalWeighted.textContent = S.formatScore(weighted);
    el.evalProgress.textContent = weighted != null
      ? 'All ' + K.length + ' categories scored'
      : scored + ' of ' + K.length + ' categories scored';
    el.tallyValue.textContent = S.formatScore(weighted);

    if (weighted == null) {
      el.tallyHint.textContent = 'Awaiting scores';
    } else if (state.evalMode.type === 'review') {
      var b = burgerById(state.evalMode.burgerId);
      var peer = b ? S.weightedFor(b, S.otherAuditor(state.me)) : null;
      el.tallyHint.textContent = peer == null
        ? 'Filing will certify this specimen'
        : 'Projected Composite Patty Index ' + S.formatCPI(((weighted + peer) / 2) * 10);
    } else {
      el.tallyHint.textContent = 'Awaiting ' + S.auditorName(S.otherAuditor(state.me)) + ' for certification';
    }
    if (state.submitAttempted) validate(false);
  }

  /* =============================================================
     RANKINGS
     ============================================================= */
  function statusTag(view) {
    var certified = view.certified;
    var tag = node('span', 'tag tag--' + (certified ? 'certified' : 'pending'),
      certified ? 'Certified' : 'Pending Peer Review');
    return tag;
  }

  function buildSpecimenRow(view, opts) {
    opts = opts || {};
    var item = node('li', 'ranking');
    item.dataset.id = view.id;
    if (view.id === state.justAddedId) item.classList.add('is-new');

    var btn = node('button', 'ranking__btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', view.burger + ' at ' + view.restaurant + '. Open evaluation record.');

    var rankText = opts.rank === false ? '—' : (view.rank != null ? String(view.rank).padStart(2, '0') : '··');
    btn.appendChild(node('span', 'ranking__rank', rankText));

    var body = node('span', 'ranking__body');
    var text = node('span', 'ranking__text');
    text.appendChild(node('span', 'ranking__name', view.burger));
    text.appendChild(node('span', 'ranking__origin', view.restaurant));
    body.appendChild(text);

    var meta = node('span', 'ranking__meta');
    meta.appendChild(node('span', 'ranking__file', view.specimen));
    meta.appendChild(statusTag(view));
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
    el.statPending.textContent = String(m.counts.pending);
  }

  function renderRankings() {
    var ranked = state.metrics.ranked;
    el.rankingsList.replaceChildren();
    if (ranked.length) {
      var frag = document.createDocumentFragment();
      ranked.forEach(function (v) { frag.appendChild(buildSpecimenRow(v)); });
      el.rankingsList.appendChild(frag);
    }
    el.rankingsList.hidden = !ranked.length;
    el.rankingsEmpty.hidden = !!ranked.length;
  }

  /* =============================================================
     PENDING
     ============================================================= */
  function renderPending() {
    var m = state.metrics;
    if (!hasAuthenticatedState() || !m.pendingFor) {
      el.pendingMine.replaceChildren();
      el.pendingTheirs.replaceChildren();
      el.pendingMineWrap.hidden = true;
      el.pendingTheirsWrap.hidden = true;
      el.pendingEmpty.hidden = true;
      return;
    }
    var mine = m.pendingFor[state.me];
    var peerKey = S.otherAuditor(state.me);
    var theirs = m.pendingFor[peerKey];

    el.pendingMine.replaceChildren();
    mine.forEach(function (v) {
      el.pendingMine.appendChild(buildSpecimenRow(v, {
        rank: false,
        action: { label: 'Complete Peer Review', onClick: function () { startReview(v.id); } }
      }));
    });
    el.pendingMineWrap.hidden = mine.length === 0;
    el.pendingMineMeta.textContent = mine.length +
      (mine.length === 1 ? ' specimen requires your scores.' : ' specimens require your scores.');

    el.pendingTheirs.replaceChildren();
    theirs.forEach(function (v) { el.pendingTheirs.appendChild(buildSpecimenRow(v, { rank: false })); });
    el.pendingTheirsWrap.hidden = theirs.length === 0;
    el.pendingTheirsTitle.textContent = 'Awaiting ' + S.auditorName(peerKey);
    el.pendingTheirsMeta.textContent = 'You have filed. ' + S.auditorName(peerKey) +
      ' has not. No action is required from you.';

    el.pendingEmpty.hidden = (mine.length + theirs.length) > 0;
  }

  function renderEvalPending() {
    if (!hasAuthenticatedState() || !state.metrics.pendingFor) {
      el.evalPendingList.replaceChildren();
      el.evalPendingWrap.hidden = true;
      return;
    }
    var mine = state.metrics.pendingFor[state.me];
    el.evalPendingList.replaceChildren();
    mine.forEach(function (v) {
      el.evalPendingList.appendChild(buildSpecimenRow(v, {
        rank: false,
        action: { label: 'Complete Peer Review', onClick: function () { startReview(v.id); } }
      }));
    });
    el.evalPendingWrap.hidden = mine.length === 0 || state.evalMode.type === 'review';
  }

  /* =============================================================
     EVALUATE
     ============================================================= */
  function burgerById(id) {
    return state.burgers.filter(function (b) { return b.id === id; })[0] || null;
  }
  function viewById(id) {
    return state.metrics && state.metrics.views
      ? state.metrics.views.filter(function (v) { return v.id === id; })[0] || null
      : null;
  }

  function startNew() {
    state.evalMode = { type: 'new', burgerId: null };
    state.draft = {};
    state.submitAttempted = false;
    el.identityNew.hidden = false;
    el.identityReview.hidden = true;
    el.evalTitle.innerHTML = 'File an <span class="accent-rule">Examination</span>';
    el.evalSub.textContent = 'You file only your own six scores. Your peer files theirs independently.';
    el.evalFormLabel.textContent = 'Form BPS-2';
    el.tallyLabel.textContent = 'Your Weighted Score';
    el.submitBtn.textContent = 'File Examination';
    el.inputRestaurant.value = '';
    el.inputBurger.value = '';
    el.errRestaurant.hidden = true;
    el.errBurger.hidden = true;
    el.dupWarning.hidden = true;
    buildScoreList(null);
    renderEvalLive();
    renderEvalPending();
  }

  function startReview(burgerId) {
    var b = burgerById(burgerId);
    if (!b) return;
    var v = viewById(burgerId);
    var mine = S.auditOf(b, state.me);

    state.evalMode = { type: 'review', burgerId: burgerId };
    state.draft = {};
    if (mine) K.forEach(function (k) { state.draft[k] = Number(mine[k]); });
    state.submitAttempted = false;

    el.identityNew.hidden = true;
    el.identityReview.hidden = false;
    el.reviewSpecimen.textContent = 'Specimen ' + b.specimenNumber;
    el.reviewBurger.textContent = b.burger;
    el.reviewRestaurant.textContent = b.restaurant;

    var peer = S.otherAuditor(state.me);
    var peerFiled = S.hasAudit(b, peer);
    el.reviewNote.textContent = mine
      ? 'Amending your own filed audit. ' + S.auditorName(peer) + (peerFiled ? ' has filed.' : ' has not yet filed.')
      : S.auditorName(peer) + ' filed this specimen. Your scores will complete peer review and certify it.';

    el.evalTitle.innerHTML = mine ? 'Amend Your <span class="accent-rule">Audit</span>'
                                  : 'Complete Peer <span class="accent-rule">Review</span>';
    el.evalSub.textContent = 'You may only edit your own scores.';
    el.evalFormLabel.textContent = mine ? 'Form BPS-2/A' : 'Form BPS-2/R';
    el.tallyLabel.textContent = 'Your Weighted Score';
    el.submitBtn.textContent = mine ? 'Amend Audit' : 'File Peer Review';

    buildScoreList(mine ? state.draft : null);
    renderEvalLive();
    el.evalPendingWrap.hidden = true;
    setView('evaluate', { focus: true });
  }

  /* --- duplicate specimen guard (Part 6): deliberately simple --- */
  function tokens(s) {
    return AN.normalizeName(s).split(' ').filter(function (t) { return t.length > 2; });
  }
  function similar(a, b) {
    var ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    var shared = ta.filter(function (t) { return tb.indexOf(t) !== -1; }).length;
    return shared / Math.min(ta.length, tb.length);
  }

  function checkDuplicate() {
    if (state.evalMode.type === 'review' || !state.metrics) return;
    var r = el.inputRestaurant.value.trim();
    var b = el.inputBurger.value.trim();
    if (r.length < 3) { el.dupWarning.hidden = true; return; }

    var hit = state.metrics.views.filter(function (v) {
      var rs = similar(v.restaurant, r);
      if (rs < 0.6) return false;
      return b.length < 3 ? true : similar(v.burger, b) >= 0.5;
    })[0];

    if (!hit) { el.dupWarning.hidden = true; return; }
    el.dupText.textContent = 'Specimen ' + hit.specimen + ' — ' + hit.burger + ' at ' + hit.restaurant +
      ' — is already on file' + (hit.certified ? ' and certified.' : ' and awaiting peer review.') +
      ' Filing a new specimen will create a second, separate record.';
    el.dupOpen.onclick = function () {
      if (hit.missing === state.me) startReview(hit.id); else openRecord(hit.id);
    };
    el.dupWarning.hidden = false;
  }

  function validate(focusFirst) {
    var problems = [];
    if (state.evalMode.type === 'new') {
      var rBad = el.inputRestaurant.value.trim() === '';
      var bBad = el.inputBurger.value.trim() === '';
      el.errRestaurant.hidden = !rBad;
      el.errBurger.hidden = !bBad;
      el.inputRestaurant.classList.toggle('is-invalid', rBad);
      el.inputBurger.classList.toggle('is-invalid', bBad);
      if (rBad) problems.push({ el: el.inputRestaurant, msg: 'Establishment name is required.' });
      if (bBad) problems.push({ el: el.inputBurger, msg: 'Specimen name is required.' });
    }

    var complete = S.isCompleteScoreSet(state.draft);
    CATEGORIES.forEach(function (c) {
      var ctrl = el.evalScores.querySelector('.score[data-category="' + c.key + '"]');
      if (ctrl) ctrl.classList.toggle('is-missing', !S.isScored(state.draft[c.key]));
    });
    if (!complete) {
      problems.push({
        el: el.evalScores,
        msg: (K.length - S.countScored(state.draft)) + ' of ' + K.length + ' categories still require a score.'
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
    K.forEach(function (k) { scores[k] = state.draft[k]; });

    var chain = state.evalMode.type === 'review'
      ? Promise.resolve({ id: state.evalMode.burgerId })
      : state.adapter.createBurger({
          restaurant: el.inputRestaurant.value.trim(),
          burger: el.inputBurger.value.trim()
        });

    chain.then(function (burger) {
      if (!isCurrentSession(token)) return null;
      return state.adapter.saveAudit(burger.id, scores).then(function () { return burger.id; });
    }).then(function (burgerId) {
      if (!burgerId || !isCurrentSession(token)) return false;
      state.justAddedId = burgerId;
      return refresh().then(function (loaded) {
        if (!loaded || !isCurrentSession(token)) return false;
        var v = viewById(burgerId);
        startNew();
        if (v && v.certified) {
          toast('Specimen certified. Composite Patty Index ' + S.formatCPI(v.cpi) + '.');
          openRecord(burgerId);
        } else {
          var peer = S.auditorName(S.otherAuditor(state.me));
          toast(S.auditorName(state.me) + ' examination filed. Awaiting ' + peer + ' peer review.');
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

  function bindEvaluate() {
    el.form.addEventListener('submit', handleSubmit);
    [el.inputRestaurant, el.inputBurger].forEach(function (input) {
      input.addEventListener('input', function () {
        checkDuplicate();
        if (state.submitAttempted) validate(false);
      });
    });
    el.reviewCancel.addEventListener('click', function () { startNew(); });
  }

  /* =============================================================
     RECORD
     ============================================================= */
  function figure(label, value, accent) {
    var f = node('div', 'figure' + (accent ? ' figure--wide' : ''));
    f.appendChild(node('p', 'figure__label', label));
    f.appendChild(node('p', 'figure__value', value));
    return f;
  }

  function buildRecordExaminer(auditorKey, burger, view) {
    var scores = S.auditOf(burger, auditorKey);
    var name = S.auditorName(auditorKey);
    var card = node('section', 'exrec');

    var head = node('div', 'exrec__head');
    head.appendChild(node('h3', 'exrec__name', name));
    var w = node('div', 'exrec__weighted');
    w.appendChild(node('span', 'exrec__weightedlabel', 'Weighted'));
    w.appendChild(node('span', 'exrec__weightedvalue', S.formatScore(S.weightedFor(burger, auditorKey))));
    head.appendChild(w);
    card.appendChild(head);

    if (!scores) {
      card.classList.add('exrec--missing');
      card.appendChild(node('p', 'exrec__missing',
        name + ' has not filed an audit for this specimen. No Composite Patty Index can be issued until they do.'));
      if (auditorKey === state.me) {
        var go = node('button', 'btn btn--primary btn--small', 'Complete Peer Review');
        go.type = 'button';
        go.addEventListener('click', function () { startReview(burger.id); });
        card.appendChild(go);
      }
      return card;
    }

    var list = node('dl', 'catlist');
    CATEGORIES.forEach(function (c) {
      var row = node('div', 'catlist__row');
      var dt = node('dt', 'catlist__label', c.label);
      dt.appendChild(node('span', 'catlist__weight', S.SCORING_WEIGHTS[c.key] + '%'));
      row.appendChild(dt);
      var bar = node('span', 'catlist__bar');
      var fill = node('span', 'catlist__fill');
      fill.style.width = ((Number(scores[c.key]) / SCALE.max) * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(node('dd', 'catlist__val', S.formatScore(scores[c.key])));
      list.appendChild(row);
    });
    card.appendChild(list);

    if (scores.updatedAt || scores.createdAt) {
      card.appendChild(node('p', 'exrec__filed', 'Filed ' + formatDate(scores.createdAt || scores.updatedAt)));
    }
    if (auditorKey === state.me) {
      var edit = node('button', 'btn btn--outline btn--small', 'Amend my audit');
      edit.type = 'button';
      edit.addEventListener('click', function () { startReview(burger.id); });
      card.appendChild(edit);
    }
    return card;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'date unrecorded';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderRecord(burger) {
    var view = viewById(burger.id);
    var certified = view.certified;

    el.recordFile.textContent = 'Specimen File ' + burger.specimenNumber;
    el.recordBurger.textContent = burger.burger;
    el.recordRestaurant.textContent = burger.restaurant;

    var creator = burger.createdBy === (state.session && state.session.userId)
      ? S.auditorName(state.me)
      : (view.filedBy ? S.auditorName(view.filedBy) : 'the Bureau');
    el.recordMeta.textContent = 'Filed ' + formatDate(burger.createdAt) + ' · Created by ' + creator;

    el.recordFigures.replaceChildren();
    if (certified) {
      el.recordFigures.appendChild(figure('Official Rank', view.rank != null ? '#' + view.rank : '—'));
      el.recordFigures.appendChild(figure('Composite Patty Index', S.formatCPI(view.cpi), true));
      el.recordFigures.appendChild(figure('Status', 'Certified'));
    } else {
      el.recordFigures.appendChild(figure('Status', 'Pending Peer Review', true));
      el.recordFigures.appendChild(figure('Awaiting', view.missing ? S.auditorName(view.missing) : '—'));
    }

    el.recordCta.replaceChildren();
    if (!certified && view.missing === state.me) {
      var cta = node('button', 'btn btn--primary btn--block', 'Complete Peer Review');
      cta.type = 'button';
      cta.addEventListener('click', function () { startReview(burger.id); });
      el.recordCta.appendChild(cta);
    } else if (!certified) {
      el.recordCta.appendChild(node('p', 'record__await',
        'This specimen has no official Composite Patty Index or rank until ' +
        S.auditorName(view.missing) + ' files an audit.'));
    }

    var frag = document.createDocumentFragment();
    S.AUDITOR_KEYS.forEach(function (k) { frag.appendChild(buildRecordExaminer(k, burger, view)); });
    el.recordExaminers.replaceChildren(frag);

    if (certified) {
      var combined = S.combinedOf(burger);
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
  }

  function openRecord(id) {
    var b = burgerById(id);
    if (!b) { setView('rankings'); return; }
    state.recordId = id;
    renderRecord(b);
    setView('record', { focus: true, hash: 'record/' + id });
  }

  /* =============================================================
     INSIGHTS
     ============================================================= */
  function summaryTile(label, value) {
    var d = node('div', 'stat');
    d.appendChild(node('dt', 'stat__label', label));
    d.appendChild(node('dd', 'stat__value', value));
    return d;
  }

  function renderInsights() {
    var m = state.metrics;

    /* Top summary */
    el.insightsSummary.replaceChildren();
    el.insightsSummary.appendChild(summaryTile('Certified', String(m.counts.certified)));
    el.insightsSummary.appendChild(summaryTile('Pending', String(m.counts.pending)));
    el.insightsSummary.appendChild(summaryTile('Ryan Mean', S.formatScore(m.auditors.ryan.weighted.mean)));
    el.insightsSummary.appendChild(summaryTile('Devin Mean', S.formatScore(m.auditors.devin.weighted.mean)));

    /* Personnel files */
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
        card.appendChild(node('p', 'exrec__missing', a.name + ' has not filed any audits.'));
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
      kv('Most generous category', a.bestCat ? S.categoryLabel(a.bestCat) + ' · ' + S.formatScore(a.bestCatMean) : '—');
      kv('Harshest category', a.worstCat ? S.categoryLabel(a.worstCat) + ' · ' + S.formatScore(a.worstCatMean) : '—');
      kv('Scores of 9.0+', a.count9 + ' (' + S.formatPct(a.pct9) + ')');
      kv('Scores below 5.0', a.countBelow5 + ' (' + S.formatPct(a.pctBelow5) + ')');
      kv('Scale used', a.n ? S.formatScore(a.scores.min) + ' – ' + S.formatScore(a.scores.max) : '—');
      kv('Personal #1', a.top ? a.top.burger : '—');
      card.appendChild(dl);
      el.personnel.appendChild(card);
    });

    renderFindings();

    /* Ranking disputes */
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
          li.appendChild(node('span', 'disputes__name', v.burger));
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

    /* Category differentials */
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
  }

  function renderFindings() {
    var m = state.metrics;
    var found = IN.select(m, { min: 6, max: 12 });
    el.findingsList.replaceChildren();

    if (!found.length) {
      var empty = node('div', 'empty');
      empty.appendChild(node('p', 'empty__stamp', 'No Findings'));
      empty.appendChild(node('h3', 'empty__title', 'The Office has nothing to report.'));
      empty.appendChild(node('p', 'empty__text',
        'No specimen has yet completed peer review. The Bureau requires at least one certified hamburger before it will begin making accusations.'));
      el.findingsList.appendChild(empty);
      el.findingsMeta.textContent = 'Awaiting the first certified specimen.';
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
        if (target === 'evaluate' && state.evalMode.type === 'review') startNew();
        setView(target, { focus: true });
      });
    });
    window.addEventListener('hashchange', function () { routeFromHash(); });
    el.reroll.addEventListener('click', function () { renderFindings(); });
  }

  /* =============================================================
     INIT
     ============================================================= */
  function init() {
    cacheDom();

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
    showAuthMode();
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
  window.BPS.app = { state: state, refresh: refresh, setView: setView };
})();
