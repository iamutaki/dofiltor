import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadExtensionScript } from "./load-script.mjs";

const ft = loadExtensionScript("file-types.js");
const CURRENT_VERSION = 2;

describe("migrateFileTypes", () => {
  it("fresh install (no stored types) returns full defaults", () => {
    const r = ft.migrateFileTypes(undefined, 0);
    assert.equal(r.fileTypesVersion, CURRENT_VERSION);
    assert.ok(r.fileTypes.includes("pdf"));
    assert.ok(r.fileTypes.includes("odp"));
    assert.equal(r.changed, true);
  });

  it("merges incremental additions from version 0 with user list", () => {
    const r = ft.migrateFileTypes(["pdf", "doc"], 0);
    assert.ok(r.fileTypes.includes("pdf"));
    assert.ok(r.fileTypes.includes("doc"));
    assert.ok(r.fileTypes.includes("odp"), "v2 OpenDocument types merged");
    assert.equal(r.fileTypesVersion, CURRENT_VERSION);
    assert.equal(r.changed, true);
  });

  it("at current version only normalizes user extensions", () => {
    const r = ft.migrateFileTypes(["PDF", ".doc", "doc"], CURRENT_VERSION);
    assert.deepEqual([...r.fileTypes], ["pdf", "doc"]);
    assert.equal(r.fileTypesVersion, CURRENT_VERSION);
  });

  it("at current version with empty stored uses defaults", () => {
    const baseline = [...ft.migrateFileTypes(undefined, 0).fileTypes];
    const r = ft.migrateFileTypes([], CURRENT_VERSION);
    assert.deepEqual([...r.fileTypes], baseline);
  });
});

describe("mergeFileTypes", () => {
  it("keeps user order and appends missing defaults", () => {
    const merged = ft.mergeFileTypes(["zip"], ["pdf", "doc"]);
    assert.deepEqual([...merged], ["zip", "pdf", "doc"]);
  });
});
