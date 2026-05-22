const I18N_STORAGE_KEY = "dofiltor_language";
const I18N_DEFAULT_LANG = "en";
const I18N_MESSAGES = {
  en: {
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
    notifications: "Notifications",
    notificationsHint: "Show collection, CAPTCHA, and completion notifications.",
    capture: "Capture",
    fileExtensions: "File extensions",
    fileExtensionsHint: "One extension per line or comma-separated.",
    providers: "Providers",
    providerHint: "Match result pages by host and path.",
    name: "Name",
    hostContains: "Host contains",
    pathContains: "Path contains",
    queryParam: "Query param",
    nextSelector: "Next selector",
    remove: "Remove",
    addProvider: "Add provider",
    save: "Save",
    resetDefaults: "Reset defaults",
    saved: "Saved",
    defaultsRestored: "Defaults restored",
    description: "Description",
    version: "Version",
    repository: "Repository",
  },
  id: {
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
    notifications: "Notifikasi",
    notificationsHint: "Tampilkan notifikasi koleksi, CAPTCHA, dan selesai.",
    capture: "Tangkap",
    fileExtensions: "Ekstensi file",
    fileExtensionsHint: "Satu ekstensi per baris atau dipisahkan koma.",
    providers: "Provider",
    providerHint: "Cocokkan halaman hasil berdasarkan host dan path.",
    name: "Nama",
    hostContains: "Host memuat",
    pathContains: "Path memuat",
    queryParam: "Parameter query",
    nextSelector: "Selector berikutnya",
    remove: "Hapus",
    addProvider: "Tambah provider",
    save: "Simpan",
    resetDefaults: "Reset default",
    saved: "Tersimpan",
    defaultsRestored: "Default dipulihkan",
    description: "Deskripsi",
    version: "Versi",
    repository: "Repositori",
  },
};

function getI18nLanguage() {
  return localStorage.getItem(I18N_STORAGE_KEY) || I18N_DEFAULT_LANG;
}

function setI18nLanguage(lang) {
  localStorage.setItem(I18N_STORAGE_KEY, I18N_MESSAGES[lang] ? lang : I18N_DEFAULT_LANG);
}

function t(key) {
  const lang = getI18nLanguage();
  return I18N_MESSAGES[lang]?.[key] || I18N_MESSAGES[I18N_DEFAULT_LANG][key] || key;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}
