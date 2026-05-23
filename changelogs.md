# Changelog

## Unreleased

- Removed the unused `activeTab` permission from the extension manifest.
- Added a release-ready privacy policy draft and linked it from the About page.
- Removed the unused `scripting` permission from the extension manifest.
- Replaced the global `<all_urls>` content script match with explicit built-in provider hosts.
- Reduced default DOM observer scope to supported search/dork result providers.

## 3.4.6

- Show extension version (`vX.Y.Z`) next to the app name in the popup header.
- Fixed horizontal scrolling on the domain filter bar when many domains are listed (trackpad/wheel and drag).
- Release workflow keeps the signing key outside the extension folder so Chrome CRX packaging succeeds in CI.

## 3.4.5

- activate workflow build

## 3.4.4

- Removed browser-added fragments (`#:~:text=...`) from collected URLs to prevent open/download errors.

## 3.4.3

- Added global on/off toggle to pause/resume the extension without disabling it in the browser. When toggled back on, automatically rescans the current page and resumes auto-next.
- Simplified README: cleaner layout, clearer installation steps, fewer icons.

## 3.4.2

- Fixed Bing search result URL extraction by decoding base64 `u` parameter from `/ck/a` redirect URLs.
- Fixed popup row layout: prevented metadata (status chip, size) from wrapping into multiple lines.

## 3.4.1

- Enlarged the extension icon circle to use more of the available canvas.
- Updated generated 16, 48, and 128px icons plus the source SVG.

## 3.4.0

- Added Chrome extension locale scaffolding with English and Indonesian manifest messages.
- Added an internal i18n helper and persistent language preference.
- Added a Language selector to Settings and localized the Options/About UI foundation.

## 3.3.3

- Renamed the popup virtual-scroll saved position variable to avoid stale-script `scrollTop` redeclaration errors.
- Updated the popup script cache-buster after the fix.

## 3.3.2

- Added visible row-level validation indicators for `valid`, `dead`, and `pending` states.
- Soft-highlighted validated rows through the file type badge border.

## 3.3.1

- Moved theme controls into the Settings page and synced them with the popup theme preference.
- Added Automation settings for auto-next, max pages, page delay, auto-validation, validation delay, and notifications.
- Reworked the Options/About UI to follow a more native Chrome settings style.
- Replaced the popup sort direction dropdown with an arrow toggle button.
- Updated popup branding to use the extension icon instead of the old `DF` text mark.

## 3.3.0

- Added persistent, user-configurable capture extensions.
- Added configurable dork/search providers with default provider presets and custom host rules.
- Added a native options page with Settings and About tabs.
- Added About information for Dofiltor, version, and repository link.
- Replaced extension icons with a retro flat two-tone circular icon set.
- Generalized wording so the extension is not Google-specific.
- Improved batch download badge contrast and domain filter scrolling.
