import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  CorrectionStatus,
  DISPLAY_TIME_ZONE,
  type CorrectionDto,
  type DashboardSummary,
  type HolidayListResponse,
  type Paginated,
} from '@attendance/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { rolesFor } from '../auth/roles';
import { Icon, type IconName } from '../components/icons';
import { ErrorBox } from '../components/ui';
import { daysBetween, fmtDateTime, fmtShortDate, fmtTime, holidayName, todayBangkok } from '../lib/format';
import { CorrectionReviewDialog } from './CorrectionsPage';

type AttentionKey = 'unresolvedRequests' | 'pendingCorrections' | 'longOpenSessions' | 'pendingSignups';

/** Each row links to its review page when the signed-in role may open it (see NAV_ITEMS roles). */
const ATTENTION: { key: AttentionKey; link: string; icon: IconName }[] = [
  { key: 'unresolvedRequests', link: '/requests', icon: 'alert' },
  { key: 'pendingCorrections', link: '/corrections', icon: 'corrections' },
  { key: 'longOpenSessions', link: '/sessions', icon: 'hourglass' },
  { key: 'pendingSignups', link: '/signups', icon: 'signups' },
];

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

function bangkokHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: DISPLAY_TIME_ZONE }).format(now));
}

function locale(lang: string) {
  return lang === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB';
}

/** "Sunday 15 November 2026" / "วันอาทิตย์ที่ 15 พฤศจิกายน 2569" for a Bangkok calendar date (YYYY-MM-DD). */
function longDate(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(locale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
}

function clock(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: DISPLAY_TIME_ZONE }).format(ms);
}

/** Circular gauge; the value is described by `label` for screen readers. */
function Ring({ percent, label, children }: { percent: number; label: string; children: ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle className="ring-track" cx="60" cy="60" r={r} />
        <circle className="ring-value" cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      </svg>
      <div className="ring-center" aria-hidden>
        {children}
      </div>
    </div>
  );
}

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div className="dash-grid" role="status" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <div className="panel skeleton dash-hero-panel" />
      <div className="panel skeleton dash-attention" />
      <div className="panel skeleton dash-activity" />
    </div>
  );
}

export function DashboardPage() {
  const { t, i18n } = useTranslation(['dashboard', 'common']);
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardSummary>('/admin/dashboard/summary'),
    refetchInterval: 60_000,
  });
  // A row links to its page only when the signed-in role may open that page.
  const canFollow = (link: string) => !!user && rolesFor(link).includes(user.role);
  const hour = bangkokHour();
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? '';
  const s = q.data;

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          {firstName ? <p className="dash-eyebrow">{t(`greeting.${period}`, { name: firstName })}</p> : null}
          <h1>{t('title')}</h1>
          {s ? (
            <p className="muted">
              {longDate(s.date, i18n.language)} · {t('bangkokTime')}
            </p>
          ) : null}
          <HolidayChip canFollow={canFollow('/holidays')} />
        </div>
        {s ? (
          <div className="dash-live">
            <span className="live-dot" aria-hidden />
            <span>
              <strong>{t('live')}</strong> · {t('updated', { time: clock(q.dataUpdatedAt) })}
            </span>
            <button
              type="button"
              className={`icon-btn${q.isFetching ? ' spinning' : ''}`}
              onClick={() => void q.refetch()}
              aria-label={t('refresh')}
              title={t('refresh')}
              disabled={q.isFetching}
            >
              <Icon name="refresh" size={16} />
            </button>
          </div>
        ) : null}
      </header>

      <ErrorBox error={q.error} />
      {q.isPending ? <Skeleton /> : null}

      {s ? (
        <div className="dash-grid">
          {/* Presence */}
          <section className="panel dash-hero-panel" aria-labelledby="presence-title">
            <div className="hero-glow" aria-hidden />
            <div className="hero-main">
              <Ring
                percent={pct(s.checkedInNow, s.activeStaff)}
                label={t('presence.ring', { now: String(s.checkedInNow), total: String(s.activeStaff) })}
              >
                <span className="ring-number">{s.checkedInNow}</span>
                <span className="ring-of">/ {s.activeStaff}</span>
              </Ring>
              <div className="hero-text">
                <h2 id="presence-title">{t('presence.title')}</h2>
                <p className="hero-share">
                  {s.checkedInNow > 0
                    ? t('presence.share', { percent: String(pct(s.checkedInNow, s.activeStaff)) })
                    : t('presence.nobody')}
                </p>
                <p className="hero-hint">{t('cards.checkedInNow.hint')}</p>
              </div>
            </div>
            <div className="hero-stats">
              <HeroStat icon="people" label={t('cards.activeStaff.label')} value={s.activeStaff} />
              <HeroStat icon="login" label={t('cards.checkedInToday.label')} value={s.checkedInToday}>
                <div
                  className="meter"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct(s.checkedInToday, s.activeStaff)}
                  aria-label={t('todayProgress', { percent: String(pct(s.checkedInToday, s.activeStaff)) })}
                >
                  <span style={{ width: `${pct(s.checkedInToday, s.activeStaff)}%` }} />
                </div>
              </HeroStat>
            </div>
          </section>

          {/* Needs attention */}
          <section className="panel dash-attention" aria-labelledby="attention-title">
            <h2 id="attention-title" className="panel-title">
              {t('attention.title')}
            </h2>
            {ATTENTION.every((a) => !s[a.key]) ? (
              <div className="all-clear">
                <span className="all-clear-icon">
                  <Icon name="check" size={22} />
                </span>
                <div>
                  <strong>{t('attention.allClear')}</strong>
                  <p className="muted small">{t('attention.allClearHint')}</p>
                </div>
              </div>
            ) : null}
            <ul className="attention-list">
              {ATTENTION.map((a) => {
                const value = s[a.key] ?? 0;
                const canFollowLinks = canFollow(a.link);
                const body = (
                  <>
                    <span className={`att-icon${value > 0 ? ' att-icon-warn' : ''}`}>
                      <Icon name={a.icon} size={18} />
                    </span>
                    <span className="att-text">
                      <span className="att-label">{t(`cards.${a.key}.label`)}</span>
                      <span className="muted small">{t(`cards.${a.key}.hint`)}</span>
                    </span>
                    <span className={`att-count${value > 0 ? ' att-count-warn' : ''}`}>{value}</span>
                    {canFollowLinks ? <Icon name="arrow" size={16} className="att-arrow" /> : null}
                  </>
                );
                return (
                  <li key={a.key}>
                    {canFollowLinks ? (
                      <Link to={a.link} className="att-row att-link">
                        {body}
                      </Link>
                    ) : (
                      <div className="att-row">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Pending corrections: decide straight from the dashboard */}
          {canFollow('/corrections') ? <PendingCorrectionsPanel /> : null}

          {/* Activity */}
          <ActivityPanel auto={s.automaticActionsToday} manual={s.manualActionsToday} />
        </div>
      ) : null}
    </div>
  );
}

const PENDING_SHOWN = 5;

/**
 * Correction requests awaiting a decision, oldest first, with Approve / Reject buttons. Both open the review
 * dialog with that decision selected: the API requires a note to the staff member, and an approval can adjust
 * the times. Shares the ['corrections'] query key, so a decision refreshes this panel and the Corrections page.
 */
function PendingCorrectionsPanel() {
  const { t } = useTranslation(['dashboard', 'corrections']);
  const [reviewing, setReviewing] = useState<{ correction: CorrectionDto; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const query = { status: CorrectionStatus.PENDING, page: 1, pageSize: PENDING_SHOWN };
  const q = useQuery({
    queryKey: ['corrections', query],
    queryFn: () => api.get<Paginated<CorrectionDto>>('/admin/corrections', query),
    refetchInterval: 60_000,
  });
  const total = q.data?.total ?? 0;
  const items = q.data?.items ?? [];

  return (
    <section className="panel dash-corrections" aria-labelledby="corrections-title">
      <div className="corr-head">
        <span className={`att-icon${total > 0 ? ' att-icon-warn' : ''}`}>
          <Icon name="corrections" size={18} />
        </span>
        <div className="corr-head-text">
          <h2 id="corrections-title" className="panel-title">
            {t('cards.pendingCorrections.label')}
            {total > 0 ? <span className="att-count att-count-warn corr-total">{total}</span> : null}
          </h2>
          <p className="muted small">{t('cards.pendingCorrections.hint')}</p>
        </div>
        <Link to="/corrections" className="btn btn-ghost btn-small corr-all">
          {t('pendingCorrections.viewAll')}
          <Icon name="arrow" size={14} />
        </Link>
      </div>

      <ErrorBox error={q.error} />
      {q.isPending ? <div className="skeleton corr-skeleton" role="status" aria-busy="true" /> : null}

      {q.data && items.length === 0 ? (
        <div className="all-clear">
          <span className="all-clear-icon">
            <Icon name="check" size={22} />
          </span>
          <div>
            <strong>{t('pendingCorrections.empty')}</strong>
            <p className="muted small">{t('pendingCorrections.emptyHint')}</p>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="corr-list">
          {items.map((c) => (
            <li key={c.id} className="corr-item">
              <div className="corr-who">
                <span className="corr-avatar" aria-hidden>
                  {initials(c.user.fullName)}
                </span>
                <div className="corr-who-text">
                  <strong>{c.user.fullName}</strong>
                  <span className="muted small">{[c.user.staffId, c.user.department].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
              <div className="corr-when">
                <span className="corr-date">{fmtShortDate(c.workDate)}</span>
                <span className="corr-times">
                  <span title={t('corrections:col.requestedIn')}>{fmtTime(c.requestedCheckInAt)}</span>
                  <Icon name="arrow" size={12} />
                  <span title={t('corrections:col.requestedOut')}>{fmtTime(c.requestedCheckOutAt)}</span>
                </span>
              </div>
              <p className="corr-reason" title={c.reason}>
                {c.reason}
              </p>
              <span className="muted small corr-submitted">{t('pendingCorrections.submitted', { time: fmtDateTime(c.createdAt) })}</span>
              <div className="corr-actions">
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() => setReviewing({ correction: c, decision: 'APPROVE' })}
                  aria-label={t('pendingCorrections.approveFor', { name: c.user.fullName })}
                >
                  <Icon name="check" size={14} />
                  {t('corrections:review.approve')}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger-outline"
                  onClick={() => setReviewing({ correction: c, decision: 'REJECT' })}
                  aria-label={t('pendingCorrections.rejectFor', { name: c.user.fullName })}
                >
                  {t('corrections:review.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {total > items.length ? (
        <Link to="/corrections" className="corr-more">
          {t('pendingCorrections.more', { count: total - items.length })}
        </Link>
      ) : null}

      {reviewing ? (
        <CorrectionReviewDialog
          correction={reviewing.correction}
          initialDecision={reviewing.decision}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </section>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

/** Today's holiday (check-in closed) or the next one within 30 days; nothing when the calendar can't be read. */
function HolidayChip({ canFollow }: { canFollow: boolean }) {
  const { t } = useTranslation('dashboard');
  const today = todayBangkok();
  const q = useQuery({
    queryKey: ['dashboard-holidays', today],
    queryFn: () => api.get<HolidayListResponse>('/calendar/holidays', { from: today, to: addDays(today, 30) }),
    staleTime: 10 * 60_000,
  });
  const list = q.data?.holidays ?? [];
  const todays = list.find((h) => h.date === today);
  const next = list.find((h) => h.date > today);
  if (!todays && !next) return null;
  const text = todays
    ? t('holiday.today', { name: holidayName(todays) })
    : t('holiday.next', { name: holidayName(next!), date: fmtShortDate(next!.date), count: daysBetween(today, next!.date) });
  const cls = `dash-holiday${todays ? ' dash-holiday-today' : ''}`;
  const body = (
    <>
      <Icon name="holidays" size={15} />
      <span>{text}</span>
    </>
  );
  return canFollow ? (
    <Link to="/holidays" className={cls} title={t('holiday.link')}>
      {body}
    </Link>
  ) : (
    <p className={cls}>{body}</p>
  );
}

function HeroStat({ icon, label, value, children }: { icon: IconName; label: string; value: number; children?: ReactNode }) {
  return (
    <div className="hero-stat">
      <span className="hero-stat-icon">
        <Icon name={icon} size={18} />
      </span>
      <div className="hero-stat-body">
        <span className="hero-stat-label">{label}</span>
        <span className="hero-stat-value">{value}</span>
        {children}
      </div>
    </div>
  );
}

function ActivityPanel({ auto, manual }: { auto: number; manual: number }) {
  const { t } = useTranslation('dashboard');
  const total = auto + manual;
  const autoPct = pct(auto, total);
  return (
    <section className="panel dash-activity" aria-labelledby="activity-title">
      <div className="activity-head">
        <div>
          <h2 id="activity-title" className="panel-title">
            {t('activity.title')}
          </h2>
          <p className="muted small">{t('activity.subtitle')}</p>
        </div>
        <div className="activity-total">
          <span className="activity-total-value">{total}</span>
          <span className="muted small">{t('activity.total', { count: total })}</span>
        </div>
      </div>
      <div
        className={`split-bar${total === 0 ? ' split-empty' : ''}`}
        role="img"
        aria-label={t('activity.split', { auto: String(auto), manual: String(manual) })}
      >
        {total > 0 ? (
          <>
            <span className="split-auto" style={{ width: `${autoPct}%` }} />
            <span className="split-manual" style={{ width: `${100 - autoPct}%` }} />
          </>
        ) : null}
      </div>
      {total === 0 ? <p className="muted small">{t('activity.empty')}</p> : null}
      <div className="split-legend">
        <LegendItem cls="split-auto" icon="bolt" label={t('activity.automatic')} hint={t('cards.automaticActionsToday.hint')} value={auto} percent={total ? autoPct : null} />
        <LegendItem cls="split-manual" icon="hand" label={t('activity.manual')} hint={t('cards.manualActionsToday.hint')} value={manual} percent={total ? 100 - autoPct : null} />
      </div>
    </section>
  );
}

function LegendItem(p: { cls: string; icon: IconName; label: string; hint: string; value: number; percent: number | null }) {
  return (
    <div className="legend-item">
      <span className={`legend-swatch ${p.cls}`} aria-hidden>
        <Icon name={p.icon} size={16} />
      </span>
      <div className="legend-body">
        <span className="legend-label">
          {p.label}
          {p.percent != null ? <span className="legend-pct"> · {p.percent}%</span> : null}
        </span>
        <span className="muted small">{p.hint}</span>
      </div>
      <span className="legend-value">{p.value}</span>
    </div>
  );
}
