'use strict';
/* macOS drive adapter for drive-safety.cjs. Listing is read-only. Erasing is disabled unless the caller passes
 * `authorizedErase: { deviceId, serial }` naming one exact drive, and the drive is re-described and re-assessed
 * immediately before `diskutil eraseDisk`. Format: FAT32/MBR. Verified only with fixture command output plus the
 * read-only listing on one Mac; no erase has been run on real hardware. */
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const safety = require('./drive-safety.cjs');

function defaultRun(command, args, input) {
  return new Promise(function (resolve, reject) {
    const child = execFile(command, args, { timeout: 120000, maxBuffer: 32 * 1024 * 1024 }, function (error, stdout, stderr) {
      if (error) { error.message += ' ' + stderr; reject(error); } else { resolve(stdout); }
    });
    if (input !== undefined) { child.stdin.end(input); }
  });
}

function create(options) {
  options = options || {};
  const run = options.run || defaultRun;
  const label = options.label || 'MZD';
  const volumesRoot = options.volumesRoot || '/Volumes';
  const authorized = options.authorizedErase || null;
  if (!options.run && process.platform !== 'darwin') { throw new Error('macOS adapter on a non-macOS host.'); }
  if (!/^[A-Z0-9_]{1,11}$/.test(label)) { throw new Error('Invalid volume label.'); }
  function checkId(id) { if (!/^disk[0-9]+$/.test(id)) { throw new Error('Invalid disk identifier.'); } return id; }

  async function plist(args) {
    const xml = await run('diskutil', [args[0], '-plist'].concat(args.slice(1)));
    return JSON.parse(await run('plutil', ['-convert', 'json', '-o', '-', '-'], xml));
  }
  function mountPoints(node, found) {
    found = found || [];
    if (Array.isArray(node)) { node.forEach(function (n) { mountPoints(n, found); }); }
    else if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (key) {
        if ((key === 'MountPoint' || key === 'SnapshotMountPoint') && typeof node[key] === 'string' && node[key]) { found.push(node[key]); }
        else { mountPoints(node[key], found); }
      });
    }
    return found;
  }
  function usbSerials(node, map) {
    map = map || {};
    if (Array.isArray(node)) { node.forEach(function (n) { usbSerials(n, map); }); }
    else if (node && typeof node === 'object') {
      if (Array.isArray(node.Media)) {
        node.Media.forEach(function (media) {
          if (media && /^disk[0-9]+$/.test(media.bsd_name || '')) {
            map[media.bsd_name] = { serial: node.serial_num || '', vendor: node.manufacturer || node.vendor_id || '' };
          }
        });
      }
      Object.keys(node).forEach(function (key) { usbSerials(node[key], map); });
    }
    return map;
  }
  /* Whole disks that hold the running system: the parent of "/" and the physical stores behind it. Failure to determine means failure to list. */
  async function systemDisks() {
    const root = await plist(['info', '/']);
    const disks = {};
    if (root.ParentWholeDisk) { disks[root.ParentWholeDisk] = true; }
    (root.APFSPhysicalStores || []).forEach(function (store) {
      const whole = /^(disk[0-9]+)/.exec(store.APFSPhysicalStore || '');
      if (whole) { disks[whole[1]] = true; }
    });
    if (!Object.keys(disks).length) { throw new Error('Cannot determine the system disk.'); }
    return disks;
  }

  async function describeAll(onlyId) {
    const list = await plist(['list', 'external', 'physical']);
    const system = await systemDisks();
    const profiler = JSON.parse(await run('system_profiler', ['SPUSBDataType', 'SPUSBHostDataType', '-json']).catch(function () { return '{}'; }));
    const serials = usbSerials(profiler);
    const devices = [];
    for (const id of list.WholeDisks || []) {
      if (onlyId && id !== onlyId) { continue; }
      const info = await plist(['info', id]);
      const layout = await plist(['list', id]);
      const mounts = mountPoints(layout);
      const usb = serials[id] || {};
      devices.push({
        id: id,
        serial: usb.serial || '',
        vendor: usb.vendor || '',
        model: info.MediaName || '',
        sizeBytes: info.TotalSize || info.Size || 0,
        bus: info.BusProtocol === 'USB' ? 'usb' : String(info.BusProtocol || 'unknown').toLowerCase(),
        removable: info.RemovableMediaOrExternalDevice === true,
        internal: info.Internal !== false,
        isSystem: !!system[id] || mounts.some(function (m) { return m === '/' || m.indexOf('/System/Volumes') === 0; }),
        readOnly: info.WritableMedia !== true
      });
    }
    return devices;
  }

  async function mountFor(id) {
    const layout = (await plist(['list', checkId(id)])).AllDisksAndPartitions || [];
    const mounts = [];
    layout.forEach(function (disk) { mountPoints(disk.Partitions || []).forEach(function (m) { mounts.push(m); }); });
    if (mounts.length !== 1 || mounts[0].indexOf(volumesRoot + '/') !== 0) { throw new Error('Expected exactly one mounted volume under /Volumes on ' + id + '.'); }
    return mounts[0];
  }
  function inside(mount, relative) {
    const full = path.resolve(mount, relative);
    if (full.indexOf(mount + path.sep) !== 0) { throw new Error('Path escapes the volume.'); }
    return full;
  }

  return {
    listDevices: function () { return describeAll(null); },
    describe: async function (id) { checkId(id); return (await describeAll(id))[0] || null; },
    erase: async function (id) {
      checkId(id);
      if (!authorized || authorized.deviceId !== id) { throw new Error('Erase is not authorized for ' + id + '.'); }
      const current = (await describeAll(id))[0];
      if (!current || !current.serial || current.serial !== authorized.serial) { throw new Error('Authorized serial does not match the drive.'); }
      const verdict = safety.assessCandidate(current);
      if (!verdict.ok) { throw new Error('Drive rejected at erase: ' + verdict.reasons.join(' ')); }
      await run('diskutil', ['eraseDisk', 'FAT32', label, 'MBRFormat', '/dev/' + id]);
    },
    writeFile: async function (id, relative, data) {
      const full = inside(await mountFor(id), relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const fd = fs.openSync(full, 'wx');
      try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    },
    readFile: async function (id, relative) {
      const full = inside(await mountFor(id), relative);
      return fs.existsSync(full) && fs.lstatSync(full).isFile() ? fs.readFileSync(full) : null;
    },
    listFiles: async function (id) {
      const mount = await mountFor(id);
      const found = [];
      (function walk(dir, prefix) {
        fs.readdirSync(dir).sort().forEach(function (name) {
          const stat = fs.lstatSync(path.join(dir, name));
          const rel = prefix ? prefix + '/' + name : name;
          if (stat.isDirectory()) { walk(path.join(dir, name), rel); } else { found.push(rel); }
        });
      }(mount, ''));
      return found;
    },
    removeFile: async function (id, relative) { fs.unlinkSync(inside(await mountFor(id), relative)); },
    flush: async function () { await run('sync', []); },
    eject: async function (id) { await run('diskutil', ['eject', '/dev/' + checkId(id)]); }
  };
}

module.exports = { create };
