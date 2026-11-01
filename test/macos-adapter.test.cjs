'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const macos = require('../desktop-core/macos-adapter.cjs');
const safety = require('../desktop-core/drive-safety.cjs');

const GIB = 1024 * 1024 * 1024;
/* Fake command layer: diskutil/system_profiler return JSON, "plutil" echoes its input. No real device is touched. */
function world(overrides) {
  const volumesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vol-'));
  const mount = path.join(volumesRoot, 'MZD');
  fs.mkdirSync(mount);
  const state = Object.assign({
    external: ['disk4'], serial: 'SN1', rootParent: 'disk3', rootStore: 'disk0s2', mounts: [mount],
    info: { MediaName: 'Stick', TotalSize: 16 * GIB, BusProtocol: 'USB', RemovableMediaOrExternalDevice: true, Internal: false, WritableMedia: true }
  }, overrides);
  const calls = [];
  async function run(command, args, input) {
    calls.push([command].concat(args).join(' '));
    const key = args.join(' ');
    if (command === 'plutil') { return input; }
    if (command === 'sync') { return ''; }
    if (command === 'system_profiler') { return JSON.stringify({ SPUSBDataType: [{ _items: [{ _items: [{ serial_num: state.serial, manufacturer: 'Acme', Media: [{ bsd_name: 'disk4' }] }] }] }] }); }
    if (key === 'list -plist external physical') { return JSON.stringify({ WholeDisks: state.external }); }
    if (key === 'info -plist /') { return JSON.stringify({ ParentWholeDisk: state.rootParent, APFSPhysicalStores: [{ APFSPhysicalStore: state.rootStore }] }); }
    if (key === 'info -plist disk4') { return JSON.stringify(state.info); }
    if (key === 'list -plist disk4') { return JSON.stringify({ AllDisksAndPartitions: [{ DeviceIdentifier: 'disk4', Partitions: state.mounts.map((m) => ({ MountPoint: m })) }] }); }
    if (command === 'diskutil' && args[0] === 'eraseDisk') { fs.rmSync(mount, { recursive: true }); fs.mkdirSync(mount); return ''; }
    throw new Error('unexpected command ' + command + ' ' + key);
  }
  return { run, calls, mount, volumesRoot, state };
}
const erases = (w) => w.calls.filter((c) => c.indexOf('eraseDisk') !== -1);

test('lists an external USB stick with a serial as eligible and never lists internal disks', async () => {
  const w = world();
  const adapter = macos.create({ run: w.run, volumesRoot: w.volumesRoot });
  const devices = await adapter.listDevices();
  assert.equal(devices.length, 1);
  assert.deepEqual([devices[0].id, devices[0].serial, devices[0].bus, devices[0].removable, devices[0].internal, devices[0].isSystem], ['disk4', 'SN1', 'usb', true, false, false]);
  assert.equal(safety.assessCandidate(devices[0]).ok, true);
  assert.equal(await adapter.describe('disk0'), null);
});

test('fail-closed classification: no serial, system disk, system mount, non-USB, unknown flags', async () => {
  const cases = [
    { serial: '' },
    { rootParent: 'disk4' },
    { rootStore: 'disk4s2' },
    { mounts: ['/'] },
    { mounts: ['/System/Volumes/Data'] },
    { info: { MediaName: 'x', TotalSize: GIB, BusProtocol: 'SATA', RemovableMediaOrExternalDevice: true, Internal: false, WritableMedia: true } },
    { info: { MediaName: 'x', TotalSize: GIB, BusProtocol: 'USB' } }
  ];
  for (const patch of cases) {
    const w = world(patch);
    const [device] = await macos.create({ run: w.run, volumesRoot: w.volumesRoot }).listDevices();
    assert.equal(safety.assessCandidate(device).ok, false, JSON.stringify(patch));
  }
});

test('erase is refused without exact authorization, for wrong serial, bad ids and ineligible drives', async () => {
  const w = world();
  await assert.rejects(macos.create({ run: w.run, volumesRoot: w.volumesRoot }).erase('disk4'), /not authorized/);
  await assert.rejects(macos.create({ run: w.run, volumesRoot: w.volumesRoot, authorizedErase: { deviceId: 'disk5', serial: 'SN1' } }).erase('disk4'), /not authorized/);
  await assert.rejects(macos.create({ run: w.run, volumesRoot: w.volumesRoot, authorizedErase: { deviceId: 'disk4', serial: 'OTHER' } }).erase('disk4'), /serial does not match/);
  await assert.rejects(macos.create({ run: w.run, authorizedErase: { deviceId: 'disk4;x', serial: 'SN1' } }).erase('disk4;x'), /Invalid disk identifier/);
  const sys = world({ rootParent: 'disk4' });
  await assert.rejects(macos.create({ run: sys.run, volumesRoot: sys.volumesRoot, authorizedErase: { deviceId: 'disk4', serial: 'SN1' } }).erase('disk4'), /rejected at erase/);
  for (const x of [w, sys]) { assert.equal(erases(x).length, 0); }
});

test('authorized erase issues exactly one FAT32/MBR eraseDisk for that device', async () => {
  const w = world();
  await macos.create({ run: w.run, volumesRoot: w.volumesRoot, authorizedErase: { deviceId: 'disk4', serial: 'SN1' } }).erase('disk4');
  assert.deepEqual(erases(w), ['diskutil eraseDisk FAT32 MZD MBRFormat /dev/disk4']);
});

test('full prepareDrive run on a fixture volume: erase, write, verify, remove macOS sidecars', async () => {
  const w = world();
  const adapter = macos.create({ run: w.run, volumesRoot: w.volumesRoot, authorizedErase: { deviceId: 'disk4', serial: 'SN1' } });
  const [device] = await adapter.listDevices();
  const files = [{ path: '$(x).up', data: Buffer.from('launcher') }, { path: 'config/a.txt', data: Buffer.from('a') }];
  const plan = safety.createErasePlan(device, files);
  fs.writeFileSync(path.join(w.mount, 'old.txt'), 'old');
  const writeFile = adapter.writeFile;
  adapter.writeFile = async (id, rel, data) => { await writeFile(id, rel, data); fs.writeFileSync(path.join(w.mount, '._' + path.basename(rel)), 'x'); };
  const result = await safety.prepareDrive(plan, files, plan.phrase, adapter);
  assert.equal(result.status, 'ok', result.message);
  assert.deepEqual(fs.readdirSync(w.mount).sort(), ['$(x).up', 'config']);
  assert.equal(fs.readFileSync(path.join(w.mount, 'config/a.txt'), 'utf8'), 'a');
});

test('writes cannot escape the volume and the volume must be exactly one mount under the volumes root', async () => {
  const w = world();
  const adapter = macos.create({ run: w.run, volumesRoot: w.volumesRoot });
  await assert.rejects(adapter.writeFile('disk4', '../escape.txt', Buffer.from('x')), /escapes/);
  for (const mounts of [[], [w.mount, w.mount + '2'], ['/Users/me']]) {
    const bad = world({ mounts });
    await assert.rejects(macos.create({ run: bad.run, volumesRoot: bad.volumesRoot }).readFile('disk4', 'a'), /exactly one mounted volume/);
  }
});
