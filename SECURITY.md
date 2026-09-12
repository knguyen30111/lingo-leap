# Security Policy

## Supported versions

Only the **newest published release** is supported. There are no long-term support branches and no
backports to older releases.

## Reporting a vulnerability

Please do not open a public issue containing reproduction steps, a payload, or exploit details.

**Preferred: private vulnerability reporting.** If the repository's **Security** tab shows a *Report
a vulnerability* button, use it. That opens a private advisory visible only to you and the
maintainers, and it is the right channel for anything with security impact.

**If that button is not present**, private vulnerability reporting has not been enabled on this
repository yet. In that case, open an issue saying **only** that you have a security report and
asking a maintainer to make contact — no reproduction steps, no payload, no exploit details, no
affected-version specifics. A maintainer will enable private reporting and follow up there, and the
details belong in that private advisory rather than in the issue.

Both paths are GitHub-native. This project publishes no contact address.

## What to expect

This project is maintained by a small number of volunteers on a **best-effort** basis. There is:

- **no service-level agreement** and no committed response time,
- **no bug bounty** and no payment of any kind,
- no guarantee that a given report will result in a fix or an advisory.

Reports are read and taken seriously, but nothing above is promised.

## Scope

**In scope:**

- The desktop application and its behavior.
- The webview Content Security Policy and the native permission boundary — see
  [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) and
  [`src-tauri/capabilities/default.json`](src-tauri/capabilities/default.json).
- The macOS entitlement set — see [`src-tauri/Entitlements.plist`](src-tauri/Entitlements.plist).
- The dependency supply chain, including the pinned toolchain and the pinned `actionlint` release.
- The build and packaging workflows under `.github/workflows/`.

**Out of scope:**

- **Ollama itself** and any model you run in it. Report those upstream.
- **The platform speech recognition service** used by the Web Speech API. That is provided by the
  browser engine and the operating system, not by this project.
- **Any endpoint you configure.** If you point the app at a remote Ollama host, the security of that
  host is yours.

## Data disclosure

One disclosure matters more than the rest, and it is deliberate behavior rather than a defect:

> **Text you submit for translation or correction is sent to the configured Ollama endpoint.** That
> endpoint defaults to `http://localhost:11434`, which stays on your machine. It is user-configurable,
> so a configured remote host receives the text you are translating or correcting.

The Content Security Policy permits `http:` and `https:` in `connect-src` precisely so that
configuration keeps working. Narrowing it to loopback would break every user who has already set a
remote host.

The full picture, including what the speech recognition path does, is in
[docs/privacy.md](docs/privacy.md).
