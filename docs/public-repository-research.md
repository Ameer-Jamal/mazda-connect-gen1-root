# Public Mazda ecosystem research — 2026-10-31

The strongest new reuse candidate is **Neo-MZD-AIO's standalone compiler**, not a replacement vehicle runtime. We exercised its real validation, planning and assembly for three tweaks in temporary storage. Six script fragments and two complete GUI payload files matched the previously reviewed AIO source. No generated installer was executed or retained. This establishes one desktop assembly path, not firmware or vehicle support.

This is a focused research pass, not an exhaustive audit of GitHub or an endorsement of these projects. Repository heads below are pinned observations. Source inspection, authors' reported bench results, our host experiments and untested inferences remain separate. No vehicle qualification status changes.

## Findings that change our implementation direction

### Reuse a compiler; do not recreate every AIO build rule

[Neo-MZD-AIO CLI](https://github.com/yangwenbo99/Neo-MZD-AIO/tree/9db2bc287e13e67d38b670fa6f62981f62c59184/cli) is independent of Electron, uses a declarative configuration, and exposes validation, planning and assembly. Its registry describes 40 tweaks plus separate autorun/recovery modes. We reviewed the CLI entrypoint and relevant config, planner, resource and build modules; we did not audit all options or run its entire test suite.

Compared with AIO commit `409c724…`, this fork is six commits ahead. Changes also include Android Auto binaries and Wi-Fi behavior; that does not make its entire payload set a drop-in replacement. Its compiled registry is a better candidate for integration than hand-maintaining the first 24-item presentation catalog, subject to per-feature review and component licensing.

The isolated experiment selected main-menu loop, list loop and shorter delay, preserving backup and confirmation options. The first attempt correctly failed because the menu/list payload directories were missing. Those tweaks require **complete `MainMenuCtrl.js` and `List2Ctrl.js` files**, not just shell fragments. The successful audit inventoried and verified both. Full-file replacement creates a separate existing-modification/conflict question before vehicle use.

`run.sh` output omits the normal USB bootstrap. It assumes an already available entrypoint; successful assembly does not establish that entrypoint or the downstream installation path. The original firmware compatibility code was included unchanged; the firmware-74 bypass was not added.

### “Newer fork” is not a maintenance verdict

[Austin-Metke/MZD-AIO](https://github.com/Austin-Metke/MZD-AIO/tree/67788a600cb4b33b4e9a6adb1c562770bc53c2d3) is 11 commits ahead of the reviewed AIO baseline. Its changes include Electron/IPC modernization, filesystem utilities, archive handling and color-pack distribution. Commit descriptions and source diffs identify useful leads; we have not executed or independently verified its desktop application or claimed fixes. Its default branch is `main`, unlike upstream's `master`.

The sampled `master` branches of [herasymchyk-oleksii/MZD-AIO](https://github.com/herasymchyk-oleksii/MZD-AIO/compare/409c724ed860497b2a34f9367cb4a019287846ea...master) and [n3k0lai/MZD-AIO](https://github.com/n3k0lai/MZD-AIO/compare/409c724ed860497b2a34f9367cb4a019287846ea...master) were identical to the pinned upstream commit despite recent push metadata. Do not select a dependency based on push date, repository name or stars. GitHub's Actions API returned no recent workflow runs for Neo or Austin in this check; that is not proof that no testing occurred elsewhere.

### Exact content and stock attributes need separate evidence

[TouchTune](https://github.com/Miatafy/TouchTune/tree/6061a6c98eeb1c348773ec4b2fd29eef3b39441e) offers scoped file recognition, private backups, staged replacement, read-back checks and cleanup. Its author reports a 1.2.0 preflight error caused by treating a modified bench file's ownership as the stock profile. The later implementation records and preserves live attributes separately from recognized content. This is a useful design lesson, not permission to loosen content checks or accept arbitrary metadata.

The [September 22 bench report](https://github.com/Miatafy/TouchTune/blob/6061a6c98eeb1c348773ec4b2fd29eef3b39441e/docs/bench-validation-2026-09-22.md) describes install/removal on a 2019 CX-5 CMU, NA 74.00.324A, and includes the tested package digest. The author explicitly says that cycle staged package contents over SSH without a USB stick. It excludes power-loss testing and physical touch behavior while moving. These are **third-party reported results**, not our independent reproduction or evidence for the owner's Miata.

Its [macOS helper](https://github.com/Miatafy/TouchTune/blob/6061a6c98eeb1c348773ec4b2fd29eef3b39441e/macos-usb-eject.sh) documents AppleDouble sidecars interfering with the launcher and verifies a declared launcher before ejecting. The update entrypoint deliberately uses a shell-looking filename. Future copying must preserve reviewed filenames literally and never interpolate them into a shell command. We did not run the helper, cleanup commands or installer.

### Hardware-selected configuration matters to factory projection

[CarPlay-to-HUD source](https://github.com/KidMixer/mazda-carplay-hud/tree/9782e927ca7a3e1715585cbafdb6417833944506) and [OEM Android Auto shims](https://github.com/VitaliyKurokhtin/oem-aa-mod/tree/f8ac5b02fd7bb85e208288cc804931cba19a2936) show a separate feature avenue: adapting factory projection rather than installing the legacy community headunit app. These are research candidates, not bundled features or a promise that the MX-5 has suitable HUD hardware.

The [HUD installer](https://github.com/KidMixer/mazda-carplay-hud/blob/9782e927ca7a3e1715585cbafdb6417833944506/install/install.sh) uses a hardware probe to select the active `sm.conf` or `sm_WCP.conf`; file presence alone is insufficient in its documented environment. It remounts root writable and changes startup/configuration files. Its README's blanket “cannot brick” claim is not established by this inspection. The required native binary must be built and an external diagnostic loader is not shipped. No build or vehicle deployment was attempted.

### Access recovery, uninstall and brick recovery are different

[Trevelopment/cmu-autorun](https://github.com/Trevelopment/cmu-autorun/tree/66e4efe1db202009dd91f1904662cab030f3f558) and [AIO serial documentation](https://github.com/Trevelopment/mazdatweaks/blob/master/serial.md) describe access/recovery mechanisms with installation and firmware prerequisites. They are not a universal recovery guarantee for a unit that can no longer boot.

[The SPI-flash project](https://github.com/kushagharahi/mazda-hu-v74-tweaks/blob/e48716e9789f989d07d318b9220918c42a4c616d/spi_flash_backups/readme.md) describes physically reading/reprogramming boot flash. Only its documentation and metadata were read; no flash dumps were downloaded, modified or executed. That work reinforces the distinction between restoring a tweak's files and recovering a failed boot chain. It supplies no qualified recovery procedure for our target.

## Other reusable components and limits

| Source | Useful role | Limit / decision |
| --- | --- | --- |
| [drivelist `a616aa9…`](https://github.com/balena-io-modules/drivelist/tree/a616aa9875956ecf1a546cf1d2480ff281e54d2b) | Cross-platform drive discovery with system/USB/virtual/read-only, size, mount and partition-table fields | Candidate for a future native adapter. Several fields can be null; metadata is not a stable identity or authorization to erase a drive. No enumeration or native binding was run. |
| [Etcher SDK `9e6127e…`](https://github.com/balena-io-modules/etcher-sdk/tree/9e6127e6c01bbeeb3342046176e1dd3001ed1d13) | Established image/block-device writing ecosystem | Its README requires elevated permissions for block-device writes. Mazda packages reviewed here are file trees on a suitable filesystem; a block-image flasher is not automatically the correct file-copy/format workflow. No SDK code was executed. |
| [MZD-WEB `35c277d…`](https://github.com/bencroskery/MZD-WEB/tree/35c277d5821769991d958f71bc4e0d63c2fae570) | Previewing actual interface resources with a user-supplied JCI backup | README requires old Opera for complete behavior. Potential visual fixture work, not a full CMU emulator. No JCI firmware files or obsolete browser were obtained. No detected license at this review. |
| [gartnera/headunit `1cfb398…`](https://github.com/gartnera/headunit/tree/1cfb398d5b81bbc586dd11f111aa40bc0a1edb88) | Legacy Android Auto lineage, installers and compatibility checks | Historical reference; not interchangeable with factory projection or proof for modern phones. Metadata reports AGPL-3.0. |
| [rnprojekt/MZD-AIO-TI-X `5f37a27…`](https://github.com/rnprojekt/MZD-AIO-TI-X) | Older AIO fork named in searches | Reported last push 2017; do not infer maintained status from its name. Exact head is recorded in the evidence map. |
| [CMU hardware notes `838b1a4…`](https://github.com/silverchris/mazda-cmu-documentation/blob/838b1a46153adbd8b5c86d167ad52e724e39e956/hardware.md) | Community reverse-engineering map of the application processor, VIP, watchdog and display interfaces | Hardware-specific reference, not a verified wiring guide or mapping to every generation. No pinouts are used in our software and no hardware was connected. |
| [m3-toolchain](https://github.com/lmagder/m3-toolchain) | Device-specific ARM toolchain referenced by native-mod projects | Cross-compiling is a separate step; ABI and third-party licensing still need verification. No compiler/submodules were downloaded or run. |

“Gen 6”, CMU150, ND2 and Mazda Connect Gen 1/2 are labels from different contexts. Do not silently equate them. Hardware, firmware, region and the exact target files remain necessary identifiers. Gen 2 support is still unestablished.

## Dependency finding that blocks wholesale adoption

The pinned Neo lockfile installs **Sharp 0.34.5**. `npm audit` reported a high-severity vulnerable direct dependency, with [libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) and [librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) advisories; these pages list patched versions culminating in 0.35.5. No image input or image conversion was used in our restricted assembly experiment. The library is imported by the compiler, so this is not a claim that the dependency is absent.

Those dependencies were installed outside our checkout with lifecycle scripts disabled. They are not added to our package.json, CI dependency set, desktop ZIP or published alpha. We did not run an automatic force-upgrade or modify upstream's lockfile. Before product integration, review a corrected dependency set, rerun relevant decoding/archive tests, and verify that resource conversion stays faithful to expected outputs. Reported vulnerabilities are evidence to investigate, not a reason to blindly upgrade and assume compatibility.

## Implemented next piece: real assembly audit, metadata-only output

`tools/aio-assembly-audit.py` is a developer-only bridge to the pinned external compiler. It reads reviewed Git objects into a fresh temporary tree, links a previously prepared dependency directory, and invokes the external CLI's `validate`, `plan` and `build` commands. It refuses a different source head, changed baseline fragments/payloads, existing report destinations and unexpected generated files. Working-tree source edits are not read.

It verifies six original fragments in order, backup/confirmation variables before common setup, and both complete payload digests; `bash -n` parses the generated script without running it. The request omits bootstrap binaries, recovery/SSH/network changes, images and firmware-check edits. All temporary generated files are removed; only a JSON evidence report is exported. One known request is supported—there is no arbitrary user-package importer, native USB access, UI connection or production compiler integration.

Two local runs produced identical evidence and generated-file digests. This demonstrates repeatability for this host/configuration only. The JavaScript network guard blocks ordinary socket connections and fetch; it is not an OS sandbox. Direct dependency versions are checked against the lockfile; installed dependency bytes are not attested. Run only the reviewed source and prepared dependencies in an appropriate development environment.

For a developer with reviewed local objects and locked dependencies already prepared:

```sh
python3 -B tools/aio-assembly-audit.py \
  --source /path/to/reviewed/Neo-MZD-AIO \
  --dependencies /path/to/prepared/node_modules \
  --report /path/to/new/aio-assembly-audit.json
```

The source can be a working or bare repository at the exact pinned head. Required Git objects must already be local (`GIT_NO_LAZY_FETCH=1` is set), the report parent must exist, and no dependencies or sources are fetched by this command. It requires Python 3.9+, Node 22.2+, Git, Bash and directory symlink support; the real experiment was run on macOS ARM64 / Node 26.3.0. This is not a novice installation command or an installer export.

The metadata result is recorded in `research/aio-assembly-result.json`. Default CI tests our audit guards with fixtures; it does **not** download or run Neo, its image dependency or vehicle installers. The currently published desktop alpha remains unchanged.

## Next implementation decision

Prefer an adapter around the existing declarative compiler after dependency/license review, with traceable fragment/asset manifests and per-feature qualification. Investigate Austin's desktop hardening separately rather than combining two forks wholesale. Use scoped transaction and backup ideas from TouchTune as design evidence; do not replace its tested bytes or transplant its motion-restriction behavior without qualification. Keep drive discovery, filesystem preparation and package installation as separate boundaries.

No external authors were contacted. No car, USB drive, installer shell script, recovery tool, native mod or downloaded firmware was executed. Research does not remove the remaining hardware/recovery and licensing gates.
