'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const safety = require('../desktop-core/drive-safety.cjs');
const { createImage } = require('./fixtures/disk-image-adapter.cjs');

const GIB = 1024 * 1024 * 1024;
const stick = { id: 'disk-7', serial: 'SN123', vendor: 'Acme', model: 'Stick', sizeBytes: 16 * GIB, bus: 'usb', removable: true, internal: false, isSystem: false, readOnly: false };
const files = [{ path: 'config/a.txt', data: Buffer.from('alpha') }, { path: 'b.bin', data: Buffer.from('beta') }];

test('eligible removable USB stick passes; every other kind of disk is rejected with reasons', () => {
  assert.equal(safety.assessCandidate(stick).ok, true);
  const bad = [
    { internal: true }, { isSystem: true }, { removable: false }, { bus: 'nvme' }, { readOnly: true },
    { serial: '' }, { sizeBytes: 2 * 1024 * GIB }, { sizeBytes: 0 }, { internal: undefined }, { isSystem: undefined }
  ];
  for (const patch of bad) {
    const verdict = safety.assessCandidate({ ...stick, ...patch });
    assert.equal(verdict.ok, false, JSON.stringify(patch));
    assert.ok(verdict.reasons.length > 0);
  }
});

test('listCandidates returns every device with a verdict and selects none', () => {
  const list = safety.listCandidates([stick, { ...stick, id: 'disk-0', isSystem: true }]);
  assert.deepEqual(list.map((c) => c.eligible), [true, false]);
});

test('plan rejects too-small drives and unsafe or duplicate package paths', () => {
  assert.throws(() => safety.createErasePlan({ ...stick, sizeBytes: 3 }, files), /Too small/);
  for (const path of ['../x', '/abs', 'a//b', 'a/../b', 'a\\b', 'a:b', 'x.', 'a\nb', '']) {
    assert.throws(() => safety.createErasePlan(stick, [{ path, data: Buffer.from('x') }]), /Unsafe/, path);
  }
  assert.throws(() => safety.createErasePlan(stick, [files[0], files[0]]), /Duplicate/);
});

test('successful run erases, writes, verifies and reports written-verified', async () => {
  const image = createImage(stick);
  const plan = safety.createErasePlan(stick, files);
  image.files.set('old.txt', Buffer.from('old'));
  const result = await safety.prepareDrive(plan, files, plan.phrase, image);
  assert.equal(result.status, 'ok');
  assert.equal(result.driveState, 'written-verified');
  assert.deepEqual([...image.files.keys()].sort(), ['b.bin', 'config/a.txt']);
});

test('wrong or missing confirmation never touches the drive', async () => {
  const image = createImage(stick);
  const plan = safety.createErasePlan(stick, files);
  for (const phrase of ['', 'yes', 'erase SN123 16GiB', undefined]) {
    const result = await safety.prepareDrive(plan, files, phrase, image);
    assert.equal(result.status, 'rejected');
    assert.equal(result.driveState, 'untouched');
  }
  assert.ok(!image.calls.includes('erase'));
});

test('identity change or disappearance before erase is rejected without erasing', async () => {
  const plan = safety.createErasePlan(stick, files);
  for (const replacement of [{ ...stick, serial: 'OTHER' }, { ...stick, sizeBytes: 8 * GIB }, null, { ...stick, isSystem: true }]) {
    const image = createImage(stick, { onDescribe: () => replacement });
    const result = await safety.prepareDrive(plan, files, plan.phrase, image);
    assert.equal(result.status, 'rejected');
    assert.equal(result.driveState, 'untouched');
    assert.ok(!image.calls.includes('erase'));
  }
});

test('identity change mid-write stops further writes and reports an incomplete drive', async () => {
  const plan = safety.createErasePlan(stick, files);
  let swapped = false;
  const image = createImage(stick, { afterWrite: () => { swapped = true; }, onDescribe: () => (swapped ? { ...stick, serial: 'SWAPPED' } : undefined) });
  const result = await safety.prepareDrive(plan, files, plan.phrase, image);
  assert.equal(result.status, 'failed');
  assert.equal(result.driveState, 'erased-incomplete');
  assert.ok(!image.calls.includes('write:b.bin'));
});

test('cancellation before erase leaves drive untouched; during writing reports erased-incomplete', async () => {
  const plan = safety.createErasePlan(stick, files);
  const early = new AbortController(); early.abort();
  const image1 = createImage(stick);
  const r1 = await safety.prepareDrive(plan, files, plan.phrase, image1, { signal: early.signal });
  assert.equal(r1.status, 'cancelled'); assert.equal(r1.driveState, 'untouched'); assert.ok(!image1.calls.includes('erase'));

  const late = new AbortController();
  const image2 = createImage(stick, { afterWrite: () => late.abort() });
  const r2 = await safety.prepareDrive(plan, files, plan.phrase, image2, { signal: late.signal });
  assert.equal(r2.status, 'cancelled'); assert.equal(r2.driveState, 'erased-incomplete');
});

test('write error and silent corruption are reported as failures, never as success', async () => {
  const plan = safety.createErasePlan(stick, files);
  const r1 = await safety.prepareDrive(plan, files, plan.phrase, createImage(stick, { failWrite: 'b.bin' }));
  assert.equal(r1.status, 'failed'); assert.equal(r1.driveState, 'erased-incomplete'); assert.match(r1.message, /simulated I\/O error/);
  const r2 = await safety.prepareDrive(plan, files, plan.phrase, createImage(stick, { corrupt: 'config/a.txt' }));
  assert.equal(r2.status, 'failed'); assert.match(r2.message, /Verification failed/);
});

test('adapter that leaves extra files behind fails verification', async () => {
  const plan = safety.createErasePlan(stick, files);
  const image = createImage(stick);
  image.erase = async () => { image.calls.push('erase'); };
  image.files.set('leftover.txt', Buffer.from('x'));
  const result = await safety.prepareDrive(plan, files, plan.phrase, image);
  assert.equal(result.status, 'failed');
  assert.match(result.message, /Unexpected files/);
});

test('confirmation phrase names the serial and size so a different drive needs a different phrase', () => {
  assert.notEqual(safety.confirmationPhrase(stick), safety.confirmationPhrase({ ...stick, serial: 'SN999' }));
  assert.notEqual(safety.confirmationPhrase(stick), safety.confirmationPhrase({ ...stick, sizeBytes: 32 * GIB }));
});

test('literal launcher names with shell metacharacters and spaces are valid data and written verbatim', async () => {
  const launcher = '$(touch pwned).up';
  const pkg = [{ path: launcher, data: Buffer.from('l') }, { path: 'my patches/p.sh', data: Buffer.from('p') }];
  const plan = safety.createErasePlan(stick, pkg);
  const image = createImage(stick);
  const result = await safety.prepareDrive(plan, pkg, plan.phrase, image);
  assert.equal(result.status, 'ok');
  assert.ok(image.files.has(launcher));
});

test('case-insensitive duplicates and packaged OS metadata are rejected', () => {
  assert.throws(() => safety.createErasePlan(stick, [{ path: 'A.txt', data: Buffer.from('1') }, { path: 'a.txt', data: Buffer.from('2') }]), /case-insensitive/);
  for (const path of ['._x.up', 'dir/._x', '.DS_Store', '.Spotlight-V100/x', 'sub/.DS_Store']) {
    assert.throws(() => safety.createErasePlan(stick, [{ path, data: Buffer.from('x') }]), /metadata/, path);
  }
});

test('sidecars added by the OS after writing are removed; a drive that keeps them fails', async () => {
  const plan = safety.createErasePlan(stick, files);
  const add = (image) => { const w = image.writeFile; image.writeFile = async (...a) => { await w(...a); image.files.set('._b.bin', Buffer.from('x')); image.files.set('.DS_Store', Buffer.from('x')); }; return image; };
  const cleaned = add(createImage(stick));
  const r1 = await safety.prepareDrive(plan, files, plan.phrase, cleaned);
  assert.equal(r1.status, 'ok');
  assert.ok(!cleaned.files.has('._b.bin') && !cleaned.files.has('.DS_Store'));
  const r2 = await safety.prepareDrive(plan, files, plan.phrase, add(createImage(stick, { noRemove: true })));
  assert.equal(r2.status, 'failed');
  assert.match(r2.message, /Unexpected files/);
});
