// i18n.js — locale loader (UI strings live in _locales/<lang>/ui.json)

const I18N_STORAGE_KEY = "dofiltor_language";
const I18N_DEFAULT_LANG = "en";
const I18N_SUPPORTED = ["en", "id"];
const I18N_CACHE = Object.create(null);
let i18nReady = null;

function getI18nLanguage() {
  const stored = localStorage.getItem(I18N_STORAGE_KEY);
  return I18N_SUPPORTED.includes(stored) ? stored : I18N_DEFAULT_LANG;
}

async function loadLocaleFile(lang) {
  if (I18N_CACHE[lang]) return I18N_CACHE[lang];
  const url = chrome.runtime.getURL("_locales/" + lang + "/ui.json");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load locale: " + lang);
  const data = await res.json();
  I18N_CACHE[lang] = data;
  return data;
}

/** Load active locale and English fallback. Call once before applyI18n / t(). */
function initI18n(lang) {
  const target = I18N_SUPPORTED.includes(lang) ? lang : getI18nLanguage();
  const loads = [loadLocaleFile(I18N_DEFAULT_LANG)];
  if (target !== I18N_DEFAULT_LANG) loads.push(loadLocaleFile(target));
  i18nReady = Promise.all(loads).then(() => target);
  return i18nReady;
}

function setI18nLanguage(lang) {
  const next = I18N_SUPPORTED.includes(lang) ? lang : I18N_DEFAULT_LANG;
  localStorage.setItem(I18N_STORAGE_KEY, next);
  return loadLocaleFile(next).then(() => {
    i18nReady = Promise.resolve(next);
    return next;
  });
}

function t(key, replacements) {
  const lang = getI18nLanguage();
  let msg = I18N_CACHE[lang]?.[key] || I18N_CACHE[I18N_DEFAULT_LANG]?.[key] || key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      msg = msg.split("{" + k + "}").join(v);
    }
  }
  return msg;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  root.querySelectorAll("[data-i18n-tip]").forEach((el) => {
    el.setAttribute("data-tip", t(el.dataset.i18nTip));
  });
}
