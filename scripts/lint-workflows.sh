#!/usr/bin/env bash
# Lints .github/workflows with a pinned actionlint release.
#
# The workflows are the trust boundary for the whole release path and they are
# the one artifact class no other gate reads, so this gate is mandatory.
#
# The committed digest in scripts/actionlint.sha256 is the authority and is
# never derived from the download. This script does not compute a digest and
# write it back, has no --update-checksum flag, and has no "no pinned value for
# this platform, so record what we got" path. Trust-on-first-use would make the
# checksum file a record of whatever was served rather than an assertion about
# what must be served, and the gate would then verify nothing. A platform with
# no committed digest is an unsupported platform and exits nonzero.
set -euo pipefail

CACHE=""
CLEANED=""

cleanup() {
  rc=$?
  [ -z "${CLEANED:-}" ] || return "$rc"   # a signal trap already ran it; never clean twice
  CLEANED=1
  if [ -n "${CACHE:-}" ]; then
    case "$CACHE" in
      "${TMPDIR:-/tmp}"/actionlint.*)
        rm -rf "$CACHE" || { echo "CLEANUP FAILURE: could not remove $CACHE" >&2; rc=1; } ;;
      *) echo "CLEANUP FAILURE: unexpected cache dir $CACHE; not touched" >&2; rc=1 ;;
    esac
  fi
  return "$rc"
}

# Installed before the download, so an interrupted fetch still cleans up.
trap 'cleanup || exit $?' EXIT
trap 'cleanup || true; exit 130' INT
trap 'cleanup || true; exit 143' TERM

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
PINS="$REPO_ROOT/scripts/actionlint.sha256"
[ -f "$PINS" ] || { echo "pinned checksum file not found at $PINS" >&2; exit 1; }

VERSION=$(sed -n 's/^ACTIONLINT_VERSION=\(.*\)$/\1/p' "$PINS" | head -1)
[ -n "$VERSION" ] || { echo "no ACTIONLINT_VERSION pinned in $PINS" >&2; exit 1; }

case "$(uname -s)/$(uname -m)" in
  Darwin/arm64) PLATFORM="darwin_arm64" ;;
  Linux/x86_64) PLATFORM="linux_amd64" ;;
  *) echo "no pinned actionlint digest for $(uname -s)/$(uname -m); unsupported platform" >&2; exit 1 ;;
esac

ASSET="actionlint_${VERSION}_${PLATFORM}.tar.gz"
EXPECTED=$(awk -v asset="$ASSET" '$2 == asset { print $1 }' "$PINS" | head -1)
if [ -z "$EXPECTED" ]; then
  echo "no pinned digest for $ASSET in $PINS; refusing an unpinned download" >&2
  exit 1
fi

CACHE=$(mktemp -d "${TMPDIR:-/tmp}/actionlint.XXXXXX")
[ -n "$CACHE" ] && [ -d "$CACHE" ] || { echo "mktemp -d failed" >&2; exit 1; }
case "$CACHE" in
  "${TMPDIR:-/tmp}"/actionlint.*) ;;
  *) echo "mktemp -d returned an unexpected path: $CACHE" >&2; exit 1 ;;
esac

URL="${ACTIONLINT_BASE_URL:-https://github.com/rhysd/actionlint/releases/download}/v${VERSION}/${ASSET}"
ARCHIVE="$CACHE/$ASSET"
curl -fsSL --retry 2 -o "$ARCHIVE" "$URL" \
  || { echo "could not fetch the pinned actionlint release from $URL" >&2; exit 1; }

ACTUAL=$(shasum -a 256 "$ARCHIVE" | awk '{ print $1 }')
if [ "$ACTUAL" != "$EXPECTED" ]; then
  # A mismatch is a supply-chain finding, not a retry. The archive is never
  # unpacked and the binary is never executed.
  echo "SUPPLY CHAIN FAILURE: checksum mismatch for $ASSET" >&2
  echo "  expected (committed): $EXPECTED" >&2
  echo "  actual   (downloaded): $ACTUAL" >&2
  echo "  refusing to extract or execute; the committed digest is never regenerated" >&2
  exit 1
fi

tar -xzf "$ARCHIVE" -C "$CACHE" actionlint \
  || { echo "could not extract actionlint from the verified archive" >&2; exit 1; }
[ -x "$CACHE/actionlint" ] || { echo "extracted actionlint is not executable" >&2; exit 1; }

echo "actionlint ${VERSION} (${PLATFORM}) verified against the committed digest"
"$CACHE/actionlint" -color "$REPO_ROOT"/.github/workflows/*.yml
