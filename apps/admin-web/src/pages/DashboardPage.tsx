import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Role, type DashboardSummary } from '@attendance/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Loading, PageHeader } from '../components/ui';

interface Card {
  key: keyof Omit<DashboardSummary, 'date'>;
  link?: string;
  warn?: boolean;
}

const CARDS: Card[] = [
  { key: 'activeStaff' },
  { key: 'checkedInNow' },
  { key: 'checkedInToday' },
  { key: 'automaticActionsToday' },
  { key: 'manualActionsToday' },
  { key: 'unresolvedRequests', link: '/requests', warn: true },
  { key: 'pendingCorrections', link: '/corrections', warn: true },
  { key: 'longOpenSessions', link: '/sessions', warn: true },
];

export function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/admin/dashboard/summary'),
    refetchInterval: 60_000,
  });
  const canFollowLinks = user?.role === Role.ATTENDANCE_ADMIN;

  return (
    <>
      <PageHeader title={t('title')} subtitle={q.data ? t('today', { date: q.data.date }) : undefined} />
      {q.isPending ? <Loading /> : null}
      <ErrorBox error={q.error} />
      {q.data ? (
        <div className="cards">
          {CARDS.map((c) => {
            const value = q.data[c.key];
            const body = (
              <>
                <div className="card-value">{value}</div>
                <div className="card-label">{t(`cards.${c.key}.label`)}</div>
                <div className="muted small">{t(`cards.${c.key}.hint`)}</div>
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
