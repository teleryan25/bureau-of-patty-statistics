/* Bureau event presentation. No data calculations live in this file. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.BPS = root.BPS || {};
  root.BPS.disasterTheater = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var STORE_KEY = 'bps.events.ack.v1';
  var PERSISTENT = ['d05', 'd06', 'd08', 'd13', 'd17'];

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

  function safe(value, fallback) {
    return value == null || value === '' ? fallback : String(value);
  }

  function num(value, places) {
    var v = Number(value);
    return isFinite(v) ? v.toFixed(places == null ? 1 : places) : '—';
  }

  function loadSeen(storage) {
    try { return JSON.parse((storage || root.localStorage).getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveSeen(seen, storage) {
    try { (storage || root.localStorage).setItem(STORE_KEY, JSON.stringify(seen)); }
    catch (e) { /* The performance remains dismissible for this visit. */ }
  }

  function seenKey(event) { return event.id + ':p' + event.phase; }

  var COPY = {
    d01: ['BPS Office of Measurement Integrity', 'Independent examination has ceased to be independently independent.', 'Acknowledge duplication'],
    d02: ['Inter-Auditor Structural Failure', 'The distance between two official opinions has exceeded the width of the form designed to contain them.', 'Cross the fault line'],
    d03: ['The Rankings Have Entered Opposition', 'The two personal registers are proceeding in mutually exclusive directions. Official order has become a diplomatic fiction.', 'Recognize both governments'],
    d04: ['Compulsory Harmony Proceedings', 'Agreement has reached a level the Bureau considers statistically affectionate and therefore procedurally suspect.', 'Separate the auditors'],
    d05: ['Unattended Filing Accumulation', 'An examination has remained between desks long enough to acquire administrative rights.', 'Step around the paperwork'],
    d06: ['Office of Labor Imbalance', 'One side of the Bureau has become an archival wing. The other has become furniture.', 'Continue without staffing'],
    d07: ['Composite Patty Index Flatline', 'The register is producing different hamburgers with the numerical range of a single cautious shrug.', 'Restore dimensionality'],
    d08: ['Establishment Containment Order', 'One address has generated enough contradictory evidence to require its own federal perimeter.', 'Exit the perimeter'],
    d09: ['Category-Level Institutional Collapse', 'One scoring department has fallen materially below the others and is no longer answering internal mail.', 'Observe from a distance'],
    d10: ['Ceremony of Absolute Certification', 'The scale has reached its legal ceiling. Additional excellence has nowhere to be entered and is pooling in the hallway.', 'Conclude the ceremony'],
    d11: ['Bureau Day of Mourning', 'A certified specimen has passed beneath the floor of ordinary disappointment. Flags are being lowered over Condiment Analysis.', 'Sign the condolence book'],
    d12: ['Collective Bargaining Has Failed', 'The auditors completed the register without once occupying the same tenth of the same category.', 'Leave the mediation room'],
    d13: ['Emergency Continuity of Judgment', 'A sustained run of unilateral generosity has triggered constitutional questions about who currently constitutes the Bureau.', 'Decline the appointment'],
    d14: ['Examiner Calibration Incident', 'An auditor has produced a sequence with less variation than the instrument used to record it.', 'Release the technician'],
    d15: ['Register Seismic Activity', 'Recent certification has reversed direction so violently that the historical series is requesting a handrail.', 'Stabilize the desk'],
    d16: ['Category Polarity Event', 'The examiners are not merely disagreeing. They are using several categories to measure opposite physical universes.', 'Reorient north'],
    d17: ['Departmental Quarantine', 'Every recent specimen has identified the same scoring category as its weakest organ. The door has been sealed from outside.', 'Use the other corridor'],
    d18: ['Market Concentration Tribunal', 'A single establishment has occupied the summit of the public register. Counsel for the remaining restaurants has arrived.', 'Adjourn the tribunal'],
    d19: ['The Tenths Have Disappeared', 'Decimal precision has departed both desks simultaneously. The Bureau is searching the building one digit at a time.', 'Proceed approximately'],
    d20: ['Duplicate Index Multiplication', 'Multiple specimens now share an indistinguishable official number. The register has begun photocopying outcomes without authorization.', 'Stop the copier']
  };

  function header(event) {
    var copy = COPY[event.id];
    var h = n('header', 'bps-event__head');
    add(h,
      p('bps-event__code', 'BPS / INTERNAL EVENT ' + event.id.slice(1) + (event.stages > 1 ? ' · CONDITION ' + event.phase : '')),
      n('h2', 'bps-event__title', copy[0]),
      p('bps-event__lead', copy[1])
    );
    return h;
  }

  function dismissButton(event, dismiss) {
    var b = n('button', 'bps-event__dismiss', COPY[event.id][2]);
    b.type = 'button';
    b.addEventListener('click', dismiss);
    return b;
  }

  function meter(label, value, max) {
    var wrap = div('bps-meter');
    var head = div('bps-meter__head');
    add(head, n('span', null, label), n('strong', null, num(value, 1)));
    var track = div('bps-meter__track');
    var fill = div('bps-meter__fill');
    fill.style.width = Math.max(2, Math.min(100, (Number(value) / max) * 100)) + '%';
    add(track, fill);
    return add(wrap, head, track);
  }

  function template(event) {
    var d = event.data || {};
    var stage = n('section', 'bps-event bps-event--' + event.id);
    stage.dataset.eventId = event.id;
    stage.dataset.phase = String(event.phase);

    switch (event.id) {
      case 'd01': {
        var mirror = div('bps-mirror');
        ['RYAN', 'DEVIN'].forEach(function (name) {
          add(mirror, add(div('bps-mirror__file'), p('bps-mirror__name', name),
            p('bps-mirror__score', '═ ═ ═ ═ ═ ═'), p('bps-mirror__note', 'SIGNATURE VERIFIED')));
        });
        add(stage, header(event), mirror, p('bps-event__aside', 'Coincidence has been impounded pending proof of separate consciousness.'));
        break;
      }
      case 'd02': {
        var fault = div('bps-fault');
        add(fault, add(div('bps-fault__side bps-fault__side--a'), p(null, 'OFFICIAL OPINION A'), n('strong', null, '←')),
          div('bps-fault__crack', '⚡'), add(div('bps-fault__side bps-fault__side--b'), p(null, 'OFFICIAL OPINION B'), n('strong', null, '→')));
        add(stage, header(event), fault, meter('Recorded separation', d.maxWeightedGap, 10));
        break;
      }
      case 'd03': {
        var opposition = div('bps-opposition');
        add(opposition, p('bps-opposition__arrow', '1  2  3  4  5'), p('bps-opposition__cross', '╲  ╳  ╱'),
          p('bps-opposition__arrow', '5  4  3  2  1'));
        add(stage, header(event), opposition, p('bps-event__aside', 'Rank correlation: ' + num(d.rankCorrelation, 2) + '. Diplomatic recognition withdrawn.'));
        break;
      }
      case 'd04': {
        var choir = div('bps-choir');
        add(choir, p('bps-choir__staff', '♪  ───  ♪  ───  ♪'), n('strong', null, num(d.exactPct, 0) + '% IN UNISON'),
          p('bps-choir__staff', '♪  ───  ♪  ───  ♪'));
        add(stage, header(event), choir);
        break;
      }
      case 'd05': {
        var stack = div('bps-stack');
        for (var i = 0; i < Math.min(7, Math.max(3, d.pending)); i++) {
          stack.appendChild(p('bps-stack__sheet', i === 0 ? Math.floor(d.oldestPendingDays) + ' DAYS' : 'RETAIN COPY ' + (i + 1)));
        }
        add(stage, header(event), stack, p('bps-event__aside', 'Paper age is now being measured in geological layers.'));
        break;
      }
      case 'd06': {
        var office = div('bps-office');
        add(office,
          add(div('bps-office__desk'), p(null, 'DESK A'), p('bps-office__worker', '●'), p(null, 'ACTIVE')),
          div('bps-office__hall', '→ → →'),
          add(div('bps-office__desk bps-office__desk--vacant'), p(null, 'DESK B'), p('bps-office__worker', '○'), p(null, 'SEE BUILDING SERVICES'))
        );
        add(stage, header(event), office, p('bps-event__aside', String(d.auditImbalance) + ' filings separate the two departments.'));
        break;
      }
      case 'd07': {
        var flat = div('bps-flatline');
        add(flat, p('bps-flatline__scale', '100'), div('bps-flatline__trace'), p('bps-flatline__scale', '0'));
        add(stage, header(event), flat, p('bps-event__aside', 'Total index range: ' + num(d.cpiRange, 1) + ' points. Please check whether the register is plugged in.'));
        break;
      }
      case 'd08': {
        var zone = div('bps-zone');
        add(zone, p('bps-zone__tape', 'DO NOT CROSS · STATISTICAL PERIMETER · DO NOT CROSS'),
          n('strong', 'bps-zone__name', safe(d.repeatName, 'ESTABLISHMENT WITHHELD')),
          meter('Internal index range', d.repeatRange, 60),
          p('bps-zone__tape', 'EVIDENCE ENTERS · CONSENSUS DOES NOT LEAVE'));
        add(stage, header(event), zone);
        break;
      }
      case 'd09': {
        var dept = div('bps-dept');
        add(dept, p('bps-dept__roof', 'OFFICE OF ' + safe(d.categoryKey, 'CATEGORY').toUpperCase()),
          p('bps-dept__collapse', '▰ ▰  ▰   ▱'), p('bps-dept__status', 'STRUCTURAL DEFICIT ' + num(d.categoryGap, 1)));
        add(stage, header(event), dept);
        break;
      }
      case 'd10': {
        var medal = div('bps-medal');
        add(medal, p('bps-medal__rays', '✦  ✦  ✦'), p('bps-medal__seal', '100'), p('bps-medal__ribbon', 'ABSOLUTE · FINAL · NON-APPEALABLE'));
        add(stage, header(event), medal, p('bps-event__aside', event.phase > 1 ? 'The honors committee has exhausted its supply of ceilings.' : 'All standing personnel are required to look impressed.'));
        break;
      }
      case 'd11': {
        var memorial = div('bps-memorial');
        add(memorial, p('bps-memorial__flag', '▰'), p('bps-memorial__number', '≤ 12.0'), p('bps-memorial__line', 'IN NUMERICAL MEMORY'),
          p('bps-memorial__dates', 'CERTIFIED — REGRETTED'));
        add(stage, header(event), memorial);
        break;
      }
      case 'd12': {
        var table = div('bps-table');
        add(table, add(div('bps-table__seat'), p(null, 'AUDITOR A'), p(null, '← ')),
          add(div('bps-table__minutes'), p(null, 'MEDIATION MINUTES'), p('bps-table__zero', '0'), p(null, 'shared cells')),
          add(div('bps-table__seat'), p(null, 'AUDITOR B'), p(null, ' →')));
        add(stage, header(event), table);
        break;
      }
      case 'd13': {
        var podium = div('bps-podium');
        add(podium, p('bps-podium__banner', 'CONTINUITY PROTOCOL'), p('bps-podium__seal', 'BPS'),
          p('bps-podium__name', safe(d.dominanceKey, 'acting').toUpperCase() + ' · ACTING AUTHORITY'),
          p('bps-podium__term', String(d.dominanceRun) + ' consecutive certifications'));
        add(stage, header(event), podium);
        break;
      }
      case 'd14': {
        var calibration = div('bps-calibration');
        for (var j = 0; j < 12; j++) calibration.appendChild(n('span', null, j % 3 === 0 ? '•' : '—'));
        add(stage, header(event), calibration, p('bps-event__aside', safe(d.stableKey, 'examiner').toUpperCase() +
          ' variance channel: ' + num(d.stableSd, 3) + '. Human resources has requested a CAPTCHA.'));
        break;
      }
      case 'd15': {
        var seismo = div('bps-seismo');
        add(seismo, p('bps-seismo__paper', '─╲╱──╲╱╲╱──╲╱╲╱─'), p('bps-seismo__count', String(d.reversals) + ' MAJOR REVERSALS'));
        add(stage, header(event), seismo);
        break;
      }
      case 'd16': {
        var compass = div('bps-compass');
        add(compass, p('bps-compass__n', 'A'), p('bps-compass__dial', '↙  ⊕  ↗'), p('bps-compass__s', 'B'),
          p('bps-compass__readout', String(d.negativeCats) + ' REVERSED AXES'));
        add(stage, header(event), compass);
        break;
      }
      case 'd17': {
        var quarantine = div('bps-quarantine');
        add(quarantine, p('bps-quarantine__tape', 'SEALED · SEALED · SEALED'), p('bps-quarantine__door', '▥'),
          p('bps-quarantine__label', safe(d.universalWeak, 'CATEGORY').toUpperCase()), p('bps-quarantine__tape', 'NO INTERNAL CORRESPONDENCE'));
        add(stage, header(event), quarantine);
        break;
      }
      case 'd18': {
        var tribunal = div('bps-tribunal');
        add(tribunal, p('bps-tribunal__docket', 'DOCKET 1–3'), n('strong', null, safe(d.topOccupationName, 'NAME WITHHELD')),
          p('bps-tribunal__bars', '███  ░  ░  ░'), p('bps-tribunal__note', 'TOP-RANK OCCUPANCY UNDER REVIEW'));
        add(stage, header(event), tribunal);
        break;
      }
      case 'd19': {
        var missing = div('bps-missing');
        add(missing, p('bps-missing__before', '8'), p('bps-missing__decimal', '·'), p('bps-missing__after', '0'),
          p('bps-missing__poster', 'MISSING · LAST SEEN BETWEEN TWO INTEGERS'));
        add(stage, header(event), missing);
        break;
      }
      case 'd20': {
        var copier = div('bps-copier');
        for (var k = 0; k < Math.min(7, d.cpiCluster); k++) {
          copier.appendChild(add(div('bps-copier__page'), p(null, 'FORM CPI'), n('strong', null, num(d.cpiClusterValue, 1))));
        }
        add(stage, header(event), copier, p('bps-event__aside', String(d.cpiCluster) + ' indistinguishable official outcomes are now on file.'));
        break;
      }
    }
    return stage;
  }

  function createDirector(options) {
    options = options || {};
    var host = options.host;
    var storage = options.storage;
    var active = null;
    var escapeHandler = null;

    function clear() {
      active = null;
      if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
      if (host) { host.replaceChildren(); host.hidden = true; }
      document.body.className = document.body.className.replace(/\bbps-crisis(?:--d\d\d)?\b/g, '').replace(/\s+/g, ' ').trim();
    }

    function acknowledge(event) {
      var seen = loadSeen(storage);
      seen[seenKey(event)] = true;
      saveSeen(seen, storage);
      clear();
    }

    function show(event, showOptions) {
      showOptions = showOptions || {};
      if (!host || !event || !COPY[event.id]) { clear(); return false; }
      clear();
      active = event;
      var shell = div('bps-event-shell bps-event-shell--' + event.id);
      shell.setAttribute('role', 'alertdialog');
      shell.setAttribute('aria-modal', 'false');
      shell.setAttribute('aria-label', COPY[event.id][0]);
      var built = template(event);
      var dismiss = dismissButton(event, function () { acknowledge(event); });
      add(built, dismiss);
      add(shell, built);
      host.appendChild(shell);
      host.hidden = false;
      document.body.classList.add('bps-crisis', 'bps-crisis--' + event.id);
      escapeHandler = function (e) { if (e.key === 'Escape') acknowledge(event); };
      document.addEventListener('keydown', escapeHandler);
      if (showOptions.focus !== false) setTimeout(function () { if (active === event) dismiss.focus({ preventScroll: true }); }, 30);
      return true;
    }

    function continuing(event) {
      clear();
      if (!host) return;
      var strip = div('bps-continuing');
      add(strip, p('bps-continuing__code', 'BPS EVENT ' + event.id.slice(1) + ' REMAINS IN EFFECT'));
      var reopen = n('button', 'bps-continuing__open', 'Review institutional condition');
      reopen.type = 'button';
      reopen.addEventListener('click', function () { show(event); });
      add(strip, reopen);
      host.appendChild(strip);
      host.hidden = false;
    }

    function render(events, viewName) {
      if (viewName !== 'insights' || !events || !events.length) { clear(); return null; }
      var seen = loadSeen(storage);
      var event = events.filter(function (item) { return !seen[seenKey(item)]; })[0];
      if (event) { show(event); return event; }
      event = events.filter(function (item) { return PERSISTENT.indexOf(item.id) !== -1; })[0];
      if (event) continuing(event); else clear();
      return event || null;
    }

    return {
      render: render,
      show: show,
      clear: clear,
      acknowledge: acknowledge,
      getActive: function () { return active; }
    };
  }

  return { createDirector: createDirector, copyCount: Object.keys(COPY).length };
});
