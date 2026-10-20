'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../simulator/controller.js');
const mock = require('../simulator/mock-adapter.js');

function setup(adapter = mock.create()) {
  let queue = [];
  let nextId = 0;
  const scheduler = {
    setTimeout(fn, delay) { const id = ++nextId; queue.push({ id, fn, delay }); return id; },
    clearTimeout(id) { queue = queue.filter(item => item.id !== id); },
    tick() { const step = queue.shift(); assert.ok(step, 'a step is scheduled'); assert.equal(step.delay, 7000); step.fn(); },
    pending() { return queue.slice(); }
  };
  const changes = [];
  const controller = create({ adapter, scheduler, onChange: state => changes.push(state) });
  controller.open();
  return { adapter, scheduler, controller, changes };
}

test('terminal runs exactly three ordered mock events, with explicit progress and completion', () => {
  const { controller, adapter, scheduler } = setup();
  assert.equal(controller.terminal(), true);
  assert.equal(controller.snapshot().state, 'running');
  assert.equal(adapter.calls.length, 1);
  scheduler.tick();
  assert.equal(adapter.calls.length, 2);
  scheduler.tick();
  assert.deepEqual(adapter.calls, [
    { method: 'sendEvent', args: ['syssettings', 'SelectDiagnostics'] },
    { method: 'sendEvent', args: ['diag', 'ActivateJCITest'] },
    { method: 'sendEvent', args: ['diag', 'ReadDTC', { payload: { testId: 11 } }] }
  ]);
  assert.equal(controller.snapshot().state, 'complete');
  assert.equal(scheduler.pending().length, 0);
});

test('repeated and overlapping actions are rejected while busy', () => {
  const { controller, adapter, scheduler } = setup();
  controller.terminal();
  for (const name of ['terminal', 'restart', 'region', 'enableLogging']) {
    assert.equal(controller[name](), false);
  }
  assert.equal(adapter.calls.length, 1);
  assert.equal(scheduler.pending().length, 1);
});

test('closing before starting makes every action inert', () => {
  const { controller, adapter, scheduler } = setup();
  controller.close();
  for (const name of ['terminal', 'restart', 'region', 'enableLogging']) { assert.equal(controller[name](), false); }
  assert.equal(adapter.calls.length, 0);
  assert.equal(scheduler.pending().length, 0);
});

for (const completedSteps of [1, 2]) {
  test(`close after terminal step ${completedSteps} cancels queued work, including stale callbacks after reopen`, () => {
    const { controller, adapter, scheduler } = setup();
    controller.terminal();
    if (completedSteps === 2) { scheduler.tick(); }
    const stale = scheduler.pending()[0].fn;
    controller.close();
    assert.equal(scheduler.pending().length, 0);
    assert.equal(controller.snapshot().state, 'closed');
    controller.open();
    stale(); // Even a callback already dequeued by a scheduler must be inert.
    assert.equal(adapter.calls.length, completedSteps);
    assert.match(controller.snapshot().entries.map(e => e.message).join('\n'), /cannot be undone/);
  });
}

test('region and reboot have deterministic simulated outcomes', () => {
  const { controller, adapter, scheduler } = setup();
  controller.region();
  assert.deepEqual(adapter.calls[0], { method: 'setRegion', args: ['Region_Europe'] });
  assert.equal(controller.snapshot().state, 'complete');
  controller.restart();
  assert.deepEqual(adapter.calls[1], { method: 'showFatalError', args: ['reboot', 'xss'] });
  scheduler.tick();
  assert.deepEqual(adapter.calls[2], { method: 'restart', args: ['XSS'] });
  assert.equal(controller.snapshot().state, 'complete');
});

test('all reboot capabilities are checked before any call', () => {
  const adapter = mock.create(); delete adapter.restart;
  const { controller } = setup(adapter);
  assert.equal(controller.restart(), false);
  assert.equal(adapter.calls.length, 0);
  assert.equal(controller.snapshot().state, 'error');
  assert.match(controller.snapshot().entries.at(-1).message, /restart/);
});

test('missing adapter or logger produces a useful error', () => {
  const { controller } = setup(null);
  assert.equal(controller.terminal(), false);
  assert.equal(controller.snapshot().state, 'error');
  assert.equal(controller.enableLogging(), false);
  assert.match(controller.snapshot().entries.at(-1).message, /logger unavailable/);
});

test('immediate and delayed adapter exceptions stop the operation', () => {
  for (const failOn of [1, 2]) {
    let calls = 0;
    const { controller, scheduler } = setup({ sendEvent() { if (++calls === failOn) { throw new Error('mock fault'); } } });
    controller.terminal();
    if (failOn === 2) { scheduler.tick(); }
    assert.equal(controller.snapshot().state, 'error');
    assert.equal(scheduler.pending().length, 0);
    assert.match(controller.snapshot().entries.at(-1).message, /mock fault/);
  }
});

test('scheduler failure is reported and does not leave a running operation', () => {
  const controller = create({ adapter: mock.create(), scheduler: { setTimeout() { throw new Error('timer fault'); }, clearTimeout() {} } });
  controller.open(); controller.terminal();
  assert.equal(controller.snapshot().state, 'error');
  assert.match(controller.snapshot().entries.at(-1).message, /timer fault/);
});

test('logging is bounded, preserves receiver/arguments and restores functions across repeated sessions', () => {
  const adapter = mock.create();
  let received;
  adapter.log.info = function () { received = { receiver: this, args: Array.from(arguments) }; return 42; };
  const originals = { ...adapter.log };
  const { controller } = setup(adapter);
  for (let session = 0; session < 3; session++) {
    assert.equal(controller.enableLogging(), true);
    assert.equal(controller.enableLogging(), false);
    const wrapped = adapter.log.info;
    assert.equal(adapter.log.info('<img src=x onerror=alert(1)>', 'extra'), 42);
    assert.equal(received.receiver, adapter.log);
    assert.deepEqual(received.args, ['<img src=x onerror=alert(1)>', 'extra']);
    assert.equal(controller.snapshot().entries.at(-1).message, '<img src=x onerror=alert(1)>');
    for (let i = 0; i < 220; i++) { adapter.log.warn('entry ' + i); }
    assert.equal(controller.snapshot().entries.length, 200);
    assert.equal(controller.snapshot().entries.at(-1).message, 'entry 219');
    controller.close();
    assert.deepEqual(adapter.log, originals);
    const count = controller.snapshot().entries.length;
    wrapped('stale after close');
    assert.equal(controller.snapshot().entries.length, count);
    controller.open();
  }
});

test('snapshot mutation does not alter internal entries', () => {
  const { controller } = setup();
  controller.snapshot().entries[0].message = 'overwritten';
  assert.notEqual(controller.snapshot().entries[0].message, 'overwritten');
});

test('an old logging wrapper stays inert after a new logging session begins', () => {
  const { adapter, controller } = setup();
  controller.enableLogging();
  const oldWrapper = adapter.log.info;
  controller.close(); controller.open(); controller.enableLogging();
  const before = controller.snapshot().entries.length;
  oldWrapper('stale message');
  assert.equal(controller.snapshot().entries.length, before);
  assert.equal(adapter.calls.length, 0);
  adapter.log.info('current message');
  assert.equal(adapter.calls.length, 1);
});
