import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  distanceM,
  RequestStatus,
  type AdminRequestDetail,
  type AdminRequestDto,
  type Paginated,
} from '@attendance/shared';
import { api } from '../api/client';
import { GeofenceMap } from '../components/map/GeofenceMap';
import { nearestArea } from '../components/map/types';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination } from '../components/ui';
import { enumLabel, fmtDateTime, fmtMetres, methodLabel } from '../lib/format';

const PAGE_SIZE = 25;

export function RequestsPage() {
  const { t } = useTranslation(['requests', 'common']);
  const [status, setStatus] = useState<string>(RequestStatus.UNRESOLVED);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const query = { status, q: q.trim(), from, to, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['requests', query],
    queryFn: () => api.get<Paginated<AdminRequestDto>>('/admin/attendance/requests', query),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <div className="filters">
        <label className="field">
          <span>{t('common:filters.status')}</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('common:filters.all')}</option>
            {Object.values(RequestStatus).map((s) => (
              <option key={s} value={s}>
                {enumLabel('requestStatus', s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('common:filters.from')}</span>
          <input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
        </label>
        <label className="field">
          <span>{t('common:filters.to')}</span>
          <input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />
        </label>
        <label className="field grow">
          <span>{t('common:filters.search')}</span>
          <input type="search" placeholder={t('common:filters.nameOrStaffId')} value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
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
                    <th>{t('col.detected')}</th>
                    <th>{t('col.staff')}</th>
                    <th>{t('col.type')}</th>
                    <th>{t('col.status')}</th>
                    <th>{t('col.reason')}</th>
                    <th>{t('col.config')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDateTime(r.geofenceDetectedAt)}</td>
                      <td>
                        <div>{r.user.fullName}</div>
                        <div className="muted small">
                          {r.user.staffId} · {r.user.department}
                        </div>
                      </td>
                      <td>{enumLabel('requestType', r.type)}</td>
                      <td>
                        <Badge value={r.status} kind="requestStatus" /> {r.method ? <Badge value={r.method} label={methodLabel(r.method)} /> : null}
                      </td>
                      <td>{enumLabel('resolutionReason', r.resolutionReason)}</td>
                      <td>v{r.configVersion}</td>
                      <td className="right">
                        <Link className="btn btn-small" to={`/requests/${r.id}`}>
                          {t('common:actions.review')}
                        </Link>
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
    </>
  );
}

export function RequestDetailPage() {
  const { t } = useTranslation(['requests', 'common']);
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['request', id],
    queryFn: () => api.get<AdminRequestDetail>(`/admin/attendance/requests/${encodeURIComponent(id)}`),
  });

  return (
    <>
      <PageHeader
        title={t('detail.title')}
        subtitle={<Link to="/requests">{t('detail.back')}</Link>}
      />
      <ErrorBox error={q.error} />
      {q.isPending ? <Loading /> : null}
      {q.data ? <RequestDetailView r={q.data} /> : null}
    </>
  );
}

function RequestDetailView({ r }: { r: AdminRequestDetail }) {
  const { t } = useTranslation(['requests', 'common']);
  // The area nearest to the evidence (requests can come from any campus of the version).
  const first = r.evidence[0];
  const area = first ? nearestArea(r.config.zones, first) : r.config.zones[0]!;
  const center = { lat: area.centerLat, lng: area.centerLng };
  const otherAreas = r.config.zones
    .filter((z) => z !== area)
    .map((z) => ({ name: z.name, center: { lat: z.centerLat, lng: z.centerLng }, radiusM: z.radiusM }));
  const evidence = r.evidence.map((e, i) => ({
    id: e.id,
    lat: e.lat,
    lng: e.lng,
    accuracyM: e.accuracyM,
    classification: e.classification,
    label: `#${i + 1} ${enumLabel('evidenceStage', e.stage)}`,
  }));
  const timeline: [string, string | null][] = [
    [t('timeline.geofenceDetected'), r.geofenceDetectedAt],
    [t('timeline.notificationPosted'), r.notificationPostedAt],
    [t('timeline.deadline'), r.deadlineAt],
    [t('timeline.userConfirmed'), r.userConfirmedAt],
    [t('timeline.clientRecorded'), r.clientRecordedAt],
    [t('timeline.approved'), r.approvedAt],
    [t('timeline.created'), r.createdAt],
  ];

  return (
    <div className="detail-grid">
      <section className="card">
        <h2>
          {r.user.fullName} <span className="muted small">({r.user.staffId})</span>
        </h2>
        <dl className="kv">
          <dt>{t('detail.department')}</dt>
          <dd>{r.user.department}</dd>
          <dt>{t('detail.type')}</dt>
          <dd>{enumLabel('requestType', r.type)}</dd>
          <dt>{t('detail.status')}</dt>
          <dd>
            <Badge value={r.status} kind="requestStatus" /> {r.method ? <Badge value={r.method} label={methodLabel(r.method)} /> : null}
          </dd>
          <dt>{t('detail.resolutionReason')}</dt>
          <dd>{enumLabel('resolutionReason', r.resolutionReason)}</dd>
          <dt>{t('detail.notification')}</dt>
          <dd>{enumLabel('notificationStatus', r.notificationStatus)}</dd>
          <dt>{t('detail.geofenceConfig')}</dt>
          <dd>
            v{r.config.version} —{' '}
            {r.config.zones
              .map((z) =>
                t('detail.zoneSummary', {
                  name: z.name,
                  radius: fmtMetres(z.radiusM),
                  lat: z.centerLat.toFixed(6),
                  lng: z.centerLng.toFixed(6),
                }),
              )
              .join('; ')}
          </dd>
          <dt>{t('detail.device')}</dt>
          <dd>
            {r.device
              ? t('detail.deviceValue', { model: r.device.model, os: r.device.os, version: r.device.appVersion })
              : '—'}
          </dd>
        </dl>
        <h3>{t('detail.timeline')}</h3>
        <dl className="kv">
          {timeline.map(([label, t]) => (
            <div key={label} className="kv-row">
              <dt>{label}</dt>
              <dd>{fmtDateTime(t)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card">
        <h2>{t('detail.evidenceTitle')}</h2>
        <p className="muted small">{t('detail.evidenceNote', { version: String(r.config.version) })}</p>
        <GeofenceMap center={center} radiusM={area.radiusM} areaName={area.name} otherAreas={otherAreas} evidence={evidence} />
      </section>
      <section className="card span-2">
        <h2>{t('detail.readings')}</h2>
        {r.evidence.length === 0 ? (
          <Empty>{t('detail.noEvidence')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('evidence.stage')}</th>
                  <th>{t('evidence.measured')}</th>
                  <th>{t('evidence.received')}</th>
                  <th>{t('evidence.latLng')}</th>
                  <th>{t('evidence.accuracy')}</th>
                  <th>{t('evidence.distance')}</th>
                  <th>{t('evidence.serverClass')}</th>
                  <th>{t('evidence.clientClass')}</th>
                  <th>{t('evidence.mock')}</th>
                </tr>
              </thead>
              <tbody>
                {r.evidence.map((e, i) => (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td>{enumLabel('evidenceStage', e.stage)}</td>
                    <td>{fmtDateTime(e.measuredAt)}</td>
                    <td>{fmtDateTime(e.receivedAt)}</td>
                    <td className="mono">
                      {e.lat.toFixed(6)}, {e.lng.toFixed(6)}
                    </td>
                    <td>{fmtMetres(e.accuracyM)}</td>
                    <td>{fmtMetres(e.distanceM ?? distanceM(nearestArea(r.config.zones, e), e))}</td>
                    <td>
                      <Badge value={e.classification} kind="locationClass" />
                    </td>
                    <td>{e.clientClassification ? <Badge value={e.clientClassification} kind="locationClass" /> : '—'}</td>
                    <td>{e.isMock ? <Badge label={t('evidence.mock')} tone="red" /> : t('evidence.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
