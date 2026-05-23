# Changelog

## Unreleased

- Fix toolbar icon badge not clearing after **Clear all** (badge now resets to empty with the URL list).
- Warn when the current tab's dork query was already captured before (scope bar in popup + optional notification on the search page).
- Show a **Checking** state on rows while URL validation is in progress (manual validate and auto-validate).
- Provider rule test: **Use active tab** fills the URL from the current browser tab; results show per-rule pass/fail aligned with real collection (host/path), plus query-param and enabled checks.

## 3.5.0

- Expanded default capture extensions for generic office formats: OpenDocument (ODP, ODG, ODF, ODB, flat ODF), Microsoft Office templates and macro-enabled files, legacy StarOffice, and other suites (WordPerfect, AbiWord, HWP, Apple iWork).
- Centralized default file-type list and badge styling groups in `file-types.js`.
- On extension update/startup, merge newly shipped default file extensions into saved settings without removing user-custom entries (`fileTypesVersion` tracks incremental additions).
- Moved select/unselect/export-selected controls into the sort toolbar so the main action bar no longer shifts when selection appears.
- Fixed double scrollbar in popup: capped panel height to Chrome's 600px limit and tightened flex on the results area so only the URL list scrolls.
- Types summary dialog hides file types with zero collected URLs.
- Lifetime stats: total URLs grabbed and checked (shown under the stats bar).
- Persistent validation cache: reuse prior check results client-side (configurable max size, age, on/off).
- Enhanced dork query history with provider metadata and configurable history limit.
- Modernized checkbox controls in Settings to match the Chrome-style UI.
- Expanded the File extensions textarea in Settings for easier editing.
- Added extension-aware file badges and an available file types dialog from the Types stat.
- Added Select visible and Unselect all controls for export-selected workflows.
- Added a popup collection scope indicator for active provider, paused, unsupported, and permission-needed states.
- Added provider test controls for checking host, path, and query rules against an example URL.
- Added a release readiness checklist to the About page.
- Added provider permission status badges and configurable validation mode.
- Added optional host permission requests and dynamic content-script registration for user-added providers.
- Reintroduced `scripting` permission for dynamic provider registration.
- Deduplicated collected URL rows, normalized file URL fragments, stabilized the search bar height, and added a GitHub header button.
- Kept auto-validation enabled by default while allowing users to disable it and clear queued automatic checks.
- Added row selection with an export-selected action for CSV, TXT, JSON, and XLSX.
- Replaced the domain-grouped export option with XLSX and added advanced text/wildcard/regex filtering.
- Added a clear-filters action that appears when domain, type, or text filters are active.
- Increased popup height with an explicit list minimum so collected files remain visible.
- Hardened popup and options rendering to avoid raw HTML insertion and tolerate malformed local history data.
- Removed the unused `activeTab` permission from the extension manifest.
- Added a release-ready privacy policy draft and linked it from the About page.
- Replaced the global `<all_urls>` content script match with explicit built-in provider hosts.
- Reduced default DOM observer scope to supported search/dork result providers.

## 3.4.6

- Split UI translations into per-locale `_locales/<lang>/ui.json` files with lazy loading; see `_locales/README.md` for contributors.
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
