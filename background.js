// background.js — Dork File Collector v3.0.1 (dofiltor)

const STORAGE_KEY = "dofiltor_urls";
const SETTINGS_KEY = "dofiltor_settings";
const HISTORY_KEY = "dofiltor_history";
const GLOBAL_STATS_KEY = "dofiltor_global_stats";
const VALIDATION_CACHE_KEY = "dofiltor_validation_cache";
const CSV_COLUMNS = ["url", "file_type", "query", "source_page", "discovered_at", "size"];
importScripts("file-types.js");
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
const DYNAMIC_CONTENT_SCRIPT_ID = "dofiltor-dynamic-providers";
const DEFAULT_SETTINGS = {
  autoNext: false,
  maxPages: 50,
  pageDelay: 3000,
  autoValidate: true,
  validateDelay: 1500,
  validateMode: "head-get",
  notifications: true,
  enabled: true,
  fileTypes: DEFAULT_FILE_TYPES,
  providers: DEFAULT_PROVIDERS,
  reuseValidationCache: true,
  urlCacheMaxEntries: 5000,
  urlCacheMaxAgeDays: 0,
  dorkHistoryMax: 200,
};

let captchaStatus = { active: false, url: null };
let autoNextStatus = { status: "idle", page: 0, message: "" };
let batchStatus = { active: false, total: 0, done: 0, message: "" };
let autoValidateQueue = [];
let autoValidateBusy = false;

function getUrls() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(dedupeUrls(result[STORAGE_KEY] || []));
    });
  });
}

function saveUrls(urls) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: dedupeUrls(urls) }, resolve);
  });
}

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

function addUrls(incoming) {
  return Promise.all([getSettings(), getValidationCache()]).then(([settings, cache]) => {
    return getUrls().then((existing) => {
      const seen = new Set(existing.map((r) => r.url));
      const newItems = dedupeUrls(incoming).filter((r) => !seen.has(r.url));
      for (const item of newItems) {
        applyCachedValidation(item, cache, settings);
      }
      if (newItems.length === 0) {
        return { added: 0, total: existing.length, new_urls: [], cache_applied: 0 };
      }
      if (newItems.length > 0) {
        incrementGlobalStats({ grabbed: newItems.length });
      }
      const merged = existing.concat(newItems);
      const cacheApplied = newItems.filter((item) => item.status).length;
      return saveUrls(merged).then(() => ({
        added: newItems.length,
        total: merged.length,
        new_urls: newItems.map((r) => r.url),
        cache_applied: cacheApplied,
      }));
    });
  });
}

function toCSV(urls) {
  const escape = (val) => {
    const s = String(val || "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = CSV_COLUMNS.map(escape).join(",");
  const rows = urls.map((u) => CSV_COLUMNS.map((c) => escape(u[c])).join(","));
  return header + "\n" + rows.join("\n");
}

function exportData(urls, format, domain) {
  const filtered = domain && domain !== "all"
    ? urls.filter((u) => {
        try { return new URL(u.url).hostname === domain; } catch (e) { return false; }
      })
    : urls;

  if (!filtered.length) return null;
  if (format === "txt") return filtered.map((u) => u.url).join("\n");
  if (format === "json") return JSON.stringify(filtered, null, 2);
  return toCSV(filtered);
}

// --- URL check with size ---

function checkUrl(url, mode) {
  return fetch(url, { method: "HEAD", mode: "no-cors", redirect: "follow" })
    .then((resp) => {
      const size = resp.headers.get("content-length");
      return { ok: true, size: size ? parseInt(size, 10) : null };
    })
    .catch(() => {
      if (mode === "head") return { ok: false, size: null };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      return fetch(url, { method: "GET", mode: "no-cors", signal: controller.signal })
        .then(() => { clearTimeout(timeout); return { ok: true, size: null }; })
        .catch(() => { clearTimeout(timeout); return { ok: false, size: null }; });
    });
}

function cacheEntryExpired(entry, maxAgeDays) {
  const days = Number(maxAgeDays) || 0;
  if (!days || !entry || !entry.checkedAt) return false;
  return (Date.now() - entry.checkedAt) > days * 86400000;
}

function getValidationCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(VALIDATION_CACHE_KEY, (res) => {
      resolve(res[VALIDATION_CACHE_KEY] && typeof res[VALIDATION_CACHE_KEY] === "object"
        ? res[VALIDATION_CACHE_KEY]
        : {});
    });
  });
}

function saveValidationCache(cache) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [VALIDATION_CACHE_KEY]: cache }, resolve);
  });
}

function trimValidationCache(cache, maxEntries) {
  const limit = Math.max(100, Number(maxEntries) || DEFAULT_SETTINGS.urlCacheMaxEntries);
  const keys = Object.keys(cache);
  if (keys.length <= limit) return cache;
  keys.sort((a, b) => (cache[a].checkedAt || 0) - (cache[b].checkedAt || 0));
  const trimmed = { ...cache };
  for (let i = 0; i < keys.length - limit; i++) {
    delete trimmed[keys[i]];
  }
  return trimmed;
}

function applyCachedValidation(item, cache, settings) {
  if (!settings.reuseValidationCache || !item || !item.url) return false;
  const key = normalizeFileUrl(item.url);
  const entry = cache[key];
  if (!entry || cacheEntryExpired(entry, settings.urlCacheMaxAgeDays)) return false;
  item.status = entry.ok ? "ok" : "fail";
  if (entry.size) item.size = entry.size;
  return true;
}

function rememberValidationResult(url, result, settings) {
  if (!url || !result || result.fromCache) return Promise.resolve();
  const key = normalizeFileUrl(url);
  return getValidationCache().then((cache) => {
    cache[key] = {
      ok: !!result.ok,
      size: result.size || null,
      checkedAt: Date.now(),
    };
    return saveValidationCache(trimValidationCache(cache, settings.urlCacheMaxEntries));
  });
}

function checkUrlWithCache(url, mode, settings) {
  const key = normalizeFileUrl(url);
  if (settings.reuseValidationCache) {
    return getValidationCache().then((cache) => {
      const entry = cache[key];
      if (entry && !cacheEntryExpired(entry, settings.urlCacheMaxAgeDays)) {
        incrementGlobalStats({ cacheHits: 1 });
        return { ok: !!entry.ok, size: entry.size || null, fromCache: true };
      }
      return checkUrl(url, mode).then((result) => {
        incrementGlobalStats({ checked: 1 });
        return rememberValidationResult(url, result, settings).then(() => result);
      });
    });
  }
  return checkUrl(url, mode).then((result) => {
    incrementGlobalStats({ checked: 1 });
    return rememberValidationResult(url, result, settings).then(() => result);
  });
}

function getGlobalStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(GLOBAL_STATS_KEY, (res) => {
      const stats = res[GLOBAL_STATS_KEY] || {};
      resolve({
        grabbed: Number(stats.grabbed) || 0,
        checked: Number(stats.checked) || 0,
        cacheHits: Number(stats.cacheHits) || 0,
        updatedAt: stats.updatedAt || null,
      });
    });
  });
}

function incrementGlobalStats(delta) {
  return getGlobalStats().then((stats) => {
    const next = {
      grabbed: stats.grabbed + (Number(delta.grabbed) || 0),
      checked: stats.checked + (Number(delta.checked) || 0),
      cacheHits: stats.cacheHits + (Number(delta.cacheHits) || 0),
      updatedAt: new Date().toISOString(),
    };
    return new Promise((resolve) => {
      chrome.storage.local.set({ [GLOBAL_STATS_KEY]: next }, () => resolve(next));
    });
  });
}

function autoCheckUrl(url) {
  getSettings().then((settings) => {
    checkUrlWithCache(url, settings.validateMode, settings).then((result) => {
      getUrls().then((urls) => {
        const item = urls.find((u) => u.url === url);
        if (item) {
          item.status = result.ok ? "ok" : "fail";
          if (result.size) item.size = result.size;
          saveUrls(urls);
        }
      });
    });
  });
}

function processAutoValidateQueue() {
  if (autoValidateBusy || autoValidateQueue.length === 0) return;
  autoValidateBusy = true;

  getSettings().then((settings) => {
    if (!settings.autoValidate) {
      autoValidateQueue = [];
      autoValidateBusy = false;
      return;
    }
    const nextUrl = autoValidateQueue.shift();
    checkUrlWithCache(nextUrl, settings.validateMode, settings).then((result) => {
      getUrls().then((urls) => {
        const item = urls.find((u) => u.url === nextUrl);
        if (item) {
          item.status = result.ok ? "ok" : "fail";
          if (result.size) item.size = result.size;
          saveUrls(urls);
        }
      }).finally(() => {
        setTimeout(() => {
          autoValidateBusy = false;
          processAutoValidateQueue();
        }, Math.max(500, Number(settings.validateDelay) || DEFAULT_SETTINGS.validateDelay));
      });
    });
  });
}

function enqueueAutoValidate(url) {
  getSettings().then((settings) => {
    if (!settings.autoValidate) {
      autoValidateQueue = [];
      return;
    }
    getUrls().then((urls) => {
      const item = urls.find((u) => u.url === url);
      if (item && item.status) return;
      if (!autoValidateQueue.includes(url)) autoValidateQueue.push(url);
      processAutoValidateQueue();
    });
  });
}

// --- Fetch file size ---

function fetchFileSize(url) {
  return fetch(url, { method: "HEAD", mode: "no-cors", redirect: "follow" })
    .then((resp) => {
      const cl = resp.headers.get("content-length");
      return cl ? parseInt(cl) : null;
    })
    .catch(() => null);
}

// --- Scan history ---

function getHistory() {
  return new Promise((r) => {
    chrome.storage.local.get(HISTORY_KEY, (res) => {
      r(res[HISTORY_KEY] || []);
    });
  });
}

function saveHistory(h) {
  return new Promise((r) => {
    chrome.storage.local.set({ [HISTORY_KEY]: h }, r);
  });
}

function addHistoryEntry(query, urlCount, meta) {
  meta = meta || {};
  return getSettings().then((settings) => getHistory().then((history) => {
    const now = new Date().toISOString();
    const existing = history.find((h) => h.query === query);
    if (existing) {
      existing.pages = (existing.pages || 0) + 1;
      existing.urls = (existing.urls || 0) + urlCount;
      existing.lastScan = now;
      if (meta.provider) existing.provider = meta.provider;
    } else {
      history.unshift({
        query: query,
        urls: urlCount,
        pages: 1,
        provider: meta.provider || null,
        firstScan: now,
        lastScan: now,
      });
    }
    history.sort((a, b) => new Date(b.lastScan || 0) - new Date(a.lastScan || 0));
    const max = Math.max(10, Number(settings.dorkHistoryMax) || DEFAULT_SETTINGS.dorkHistoryMax);
    return saveHistory(history.slice(0, max));
  }));
}

// --- Settings ---

function resolveSettings(stored) {
  const raw = stored || {};
  const migration = migrateFileTypes(raw.fileTypes, raw.fileTypesVersion);
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    fileTypes: migration.fileTypes,
    fileTypesVersion: migration.fileTypesVersion,
    providers: Array.isArray(raw.providers) && raw.providers.length ? raw.providers : DEFAULT_PROVIDERS,
    _migrationChanged: migration.changed,
  };
}

function saveSettingsRecord(settings) {
  const next = { ...settings };
  delete next._migrationChanged;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: next }, resolve);
  });
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (res) => {
      const settings = resolveSettings(res[SETTINGS_KEY]);
      if (settings._migrationChanged) {
        saveSettingsRecord(settings).then(() => {
          const resolved = { ...settings };
          delete resolved._migrationChanged;
          resolve(resolved);
        });
        return;
      }
      delete settings._migrationChanged;
      resolve(settings);
    });
  });
}

function runSettingsMigration() {
  return getSettings();
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

function providerMatchPatterns(provider) {
  const host = providerHostBase(provider.hostContains);
  if (!host || !host.includes(".") || host.endsWith(".")) return [];
  return [
    "http://" + host + "/*",
    "https://" + host + "/*",
    "http://*." + host + "/*",
    "https://*." + host + "/*",
  ];
}

function customProviderMatches(providers) {
  const matches = [];
  for (const provider of Array.isArray(providers) ? providers : []) {
    const host = providerHostBase(provider.hostContains);
    if (!provider.enabled || STATIC_PROVIDER_HOSTS.has(host)) continue;
    matches.push(...providerMatchPatterns(provider));
  }
  return [...new Set(matches)];
}

function syncDynamicContentScripts(settings) {
  if (!chrome.scripting?.registerContentScripts) return Promise.resolve({ ok: false, reason: "scripting unavailable" });
  const matches = customProviderMatches(settings.providers);
  return chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] })
    .catch(() => null)
    .then(() => {
      if (!matches.length) return { ok: true, matches: [] };
      return chrome.scripting.registerContentScripts([{
        id: DYNAMIC_CONTENT_SCRIPT_ID,
        matches,
        js: ["file-types.js", "content.js"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      }]).then(() => ({ ok: true, matches }));
    })
    .catch((error) => ({ ok: false, error: error && error.message ? error.message : String(error) }));
}

chrome.runtime.onInstalled.addListener(() => {
  runSettingsMigration().then(syncDynamicContentScripts);
});

chrome.runtime.onStartup.addListener(() => {
  runSettingsMigration().then(syncDynamicContentScripts);
});

// --- Download tracking ---

function markDownloaded(url) {
  return getUrls().then((urls) => {
    const item = urls.find((u) => u.url === url);
    if (item) {
      item.downloaded = true;
      saveUrls(urls);
    }
  });
}

// Listen for download completion
try {
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === "complete" && delta.url) {
      markDownloaded(delta.url);
    }
  });
} catch (e) { /* ignore if not supported */ }

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "ADD_URLS") {
    getSettings().then((stg) => {
      if (!stg.enabled) { sendResponse({ added: 0, total: 0, new_urls: [] }); return; }
      addUrls(msg.urls).then((result) => {
      if (result.added > 0) {
        chrome.action.setBadgeText({ text: String(result.total) });
        chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });

        // Desktop notification for new URLs
        const query = msg.urls[0]?.query || "";
        const provider = msg.urls[0]?.provider || "";
        if (query) {
          getSettings().then((settings) => {
            if (!settings.notifications) return;
            chrome.notifications.create("dork-new", {
              type: "basic", iconUrl: "icons/icon128.png",
              title: "Dork File Collector",
              message: result.added + " new URLs found" + (query ? " for \"" + query.substring(0, 40) + "...\"" : ""),
              priority: 1,
            });
            setTimeout(() => chrome.notifications.clear("dork-new"), 3000);
          });
          addHistoryEntry(query, result.added, { provider });
        }
      }
      sendResponse(result);
    });
    });
    return true;
  }

  if (msg.type === "GET_ALL_URLS") {
    getUrls().then(sendResponse);
    return true;
  }

  if (msg.type === "SET_URLS") {
    saveUrls(msg.urls).then(() => {
      chrome.action.setBadgeText({ text: msg.urls.length > 0 ? String(msg.urls.length) : "" });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "EXPORT_CSV") {
    // Export only filtered URLs if filter provided, else all
    getUrls().then((urls) => {
      const filtered = msg.filter && msg.filter !== "all"
        ? urls.filter((u) => u.file_type === msg.filter)
        : urls;
      sendResponse(filtered.length > 0 ? toCSV(filtered) : null);
    });
    return true;
  }

  if (msg.type === "EXPORT_DATA") {
    getUrls().then((urls) => {
      const filtered = msg.filter && msg.filter !== "all"
        ? urls.filter((u) => u.file_type === msg.filter)
        : urls;
      sendResponse(exportData(filtered, msg.format || "csv", msg.domain || "all"));
    });
    return true;
  }

  if (msg.type === "CHECK_URL") {
    getSettings().then((settings) => checkUrlWithCache(msg.url, settings.validateMode, settings).then(sendResponse));
    return true;
  }

  if (msg.type === "AUTO_CHECK_URL") {
    enqueueAutoValidate(msg.url);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "FETCH_SIZE") {
    fetchFileSize(msg.url).then((size) => sendResponse({ size }));
    return true;
  }

  if (msg.type === "DOWNLOAD") {
    chrome.downloads.download({ url: msg.url });
    markDownloaded(msg.url);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "BATCH_DOWNLOAD") {
    getUrls().then((urls) => {
      const valid = urls.filter((u) => u.status === "ok" && !u.downloaded);
      let i = 0;
      batchStatus = { active: valid.length > 0, total: valid.length, done: 0, message: valid.length ? "Downloading" : "Nothing to download" };
      const next = () => {
        if (i >= valid.length) {
          batchStatus = { active: false, total: valid.length, done: valid.length, message: "Done" };
          return;
        }
        chrome.downloads.download({ url: valid[i].url });
        valid[i].downloaded = true;
        i++;
        batchStatus = { active: i < valid.length, total: valid.length, done: i, message: "Downloading" };
        setTimeout(next, 500);
      };
      next();
      saveUrls(urls);
      sendResponse({ count: valid.length });
    });
    return true;
  }

  if (msg.type === "GET_BATCH_STATUS") {
    sendResponse(batchStatus);
    return false;
  }

  if (msg.type === "CLEAR_ALL") {
    saveUrls([]).then(() => {
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "UPDATE_BADGE") {
    chrome.action.setBadgeText({ text: (msg.count || 0) > 0 ? String(msg.count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "GET_SETTINGS") {
    getSettings().then(sendResponse);
    return true;
  }

  if (msg.type === "SAVE_SETTINGS") {
    const migration = migrateFileTypes(msg.settings?.fileTypes, msg.settings?.fileTypesVersion);
    const settings = {
      ...DEFAULT_SETTINGS,
      ...msg.settings,
      fileTypes: normalizeFileTypeList(msg.settings?.fileTypes || migration.fileTypes),
      fileTypesVersion: FILE_TYPES_VERSION,
      providers: Array.isArray(msg.settings?.providers) && msg.settings.providers.length
        ? msg.settings.providers
        : DEFAULT_PROVIDERS,
    };
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
      syncDynamicContentScripts(settings).then((result) => sendResponse({ ok: true, dynamicScripts: result }));
    });
    return true;
  }

  if (msg.type === "SYNC_DYNAMIC_PROVIDERS") {
    getSettings().then(syncDynamicContentScripts).then(sendResponse);
    return true;
  }

  if (msg.type === "GET_HISTORY") {
    getHistory().then(sendResponse);
    return true;
  }

  if (msg.type === "CLEAR_HISTORY") {
    saveHistory([]).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_GLOBAL_STATS") {
    getGlobalStats().then(sendResponse);
    return true;
  }

  if (msg.type === "GET_VALIDATION_CACHE_STATS") {
    getValidationCache().then((cache) => {
      sendResponse({ entries: Object.keys(cache).length });
    });
    return true;
  }

  if (msg.type === "CLEAR_VALIDATION_CACHE") {
    saveValidationCache({}).then(() => sendResponse({ ok: true }));
    return true;
  }

  // --- CAPTCHA ---
  if (msg.type === "CAPTCHA_STATUS") {
    captchaStatus = { active: msg.status === "detected", url: msg.url || null, time: Date.now() };
    chrome.action.setBadgeBackgroundColor({ color: captchaStatus.active ? "#d93025" : "#2563eb" });
    if (captchaStatus.active) {
      getSettings().then((settings) => {
        if (!settings.notifications) return;
        chrome.notifications.create("dork-captcha", {
          type: "basic", iconUrl: "icons/icon128.png",
          title: "CAPTCHA Detected",
          message: "Auto-next paused. Solve the CAPTCHA to continue.",
          priority: 2,
        });
      });
    } else {
      chrome.notifications.clear("dork-captcha");
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "GET_CAPTCHA_STATUS") {
    sendResponse(captchaStatus);
    return false;
  }

  // --- Auto-next ---
  if (msg.type === "AUTO_NEXT_STATUS") {
    autoNextStatus = { status: msg.status, page: msg.page || 0, next: msg.next || 0, message: msg.message || "", time: Date.now() };

    if (msg.status === "done" || msg.status === "end") {
      Promise.all([getUrls(), getSettings()]).then(([urls, settings]) => {
        if (!settings.notifications) return;
        chrome.notifications.create("dork-done", {
          type: "basic", iconUrl: "icons/icon128.png",
          title: "Dork File Collector \u2014 Done",
          message: (msg.message || "Auto-next stopped") + ". " + urls.length + " URLs total.",
          priority: 2,
        });
        setTimeout(() => chrome.notifications.clear("dork-done"), 5000);
      });
    }

    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "GET_AUTO_NEXT_STATUS") {
    sendResponse(autoNextStatus);
    return false;
  }
});
