import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ApiRequestError, errorMessage } from '../api/client';
import { humanize } from '../lib/format';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row gap">{actions}</div> : null}
    </header>
  );
}

export function ErrorBox({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  const forbidden = error instanceof ApiRequestError && error.isForbidden;
  return (
    <div className="alert alert-error" role="alert">
      {title ? <strong>{title}: </strong> : null}
      {forbidden ? 'Your role does not have access to this information.' : errorMessage(error)}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden /> {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

const TONE: Record<string, string> = {
  APPROVED: 'green',
  ACTIVE: 'blue',
  COMPLETED: 'green',
  OPEN: 'blue',
  PENDING: 'amber',
  PENDING_ACTIVATION: 'amber',
  UNRESOLVED: 'amber',
  CANCELLED: 'grey',
  REJECTED: 'red',
  DEACTIVATED: 'grey',
  CONFIRMED_INSIDE: 'green',
  CONFIRMED_OUTSIDE: 'red',
  UNCERTAIN: 'amber',
  MANUAL: 'blue',
  AUTOMATIC: 'violet',
  ADMIN_CORRECTED: 'amber',
};

export function Badge({ value, label, tone }: { value?: string | null; label?: string; tone?: string }) {
  if (!value && !label) return <span className="muted">—</span>;
  const t = tone ?? (value ? TONE[value] : undefined) ?? 'grey';
  return <span className={`badge badge-${t}`}>{label ?? humanize(value)}</span>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted">
        {first}–{last} of {total}
      </span>
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Previous
      </button>
      <span>
        Page {page} / {pages}
      </span>
      <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next ›
      </button>
    </nav>
  );
}

/** Accessible modal without relying on <dialog>.showModal (not implemented by jsdom). */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`dialog${wide ? ' dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
      <ErrorBox error={error} />
    </Dialog>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="field-error" role="alert">
      {message}
    </span>
  );
}

export function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}
