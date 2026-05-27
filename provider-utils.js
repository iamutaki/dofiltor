/**
 * Provider search URL helpers (shared by background bulk-dork and tests).
 */

const PROVIDER_SEARCH_BASE = {
  google: "https://www.google.com/search",
  bing: "https://www.bing.com/search",
  duckduckgo: "https://html.duckduckgo.com/html/",
  yahoo: "https://search.yahoo.com/search",
  yandex: "https://yandex.com/search/",
};

function providerHostBase(hostContains) {
  return hostBaseFromPattern(hostContains);
}

function buildProviderSearchUrl(provider, query) {
  const q = String(query || "").trim();
  if (!q || !provider) return "";
  const id = provider.id || "";
  const base = PROVIDER_SEARCH_BASE[id] || "";
  if (!base) return "";
  try {
    const url = new URL(base);
    const param = String(provider.queryParam || "q").trim() || "q";
    url.searchParams.set(param, q);
    return url.href;
  } catch (e) {
    return "";
  }
}

function parseBulkDorkLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function providerMatchesUrl(provider, url) {
  try {
    const parsed = new URL(String(url || ""));
    const host = parsed.hostname.toLowerCase();
    const pathNeedle = String(provider.pathContains || "").toLowerCase();
    const hostMatch = provider.hostPattern
      ? hostMatchesGlob(host, provider.hostPattern)
      : (function () {
          const hostNeedle = String(provider.hostContains || "").toLowerCase();
          return !hostNeedle || host.includes(hostNeedle);
        })();
    return !!provider.enabled &&
      hostMatch &&
      (!pathNeedle || parsed.pathname.toLowerCase().includes(pathNeedle));
  } catch (e) {
    return false;
  }
}

function findEnabledProviderForUrl(providers, url) {
  return (providers || []).find((p) => providerMatchesUrl(p, url)) || null;
}
