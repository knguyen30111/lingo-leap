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

- **macOS 14.0+, arm64 only.** That is the only distributed binary.
- **Linux is source-only development.** The Docker workflow builds and runs the toolchain; no Linux
  release artifact is produced by any workflow, and none has ever been published.
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
- They are **not for distribution**. They exist to verify that the bundle builds, signs, and launches.

### What has been proven, and what has not

These are different, and conflating them would be the overclaim this document exists to prevent.

**Proven:** the *assertion set*. The package verifier runs locally against a real bundle and asserts
architecture, signature mode, entitlements, DMG integrity, checksums, artifact names and sizes, and a
controlled launch and termination.

**Not proven:** the *runner*. A `workflow_dispatch` workflow can only be dispatched once its
definition exists on the repository's default branch, and this work does not reach the default
branch. The packaging workflow has therefore **never run**. The compensating control is that the
workflow and the local verification invoke the *same* script, so the assertions themselves are
exercised even though the runner is not.

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

1. Revoke the affected release.
2. Retain the prior signed asset — users on it keep working.
3. Forward-fix as a **new immutable version**.

Never overwrite a tag. Never replace a published release asset. A published artifact is immutable,
and rewriting one destroys the only record of what people actually downloaded.

## The accepted filename discontinuity

The assets published under the **v1.1.0** release are named `Lingo.Leap_0.1.0_aarch64.dmg`, because
`tauri.conf.json` still said `0.1.0` when they were built — the Tauri version leaked into a public
artifact name.

That is now fixed going forward: with the authorities aligned, a rebuild produces
`Lingo Leap_1.1.0_aarch64.dmg`.

**The published assets are not renamed or replaced.** The v1.1.0 release page will always disagree
with a future 1.1.0 rebuild about the filename. That discontinuity is accepted and recorded here
rather than repaired, because editing a published release or replacing a published asset would mutate
an immutable public artifact — which the rollback rule above forbids outright.

## The shared gate list

Every path — local, CI, and packaging — runs the same gates:

```sh
npm ci
npm audit --audit-level=moderate
npm run lint
npm run lint:workflows
npm run typecheck
npm run verify:release-contract
npm run build
npm run test:coverage
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

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
