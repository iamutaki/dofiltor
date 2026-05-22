# Dofiltor - Dork File Collector

A browser extension for collecting file URLs from configurable dork/search result providers.

![Version](https://img.shields.io/badge/version-3.4.2-blue)

## Screenshots

![Main](images/main.png)

<details>
<summary>See more screenshots</summary>

![Settings](images/setting.png)

![Providers](images/provider.png)

![About](images/about.png)

</details>

## Features

- **Multi-provider** - support multiple dork/search providers with built-in presets and custom host rules
- **Capture extensions** - configure which file extensions to collect
- **Batch download** - download multiple files at once
- **Row validation** - per-row status indicators: `valid`, `dead`, and `pending`
- **Automation** - auto-next, max pages, page delay, auto-validation, validation delay
- **Theme** - light/dark theme synced between popup and Settings
- **Multi-language** - English and Bahasa Indonesia

## Installation

### Option A - CRX (recommended)

[![Download CRX](https://img.shields.io/badge/download-crx-1a73e8?style=for-the-badge&logo=googlechrome)](https://github.com/iamutaki/dofiltor/releases/latest/download/dofiltor.crx)

1. Download the `.crx` file from the latest release
2. Go to `chrome://extensions`
3. Drag and drop the `.crx` file onto the page

### Option B - Load unpacked

[![Download ZIP](https://img.shields.io/badge/download-zip-1a73e8?style=for-the-badge&logo=github)](https://github.com/iamutaki/dofiltor/archive/refs/heads/main.zip)

Or clone:

```bash
git clone https://github.com/iamutaki/dofiltor.git
```

1. Unzip (if downloaded) and note the folder path
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the repo folder

## License

MIT
