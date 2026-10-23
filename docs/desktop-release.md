# Guided desktop alpha 0.2.0-alpha.1

The product target is a beginner-friendly installer: identify the system, choose compatible tweaks, review changes, prepare and verify a selected USB drive, then follow package-specific in-car instructions and completion/recovery checks. Existing community implementations are the starting point; new vehicle behavior must not be substituted without evidence.

This release completes the **desktop planning flow only**. It is not the finished USB installer. USB formatting, package compilation and deployment, drive discovery, and in-car installation are unavailable. No exact target or feature pack is bench-qualified. Unknown firmware remains unknown; the owner's 2022 MX-5 GT OS version and region are still pending, and no spare CMU/recovery setup is available.

## Available now

- Four guided steps: identify, choose, review and save a JSON review plan.
- The existing 24-feature source index, with no default selections, search, categories and pinned source references.
- Own-field validation, literal text rendering, keyboard navigation, step-heading focus, review invalidation after edits and explicit download error handling.
- The AIO workbench and existing in-memory simulator remain available through the research-tools link.
- An extracted offline desktop ZIP. Open `index.html`; no runtime, server, account, automatic update or network API is required.

The USB and car stages are shown as unavailable, rather than presenting a mock as a completed installation. The application cannot enumerate, erase or write drives. The browser merely requests a JSON download; the UI asks the user to check Downloads and does not assert that saving completed.

## Desktop artifact

```sh
npm ci
npm test
npm run test:package
npx playwright install chromium
npm run test:browser
npm run test:upstream
npm run build:desktop -- /absolute/path/to/a/new/output-folder
```

Development uses Node.js 22+ and Python 3.9+; CI uses Node 22 and Python 3.12 on Ubuntu. Python is needed to test/build the ZIP, not to use it. The build requires clean tracked files and reads exact Git objects from the recorded commit. Untracked files, ignored dependencies and personal workspace files are never included. An existing output directory is rejected; no drive formatter or disk-writing tool is invoked.

The fixed archive allowlist includes only new desktop HTML/JS/CSS, getting-started text and attribution notices. It excludes inherited vehicle HTML/JS/CSS, active MP3 metadata payloads, AIO scripts/assets/binaries, dependencies and repository metadata. Tracked source files must be regular, non-executable files. The build verifies the original nine-file upstream baseline before writing.

`release-info.json` records the full source commit and false vehicle/USB capability flags. `manifest.json` records hashes of each application file (excluding itself). `SHA256SUMS.txt` records the archive's SHA-256. These hashes identify bytes and detect accidental corruption; they do not certify firmware compatibility or independently authenticate the author. The ZIP uses Python's standard library, fixed timestamps and stored entries for reproducible bytes. No custom drive formatter or archive codec was added.

## Verification story

| Boundary | Evidence |
| --- | --- |
| Identification → model | Unknown details allowed for planning; invalid years, control characters, oversized data and accessor fields rejected atomically |
| Selection → review | Empty selections cannot progress; filtering retains choices; model changes invalidate acknowledgement and download state |
| Review → export | Explicit acknowledgement required; downloaded JSON checked against current selection; no scripts or USB payload in export |
| Failure → recovery | Unsupported download API surfaces a text error, retains the save step and permits going back |
| ZIP → offline browser | Actual extracted files load via `file:` with browser network disabled; the wizard exports a plan and opens the mock research tools |
| Source → artifact | Exact Git objects, fixed allowlist, regular file modes, archive CRC, SHA-256 manifest and byte-for-byte reproducibility checked |
| Source → inherited baseline | Original nine payload files still match pinned upstream; no edits or new qualification claim |

Desktop tests do not establish vehicle safety, full accessibility conformance or multi-browser certification. There is no claim of zero bugs. The legacy tests continue to intentionally reproduce seven original defects rather than repair or release those payloads.

## Remaining work for the requested car installer

1. Review AIO's complete compilation/dependency model and per-component redistribution terms, resolve the original root project's licensing status, and pin the executable artifacts to be distributed.
2. Identify exact hardware, full firmware/region and existing factory integration. Establish spare-unit recovery and document each pack's normal, interrupted and restoration behavior.
3. Implement the real package builder and drive writer around qualified packs: explicit drive identity, confirmation before erasing, rejection of system/internal drives, identity recheck before writing, copy verification and ejection handling. These features do not exist in this alpha.
4. Supply illustrated instructions based on observed screens and results for each qualified package, including stopping points and tested restoration procedures. Keep any unavoidable manual diagnostic steps explicit.

Publication is a **desktop prerelease**. It is not approval to put this archive or the original source repository on a car USB, and it does not complete the user's requested vehicle-ready product.
