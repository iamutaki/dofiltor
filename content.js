/**
 * Content script — Dork File Collector v3.5.0 (dofiltor)
 * Runs on configured dork/search result pages.
 * Extracts document URLs, auto-next page, and handles CAPTCHA detection.
 */

const DEFAULT_PROVIDERS = [
  { id: "google", name: "Google", enabled: true, hostPattern: "**.google.**", hostContains: "google.", pathContains: "/search", queryParam: "q", nextSelector: "#pnnext, a#pnnext, a[aria-label=\"Next page\"], a[aria-label=\"Halaman berikutnya\"]" },
  { id: "bing", name: "Bing", enabled: true, hostPattern: "**.bing.com", hostContains: "bing.com", pathContains: "/search", queryParam: "q", nextSelector: "a.sb_pagN" },
  { id: "duckduckgo", name: "DuckDuckGo", enabled: true, hostPattern: "**.duckduckgo.com", hostContains: "duckduckgo.com", pathContains: "/", queryParam: "q", nextSelector: "a[rel='next']" },
  { id: "yahoo", name: "Yahoo", enabled: false, hostPattern: "**.search.yahoo.com", hostContains: "search.yahoo.com", pathContains: "/search", queryParam: "p", nextSelector: "a.next" },
  { id: "yandex", name: "Yandex", enabled: false, hostPattern: "**.yandex.**", hostContains: "yandex.", pathContains: "/search", queryParam: "text", nextSelector: "a[aria-label='Next page']" },
];

const SETTINGS_KEY = "dofiltor_settings";
const URLS_STORAGE_KEY = "dofiltor_urls";

let settings = {
  autoNext: false,
  maxPages: 50,
  pageDelay: 3000,
  autoValidate: true,
  validateDelay: 1500,
  notifications: true,
  skipVisitedResults: true,
  enabled: true,
  fileTypes: DEFAULT_FILE_TYPES,
  providers: DEFAULT_PROVIDERS,
};
let captchaDetected = false;
let autoNextActive = false;
let nextTimer = null;
let navigationWatchTimer = null;
let scheduleAfterScanTimer = null;
let captchaResumePending = false;
let captchaCountdownTimeout = null;
const CAPTCHA_RESUME_SECONDS = 8;
let contextDead = false;
let lastDoneSignalKey = "";
let pendingAutoNextDelay = null;
let extensionKnownUrls = null;
let autoNextDelayInterval = null;

function isDfcDebug() {
  try {
    return localStorage.getItem("dofiltor_debug") === "1";
  } catch (e) {
    return false;
  }
}

function dlog(...args) {
  if (isDfcDebug()) console.log("[Dork File Collector]", ...args);
}

// --- Safe messaging ---

function sendMsg(msg, callback) {
  if (contextDead) return;
  try {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError.message || "";
        if (err.includes("Extension context invalidated") || err.includes("message port closed")) {
          console.warn("[Dork File Collector] Extension reloaded — stopping this content script instance");
          shutdown();
        }
        return;
      }
      if (callback) callback(resp);
    });
  } catch (e) {
    shutdown();
  }
}

function shutdown() {
  contextDead = true;
  autoNextActive = false;
  clearCaptchaResumeCountdown();
  clearTimeout(nextTimer);
  clearTimeout(navigationWatchTimer);
  clearTimeout(scheduleAfterScanTimer);
  clearAutoNextDelayCountdown();
  // Stop observers
  try { urlObserver.disconnect(); } catch (e) { /* ignore */ }
  try { domObserver.disconnect(); } catch (e) { /* ignore */ }
  dlog("Context invalidated — content script stopped. Reload the page to activate again.");
}

// --- Settings ---

function loadSettings() {
  return new Promise((r) => {
    try {
      chrome.storage.local.get(SETTINGS_KEY, (res) => {
        if (chrome.runtime.lastError) { r(settings); return; }
        if (res[SETTINGS_KEY]) {
          settings = normalizeSettings({ ...settings, ...res[SETTINGS_KEY] });
        }
        r(settings);
      });
    } catch (e) {
      r(settings);
    }
  });
}

// Listen for storage changes (fired when popup saves settings)
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (contextDead) return;
    if (area === "local" && changes[URLS_STORAGE_KEY]) {
      extensionKnownUrls = urlsFromStorageItems(changes[URLS_STORAGE_KEY].newValue);
    }
    if (area === "local" && changes[SETTINGS_KEY]) {
      const wasAutoNext = settings.autoNext;
      const wasEnabled = settings.enabled;
      settings = normalizeSettings({ ...settings, ...changes[SETTINGS_KEY].newValue });

      if (!wasAutoNext && settings.autoNext) {
        dlog("Auto-next enabled — starting");
        scheduleAutoNext(1000);
      }

      if (wasAutoNext && !settings.autoNext) {
        dlog("Auto-next disabled");
        clearTimeout(nextTimer);
        autoNextActive = false;
        sendMsg({
          type: "AUTO_NEXT_STATUS",
          status: "idle",
          page: getPageNumber(),
          message: "",
        });
      }

      if (wasEnabled === false && settings.enabled === true) {
        dlog("Extension re-enabled — rescanning page");
        scan();
        if (settings.autoNext && !captchaDetected) {
          scheduleAutoNext(settings.pageDelay);
        }
      }
    }
  });
} catch (e) {
  contextDead = true;
}

// --- Helpers ---

function normalizeSettings(raw) {
  const migration = migrateFileTypes(raw.fileTypes, raw.fileTypesVersion);
  const providers = Array.isArray(raw.providers) && raw.providers.length ? raw.providers : DEFAULT_PROVIDERS;
  return {
    ...raw,
    fileTypes: migration.fileTypes,
    fileTypesVersion: migration.fileTypesVersion,
    providers: providers.map((provider) => {
      if (provider?.id === "google" && provider.nextSelector === "#pnnext") {
        return { ...provider, nextSelector: DEFAULT_PROVIDERS[0].nextSelector };
      }
      return provider;
    }),
  };
}

const PAGINATION_ROOT_BY_PROVIDER = {
  google: "#foot, [role='navigation'], .LLZwz, .AaVjTc, .T47uwc",
  bing: ".sb_pag, nav[aria-label='More Results']",
  duckduckgo: ".nav-link, .module--pagination, .result--more__btn",
  yahoo: ".compPagination, .pagination",
  yandex: ".Pager-List, .pager",
};

function isInPaginationArea(el) {
  const provider = getActiveProvider();
  if (!el || !provider) return true;
  if (provider.id === "google") {
    if (el.id === "pnnext" || el.closest("#pnnext")) return true;
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    if (label.includes("next") || label.includes("berikutnya")) {
      if (el.closest("#foot, #bottomads, [role='navigation'], .LLZwz, .AaVjTc, .T47uwc, table")) return true;
    }
  }
  const sel = PAGINATION_ROOT_BY_PROVIDER[provider.id];
  if (!sel) return true;
  return !!el.closest(sel);
}

function isNextPageHref(el) {
  const provider = getActiveProvider();
  if (!provider || provider.id !== "google") return true;
  const href = el.getAttribute("href") || "";
  if (!href || el.id === "pnnext") return true;
  try {
    const currentStart = parseInt(new URLSearchParams(location.search).get("start") || "0", 10);
    const linkUrl = href.startsWith("http") ? new URL(href) : new URL(href, location.origin);
    const nextStart = parseInt(linkUrl.searchParams.get("start") || "-1", 10);
    if (nextStart >= 0 && nextStart <= currentStart) return false;
  } catch (e) { /* ignore */ }
  return true;
}

function isUsableNextControl(el) {
  if (!el) return false;
  const provider = getActiveProvider();
  const selectorSpecific = el.id === "pnnext" || el.closest("#pnnext");
  if (!selectorSpecific && !isInPaginationArea(el)) return false;
  if (!isNextPageHref(el)) return false;
  if (el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled")) return false;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
  if (el.tagName === "A") {
    const href = el.getAttribute("href");
    if (!href || href === "#") return false;
  }
  return true;
}

function findNextButton(selector) {
  if (!selector) return null;
  const selectors = String(selector).split(",").map((s) => s.trim()).filter(Boolean);
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (isUsableNextControl(el)) return el;
  }
  return null;
}

function signalAutoNextStuck(page, message) {
  autoNextActive = false;
  clearTimeout(nextTimer);
  clearTimeout(navigationWatchTimer);
  sendMsg({
    type: "AUTO_NEXT_STATUS",
    status: "stuck",
    page: page,
    message: message || "Next page control not found — auto-next paused",
  });
  console.warn("[Dork File Collector]", message || "Auto-next paused (pagination not found)");
}

function signalAutoNextDone(page, message, status) {
  const dedupeKey = (status || "done") + "|" + page + "|" + message;
  if (lastDoneSignalKey === dedupeKey) return;
  lastDoneSignalKey = dedupeKey;

  autoNextActive = false;
  clearTimeout(nextTimer);
  clearTimeout(navigationWatchTimer);
  clearTimeout(scheduleAfterScanTimer);

  sendMsg({
    type: "AUTO_NEXT_STATUS",
    status: status || "done",
    page: page,
    message: message,
  });
  console.info("[Dork File Collector]", message || "Auto-next finished", "(page " + page + ")");
}

function queueAutoNextAfterScan() {
  if (contextDead || !settings.autoNext || !settings.enabled || captchaDetected || captchaResumePending) return;
  if (autoNextActive || nextTimer) return;
  clearTimeout(scheduleAfterScanTimer);
  const delay = pendingAutoNextDelay != null ? pendingAutoNextDelay : settings.pageDelay;
  pendingAutoNextDelay = null;
  scheduleAfterScanTimer = setTimeout(() => {
    if (contextDead || !settings.autoNext || captchaDetected) return;
    scheduleAutoNext(delay);
  }, 1200);
}

function hasSearchResultsOnPage() {
  const provider = getActiveProvider();
  const checks = {
    google: [
      "#search .g", "#search [data-hveid]", "#rso .MjjYud", "#rso [data-sokoban-container]",
      "#center_col .g", "div[data-ved] h3",
    ],
    bing: ["#b_results .b_algo", "#b_results h2 a"],
    duckduckgo: ["#links .result", "[data-testid='result']", "article.result"],
    yahoo: ["#web .algo", "#results .dd"],
    yandex: [".Organic", ".serp-item"],
  };
  const list = checks[provider?.id] || ["#search .g", "#b_results .b_algo", "#links .result"];
  return list.some((sel) => document.querySelector(sel));
}

function hasExplicitEndOfResults() {
  if (document.querySelector('[aria-label="No results"]') ||
      document.querySelector(".card-section")) {
    return true;
  }
  const bodyText = (document.body.innerText || "").toLowerCase();
  return bodyText.includes("did not match any documents") ||
    bodyText.includes("no results found") ||
    bodyText.includes("couldn't find any results") ||
    bodyText.includes("tidak ada hasil");
}

function _providerHostMatch(provider, host) {
  if (provider.hostPattern) return hostMatchesGlob(host, provider.hostPattern);
  const hostNeedle = String(provider.hostContains || "").toLowerCase();
  return !hostNeedle || host.includes(hostNeedle);
}

function getActiveProvider() {
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  return (settings.providers || []).find((provider) => {
    if (!provider || !provider.enabled) return false;
    const pathNeedle = String(provider.pathContains || "").toLowerCase();
    return _providerHostMatch(provider, host) && (!pathNeedle || path.includes(pathNeedle));
  }) || null;
}

function isProviderUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (settings.providers || []).some((provider) => {
      return _providerHostMatch(provider, host);
    });
  } catch (e) {
    return false;
  }
}

const RESULT_ITEM_BY_PROVIDER = {
  google: ".g, .MjjYud, [data-sokoban-container], li[data-rpos]",
  bing: ".b_algo, li.b_algo",
  duckduckgo: ".result, article.result, [data-testid='result']",
  yahoo: ".algo, .dd",
  yandex: ".Organic, .serp-item",
};

const GOOGLE_FILE_BADGE_SELECTORS = [
  ".eFM0qc span",
  ".BCF2pd span",
  ".ZGwO7 span",
  ".s4H5Cf span",
];

function findResultItemRoot(link, providerId) {
  const selectors = RESULT_ITEM_BY_PROVIDER[providerId];
  if (!link || !selectors) return null;
  for (const sel of selectors.split(",")) {
    const trimmed = sel.trim();
    if (!trimmed) continue;
    const el = link.closest(trimmed);
    if (el) return el;
  }
  return null;
}

function scanResultItemForBadgeLabel(root, fileTypes) {
  if (!root) return null;
  for (const span of root.querySelectorAll("span")) {
    const label = (span.textContent || "").trim();
    if (label.length > 8 || label.length < 2) continue;
    if (!/^[A-Za-z][A-Za-z0-9]{0,6}$/.test(label)) continue;
    if (fileTypeFromBadgeLabel(label, fileTypes)) return label;
  }
  return null;
}

function findProviderBadgeLabel(link, providerId) {
  const root = findResultItemRoot(link, providerId);
  if (!root) return null;

  if (providerId === "google") {
    for (const sel of GOOGLE_FILE_BADGE_SELECTORS) {
      for (const span of root.querySelectorAll(sel)) {
        const label = (span.textContent || "").trim();
        if (fileTypeFromBadgeLabel(label, settings.fileTypes)) return label;
      }
    }
    return scanResultItemForBadgeLabel(root, settings.fileTypes);
  }

  if (providerId === "bing") {
    for (const el of root.querySelectorAll(".fileType, span[data-tag]")) {
      const label = (el.textContent || el.getAttribute("data-tag") || "").trim();
      if (fileTypeFromBadgeLabel(label, settings.fileTypes)) return label;
    }
    return scanResultItemForBadgeLabel(root, settings.fileTypes);
  }

  return scanResultItemForBadgeLabel(root, settings.fileTypes);
}

function resolveResultFileType(link, url, providerId) {
  const badgeLabel = findProviderBadgeLabel(link, providerId);
  return resolveCaptureFileType(url, badgeLabel, settings.fileTypes);
}

function getQueryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const provider = getActiveProvider();
  return params.get(provider?.queryParam || "q") || "";
}

let lastWarnedDork = "";

function warnIfDorkAlreadyCaptured() {
  const provider = getActiveProvider();
  if (!provider || !settings.enabled) return;
  const query = normalizeDorkQuery(getQueryFromUrl());
  if (!query || query === lastWarnedDork) return;
  sendMsg({ type: "WARN_DORK_CAPTURED", query }, (resp) => {
    if (resp && resp.warned) lastWarnedDork = query;
  });
}

function getPageNumber() {
  const params = new URLSearchParams(window.location.search);
  const start = parseInt(params.get("start") || "0", 10);
  return Math.floor(start / 10) + 1;
}

// --- CAPTCHA detection ---

function isProviderHostPage() {
  const host = window.location.hostname.toLowerCase();
  return (settings.providers || []).some((provider) => {
    if (!provider?.enabled) return false;
    return _providerHostMatch(provider, host);
  });
}

function detectCaptcha() {
  const url = (location.href || "").toLowerCase();
  const path = (location.pathname || "").toLowerCase();

  if (path.includes("/sorry") || url.includes("/sorry?") || url.includes("google.com/sorry")) {
    return true;
  }

  if (captchaTextHit(document.body?.innerText || "")) return true;

  const indicators = [
    () => document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'),
    () => document.querySelector("#captcha-form, #captcha, .g-recaptcha, #recaptcha, .rc-anchor"),
    () => document.querySelector('form[action*="CaptchaRedirect"]'),
    () => document.querySelector('input[name="captcha"]'),
    () => document.querySelector("#cf-turnstile-wrapper, .hcaptcha-box"),
    () => document.querySelector("[data-callback*='captcha']"),
  ];

  for (const check of indicators) {
    try { if (check()) return true; } catch (e) { /* ignore */ }
  }
  return false;
}

function captchaCountdownLabel(secondsLeft) {
  try {
    return chrome.i18n.getMessage("captchaResumeIn", [String(secondsLeft)]) ||
      "Resuming in " + secondsLeft + "s\u2026";
  } catch (e) {
    return "Resuming in " + secondsLeft + "s\u2026";
  }
}

function injectCaptchaCountdownStyles() {
  if (document.getElementById("dofiltor-captcha-countdown-style")) return;
  const style = document.createElement("style");
  style.id = "dofiltor-captcha-countdown-style";
  style.textContent = [
    "#dofiltor-captcha-countdown {",
    "  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;",
    "  max-width: min(320px, calc(100vw - 32px));",
    "  padding: 10px 14px; border-radius: 8px;",
    "  background: rgba(30, 136, 229, 0.95); color: #fff;",
    "  font: 600 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;",
    "  box-shadow: 0 4px 16px rgba(0,0,0,0.22); pointer-events: none;",
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  #dofiltor-captcha-countdown { background: rgba(26, 115, 232, 0.96); }",
    "}",
  ].join("\n");
  (document.head || document.documentElement).appendChild(style);
}

function showCaptchaCountdownOverlay(secondsLeft) {
  injectCaptchaCountdownStyles();
  let el = document.getElementById("dofiltor-captcha-countdown");
  if (!el) {
    el = document.createElement("div");
    el.id = "dofiltor-captcha-countdown";
    (document.body || document.documentElement).appendChild(el);
  }
  el.textContent = captchaCountdownLabel(secondsLeft);
  el.style.display = "block";
}

function removeCaptchaCountdownOverlay() {
  const el = document.getElementById("dofiltor-captcha-countdown");
  if (el) el.remove();
}

function broadcastCaptchaCountdown(secondsLeft, done) {
  sendMsg({
    type: "CAPTCHA_COUNTDOWN",
    secondsLeft: done ? 0 : secondsLeft,
    done: !!done,
  });
}

function clearCaptchaResumeCountdown() {
  captchaResumePending = false;
  clearTimeout(captchaCountdownTimeout);
  captchaCountdownTimeout = null;
  removeCaptchaCountdownOverlay();
}

function finishCaptchaResumeCountdown() {
  clearCaptchaResumeCountdown();
  broadcastCaptchaCountdown(0, true);
  dlog("CAPTCHA resume countdown finished");
  if (contextDead) return;
  if (checkCaptchaState()) return;
  scan();
}

function startCaptchaResumeCountdown(totalSec) {
  clearCaptchaResumeCountdown();
  captchaResumePending = true;
  let left = Math.max(1, totalSec || CAPTCHA_RESUME_SECONDS);

  const tick = () => {
    if (contextDead) {
      clearCaptchaResumeCountdown();
      return;
    }
    if (left <= 0) {
      finishCaptchaResumeCountdown();
      return;
    }
    showCaptchaCountdownOverlay(left);
    broadcastCaptchaCountdown(left, false);
    left -= 1;
    captchaCountdownTimeout = setTimeout(tick, 1000);
  };
  tick();
}

function reportCaptchaDetected() {
  if (captchaDetected) return;
  clearCaptchaResumeCountdown();
  captchaDetected = true;
  clearTimeout(nextTimer);
  clearTimeout(scheduleAfterScanTimer);
  clearTimeout(navigationWatchTimer);
  autoNextActive = false;
  sendMsg({
    type: "CAPTCHA_STATUS",
    status: "detected",
    url: window.location.href,
  });
  console.warn("[Dork File Collector] CAPTCHA detected — auto-next paused. Solve it manually.");
}

function reportCaptchaResolved() {
  if (!captchaDetected) return;
  captchaDetected = false;
  clearTimeout(nextTimer);
  clearTimeout(scheduleAfterScanTimer);
  clearTimeout(navigationWatchTimer);
  autoNextActive = false;
  sendMsg({
    type: "CAPTCHA_STATUS",
    status: "resolved",
    url: window.location.href,
  });
  logActivity("captcha", "CAPTCHA solved — resume in " + CAPTCHA_RESUME_SECONDS + "s");
  dlog("CAPTCHA resolved — resume countdown started");
  startCaptchaResumeCountdown(CAPTCHA_RESUME_SECONDS);
}

function checkCaptchaState() {
  if (contextDead || !settings.enabled) return false;
  if (!isProviderHostPage()) return false;

  if (detectCaptcha()) {
    reportCaptchaDetected();
    return true;
  }
  if (captchaDetected) {
    reportCaptchaResolved();
  }
  return false;
}

// --- URL extraction & visited result styling ---

const RESULT_ROOT_BY_PROVIDER = {
  google: "#search, #rso, #center_col",
  bing: "#b_results",
  duckduckgo: "#links, #react-layout",
  yahoo: "#web, #results",
  yandex: ".content__left, .Organic",
};

const RESULT_SKIP_ANCESTOR =
  "#pnprev, #pnnext, #navcnt, nav, [role='navigation'], .b_pag, .pagination, #bottomads, #tads, #tadsb";

function normalizeOutboundUrl(raw) {
  if (!raw) return null;
  let actualUrl = raw;
  try { actualUrl = decodeURIComponent(actualUrl); } catch (e) { /* ignore */ }
  try {
    const parsed = new URL(actualUrl);
    parsed.hash = "";
    return parsed.href;
  } catch (e) {
    return null;
  }
}

function resolveLinkFromAnchor(link) {
  const href = link.getAttribute("href") || "";
  let actualUrl = null;

  if (href.startsWith("/url?q=")) {
    actualUrl = href.split("/url?q=")[1].split("&")[0];
  } else if (href.startsWith("https://") && href.indexOf("/url?") !== -1 && href.match(/^https:\/\/[^\/]*google\./)) {
    for (const param of href.split("&")) {
      if (param.startsWith("q=") || param.startsWith("url=")) {
        actualUrl = param.split("=", 2)[1];
        break;
      }
    }
  } else if (href.includes("/ck/a") && href.includes("bing.com")) {
    try {
      const parsed = new URL(href);
      const u = parsed.searchParams.get("u");
      if (u) {
        let b64 = u.startsWith("a1") ? u.substring(2) : u;
        b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        actualUrl = atob(b64);
      }
    } catch (e) { /* ignore */ }
  } else if (href.startsWith("http") && !isProviderUrl(href)) {
    actualUrl = href;
  }

  actualUrl = normalizeOutboundUrl(actualUrl);
  if (!actualUrl || isProviderUrl(actualUrl)) return null;
  return actualUrl;
}

function getResultRoot() {
  const provider = getActiveProvider();
  const selectors = RESULT_ROOT_BY_PROVIDER[provider?.id] || "#search, #b_results, #links, main";
  for (const sel of selectors.split(",")) {
    const el = document.querySelector(sel.trim());
    if (el) return el;
  }
  return null;
}

function isResultAreaLink(link) {
  const root = getResultRoot();
  if (!root || !link || !root.contains(link)) return false;
  if (link.closest(RESULT_SKIP_ANCESTOR)) return false;
  if (link.closest("a[href]") !== link) return false;
  return !!resolveLinkFromAnchor(link);
}

function dorkScopeKey() {
  const query = typeof normalizeDorkQuery === "function"
    ? normalizeDorkQuery(getQueryFromUrl())
    : getQueryFromUrl().trim().toLowerCase();
  return query || location.hostname;
}

function visitedStorageKey() {
  return "dofiltor_seen_" + dorkScopeKey();
}

function collectedStorageKey() {
  return "dofiltor_collected_" + dorkScopeKey();
}

let seenUrlsCache = null;
let collectedUrlsCache = null;
let seenCacheScope = "";
let collectedCacheScope = "";

function resetVisitedCaches() {
  seenUrlsCache = null;
  collectedUrlsCache = null;
  seenCacheScope = "";
  collectedCacheScope = "";
}

function loadSeenResultUrls() {
  const scope = visitedStorageKey();
  if (seenUrlsCache && seenCacheScope === scope) return seenUrlsCache;
  try {
    const raw = sessionStorage.getItem(scope);
    seenUrlsCache = new Set(Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []);
  } catch (e) {
    seenUrlsCache = new Set();
  }
  seenCacheScope = scope;
  return seenUrlsCache;
}

function saveSeenResultUrls(seen) {
  try {
    const list = [...seen];
    sessionStorage.setItem(visitedStorageKey(), JSON.stringify(list.slice(-3000)));
    seenUrlsCache = new Set(list);
    seenCacheScope = visitedStorageKey();
  } catch (e) { /* ignore quota */ }
}

function loadCollectedUrls() {
  const scope = collectedStorageKey();
  if (collectedUrlsCache && collectedCacheScope === scope) return collectedUrlsCache;
  try {
    const raw = sessionStorage.getItem(scope);
    collectedUrlsCache = new Set(Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []);
  } catch (e) {
    collectedUrlsCache = new Set();
  }
  collectedCacheScope = scope;
  return collectedUrlsCache;
}

function saveCollectedUrls(collected) {
  try {
    const list = [...collected];
    sessionStorage.setItem(collectedStorageKey(), JSON.stringify(list.slice(-3000)));
    collectedUrlsCache = new Set(list);
    collectedCacheScope = collectedStorageKey();
  } catch (e) { /* ignore quota */ }
}

function noteCollectedUrls(urls) {
  if (!Array.isArray(urls) || !urls.length) return;
  const collected = loadCollectedUrls();
  let added = 0;
  for (const url of urls) {
    if (!url || collected.has(url)) continue;
    collected.add(url);
    added++;
  }
  if (added > 0) saveCollectedUrls(collected);
}

function markLinksVisited(urls) {
  const urlSet = new Set(urls);
  if (!urlSet.size) return;
  injectVisitedStyles();
  const root = getResultRoot();
  if (!root) return;
  for (const link of root.querySelectorAll("a[href]")) {
    const url = resolveLinkFromAnchor(link);
    if (url && urlSet.has(url)) markVisitedOnLink(link);
  }
}

function injectVisitedStyles() {
  if (document.getElementById("dofiltor-visited-style")) return;
  const style = document.createElement("style");
  style.id = "dofiltor-visited-style";
  style.textContent = [
    "a.dofiltor-visited, a.dofiltor-visited:link, a[data-dofiltor-visited='1'] {",
    "  color: #681da8 !important;",
    "  text-decoration-color: rgba(104, 29, 168, 0.45) !important;",
    "}",
    "a.dofiltor-visited h3, a.dofiltor-visited em, a.dofiltor-visited span,",
    "a.dofiltor-visited div, a[data-dofiltor-visited='1'] h3,",
    "a[data-dofiltor-visited='1'] em, a[data-dofiltor-visited='1'] span {",
    "  color: inherit !important;",
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  a.dofiltor-visited, a.dofiltor-visited:link, a[data-dofiltor-visited='1'] {",
    "    color: #c58af9 !important;",
    "    text-decoration-color: rgba(197, 138, 249, 0.45) !important;",
    "  }",
    "}",
  ].join("\n");
  (document.head || document.documentElement).appendChild(style);
}

function markVisitedOnLink(link) {
  link.classList.add("dofiltor-visited");
  link.setAttribute("data-dofiltor-visited", "1");
}

function applyVisitedResultMarks(addCurrentPage) {
  if (!settings.enabled || !getActiveProvider()) return { ok: false, added: 0, total: 0 };
  const root = getResultRoot();
  if (!root) return { ok: false, added: 0, total: 0 };

  injectVisitedStyles();
  const seen = loadSeenResultUrls();
  let added = 0;

  for (const link of root.querySelectorAll("a[href]")) {
    if (!isResultAreaLink(link)) continue;
    const url = resolveLinkFromAnchor(link);
    if (!url) continue;
    if (addCurrentPage && !seen.has(url)) {
      seen.add(url);
      added++;
    }
    if (seen.has(url)) markVisitedOnLink(link);
  }

  if (addCurrentPage && added > 0) saveSeenResultUrls(seen);
  dlog("Visited marks:", seen.size, "urls", addCurrentPage ? "(+" + added + " this page)" : "");
  return { ok: true, added, total: seen.size };
}

let lastSkipLogKey = "";
let lastSkipLogAt = 0;

function noteSkipVisitedLog(count, pageNum) {
  const key = String(pageNum) + ":" + String(count);
  const now = Date.now();
  if (key === lastSkipLogKey && now - lastSkipLogAt < 5000) return;
  lastSkipLogKey = key;
  lastSkipLogAt = now;
  logActivity("skip", "Skipped " + count + " visited on page " + pageNum);
}

function logActivity(type, message) {
  sendMsg({
    type: "LOG_ACTIVITY",
    activityType: type,
    message: String(message || ""),
    page: getPageNumber(),
  });
}

function noteClickedResultLink(link) {
  const url = resolveLinkFromAnchor(link);
  if (!url) return;
  noteCollectedUrls([url]);
  const seen = loadSeenResultUrls();
  seen.add(url);
  saveSeenResultUrls(seen);
  markVisitedOnLink(link);
}

function refreshExtensionKnownUrls(done) {
  if (!chrome.storage?.local) {
    extensionKnownUrls = new Set();
    if (done) done();
    return;
  }
  chrome.storage.local.get(URLS_STORAGE_KEY, (res) => {
    extensionKnownUrls = urlsFromStorageItems(res[URLS_STORAGE_KEY]);
    if (done) done();
  });
}

function shouldSkipVisitedResultUrl(url) {
  return shouldSkipVisitedUrl(url, {
    skipEnabled: settings.skipVisitedResults !== false,
    collected: loadCollectedUrls(),
    extensionKnown: extensionKnownUrls,
  });
}

function extractUrls(options) {
  const ignoreVisited = !!(options && options.ignoreVisited);
  const provider = getActiveProvider();
  if (!provider) return [];
  const query = getQueryFromUrl();
  const pageNum = getPageNumber();
  const now = new Date().toISOString();
  const root = getResultRoot();
  const links = root ? root.querySelectorAll("a[href]") : document.querySelectorAll("a[href]");
  const urls = [];
  const seen = new Set();
  let skippedVisited = 0;

  for (const link of links) {
    const actualUrl = resolveLinkFromAnchor(link);
    if (!actualUrl || seen.has(actualUrl)) continue;
    if (!ignoreVisited && shouldSkipVisitedResultUrl(actualUrl)) {
      skippedVisited++;
      continue;
    }

    const fileType = resolveResultFileType(link, actualUrl, provider.id);
    if (fileType) {
      seen.add(actualUrl);
      urls.push({
        url: actualUrl,
        file_type: fileType,
        query: query,
        provider: provider.name || provider.id || "custom",
        source_page: pageNum,
        discovered_at: now,
        status: null,
      });
    }
  }

  if (!ignoreVisited && skippedVisited > 0) {
    dlog("Skipped", skippedVisited, "visited result URL(s)");
    noteSkipVisitedLog(skippedVisited, pageNum);
  }

  return urls;
}

function manualGrabPage() {
  if (contextDead) return { ok: false, found: 0, added: 0, error: "dead" };
  if (!settings.enabled) return { ok: false, found: 0, added: 0, error: "disabled" };
  if (checkCaptchaState()) return { ok: false, found: 0, added: 0, error: "captcha" };
  const provider = getActiveProvider();
  if (!provider) return { ok: false, found: 0, added: 0, error: "no_provider" };

  const pageNum = getPageNumber();
  const urls = extractUrls({ ignoreVisited: true });
  const found = urls.length;

  if (found === 0) {
    return new Promise((resolve) => {
      sendMsg({ type: "ADD_URLS", urls: [], manual: true, found: 0 }, (response) => {
        resolve({ ok: true, found: 0, added: 0, page: pageNum, ...(response || {}) });
      });
    });
  }

  const collectedNow = urls.map((item) => item.url);
  noteCollectedUrls(collectedNow);

  return new Promise((resolve) => {
    sendMsg({ type: "ADD_URLS", urls, manual: true, found }, (response) => {
      if (!response) {
        resolve({ ok: false, found, added: 0, error: "no_response", page: pageNum });
        return;
      }
      const added = response.added || 0;
      if (added > 0) {
        sendMsg({ type: "UPDATE_BADGE", count: response.total });
        if (settings.autoValidate && response.new_urls) {
          for (const url of response.new_urls) {
            sendMsg({ type: "AUTO_CHECK_URL", url });
          }
        }
        extensionKnownUrls = null;
        refreshExtensionKnownUrls();
      }
      resolve({ ok: true, found, added, page: pageNum });
    });
  });
}

let scanRunning = false;
let scanQueued = false;

function scan() {
  if (contextDead) return;
  if (!settings.enabled) return;
  if (scanRunning) {
    scanQueued = true;
    return;
  }
  scanRunning = true;

  if (checkCaptchaState()) {
    scanRunning = false;
    if (scanQueued) { scanQueued = false; scan(); }
    return;
  }
  if (!getActiveProvider()) {
    scanRunning = false;
    if (scanQueued) { scanQueued = false; scan(); }
    return;
  }

  if (!extensionKnownUrls) refreshExtensionKnownUrls();

  const newUrls = extractUrls();

  // End only on explicit empty-SERP signals — not when this page has zero new doc URLs
  if (newUrls.length === 0 && hasExplicitEndOfResults() && !hasSearchResultsOnPage()) {
    if (settings.autoNext) {
      signalAutoNextDone(getPageNumber(), "End of results — no more pages", "end");
      dlog("End of results reached at page " + getPageNumber());
    }
    scanRunning = false;
    if (scanQueued) { scanQueued = false; scan(); }
    return;
  }

  if (newUrls.length === 0) {
    applyVisitedResultMarks(false);
    queueAutoNextAfterScan();
    scanRunning = false;
    if (scanQueued) { scanQueued = false; scan(); }
    return;
  }

  const collectedNow = newUrls.map((item) => item.url);
  noteCollectedUrls(collectedNow);
  markLinksVisited(collectedNow);

  sendMsg({ type: "ADD_URLS", urls: newUrls }, (response) => {
    if (!response) return;
    if (response.added > 0) {
      sendMsg({ type: "UPDATE_BADGE", count: response.total });
      if (settings.autoValidate && response.new_urls) {
        for (const url of response.new_urls) {
          sendMsg({ type: "AUTO_CHECK_URL", url: url });
        }
      }
    }
  });
  queueAutoNextAfterScan();
  scanRunning = false;
  if (scanQueued) { scanQueued = false; scan(); }
}

// --- Auto next page ---

function clearAutoNextDelayCountdown() {
  clearInterval(autoNextDelayInterval);
  autoNextDelayInterval = null;
}

function broadcastAutoNextDelay(secondsLeft) {
  sendMsg({
    type: "AUTO_NEXT_DELAY",
    secondsLeft: secondsLeft,
    done: secondsLeft <= 0,
  });
}

function scheduleAutoNext(delay, waitAttempt) {
  if (contextDead || !settings.autoNext || captchaDetected || captchaResumePending) return;
  if (!settings.enabled) return;

  const attempt = waitAttempt || 0;
  clearTimeout(nextTimer);
  const page = getPageNumber();

  if (page >= settings.maxPages) {
    signalAutoNextDone(page, "Max pages reached (" + settings.maxPages + ")");
    return;
  }

  const provider = getActiveProvider();
  const nextBtn = findNextButton(provider?.nextSelector);
  if (!nextBtn) {
    if (attempt < 14) {
      nextTimer = setTimeout(() => scheduleAutoNext(delay, attempt + 1), 900);
      return;
    }
    if (hasExplicitEndOfResults() || !hasSearchResultsOnPage()) {
      signalAutoNextDone(page, "Last page reached");
    } else {
      signalAutoNextStuck(page, "Next page control not found — auto-next paused");
    }
    return;
  }

  autoNextActive = true;
  sendMsg({
    type: "AUTO_NEXT_STATUS",
    status: "navigating",
    page: page,
    next: page + 1,
  });

  clearAutoNextDelayCountdown();
  const delaySec = Math.ceil(delay / 1000);
  let remaining = delaySec;
  broadcastAutoNextDelay(remaining);
  autoNextDelayInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearAutoNextDelayCountdown();
      broadcastAutoNextDelay(0);
      return;
    }
    broadcastAutoNextDelay(remaining);
  }, 1000);

  nextTimer = setTimeout(() => {
    clearAutoNextDelayCountdown();
    broadcastAutoNextDelay(0);
    if (contextDead || !settings.autoNext || captchaDetected) return;
    const hrefBefore = location.href;
    const pageBefore = getPageNumber();
    applyVisitedResultMarks(true);
    dlog("Clicking next — page " + pageBefore + " \u2192 " + (pageBefore + 1));
    nextBtn.click();
    clearTimeout(navigationWatchTimer);
    navigationWatchTimer = setTimeout(() => {
      if (contextDead || !settings.autoNext || captchaDetected) return;
      if (location.href === hrefBefore && getPageNumber() === pageBefore) {
        signalAutoNextDone(pageBefore, "Last page reached");
        dlog("Next click did not advance — treating as last page");
      }
    }, 4500);
  }, delay);
}

// --- Init ---

document.addEventListener("click", (event) => {
  if (contextDead || !settings.enabled) return;
  const link = event.target.closest && event.target.closest("a[href]");
  if (!link || !isResultAreaLink(link)) return;
  noteClickedResultLink(link);
}, true);

loadSettings().then(() => {
  refreshExtensionKnownUrls();
  setTimeout(() => {
    if (contextDead) return;
    if (!extensionKnownUrls) refreshExtensionKnownUrls();
    checkCaptchaState();
    if (!getActiveProvider() && !captchaDetected) return;
    injectVisitedStyles();
    applyVisitedResultMarks(false);
    warnIfDorkAlreadyCaptured();
    scan();
  }, 1000);

  setInterval(() => {
    if (!contextDead && settings.enabled) checkCaptchaState();
  }, 2500);
});

// Listen for URL changes; many result pages use pushState/replaceState.
let lastUrl = location.href;

const urlObserver = new MutationObserver(() => {
  if (contextDead) return;
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    lastDoneSignalKey = "";
    resetVisitedCaches();
    clearTimeout(nextTimer);

    setTimeout(() => {
      if (contextDead) return;
      if (checkCaptchaState()) return;
      warnIfDorkAlreadyCaptured();
      applyVisitedResultMarks(false);
      if (!captchaResumePending) scan();
    }, 1500);
  }
});

// Observe body for DOM changes (re-scan on dynamic content)
const domObserver = new MutationObserver(() => {
  if (contextDead) return;
  clearTimeout(domObserver._timer);
  domObserver._timer = setTimeout(() => {
    if (contextDead) return;
    if (checkCaptchaState()) return;
    scan();
  }, 800);
});

urlObserver.observe(document.documentElement, { childList: true, subtree: false });
domObserver.observe(document.body, { childList: true, subtree: true });

// Listen for messages from popup/background
try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (contextDead) { sendResponse({ error: "context invalidated" }); return false; }

    if (msg.type === "GET_PAGE_INFO") {
      sendResponse({
        page: getPageNumber(),
        query: getQueryFromUrl(),
        captcha: captchaDetected,
        autoNext: autoNextActive,
      });
      return false;
    }

    if (msg.type === "STOP_AUTO_NEXT") {
      clearTimeout(nextTimer);
      autoNextActive = false;
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === "MARK_PAGE_COMPLETE") {
      const result = applyVisitedResultMarks(true);
      if (result.ok) {
        logActivity("mark", "Page marked complete (+" + result.added + " links)");
      }
      sendResponse(result);
      return false;
    }

    if (msg.type === "MANUAL_GRAB") {
      manualGrabPage().then(sendResponse);
      return true;
    }
  });
} catch (e) {
  contextDead = true;
}
