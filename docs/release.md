# Release

How a release is identified, verified, and rolled back — and, just as importantly, what has **not**
been proven yet.

## Version authorities

Six places carry the version, and they move **together**:

| Authority | Field |
|---|---|
| `package.json` | `version` |
| `package-lock.json` | root `version` and `packages[""].version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `[package].version` |
| `src-tauri/Cargo.lock` | the `tran-app` package entry |

`scripts/release-contract/` enforces the agreement. A disagreement is a failing gate, not a review
comment.

`tauri.conf.json` is the authority the bundler uses for **artifact names**, which is why letting it
drift is not cosmetic — see the filename discontinuity below.

### Tag preflight

The same checker carries a tag preflight. When a tag context is present — `GITHUB_REF_TYPE=tag`, or a
`--tag` argument — the tag must be `v` followed by the agreed version, with no prerelease or build
metadata.

It is deliberately strict about its own inputs:

- A tag build that cannot name its tag (`GITHUB_REF_TYPE=tag` with an unset or empty
  `GITHUB_REF_NAME`) is a **finding**, never a skip. A silent skip on a release build is the most
  dangerous false pass available here.
- `--tag` with no value, or with an empty value, is a **finding**.
- Two tag sources that disagree with each other are a **finding**, even if one of them matches.
- When there is genuinely no tag context, the skip is **printed**, so a preflight that does nothing
  can be told apart from one that is broken.

The preflight only ever reads a tag name. It never creates, moves, resolves, or deletes a tag.

## Supported platform

- **macOS 14.0+, arm64 only.** That is the only target the app is built and verified for. No
  distributable binary is published for it or for anything else.
- **Linux is source-only development.** `Dockerfile.linux` builds an Ubuntu 22.04 image with the
  Tauri system libraries, the pinned Node major, and Rust stable, and `docker-compose.linux.yml`
  runs the repository inside it; see the README for the exact invocation. There is no Docker
  workflow: no GitHub Actions workflow builds that image, no Linux release artifact is produced by
  any workflow, and none has ever been published.
- **Windows is unsupported.**

The macOS floor follows the required Ollama's own macOS 14+ minimum. Shipping a bundle that an older
macOS would happily launch, for an app whose required dependency cannot run there, produces a
confusing failure instead of a clear one.

## Current packaging status

Read this section before assuming anything about the artifacts.

- Packaging runs **only** by manual `workflow_dispatch`. There is no `v*` tag trigger.
- Bundles are **ad-hoc signed** (`signingIdentity: "-"`), **with the Hardened Runtime in force**. A
  built bundle reports code-directory flags `adhoc,runtime` and `Signature=adhoc`, with
  `TeamIdentifier=not set` — run `codesign -dv --verbose=4` on a bundle to check that claim yourself.
- The bundles are **not notarized**. No Developer ID credentials and no secure timestamp exist in
  this environment, so no such claim is made anywhere.
- They are **not for distribution**. They exist to verify that the bundle builds and signs; that a
  built bundle also launches was checked by hand locally and recorded, not asserted by any gate.

### What has been proven, and what has not

These are different, and conflating them would be the overclaim this document exists to prevent.

**Proven:** the *assertion set*. The package verifier runs locally against a real bundle and asserts
artifact uniqueness and naming, the executable path and permission bits, architecture, signature mode
and the Hardened Runtime flag, the entitlement set and that its one key is boolean `true`, agreement
between the bundled `Info.plist` and the manifests it is generated from, the configured CSP inside
the executable, DMG integrity through `hdiutil verify`, and a minimum size for each artifact: the
`.app` payload must be at least **4 MiB** and the DMG at least **2 MiB**.
`scripts/verify-package.mjs` is the authoritative list; it has unit tests, and the README summarises
it.

Those two figures are **floors**, derived from measurements of real arm64 artifacts. Each is the
quantity the verifier itself computes, and each was taken on macOS with the BSD `stat`. Save the
block below and run it with `zsh measure-artifacts.sh <bundle-root>`, giving it the same bundle root
`npm run verify:package` is given — it stops at the first failure rather than printing a number it
did not measure:

```sh
set -euo pipefail

BUNDLE_ROOT=${1:?usage: measure-artifacts.sh <bundle-root>}

APP_COUNT=$(find "$BUNDLE_ROOT/macos" -maxdepth 1 -type d -name '*.app' | wc -l | tr -d ' ')
[ "$APP_COUNT" -eq 1 ] || { echo "expected exactly one .app under $BUNDLE_ROOT/macos, found $APP_COUNT" >&2; exit 1; }
DMG_COUNT=$(find "$BUNDLE_ROOT/dmg" -maxdepth 1 -type f -name '*.dmg' | wc -l | tr -d ' ')
[ "$DMG_COUNT" -eq 1 ] || { echo "expected exactly one .dmg under $BUNDLE_ROOT/dmg, found $DMG_COUNT" >&2; exit 1; }

APP=$(find "$BUNDLE_ROOT/macos" -maxdepth 1 -type d -name '*.app')
DMG=$(find "$BUNDLE_ROOT/dmg" -maxdepth 1 -type f -name '*.dmg')
[ -d "$APP" ] && [ -f "$DMG" ] || { echo "not a bundle root: $BUNDLE_ROOT" >&2; exit 1; }

# The .app payload: every regular file under the bundle, summed.
find "$APP" -type f -exec stat -f '%z' {} + | awk '
  { total += $1; files += 1 }
  END { if (files == 0) { print "no regular files under the .app payload" > "/dev/stderr"; exit 1 } print total }'

# The DMG: one file.
stat -f '%z' "$DMG"
```

The results were recorded locally when they were taken; the raw output is not carried in this
repository:

| Artifact | Measured | Where it came from |
|---|---|---|
| `.app` payload | 10,392,093 bytes | a 1.1.0 bundle built here under `CI=true` |
| `.app` payload | 13,168,031 bytes | the bundle published under v1.1.0 |
| DMG | 4,777,012 bytes | the DMG of that same 1.1.0 build |
| DMG | 5,802,624 bytes | the DMG published under v1.1.0 |

Each floor sits just under half the smallest measurement of its artifact: **4 MiB** is 40% of
10,392,093 and **2 MiB** is 44% of 4,777,012. That leaves a leaner future build room while still
catching an artifact whose payload never landed — a DMG truncated to 1,000,000 bytes and a stubbed
`.app` payload were both reported against a real bundle, recorded locally alongside those
measurements. There is deliberately **no** upper bound on either artifact: a ceiling would be a
distribution-size policy this project does not have.

**Not asserted by the verifier**, and stated here so the boundary is not blurred: the SHA-256
checksums are computed by a separate workflow step, and neither the verifier nor the workflow starts
the app — no step launches or terminates it. A controlled launch and termination was carried out by
hand against a locally built bundle and its output recorded locally at the time — local evidence
from a single machine, not a gate, and not carried in this repository.

**Not proven:** the *runner*. A `workflow_dispatch` workflow can only be dispatched once its
definition exists on the repository's default branch, and this work does not reach the default
branch. The packaging workflow has therefore **never run**. The compensating control is that the
workflow and the local verification invoke the *same* script, so the assertions themselves are
exercised even though the runner is not.

### Historical published assets

The assets already on the Releases page are **historical, unverified, and non-distributable**. None
was produced by the packaging path described above, which has never run, and none was checked by
`scripts/verify-package.mjs`, which did not exist when they were built.

A read-only inspection of the asset published under the **v1.1.0** release — downloaded with
`gh release download`, with nothing uploaded, edited, replaced, or deleted — found the following.
Every row below is reproducible against that download with `lipo -archs`, `codesign -dv
--verbose=4`, `codesign -d --entitlements :-`, `codesign --verify --deep --strict`, and
`plutil -p` on the bundled `Info.plist`; the raw output was recorded locally at the time and is not
carried in this repository.

**What it gets right**, so the list of failures below is not read as "everything":

| Property | The published asset | The current assertion |
|---|---|---|
| Architecture | `arm64`, a single slice | `lipo -archs` must report exactly `arm64` |
| Executable path | `Contents/MacOS/tran-app` | the executable must be at `Contents/MacOS/tran-app` |
| Artifact size | a 13,168,031-byte payload and a 5,802,624-byte DMG | both are above the floors, though for a bundle nothing else here vouches for |

**The assertions it fails**, each one named rather than summarised:

| Assertion | What the published asset has |
|---|---|
| bundled version equals the manifests | embedded `0.1.0` against a `1.1.0` manifest set |
| `LSMinimumSystemVersion` equals the configured floor | `10.13`, not `14.0` |
| the Hardened Runtime is in force | `flags=0x20002(adhoc,linker-signed)`, no `runtime` flag |
| the entitlement set is exactly `com.apple.security.device.audio-input`, set to `true` | no entitlements at all |
| `codesign --verify --deep --strict` passes | fails: "code has no resources but signature indicates they must be present" |

`spctl` assessment fails too, on the same missing resources. That is not an assertion the current
path makes either way, because no notarization exists to assess.

So the published asset fails the version, minimum-system-version, Hardened Runtime, entitlement, and
strict-verification assertions, while satisfying the architecture and executable-path ones. It is
kept as a record of what was once published and nothing more. The README points people at building
from source instead, and [SECURITY.md](../SECURITY.md) does not treat it as a supported release.

## The public release decision

The intended public path is a **direct-download DMG, Developer ID signed and notarized**, once the
pipeline and credentials exist. There is no Mac App Store target.

A future Developer ID signature would add identity, a secure timestamp, and notarization **on top
of** the Hardened Runtime the bundle already has; it would not introduce hardening, because the
hardening is already in force. Two things must be revisited when that pipeline is built:

1. The entitlement set would need re-confirming against a future Developer ID build, with a fresh
   hardened-runtime smoke. The JIT and unsigned-executable-memory exceptions were removed from a bundle that already
   runs hardened, justified by source evidence plus that smoke; a different signing identity does not
   change the analysis, but it does deserve a re-run.
2. `providerShortName` was removed because it means nothing today. It would only matter for
   notarization under a team with more than one provider, so it is not decided here.

## Updates

There is **no automatic updater** and no update feed. Updates are manual downloads from a GitHub
Release, and only once the signed and notarized path exists.

## Rollback

There is **no GitHub operation that revokes a released artifact**. Nothing recalls a file somebody
has already downloaded, and no primitive "un-publishes" bytes retroactively. What GitHub does offer
is withdrawal of *availability*, and that is what a rollback here actually consists of.

Two kinds of operation have to be told apart, because conflating them is how a rollback procedure
ends up contradicting itself:

- **Permitted, and required by the steps below:** editing a published release's **metadata** — its
  body and title — to record the problem, publishing a security advisory, converting the release
  back to a **draft**, and deleting a specific affected **asset**. These change availability and the
  record *around* an artifact; none of them alters an artifact's bytes.
- **Forbidden, always:** moving or deleting a **tag**, replacing an **asset in place**, reusing an
  asset filename, and reusing a version number. These destroy the record of what people actually
  received, which is the one thing a rollback must not do.

Every step below names an operation the platform really has, and all of them stay on the permitted
side:

1. **Record what is wrong first, while the release is still visible.** Put the affected version, the
   problem, and what to do instead at the top of the release body, and open a security advisory
   through the private vulnerability reporting path in [SECURITY.md](../SECURITY.md) when the
   problem has security impact, or a public issue when it does not. This is the audit evidence, and
   it has to exist before availability is removed.
2. **Withdraw the affected release from availability.** Convert the published release back to a
   **draft**, which unpublishes it and stops its assets being downloadable, or delete the specific
   affected assets when only some of them are bad. Either way the artifact is *removed*, never
   **overwritten**: no asset is replaced in place and no filename is reused.
3. **Keep the tag and the record.** Do not delete the tag and do not move it. The tag, the release
   body written in step 1, and the advisory are the only surviving record of what people actually
   received, and the platform preserves them as long as the tag stands.
4. **Designate the previous known-good version as the supported one**, if one exists. It keeps its
   own assets untouched — withdrawal applies only to the affected release. **Today no such version
   exists**: as the supported-version policy in [SECURITY.md](../SECURITY.md) records, no published
   binary is a supported release, so a withdrawal today leaves no supported asset behind and the
   documented answer is to build from source.
5. **Forward-fix as a new immutable version.** Move every version authority together, rebuild,
   re-verify with `npm run verify:package`, and publish under a **new** version and a new artifact
   filename.

Never reuse a version number, never replace a published asset in place, and never overwrite or move
a tag. Withdrawing a release removes availability; rewriting an artifact would destroy the record.
Editing the release **body** to say what went wrong is the opposite: it is how the record gets
written, and step 1 requires it.

## The accepted filename discontinuity

The assets published under the **v1.1.0** release are named `Lingo.Leap_0.1.0_aarch64.dmg`, because
`tauri.conf.json` still said `0.1.0` when they were built — the Tauri version leaked into a public
artifact name.

That is now fixed going forward: with the authorities aligned, a rebuild produces
`Lingo Leap_1.1.0_aarch64.dmg`.

**The published assets are not renamed or replaced.** The v1.1.0 release page will always disagree
with a future 1.1.0 rebuild about the filename. That discontinuity is accepted and recorded here
rather than repaired, because renaming or replacing a published asset would mutate an immutable
public artifact, which the rollback rules above forbid outright. Recording the mismatch in the
release body, by contrast, is a permitted metadata edit — it is the same operation step 1 of a
rollback requires.

## The shared gate list

Every path — local, CI, and packaging — runs the same gates through the same runner:

```sh
node scripts/run-gates.mjs frontend
node scripts/run-gates.mjs rust
```

Every surface runs a group through that script; no execution surface keeps a second copy of the
commands. The gate list itself is written down twice on purpose, in the two files below.

What a gate *is* lives in two files that have to agree:
`scripts/release-contract/lib/gate-contract.mjs` declares which gates are required and in which
order, and `scripts/gates.json` is the manifest the runner executes. The release contract asserts
that each manifest group equals its declared list element for element, so removing `npm run
typecheck` from either file fails a gate rather than silently shrinking every surface at once, and
adding a gate is a deliberate edit to both. The README describes what each individual gate asserts.

`actionlint` is pinned by version **and** SHA-256 in `scripts/actionlint.sha256`, for both
`darwin_arm64` and `linux_amd64`, so the gate is verifiable on a developer machine and on the runner.
The committed digest is the authority and is never regenerated from a download: a mismatch stops the
gate as a supply-chain finding rather than being treated as a retry.

## Why the checker lives under `scripts/`

`scripts/release-contract/` is plain ESM, not TypeScript under `src/`, for three reasons worth
recording so the choice is discoverable rather than incidental:

1. It reads the filesystem with `node:fs` and must never be reachable from the app bundle.
2. Putting it under `src/` would add it to the **coverage denominator**, moving every reported
   percentage for a surface whose thresholds were never calibrated for it. Coverage deliberately
   includes only executable `src` TypeScript and TSX.
3. It has to run in the packaging workflow **before** `npm run build`, so it cannot depend on a build
   step or a transpiler.

Its own quality is proven by its own unit tests, which do count toward the test totals.

## Packaging verification checklist

The executable authorities are `scripts/verify-package.mjs` and the packaging workflow itself. They
are not restated in prose here, because a prose copy would drift from the assertions that actually
run.
