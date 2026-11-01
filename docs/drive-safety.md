# Drive-preparation safety core

`desktop-core/drive-safety.cjs` is the first piece of the USB preparation architecture. It is **logic only**: it reaches a drive solely through an injected adapter and contains no real device access. No OS adapter exists, nothing in the desktop ZIP calls it, and it is not vehicle qualification.

## What it enforces

| Risk | Behavior |
| --- | --- |
| Wrong or system/internal disk | A device is eligible only if it reports USB bus, removable, not internal, not system, not read-only, a stable id and serial, and a capacity within limits. Missing or unknown fields reject. Nothing is auto-selected. |
| Capacity | Rejects unknown, too-small (package size), or oversized (default 64 GiB) devices. |
| Confirmation | The user must supply a phrase containing the drive serial and size. Anything else leaves the drive untouched. |
| Identity change | The identity fingerprint (id, serial, vendor, model, size, bus) is rechecked twice before erasing and before every file write. |
| Unsafe package | Rejects absolute, `..`, empty-segment, space/odd-character and duplicate paths. |
| Interrupted write / cancellation | Reported as `failed` / `cancelled` with `driveState: erased-incomplete`. |
| Corrupt write | Read-back SHA-256 of every file must match the plan; unexpected extra files fail. |

Results carry an honest `driveState`: `untouched`, `erased-incomplete` or `written-verified`. Verified means the bytes match the plan, not that the package works in a car.

## Tests

`test/drive-safety.test.cjs` uses an in-memory disk fixture (`test/fixtures/disk-image-adapter.cjs`) with fault injection. No real drive is touched.

## Still missing

A real macOS/Windows/Linux adapter (drive enumeration, unmount, format, eject), reviewed against the actual platform tools and exercised only on a disposable drive you authorize by exact device; filesystem choice and formatting; the package builder; and qualified feature packs.
