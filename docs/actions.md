# Action reference

Source reviewed: upstream `js/run.js` at commit `b1f7a7e082cb88c78183dd94cdb87bd4b02dae60`. This describes source behavior, not an instruction to operate a vehicle.

| Upstream control | Observable source behavior | Unverified downstream behavior | Desktop simulator |
| --- | --- | --- | --- |
| Open terminal | Sends `syssettings / SelectDiagnostics` immediately; after 7 seconds sends `diag / ActivateJCITest`; after a further 7 seconds sends `diag / ReadDTC` with `payload.testId = 11` | Meaning and consequences of diagnostic test 11; whether a terminal opens; firmware-dependent behavior | Same ordered mock events over 14 seconds; completion means calls were recorded only |
| Ui logs | Replaces `log.error`, `log.warn`, and `log.info`; appends a separate logger overlay; invokes the original methods | Performance and interaction with the actual logging implementation | Wraps only mock logging; retains 200 text entries; restores functions on close |
| Set UI region: EU | Assigns `framework.localize._currentRegion = 'Region_Europe'` | Persistence, other modules' reactions, and effects on vehicle functions; no source evidence of a firmware conversion | Records a `setRegion` mock call; does not change a real UI region |
| Restart | Calls `_showFatalErrorWink('reboot', 'xss')`, then `_restartCMU('XSS')` synchronously | Restart completion, interruption consequences, or recovery | Records mock fatal-error and restart calls; uses a deliberate 7-second pause for observing cancellation, unlike upstream's immediate calls |
| Destroy | Sets `window.xssMounted = false`; removes `window.XSSwrapper` and `window.XSStoggle` | This function does not contain a screen-destruction command. User reports do not establish causation. Pending timers and logging patches are not cleaned up | Renamed **Close overlay**; cancels pending controller work, restores mock log methods, and offers reopening |
| Collapse toggle (`^`) | Toggles the overlay's `xss-collapse` CSS class | Does not stop timers or undo operations | Not copied; explicit close and reopen controls are used |

## Loading and scope

The inherited MP3 title fields contain an HTML `iframe` handler requesting `js/run.js` from one of four USB mount paths. `mp3title.txt` contains a related title string. The script attempts CSS loading from four mount paths, and mounts its controls in the host UI. These files are retained as historical source; the desktop preview never loads them.

The repository name refers to root research. The reviewed JavaScript itself provides UI/diagnostic entry points; it does not demonstrate a complete, verified privilege-escalation chain, a firmware installer, a backup utility, or a recovery process.

## Controller interface

`simulator/controller.js` exports `create({ adapter, scheduler, onChange })` through CommonJS for tests or `ConnectLabController` in the desktop page. It has **no default adapter** and never inspects a host framework.

- Adapter: synchronous `sendEvent(target, event, payload?)`, `showFatalError(reason, source)`, `restart(source)`, `setRegion(region)`, and a mutable `log` object with `error`, `warn`, and `info` functions. Only capabilities required by the selected operation are checked. No asynchronous/device adapter contract is implemented.
- Scheduler: `setTimeout(callback, milliseconds)` and `clearTimeout(id)`, with normal asynchronous timer semantics. Tests inject a deterministic scheduler. Session generation checks also reject callbacks captured before close/reopen.
- Controls: `open()`, `close()`, `terminal()`, `restart()`, `region()`, `enableLogging()`, and `snapshot()`. Actions return false when closed, already running, or unavailable. Failures enter `error`; a later action or close is allowed. Confirmation belongs to the desktop UI, not this controller API.
- Observations: `onChange(snapshot)` is a synchronous UI callback. Snapshot states are `closed`, `idle`, `running`, `complete`, and `error`; an active operation name, logging flag, and copied log entries accompany the state. Entries are memory-only and capped at 200; no export or telemetry is provided.

The mock adapter also caps its separate call trace at 200 records, so it cannot retain an unbounded duplicate log. This is an observation buffer, not an audit trail.

The controller uses ES5 syntax, checked automatically. The desktop UI uses modern browser APIs such as native dialogs. Syntax compatibility alone does not establish compatibility with a CMU runtime.
