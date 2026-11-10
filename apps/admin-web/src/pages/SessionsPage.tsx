import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Badge, Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader, Pagination } from '../components/ui';
import { bangkokInputsToIso, fmtTime, isoToBangkokInputs, lastDays, methodLabel } from '../lib/format';

const PAGE_SIZE = 25;

export function SessionsPage() {
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
      <PageHeader title="Attendance sessions" subtitle="All times are Asia/Bangkok." />
      <div className="filters">
        <label className="field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Search</span>
          <input
            type="search"
            placeholder="Name, staff ID or email"
            value={q}
            onChange={(e) => resetPage(setQ)(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Department</span>
          <input value={department} onChange={(e) => resetPage(setDepartment)(e.target.value)} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
            <option value="">All</option>
            <option value={SessionStatus.OPEN}>Open</option>
            <option value={SessionStatus.COMPLETED}>Completed</option>
          </select>
        </label>
      </div>
      {rangeInvalid ? <div className="alert alert-error">“From” must not be after “To”.</div> : null}
      <ErrorBox error={list.error} />
      {list.isPending && !rangeInvalid ? <Loading /> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <Empty>No sessions match these filters.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Department</th>
                    <th>Date</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Status</th>
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
                        <Badge value={s.status} /> {s.corrected ? <Badge label="Corrected" tone="amber" /> : null}
                      </td>
                      <td className="right">
                        <button type="button" className="btn btn-small" onClick={() => setEditing(s)}>
                          Edit
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
  inDate: z.string().min(1, 'Required'),
  inTime: z.string().min(1, 'Required'),
  outDate: z.string(),
  outTime: z.string(),
  reason: z.string().trim().min(3, 'A reason is required (at least 3 characters)').max(1000),
});
type EditForm = z.infer<typeof EditForm>;

/** Edit check-in/out times (entered in Bangkok time) with a mandatory reason → PATCH. */
export function SessionEditDialog({ session, onClose }: { session: AdminSessionDto; onClose: () => void }) {
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
    if (!checkInAt) return setError('inTime', { message: 'Enter the check-in date and time' });
    if (!!v.outDate !== !!v.outTime) return setError('outTime', { message: 'Enter both the date and the time' });
    const checkOutAt = bangkokInputsToIso(v.outDate, v.outTime);
    if (session.checkOutAt && !checkOutAt)
      return setError('outTime', { message: 'A completed session needs a check-out time' });
    if (checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt))
      return setError('outTime', { message: 'Check-out cannot be before check-in' });

    const sameMinute = (a: string | null, b: string | null) =>
      a === b || (!!a && !!b && Math.floor(Date.parse(a) / 60_000) === Math.floor(Date.parse(b) / 60_000));
    const body: AdminEditSession = { reason: v.reason.trim() };
    if (!sameMinute(checkInAt, session.checkInAt)) body.checkInAt = checkInAt;
    if (!sameMinute(checkOutAt, session.checkOutAt)) body.checkOutAt = checkOutAt;
    const parsed = AdminEditSessionSchema.safeParse(body);
    if (!parsed.success) return setError('root', { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
    save.mutate(parsed.data);
  });

  return (
    <Dialog
      title={`Edit session — ${session.user.fullName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="session-edit" className="btn btn-primary" disabled={save.isPending}>
            Save correction
          </button>
        </>
      }
    >
      <form id="session-edit" onSubmit={onSubmit} noValidate>
        <p className="muted small">Enter times in Bangkok time (UTC+7). The record will be marked as corrected and logged.</p>
        <fieldset className="grid-2">
          <legend>Check in</legend>
          <label className="field">
            <span>Date</span>
            <input type="date" aria-label="Check-in date" {...register('inDate')} />
            <FieldError message={errors.inDate?.message} />
          </label>
          <label className="field">
            <span>Time</span>
            <input type="time" aria-label="Check-in time" {...register('inTime')} />
            <FieldError message={errors.inTime?.message} />
          </label>
        </fieldset>
        <fieldset className="grid-2">
          <legend>Check out {session.status === SessionStatus.OPEN ? '(leave empty to keep the session open)' : ''}</legend>
          <label className="field">
            <span>Date</span>
            <input type="date" aria-label="Check-out date" {...register('outDate')} />
          </label>
          <label className="field">
            <span>Time</span>
            <input type="time" aria-label="Check-out time" {...register('outTime')} />
            <FieldError message={errors.outTime?.message} />
          </label>
        </fieldset>
        <label className="field">
          <span>Reason (required)</span>
          <textarea rows={3} aria-label="Reason" {...register('reason')} />
          <FieldError message={errors.reason?.message} />
        </label>
        <FieldError message={errors.root?.message} />
        <ErrorBox error={save.error} />
      </form>
    </Dialog>
  );
}
