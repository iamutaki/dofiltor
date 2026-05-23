#!/bin/bash
# Package Dofiltor as a CRX file for Chrome/Chromium
# Requires: Chromium or Google Chrome installed
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
CRX="$DIR/dofiltor.crx"

# Key must live outside the extension dir — Chrome errors if key.pem is inside.
PACK_KEY="${DOFILTOR_PACK_KEY:-}"
STASHED_KEY=""

cleanup() {
  if [ -n "$STASHED_KEY" ] && [ -f "$STASHED_KEY" ]; then
    mv "$STASHED_KEY" "$DIR/key.pem"
  fi
}
trap cleanup EXIT

if [ -f "$DIR/key.pem" ]; then
  STASHED_KEY="$(mktemp "${TMPDIR:-/tmp}/dofiltor-key-stash.XXXXXX.pem")"
  mv "$DIR/key.pem" "$STASHED_KEY"
  chmod 600 "$STASHED_KEY"
fi

if [ -z "$PACK_KEY" ]; then
  if [ -n "$STASHED_KEY" ] && [ -f "$STASHED_KEY" ]; then
    PACK_KEY="$STASHED_KEY"
  else
    echo "Error: pack key not found. Set DOFILTOR_PACK_KEY or place key.pem next to package.sh."
    exit 1
  fi
fi

if [ ! -f "$PACK_KEY" ]; then
  echo "Error: pack key not found: $PACK_KEY"
  exit 1
fi

CHROME=""
for bin in google-chrome chromium chromium-browser "Google Chrome"; do
  if command -v "$bin" &>/dev/null; then
    CHROME="$bin"
    break
  fi
done

# macOS fallback
if [ -z "$CHROME" ] && [ -d "/Applications/Google Chrome.app" ]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

if [ -z "$CHROME" ]; then
  echo "Error: Chrome/Chromium not found. Install it first."
  exit 1
fi

echo "Packing with: $CHROME"
"$CHROME" --pack-extension="$DIR" --pack-extension-key="$PACK_KEY" --no-message-box

# Chrome outputs .crx next to the extension directory
if [ -f "$DIR.crx" ]; then
  mv "$DIR.crx" "$CRX"
  echo "Done: $CRX"
else
  echo "Error: CRX not generated"
  exit 1
fi
