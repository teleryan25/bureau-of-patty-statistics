/* Bureau of Patty Statistics — dependency-free Chrome regression suite.
 *
 * Run with: node browser-tests.js
 * Override Chrome detection with BPS_CHROME=/path/to/chrome.
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;

var project = __dirname;
var includeUnitTests = process.env.BPS_BROWSER_UNIT_TESTS === '1';
var candidates = [
  process.env.BPS_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
var chromePath = candidates.filter(function (p) { return fs.existsSync(p); })[0];

if (!chromePath) {
  console.error('Chrome/Chromium not found. Set BPS_CHROME to its executable path.');
  process.exit(1);
}
if (typeof WebSocket !== 'function') {
  console.error('This suite requires a Node release with the built-in WebSocket client.');
  process.exit(1);
}

var mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png'
};

function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

var server = http.createServer(function (req, res) {
  var urlPath = req.url.split('?')[0];
  var rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  var file = path.resolve(project, rel);
  if (file.indexOf(project + path.sep) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    res.end(data);
  });
});

server.listen(0, '127.0.0.1', function () {
  run().catch(function (err) {
    console.error(err.stack || err);
    process.exitCode = 1;
  });
});

async function run() {
  var httpPort = server.address().port;
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bps-e2e-'));
  var chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    'http://127.0.0.1:' + httpPort + '/?adapter=mock' + (includeUnitTests ? '&test=1' : '')
  ], { stdio: 'ignore' });
  var chromeExited = new Promise(function (resolve) { chrome.once('exit', resolve); });

  var checks = [];
  var exceptions = [];
  var consoleErrors = [];
  var ws = null;

  function check(name, condition, detail) {
    checks.push({ name: name, pass: !!condition, detail: detail });
    if (!condition) console.log('  FAIL  ' + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
  }

  try {
    var active = path.join(profile, 'DevToolsActivePort');
    for (var i = 0; i < 120 && !fs.existsSync(active); i++) await delay(50);
    if (!fs.existsSync(active)) throw new Error('Chrome did not expose a debugging port.');

    var debugPort = fs.readFileSync(active, 'utf8').trim().split('\n')[0];
    var pages = await fetch('http://127.0.0.1:' + debugPort + '/json/list').then(function (r) { return r.json(); });
    var page = pages.filter(function (p) { return p.type === 'page'; })[0];
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(function (resolve, reject) { ws.onopen = resolve; ws.onerror = reject; });

    var callId = 0;
    var pending = new Map();
    ws.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        var p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description) ||
          msg.params.exceptionDetails.text);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map(function (a) {
          return a.value == null ? (a.description || '') : a.value;
        }).join(' '));
      }
    };

    function send(method, params) {
      return new Promise(function (resolve, reject) {
        var id = ++callId;
        pending.set(id, { resolve: resolve, reject: reject });
        ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      });
    }

    async function evaluate(expression) {
      var out = await send('Runtime.evaluate', {
        expression: expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true
      });
      if (out.exceptionDetails) {
        throw new Error((out.exceptionDetails.exception && out.exceptionDetails.exception.description) ||
          out.exceptionDetails.text);
      }
      return out.result.value;
    }

    async function waitFor(expression, timeout) {
      var started = Date.now();
      timeout = timeout || 6000;
      while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await delay(40);
      }
      throw new Error('Timed out waiting for: ' + expression);
    }

    async function signIn(name) {
      var email = name.toLowerCase() === 'ryan' ? 'ryanburtonwi@gmail.com' : 'devinreiter907@gmail.com';
      await evaluate("(()=>{document.getElementById('auth-email').value=" + JSON.stringify(email) + ';' +
        "document.getElementById('auth-password').value='bps-demo';" +
        "document.getElementById('auth-login-form').requestSubmit();return true})()");
      await waitFor("BPS.app.state.view==='rankings' && BPS.app.state.me===" + JSON.stringify(name.toLowerCase()));
      await settleCeremonies();
    }

    /* A record proclamation is a fixed overlay the auditor dismisses.
       Tests clear the queue the same way a person would. */
    async function settleCeremonies() {
      for (var i = 0; i < 12; i++) {
        var open = await evaluate("!document.getElementById('records-ceremony').hidden");
        if (!open) return i;
        await evaluate("document.querySelector('.proclaim__dismiss').click()");
        await delay(40);
      }
      return -1;
    }

    /* Six weighted categories plus the two Service sub-scores. */
    async function fillScores(value, firstValue) {
      var hasFirst = firstValue != null;
      return evaluate("(()=>{var xs=[...document.querySelectorAll('#eval-scores input[type=range]'),"
        + "...document.querySelectorAll('#eval-service input[type=range]')];"
        + 'xs.forEach((x,i)=>{x.value=String(i===0&&' + hasFirst + '?' + (hasFirst ? firstValue : value) + ':' + value
        + ");x.dispatchEvent(new Event('input',{bubbles:true}))});"
        + "return {count:xs.length,weighted:document.getElementById('eval-weighted').textContent,"
        + "service:document.getElementById('service-derived').textContent}})()");
    }

    async function selectLocation(name) {
      return evaluate("(()=>{var sel=document.getElementById('f-location');"
        + "var opt=[...sel.options].find(o=>o.textContent===" + JSON.stringify(name) + ');'
        + "if(!opt)return false;sel.value=opt.value;sel.dispatchEvent(new Event('change',{bubbles:true}));"
        + 'return sel.value===opt.value})()');
    }

    async function addLocation(name) {
      await evaluate("(()=>{var sel=document.getElementById('f-location');sel.value='__add__';"
        + "sel.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
      await evaluate("(()=>{document.getElementById('f-newlocation').value=" + JSON.stringify(name) + ';'
        + "document.getElementById('add-location-save').click();return true})()");
      await waitFor("[...document.getElementById('f-location').options].some(o=>o.textContent===" +
        JSON.stringify(name) + ')');
    }

    async function fileAudit(opts) {
      await evaluate("BPS.app.setView('evaluate')");
      if (opts.establishment) {
        await evaluate("(()=>{var e=document.getElementById('f-establishment');e.value="
          + JSON.stringify(opts.establishment) + ";e.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      }
      if (opts.category) {
        await evaluate("(()=>{var c=document.getElementById('f-category');c.value="
          + JSON.stringify(opts.category) + ";c.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
      }
      await evaluate("(()=>{var b=document.getElementById('f-burger');b.value="
        + JSON.stringify(opts.burger) + ";b.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      if (opts.newLocation) await addLocation(opts.location);
      else check('location "' + opts.location + '" is selectable', await selectLocation(opts.location));
      var filled = await fillScores(opts.score, opts.firstValue);
      if (opts.expectControls !== false) {
        check('eight score controls filled for ' + opts.burger, filled.count === 8, filled);
      }
      var before = await evaluate('BPS.app.state.register.establishments.length');
      await evaluate("document.getElementById('evaluate-form').requestSubmit()");
      await waitFor("BPS.app.state.register.establishments.some(e=>(e.audits||[]).some(a=>a.burger===" +
        JSON.stringify(opts.burger) + '))', 8000);
      await settleCeremonies();
      return evaluate("BPS.app.state.register.establishments.find(e=>(e.audits||[]).some(a=>a.burger===" +
        JSON.stringify(opts.burger) + ')).id');
    }

    async function signOut(waitForTimer) {
      await settleCeremonies();
      await evaluate("document.getElementById('signout-btn').click()");
      await waitFor("BPS.app.state.session===null && BPS.app.state.view==='auth'");
      if (waitForTimer) await delay(3100);
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await waitFor('!!window.BPS && !!window.BPS.app');
    check('configured production selection cannot fall back to mock', await evaluate("(()=>{var lib=window.supabase;" +
      "window.supabase=null;var closed=false;try{BPS.data.chooseAdapter({SUPABASE_URL:'https://example.supabase.co'," +
      "SUPABASE_ANON_KEY:'publishable'})}catch(e){closed=true}window.supabase=lib;return closed})()"));
    if (includeUnitTests) {
      await waitFor('!!BPS.testResults');
      var inBrowserTests = await evaluate('BPS.testResults');
      check('headless suite also passes when loaded by ?test=1', inBrowserTests.failed === 0, inBrowserTests);
    }

    var signedOut = await evaluate("({view:BPS.app.state.view,session:BPS.app.state.session," +
      "authVisible:!document.getElementById('view-auth').hidden,overflow:document.documentElement.scrollWidth-window.innerWidth})");
    check('clean signed-out state', signedOut.view === 'auth' && signedOut.session === null && signedOut.authVisible, signedOut);
    check('signed-out 375px has no overflow', signedOut.overflow <= 0, signedOut.overflow);
    var manifestInfo = await send('Page.getAppManifest');
    check('web app manifest parses without critical errors', /manifest\.webmanifest$/.test(manifestInfo.url) &&
      !(manifestInfo.errors || []).some(function (error) { return error.critical; }), manifestInfo.errors);
    var installAssets = await evaluate("(async()=>{var manifest=await fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json());" +
      "var icons=await Promise.all(manifest.icons.map(icon=>new Promise((resolve,reject)=>{var image=new Image();" +
      "image.onload=()=>resolve({src:icon.src,width:image.naturalWidth,height:image.naturalHeight,purpose:icon.purpose});" +
      "image.onerror=reject;image.src=icon.src})));return {manifest:manifest,icons:icons," +
      "appleIcon:document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')," +
      "appleTitle:document.querySelector('meta[name=apple-mobile-web-app-title]').content," +
      "appleCapable:document.querySelector('meta[name=apple-mobile-web-app-capable]').content}})()");
    check('manifest declares the BPS standalone root experience', installAssets.manifest.name === 'Bureau of Patty Statistics' &&
      installAssets.manifest.short_name === 'BPS' && installAssets.manifest.display === 'standalone' &&
      installAssets.manifest.start_url === '/' && installAssets.manifest.scope === '/', installAssets.manifest);
    check('manifest icons load at declared sizes with a maskable asset', installAssets.icons.length === 3 &&
      installAssets.icons.some(function (icon) { return icon.width === 192 && icon.height === 192; }) &&
      installAssets.icons.filter(function (icon) { return icon.width === 512 && icon.height === 512; }).length === 2 &&
      installAssets.icons.some(function (icon) { return icon.purpose === 'maskable'; }), installAssets.icons);
    check('iOS Home Screen metadata uses BPS and the Apple icon', installAssets.appleTitle === 'BPS' &&
      installAssets.appleCapable === 'yes' && installAssets.appleIcon === 'icons/apple-touch-icon.png', installAssets);
    check('auth view uses password login without code entry', await evaluate("!!document.getElementById('auth-password') && " +
      "!document.getElementById('auth-code-form')"));
    await evaluate("(()=>{document.getElementById('auth-email').value='ryanburtonwi@gmail.com';" +
      "document.getElementById('auth-password').value='wrong';" +
      "document.getElementById('auth-login-form').requestSubmit();return true})()");
    await waitFor("!document.getElementById('auth-error').hidden");
    check('invalid password remains signed out with an error', await evaluate("BPS.app.state.session===null && " +
      "/invalid email or password/i.test(document.getElementById('auth-error').textContent)"));

    await signIn('Ryan');
    var current = await evaluate("({view:BPS.app.state.view,me:BPS.app.state.me," +
      "certified:BPS.app.state.metrics.counts.certified,pending:BPS.app.state.metrics.counts.pending," +
      "audits:BPS.app.state.metrics.counts.audits," +
      "rankRows:document.querySelectorAll('#rankings-list .ranking').length})");
    check('Ryan identity comes from authentication', current.me === 'ryan', current);
    check('rankings render one row per certified establishment',
      current.certified === current.rankRows && current.certified > 0, current);
    check('the register holds more audits than ranked establishments',
      current.audits > current.certified, current);

    /* ---- Service is present, weighted and derived ---- */
    var scoringShape = await evaluate("({weights:BPS.scoring.SCORING_WEIGHTS," +
      "total:BPS.scoring.weightsTotal(),categories:BPS.scoring.CATEGORY_KEYS.length," +
      "inputs:BPS.scoring.INPUT_KEYS.length,version:BPS.scoring.SCHEMA_VERSION})");
    check('the browser build carries the v2 weights', scoringShape.total === 100 &&
      scoringShape.weights.service === 10 && scoringShape.weights.patty === 25 &&
      scoringShape.weights.condiments === 5, scoringShape);
    check('the browser build scores seven categories from eight figures',
      scoringShape.categories === 7 && scoringShape.inputs === 8, scoringShape);

    /* ---- Filters ---- */
    await evaluate("BPS.app.setView('rankings')");
    var filterShape = await evaluate("({locations:document.querySelectorAll('#filter-location option').length," +
      "categories:document.querySelectorAll('#filter-category option').length," +
      "firstLocation:document.getElementById('filter-location').options[0].textContent," +
      "firstCategory:document.getElementById('filter-category').options[0].textContent})");
    check('rankings default to all locations and all categories',
      filterShape.firstLocation === 'All Locations' && filterShape.firstCategory === 'All Categories' &&
      filterShape.locations > 1 && filterShape.categories > 1, filterShape);

    var filtered = await evaluate("(()=>{var sel=document.getElementById('filter-location');" +
      "var opt=[...sel.options].find(o=>o.value);sel.value=opt.value;" +
      "sel.dispatchEvent(new Event('change',{bubbles:true}));" +
      "return {name:opt.textContent,filter:BPS.app.state.filter.locationId," +
      "rows:document.querySelectorAll('#rankings-list .ranking').length," +
      "views:BPS.app.state.metrics.views.length," +
      "global:BPS.app.state.globalMetrics.views.length," +
      "note:!document.getElementById('filter-note').hidden}})()");
    check('a location filter narrows the register without renaming establishments',
      filtered.views <= filtered.global && !!filtered.filter && filtered.note, filtered);

    var combined = await evaluate("(()=>{var cat=document.getElementById('filter-category');" +
      "var opt=[...cat.options].find(o=>o.value);cat.value=opt.value;" +
      "cat.dispatchEvent(new Event('change',{bubbles:true}));" +
      "return {location:BPS.app.state.filter.locationId,category:BPS.app.state.filter.category," +
      "views:BPS.app.state.metrics.views.length," +
      "allMatch:BPS.app.state.metrics.views.every(v=>v.category===BPS.app.state.filter.category)}})()");
    check('location and category filters apply together',
      !!combined.location && !!combined.category && combined.allMatch, combined);

    var cleared = await evaluate("(()=>{document.getElementById('filter-clear').click();" +
      "return {location:BPS.app.state.filter.locationId,category:BPS.app.state.filter.category," +
      "rows:document.querySelectorAll('#rankings-list .ranking').length}})()");
    check('clearing the filters restores the whole register',
      cleared.location === null && cleared.category === null &&
      cleared.rows === current.rankRows, cleared);

    /* ---- Pending queues, including recertification ---- */
    await evaluate("BPS.app.setView('pending')");
    current = await evaluate("({mine:document.querySelectorAll('#pending-mine .ranking').length," +
      "theirs:document.querySelectorAll('#pending-theirs .ranking').length," +
      "recert:document.querySelectorAll('#pending-recert .ranking').length," +
      "legacy:BPS.app.state.globalMetrics.counts.legacyAudits})");
    check('pending queues separate self, peer and recertification',
      current.mine + current.theirs >= 1 && current.recert === current.legacy && current.recert >= 1, current);

    /* ---- File a brand-new establishment ---- */
    var stamp = Date.now();
    var ryanEstablishment = 'Regression Counter ' + stamp;
    var ryanBurger = 'Regression Burger Ryan ' + stamp;
    var establishmentId = await fileAudit({
      establishment: ryanEstablishment, category: 'fast-casual',
      burger: ryanBurger, location: 'Uptown', score: 8.1
    });
    current = await evaluate("(()=>{var v=BPS.app.state.globalMetrics.views.find(v=>v.id===" +
      JSON.stringify(establishmentId) + ');return {status:v.status,cpi:v.cpi,rank:v.rank,missing:v.missing,' +
      'visits:v.visits,category:v.category,locations:v.locations}})()');
    check('a one-sided establishment is pending without CPI or rank',
      current.status === 'pending' && current.cpi === null && current.rank === null &&
      current.missing === 'devin' && current.visits === 1, current);
    check('the establishment carries its class and branch',
      current.category === 'fast-casual' && current.locations[0] === 'Uptown', current);

    /* ---- A custom location becomes permanent shared data ---- */
    var customLocation = 'Mankato ' + stamp;
    var ryanSecondBurger = 'Regression Second ' + stamp;
    await fileAudit({
      establishment: ryanEstablishment, burger: ryanSecondBurger,
      location: customLocation, newLocation: true, score: 8.4
    });
    var afterRevisit = await evaluate("(()=>{var v=BPS.app.state.globalMetrics.views.find(v=>v.id===" +
      JSON.stringify(establishmentId) + ');return {visits:v.visits,locations:v.locations,burgers:v.burgers,' +
      'establishments:BPS.app.state.register.establishments.length,' +
      'ryan:v.auditCounts.ryan}})()');
    check('a second audit joins the same establishment rather than creating a new one',
      afterRevisit.visits === 2 && afterRevisit.ryan === 2 &&
      afterRevisit.locations.length === 2 && afterRevisit.burgers.length === 2, afterRevisit);

    await signOut(true);
    check('sign-out clears protected state',
      await evaluate('BPS.app.state.metrics===null && BPS.app.state.register.establishments.length===0'));
    check('sign-out delayed callback causes no exception', exceptions.length === 0, exceptions);

    await signIn('Devin');
    var sharedLocation = await evaluate("[...document.querySelectorAll('#f-location option')]" +
      '.some(o=>o.textContent===' + JSON.stringify(customLocation) + ')');
    check('a location added by one auditor is offered to the other', sharedLocation);

    await evaluate("BPS.app.setView('pending')");
    check('the new establishment awaits Devin',
      await evaluate("[...document.querySelectorAll('#pending-mine .ranking')]" +
        '.some(x=>x.dataset.id===' + JSON.stringify(establishmentId) + ')'));

    /* Devin certifies it from a different branch, on a different burger. */
    var devinBurger = 'Regression Burger Devin ' + stamp;
    await evaluate("(()=>{var row=[...document.querySelectorAll('#pending-mine .ranking')].find(x=>x.dataset.id===" +
      JSON.stringify(establishmentId) + ");row.querySelector('.ranking__action button').click();return true})()");
    await waitFor("BPS.app.state.view==='evaluate' && BPS.app.state.evalMode.establishmentId===" +
      JSON.stringify(establishmentId));
    var lockedIdentity = await evaluate("({readonly:document.getElementById('f-establishment').readOnly," +
      "value:document.getElementById('f-establishment').value})");
    check('completing a certification reuses the establishment identity',
      lockedIdentity.readonly && lockedIdentity.value === ryanEstablishment, lockedIdentity);
    await evaluate("(()=>{var b=document.getElementById('f-burger');b.value=" + JSON.stringify(devinBurger) +
      ";b.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
    await selectLocation('Edina');
    await fillScores(7.9);
    current = await evaluate("({hint:document.getElementById('tally-hint').textContent," +
      "service:document.getElementById('service-derived').textContent})");
    check('a completing audit projects the composite index',
      /Projected Composite Patty Index/.test(current.hint) && current.service === '7.9', current);
    await evaluate("document.getElementById('evaluate-form').requestSubmit()");
    await waitFor("BPS.app.state.view==='record' && BPS.app.state.globalMetrics.views.find(v=>v.id===" +
      JSON.stringify(establishmentId) + ').certified', 8000);
    await settleCeremonies();
    await evaluate('BPS.app.openRecord(' + JSON.stringify(establishmentId) + ')');

    var certified = await evaluate("(()=>{var v=BPS.app.state.globalMetrics.views.find(v=>v.id===" +
      JSON.stringify(establishmentId) + ");var cards=[...document.querySelectorAll('#record-examiners .exrec')];" +
      "return {cpi:v.cpi,rank:v.rank,status:v.status,sameBurger:v.sameBurger,locations:v.locations.length," +
      "visits:v.visits,examiners:cards.map(x=>x.querySelector('.exrec__name').textContent)," +
      "history:document.querySelectorAll('#record-history .auditrow').length," +
      "ryanEdit:[...document.querySelectorAll('#record-history .auditrow')].filter(" +
      "x=>x.querySelector('.auditrow__who').textContent==='Ryan'&&x.querySelector('button')).length," +
      "devinEdit:[...document.querySelectorAll('#record-history .auditrow')].filter(" +
      "x=>x.querySelector('.auditrow__who').textContent==='Devin'&&x.querySelector('button')).length}})()");
    check('different branches and different burgers still certify',
      certified.status === 'certified' && certified.cpi !== null && certified.rank > 0 &&
      certified.sameBurger === false && certified.locations === 3, certified);
    check('the establishment file lists every filing',
      certified.history === certified.visits && certified.visits === 3, certified);
    check('the file shows both examiner aggregates',
      certified.examiners.indexOf('Ryan') !== -1 && certified.examiners.indexOf('Devin') !== -1,
      certified.examiners);
    check('Devin may amend only Devin audits in the normal UI',
      certified.ryanEdit === 0 && certified.devinEdit === 1, certified);

    /* Amending an own audit recalculates the composite. */
    await evaluate("(()=>{var row=[...document.querySelectorAll('#record-history .auditrow')].find(" +
      "x=>x.querySelector('.auditrow__who').textContent==='Devin');row.querySelector('button').click();return true})()");
    await waitFor("BPS.app.state.evalMode.type==='amend'");
    await fillScores(7.9, 6.0);
    await evaluate("document.getElementById('evaluate-form').requestSubmit()");
    await waitFor("BPS.app.state.view==='record'", 8000);
    await settleCeremonies();
    var amended = await evaluate('BPS.app.state.globalMetrics.views.find(v=>v.id===' +
      JSON.stringify(establishmentId) + ').cpi');
    check('amending an own audit recalculates the composite', amended !== certified.cpi,
      { before: certified.cpi, after: amended });

    /* The same burger is equally valid. */
    var sharedBurger = 'Shared Specimen ' + stamp;
    var sharedEstablishment = 'Matched Counter ' + stamp;
    var sharedId = await fileAudit({
      establishment: sharedEstablishment, category: 'bar-pub',
      burger: sharedBurger, location: 'Richfield', score: 8.6
    });
    await signOut(false);
    await signIn('Ryan');
    await evaluate("BPS.app.startForEstablishment(" + JSON.stringify(sharedId) + ')');
    await waitFor("BPS.app.state.view==='evaluate'");
    var burgerHints = await evaluate("[...document.querySelectorAll('#burger-options option')].map(o=>o.value)");
    check('known burgers at an establishment are offered again',
      burgerHints.indexOf(sharedBurger) !== -1, burgerHints);
    await evaluate("(()=>{var b=document.getElementById('f-burger');b.value=" + JSON.stringify(sharedBurger) +
      ";b.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
    await selectLocation('Richfield');
    await fillScores(8.2);
    await evaluate("document.getElementById('evaluate-form').requestSubmit()");
    await waitFor("BPS.app.state.globalMetrics.views.find(v=>v.id===" + JSON.stringify(sharedId) + ').certified', 8000);
    await settleCeremonies();
    var matched = await evaluate("(()=>{var v=BPS.app.state.globalMetrics.views.find(v=>v.id===" +
      JSON.stringify(sharedId) + ');return {sameBurger:v.sameBurger,burgers:v.burgers.length,cpi:v.cpi}})()');
    check('both auditors may order the same burger',
      matched.sameBurger === true && matched.burgers === 1 && matched.cpi !== null, matched);

    /* ---- Establishment metadata is shared and correctable ---- */
    await evaluate('BPS.app.openRecord(' + JSON.stringify(sharedId) + ')');
    var correctedName = sharedEstablishment + ' (Corrected)';
    await evaluate("(()=>{document.getElementById('edit-name').value=" + JSON.stringify(correctedName) + ';' +
      "document.getElementById('edit-category').value='diner-cafe';" +
      "document.getElementById('edit-save').click();return true})()");
    await waitFor("BPS.app.state.register.establishments.some(e=>e.name===" + JSON.stringify(correctedName) + ')', 8000);
    await settleCeremonies();
    var renamed = await evaluate("(()=>{var e=BPS.app.state.register.establishments.find(e=>e.id===" +
      JSON.stringify(sharedId) + ');return {name:e.name,category:e.category,audits:(e.audits||[]).length,' +
      'total:BPS.app.state.register.establishments.length}})()');
    check('either auditor may correct the establishment name and class',
      renamed.name === correctedName && renamed.category === 'diner-cafe' && renamed.audits === 2, renamed);

    /* A rename onto an existing name offers a merge rather than corrupting state. */
    await evaluate('BPS.app.openRecord(' + JSON.stringify(sharedId) + ')');
    await evaluate("(()=>{document.getElementById('edit-name').value=" + JSON.stringify(ryanEstablishment) + ';' +
      "document.getElementById('edit-save').click();return true})()");
    await waitFor("!document.getElementById('merge-warning').hidden", 8000);
    check('a colliding rename offers a merge instead of duplicating the record',
      await evaluate("/already on file/.test(document.getElementById('merge-text').textContent) && " +
        "BPS.app.state.register.establishments.length===" + renamed.total));

    /* ---- Records Office ---- */
    await evaluate("BPS.app.setView('records')");
    var office = await evaluate("(()=>{var text=document.getElementById('view-records').textContent;" +
      "var held=BPS.app.state.records.map(r=>r.recordId);" +
      "var titles=BPS.records.DEFINITIONS.filter(d=>held.indexOf(d.id)===-1).map(d=>d.title);" +
      "return {cards:document.querySelectorAll('#records-list .recentry').length,held:held.length," +
      "definitions:BPS.records.DEFINITIONS.length," +
      "leaked:titles.filter(t=>text.indexOf(t)!==-1)," +
      "ids:held.filter(id=>new RegExp('(^|[^A-Za-z0-9])'+id+'([^A-Za-z0-9]|$)').test(text))," +
      "counter:/\\b(\\d+\\s*\\/\\s*200|of 200|200 records|locked|undiscovered)\\b/i.test(text)," +
      "empty:!document.getElementById('records-empty').hidden}})()");
    check('the Records Office holds exactly 200 definitions internally',
      office.definitions === 200, office.definitions);
    check('the Records Office shows only records that have been set',
      office.cards === Math.min(office.held, 25) && office.held > 0 && !office.empty, office);

    var revealed = await evaluate("(()=>{var more=document.getElementById('records-more');" +
      "if(more.hidden)return {done:true,cards:document.querySelectorAll('#records-list .recentry').length};" +
      "var before=document.querySelectorAll('#records-list .recentry').length;more.click();" +
      "return {done:false,before:before,cards:document.querySelectorAll('#records-list .recentry').length," +
      "label:more.textContent}})()");
    check('the Records Office reveals further entries on request',
      revealed.done || revealed.cards > revealed.before, revealed);
    check('the Records Office leaks no undiscovered record', office.leaked.length === 0, office.leaked);
    check('the Records Office publishes no catalogue size or lock count',
      office.counter === false, office);
    check('the Records Office exposes no internal record identifiers',
      office.ids.length === 0, office.ids);

    var sorted = await evaluate("(()=>{var sel=document.getElementById('records-sort');" +
      "sel.value='oldest';sel.dispatchEvent(new Event('change',{bubbles:true}));" +
      "var first=document.querySelector('#records-list .recentry .recentry__title').textContent;" +
      "sel.value='recent';sel.dispatchEvent(new Event('change',{bubbles:true}));" +
      "return {oldest:first,recent:document.querySelector('#records-list .recentry .recentry__title').textContent," +
      "cards:document.querySelectorAll('#records-list .recentry').length}})()");
    check('the Records Office reorders without losing entries',
      sorted.cards === office.cards, sorted);

    var soundToggle = await evaluate("(()=>{var b=document.getElementById('records-sound');" +
      "var before=b.textContent;b.click();var mid=b.textContent;b.click();" +
      "return {before:before,mid:mid,after:b.textContent}})()");
    check('the ceremonial sound can be silenced and restored',
      /on$/.test(soundToggle.before) && /off$/.test(soundToggle.mid) && /on$/.test(soundToggle.after),
      soundToggle);

    /* A record that changes hands must proclaim once, then stay quiet. */
    var breakerBurger = 'Record Breaker ' + stamp;
    var breakerEstablishment = 'Apex Counter ' + stamp;
    await evaluate("BPS.app.setView('evaluate')");
    var breakerId = await fileAudit({
      establishment: breakerEstablishment, category: 'fine-dining',
      burger: breakerBurger, location: 'North Loop', score: 10, expectControls: false
    });
    await signOut(false);
    await signIn('Devin');
    await evaluate("BPS.app.startForEstablishment(" + JSON.stringify(breakerId) + ')');
    await waitFor("BPS.app.state.view==='evaluate'");
    await evaluate("(()=>{var b=document.getElementById('f-burger');b.value=" + JSON.stringify(breakerBurger) +
      ";b.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
    await selectLocation('North Loop');
    await fillScores(10);
    await evaluate("document.getElementById('evaluate-form').requestSubmit()");
    await waitFor("BPS.app.state.globalMetrics.views.find(v=>v.id===" + JSON.stringify(breakerId) + ').certified', 8000);
    await waitFor("!document.getElementById('records-ceremony').hidden", 8000);

    var ceremonyShape = await evaluate("(()=>{var host=document.getElementById('records-ceremony');" +
      "var card=host.querySelector('.proclaim');var dismiss=host.querySelector('.proclaim__dismiss');" +
      "return {code:host.querySelector('.proclaim__code').textContent," +
      "title:host.querySelector('.proclaim__title').textContent," +
      "figure:host.querySelector('.proclaim__figurevalue').textContent," +
      "facts:[...host.querySelectorAll('.proclaim__factkey')].map(x=>x.textContent)," +
      "seal:!!host.querySelector('.proclaim__seal')," +
      "broken:card.classList.contains('proclaim--broken')," +
      "button:dismiss.getBoundingClientRect().height," +
      "overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth," +
      "hostRight:host.getBoundingClientRect().right-window.innerWidth}})()");
    check('a record proclamation is a formal Bureau document',
      /RECORDS OFFICE/.test(ceremonyShape.code) && ceremonyShape.title.length > 3 &&
      ceremonyShape.seal && ceremonyShape.figure !== '', ceremonyShape);
    check('a proclamation names when the entry was established',
      ceremonyShape.facts.indexOf('Established') !== -1, ceremonyShape.facts);
    check('a proclamation offers a touch-sized dismissal',
      ceremonyShape.button >= 43.5, ceremonyShape.button);
    check('a proclamation fits the 375px viewport',
      ceremonyShape.overflow <= 1 && ceremonyShape.hostRight <= 1, ceremonyShape);

    var brokenSeen = await evaluate("(()=>{var seen=false;var n=0;" +
      "while(!document.getElementById('records-ceremony').hidden && n<12){" +
      "if(document.querySelector('.proclaim--broken'))seen=true;" +
      "document.querySelector('.proclaim__dismiss').click();n++}" +
      "return {seen:seen,dismissed:document.getElementById('records-ceremony').hidden,rounds:n}})()");
    check('a superseded record is presented as a broken record',
      brokenSeen.seen && brokenSeen.dismissed, brokenSeen);

    await evaluate('BPS.app.refresh()');
    await delay(300);
    check('an acknowledged proclamation does not replay on the next refresh',
      await evaluate("document.getElementById('records-ceremony').hidden"));
    await evaluate("BPS.app.setView('records')");
    check('the Records Office keeps the record after it changes hands',
      await evaluate("BPS.app.state.records.some(r=>(r.version||1)>1) && " +
        "document.getElementById('view-records').textContent.indexOf('Record Broken')!==-1"));

    /* The other auditor is entitled to the same proclamation. */
    await signOut(false);
    await signIn('Ryan');
    var peerRecords = await evaluate("({records:BPS.app.state.records.length," +
      "acks:Object.keys(BPS.app.state.recordAcks).length})");
    check('both auditors see the same shared record history',
      peerRecords.records > 0 && peerRecords.acks === peerRecords.records, peerRecords);
    check('one auditor acknowledging does not erase the record for the other',
      await evaluate("BPS.app.state.records.some(r=>(r.version||1)>1)"));

    /* ---- Findings ---- */
    await evaluate("BPS.app.setView('insights')");
    var insightFirst = await evaluate("({count:document.querySelectorAll('#findings-list .finding').length," +
      "text:document.getElementById('findings-list').textContent," +
      "eligible:BPS.insights.eligibleRules(BPS.app.state.globalMetrics).length," +
      "ryanN:BPS.app.state.globalMetrics.auditors.ryan.n,devinN:BPS.app.state.globalMetrics.auditors.devin.n," +
      "personalRyan:BPS.app.state.globalMetrics.paired.ryanOrder.length," +
      "personalDevin:BPS.app.state.globalMetrics.paired.devinOrder.length," +
      "personnel:document.getElementById('personnel-files').textContent})");
    check('findings render 6-12 entries', insightFirst.count >= 6 && insightFirst.count <= 12,
      { count: insightFirst.count, eligible: insightFirst.eligible });
    check('personal auditor analytics and orderings are populated',
      insightFirst.ryanN > 0 && insightFirst.devinN > 0 && insightFirst.personalRyan > 0 &&
      insightFirst.personalDevin > 0, insightFirst);
    check('personnel files report the v2 dimensions',
      /Locations visited/.test(insightFirst.personnel) && /Service mean/.test(insightFirst.personnel) &&
      /Establishments audited/.test(insightFirst.personnel), insightFirst.personnel.slice(0, 200));
    await evaluate("document.getElementById('reroll-btn').click()");
    var insightSecond = await evaluate("document.getElementById('findings-list').textContent");
    check('revisiting rotates the displayed findings', insightSecond !== insightFirst.text);
    check('rendered findings contain no invalid numeric text', !/(NaN|undefined|Infinity)/.test(insightSecond));
    check('findings no longer require an identical specimen',
      !/must eat the same (burger|hamburger)/i.test(insightSecond + insightFirst.text));

    /* ---- Location registry: correct in place, archive rather than delete ---- */
    var registry = await evaluate("(()=>{var rows=[...document.querySelectorAll('#locations-list .locrow')];" +
      "return {rows:rows.length,visible:!document.getElementById('locations-wrap').hidden," +
      "names:rows.map(r=>r.querySelector('.locrow__name').textContent)}})()");
    check('the location registry lists the locations in use',
      registry.visible && registry.rows > 0 &&
      registry.names.indexOf(customLocation) !== -1, registry);

    var correctedLocation = customLocation + ' MN';
    await evaluate("(()=>{var row=[...document.querySelectorAll('#locations-list .locrow')].find(" +
      "r=>r.querySelector('.locrow__name').textContent===" + JSON.stringify(customLocation) + ');' +
      "row.querySelector('.locrow__actions button').click();" +
      "var input=row.querySelector('.locrow__edit input');input.value=" + JSON.stringify(correctedLocation) + ';' +
      "row.querySelector('.locrow__edit button').click();return true})()");
    await waitFor("BPS.app.state.register.locations.some(l=>l.name===" +
      JSON.stringify(correctedLocation) + ')', 8000);
    var corrected = await evaluate("(()=>{var loc=BPS.app.state.register.locations.find(l=>l.name===" +
      JSON.stringify(correctedLocation) + ');' +
      'var used=BPS.app.state.globalMetrics.auditViews.filter(a=>a.locationId===loc.id);' +
      'return {audits:used.length,names:used.map(a=>a.locationName),' +
      'total:BPS.app.state.register.locations.length}})()');
    check('correcting a location name preserves every audit that used it',
      corrected.audits >= 1 && corrected.names.every(function (n) { return n === correctedLocation; }),
      corrected);

    await evaluate("BPS.app.setView('insights')");
    await evaluate("(()=>{var row=[...document.querySelectorAll('#locations-list .locrow')].find(" +
      "r=>r.querySelector('.locrow__name').textContent===" + JSON.stringify(correctedLocation) + ');' +
      "[...row.querySelectorAll('.locrow__actions button')][1].click();return true})()");
    await waitFor("BPS.app.state.register.locations.some(l=>l.name===" +
      JSON.stringify(correctedLocation) + ' && l.archived)', 8000);
    var archived = await evaluate("(()=>{var loc=BPS.app.state.register.locations.find(l=>l.name===" +
      JSON.stringify(correctedLocation) + ');BPS.app.setView(\'evaluate\');' +
      "return {onFile:!!loc,archived:loc.archived," +
      'audits:BPS.app.state.globalMetrics.auditViews.filter(a=>a.locationId===loc.id).length,' +
      "offered:[...document.querySelectorAll('#f-location option')].some(o=>o.textContent===" +
      JSON.stringify(correctedLocation) + ')}})()');
    check('an archived location is withheld from future filings but never deleted',
      archived.onFile && archived.archived && archived.audits >= 1 && archived.offered === false, archived);
    check('an archived location leaves its establishment certified',
      await evaluate("BPS.app.state.globalMetrics.views.find(v=>v.id===" + JSON.stringify(establishmentId) +
        ').certified'));

    /* The commendation sting must never be attempted without a gesture. */
    var soundSafety = await evaluate("(()=>{var was=BPS.recordsOffice.audioState.unlocked;" +
      "BPS.recordsOffice.audioState.unlocked=false;" +
      "var blocked=BPS.recordsOffice.playSting();" +
      "BPS.recordsOffice.audioState.unlocked=was;" +
      "return {blocked:blocked,enabled:BPS.recordsOffice.soundEnabled()}})()");
    check('the ceremonial sound is withheld until the browser allows audio',
      soundSafety.blocked === false, soundSafety);

    var theaterResults = await evaluate("(()=>{var data={n:20,pending:6,audits:40,exactSpecimens:2,maxWeightedGap:6.2," +
      "rankCorrelation:-.9,exactPct:96,sameNumberOne:true,sameLast:true,oldestPendingDays:95,pendingRyan:6,pendingDevin:0," +
      "auditImbalance:10,cpiRange:2,cpiSd:.5,repeatCount:6,repeatRange:48,repeatName:'Fixture Establishment'," +
      "categoryGap:3,categoryKey:'fries',perfects:3,catastrophes:1,exactCells:0,disagreement:1.4,dominanceRun:12," +
      "dominanceKey:'ryan',stableN:12,stableSd:.03,stableKey:'devin',reversals:8,negativeCats:6,universalWeak:'value'," +
      "universalWeakMargin:2,topOccupation:5,topOccupationName:'Fixture Establishment',wholeRyan:100,wholeDevin:100," +
      "cpiCluster:7,cpiClusterValue:82.5,specimen:'Fixture',restaurant:'Fixture Establishment'};" +
      "return BPS.disasters.IDS.map(id=>{BPS.app.setView('insights');var def=BPS.disasters.DEFINITIONS.find(x=>x.id===id);" +
      "var event={id:id,phase:1,stages:def.stages,priority:def.priority,fingerprint:id+'-browser',data:data};" +
      "BPS.app.disasterDirector.show(event,{focus:false});var stage=document.querySelector('.bps-event');" +
      "var dismiss=stage&&stage.querySelector('.bps-event__dismiss');var before={id:stage&&stage.dataset.eventId," +
      "visual:stage&&stage.children[1]&&stage.children[1].className,button:dismiss&&dismiss.getBoundingClientRect().height," +
      "overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth," +
      "stageOverflow:stage&&stage.scrollWidth-stage.clientWidth,stageRight:stage&&stage.getBoundingClientRect().right-window.innerWidth," +
      "submitEnabled:!document.getElementById('submit-btn').disabled,sliders:document.querySelectorAll('#eval-scores input[type=range]').length," +
      "navAbove:parseInt(getComputedStyle(document.getElementById('masthead')).zIndex,10)>parseInt(getComputedStyle(stage.parentElement).zIndex,10)||" +
      "getComputedStyle(stage.parentElement).position!=='fixed'};document.getElementById('tab-evaluate').click();" +
      "before.bypass=BPS.app.state.view==='evaluate'&&document.getElementById('bureau-event-stage').hidden&&!document.getElementById('view-evaluate').hidden;" +
      "BPS.app.setView('insights');BPS.app.disasterDirector.show(event,{focus:false});document.querySelector('.bps-event__dismiss').click();" +
      "before.dismissed=document.getElementById('bureau-event-stage').hidden;return before})})()");
    check('all twenty event presentations render distinct structures', theaterResults.length === 20 &&
      new Set(theaterResults.map(function (x) { return x.visual; })).size === 20 &&
      theaterResults.every(function (x, i) { return x.id === 'd' + String(i + 1).padStart(2, '0'); }), theaterResults);
    check('every event supplies a touch-sized dismissal', theaterResults.every(function (x) { return x.button >= 43.5; }), theaterResults);
    check('every event dismissal clears its presentation', theaterResults.every(function (x) { return x.dismissed; }), theaterResults);
    check('every event can be bypassed directly into evaluation', theaterResults.every(function (x) { return x.bypass && x.navAbove; }), theaterResults);
    check('event presentation never disables evaluation controls', theaterResults.every(function (x) {
      return x.submitEnabled && x.sliders === 6;
    }), theaterResults);
    check('all event presentations fit the 375px mobile viewport', theaterResults.every(function (x) { return x.overflow <= 1; }), theaterResults);
    check('event stages contain their own mobile content', theaterResults.every(function (x) {
      return x.stageOverflow <= 1 && x.stageRight <= 1;
    }), theaterResults);

    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    var reducedResults = await evaluate("(()=>{var data={n:20,pending:6,audits:40,maxWeightedGap:6.2,rankCorrelation:-.9," +
      "oldestPendingDays:95,auditImbalance:10,cpiRange:2,repeatRange:48,categoryGap:3,perfects:3,catastrophes:1," +
      "dominanceRun:12,stableSd:.03,reversals:8,negativeCats:6,universalWeak:'value',topOccupation:5,wholeRyan:100," +
      "wholeDevin:100,cpiCluster:7,cpiClusterValue:82.5};return BPS.disasters.IDS.map(id=>{var def=BPS.disasters.DEFINITIONS.find(x=>x.id===id);" +
      "BPS.app.disasterDirector.show({id:id,phase:1,stages:def.stages,priority:def.priority,fingerprint:id+'-motion',data:data},{focus:false});" +
      "var animated=[...document.querySelectorAll('#bureau-event-stage *')].filter(x=>getComputedStyle(x).animationName!=='none');" +
      "var durations=animated.flatMap(x=>getComputedStyle(x).animationDuration.split(',').map(v=>v.endsWith('ms')?parseFloat(v):parseFloat(v)*1000));" +
      "return {id:id,max:durations.length?Math.max(...durations):0}})})()");
    check('reduced-motion collapses animation duration for all twenty presentations',
      reducedResults.every(function (x) { return x.max <= 0.02; }), reducedResults);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await evaluate("BPS.app.disasterDirector.clear()");

    await evaluate("BPS.app.setView('pending')");
    var pendingDetail = await evaluate("(()=>{var row=document.querySelector('#pending-theirs .ranking__btn')||" +
      "document.querySelector('#pending-mine .ranking__btn');if(!row)return null;row.click();" +
      "return {view:BPS.app.state.view,labels:[...document.querySelectorAll('#record-figures .figure__label')]" +
      ".map(x=>x.textContent),values:[...document.querySelectorAll('#record-figures .figure__value')].map(x=>x.textContent)}})()");
    check('a pending establishment file has no official CPI or rank',
      pendingDetail && pendingDetail.view === 'record' &&
      pendingDetail.values.indexOf('Pending Peer Review') !== -1 &&
      pendingDetail.labels.indexOf('Composite Patty Index') === -1 &&
      pendingDetail.labels.indexOf('Official Rank') === -1, pendingDetail);

    await evaluate("BPS.app.setView('rankings')");
    await evaluate("document.querySelector('#rankings-list .ranking__btn').click()");
    var certifiedDetail = await evaluate("(()=>{var labels=[...document.querySelectorAll(" +
      "'#record-figures .figure__label')].map(x=>x.textContent);" +
      "return {labels:labels,history:document.querySelectorAll('#record-history .auditrow').length," +
      "particulars:!!document.getElementById('edit-name').value," +
      "service:/Service/.test(document.getElementById('record-findings').textContent)}})()");
    check('a certified establishment file shows CPI, rank, history and Service',
      certifiedDetail.labels.indexOf('Composite Patty Index') !== -1 &&
      certifiedDetail.labels.indexOf('Official Rank') !== -1 &&
      certifiedDetail.history >= 2 && certifiedDetail.particulars && certifiedDetail.service,
      certifiedDetail);

    var widthResults = [];
    var dimensions = [[375, 812], [430, 900], [768, 1024], [1280, 900]];
    for (var di = 0; di < dimensions.length; di++) {
      var width = dimensions[di][0], height = dimensions[di][1];
      await send('Emulation.setDeviceMetricsOverride', {
        width: width, height: height, deviceScaleFactor: 1, mobile: width < 768
      });
      var viewNames = ['rankings', 'pending', 'evaluate', 'record', 'records', 'insights'];
      for (var vi = 0; vi < viewNames.length; vi++) {
        var view = viewNames[vi];
        await evaluate('BPS.app.setView(' + JSON.stringify(view) + ')');
        await delay(60);
        var layout = await evaluate("(()=>{var visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';" +
          "var smallInputs=[...document.querySelectorAll('input')].filter(visible).map(e=>parseFloat(getComputedStyle(e).fontSize))" +
          ".filter(n=>n<16);var smallButtons=[...document.querySelectorAll('button')].filter(visible).map(e=>({text:e.textContent.trim().slice(0,30)," +
          "h:e.getBoundingClientRect().height})).filter(x=>x.h<43.5);return {inner:window.innerWidth,doc:document.documentElement.scrollWidth," +
          'body:document.body.scrollWidth,smallInputs:smallInputs,smallButtons:smallButtons}})()');
        widthResults.push({ width: width, view: view, layout: layout });
      }
    }
    var overflow = widthResults.filter(function (x) {
      return Math.max(x.layout.doc, x.layout.body) > x.layout.inner + 1;
    });
    var smallInputs = widthResults.filter(function (x) { return x.layout.smallInputs.length; });
    var smallButtons = widthResults.filter(function (x) { return x.layout.smallButtons.length; });
    check('all major views have no overflow at 375/430/768/1280', overflow.length === 0, overflow);
    check('visible inputs remain at least 16px', smallInputs.length === 0, smallInputs);
    check('visible touch buttons remain at least 44px', smallButtons.length === 0, smallButtons);

    /* Page-level overflow is not the only way a phone layout breaks: text
       clipped inside its own box passes an overflow check and still reads
       as broken. `.bps-stack` is an intentionally rotated decorative prop
       in one event presentation, and `.visually-hidden` is deliberately
       clipped to 1px for assistive technology; both are excluded by name. */
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
    var clipped = [];
    var clipViews = ['rankings', 'pending', 'evaluate', 'record', 'records', 'insights'];
    for (var ci = 0; ci < clipViews.length; ci++) {
      await evaluate('BPS.app.setView(' + JSON.stringify(clipViews[ci]) + ')');
      await delay(80);
      var found = await evaluate("(()=>{var bad=[];" +
        "document.querySelectorAll('#view-' + " + JSON.stringify(clipViews[ci]) + " + ' *').forEach(function(e){" +
        "if(!e.getClientRects().length)return;" +
        "if(/bps-stack|bps-event|visually-hidden/.test(e.className||''))return;" +
        "var cs=getComputedStyle(e);" +
        "if(cs.overflowX==='auto'||cs.overflowX==='scroll'||cs.overflow==='auto')return;" +
        "if(e.scrollWidth>e.clientWidth+1)bad.push({v:" + JSON.stringify(clipViews[ci]) + "," +
        "cls:String(e.className||e.tagName),text:(e.textContent||'').trim().slice(0,40)})});" +
        'return bad.slice(0,6)})()');
      clipped = clipped.concat(found);
    }
    check('no view clips its own text at 375px', clipped.length === 0, clipped);

    await signOut(true);
    check('final sign-out returns clean auth view', await evaluate("BPS.app.state.view==='auth' && " +
      "!document.getElementById('view-auth').hidden && document.getElementById('masthead').hidden"));
    var authLayouts = [];
    for (var ai = 0; ai < dimensions.length; ai++) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: dimensions[ai][0], height: dimensions[ai][1], deviceScaleFactor: 1,
        mobile: dimensions[ai][0] < 768
      });
      authLayouts.push(await evaluate("(()=>{var input=document.getElementById('auth-email'),password=document.getElementById('auth-password'),button=document.getElementById('auth-login-btn');" +
        "return {width:window.innerWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)," +
        "font:Math.min(parseFloat(getComputedStyle(input).fontSize),parseFloat(getComputedStyle(password).fontSize)),buttonHeight:button.getBoundingClientRect().height}})()"));
    }
    check('signed-out auth view passes layout checks at every width', authLayouts.every(function (x) {
      return x.scroll <= x.width + 1 && x.font >= 16 && x.buttonHeight >= 43.5;
    }), authLayouts);
    check('no uncaught browser exceptions', exceptions.length === 0, exceptions);
    check('no console errors', consoleErrors.length === 0, consoleErrors);

    var failed = checks.filter(function (x) { return !x.pass; });
    console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' browser checks passed');
    console.log('Widths: 375, 430, 768, 1280');
    console.log('Uncaught exceptions: ' + exceptions.length + '; console errors: ' + consoleErrors.length);
    if (failed.length) process.exitCode = 1;
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGTERM');
    await Promise.race([chromeExited, delay(2000)]);
    await new Promise(function (resolve) { server.close(resolve); });
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch (err) { console.warn('Could not remove temporary Chrome profile:', profile); }
  }
}
