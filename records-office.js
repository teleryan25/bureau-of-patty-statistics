/* =============================================================
   Bureau of Patty Statistics — records-office.js

   Presentation for the Records Office: the ceremonial proclamation
   shown when Bureau history is made, and the short commendation sting
   that accompanies it.

   No statistics live in this file. It is handed rows that records.js
   has already decided are new, and it shows them one at a time.

   SOUND POLICY
     * synthesised on the fly — no audio files, nothing recognisable
     * ~1.1 seconds, then silence
     * only ever plays as the direct consequence of a newly discovered
       or broken record during normal use
     * never before the browser has granted an audio gesture
     * silenced entirely by the auditor's own preference
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.recordsOffice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var S = isNode ? require('./scoring.js')  : root.BPS.scoring;
  var RC = isNode ? require('./records.js') : root.BPS.records;

  var SOUND_KEY = 'bps.records.sound.v1';

  /* ---------- tiny DOM helpers ---------- */
  function n(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function div(className, text) { return n('div', className, text); }
  function p(className, text) { return n('p', className, text); }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  /* =============================================================
     THE COMMENDATION STING
     ============================================================= */
  var audio = {
    ctx: null,
    unlocked: false,
    listening: false
  };

  function soundEnabled(storage) {
    try {
      var raw = (storage || root.localStorage).getItem(SOUND_KEY);
      return raw !== 'off';
    } catch (e) { return true; }
  }

  function setSoundEnabled(on, storage) {
    try { (storage || root.localStorage).setItem(SOUND_KEY, on ? 'on' : 'off'); }
    catch (e) { /* the preference simply does not persist */ }
    return !!on;
  }

  /* Browsers only allow audio once the user has interacted with the
     page. One passive listener flips the flag; until then the ceremony
     is shown silently rather than failing noisily. */
  function armAudio() {
    if (audio.listening || typeof document === 'undefined') return;
    audio.listening = true;
    var unlock = function () { audio.unlocked = true; };
    ['pointerdown', 'keydown', 'touchend'].forEach(function (evt) {
      document.addEventListener(evt, unlock, { passive: true });
    });
  }

  function context() {
    if (audio.ctx) return audio.ctx;
    var Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) return null;
    try { audio.ctx = new Ctor(); } catch (e) { audio.ctx = null; }
    return audio.ctx;
  }

  /**
   * A short official commendation: a soft seal-press, then a dignified
   * rising fifth-and-octave on a muted brass-ish tone.
   * Total length ~1.1s. No loop, no second voice, no percussion beyond
   * the single low thump.
   */
  function playSting(options) {
    options = options || {};
    if (!options.force) {
      if (!audio.unlocked) return false;
      if (!soundEnabled(options.storage)) return false;
    }
    var ctx = context();
    if (!ctx) return false;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { return false; } }

    var t0 = ctx.currentTime + 0.01;
    var master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
    /* A gentle low-pass keeps it institutional rather than arcade. */
    var tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    tone.Q.value = 0.6;
    tone.connect(master);
    master.connect(ctx.destination);

    /* The seal press. */
    var thump = ctx.createOscillator();
    var thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, t0);
    thump.frequency.exponentialRampToValueAtTime(58, t0 + 0.18);
    thumpGain.gain.setValueAtTime(0.9, t0);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    thump.connect(thumpGain); thumpGain.connect(tone);
    thump.start(t0); thump.stop(t0 + 0.3);

    /* The proclamation: C5 → G5 → C6, each briefly overlapping. */
    var notes = [
      { f: 523.25, at: 0.10, len: 0.30, gain: 0.55 },
      { f: 783.99, at: 0.26, len: 0.30, gain: 0.55 },
      { f: 1046.50, at: 0.42, len: 0.62, gain: 0.62 }
    ];
    notes.forEach(function (note) {
      ['triangle', 'sine'].forEach(function (type, i) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = note.f * (i ? 2 : 1);
        var start = t0 + note.at;
        var peak = note.gain * (i ? 0.16 : 1);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + note.len);
        osc.connect(g); g.connect(tone);
        osc.start(start); osc.stop(start + note.len + 0.05);
      });
    });
    return true;
  }

  /* =============================================================
     THE PROCLAMATION
     ============================================================= */
  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'date unrecorded';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function daysBetween(a, b) {
    var t1 = Date.parse(a), t2 = Date.parse(b);
    if (!isFinite(t1) || !isFinite(t2)) return null;
    return Math.max(0, Math.round(Math.abs(t2 - t1) / 86400000));
  }

  function buildProclamation(row) {
    var def = RC.definition(row.recordId);
    /* `previous` is populated only when this entry displaced another, so
       it is the reliable signal whether the row came straight from
       detection or was read back from the shared store. */
    var broke = !!row.previous;
    var stage = n('section', 'proclaim' + (broke ? ' proclaim--broken' : ''));
    stage.dataset.recordId = row.recordId;

    var head = n('header', 'proclaim__head');
    add(head,
      p('proclaim__code', 'BPS / RECORDS OFFICE · ' + (broke ? 'RECORD SUPERSEDED' : 'RECORD ESTABLISHED')),
      n('h2', 'proclaim__title', def ? def.title : 'Bureau Record'),
      p('proclaim__lead', broke
        ? 'A standing entry in the Bureau register has been surpassed. The Records Office has amended the official history accordingly.'
        : 'The Records Office certifies that a figure has been entered into the permanent statistical history of the Bureau.'));
    add(stage, head);

    var seal = div('proclaim__seal');
    seal.setAttribute('aria-hidden', 'true');
    add(seal, n('span', 'proclaim__sealmark', '★'));
    add(stage, seal);

    var body = div('proclaim__body');
    var figure = div('proclaim__figure');
    add(figure,
      p('proclaim__figurelabel', 'Entered figure'),
      p('proclaim__figurevalue', RC.formatValue(row)));
    add(body, figure);

    var dl = n('dl', 'proclaim__facts');
    function fact(label, value) {
      if (value == null || value === '') return;
      var rowEl = div('proclaim__fact');
      add(rowEl, n('dt', 'proclaim__factkey', label), n('dd', 'proclaim__factval', String(value)));
      add(dl, rowEl);
    }
    fact('Holder', RC.subjectOf(row));
    if (row.holder) fact('Auditor', S.auditorName(row.holder));
    if (row.establishmentName && RC.subjectOf(row) !== row.establishmentName) {
      fact('Establishment', row.establishmentName);
    }
    if (row.detail && row.detail.location) fact('Location', row.detail.location);
    if (row.detail && row.detail.burger) fact('Specimen examined', row.detail.burger);
    fact('Established', formatDate(row.establishedAt));
    if (broke) {
      var prev = row.previous;
      var prevValue = prev.value == null
        ? (prev.valueText || '—')
        : RC.formatValue({ recordId: row.recordId, value: prev.value, valueText: prev.valueText });
      fact('Previous figure', prevValue);
      var prevHolder = prev.establishmentName || (prev.holder ? S.auditorName(prev.holder) : prev.valueText);
      fact('Previous holder', prevHolder);
      var stood = daysBetween(prev.establishedAt, row.establishedAt);
      if (stood != null) fact('Stood for', stood === 1 ? '1 day' : stood + ' days');
    }
    add(body, dl);
    add(stage, body);

    add(stage, p('proclaim__aside', broke
      ? 'The superseded entry is retained in the Records Office archive. Nothing is ever struck from the history of the Bureau.'
      : 'This entry will stand until a filing displaces it. The Bureau wishes to be clear that it is not congratulating anyone.'));

    return stage;
  }

  /* =============================================================
     DIRECTOR
     Queues newly discovered records and presents them one at a time.
     Acknowledgement is delegated upward so it can be persisted per
     auditor — one auditor dismissing never mutes the other.
     ============================================================= */
  function createCeremony(options) {
    options = options || {};
    var host = options.host;
    var storage = options.storage;
    var onAcknowledge = options.onAcknowledge || function () {};
    var queue = [];
    var active = null;
    var escapeHandler = null;

    armAudio();

    function clear() {
      active = null;
      if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
      if (host) { host.replaceChildren(); host.hidden = true; }
      if (typeof document !== 'undefined') document.body.classList.remove('bps-proclaiming');
    }

    function advance() {
      var done = active;
      clear();
      if (done) onAcknowledge(done);
      if (queue.length) show(queue.shift());
    }

    function show(row, showOptions) {
      showOptions = showOptions || {};
      if (!host || !row) { clear(); return false; }
      clear();
      active = row;

      var shell = div('proclaim-shell');
      shell.setAttribute('role', 'alertdialog');
      shell.setAttribute('aria-modal', 'false');
      shell.setAttribute('aria-label', RC.titleOf(row.recordId));

      var built = buildProclamation(row);
      var actions = div('proclaim__actions');
      var dismiss = n('button', 'proclaim__dismiss', queue.length
        ? 'Enter into the record (' + (queue.length + 1) + ')'
        : 'Enter into the record');
      dismiss.type = 'button';
      dismiss.addEventListener('click', advance);
      add(actions, dismiss);
      add(built, actions);
      add(shell, built);
      host.appendChild(shell);
      host.hidden = false;
      document.body.classList.add('bps-proclaiming');

      escapeHandler = function (e) { if (e.key === 'Escape') advance(); };
      document.addEventListener('keydown', escapeHandler);

      if (showOptions.sound !== false) playSting({ storage: storage });
      if (showOptions.focus !== false) {
        setTimeout(function () { if (active === row) dismiss.focus({ preventScroll: true }); }, 30);
      }
      return true;
    }

    /** Hand the director rows the caller has confirmed are unseen. */
    function present(rows, showOptions) {
      var list = (rows || []).slice();
      if (!list.length) return null;
      queue = list.slice(1);
      show(list[0], showOptions);
      return list[0];
    }

    return {
      present: present,
      show: show,
      advance: advance,
      clear: clear,
      pending: function () { return queue.length; },
      getActive: function () { return active; }
    };
  }

  return {
    createCeremony: createCeremony,
    buildProclamation: buildProclamation,
    playSting: playSting,
    armAudio: armAudio,
    soundEnabled: soundEnabled,
    setSoundEnabled: setSoundEnabled,
    formatDate: formatDate,
    daysBetween: daysBetween,
    SOUND_KEY: SOUND_KEY,
    audioState: audio
  };
});
