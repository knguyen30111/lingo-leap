# Contributing to Lingo Leap

Thanks for helping. This document covers the branch model, the local gates, and the conventions a
pull request is checked against.

## Branch model

The repository uses an **epic-branch integration model**.

- Every feature or fix pull request targets the **active epic branch**, never `main`.
- Only the epic's own pull request merges into `main`.
- One issue, one branch, one worktree.

There is exactly one automation exception: **Dependabot** opens its version-update pull requests
against the default branch by design, because the default branch is what GitHub resolves version
updates against and keeping it maintained is the point of enabling it. No other exception exists.

A pull request that changes anything under `.github/workflows/**` needs a **trusted owner review of
the workflow diff** before merge. Required check names do not make workflow definitions immutable, so
this manual review is the trust boundary while the repository has a single maintainer.

## Prerequisites

- Node, the version pinned in [`.nvmrc`](.nvmrc) — `nvm use` in the repository root.
- Rust stable.
- Xcode Command Line Tools on macOS.

Platform dependency lists live in the [README](README.md); they are not duplicated here.

> **Assert the Node version before you trust a gate result.** In a non-interactive shell, `nvm use`
> can report success while leaving a different Node active, so a gate can silently measure the wrong
> toolchain. Run `node -v` and check it against `.nvmrc` first.

## Local gates

Run both groups before opening a pull request:

```sh
node scripts/run-gates.mjs frontend
node scripts/run-gates.mjs rust
```

**Run them through that script, never by hand.** CI and the packaging workflow invoke exactly the
same runner, so what you run locally cannot drift from what CI runs.

What a gate *is* lives in two files that have to agree:
[`scripts/release-contract/lib/gate-contract.mjs`](scripts/release-contract/lib/gate-contract.mjs)
declares which gates are required and in which order, and
[`scripts/gates.json`](scripts/gates.json) is the manifest the runner executes. The release contract
asserts that each manifest group equals its declared list element for element, so adding, removing,
or reordering a gate is a deliberate edit to **both** files and anything less fails a gate. Do not
keep a hand-copied list of the individual commands anywhere else.

The individual gates the `frontend` group runs are `npm ci`, `npm audit --audit-level=moderate`,
`npm run lint`, `npm run lint:workflows`, `npm run typecheck`, `npm run verify:release-contract`,
`npm run build`, and `npm run test:coverage`; the `rust` group runs
`cargo check --locked --manifest-path src-tauri/Cargo.toml`. Invoke one of those directly only to
iterate on the failure the runner already reported — the runner, not this paragraph, is what a
pull request is checked against, and the README describes what each gate asserts.

`npm run build` is the Vite production build only — it does **not** type-check. Type checking is
`npm run typecheck`, so a type error is reported as a type error rather than as a build failure.

`npm run lint:workflows` runs `actionlint` from a release pinned by version and SHA-256 in
[`scripts/actionlint.sha256`](scripts/actionlint.sha256). The committed digest is the authority: a
checksum mismatch is a supply-chain finding and stops the gate, and the digest is never regenerated
from whatever was downloaded.

**A failing gate is fixed at its cause.** Never with an `eslint-disable` comment, a lowered
`--audit-level`, a lowered coverage threshold, a skipped test, or a weakened assertion.

## Tests

Behavior changes are test-first: write the failing assertion, watch it fail for the reason you
expect, then make it pass. A test that cannot fail is worse than no test.

Coverage thresholds live in `vitest.config.ts`. A coverage drop is answered with behavior tests.

## The release contract

Repository-wide invariants are executable, not documentary. They live in
[`scripts/release-contract/`](scripts/release-contract) and run as `npm run verify:release-contract`
locally and in CI.

Each rule is a small module exporting `{ id, title, check(ctx) }` and returning findings. Adding a
repository-wide invariant means adding a rule there, with tests that exercise it against fixture
directories rather than against the working tree.

## Commits and pull requests

- Conventional commit format (`feat:`, `fix:`, `test:`, `refactor:`, `ci:`, `docs:`, `chore:`).
- **No AI references** in commit messages.
- No plan identifiers, phase numbers, or finding codes in commit messages, code comments, or test
  names. Describe the invariant or the behavior directly.
- Keep commits focused: one logical change each.
- Never commit secrets, dotenv files, tokens, private keys, or credentials.

## Conduct and security

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability,
follow [SECURITY.md](SECURITY.md) — please do not open a public issue containing exploit details.
