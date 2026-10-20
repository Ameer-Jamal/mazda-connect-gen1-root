'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { check } = require('../tools/check-upstream.cjs');
const root = path.resolve(__dirname, '..');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-integrity-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/upstream-baseline.json')));
  for (const name of ['docs/upstream-baseline.json', ...Object.keys(baseline.files)]) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.copyFileSync(path.join(root, name), path.join(dir, name));
  }
  return dir;
}
test('all nine inherited files match the pinned upstream commit', () => { assert.equal(check(), 9); });
test('changed and missing inherited files fail verification', t => {
  const dir = fixture(t);
  fs.appendFileSync(path.join(dir, 'js/run.js'), '\n// changed');
  assert.throws(() => check(dir), /Inherited file changed: js\/run.js/);
  fs.unlinkSync(path.join(dir, 'js/run.js'));
  assert.throws(() => check(dir), /ENOENT/);
});
test('edited manifest cannot bless a modified payload', t => {
  const dir = fixture(t);
  const file = path.join(dir, 'docs/upstream-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(file));
  baseline.files['js/run.js'] = '0'.repeat(64);
  fs.writeFileSync(file, JSON.stringify(baseline));
  assert.throws(() => check(dir), /Baseline digest changed/);
  delete baseline.files['js/run.js'];
  fs.writeFileSync(file, JSON.stringify(baseline));
  assert.throws(() => check(dir), /file list changed/);
});
test('symlink substitution is rejected', t => {
  const dir = fixture(t);
  fs.unlinkSync(path.join(dir, 'dev.html'));
  fs.symlinkSync(path.join(root, 'dev.html'), path.join(dir, 'dev.html'));
  assert.throws(() => check(dir), /not a regular file/);
});
