/**
 * Pure helpers for visited / skip logic (testable, no DOM).
 * Loaded before content.js in the extension and in unit tests.
 */

function shouldSkipVisitedUrl(url, options) {
  const opts = options || {};
  if (!url || opts.skipEnabled === false) return false;
  const collected = opts.collected;
  const extensionKnown = opts.extensionKnown;
  if (collected && collected.has(url)) return true;
  if (extensionKnown && extensionKnown.has(url)) return true;
  return false;
}

function mergeUrlIntoSet(set, url) {
  if (!set || !url) return false;
  if (set.has(url)) return false;
  set.add(url);
  return true;
}

function urlsFromStorageItems(items) {
  const out = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const raw = item && item.url;
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      out.add(parsed.href);
    } catch (e) {
      const clean = String(raw).split("#")[0];
      if (clean) out.add(clean);
    }
  }
  return out;
}

function detectCaptchaFromSignals(signals) {
  const s = signals || {};
  if (s.sorryPath || s.sorryUrl) return true;
  if (s.textHit) return true;
  if (s.domHit) return true;
  return false;
}

function captchaTextHit(bodyText) {
  const body = String(bodyText || "").toLowerCase();
  const snippets = [
    "unusual traffic",
    "automated requests",
    "not a robot",
    "verify you're not a robot",
    "verify that you are not a robot",
    "before you continue to google",
    "terlalu banyak permintaan",
    "lalu lintas yang tidak biasa",
    "bukan robot",
    "our systems have detected",
  ];
  return snippets.some((snippet) => body.includes(snippet));
}
