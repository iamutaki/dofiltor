# Dofiltor — Scale-Up Plan

Task list pengembangan Dofiltor, diurutkan berdasarkan prioritas.
Tandai dengan `[x]` saat selesai dikerjakan.

---

## P1 — Quick Wins & High Impact

- [x] **Keyboard Shortcuts** — `Space` (toggle select), `Ctrl+E` (export), `Ctrl+F` (focus filter), `G` (grab page), `Escape` (clear). Scope: ui-panel.js saja. Kompleksitas rendah.
- [x] **Dork Template Library** — Simpan dork query favorit dengan kategori & nama. Storage key baru + collapsible section di side panel. Scope: ui-panel.js, background.js, panel.html, `_locales`.
- [x] **Rate Limiter Visual** — Countdown badge saat menunggu delay antar-page (auto-next / validate). Scope: content.js (broadcast timer), ui-panel.js (badge), panel.html.
- [x] **Batch Operations** — Select all dead → remove, select all pending → validate. Multi-select actions yang belum ada. Scope: ui-panel.js, panel.html.
- [x] **URL Tagging / Notes** — Tambah tag atau catatan per URL. Berguna untuk anotasi manual saat OSINT. Scope: background.js (storage), ui-panel.js (inline edit), panel.html.

## P2 — UX & Data Quality

- [ ] **Session Resume / Crash Recovery** — Checkpoint ke storage setiap selesai 1 dork dalam bulk queue. Resume dari checkpoint terakhir saat extension aktif kembali. Scope: background.js, content.js, ui-panel.js.
- [ ] **URL Metadata Enrichment** — Ambil `Content-Disposition`, `Content-Length`, `Last-Modified`, MIME type saat validasi. Tampilkan di row tanpa download file. Scope: background.js (VALIDATE_URL), ui-panel.js, panel.html.
- [ ] **Search Within Results by Dork Query** — Filter hasil berdasarkan dork query yang menghasilkan URL tersebut. Saat ini filter hanya per domain & file type. Scope: ui-panel.js, panel.html.
- [ ] **Import URLs from File** — Load CSV/TXT/JSON berisi daftar URL ke dalam collection. Berguna untuk merge hasil dari sumber lain. Scope: background.js, ui-panel.js, panel.html.
- [ ] **Sound Notification** — Notifikasi suara saat bulk selesai / CAPTCHA terdeteksi / semua page done. Opsional di settings. Scope: background.js, options.js.
- [ ] **Export with Metadata** — Export CSV/XLSX yang menyertakan metadata (size, status, discovered_at, query, tags). Scope: background.js (CSV_COLUMNS expansion), ui-panel.js.

## P3 — Provider & Coverage

- [ ] **Provider: Baidu** — Dukungan Baidu search. Perlu CSS selector research + CAPTCHA pattern. Scope: background.js, content.js, provider-utils.js, manifest.json, options.js.
- [ ] **Provider: Brave Search** — Brave makin populer untuk privacy-focused OSINT. Scope: sama seperti Baidu.
- [ ] **Custom CSS Selectors per Provider** — User bisa override `nextSelector` dan result link selector di settings tanpa edit kode. Scope: options.js, provider-utils.js, content.js.
- [ ] **Provider Health Check** — Test otomatis apakah provider saat ini bisa diakses & selector masih valid. Badge merah/kuning/hijau di provider list. Scope: background.js, options.js.

## P4 — Workflow Automation

- [ ] **Auto-Export after Bulk** — Setelah bulk dork selesai, otomatis export ke CSV/XLSX. Toggle di settings. Scope: background.js (post-bulk hook), ui-panel.js.
- [ ] **Scheduled Dork Run** — Jalankan dork template secara berkala (harian / mingguan). Notifikasi jika ada URL baru. Scope: background.js (chrome.alarms), options.js.
- [ ] **Result Diff** — Bandingkan hasil dork yang sama antar run. Tandai URL baru vs yang sudah ada dari run sebelumnya. Scope: background.js, ui-panel.js.
- [ ] **Shareable Collection** — Export/import collection lengkap (URLs + metadata + dork query) sebagai file JSON. Berguna untuk kolaborasi tim. Scope: background.js, ui-panel.js.

## P5 — Data Quality & Analytics

- [ ] **Duplicate Detection (Content Hashing)** — Dedup berdasarkan `ETag` / `Content-Length` + `Last-Modified` matching, bukan hanya URL. Scope: background.js, ui-panel.js.
- [ ] **URL Health Monitoring** — Re-check URL yang sudah validated secara periodik. Tandai yang berubah dari valid → dead. Scope: background.js (chrome.alarms), ui-panel.js.
- [ ] **Statistics Dashboard** — Mini-chart: per-hari/week, top file types, provider comparison, domain distribution. Tab baru di options. Scope: options.js, options.html, background.js.

## P6 — Polish & Infrastructure

- [ ] **Context Menu Integration** — Right-click di halaman search → "Collect file links from this page". Scope: background.js (chrome.contextMenus), manifest.json.
- [ ] **Refactor: Shared Constants** — DEFAULT_PROVIDERS, STATIC_PROVIDER_HOSTS, DEFAULT_SETTINGS di-copy paste di 4 file. Pindahkan ke satu shared module. Scope: semua file JS.
- [ ] **Refactor: UI Virtual Scroll** — Saat ini render semua row. Untuk 1000+ URL, perlu virtual scrolling yang lebih robust. Scope: ui-panel.js, panel.html.
- [ ] **Accessibility (a11y)** — ARIA labels, focus management, screen reader support. Scope: panel.html, options.html, ui-panel.js.
- [ ] **E2E Tests** — Playwright/Puppeteer test untuk flow utama (scan, collect, export, bulk). Scope: test/ directory baru.

---

## Urutan Pengerjaan yang Disarankan

```text
Phase 1 — Quick Wins
  ├── Keyboard Shortcuts
  ├── Batch Operations
  └── Rate Limiter Visual

Phase 2 — Core Features
  ├── Dork Template Library
  ├── Session Resume
  └── URL Metadata Enrichment

Phase 3 — Coverage
  ├── Provider: Baidu
  ├── Provider: Brave
  └── Custom CSS Selectors

Phase 4 — Automation
  ├── Auto-Export
  ├── Result Diff
  └── Scheduled Dork Run

Phase 5 — Polish
  ├── Refactor Shared Constants
  ├── Duplicate Detection
  └── Statistics Dashboard

Phase 6 — Infrastructure
  ├── E2E Tests
  ├── Accessibility
  └── Virtual Scroll
```

---

## Implementasi Per File

| File | Task yang menyentuh |
|---|---|
| [background.js](background.js) | Semua task — storage, validation, bulk queue, alarms |
| [content.js](content.js) | Crash recovery, rate limiter visual, provider baru |
| [ui-panel.js](ui-panel.js) | Semua fitur UI — templates, shortcuts, metadata, dashboard |
| [panel.html](panel.html) | UI elements untuk semua fitur baru |
| [options.js](options.js) / [options.html](options.html) | Provider presets, settings baru, statistics dashboard |
| [provider-utils.js](provider-utils.js) | Provider baru (Baidu, Brave) |
| [manifest.json](manifest.json) | Content script matches, permissions baru |
| `_locales/*/ui.json` | String baru untuk semua fitur (EN + ID) |
