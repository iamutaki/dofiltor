import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadExtensionScript } from "./load-script.mjs";

const pu = loadExtensionScript("provider-utils.js");

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
  it("matches enabled provider host and path", () => {
    const provider = {
      enabled: true,
      hostContains: "google.",
      pathContains: "/search",
    };
    assert.equal(pu.providerMatchesUrl(provider, "https://www.google.com/search?q=test"), true);
    assert.equal(pu.providerMatchesUrl(provider, "https://www.bing.com/search?q=test"), false);
  });
});
