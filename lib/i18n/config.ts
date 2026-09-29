import id from "@/locales/id.json";
import en from "@/locales/en.json";

export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "nq-locale";

/** Indonesian is the source of truth; English must mirror its shape. */
export type Dictionary = typeof id;

// Compile-time guard: en.json must have exactly the same key structure.
const _enMatchesId: Dictionary = en;
void _enMatchesId;

export const dictionaries: Record<Locale, Dictionary> = { id, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];

/** Every valid dotted key, e.g. "host.start" | "editor.types.single". */
export type TranslationKey = Paths<Dictionary>;
export type TranslationParams = Record<string, string | number>;

export function lookup(dict: Dictionary, key: TranslationKey): string {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function createTranslator(locale: Locale) {
  const dict = dictionaries[locale];
  return (key: TranslationKey, params?: TranslationParams) => interpolate(lookup(dict, key), params);
}

export type Translator = ReturnType<typeof createTranslator>;
