import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadExtensionScript } from "./load-script.mjs";

// Load glob-match.js first so hostMatchesGlob and hostBaseFromPattern are available
const gm = loadExtensionScript("glob-match.js");
const pu = loadExtensionScript("provider-utils.js", {
  hostMatchesGlob: gm.hostMatchesGlob,
  hostBaseFromPattern: gm.hostBaseFromPattern,
});

describe("parseBulkDorkLines", () => {
  it("splits lines and skips comments", () => {
    assert.equal(pu.parseBulkDorkLines("a\n\n# skip\n  b  \n").join("|"), "a|b");
  });
});

describe("buildProviderSearchUrl", () => {
  it("encodes query for google", () => {
    const url = pu.buildProviderSearchUrl(
      { id: "google", queryParam: "q" },
      "site:un.org filetype:pdf",
    );
    assert.match(url, /www\.google\.com\/search/);
    assert.match(url, /q=site/);
  });
});

describe("providerMatchesUrl", () => {
  it("matches enabled provider via hostContains (legacy)", () => {
    const provider = {
      enabled: true,
      hostContains: "google.",
      pathContains: "/search",
    };
    assert.equal(pu.providerMatchesUrl(provider, "https://www.google.com/search?q=test"), true);
    assert.equal(pu.providerMatchesUrl(provider, "https://www.bing.com/search?q=test"), false);
  });

  it("matches enabled provider via hostPattern (glob)", () => {
    const provider = {
      enabled: true,
      hostPattern: "**.google.**",
      pathContains: "/search",
    };
    assert.equal(pu.providerMatchesUrl(provider, "https://www.google.com/search?q=test"), true);
    assert.equal(pu.providerMatchesUrl(provider, "https://google.co.id/search?q=test"), true);
    assert.equal(pu.providerMatchesUrl(provider, "https://www.bing.com/search?q=test"), false);
  });

  it("prefers hostPattern over hostContains", () => {
    const provider = {
      enabled: true,
      hostPattern: "**.bing.com",
      hostContains: "google.",
      pathContains: "/search",
    };
    assert.equal(pu.providerMatchesUrl(provider, "https://www.bing.com/search?q=test"), true);
    assert.equal(pu.providerMatchesUrl(provider, "https://www.google.com/search?q=test"), false);
  });
});
