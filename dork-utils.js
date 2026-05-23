/**
 * Dork query normalization and capture lookup (shared by background, popup, content).
 */

function normalizeDorkQuery(query) {
  return String(query || "").trim().replace(/\s+/g, " ");
}

function dorkQueriesMatch(a, b) {
  const left = normalizeDorkQuery(a).toLowerCase();
  const right = normalizeDorkQuery(b).toLowerCase();
  return !!left && left === right;
}

/** Pure lookup from in-memory history + URL rows (testable without chrome.storage). */
function lookupDorkCaptureFromData(query, history, urls) {
  const normalized = normalizeDorkQuery(query);
  if (!normalized) {
    return { captured: false, query: "", urlCount: 0, pages: 0, lastScan: null, provider: null };
  }
  const hist = (history || []).find((h) => dorkQueriesMatch(h.query, normalized));
  const urlCount = (urls || []).filter((u) => dorkQueriesMatch(u.query, normalized)).length;
  const captured = !!(hist || urlCount > 0);
  return {
    captured,
    query: normalized,
    urlCount: Math.max(urlCount, hist?.urls || 0),
    pages: hist?.pages || 0,
    lastScan: hist?.lastScan || null,
    provider: hist?.provider || null,
  };
}
