#!/usr/bin/env node
/**
 * Verify all ui.json locales have the same keys as English.
 * Usage: node scripts/check-locales.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "_locales");
const baseLang = "en";
const basePath = path.join(localesDir, baseLang, "ui.json");
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const baseKeys = new Set(Object.keys(base));

let failed = false;

for (const ent of fs.readdirSync(localesDir, { withFileTypes: true })) {
  if (!ent.isDirectory() || ent.name === baseLang || ent.name.startsWith(".")) continue;
  const uiPath = path.join(localesDir, ent.name, "ui.json");
  if (!fs.existsSync(uiPath)) {
    console.error(ent.name + ": missing ui.json");
    failed = true;
    continue;
  }
  const data = JSON.parse(fs.readFileSync(uiPath, "utf8"));
  const keys = new Set(Object.keys(data));
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(ent.name + ":");
    if (missing.length) console.error("  missing keys:", missing.join(", "));
    if (extra.length) console.error("  extra keys:", extra.join(", "));
  } else {
    console.log(ent.name + ": OK (" + keys.size + " keys)");
  }
}

if (failed) process.exit(1);
console.log("All locales match", baseLang, "(" + baseKeys.size + " keys)");
