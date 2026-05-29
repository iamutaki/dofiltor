// ui-panel.js — Dork File Collector v3.6.0 (dofiltor) — side panel UI

const STORAGE_KEY = "dofiltor_urls";
const SETTINGS_KEY = "dofiltor_settings";
const AUTO_NEXT_ALERT_KEY = "dofiltor_auto_next_alert";
const CAPTCHA_ALERT_KEY = "dofiltor_captcha_alert";
const CAPTCHA_COUNTDOWN_KEY = "dofiltor_captcha_countdown";
const ACTIVITY_LOG_KEY = "dofiltor_activity_log";
const SESSION_STATS_KEY = "dofiltor_session_stats";
const AUTO_NEXT_DELAY_KEY = "dofiltor_auto_next_delay";
const DORK_TEMPLATES_KEY = "dofiltor_dork_templates";

const ACTIVITY_TYPE_I18N = {
  scan: "activityTypeScan",
  skip: "activityTypeSkip",
  captcha: "activityTypeCaptcha",
  stuck: "activityTypeStuck",
  end: "activityTypeEnd",
  done: "activityTypeDone",
  nav: "activityTypeNav",
  bulk: "activityTypeBulk",
  mark: "activityTypeMark",
  grab: "activityTypeGrab",
  info: "activityTypeInfo",
};
const DEFAULT_SETTINGS = {
  autoNext: false,
  maxPages: 50,
  pageDelay: 3000,
  autoValidate: true,
  validateDelay: 1500,
  validateMode: "head-get",
  notifications: true,
  skipVisitedResults: true,
  enabled: true,
  reuseValidationCache: false,
  urlCacheMaxEntries: 5000,
  urlCacheMaxAgeDays: 0,
  dorkHistoryMax: 200,
  fileTypes: DEFAULT_FILE_TYPES,
  providers: [
    { id: "google", name: "Google", enabled: true, hostPattern: "**.google.**", pathContains: "/search", queryParam: "q", nextSelector: "#pnnext, a#pnnext, a[aria-label=\"Next page\"], a[aria-label=\"Halaman berikutnya\"]" },
    { id: "bing", name: "Bing", enabled: true, hostPattern: "**.bing.com", pathContains: "/search", queryParam: "q", nextSelector: "a.sb_pagN" },
    { id: "duckduckgo", name: "DuckDuckGo", enabled: true, hostPattern: "**.duckduckgo.com", pathContains: "/", queryParam: "q", nextSelector: "a[rel='next']" },
    { id: "yahoo", name: "Yahoo", enabled: false, hostPattern: "**.search.yahoo.com", pathContains: "/search", queryParam: "p", nextSelector: "a.next" },
    { id: "yandex", name: "Yandex", enabled: false, hostPattern: "**.yandex.**", pathContains: "/search", queryParam: "text", nextSelector: "a[aria-label='Next page']" },
  ],
};
const STATIC_PROVIDER_HOSTS = new Set([
  "google.com", "google.co.id", "bing.com", "duckduckgo.com",
  "search.yahoo.com", "yandex.com", "yandex.ru",
]);

let allUrls = [];
let currentFilter = "all";
let activeDomains = new Set();
let searchQuery = "";
let validating = false;
let autoNextEnabled = false;
let settings = { ...DEFAULT_SETTINGS };
let extensionEnabled = true;
let sortKey = localStorage.getItem("dofiltor_sort_key") || "date";
let sortDir = localStorage.getItem("dofiltor_sort_dir") || "desc";
let exportFormat = localStorage.getItem("dofiltor_export_format") || "csv";
if (!["csv", "txt", "json", "xlsx"].includes(exportFormat)) exportFormat = "csv";
let selectedIndex = -1;
let lastViewItems = [];
let renderQueued = false;
let undoTimer = null;
let selectedUrls = new Set();
let globalStats = { grabbed: 0, checked: 0, cacheHits: 0 };

function formatGlobalCount(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(num);
}

async function loadGlobalStats() {
  globalStats = await sendMessage({ type: "GET_GLOBAL_STATS" }) || globalStats;
  return globalStats;
}

function renderGlobalStats() {
  const el = $("globalStats");
  if (!el) return;
  const parts = [
    t("statGrabbedLifetime", { n: formatGlobalCount(globalStats.grabbed) }),
    t("statCheckedLifetime", { n: formatGlobalCount(globalStats.checked) }),
  ];
  if (globalStats.cacheHits > 0) {
    parts.push(t("statCacheHitsLifetime", { n: formatGlobalCount(globalStats.cacheHits) }));
  }
  el.textContent = parts.join(" · ");
  el.hidden = false;
}

const ROW_HEIGHT = 49;
const CSV_COLUMNS = ["url", "file_type", "query", "source_page", "discovered_at", "size", "status", "tags", "note"];
const SVG = {
  moon: "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z",
  sun: "M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79 1.8-1.41-1.41-1.79 1.8z",
  auto: "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z",
  open: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  remove: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  selectAll: "M3 5h2v2H3V5zm4 0h14v2H7V5zM3 11h2v2H3v-2zm4 0h14v2H7v-2zM3 17h2v2H3v-2zm4 0h7v2H7v-2zm12.29-1.71L21 17l-4 4-2.29-2.29 1.41-1.41.88.88 2.29-2.29z",
  selectCheck: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  sortAsc: "M7 14l5-5 5 5H7z",
  sortDesc: "M7 10l5 5 5-5H7z",
};
const XLSX_FILES = {
  contentTypes: `[Content_Types].xml`,
  rels: `_rels/.rels`,
  workbook: `xl/workbook.xml`,
  workbookRels: `xl/_rels/workbook.xml.rels`,
  sheet: `xl/worksheets/sheet1.xml`,
  styles: `xl/styles.xml`,
};

function $(id) { return document.getElementById(id); }
function bindEl(id, type, handler, options) {
  const el = $(id);
  if (el) el.addEventListener(type, handler, options);
}
function bindClick(id, handler) { bindEl(id, "click", handler); }
function bindChange(id, handler) { bindEl(id, "change", handler); }
function setSvgPath(svg, pathData) {
  if (!svg) return;
  svg.textContent = "";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);
}
function createSvg(pathData) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  setSvgPath(svg, pathData);
  return svg;
}

function applyAppVersion() {
  const v = typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version;
  const el = $("appVer");
  if (el) el.textContent = v ? "v" + v : "";
}
function hasChromeStorage() { return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local; }
function hasChromeRuntime() { return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage; }
function hasChromeTabs() { return typeof chrome !== "undefined" && chrome.tabs && chrome.windows; }
function openExtensionPage(path) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.tabs) {
    chrome.tabs.create({ url: chrome.runtime.getURL(path) });
    return;
  }
  window.open(path, "_blank");
}
function openExternalPage(url) {
  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener");
}
function sendMessage(msg) {
  return new Promise((resolve) => {
    if (!hasChromeRuntime()) { resolve(null); return; }
    chrome.runtime.sendMessage(msg, (resp) => resolve(chrome.runtime.lastError ? null : resp));
  });
}

function confirmAction(message) {
  return window.confirm(message);
}

function loadTheme() { return localStorage.getItem("dofiltor_theme") || "auto"; }
function saveTheme(t) { localStorage.setItem("dofiltor_theme", t); }
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  setSvgPath($("themeIcon"), SVG[t === "light" ? "sun" : t === "dark" ? "moon" : "auto"]);
  $("themeLbl").textContent = { auto: "A", light: "L", dark: "D" }[t];
}
function cycleTheme() {
  const themes = ["auto", "light", "dark"];
  const next = themes[(themes.indexOf(loadTheme()) + 1) % themes.length];
  saveTheme(next);
  applyTheme(next);
}

function loadUrls() {
  if (!hasChromeStorage()) return Promise.resolve([]);
  return new Promise((r) => chrome.storage.local.get(STORAGE_KEY, (result) => {
    const urls = dedupeUrls(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
    if (JSON.stringify(urls) !== JSON.stringify(result[STORAGE_KEY] || [])) saveUrls(urls);
    r(urls);
  }));
}
function saveUrls(urls) {
  const next = dedupeUrls(Array.isArray(urls) ? urls : []);
  if (!hasChromeStorage()) return Promise.resolve(next);
  return sendMessage({ type: "SET_URLS", urls: next }).then(() => next);
}
function migrateProvider(p) {
  if (p.hostContains && !p.hostPattern) {
    const h = p.hostContains.replace(/^\.+|\.+$/g, "");
    p.hostPattern = h.includes(".") ? "**." + h : "**." + h + ".**";
  }
  delete p.hostContains;
  return p;
}

function loadSettings() {
  if (!hasChromeStorage()) return Promise.resolve({ ...DEFAULT_SETTINGS });
  return new Promise((r) => chrome.storage.local.get(SETTINGS_KEY, (res) => {
    const stored = res[SETTINGS_KEY] || {};
    const migration = migrateFileTypes(stored.fileTypes, stored.fileTypesVersion);
    r({
      ...DEFAULT_SETTINGS,
      ...stored,
      fileTypes: migration.fileTypes,
      fileTypesVersion: migration.fileTypesVersion,
      providers: Array.isArray(stored.providers) && stored.providers.length
        ? stored.providers.map(migrateProvider)
        : DEFAULT_SETTINGS.providers,
    });
  }));
}
function saveSettings(next) {
  settings = {
    ...DEFAULT_SETTINGS,
    ...next,
    fileTypesVersion: FILE_TYPES_VERSION,
  };
  if (!hasChromeStorage()) return Promise.resolve();
  return new Promise((r) => chrome.storage.local.set({ [SETTINGS_KEY]: settings }, r));
}

function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ""; } }
function nameOf(u) { try { return decodeURIComponent(new URL(u).pathname.split("/").pop() || ""); } catch (e) { return u; } }
function normalizeFileUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch (e) {
    return String(url || "").split("#")[0];
  }
}
function dedupeUrls(urls) {
  const byUrl = new Map();
  const clean = [];
  for (const item of Array.isArray(urls) ? urls : []) {
    const url = normalizeFileUrl(item && item.url);
    if (!url) continue;
    if (byUrl.has(url)) {
      const existing = byUrl.get(url);
      Object.assign(existing, Object.fromEntries(Object.entries(item || {}).filter(([, value]) => value != null && value !== "")));
      existing.url = url;
      continue;
    }
    const next = { ...item, url };
    byUrl.set(url, next);
    clean.push(next);
  }
  return clean;
}
function providerHostBase(hostPattern) {
  return hostBaseFromPattern(hostPattern || "");
}
function providerOrigins(provider) {
  const host = providerHostBase(provider.hostPattern);
  if (!host || !host.includes(".") || host.endsWith(".")) return [];
  return [
    "http://" + host + "/*",
    "https://" + host + "/*",
    "http://*." + host + "/*",
    "https://*." + host + "/*",
  ];
}
function providerMatchesUrl(provider, url) {
  try {
    const parsed = new URL(url);
    const hostNeedle = String(provider.hostPattern || "").toLowerCase();
    const pathNeedle = String(provider.pathContains || "").toLowerCase();
    return provider.enabled &&
      (!hostNeedle || hostMatchesGlob(parsed.hostname.toLowerCase(), hostNeedle)) &&
      (!pathNeedle || parsed.pathname.toLowerCase().includes(pathNeedle));
  } catch (e) {
    return false;
  }
}
function getDorkQueryFromUrl(url, provider) {
  if (!url || !provider) return "";
  try {
    const parsed = new URL(url);
    const param = String(provider.queryParam || "q").trim() || "q";
    return normalizeDorkQuery(parsed.searchParams.get(param) || "");
  } catch (e) {
    return "";
  }
}
function formatDorkWhen(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch (e) {
    return "";
  }
}
function activeTab() {
  if (!hasChromeTabs()) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}
function activeTabUrl() {
  return activeTab().then((tab) => (tab && tab.url) || "");
}
function pingContentScript(tabId) {
  return new Promise((resolve) => {
    if (!hasChromeTabs() || tabId == null) {
      resolve({ alive: false });
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_INFO" }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ alive: false });
        return;
      }
      resolve({ alive: !!(resp && !resp.error) });
    });
  });
}
function setScopeActionButtons({ grant, reload }) {
  const grantBtn = $("scopeGrantBtn");
  const reloadBtn = $("scopeReloadBtn");
  if (grantBtn) grantBtn.hidden = !grant;
  if (reloadBtn) reloadBtn.hidden = !reload;
}
function isStaticProvider(provider) {
  const pattern = provider.hostPattern;
  if (!pattern) return false;
  for (const sh of STATIC_PROVIDER_HOSTS) {
    if (hostMatchesGlob(sh, pattern)) return true;
  }
  return false;
}

function hasProviderPermission(provider) {
  if (isStaticProvider(provider)) return Promise.resolve(true);
  const host = providerHostBase(provider.hostPattern);
  if (host) {
    for (const sh of STATIC_PROVIDER_HOSTS) {
      if (sh === host || sh.endsWith("." + host) || host.endsWith("." + sh)) return Promise.resolve(true);
    }
  }
  const origins = providerOrigins(provider);
  if (!origins.length || typeof chrome === "undefined" || !chrome.permissions?.contains) return Promise.resolve(false);
  return new Promise((resolve) => chrome.permissions.contains({ origins }, resolve));
}
function setScope(status, text) {
  const bar = $("scopeBar");
  const label = $("scopeText");
  if (!bar || !label) return;
  bar.className = "scope-bar " + status;
  label.textContent = text;
}
async function updateScopeIndicator() {
  setScopeActionButtons({ grant: false, reload: false });
  if (!extensionEnabled) {
    setScope("paused", t("scopePaused"));
    return;
  }
  const tab = await activeTab();
  const url = (tab && tab.url) || "";
  const provider = (settings.providers || []).find((item) => providerMatchesUrl(item, url));
  if (!provider) {
    setScope("unsupported", t("scopeUnsupported"));
    return;
  }
  const hasPermission = await hasProviderPermission(provider);
  if (!hasPermission) {
    setScope("permission", t("scopePermissionNeeded", { provider: provider.name || provider.id || "Provider" }));
    setScopeActionButtons({ grant: true, reload: false });
    return;
  }
  if (tab && tab.id != null) {
    const ping = await pingContentScript(tab.id);
    if (!ping.alive) {
      setScope("stale", t("scopeStale"));
      setScopeActionButtons({ grant: false, reload: true });
      return;
    }
  }
  const dorkQuery = getDorkQueryFromUrl(url, provider);
  if (dorkQuery) {
    const prior = await sendMessage({ type: "LOOKUP_DORK", query: dorkQuery });
    if (prior?.captured) {
      const when = formatDorkWhen(prior.lastScan);
      const msg = when
        ? t("scopeDorkCapturedWhen", { n: prior.urlCount, when })
        : t("scopeDorkCaptured", { n: prior.urlCount });
      setScope("duplicate", msg);
      return;
    }
  }
  setScope("collecting", t("scopeCollecting", { provider: provider.name || provider.id || "Provider" }));
}
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function setStatus(text) { $("fLeft").textContent = text; }
function safeText(value) { return value == null ? "" : String(value); }
function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function hasActiveFilter() {
  return currentFilter !== "all" || activeDomains.size > 0 || !!searchQuery;
}
function pruneSelection() {
  const known = new Set(allUrls.map((item) => item.url));
  selectedUrls = new Set([...selectedUrls].filter((url) => known.has(url)));
}
function updateSelectionAction() {
  const actions = $("selectionActions");
  const btn = $("btnExportSelected");
  const badge = $("selectedBadge");
  const selectVisibleBtn = $("btnSelectVisible");
  const unselectAllBtn = $("btnUnselectAll");
  if (!btn || !badge) return;
  const count = selectedUrls.size;
  const visibleCount = lastViewItems.length;
  const hasUnselectedVisible = lastViewItems.some((item) => !selectedUrls.has(item.url));
  const showSelectVisible = visibleCount > 0 && hasUnselectedVisible;
  const showSelection = count > 0;

  if (selectVisibleBtn) {
    selectVisibleBtn.style.display = showSelectVisible ? "flex" : "none";
  }
  if (unselectAllBtn) {
    unselectAllBtn.style.display = showSelection ? "flex" : "none";
  }
  btn.style.display = showSelection ? "flex" : "none";
  badge.textContent = count;
  if (actions) {
    actions.classList.toggle("show", showSelectVisible || showSelection);
  }
}
function updateFilterAction() {
  const btn = $("searchClear");
  if (!btn) return;
  btn.classList.toggle("show", hasActiveFilter());
}
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function wildcardToRegExp(pattern) {
  const body = String(pattern).split("").map((char) => {
    if (char === "*") return ".*";
    if (char === "?") return ".";
    return escapeRegExp(char);
  }).join("");
  return new RegExp(body, "i");
}
function parseSearchMatcher(raw) {
  const query = raw.trim();
  if (!query) return { matches: () => true, valid: true };

  const regexMatch = query.match(/^\/(.+)\/([a-z]*)$/i);
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch[1], regexMatch[2].replace(/[gy]/g, ""));
      return { matches: (text) => re.test(text), valid: true };
    } catch (e) {
      return { matches: () => false, valid: false };
    }
  }

  if (/[*?]/.test(query)) {
    try {
      const re = wildcardToRegExp(query);
      return { matches: (text) => re.test(text), valid: true };
    } catch (e) {
      return { matches: () => false, valid: false };
    }
  }

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    matches: (text) => terms.every((term) => text.toLowerCase().includes(term)),
    valid: true,
  };
}
function itemFieldValue(item, field) {
  if (field === "domain" || field === "host") return hostOf(item.url);
  if (field === "file" || field === "filename" || field === "name") return nameOf(item.url);
  if (field === "type" || field === "ext") return item.file_type || "";
  if (field === "tag") return (item.tags || []).join(" ");
  if (field === "note") return item.note || "";
  if (field === "status") {
    if (item.status === "ok") return "valid ok";
    if (item.status === "fail") return "dead fail";
    if (item.status === "checking") return "checking processing";
    return "pending";
  }
  if (field === "url") return item.url || "";
  if (field === "query" || field === "dork") return item.query || "";
  return [nameOf(item.url), hostOf(item.url), item.url, item.query || ""].join(" ");
}
function parseAdvancedFilter(raw) {
  const query = raw.trim();
  if (!query) return { matches: () => true, valid: true };
  const tokens = query.split(/\s+/).filter(Boolean).map((token) => {
    const fieldMatch = token.match(/^([a-z]+):(.*)$/i);
    const field = fieldMatch ? fieldMatch[1].toLowerCase() : "";
    const pattern = fieldMatch ? fieldMatch[2] : token;
    const matcher = parseSearchMatcher(pattern);
    return { field, matcher };
  });
  if (tokens.some((token) => !token.matcher.valid)) return { matches: () => false, valid: false };
  return {
    matches: (item) => tokens.every((token) => token.matcher.matches(itemFieldValue(item, token.field))),
    valid: true,
  };
}

function updateStats() {
  const n = allUrls.length;
  const ok = allUrls.filter((u) => u.status === "ok").length;
  const fail = allUrls.filter((u) => u.status === "fail").length;
  const checkingCount = allUrls.filter((u) => u.status === "checking").length;
  const types = new Set(allUrls.map((u) => u.file_type).filter(Boolean)).size;
  const downloaded = allUrls.filter((u) => u.downloaded).length;

  $("sTotal").textContent = n;
  $("sOk").textContent = ok || fail || checkingCount ? ok : "\u2014";
  $("sFail").textContent = ok || fail || checkingCount ? fail : "\u2014";
  $("sTypes").textContent = types;
  $("btnRemoveDead").style.display = fail > 0 ? "flex" : "none";
  const pending = n - ok - fail - checkingCount;
  $("fRight").textContent = n + " URLs" + (downloaded ? " \u00B7 " + downloaded + " downloaded" : "");

  const batchable = allUrls.filter((u) => u.status === "ok" && !u.downloaded).length;
  $("batchBadge").textContent = batchable;
  $("batchBadge").style.display = batchable > 0 ? "block" : "none";

  if (!validating && !checkingCount) $("hSub").textContent = n ? t("urlsCount", { n: String(n), types: String(types) }) : t("appSubtitle");
  else if (checkingCount) $("hSub").textContent = t("statusCheckingCount", { n: checkingCount });
  renderGlobalStats();
}

function matchSearch(item) {
  if (!searchQuery) return true;
  const matcher = parseAdvancedFilter(searchQuery);
  if (!matcher.valid) return false;
  return matcher.matches(item);
}

function getDomains() {
  const map = {};
  for (const u of allUrls) {
    const h = hostOf(u.url);
    if (h) map[h] = (map[h] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function topSessionDomains(counts, limit) {
  return Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit || 8);
}

function renderSessionDomainBar(stats) {
  const bar = $("sessionDomainBar");
  const chips = $("sessionDomainChips");
  if (!bar || !chips) return;

  const top = topSessionDomains(stats && stats.domains, 8);
  chips.replaceChildren();
  if (!top.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  top.forEach(([domain, count], index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "session-domain-sep";
      sep.textContent = "\u00B7";
      sep.setAttribute("aria-hidden", "true");
      chips.appendChild(sep);
    }
    const chip = document.createElement("span");
    chip.className = "session-domain-chip";
    chip.title = domain + ": " + count;
    chip.append(document.createTextNode(domain + " "));
    const num = document.createElement("strong");
    num.textContent = String(count);
    chip.appendChild(num);
    chips.appendChild(chip);
  });
}

async function refreshSessionDomainStats() {
  const stats = await sendMessage({ type: "GET_SESSION_STATS" });
  renderSessionDomainBar(stats || { domains: {} });
}

function renderDomainBar() {
  const bar = $("domainBar");
  bar.textContent = "";
  const domains = getDomains();
  if (domains.length <= 1) { bar.classList.remove("show"); return; }
  bar.classList.add("show");

  const addChip = (label, active, onClick) => {
    const chip = document.createElement("button");
    chip.className = "dtag" + (active ? " active" : "");
    chip.textContent = label;
    chip.addEventListener("click", onClick);
    bar.appendChild(chip);
  };
  addChip("All", activeDomains.size === 0, () => { activeDomains.clear(); refresh(); });
  for (const [domain, count] of domains) {
    addChip(domain + " " + count, activeDomains.has(domain), () => {
      activeDomains.has(domain) ? activeDomains.delete(domain) : activeDomains.add(domain);
      selectedIndex = -1;
      refresh();
    });
  }
}

function renderFilters() {
  const c = $("filters");
  c.textContent = "";
  const counts = { all: allUrls.length };
  for (const u of allUrls) counts[u.file_type] = (counts[u.file_type] || 0) + 1;

  const mk = (key, label) => {
    const b = document.createElement("button");
    b.className = "tab" + (currentFilter === key ? " on" : "");
    b.type = "button";
    b.setAttribute("aria-pressed", currentFilter === key ? "true" : "false");
    b.textContent = label + " " + (counts[key] || 0);
    b.addEventListener("click", () => {
      currentFilter = key;
      selectedIndex = -1;
      $("urlList").scrollTop = 0;
      refresh();
    });
    c.appendChild(b);
  };

  mk("all", "All");
  for (const [ext] of Object.entries(counts).filter(([k]) => k !== "all").sort((a, b) => b[1] - a[1])) {
    mk(ext, "." + ext);
  }
}

function getFiltered() {
  let list = currentFilter === "all" ? allUrls : allUrls.filter((u) => u.file_type === currentFilter);
  if (activeDomains.size > 0) list = list.filter((u) => activeDomains.has(hostOf(u.url)));
  if (searchQuery) {
    const matcher = parseAdvancedFilter(searchQuery);
    if (!matcher.valid) return [];
    list = list.filter((item) => matcher.matches(item));
  }
  return list;
}

function getSortedFiltered() {
  const list = getFiltered().slice();
  const dir = sortDir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    let av = "";
    let bv = "";
    if (sortKey === "size") { av = Number(a.size) || 0; bv = Number(b.size) || 0; }
    else if (sortKey === "domain") { av = hostOf(a.url); bv = hostOf(b.url); }
    else if (sortKey === "status") {
      const rank = (s) => ({ checking: 1, pending: 0, ok: 2, fail: 3 }[s || "pending"] ?? 0);
      av = rank(a.status);
      bv = rank(b.status);
    }
    else if (sortKey === "type") { av = a.file_type || ""; bv = b.file_type || ""; }
    else { av = a.discovered_at || ""; bv = b.discovered_at || ""; }
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  return list;
}

function scheduleRenderList() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderList();
  });
}

function renderList() {
  const box = $("urlList");
  const emp = $("empty");
  const savedScrollTop = box.scrollTop;
  if (!allUrls.length) {
    box.style.display = "none";
    emp.style.display = "flex";
    lastViewItems = [];
    updateSelectionAction();
    return;
  }

  lastViewItems = getSortedFiltered();
  emp.style.display = "none";
  box.style.display = "block";
  box.textContent = "";
  box.setAttribute("aria-label", "Collected URLs");

  if (!lastViewItems.length) {
    updateSelectionAction();
    const m = document.createElement("div");
    m.className = "empty-list";
    m.textContent = searchQuery && !parseAdvancedFilter(searchQuery).valid ? t("invalidFilter") : "No matching URLs";
    box.appendChild(m);
    return;
  }

  if (selectedIndex >= lastViewItems.length) selectedIndex = lastViewItems.length - 1;
  updateSelectionAction();

  const height = box.clientHeight || 260;
  const start = Math.max(0, Math.floor(savedScrollTop / ROW_HEIGHT) - 4);
  const end = Math.min(lastViewItems.length, Math.ceil((savedScrollTop + height) / ROW_HEIGHT) + 4);
  const canvas = document.createElement("div");
  canvas.className = "virtual-canvas";
  canvas.style.height = (lastViewItems.length * ROW_HEIGHT) + "px";

  for (let i = start; i < end; i++) {
    canvas.appendChild(renderRow(lastViewItems[i], i));
  }
  box.appendChild(canvas);
  box.scrollTop = savedScrollTop;
}

function renderRow(item, viewIndex) {
  const idx = allUrls.indexOf(item);
  const status = item.status || "pending";
  const isMultiSelected = selectedUrls.has(item.url);
  const row = document.createElement("div");
  row.className = "row status-" + status + (item.downloaded ? " dl" : "") + (viewIndex === selectedIndex ? " selected" : "") + (isMultiSelected ? " multi-selected" : "");
  row.style.transform = "translateY(" + (viewIndex * ROW_HEIGHT) + "px)";
  row.tabIndex = 0;
  row.setAttribute("role", "listitem");
  row.setAttribute("aria-selected", isMultiSelected || viewIndex === selectedIndex ? "true" : "false");
  row.addEventListener("click", () => { selectedIndex = viewIndex; renderList(); });

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "row-check";
  check.checked = isMultiSelected;
  check.setAttribute("aria-label", "Select " + nameOf(item.url));
  check.addEventListener("click", (e) => e.stopPropagation());
  check.addEventListener("change", () => {
    if (check.checked) selectedUrls.add(item.url);
    else selectedUrls.delete(item.url);
    selectedIndex = viewIndex;
    updateSelectionAction();
    renderList();
  });
  row.appendChild(check);

  const dot = document.createElement("div");
  dot.className = "dot dot-" + status;
  dot.title = status;
  row.appendChild(dot);

  const fi = document.createElement("div");
  fi.className = "ficon " + fileIconClass(item.file_type);
  fi.textContent = item.file_type || "?";
  fi.title = String(item.file_type || "").toUpperCase();
  row.appendChild(fi);

  const info = document.createElement("div");
  info.className = "rinfo";
  const nm = document.createElement("div");
  nm.className = "rname";
  nm.textContent = nameOf(item.url);
  nm.title = item.url;
  info.appendChild(nm);

  const mt = document.createElement("div");
  mt.className = "rmeta";
  const hostSpan = document.createElement("span");
  hostSpan.className = "host";
  hostSpan.textContent = hostOf(item.url);
  mt.appendChild(hostSpan);
  const statusChip = document.createElement("span");
  statusChip.className = "status-chip " + status;
  if (status === "ok") statusChip.textContent = t("valid");
  else if (status === "fail") statusChip.textContent = t("dead");
  else if (status === "checking") statusChip.textContent = t("checking");
  else statusChip.textContent = t("pending");
  mt.appendChild(statusChip);
  if (item.size) {
    const sz = document.createElement("span");
    sz.className = "sz";
    sz.textContent = formatSize(item.size);
    mt.appendChild(sz);
  }
  if (item.downloaded) {
    const dlTag = document.createElement("span");
    dlTag.className = "dl-tag";
    dlTag.textContent = t("downloaded");
    mt.appendChild(dlTag);
  }
  if (item.tags && item.tags.length) {
    for (const tag of item.tags.slice(0, 3)) {
      const chip = document.createElement("span");
      chip.className = "tag-chip-inline";
      chip.textContent = tag;
      mt.appendChild(chip);
    }
  }
  if (item.note) {
    const noteChip = document.createElement("span");
    noteChip.className = "tag-chip-inline note";
    noteChip.textContent = item.note.length > 16 ? item.note.substring(0, 16) + "…" : item.note;
    noteChip.title = item.note;
    mt.appendChild(noteChip);
  }
  info.appendChild(mt);
  row.appendChild(info);

  const acts = document.createElement("div");
  acts.className = "racts";
  const mkBtn = (svgPath, title, cls, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ib" + (cls ? " " + cls : "");
    b.appendChild(createSvg(svgPath));
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  acts.appendChild(mkBtn(SVG.open, "Open", "", () => window.open(item.url, "_blank")));
  acts.appendChild(mkBtn(SVG.download, "Download", "", async () => {
    await sendMessage({ type: "DOWNLOAD", url: item.url });
    item.downloaded = true;
    await saveUrls(allUrls);
    refresh();
  }));
  acts.appendChild(mkBtn(SVG.remove, "Remove", "danger", async () => {
    const removed = allUrls.splice(idx, 1);
    await saveUrls(allUrls);
    showUndo("Removed 1 URL", async () => {
      allUrls.splice(idx, 0, removed[0]);
      await saveUrls(allUrls);
      refresh();
    });
    refresh();
  }));
  acts.appendChild(mkBtn(SVG.edit, "Tag", "", () => openTagDialog(item)));
  row.appendChild(acts);
  return row;
}

function refresh() {
  if (!Array.isArray(allUrls)) allUrls = [];
  pruneSelection();
  updateStats();
  renderFilters();
  renderDomainBar();
  renderSortUI();
  updateFilterAction();
  renderList();
  updateScopeIndicator();
}

async function startValidate() {
  if (validating) return;
  validating = true;
  const btn = $("btnValidate");
  btn.style.color = "var(--c-green)";
  const bar = $("prog");
  const fill = $("progBar");
  bar.classList.add("on");
  const todo = getSortedFiltered().filter((u) => !u.status || u.status === "pending");
  let done = 0;

  for (const item of todo) {
    fill.style.width = (todo.length ? done / todo.length * 100 : 100) + "%";
    $("hSub").textContent = "Checking " + (done + 1) + "/" + todo.length + "...";
    setStatus(t("checking") + " " + (done + 1) + "/" + todo.length + "...");

    item.status = "checking";
    renderList();

    const r = await sendMessage({ type: "CHECK_URL", url: item.url }) || { ok: false, size: null };
    item.status = r.ok ? "ok" : "fail";
    if (r.size) item.size = r.size;
    if (r.fromCache) item.validatedFromCache = true;
    done++;
    if (done % 10 === 0) { await saveUrls(allUrls); refresh(); }
    await new Promise((rDelay) => setTimeout(rDelay, Math.max(0, Number(settings.validateDelay) || 0)));
  }

  await saveUrls(allUrls);
  fill.style.width = "100%";
  setTimeout(() => { bar.classList.remove("on"); fill.style.width = "0%"; }, 400);
  btn.style.color = "";
  validating = false;
  await loadGlobalStats();
  setStatus(allUrls.filter((u) => u.status === "ok").length + " valid, " + allUrls.filter((u) => u.status === "fail").length + " dead");
  refresh();
}

function escapeCSV(val) {
  const s = String(val || "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function escapeXML(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}
function makeSheetXML(items) {
  const rows = [CSV_COLUMNS, ...items.map((item) => CSV_COLUMNS.map((key) => item[key] || ""))];
  const xmlRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = columnName(colIndex) + (rowIndex + 1);
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXML(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function dosTime(date) {
  return ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
}
function dosDate(date) {
  return (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
}
function makeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime(now)), ...u16(dosDate(now)),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ]);
    chunks.push(local, nameBytes, data);
    central.push({
      nameBytes,
      crc,
      size: data.length,
      offset,
    });
    offset += local.length + nameBytes.length + data.length;
  }
  const centralStart = offset;
  for (const file of central) {
    const entry = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime(now)), ...u16(dosDate(now)),
      ...u32(file.crc), ...u32(file.size), ...u32(file.size), ...u16(file.nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(file.offset),
    ]);
    chunks.push(entry, file.nameBytes);
    offset += entry.length + file.nameBytes.length;
  }
  const centralSize = offset - centralStart;
  chunks.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ]));
  return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function makeXlsx(items) {
  return makeZip([
    {
      name: XLSX_FILES.contentTypes,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: XLSX_FILES.rels,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: XLSX_FILES.workbook,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dofiltor" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: XLSX_FILES.workbookRels,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: XLSX_FILES.sheet,
      content: makeSheetXML(items),
    },
    {
      name: XLSX_FILES.styles,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
    },
  ]);
}
function makeExport(items, format) {
  if (format === "txt") return new Blob([items.map((u) => u.url).join("\n")], { type: "text/plain;charset=utf-8" });
  if (format === "json") return new Blob([JSON.stringify(items, null, 2)], { type: "application/json;charset=utf-8" });
  if (format === "xlsx") return makeXlsx(items);
  const getCol = (u, c) => {
    if (c === "tags") return Array.isArray(u[c]) ? u[c].join(";") : (u[c] || "");
    return u[c] || "";
  };
  const csv = CSV_COLUMNS.map(escapeCSV).join(",") + "\n" + items.map((u) => CSV_COLUMNS.map((c) => escapeCSV(getCol(u, c))).join(",")).join("\n");
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}
function exportCurrent() {
  const items = getSortedFiltered();
  if (!items.length) return;
  exportItems(items, "dork-out" + (currentFilter !== "all" ? "-" + currentFilter : ""));
}
function exportSelected() {
  const items = allUrls.filter((item) => selectedUrls.has(item.url));
  if (!items.length) return;
  exportItems(items, "dork-selected");
}
function selectVisible() {
  const items = getSortedFiltered();
  if (!items.length) return;
  for (const item of items) selectedUrls.add(item.url);
  selectedIndex = items.length ? 0 : -1;
  updateSelectionAction();
  renderList();
  setStatus("Selected " + selectedUrls.size);
}
function unselectAll() {
  if (!selectedUrls.size) return;
  selectedUrls.clear();
  updateSelectionAction();
  renderList();
  setStatus("Selection cleared");
}
function exportItems(items, baseName) {
  const blob = makeExport(items, exportFormat);
  const ext = exportFormat === "xlsx" ? "xlsx" : exportFormat === "txt" ? "txt" : exportFormat === "json" ? "json" : "csv";
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = baseName + "." + ext;
  a.click();
  URL.revokeObjectURL(u);
  setStatus("Exported " + items.length + " as " + exportFormat);
}

function copyUrls() {
  const urls = getSortedFiltered().map((u) => u.url);
  if (!urls.length) return;
  const text = urls.join("\n");
  const done = () => setStatus("Copied " + urls.length);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  setStatus("Copied");
}

async function removeDead() {
  const previous = allUrls.slice();
  allUrls = allUrls.filter((u) => u.status !== "fail");
  pruneSelection();
  await saveUrls(allUrls);
  showUndo("Removed " + (previous.length - allUrls.length) + " dead", async () => {
    allUrls = previous;
    await saveUrls(allUrls);
    refresh();
  });
  refresh();
}
async function removeSelected() {
  if (!selectedUrls.size) return;
  const count = selectedUrls.size;
  const previous = allUrls.slice();
  const prevSelection = new Set(selectedUrls);
  allUrls = allUrls.filter((u) => !selectedUrls.has(u.url));
  selectedUrls.clear();
  await saveUrls(allUrls);
  showUndo(t("removedCount", { n: count }), async () => {
    allUrls = previous;
    selectedUrls = prevSelection;
    await saveUrls(allUrls);
    refresh();
  });
  refresh();
}
async function clearAll() {
  if (!allUrls.length) return;
  if (!confirmAction(t("confirmClearAll", { n: allUrls.length }))) return;
  const previous = allUrls.slice();
  const previousSelection = new Set(selectedUrls);
  await sendMessage({ type: "CLEAR_ALL" });
  allUrls = [];
  selectedUrls.clear();
  showUndo(t("statusCleared", { count: previous.length }), async () => {
    allUrls = previous;
    selectedUrls = previousSelection;
    await saveUrls(allUrls);
    refresh();
  });
  refresh();
}
function showUndo(text, restore) {
  clearTimeout(undoTimer);
  $("undoText").textContent = text;
  $("undoToast").classList.add("show");
  $("undoBtn").onclick = async () => {
    $("undoToast").classList.remove("show");
    await restore();
    setStatus("Restored");
  };
  undoTimer = setTimeout(() => $("undoToast").classList.remove("show"), 7000);
}

async function batchDownload() {
  const resp = await sendMessage({ type: "BATCH_DOWNLOAD" });
  if (!resp) return;
  setStatus(resp.count ? "Downloading 0/" + resp.count : "Nothing to download");
  pollBatchStatus();
}
async function pollBatchStatus() {
  const status = await sendMessage({ type: "GET_BATCH_STATUS" });
  if (!status) return;
  const bar = $("prog");
  const fill = $("progBar");
  if (status.total > 0 && (status.active || status.done < status.total)) {
    bar.classList.add("on");
    fill.style.width = (status.done / status.total * 100) + "%";
    setStatus("Downloading " + status.done + "/" + status.total);
    setTimeout(pollBatchStatus, 700);
  } else if (status.total > 0) {
    fill.style.width = "100%";
    setStatus("Downloaded " + status.done + "/" + status.total);
    setTimeout(() => { bar.classList.remove("on"); fill.style.width = "0%"; }, 500);
    allUrls = await loadUrls();
    refresh();
  }
}

function showHistory() {
  sendMessage({ type: "GET_HISTORY" }).then((history) => {
    if (!Array.isArray(history) || !history.length) { setStatus("No scan history yet"); return; }
    const box = $("urlList");
    $("empty").style.display = "none";
    box.style.display = "block";
    box.textContent = "";
    const header = document.createElement("div");
    header.className = "history-head";
    const title = document.createElement("span");
    title.textContent = "Scan History (" + history.length + ")";
    header.appendChild(title);
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", async () => {
      if (!confirmAction(t("confirmClearHistory"))) return;
      await sendMessage({ type: "CLEAR_HISTORY" });
      setStatus("History cleared");
      refresh();
    });
    header.appendChild(clearBtn);
    box.appendChild(header);

    for (const h of history) {
      const query = safeText(h && h.query);
      const urls = safeNumber(h && h.urls);
      const pages = safeNumber(h && h.pages);
      const lastScan = safeText(h && h.lastScan);
      const row = document.createElement("div");
      row.className = "row history-row";
      const icon = document.createElement("div");
      icon.className = "ficon";
      icon.textContent = "Q";
      row.appendChild(icon);
      const info = document.createElement("div");
      info.className = "rinfo";
      const nm = document.createElement("div");
      nm.className = "rname";
      nm.textContent = query.length > 50 ? query.substring(0, 50) + "..." : query;
      nm.title = query;
      info.appendChild(nm);
      const mt = document.createElement("div");
      mt.className = "rmeta";
      const provider = safeText(h && h.provider);
      const parsedDate = lastScan ? new Date(lastScan) : null;
      const dateText = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toLocaleString() : "unknown";
      const metaParts = [urls + " URLs", pages + " pages"];
      if (provider) metaParts.push(provider);
      metaParts.push(dateText);
      mt.textContent = metaParts.join(" \u00B7 ");
      info.appendChild(mt);
      row.appendChild(info);
      box.appendChild(row);
    }

    const back = document.createElement("button");
    back.type = "button";
    back.className = "back-btn";
    back.textContent = "Back to URLs";
    back.addEventListener("click", refresh);
    box.appendChild(back);
  });
}

function renderSortUI() {
  $("sortKey").value = sortKey;
  const btn = $("sortDirBtn");
  const icon = $("sortDirIcon");
  const label = sortDir === "asc" ? "Sort ascending" : "Sort descending";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  setSvgPath(icon, sortDir === "asc" ? SVG.sortAsc : SVG.sortDesc);
  $("exportFormat").value = exportFormat;
}
function syncSort() {
  sortKey = $("sortKey").value;
  localStorage.setItem("dofiltor_sort_key", sortKey);
  localStorage.setItem("dofiltor_sort_dir", sortDir);
  selectedIndex = -1;
  renderList();
}
function toggleSortDir() {
  sortDir = sortDir === "asc" ? "desc" : "asc";
  localStorage.setItem("dofiltor_sort_dir", sortDir);
  selectedIndex = -1;
  renderSortUI();
  renderList();
}
function updatePowerUI(enabled) {
  extensionEnabled = enabled;
  const btn = $("pwrToggle");
  btn.className = "pwr-btn " + (enabled ? "on" : "off");
  btn.setAttribute("aria-label", enabled ? "Extension on — click to disable" : "Extension off — click to enable");
  btn.setAttribute("data-tip", enabled ? "Extension on" : "Extension off");
}
async function togglePower() {
  extensionEnabled = !extensionEnabled;
  await saveSettings({ ...settings, enabled: extensionEnabled });
  updatePowerUI(extensionEnabled);
  updateScopeIndicator();
  setStatus(extensionEnabled ? "Extension enabled" : "Extension disabled");
}
function toggleSettingsPanel() {
  openExtensionPage("options.html");
}
function clearFilters() {
  currentFilter = "all";
  activeDomains.clear();
  searchQuery = "";
  selectedIndex = -1;
  $("searchInput").value = "";
  $("urlList").scrollTop = 0;
  refresh();
}
function getTypeCounts() {
  const counts = {};
  for (const item of allUrls) {
    const key = String(item.file_type || "").toLowerCase();
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function renderTypeDialog() {
  const list = $("typeList");
  list.textContent = "";
  const counts = getTypeCounts();
  const types = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!types.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = t("noTypesCollected");
    list.appendChild(empty);
    return;
  }
  for (const [ext, total] of types) {
    const row = document.createElement("div");
    row.className = "type-row";
    const icon = document.createElement("div");
    icon.className = "ficon " + fileIconClass(ext);
    icon.textContent = ext;
    const name = document.createElement("div");
    name.className = "type-name";
    name.textContent = ext;
    const count = document.createElement("div");
    count.className = "type-count";
    count.textContent = String(total);
    row.append(icon, name, count);
    list.appendChild(row);
  }
}
function openTypeDialog() {
  renderTypeDialog();
  $("typeDialog").classList.add("show");
  $("typeDialog").setAttribute("aria-hidden", "false");
}
function closeTypeDialog() {
  $("typeDialog").classList.remove("show");
  $("typeDialog").setAttribute("aria-hidden", "true");
}
async function syncSettings() {
  await saveSettings({
    ...settings,
    autoNext: autoNextEnabled,
    maxPages: parseInt($("maxPages").value, 10) || 50,
    pageDelay: Math.max(500, parseInt($("pageDelay").value, 10) || 3000),
    validateDelay: Math.max(0, parseInt($("validateDelay").value, 10) || 0),
    autoValidate: $("autoValidate").checked,
    notifications: $("notifications").checked,
    skipVisitedResults: $("skipVisitedResults").checked,
    reuseValidationCache: $("reuseValidationCache").checked,
  });
  settings.reuseValidationCache = $("reuseValidationCache").checked;
  setStatus("Settings saved");
}

function updateAutoNextUI(enabled, status) {
  autoNextEnabled = enabled;
  $("autoNextBtn").classList.toggle("on", enabled);
  $("autoDot").className = enabled ? "dot-on" : "dot-off";
  $("autoLabel").textContent = "Auto-next";
  if (enabled && status && (status.status === "navigating" || status.status === "idle")) {
    const pg = status.page || 0;
    $("autoStatus").textContent = "Page " + pg + " \u2192 " + (status.next || pg + 1);
  } else if (status && status.status === "stuck") {
    $("autoStatus").textContent = status.message || t("autoNextStuck");
  } else if (!enabled && status && (status.status === "done" || status.status === "end")) {
    $("autoStatus").textContent = status.message || "Stopped";
  } else {
    $("autoStatus").textContent = "";
  }
}

function renderAutoNextDelay(payload) {
  const el = $("autoStatus");
  if (!el) return;
  if (!payload || payload.done || !payload.secondsLeft || payload.secondsLeft <= 0) {
    return;
  }
  el.textContent = t("delayNextIn", { seconds: String(payload.secondsLeft) });
}

async function toggleAutoNext() {
  await syncSettings();
  autoNextEnabled = !autoNextEnabled;
  await saveSettings({ ...settings, autoNext: autoNextEnabled });
  updateAutoNextUI(autoNextEnabled, null);
  updateAutoNextStatus();
}

async function markPageComplete() {
  if (!extensionEnabled) {
    setStatus(t("scopePaused"));
    return;
  }
  const tab = await activeTab();
  if (!tab?.id) {
    setStatus(t("markPageCompleteFail"));
    return;
  }
  const ping = await pingContentScript(tab.id);
  if (!ping.alive) {
    setStatus(t("markPageCompleteFail"));
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "MARK_PAGE_COMPLETE" }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      setStatus(t("markPageCompleteFail"));
      return;
    }
    const count = resp.added != null ? resp.added : 0;
    setStatus(t("markPageCompleteOk").replace("{count}", String(count)));
  });
}

async function manualGrab() {
  if (!extensionEnabled) {
    setStatus(t("scopePaused"));
    return;
  }
  const tab = await activeTab();
  if (!tab?.id) {
    setStatus(t("manualGrabFail"));
    return;
  }
  const ping = await pingContentScript(tab.id);
  if (!ping.alive) {
    setStatus(t("manualGrabFail"));
    return;
  }
  const btn = $("manualGrabBtn");
  if (btn) btn.disabled = true;
  chrome.tabs.sendMessage(tab.id, { type: "MANUAL_GRAB" }, (resp) => {
    if (btn) btn.disabled = false;
    if (chrome.runtime.lastError || !resp?.ok) {
      const err = resp?.error;
      if (err === "captcha") setStatus(t("captchaDetected"));
      else if (err === "no_provider") setStatus(t("scopeUnsupported"));
      else setStatus(t("manualGrabFail"));
      return;
    }
    const found = resp.found != null ? resp.found : 0;
    const added = resp.added != null ? resp.added : 0;
    if (found === 0) {
      setStatus(t("manualGrabNone"));
      return;
    }
    setStatus(t("manualGrabOk").replace("{found}", String(found)).replace("{added}", String(added)));
    loadUrls();
  });
}

function formatBulkRunningLabel(bulk) {
  if (!bulk || !bulk.active) return "";
  const n = (bulk.index || 0) + 1;
  const total = bulk.queries ? bulk.queries.length : bulk.total || 0;
  const query = String(bulk.currentQuery || "").substring(0, 48);
  return t("bulkDorkRunning")
    .replace("{n}", String(n))
    .replace("{total}", String(total))
    .replace("{query}", query);
}

function setBulkPanelOpen(open) {
  const body = $("bulkBody");
  const toggle = $("bulkToggle");
  if (!body || !toggle) return;
  body.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

async function refreshBulkUI() {
  const bulk = await sendMessage({ type: "GET_BULK_DORK_STATUS" });
  const running = !!(bulk && bulk.active);
  const panel = $("bulkPanel");
  const startBtn = $("bulkStartBtn");
  const stopBtn = $("bulkStopBtn");
  const input = $("bulkDorkInput");
  const statusEl = $("bulkStatus");

  if (panel) panel.classList.toggle("running", running);
  if (startBtn) startBtn.disabled = running;
  if (input) input.disabled = running;
  if (stopBtn) stopBtn.hidden = !running;
  if (statusEl) statusEl.textContent = running ? formatBulkRunningLabel(bulk) : "";

  if (running) {
    setBulkPanelOpen(true);
    autoNextEnabled = true;
    settings.autoNext = true;
    updateAutoNextUI(true, null);
  }
  return bulk;
}

async function startBulkDorkQueue() {
  if (!extensionEnabled) {
    setStatus(t("scopePaused"));
    return;
  }
  const input = $("bulkDorkInput");
  const text = input ? input.value : "";
  try {
    localStorage.setItem("dofiltor_bulk_text", text);
  } catch (e) { /* ignore */ }

  const tab = await activeTab();
  if (!tab?.id) {
    setStatus(t("bulkDorkNoTab"));
    return;
  }

  const provider = (settings.providers || []).find((item) => providerMatchesUrl(item, tab.url));
  const resp = await sendMessage({
    type: "START_BULK_DORK",
    tabId: tab.id,
    text,
    providerId: provider ? provider.id : "",
  });

  if (!resp || !resp.ok) {
    if (resp && resp.error === "no_queries") setStatus(t("bulkDorkEmpty"));
    else if (resp && resp.error === "no_provider") setStatus(t("bulkDorkNoProvider"));
    else setStatus(t("bulkDorkStartFail"));
    return;
  }

  const count = resp.bulk && resp.bulk.queries ? resp.bulk.queries.length : 0;
  settings.autoNext = true;
  autoNextEnabled = true;
  updateAutoNextUI(true, null);
  await refreshBulkUI();
  setStatus(t("bulkDorkStarted").replace("{n}", String(count)));
}

async function stopBulkDorkQueue() {
  await sendMessage({ type: "STOP_BULK_DORK" });
  await refreshBulkUI();
  setStatus(t("bulkDorkStopped"));
}

let dorkTemplates = [];

function setTemplatePanelOpen(open) {
  const body = $("templateBody");
  const toggle = $("templateToggle");
  if (!body || !toggle) return;
  body.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  try { localStorage.setItem("dofiltor_template_open", open ? "1" : "0"); } catch (e) { /* ignore */ }
}

function renderTemplateList(templates) {
  const list = $("templateList");
  const empty = $("templateEmpty");
  const count = $("templateCount");
  if (!list) return;
  dorkTemplates = templates || [];
  list.replaceChildren();
  if (count) count.textContent = dorkTemplates.length ? "(" + dorkTemplates.length + ")" : "";
  if (!dorkTemplates.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const tpl of dorkTemplates) {
    const row = document.createElement("div");
    row.className = "template-row";
    const info = document.createElement("div");
    info.className = "rinfo";
    const nm = document.createElement("div");
    nm.className = "rname";
    nm.textContent = tpl.name || "Untitled";
    nm.title = tpl.name;
    info.appendChild(nm);
    const mt = document.createElement("div");
    mt.className = "rmeta";
    const queryPreview = (tpl.query || "").substring(0, 60) + ((tpl.query || "").length > 60 ? "..." : "");
    mt.textContent = queryPreview;
    mt.title = tpl.query || "";
    info.appendChild(mt);
    row.appendChild(info);

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "template-btn";
    loadBtn.textContent = t("templatesLoad");
    loadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = $("bulkDorkInput");
      if (input && tpl.query) {
        input.value = input.value ? input.value + "\n" + tpl.query : tpl.query;
        try { localStorage.setItem("dofiltor_bulk_text", input.value); } catch (e2) { /* ignore */ }
        setBulkPanelOpen(true);
        setStatus(t("templateLoaded", { name: tpl.name }));
      }
    });
    row.appendChild(loadBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "template-btn danger";
    delBtn.textContent = "×";
    delBtn.title = t("templatesDelete");
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await sendMessage({ type: "DELETE_DORK_TEMPLATE", id: tpl.id });
      await refreshTemplatePanel();
      setStatus(t("templateDeleted", { name: tpl.name }));
    });
    row.appendChild(delBtn);

    list.appendChild(row);
  }
}

async function refreshTemplatePanel() {
  let templates = await sendMessage({ type: "GET_DORK_TEMPLATES" });
  if (!Array.isArray(templates) || !templates.length) {
    templates = await sendMessage({ type: "SEED_DEFAULT_TEMPLATES" });
  }
  renderTemplateList(Array.isArray(templates) ? templates : []);
}

async function addTemplate() {
  const tab = await activeTab();
  const url = (tab && tab.url) || "";
  const provider = (settings.providers || []).find((p) => providerMatchesUrl(p, url));
  const query = provider ? getDorkQueryFromUrl(url, provider) : "";
  const name = prompt(t("templateNamePrompt"), query ? query.substring(0, 40) : "");
  if (!name && name !== "") return;
  const templateQuery = prompt(t("templateQueryPrompt"), query);
  if (!templateQuery) return;
  await sendMessage({ type: "SAVE_DORK_TEMPLATE", name: name || "Untitled", query: templateQuery });
  await refreshTemplatePanel();
  setStatus(t("templateSaved", { name: name || "Untitled" }));
}

let tagDialogItem = null;

function openTagDialog(item) {
  tagDialogItem = item;
  const dialog = $("tagDialog");
  const input = $("tagInput");
  const noteInput = $("noteInput");
  const list = $("tagList");
  if (!dialog || !input || !noteInput || !list) return;

  list.replaceChildren();
  const tags = item.tags || [];
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tag-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", async () => {
      const updated = (tagDialogItem.tags || []).filter((t) => t !== tag);
      await sendMessage({ type: "UPDATE_URL_META", url: tagDialogItem.url, tags: updated });
      tagDialogItem.tags = updated;
      allUrls = await loadUrls();
      openTagDialog(tagDialogItem);
      refresh();
    });
    chip.appendChild(removeBtn);
    list.appendChild(chip);
  }
  if (!tags.length) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = t("tagEmpty");
    list.appendChild(empty);
  }

  noteInput.value = item.note || "";
  input.value = "";
  dialog.classList.add("show");
  dialog.setAttribute("aria-hidden", "false");
  input.focus();
}

function closeTagDialog() {
  const dialog = $("tagDialog");
  if (dialog) {
    dialog.classList.remove("show");
    dialog.setAttribute("aria-hidden", "true");
  }
  tagDialogItem = null;
}

async function addTagFromInput() {
  if (!tagDialogItem) return;
  const input = $("tagInput");
  const tag = (input?.value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!tag) return;
  const tags = [...new Set([...(tagDialogItem.tags || []), tag])];
  await sendMessage({ type: "UPDATE_URL_META", url: tagDialogItem.url, tags });
  tagDialogItem.tags = tags;
  allUrls = await loadUrls();
  openTagDialog(tagDialogItem);
  refresh();
}

async function saveNoteFromInput() {
  if (!tagDialogItem) return;
  const noteInput = $("noteInput");
  const note = (noteInput?.value || "").trim();
  await sendMessage({ type: "UPDATE_URL_META", url: tagDialogItem.url, note });
  tagDialogItem.note = note;
  allUrls = await loadUrls();
  refresh();
}

function handleBulkDorkStatus(msg) {
  if (!msg) return;
  refreshBulkUI();
  if (msg.active) {
    setStatus(formatBulkRunningLabel(msg) || msg.message || "");
    return;
  }
  if (msg.completed) {
    setStatus(msg.message || t("bulkDorkFinished"));
    return;
  }
  if (msg.message) setStatus(msg.message);
}

function formatActivityTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (e) {
    return "";
  }
}

function activityTypeLabel(type) {
  const key = ACTIVITY_TYPE_I18N[type] || ACTIVITY_TYPE_I18N.info;
  return t(key);
}

function setActivityPanelOpen(open) {
  const body = $("activityBody");
  const toggle = $("activityToggle");
  if (!body || !toggle) return;
  body.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  try {
    localStorage.setItem("dofiltor_activity_open", open ? "1" : "0");
  } catch (e) { /* ignore */ }
}

function renderActivityLog(log) {
  const list = $("activityList");
  const empty = $("activityEmpty");
  if (!list) return;
  const entries = Array.isArray(log) ? log.slice(0, 40) : [];
  list.replaceChildren();
  if (!entries.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const entry of entries) {
    const type = String(entry.type || "info").toLowerCase();
    const safeType = /^[a-z]+$/.test(type) ? type : "info";
    const pageSuffix = entry.page != null && entry.page !== "" ? " · p" + entry.page : "";
    const msg = safeText(entry.message) + pageSuffix;

    const row = document.createElement("li");
    row.className = "activity-item";

    const timeEl = document.createElement("span");
    timeEl.className = "activity-time";
    timeEl.textContent = formatActivityTime(entry.time);

    const typeEl = document.createElement("span");
    typeEl.className = "activity-type " + safeType;
    typeEl.textContent = activityTypeLabel(safeType);

    const msgEl = document.createElement("span");
    msgEl.className = "activity-msg";
    msgEl.textContent = msg;
    msgEl.title = msg;

    row.append(timeEl, typeEl, msgEl);
    list.appendChild(row);
  }
}

async function refreshActivityLog() {
  const log = await sendMessage({ type: "GET_ACTIVITY_LOG" });
  renderActivityLog(Array.isArray(log) ? log : []);
}

async function clearActivityLog() {
  await sendMessage({ type: "CLEAR_ACTIVITY_LOG" });
  renderActivityLog([]);
}

function showDoneBanner(payload) {
  const banner = $("doneBanner");
  const text = $("doneBannerText");
  if (!banner || !text) return;
  const page = payload && payload.page ? " (page " + payload.page + ")" : "";
  text.textContent = (payload && payload.message) || t("autoNextDoneDefault");
  text.textContent += page;
  banner.classList.add("show");
}

function hideDoneBanner() {
  const banner = $("doneBanner");
  if (banner) banner.classList.remove("show");
}

function handleAutoNextDone(payload) {
  if (!payload || (payload.status !== "done" && payload.status !== "end")) return;
  showDoneBanner(payload);
  if (autoNextEnabled) {
    autoNextEnabled = false;
    saveSettings({ ...settings, autoNext: false });
  }
  setStatus(payload.message || t("autoNextDoneDefault"));
  updateAutoNextUI(false, payload);
}

async function updateAutoNextStatus() {
  const status = await sendMessage({ type: "GET_AUTO_NEXT_STATUS" });
  if (!status) return;
  if (status.status === "done" || status.status === "end") {
    handleAutoNextDone(status);
    return;
  }
  if (status.status === "stuck") {
    setStatus(status.message || t("autoNextStuck"));
    updateAutoNextUI(autoNextEnabled, status);
    return;
  }
  const tab = await activeTab();
  const contentAlive = tab && tab.id != null ? (await pingContentScript(tab.id)).alive : false;
  updateAutoNextUI(autoNextEnabled, contentAlive ? status : null);
}

async function updateNotificationHint() {
  const el = $("notifHint");
  if (!el || !settings.notifications) {
    if (el) el.hidden = true;
    return;
  }
  const hint = await sendMessage({ type: "GET_NOTIF_HINT" });
  if (hint && hint.blocked) {
    el.textContent = t("notifPermissionDenied");
    el.hidden = false;
    return;
  }
  if (typeof chrome !== "undefined" && chrome.notifications?.getPermissionLevel) {
    chrome.notifications.getPermissionLevel((level) => {
      if (level === "denied") {
        el.textContent = t("notifPermissionDenied");
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
    return;
  }
  el.hidden = true;
}
function captchaResumeLabel(secondsLeft) {
  return t("captchaResumeIn").replace("{seconds}", String(secondsLeft));
}

function dismissCaptchaBanner() {
  const banner = $("captchaBanner");
  if (!banner) return;
  banner.classList.remove("show", "countdown");
}

function isCaptchaCountdownActive(countdown) {
  return !!(countdown && countdown.secondsLeft > 0);
}

function handleCaptchaCountdown(msg) {
  const banner = $("captchaBanner");
  const text = $("captchaBannerText");
  if (!banner || !text) return;

  if (!msg || msg.done || (msg.secondsLeft != null && msg.secondsLeft <= 0)) {
    dismissCaptchaBanner();
    return;
  }

  const sec = msg.secondsLeft || 0;
  banner.classList.add("show", "countdown");
  const label = captchaResumeLabel(sec);
  text.textContent = label;
  setStatus(label);
}

function handleCaptchaAlert(payload) {
  const banner = $("captchaBanner");
  const text = $("captchaBannerText");
  if (!banner) return;
  const active = !!(payload && payload.active);
  if (active) {
    banner.classList.add("show");
    banner.classList.remove("countdown");
    if (text) text.textContent = t("captchaDetected");
    setStatus(t("notifCaptchaMsg"));
    hideDoneBanner();
    return;
  }
  dismissCaptchaBanner();
}

async function updateCaptchaBanner() {
  const status = await sendMessage({ type: "GET_CAPTCHA_STATUS" });
  if (status && status.active) {
    handleCaptchaAlert(status);
    return;
  }

  const countdown = await sendMessage({ type: "GET_CAPTCHA_COUNTDOWN" });
  if (isCaptchaCountdownActive(countdown)) {
    handleCaptchaCountdown({ secondsLeft: countdown.secondsLeft, done: false });
    return;
  }

  dismissCaptchaBanner();
}

async function updateCaptchaCountdown() {
  const countdown = await sendMessage({ type: "GET_CAPTCHA_COUNTDOWN" });
  if (countdown && countdown.secondsLeft > 0) {
    handleCaptchaCountdown({ secondsLeft: countdown.secondsLeft, done: false });
  }
}

function ensureSelectedVisible() {
  if (selectedIndex < 0) return;
  const box = $("urlList");
  const top = selectedIndex * ROW_HEIGHT;
  const bottom = top + ROW_HEIGHT;
  if (top < box.scrollTop) box.scrollTop = top;
  if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
}
function onKeyboard(e) {
  if (e.key === "Escape" && $("typeDialog")?.classList.contains("show")) {
    closeTypeDialog();
    return;
  }
  if (e.key === "Escape" && $("tagDialog")?.classList.contains("show")) {
    closeTagDialog();
    return;
  }
  const tag = e.target.tagName;
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag)) return;
  if (!lastViewItems.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex = Math.min(lastViewItems.length - 1, selectedIndex + 1);
    ensureSelectedVisible();
    renderList();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex = Math.max(0, selectedIndex <= 0 ? 0 : selectedIndex - 1);
    ensureSelectedVisible();
    renderList();
  } else if (e.key === "Enter" && selectedIndex >= 0) {
    e.preventDefault();
    window.open(lastViewItems[selectedIndex].url, "_blank");
  } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIndex >= 0) {
    e.preventDefault();
    const item = lastViewItems[selectedIndex];
    const idx = allUrls.indexOf(item);
    allUrls.splice(idx, 1);
    saveUrls(allUrls).then(refresh);
  } else if (e.key === " ") {
    e.preventDefault();
    if (selectedIndex >= 0) {
      const url = lastViewItems[selectedIndex].url;
      if (selectedUrls.has(url)) selectedUrls.delete(url);
      else selectedUrls.add(url);
      updateSelectionAction();
      renderList();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    exportCurrent();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    $("searchInput")?.focus();
  } else if (e.key.toLowerCase() === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    manualGrab();
  } else if (e.key === "Escape") {
    e.preventDefault();
    clearFilters();
    unselectAll();
  }
}

function initTooltip() {
  const tip = document.createElement("div");
  tip.className = "tip";
  document.body.appendChild(tip);
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return;
    tip.textContent = el.getAttribute("data-tip");
    tip.classList.add("show");
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth;
      let left = r.left + r.width / 2 - tw / 2;
      let top = r.bottom + 6;
      if (left < 4) left = 4;
      if (left + tw > document.body.offsetWidth - 4) left = document.body.offsetWidth - tw - 4;
      if (top + tip.offsetHeight > window.innerHeight - 4) top = r.top - tip.offsetHeight - 6;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    });
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-tip]")) tip.classList.remove("show");
  });
}

function initPopupUi() {
  bindClick("themeToggle", cycleTheme);
  bindClick("pwrToggle", togglePower);
  bindClick("btnGithub", () => openExternalPage("https://github.com/iamutaki/dofiltor"));
  bindClick("btnValidate", startValidate);
  bindClick("btnExport", exportCurrent);
  bindClick("btnExportSelected", exportSelected);
  bindClick("btnSelectVisible", selectVisible);
  bindClick("btnUnselectAll", unselectAll);
  bindEl("typesStat", "click", openTypeDialog);
  bindEl("typesStat", "keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTypeDialog();
    }
  });
  bindClick("typeDialogClose", closeTypeDialog);
  bindEl("typeDialog", "click", (e) => {
    if (e.target.id === "typeDialog") closeTypeDialog();
  });
  bindClick("btnCopy", copyUrls);
  bindClick("btnBatchDl", batchDownload);
  bindClick("btnHistory", showHistory);
  bindClick("btnRemoveDead", removeDead);
  bindClick("btnClear", clearAll);
  bindClick("btnSettings", toggleSettingsPanel);
  bindChange("sortKey", syncSort);
  bindClick("sortDirBtn", toggleSortDir);
  bindChange("exportFormat", () => {
    const sel = $("exportFormat");
    if (!sel) return;
    exportFormat = sel.value;
    localStorage.setItem("dofiltor_export_format", exportFormat);
  });
  bindChange("pageDelay", syncSettings);
  bindChange("validateDelay", syncSettings);
  bindChange("reuseValidationCache", syncSettings);
  bindChange("autoValidate", syncSettings);
  bindChange("notifications", syncSettings);
  bindChange("skipVisitedResults", syncSettings);
  bindChange("maxPages", syncSettings);
  bindClick("autoNextBtn", toggleAutoNext);
  bindClick("markPageBtn", markPageComplete);
  bindClick("manualGrabBtn", manualGrab);
  bindClick("bulkToggle", () => {
    const body = $("bulkBody");
    setBulkPanelOpen(body ? body.hidden : true);
  });
  bindClick("bulkStartBtn", startBulkDorkQueue);
  bindClick("bulkStopBtn", stopBulkDorkQueue);
  bindClick("templateToggle", () => {
    const body = $("templateBody");
    setTemplatePanelOpen(body ? body.hidden : true);
  });
  bindClick("templateAddBtn", addTemplate);
  bindClick("tagDialogClose", closeTagDialog);
  bindEl("tagDialog", "click", (e) => {
    if (e.target.id === "tagDialog") closeTagDialog();
  });
  bindEl("tagInput", "keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTagFromInput(); }
  });
  bindClick("tagAddBtn", addTagFromInput);
  bindClick("tagSaveNoteBtn", saveNoteFromInput);
  bindClick("activityToggle", () => {
    const body = $("activityBody");
    setActivityPanelOpen(body ? body.hidden : true);
  });
  bindClick("activityClearBtn", clearActivityLog);
  bindClick("shortcutsToggle", () => {
    const body = $("shortcutsBody");
    const toggle = $("shortcutsToggle");
    if (!body || !toggle) return;
    const open = body.hidden;
    body.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    try { localStorage.setItem("dofiltor_shortcuts_open", open ? "1" : "0"); } catch (e) { /* ignore */ }
  });
  bindEl("urlList", "scroll", scheduleRenderList);
  bindEl("domainBar", "wheel", (e) => {
    const bar = $("domainBar");
    if (!bar || !bar.classList.contains("show") || bar.scrollWidth <= bar.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    bar.scrollLeft += e.deltaY;
  }, { passive: false });
  document.addEventListener("keydown", onKeyboard);

  bindClick("doneBannerDismiss", hideDoneBanner);

  bindClick("captchaShow", () => {
    if (!hasChromeTabs()) return;
    const patterns = (settings.providers || [])
      .filter((provider) => provider.enabled && provider.hostPattern)
      .map((provider) => {
        const base = hostBaseFromPattern(provider.hostPattern);
        return base ? "*://*." + base + "/*" : "";
      }).filter(Boolean);
    chrome.tabs.query({ url: patterns.length ? patterns : ["<all_urls>"] }, (tabs) => {
      if (tabs.length) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    });
  });

  const scopeBar = $("scopeBar");
  if (scopeBar) {
    scopeBar.addEventListener("click", (e) => {
      if (e.target.closest("#scopeGrantBtn")) {
        if (hasChromeRuntime()) chrome.runtime.openOptionsPage();
        return;
      }
      if (!e.target.closest("#scopeReloadBtn")) return;
      if (!hasChromeTabs()) return;
      activeTab().then((tab) => {
        if (tab && tab.id != null) chrome.tabs.reload(tab.id);
      });
    });
  }

  let searchTimer;
  bindEl("searchInput", "input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const input = $("searchInput");
      searchQuery = input ? input.value.trim() : "";
      updateFilterAction();
      selectedIndex = -1;
      const list = $("urlList");
      if (list) list.scrollTop = 0;
      refresh();
    }, 150);
  });
  bindClick("searchClear", clearFilters);
}

document.addEventListener("DOMContentLoaded", async () => {
  initPopupUi();

  applyTheme(loadTheme());
  await initI18n();
  applyI18n();
  applyAppVersion();
  initTooltip();

  if (hasChromeStorage()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[STORAGE_KEY]) {
        allUrls = dedupeUrls(changes[STORAGE_KEY].newValue || []);
        if (!validating) refresh();
      }
      if (changes[SETTINGS_KEY]) {
        settings = { ...settings, ...(changes[SETTINGS_KEY].newValue || {}) };
        autoNextEnabled = !!settings.autoNext;
        updateAutoNextUI(autoNextEnabled, null);
      }
      if (changes[AUTO_NEXT_ALERT_KEY]?.newValue) {
        handleAutoNextDone(changes[AUTO_NEXT_ALERT_KEY].newValue);
      }
      if (changes[CAPTCHA_ALERT_KEY]) {
        const val = changes[CAPTCHA_ALERT_KEY].newValue;
        if (val && val.active) {
          handleCaptchaAlert(val);
        } else {
          handleCaptchaAlert({ active: false });
        }
      }
      if (changes[CAPTCHA_COUNTDOWN_KEY]) {
        const val = changes[CAPTCHA_COUNTDOWN_KEY].newValue;
        if (val && val.secondsLeft > 0) {
          handleCaptchaCountdown({ secondsLeft: val.secondsLeft, done: false });
        } else {
          handleCaptchaCountdown({ done: true });
        }
      }
      if (changes[ACTIVITY_LOG_KEY]) {
        renderActivityLog(changes[ACTIVITY_LOG_KEY].newValue || []);
      }
      if (changes[SESSION_STATS_KEY]) {
        renderSessionDomainBar(changes[SESSION_STATS_KEY].newValue || { domains: {} });
      }
      if (changes[AUTO_NEXT_DELAY_KEY]) {
        renderAutoNextDelay(changes[AUTO_NEXT_DELAY_KEY].newValue);
      }
    });
  }

  if (hasChromeRuntime()) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === "AUTO_NEXT_DONE") handleAutoNextDone(msg);
      if (msg.type === "CAPTCHA_DETECTED") handleCaptchaAlert(msg);
      if (msg.type === "CAPTCHA_RESOLVED") handleCaptchaAlert({ active: false });
      if (msg.type === "CAPTCHA_COUNTDOWN") handleCaptchaCountdown(msg);
      if (msg.type === "BULK_DORK_STATUS") handleBulkDorkStatus(msg);
      if (msg.type === "ACTIVITY_LOG_UPDATED") renderActivityLog(msg.log || []);
      if (msg.type === "SESSION_STATS_UPDATED") renderSessionDomainBar(msg.stats || { domains: {} });
      if (msg.type === "AUTO_NEXT_DELAY_UPDATE") renderAutoNextDelay(msg);
    });
  }

  Promise.all([loadUrls(), loadSettings(), loadGlobalStats()]).then(([urls, loadedSettings]) => {
    allUrls = urls;
    settings = loadedSettings;
    extensionEnabled = settings.enabled !== undefined ? settings.enabled : true;
    updatePowerUI(extensionEnabled);
    autoNextEnabled = settings.autoNext;
    $("maxPages").value = settings.maxPages;
    $("pageDelay").value = settings.pageDelay;
    $("validateDelay").value = settings.validateDelay;
    $("autoValidate").checked = !!settings.autoValidate;
    $("notifications").checked = !!settings.notifications;
    if ($("skipVisitedResults")) {
      $("skipVisitedResults").checked = settings.skipVisitedResults !== false;
    }
    if ($("reuseValidationCache")) {
      $("reuseValidationCache").checked = settings.reuseValidationCache === true;
    }
    updateAutoNextUI(autoNextEnabled, null);
    try {
      const savedBulk = localStorage.getItem("dofiltor_bulk_text");
      if (savedBulk != null && $("bulkDorkInput")) $("bulkDorkInput").value = savedBulk;
    } catch (e) { /* ignore */ }
    refreshBulkUI();
    try {
      setTemplatePanelOpen(localStorage.getItem("dofiltor_template_open") === "1");
    } catch (e) { /* ignore */ }
    refreshTemplatePanel();
    try {
      setActivityPanelOpen(localStorage.getItem("dofiltor_activity_open") === "1");
    } catch (e) { /* ignore */ }
    try {
      const sBody = $("shortcutsBody");
      const sToggle = $("shortcutsToggle");
      if (sBody && sToggle && localStorage.getItem("dofiltor_shortcuts_open") === "1") {
        sBody.hidden = false;
        sToggle.setAttribute("aria-expanded", "true");
      }
    } catch (e) { /* ignore */ }
    refreshActivityLog();
    refreshSessionDomainStats();
    refresh();
    updateScopeIndicator();
    updateCaptchaBanner();
    updateCaptchaCountdown();
    updateAutoNextStatus();
    updateNotificationHint();
    if (hasChromeStorage()) {
      chrome.storage.local.get([AUTO_NEXT_ALERT_KEY, CAPTCHA_ALERT_KEY], (res) => {
        const captcha = res && res[CAPTCHA_ALERT_KEY];
        if (captcha && captcha.active) handleCaptchaAlert(captcha);
        const done = res && res[AUTO_NEXT_ALERT_KEY];
        if (done && done.time && Date.now() - done.time < 120000) {
          handleAutoNextDone(done);
        }
      });
    }
    pollBatchStatus();
  }).catch((e) => { console.error("Init error:", e); refresh(); });

  setInterval(async () => {
    updateCaptchaBanner();
    updateCaptchaCountdown();
    updateAutoNextStatus();
    updateNotificationHint();
    updateScopeIndicator();
    const urls = await loadUrls();
    if (JSON.stringify(urls) !== JSON.stringify(allUrls)) {
      allUrls = urls;
      await loadGlobalStats();
      refresh();
    }
  }, 2000);
});
