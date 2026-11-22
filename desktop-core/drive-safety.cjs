'use strict';
/* Drive-preparation safety core. Logic only: it never touches a real device.
 * All device access goes through an injected adapter (see test/fixtures/disk-image-adapter.cjs).
 * A real OS adapter does not exist; passing this module's checks is not vehicle qualification. */
const crypto = require('node:crypto');

const GIB = 1024 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 64 * GIB;

function fingerprint(device) {
  const parts = [device.id, device.serial, device.vendor, device.model, device.sizeBytes, device.bus];
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function assessCandidate(device, options) {
  options = options || {};
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const requiredBytes = options.requiredBytes || 0;
  const reasons = [];
  if (!device || typeof device !== 'object') { return { ok: false, reasons: ['No device.'] }; }
  if (!device.id || !device.serial) { reasons.push('Device has no stable id and serial, so its identity cannot be rechecked.'); }
  if (device.bus !== 'usb') { reasons.push('Not a USB device.'); }
  if (device.removable !== true) { reasons.push('Not reported as removable.'); }
  if (device.internal !== false) { reasons.push('Internal or unknown-location disk.'); }
  if (device.isSystem !== false) { reasons.push('System, boot or data disk, or status unknown.'); }
  if (device.readOnly !== false) { reasons.push('Read-only or unknown write protection.'); }
  if (!Number.isSafeInteger(device.sizeBytes) || device.sizeBytes <= 0) { reasons.push('Unknown capacity.'); }
  else if (device.sizeBytes > maxBytes) { reasons.push('Larger than the ' + Math.round(maxBytes / GIB) + ' GiB limit; likely not a small USB stick.'); }
  else if (device.sizeBytes < requiredBytes) { reasons.push('Too small: needs ' + requiredBytes + ' bytes, has ' + device.sizeBytes + '.'); }
  return { ok: reasons.length === 0, reasons: reasons };
}

/* Names are data, never shell text: literal launcher names such as "$(x).up" are valid and are only ever passed to the adapter.
 * Rejected: structure that escapes the volume or breaks FAT-style filesystems. */
function safePath(path) {
  if (typeof path !== 'string' || !path || path.length > 1024) { return false; }
  if (/[\x00-\x1f\x7f\\:*?"<>|]/.test(path)) { return false; }
  return path.split('/').every(function (segment) {
    return segment && segment !== '.' && segment !== '..' && segment.length <= 255 && !/[. ]$/.test(segment);
  });
}

/* Files macOS/Finder add on their own; "._<launcher>" AppleDouble files can stop the CMU detecting the update. */
function isSidecar(path) {
  const parts = path.split('/');
  return parts.some(function (part) { return part.indexOf('._') === 0; }) ||
    ['.DS_Store', '.Spotlight-V100', '.fseventsd', '.Trashes', '.TemporaryItems'].indexOf(parts[0]) !== -1 ||
    parts[parts.length - 1] === '.DS_Store';
}

function confirmationPhrase(device) {
  return 'ERASE ' + device.serial + ' ' + Math.round(device.sizeBytes / GIB * 10) / 10 + 'GiB';
}

/* Candidate list for the UI: every device is returned with its verdict; nothing is auto-selected. */
function listCandidates(devices, options) {
  return devices.map(function (device) {
    var verdict = assessCandidate(device, options);
    return { device: device, eligible: verdict.ok, reasons: verdict.reasons };
  });
}

/* FAT is case-insensitive, so "Config" (file) and "config/a.txt" collide, and "Dir/a" plus "dir/b" share one directory
 * whose on-disk spelling would not match the plan. Returns a problem string or null. */
function manifestPathProblem(paths) {
  const filesByKey = new Map();
  const dirsByKey = new Map();
  for (const path of paths) {
    if (!safePath(path)) { return 'Unsafe package path: ' + JSON.stringify(path); }
    if (isSidecar(path)) { return 'Package must not contain OS metadata file: ' + path; }
    const key = path.toLowerCase();
    if (filesByKey.has(key)) { return 'Duplicate package path (case-insensitive): ' + path; }
    filesByKey.set(key, path);
  }
  for (const path of paths) {
    const segments = path.split('/');
    for (var k = 1; k < segments.length; k++) {
      const dir = segments.slice(0, k).join('/');
      const key = dir.toLowerCase();
      if (filesByKey.has(key)) { return 'Package path ' + path + ' needs directory ' + dir + ' but ' + filesByKey.get(key) + ' is a file (case-insensitive).'; }
      if (dirsByKey.has(key) && dirsByKey.get(key) !== dir) { return 'Directory spelled with different case: ' + dirsByKey.get(key) + ' and ' + dir; }
      dirsByKey.set(key, dir);
    }
  }
  return null;
}

function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

function createErasePlan(device, files, options) {
  files.forEach(function (file) {
    if (!(file.data instanceof Uint8Array)) { throw new Error('Package data must be bytes: ' + JSON.stringify(file.path)); }
  });
  const requiredBytes = files.reduce(function (sum, file) { return sum + file.data.length; }, 0);
  const verdict = assessCandidate(device, Object.assign({}, options, { requiredBytes: requiredBytes }));
  if (!verdict.ok) { throw new Error('Drive rejected: ' + verdict.reasons.join(' ')); }
  const problem = manifestPathProblem(files.map(function (file) { return file.path; }));
  if (problem) { throw new Error(problem); }
  return Object.freeze({
    deviceId: device.id,
    fingerprint: fingerprint(device),
    phrase: confirmationPhrase(device),
    requiredBytes: requiredBytes,
    files: Object.freeze(files.map(function (file) {
      return Object.freeze({ path: file.path, size: file.data.length, sha256: sha256(file.data) });
    }))
  });
}

/* Copies the approved plan and package bytes before the first await, so a caller mutating either during the run
 * cannot change what is erased, written or verified. The bytes must match the approved manifest exactly. */
function snapshotPlan(plan, files) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.files) || !Array.isArray(files)) { return { problem: 'Plan or package is malformed.' }; }
  const manifest = plan.files.map(function (entry) { return Object.freeze({ path: String(entry && entry.path), size: entry && entry.size, sha256: String(entry && entry.sha256) }); });
  if (files.length !== manifest.length) { return { problem: 'Package does not match the approved plan.' }; }
  const data = [];
  for (var i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || !(file.data instanceof Uint8Array)) { return { problem: 'Package data must be bytes.' }; }
    const copy = Buffer.from(file.data);
    if (file.path !== manifest[i].path || copy.length !== manifest[i].size || sha256(copy) !== manifest[i].sha256) {
      return { problem: 'Package does not match the approved plan at ' + JSON.stringify(file.path) + '.' };
    }
    data.push(copy);
  }
  const problem = manifestPathProblem(manifest.map(function (entry) { return entry.path; }));
  if (problem) { return { problem: problem }; }
  const requiredBytes = data.reduce(function (sum, bytes) { return sum + bytes.length; }, 0);
  return {
    plan: Object.freeze({ deviceId: plan.deviceId, fingerprint: plan.fingerprint, phrase: plan.phrase, requiredBytes: requiredBytes, files: Object.freeze(manifest) }),
    data: data
  };
}

/* Returns a result object rather than throwing for expected failures.
 * driveState is honest about what happened to the drive: 'untouched', 'erased-incomplete' or 'written-verified'. */
async function prepareDrive(approvedPlan, files, confirmation, adapter, options) {
  options = options || {};
  const signal = options.signal;
  const progress = options.onProgress || function () {};
  var driveState = 'untouched';
  function fail(status, message) { return { status: status, driveState: driveState, message: message }; }
  function cancelled() { return Boolean(signal && signal.aborted); }

  const snapshot = snapshotPlan(approvedPlan, files);
  if (snapshot.problem) { return fail('rejected', snapshot.problem); }
  const plan = snapshot.plan;
  if (confirmation !== plan.phrase) { return fail('rejected', 'Confirmation phrase does not match.'); }
  async function recheck() {
    const current = await adapter.describe(plan.deviceId);
    if (!current || fingerprint(current) !== plan.fingerprint || confirmationPhrase(current) !== plan.phrase) { return 'Drive identity changed or drive disappeared.'; }
    const verdict = assessCandidate(current, { maxBytes: options.maxBytes, requiredBytes: plan.requiredBytes });
    return verdict.ok ? null : verdict.reasons.join(' ');
  }
  try {
    // Cancellation is checked after every awaited recheck, so an abort that lands while waiting still stops the erase or write.
    var problem = await recheck();
    if (problem) { return fail('rejected', problem); }
    if (cancelled()) { return fail('cancelled', 'Cancelled before erasing.'); }
    problem = await recheck();
    if (problem) { return fail('rejected', problem); }
    if (cancelled()) { return fail('cancelled', 'Cancelled before erasing.'); }

    progress({ step: 'erase' });
    if (cancelled()) { return fail('cancelled', 'Cancelled before erasing.'); }
    driveState = 'erased-incomplete';
    await adapter.erase(plan.deviceId);
    for (var i = 0; i < plan.files.length; i++) {
      if (cancelled()) { return fail('cancelled', 'Cancelled during writing; drive was erased and is incomplete.'); }
      problem = await recheck();
      if (problem) { return fail('failed', problem + ' Drive is incomplete.'); }
      if (cancelled()) { return fail('cancelled', 'Cancelled during writing; drive was erased and is incomplete.'); }
      progress({ step: 'write', path: plan.files[i].path });
      if (cancelled()) { return fail('cancelled', 'Cancelled during writing; drive was erased and is incomplete.'); }
      await adapter.writeFile(plan.deviceId, plan.files[i].path, snapshot.data[i]);
    }
    for (var j = 0; j < plan.files.length; j++) {
      const expected = plan.files[j];
      const actual = await adapter.readFile(plan.deviceId, expected.path);
      const digest = actual ? crypto.createHash('sha256').update(actual).digest('hex') : null;
      if (digest !== expected.sha256) { return fail('failed', 'Verification failed for ' + expected.path + '. Drive is incomplete.'); }
      progress({ step: 'verify', path: expected.path });
    }
    var listed = await adapter.listFiles(plan.deviceId);
    const sidecars = listed.filter(isSidecar);
    if (sidecars.length) {
      if (typeof adapter.removeFile !== 'function') { return fail('failed', 'OS metadata files present and adapter cannot remove them: ' + sidecars.join(', ')); }
      for (var k = 0; k < sidecars.length; k++) { await adapter.removeFile(plan.deviceId, sidecars[k]); }
      listed = await adapter.listFiles(plan.deviceId);
    }
    const extra = listed.filter(function (p) { return !plan.files.some(function (f) { return f.path === p; }); });
    if (extra.length) { return fail('failed', 'Unexpected files on drive: ' + extra.join(', ')); }
    await adapter.flush(plan.deviceId);
    driveState = 'written-verified';
    return { status: 'ok', driveState: driveState, message: 'Written and verified against the plan. Eject before removing.' };
  } catch (error) {
    return fail('failed', 'Adapter error: ' + (error && error.message));
  }
}

module.exports = { safePath, isSidecar, assessCandidate, listCandidates, createErasePlan, prepareDrive, fingerprint, confirmationPhrase, DEFAULT_MAX_BYTES };
