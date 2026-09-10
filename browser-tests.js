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
    }

    async function fillScores(value, firstValue) {
      var hasFirst = firstValue != null;
      return evaluate("(()=>{var xs=[...document.querySelectorAll('#eval-scores input[type=range]')];" +
        'xs.forEach((x,i)=>{x.value=String(i===0&&' + hasFirst + '?' + (hasFirst ? firstValue : value) + ':' + value +
        ");x.dispatchEvent(new Event('input',{bubbles:true}))});" +
        "return {count:xs.length,weighted:document.getElementById('eval-weighted').textContent}})()");
    }

    async function createSpecimen(restaurant, burger, score) {
      await evaluate("BPS.app.setView('evaluate')");
      await evaluate("(()=>{var r=document.getElementById('f-restaurant'),b=document.getElementById('f-burger');" +
        'r.value=' + JSON.stringify(restaurant) + ';b.value=' + JSON.stringify(burger) + ';' +
        "r.dispatchEvent(new Event('input',{bubbles:true}));b.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      var filled = await fillScores(score);
      check('six score controls filled', filled.count === 6, filled);
      await evaluate("document.getElementById('evaluate-form').requestSubmit()");
      await waitFor("BPS.app.state.view==='rankings' && BPS.app.state.burgers.some(b=>b.burger===" + JSON.stringify(burger) + ')');
      return evaluate('BPS.app.state.burgers.find(b=>b.burger===' + JSON.stringify(burger) + ').id');
    }

    async function signOut(waitForTimer) {
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
    var current = await evaluate("({view:BPS.app.state.view,me:BPS.app.state.me,certified:BPS.app.state.metrics.counts.certified," +
      "pending:BPS.app.state.metrics.counts.pending,rankRows:document.querySelectorAll('#rankings-list .ranking').length})");
    check('Ryan identity comes from authentication', current.me === 'ryan', current);
    check('rankings render certified specimens', current.certified === current.rankRows && current.certified > 0, current);

    await evaluate("BPS.app.setView('pending')");
    current = await evaluate("({mine:document.querySelectorAll('#pending-mine .ranking').length," +
      "theirs:document.querySelectorAll('#pending-theirs .ranking').length})");
    check('Ryan pending queues are separated', current.mine >= 1 && current.theirs >= 1, current);

    var ryanBurger = 'Regression Burger Ryan ' + Date.now();
    var ryanId = await createSpecimen('Regression Counter', ryanBurger, 8.1);
    current = await evaluate("(()=>{var v=BPS.app.state.metrics.views.find(v=>v.id===" + JSON.stringify(ryanId) +
      ');return {status:v.status,cpi:v.cpi,rank:v.rank,missing:v.missing}})()');
    check('Ryan-only specimen is pending without CPI/rank', current.status === 'pending' && current.cpi === null &&
      current.rank === null && current.missing === 'devin', current);

    await signOut(true);
    check('sign-out clears protected state', await evaluate('BPS.app.state.metrics===null && BPS.app.state.burgers.length===0'));
    check('sign-out delayed callback causes no exception', exceptions.length === 0, exceptions);

    await signIn('Devin');
    await evaluate("BPS.app.setView('pending')");
    current = await evaluate("({needed:[...document.querySelectorAll('#pending-mine .ranking')].some(x=>x.dataset.id===" +
      JSON.stringify(ryanId) + '),me:BPS.app.state.me})');
    check('Ryan-created specimen needs Devin review', current.needed && current.me === 'devin', current);

    await evaluate("(()=>{var row=[...document.querySelectorAll('#pending-mine .ranking')].find(x=>x.dataset.id===" +
      JSON.stringify(ryanId) + ");row.querySelector('.ranking__action button').click();return true})()");
    await waitFor("BPS.app.state.view==='evaluate' && BPS.app.state.evalMode.burgerId===" + JSON.stringify(ryanId));
    await fillScores(7.9);
    current = await evaluate("({hint:document.getElementById('tally-hint').textContent," +
      "reviewName:document.getElementById('review-burger').textContent})");
    check('peer review shows projected CPI', /Projected Composite Patty Index/.test(current.hint) &&
      current.reviewName === ryanBurger, current);
    await evaluate("document.getElementById('evaluate-form').requestSubmit()");
    await waitFor("BPS.app.state.view==='record' && BPS.app.state.metrics.views.find(v=>v.id===" +
      JSON.stringify(ryanId) + ').certified');

    var certifiedBefore = await evaluate("(()=>{var v=BPS.app.state.metrics.views.find(v=>v.id===" + JSON.stringify(ryanId) +
      ");var cards=[...document.querySelectorAll('#record-examiners .exrec')];return {cpi:v.cpi,rank:v.rank,status:v.status," +
      "examiners:cards.map(x=>x.querySelector('.exrec__name').textContent)," +
      "ryanEdit:cards.find(x=>x.querySelector('.exrec__name').textContent==='Ryan').querySelectorAll('button').length," +
      "devinEdit:cards.find(x=>x.querySelector('.exrec__name').textContent==='Devin').querySelectorAll('button').length}})()");
    check('second audit certifies and assigns official CPI/rank', certifiedBefore.status === 'certified' &&
      certifiedBefore.cpi !== null && certifiedBefore.rank > 0, certifiedBefore);
    check('record shows both examiner identities', certifiedBefore.examiners.indexOf('Ryan') !== -1 &&
      certifiedBefore.examiners.indexOf('Devin') !== -1, certifiedBefore.examiners);
    check('Devin can amend only Devin audit in normal UI', certifiedBefore.ryanEdit === 0 && certifiedBefore.devinEdit === 1,
      certifiedBefore);

    await evaluate("(()=>{var card=[...document.querySelectorAll('#record-examiners .exrec')].find(" +
      "x=>x.querySelector('.exrec__name').textContent==='Devin');card.querySelector('button').click();return true})()");
    await waitFor("BPS.app.state.evalMode.type==='review'");
    await fillScores(7.9, 6.0);
    await evaluate("document.getElementById('evaluate-form').requestSubmit()");
    await waitFor("BPS.app.state.view==='record'");
    var certifiedAfter = await evaluate('BPS.app.state.metrics.views.find(v=>v.id===' + JSON.stringify(ryanId) + ').cpi');
    check('amending own audit recalculates CPI', certifiedAfter !== certifiedBefore.cpi,
      { before: certifiedBefore.cpi, after: certifiedAfter });

    var devinBurger = 'Regression Burger Devin ' + Date.now();
    var devinId = await createSpecimen('Reverse Direction Grill', devinBurger, 8.3);
    await signOut(false);
    await signIn('Ryan');
    await evaluate("BPS.app.setView('pending')");
    check('Devin-created specimen needs Ryan review', await evaluate("[...document.querySelectorAll('#pending-mine .ranking')]" +
      '.some(x=>x.dataset.id===' + JSON.stringify(devinId) + ')'));
    await evaluate("(()=>{var row=[...document.querySelectorAll('#pending-mine .ranking')].find(x=>x.dataset.id===" +
      JSON.stringify(devinId) + ");row.querySelector('.ranking__action button').click();return true})()");
    await fillScores(8.0);
    await evaluate("document.getElementById('evaluate-form').requestSubmit()");
    await waitFor("BPS.app.state.view==='record' && BPS.app.state.metrics.views.find(v=>v.id===" +
      JSON.stringify(devinId) + ').certified');
    check('reverse-direction peer review certifies specimen',
      await evaluate('BPS.app.state.metrics.views.find(v=>v.id===' + JSON.stringify(devinId) + ').rank>0'));

    await evaluate("BPS.app.setView('evaluate')");
    await evaluate("(()=>{var r=document.getElementById('f-restaurant'),b=document.getElementById('f-burger');" +
      "r.value='Regression Counter';b.value=" + JSON.stringify(ryanBurger) + ';' +
      "r.dispatchEvent(new Event('input',{bubbles:true}));b.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
    check('duplicate warning appears', await evaluate("!document.getElementById('dup-warning').hidden && " +
      "/already on file/.test(document.getElementById('dup-text').textContent)"));

    await evaluate("BPS.app.setView('insights')");
    var insightFirst = await evaluate("({count:document.querySelectorAll('#findings-list .finding').length," +
      "text:document.getElementById('findings-list').textContent,eligible:BPS.insights.eligibleRules(BPS.app.state.metrics).length," +
      "ryanN:BPS.app.state.metrics.auditors.ryan.n,devinN:BPS.app.state.metrics.auditors.devin.n," +
      "personalRyan:BPS.app.state.metrics.paired.ryanOrder.length,personalDevin:BPS.app.state.metrics.paired.devinOrder.length})");
    check('insights render 6-12 findings', insightFirst.count >= 6 && insightFirst.count <= 12,
      { count: insightFirst.count, eligible: insightFirst.eligible });
    check('personal auditor analytics/rankings are populated', insightFirst.ryanN > 0 && insightFirst.devinN > 0 &&
      insightFirst.personalRyan > 0 && insightFirst.personalDevin > 0, insightFirst);
    await evaluate("document.getElementById('reroll-btn').click()");
    var insightSecond = await evaluate("document.getElementById('findings-list').textContent");
    check('insight revisit rotates displayed findings', insightSecond !== insightFirst.text);
    check('rendered findings contain no invalid numeric text', !/(NaN|undefined|Infinity)/.test(insightSecond));

    await evaluate("BPS.app.setView('pending')");
    await evaluate("document.querySelector('#pending-theirs .ranking__btn').click()");
    current = await evaluate("({view:BPS.app.state.view,labels:[...document.querySelectorAll('#record-figures .figure__label')]" +
      ".map(x=>x.textContent),values:[...document.querySelectorAll('#record-figures .figure__value')].map(x=>x.textContent)})");
    check('pending specimen detail has no official CPI/rank', current.view === 'record' &&
      current.values.indexOf('Pending Peer Review') !== -1 && current.labels.indexOf('Composite Patty Index') === -1 &&
      current.labels.indexOf('Official Rank') === -1, current);

    await evaluate("BPS.app.setView('rankings')");
    await evaluate("document.querySelector('#rankings-list .ranking__btn').click()");
    check('certified specimen detail shows CPI and rank', await evaluate("(()=>{var labels=[...document.querySelectorAll(" +
      "'#record-figures .figure__label')].map(x=>x.textContent);return labels.includes('Composite Patty Index') && " +
      "labels.includes('Official Rank')})()"));

    var widthResults = [];
    var dimensions = [[375, 812], [430, 900], [768, 1024], [1280, 900]];
    for (var di = 0; di < dimensions.length; di++) {
      var width = dimensions[di][0], height = dimensions[di][1];
      await send('Emulation.setDeviceMetricsOverride', {
        width: width, height: height, deviceScaleFactor: 1, mobile: width < 768
      });
      var viewNames = ['rankings', 'pending', 'evaluate', 'record', 'insights'];
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
