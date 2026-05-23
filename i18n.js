const I18N_STORAGE_KEY = "dofiltor_language";
const I18N_DEFAULT_LANG = "en";
const I18N_MESSAGES = {
  en: {
    // Options page
    settings: "Settings",
    about: "About",
    appearance: "Appearance",
    language: "Language",
    languageHint: "Controls extension UI text where translations are available.",
    theme: "Theme",
    themeHint: "Applies to the popup, settings, and about page.",
    auto: "Auto",
    light: "Light",
    dark: "Dark",
    automation: "Automation",
    autoNext: "Auto-next",
    autoNextHint: "Move through result pages automatically when the provider supports it.",
    enabled: "Enabled",
    maxPages: "Max pages",
    maxPagesHint: "Stop after this many result pages.",
    pageDelay: "Page delay",
    pageDelayHint: "Delay before moving to the next page.",
    autoValidate: "Auto-validate",
    autoValidateHint: "Validate newly collected file URLs in the background.",
    validationDelay: "Validation delay",
    validationDelayHint: "Wait between background validation requests.",
    validationMode: "Validation mode",
    validationModeHint: "Choose how aggressively URL validation should check targets.",
    validateHeadOnly: "HEAD only",
    validateHeadGet: "HEAD + GET fallback",
    notifications: "Notifications",
    notificationsHint: "Show collection, CAPTCHA, and completion notifications.",
    historyCacheTitle: "History & validation cache",
    reuseValidationCache: "Reuse validation cache",
    reuseValidationCacheHint: "Skip network checks when a URL was validated before. Applies on collect and manual validate.",
    urlCacheMaxEntries: "Validation cache size",
    urlCacheMaxEntriesHint: "Maximum stored URL validation results. Oldest entries are removed first.",
    urlCacheMaxAgeDays: "Cache max age (days)",
    urlCacheMaxAgeDaysHint: "0 = never expire. Expired entries are re-checked over the network.",
    dorkHistoryMax: "Dork query history limit",
    dorkHistoryMaxHint: "Maximum saved dork queries in scan history (popup).",
    clearValidationCache: "Clear validation cache",
    validationCacheCleared: "Validation cache cleared",
    capture: "Capture",
    fileExtensions: "File extensions",
    fileExtensionsHint: "One extension per line or comma-separated.",
    providers: "Providers",
    providerHint: "Match result pages by host and path.",
    permissionChecking: "Checking",
    permissionBuiltIn: "Built-in",
    permissionGranted: "Granted",
    permissionNeeded: "Needs permission",
    permissionInvalid: "Invalid host",
    permissionDisabled: "Disabled",
    permissionUnknown: "Unknown",
    name: "Name",
    hostContains: "Host contains",
    pathContains: "Path contains",
    queryParam: "Query param",
    nextSelector: "Next selector",
    testUrl: "Test URL",
    remove: "Remove",
    testProvider: "Test",
    providerTestMatched: "Matched",
    providerTestFailed: "No match",
    addProvider: "Add provider",
    save: "Save",
    resetDefaults: "Reset defaults",
    saved: "Saved",
    savedPermissionMissing: "Saved, but provider host permission was not granted.",
    defaultsRestored: "Defaults restored",
    description: "Description",
    version: "Version",
    repository: "Repository",
    privacyPolicy: "Privacy Policy",
    releaseReadiness: "Release readiness",
    permissions: "Permissions",
    providerHosts: "Provider hosts",
    changelog: "Changelog",
    ready: "Ready",

    // Popup - header
    appName: "Dofiltor",
    appSubtitle: "Dork File Collector",
    toggleExtension: "Toggle extension",
    extensionOn: "Extension on",
    extensionOff: "Extension off",
    githubRepo: "GitHub repository",
    themeToggle: "Theme",
    scopeUnknown: "Checking current tab...",
    scopeCollecting: "Collecting: {provider}",
    scopeUnsupported: "Provider unsupported",
    scopePaused: "Paused",
    scopePermissionNeeded: "Permission needed: {provider}",
    availableTypes: "Available types",
    close: "Close",

    // Popup - auto-next bar
    autoNextOn: "Auto-next",
    autoNextOff: "Auto-next",
    max: "Max",
    pages: "pages",

    // Popup - stats
    statUrls: "URLs",
    statValid: "Valid",
    statDead: "Dead",
    statTypes: "Types",
    statGrabbedLifetime: "{n} grabbed (lifetime)",
    statCheckedLifetime: "{n} checked (lifetime)",
    statCacheHitsLifetime: "{n} from cache",
    noTypesCollected: "No file types collected yet",

    // Popup - toolbar
    validate: "Validate",
    export: "Export",
    exportSelected: "Export selected",
    selectVisible: "Select visible",
    unselectAll: "Unselect all",
    copyUrls: "Copy URLs",
    batchDownload: "Batch download valid",
    scanHistory: "Scan history",
    settingsTooltip: "Settings",
    aboutTooltip: "About",
    removeDead: "Remove dead",
    clearAll: "Clear all",

    // Popup - sort
    sortBy: "Sort by",
    sortDesc: "Sort descending",
    sortAsc: "Sort ascending",
    sortDate: "Date",
    sortSize: "Size",
    sortStatus: "Status",
    sortDomain: "Domain",
    sortType: "Type",

    // Popup - export format
    exportFormat: "Export format",
    formatCsv: "CSV",
    formatTxt: "TXT",
    formatJson: "JSON",
    formatXlsx: "XLSX",

    // Popup - search
    searchPlaceholder: "Filter: text, domain:*, file:/regex/i...",
    searchClear: "Clear search",
    clearFilters: "Clear filters",
    invalidFilter: "Invalid filter pattern",

    // Popup - captcha
    captchaDetected: "CAPTCHA detected - auto-next paused",
    captchaShow: "Show",

    // Popup - empty state
    emptyTitle: "No URLs collected yet",
    emptyDesc: "Run a dork query on any enabled provider.\nMatching file URLs appear here automatically.",

    // Popup - footer

    // Popup - validation
    checking: "Checking",
    of: "of",
    validating: "Validating...",

    // Popup - status messages
    statusValidDead: "{valid} valid, {dead} dead",
    statusExported: "Exported {count} as {format}",
    statusCopied: "Copied {count}",
    statusCopiedFallback: "Copied",
    statusDownloading: "Downloading {done}/{total}",
    statusDownloaded: "Downloaded {done}/{total}",
    statusNothingToDownload: "Nothing to download",
    statusRemovedOne: "Removed 1 URL",
    statusRemovedDead: "Removed {count} dead",
    statusCleared: "Cleared {count} URLs",
    statusNoHistory: "No scan history yet",
    statusHistoryCleared: "History cleared",
    statusRestored: "Restored",
    statusEnabled: "Extension enabled",
    statusDisabled: "Extension disabled",
    statusSaved: "Settings saved",
    statusPageOf: "Page {page} → {next}",
    statusStopped: "Stopped",
    statusDone: "Done",

    // Popup - history
    historyTitle: "Scan History ({count})",
    historyClear: "Clear",
    historyBack: "Back to URLs",
    historyUrlsPages: "{urls} URLs · {pages} pages",

    // Popup - misc
    noMatching: "No matching URLs",
    allFilter: "All",
    downloaded: "downloaded",
    valid: "valid",
    dead: "dead",
    pending: "pending",
    open: "Open",
    download: "Download",
    undo: "Undo",

    // Background - notifications
    notifNewUrls: "{count} new URLs found for \"{query}...\"",
    notifCaptcha: "CAPTCHA Detected",
    notifCaptchaMsg: "Auto-next paused. Solve the CAPTCHA to continue.",
    notifDone: "Dork File Collector - Done",
    bgDownloading: "Downloading",
    bgDone: "Done",
    bgNothingToDownload: "Nothing to download",
    unknown: "unknown",
    urlsCount: "{n} URLs · {types} types",
  },
  id: {
    // Options page
    settings: "Pengaturan",
    about: "Tentang",
    appearance: "Tampilan",
    language: "Bahasa",
    languageHint: "Mengatur teks UI extension jika terjemahan tersedia.",
    theme: "Tema",
    themeHint: "Berlaku untuk popup, pengaturan, dan halaman tentang.",
    auto: "Otomatis",
    light: "Terang",
    dark: "Gelap",
    automation: "Otomasi",
    autoNext: "Auto-next",
    autoNextHint: "Berpindah halaman hasil secara otomatis jika provider mendukung.",
    enabled: "Aktif",
    maxPages: "Maks halaman",
    maxPagesHint: "Berhenti setelah jumlah halaman hasil ini.",
    pageDelay: "Delay halaman",
    pageDelayHint: "Jeda sebelum berpindah ke halaman berikutnya.",
    autoValidate: "Auto-validasi",
    autoValidateHint: "Validasi URL file baru di background.",
    validationDelay: "Delay validasi",
    validationDelayHint: "Jeda antar request validasi background.",
    validationMode: "Mode validasi",
    validationModeHint: "Pilih seberapa agresif validasi URL mengecek target.",
    validateHeadOnly: "HEAD saja",
    validateHeadGet: "HEAD + fallback GET",
    notifications: "Notifikasi",
    notificationsHint: "Tampilkan notifikasi koleksi, CAPTCHA, dan selesai.",
    historyCacheTitle: "Riwayat & cache validasi",
    reuseValidationCache: "Pakai cache validasi",
    reuseValidationCacheHint: "Lewati pengecekan jaringan jika URL pernah divalidasi. Berlaku saat koleksi dan validasi manual.",
    urlCacheMaxEntries: "Ukuran cache validasi",
    urlCacheMaxEntriesHint: "Maksimum hasil validasi URL yang disimpan. Entri terlama dihapus lebih dulu.",
    urlCacheMaxAgeDays: "Umur maks cache (hari)",
    urlCacheMaxAgeDaysHint: "0 = tidak kedaluwarsa. Entri kedaluwarsa dicek ulang lewat jaringan.",
    dorkHistoryMax: "Batas riwayat query dork",
    dorkHistoryMaxHint: "Maksimum query dork tersimpan di riwayat scan (popup).",
    clearValidationCache: "Hapus cache validasi",
    validationCacheCleared: "Cache validasi dihapus",
    capture: "Tangkap",
    fileExtensions: "Ekstensi file",
    fileExtensionsHint: "Satu ekstensi per baris atau dipisahkan koma.",
    providers: "Provider",
    providerHint: "Cocokkan halaman hasil berdasarkan host dan path.",
    permissionChecking: "Mengecek",
    permissionBuiltIn: "Bawaan",
    permissionGranted: "Granted",
    permissionNeeded: "Butuh permission",
    permissionInvalid: "Host tidak valid",
    permissionDisabled: "Nonaktif",
    permissionUnknown: "Tidak diketahui",
    name: "Nama",
    hostContains: "Host memuat",
    pathContains: "Path memuat",
    queryParam: "Parameter query",
    nextSelector: "Selector berikutnya",
    testUrl: "URL contoh",
    remove: "Hapus",
    testProvider: "Test",
    providerTestMatched: "Cocok",
    providerTestFailed: "Tidak cocok",
    addProvider: "Tambah provider",
    save: "Simpan",
    resetDefaults: "Reset default",
    saved: "Tersimpan",
    savedPermissionMissing: "Tersimpan, tapi permission host provider belum diberikan.",
    defaultsRestored: "Default dipulihkan",
    description: "Deskripsi",
    version: "Versi",
    repository: "Repositori",
    privacyPolicy: "Kebijakan Privasi",
    releaseReadiness: "Kesiapan rilis",
    permissions: "Permission",
    providerHosts: "Host provider",
    changelog: "Changelog",
    ready: "Siap",

    // Popup - header
    appName: "Dofiltor",
    appSubtitle: "Dork File Collector",
    toggleExtension: "Toggle",
    extensionOn: "Aktif",
    extensionOff: "Nonaktif",
    githubRepo: "Repositori GitHub",
    themeToggle: "Tema",
    scopeUnknown: "Mengecek tab aktif...",
    scopeCollecting: "Collecting: {provider}",
    scopeUnsupported: "Provider tidak didukung",
    scopePaused: "Dijeda",
    scopePermissionNeeded: "Butuh permission: {provider}",
    availableTypes: "Tipe tersedia",
    close: "Tutup",

    // Popup - auto-next bar
    autoNextOn: "Auto-next",
    autoNextOff: "Auto-next",
    max: "Maks",
    pages: "hal",

    // Popup - stats
    statUrls: "URLs",
    statValid: "Valid",
    statDead: "Mati",
    statTypes: "Tipe",
    statGrabbedLifetime: "{n} terkumpul (total)",
    statCheckedLifetime: "{n} dicek (total)",
    statCacheHitsLifetime: "{n} dari cache",
    noTypesCollected: "Belum ada tipe file terkumpul",

    // Popup - toolbar
    validate: "Validasi",
    export: "Ekspor",
    exportSelected: "Ekspor pilihan",
    selectVisible: "Pilih yang terlihat",
    unselectAll: "Batalkan semua pilihan",
    copyUrls: "Salin URL",
    batchDownload: "Unduh massal",
    scanHistory: "Riwayat",
    settingsTooltip: "Pengaturan",
    aboutTooltip: "Tentang",
    removeDead: "Hapus mati",
    clearAll: "Bersihkan",

    // Popup - sort
    sortBy: "Urutkan",
    sortDesc: "Urut turun",
    sortAsc: "Urut naik",
    sortDate: "Tanggal",
    sortSize: "Ukuran",
    sortStatus: "Status",
    sortDomain: "Domain",
    sortType: "Tipe",

    // Popup - export format
    exportFormat: "Format ekspor",
    formatCsv: "CSV",
    formatTxt: "TXT",
    formatJson: "JSON",
    formatXlsx: "XLSX",

    // Popup - search
    searchPlaceholder: "Filter: teks, domain:*, file:/regex/i...",
    searchClear: "Hapus filter",
    clearFilters: "Hapus filter",
    invalidFilter: "Pattern filter tidak valid",

    // Popup - captcha
    captchaDetected: "CAPTCHA terdeteksi - auto-next dijeda",
    captchaShow: "Lihat",

    // Popup - empty state
    emptyTitle: "Belum ada URL terkumpul",
    emptyDesc: "Jalankan dork query di provider yang aktif.\nURL file yang cocok akan muncul otomatis.",

    // Popup - footer

    // Popup - validation
    checking: "Memeriksa",
    of: "dari",
    validating: "Memvalidasi...",

    // Popup - status messages
    statusValidDead: "{valid} valid, {dead} mati",
    statusExported: "{count} diekspor sebagai {format}",
    statusCopied: "{count} disalin",
    statusCopiedFallback: "Disalin",
    statusDownloading: "Mengunduh {done}/{total}",
    statusDownloaded: "Terunduh {done}/{total}",
    statusNothingToDownload: "Tidak ada yang diunduh",
    statusRemovedOne: "1 URL dihapus",
    statusRemovedDead: "{count} mati dihapus",
    statusCleared: "{count} URL dibersihkan",
    statusNoHistory: "Belum ada riwayat",
    statusHistoryCleared: "Riwayat dibersihkan",
    statusRestored: "Dipulihkan",
    statusEnabled: "Ekstensi diaktifkan",
    statusDisabled: "Ekstensi dinonaktifkan",
    statusSaved: "Pengaturan disimpan",
    statusPageOf: "Hal {page} → {next}",
    statusStopped: "Berhenti",
    statusDone: "Selesai",

    // Popup - history
    historyTitle: "Riwayat Scan ({count})",
    historyClear: "Bersihkan",
    historyBack: "Kembali ke URL",
    historyUrlsPages: "{urls} URL · {pages} hal",

    // Popup - misc
    noMatching: "Tidak ada URL cocok",
    allFilter: "Semua",
    downloaded: "terunduh",
    valid: "valid",
    dead: "mati",
    pending: "tertunda",
    open: "Buka",
    download: "Unduh",
    undo: "Urungkan",

    // Background - notifications
    notifNewUrls: "{count} URL baru ditemukan untuk \"{query}...\"",
    notifCaptcha: "CAPTCHA Terdeteksi",
    notifCaptchaMsg: "Auto-next dijeda. Selesaikan CAPTCHA untuk melanjutkan.",
    notifDone: "Dork File Collector - Selesai",
    bgDownloading: "Mengunduh",
    bgDone: "Selesai",
    bgNothingToDownload: "Tidak ada yang diunduh",
    unknown: "tidak diketahui",
    urlsCount: "{n} URL · {tipe} tipe",
  },
};

function getI18nLanguage() {
  return localStorage.getItem(I18N_STORAGE_KEY) || I18N_DEFAULT_LANG;
}

function setI18nLanguage(lang) {
  localStorage.setItem(I18N_STORAGE_KEY, I18N_MESSAGES[lang] ? lang : I18N_DEFAULT_LANG);
}

function t(key, replacements) {
  const lang = getI18nLanguage();
  let msg = I18N_MESSAGES[lang]?.[key] || I18N_MESSAGES[I18N_DEFAULT_LANG][key] || key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      msg = msg.replace("{" + k + "}", v);
    }
  }
  return msg;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  root.querySelectorAll("[data-i18n-tip]").forEach((el) => {
    el.setAttribute("data-tip", t(el.dataset.i18nTip));
  });
}
