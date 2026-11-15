import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  AdminEditSessionSchema,
  SessionStatus,
  toBangkokDate,
  type AdminEditSession,
  type AdminSessionDto,
  type Paginated,
} from '@attendance/shared';
import { api } from '../api/client';
import { t } from '../i18n';
import { Badge, Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader, Pagination } from '../components/ui';
import { bangkokInputsToIso, enumLabel, fmtTime, isoToBangkokInputs, lastDays, methodLabel } from '../lib/format';
import { msg } from '../lib/validation';

const PAGE_SIZE = 25;

export function SessionsPage() {
  const { t } = useTranslation(['sessions', 'common']);
  const initial = lastDays(7);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminSessionDto | null>(null);

  const rangeInvalid = !!from && !!to && from > to;
  const query = { from, to, q: q.trim(), department: department.trim(), status, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['sessions', query],
    queryFn: () => api.get<Paginated<AdminSessionDto>>('/admin/attendance/sessions', query),
    enabled: !!from && !!to && !rangeInvalid,
    placeholderData: keepPreviousData,
  });

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="filters">
        <label className="field">
          <span>{t('common:filters.from')}</span>
          <input type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('common:filters.to')}</span>
          <input type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} />
        </label>
        <label className="field grow">
          <span>{t('common:filters.search')}</span>
          <input
            type="search"
            placeholder={t('common:filters.nameStaffIdOrEmail')}
            value={q}
            onChange={(e) => resetPage(setQ)(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t('common:filters.department')}</span>
          <input value={department} onChange={(e) => resetPage(setDepartment)(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('common:filters.status')}</span>
          <select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
            <option value="">{t('common:filters.all')}</option>
            <option value={SessionStatus.OPEN}>{enumLabel('sessionStatus', SessionStatus.OPEN)}</option>
            <option value={SessionStatus.COMPLETED}>{enumLabel('sessionStatus', SessionStatus.COMPLETED)}</option>
          </select>
        </label>
      </div>
      {rangeInvalid ? <div className="alert alert-error">{t('rangeInvalid')}</div> : null}
      <ErrorBox error={list.error} />
      {list.isPending && !rangeInvalid ? <Loading /> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <Empty>{t('empty')}</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('col.staff')}</th>
                    <th>{t('col.department')}</th>
                    <th>{t('col.date')}</th>
                    <th>{t('col.checkIn')}</th>
                    <th>{t('col.checkOut')}</th>
                    <th>{t('col.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div>{s.user.fullName}</div>
                        <div className="muted small">{s.user.staffId}</div>
                      </td>
                      <td>{s.user.department}</td>
                      <td>{toBangkokDate(s.checkInAt)}</td>
                      <td>
                        {fmtTime(s.checkInAt)} <Badge value={s.checkInMethod} label={methodLabel(s.checkInMethod)} />
                      </td>
                      <td>
                        {s.checkOutAt ? (
                          <>
                            {s.checkOutAt && toBangkokDate(s.checkOutAt) !== toBangkokDate(s.checkInAt)
                              ? `${toBangkokDate(s.checkOutAt)} `
                              : ''}
                            {fmtTime(s.checkOutAt)} <Badge value={s.checkOutMethod} label={methodLabel(s.checkOutMethod)} />
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Badge value={s.status} kind="sessionStatus" /> {s.corrected ? <Badge label={t('corrected')} tone="amber" /> : null}
                      </td>
                      <td className="right">
                        <button type="button" className="btn btn-small" onClick={() => setEditing(s)}>
                          {t('common:actions.edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
          </>
        )
      ) : null}
      {editing ? <SessionEditDialog session={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

const EditForm = z.object({
  inDate: z.string().min(1, msg(() => t('sessions:validation.required'))),
  inTime: z.string().min(1, msg(() => t('sessions:validation.required'))),
  outDate: z.string(),
  outTime: z.string(),
  reason: z
    .string()
    .trim()
    .min(3, msg(() => t('sessions:validation.reasonRequired')))
    .max(1000),
});
type EditForm = z.infer<typeof EditForm>;

/** Edit check-in/out times (entered in Bangkok time) with a mandatory reason → PATCH. */
export function SessionEditDialog({ session, onClose }: { session: AdminSessionDto; onClose: () => void }) {
  const { t } = useTranslation(['sessions', 'common']);
  const qc = useQueryClient();
  const inParts = isoToBangkokInputs(session.checkInAt);
  const outParts = isoToBangkokInputs(session.checkOutAt);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EditForm>({
    resolver: zodResolver(EditForm),
    defaultValues: { inDate: inParts.date, inTime: inParts.time, outDate: outParts.date, outTime: outParts.time, reason: '' },
  });

  const save = useMutation({
    mutationFn: (body: AdminEditSession) => api.patch<AdminSessionDto>(`/admin/attendance/sessions/${session.id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onClose();
    },
  });

  const onSubmit = handleSubmit((v) => {
    const checkInAt = bangkokInputsToIso(v.inDate, v.inTime);
    if (!checkInAt) return setError('inTime', { message: t('validation.enterCheckIn') });
    if (!!v.outDate !== !!v.outTime) return setError('outTime', { message: t('validation.enterBoth') });
    const checkOutAt = bangkokInputsToIso(v.outDate, v.outTime);
    if (session.checkOutAt && !checkOutAt)
      return setError('outTime', { message: t('validation.needsCheckOut') });
    if (checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt))
      return setError('outTime', { message: t('validation.outBeforeIn') });

    const sameMinute = (a: string | null, b: string | null) =>
      a === b || (!!a && !!b && Math.floor(Date.parse(a) / 60_000) === Math.floor(Date.parse(b) / 60_000));
    const body: AdminEditSession = { reason: v.reason.trim() };
    if (!sameMinute(checkInAt, session.checkInAt)) body.checkInAt = checkInAt;
    if (!sameMinute(checkOutAt, session.checkOutAt)) body.checkOutAt = checkOutAt;
    const parsed = AdminEditSessionSchema.safeParse(body);
    if (!parsed.success) {
      // The shared schema's messages are English; show ours for the cases a valid form can still hit.
      const issue = parsed.error.issues[0];
      const message =
        issue?.path[0] === 'reason'
          ? t('validation.reasonRequired')
          : issue?.path.length === 0
            ? t('validation.nothingToChange')
            : t('common:validation.invalidInput');
      return setError('root', { message });
    }
    save.mutate(parsed.data);
  });

  return (
    <Dialog
      title={t('edit.title', { name: session.user.fullName })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form="session-edit" className="btn btn-primary" disabled={save.isPending}>
            {t('edit.save')}
          </button>
        </>
      }
    >
      <form id="session-edit" onSubmit={onSubmit} noValidate>
        <p className="muted small">{t('edit.intro')}</p>
        <fieldset className="grid-2">
          <legend>{t('edit.checkIn')}</legend>
          <label className="field">
            <span>{t('edit.date')}</span>
            <input type="date" aria-label={t('edit.checkInDate')} {...register('inDate')} />
            <FieldError message={errors.inDate?.message} />
          </label>
          <label className="field">
            <span>{t('edit.time')}</span>
            <input type="time" aria-label={t('edit.checkInTime')} {...register('inTime')} />
            <FieldError message={errors.inTime?.message} />
          </label>
        </fieldset>
        <fieldset className="grid-2">
          <legend>
            {t('edit.checkOut')} {session.status === SessionStatus.OPEN ? t('edit.keepOpen') : ''}
          </legend>
          <label className="field">
            <span>{t('edit.date')}</span>
            <input type="date" aria-label={t('edit.checkOutDate')} {...register('outDate')} />
          </label>
          <label className="field">
            <span>{t('edit.time')}</span>
            <input type="time" aria-label={t('edit.checkOutTime')} {...register('outTime')} />
            <FieldError message={errors.outTime?.message} />
          </label>
        </fieldset>
        <label className="field">
          <span>{t('edit.reasonLabel')}</span>
          <textarea rows={3} aria-label={t('edit.reasonAria')} {...register('reason')} />
          <FieldError message={errors.reason?.message} />
        </label>
        <FieldError message={errors.root?.message} />
        <ErrorBox error={save.error} />
      </form>
    </Dialog>
  );
}
