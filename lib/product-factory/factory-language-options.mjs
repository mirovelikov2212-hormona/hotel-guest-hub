const COMMON_LANGUAGE_OPTIONS = [
  { code: "bg", nativeName: "Български", englishName: "Bulgarian" },
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "ro", nativeName: "Română", englishName: "Romanian" },
  { code: "cs", nativeName: "Čeština", englishName: "Czech" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
  { code: "pl", nativeName: "Polski", englishName: "Polish" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish" },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "fr", nativeName: "Français", englishName: "French" },
  { code: "it", nativeName: "Italiano", englishName: "Italian" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian" },
  { code: "hu", nativeName: "Magyar", englishName: "Hungarian" },
  { code: "sk", nativeName: "Slovenčina", englishName: "Slovak" },
  { code: "sl", nativeName: "Slovenščina", englishName: "Slovenian" },
  { code: "hr", nativeName: "Hrvatski", englishName: "Croatian" },
  { code: "sr", nativeName: "Српски", englishName: "Serbian" },
  { code: "da", nativeName: "Dansk", englishName: "Danish" },
  { code: "sv", nativeName: "Svenska", englishName: "Swedish" },
  { code: "no", nativeName: "Norsk", englishName: "Norwegian" },
  { code: "fi", nativeName: "Suomi", englishName: "Finnish" },
  { code: "he", nativeName: "עברית", englishName: "Hebrew" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic" },
].map((item) => Object.freeze(item));

export function normalizeFactoryLocale(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return Intl.getCanonicalLocales(raw)[0] || null;
  } catch {
    return null;
  }
}

export function isFactoryLocaleSupported(value) {
  return Boolean(normalizeFactoryLocale(value));
}

export function getFactoryCommonLanguageOption(value) {
  const canonical = normalizeFactoryLocale(value);
  if (!canonical) return null;
  const language = canonical.split("-")[0].toLowerCase();
  return COMMON_LANGUAGE_OPTIONS.find((item) => item.code === language) || null;
}

// These are convenience choices for Smart Setup, not an allow-list.
// Any valid BCP-47 locale can be carried by the Factory blueprint/runtime.
export const FACTORY_COMMON_LANGUAGE_OPTIONS = Object.freeze([...COMMON_LANGUAGE_OPTIONS]);
