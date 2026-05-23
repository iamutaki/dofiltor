const SETTINGS_KEY = "dofiltor_settings";
const DEFAULT_PROVIDERS = [
  { id: "google", name: "Google", enabled: true, hostContains: "google.", pathContains: "/search", queryParam: "q", nextSelector: "#pnnext" },
  { id: "bing", name: "Bing", enabled: true, hostContains: "bing.com", pathContains: "/search", queryParam: "q", nextSelector: "a.sb_pagN" },
  { id: "duckduckgo", name: "DuckDuckGo", enabled: true, hostContains: "duckduckgo.com", pathContains: "/", queryParam: "q", nextSelector: "a[rel='next']" },
  { id: "yahoo", name: "Yahoo", enabled: false, hostContains: "search.yahoo.com", pathContains: "/search", queryParam: "p", nextSelector: "a.next" },
  { id: "yandex", name: "Yandex", enabled: false, hostContains: "yandex.", pathContains: "/search", queryParam: "text", nextSelector: "a[aria-label='Next page']" },
];
const STATIC_PROVIDER_HOSTS = new Set([
  "google.com", "google.co.id", "bing.com", "duckduckgo.com",
  "search.yahoo.com", "yandex.com", "yandex.ru",
]);
const DEFAULT_SETTINGS = {
  autoNext: false,
  maxPages: 50,
  pageDelay: 3000,
  autoValidate: true,
  validateDelay: 1500,
  validateMode: "head-get",
  notifications: true,
  reuseValidationCache: true,
  urlCacheMaxEntries: 5000,
  urlCacheMaxAgeDays: 0,
  dorkHistoryMax: 200,
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
      const migration = migrateFileTypes(stored.fileTypes, stored.fileTypesVersion);
      resolve({
        ...DEFAULT_SETTINGS,
        ...stored,
        fileTypes: migration.fileTypes,
        fileTypesVersion: migration.fileTypesVersion,
        providers: Array.isArray(stored.providers) && stored.providers.length ? stored.providers : DEFAULT_PROVIDERS,
      });
    });
  });
}

function saveSettings(next) {
  settings = next;
  if (!hasChromeStorage()) return Promise.resolve();
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: next }, () => resolve());
      return;
    }
    chrome.storage.local.set({ [SETTINGS_KEY]: next }, resolve);
  });
}

function providerHostBase(hostContains) {
  return String(hostContains || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^\*:\/\//, "")
    .replace(/^\*\./, "")
    .replace(/^\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "");
}

function providerOrigins(provider) {
  const host = providerHostBase(provider.hostContains);
  if (!host || !host.includes(".") || host.endsWith(".")) return [];
  return [
    "http://" + host + "/*",
    "https://" + host + "/*",
    "http://*." + host + "/*",
    "https://*." + host + "/*",
  ];
}

function providerMatchesTestUrl(provider, url) {
  return evaluateProviderRules(provider, url).pageMatch;
}

function evaluateProviderRules(provider, url) {
  const enabled = provider.enabled !== false;
  let parsed = null;
  let urlValid = false;
  try {
    parsed = new URL(url);
    urlValid = /^https?:$/i.test(parsed.protocol);
  } catch (e) {
    parsed = null;
  }
  const hostNeedle = String(provider.hostContains || "").toLowerCase();
  const pathNeedle = String(provider.pathContains || "").toLowerCase();
  const queryParam = String(provider.queryParam || "").trim();
  const host = !hostNeedle || (urlValid && parsed.hostname.toLowerCase().includes(hostNeedle));
  const path = !pathNeedle || (urlValid && parsed.pathname.toLowerCase().includes(pathNeedle));
  const query = !queryParam || (urlValid && parsed.searchParams.has(queryParam));
  const pageMatch = urlValid && host && path;
  return {
    urlValid,
    host,
    path,
    query,
    pageMatch,
    collects: pageMatch && enabled,
    enabled,
    hostname: urlValid ? parsed.hostname : "",
    pathname: urlValid ? parsed.pathname : "",
  };
}

function getActiveTabUrl() {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return Promise.resolve("");
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0].url || "" : "");
    });
  });
}

function readProviderFromBox(box) {
  return {
    enabled: box.querySelector(".provider-enabled").checked,
    hostContains: box.querySelector(".provider-host").value.trim().toLowerCase(),
    pathContains: box.querySelector(".provider-path").value.trim(),
    queryParam: box.querySelector(".provider-query").value.trim() || "q",
  };
}

function renderProviderTestResult(box, result) {
  const detail = box.querySelector(".provider-test-detail");
  if (!detail) return;
  detail.textContent = "";
  if (!result.url) {
    const line = document.createElement("span");
    line.className = "summary fail";
    line.textContent = t("providerTestNoUrl");
    detail.appendChild(line);
    return;
  }
  if (!result.urlValid) {
    const line = document.createElement("span");
    line.className = "summary fail";
    line.textContent = t("providerTestUrlInvalid");
    detail.appendChild(line);
    return;
  }
  const rules = [
    ["host", result.host, t("providerTestHost", { needle: result.hostNeedle || "—", host: result.hostname })],
    ["path", result.path, t("providerTestPath", { needle: result.pathNeedle || "—", path: result.pathname })],
    ["query", result.query, t("providerTestQuery", { param: result.queryParam || "—" })],
    ["enabled", result.enabled, t("providerTestEnabled")],
  ];
  for (const [, pass, label] of rules) {
    const line = document.createElement("span");
    line.className = "rule " + (pass ? "pass" : "fail");
    line.textContent = (pass ? "✓ " : "✗ ") + label;
    detail.appendChild(line);
  }
  if (result.pageMatch && !result.query) {
    const warn = document.createElement("span");
    warn.className = "rule warn";
    warn.textContent = "⚠ " + t("providerTestQueryWarn");
    detail.appendChild(warn);
  }
  const summary = document.createElement("span");
  summary.className = "summary " + (result.collects ? "pass" : "fail");
  summary.textContent = result.collects ? t("providerTestCollects") : t("providerTestNoCollect");
  detail.appendChild(summary);
}

function runProviderTest(box, urlOverride) {
  const input = box.querySelector(".provider-test-url");
  const url = String(urlOverride != null ? urlOverride : input.value).trim();
  if (urlOverride != null) input.value = url;
  const provider = readProviderFromBox(box);
  const evaluated = evaluateProviderRules(provider, url);
  renderProviderTestResult(box, {
    url,
    urlValid: evaluated.urlValid,
    host: evaluated.host,
    path: evaluated.path,
    query: evaluated.query,
    enabled: evaluated.enabled,
    pageMatch: evaluated.pageMatch,
    collects: evaluated.collects,
    hostname: evaluated.hostname,
    pathname: evaluated.pathname,
    hostNeedle: provider.hostContains,
    pathNeedle: provider.pathContains,
    queryParam: provider.queryParam,
  });
}

function providerPermissionState(provider) {
  const origins = providerOrigins(provider);
  const host = providerHostBase(provider.hostContains);
  if (!provider.enabled) return Promise.resolve({ state: "disabled", label: t("permissionDisabled") });
  if (!host || !host.includes(".") || host.endsWith(".")) {
    return Promise.resolve({ state: "invalid", label: t("permissionInvalid") });
  }
  if (STATIC_PROVIDER_HOSTS.has(host)) {
    return Promise.resolve({ state: "granted", label: t("permissionBuiltIn") });
  }
  if (typeof chrome === "undefined" || !chrome.permissions?.contains) {
    return Promise.resolve({ state: "needed", label: t("permissionUnknown") });
  }
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins }, (granted) => {
      resolve({ state: granted ? "granted" : "needed", label: granted ? t("permissionGranted") : t("permissionNeeded") });
    });
  });
}

function customProviderOrigins(nextProviders) {
  const origins = [];
  for (const provider of nextProviders) {
    const host = providerHostBase(provider.hostContains);
    if (!provider.enabled || STATIC_PROVIDER_HOSTS.has(host)) continue;
    origins.push(...providerOrigins(provider));
  }
  return [...new Set(origins)];
}

function requestProviderPermissions(nextProviders) {
  const origins = customProviderOrigins(nextProviders);
  if (!origins.length || typeof chrome === "undefined" || !chrome.permissions?.request) {
    return Promise.resolve({ granted: true, origins: [] });
  }
  return new Promise((resolve) => {
    chrome.permissions.request({ origins }, (granted) => {
      resolve({ granted: !!granted, origins });
    });
  });
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

  const summary = document.createElement("div");
  const providerHead = document.createElement("label");
  providerHead.className = "provider-head";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "provider-enabled";
  enabled.checked = !!provider.enabled;
  const providerNameText = document.createElement("span");
  providerNameText.className = "provider-name-text";
  providerNameText.textContent = provider.name || provider.id || "Provider";
  providerHead.append(enabled, providerNameText);
  const status = document.createElement("span");
  status.className = "provider-status";
  status.textContent = t("permissionChecking");
  providerHead.appendChild(status);
  providerPermissionState(provider).then((result) => {
    status.className = "provider-status " + result.state;
    status.textContent = result.label;
  });
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Match result pages by host and path.";
  summary.append(providerHead, hint);

  const controls = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "provider-grid";

  const makeField = (labelText, className, value) => {
    const label = document.createElement("label");
    label.className = "field";
    const span = document.createElement("span");
    span.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.className = className;
    input.value = value || "";
    label.append(span, input);
    return label;
  };

  grid.append(
    makeField("Name", "provider-name", provider.name || ""),
    makeField("Host contains", "provider-host", provider.hostContains || ""),
    makeField("Path contains", "provider-path", provider.pathContains || ""),
    makeField("Query param", "provider-query", provider.queryParam || "q"),
    makeField("Next selector", "provider-next", provider.nextSelector || "")
  );

  const testField = document.createElement("label");
  testField.className = "field provider-test-field";
  const testLabel = document.createElement("span");
  testLabel.textContent = "Test URL";
  const testInputs = document.createElement("div");
  testInputs.className = "provider-test-inputs";
  const testUrlInput = document.createElement("input");
  testUrlInput.type = "text";
  testUrlInput.className = "provider-test-url";
  testUrlInput.placeholder = "https://www.google.com/search?q=filetype:pdf";
  testUrlInput.spellcheck = false;
  const useTabBtn = document.createElement("button");
  useTabBtn.type = "button";
  useTabBtn.className = "chrome provider-use-tab";
  useTabBtn.textContent = "Use active tab";
  useTabBtn.addEventListener("click", async () => {
    const tabUrl = await getActiveTabUrl();
    if (!tabUrl || tabUrl.startsWith("chrome://") || tabUrl.startsWith("chrome-extension://")) {
      runProviderTest(box, "");
      const detail = box.querySelector(".provider-test-detail");
      if (detail) {
        detail.textContent = "";
        const line = document.createElement("span");
        line.className = "summary fail";
        line.textContent = t("providerTestTabUnavailable");
        detail.appendChild(line);
      }
      return;
    }
    runProviderTest(box, tabUrl);
  });
  testInputs.append(testUrlInput, useTabBtn);
  testField.append(testLabel, testInputs);

  const testHint = document.createElement("div");
  testHint.className = "hint provider-test-hint";
  testHint.textContent = "Paste a search results URL or use the tab you have open. Test checks the same host/path rules used for collection.";

  const actions = document.createElement("div");
  actions.className = "provider-actions";
  const testBtn = document.createElement("button");
  testBtn.className = "chrome provider-test";
  testBtn.type = "button";
  testBtn.textContent = "Test rules";
  testBtn.addEventListener("click", () => runProviderTest(box));
  const removeBtn = document.createElement("button");
  removeBtn.className = "chrome danger provider-remove";
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    providers.splice(index, 1);
    renderProviders();
  });
  const testDetail = document.createElement("div");
  testDetail.className = "provider-test-detail";
  actions.append(testBtn, removeBtn, testDetail);

  controls.append(grid, testField, testHint, actions);
  box.append(summary, controls);
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

function sendRuntimeMessage(payload) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(payload, (response) => resolve(response));
    } else {
      resolve(null);
    }
  });
}

async function save() {
  const nextProviders = readProviders();
  const next = {
    ...settings,
    autoNext: $("autoNext").checked,
    maxPages: parseInt($("maxPages").value, 10) || DEFAULT_SETTINGS.maxPages,
    pageDelay: Math.max(500, parseInt($("pageDelay").value, 10) || DEFAULT_SETTINGS.pageDelay),
    autoValidate: $("autoValidate").checked,
    validateDelay: Math.max(0, parseInt($("validateDelay").value, 10) || DEFAULT_SETTINGS.validateDelay),
    validateMode: $("validateMode").value || DEFAULT_SETTINGS.validateMode,
    notifications: $("notifications").checked,
    reuseValidationCache: $("reuseValidationCache").checked,
    urlCacheMaxEntries: Math.max(100, parseInt($("urlCacheMaxEntries").value, 10) || DEFAULT_SETTINGS.urlCacheMaxEntries),
    urlCacheMaxAgeDays: Math.max(0, parseInt($("urlCacheMaxAgeDays").value, 10) || 0),
    dorkHistoryMax: Math.max(10, parseInt($("dorkHistoryMax").value, 10) || DEFAULT_SETTINGS.dorkHistoryMax),
    fileTypes: normalizeFileTypes($("fileTypes").value),
    fileTypesVersion: FILE_TYPES_VERSION,
    providers: nextProviders,
  };
  saveTheme($("themeSelect").value);
  applyTheme($("themeSelect").value);
  if (!next.fileTypes.length) next.fileTypes = DEFAULT_FILE_TYPES;
  if (!next.providers.length) next.providers = DEFAULT_PROVIDERS;
  const permissionResult = await requestProviderPermissions(next.providers);
  await saveSettings(next);
  $("status").textContent = permissionResult.granted ? t("saved") : t("savedPermissionMissing");
  setTimeout(() => { $("status").textContent = ""; }, 1800);
}

async function resetDefaults() {
  settings = {
    ...DEFAULT_SETTINGS,
    fileTypes: DEFAULT_FILE_TYPES.slice(),
    fileTypesVersion: FILE_TYPES_VERSION,
    providers: DEFAULT_PROVIDERS,
  };
  saveTheme("auto");
  applyTheme("auto");
  $("themeSelect").value = "auto";
  $("autoNext").checked = DEFAULT_SETTINGS.autoNext;
  $("maxPages").value = DEFAULT_SETTINGS.maxPages;
  $("pageDelay").value = DEFAULT_SETTINGS.pageDelay;
  $("autoValidate").checked = DEFAULT_SETTINGS.autoValidate;
  $("validateDelay").value = DEFAULT_SETTINGS.validateDelay;
  $("validateMode").value = DEFAULT_SETTINGS.validateMode;
  $("notifications").checked = DEFAULT_SETTINGS.notifications;
  $("reuseValidationCache").checked = DEFAULT_SETTINGS.reuseValidationCache;
  $("urlCacheMaxEntries").value = DEFAULT_SETTINGS.urlCacheMaxEntries;
  $("urlCacheMaxAgeDays").value = DEFAULT_SETTINGS.urlCacheMaxAgeDays;
  $("dorkHistoryMax").value = DEFAULT_SETTINGS.dorkHistoryMax;
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
  $("clearValidationCache").addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "CLEAR_VALIDATION_CACHE" });
    $("cacheStatus").textContent = t("validationCacheCleared");
    setTimeout(() => { $("cacheStatus").textContent = ""; }, 1800);
  });

  settings = await loadSettings();
  providers = settings.providers.map((provider) => ({ ...provider }));
  $("themeSelect").value = loadTheme();
  $("autoNext").checked = !!settings.autoNext;
  $("maxPages").value = settings.maxPages;
  $("pageDelay").value = settings.pageDelay;
  $("autoValidate").checked = !!settings.autoValidate;
  $("validateDelay").value = settings.validateDelay;
  $("validateMode").value = settings.validateMode || DEFAULT_SETTINGS.validateMode;
  $("notifications").checked = !!settings.notifications;
  $("reuseValidationCache").checked = settings.reuseValidationCache !== false;
  $("urlCacheMaxEntries").value = settings.urlCacheMaxEntries ?? DEFAULT_SETTINGS.urlCacheMaxEntries;
  $("urlCacheMaxAgeDays").value = settings.urlCacheMaxAgeDays ?? DEFAULT_SETTINGS.urlCacheMaxAgeDays;
  $("dorkHistoryMax").value = settings.dorkHistoryMax ?? DEFAULT_SETTINGS.dorkHistoryMax;
  $("fileTypes").value = settings.fileTypes.join("\n");
  $("version").textContent = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
    ? chrome.runtime.getManifest().version
    : "3.5.0";
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
  if (titles[2]) titles[2].textContent = t("historyCacheTitle");
  if (titles[3]) titles[3].textContent = t("capture");
  if (titles[4]) titles[4].textContent = t("providers");
  if (titles[5]) titles[5].textContent = t("about");
  if (titles[6]) titles[6].textContent = t("releaseReadiness");

  const labels = document.querySelectorAll(".label");
  const labelKeys = [
    "theme", "language", "autoNext", "maxPages", "pageDelay", "autoValidate",
    "validationDelay", "validationMode", "notifications",
    "reuseValidationCache", "urlCacheMaxEntries", "urlCacheMaxAgeDays", "dorkHistoryMax",
    "fileExtensions",
  ];
  labels.forEach((label, index) => {
    if (labelKeys[index]) label.textContent = t(labelKeys[index]);
  });

  const hints = document.querySelectorAll(".hint");
  const hintKeys = [
    "themeHint", "languageHint", "autoNextHint", "maxPagesHint", "pageDelayHint",
    "autoValidateHint", "validationDelayHint", "validationModeHint", "notificationsHint",
    "reuseValidationCacheHint", "urlCacheMaxEntriesHint", "urlCacheMaxAgeDaysHint", "dorkHistoryMaxHint",
    "fileExtensionsHint",
  ];
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
  $("validateMode").querySelector('[value="head"]').textContent = t("validateHeadOnly");
  $("validateMode").querySelector('[value="head-get"]').textContent = t("validateHeadGet");
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
  document.querySelectorAll(".provider-test-field > span").forEach((span) => {
    span.textContent = t("testUrl");
  });
  document.querySelectorAll(".provider-remove").forEach((btn) => { btn.textContent = t("remove"); });
  document.querySelectorAll(".provider-test").forEach((btn) => { btn.textContent = t("testProvider"); });
  document.querySelectorAll(".provider-use-tab").forEach((btn) => { btn.textContent = t("useActiveTab"); });
  document.querySelectorAll(".provider-test-hint").forEach((el) => { el.textContent = t("testUrlHint"); });
  document.querySelectorAll(".provider-test-url").forEach((input) => {
    input.placeholder = t("testUrlPlaceholder");
  });
  $("addProvider").textContent = t("addProvider");
  $("clearValidationCache").textContent = t("clearValidationCache");
  $("save").textContent = t("save");
  $("reset").textContent = t("resetDefaults");

  const aboutRows = document.querySelectorAll(".about-label");
  const aboutKeys = ["name", "description", "version", "repository", "privacyPolicy"];
  aboutRows.forEach((row, index) => { row.textContent = t(aboutKeys[index]); });

  const readinessLabels = document.querySelectorAll(".readiness-label");
  const readinessKeys = ["privacyPolicy", "permissions", "providerHosts", "version", "changelog"];
  readinessLabels.forEach((row, index) => { row.textContent = t(readinessKeys[index]); });
  document.querySelectorAll(".readiness-state").forEach((state) => { state.textContent = t("ready"); });
}
