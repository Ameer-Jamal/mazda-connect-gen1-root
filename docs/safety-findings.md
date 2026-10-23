# Safety findings and qualification boundary

Reviewed baseline: `b1f7a7e082cb88c78183dd94cdb87bd4b02dae60`, on 2026-10-20. Findings below come from static inspection and linked community reports, not testing in a car. All inherited files remain unchanged. Simulator mitigations do **not** fix the inherited vehicle payload.

| Finding | Source evidence | Potential consequence / uncertainty | Simulator treatment |
| --- | --- | --- | --- |
| Uncancelled delayed work | `terminal()` creates nested timers; `xssDestroy()` does not clear them | Diagnostic requests can continue after overlay removal | Tracked timers plus session generation invalidation; closing rejects later callbacks |
| Repeated activation | `action()` handles every `mousedown`; no running-operation guard | Multiple diagnostic sequences or disruptive actions can overlap | One operation at a time; busy controls disabled and controller rejects overlap |
| HTML-based logging | `xssLog()` assigns messages to `innerHTML` | Markup can alter the overlay or execute handlers in the host context | Log nodes use `textContent`; browser test supplies HTML-like input |
| Unbounded log growth | Each log message appends a DOM node indefinitely | Memory/DOM growth can impair the UI | Maximum 200 entries and corresponding DOM rows |
| Incomplete teardown | Logger functions are replaced and a separate overlay appended; destroy removes only main wrapper/toggle | Patched methods, logger overlay, and callbacks can survive closing | Restore original mock methods; single set of UI listeners across reopening |
| Missing capability/error handling | Region and restart use internal APIs directly; timer callbacks lack exception handling | Partial actions or an unusable overlay when APIs differ or throw | Required mock methods checked before work; exceptions show an error state |
| Timing used instead of acknowledgement | Two fixed 7-second waits, without completion checks | A slow/different system may not be ready for the next request | Timing is only demonstrated; no claim of readiness detection or verified vehicle success |
| Fragile development environment detection | Presence of `document.body` selects development versus host paths; dev mocks omit restart/region APIs | Desktop preview behavior is incomplete and environment inference unreliable | Dedicated page with an explicit mock adapter; no environment autodetection |
| Ambiguous control labels and immediate disruption | “Destroy” removes UI; restart and region change have no confirmation | Users can misunderstand effects or trigger actions accidentally | Plain-language labels, explanations, native confirmation dialogs |
| Media with active metadata | Four MP3 titles contain an HTML loader pointing to mount-specific script paths | Treating them as ordinary audio may activate code on a susceptible host | Clearly disclosed; preview server rejects media and legacy script paths |

## Follow-up: 2026-10-23

The [upstream review](upstream-review.md) covers all seven Discussions and the sole PR, reproduces seven source defects in an isolated actual-script harness, and maps each to regression coverage for the separate controller/UI. The [architecture analysis](architecture.md) adds primary manufacturer, technical, and security-research sources. Display-failure causes remain unresolved.

Fault injection also found weaknesses in our own step-1 controller. The new code rejects loggers it cannot patch safely, preserves other components' replacements, continues cleanup when an individual method or timer cannot be restored/cancelled, retains original log forwarding, bounds message length, and stops progression on observer failure. A late exception cannot revive a closed session. Warnings report incomplete cleanup rather than claiming unconditional restoration. These protections remain disconnected from the inherited payload.

## Incident reports: evidence, not established causes

- [Discussion #7: no image, sound remains](https://github.com/mzd-evo/mzd-connect-1-root/discussions/7) describes losing display output after following a video. Another user reports the same problem. Firmware, exact actions, and a verified recovery are absent in the reviewed comments.
- [Discussion #11: “Display broken”](https://github.com/mzd-evo/mzd-connect-1-root/discussions/11) associates a problem with pressing “Destroy”; the author later reports a dealer recommending screen replacement. The inspected destroy function removes UI elements. The report does not establish that this function caused physical damage or that replacement was technically necessary.
- [Discussion #12: green dot after LVDS SPEED TOGGLE](https://github.com/mzd-evo/mzd-connect-1-root/discussions/12) describes a diagnostic-screen change. That control is not implemented in this repository's JavaScript; behavior of downstream diagnostic menus is unreviewed.

Do not convert anecdotes into a diagnosis, compatibility approval, or recovery instruction. Do not attempt undocumented diagnostic-menu toggles to “undo” an unknown condition.

## What this milestone can and cannot establish

Desktop tests establish controller sequencing, cancellation, cleanup, UI behavior, and preservation of upstream bytes. A recorded mock event proves only that the controller requested a call. It does not prove privilege escalation, readiness of a diagnostic screen, electrical safety, persistence behavior, reboot recovery, or isolation from vehicle functions.

There is no vehicle adapter, firmware allowlist, validated parked-state signal, backup utility, rollback mechanism, or qualified recovery procedure. A checkbox cannot establish that a vehicle is stationary. None of those capabilities are implied by the interface.

Before vehicle integration, identify an exact target configuration, obtain spare hardware and suitable power, establish recovery, and qualify each operation with documented bench results. Hardware failures, interrupted power, partial execution, and repeated sessions must be investigated there. Cancelling a queued step cannot undo an already sent command. No installable release should be advertised until the qualification gate is satisfied.

## Integrity boundary

`docs/upstream-baseline.json` records SHA-256 values for all nine inherited files, including media and the original `.gitignore`. `tools/check-upstream.cjs` checks the manifest against the pinned upstream Git commit as well as the working tree, and rejects missing/modified files or symlink substitution. This detects accidental changes and an edited manifest; a maintainer can still change the checker and workflow, so source review remains necessary. Matching hashes are provenance evidence, not safety certification.
