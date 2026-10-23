'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../simulator/capabilities.js');
const { create } = require('../simulator/controller.js');
const mock = require('../simulator/mock-adapter.js');
const complete = { generation: 'gen1', model: 'MX-5 Miata GT', year: '2022', firmware: '74.00.324A', region: 'self-reported-region', market: 'self-reported-market', hardware: 'self-reported-unit' };

test('empty target lists missing identification and cannot authorize a vehicle', () => {
  const assessment = policy.assessTarget({});
  assert.equal(assessment.status, 'incomplete');
  assert.equal(assessment.missing.length, 7);
  assert.equal(assessment.vehicleAllowed, false);
});

test('complete identifiers and familiar firmware numbers remain unqualified', () => {
  for (const firmware of ['70.00.335', '74.00.324A', 'future-version']) {
    const assessment = policy.assessTarget({ ...complete, firmware });
    assert.equal(assessment.status, 'unqualified');
    assert.equal(assessment.vehicleAllowed, false);
  }
});

test('Gen 2 is unsupported and never inferred from model year or version prefix', () => {
  assert.equal(policy.assessTarget({ ...complete, generation: 'gen2' }).status, 'unsupported');
  assert.equal(policy.assessTarget({ ...complete, generation: 'unknown' }).status, 'incomplete');
});

test('invalid generation, year, overlong and control-containing fields do not become evidence', () => {
  for (const [field, value] of [['generation', 'qualified'], ['year', '2022-or-2023'], ['firmware', 'x'.repeat(129)], ['hardware', 'unit\x00spoof']]) {
    const assessment = policy.assessTarget({ ...complete, [field]: value });
    assert.equal(assessment.status, 'invalid');
    assert.ok(assessment.invalid.includes(field));
    assert.equal(assessment.vehicleAllowed, false);
  }
});

test('target input uses own string fields only and ignores self-asserted qualification', () => {
  const input = Object.create(complete);
  input.qualified = true;
  assert.equal(policy.assessTarget(input).status, 'incomplete');
  let reads = 0;
  Object.defineProperty(input, 'firmware', { get() { reads++; return '74.00.324A'; } });
  assert.equal(policy.assessTarget(input).status, 'incomplete');
  assert.equal(reads, 0);
  assert.equal(policy.assessTarget({ ...complete, qualified: true, recoveryVerified: true }).status, 'unqualified');
});

test('feature catalog copies cannot change execution policy', () => {
  const items = policy.features();
  items[0].id = 'unlock-everything';
  items.length = 0;
  assert.equal(policy.features().length, 4);
  assert.equal(policy.evaluate({ featureId: 'unlock-everything', environment: 'desktop-simulation', adapterKind: 'in-memory-mock' }).allowed, false);
});

test('every known feature permits explicitly declared desktop mock execution only', () => {
  for (const feature of policy.features()) {
    assert.equal(policy.evaluate({ featureId: feature.id, environment: 'desktop-simulation', adapterKind: 'in-memory-mock' }).allowed, true);
    for (const adapterKind of [undefined, 'vehicle', 'unknown', 'IN-MEMORY-MOCK']) {
      assert.equal(policy.evaluate({ featureId: feature.id, environment: 'desktop-simulation', adapterKind }).allowed, false);
    }
  }
});

test('all vehicle features stay denied even with complete identifiers and forged approval flags', () => {
  for (const feature of policy.features()) {
    const result = policy.evaluate({ featureId: feature.id, environment: 'vehicle', adapterKind: 'in-memory-mock', target: { ...complete, qualified: true }, force: true });
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'vehicle-unavailable');
  }
});

test('unknown features, prototype keys, and environments default to denial', () => {
  for (const featureId of ['__proto__', 'constructor', '', 'firmware-flash']) {
    assert.equal(policy.evaluate({ featureId, environment: 'desktop-simulation', adapterKind: 'in-memory-mock' }).allowed, false);
  }
  for (const environment of [undefined, 'live', 'bench', '']) {
    assert.equal(policy.evaluate({ featureId: 'reboot', environment, adapterKind: 'in-memory-mock' }).allowed, false);
  }
});

test('controller rejects vehicle mode before any adapter methods or logger access', () => {
  const adapter = mock.create();
  const original = { ...adapter.log };
  const controller = create({ adapter, environment: 'vehicle', target: complete, scheduler: { setTimeout() { throw new Error('no timers expected'); }, clearTimeout() {} } });
  controller.open();
  for (const name of ['terminal', 'restart', 'region', 'enableLogging']) { assert.equal(controller[name](), false); }
  assert.equal(adapter.calls.length, 0);
  assert.deepEqual(adapter.log, original);
});

test('missing or getter-based adapter identity cannot reach mock callbacks', () => {
  for (const getter of [false, true]) {
    const adapter = mock.create();
    delete adapter.kind;
    let reads = 0;
    if (getter) { Object.defineProperty(adapter, 'kind', { get() { reads++; return 'in-memory-mock'; } }); }
    const controller = create({ adapter, scheduler: { setTimeout() { throw new Error('no timers expected'); }, clearTimeout() {} } });
    controller.open();
    for (const name of ['terminal', 'restart', 'region', 'enableLogging']) { assert.equal(controller[name](), false); }
    assert.equal(adapter.calls.length, 0);
    assert.equal(reads, 0);
  }
});

test('revoking the mock declaration between steps blocks subsequent requests', () => {
  const adapter = mock.create(); const queue = [];
  const controller = create({ adapter, scheduler: { setTimeout(fn) { queue.push(fn); return queue.length; }, clearTimeout() {} } });
  controller.open(); controller.terminal();
  adapter.kind = 'vehicle';
  queue.shift()();
  assert.equal(adapter.calls.length, 1);
  assert.equal(controller.snapshot().state, 'error');
  assert.equal(queue.length, 0);
});

test('a capability disappearing between steps stops the diagnostic sequence', () => {
  const adapter = mock.create(); const queue = [];
  const controller = create({ adapter, scheduler: { setTimeout(fn) { queue.push(fn); return queue.length; }, clearTimeout() {} } });
  controller.open(); controller.terminal();
  delete adapter.sendEvent;
  queue.shift()();
  assert.equal(adapter.calls.length, 1);
  assert.equal(controller.snapshot().state, 'error');
  assert.equal(queue.length, 0);
});
