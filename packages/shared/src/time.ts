/**
 * Asia/Bangkok helpers. Thailand has no daylight saving time, so the offset is a constant +07:00.
 * Values are stored and transported as UTC; these helpers only map calendar days and display strings.
 */
export const BANGKOK_OFFSET_MIN = 7 * 60;
const OFFSET_MS = BANGKOK_OFFSET_MIN * 60_000;
const DAY_MS = 86_400_000;

/** Calendar date (`YYYY-MM-DD`) in Bangkok for an instant. */
export function toBangkokDate(instant: Date | string): string {
  const t = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  return new Date(t + OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instants bounding a Bangkok calendar day: [start, end). */
export function bangkokDayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${date}T00:00:00.000Z`) - OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** UTC instants bounding an inclusive Bangkok date range: [start of `from`, end of `to`). */
export function bangkokRangeBounds(from: string, to: string): { start: Date; end: Date } {
  return { start: bangkokDayBounds(from).start, end: bangkokDayBounds(to).end };
}

/** `HH:mm` in Bangkok time. */
export function formatBangkokTime(instant: Date | string): string {
  const t = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  return new Date(t + OFFSET_MS).toISOString().slice(11, 16);
}

/** `YYYY-MM-DD HH:mm` in Bangkok time. */
export function formatBangkokDateTime(instant: Date | string): string {
  const t = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  return new Date(t + OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

/** Combine a Bangkok calendar date and `HH:mm` into a UTC ISO string. */
export function bangkokLocalToIso(date: string, time: string): string {
  return new Date(Date.parse(`${date}T${time}:00.000Z`) - OFFSET_MS).toISOString();
}

/** Add whole days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
