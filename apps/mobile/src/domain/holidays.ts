import { addDays, type HolidayDto, HolidayDtoSchema, toBangkokDate } from '@attendance/shared';
import { z } from 'zod';
import type { Language } from '../i18n';
import { errorMessage } from './errors';
import type { AppDeps, LocalStore } from './ports';

/**
 * Holiday calendar cache. On a holiday nobody is expected to come in: check-in is closed (the backend answers
 * 422 HOLIDAY_CHECK_IN_CLOSED) while check-out stays open for a session left open from the day before.
 *
 * The list is kept in the local `meta` table as JSON so the headless geofence task can tell a holiday offline.
 * It is not user data: it survives logout. A failed refresh keeps the last cache.
 */
export const META_HOLIDAYS = 'holidayCache';

/** Window fetched on refresh: last month (Hours tab) to a year ahead (Calendar tab). At most 400 days per request. */
export const HOLIDAY_WINDOW = { pastDays: 31, futureDays: 365 } as const;

export interface HolidayCache {
  fetchedAt: string;
  /** Inclusive Bangkok dates the list covers. */
  from: string;
  to: string;
  holidays: HolidayDto[];
}

const HolidayCacheSchema = z.object({
  fetchedAt: z.string(),
  from: z.string(),
  to: z.string(),
  holidays: z.array(HolidayDtoSchema),
});

type HolidaySource = HolidayCache | readonly HolidayDto[] | null | undefined;

const listOf = (src: HolidaySource): readonly HolidayDto[] => (src == null ? [] : Array.isArray(src) ? src : (src as HolidayCache).holidays);

/** The holiday on a Bangkok date (`YYYY-MM-DD`), or null. Pure. */
export function holidayFor(date: string, src: HolidaySource): HolidayDto | null {
  return listOf(src).find((h) => h.date === date) ?? null;
}

/** Holidays by date (several on one date: the first one wins). */
export function holidayMap(src: HolidaySource): Map<string, HolidayDto> {
  const m = new Map<string, HolidayDto>();
  for (const h of listOf(src)) if (!m.has(h.date)) m.set(h.date, h);
  return m;
}

/** Whole days from `from` to `to` (Bangkok dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Holiday name in the UI language (data from the server: both names are stored). */
export function holidayName(h: Pick<HolidayDto, 'nameEn' | 'nameTh'>, lang: Language): string {
  return lang === 'th' ? h.nameTh || h.nameEn : h.nameEn || h.nameTh;
}

export function holidayWindow(now: Date): { from: string; to: string } {
  const today = toBangkokDate(now);
  return { from: addDays(today, -HOLIDAY_WINDOW.pastDays), to: addDays(today, HOLIDAY_WINDOW.futureDays) };
}

export async function loadHolidayCache(store: Pick<LocalStore, 'getMeta'>): Promise<HolidayCache | null> {
  try {
    const raw = await store.getMeta(META_HOLIDAYS);
    if (!raw) return null;
    const parsed = HolidayCacheSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveHolidayCache(store: Pick<LocalStore, 'setMeta'>, cache: HolidayCache): Promise<void> {
  await store.setMeta(META_HOLIDAYS, JSON.stringify(cache));
}

export interface HolidayRefresh {
  cache: HolidayCache | null;
  /** True when the list came from the server just now; false = last cache (offline or error). */
  fresh: boolean;
  error?: string;
}

let inFlight: Promise<HolidayRefresh> | null = null;

/**
 * GET /calendar/holidays for [today − 31 d, today + 365 d] → cache. Never throws: on failure the last cache is
 * returned unchanged. Concurrent callers share one request.
 */
export function refreshHolidays(deps: Pick<AppDeps, 'api' | 'store' | 'clock'>): Promise<HolidayRefresh> {
  if (!inFlight) {
    inFlight = (async (): Promise<HolidayRefresh> => {
      const { from, to } = holidayWindow(deps.clock.now());
      try {
        const holidays = await deps.api.holidays(from, to);
        const cache: HolidayCache = { fetchedAt: deps.clock.now().toISOString(), from, to, holidays };
        await saveHolidayCache(deps.store, cache);
        return { cache, fresh: true };
      } catch (e) {
        return { cache: await loadHolidayCache(deps.store), fresh: false, error: errorMessage(e) };
      }
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Adds a holiday the server told us about (422 details) so later geofence events skip it even offline. */
export async function rememberHoliday(deps: Pick<AppDeps, 'store' | 'clock'>, h: HolidayDto): Promise<void> {
  try {
    const cache = (await loadHolidayCache(deps.store)) ?? { fetchedAt: deps.clock.now().toISOString(), from: h.date, to: h.date, holidays: [] };
    if (cache.holidays.some((x) => x.id === h.id || x.date === h.date)) return;
    await saveHolidayCache(deps.store, {
      ...cache,
      from: h.date < cache.from ? h.date : cache.from,
      to: h.date > cache.to ? h.date : cache.to,
      holidays: [...cache.holidays, h].sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch {
    /* best effort */
  }
}

/**
 * Holiday on a Bangkok date as far as the phone knows (works offline / headless):
 * the server's `todayHoliday` from the last state refresh when it is about that day and newer than the cache,
 * otherwise the cached calendar.
 */
export async function holidayOn(deps: Pick<AppDeps, 'store'>, date: string): Promise<HolidayDto | null> {
  const [snapshot, cache] = await Promise.all([deps.store.getSnapshot().catch(() => null), loadHolidayCache(deps.store)]);
  if (
    snapshot &&
    snapshot.todayHoliday !== undefined &&
    toBangkokDate(snapshot.serverTime) === date &&
    (!cache || snapshot.fetchedAt >= cache.fetchedAt)
  ) {
    return snapshot.todayHoliday;
  }
  return holidayFor(date, cache);
}

/** Today's holiday (Bangkok date of the injected clock). */
export function holidayToday(deps: Pick<AppDeps, 'store' | 'clock'>): Promise<HolidayDto | null> {
  return holidayOn(deps, toBangkokDate(deps.clock.now()));
}

/** For tests: forget a hung in-flight refresh. */
export function __resetHolidayRefreshForTests(): void {
  inFlight = null;
}
