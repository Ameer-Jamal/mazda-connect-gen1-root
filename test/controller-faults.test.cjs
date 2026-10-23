'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../simulator/controller.js');
const mock = require('../simulator/mock-adapter.js');

function setup(adapter = mock.create(), onChange = () => {}) {
  if (adapter) { adapter.kind = 'in-memory-mock'; }
  const pending = new Map();
  let id = 0;
  const scheduler = {
    setTimeout(fn) { pending.set(++id, fn); return id; },
    clearTimeout(key) { pending.delete(key); }
  };
  const controller = create({ adapter, scheduler, onChange });
  controller.open();
  return { controller, adapter, scheduler, pending };
}

test('frozen logger is rejected without throwing or leaving partial patches', () => {
  const adapter = mock.create();
  const original = { ...adapter.log };
  Object.freeze(adapter.log);
  const { controller } = setup(adapter);
  assert.equal(controller.enableLogging(), false);
  assert.equal(controller.snapshot().state, 'error');
  assert.equal(controller.snapshot().logging, false);
  assert.deepEqual(adapter.log, original);
  assert.equal(controller.close(), true);
});

test('partially non-writable logger fails before replacing any method', () => {
  const adapter = mock.create();
  const original = { ...adapter.log };
  Object.defineProperty(adapter.log, 'warn', { writable: false });
  const { controller } = setup(adapter);
  assert.equal(controller.enableLogging(), false);
  assert.deepEqual(adapter.log, original);
  assert.equal(controller.snapshot().logging, false);
});

test('logger accessors are rejected without executing their getter', () => {
  const adapter = mock.create(); let reads = 0;
  Object.defineProperty(adapter.log, 'warn', { get() { reads++; throw new Error('getter must not execute'); } });
  const { controller } = setup(adapter);
  assert.equal(controller.enableLogging(), false);
  assert.equal(reads, 0);
  assert.equal(controller.snapshot().logging, false);
});

test('external logger replacement is preserved during close', () => {
  const { controller, adapter } = setup();
  controller.enableLogging();
  const replacement = function () {};
  adapter.log.info = replacement;
  controller.close();
  assert.equal(adapter.log.info, replacement);
  assert.equal(controller.snapshot().logging, false);
  assert.match(controller.snapshot().entries.map(e => e.message).join('\n'), /external logging change/i);
});

test('a wrapper locked by another owner cannot block teardown or swallow later source logs', () => {
  const { controller, adapter } = setup();
  const original = { ...adapter.log };
  controller.enableLogging();
  Object.defineProperty(adapter.log, 'warn', { writable: false });
  assert.equal(controller.close(), true);
  assert.equal(controller.snapshot().state, 'closed');
  assert.equal(controller.snapshot().logging, false);
  assert.equal(adapter.log.error, original.error);
  assert.equal(adapter.log.info, original.info);
  const count = controller.snapshot().entries.length;
  adapter.log.warn('source still works');
  assert.equal(adapter.calls.at(-1).args[0], 'source still works');
  assert.equal(controller.snapshot().entries.length, count);
});

test('unprintable and oversized source logs do not break forwarding or the memory bound', () => {
  const { controller, adapter } = setup();
  controller.enableLogging();
  const hostile = { toString() { throw new Error('conversion failure'); } };
  adapter.log.info(hostile, 'second argument');
  assert.equal(adapter.calls.at(-1).args[0], hostile);
  assert.equal(adapter.calls.at(-1).args[1], 'second argument');
  assert.match(controller.snapshot().entries.at(-1).message, /unprintable/i);
  adapter.log.info('x'.repeat(20000));
  assert.ok(controller.snapshot().entries.at(-1).message.length <= 4096);
});

test('observer failure before an operation stops requests and exposes an error snapshot', () => {
  const { controller, adapter, pending } = setup(undefined, state => {
    if (state.state === 'running') { throw new Error('renderer fault'); }
  });
  assert.equal(controller.terminal(), false);
  assert.equal(controller.snapshot().state, 'error');
  assert.equal(adapter.calls.length, 0);
  assert.equal(pending.size, 0);
});

test('observer failure during logging does not swallow the original call or return value', () => {
  const adapter = mock.create(); let forwarded = 0;
  adapter.log.info = function () { forwarded++; return 73; };
  let fail = false;
  const { controller } = setup(adapter, () => { if (fail) { throw new Error('render fault'); } });
  controller.enableLogging(); fail = true;
  assert.equal(adapter.log.info('keep source logging'), 73);
  assert.equal(forwarded, 1);
  assert.equal(controller.snapshot().state, 'error');
  assert.equal(controller.close(), true);
});

test('timer cancellation failure cannot revive a closed session', () => {
  const { controller, adapter, scheduler, pending } = setup();
  controller.terminal();
  const stale = [...pending.values()][0];
  scheduler.clearTimeout = () => { throw new Error('cancel fault'); };
  assert.equal(controller.close(), true);
  assert.equal(controller.snapshot().state, 'closed');
  controller.open(); stale();
  assert.equal(adapter.calls.length, 1);
});

test('close remains closed if an adapter closes the session and then throws', () => {
  const { controller, adapter } = setup();
  adapter.setRegion = () => { controller.close(); throw new Error('late adapter fault'); };
  controller.region();
  assert.equal(controller.snapshot().state, 'closed');
});

test('original logger exceptions propagate with their original identity', () => {
  const adapter = mock.create();
  const originalError = new Error('original logger failure');
  adapter.log.info = () => { throw originalError; };
  const { controller } = setup(adapter);
  controller.enableLogging();
  assert.throws(() => adapter.log.info('message'), error => error === originalError);
  assert.equal(controller.close(), true);
});

test('observer failure between steps schedules no new work and source logging is restored', () => {
  const adapter = mock.create();
  const original = { ...adapter.log };
  const { controller, pending } = setup(adapter, snapshot => {
    if (snapshot.entries.some(e => e.message === 'Mock event: diag / ActivateJCITest')) { throw new Error('late renderer failure'); }
  });
  controller.enableLogging(); controller.terminal();
  const [id, next] = [...pending.entries()][0];
  pending.delete(id); next();
  assert.equal(controller.snapshot().state, 'error');
  assert.equal(pending.size, 0);
  assert.equal(adapter.calls.length, 2);
  assert.deepEqual(adapter.log, original);
});

test('failure cancelling an expired timer does not prevent cancellation of the live timer', () => {
  const { controller, scheduler, pending } = setup();
  controller.terminal();
  const [expiredId, next] = [...pending.entries()][0];
  pending.delete(expiredId); next();
  scheduler.clearTimeout = id => {
    if (id === expiredId) { throw new Error('expired timer fault'); }
    pending.delete(id);
  };
  controller.close();
  assert.equal(pending.size, 0);
  assert.equal(controller.snapshot().state, 'closed');
});
