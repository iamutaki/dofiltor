const SETTINGS_KEY = "dofiltor_settings";
const DEFAULT_FILE_TYPES = [
  "pdf", "xls", "xlsx", "doc", "docx", "txt", "csv",
  "ppt", "pptx", "odt", "ods", "rtf",
];
const DEFAULT_PROVIDERS = [
  { id: "google", name: "Google", enabled: true, hostContains: "google.", pathContains: "/search", queryParam: "q", nextSelector: "#pnnext" },
  { id: "bing", name: "Bing", enabled: true, hostContains: "bing.com", pathContains: "/search", queryParam: "q", nextSelector: "a.sb_pagN" },
  { id: "duckduckgo", name: "DuckDuckGo", enabled: true, hostContains: "duckduckgo.com", pathContains: "/", queryParam: "q", nextSelector: "a[rel='next']" },
  { id: "yahoo", name: "Yahoo", enabled: false, hostContains: "search.yahoo.com", pathContains: "/search", queryParam: "p", nextSelector: "a.next" },
  { id: "yandex", name: "Yandex", enabled: false, hostContains: "yandex.", pathContains: "/search", queryParam: "text", nextSelector: "a[aria-label='Next page']" },
];
const DEFAULT_SETTINGS = {
  autoNext: false,
  maxPages: 50,
  pageDelay: 3000,
  autoValidate: true,
  validateDelay: 1500,
  notifications: true,
  fileTypes: DEFAULT_FILE_TYPES,
  providers: DEFAULT_PROVIDERS,
};

let settings = { ...DEFAULT_SETTINGS };
let providers = [];

function $(id) { return document.getElementById(id); }
function hasChromeStorage() { return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local; }
function loadTheme() { return localStorage.getItem("dofiltor_theme") || "auto"; }
function saveTheme(theme) { localStorage.setItem("dofiltor_theme", theme); }
function applyTheme(theme) { document.documentElement.setAttribute("data-theme", theme); }

function normalizeFileTypes(text) {
  return text
    .split(/[\s,]+/)
    .map((ext) => ext.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean)
    .filter((ext, index, list) => list.indexOf(ext) === index);
}

function loadSettings() {
  if (!hasChromeStorage()) return Promise.resolve({ ...DEFAULT_SETTINGS });
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (res) => {
      const stored = res[SETTINGS_KEY] || {};
      resolve({
        ...DEFAULT_SETTINGS,
        ...stored,
        fileTypes: Array.isArray(stored.fileTypes) && stored.fileTypes.length ? stored.fileTypes : DEFAULT_FILE_TYPES,
        providers: Array.isArray(stored.providers) && stored.providers.length ? stored.providers : DEFAULT_PROVIDERS,
      });
    });
  });
}

function saveSettings(next) {
  settings = next;
  if (!hasChromeStorage()) return Promise.resolve();
  return new Promise((resolve) => chrome.storage.local.set({ [SETTINGS_KEY]: next }, resolve));
}

function setTab(name) {
  const isAbout = name === "about";
  $("settingsSection").classList.toggle("active", !isAbout);
  $("aboutSection").classList.toggle("active", isAbout);
  $("tabSettings").classList.toggle("active", !isAbout);
  $("tabAbout").classList.toggle("active", isAbout);
}

function providerTemplate(provider, index) {
  const box = document.createElement("div");
  box.className = "provider";
  box.innerHTML = `
    <div>
      <label class="provider-head"><input type="checkbox" class="provider-enabled"> <span class="provider-name-text"></span></label>
      <div class="hint">Match result pages by host and path.</div>
    </div>
    <div>
      <div class="provider-grid">
        <label class="field"><span>Name</span><input type="text" class="provider-name"></label>
        <label class="field"><span>Host contains</span><input type="text" class="provider-host"></label>
        <label class="field"><span>Path contains</span><input type="text" class="provider-path"></label>
        <label class="field"><span>Query param</span><input type="text" class="provider-query"></label>
        <label class="field"><span>Next selector</span><input type="text" class="provider-next"></label>
      </div>
      <div style="margin-top:8px"><button class="chrome danger provider-remove" type="button">Remove</button></div>
    </div>
  `;
  box.querySelector(".provider-enabled").checked = !!provider.enabled;
  box.querySelector(".provider-name-text").textContent = provider.name || provider.id || "Provider";
  box.querySelector(".provider-name").value = provider.name || "";
  box.querySelector(".provider-host").value = provider.hostContains || "";
  box.querySelector(".provider-path").value = provider.pathContains || "";
  box.querySelector(".provider-query").value = provider.queryParam || "q";
  box.querySelector(".provider-next").value = provider.nextSelector || "";
  box.querySelector(".provider-remove").addEventListener("click", () => {
    providers.splice(index, 1);
    renderProviders();
  });
  return box;
}

function renderProviders() {
  const host = $("providers");
  host.textContent = "";
  providers.forEach((provider, index) => host.appendChild(providerTemplate(provider, index)));
}

function readProviders() {
  return [...document.querySelectorAll(".provider")].map((box, index) => {
    const name = box.querySelector(".provider-name").value.trim() || "Provider " + (index + 1);
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider-" + index,
      name,
      enabled: box.querySelector(".provider-enabled").checked,
      hostContains: box.querySelector(".provider-host").value.trim().toLowerCase(),
      pathContains: box.querySelector(".provider-path").value.trim(),
      queryParam: box.querySelector(".provider-query").value.trim() || "q",
      nextSelector: box.querySelector(".provider-next").value.trim(),
    };
  }).filter((provider) => provider.hostContains);
}

async function save() {
  const next = {
    ...settings,
    autoNext: $("autoNext").checked,
    maxPages: parseInt($("maxPages").value, 10) || DEFAULT_SETTINGS.maxPages,
    pageDelay: Math.max(500, parseInt($("pageDelay").value, 10) || DEFAULT_SETTINGS.pageDelay),
    autoValidate: $("autoValidate").checked,
    validateDelay: Math.max(0, parseInt($("validateDelay").value, 10) || DEFAULT_SETTINGS.validateDelay),
    notifications: $("notifications").checked,
    fileTypes: normalizeFileTypes($("fileTypes").value),
    providers: readProviders(),
  };
  saveTheme($("themeSelect").value);
  applyTheme($("themeSelect").value);
  if (!next.fileTypes.length) next.fileTypes = DEFAULT_FILE_TYPES;
  if (!next.providers.length) next.providers = DEFAULT_PROVIDERS;
  await saveSettings(next);
  $("status").textContent = t("saved");
  setTimeout(() => { $("status").textContent = ""; }, 1800);
}

async function resetDefaults() {
  settings = { ...DEFAULT_SETTINGS, fileTypes: DEFAULT_FILE_TYPES, providers: DEFAULT_PROVIDERS };
  saveTheme("auto");
  applyTheme("auto");
  $("themeSelect").value = "auto";
  $("autoNext").checked = DEFAULT_SETTINGS.autoNext;
  $("maxPages").value = DEFAULT_SETTINGS.maxPages;
  $("pageDelay").value = DEFAULT_SETTINGS.pageDelay;
  $("autoValidate").checked = DEFAULT_SETTINGS.autoValidate;
  $("validateDelay").value = DEFAULT_SETTINGS.validateDelay;
  $("notifications").checked = DEFAULT_SETTINGS.notifications;
  $("fileTypes").value = DEFAULT_FILE_TYPES.join("\n");
  providers = DEFAULT_PROVIDERS.map((provider) => ({ ...provider }));
  renderProviders();
  await saveSettings(settings);
  $("status").textContent = t("defaultsRestored");
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme(loadTheme());
  await initI18n();
  $("languageSelect").value = getI18nLanguage();
  $("languageSelect").addEventListener("change", async () => {
    await setI18nLanguage($("languageSelect").value);
    localizeOptions();
    applyI18n();
  });
  $("tabSettings").addEventListener("click", () => setTab("settings"));
  $("tabAbout").addEventListener("click", () => setTab("about"));
  $("save").addEventListener("click", save);
  $("reset").addEventListener("click", resetDefaults);
  $("themeSelect").addEventListener("change", () => {
    saveTheme($("themeSelect").value);
    applyTheme($("themeSelect").value);
  });
  $("addProvider").addEventListener("click", () => {
    providers.push({ id: "custom", name: "Custom", enabled: true, hostContains: "", pathContains: "/search", queryParam: "q", nextSelector: "" });
    renderProviders();
    localizeOptions();
  });

  settings = await loadSettings();
  providers = settings.providers.map((provider) => ({ ...provider }));
  $("themeSelect").value = loadTheme();
  $("autoNext").checked = !!settings.autoNext;
  $("maxPages").value = settings.maxPages;
  $("pageDelay").value = settings.pageDelay;
  $("autoValidate").checked = !!settings.autoValidate;
  $("validateDelay").value = settings.validateDelay;
  $("notifications").checked = !!settings.notifications;
  $("fileTypes").value = settings.fileTypes.join("\n");
  $("version").textContent = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
    ? chrome.runtime.getManifest().version
    : "3.4.6";
  renderProviders();
  applyI18n();
  localizeOptions();
  setTab(location.hash.startsWith("#about") ? "about" : "settings");
});

function localizeOptions() {
  document.title = "Dofiltor " + t("settings");
  $("tabSettings").textContent = t("settings");
  $("tabAbout").textContent = t("about");

  const titles = document.querySelectorAll(".card-title");
  if (titles[0]) titles[0].textContent = t("appearance");
  if (titles[1]) titles[1].textContent = t("automation");
  if (titles[2]) titles[2].textContent = t("capture");
  if (titles[3]) titles[3].textContent = t("providers");
  if (titles[4]) titles[4].textContent = t("about");

  const labels = document.querySelectorAll(".label");
  const labelKeys = ["theme", "language", "autoNext", "maxPages", "pageDelay", "autoValidate", "validationDelay", "notifications", "fileExtensions"];
  labels.forEach((label, index) => {
    if (labelKeys[index]) label.textContent = t(labelKeys[index]);
  });

  const hints = document.querySelectorAll(".hint");
  const hintKeys = ["themeHint", "languageHint", "autoNextHint", "maxPagesHint", "pageDelayHint", "autoValidateHint", "validationDelayHint", "notificationsHint", "fileExtensionsHint"];
  hints.forEach((hint, index) => {
    if (hint.closest(".provider")) {
      hint.textContent = t("providerHint");
      return;
    }
    if (hintKeys[index]) hint.textContent = t(hintKeys[index]);
  });

  $("themeSelect").querySelector('[value="auto"]').textContent = t("auto");
  $("themeSelect").querySelector('[value="light"]').textContent = t("light");
  $("themeSelect").querySelector('[value="dark"]').textContent = t("dark");
  document.querySelectorAll(".provider-head").forEach((label) => {
    const checkbox = label.querySelector("input");
    if (checkbox && checkbox.id) label.lastChild.textContent = " " + t("enabled");
  });
  document.querySelectorAll(".field span").forEach((span) => {
    const input = span.parentElement.querySelector("input");
    const map = {
      "provider-name": "name",
      "provider-host": "hostContains",
      "provider-path": "pathContains",
      "provider-query": "queryParam",
      "provider-next": "nextSelector",
    };
    const key = Object.keys(map).find((cls) => input?.classList.contains(cls));
    if (key) span.textContent = t(map[key]);
  });
  document.querySelectorAll(".provider-remove").forEach((btn) => { btn.textContent = t("remove"); });
  $("addProvider").textContent = t("addProvider");
  $("save").textContent = t("save");
  $("reset").textContent = t("resetDefaults");

  const aboutRows = document.querySelectorAll(".about-label");
  const aboutKeys = ["name", "description", "version", "repository"];
  aboutRows.forEach((row, index) => { row.textContent = t(aboutKeys[index]); });
}
