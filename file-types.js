/**
 * Default capture extensions and file-badge grouping.
 * Covers Microsoft Office, OpenDocument (LibreOffice / Apache OpenOffice),
 * legacy StarOffice, and other common office suites.
 */
const DEFAULT_FILE_TYPES = [
  "pdf",
  // Microsoft Office
  "doc", "docx", "docm", "dot", "dotx", "dotm",
  "xls", "xlsx", "xlsm", "xlt", "xltx",
  "ppt", "pptx", "pptm", "pot", "potx", "pps", "ppsx",
  // OpenDocument (LibreOffice, Apache OpenOffice)
  "odt", "ods", "odp", "odg", "odf", "odb",
  "fodt", "fods", "fodp",
  // Legacy OpenOffice / StarOffice
  "sxw", "sxc", "sxi",
  // Other office suites
  "rtf", "wps", "wpd", "abw", "hwp", "pages", "numbers", "key",
  // Plain / tabular
  "txt", "csv",
];

/** Bump when DEFAULT_FILE_TYPES gains new entries so upgrades merge once. */
const FILE_TYPES_VERSION = 2;

/** Extensions introduced in each schema version (incremental merge). */
const FILE_TYPES_ADDITIONS = {
  1: [
    "pdf", "xls", "xlsx", "doc", "docx", "txt", "csv",
    "ppt", "pptx", "odt", "ods", "rtf",
  ],
  2: [
    "docm", "dot", "dotx", "dotm", "xlsm", "xlt", "xltx",
    "pptm", "pot", "potx", "pps", "ppsx",
    "odp", "odg", "odf", "odb", "fodt", "fods", "fodp",
    "sxw", "sxc", "sxi", "wps", "wpd", "abw", "hwp", "pages", "numbers", "key",
  ],
};

function normalizeFileTypeExt(ext) {
  return String(ext || "").trim().replace(/^\./, "").toLowerCase();
}

function normalizeFileTypeList(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const ext = normalizeFileTypeExt(raw);
    if (!ext || seen.has(ext)) continue;
    seen.add(ext);
    out.push(ext);
  }
  return out;
}

/** Keep user/custom extensions first, append missing defaults. */
function mergeFileTypes(userTypes, defaultTypes) {
  const merged = normalizeFileTypeList(userTypes);
  const seen = new Set(merged);
  for (const ext of normalizeFileTypeList(defaultTypes)) {
    if (seen.has(ext)) continue;
    seen.add(ext);
    merged.push(ext);
  }
  return merged;
}

function mergeFileTypesSinceVersion(userTypes, fromVersion, toVersion) {
  let merged = normalizeFileTypeList(userTypes);
  const start = Math.max(1, (Number(fromVersion) || 0) + 1);
  for (let version = start; version <= toVersion; version += 1) {
    merged = mergeFileTypes(merged, FILE_TYPES_ADDITIONS[version] || []);
  }
  return merged;
}

function migrateFileTypes(storedTypes, storedVersion) {
  const version = Number(storedVersion) || 0;
  const hadUserTypes = Array.isArray(storedTypes) && storedTypes.length > 0;
  if (version >= FILE_TYPES_VERSION) {
    const fileTypes = hadUserTypes ? normalizeFileTypeList(storedTypes) : DEFAULT_FILE_TYPES.slice();
    const normalized = JSON.stringify(fileTypes);
    const previous = JSON.stringify(hadUserTypes ? storedTypes : DEFAULT_FILE_TYPES);
    return {
      fileTypes,
      fileTypesVersion: FILE_TYPES_VERSION,
      changed: normalized !== previous,
    };
  }
  const fileTypes = hadUserTypes
    ? mergeFileTypesSinceVersion(storedTypes, version, FILE_TYPES_VERSION)
    : DEFAULT_FILE_TYPES.slice();
  return { fileTypes, fileTypesVersion: FILE_TYPES_VERSION, changed: true };
}

const FILE_ICON_SHEET = new Set([
  "xls", "xlsx", "xlsm", "xlt", "xltx", "csv", "ods", "fods", "numbers", "sxc", "odb", "odf",
]);

const FILE_ICON_DOC = new Set([
  "doc", "docx", "docm", "dot", "dotx", "dotm", "odt", "rtf", "fodt", "abw", "wpd", "wps",
  "hwp", "pages", "sxw", "odg",
]);

const FILE_ICON_SLIDE = new Set([
  "ppt", "pptx", "pptm", "pot", "potx", "pps", "ppsx", "odp", "fodp", "key", "sxi",
]);

function fileIconClass(ext) {
  const key = String(ext || "").toLowerCase();
  if (key === "pdf") return "ext-pdf";
  if (FILE_ICON_SHEET.has(key)) return "ext-sheet";
  if (FILE_ICON_DOC.has(key)) return "ext-doc";
  if (FILE_ICON_SLIDE.has(key)) return "ext-slide";
  if (["txt", "md", "log"].includes(key)) return "ext-text";
  if (["zip", "rar", "7z", "tar", "gz"].includes(key)) return "ext-archive";
  return "";
}
