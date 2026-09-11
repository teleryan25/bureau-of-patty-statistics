/* Bureau of Patty Statistics — public website Chrome suite.
 *
 * Run with: node public-browser-tests.js
 * Set BPS_SCREENSHOTS=/some/dir to also save full-page screenshots.
 *
 * A local server stands in for Cloudflare Pages exactly as deployed:
 *   /                      the public site (as on pattybureau.com)
 *   /app/*                 the auditor app, via functions/app/[[path]].js
 *   /api/public/register   the real Pages Function, reading a fake
 *                          PostgREST built from the mock register
 * Expected rankings are computed in Node from the FULL register with the
 * auditor app's own analytics path, then compared with what the page shows.
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var T = require('./taxonomy.js');
var S = require('./scoring.js');
var AN = require('./analytics.js');
var D = require('./data.js');
var PR = require('./public-register.js');
var X = require('./public-test-support.js');

var project = __dirname;
var shots = process.env.BPS_SCREENSHOTS || null;
var chromePath = [
  process.env.BPS_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean).filter(function (p) { return fs.existsSync(p); })[0];
if (!chromePath) { console.error('Chrome/Chromium not found. Set BPS_CHROME.'); process.exit(1); }

var mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
             '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
             '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* A richer register than the demo seed: a third examiner joins Culver's, a
   departed examiner's filing sits on the record, and a second Minneapolis
   establishment gives the area filter something to do. */
async function buildRegister() {
  var mock = D.createMockAdapter();
  mock._profiles.pat = { id: 'uuid-pat', auditorKey: 'pat', displayName: 'Pat', email: 'pat@private.example', active: false, role: 'auditor', status: 'deactivated' };
  function sc(n, fries) { return { patty: n, overallFlavor: n, bun: n, fries: fries == null ? n : fries, value: n, condiments: n, serviceSpeed: n, serviceFriendliness: n }; }
  mock._seed('Culver’s', 'fast-food', [
    { auditor: 'chris', burger: 'ButterBurger Cheese', location: 'Eden Prairie', at: '2026-08-01T17:00:00Z', scores: sc(8.9, 9.4) },
    { auditor: 'pat', burger: 'ButterBurger', location: 'Eden Prairie', at: '2026-08-02T17:00:00Z', scores: sc(5.0) }
  ]);
  mock._seed('Lowry Hill Lunch Counter', 'diner-cafe', [
    { auditor: 'ryan', burger: 'Counter Double', location: 'Uptown', at: '2026-08-20T17:00:00Z', scores: sc(8.6, 7.9) },
    { auditor: 'devin', burger: 'Counter Double', location: 'Whittier', at: '2026-08-22T17:00:00Z', scores: sc(8.8, 8.1) }
  ], { createdAt: '2026-08-20T17:00:00Z' });
  return mock.listRegister();
}

async function main() {
  var full = await buildRegister();
  var rows = X.rowsFromRegister(full, { records: ['r1', 'r2', 'r3', 'r4'] });
  var pg = await X.createFakePostgrest(rows);
  var endpoint = (await X.loadHandler('functions/api/public/register.js')).onRequest;
  var appRoute = (await X.loadHandler('functions/app/[[path]].js')).onRequest;
  var serverMode = { down: false };

  function serveFile(rel, res) {
    var file = path.resolve(project, rel);
    if (file.indexOf(project + path.sep) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, function (err, data) {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  }
  async function pipe(response, res) {
    var headers = {};
    response.headers.forEach(function (v, k) { headers[k] = v; });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  var server = http.createServer(function (req, res) {
    var pathname = decodeURIComponent(req.url.split('?')[0]);
    var origin = 'http://' + req.headers.host;
    if (pathname === '/' || pathname === '/public-site') { serveFile('public-site.html', res); return; }
    if (pathname === '/api/public/register') {
      var env = serverMode.down ? {} : { SUPABASE_URL: pg.url, SUPABASE_SERVICE_ROLE_KEY: 'browser-test-service-key' };
      endpoint({ request: new Request(origin + req.url, { method: req.method }), env: env, waitUntil: function () {} })
        .then(function (r) { return pipe(r, res); });
      return;
    }
    if (pathname === '/app' || pathname.indexOf('/app/') === 0) {
      appRoute({ request: new Request(origin + req.url), env: { ASSETS: { fetch: function (asset) {
        var p = new URL(asset.url).pathname;
        return Promise.resolve({ path: p === '/' ? 'index.html' : p.slice(1) });
      } } } }).then(function (a) { serveFile(a.path, res); });
      return;
    }
    serveFile(pathname.slice(1), res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;

  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bps-public-'));
  var chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  var chromeExited = new Promise(function (r) { chrome.once('exit', r); });

  var checks = [], exceptions = [], consoleErrors = [], ws = null;
  function check(name, cond, detail) {
    checks.push({ name: name, pass: !!cond });
    if (!cond) console.log('  FAIL  ' + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail).slice(0, 700)));
  }

  try {
    var active = path.join(profile, 'DevToolsActivePort');
    for (var i = 0; i < 120 && !fs.existsSync(active); i++) await delay(50);
    var port = fs.readFileSync(active, 'utf8').trim().split('\n')[0];
    var pages = await fetch('http://127.0.0.1:' + port + '/json/list').then(function (r) { return r.json(); });
    ws = new WebSocket(pages.filter(function (p) { return p.type === 'page'; })[0].webSocketDebuggerUrl);
    await new Promise(function (resolve, reject) { ws.onopen = resolve; ws.onerror = reject; });

    var callId = 0, pending = new Map();
    ws.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        var p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description) || msg.params.exceptionDetails.text);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map(function (a) { return a.value == null ? (a.description || '') : a.value; }).join(' '));
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/favicon/.test(msg.params.entry.url || '')) {
        consoleErrors.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
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
      var out = await send('Runtime.evaluate', { expression: expression, returnByValue: true, awaitPromise: true, userGesture: true });
      if (out.exceptionDetails) throw new Error((out.exceptionDetails.exception && out.exceptionDetails.exception.description) || out.exceptionDetails.text);
      return out.result.value;
    }
    async function waitFor(expression, timeout) {
      var started = Date.now();
      while (Date.now() - started < (timeout || 8000)) {
        try { if (await evaluate(expression)) return true; } catch (err) { /* navigating */ }
        await delay(40);
      }
      throw new Error('Timed out waiting for: ' + expression);
    }
    /* Always via about:blank: a URL differing only by #hash would otherwise
       be a same-document navigation, and deep links must load fresh. */
    async function navigate(href) {
      await send('Page.navigate', { url: 'about:blank' });
      await waitFor("location.href === 'about:blank'");
      await send('Page.navigate', { url: href });
      await waitFor("location.href !== 'about:blank' && document.readyState === 'complete'");
    }
    async function ready() {
      await waitFor('window.BPS && BPS.site && BPS.site.state.register && document.querySelectorAll("#rank-body tr").length >= 0 && document.documentElement.classList.contains("is-ready")');
    }
    /* Enter must carry its character, or Chrome never activates the button. */
    async function key(name, code, keyCode) {
      var down = { type: 'keyDown', key: name, code: code, windowsVirtualKeyCode: keyCode };
      if (name === 'Enter') down.text = '\r';
      await send('Input.dispatchKeyEvent', down);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: code, windowsVirtualKeyCode: keyCode });
    }
    async function viewport(w, hgt) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 768 });
    }
    async function shoot(name) {
      if (!shots) return;
      fs.mkdirSync(shots, { recursive: true });
      await evaluate("document.querySelectorAll('[data-reveal]').forEach(function(n){n.classList.add('is-in')});document.fonts.ready.then(function(){return true})");
      await delay(900);
      /* A modal lives in the top layer at a fixed position: capture it as the viewer sees it. */
      if (await evaluate("document.getElementById('file').open")) {
        var view = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(view.data, 'base64'));
        return;
      }
      var dims = await evaluate('({w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight})');
      /* Segments rather than one very tall image, so each stays legible. */
      var step = 1500;
      for (var y = 0, n = 0; y < Math.min(dims.h, 24000); y += step, n++) {
        var shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
          clip: { x: 0, y: y, width: dims.w, height: Math.min(step, dims.h - y), scale: 1 } });
        fs.writeFileSync(path.join(shots, name + '-' + String(n).padStart(2, '0') + '.png'), Buffer.from(shot.data, 'base64'));
      }
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await viewport(1280, 900);

    /* ---------- expectations from the app's own path ---------- */
    function expected(filter) {
      var opts = {};
      if (filter.location) opts.locationId = full.locations.filter(function (l) { return PR.slugOf(l.nameKey) === filter.location; })[0].id;
      if (filter.area) opts.locationIds = full.locations.filter(function (l) { return l.group === filter.area; }).map(function (l) { return l.id; });
      if (filter.category) opts.category = filter.category;
      var basis = S.rankingBasis(filter.basis);
      return S.rankByBasis(AN.compute(full, opts).ranked, basis.key).map(function (v) {
        return { name: v.name, score: basis.scale === 100 ? S.formatCPI(basis.getScore(v)) : S.formatScore(basis.getScore(v)) };
      });
    }
    var shownRows = "[...document.querySelectorAll('#rank-body tr')].map(function(tr){return {name: tr.querySelector('.rt__name').textContent, score: tr.querySelector('.rt__val').textContent}})";
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

    /* ---------- the public root ---------- */
    await navigate(base + '/');
    await ready();
    check('root serves the public site', await evaluate("document.title === 'Bureau of Patty Statistics — Official Burger Rankings'"));
    check('the hero states what the Bureau is', await evaluate("/Advancing the science of eating hamburgers/.test(document.querySelector('h1').textContent)"));
    check('one h1 on the page', await evaluate("document.querySelectorAll('h1').length === 1"));
    check('canonical link resolves to pattybureau.com', await evaluate("document.querySelector('link[rel=canonical]').href === 'https://pattybureau.com/'"));
    check('the public page loads the shared scoring modules', await evaluate(
      "['/taxonomy.js','/scoring.js','/analytics.js','/public-register.js'].every(function(p){return performance.getEntriesByType('resource').some(function(e){return new URL(e.name).pathname===p})})"));
    check('the examiner portal is linked but is not the primary action', await evaluate(
      "document.querySelector('.portal').getAttribute('href')==='/app/' && document.querySelector('.hero .btn--primary').getAttribute('href')==='#rankings'"));

    var overall = expected({ basis: 'overall' });
    check('Table 1 shows the Overall ranking the app computes', same(await evaluate(shownRows), overall), { shown: await evaluate(shownRows), overall: overall });
    check('the certificate names the CPI leader', await evaluate("document.querySelector('.cert__name').textContent") === overall[0].name);
    check('the certificate shows the leader\'s CPI', await evaluate("document.querySelector('.cert__value').textContent") === overall[0].score);
    var leaders = ['overall', 'burger-quality', 'fries'].map(function (b) { return expected({ basis: b })[0].name; });
    check('Table A names each basis leader', same(await evaluate("[...document.querySelectorAll('.hl__name')].map(function(n){return n.textContent})"), leaders));
    check('Overall scores are labelled CPI', await evaluate("document.getElementById('score-head').textContent") === 'CPI');

    await evaluate("document.querySelector('input[name=basis][value=burger-quality]').click()");
    await delay(60);
    check('Burger Quality basis reorders to the app\'s BQI order', same(await evaluate(shownRows), expected({ basis: 'burger-quality' })));
    check('Burger Quality is labelled BQI', await evaluate("document.getElementById('score-head').textContent") === 'BQI');
    check('basis is written to the URL', await evaluate("new URLSearchParams(location.search).get('basis')") === 'burger-quality');

    await evaluate("document.querySelector('input[name=basis][value=fries]').click()");
    await delay(60);
    check('Fries basis reorders to the app\'s Fries order', same(await evaluate(shownRows), expected({ basis: 'fries' })));
    check('Fries is labelled Fries, never CPI', await evaluate(
      "document.getElementById('score-head').textContent==='Fries' && !/CPI/.test(document.getElementById('rank-caption').textContent)"));

    /* Every offered location/area × every offered class × every basis. */
    var options = await evaluate("({locs:[...document.querySelectorAll('#f-location option')].map(function(o){return o.value}),cls:[...document.querySelectorAll('#f-class option')].map(function(o){return o.value})})");
    check('location options include an area and single locations', options.locs.some(function (v) { return /^area:/.test(v); }) && options.locs.some(function (v) { return /^location:/.test(v); }), options);
    var combos = 0, mismatched = [], empties = 0;
    for (var bi = 0; bi < 3; bi++) {
      var basisKey = ['overall', 'burger-quality', 'fries'][bi];
      for (var li = 0; li < options.locs.length; li++) {
        for (var ci = 0; ci < options.cls.length; ci++) {
          var lv = options.locs[li], cv = options.cls[ci];
          await evaluate("(function(){document.querySelector('input[name=basis][value=" + basisKey + "]').checked=true;" +
            "var l=document.getElementById('f-location');l.value=" + JSON.stringify(lv) + ";" +
            "var c=document.getElementById('f-class');c.value=" + JSON.stringify(cv) + ";" +
            "c.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
          var filter = { basis: basisKey, category: cv || null };
          if (/^location:/.test(lv)) filter.location = lv.slice(9);
          if (/^area:/.test(lv)) filter.area = lv.slice(5);
          var want = expected(filter);
          var got = await evaluate("document.getElementById('rank-table').hidden ? [] : " + shownRows);
          if (!want.length) {
            empties += 1;
            if (!(await evaluate("!document.getElementById('rank-empty').hidden"))) mismatched.push({ filter: filter, empty: 'not shown' });
          }
          if (!same(got, want) && mismatched.length < 4) mismatched.push({ filter: filter, want: want, got: got });
          combos += 1;
        }
      }
    }
    check('every basis × location × class combination matches the app (' + combos + ' combinations)', mismatched.length === 0, mismatched);
    check('empty combinations explain themselves (' + empties + ')', empties > 0);

    await navigate(base + '/?basis=fries&class=bar-pub');
    await ready();
    check('a shared link restores basis and class', await evaluate(
      "document.querySelector('input[name=basis]:checked').value==='fries' && document.getElementById('f-class').value==='bar-pub'"));
    check('a shared link shows the app\'s ranking for that view', same(await evaluate(shownRows), expected({ basis: 'fries', category: 'bar-pub' })));
    await evaluate("document.getElementById('f-clear').click()");
    await delay(60);
    check('Clear filters keeps the basis and resets the view', await evaluate(
      "location.search==='?basis=fries' && document.getElementById('f-clear').hidden"));
    await navigate(base + '/?location=nowhere-real&class=nonsense');
    await ready();
    check('a stale shared link falls back to the full register', await evaluate(
      "location.search==='' && document.querySelectorAll('#rank-body tr').length===" + overall.length));

    /* ---------- the establishment file ---------- */
    await evaluate("document.querySelector('#rank-body tr').click()");
    await waitFor("document.getElementById('file').open");
    check('clicking a row opens its establishment file', await evaluate("document.getElementById('file-title').textContent") === overall[0].name);
    check('opening a file writes a shareable hash', await evaluate("/^#file\\/BPS-\\d{4}$/.test(location.hash)"));
    check('the file shows the official CPI', await evaluate("[...document.querySelectorAll('#file-figs .fig__value')].some(function(n){return n.textContent===" + JSON.stringify(overall[0].score) + "})"));
    check('the file lists category findings and history', await evaluate("document.querySelectorAll('#file-body .bars li').length===7 && document.querySelectorAll('#file-body .hist li').length>=2"));
    await shoot('file-1280');
    await key('Escape', 'Escape', 27);
    await waitFor("!document.getElementById('file').open && location.hash===''");
    check('Escape closes the file and returns focus to its row', await evaluate(
      "document.activeElement && document.activeElement.classList.contains('rt__name') && location.hash===''"));
    check('closing restores the page title', await evaluate("document.title === 'Bureau of Patty Statistics — Official Burger Rankings'"));

    await evaluate("document.querySelector('#rank-body .rt__name').focus()");
    await key('Enter', 'Enter', 13);
    await waitFor("document.getElementById('file').open");
    check('a row opens from the keyboard', true);
    check('focus moves into the file', await evaluate("document.getElementById('file').contains(document.activeElement)"));
    await evaluate('history.back()');
    await waitFor("!document.getElementById('file').open");
    check('the browser Back button closes the file', await evaluate("location.hash===''"));

    var culvers = full.establishments.filter(function (e) { return e.name === 'Culver’s'; })[0].fileNumber;
    await navigate(base + '/#file/' + culvers);
    await ready();
    await waitFor("document.getElementById('file').open");
    check('a deep link opens that file', await evaluate("document.getElementById('file-title').textContent") === 'Culver’s');
    check('a three-examiner file names all three active examiners', await evaluate(
      "/Ryan/.test(document.getElementById('file-body').textContent) && /Devin/.test(document.getElementById('file-body').textContent) && /Chris/.test(document.getElementById('file-body').textContent)"));
    check('a departed examiner appears only as Former Examiner', await evaluate(
      "!/\\bPat\\b/.test(document.body.textContent) && /Former Examiner/.test(document.getElementById('file-body').textContent)"));
    await navigate(base + '/#file/BPS-9999');
    await ready();
    await waitFor("document.getElementById('file').open");
    check('an unknown file says so', await evaluate("document.getElementById('file-title').textContent==='File not found'"));
    var pendingName = full.establishments.filter(function (e) { return e.name === 'Blue Door Pub'; })[0];
    await navigate(base + '/#file/' + pendingName.fileNumber);
    await ready();
    await waitFor("document.getElementById('file').open");
    check('a pending establishment has no public file', await evaluate("document.getElementById('file-title').textContent==='File not found'"));
    check('a pending establishment is named under investigation, unscored', await evaluate(
      "/Blue Door Pub/.test(document.getElementById('investigation-list').textContent) && ![...document.querySelectorAll('#rank-body .rt__name')].some(function(n){return n.textContent==='Blue Door Pub'})"));

    /* ---------- no private data ---------- */
    await navigate(base + '/');
    await ready();
    var payload = await evaluate("fetch('/api/public/register').then(function(r){return r.text()})");
    check('the public API response contains no private field or value', X.findPrivate(JSON.parse(payload)).length === 0, X.findPrivate(JSON.parse(payload)).slice(0, 5));
    check('the page contains no email address or auth UUID', await evaluate(
      "!/@(gmail|private|example)|uuid-/.test(document.documentElement.outerHTML)"));
    var write = await fetch(base + '/api/public/register', { method: 'POST', body: '{}' });
    check('the public API refuses writes', write.status === 405);
    check('the public API never wrote to Supabase', pg.requests.every(function (r) { return r.method === 'GET'; }));

    /* ---------- sections render from live data ---------- */
    check('Bureau Statistics renders eight indicators', await evaluate("document.querySelectorAll('#indicators .ind').length===8"));
    check('Records Office count is published, contents are not', await evaluate(
      "[...document.querySelectorAll('.ind')].some(function(n){return /Records Office/.test(n.textContent) && /^4/.test(n.querySelector('.ind__value').textContent)})"));
    check('methodology weights come from scoring.js', await evaluate(
      "document.querySelector('#weights-table tfoot').textContent.indexOf('100%')!==-1 && document.querySelectorAll('#weights-table tbody tr').length===7"));
    check('Illustration 1 shows auditor balancing (87.0, not 85.5)', await evaluate(
      "/= 87\\.0/.test(document.querySelector('.eq--official').textContent) && /= 85\\.5/.test(document.querySelector('.eq--rejected').textContent)"));
    check('bulletins are issued', await evaluate("document.querySelectorAll('#notices .notice').length>=4"));
    check('the release lede is written from live figures', await evaluate(
      "document.getElementById('release-text').textContent.indexOf(" + JSON.stringify(overall[0].name + ' leads the Official Rankings with a Composite Patty Index of ' + overall[0].score) + ")!==-1"));

    await evaluate("document.querySelector('.govbar__toggle').click()");
    check('the banner explains how you know', await evaluate(
      "!document.getElementById('govbar-panel').hidden && document.querySelector('.govbar__toggle').getAttribute('aria-expanded')==='true'"));
    await evaluate("document.querySelector('.govbar__toggle').click()");

    /* ---------- layouts ---------- */
    var widths = [[375, 740], [430, 900], [768, 1024], [1280, 900]];
    var layouts = [];
    for (var wi = 0; wi < widths.length; wi++) {
      await viewport(widths[wi][0], widths[wi][1]);
      await navigate(base + '/');
      await ready();
      await evaluate("document.querySelectorAll('[data-reveal]').forEach(function(n){n.classList.add('is-in')})");
      /* Measure the settled layout: let every finite animation (stamp, rows) finish. */
      await evaluate("Promise.all(document.getAnimations().filter(function(a){return isFinite(a.effect.getComputedTiming().endTime)}).map(function(a){return a.finished})).then(function(){return true})");
      await delay(250);
      layouts.push(await evaluate("(function(){var bad=[];document.querySelectorAll('main *, header *, footer *, .govbar *').forEach(function(e){" +
        "if(!e.getClientRects().length)return; if(/vh|portal__text|skel/.test(e.className||''))return;" +
        "if(e.closest('.tablewrap')||e.closest('.sitenav'))return;" +
        "var cs=getComputedStyle(e);if(cs.overflowX==='auto'||cs.overflowX==='scroll')return;" +
        "if(e.scrollWidth>e.clientWidth+1)bad.push((e.className||e.tagName)+': '+(e.textContent||'').trim().slice(0,30))});" +
        "var sel=[...document.querySelectorAll('.select, .basis__opt span, .rt__row, .cert__open, .file-link.roll__name')].map(function(n){return n.getBoundingClientRect().height});" +
        "var wraps=[...document.querySelectorAll('.tablewrap')].filter(function(w){return w.scrollWidth>w.clientWidth+1}).length;" +
        "return {width:innerWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),clipped:bad.slice(0,5)," +
        "minTarget:Math.min.apply(null,sel.filter(function(h){return h>0})),tableOverflow:wraps," +
        "selectFont:parseFloat(getComputedStyle(document.getElementById('f-location')).fontSize)}})()"));
      await shoot('public-' + widths[wi][0]);
      await evaluate("document.querySelector('#rank-body tr').click()");
      await waitFor("document.getElementById('file').open");
      await delay(400);
      var sheet = await evaluate("(function(){var r=document.getElementById('file-sheet').getBoundingClientRect();return {left:r.left,right:r.right,vw:innerWidth,clipped:[...document.querySelectorAll('#file *')].filter(function(e){return e.getClientRects().length&&e.scrollWidth>e.clientWidth+1&&!/vh/.test(e.className||'')&&getComputedStyle(e).overflowY!=='auto'}).length}})()");
      layouts[wi].sheet = sheet;
      if (widths[wi][0] === 375) await shoot('file-375');
      await key('Escape', 'Escape', 27);
      await waitFor("!document.getElementById('file').open && location.hash===''");
    }
    check('no horizontal page overflow at 375/430/768/1280', layouts.every(function (l) { return l.scroll <= l.width + 1; }), layouts);
    check('no element clips its own text at any width', layouts.every(function (l) { return l.clipped.length === 0; }), layouts.map(function (l) { return l.clipped; }));
    check('touch targets are at least 44px at every width', layouts.every(function (l) { return l.minTarget >= 43.5; }), layouts.map(function (l) { return l.minTarget; }));
    check('Table 1 fits without sideways scrolling at every width', layouts.every(function (l) { return l.tableOverflow === 0; }), layouts.map(function (l) { return l.tableOverflow; }));
    check('filter selects use 16px text (no iOS zoom)', layouts.every(function (l) { return l.selectFont >= 16; }));
    check('the establishment file fits the viewport and clips nothing', layouts.every(function (l) {
      return l.sheet.left >= -1 && l.sheet.right <= l.sheet.vw + 1 && l.sheet.clipped === 0;
    }), layouts.map(function (l) { return l.sheet; }));

    /* ---------- register unavailable ---------- */
    await viewport(1280, 900);
    serverMode.down = true;
    await navigate(base + '/');
    await waitFor("!document.getElementById('rank-empty').hidden");
    check('an unavailable register is stated, not estimated', await evaluate(
      "/temporarily unavailable/.test(document.getElementById('rank-empty-title').textContent) && !document.getElementById('rank-retry').hidden && document.getElementById('rank-table').hidden"));
    serverMode.down = false;
    await evaluate("document.getElementById('rank-retry').click()");
    await waitFor("!document.getElementById('rank-table').hidden && document.querySelectorAll('#rank-body tr').length===" + overall.length);
    check('retrying recovers the register', true);
    /* The 503 above was provoked on purpose; Chrome logs every failed load. */
    for (var ei = consoleErrors.length - 1; ei >= 0; ei--) {
      if (/status of 503/.test(consoleErrors[ei]) && /\/api\/public\/register/.test(consoleErrors[ei])) consoleErrors.splice(ei, 1);
    }

    /* ---------- auth callbacks and the auditor app ---------- */
    await navigate(base + '/?adapter=mock#access_token=abc&refresh_token=def&type=recovery');
    await waitFor("location.pathname==='/app/'");
    check('a recovery hash on the public root forwards to /app/ intact', await evaluate(
      "location.search==='?adapter=mock' && /access_token=abc/.test(location.hash) && /type=recovery/.test(location.hash)"));

    await navigate(base + '/app/?adapter=mock');
    await waitFor("window.BPS && BPS.app && BPS.app.state.view==='auth'");
    check('/app/ serves the auditor app, signed out', await evaluate(
      "!document.getElementById('view-auth').hidden && document.getElementById('masthead').hidden"));
    check('/app/ loads the app stylesheet through the prefix', await evaluate("getComputedStyle(document.body).fontFamily.indexOf('Jost')!==-1"));
    check('/app/ manifest opens /app/ when installed', await evaluate(
      "fetch(document.querySelector('link[rel=manifest]').href).then(function(r){return r.json()}).then(function(m){return new URL(m.start_url, document.querySelector('link[rel=manifest]').href).pathname==='/app/'})"));
    await evaluate("(function(){document.getElementById('auth-email').value='ryanburtonwi@gmail.com';document.getElementById('auth-password').value='bps-demo';document.getElementById('auth-login-form').requestSubmit();return true})()");
    await waitFor("BPS.app.state.view==='rankings' && BPS.app.state.me==='ryan'");
    await evaluate("(function(){for(var i=0;i<12;i++){var h=document.getElementById('records-ceremony');if(h.hidden)break;document.querySelector('.proclaim__dismiss').click()}return true})()");
    check('the auditor app signs in and shows its rankings at /app/', await evaluate("!document.getElementById('view-rankings').hidden && document.querySelectorAll('#rankings-list .ranking').length>0"));
    var appOrder = await evaluate("[...document.querySelectorAll('#rankings-list .ranking__name')].map(function(n){return n.textContent})");
    var appExpected = S.rankByBasis(AN.compute(await D.createMockAdapter().listRegister()).ranked, 'overall').map(function (v) { return v.name; });
    check('the auditor app still ranks through the shared ordering', same(appOrder, appExpected), { appOrder: appOrder, appExpected: appExpected });
    await evaluate("(function(){var b=document.getElementById('ranking-basis');b.value='fries';b.dispatchEvent(new Event('change'));return true})()");
    var appFries = await evaluate("[...document.querySelectorAll('#rankings-list .ranking__name')].map(function(n){return n.textContent})");
    check('the auditor app Fries basis still works', same(appFries, S.rankByBasis(AN.compute(await D.createMockAdapter().listRegister()).ranked, 'fries').map(function (v) { return v.name; })));

    check('no uncaught browser exceptions', exceptions.length === 0, exceptions);
    check('no console errors', consoleErrors.length === 0, consoleErrors);

    var failed = checks.filter(function (c) { return !c.pass; });
    console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' public browser checks passed');
    console.log('Widths: 375, 430, 768, 1280; filter combinations: ' + combos);
    console.log('Uncaught exceptions: ' + exceptions.length + '; console errors: ' + consoleErrors.length);
    if (failed.length) process.exitCode = 1;
  } catch (err) {
    console.error(err && err.stack || err);
    if (exceptions.length) console.error('Browser exceptions:', exceptions);
    if (consoleErrors.length) console.error('Console errors:', consoleErrors);
    process.exitCode = 1;
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGTERM');
    await Promise.race([chromeExited, delay(2000)]);
    await new Promise(function (r) { server.close(r); });
    await pg.close();
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (err) { /* best effort */ }
  }
}

main().catch(function (err) { console.error(err && err.stack || err); process.exitCode = 1; });
