'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compatibilityGroup } = require('../desktop-core/aio-compat.cjs');

const vectors = [
  ['55.00.100', 1], ['56.00.2', 1], ['58.00.200', 2], ['59.00.300', 3], ['59.00.399', 3], ['59.00.400', 4], ['59.00.499', 4],
  ['59.00.502', 5], ['70.00.100', 6], ['70.00.352', 6], ['70.00.360', 6], ['70.00.361', 7], ['70.00.536', 7],
  ['74.00.324A', 0], ['74.00.311', 0], ['74.00.230', 0], ['54.00.100', 0], ['70.01.352', 0], ['59.02.502', 0],
  ['70.00.335A', 7], ['59.00.4A', 5], ['abc', 0], ['', 0], ['70', 0], ['059.00.300', 3]
];

test('firmware 74 is group 0 (AIO refuses) and 70.00.361+ is the warn-and-continue group', () => {
  assert.equal(compatibilityGroup('74.00.324A'), 0);
  assert.equal(compatibilityGroup('70.00.361'), 7);
});

test('port matches the recorded vectors', () => {
  for (const [version, group] of vectors) { assert.equal(compatibilityGroup(version), group, version); }
});

test('port matches the real AIO shell function (needs AIO_SRC=<MZD-AIO checkout at 409c724>)', { skip: !process.env.AIO_SRC && 'AIO_SRC not set' }, () => {
  const source = fs.readFileSync(path.join(process.env.AIO_SRC, 'app/files/tweaks/00_start.txt'), 'utf8').replace(/\/jci\/version\.ini/g, '"$INI"');
  const grab = (name) => source.match(new RegExp('^' + name + '\\(\\)\\n\\{[\\s\\S]*?\\n\\}', 'm'))[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-compat-'));
  const ini = path.join(dir, 'version.ini');
  const script = grab('get_cmu_ver') + '\n' + grab('compatibility_check') + '\ncompatibility_check 2>/dev/null\n';
  for (const [version] of vectors) {
    fs.writeFileSync(ini, 'JCI_SW_VER="X_' + version + '"\n');
    const out = execFileSync('/bin/sh', ['-c', script], { env: { INI: ini, PATH: process.env.PATH }, encoding: 'utf8' }).trim().split('\n').pop();
    assert.equal(Number(out), compatibilityGroup(version), 'version ' + JSON.stringify(version) + ' shell=' + out);
  }
});
