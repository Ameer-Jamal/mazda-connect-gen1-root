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
```

The suite contains 18 controller/integrity/syntax tests and 8 browser/server tests. Browser time is controlled for sequence checks; manual in-app inspection also observed normal timed completion. No vehicle APIs, USB devices, media players, or inherited loader scripts were exercised.

## Visual and keyboard inspection

Reviewed the [desktop view](screenshots/desktop.png), [confirmation](screenshots/confirmation.png), and [390-pixel layout](screenshots/narrow.png) for readable text, clipping, simulation labeling, and visible focus. Automated layout checks find no horizontal overflow at the narrow viewport.

In the live in-app preview, opened terminal confirmation, used Tab and Enter to start it, observed the running state and disabled controls, and verified keyboard close/reopen focus. Normal terminal completion showed all three mock events. Browser tests additionally exercise cancellation between steps and repeated sessions. This is not a screen-reader audit or multi-browser certification.

## Limits and next gate

This record establishes desktop behavior only. No car or spare CMU has been tested. The owner's 2022 MX-5 GT firmware and market remain unconfirmed. Vehicle compatibility, diagnostic consequences, persistence, power-loss behavior, and recovery remain unverified. The unchanged upstream payload retains its known limitations; simulator improvements are not connected to it.

GitHub CI status is attached to the PR commit and should be checked there. Screenshots are illustrations, not vehicle test evidence. No installable release is produced.
