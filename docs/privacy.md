# Dofiltor Privacy Policy

Last updated: May 23, 2026

Dofiltor is a browser extension for collecting file URLs from configurable public search and dork result providers. This policy explains what data the extension reads, stores, and uses.

## Data the Extension Reads

Dofiltor may read the visible document object model (DOM) on supported search result provider pages so it can find links that match the file extensions and provider rules configured by the user.

The extension may read:

- Search result links shown on supported provider pages.
- The current page URL and query text used to identify the active provider and collection context.
- Link metadata that can be derived from the collected URLs, such as domain, file type, filename, validation status, size, and collection time.

Dofiltor does not read page content outside the supported result provider pages declared by the extension.

## Data the Extension Stores

Dofiltor stores extension data locally in the browser using Chrome extension storage.

Stored data may include:

- Collected file URLs.
- Validation status and file metadata.
- Download or scan history shown by the extension UI.
- User settings, including theme, language, file extension filters, automation options, and provider configuration.

This data stays on the user's device unless the user manually exports, copies, opens, or downloads it.

## Data Sharing

Dofiltor does not sell, rent, or share user data with third parties.

Dofiltor does not send collected URLs, settings, history, or search context to a developer-operated server.

When the user validates URLs or downloads files, the browser may make requests directly to the target URLs or provider pages as part of the requested action.

## Permissions

Dofiltor requests browser permissions only to support its core features:

- `storage` is used to save local settings, collected URLs, and history.
- `activeTab` and `tabs` are used to detect and interact with the active supported provider tab.
- `downloads` is used when the user starts file downloads.
- `notifications` is used for optional collection, CAPTCHA, and completion notifications.

## User Control

Users can clear collected URLs and history from the extension UI. Users can also reset settings, disable automation options, disable notifications, or remove the extension from Chrome to delete extension-managed local data.

## Changes

This policy may be updated when Dofiltor changes how it reads, stores, or uses data. Material changes should be documented in the project changelog.

## Contact

Project repository: [iamutaki/dofiltor](https://github.com/iamutaki/dofiltor)
