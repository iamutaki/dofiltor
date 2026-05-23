// background.js — Dork File Collector v3.5.0 (dofiltor)

const STORAGE_KEY = "dofiltor_urls";
const SETTINGS_KEY = "dofiltor_settings";
const HISTORY_KEY = "dofiltor_history";
const GLOBAL_STATS_KEY = "dofiltor_global_stats";
const VALIDATION_CACHE_KEY = "dofiltor_validation_cache";
const AUTO_NEXT_ALERT_KEY = "dofiltor_auto_next_alert";
const CAPTCHA_ALERT_KEY = "dofiltor_captcha_alert";
const NOTIF_HINT_KEY = "dofiltor_notif_hint";
const ACTIVITY_LOG_KEY = "dofiltor_activity_log";
const SESSION_STATS_KEY = "dofiltor_session_stats";
const BULK_DORK_KEY = "dofiltor_bulk_dork";
const CAPTCHA_COUNTDOWN_KEY = "dofiltor_captcha_countdown";

function showExtensionNotification(id, options, settings) {
  if (!settings || !settings.notifications) return;
  const iconUrl = chrome.runtime.getURL("icons/icon128.png");
  const payload = { type: "basic", iconUrl, priority: 1, ...options };

  const setBlockedHint = (blocked) => {
    if (blocked) {
      chrome.storage.local.set({ [NOTIF_HINT_KEY]: { blocked: true, time: Date.now() } });
    } else {
      chrome.storage.local.remove(NOTIF_HINT_KEY);
    }
  };

  const create = () => {
    chrome.notifications.create(id, payload, () => {
      setBlockedHint(!!chrome.runtime.lastError);
    });
  };

  if (chrome.notifications.getPermissionLevel) {
    chrome.notifications.getPermissionLevel((level) => {
      if (level === "denied") {
        setBlockedHint(true);
        return;
      }
      create();
    });
    return;
  }
  create();
}

/**
 * Push UI updates to side panel. Chrome rejects the sendMessage promise when
 * no listener is open — try/catch alone on a sync call does not catch that.
 */
function broadcastRuntimeMessage(payload) {
  void sendRuntimeMessageSafe(payload);
}

async function sendRuntimeMessageSafe(payload) {
  try {
    await chrome.runtime.sendMessage(payload);
  } catch (e) {
    // Expected: "Could not establish connection. Receiving end does not exist."
    // when the side panel is closed.
  }
}

const CSV_COLUMNS = ["url", "file_type", "query", "source_page", "discovered_at", "size"];
importScripts("file-types.js", "dork-utils.js", "provider-utils.js", "activity-log.js");
const DEFAULT_PROVIDERS = [
  { id: "google", name: "Google", enabled: true, hostContains: "google.", pathContains: "/search", queryParam: "q", nextSelector: "#pnnext, a#pnnext, a[aria-label=\"Next page\"], a[aria-label=\"Halaman berikutnya\"]" },
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
  skipVisitedResults: true,
  enabled: true,
  fileTypes: DEFAULT_FILE_TYPES,
  providers: DEFAULT_PROVIDERS,
  reuseValidationCache: false,
  urlCacheMaxEntries: 5000,
  urlCacheMaxAgeDays: 0,
  dorkHistoryMax: 200,
};

let captchaStatus = { active: false, url: null };
let autoNextStatus = { status: "idle", page: 0, message: "" };
let batchStatus = { active: false, total: 0, done: 0, message: "" };
let autoValidateQueue = [];
let autoValidateBusy = false;

function pushActivity(type, message, page) {
  return new Promise((resolve) => {
    chrome.storage.local.get(ACTIVITY_LOG_KEY, (res) => {
      const next = appendActivityEntry(res[ACTIVITY_LOG_KEY], { type, message, page });
      chrome.storage.local.set({ [ACTIVITY_LOG_KEY]: next }, () => {
        broadcastRuntimeMessage({ type: "ACTIVITY_LOG_UPDATED", log: next });
        resolve(next);
      });
    });
  });
}

function getBulkState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(BULK_DORK_KEY, (res) => resolve(res[BULK_DORK_KEY] || null));
  });
}

function setBulkState(state) {
  return new Promise((resolve) => {
    if (!state) {
      chrome.storage.local.remove(BULK_DORK_KEY, resolve);
      return;
    }
    chrome.storage.local.set({ [BULK_DORK_KEY]: state }, resolve);
  });
}

function bumpSessionDomains(urlList) {
  const urls = (urlList || []).map((item) => (typeof item === "string" ? item : item && item.url)).filter(Boolean);
  if (!urls.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_STATS_KEY, (res) => {
      const prev = res[SESSION_STATS_KEY] || { domains: {}, startedAt: new Date().toISOString() };
      const domains = mergeSessionDomainCounts(prev.domains, urls);
      const payload = { ...prev, domains, updatedAt: new Date().toISOString() };
      chrome.storage.local.set({ [SESSION_STATS_KEY]: payload }, () => {
        broadcastRuntimeMessage({ type: "SESSION_STATS_UPDATED", stats: payload });
        resolve(payload);
      });
    });
  });
}

function clearSessionDomainStats() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(SESSION_STATS_KEY, () => {
      broadcastRuntimeMessage({ type: "SESSION_STATS_UPDATED", stats: { domains: {} } });
      resolve();
    });
  });
}

function stopBulkDork(completed, message) {
  return getBulkState().then((bulk) => {
    if (!bulk) return null;
    return setBulkState(null).then(() => {
      pushActivity(completed ? "bulk" : "info", message || (completed ? "Bulk dork queue finished" : "Bulk dork stopped"));
      broadcastRuntimeMessage({ type: "BULK_DORK_STATUS", active: false, completed: !!completed, message: message || "" });
      return null;
    });
  });
}

function broadcastBulkStatus(bulk, extra) {
  const payload = {
    type: "BULK_DORK_STATUS",
    active: !!(bulk && bulk.active),
    index: bulk ? bulk.index : 0,
    total: bulk ? bulk.queries.length : 0,
    currentQuery: bulk ? bulk.currentQuery : "",
    providerId: bulk ? bulk.providerId : "",
    ...(extra || {}),
  };
  broadcastRuntimeMessage(payload);
  return payload;
}

function advanceBulkDorkAfterPage() {
  return getBulkState().then((bulk) => {
    if (!bulk || !bulk.active) return null;
    const nextIndex = bulk.index + 1;
    if (nextIndex >= bulk.queries.length) {
      return stopBulkDork(true, "Bulk dork queue finished (" + bulk.queries.length + ")");
    }
    return getSettings().then((settings) => {
      const provider = (settings.providers || []).find((p) => p.id === bulk.providerId) ||
        (settings.providers || []).find((p) => p.enabled);
      const nextQuery = bulk.queries[nextIndex];
      const url = buildProviderSearchUrl(provider, nextQuery);
      if (!url) {
        return stopBulkDork(false, "Could not build search URL for provider");
      }
      const nextBulk = {
        ...bulk,
        index: nextIndex,
        currentQuery: nextQuery,
        status: "running",
      };
      return setBulkState(nextBulk).then(() => {
        pushActivity("bulk", "Dork " + (nextIndex + 1) + "/" + bulk.queries.length + ": " + nextQuery.substring(0, 72));
        broadcastBulkStatus(nextBulk, { message: "Navigating to next dork" });
        return chrome.tabs.update(bulk.tabId, { url }).then(() => nextBulk);
      });
    });
  });
}

function handleBulkOnAutoNextComplete(msg) {
  return getBulkState().then((bulk) => {
    if (!bulk || !bulk.active) return false;
    if (msg.status !== "done" && msg.status !== "end") return false;
    return advanceBulkDorkAfterPage().then(() => true);
  });
}

function startBulkDorkQueue(tabId, text, providerId) {
  const queries = parseBulkDorkLines(text);
  if (!queries.length) {
    return Promise.resolve({ ok: false, error: "no_queries" });
  }
  if (tabId == null) {
    return Promise.resolve({ ok: false, error: "no_tab" });
  }

  return getSettings().then((settings) => {
    return chrome.tabs.get(tabId).then((tab) => {
      let provider = (settings.providers || []).find((p) => p.id === providerId && p.enabled);
      if (!provider) {
        provider = findEnabledProviderForUrl(settings.providers, tab.url);
      }
      if (!provider) {
        return { ok: false, error: "no_provider" };
      }

      const firstUrl = buildProviderSearchUrl(provider, queries[0]);
      if (!firstUrl) {
        return { ok: false, error: "bad_url" };
      }

      const bulk = {
        active: true,
        tabId,
        providerId: provider.id,
        queries,
        index: 0,
        currentQuery: queries[0],
        status: "running",
        startedAt: Date.now(),
      };

      const nextSettings = { ...settings, autoNext: true };
      return saveSettingsRecord(nextSettings).then(() => setBulkState(bulk)).then(() => {
        pushActivity("bulk", "Bulk queue started (" + queries.length + " dorks, " + provider.name + ")");
        broadcastBulkStatus(bulk, { message: "Bulk queue started" });
        return chrome.tabs.update(tabId, { url: firstUrl }).then(() => ({ ok: true, bulk }));
      });
    }).catch(() => ({ ok: false, error: "tab_error" }));
  });
}

function getUrls() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(dedupeUrls(result[STORAGE_KEY] || []));
    });
  });
}

function syncActionBadge(count) {
  const n = Math.max(0, Number(count) || 0);
  const text = n > 0 ? String(n) : "";
  return new Promise((resolve) => {
    chrome.action.setBadgeText({ text }, () => {
      if (chrome.runtime?.lastError) { /* ignore */ }
      if (n > 0) chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
      resolve();
    });
  });
}

function saveUrls(urls) {
  const clean = dedupeUrls(urls);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: clean }, () => {
      syncActionBadge(clean.length).then(() => resolve(clean));
    });
  });
}

function setUrlValidationState(url, patch) {
  const key = normalizeFileUrl(url);
  if (!key) return Promise.resolve(false);
  return getUrls().then((urls) => {
    const item = urls.find((u) => normalizeFileUrl(u.url) === key);
    if (!item) return false;
    if (patch.status != null) item.status = patch.status;
    if (patch.size != null) item.size = patch.size;
    return saveUrls(urls).then(() => true);
  });
}

function runUrlValidation(url, settings) {
  return setUrlValidationState(url, { status: "checking" }).then(() =>
    checkUrlWithCache(url, settings.validateMode, settings).then((result) =>
      setUrlValidationState(url, {
        status: result.ok ? "ok" : "fail",
        size: result.size || null,
      }).then(() => result)
    )
  );
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
    runUrlValidation(url, settings);
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
    runUrlValidation(nextUrl, settings).finally(() => {
      setTimeout(() => {
        autoValidateBusy = false;
        processAutoValidateQueue();
      }, Math.max(500, Number(settings.validateDelay) || DEFAULT_SETTINGS.validateDelay));
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
  const normalized = normalizeDorkQuery(query);
  if (!normalized) return Promise.resolve();
  return getSettings().then((settings) => getHistory().then((history) => {
    const now = new Date().toISOString();
    const existing = history.find((h) => dorkQueriesMatch(h.query, normalized));
    if (existing) {
      existing.query = normalized;
      existing.pages = (existing.pages || 0) + 1;
      existing.urls = (existing.urls || 0) + urlCount;
      existing.lastScan = now;
      if (meta.provider) existing.provider = meta.provider;
    } else {
      history.unshift({
        query: normalized,
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

function lookupDorkCapture(query) {
  return Promise.all([getHistory(), getUrls()]).then(([history, urls]) =>
    lookupDorkCaptureFromData(query, history, urls));
}

// --- Settings ---

function resolveSettings(stored) {
  const raw = stored || {};
  const migration = migrateFileTypes(raw.fileTypes, raw.fileTypesVersion);
  const providers = Array.isArray(raw.providers) && raw.providers.length ? raw.providers : DEFAULT_PROVIDERS;
  const migratedProviders = providers.map((provider) => {
    if (provider?.id === "google" && provider.nextSelector === "#pnnext") {
      return { ...provider, nextSelector: DEFAULT_PROVIDERS[0].nextSelector };
    }
    return provider;
  });
  const providersChanged = migratedProviders.some((provider, index) => provider !== providers[index]);
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    fileTypes: migration.fileTypes,
    fileTypesVersion: migration.fileTypesVersion,
    providers: migratedProviders,
    _migrationChanged: migration.changed || providersChanged,
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
    // Full host wildcard — includes /search, /sorry, and other challenge paths on custom domains.
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
        js: ["file-types.js", "dork-utils.js", "visited-logic.js", "content.js"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      }]).then(() => ({ ok: true, matches }));
    })
    .catch((error) => ({ ok: false, error: error && error.message ? error.message : String(error) }));
}

function initSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  initSidePanel();
  runSettingsMigration().then(syncDynamicContentScripts);
});

chrome.runtime.onStartup.addListener(() => {
  initSidePanel();
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
      const page = msg.urls[0]?.source_page || "?";
      if (msg.manual) {
        const found = Number(msg.found);
        const totalFound = Number.isFinite(found) ? found : (Array.isArray(msg.urls) ? msg.urls.length : 0);
        const added = result.added || 0;
        const already = Math.max(0, totalFound - added);
        let activityMsg = "Manual grab: " + added + " new";
        if (already > 0) activityMsg += ", " + already + " already listed";
        activityMsg += " (page " + page + ")";
        if (totalFound === 0) activityMsg = "Manual grab: 0 file URLs (page " + page + ")";
        pushActivity("grab", activityMsg);
      } else if (result.added > 0) {
        pushActivity("scan", result.added + " new URL(s) on page " + page);
      }
      if (result.added > 0) {
        bumpSessionDomains(msg.urls);
        // Desktop notification for new URLs
        const query = msg.urls[0]?.query || "";
        const provider = msg.urls[0]?.provider || "";
        if (query) {
          getSettings().then((settings) => {
            showExtensionNotification("dork-new", {
              title: "Dork File Collector",
              message: result.added + " new URLs found" + (query ? " for \"" + query.substring(0, 40) + "...\"" : ""),
            }, settings);
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
    saveUrls(msg.urls || []).then((clean) => sendResponse({ ok: true, count: clean.length }));
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
    getSettings().then((settings) => runUrlValidation(msg.url, settings).then(sendResponse));
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
    autoValidateQueue = [];
    autoValidateBusy = false;
    clearSessionDomainStats()
      .then(() => saveUrls([]))
      .then(() => sendResponse({ ok: true, count: 0 }));
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

  if (msg.type === "LOOKUP_DORK") {
    lookupDorkCapture(msg.query).then(sendResponse);
    return true;
  }

  if (msg.type === "WARN_DORK_CAPTURED") {
    lookupDorkCapture(msg.query).then((info) => {
      if (!info.captured) {
        sendResponse({ warned: false });
        return;
      }
      getSettings().then((settings) => {
        if (settings.notifications) {
          chrome.notifications.create("dork-captured", {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Dork File Collector",
            message: info.urlCount + " URLs already saved for this dork query.",
            priority: 1,
          });
          setTimeout(() => chrome.notifications.clear("dork-captured"), 5000);
        }
        sendResponse({ warned: true, ...info });
      });
    });
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
    captchaStatus = {
      active: msg.status === "detected",
      url: msg.url || null,
      time: Date.now(),
    };
    chrome.action.setBadgeBackgroundColor({ color: captchaStatus.active ? "#d93025" : "#2563eb" });
    if (captchaStatus.active) {
      chrome.storage.local.set({ [CAPTCHA_ALERT_KEY]: captchaStatus });
      pushActivity("captcha", "CAPTCHA detected — auto-next paused");
      broadcastRuntimeMessage({ type: "CAPTCHA_DETECTED", ...captchaStatus });
      getSettings().then((settings) => {
        showExtensionNotification("dork-captcha", {
          title: chrome.i18n.getMessage("notifCaptcha") || "CAPTCHA Detected",
          message: chrome.i18n.getMessage("notifCaptchaMsg") || "Auto-next paused. Solve the CAPTCHA to continue.",
          priority: 2,
          requireInteraction: true,
        }, settings);
      });
    } else {
      chrome.storage.local.remove(CAPTCHA_ALERT_KEY);
      chrome.notifications.clear("dork-captcha");
      pushActivity("captcha", "CAPTCHA cleared — resume countdown");
      broadcastRuntimeMessage({ type: "CAPTCHA_RESOLVED" });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "CAPTCHA_COUNTDOWN") {
    if (msg.done) {
      chrome.storage.local.remove(CAPTCHA_COUNTDOWN_KEY);
    } else {
      chrome.storage.local.set({
        [CAPTCHA_COUNTDOWN_KEY]: {
          secondsLeft: msg.secondsLeft || 0,
          time: Date.now(),
        },
      });
    }
    broadcastRuntimeMessage({
      type: "CAPTCHA_COUNTDOWN",
      secondsLeft: msg.secondsLeft || 0,
      done: !!msg.done,
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "GET_CAPTCHA_COUNTDOWN") {
    chrome.storage.local.get(CAPTCHA_COUNTDOWN_KEY, (res) => {
      sendResponse(res[CAPTCHA_COUNTDOWN_KEY] || null);
    });
    return true;
  }

  if (msg.type === "GET_CAPTCHA_STATUS") {
    sendResponse(captchaStatus);
    return false;
  }

  // --- Auto-next ---
  if (msg.type === "AUTO_NEXT_STATUS") {
    autoNextStatus = { status: msg.status, page: msg.page || 0, next: msg.next || 0, message: msg.message || "", time: Date.now() };

    if (msg.status === "done" || msg.status === "end") {
      const alertPayload = {
        status: msg.status,
        page: msg.page || 0,
        message: msg.message || "Auto-next stopped",
        time: Date.now(),
      };

      getBulkState().then((bulk) => {
        const bulkHasMore = bulk && bulk.active && bulk.index + 1 < bulk.queries.length;

        if (bulkHasMore) {
          pushActivity("bulk", "Dork " + (bulk.index + 1) + "/" + bulk.queries.length + " finished");
          handleBulkOnAutoNextComplete(msg);
          return;
        }

        chrome.storage.local.set({ [AUTO_NEXT_ALERT_KEY]: alertPayload });
        broadcastRuntimeMessage({ type: "AUTO_NEXT_DONE", ...alertPayload });

        pushActivity(msg.status === "end" ? "end" : "done", alertPayload.message, alertPayload.page);

        Promise.all([getUrls(), getSettings()]).then(([urls, settings]) => {
          showExtensionNotification("dork-done", {
            title: chrome.i18n.getMessage("notifDone") || "Dork File Collector \u2014 Done",
            message: alertPayload.message + ". " + urls.length + " URLs total.",
            priority: 2,
          }, settings);
          setTimeout(() => chrome.notifications.clear("dork-done"), 8000);
        });

        if (bulk && bulk.active) {
          handleBulkOnAutoNextComplete(msg);
        }
      });
    } else if (msg.status === "stuck") {
      pushActivity("stuck", msg.message || "Auto-next stuck", msg.page || 0);
      getBulkState().then((bulk) => {
        if (bulk && bulk.active) {
          stopBulkDork(false, "Bulk stopped: " + (msg.message || "auto-next stuck"));
        }
      });
    } else if (msg.status === "navigating") {
      pushActivity("nav", "Next page " + (msg.next || "?"), msg.page || 0);
    }

    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "GET_AUTO_NEXT_STATUS") {
    sendResponse(autoNextStatus);
    return false;
  }

  if (msg.type === "GET_NOTIF_HINT") {
    chrome.storage.local.get(NOTIF_HINT_KEY, (res) => {
      sendResponse(res[NOTIF_HINT_KEY] || null);
    });
    return true;
  }

  if (msg.type === "LOG_ACTIVITY") {
    pushActivity(msg.activityType || msg.type || "info", msg.message || "", msg.page)
      .then((log) => sendResponse({ ok: true, log }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "GET_ACTIVITY_LOG") {
    chrome.storage.local.get(ACTIVITY_LOG_KEY, (res) => {
      sendResponse(res[ACTIVITY_LOG_KEY] || []);
    });
    return true;
  }

  if (msg.type === "CLEAR_ACTIVITY_LOG") {
    chrome.storage.local.remove(ACTIVITY_LOG_KEY, () => {
      broadcastRuntimeMessage({ type: "ACTIVITY_LOG_UPDATED", log: [] });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_SESSION_STATS") {
    chrome.storage.local.get(SESSION_STATS_KEY, (res) => {
      sendResponse(res[SESSION_STATS_KEY] || { domains: {} });
    });
    return true;
  }

  if (msg.type === "CLEAR_SESSION_STATS") {
    chrome.storage.local.remove(SESSION_STATS_KEY, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "START_BULK_DORK") {
    startBulkDorkQueue(msg.tabId, msg.text, msg.providerId).then(sendResponse);
    return true;
  }

  if (msg.type === "STOP_BULK_DORK") {
    stopBulkDork(false, msg.message || "Bulk dork stopped by user").then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_BULK_DORK_STATUS") {
    getBulkState().then((bulk) => sendResponse(bulk || { active: false }));
    return true;
  }

});
