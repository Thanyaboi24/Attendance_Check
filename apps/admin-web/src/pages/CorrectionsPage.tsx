import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  CorrectionStatus,
  ReviewCorrectionSchema,
  type CorrectionDto,
  type Paginated,
  type ReviewCorrection,
} from '@attendance/shared';
import { api } from '../api/client';
import { t } from '../i18n';
import { Badge, Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader, Pagination } from '../components/ui';
import { bangkokInputsToIso, enumLabel, fmtDateTime, isoToBangkokInputs } from '../lib/format';
import { msg } from '../lib/validation';

const PAGE_SIZE = 25;

export function CorrectionsPage() {
  const { t } = useTranslation(['corrections', 'common']);
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
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="filters">
        <label className="field">
          <span>{t('common:filters.status')}</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('common:filters.all')}</option>
            {Object.values(CorrectionStatus).map((s) => (
              <option key={s} value={s}>
                {enumLabel('correctionStatus', s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox error={list.error} />
      {list.isPending ? <Loading /> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <Empty>{status === CorrectionStatus.PENDING ? t('emptyPending') : t('empty')}</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('col.submitted')}</th>
                    <th>{t('col.staff')}</th>
                    <th>{t('col.workDate')}</th>
                    <th>{t('col.requestedIn')}</th>
                    <th>{t('col.requestedOut')}</th>
                    <th>{t('col.reason')}</th>
                    <th>{t('col.status')}</th>
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
                        <Badge value={c.status} kind="correctionStatus" />
                        {c.reviewNote ? <div className="muted small">“{c.reviewNote}”</div> : null}
                        {c.reviewer ? (
                          <div className="muted small">
                            {t('reviewedBy', { name: c.reviewer.fullName, time: fmtDateTime(c.reviewedAt) })}
                          </div>
                        ) : null}
                      </td>
                      <td className="right">
                        {c.status === CorrectionStatus.PENDING ? (
                          <button type="button" className="btn btn-small btn-primary" onClick={() => setReviewing(c)}>
                            {t('common:actions.review')}
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
  note: z
    .string()
    .trim()
    .min(3, msg(() => t('corrections:validation.noteRequired')))
    .max(1000),
});
type ReviewForm = z.infer<typeof ReviewForm>;

/** Approve (optionally adjusting the times, entered in Bangkok time) or reject; a note is always required. */
export function CorrectionReviewDialog({
  correction,
  onClose,
  initialDecision = 'APPROVE',
}: {
  correction: CorrectionDto;
  onClose: () => void;
  /** Preselected decision (the dashboard's Approve / Reject buttons). */
  initialDecision?: 'APPROVE' | 'REJECT';
}) {
  const { t } = useTranslation(['corrections', 'common']);
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
      decision: initialDecision,
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
      if (!!v.inDate !== !!v.inTime && v.inTime) return setError('inTime', { message: t('validation.enterBoth') });
      if (!!v.outDate !== !!v.outTime && v.outTime) return setError('outTime', { message: t('validation.enterBoth') });
      const checkInAt = bangkokInputsToIso(v.inDate, v.inTime);
      const checkOutAt = bangkokInputsToIso(v.outDate, v.outTime);
      if (!checkInAt && !checkOutAt) return setError('inTime', { message: t('validation.needTime') });
      body.checkInAt = checkInAt;
      body.checkOutAt = checkOutAt;
    }
    const parsed = ReviewCorrectionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] === 'checkOutAt' ? 'outTime' : issue?.path[0] === 'note' ? 'note' : 'root';
      // The shared schema's messages are English; show ours for each field it can reject.
      const message =
        field === 'outTime'
          ? t('validation.outBeforeIn')
          : field === 'note'
            ? t('validation.noteRequired')
            : t('common:validation.invalidInput');
      return setError(field, { message });
    }
    review.mutate(parsed.data);
  });

  return (
    <Dialog
      title={t('review.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </button>
          <button
            type="submit"
            form="correction-review"
            className={`btn ${decision === 'REJECT' ? 'btn-danger' : 'btn-primary'}`}
            disabled={review.isPending}
          >
            {decision === 'REJECT' ? t('review.reject') : t('review.approve')}
          </button>
        </>
      }
    >
      <form id="correction-review" onSubmit={onSubmit} noValidate>
        <dl className="kv">
          <dt>{t('review.staff')}</dt>
          <dd>{correction.user.fullName}</dd>
          <dt>{t('review.workDate')}</dt>
          <dd>{correction.workDate}</dd>
          <dt>{t('review.requested')}</dt>
          <dd>
            {t('review.requestedValue', {
              in: fmtDateTime(correction.requestedCheckInAt),
              out: fmtDateTime(correction.requestedCheckOutAt),
            })}
          </dd>
          <dt>{t('review.reason')}</dt>
          <dd className="wrap">{correction.reason}</dd>
        </dl>
        <div className="radio-row" role="radiogroup" aria-label={t('review.decision')}>
          <label>
            <input type="radio" value="APPROVE" {...register('decision')} /> {t('review.approve')}
          </label>
          <label>
            <input type="radio" value="REJECT" {...register('decision')} /> {t('review.reject')}
          </label>
        </div>
        {decision === 'APPROVE' ? (
          <>
            <p className="muted small">{t('review.adjustHint')}</p>
            <fieldset className="grid-2">
              <legend>{t('review.checkIn')}</legend>
              <input type="date" aria-label={t('review.checkInDate')} {...register('inDate')} />
              <input type="time" aria-label={t('review.checkInTime')} {...register('inTime')} />
              <FieldError message={errors.inTime?.message} />
            </fieldset>
            <fieldset className="grid-2">
              <legend>{t('review.checkOut')}</legend>
              <input type="date" aria-label={t('review.checkOutDate')} {...register('outDate')} />
              <input type="time" aria-label={t('review.checkOutTime')} {...register('outTime')} />
              <FieldError message={errors.outTime?.message} />
            </fieldset>
          </>
        ) : null}
        <label className="field">
          <span>{t('review.noteLabel')}</span>
          <textarea rows={3} aria-label={t('review.noteAria')} {...register('note')} />
          <FieldError message={errors.note?.message} />
        </label>
        <FieldError message={errors.root?.message} />
        <ErrorBox error={review.error} />
      </form>
    </Dialog>
  );
}
