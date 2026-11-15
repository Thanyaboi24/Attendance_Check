import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AuditLogDto, Paginated } from '@attendance/shared';
import { api } from '../api/client';
import { Empty, ErrorBox, JsonView, Loading, PageHeader, Pagination } from '../components/ui';
import { enumLabel, fmtDateTime } from '../lib/format';

const PAGE_SIZE = 50;
const ENTITY_TYPES = ['AttendanceSession', 'AttendanceRequest', 'CorrectionRequest', 'User', 'GeofenceConfig'];

export function AuditLogPage() {
  const { t } = useTranslation(['audit', 'common']);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const query = { entityType: entityType.trim(), action: action.trim(), entityId: entityId.trim(), page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => api.get<Paginated<AuditLogDto>>('/admin/audit-logs', query),
    placeholderData: keepPreviousData,
  });

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="filters">
        <label className="field">
          <span>{t('filters.entityType')}</span>
          <input
            list="audit-entity-types"
            value={entityType}
            onChange={(e) => (setEntityType(e.target.value), setPage(1))}
          />
          <datalist id="audit-entity-types">
            {ENTITY_TYPES.map((et) => (
              <option key={et} value={et} label={enumLabel('entityType', et, String)} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>{t('filters.action')}</span>
          <input value={action} onChange={(e) => (setAction(e.target.value), setPage(1))} />
        </label>
        <label className="field grow">
          <span>{t('filters.entityId')}</span>
          <input value={entityId} onChange={(e) => (setEntityId(e.target.value), setPage(1))} />
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
                    <th>{t('col.time')}</th>
                    <th>{t('col.actor')}</th>
                    <th>{t('col.action')}</th>
                    <th>{t('col.entity')}</th>
                    <th>{t('col.reason')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((a) => {
                    const expanded = open.has(a.id);
                    return (
                      <Fragment key={a.id}>
                        <tr>
                          <td className="nowrap">{fmtDateTime(a.createdAt)}</td>
                          <td>{a.actor?.fullName ?? (a.actorType === 'SYSTEM' ? enumLabel('actorType', 'SYSTEM') : '—')}</td>
                          <td>{enumLabel('auditAction', a.action)}</td>
                          <td>
                            <div>{enumLabel('entityType', a.entityType, String)}</div>
                            <div className="muted small mono">{a.entityId}</div>
                          </td>
                          <td className="wrap">{a.reason ?? '—'}</td>
                          <td className="right">
                            <button
                              type="button"
                              className="btn btn-small"
                              aria-expanded={expanded}
                              onClick={() => toggle(a.id)}
                            >
                              {expanded ? t('hideValues') : t('showValues')}
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="expanded">
                            <td colSpan={6}>
                              <div className="grid-2">
                                <div>
                                  <h4>{t('previousValues')}</h4>
                                  <JsonView value={a.previousValues} />
                                </div>
                                <div>
                                  <h4>{t('newValues')}</h4>
                                  <JsonView value={a.newValues} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
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
