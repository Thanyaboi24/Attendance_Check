import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  ErrorCode,
  HolidayType,
  HolidayTypeSchema,
  type AdminHolidayDto,
  type CreateHoliday,
  type HolidayDto,
  type UpdateHoliday,
} from '@attendance/shared';
import { api, ApiRequestError, errorMessage } from '../api/client';
import { Icon } from '../components/icons';
import { Badge, ConfirmDialog, Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader } from '../components/ui';
import { t } from '../i18n';
import { enumLabel, fmtMonthYear, fmtShortDate, fmtShortDateYear, fmtYear, holidayName, todayBangkok } from '../lib/format';
import { msg } from '../lib/validation';

/** The global `t` (always the current language), for messages built outside render. */
const tr = t;

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** One colour per holiday type (badge tones are defined in styles.css). */
export const HOLIDAY_TONE: Record<HolidayType, string> = {
  PUBLIC: 'blue',
  SUBSTITUTE: 'violet',
  GOVERNMENT: 'green',
  SPECIAL: 'amber',
  UNIVERSITY: 'teal',
};

const HOLIDAY_TYPES = HolidayTypeSchema.options;

/** A flash message is kept as a function so it follows the language switch. */
type Flash = { text: () => string };
type Editing = { kind: 'add' } | { kind: 'edit'; holiday: AdminHolidayDto };
type RowStatus = 'today' | 'past' | 'next' | null;

/** Holidays of one year grouped by month (the API returns them sorted by date). */
function byMonth(items: AdminHolidayDto[]): { month: number; items: AdminHolidayDto[] }[] {
  const groups = new Map<number, AdminHolidayDto[]>();
  for (const h of items) {
    const m = Number(h.date.slice(5, 7));
    groups.set(m, [...(groups.get(m) ?? []), h]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([month, list]) => ({ month, items: list }));
}

export function HolidaysPage() {
  const { t } = useTranslation(['holidays', 'common']);
  const qc = useQueryClient();
  const today = todayBangkok();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<AdminHolidayDto | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const list = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => api.get<AdminHolidayDto[]>('/admin/holidays', { year }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['holidays'] });
    void qc.invalidateQueries({ queryKey: ['dashboard-holidays'] });
    void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };

  const remove = useMutation({
    mutationFn: (h: AdminHolidayDto) => api.request<{ ok: true }>(`/admin/holidays/${h.id}`, { method: 'DELETE' }),
    onSuccess: (_r, h) => {
      refresh();
      setFlash({ text: () => tr('holidays:flash.deleted', { name: holidayName(h) }) });
      setDeleting(null);
    },
  });

  const items = list.data ?? [];
  const nextId = items.find((h) => h.date > today)?.id;
  const counts = HOLIDAY_TYPES.map((type) => ({ type, n: items.filter((h) => h.type === type).length })).filter(
    (c) => c.n > 0,
  );
  const statusOf = (h: AdminHolidayDto): RowStatus =>
    h.date === today ? 'today' : h.date < today ? 'past' : h.id === nextId ? 'next' : null;

  return (
    <div className="holidays">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: 'add' })}>
            <Icon name="plus" size={16} /> {t('add')}
          </button>
        }
      />
      {flash ? (
        <div className="alert alert-success" role="status">
          {flash.text()}{' '}
          <button type="button" className="btn-link" onClick={() => setFlash(null)}>
            {t('common:actions.dismiss')}
          </button>
        </div>
      ) : null}

      <div className="holiday-info" role="note">
        <span className="holiday-info-icon">
          <Icon name="info" size={18} />
        </span>
        <div>
          <strong>{t('info.title')}</strong>
          <p>{t('info.body')}</p>
        </div>
      </div>

      <div className="holiday-toolbar">
        <div className="year-switch" role="group" aria-label={t('year.label')}>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('year.previous')}
            title={t('year.previous')}
            disabled={year <= MIN_YEAR}
            onClick={() => setYear((y) => y - 1)}
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="year-value" aria-live="polite">
            {fmtYear(year)}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('year.next')}
            title={t('year.next')}
            disabled={year >= MAX_YEAR}
            onClick={() => setYear((y) => y + 1)}
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        {year !== thisYear ? (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setYear(thisYear)}>
            {t('year.thisYear')}
          </button>
        ) : null}
        {list.data ? (
          <span className="holiday-count">{t('year.count', { count: items.length, year: fmtYear(year) })}</span>
        ) : null}
        {counts.length ? (
          <ul className="holiday-legend">
            {counts.map((c) => (
              <li key={c.type}>
                <Badge value={c.type} kind="holidayType" tone={HOLIDAY_TONE[c.type]} />
                <span className="muted small">{c.n}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ErrorBox error={list.error} />
      {list.isPending ? <Loading /> : null}
      {list.data && items.length === 0 ? (
        <Empty>
          <strong>{t('empty', { year: fmtYear(year) })}</strong>
          <div className="muted small">{t('emptyHint')}</div>
        </Empty>
      ) : null}
      {items.length ? (
        <div className="holiday-months">
          {byMonth(items).map((g) => {
            const headingId = `holiday-month-${g.month}`;
            return (
              <section key={g.month} className="panel holiday-month" aria-labelledby={headingId}>
                <header className="holiday-month-head">
                  <h2 id={headingId}>{fmtMonthYear(year, g.month)}</h2>
                  <span className="muted small">{t('month.count', { count: g.items.length })}</span>
                </header>
                <ul className="holiday-list">
                  {g.items.map((h) => (
                    <HolidayRow
                      key={h.id}
                      holiday={h}
                      status={statusOf(h)}
                      onEdit={() => setEditing({ kind: 'edit', holiday: h })}
                      onDelete={() => setDeleting(h)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {editing ? (
        <HolidayDialog
          holiday={editing.kind === 'edit' ? editing.holiday : null}
          onClose={() => setEditing(null)}
          onDone={(h, added) => {
            refresh();
            setFlash({
              text: () =>
                added
                  ? tr('holidays:flash.added', { name: holidayName(h), date: fmtShortDateYear(h.date) })
                  : tr('holidays:flash.saved', { name: holidayName(h) }),
            });
            setEditing(null);
            // Show the year the holiday is in (e.g. adding next year's days from this year's page).
            setYear(Number(h.date.slice(0, 4)));
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={t('confirm.deleteTitle')}
          message={t('confirm.deleteBody', { name: holidayName(deleting), date: fmtShortDateYear(deleting.date) })}
          confirmLabel={t('actions.delete')}
          danger
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => (setDeleting(null), remove.reset())}
        />
      ) : null}
    </div>
  );
}

function HolidayRow({
  holiday: h,
  status,
  onEdit,
  onDelete,
}: {
  holiday: AdminHolidayDto;
  status: RowStatus;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation('holidays');
  const thai = i18n.language === 'th';
  const primary = thai ? h.nameTh : h.nameEn;
  const secondary = thai ? h.nameEn : h.nameTh;
  return (
    <li className={`holiday-row${status ? ` is-${status}` : ''}`}>
      <span className="holiday-tile" aria-hidden>
        <span className="holiday-tile-day">{Number(h.date.slice(8, 10))}</span>
        <span className="holiday-tile-dow">{fmtShortDate(h.date).split(' ')[0]}</span>
      </span>
      <div className="holiday-main">
        <div className="holiday-name">
          <strong lang={thai ? 'th' : 'en'}>{primary}</strong>
          {status ? <span className={`pill pill-${status}`}>{t(`status.${status}`)}</span> : null}
        </div>
        <div className="holiday-alt" lang={thai ? 'en' : 'th'}>
          {secondary}
        </div>
        {h.note ? <div className="holiday-note">{h.note}</div> : null}
      </div>
      <div className="holiday-meta">
        <time dateTime={h.date} className="holiday-date">
          {fmtShortDate(h.date)}
        </time>
        <Badge value={h.type} kind="holidayType" tone={HOLIDAY_TONE[h.type]} />
      </div>
      <div className="holiday-actions">
        <button
          type="button"
          className="btn btn-small"
          aria-label={t('actions.editAria', { name: primary })}
          onClick={onEdit}
        >
          {t('actions.edit')}
        </button>
        <button
          type="button"
          className="btn btn-small btn-danger-outline"
          aria-label={t('actions.deleteAria', { name: primary })}
          onClick={onDelete}
        >
          {t('actions.delete')}
        </button>
      </div>
    </li>
  );
}

/** Same rules as the shared `CreateHolidaySchema`, with messages in the current language. */
const HolidayForm = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg(() => t('holidays:validation.date'))),
  type: HolidayTypeSchema,
  nameEn: z
    .string()
    .trim()
    .min(1, msg(() => t('holidays:validation.nameEn')))
    .max(160),
  nameTh: z
    .string()
    .trim()
    .min(1, msg(() => t('holidays:validation.nameTh')))
    .max(160),
  note: z.string().trim().max(500),
});
type HolidayFormInput = z.input<typeof HolidayForm>;
type HolidayFormOutput = z.output<typeof HolidayForm>;

const isClash = (e: unknown): e is ApiRequestError =>
  e instanceof ApiRequestError && e.code === ErrorCode.HOLIDAY_EXISTS;

/** The holiday already on the chosen date (409 HOLIDAY_EXISTS `details.holiday`), shown as a date field error. */
function clashMessage(e: unknown): string | undefined {
  if (!isClash(e)) return undefined;
  const existing = (e.details as { holiday?: HolidayDto } | undefined)?.holiday;
  if (!existing) return errorMessage(e);
  return t('holidays:validation.dateTaken', {
    name: `${holidayName(existing)} (${fmtShortDateYear(existing.date)})`,
  });
}

/** Add a holiday, or edit one (same form). */
export function HolidayDialog({
  holiday,
  onClose,
  onDone,
}: {
  holiday: AdminHolidayDto | null;
  onClose: () => void;
  onDone: (h: AdminHolidayDto, added: boolean) => void;
}) {
  const { t } = useTranslation(['holidays', 'common']);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HolidayFormInput, unknown, HolidayFormOutput>({
    resolver: zodResolver(HolidayForm),
    defaultValues: holiday
      ? { date: holiday.date, type: holiday.type, nameEn: holiday.nameEn, nameTh: holiday.nameTh, note: holiday.note ?? '' }
      : { date: '', type: HolidayType.UNIVERSITY, nameEn: '', nameTh: '', note: '' },
  });
  const save = useMutation({
    mutationFn: (v: HolidayFormOutput) =>
      holiday
        ? // the whole form is sent; an empty note clears it
          api.patch<AdminHolidayDto>(`/admin/holidays/${holiday.id}`, v satisfies UpdateHoliday)
        : api.post<AdminHolidayDto>('/admin/holidays', {
            date: v.date,
            nameEn: v.nameEn,
            nameTh: v.nameTh,
            type: v.type,
            ...(v.note ? { note: v.note } : {}),
          } satisfies CreateHoliday),
    onSuccess: (h) => onDone(h, !holiday),
  });

  const formId = holiday ? 'edit-holiday' : 'add-holiday';
  return (
    <Dialog
      title={holiday ? t('form.editTitle') : t('form.addTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={save.isPending}>
            {holiday ? t('form.save') : t('form.add')}
          </button>
        </>
      }
    >
      <form id={formId} className="grid-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <label className="field">
          <span>{t('form.date')}</span>
          {/* choosing another date clears the "already a holiday" message of the last attempt */}
          <input type="date" {...register('date', { onChange: () => save.reset() })} />
          <FieldError message={errors.date?.message ?? clashMessage(save.error)} />
        </label>
        <label className="field">
          <span>{t('form.type')}</span>
          <select {...register('type')}>
            {HOLIDAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {enumLabel('holidayType', type)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('form.nameEn')}</span>
          <input lang="en" {...register('nameEn')} />
          <FieldError message={errors.nameEn?.message} />
        </label>
        <label className="field">
          <span>{t('form.nameTh')}</span>
          <input lang="th" {...register('nameTh')} />
          <FieldError message={errors.nameTh?.message} />
        </label>
        <label className="field span-2">
          <span>{t('form.note')}</span>
          <textarea rows={2} placeholder={t('form.notePlaceholder')} {...register('note')} />
          <FieldError message={errors.note?.message} />
        </label>
        <div className="span-2">{isClash(save.error) ? null : <ErrorBox error={save.error} />}</div>
      </form>
    </Dialog>
  );
}
