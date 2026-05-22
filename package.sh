#!/bin/bash
# Package Dofiltor as a CRX file for Chrome/Chromium
# Requires: Chromium or Google Chrome installed
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
KEY="$DIR/key.pem"
CRX="$DIR/dofiltor.crx"

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
"$CHROME" --pack-extension="$DIR" --pack-extension-key="$KEY" --no-message-box

# Chrome outputs .crx next to the extension directory
if [ -f "$DIR.crx" ]; then
  mv "$DIR.crx" "$CRX"
  echo "Done: $CRX"
else
  echo "Error: CRX not generated"
  exit 1
fi
