import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import {
  distanceM,
  RequestStatus,
  type AdminRequestDetail,
  type AdminRequestDto,
  type Paginated,
} from '@attendance/shared';
import { api } from '../api/client';
import { GeofenceMap } from '../components/map/GeofenceMap';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination } from '../components/ui';
import { fmtDateTime, fmtMetres, humanize, methodLabel } from '../lib/format';

const PAGE_SIZE = 25;

export function RequestsPage() {
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
        title="Attendance requests"
        subtitle="Unresolved requests need review; open one to see its location evidence on the map."
      />
      <div className="filters">
        <label className="field">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {Object.values(RequestStatus).map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />
        </label>
        <label className="field grow">
          <span>Search</span>
          <input type="search" placeholder="Name or staff ID" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        </label>
      </div>
      <ErrorBox error={list.error} />
      {list.isPending ? <Loading /> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <Empty>No requests match these filters.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Detected</th>
                    <th>Staff</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Config</th>
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
                      <td>{humanize(r.type)}</td>
                      <td>
                        <Badge value={r.status} /> {r.method ? <Badge value={r.method} label={methodLabel(r.method)} /> : null}
                      </td>
                      <td>{humanize(r.resolutionReason)}</td>
                      <td>v{r.configVersion}</td>
                      <td className="right">
                        <Link className="btn btn-small" to={`/requests/${r.id}`}>
                          Review
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
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['request', id],
    queryFn: () => api.get<AdminRequestDetail>(`/admin/attendance/requests/${encodeURIComponent(id)}`),
  });

  return (
    <>
      <PageHeader
        title="Attendance request"
        subtitle={<Link to="/requests">← Back to requests</Link>}
      />
      <ErrorBox error={q.error} />
      {q.isPending ? <Loading /> : null}
      {q.data ? <RequestDetailView r={q.data} /> : null}
    </>
  );
}

function RequestDetailView({ r }: { r: AdminRequestDetail }) {
  const center = { lat: r.config.centerLat, lng: r.config.centerLng };
  const evidence = r.evidence.map((e, i) => ({
    id: e.id,
    lat: e.lat,
    lng: e.lng,
    accuracyM: e.accuracyM,
    classification: e.classification,
    label: `#${i + 1} ${humanize(e.stage)}`,
  }));
  const timeline: [string, string | null][] = [
    ['Geofence detected', r.geofenceDetectedAt],
    ['Notification posted', r.notificationPostedAt],
    ['Deadline (grace period)', r.deadlineAt],
    ['User confirmed', r.userConfirmedAt],
    ['Client recorded', r.clientRecordedAt],
    ['Approved (official time)', r.approvedAt],
    ['Request created', r.createdAt],
  ];

  return (
    <div className="detail-grid">
      <section className="card">
        <h2>
          {r.user.fullName} <span className="muted small">({r.user.staffId})</span>
        </h2>
        <dl className="kv">
          <dt>Department</dt>
          <dd>{r.user.department}</dd>
          <dt>Type</dt>
          <dd>{humanize(r.type)}</dd>
          <dt>Status</dt>
          <dd>
            <Badge value={r.status} /> {r.method ? <Badge value={r.method} label={methodLabel(r.method)} /> : null}
          </dd>
          <dt>Resolution reason</dt>
          <dd>{humanize(r.resolutionReason)}</dd>
          <dt>Notification</dt>
          <dd>{humanize(r.notificationStatus)}</dd>
          <dt>Geofence config</dt>
          <dd>
            v{r.config.version} — radius {fmtMetres(r.config.radiusM)}, centre {r.config.centerLat.toFixed(6)},{' '}
            {r.config.centerLng.toFixed(6)}
          </dd>
          <dt>Device</dt>
          <dd>{r.device ? `${r.device.model} · ${r.device.os} · app ${r.device.appVersion}` : '—'}</dd>
        </dl>
        <h3>Timeline (Bangkok)</h3>
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
        <h2>Location evidence</h2>
        <p className="muted small">Geofence drawn from the request’s own configuration version (v{r.config.version}).</p>
        <GeofenceMap center={center} radiusM={r.config.radiusM} evidence={evidence} />
      </section>
      <section className="card span-2">
        <h2>Evidence readings</h2>
        {r.evidence.length === 0 ? (
          <Empty>No location evidence was submitted with this request.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stage</th>
                  <th>Measured</th>
                  <th>Received</th>
                  <th>Lat, Lng</th>
                  <th>Accuracy</th>
                  <th>Distance</th>
                  <th>Server class.</th>
                  <th>Client class.</th>
                  <th>Mock</th>
                </tr>
              </thead>
              <tbody>
                {r.evidence.map((e, i) => (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td>{humanize(e.stage)}</td>
                    <td>{fmtDateTime(e.measuredAt)}</td>
                    <td>{fmtDateTime(e.receivedAt)}</td>
                    <td className="mono">
                      {e.lat.toFixed(6)}, {e.lng.toFixed(6)}
                    </td>
                    <td>{fmtMetres(e.accuracyM)}</td>
                    <td>{fmtMetres(e.distanceM ?? distanceM(r.config, e))}</td>
                    <td>
                      <Badge value={e.classification} />
                    </td>
                    <td>{e.clientClassification ? <Badge value={e.clientClassification} /> : '—'}</td>
                    <td>{e.isMock ? <Badge label="Mock" tone="red" /> : 'No'}</td>
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
