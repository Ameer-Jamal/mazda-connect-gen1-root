'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../simulator/setup-model.js');
const target = overrides => Object.assign({ generation: 'unknown', model: '', year: '', firmware: '', region: '', market: '' }, overrides);
function reviewed(model) {
  model.setTarget(target()); model.next(); model.select('background', true); model.next(); model.acknowledge(true); model.next();
}

test('complete planning sequence exports metadata and ends before unavailable USB/car stages', () => {
  const model = create();
  reviewed(model);
  const plan = model.exportPlan();
  assert.equal(plan.executable, false);
  assert.equal(plan.vehicleAllowed, false);
  assert.equal(plan.desktopFlow.usbPrepared, false);
  assert.equal(plan.desktopFlow.installationAvailable, false);
  model.markDownloadRequested();
  assert.match(model.snapshot().message, /Download requested/);
  model.next();
  for (let i = 0; i < 5; i++) { model.next(); }
  assert.equal(model.snapshot().step, 4);
  assert.match(model.snapshot().message, /unavailable/);
});

test('empty selections, missing review and missing download prevent forward progress', () => {
  const model = create(); model.next();
  assert.equal(model.next().step, 1);
  assert.match(model.snapshot().message, /at least one/);
  model.select('background', true); model.next();
  assert.equal(model.next().step, 2);
  assert.match(model.snapshot().message, /Confirm/);
  model.acknowledge(true); model.next();
  assert.equal(model.next().step, 3);
  assert.match(model.snapshot().message, /Request your plan/);
});

test('target and feature edits invalidate review and download state; invalid targets are atomic', () => {
  const model = create(); reviewed(model); model.markDownloadRequested();
  model.select('album-art', true);
  assert.equal(model.snapshot().acknowledged, false);
  assert.equal(model.snapshot().downloadRequested, false);
  assert.throws(() => model.exportPlan(), /Review/);
  const before = model.snapshot();
  assert.throws(() => model.setTarget(target({ year: 'oops', firmware: '74.00.324A' })), /four-digit/);
  assert.deepEqual(model.snapshot(), before);
  model.setTarget(target({ firmware: '74.00.324A' }));
  assert.equal(model.snapshot().acknowledged, false);
  assert.match(model.snapshot().plan.finding, /bypass/);
});

test('unknown, Gen 1, Gen 2 and forged qualification never enable vehicle stages', () => {
  for (const generation of ['unknown', 'gen1', 'gen2']) {
    const model = create(); model.setTarget(target({ generation, firmware: '70.00.335A' }));
    model.next(); model.select('android-auto', true); model.next(); model.acknowledge(true); model.next();
    const plan = model.exportPlan();
    assert.equal(plan.vehicleAllowed, false);
    assert.equal(model.snapshot().vehicleAllowed, false);
    if (generation === 'gen2') { assert.match(plan.finding, /unsupported/); }
    model.snapshot().vehicleAllowed = true;
    assert.equal(model.snapshot().vehicleAllowed, false);
  }
});

test('invalid own fields, getters, overlong input, selection and acknowledgement are rejected', () => {
  const model = create();
  let getterCalled = false;
  const input = target();
  Object.defineProperty(input, 'model', { get() { getterCalled = true; return 'bad'; } });
  assert.throws(() => model.setTarget(input), /identification/);
  assert.equal(getterCalled, false);
  for (const values of [{ generation: 'gen3' }, { year: '22' }, { firmware: 'x'.repeat(129) }, { model: 'a\u0000b' }]) {
    assert.throws(() => model.setTarget(target(values)));
  }
  assert.throws(() => model.setTarget(Object.create(target())), /identification/);
  assert.throws(() => model.select('__proto__', true), /selection/);
  assert.throws(() => model.select('background', 'true'), /selection/);
  assert.throws(() => model.acknowledge('true'), /acknowledgement/);
});

test('going back retains choices, returned values do not mutate state, duplicate selection stays unique', () => {
  const model = create(); reviewed(model);
  model.select('background', true);
  assert.equal(model.snapshot().selected.length, 1);
  const snapshot = model.snapshot(); snapshot.selected.push('bad'); snapshot.target.firmware = 'bad';
  assert.equal(model.snapshot().selected.length, 1);
  assert.equal(model.snapshot().target.firmware, '');
  for (let i = 0; i < 6; i++) { model.back(); }
  assert.equal(model.snapshot().step, 0);
  assert.deepEqual(model.snapshot().selected, ['background']);
});

test('review-plan export excludes private identification details and cannot run outside the save step', () => {
  const model = create();
  assert.throws(() => model.exportPlan(), /Review/);
  model.setTarget(target({ model: 'private-model', year: '2022', region: 'private-region', market: 'private-market', firmware: '74.00.324A' }));
  model.next(); model.select('background', true); model.next(); model.acknowledge(true); model.next();
  const data = JSON.stringify(model.exportPlan());
  for (const text of ['private-model', 'private-region', 'private-market', '2022']) { assert.ok(!data.includes(text)); }
  assert.ok(data.includes('74.00.324A'));
  model.markDownloadRequested(); model.next();
  assert.throws(() => model.exportPlan(), /Review/);
});
