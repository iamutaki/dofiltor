#!/usr/bin/env bash
# Build a Chrome Web Store upload ZIP (runtime files only).
# Excludes signing keys, git/CI, dev scripts, and maintainer docs.
#
# Usage:
#   ./scripts/build-store-zip.sh
#   ./scripts/build-store-zip.sh /path/to/dofiltor-store.zip

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${1:-$ROOT/dofiltor-store.zip}"
rm -f "$OUT"

echo "Packaging from: $ROOT"
echo "Output:       $OUT"

zip -r "$OUT" . \
  -x "key.pem" \
  -x "*.pem" \
  -x "*.crx" \
  -x ".DS_Store" \
  -x "*/.DS_Store" \
  -x ".git" \
  -x ".git/*" \
  -x ".git/**/*" \
  -x ".gitmodules" \
  -x ".github/*" \
  -x ".github/**/*" \
  -x "package.sh" \
  -x "scripts/*" \
  -x "scripts/**/*" \
  -x "README.md" \
  -x "changelogs.md" \
  -x "docs/*" \
  -x "docs/**/*" \
  -x ".gitignore" \
  -x "dofiltor-store.zip" \
  -x "icons/icon-source.svg"

# Fail closed if a private key or dev-only path slipped in.
if unzip -l "$OUT" | grep -qE '(^|/)(key\.pem|.*\.pem)$'; then
  echo "ERROR: .pem file found inside $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

if unzip -l "$OUT" | grep -qE '(^|/)(\.git|\.gitmodules)(/|$)'; then
  echo "ERROR: git metadata found inside $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

if unzip -l "$OUT" | grep -qE '(^|/)key\.pem$'; then
  echo "ERROR: key.pem found inside $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

count=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "Done: $OUT ($count files)"
echo ""
echo "Upload this ZIP in Chrome Web Store Developer Dashboard."
echo "Privacy policy URL is required separately (not bundled in the ZIP)."
