'use strict';
// Characterization of pinned, known source in an isolated browser with all host APIs mocked.
// These assertions intentionally demonstrate legacy defects; they are NOT safety checks.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { check } = require('../tools/check-upstream.cjs');
const source = fs.readFileSync(path.join(__dirname, '../js/run.js'), 'utf8');
let browser;
before(async () => { check(); browser = await chromium.launch({ headless: true }); });
after(async () => { if (browser) { await browser.close(); } });

async function fixture(t, dev = false) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  // No real requests are allowed, including scripts, styles, and media.
  const requests = [];
  await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  if (dev) {
    // Run at the same head-parsing point used by inherited dev.html.
    await page.setContent('<!doctype html><html><head><script>' + source + '</script></head><body>Mock desktop</body></html>');
    await page.locator('.xss-actions').waitFor();
  } else {
    await page.setContent('<!doctype html><html><body>Mock host only</body></html>');
    await page.evaluate(() => {
      window.__calls = [];
      window.__logs = [];
      window.__cssRequests = [];
      window.framework = {
        localize: { _currentRegion: 'original-region' },
        sendEventToMmui: function () { window.__calls.push(Array.from(arguments)); },
        _showFatalErrorWink: function () { window.__calls.push(['fatal', ...arguments]); },
        _restartCMU: function () { window.__calls.push(['restart', ...arguments]); }
      };
      window.log = {};
      ['error', 'warn', 'info'].forEach(level => {
        window.log[level] = function () {
          window.__logs.push({ level, receiverPreserved: this === window.log, args: Array.from(arguments) });
          return 'original-result';
        };
      });
      window.__originalLogs = { ...window.log };
      window.utility = { loadCss: function (name) { window.__cssRequests.push(name); } };
    });
    await page.addScriptTag({ content: source });
  }
  t.after(() => assert.deepEqual(requests, [], 'legacy host APIs must not trigger network/media access in this harness'));
  return page;
}
async function action(page, name) {
  await page.locator('.xss-action').getByText(name, { exact: true }).dispatchEvent('mousedown');
}
async function calls(page) { return page.evaluate(() => window.__calls); }

test('LEGACY: Destroy removes overlay and requests no reboot or destructive host command', async t => {
  const page = await fixture(t);
  await action(page, 'Destroy');
  assert.equal(await page.locator('.xss-actions').count(), 0);
  assert.equal(await page.locator('.xss-toggle').count(), 0);
  assert.deepEqual(await calls(page), []);
  assert.equal(await page.evaluate(() => window.framework.localize._currentRegion), 'original-region');
});

test('LEGACY BUG: diagnostic sequence continues after Destroy', async t => {
  const page = await fixture(t);
  await action(page, 'Open terminal');
  await action(page, 'Destroy');
  await page.clock.runFor(14001);
  assert.deepEqual((await calls(page)).map(call => call[1]), ['SelectDiagnostics', 'ActivateJCITest', 'ReadDTC']);
});

test('LEGACY BUG: repeated activation starts overlapping diagnostic sequences', async t => {
  const page = await fixture(t);
  await action(page, 'Open terminal'); await action(page, 'Open terminal');
  await page.clock.runFor(14001);
  assert.equal((await calls(page)).length, 6);
});

test('LEGACY BUG: logging interprets message markup as DOM content', async t => {
  const page = await fixture(t);
  await action(page, 'Ui logs');
  await page.evaluate(() => window.log.info('<b id="legacy-markup">parsed instead of literal</b>'));
  assert.equal(await page.locator('.xss-ui-logger #legacy-markup').count(), 1);
});

test('LEGACY BUG: logger grows without a bound and survives Destroy with methods still wrapped', async t => {
  const page = await fixture(t);
  await action(page, 'Ui logs');
  await page.evaluate(() => { for (let i = 0; i < 250; i++) { window.log.info('entry ' + i); } });
  assert.equal(await page.locator('.xss-ui-logger > div').count(), 250);
  await action(page, 'Destroy');
  assert.equal(await page.locator('.xss-ui-logger').count(), 1);
  assert.equal(await page.evaluate(() => window.log.info === window.__originalLogs.info), false);
  await page.evaluate(() => window.log.info('after closing'));
  assert.equal(await page.locator('.xss-ui-logger > div').count(), 251);
});

test('LEGACY BUG: logger loses original receiver, additional arguments, and return value', async t => {
  const page = await fixture(t);
  await action(page, 'Ui logs');
  const result = await page.evaluate(() => {
    const returned = window.log.info('first', 'second');
    return { log: window.__logs.at(-1), returned: returned === undefined ? 'undefined' : returned };
  });
  assert.deepEqual(result, { log: { level: 'info', receiverPreserved: false, args: ['first'] }, returned: 'undefined' });
});

test('LEGACY BUG: restart performs its first host call before discovering a missing second capability', async t => {
  const page = await fixture(t);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => { delete window.framework._restartCMU; });
  await action(page, 'Restart');
  await page.waitForFunction(() => window.__calls.length === 1);
  assert.deepEqual((await calls(page))[0], ['fatal', 'reboot', 'xss']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /_restartCMU/);
});

test('LEGACY BUG: head-loaded dev preview lacks region and restart mock capabilities', async t => {
  const page = await fixture(t, true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await action(page, 'Set UI region: EU');
  await action(page, 'Restart');
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /_showFatalErrorWink/);
});
