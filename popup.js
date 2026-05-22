// popup.js — Dork File Collector v3.2.0 (dofiltor)

const STORAGE_KEY = "dofiltor_urls";
const SETTINGS_KEY = "dofiltor_settings";
const DEFAULT_SETTINGS = {
  autoNext: false,
  maxPages: 50,
  pageDelay: 3000,
  autoValidate: true,
  validateDelay: 1500,
  notifications: true,
  fileTypes: [
    "pdf", "xls", "xlsx", "doc", "docx", "txt", "csv",
    "ppt", "pptx", "odt", "ods", "rtf",
  ],
  providers: [
    { id: "google", name: "Google", enabled: true, hostContains: "google.", pathContains: "/search", queryParam: "q", nextSelector: "#pnnext" },
    { id: "bing", name: "Bing", enabled: true, hostContains: "bing.com", pathContains: "/search", queryParam: "q", nextSelector: "a.sb_pagN" },
    { id: "duckduckgo", name: "DuckDuckGo", enabled: true, hostContains: "duckduckgo.com", pathContains: "/", queryParam: "q", nextSelector: "a[rel='next']" },
    { id: "yahoo", name: "Yahoo", enabled: false, hostContains: "search.yahoo.com", pathContains: "/search", queryParam: "p", nextSelector: "a.next" },
    { id: "yandex", name: "Yandex", enabled: false, hostContains: "yandex.", pathContains: "/search", queryParam: "text", nextSelector: "a[aria-label='Next page']" },
  ],
};

let allUrls = [];
let currentFilter = "all";
let activeDomains = new Set();
let searchQuery = "";
let validating = false;
let autoNextEnabled = false;
let settings = { ...DEFAULT_SETTINGS };
let sortKey = localStorage.getItem("dofiltor_sort_key") || "date";
let sortDir = localStorage.getItem("dofiltor_sort_dir") || "desc";
let exportFormat = localStorage.getItem("dofiltor_export_format") || "csv";
let selectedIndex = -1;
let lastViewItems = [];
let renderQueued = false;
let undoTimer = null;

const ROW_HEIGHT = 49;
const CSV_COLUMNS = ["url", "file_type", "query", "source_page", "discovered_at", "size"];
const SVG = {
  moon: '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>',
  sun: '<path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79 1.8-1.41-1.41-1.79 1.8z"/>',
  auto: '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>',
};

function $(id) { return document.getElementById(id); }
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
function sendMessage(msg) {
  return new Promise((resolve) => {
    if (!hasChromeRuntime()) { resolve(null); return; }
    chrome.runtime.sendMessage(msg, (resp) => resolve(chrome.runtime.lastError ? null : resp));
  });
}

function loadTheme() { return localStorage.getItem("dofiltor_theme") || "auto"; }
function saveTheme(t) { localStorage.setItem("dofiltor_theme", t); }
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  $("themeIcon").innerHTML = SVG[t === "light" ? "sun" : t === "dark" ? "moon" : "auto"];
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
    r(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
  }));
}
function saveUrls(urls) {
  if (!hasChromeStorage()) return Promise.resolve();
  return new Promise((r) => chrome.storage.local.set({ [STORAGE_KEY]: Array.isArray(urls) ? urls : [] }, r));
}
function loadSettings() {
  if (!hasChromeStorage()) return Promise.resolve({ ...DEFAULT_SETTINGS });
  return new Promise((r) => chrome.storage.local.get(SETTINGS_KEY, (res) => {
    const stored = res[SETTINGS_KEY] || {};
    r({
      ...DEFAULT_SETTINGS,
      ...stored,
      fileTypes: Array.isArray(stored.fileTypes) && stored.fileTypes.length ? stored.fileTypes : DEFAULT_SETTINGS.fileTypes,
      providers: Array.isArray(stored.providers) && stored.providers.length ? stored.providers : DEFAULT_SETTINGS.providers,
    });
  }));
}
function saveSettings(next) {
  settings = { ...DEFAULT_SETTINGS, ...next };
  if (!hasChromeStorage()) return Promise.resolve();
  return new Promise((r) => chrome.storage.local.set({ [SETTINGS_KEY]: settings }, r));
}

function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ""; } }
function nameOf(u) { try { return decodeURIComponent(new URL(u).pathname.split("/").pop() || ""); } catch (e) { return u; } }
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function setStatus(text) { $("fLeft").textContent = text; }

function updateStats() {
  const n = allUrls.length;
  const checked = allUrls.filter((u) => u.status);
  const ok = checked.filter((u) => u.status === "ok").length;
  const fail = checked.filter((u) => u.status === "fail").length;
  const types = new Set(allUrls.map((u) => u.file_type)).size;
  const downloaded = allUrls.filter((u) => u.downloaded).length;

  $("sTotal").textContent = n;
  $("sOk").textContent = checked.length ? ok : "\u2014";
  $("sFail").textContent = checked.length ? fail : "\u2014";
  $("sTypes").textContent = types;
  $("btnRemoveDead").style.display = fail > 0 ? "flex" : "none";
  $("fRight").textContent = n + " URLs" + (downloaded ? " \u00B7 " + downloaded + " downloaded" : "");

  const batchable = allUrls.filter((u) => u.status === "ok" && !u.downloaded).length;
  $("batchBadge").textContent = batchable;
  $("batchBadge").style.display = batchable > 0 ? "block" : "none";

  if (!validating) $("hSub").textContent = n ? n + " URLs \u00B7 " + types + " types" : "Dork File Collector";
}

function matchSearch(item) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return nameOf(item.url).toLowerCase().includes(q) ||
    hostOf(item.url).toLowerCase().includes(q) ||
    item.url.toLowerCase().includes(q);
}

function getDomains() {
  const map = {};
  for (const u of allUrls) {
    const h = hostOf(u.url);
    if (h) map[h] = (map[h] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
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
  if (searchQuery) list = list.filter(matchSearch);
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
    else if (sortKey === "status") { av = a.status || "pending"; bv = b.status || "pending"; }
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
    return;
  }

  lastViewItems = getSortedFiltered();
  emp.style.display = "none";
  box.style.display = "block";
  box.textContent = "";
  box.setAttribute("aria-label", "Collected URLs");

  if (!lastViewItems.length) {
    const m = document.createElement("div");
    m.className = "empty-list";
    m.textContent = "No matching URLs";
    box.appendChild(m);
    return;
  }

  if (selectedIndex >= lastViewItems.length) selectedIndex = lastViewItems.length - 1;

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
  const row = document.createElement("div");
  row.className = "row status-" + status + (item.downloaded ? " dl" : "") + (viewIndex === selectedIndex ? " selected" : "");
  row.style.transform = "translateY(" + (viewIndex * ROW_HEIGHT) + "px)";
  row.tabIndex = 0;
  row.setAttribute("role", "listitem");
  row.setAttribute("aria-selected", viewIndex === selectedIndex ? "true" : "false");
  row.addEventListener("click", () => { selectedIndex = viewIndex; renderList(); });

  const dot = document.createElement("div");
  dot.className = "dot dot-" + status;
  dot.title = status;
  row.appendChild(dot);

  const fi = document.createElement("div");
  fi.className = "ficon";
  fi.textContent = item.file_type || "?";
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
  statusChip.textContent = status === "ok" ? "valid" : status === "fail" ? "dead" : "pending";
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
    dlTag.textContent = "downloaded";
    mt.appendChild(dlTag);
  }
  info.appendChild(mt);
  row.appendChild(info);

  const acts = document.createElement("div");
  acts.className = "racts";
  const mkBtn = (svg, title, cls, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ib" + (cls ? " " + cls : "");
    b.innerHTML = svg;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  acts.appendChild(mkBtn('<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>', "Open", "", () => window.open(item.url, "_blank")));
  acts.appendChild(mkBtn('<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>', "Download", "", async () => {
    await sendMessage({ type: "DOWNLOAD", url: item.url });
    item.downloaded = true;
    await saveUrls(allUrls);
    refresh();
  }));
  acts.appendChild(mkBtn('<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>', "Remove", "danger", async () => {
    const removed = allUrls.splice(idx, 1);
    await saveUrls(allUrls);
    showUndo("Removed 1 URL", async () => {
      allUrls.splice(idx, 0, removed[0]);
      await saveUrls(allUrls);
      refresh();
    });
    refresh();
  }));
  row.appendChild(acts);
  return row;
}

function refresh() {
  if (!Array.isArray(allUrls)) allUrls = [];
  updateStats();
  renderFilters();
  renderDomainBar();
  renderSortUI();
  renderList();
}

async function startValidate() {
  if (validating) return;
  validating = true;
  const btn = $("btnValidate");
  btn.style.color = "var(--c-green)";
  const bar = $("prog");
  const fill = $("progBar");
  bar.classList.add("on");
  const todo = getSortedFiltered().filter((u) => !u.status);
  let done = 0;

  for (const item of todo) {
    fill.style.width = (todo.length ? done / todo.length * 100 : 100) + "%";
    $("hSub").textContent = "Checking " + (done + 1) + "/" + todo.length + "...";
    setStatus("Validating...");

    const r = await sendMessage({ type: "CHECK_URL", url: item.url }) || { ok: false, size: null };
    item.status = r.ok ? "ok" : "fail";
    if (r.size) item.size = r.size;
    done++;
    if (done % 10 === 0) { await saveUrls(allUrls); refresh(); }
    await new Promise((rDelay) => setTimeout(rDelay, Math.max(0, Number(settings.validateDelay) || 0)));
  }

  await saveUrls(allUrls);
  fill.style.width = "100%";
  setTimeout(() => { bar.classList.remove("on"); fill.style.width = "0%"; }, 400);
  btn.style.color = "";
  validating = false;
  setStatus(allUrls.filter((u) => u.status === "ok").length + " valid, " + allUrls.filter((u) => u.status === "fail").length + " dead");
  refresh();
}

function escapeCSV(val) {
  const s = String(val || "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function makeExport(items, format) {
  if (format === "txt") return items.map((u) => u.url).join("\n");
  if (format === "json") return JSON.stringify(items, null, 2);
  if (format === "domain-json") {
    const grouped = {};
    for (const item of items) {
      const host = hostOf(item.url) || "unknown";
      if (!grouped[host]) grouped[host] = [];
      grouped[host].push(item);
    }
    return JSON.stringify(grouped, null, 2);
  }
  return CSV_COLUMNS.map(escapeCSV).join(",") + "\n" + items.map((u) => CSV_COLUMNS.map((c) => escapeCSV(u[c])).join(",")).join("\n");
}
function exportCurrent() {
  const items = getSortedFiltered();
  if (!items.length) return;
  const text = makeExport(items, exportFormat);
  const ext = exportFormat === "txt" ? "txt" : exportFormat.includes("json") ? "json" : "csv";
  const mime = ext === "json" ? "application/json" : ext === "txt" ? "text/plain" : "text/csv";
  const b = new Blob([text], { type: mime + ";charset=utf-8" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u;
  a.download = "dork-out" + (currentFilter !== "all" ? "-" + currentFilter : "") + "." + ext;
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
  await saveUrls(allUrls);
  showUndo("Removed " + (previous.length - allUrls.length) + " dead", async () => {
    allUrls = previous;
    await saveUrls(allUrls);
    refresh();
  });
  refresh();
}
async function clearAll() {
  if (!allUrls.length) return;
  const previous = allUrls.slice();
  allUrls = [];
  await saveUrls(allUrls);
  showUndo("Cleared " + previous.length + " URLs", async () => {
    allUrls = previous;
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
    if (!history || !history.length) { setStatus("No scan history yet"); return; }
    const box = $("urlList");
    $("empty").style.display = "none";
    box.style.display = "block";
    box.textContent = "";
    const header = document.createElement("div");
    header.className = "history-head";
    header.innerHTML = "<span>Scan History (" + history.length + ")</span>";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => sendMessage({ type: "CLEAR_HISTORY" }).then(() => { setStatus("History cleared"); refresh(); }));
    header.appendChild(clearBtn);
    box.appendChild(header);

    for (const h of history) {
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
      nm.textContent = h.query.length > 50 ? h.query.substring(0, 50) + "..." : h.query;
      nm.title = h.query;
      info.appendChild(nm);
      const mt = document.createElement("div");
      mt.className = "rmeta";
      mt.textContent = h.urls + " URLs \u00B7 " + h.pages + " pages \u00B7 " + (h.lastScan ? new Date(h.lastScan).toLocaleString() : "unknown");
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
  icon.innerHTML = sortDir === "asc"
    ? '<path d="M7 14l5-5 5 5H7z"/>'
    : '<path d="M7 10l5 5 5-5H7z"/>';
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
function toggleSettingsPanel() {
  openExtensionPage("options.html");
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
  });
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
  } else if (!enabled && status && (status.status === "done" || status.status === "end")) {
    $("autoStatus").textContent = status.message || "Stopped";
  } else {
    $("autoStatus").textContent = "";
  }
}
async function toggleAutoNext() {
  await syncSettings();
  autoNextEnabled = !autoNextEnabled;
  await saveSettings({ ...settings, autoNext: autoNextEnabled });
  updateAutoNextUI(autoNextEnabled, null);
  updateAutoNextStatus();
}
async function updateAutoNextStatus() {
  const status = await sendMessage({ type: "GET_AUTO_NEXT_STATUS" });
  if (!status) return;
  if ((status.status === "done" || status.status === "end") && autoNextEnabled) {
    autoNextEnabled = false;
    await saveSettings({ ...settings, autoNext: false });
    setStatus(status.message || "Done");
  }
  updateAutoNextUI(autoNextEnabled, status);
}
async function updateCaptchaBanner() {
  const status = await sendMessage({ type: "GET_CAPTCHA_STATUS" });
  if (status) $("captchaBanner").classList.toggle("show", !!status.active);
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

document.addEventListener("DOMContentLoaded", () => {
  $("themeToggle").addEventListener("click", cycleTheme);
  $("btnValidate").addEventListener("click", startValidate);
  $("btnExport").addEventListener("click", exportCurrent);
  $("btnCopy").addEventListener("click", copyUrls);
  $("btnBatchDl").addEventListener("click", batchDownload);
  $("btnHistory").addEventListener("click", showHistory);
  $("btnRemoveDead").addEventListener("click", removeDead);
  $("btnClear").addEventListener("click", clearAll);
  $("btnSettings").addEventListener("click", toggleSettingsPanel);
  $("btnAbout").addEventListener("click", () => openExtensionPage("options.html#about"));
  $("sortKey").addEventListener("change", syncSort);
  $("sortDirBtn").addEventListener("click", toggleSortDir);
  $("exportFormat").addEventListener("change", () => {
    exportFormat = $("exportFormat").value;
    localStorage.setItem("dofiltor_export_format", exportFormat);
  });
  $("pageDelay").addEventListener("change", syncSettings);
  $("validateDelay").addEventListener("change", syncSettings);
  $("autoValidate").addEventListener("change", syncSettings);
  $("notifications").addEventListener("change", syncSettings);
  $("maxPages").addEventListener("change", syncSettings);
  $("autoNextBtn").addEventListener("click", toggleAutoNext);
  $("urlList").addEventListener("scroll", scheduleRenderList);
  document.addEventListener("keydown", onKeyboard);

  $("captchaShow").addEventListener("click", () => {
    if (!hasChromeTabs()) return;
    const patterns = (settings.providers || [])
      .filter((provider) => provider.enabled && provider.hostContains)
      .map((provider) => "*://*" + provider.hostContains.replace(/^\*?\./, "") + "/*");
    chrome.tabs.query({ url: patterns.length ? patterns : ["<all_urls>"] }, (tabs) => {
      if (tabs.length) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    });
  });

  let searchTimer;
  $("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = $("searchInput").value.trim();
      $("searchClear").classList.toggle("show", !!searchQuery);
      selectedIndex = -1;
      $("urlList").scrollTop = 0;
      renderList();
    }, 150);
  });
  $("searchClear").addEventListener("click", () => {
    $("searchInput").value = "";
    searchQuery = "";
    $("searchClear").classList.remove("show");
    renderList();
  });

  applyTheme(loadTheme());
  initTooltip();

  Promise.all([loadUrls(), loadSettings()]).then(([urls, loadedSettings]) => {
    allUrls = urls;
    settings = loadedSettings;
    autoNextEnabled = settings.autoNext;
    $("maxPages").value = settings.maxPages;
    $("pageDelay").value = settings.pageDelay;
    $("validateDelay").value = settings.validateDelay;
    $("autoValidate").checked = !!settings.autoValidate;
    $("notifications").checked = !!settings.notifications;
    updateAutoNextUI(autoNextEnabled, null);
    refresh();
    updateCaptchaBanner();
    updateAutoNextStatus();
    pollBatchStatus();
  }).catch((e) => { console.error("Init error:", e); refresh(); });

  setInterval(async () => {
    updateCaptchaBanner();
    updateAutoNextStatus();
    const urls = await loadUrls();
    if (JSON.stringify(urls) !== JSON.stringify(allUrls)) {
      allUrls = urls;
      refresh();
    }
  }, 2000);
});
