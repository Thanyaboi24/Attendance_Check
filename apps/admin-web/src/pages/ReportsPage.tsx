import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { canExportAttendance } from '../auth/roles';
import { PageHeader } from '../components/ui';
import { lastDays, saveBlob } from '../lib/format';

type ReportKind = 'attendance' | 'evaluation';

export function ReportsPage() {
  const { user } = useAuth();
  const initial = lastDays(30);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const showAttendance = canExportAttendance(user?.role);

  return (
    <>
      <PageHeader title="Reports" subtitle="CSV exports; dates are Bangkok calendar days and times are Bangkok time." />
      <div className="card">
        <div className="filters">
          <label className="field">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {showAttendance ? (
            <label className="field">
              <span>Department (attendance report, optional)</span>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} />
            </label>
          ) : null}
        </div>
        {invalid ? <div className="alert alert-error">Choose a valid date range (“From” not after “To”).</div> : null}
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="report-list">
          {showAttendance ? (
            <div className="report">
              <div>
                <h3>Attendance report</h3>
                <p className="muted small">One row per session: staff, check-in/out times and methods, corrections.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={invalid || busy !== null}
                onClick={() => void download('attendance')}
              >
                {busy === 'attendance' ? 'Preparing…' : 'Download attendance.csv'}
              </button>
            </div>
          ) : null}
          <div className="report">
            <div>
              <h3>Evaluation report</h3>
              <p className="muted small">
                One row per attendance request with every timestamp, device, configuration version, distance and
                classification (DS2 chapter 3 metrics).
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={invalid || busy !== null}
              onClick={() => void download('evaluation')}
            >
              {busy === 'evaluation' ? 'Preparing…' : 'Download evaluation.csv'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
