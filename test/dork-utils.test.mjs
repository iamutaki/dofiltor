import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadExtensionScript } from "./load-script.mjs";

const dork = loadExtensionScript("dork-utils.js");

describe("normalizeDorkQuery", () => {
  it("trims and collapses whitespace", () => {
    assert.equal(dork.normalizeDorkQuery("  filetype:pdf   site:edu  "), "filetype:pdf site:edu");
  });

  it("empty input becomes empty string", () => {
    assert.equal(dork.normalizeDorkQuery(""), "");
    assert.equal(dork.normalizeDorkQuery(null), "");
  });
});

describe("dorkQueriesMatch", () => {
  it("matches case-insensitively after normalization", () => {
    assert.equal(dork.dorkQueriesMatch("  Filetype:PDF ", "filetype:pdf"), true);
  });

  it("rejects empty queries", () => {
    assert.equal(dork.dorkQueriesMatch("", "filetype:pdf"), false);
  });
});

describe("lookupDorkCaptureFromData", () => {
  const history = [
    { query: "filetype:pdf site:edu", urls: 12, pages: 2, lastScan: "2026-01-01T00:00:00Z", provider: "google" },
  ];
  const urls = [
    { url: "https://a.edu/a.pdf", query: "filetype:pdf site:edu" },
    { url: "https://b.edu/b.pdf", query: "FILETYPE:PDF   SITE:EDU" },
  ];

  it("returns not captured for empty query", () => {
    const r = dork.lookupDorkCaptureFromData("  ", [], []);
    assert.equal(r.captured, false);
    assert.equal(r.query, "");
  });

  it("finds capture from history and URL rows", () => {
    const r = dork.lookupDorkCaptureFromData("filetype:pdf site:edu", history, urls);
    assert.equal(r.captured, true);
    assert.equal(r.urlCount, 12);
    assert.equal(r.pages, 2);
    assert.equal(r.provider, "google");
  });

  it("detects capture from URLs when history missing", () => {
    const r = dork.lookupDorkCaptureFromData("filetype:pdf site:edu", [], urls);
    assert.equal(r.captured, true);
    assert.equal(r.urlCount, 2);
  });

  it("uses hist.urls when higher than live URL count", () => {
    const r = dork.lookupDorkCaptureFromData("filetype:pdf site:edu", history, []);
    assert.equal(r.captured, true);
    assert.equal(r.urlCount, 12);
  });
});
