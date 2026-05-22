// background.js — Dork File Collector v3.0.1 (dofiltor)

const STORAGE_KEY = "dofiltor_urls";
const SETTINGS_KEY = "dofiltor_settings";
const HISTORY_KEY = "dofiltor_history";
const CSV_COLUMNS = ["url", "file_type", "query", "source_page", "discovered_at", "size"];
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
  enabled: true,
  fileTypes: DEFAULT_FILE_TYPES,
  providers: DEFAULT_PROVIDERS,
};

let captchaStatus = { active: false, url: null };
let autoNextStatus = { status: "idle", page: 0, message: "" };
let batchStatus = { active: false, total: 0, done: 0, message: "" };
let autoValidateQueue = [];
let autoValidateBusy = false;

function getUrls() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

function saveUrls(urls) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: urls }, resolve);
  });
}

function addUrls(incoming) {
  return getUrls().then((existing) => {
    const seen = new Set(existing.map((r) => r.url));
    const newItems = incoming.filter((r) => !seen.has(r.url));
    if (newItems.length === 0) {
      return { added: 0, total: existing.length, new_urls: [] };
    }
    const merged = existing.concat(newItems);
    return saveUrls(merged).then(() => ({
      added: newItems.length,
      total: merged.length,
      new_urls: newItems.map((r) => r.url),
    }));
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
  if (format === "domain-json") {
    const grouped = {};
    for (const item of filtered) {
      let host = "unknown";
      try { host = new URL(item.url).hostname; } catch (e) { /* keep unknown */ }
      if (!grouped[host]) grouped[host] = [];
      grouped[host].push(item);
    }
    return JSON.stringify(grouped, null, 2);
  }
  return toCSV(filtered);
}

// --- URL check with size ---

function checkUrl(url) {
  return fetch(url, { method: "HEAD", mode: "no-cors", redirect: "follow" })
    .then((resp) => {
      const size = resp.headers.get("content-length");
      return { ok: true, size: size ? parseInt(size) : null };
    })
    .catch(() => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      return fetch(url, { method: "GET", mode: "no-cors", signal: controller.signal })
        .then(() => { clearTimeout(timeout); return { ok: true, size: null }; })
        .catch(() => { clearTimeout(timeout); return { ok: false, size: null }; });
    });
}

function autoCheckUrl(url) {
  checkUrl(url).then((result) => {
    getUrls().then((urls) => {
      const item = urls.find((u) => u.url === url);
      if (item) {
        item.status = result.ok ? "ok" : "fail";
        if (result.size) item.size = result.size;
        saveUrls(urls);
      }
    });
  });
}

function processAutoValidateQueue() {
  if (autoValidateBusy || autoValidateQueue.length === 0) return;
  autoValidateBusy = true;

  getSettings().then((settings) => {
    const nextUrl = autoValidateQueue.shift();
    checkUrl(nextUrl).then((result) => {
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
    if (!settings.autoValidate) return;
    if (!autoValidateQueue.includes(url)) autoValidateQueue.push(url);
    processAutoValidateQueue();
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

function addHistoryEntry(query, urlCount) {
  return getHistory().then((history) => {
    const existing = history.find((h) => h.query === query);
    if (existing) {
      existing.pages = (existing.pages || 0) + 1;
      existing.urls += urlCount;
      existing.lastScan = new Date().toISOString();
    } else {
      history.push({
        query: query,
        urls: urlCount,
        pages: 1,
        lastScan: new Date().toISOString(),
      });
    }
    return saveHistory(history);
  });
}

// --- Settings ---

function getSettings() {
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
        }

        // Update scan history
        if (query) {
          addHistoryEntry(query, result.added);
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
    checkUrl(msg.url).then(sendResponse);
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
    chrome.storage.local.set({ [SETTINGS_KEY]: msg.settings }, () => {
      sendResponse({ ok: true });
    });
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
