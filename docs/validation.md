# Desktop validation record

Date: 2026-10-20. Environment: macOS ARM64, Node.js 22.22.2, Playwright 1.62.1 with its Chromium build. CI repeats the checks on Ubuntu with Node.js 22. The local preview was also inspected through the in-app browser.

## Verified flow

| Boundary | Verification |
| --- | --- |
| Preview server → page | Loopback-only server serves seven explicit routes; inherited JS, media, repository files, traversal attempts, and non-read requests are rejected |
| Page → confirmation | Plain-language action descriptions, Cancel initially focused, forward Tab wrap, Enter activation, Escape/cancel with no adapter calls |
| Confirmation → controller | Starting an action updates visible state; busy controls disable; controller rejects overlap independently of disabled buttons |
| Controller → mock | Exact three-event terminal sequence; reboot and region call recording; missing capabilities and injected errors handled |
| Close → cancellation | Timer removal plus rejection of stale callbacks after reopening; already sent requests remain recorded |
| Mock logs → DOM | HTML-like messages remain literal text; controller and DOM retain at most 200 entries; original logger methods and receiver/arguments preserved |
| Reopen → session | Focus returns to terminal control; repeated open/log/close cycles add no duplicate listeners or wrappers |
| Source → baseline | All nine inherited files match SHA-256 values validated against upstream commit `b1f7a7e082cb88c78183dd94cdb87bd4b02dae60`; edited hashes, changed/missing files, and symlinks are rejected |

The reusable controller, mock adapter, and page script also parse as ES5. The preview still depends on modern desktop DOM APIs, not a CMU runtime.

## Commands

```sh
npm ci
npm run check:upstream
npm test
npx playwright install chromium
npm run test:browser
npm run test:upstream
```

At the 2026-10-20 foundation baseline, the suite contained 18 controller/integrity/syntax tests and 8 browser/server tests. Browser time was controlled for sequence checks; manual in-app inspection also observed normal timed completion. That baseline did not exercise the inherited script. The separate mocked-source characterization added below does; neither suite uses a real vehicle API or loads the MP3s.

## Visual and keyboard inspection

Reviewed the [desktop view](screenshots/desktop.png), [confirmation](screenshots/confirmation.png), and [390-pixel layout](screenshots/narrow.png) for readable text, clipping, simulation labeling, and visible focus. Automated layout checks find no horizontal overflow at the narrow viewport.

In the live in-app preview, opened terminal confirmation, used Tab and Enter to start it, observed the running state and disabled controls, and verified keyboard close/reopen focus. Normal terminal completion showed all three mock events. Browser tests additionally exercise cancellation between steps and repeated sessions. This is not a screen-reader audit or multi-browser certification.

## Limits and next gate

This record establishes desktop behavior only. No car or spare CMU has been tested. The owner's 2022 MX-5 GT firmware and market remain unconfirmed. Vehicle compatibility, diagnostic consequences, persistence, power-loss behavior, and recovery remain unverified. The unchanged upstream payload retains its known limitations; simulator improvements are not connected to it.

GitHub CI status is attached to the PR commit and should be checked there. Screenshots are illustrations, not vehicle test evidence. No installable release is produced.

## Follow-up validation: 2026-10-23

Local environment: macOS ARM64, Node.js 26.3.0, Playwright 1.62.1 / Chromium. CI targets Node.js 22 on Ubuntu. All nine inherited files still match the upstream baseline.

| Suite | Checks | Meaning |
| --- | --- | --- |
| `npm test` | 31 | Controller, injected faults, upstream integrity, and ES5 syntax |
| `npm run test:browser` | 9 | Desktop UI plus preview-server boundaries and malformed-target handling |
| `npm run test:upstream` | 8 | Seven intentionally reproduced legacy defects plus one Destroy behavior characterization; **not** evidence that legacy code is fixed |

All 48 checks pass locally. Ten newly added fault scenarios failed against our foundation controller before correction; thirteen fault tests now cover those failures and additional cleanup/forwarding cases. See [the upstream review](upstream-review.md) for the case mapping and [architecture](architecture.md) for primary-source research.

The upstream suite uses fresh isolated Chromium contexts, blocks network requests, and supplies only in-memory framework/log/CSS stubs. It runs the pinned legacy script with both host-style and head-loaded dev environments. No downstream diagnostic implementation, vehicle hardware, media loader, real reboot, or persistent configuration is exercised. The previous manual keyboard/visual review remains dated 2026-10-20; this follow-up verifies UI flows through automated browser tests.
