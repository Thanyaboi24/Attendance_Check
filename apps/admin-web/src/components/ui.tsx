import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, errorMessage } from '../api/client';
import { enumLabel, humanize, type EnumGroup } from '../lib/format';

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
  const { t } = useTranslation();
  if (!error) return null;
  const forbidden = error instanceof ApiRequestError && error.isForbidden;
  return (
    <div className="alert alert-error" role="alert">
      {title ? <strong>{title}: </strong> : null}
      {forbidden ? t('errors.noAccess') : errorMessage(error)}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden /> {label ?? t('loading')}
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

/** Status pill. `kind` names the enum the value belongs to so it is shown translated. */
export function Badge({
  value,
  label,
  tone,
  kind,
}: {
  value?: string | null;
  label?: string;
  tone?: string;
  kind?: EnumGroup;
}) {
  useTranslation(); // re-render on language change
  if (!value && !label) return <span className="muted">—</span>;
  const tn = tone ?? (value ? TONE[value] : undefined) ?? 'grey';
  return <span className={`badge badge-${tn}`}>{label ?? (kind ? enumLabel(kind, value) : humanize(value))}</span>;
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
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label={t('pagination.label')}>
      <span className="muted">{t('pagination.range', { first: String(first), last: String(last), total: String(total) })}</span>
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('pagination.previous')}
      </button>
      <span>{t('pagination.page', { page: String(page), pages: String(pages) })}</span>
      <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('pagination.next')}
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
  const { t } = useTranslation();
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
          <button type="button" className="btn btn-ghost btn-icon" aria-label={t('actions.close')} onClick={onClose}>
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
  const { t } = useTranslation();
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('actions.cancel')}
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
