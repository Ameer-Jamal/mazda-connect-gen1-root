# Feature catalog and execution policy

This stage adds a shared catalog for root research, customization, session control, and troubleshooting. It provides **no vehicle execution path**. No configuration in this build has hardware qualification, including the owner's 2022 MX-5 GT.

## Identification is not authorization

The local assessment accepts seven self-reported string fields: infotainment generation, model/trim, model year, full OS/firmware string, firmware region, vehicle market, and CMU hardware identifier. Region and vehicle market are recorded separately; neither is inferred from the other. Missing hardware information should stay empty. Do not remove parts from a car just to complete a form.

The page does not save the fields, send them to a server, inspect a USB device, or probe a vehicle. Reloading clears the fields in the tested browser. Browser/OS features outside this page may have their own form-restoration behavior. No VIN, location, or account fields are requested.

Assessment states are:

| State | Meaning |
| --- | --- |
| Incomplete | One or more of the seven identifiers is missing; no inference fills the gap |
| Invalid | A field exceeds the input limit, contains control characters, or has an invalid generation/year shape |
| Unsupported | The target explicitly identifies Gen 2 and otherwise passes input-shape validation |
| Unqualified | All identifiers are present for a self-reported Gen 1 target, but there is no qualifying hardware evidence |

Every assessment returns `vehicleAllowed: false`. Entering a familiar firmware such as 70.00.335 or 74.00.324A, completing all fields, or adding a `qualified`/`force` flag cannot change that result. Input-shape validity is not evidence that a firmware string or hardware identifier is genuine.

## Current feature boundaries

| Feature ID | Controller entry | Purpose and limits |
| --- | --- | --- |
| `terminal-navigation` | `terminal()` | Root research: simulates legacy diagnostic requests; no verified root/terminal access |
| `ui-region-europe` | `region()` | Customization research: records a UI-region request; no persistent conversion is modeled |
| `reboot` | `restart()` | Session control: records mock fatal-error/restart requests; no real recovery is modeled |
| `ui-logs` | `enableLogging()` | Troubleshooting: wraps mock logger methods; capturing logs changes the logger and is not a read-only host operation |

Each entry has its own ID, category, and effect description. The catalog does not introduce new vehicle features or claim they have been qualified together.

## Shared module and controller enforcement

`simulator/capabilities.js` exports `features()`, `assessTarget(input)`, and `evaluate(request)` through CommonJS or the browser's `ConnectLabCapabilities` namespace. The script must load before the controller. Returned catalog entries are copies; editing a returned entry does not add an executable feature.

`evaluate` permits known features only when the environment is exactly `desktop-simulation` and the adapter kind is exactly `in-memory-mock`. It rejects vehicle environments, unknown environments, unknown features, and absent/unknown adapter kinds. No production or bench override exists.

The controller accepts an `environment` option (default: `desktop-simulation`) and an optional target record. Its adapter must explicitly declare an own data property `kind: 'in-memory-mock'`. Missing/getter-based declarations are rejected without invoking the getter. The built-in mock supplies the declaration. Test doubles also declare their mock nature explicitly.

The controller evaluates policy before starting an operation, before each sequenced step, and before patching logger methods. It also checks the required methods before each sequenced step. Revoking the declaration or losing a method between steps stops subsequent requests and records an error. Vehicle mode rejects all four entries before method dispatch or logger patching.

**The adapter declaration is a developer contract, not a sandbox, hardware attestation, or authentication mechanism.** Arbitrary third-party JavaScript can lie about its callbacks or alter source code. This project supplies only an in-memory mock, and the preserved legacy loader does not use this controller or policy. Do not connect a real framework by changing the adapter's kind string.

## Validation and future gate

Tests cover complete and incomplete targets, Gen 2, malformed fields, inherited/accessor data, forged approval flags, modified catalog copies, missing/unknown adapters, vehicle mode, and capabilities changing between steps. Browser tests verify a complete self-reported target still shows all vehicle features unavailable, the independent simulator still works, and reload clears the tested form.

Adding a device path remains a separately reviewed milestone. It requires exact target identification, spare hardware, a validated recovery process, actual operation-completion semantics, and action-specific bench evidence. A future qualification registry must come from reviewed project evidence, not user-entered form fields or community success anecdotes. This build deliberately has no such registry or device adapter.
