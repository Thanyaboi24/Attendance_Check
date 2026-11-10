import {
  addDays,
  bangkokLocalToIso,
  formatBangkokDateTime,
  formatBangkokTime,
  toBangkokDate,
} from '@attendance/shared';

/** `YYYY-MM-DD HH:mm` in Asia/Bangkok, or an em dash. */
export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? formatBangkokDateTime(iso) : '—';
}

export function fmtTime(iso: string | null | undefined): string {
  return iso ? formatBangkokTime(iso) : '—';
}

export function todayBangkok(now: Date = new Date()): string {
  return toBangkokDate(now);
}

/** Inclusive range ending today (Bangkok) covering `days` days. */
export function lastDays(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = todayBangkok(now);
  return { from: addDays(to, -(days - 1)), to };
}

/** Split a UTC instant into Bangkok `date` + `time` values for `<input type="date|time">`. */
export function isoToBangkokInputs(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  return { date: toBangkokDate(iso), time: formatBangkokTime(iso) };
}

/** Bangkok `date` + `HH:mm` (as typed by the admin) → UTC ISO string; null when either part is empty. */
export function bangkokInputsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  return bangkokLocalToIso(date, time.slice(0, 5));
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const METHOD_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automatic',
  ADMIN_CORRECTED: 'Corrected',
};
export function methodLabel(m: string | null | undefined): string {
  return m ? (METHOD_LABEL[m] ?? humanize(m)) : '—';
}

export function fmtMetres(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/** Trigger a browser download of a blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
