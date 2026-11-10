import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  AccountStatus,
  CreateUserSchema,
  Role,
  UpdateUserSchema,
  type AdminUserDto,
  type CreateUser,
  type Paginated,
  type UpdateUser,
} from '@attendance/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../auth/roles';
import { Badge, ConfirmDialog, Dialog, Empty, ErrorBox, FieldError, Loading, PageHeader, Pagination } from '../components/ui';
import { fmtDateTime, humanize } from '../lib/format';

const PAGE_SIZE = 25;

type Pending =
  | { kind: 'toggle'; user: AdminUserDto }
  | { kind: 'resend'; user: AdminUserDto }
  | { kind: 'edit'; user: AdminUserDto }
  | { kind: 'create' };

export function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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
      setFlash(`${u.fullName} is now ${humanize(u.status).toLowerCase()}.`);
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
  const resend = useMutation({
    mutationFn: (u: AdminUserDto) => api.post<{ ok: true }>(`/admin/users/${u.id}/resend-activation`),
    onSuccess: (_r, u) => {
      setFlash(`Activation email re-sent to ${u.email}.`);
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
        title="Users"
        subtitle="Staff and administrator accounts."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setPending({ kind: 'create' })}>
            New user
          </button>
        }
      />
      {flash ? (
        <div className="alert alert-success" role="status">
          {flash}{' '}
          <button type="button" className="btn-link" onClick={() => setFlash(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="filters">
        <label className="field grow">
          <span>Search</span>
          <input
            type="search"
            placeholder="Name, staff ID or email"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(e) => (setRole(e.target.value), setPage(1))}>
            <option value="">All</option>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="">All</option>
            {Object.values(AccountStatus).map((s) => (
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
          <Empty>No users match these filters.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
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
                      <td>{ROLE_LABEL[u.role]}</td>
                      <td>
                        <Badge value={u.status} />
                      </td>
                      <td>{fmtDateTime(u.lastLoginAt)}</td>
                      <td className="right nowrap">
                        <button type="button" className="btn btn-small" onClick={() => setPending({ kind: 'edit', user: u })}>
                          Edit
                        </button>{' '}
                        {u.status === AccountStatus.PENDING_ACTIVATION ? (
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => setPending({ kind: 'resend', user: u })}
                          >
                            Resend activation
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`btn btn-small ${u.status === AccountStatus.ACTIVE ? 'btn-danger-outline' : ''}`}
                            disabled={u.id === me?.id}
                            title={u.id === me?.id ? 'You cannot deactivate your own account' : undefined}
                            onClick={() => setPending({ kind: 'toggle', user: u })}
                          >
                            {u.status === AccountStatus.ACTIVE ? 'Deactivate' : 'Activate'}
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
          title={pending.user.status === AccountStatus.ACTIVE ? 'Deactivate account?' : 'Activate account?'}
          message={
            pending.user.status === AccountStatus.ACTIVE
              ? `${pending.user.fullName} will be signed out everywhere and can no longer sign in or record attendance.`
              : `${pending.user.fullName} will be able to sign in again.`
          }
          confirmLabel={pending.user.status === AccountStatus.ACTIVE ? 'Deactivate' : 'Activate'}
          danger={pending.user.status === AccountStatus.ACTIVE}
          busy={toggle.isPending}
          error={toggle.error}
          onConfirm={() => toggle.mutate(pending.user)}
          onCancel={closePending}
        />
      ) : null}
      {pending?.kind === 'resend' ? (
        <ConfirmDialog
          title="Resend activation email?"
          message={`A new activation link (valid 24 hours) will be sent to ${pending.user.email}.`}
          confirmLabel="Resend"
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
            setFlash(`Account created for ${u.fullName}; an activation email was sent to ${u.email}.`);
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
            setFlash(`Saved changes to ${u.fullName}.`);
            setPending(null);
          }}
        />
      ) : null}
    </>
  );
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (u: AdminUserDto) => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUser, unknown, z.output<typeof CreateUserSchema>>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { staffId: '', email: '', fullName: '', department: '', role: Role.STAFF },
  });
  const create = useMutation({
    mutationFn: (body: z.output<typeof CreateUserSchema>) => api.post<AdminUserDto>('/admin/users', body),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onCreated(u);
    },
  });
  return (
    <Dialog
      title="New user"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-user" className="btn btn-primary" disabled={create.isPending}>
            Create and send activation email
          </button>
        </>
      }
    >
      <form id="create-user" className="grid-2" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
        <label className="field">
          <span>Staff ID</span>
          <input {...register('staffId')} />
          <FieldError message={errors.staffId?.message} />
        </label>
        <label className="field">
          <span>Institutional email</span>
          <input type="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        <label className="field">
          <span>Full name</span>
          <input {...register('fullName')} />
          <FieldError message={errors.fullName?.message} />
        </label>
        <label className="field">
          <span>Department</span>
          <input {...register('department')} />
          <FieldError message={errors.department?.message} />
        </label>
        <label className="field">
          <span>Role</span>
          <select {...register('role')}>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
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

const EditUserSchema = UpdateUserSchema.required({ fullName: true, department: true }).omit({ status: true });

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
      title={`Edit ${user.fullName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="edit-user" className="btn btn-primary" disabled={save.isPending}>
            Save
          </button>
        </>
      }
    >
      <form id="edit-user" className="grid-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <label className="field">
          <span>Full name</span>
          <input {...register('fullName')} />
          <FieldError message={errors.fullName?.message} />
        </label>
        <label className="field">
          <span>Department</span>
          <input {...register('department')} />
          <FieldError message={errors.department?.message} />
        </label>
        <label className="field">
          <span>Role</span>
          <select {...register('role')} disabled={isSelf}>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {isSelf ? <span className="muted small">You cannot change your own role.</span> : null}
        </label>
        <div className="field">
          <span>Email / staff ID</span>
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
