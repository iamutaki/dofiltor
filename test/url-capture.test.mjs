import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadExtensionScript } from "./load-script.mjs";

const ft = loadExtensionScript("file-types.js");
const types = ["pdf", "doc", "docx", "xlsx", "pptx", "txt"];

describe("fileTypeFromUrlPath", () => {
  it("detects extension in path", () => {
    assert.equal(ft.fileTypeFromUrlPath("https://example.com/report.pdf", types), "pdf");
    assert.equal(ft.fileTypeFromUrlPath("https://example.com/a.PDF?q=1", types), "pdf");
  });

  it("returns null when path has no configured extension", () => {
    assert.equal(ft.fileTypeFromUrlPath("https://example.com/download?id=9", types), null);
  });
});

describe("fileTypeFromBadgeLabel", () => {
  it("maps provider chip labels to configured extensions", () => {
    assert.equal(ft.fileTypeFromBadgeLabel("PDF", types), "pdf");
    assert.equal(ft.fileTypeFromBadgeLabel("docx", types), "docx");
  });

  it("ignores labels outside configured types", () => {
    assert.equal(ft.fileTypeFromBadgeLabel("ZIP", types), null);
    assert.equal(ft.fileTypeFromBadgeLabel("WEB", types), null);
  });
});

describe("resolveCaptureFileType", () => {
  it("prefers URL extension over badge", () => {
    assert.equal(
      ft.resolveCaptureFileType("https://x.test/file.pdf", "DOC", types),
      "pdf",
    );
  });

  it("uses badge when URL has no extension", () => {
    assert.equal(
      ft.resolveCaptureFileType("https://drive.google.com/file/d/abc/view", "PDF", types),
      "pdf",
    );
  });

  it("returns null when neither URL nor badge matches", () => {
    assert.equal(
      ft.resolveCaptureFileType("https://example.com/page", "HTML", types),
      null,
    );
  });
});
