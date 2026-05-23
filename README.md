<p align="center">
  <img src="icons/icon128.png" alt="Dofiltor" width="96" height="96">
</p>

<h1 align="center">Dofiltor</h1>
<p align="center"><strong>Dork File Collector</strong></p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-3.5.0-blue">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
  <img alt="Manifest" src="https://img.shields.io/badge/manifest-v3-orange">
  <img alt="Chrome" src="https://img.shields.io/badge/chrome-%E2%89%A588-4285F4?logo=googlechrome&logoColor=white">
  <img alt="GitHub Release" src="https://img.shields.io/github/v/release/iamutaki/dofiltor?logo=github">
</p>

<p align="center">A browser extension for collecting file URLs from configurable dork/search result providers.</p>

---

## Screenshots

<p align="center">
  <img src="images/main.png" alt="Main popup" width="380">
</p>

<details>
<summary>See more screenshots</summary>

<p align="center">
  <img src="images/setting.png" alt="Settings" width="380">
  <img src="images/provider.png" alt="Providers" width="380">
  <img src="images/about.png" alt="About" width="380">
</p>

</details>

---

## Features

| Feature | Description |
|---|---|
| **Multi-provider** | Google, Bing, DuckDuckGo, Yahoo, Yandex - with custom host rules |
| **Capture extensions** | PDF, XLSX, DOCX, CSV, PPTX, TXT, and more - fully configurable |
| **Batch download** | Download all valid files in one click |
| **Row validation** | Per-row status: `valid` , `dead` , `pending` |
| **Automation** | Auto-next page, configurable delays, auto-validation, notifications |
| **Theme** | Light / dark / auto - synced across popup and Settings |
| **Multi-language** | English & Bahasa Indonesia |

---

## Installation

**Option A - CRX (recommended)**

1. Download the `.crx` file from the [latest release](https://github.com/iamutaki/dofiltor/releases/latest) (always points to the newest tag)
2. Open `chrome://extensions` in your browser
3. Drag and drop the `.crx` file onto the page

[![Download CRX](https://img.shields.io/badge/download-.crx-1a73e8?style=flat-square&logo=googlechrome)](https://github.com/iamutaki/dofiltor/releases/latest/download/dofiltor.crx)

**Option B - Load unpacked**

1. Clone or download **Source code (zip)** from the [latest release](https://github.com/iamutaki/dofiltor/releases/latest)
   ```bash
   git clone https://github.com/iamutaki/dofiltor.git
   cd dofiltor
   git checkout "$(git describe --tags --abbrev=0)"
   ```
2. Open `chrome://extensions` in your browser
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the repo folder

[![Download ZIP](https://img.shields.io/badge/download-.zip-333?style=flat-square&logo=github)](https://github.com/iamutaki/dofiltor/releases/latest)

---

## Translations

Dofiltor currently supports **English** and **Bahasa Indonesia**. Want to add your language? Contributions are welcome!

1. Copy `i18n.js` and add a new block under `I18N_MESSAGES` with your language code (e.g. `fr`, `de`, `ja`)
2. Update `_locales/en/messages.json` for manifest strings
3. Open a pull request

All translatable strings are in one place — no digging through source files.

---

## Packaging (maintainers)

The signing key is **never** committed. `key.pem` is listed in `.gitignore` and must stay local only (or in the `EXTENSION_KEY` GitHub Actions secret for releases).

```bash
# Generate a key once (local only)
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem

chmod +x package.sh
./package.sh
```

CI writes the secret to `$RUNNER_TEMP/extension-key.pem` and passes `DOFILTOR_PACK_KEY` so Chrome never sees a key file inside the extension folder.

**Chrome Web Store ZIP** (no `key.pem`, no `.git`, no dev scripts):

```bash
chmod +x scripts/build-store-zip.sh
./scripts/build-store-zip.sh
# → dofiltor-store.zip
```

---

## License

MIT - [iamutaki](https://github.com/iamutaki)
