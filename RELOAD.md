# Extension tidak jalan / error `popup.js?v=3.5.0`

Chrome masih menjalankan **salinan lama** ekstensi. Repo ini memakai **`panel.html` + `ui-panel.js`** (v3.5.3+). File `popup.js` sudah **dihapus**.

## Perbaikan (wajib)

1. Buka `chrome://extensions`
2. **Hapus (Remove)** semua entry "Dofiltor" / "Dork File Collector"
3. **Load unpacked** → pilih folder **ini** (`extension/`, yang berisi `manifest.json` + `panel.html`)
4. Versi di kartu harus **3.5.3**
5. Klik ikon ekstensi → Inspect side panel
6. Di Sources harus ada: `panel.html`, `ui-panel.js` — **bukan** `popup.js`

Verifikasi di Console:

```js
window.__DOFILTOR_UI_VERSION__  // "3.5.3"
```

Jika masih `popup.js?v=3.5.0`, path **Source** di Details salah (folder lain).
