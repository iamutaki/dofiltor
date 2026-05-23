# Release smoke checklist (~5 minutes)

Run after loading the unpacked extension (or the built CRX) on a supported search provider (Google recommended).

## Load & UI

- [ ] Extension icon opens the popup without console errors.
- [ ] Options page opens; **Save** persists theme/language.
- [ ] Toolbar badge shows collected URL count (or empty when list is clear).

## Collect

- [ ] Run a dork with `filetype:pdf` (or another enabled extension); at least one URL appears in the popup.
- [ ] Scope bar shows active provider (not “unsupported”).
- [ ] Re-run the **same** dork on a new tab: duplicate-dork warning appears (scope bar or page notification).

## List actions

- [ ] **Validate** one row → status moves through **Checking** → ok/dead.
- [ ] **Remove dead** (if any) updates the list and badge count.
- [ ] **Clear all** shows a confirm dialog; after confirm, list is empty and badge clears; **Undo** restores.

## Settings

- [ ] **Scan history** and **Validation cache** are separate cards.
- [ ] **Merge default extensions** adds missing defaults without wiping custom entries (then **Save**).
- [ ] Provider **Test rules** with **Use active tab** on a search results page shows match details.

## Background / content

- [ ] Reload the extension, refresh the search tab: collection still works (no stale “context invalidated” loop).
- [ ] Optional: enable `localStorage.setItem("dofiltor_debug", "1")` on the search tab, reload — debug logs appear in the page console; set to `"0"` to silence.

## Before tagging a release

- [ ] `node --test test/` passes locally.
- [ ] `node scripts/check-locales.mjs` passes.
- [ ] `manifest.json` `version` matches git tag (e.g. tag `v3.5.1` → version `3.5.1`).
- [ ] `changelogs.md` **Unreleased** section moved under the new version heading.
