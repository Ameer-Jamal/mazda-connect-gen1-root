# Contributing to the desktop foundation

This milestone is computer-only research. Submit changes through a pull request; include the problem, resulting behavior, tests, and limits. Do not add a vehicle adapter, connect the simulator to the legacy loader, or broaden compatibility claims as a routine UI change.

## Development

Use Node.js 22+ and Python 3.9+ for package tests/builds, run `npm ci`, then `npm run preview`. Only guided-setup and simulator assets are served at `http://127.0.0.1:4173`. There is no build step and no external runtime dependency. `npm ci` and the optional browser download require network access; the preview does not.

The inherited `.gitignore` is pinned unchanged. To keep local dependencies out of Git status, add `node_modules/` to your clone's `.git/info/exclude`. Do not commit dependencies or browser caches.

Before submitting:

```sh
npm run check:upstream
npm test
npm run test:package
npx playwright install chromium
npm run test:browser
npm run test:upstream
```

On Linux, use `npx playwright install --with-deps chromium` if system libraries are missing. CI checks out full history for the baseline check. Keep new browser scripts in ES5 syntax; the syntax test enforces it. Desktop dialogs and CSS still require modern browsers, and no vehicle-runtime compatibility is asserted.

## Architecture and review boundaries

- `simulator/` owns the desktop page, reusable injected controller, and explicit mock adapter. Controller methods and limitations are described in [the action reference](docs/actions.md). UI confirmation is separate from controller sequencing.
- The shared [capability policy](docs/capability-policy.md) permits explicit mocks only. New test doubles must declare their mock kind; do not weaken the gate to make a test pass. A target form entry or `qualified` flag must never authorize a device path.
- The local server serves an allowlist, not the repository root. Keep media, legacy scripts, Git metadata, and arbitrary filesystem paths inaccessible.
- Preserve the nine upstream files byte-for-byte. Do not regenerate the baseline to accept a change. Any future payload modification requires an explicit separate review and hardware qualification plan.

Use fake adapters and deterministic time in controller tests. Browser tests must verify actual DOM text, dialogs, keyboard/focus behavior, cancellation, and reopening. A passing mock test cannot be cited as vehicle qualification. For screenshots, run `SCREENSHOT_DIR=docs/screenshots npm run test:browser` and visually inspect the resulting images before committing them.

The upstream characterization suite executes only the pinned script in fresh browser contexts with mocked host APIs and blocked network requests. `LEGACY BUG` assertions intentionally reproduce defects. Keep those separate from the new-controller regression tests; do not present their success as vehicle safety evidence. Extend the [upstream review](docs/upstream-review.md) when adding or resolving a finding.

## Reports and evidence

For desktop bugs, provide the commit, browser, steps, expected behavior, and observed result. For vehicle reports, use the [compatibility evidence requirements](docs/compatibility.md). Omit VINs, personal accounts, location history, and secrets. Label third-party reports and untested hypotheses explicitly.

No license file was found in the reviewed upstream commit. Preserve attribution and do not add a license purporting to cover upstream work without resolving its provenance and permissions. Licensing clarification is pending; this contribution guide is not a license grant.

## Desktop prerelease packaging

See [the desktop release scope](docs/desktop-release.md). The archive allowlist excludes inherited payloads and AIO executables. Build from clean tracked files with `npm run build:desktop -- /absolute/path/to/new/output-folder`; exact Git objects are read, not arbitrary working files. The four available setup steps end at a JSON plan. Do not label a plan download or rehearsal as USB preparation or vehicle installation.
