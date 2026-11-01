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

## Neo compiler adapter

`desktop-core/neo-adapter.cjs` connects the external [Neo-MZD-AIO](https://github.com/yangwenbo99/Neo-MZD-AIO/tree/9db2bc287e13e67d38b670fa6f62981f62c59184/cli) compiler (GPL-3.0, reviewed commit `9db2bc2`) to drive preparation. Neo stays a separate program; none of its code is vendored here.

- `buildWithNeo` runs `build CONFIG --output DIR` only when the checkout's HEAD equals the reviewed commit, the output directory does not exist, paths are absolute, and a timeout and minimal environment apply. It fetches nothing; dependencies must already be installed. It is not an OS sandbox.
- `loadPackageFromDirectory` treats the output as untrusted data: symlinks, special files, unsafe names, OS metadata, empty packages and size-limit breaches reject the whole package instead of being skipped. The result feeds `createErasePlan`/`prepareDrive` unchanged.
- Generated installers are never executed.

Not covered: the adapter is tested against a stub compiler, not the real one. Neo's locked image library (Sharp 0.34.5) has high-severity advisories ([draft PR #8](https://github.com/Ameer-Jamal/mazda-connect-gen1-root/pull/8)), so adoption needs a corrected dependency set. Assembling a package says nothing about firmware compatibility; AIO's firmware-74 refusal is carried through unchanged and no bypass is added.
