import { campusDayStart, campusMinutes, campusWeekday, DAY_MS } from "./format";

/**
 * The lecturer's weekly timetable. Demo mode ships Bu Laras's teaching load so the
 * dashboard can say which class is next; a real deployment would read it from the
 * campus timetable (BINUSMAYA) instead.
 */

export interface ClassSlot {
  courseCode: string;
  courseName: string;
  className: string;
  /** ISO weekday: Monday = 1 … Sunday = 7. */
  weekday: number;
  /** WIB, "HH:MM". BINUS slots start at 07.20, 09.20, 11.20, 13.20, 15.20… */
  start: string;
  end: string;
  room: string;
  /** Arena prepared for this class, if any. */
  quizId?: string;
}

export const DEMO_TIMETABLE: ClassSlot[] = [
  {
    courseCode: "COMP6716",
    courseName: "Operating Systems",
    className: "LA01",
    weekday: 1,
    start: "13:20",
    end: "15:00",
    room: "Anggrek 0604",
    quizId: "os-battle",
  },
  {
    courseCode: "COMP6755",
    courseName: "Computer Networks",
    className: "LA02",
    weekday: 2,
    start: "09:20",
    end: "11:00",
    room: "Anggrek 0811",
    quizId: "netw-osi",
  },
  {
    courseCode: "COMP6065",
    courseName: "Artificial Intelligence",
    className: "LD01",
    weekday: 3,
    start: "15:20",
    end: "17:00",
    room: "Syahdan 0502",
    quizId: "ai-search",
  },
  {
    courseCode: "COMP6624",
    courseName: "Cloud Computing",
    className: "LB03",
    weekday: 4,
    start: "07:20",
    end: "09:00",
    room: "Anggrek 0707",
    quizId: "cloud-fundamentals",
  },
  {
    courseCode: "COMP6047",
    courseName: "Algorithm and Programming",
    className: "LC05",
    weekday: 5,
    start: "11:20",
    end: "13:00",
    room: "Kijang 0305",
    quizId: "algo-loops",
  },
];

export interface UpcomingClass {
  slot: ClassSlot;
  /** Epoch ms of the class start. */
  startsAt: number;
  /** Whole campus days from today (0 = today, 1 = tomorrow…). */
  inDays: number;
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/**
 * The next class that hasn't ended yet, looking up to a week ahead. A class that
 * is in progress still counts as "next": that's exactly when a lecturer opens NUSAQUEST.
 */
export function nextClass(now: number, timetable: ClassSlot[] = DEMO_TIMETABLE): UpcomingClass | null {
  const today = campusWeekday(now);
  const minute = campusMinutes(now);
  const dayStart = campusDayStart(now);
  let best: UpcomingClass | null = null;
  for (const slot of timetable) {
    let inDays = (slot.weekday - today + 7) % 7;
    if (inDays === 0 && minutesOf(slot.end) <= minute) inDays = 7;
    const startsAt = dayStart + inDays * DAY_MS + minutesOf(slot.start) * 60_000;
    if (!best || startsAt < best.startsAt) best = { slot, startsAt, inDays };
  }
  return best;
}
