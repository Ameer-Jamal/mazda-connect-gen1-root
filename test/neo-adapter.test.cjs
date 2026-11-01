'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const adapter = require('../desktop-core/neo-adapter.cjs');
const safety = require('../desktop-core/drive-safety.cjs');
const { createImage } = require('./fixtures/disk-image-adapter.cjs');

const GIB = 1024 * 1024 * 1024;
const stick = { id: 'd', serial: 'S', vendor: 'v', model: 'm', sizeBytes: 16 * GIB, bus: 'usb', removable: true, internal: false, isSystem: false, readOnly: false };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'neo-adapter-'));
function pkg(entries) {
  const root = tmp();
  for (const [name, data] of Object.entries(entries)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return root;
}

test('a built package becomes sorted files, with literal launcher names preserved, and flows through plan, write and verify', async () => {
  const root = pkg({ 'tweaks.sh': '#!/bin/sh\n', 'config/a.js': 'x', '$(id).up': 'launcher' });
  const files = adapter.loadPackageFromDirectory(root);
  assert.deepEqual(files.map((f) => f.path), ['$(id).up', 'config/a.js', 'tweaks.sh']);
  const plan = safety.createErasePlan(stick, files);
  const image = createImage(stick);
  const result = await safety.prepareDrive(plan, files, plan.phrase, image);
  assert.equal(result.status, 'ok');
  assert.ok(image.files.has('$(id).up'));
});

test('symlinks, OS metadata, bad names, empty and oversized packages are rejected, not skipped', () => {
  const link = pkg({ 'a.txt': 'x' });
  fs.symlinkSync('/etc/passwd', path.join(link, 'evil'));
  assert.throws(() => adapter.loadPackageFromDirectory(link), /link or special/);
  assert.throws(() => adapter.loadPackageFromDirectory(pkg({ 'a.txt': 'x', '._a.txt': 'y' })), /OS metadata/);
  assert.throws(() => adapter.loadPackageFromDirectory(pkg({ 'a:b': 'x' })), /Unsafe/);
  assert.throws(() => adapter.loadPackageFromDirectory(tmp()), /empty/);
  assert.throws(() => adapter.loadPackageFromDirectory(pkg({ 'a.txt': 'xxxx' }), { maxFileBytes: 2 }), /too large/);
  assert.throws(() => adapter.loadPackageFromDirectory(pkg({ a: 'x', b: 'y' }), { maxFiles: 1 }), /size limits/);
  const rootLink = path.join(tmp(), 'rootlink');
  fs.symlinkSync(pkg({ 'a.txt': 'x' }), rootLink);
  assert.throws(() => adapter.loadPackageFromDirectory(rootLink), /not a real directory/);
});

function fakeCompiler(commitMatches) {
  const source = tmp();
  fs.mkdirSync(path.join(source, 'cli/bin'), { recursive: true });
  fs.writeFileSync(path.join(source, 'cli/bin/mzd-aio.js'), `
    const fs = require('node:fs'); const out = process.argv[process.argv.indexOf('--output') + 1];
    if (process.argv[2] !== 'build') process.exit(2);
    if (fs.existsSync(__dirname + '/../../FAIL')) process.exit(1);
    fs.mkdirSync(out + '/config', { recursive: true }); fs.writeFileSync(out + '/tweaks.sh', 'x'); fs.writeFileSync(out + '/config/c', 'y');`);
  const git = (...a) => execFileSync('git', ['-C', source, ...a], { stdio: 'ignore' });
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x');
  const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { source, commit: commitMatches ? head : adapter.PINNED.commit };
}

test('buildWithNeo runs the compiler only at the reviewed commit and returns the built files', () => {
  const ok = fakeCompiler(true);
  const out = path.join(tmp(), 'out');
  const files = adapter.buildWithNeo({ source: ok.source, commit: ok.commit, config: '/abs/config.yaml', output: out });
  assert.deepEqual(files.map((f) => f.path), ['config/c', 'tweaks.sh']);
});

test('buildWithNeo refuses a different commit, an existing output directory, relative paths and compiler failure', () => {
  const wrong = fakeCompiler(false);
  const out = path.join(tmp(), 'out');
  assert.throws(() => adapter.buildWithNeo({ source: wrong.source, config: '/abs/c.yaml', output: out }), /not at the reviewed commit/);
  const ok = fakeCompiler(true);
  assert.throws(() => adapter.buildWithNeo({ source: ok.source, commit: ok.commit, config: '/abs/c.yaml', output: tmp() }), /already exists/);
  assert.throws(() => adapter.buildWithNeo({ source: ok.source, commit: ok.commit, config: 'c.yaml', output: out }), /absolute/);
  fs.writeFileSync(path.join(ok.source, 'FAIL'), '');
  assert.throws(() => adapter.buildWithNeo({ source: ok.source, commit: ok.commit, config: '/abs/c.yaml', output: out }));
});
