/**
 * Activity log ring buffer (storage shape + helpers).
 */

const ACTIVITY_LOG_MAX = 80;

function appendActivityEntry(log, entry) {
  const list = Array.isArray(log) ? log.slice() : [];
  list.unshift({
    time: entry.time || new Date().toISOString(),
    type: entry.type || "info",
    message: String(entry.message || ""),
    page: entry.page != null ? entry.page : null,
  });
  return list.slice(0, ACTIVITY_LOG_MAX);
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

function mergeSessionDomainCounts(counts, urls) {
  const next = { ...(counts || {}) };
  for (const raw of Array.isArray(urls) ? urls : []) {
    let host = "";
    try {
      host = new URL(raw).hostname;
    } catch (e) {
      continue;
    }
    if (!host) continue;
    next[host] = (next[host] || 0) + 1;
  }
  return next;
}

function topSessionDomains(counts, limit) {
  return Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit || 8);
}
