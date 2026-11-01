# Drive-preparation safety core

`desktop-core/drive-safety.cjs` is the first piece of the USB preparation architecture. It is **logic only**: it reaches a drive solely through an injected adapter and contains no real device access. No OS adapter exists, nothing in the desktop ZIP calls it, and it is not vehicle qualification.

## What it enforces

| Risk | Behavior |
| --- | --- |
| Wrong or system/internal disk | A device is eligible only if it reports USB bus, removable, not internal, not system, not read-only, a stable id and serial, and a capacity within limits. Missing or unknown fields reject. Nothing is auto-selected. |
| Capacity | Rejects unknown, too-small (package size), or oversized (default 64 GiB) devices. |
| Confirmation | The user must supply a phrase containing the drive serial and size. Anything else leaves the drive untouched. |
| Identity change | The identity fingerprint (id, serial, vendor, model, size, bus) is rechecked twice before erasing and before every file write. |
| Unsafe package paths | Rejects absolute, `.`/`..`, empty segments, backslash, control characters, FAT-illegal characters, trailing dot/space, and case-insensitive duplicates. Names are data, never shell text: a literal launcher name such as `$(...).up` is valid and is written verbatim. |
| OS metadata | Packages may not contain `._*`, `.DS_Store` or Spotlight/fseventsd/Trashes entries. AppleDouble `._<launcher>` files can stop the CMU detecting an update ([TouchTune helper](https://github.com/Miatafy/TouchTune/blob/6061a6c98eeb1c348773ec4b2fd29eef3b39441e/macos-usb-eject.sh)), so sidecars the OS adds during writing are removed through the adapter and the drive is re-listed; if they cannot be removed the run fails. |
| Interrupted write / cancellation | Reported as `failed` / `cancelled` with `driveState: erased-incomplete`. |
| Corrupt write | Read-back SHA-256 of every file must match the plan; unexpected extra files fail. |

Results carry an honest `driveState`: `untouched`, `erased-incomplete` or `written-verified`. Verified means the bytes match the plan, not that the package works in a car.

## Tests

`test/drive-safety.test.cjs` uses an in-memory disk fixture (`test/fixtures/disk-image-adapter.cjs`) with fault injection. No real drive is touched.

## Still missing

A real macOS/Windows/Linux adapter (drive enumeration, unmount, format, eject), reviewed against the actual platform tools and exercised only on a disposable drive you authorize by exact device; filesystem choice and formatting; the package builder; and qualified feature packs.

## macOS adapter

`desktop-core/macos-adapter.cjs` implements the adapter interface with `diskutil`, `plutil` and `system_profiler`.

- **Listing is read-only** and covers only `external physical` disks. A disk is the system disk if it is the parent or a physical store of `/`, or any volume on it mounts at `/` or `/System/Volumes/*`. Missing USB serial, unknown bus, or unknown flags make a drive ineligible (fail closed).
- **Erase is off unless authorized.** The adapter must be created with `authorizedErase: { deviceId, serial }` naming one exact drive. Immediately before `diskutil eraseDisk FAT32 MZD MBRFormat /dev/diskN` it re-describes the drive, requires the serial to match, and re-runs the eligibility check. Disk IDs must match `disk<N>`.
- **Writes** go to the single volume mounted under `/Volumes` for that disk, with a path-containment check, exclusive create and fsync. Reads, listing and sidecar removal use the same volume lookup.
- `eject(id)` exists but is not called by `prepareDrive`; the caller ejects after a verified result.

Validation: fixture command output (6 tests, including a full `prepareDrive` run against a temporary directory) and one real read-only listing on a Mac with no external drive attached, which caught a wrong `diskutil` argument order that the fixtures had hidden. **No erase or write has been run against a real drive.** FAT32/MBR is the common USB format but is not confirmed as required by every package; the 64 GiB size limit and 4 GiB FAT32 file limit are not enforced against real packages yet. Windows and Linux adapters do not exist.
