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

function createErasePlan(device, files, options) {
  const requiredBytes = files.reduce(function (sum, file) { return sum + file.data.length; }, 0);
  const verdict = assessCandidate(device, Object.assign({}, options, { requiredBytes: requiredBytes }));
  if (!verdict.ok) { throw new Error('Drive rejected: ' + verdict.reasons.join(' ')); }
  const seen = {};
  files.forEach(function (file) {
    if (!safePath(file.path)) { throw new Error('Unsafe package path: ' + JSON.stringify(file.path)); }
    if (isSidecar(file.path)) { throw new Error('Package must not contain OS metadata file: ' + file.path); }
    const key = file.path.toLowerCase();
    if (seen[key]) { throw new Error('Duplicate package path (case-insensitive): ' + file.path); }
    seen[key] = true;
  });
  return {
    deviceId: device.id,
    fingerprint: fingerprint(device),
    phrase: confirmationPhrase(device),
    requiredBytes: requiredBytes,
    files: files.map(function (file) {
      return { path: file.path, size: file.data.length, sha256: crypto.createHash('sha256').update(file.data).digest('hex') };
    })
  };
}

/* Returns a result object rather than throwing for expected failures.
 * driveState is honest about what happened to the drive: 'untouched', 'erased-incomplete' or 'written-verified'. */
async function prepareDrive(plan, files, confirmation, adapter, options) {
  options = options || {};
  const signal = options.signal;
  const progress = options.onProgress || function () {};
  var driveState = 'untouched';
  function fail(status, message) { return { status: status, driveState: driveState, message: message }; }

  if (confirmation !== plan.phrase) { return fail('rejected', 'Confirmation phrase does not match.'); }
  async function recheck() {
    const current = await adapter.describe(plan.deviceId);
    if (!current || fingerprint(current) !== plan.fingerprint) { return 'Drive identity changed or drive disappeared.'; }
    const verdict = assessCandidate(current, { maxBytes: options.maxBytes, requiredBytes: plan.requiredBytes });
    return verdict.ok ? null : verdict.reasons.join(' ');
  }
  try {
    var problem = await recheck();
    if (problem) { return fail('rejected', problem); }
    if (signal && signal.aborted) { return fail('cancelled', 'Cancelled before erasing.'); }
    problem = await recheck();
    if (problem) { return fail('rejected', problem); }

    driveState = 'erased-incomplete';
    progress({ step: 'erase' });
    await adapter.erase(plan.deviceId);
    for (var i = 0; i < files.length; i++) {
      if (signal && signal.aborted) { return fail('cancelled', 'Cancelled during writing; drive was erased and is incomplete.'); }
      problem = await recheck();
      if (problem) { return fail('failed', problem + ' Drive is incomplete.'); }
      progress({ step: 'write', path: files[i].path });
      await adapter.writeFile(plan.deviceId, files[i].path, files[i].data);
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
