'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { createServer } = require('../tools/preview.cjs');
let browser, server, base;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  if (browser) { await browser.close(); }
  if (server) { await new Promise(resolve => server.close(resolve)); }
});

async function pageFor(t, viewport = { width: 1280, height: 1100 }) {
  const context = await browser.newContext({ viewport });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.clock.install();
  // Test-only instrumentation captures mock calls without adding a production test API.
  await page.addInitScript(() => {
    let factory;
    Object.defineProperty(window, 'ConnectLabMock', {
      configurable: true,
      get() { return factory; },
      set(value) {
        const create = value.create;
        value.create = function () { const adapter = create(); window.__testMock = adapter; return adapter; };
        factory = value;
      }
    });
  });
  await page.goto(base);
  await page.getByRole('status').filter({ hasText: 'Idle' }).waitFor();
  t.after(() => {
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    for (const url of requests) { assert.ok(url.startsWith(base + '/'), `unexpected request: ${url}`); }
    assert.ok(requests.every(url => !/\/js\/run\.js|\.mp3/.test(url)), 'no inherited payload requests');
  });
  return page;
}
async function calls(page) { return page.evaluate(() => window.__testMock.calls); }
async function capture(page, name) {
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), fullPage: true });
  }
}

test('desktop labeling, keyboard confirmation, focus and normal terminal flow', async t => {
  const page = await pageFor(t);
  assert.equal(await page.getByText('OFFLINE SIMULATION ONLY', { exact: true }).count(), 1);
  await capture(page, 'desktop');
  await page.getByRole('button', { name: 'Simulate terminal navigation' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Run simulation' }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
  await capture(page, 'confirmation');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('status').filter({ hasText: 'Running: Terminal navigation' }).waitFor();
  assert.equal((await calls(page)).length, 1);
  assert.match(await page.getByRole('status').innerText(), /Running/);
  assert.equal(await page.getByRole('button', { name: 'Simulate reboot' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Close overlay' }).evaluate(el => el === document.activeElement), true);
  await page.clock.runFor(14010);
  assert.equal((await calls(page)).length, 3);
  assert.equal(await page.getByRole('status').innerText(), 'Complete');
  assert.match(await page.getByRole('list', { name: 'Session log' }).innerText(), /ReadDTC/);
});

test('cancel and Escape produce no adapter calls and restore initiating focus', async t => {
  const page = await pageFor(t);
  for (const action of ['Simulate terminal navigation', 'Simulate UI region: Europe', 'Simulate reboot']) {
    const button = page.getByRole('button', { name: action, exact: true });
    for (const escape of [false, true]) {
      await button.click();
      if (escape) { await page.keyboard.press('Escape'); }
      else { await page.getByRole('button', { name: 'Cancel', exact: true }).click(); }
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.equal((await calls(page)).length, 0);
      assert.equal(await button.evaluate(el => el === document.activeElement), true);
    }
  }
});

test('close cancels delayed commands; reopening does not duplicate listeners or log wrappers', async t => {
  const page = await pageFor(t);
  await page.getByRole('button', { name: 'Simulate terminal navigation' }).click();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('status').filter({ hasText: 'Running: Terminal navigation' }).waitFor();
  await page.getByRole('button', { name: 'Close overlay' }).click();
  assert.equal(await page.getByRole('button', { name: 'Reopen simulator' }).evaluate(el => el === document.activeElement), true);
  await page.clock.runFor(30000);
  assert.equal((await calls(page)).length, 1);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Reopen simulator' }).click();
    assert.equal(await page.getByRole('button', { name: 'Simulate terminal navigation' }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Enable mock UI logs' }).click();
    const count = (await calls(page)).length;
    await page.getByRole('button', { name: 'Add sample log message' }).click();
    assert.equal((await calls(page)).length, count + 1);
    await page.getByRole('button', { name: 'Close overlay' }).click();
  }
});

test('HTML-like log messages render literally and DOM log length stays bounded', async t => {
  const page = await pageFor(t);
  await page.getByRole('button', { name: 'Enable mock UI logs' }).click();
  await page.evaluate(() => {
    window.__testMock.log.error('<img src=x onerror="window.__injected=true">');
  });
  assert.match(await page.locator('#entries').innerText(), /<img src=x onerror=/);
  assert.equal(await page.locator('#entries img').count(), 0);
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  await page.evaluate(() => { for (let i = 0; i < 205; i++) { window.__testMock.log.info('entry ' + i); } });
  assert.equal(await page.locator('#entries li').count(), 200);
  assert.match(await page.locator('#entries li').last().innerText(), /entry 204/);
});

test('mock reboot and region operations complete without a page reload', async t => {
  const page = await pageFor(t);
  await page.getByRole('button', { name: 'Simulate reboot', exact: true }).click();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('status').filter({ hasText: 'Running: Reboot' }).waitFor();
  await page.clock.runFor(7010);
  assert.deepEqual((await calls(page)).map(c => c.method), ['showFatalError', 'restart']);
  assert.equal(await page.getByRole('status').innerText(), 'Complete');
  await page.getByRole('button', { name: 'Simulate UI region: Europe', exact: true }).click();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__testMock.calls.some(call => call.method === 'setRegion'));
  assert.deepEqual((await calls(page)).at(-1), { method: 'setRegion', args: ['Region_Europe'] });
  assert.equal(await page.getByRole('status').innerText(), 'Complete');
});

test('narrow desktop/mobile viewport remains readable without horizontal overflow', async t => {
  const page = await pageFor(t, { width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole('button', { name: 'Simulate reboot', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await capture(page, 'narrow');
});

test('missing and throwing mock capabilities surface an error and allow closing', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => { delete window.__testMock.restart; });
  await page.getByRole('button', { name: 'Simulate reboot', exact: true }).click();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.getByRole('status').filter({ hasText: 'Error' }).waitFor();
  assert.match(await page.locator('#entries').innerText(), /Mock capability unavailable: restart/);
  assert.equal((await calls(page)).length, 0);
  await page.evaluate(() => { window.__testMock.setRegion = function () { throw new Error('Injected mock failure'); }; });
  await page.getByRole('button', { name: 'Simulate UI region: Europe', exact: true }).click();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.locator('#entries').getByText('Injected mock failure', { exact: true }).waitFor();
  assert.equal((await calls(page)).length, 0);
  await page.getByRole('button', { name: 'Close overlay' }).click();
  assert.equal(await page.getByRole('button', { name: 'Reopen simulator' }).isVisible(), true);
});

test('preview server never serves inherited files, traversal, or repository contents', async () => {
  for (const route of ['/js/run.js', '/mp3/a.mp3', '/dev.html', '/.git/config', '/package.json', '/%2e%2e/dev.html', '/__proto__']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 404);
  assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
});

test('malformed HTTP request target returns 400 and the preview remains available', async () => {
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: 'http://[bad', method: 'GET' }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject); request.end();
  });
  assert.equal(status, 400);
  assert.equal((await fetch(base)).status, 200);
});
