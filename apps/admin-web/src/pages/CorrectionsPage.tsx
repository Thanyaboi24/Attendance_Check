import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CorrectionStatus,
  ReviewCorrectionSchema,
  type CorrectionDto,
  type Paginated,
  type ReviewCorrection,
} from '@attendance/shared';
import { api } from '../api/client';
import { Badge, Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader, Pagination } from '../components/ui';
import { bangkokInputsToIso, fmtDateTime, humanize, isoToBangkokInputs } from '../lib/format';

const PAGE_SIZE = 25;

export function CorrectionsPage() {
  const [status, setStatus] = useState<string>(CorrectionStatus.PENDING);
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<CorrectionDto | null>(null);
  const query = { status, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['corrections', query],
    queryFn: () => api.get<Paginated<CorrectionDto>>('/admin/corrections', query),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Correction requests" subtitle="Staff requests to fix missing or incorrect attendance records." />
      <div className="filters">
        <label className="field">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {Object.values(CorrectionStatus).map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox error={list.error} />
      {list.isPending ? <Loading /> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <Empty>{status === CorrectionStatus.PENDING ? 'No pending corrections.' : 'No corrections found.'}</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Staff</th>
                    <th>Work date</th>
                    <th>Requested check in</th>
                    <th>Requested check out</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((c) => (
                    <tr key={c.id}>
                      <td>{fmtDateTime(c.createdAt)}</td>
                      <td>
                        <div>{c.user.fullName}</div>
                        <div className="muted small">{[c.user.staffId, c.user.department].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td>{c.workDate}</td>
                      <td>{fmtDateTime(c.requestedCheckInAt)}</td>
                      <td>{fmtDateTime(c.requestedCheckOutAt)}</td>
                      <td className="wrap">{c.reason}</td>
                      <td>
                        <Badge value={c.status} />
                        {c.reviewNote ? <div className="muted small">“{c.reviewNote}”</div> : null}
                        {c.reviewer ? (
                          <div className="muted small">
                            by {c.reviewer.fullName}, {fmtDateTime(c.reviewedAt)}
                          </div>
                        ) : null}
                      </td>
                      <td className="right">
                        {c.status === CorrectionStatus.PENDING ? (
                          <button type="button" className="btn btn-small btn-primary" onClick={() => setReviewing(c)}>
                            Review
                          </button>
                        ) : null}
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
      {reviewing ? <CorrectionReviewDialog correction={reviewing} onClose={() => setReviewing(null)} /> : null}
    </>
  );
}

const ReviewForm = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  inDate: z.string(),
  inTime: z.string(),
  outDate: z.string(),
  outTime: z.string(),
  note: z.string().trim().min(3, 'A note is required (at least 3 characters)').max(1000),
});
type ReviewForm = z.infer<typeof ReviewForm>;

/** Approve (optionally adjusting the times, entered in Bangkok time) or reject; a note is always required. */
export function CorrectionReviewDialog({ correction, onClose }: { correction: CorrectionDto; onClose: () => void }) {
  const qc = useQueryClient();
  const reqIn = isoToBangkokInputs(correction.requestedCheckInAt);
  const reqOut = isoToBangkokInputs(correction.requestedCheckOutAt);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<ReviewForm>({
    resolver: zodResolver(ReviewForm),
    defaultValues: {
      decision: 'APPROVE',
      inDate: reqIn.date || correction.workDate,
      inTime: reqIn.time,
      outDate: reqOut.date || correction.workDate,
      outTime: reqOut.time,
      note: '',
    },
  });
  const decision = watch('decision');

  const review = useMutation({
    mutationFn: (body: ReviewCorrection) => api.post<CorrectionDto>(`/admin/corrections/${correction.id}/review`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['corrections'] });
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onClose();
    },
  });

  const onSubmit = handleSubmit((v) => {
    const body: ReviewCorrection = { decision: v.decision, note: v.note.trim() };
    if (v.decision === 'APPROVE') {
      if (!!v.inDate !== !!v.inTime && v.inTime) return setError('inTime', { message: 'Enter both date and time' });
      if (!!v.outDate !== !!v.outTime && v.outTime) return setError('outTime', { message: 'Enter both date and time' });
      const checkInAt = bangkokInputsToIso(v.inDate, v.inTime);
      const checkOutAt = bangkokInputsToIso(v.outDate, v.outTime);
      if (!checkInAt && !checkOutAt) return setError('inTime', { message: 'Provide a check-in time, a check-out time, or both' });
      body.checkInAt = checkInAt;
      body.checkOutAt = checkOutAt;
    }
    const parsed = ReviewCorrectionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] === 'checkOutAt' ? 'outTime' : issue?.path[0] === 'note' ? 'note' : 'root';
      return setError(field, { message: issue?.message ?? 'Invalid input' });
    }
    review.mutate(parsed.data);
  });

  return (
    <Dialog
      title="Review correction"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="correction-review"
            className={`btn ${decision === 'REJECT' ? 'btn-danger' : 'btn-primary'}`}
            disabled={review.isPending}
          >
            {decision === 'REJECT' ? 'Reject' : 'Approve'}
          </button>
        </>
      }
    >
      <form id="correction-review" onSubmit={onSubmit} noValidate>
        <dl className="kv">
          <dt>Staff</dt>
          <dd>{correction.user.fullName}</dd>
          <dt>Work date</dt>
          <dd>{correction.workDate}</dd>
          <dt>Requested</dt>
          <dd>
            in {fmtDateTime(correction.requestedCheckInAt)} · out {fmtDateTime(correction.requestedCheckOutAt)}
          </dd>
          <dt>Reason</dt>
          <dd className="wrap">{correction.reason}</dd>
        </dl>
        <div className="radio-row" role="radiogroup" aria-label="Decision">
          <label>
            <input type="radio" value="APPROVE" {...register('decision')} /> Approve
          </label>
          <label>
            <input type="radio" value="REJECT" {...register('decision')} /> Reject
          </label>
        </div>
        {decision === 'APPROVE' ? (
          <>
            <p className="muted small">Adjust the times if needed (Bangkok time). Approval updates or creates the session.</p>
            <fieldset className="grid-2">
              <legend>Check in</legend>
              <input type="date" aria-label="Check-in date" {...register('inDate')} />
              <input type="time" aria-label="Check-in time" {...register('inTime')} />
              <FieldError message={errors.inTime?.message} />
            </fieldset>
            <fieldset className="grid-2">
              <legend>Check out</legend>
              <input type="date" aria-label="Check-out date" {...register('outDate')} />
              <input type="time" aria-label="Check-out time" {...register('outTime')} />
              <FieldError message={errors.outTime?.message} />
            </fieldset>
          </>
        ) : null}
        <label className="field">
          <span>Note to staff (required)</span>
          <textarea rows={3} aria-label="Review note" {...register('note')} />
          <FieldError message={errors.note?.message} />
        </label>
        <FieldError message={errors.root?.message} />
        <ErrorBox error={review.error} />
      </form>
    </Dialog>
  );
}
