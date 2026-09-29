import "server-only";
import { cookies } from "next/headers";
import { createTranslator, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT() {
  return createTranslator(await getLocale());
}
