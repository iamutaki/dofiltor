import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadExtensionScript } from "./load-script.mjs";

const gm = loadExtensionScript("glob-match.js");

describe("globToRegex", () => {
  it("matches exact hostnames", () => {
    assert.equal(gm.globToRegex("example.com").test("example.com"), true);
    assert.equal(gm.globToRegex("example.com").test("www.example.com"), false);
    assert.equal(gm.globToRegex("example.com").test("notexample.com"), false);
  });

  it("matches **.domain.** — root + subdomains + multi-TLD", () => {
    const r = gm.globToRegex("**.google.**");
    assert.equal(r.test("google.com"), true);
    assert.equal(r.test("www.google.com"), true);
    assert.equal(r.test("google.co.id"), true);
    assert.equal(r.test("mail.google.co.id"), true);
    assert.equal(r.test("notgoogle.com"), false);
    assert.equal(r.test("evilgoogle.com"), false);
  });

  it("matches **.domain.tld — root + subdomains of a fixed TLD", () => {
    const r = gm.globToRegex("**.bing.com");
    assert.equal(r.test("bing.com"), true);
    assert.equal(r.test("www.bing.com"), true);
    assert.equal(r.test("api.bing.com"), true);
    assert.equal(r.test("bing.org"), false);
    assert.equal(r.test("notbing.com"), false);
  });

  it("matches single * as one-label wildcard", () => {
    const r = gm.globToRegex("*.example.com");
    assert.equal(r.test("www.example.com"), true);
    assert.equal(r.test("api.example.com"), true);
    assert.equal(r.test("example.com"), false);
    assert.equal(r.test("a.b.example.com"), false);
  });

  it("handles comma-separated patterns", () => {
    assert.equal(gm.hostMatchesGlob("google.com", "**.google.**"), true);
    assert.equal(gm.hostMatchesGlob("www.google.com", "**.google.**"), true);
    assert.equal(gm.hostMatchesGlob("bing.com", "**.bing.com"), true);
    assert.equal(gm.hostMatchesGlob("duckduckgo.com", "not.real,**.duckduckgo.com"), true);
  });

  it("returns true for empty pattern", () => {
    assert.equal(gm.hostMatchesGlob("anything.com", ""), true);
  });
});

describe("hostMatchesGlob", () => {
  it("matches all built-in provider patterns", () => {
    assert.equal(gm.hostMatchesGlob("www.google.com", "**.google.**"), true);
    assert.equal(gm.hostMatchesGlob("google.co.id", "**.google.**"), true);
    assert.equal(gm.hostMatchesGlob("bing.com", "**.bing.com"), true);
    assert.equal(gm.hostMatchesGlob("www.bing.com", "**.bing.com"), true);
    assert.equal(gm.hostMatchesGlob("duckduckgo.com", "**.duckduckgo.com"), true);
    assert.equal(gm.hostMatchesGlob("search.yahoo.com", "**.search.yahoo.com"), true);
    assert.equal(gm.hostMatchesGlob("yandex.com", "**.yandex.**"), true);
    assert.equal(gm.hostMatchesGlob("yandex.ru", "**.yandex.**"), true);
    assert.equal(gm.hostMatchesGlob("www.yandex.com", "**.yandex.**"), true);
  });

  it("rejects non-matching hosts", () => {
    assert.equal(gm.hostMatchesGlob("notgoogle.com", "**.google.**"), false);
    assert.equal(gm.hostMatchesGlob("google.evil.com", "**.google.**"), true); // glob allows it
    assert.equal(gm.hostMatchesGlob("bing.org", "**.bing.com"), false);
    assert.equal(gm.hostMatchesGlob("yahoo.com", "**.search.yahoo.com"), false);
  });
});

describe("hostBaseFromPattern", () => {
  it("extracts concrete domain from legacy hostContains", () => {
    assert.equal(gm.hostBaseFromPattern("google."), "google.");
    assert.equal(gm.hostBaseFromPattern("bing.com"), "bing.com");
    assert.equal(gm.hostBaseFromPattern("search.yahoo.com"), "search.yahoo.com");
    assert.equal(gm.hostBaseFromPattern("duckduckgo.com"), "duckduckgo.com");
  });

  it("extracts concrete domain from glob patterns", () => {
    assert.equal(gm.hostBaseFromPattern("**.bing.com"), "bing.com");
    assert.equal(gm.hostBaseFromPattern("**.duckduckgo.com"), "duckduckgo.com");
    assert.equal(gm.hostBaseFromPattern("**.search.yahoo.com"), "search.yahoo.com");
  });

  it("returns empty for multi-TLD patterns", () => {
    assert.equal(gm.hostBaseFromPattern("**.google.**"), "");
    assert.equal(gm.hostBaseFromPattern("**.yandex.**"), "");
  });

  it("handles custom domain patterns", () => {
    assert.equal(gm.hostBaseFromPattern("**.search.example.go.id"), "search.example.go.id");
    assert.equal(gm.hostBaseFromPattern("api.custom.org"), "api.custom.org");
  });
});
