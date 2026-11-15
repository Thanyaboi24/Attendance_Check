import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { canExportAttendance } from '../auth/roles';
import { PageHeader } from '../components/ui';
import { lastDays, saveBlob } from '../lib/format';

type ReportKind = 'attendance' | 'evaluation';

export function ReportsPage() {
  const { t, i18n } = useTranslation(['reports', 'common']);
  const { user } = useAuth();
  const initial = lastDays(30);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState<ReportKind | null>(null);
  // The error itself is kept (not its text) so the message follows the language switch.
  const [error, setError] = useState<unknown>(null);
  const invalid = !from || !to || from > to;

  const download = async (kind: ReportKind) => {
    setBusy(kind);
    setError(null);
    try {
      const query = kind === 'attendance' ? { from, to, department: department.trim() } : { from, to };
      // Fetched with the bearer token and saved as a blob (a plain link would not be authenticated).
      const { blob, filename } = await api.download(`/admin/reports/${kind}.csv`, query);
      saveBlob(blob, filename ?? `${kind}_${from}_${to}.csv`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const showAttendance = canExportAttendance(user?.role);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          <>
            {t('subtitle')}
            {i18n.language !== 'en' ? <> {t('csvNote')}</> : null}
          </>
        }
      />
      <div className="card">
        <div className="filters">
          <label className="field">
            <span>{t('common:filters.from')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('common:filters.to')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {showAttendance ? (
            <label className="field">
              <span>{t('departmentOptional')}</span>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} />
            </label>
          ) : null}
        </div>
        {invalid ? <div className="alert alert-error">{t('invalidRange')}</div> : null}
        {error ? (
          <div className="alert alert-error" role="alert">
            {errorMessage(error)}
          </div>
        ) : null}
        <div className="report-list">
          {showAttendance ? (
            <div className="report">
              <div>
                <h3>{t('attendance.title')}</h3>
                <p className="muted small">{t('attendance.description')}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={invalid || busy !== null}
                onClick={() => void download('attendance')}
              >
                {busy === 'attendance' ? t('preparing') : t('attendance.download')}
              </button>
            </div>
          ) : null}
          <div className="report">
            <div>
              <h3>{t('evaluation.title')}</h3>
              <p className="muted small">{t('evaluation.description')}</p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={invalid || busy !== null}
              onClick={() => void download('evaluation')}
            >
              {busy === 'evaluation' ? t('preparing') : t('evaluation.download')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
