/**
 * Content script — runs on configured dork/search result pages.
 * Extracts document URLs, auto-next page, and handles CAPTCHA detection.
 */

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

const SETTINGS_KEY = "dofiltor_settings";

let settings = {
  autoNext: false,
  maxPages: 50,
  pageDelay: 3000,
  autoValidate: true,
  validateDelay: 1500,
  notifications: true,
  enabled: true,
  fileTypes: DEFAULT_FILE_TYPES,
  providers: DEFAULT_PROVIDERS,
};
let docPattern = buildDocPattern(settings.fileTypes);
let captchaDetected = false;
let autoNextActive = false;
let nextTimer = null;
let justResolvedCaptcha = false;
let contextDead = false;

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
  // Stop observers
  try { urlObserver.disconnect(); } catch (e) { /* ignore */ }
  try { domObserver.disconnect(); } catch (e) { /* ignore */ }
  console.log("[Dork File Collector] Context invalidated — content script stopped. Reload the page to activate again.");
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
        console.log("[Dork File Collector] Auto-next enabled — starting");
        scheduleAutoNext(1000);
      }

      if (wasAutoNext && !settings.autoNext) {
        console.log("[Dork File Collector] Auto-next disabled");
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
        console.log("[Dork File Collector] Extension re-enabled — rescanning page");
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
  return {
    ...raw,
    fileTypes: Array.isArray(raw.fileTypes) && raw.fileTypes.length ? raw.fileTypes : DEFAULT_FILE_TYPES,
    providers: Array.isArray(raw.providers) && raw.providers.length ? raw.providers : DEFAULT_PROVIDERS,
  };
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

// --- URL extraction ---

function extractUrls() {
  const provider = getActiveProvider();
  if (!provider) return [];
  const query = getQueryFromUrl();
  const pageNum = getPageNumber();
  const now = new Date().toISOString();
  const links = document.querySelectorAll("a[href]");
  const urls = [];
  const seen = new Set();

  for (const link of links) {
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

    if (!actualUrl) continue;

    try { actualUrl = decodeURIComponent(actualUrl); } catch (e) { /* ignore */ }

    if (isProviderUrl(actualUrl)) continue;
    if (seen.has(actualUrl)) continue;

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
    console.log("[Dork File Collector] CAPTCHA resolved — resuming with longer delay");
  }

  const newUrls = extractUrls();

  // Detect end of results — no document URLs found and no regular results either
  if (newUrls.length === 0) {
    const hasResults = document.querySelector("#search") && document.querySelector("#search .g");
    const endMessage = document.querySelector("#lst-ib + div + div") ||
                       document.querySelector('[aria-label="No results"]') ||
                       document.querySelector(".card-section");
    const bodyText = (document.body.innerText || "").toLowerCase();
    const endKeywords = bodyText.includes("did not match any documents") ||
                        bodyText.includes("no results found") ||
                        bodyText.includes("couldn't find any results");

    if (!hasResults || endMessage || endKeywords) {
      if (autoNextActive) {
        autoNextActive = false;
        clearTimeout(nextTimer);
        sendMsg({
          type: "AUTO_NEXT_STATUS",
          status: "end",
          page: getPageNumber(),
          message: "End of results — no more pages",
        });
        console.log("[Dork File Collector] End of results reached at page " + getPageNumber());
      }
      return;
    }

    // Page loaded but no doc URLs found (might be all non-doc results)
    return;
  }

  sendMsg({ type: "ADD_URLS", urls: newUrls }, (response) => {
    if (!response) return;
    if (response.added > 0) {
      sendMsg({ type: "UPDATE_BADGE", count: response.total });
      if (response.new_urls) {
        for (const url of response.new_urls) {
          sendMsg({ type: "AUTO_CHECK_URL", url: url });
        }
      }
    }
  });
}

// --- Auto next page ---

function scheduleAutoNext(delay) {
  if (contextDead || !settings.autoNext || captchaDetected) return;
  if (!settings.enabled) return;

  clearTimeout(nextTimer);
  const page = getPageNumber();

  if (page >= settings.maxPages) {
    sendMsg({
      type: "AUTO_NEXT_STATUS",
      status: "done",
      page: page,
      message: "Max pages reached (" + settings.maxPages + ")",
    });
    autoNextActive = false;
    return;
  }

  const provider = getActiveProvider();
  const nextBtn = provider?.nextSelector ? document.querySelector(provider.nextSelector) : null;
  if (!nextBtn) {
    sendMsg({
      type: "AUTO_NEXT_STATUS",
      status: "done",
      page: page,
      message: "Last page reached",
    });
    autoNextActive = false;
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
    console.log("[Dork File Collector] Clicking next — page " + page + " \u2192 " + (page + 1));
    nextBtn.click();
  }, delay);
}

// --- Init ---

loadSettings().then(() => {
  setTimeout(() => {
    if (contextDead) return;
    if (!getActiveProvider()) return;
    scan();

    if (settings.autoNext) {
      scheduleAutoNext(settings.pageDelay);
    }
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
      scan();

      if (settings.autoNext && !captchaDetected) {
        const delay = justResolvedCaptcha ? 8000 : settings.pageDelay;
        justResolvedCaptcha = false;
        scheduleAutoNext(delay);
      }
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
