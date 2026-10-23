'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { createServer } = require('../tools/preview.cjs');
let browser, server, base, temp, extracted;
const root = path.resolve(__dirname, '..');
before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mazda-desktop-test-'));
  const script = `import importlib.util, pathlib, sys, zipfile, io
root=pathlib.Path(sys.argv[1]); output=pathlib.Path(sys.argv[2])
if len(sys.argv)>3:
 data=pathlib.Path(sys.argv[3]).read_bytes()
else:
 spec=importlib.util.spec_from_file_location('builder',root/'tools/build-desktop.py')
 module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
 data=module.archive_bytes(lambda name:(root/name).read_bytes(),'a'*40)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
 assert archive.testzip() is None
 assert all('..' not in pathlib.PurePosixPath(name).parts and not name.startswith('/') for name in archive.namelist())
 archive.extractall(output)
 print(output/archive.namelist()[0].split('/')[0])`;
  const args = ['-B', '-c', script, root, temp];
  if (process.env.DESKTOP_ARCHIVE) { args.push(path.resolve(process.env.DESKTOP_ARCHIVE)); }
  extracted = execFileSync('python3', args, { encoding: 'utf8' }).trim();
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  if (browser) { await browser.close(); }
  if (server) { await new Promise(resolve => server.close(resolve)); }
  if (temp) { fs.rmSync(temp, { recursive: true, force: true }); }
});
async function pageFor(t, { offline = false, narrow = false } = {}) {
  const context = await browser.newContext({ viewport: narrow ? { width: 390, height: 844 } : { width: 1280, height: 1100 }, offline });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(offline ? pathToFileURL(path.join(extracted, 'index.html')).href : base);
  await page.getByRole('heading', { name: 'Which system do you have?' }).waitFor();
  t.after(() => {
    assert.deepEqual(errors, [], 'no browser exceptions');
    assert.ok(requests.every(url => offline ? url.startsWith(pathToFileURL(extracted + path.sep).href) || url.startsWith('blob:') : url.startsWith(base + '/') || url.startsWith('blob:')), 'no external or inherited payload requests');
    assert.ok(requests.every(url => !url.includes('/mp3/') && !url.includes('/js/run.js')), 'no vehicle payload loads');
  });
  return page;
}
async function next(page) { await page.getByRole('button', { name: 'Continue', exact: true }).click(); }
async function choose(page, name = 'Album art layout / hide art') {
  await page.getByRole('searchbox', { name: 'Find a tweak' }).fill(name);
  await page.getByRole('checkbox', { name, exact: true }).check();
}
async function toSave(page) {
  await next(page); await choose(page); await next(page);
  await page.getByRole('checkbox', { name: 'I understand the download is a review plan, not software to put in the car.' }).check();
  await page.getByRole('button', { name: 'Continue to plan download' }).click();
}
async function downloadPlan(page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download review plan (.json)' }).click();
  const download = await event;
  assert.equal(download.suggestedFilename(), 'mazda-connect-review-plan.json');
  return JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
}
async function screenshot(page, name) {
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), fullPage: true });
  }
}

test('guided desktop path uses keyboard, explains gates, downloads current plan and stops before USB/car', async t => {
  const page = await pageFor(t);
  await screenshot(page, 'setup-identify');
  assert.equal(await page.getByRole('button', { name: 'Back', exact: true }).isDisabled(), true);
  await page.getByLabel('Model and trim', { exact: true }).fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Model year', { exact: true }).fill('2022');
  await page.getByLabel('Full OS version', { exact: true }).fill('74.00.324A EU N');
  await next(page);
  const status = page.getByRole('status', { name: 'Setup status' });
  assert.equal(await page.getByRole('heading', { name: 'What would you like to change?' }).evaluate(el => el === document.activeElement), true);
  await next(page); assert.match(await status.innerText(), /at least one/);
  await page.getByRole('searchbox', { name: 'Find a tweak' }).fill('Album art');
  await page.getByRole('checkbox', { name: 'Album art layout / hide art', exact: true }).focus();
  await page.keyboard.press('Space');
  await next(page);
  assert.equal(await page.locator('#setup-summary img').count(), 0);
  assert.match(await page.locator('#setup-summary').innerText(), /<img src=x onerror=alert\(1\)>/);
  assert.match(await page.locator('#setup-finding').innerText(), /bypass/);
  await page.getByRole('button', { name: 'Continue to plan download' }).click();
  assert.match(await status.innerText(), /Confirm/);
  await page.getByRole('checkbox', { name: 'I understand the download is a review plan, not software to put in the car.' }).check();
  await screenshot(page, 'setup-review');
  await page.getByRole('button', { name: 'Continue to plan download' }).click();
  await page.getByRole('button', { name: 'See remaining installation stages' }).click();
  assert.match(await status.innerText(), /Request your plan/);
  const plan = await downloadPlan(page);
  assert.equal(plan.executable, false); assert.equal(plan.vehicleAllowed, false);
  assert.equal(plan.desktopFlow.usbPrepared, false);
  assert.equal(plan.firmware, '74.00.324A EU N');
  assert.equal(JSON.stringify(plan).includes('<img'), false);
  assert.deepEqual(plan.features.map(feature => feature.id), ['album-art']);
  assert.match(await status.innerText(), /Download requested/);
  await page.getByRole('button', { name: 'See remaining installation stages' }).click();
  await page.getByRole('heading', { name: 'Your plan is the current stopping point.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'See remaining installation stages' }).isVisible(), false);
  assert.equal(await page.getByText('Unavailable', { exact: true }).count(), 2);
  await screenshot(page, 'setup-limit');
});

test('back/edit preserves selections, invalidates review, rejects invalid year and reload clears state', async t => {
  const page = await pageFor(t);
  await page.getByLabel('Model year', { exact: true }).fill('oops');
  await next(page); assert.match(await page.getByRole('status', { name: 'Setup status' }).innerText(), /four-digit/);
  await page.getByLabel('Model year', { exact: true }).fill('2022');
  await toSave(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find a tweak' }).fill('Background image');
  await page.getByRole('checkbox', { name: 'Background image', exact: true }).check();
  assert.match(await page.getByRole('status', { name: 'Selected tweaks' }).innerText(), /^2 selected/);
  await next(page);
  assert.equal(await page.locator('#setup-ack').isChecked(), false);
  await page.reload(); await next(page);
  assert.match(await page.getByRole('status', { name: 'Selected tweaks' }).innerText(), /^0 selected/);
});

test('Gen 2, no results, narrow layout and download failure remain usable without completing installation', async t => {
  const page = await pageFor(t, { narrow: true });
  await page.getByLabel('Infotainment generation', { exact: true }).selectOption('gen2');
  await next(page);
  await page.getByRole('searchbox', { name: 'Find a tweak' }).fill('<svg onload=alert(1)>');
  assert.match(await page.getByRole('status', { name: 'Tweak results' }).innerText(), /^0 of/);
  await choose(page, 'Background image');
  await next(page);
  assert.match(await page.locator('#setup-finding').innerText(), /Gen 2 is unsupported/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot(page, 'setup-narrow');
  await page.locator('#setup-ack').check();
  await page.getByRole('button', { name: 'Continue to plan download' }).click();
  await page.evaluate(() => { window.URL.createObjectURL = undefined; });
  await page.getByRole('button', { name: 'Download review plan (.json)' }).click();
  assert.match(await page.getByRole('status', { name: 'Setup status' }).innerText(), /cannot create the plan download/);
  await page.getByRole('button', { name: 'See remaining installation stages' }).click();
  assert.match(await page.getByRole('status', { name: 'Setup status' }).innerText(), /Request your plan/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Review what you picked.' }).isVisible(), true);
});

test('extracted archive runs offline from file URL, exports a plan and opens its mock research tools', async t => {
  const page = await pageFor(t, { offline: true });
  await toSave(page);
  const plan = await downloadPlan(page);
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.features.map(feature => feature.id), ['album-art']);
  await page.getByRole('link', { name: 'Open the AIO workbench and mock simulator' }).click();
  await page.getByRole('button', { name: 'Simulate terminal navigation', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Simulate UI region: Europe', exact: true }).click();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await page.getByRole('status', { name: 'Simulator state' }).filter({ hasText: 'Complete' }).waitFor();
  await page.getByRole('link', { name: 'CONNECT / GEN 1 ROOT' }).click();
  await page.getByRole('heading', { name: 'Which system do you have?' }).waitFor();
});
