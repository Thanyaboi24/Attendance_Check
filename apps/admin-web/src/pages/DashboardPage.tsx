import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Role, type DashboardSummary } from '@attendance/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Loading, PageHeader } from '../components/ui';

interface Card {
  key: keyof Omit<DashboardSummary, 'date'>;
  label: string;
  hint: string;
  link?: string;
  warn?: boolean;
}

const CARDS: Card[] = [
  { key: 'activeStaff', label: 'Active staff', hint: 'Accounts with status Active' },
  { key: 'checkedInNow', label: 'Checked in now', hint: 'Open attendance sessions' },
  { key: 'checkedInToday', label: 'Checked in today', hint: 'Staff with a session today' },
  { key: 'automaticActionsToday', label: 'Automatic actions today', hint: 'Approved after the grace period' },
  { key: 'manualActionsToday', label: 'Manual actions today', hint: 'Confirmed from the notification' },
  { key: 'unresolvedRequests', label: 'Unresolved requests', hint: 'Need review', link: '/requests', warn: true },
  { key: 'pendingCorrections', label: 'Pending corrections', hint: 'Awaiting a decision', link: '/corrections', warn: true },
  { key: 'longOpenSessions', label: 'Long open sessions', hint: 'Sessions open unusually long', link: '/sessions', warn: true },
];

export function DashboardPage() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/admin/dashboard/summary'),
    refetchInterval: 60_000,
  });
  const canFollowLinks = user?.role === Role.ATTENDANCE_ADMIN;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={q.data ? `Today (Bangkok): ${q.data.date}` : undefined} />
      {q.isPending ? <Loading /> : null}
      <ErrorBox error={q.error} />
      {q.data ? (
        <div className="cards">
          {CARDS.map((c) => {
            const value = q.data[c.key];
            const body = (
              <>
                <div className="card-value">{value}</div>
                <div className="card-label">{c.label}</div>
                <div className="muted small">{c.hint}</div>
              </>
            );
            const cls = `stat${c.warn && value > 0 ? ' stat-warn' : ''}`;
            return canFollowLinks && c.link ? (
              <Link key={c.key} to={c.link} className={`${cls} stat-link`}>
                {body}
              </Link>
            ) : (
              <div key={c.key} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
