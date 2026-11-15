import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  AccountStatus,
  ErrorCode,
  type ApproveSignup,
  type Paginated,
  type RejectSignup,
  type SignupDto,
  type SignupStatus,
} from '@attendance/shared';
import { api, ApiRequestError } from '../api/client';
import { Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader, Pagination } from '../components/ui';
import { t } from '../i18n';
import { fmtDateTime } from '../lib/format';
import { msg } from '../lib/validation';

const PAGE_SIZE = 25;
/** The global `t` (always the current language), for messages built outside render. */
const tr = t;

const TABS: readonly SignupStatus[] = [AccountStatus.PENDING_APPROVAL, AccountStatus.ACTIVE, AccountStatus.REJECTED];

type Decision = 'approve' | 'reject';
/** A flash message is kept as a function so it follows the language switch. */
type Flash = { text: () => string; tone: 'success' | 'info' };

const isNotPending = (e: unknown) => e instanceof ApiRequestError && e.code === ErrorCode.SIGNUP_NOT_PENDING;

export function SignupsPage() {
  const { t } = useTranslation(['signups', 'common']);
  const [status, setStatus] = useState<SignupStatus>(AccountStatus.PENDING_APPROVAL);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<{ kind: Decision; signup: SignupDto } | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const query = { status, q: q.trim(), page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['signups', query],
    queryFn: () => api.get<Paginated<SignupDto>>('/admin/signups', query),
    placeholderData: keepPreviousData,
  });

  const pending = status === AccountStatus.PENDING_APPROVAL;
  const rejected = status === AccountStatus.REJECTED;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {flash ? (
        <div className={`alert alert-${flash.tone}`} role="status">
          {flash.text()}{' '}
          <button type="button" className="btn-link" onClick={() => setFlash(null)}>
            {t('common:actions.dismiss')}
          </button>
        </div>
      ) : null}
      <div className="filters">
        <div className="field">
          <span>{t('common:filters.status')}</span>
          <div className="row gap wrap" role="tablist" aria-label={t('tabs.label')}>
            {TABS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === status}
                className={`btn btn-small${s === status ? ' btn-primary' : ''}`}
                onClick={() => (setStatus(s), setPage(1))}
              >
                {t(`tabs.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="field grow">
          <span>{t('common:filters.search')}</span>
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
      </div>
      <ErrorBox error={list.error} />
      {list.isPending ? <Loading /> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <Empty>
            {pending && !q.trim() ? (
              <>
                <strong>{t('emptyPending')}</strong>
                <div className="muted small">{t('emptyPendingHint')}</div>
              </>
            ) : (
              t('empty')
            )}
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('col.name')}</th>
                    <th>{t('col.staffId')}</th>
                    <th>{t('col.email')}</th>
                    <th>{t('col.department')}</th>
                    <th>{t('col.submitted')}</th>
                    {pending ? (
                      <th />
                    ) : (
                      <>
                        <th>{t('col.reviewedBy')}</th>
                        <th>{t('col.reviewedAt')}</th>
                        <th>{rejected ? t('col.reason') : t('col.note')}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((s) => (
                    <tr key={s.id}>
                      <td>{s.fullName}</td>
                      <td>{s.staffId}</td>
                      <td>{s.email}</td>
                      <td>{s.department}</td>
                      <td>{fmtDateTime(s.createdAt)}</td>
                      {pending ? (
                        <td className="right nowrap">
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            aria-label={t('actions.approveAria', { name: s.fullName })}
                            onClick={() => setReviewing({ kind: 'approve', signup: s })}
                          >
                            {t('actions.approve')}
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-small btn-danger-outline"
                            aria-label={t('actions.rejectAria', { name: s.fullName })}
                            onClick={() => setReviewing({ kind: 'reject', signup: s })}
                          >
                            {t('actions.reject')}
                          </button>
                        </td>
                      ) : (
                        <>
                          <td>{s.reviewedBy?.fullName ?? '—'}</td>
                          <td>{fmtDateTime(s.reviewedAt)}</td>
                          <td className="wrap">{s.reviewNote || <span className="muted">—</span>}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
          </>
        )
      ) : null}
      {reviewing ? (
        <SignupReviewDialog
          kind={reviewing.kind}
          signup={reviewing.signup}
          onClose={() => setReviewing(null)}
          onDone={(f) => {
            setFlash(f);
            setReviewing(null);
          }}
        />
      ) : null}
    </>
  );
}

const ApproveForm = z.object({ note: z.string().trim().max(500) });
const RejectForm = z.object({
  note: z
    .string()
    .trim()
    .min(1, msg(() => t('signups:validation.reasonRequired')))
    .max(500),
});
type ReviewForm = z.infer<typeof ApproveForm>;

/** Approve (optional note) or reject (reason required) one pending sign-up request. */
export function SignupReviewDialog({
  kind,
  signup,
  onClose,
  onDone,
}: {
  kind: Decision;
  signup: SignupDto;
  onClose: () => void;
  onDone: (flash: Flash) => void;
}) {
  const { t } = useTranslation(['signups', 'common']);
  const qc = useQueryClient();
  const approving = kind === 'approve';
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReviewForm>({
    resolver: zodResolver(approving ? ApproveForm : RejectForm),
    defaultValues: { note: '' },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['signups'] });
    void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    void qc.invalidateQueries({ queryKey: ['users'] });
  };

  const decide = useMutation({
    mutationFn: (note: string) =>
      approving
        ? api.post<SignupDto>(`/admin/signups/${signup.id}/approve`, (note ? { note } : {}) satisfies ApproveSignup)
        : api.post<SignupDto>(`/admin/signups/${signup.id}/reject`, { reason: note } satisfies RejectSignup),
    onSuccess: (s) => {
      refresh();
      onDone({
        tone: 'success',
        text: () => tr(approving ? 'signups:flash.approved' : 'signups:flash.rejected', { name: s.fullName }),
      });
    },
    onError: (e) => {
      // Another administrator decided first: close, explain, and show the current list.
      if (!isNotPending(e)) return;
      refresh();
      onDone({ tone: 'info', text: () => tr('signups:flash.alreadyReviewed', { name: signup.fullName }) });
    },
  });

  const formId = `signup-${kind}`;
  return (
    <Dialog
      title={approving ? t('approve.title') : t('reject.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </button>
          <button
            type="submit"
            form={formId}
            className={`btn ${approving ? 'btn-primary' : 'btn-danger'}`}
            disabled={decide.isPending}
          >
            {approving ? t('actions.approve') : t('actions.reject')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit((v) => decide.mutate(v.note))} noValidate>
        <p>{t(approving ? 'approve.body' : 'reject.body', { name: signup.fullName, email: signup.email })}</p>
        <dl className="kv">
          <dt>{t('col.staffId')}</dt>
          <dd>{signup.staffId}</dd>
          <dt>{t('col.department')}</dt>
          <dd>{signup.department}</dd>
          <dt>{t('col.submitted')}</dt>
          <dd>{fmtDateTime(signup.createdAt)}</dd>
        </dl>
        <label className="field">
          <span>{approving ? t('approve.noteLabel') : t('reject.reasonLabel')}</span>
          <textarea rows={3} {...register('note')} />
          <FieldError message={errors.note?.message} />
        </label>
        {isNotPending(decide.error) ? null : <ErrorBox error={decide.error} />}
      </form>
    </Dialog>
  );
}
