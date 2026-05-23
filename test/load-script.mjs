import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Load a browser extension script into a fresh VM context (globals become context properties). */
export function loadExtensionScript(relativePath, extra = {}) {
  const file = path.join(root, relativePath);
  const src = fs.readFileSync(file, "utf8");
  const ctx = { console, URL, ...extra };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: relativePath });
  return ctx;
}
