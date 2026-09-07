import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  addDays,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const IST_TZ = 'Asia/Kolkata';

/** date-fns weekStartsOn: 0=Sun … 3=Wed. Agency week is Wed–Tue IST. */
export const AGENCY_WEEK_STARTS_ON = 3 as const;

export function toIst(date: Date = new Date()): Date {
  return toZonedTime(date, IST_TZ);
}

export function fromIst(zonedDate: Date): Date {
  return fromZonedTime(zonedDate, IST_TZ);
}

export function startOfIstDay(date: Date = new Date()): Date {
  return fromIst(startOfDay(toIst(date)));
}

export function endOfIstDay(date: Date = new Date()): Date {
  return fromIst(endOfDay(toIst(date)));
}

export function startOfIstMonth(date: Date = new Date()): Date {
  return fromIst(startOfMonth(toIst(date)));
}

export function endOfIstMonth(date: Date = new Date()): Date {
  return fromIst(endOfMonth(toIst(date)));
}

export function startOfIstWeek(
  date: Date = new Date(),
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = AGENCY_WEEK_STARTS_ON
): Date {
  return fromIst(startOfWeek(toIst(date), { weekStartsOn }));
}

export function endOfIstWeek(
  date: Date = new Date(),
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = AGENCY_WEEK_STARTS_ON
): Date {
  return fromIst(endOfWeek(toIst(date), { weekStartsOn }));
}

/** 0=Sunday … 6=Saturday in Asia/Kolkata. */
export function getIstDayOfWeek(date: Date = new Date()): number {
  return toIst(date).getDay();
}

export function istYmd(date: Date = new Date()): string {
  const zoned = toIst(date);
  const year = zoned.getFullYear();
  const month = (zoned.getMonth() + 1).toString().padStart(2, '0');
  const day = zoned.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIstYmd(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return fromIst(new Date(year, month - 1, day, 0, 0, 0, 0));
}

/** Last 7 IST calendar days including today (start of day 6 days ago → end of today). */
export function last7IstDays(date: Date = new Date()): { start: Date; end: Date } {
  const end = endOfIstDay(date);
  const start = startOfIstDay(fromIst(subDays(toIst(date), 6)));
  return { start, end };
}

/** Completed 7-day week (previous Wed 00:00 IST → Tue 23:59:59 IST). */
export function lastCompletedAgencyWeek(date: Date = new Date()): { start: Date; end: Date } {
  const currentStart = startOfIstWeek(date);
  const previousStart = fromIst(subDays(toIst(currentStart), 7));
  return {
    start: previousStart,
    end: endOfIstWeek(previousStart),
  };
}

export function nextIstWeekday(from: Date, weekday: number): Date {
  const zoned = startOfDay(toIst(from));
  const delta = (weekday - zoned.getDay() + 7) % 7;
  const target = delta === 0 ? zoned : addDays(zoned, delta);
  return fromIst(target);
}
