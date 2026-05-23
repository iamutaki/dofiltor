import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadExtensionScript } from "./load-script.mjs";

const ctx = loadExtensionScript("visited-logic.js");

describe("shouldSkipVisitedUrl", () => {
  it("skips when URL is in collected set", () => {
    const collected = new Set(["https://example.com/a.pdf"]);
    assert.equal(ctx.shouldSkipVisitedUrl("https://example.com/a.pdf", {
      skipEnabled: true,
      collected,
      extensionKnown: new Set(),
    }), true);
  });

  it("skips when URL is in extension storage set", () => {
    const extensionKnown = new Set(["https://example.com/b.pdf"]);
    assert.equal(ctx.shouldSkipVisitedUrl("https://example.com/b.pdf", {
      skipEnabled: true,
      collected: new Set(),
      extensionKnown,
    }), true);
  });

  it("does not skip when skip is disabled", () => {
    const collected = new Set(["https://example.com/a.pdf"]);
    assert.equal(ctx.shouldSkipVisitedUrl("https://example.com/a.pdf", {
      skipEnabled: false,
      collected,
      extensionKnown: new Set(),
    }), false);
  });

  it("does not skip unknown URLs", () => {
    assert.equal(ctx.shouldSkipVisitedUrl("https://example.com/new.pdf", {
      skipEnabled: true,
      collected: new Set(),
      extensionKnown: new Set(),
    }), false);
  });
});

describe("urlsFromStorageItems", () => {
  it("normalizes URLs and strips hash", () => {
    const set = ctx.urlsFromStorageItems([
      { url: "https://example.com/doc.pdf#section" },
      { url: "https://other.org/x.docx" },
    ]);
    assert.equal(set.size, 2);
    assert.ok(set.has("https://example.com/doc.pdf"));
    assert.ok(set.has("https://other.org/x.docx"));
  });
});

describe("detectCaptchaFromSignals", () => {
  it("detects sorry path and text", () => {
    assert.equal(ctx.detectCaptchaFromSignals({ sorryPath: true }), true);
    assert.equal(ctx.detectCaptchaFromSignals({ textHit: true }), true);
    assert.equal(ctx.detectCaptchaFromSignals({}), false);
  });
});

describe("captchaTextHit", () => {
  it("matches common challenge phrases", () => {
    assert.equal(ctx.captchaTextHit("unusual traffic from your network"), true);
    assert.equal(ctx.captchaTextHit("hasil pencarian biasa"), false);
  });
});
