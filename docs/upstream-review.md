# Upstream review and regression coverage

Reviewed 2026-10-23 against upstream commit `b1f7a7e082cb88c78183dd94cdb87bd4b02dae60` and fork baseline `71bc4d2`. Upstream's Issues feature is disabled. All seven Discussions, all available comments, and its sole pull request were reviewed; pagination reported no additional pages at review time.

**The inherited payload still has its original defects.** It remains pinned and is not served by the desktop preview. The fixes and comparisons below describe the separate controller and desktop UI. This review does not certify a vehicle-ready replacement.

## Community reports and limits

| Source | Report / request | Evidence and current disposition |
| --- | --- | --- |
| [Discussion #7](https://github.com/mzd-evo/mzd-connect-1-root/discussions/7) | A 2014 Mazda3 display reportedly disappeared after following a touchscreen-modification video; a commenter reports the same symptom | No precise action sequence, firmware, hardware diagnosis, or verified recovery. **Unresolved**; not reproduced on hardware and not claimed fixed |
| [Discussion #11](https://github.com/mzd-evo/mzd-connect-1-root/discussions/11) | Reporter associates pressing Destroy with screen failure; later reports a dealer replacement recommendation | Test confirms this function removes the overlay without requesting reboot or changing region through the mocked APIs. It cannot rule out real host interactions or diagnose physical damage. **Hardware cause unresolved** |
| [Discussion #12](https://github.com/mzd-evo/mzd-connect-1-root/discussions/12) | CX-3 shows a green dot after LVDS SPEED TOGGLE | That control belongs to a downstream menu, not this repo's action implementation. **Unresolved**; no toggle/recovery instructions inferred |
| [Discussion #9](https://github.com/mzd-evo/mzd-connect-1-root/discussions/9) | User cannot tell what scripts do; asks about startup warnings | [Action reference](actions.md) documents the actual source and its limits. No new warning-disabling action is provided |
| [Discussion #8](https://github.com/mzd-evo/mzd-connect-1-root/discussions/8) | Requests function descriptions and removing disclaimers | Same documentation treatment. No claim that a diagnostic menu is a supported customization API |
| [Discussion #6](https://github.com/mzd-evo/mzd-connect-1-root/discussions/6) | Asks whether 70.00.021 works; comment reports 74.00.324 EUN success | Different configurations are not interchangeable evidence. Both remain unqualified in [compatibility](compatibility.md) |
| [Discussion #10](https://github.com/mzd-evo/mzd-connect-1-root/discussions/10) | Reports success on a 2020 CX-5, 70.00.335 | Community report, not independent action-by-action validation |
| [PR #1](https://github.com/mzd-evo/mzd-connect-1-root/pull/1) | Corrects region spelling and changes label to EU | Reviewed patch is a naming correction; it does not add lifecycle, confirmation, or compatibility protections |

## Reproducing actual source defects

`npm run test:upstream` runs **the actual pinned `js/run.js`**, not a rewrite, in fresh Chromium contexts. All framework, CSS-loading, and logging APIs are in-memory test doubles. Network requests are blocked, no MP3 is loaded, and the preview server gains no legacy-script route. The dev-preview test reproduces loading during head parsing.

These are **characterization tests**: a passing `LEGACY BUG` assertion means the known defect was reproduced, not that the original code passed a safety test. They establish JavaScript/DOM behavior only. Every inherited file is checked before the harness runs.

| ID | Reproduced legacy defect | New-controller/UI regression coverage |
| --- | --- | --- |
| U01 | Two delayed diagnostic requests still fire after Destroy | Close-between-steps tests remove timers and reject stale callbacks after reopening |
| U02 | Two terminal activations dispatch six requests | Controller rejects overlapping actions; browser controls also disable while running |
| U03 | A log message containing `<b>` creates a real element | Browser test supplies HTML-like input and verifies literal text and no injected element |
| U04 | Logger grows past 200 entries, remains mounted after Destroy, and continues capturing | Controller/DOM caps, original-method restoration, repeated-session tests, bounded mock trace |
| U05 | Wrapped log method loses receiver, extra arguments, and return value | Receiver/arguments/return-value tests, plus original exception propagation |
| U06 | Restart sends its first request before discovering the second method is missing | Preflight checks all required methods; missing-capability browser test verifies zero requests |
| U07 | Legacy head-loaded dev preview lacks mock region/restart methods | Dedicated explicit mock includes both; browser test completes both simulated operations |

One additional characterization test confirms Destroy's limited observable source behavior. It does not recreate or resolve an alleged screen failure.

## Faults found in our step-1 implementation

Ten fault-injection tests failed against the step-1 controller before correction. `test/controller-faults.test.cjs` now covers:

- Frozen, partially non-writable, and accessor-based loggers: reject capture before replacing any methods; do not invoke method getters during inspection.
- A logger method replaced by another component: preserve that replacement during close and record a warning.
- A wrapper made non-writable after capture begins: continue cleanup, disable capture, warn, and preserve forwarding to the original function for that still-installed wrapper.
- Unprintable/oversized messages: retain a safe representation capped at 4096 characters while forwarding the original arguments untouched.
- Observer/rendering errors: stop operation progression, keep an error snapshot, and do not swallow the source log call/return value.
- Timer-cancellation errors: continue closing; invalidated session tokens still block callbacks that could not be removed.
- An adapter closing the session then throwing: preserve the closed state rather than reviving it as an error session.

Additional coverage verifies that original logger exceptions remain original exceptions, observer failure between diagnostic steps stops subsequent calls, and cleanup continues even when cancellation of one timer fails. The preview also returns HTTP 400 for malformed request targets instead of allowing an uncaught URL-parser exception to terminate it.

## Remaining gate

The following are **not fixed or ruled out**: hardware display damage, persistent diagnostic settings, compatibility of any specific car, downstream command effects, genuine terminal/root access, vehicle isolation, and recovery. Our desktop protections are verified against mocks and a modern browser. The [architecture review](architecture.md) explains why neither stars nor a successful mock call can bridge that evidence gap.
