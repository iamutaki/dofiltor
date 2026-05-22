# Translations

UI strings are split by language so the extension only loads what it needs.

## Layout

```
_locales/
  en/
    messages.json   # Chrome manifest (name, description) — required format
    ui.json         # Popup, options, shared UI strings (flat JSON)
  id/
    messages.json
    ui.json
```

`i18n.js` loads `_locales/<lang>/ui.json` at runtime (English is always loaded as fallback).

## Add a new language

1. Copy `_locales/en/ui.json` to `_locales/<code>/ui.json` (e.g. `fr`, `de`, `ja`).
2. Translate every value; **keep keys unchanged**.
3. Add `_locales/<code>/messages.json` for the extension name/description (Chrome format):

   ```json
   {
     "extensionName": { "message": "..." },
     "extensionDescription": { "message": "..." }
   }
   ```

4. Register the code in `i18n.js`: add `"<code>"` to `I18N_SUPPORTED`.
5. Add an `<option>` in `options.html` (`#languageSelect`).
6. Run the locale check:

   ```bash
   node scripts/check-locales.mjs
   ```

## Placeholders

Some strings use `{name}` placeholders (e.g. `{n}`, `{types}`, `{count}`). Keep the same placeholder names in every language.

## Manifest vs UI

| File | Used by |
|------|---------|
| `messages.json` | `manifest.json` (`__MSG_*__`), Chrome Web Store |
| `ui.json` | Popup & options via `t()` / `data-i18n` |

Do not put UI strings only in `messages.json` unless you also wire them through `chrome.i18n.getMessage()`.
