# Changelog

## 3.4.3

- Added global on/off toggle to pause/resume the extension without disabling it in the browser.
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
