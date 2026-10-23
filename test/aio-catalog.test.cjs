'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const aio = require('../simulator/aio-catalog.js');

test('AIO plans contain pinned source metadata and stay non-executable for every listed feature', () => {
  const features = aio.features();
  assert.equal(new Set(features.map(f => f.id)).size, features.length);
  const plan = aio.plan(features.map(f => f.id), '74.00.324A EU N', 'gen1');
  assert.equal(plan.features.length, 24);
  assert.equal(plan.executable, false);
  assert.equal(plan.vehicleAllowed, false);
  assert.match(plan.finding, /bypass, not qualification/);
  assert.match(plan.provenance.commit, /^[a-f0-9]{40}$/);
  for (const feature of plan.features) {
    assert.ok(feature.note.length > 0);
    assert.ok(aio.sourceUrl(feature.path).startsWith('https://github.com/Trevelopment/MZD-AIO/blob/' + plan.provenance.commit + '/app/files/tweaks/'));
    assert.equal(Object.hasOwn(feature, 'script'), false);
    assert.equal(Object.hasOwn(feature, 'command'), false);
  }
});

test('reject invalid selections and deduplicate valid choices', () => {
  for (const ids of [null, 'background', ['not-a-feature'], [{}], Array(25).fill('background')]) {
    assert.throws(() => aio.plan(ids, '', 'unknown'), /selection|feature/i);
  }
  for (const firmware of [null, {}, 'x'.repeat(129)]) {
    assert.throws(() => aio.plan([], firmware, 'gen1'), /firmware/);
  }
  assert.throws(() => aio.plan([], '', 'gen3'), /generation/);
  assert.equal(aio.plan(['background', 'background'], '', 'unknown').features.length, 1);
  assert.equal(aio.plan([], '', 'unknown').features.length, 0);
});

test('firmware findings describe source limits without authorizing known families', () => {
  for (const firmware of ['', '74', 'v74???', '74.00.324<script>', 'x'.repeat(129), null]) {
    assert.match(aio.firmwareFinding(firmware), /missing|not recognized/);
  }
  assert.match(aio.firmwareFinding('70.00.360A NA N'), /360.*352/);
  assert.match(aio.firmwareFinding('74.00.331A NA N'), /not recognized.*bypass/);
  assert.match(aio.firmwareFinding('59.01.502A'), /nonzero middle/);
  assert.match(aio.firmwareFinding('59.00.500A'), /USB Audio Mod is skipped/);
  assert.doesNotMatch(aio.firmwareFinding('59.00.499A'), /USB Audio Mod is skipped/);
  for (const firmware of ['55.00.000', '56.00.000', '58.00.000', '59.00.000', '70.00.360', '74.00.324', '99.00.000']) {
    assert.equal(aio.plan(['background'], firmware, 'gen1').vehicleAllowed, false);
  }
  assert.match(aio.plan(['background'], '56.00.000', 'gen2').finding, /Gen 2 is unsupported/);
});

test('callers cannot mutate catalog or provenance through a returned plan', () => {
  const plan = aio.plan(['background'], '', 'unknown');
  plan.features[0].path = 'untrusted';
  plan.provenance.commit = 'untrusted';
  aio.features()[0].name = 'untrusted';
  assert.notEqual(aio.features()[0].name, 'untrusted');
  assert.notEqual(aio.plan(['background'], '', 'unknown').features[0].path, 'untrusted');
  assert.notEqual(aio.provenance().commit, 'untrusted');
});
