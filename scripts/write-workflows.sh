#!/bin/bash
# Regenerate GitHub Actions workflows (run from extension repo root).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.github/workflows"

cat > "$ROOT/.github/workflows/ci.yml" << 'EOF'
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Extension version
        id: ver
        run: |
          VERSION=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version")
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "manifest.json version: $VERSION"

      - name: Unit tests
        run: npm test

      - name: Locale keys
        run: npm run check:locales
EOF

cat > "$ROOT/.github/workflows/release.yml" << 'EOF'
name: Release

on:
  push:
    tags: [ "v*" ]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  pack:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Extension version
        id: ver
        run: |
          VERSION=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version")
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "manifest.json version: $VERSION"

      - name: Verify tag matches manifest
        if: startsWith(github.ref, 'refs/tags/')
        env:
          TAG_NAME: ${{ github.ref_name }}
          MANIFEST_VERSION: ${{ steps.ver.outputs.version }}
        run: |
          TAG="${TAG_NAME#v}"
          if [ "$TAG" != "$MANIFEST_VERSION" ]; then
            echo "::error::Tag v$TAG does not match manifest.json version $MANIFEST_VERSION"
            exit 1
          fi

      - name: Unit tests
        run: npm test

      - name: Locale keys
        run: npm run check:locales

      - name: Setup key
        env:
          EXTENSION_KEY: ${{ secrets.EXTENSION_KEY }}
        run: |
          echo "$EXTENSION_KEY" > "$RUNNER_TEMP/extension-key.pem"
          chmod 600 "$RUNNER_TEMP/extension-key.pem"

      - name: Install Chrome + xvfb
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y -qq google-chrome-stable xvfb || {
            wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
            sudo dpkg -i google-chrome-stable_current_amd64.deb 2>/dev/null || sudo apt-get -fqq -y install
            sudo apt-get install -y -qq xvfb
          }

      - name: Build CRX
        env:
          DOFILTOR_PACK_KEY: ${{ runner.temp }}/extension-key.pem
        run: |
          chmod +x package.sh
          xvfb-run --auto-servernum bash package.sh

      - uses: actions/upload-artifact@v4
        with:
          name: dofiltor-v${{ steps.ver.outputs.version }}
          path: dofiltor.crx

      - name: Extract release notes
        if: startsWith(github.ref, 'refs/tags/')
        run: |
          awk '/^## /{if(i++)exit}i{print}' changelogs.md > release-notes.md

      - name: Create Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: dofiltor.crx
          body_path: release-notes.md
EOF

echo "Wrote .github/workflows/ci.yml and release.yml"
