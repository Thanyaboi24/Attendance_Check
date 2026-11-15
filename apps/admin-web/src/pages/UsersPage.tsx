import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  AccountStatus,
  Role,
  RoleSchema,
  type AdminUserDto,
  type CreateUser,
  type Paginated,
  type UpdateUser,
} from '@attendance/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { roleLabel } from '../auth/roles';
import { Badge, ConfirmDialog, Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader, Pagination } from '../components/ui';
import { t } from '../i18n';
import { enumLabel, fmtDateTime } from '../lib/format';
import { emailField, msg } from '../lib/validation';

const PAGE_SIZE = 25;
/** The global `t` (always the current language), for messages built outside render. */
const tr = t;

/** Self-registrations still under (or refused at) review: their status is decided on the Sign-up requests page. */
const isSignupReview = (u: AdminUserDto) =>
  u.status === AccountStatus.PENDING_APPROVAL || u.status === AccountStatus.REJECTED;

type Pending =
  | { kind: 'toggle'; user: AdminUserDto }
  | { kind: 'resend'; user: AdminUserDto }
  | { kind: 'edit'; user: AdminUserDto }
  | { kind: 'create' };

/** A flash message is kept as a function so it follows the language switch. */
type Flash = { text: () => string };

export function UsersPage() {
  const { t } = useTranslation(['users', 'common']);
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const query = { q: q.trim(), role, status, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['users', query],
    queryFn: () => api.get<Paginated<AdminUserDto>>('/admin/users', query),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (u: AdminUserDto) =>
      api.patch<AdminUserDto>(`/admin/users/${u.id}`, {
        status: u.status === AccountStatus.DEACTIVATED ? AccountStatus.ACTIVE : AccountStatus.DEACTIVATED,
      } satisfies UpdateUser),
    onSuccess: (u) => {
      setFlash({
        text: () =>
          tr('users:flash.statusChanged', { name: u.fullName, status: enumLabel('accountStatus', u.status).toLowerCase() }),
      });
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
  const resend = useMutation({
    mutationFn: (u: AdminUserDto) => api.post<{ ok: true }>(`/admin/users/${u.id}/resend-activation`),
    onSuccess: (_r, u) => {
      setFlash({ text: () => tr('users:flash.activationResent', { email: u.email }) });
      setPending(null);
    },
  });

  const closePending = () => {
    toggle.reset();
    resend.reset();
    setPending(null);
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setPending({ kind: 'create' })}>
            {t('newUser')}
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
      <div className="filters">
        <label className="field grow">
          <span>{t('common:filters.search')}</span>
          <input
            type="search"
            placeholder={t('common:filters.nameStaffIdOrEmail')}
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
        <label className="field">
          <span>{t('common:filters.role')}</span>
          <select value={role} onChange={(e) => (setRole(e.target.value), setPage(1))}>
            <option value="">{t('common:filters.all')}</option>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('common:filters.status')}</span>
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">{t('common:filters.all')}</option>
            {Object.values(AccountStatus).map((s) => (
              <option key={s} value={s}>
                {enumLabel('accountStatus', s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox error={list.error} />
      {list.isPending ? <Loading /> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <Empty>{t('empty')}</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('col.name')}</th>
                    <th>{t('col.email')}</th>
                    <th>{t('col.department')}</th>
                    <th>{t('col.role')}</th>
                    <th>{t('col.status')}</th>
                    <th>{t('col.lastSignIn')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div>{u.fullName}</div>
                        <div className="muted small">{u.staffId}</div>
                      </td>
                      <td>{u.email}</td>
                      <td>{u.department}</td>
                      <td>{roleLabel(u.role)}</td>
                      <td>
                        <Badge value={u.status} kind="accountStatus" />
                      </td>
                      <td>{fmtDateTime(u.lastLoginAt)}</td>
                      <td className="right nowrap">
                        <button type="button" className="btn btn-small" onClick={() => setPending({ kind: 'edit', user: u })}>
                          {t('common:actions.edit')}
                        </button>{' '}
                        {isSignupReview(u) ? (
                          <Link to="/signups" className="btn btn-small">
                            {t('actions.reviewSignup')}
                          </Link>
                        ) : u.status === AccountStatus.PENDING_ACTIVATION ? (
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => setPending({ kind: 'resend', user: u })}
                          >
                            {t('actions.resendActivation')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`btn btn-small ${u.status === AccountStatus.ACTIVE ? 'btn-danger-outline' : ''}`}
                            disabled={u.id === me?.id}
                            title={u.id === me?.id ? t('actions.cannotDeactivateSelf') : undefined}
                            onClick={() => setPending({ kind: 'toggle', user: u })}
                          >
                            {u.status === AccountStatus.ACTIVE ? t('actions.deactivate') : t('actions.activate')}
                          </button>
                        )}
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

      {pending?.kind === 'toggle' ? (
        <ConfirmDialog
          title={pending.user.status === AccountStatus.ACTIVE ? t('confirm.deactivateTitle') : t('confirm.activateTitle')}
          message={
            pending.user.status === AccountStatus.ACTIVE
              ? t('confirm.deactivateBody', { name: pending.user.fullName })
              : t('confirm.activateBody', { name: pending.user.fullName })
          }
          confirmLabel={pending.user.status === AccountStatus.ACTIVE ? t('actions.deactivate') : t('actions.activate')}
          danger={pending.user.status === AccountStatus.ACTIVE}
          busy={toggle.isPending}
          error={toggle.error}
          onConfirm={() => toggle.mutate(pending.user)}
          onCancel={closePending}
        />
      ) : null}
      {pending?.kind === 'resend' ? (
        <ConfirmDialog
          title={t('confirm.resendTitle')}
          message={t('confirm.resendBody', { email: pending.user.email })}
          confirmLabel={t('actions.resend')}
          busy={resend.isPending}
          error={resend.error}
          onConfirm={() => resend.mutate(pending.user)}
          onCancel={closePending}
        />
      ) : null}
      {pending?.kind === 'create' ? (
        <CreateUserDialog
          onClose={closePending}
          onCreated={(u) => {
            setFlash({ text: () => tr('users:flash.created', { name: u.fullName, email: u.email }) });
            setPending(null);
          }}
        />
      ) : null}
      {pending?.kind === 'edit' ? (
        <EditUserDialog
          user={pending.user}
          isSelf={pending.user.id === me?.id}
          onClose={closePending}
          onSaved={(u) => {
            setFlash({ text: () => tr('users:flash.saved', { name: u.fullName }) });
            setPending(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Same rules as the shared `CreateUserSchema` / `UpdateUserSchema`, with messages in the current language. */
const fullNameField = () =>
  z
    .string()
    .trim()
    .min(1, msg(() => t('users:validation.fullName')))
    .max(120);
const departmentField = () =>
  z
    .string()
    .trim()
    .min(1, msg(() => t('users:validation.department')))
    .max(120);

const CreateUserForm = z.object({
  staffId: z
    .string()
    .trim()
    .min(1, msg(() => t('users:validation.staffId')))
    .max(40),
  email: emailField(),
  fullName: fullNameField(),
  department: departmentField(),
  role: RoleSchema,
});
type CreateUserForm = z.output<typeof CreateUserForm>;

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (u: AdminUserDto) => void }) {
  const { t } = useTranslation(['users', 'common']);
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUser, unknown, CreateUserForm>({
    resolver: zodResolver(CreateUserForm),
    defaultValues: { staffId: '', email: '', fullName: '', department: '', role: Role.STAFF },
  });
  const create = useMutation({
    mutationFn: (body: CreateUserForm) => api.post<AdminUserDto>('/admin/users', body),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onCreated(u);
    },
  });
  return (
    <Dialog
      title={t('form.newTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form="create-user" className="btn btn-primary" disabled={create.isPending}>
            {t('form.create')}
          </button>
        </>
      }
    >
      <form id="create-user" className="grid-2" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
        <label className="field">
          <span>{t('form.staffId')}</span>
          <input {...register('staffId')} />
          <FieldError message={errors.staffId?.message} />
        </label>
        <label className="field">
          <span>{t('form.email')}</span>
          <input type="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        <label className="field">
          <span>{t('form.fullName')}</span>
          <input {...register('fullName')} />
          <FieldError message={errors.fullName?.message} />
        </label>
        <label className="field">
          <span>{t('form.department')}</span>
          <input {...register('department')} />
          <FieldError message={errors.department?.message} />
        </label>
        <label className="field">
          <span>{t('form.role')}</span>
          <select {...register('role')}>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <div className="span-2">
          <ErrorBox error={create.error} />
        </div>
      </form>
    </Dialog>
  );
}

const EditUserSchema = z.object({ fullName: fullNameField(), department: departmentField(), role: RoleSchema.optional() });

function EditUserDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUserDto;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (u: AdminUserDto) => void;
}) {
  const { t } = useTranslation(['users', 'common']);
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof EditUserSchema>, unknown, z.output<typeof EditUserSchema>>({
    resolver: zodResolver(EditUserSchema),
    defaultValues: { fullName: user.fullName, department: user.department, role: user.role },
  });
  const save = useMutation({
    mutationFn: (body: UpdateUser) => api.patch<AdminUserDto>(`/admin/users/${user.id}`, body),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onSaved(u);
    },
  });
  return (
    <Dialog
      title={t('form.editTitle', { name: user.fullName })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form="edit-user" className="btn btn-primary" disabled={save.isPending}>
            {t('common:actions.save')}
          </button>
        </>
      }
    >
      <form id="edit-user" className="grid-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <label className="field">
          <span>{t('form.fullName')}</span>
          <input {...register('fullName')} />
          <FieldError message={errors.fullName?.message} />
        </label>
        <label className="field">
          <span>{t('form.department')}</span>
          <input {...register('department')} />
          <FieldError message={errors.department?.message} />
        </label>
        <label className="field">
          <span>{t('form.role')}</span>
          <select {...register('role')} disabled={isSelf}>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          {isSelf ? <span className="muted small">{t('form.cannotChangeOwnRole')}</span> : null}
        </label>
        <div className="field">
          <span>{t('form.emailAndStaffId')}</span>
          <div className="muted">
            {user.email} · {user.staffId}
          </div>
        </div>
        <div className="span-2">
          <ErrorBox error={save.error} />
        </div>
      </form>
    </Dialog>
  );
}
