import type { Locale } from "@/lib/i18n/config";

/**
 * Date formatting for the lecturer's desk. Everything is pinned to campus time
 * (WIB), so a server in UTC and a laptop in Jakarta render identical text and
 * hydration never disagrees about which day a session happened on.
 */

export const CAMPUS_TIME_ZONE = "Asia/Jakarta";
/** WIB has no daylight saving: a fixed offset keeps day arithmetic trivial. */
const CAMPUS_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

// en-US keeps "Sep" (en-GB is "Sept" in newer ICU builds, which could differ between Node and the browser).
const tag = (locale: Locale) => (locale === "id" ? "id-ID" : "en-US");

type DateInput = string | number | Date;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

function format(value: DateInput, locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: CAMPUS_TIME_ZONE, ...options }).format(toDate(value));
}

/** "21 Sep" */
export function formatShortDate(value: DateInput, locale: Locale) {
  return format(value, locale, { day: "numeric", month: "short" });
}

/** "Senin, 28 September" */
export function formatLongDate(value: DateInput, locale: Locale) {
  return format(value, locale, { weekday: "long", day: "numeric", month: "long" });
}

/** "Kamis" */
export function formatWeekday(value: DateInput, locale: Locale) {
  return format(value, locale, { weekday: "long" });
}

/** "13.24" (id) / "13:24" (en), always 24-hour like a class timetable. */
export function formatTime(value: DateInput, locale: Locale) {
  return format(value, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** Day numeral, short month and short weekday for calendar-style row anchors. */
export function dateParts(value: DateInput, locale: Locale) {
  return {
    day: format(value, locale, { day: "numeric" }),
    month: format(value, locale, { month: "short" }).replace(".", ""),
    weekday: format(value, locale, { weekday: "short" }).replace(".", ""),
  };
}

/** A "13:20" timetable slot rendered in the locale's separator. */
export function formatSlotTime(hhmm: string, locale: Locale) {
  return locale === "id" ? hhmm.replace(":", ".") : hhmm;
}

/** Epoch ms of 00:00 WIB on the campus day containing `now`. */
export function campusDayStart(now: number) {
  return Math.floor((now + CAMPUS_OFFSET_MS) / DAY_MS) * DAY_MS - CAMPUS_OFFSET_MS;
}

/** ISO weekday (Mon = 1 … Sun = 7) on campus. */
export function campusWeekday(now: number) {
  const day = new Date(now + CAMPUS_OFFSET_MS).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Minutes since 00:00 WIB. */
export function campusMinutes(now: number) {
  return Math.floor(((now + CAMPUS_OFFSET_MS) % DAY_MS) / 60000);
}

/**
 * The request's clock, read once by a server page and passed down, so the demo
 * history, "next class" and every date on the page agree on server and client.
 */
export function requestNow() {
  return Date.now();
}

export function percent(ratio: number) {
  return Math.round(ratio * 100);
}
