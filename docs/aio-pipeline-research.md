# AIO pipeline research

Reviewed 2026-10-31 against Trevelopment/MZD-AIO commit [`409c724`](https://github.com/Trevelopment/MZD-AIO/tree/409c724ed860497b2a34f9367cb4a019287846ea) (AIO 2.8.6, commit dated 2024-01-22). Paths are relative to `app/` in that checkout. Each statement is tagged **[source]** (read in the pinned code), **[report]** (a community post, cause unverified), **[inference]** (mine), or **[reproduced]** (run by us). Nothing here was tested on a car. This is not qualification of any configuration.

## 1. Chain as far as the sources show

| Stage | Finding |
| --- | --- |
| Entry in this repo | **[source]** `mp3title.txt` is a media title containing an `<iframe onload>` that calls `utility.loadScript('../../../mnt/sda1/js/run.js')`. `run.js` shows a diagnostic overlay and sends internal requests; the diagnostic implementation is outside the repo ([architecture](architecture.md)). |
| Link to AIO | **[source]** Nothing in AIO loads that script. A search for the loader path matched only CASDK files that use the host's own `utility.loadScript`. **[inference]** No link from this repo's loader to a root shell, or to AIO, is demonstrated by either codebase. AIO assumes the CMU already runs a USB script as root. |
| How AIO gets a shell | **[source]** `build-tweaks.js` `buildAutorunInstaller` copies `files/tweaks/cmu-autorun/installer` (and `sdcard/recovery` for the ID7-recovery/serial variants, under an `XX/` folder for serial). The tweak run itself is a `tweaks.sh` (or `run.sh` if `user.runsh`) copied to the USB root. **[report]** The maintainer wrote in [issue 132](https://github.com/Trevelopment/MZD-AIO/issues/132) (2021-08-18) that every exploit they used, "including serial access after fw v70.00.536", was removed in later firmware. The UI text says FW 70.00.335+ needs a serial connection before updating. |
| Compilation | **[source]** `buildTweakFile` queues `00_intro.txt`, `00_start.txt`, one fragment per selected option (`NN_name-i.txt` install, `-u.txt` uninstall), then `00_end.txt` and writes one shell script. Option values become small variable files (`tweakVariables`). Assets are copied into `_copy_to_usb/config/`; themes and colors are unzipped there. `copyToUSB` then copies the folder to the chosen mount point. |
| On the CMU | **[source]** `00_start.txt` reads `/jci/version.ini`, computes a compatibility group, shows confirmation dialogs, then each fragment backs up and edits files under `/jci/...` and appends marked CSS/JS blocks. `00_end.txt` reboots. |
| Restoration | **[source]** `backup_org` copies each edited file to `<file>.org` **on the CMU itself** before first edit; `restore_org` copies it back. `KEEPBKUPS`/`TESTBKUPS` also copy backups to the USB. For group 6 a `v70_integrity_check` replaces blank `.org` files from fallback copies taken from v70.00.100. `00___fullRestore.sh` restores in bulk. **[inference]** Backups sit on the same device they protect, so they are not an independent recovery path. |

## 2. Firmware guard

`00_start.txt` `compatibility_check()` returns a group from the version string in `/jci/version.ini`:

| Group | Version | Behavior |
| --- | --- | --- |
| 1 | 55, 56 | proceeds |
| 2 | 58 | proceeds |
| 3 / 4 / 5 | 59.00.<400 / 400-499 / 500+ | proceeds; group 5 skips USB Audio Mod |
| 6 | 70.00.<=360 | proceeds |
| 7 | 70.00.361+ | warns "extreme caution", then proceeds after confirm |
| 0 | everything else, including **all 74.x** and any non-`00` middle number | logs "not compatible", remounts `/` read-only, exits without installing |

- **[source]** The unknown-firmware branch contains a commented-out confirm line and a note that removing the final two lines "will allow MZD-AIO-TI to run with unknown fw versions". Editing that guard is how the community video, as you described it, runs 2.8.6 on firmware 74. **[inference]** That is overriding the tool's own refusal, not support. I did not watch the video.
- **[source]** Threshold inconsistencies: the header comment says group 7 starts at 70.00.336; the code uses `-le 360`; the warning text and UI say "tested up to 352"; the `00_start.txt` comment next to the code says 352.
- **[source]** Individual exclusions exist beyond the guard: USB Audio Mod is skipped at group 5+ (`26_usbaudiomod-i.txt`); the Android Auto/CASDK patch has separate branches for groups below 6, 6 and above (`00_59patch.txt`, `00__casdkapps-i.txt`); some tweaks gate on group 5+/6/7. The UI also warns of a USB Audio Mod risk of unreadable USB ports.
- **[reproduced]** `desktop-core/aio-compat.cjs` is a port of the function, and `test/aio-compat.test.cjs` runs the real shell function from the pinned source (`AIO_SRC=<checkout>`) against 25 versions. The check found one quirk the port initially missed: a version with no dots makes `cut -f2/-f3` return the whole string, giving group 0.

## 3. Feature distinctions

- **Hide album art vs Gracenote.** **[source]** `14_bgart-i.txt` appends CSS (`big-albm.css`, optionally `no-albm.css`) to `NowPlaying4Ctrl.css`; it does not stop a process. The `disable_gracenote` config folder exists, but I did not trace which fragment uses it. **[inference]** They are different operations; treat them as separate packs.
- **Android Auto.** **[source]** AIO ships community `androidauto` / `headunit` and CASDK files. **[inference]** This is not Mazda's factory Android Auto/CarPlay, which is separate firmware and a separate USB path.

## 4. Community reports (unverified, cause unknown)

| Report | Configuration | Claim |
| --- | --- | --- |
| [#223](https://github.com/Trevelopment/MZD-AIO/issues/223) | 2016 CX-9, firmware 74 | Screen went black after choosing "terminal"; resets and a battery disconnect listed as tried. No reply. Open. |
| [#229](https://github.com/Trevelopment/MZD-AIO/issues/229) | 2022 Mazda 2, CMU150, 74.00.324A ADR | Wireless CarPlay stopped working after installing AIO. No reply. Open. |
| [#178](https://github.com/Trevelopment/MZD-AIO/issues/178) | 2023 MX-5, 74.00.324 NA | Asks if tweaks are possible; replies say users on 74 could not install. |
| [#202](https://github.com/Trevelopment/MZD-AIO/issues/202), [#132](https://github.com/Trevelopment/MZD-AIO/issues/132) | 74.x | Requests for support; the maintainer's 2021 reply above. |

Blank screens, lost input, and lost wireless CarPlay on firmware 74 are therefore reported, with unknown causes. A 2022 MX-5 is firmware-74-era per these reports, but your unit's firmware is unconfirmed.

## 5. Candidate pack manifest status

No pack is manifested yet. For each pack the required fields are: source fragment and commit, config assets, files mutated (with `.org` backups), variables, prerequisites (root access, free space), conflicts, rootfs usage, restoration steps, and per-component license. The fragments above are the inputs. `26_usbaudiomod` (excluded on 59.00.502+ and later) and `14_bgart` (CSS only) are the cheapest to manifest first, **[inference]** but neither is qualified for firmware 74.

## 6. Licensing

AIO's [LICENSE](https://github.com/Trevelopment/MZD-AIO/blob/409c724ed860497b2a34f9367cb4a019287846ea/LICENSE) is GPL; `package.json` says GPL-3.0. This repo copies none of AIO's code: `aio-compat.cjs` is an independent port of a 38-line function and its test reads the real one from an external checkout. Whether a port counts as derived work, per-component terms for vendored assets (fonts, images, apps), and the original root project's missing license are unresolved and need your decision or the authors' clarification. No one has been contacted.

## 7. Blockers

- Exact firmware, region and CMU hardware of the MX-5.
- A spare CMU and a recovery method that does not depend on the unit being modified.
- Evidence that any root-access route works on that firmware; per the maintainer's own comment and the UI text, none is established here.
- A decision on the firmware-74 guard: this project will not ship the bypass.
