/**
 * glob-match.js — Glob pattern matching for Dofiltor hostnames.
 *
 * Shared by background.js, content.js, and ui-panel.js.
 * Loaded via importScripts, content_scripts manifest, or <script> tag.
 *
 * Syntax (hostPattern field):
 *   ** matches any characters including dots (zero or more DNS labels)
 *   *  matches any characters except dot (single DNS label)
 *   ,  separates alternative patterns (OR)
 *   Everything else is literal.
 *
 * Examples:
 *   **.google.**           → google.com, www.google.com, google.co.id
 *   **.bing.com            → bing.com, www.bing.com
 *   **.yandex.**           → yandex.com, yandex.ru, www.yandex.com
 *   **.search.yahoo.com    → search.yahoo.com
 */

"use strict";

/* istanbul ignore next -- loaded via importScripts / <script>, not a module */
if (typeof globalThis !== "undefined") {
  globalThis.globToRegex = globToRegex;
  globalThis.hostMatchesGlob = hostMatchesGlob;
  globalThis.hostBaseFromPattern = hostBaseFromPattern;
}

/**
 * Convert a single glob segment to regex.
 * * within a segment matches any character except dot.
 */
function _globSegToRegex(seg) {
  let r = "";
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === "*") r += "[^.]*";
    else if (".+^${}()|[]\\".includes(ch)) r += "\\" + ch;
    else r += ch;
  }
  return r;
}

/**
 * Convert a glob pattern to a RegExp.
 *
 * The pattern is split by '.' into segments.
 *   ** at start  → zero or more subdomain labels (www., api., …)
 *   ** at end    → one or more TLD labels (com, co.id, …)
 *   ** in middle → zero or more intermediate labels
 *   *  in segment → any single-label wildcard
 */
function globToRegex(pattern) {
  const segs = pattern.split(".");
  let r = "";

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];

    if (seg === "**") {
      if (i === 0) {
        // leading **.  → optionally match subdomain labels
        r += "(?:[a-z0-9-]+\\.)*";
      } else if (i === segs.length - 1) {
        // trailing .** → match TLD(s) (at least one label)
        r += "[a-z0-9-.]+";
      } else {
        // middle ** → zero or more intermediate labels
        r += "(?:[a-z0-9-]+\\.)*";
      }
    } else {
      r += _globSegToRegex(seg);
      // dot separator before next segment (unless next is ** at start/middle
      // which already handles its own dot boundary, or this is the last)
      if (i < segs.length - 1) r += "\\.";
    }
  }

  return new RegExp("^" + r + "$", "i");
}

/**
 * Test whether a hostname matches a comma-separated glob pattern.
 *
 * @param {string} hostname  e.g. "www.google.com"
 * @param {string} pattern   e.g. "**.google.**"
 * @returns {boolean}
 */
function hostMatchesGlob(hostname, pattern) {
  if (!pattern) return true;
  const host = hostname.toLowerCase();
  return pattern
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean)
    .some(function (p) { return globToRegex(p).test(host); });
}

/**
 * Extract a concrete base domain from a glob pattern.
 * Used by background.js to generate Chrome match patterns for dynamic
 * content-script registration.
 *
 * Returns empty string when no concrete domain can be extracted
 * (e.g. multi-TLD patterns like **.google.**).
 *
 * @param {string} pattern  hostPattern or hostContains value
 * @returns {string} e.g. "search.yahoo.com" or ""
 */
function hostBaseFromPattern(pattern) {
  if (!pattern) return "";
  // Take first alternative
  var p = pattern.split(",")[0].trim().toLowerCase();

  // If it looks like a legacy hostContains (no wildcards), extract directly
  if (!p.includes("*")) {
    var base = p.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/[^a-z0-9.-]/g, "");
    return base && base.includes(".") ? base : "";
  }

  // From glob: find longest run of consecutive non-wildcard segments
  var segments = p.split(".");
  var best = "";
  var current = "";

  for (var i = 0; i < segments.length; i++) {
    if (segments[i].includes("*")) {
      if (current.length > best.length) best = current;
      current = "";
    } else {
      current += (current ? "." : "") + segments[i];
    }
  }
  if (current.length > best.length) best = current;

  if (!best || !best.includes(".")) return "";
  return best.replace(/[^a-z0-9.-]/g, "").replace(/^\.+|\.+$/g, "");
}
