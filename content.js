/**
 * Content script — Dork File Collector v3.5.0 (dofiltor)
 * Runs on configured dork/search result pages.
 * Extracts document URLs, auto-next page, and handles CAPTCHA detection.
 */

const DEFAULT_PROVIDERS = [
  { id: "google", name: "Google", enabled: true, hostContains: "google.", pathContains: "/search", queryParam: "q", nextSelector: "#pnnext, a#pnnext, a[aria-label=\"Next page\"], a[aria-label=\"Halaman berikutnya\"]" },
  { id: "bing", name: "Bing", enabled: true, hostContains: "bing.com", pathContains: "/search", queryParam: "q", nextSelector: "a.sb_pagN" },
  { id: "duckduckgo", name: "DuckDuckGo", enabled: true, hostContains: "duckduckgo.com", pathContains: "/", queryParam: "q", nextSelector: "a[rel='next']" },
  { id: "yahoo", name: "Yahoo", enabled: false, hostContains: "search.yahoo.com", pathContains: "/search", queryParam: "p", nextSelector: "a.next" },
  { id: "yandex", name: "Yandex", enabled: false, hostContains: "yandex.", pathContains: "/search", queryParam: "text", nextSelector: "a[aria-label='Next page']" },
];

const SETTINGS_KEY = "dofiltor_settings";

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
let docPattern = buildDocPattern(settings.fileTypes);
let captchaDetected = false;
let autoNextActive = false;
let nextTimer = null;
let navigationWatchTimer = null;
let scheduleAfterScanTimer = null;
let justResolvedCaptcha = false;
let contextDead = false;
let lastDoneSignalKey = "";
let pendingAutoNextDelay = null;

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
  clearTimeout(nextTimer);
  clearTimeout(navigationWatchTimer);
  clearTimeout(scheduleAfterScanTimer);
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
          docPattern = buildDocPattern(settings.fileTypes);
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
    if (area === "local" && changes[SETTINGS_KEY]) {
      const wasAutoNext = settings.autoNext;
      const wasEnabled = settings.enabled;
      settings = normalizeSettings({ ...settings, ...changes[SETTINGS_KEY].newValue });
      docPattern = buildDocPattern(settings.fileTypes);

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
  if (contextDead || !settings.autoNext || !settings.enabled || captchaDetected) return;
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

function buildDocPattern(fileTypes) {
  const safe = fileTypes
    .map((ext) => String(ext).trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean)
    .map((ext) => ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("\\.(" + (safe.length ? safe.join("|") : DEFAULT_FILE_TYPES.join("|")) + ")\\b", "i");
}

function getActiveProvider() {
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  return (settings.providers || []).find((provider) => {
    if (!provider || !provider.enabled) return false;
    const hostNeedle = String(provider.hostContains || "").toLowerCase();
    const pathNeedle = String(provider.pathContains || "").toLowerCase();
    return (!hostNeedle || host.includes(hostNeedle)) && (!pathNeedle || path.includes(pathNeedle));
  }) || null;
}

function isProviderUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (settings.providers || []).some((provider) => {
      const hostNeedle = String(provider.hostContains || "").toLowerCase();
      return hostNeedle && host.includes(hostNeedle);
    });
  } catch (e) {
    return false;
  }
}

function isDocumentUrl(url) {
  const path = url.split("?")[0].split("#")[0];
  return docPattern.test(path);
}

function extractFileType(url) {
  const path = url.split("?")[0].split("#")[0];
  const match = path.match(docPattern);
  return match ? match[1].toLowerCase() : "unknown";
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

function detectCaptcha() {
  const indicators = [
    () => document.querySelector('iframe[src*="recaptcha"]'),
    () => document.querySelector('#captcha-form'),
    () => document.querySelector('#captcha'),
    () => {
      const body = document.body.innerText || "";
      return body.includes("unusual traffic") || body.includes("automated requests");
    },
    () => document.querySelector('form[action*="CaptchaRedirect"]'),
    () => {
      const body = document.body.innerText || "";
      return body.includes("Our systems have detected") && body.includes("traffic");
    },
  ];

  for (const check of indicators) {
    try { if (check()) return true; } catch (e) { /* ignore */ }
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

function visitedStorageKey() {
  const query = typeof normalizeDorkQuery === "function"
    ? normalizeDorkQuery(getQueryFromUrl())
    : getQueryFromUrl().trim().toLowerCase();
  return "dofiltor_seen_" + (query || location.hostname);
}

function loadSeenResultUrls() {
  try {
    const raw = sessionStorage.getItem(visitedStorageKey());
    return new Set(Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

function saveSeenResultUrls(seen) {
  try {
    const list = [...seen];
    sessionStorage.setItem(visitedStorageKey(), JSON.stringify(list.slice(-3000)));
  } catch (e) { /* ignore quota */ }
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
  if (!settings.enabled || !getActiveProvider()) return;
  const root = getResultRoot();
  if (!root) return;

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
}

function noteClickedResultLink(link) {
  const url = resolveLinkFromAnchor(link);
  if (!url) return;
  const seen = loadSeenResultUrls();
  seen.add(url);
  saveSeenResultUrls(seen);
  markVisitedOnLink(link);
}

function shouldSkipVisitedResultUrl(url) {
  if (!url || settings.skipVisitedResults === false) return false;
  return loadSeenResultUrls().has(url);
}

function extractUrls() {
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
    if (shouldSkipVisitedResultUrl(actualUrl)) {
      skippedVisited++;
      continue;
    }

    if (isDocumentUrl(actualUrl)) {
      seen.add(actualUrl);
      urls.push({
        url: actualUrl,
        file_type: extractFileType(actualUrl),
        query: query,
        provider: provider.name || provider.id || "custom",
        source_page: pageNum,
        discovered_at: now,
        status: null,
      });
    }
  }

  if (skippedVisited > 0) {
    dlog("Skipped", skippedVisited, "visited result URL(s)");
  }

  return urls;
}

function scan() {
  if (contextDead) return;
  if (!settings.enabled) return;
  if (!getActiveProvider()) return;

  if (detectCaptcha()) {
    if (!captchaDetected) {
      captchaDetected = true;
      clearTimeout(nextTimer);
      autoNextActive = false;
      sendMsg({
        type: "CAPTCHA_STATUS",
        status: "detected",
        url: window.location.href,
      });
      console.warn("[Dork File Collector] CAPTCHA detected — auto-next paused. Solve it manually.");
    }
    return;
  }

  if (captchaDetected) {
    captchaDetected = false;
    justResolvedCaptcha = true;
    sendMsg({ type: "CAPTCHA_STATUS", status: "resolved" });
    dlog("CAPTCHA resolved — resuming with longer delay");
  }

  const newUrls = extractUrls();

  // End only on explicit empty-SERP signals — not when this page has zero new doc URLs
  if (newUrls.length === 0 && hasExplicitEndOfResults() && !hasSearchResultsOnPage()) {
    if (settings.autoNext) {
      signalAutoNextDone(getPageNumber(), "End of results — no more pages", "end");
      dlog("End of results reached at page " + getPageNumber());
    }
    return;
  }

  if (newUrls.length === 0) {
    applyVisitedResultMarks(true);
    queueAutoNextAfterScan();
    return;
  }

  applyVisitedResultMarks(true);

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
}

// --- Auto next page ---

function scheduleAutoNext(delay, waitAttempt) {
  if (contextDead || !settings.autoNext || captchaDetected) return;
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
      return;
    }
    signalAutoNextDone(page, "Last page reached");
    return;
  }

  autoNextActive = true;
  sendMsg({
    type: "AUTO_NEXT_STATUS",
    status: "navigating",
    page: page,
    next: page + 1,
  });

  nextTimer = setTimeout(() => {
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
  setTimeout(() => {
    if (contextDead) return;
    if (!getActiveProvider()) return;
    injectVisitedStyles();
    applyVisitedResultMarks(false);
    warnIfDorkAlreadyCaptured();
    scan();
  }, 1000);
});

// Listen for URL changes; many result pages use pushState/replaceState.
let lastUrl = location.href;

const urlObserver = new MutationObserver(() => {
  if (contextDead) return;
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    clearTimeout(nextTimer);

    setTimeout(() => {
      if (contextDead) return;
      warnIfDorkAlreadyCaptured();
      applyVisitedResultMarks(false);
      pendingAutoNextDelay = justResolvedCaptcha ? 8000 : settings.pageDelay;
      justResolvedCaptcha = false;
      scan();
    }, 1500);
  }
});

// Observe body for DOM changes (re-scan on dynamic content)
const domObserver = new MutationObserver(() => {
  if (contextDead) return;
  clearTimeout(domObserver._timer);
  domObserver._timer = setTimeout(() => {
    if (!contextDead) scan();
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
  });
} catch (e) {
  contextDead = true;
}
