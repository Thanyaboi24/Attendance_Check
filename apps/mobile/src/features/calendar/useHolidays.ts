import type { HolidayDto } from '@attendance/shared';
import { useQuery } from '@tanstack/react-query';
import { getDeps } from '../../app/container';
import { holidayWindow, loadHolidayCache, refreshHolidays } from '../../domain/holidays';

export interface HolidaysResult {
  holidays: HolidayDto[];
  /** The server could not be reached: the list is the cached calendar (may be empty or out of date). */
  offline: boolean;
  /** When the shown list was downloaded (null: never). */
  fetchedAt: string | null;
}

const inRange = (list: readonly HolidayDto[], from: string, to: string) => list.filter((h) => h.date >= from && h.date <= to);

/**
 * Holidays between two Bangkok dates for a screen. Inside the cached window (last month → next year) this refreshes
 * the shared cache (so the background geofence task sees the same list); outside it asks the server directly.
 * Never fails: offline it falls back to the cache and says so.
 */
export async function fetchHolidays(from: string, to: string): Promise<HolidaysResult> {
  const deps = await getDeps();
  const win = holidayWindow(deps.clock.now());
  if (from >= win.from && to <= win.to) {
    const r = await refreshHolidays(deps);
    return { holidays: inRange(r.cache?.holidays ?? [], from, to), offline: !r.fresh, fetchedAt: r.cache?.fetchedAt ?? null };
  }
  try {
    return { holidays: await deps.api.holidays(from, to), offline: false, fetchedAt: deps.clock.now().toISOString() };
  } catch {
    const cache = await loadHolidayCache(deps.store);
    return { holidays: inRange(cache?.holidays ?? [], from, to), offline: true, fetchedAt: cache?.fetchedAt ?? null };
  }
}

export function useHolidays(from: string, to: string) {
  return useQuery({
    queryKey: ['holidays', from, to],
    queryFn: () => fetchHolidays(from, to),
    staleTime: 5 * 60_000,
  });
}
