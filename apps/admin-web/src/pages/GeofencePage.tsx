import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  DEFAULT_GEOFENCE,
  MAX_GEOFENCE_ZONES,
  RADIUS_MAX_M,
  RADIUS_MIN_M,
  UpdateGeofenceConfigSchema,
  type GeofenceConfig,
  type GeofenceZone,
  type UpdateGeofenceConfig,
} from '@attendance/shared';
import { api } from '../api/client';
import { t } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { canEditGeofence } from '../auth/roles';
import { GeofenceMap } from '../components/map/GeofenceMap';
import { Empty, ErrorBox, FieldError, Loading, PageHeader } from '../components/ui';
import { fmtDateTime, fmtMetres, fmtSeconds } from '../lib/format';
import { msg } from '../lib/validation';

export function GeofencePage() {
  const { t } = useTranslation(['geofence', 'common']);
  const { user } = useAuth();
  const editable = canEditGeofence(user?.role);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [saved, setSaved] = useState<GeofenceConfig | null>(null);
  const configs = useQuery({
    queryKey: ['geofence-configs'],
    queryFn: () => api.get<GeofenceConfig[]>('/admin/geofence/configs'),
  });
  const current = configs.data?.[0];
  const viewed = configs.data?.find((c) => c.version === viewVersion) ?? null;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <ErrorBox error={configs.error} />
      {configs.isPending ? <Loading /> : null}
      {saved ? (
        <div className="alert alert-success" role="status">
          {t('savedAs', { version: String(saved.version) })}
        </div>
      ) : null}
      {configs.data ? (
        <>
          {editable ? (
            <GeofenceForm key={current?.version ?? 0} current={current} onSaved={setSaved} />
          ) : current ? (
            <section className="card">
              <h2>{t('currentTitle', { version: String(current.version) })}</h2>
              <ConfigSummary c={current} />
              <AreaMaps zones={current.zones} />
              <p className="muted small">{t('onlySystemAdmin')}</p>
            </section>
          ) : (
            <Empty>{t('noneYet')}</Empty>
          )}
          <section className="card">
            <h2>{t('history.title')}</h2>
            {configs.data.length === 0 ? (
              <Empty>{t('history.empty')}</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('history.version')}</th>
                      <th>{t('history.name')}</th>
                      <th>{t('history.areas')}</th>
                      <th>{t('history.grace')}</th>
                      <th>{t('history.maxAge')}</th>
                      <th>{t('history.maxAccuracy')}</th>
                      <th>{t('history.effective')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {configs.data.map((c, i) => (
                      <tr key={c.version}>
                        <td>
                          v{c.version} {i === 0 ? <span className="badge badge-green">{t('history.current')}</span> : null}
                        </td>
                        <td>{c.name}</td>
                        <td>
                          {c.zones.map((z) => (
                            <div key={z.name}>
                              {z.name} · {fmtMetres(z.radiusM)}
                            </div>
                          ))}
                        </td>
                        <td className="nowrap">{fmtSeconds(c.gracePeriodSec)}</td>
                        <td className="nowrap">{fmtSeconds(c.maxLocationAgeSec)}</td>
                        <td className="nowrap">{fmtMetres(c.maxAccuracyM)}</td>
                        <td>{fmtDateTime(c.effectiveAt)}</td>
                        <td className="right">
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => setViewVersion(viewVersion === c.version ? null : c.version)}
                          >
                            {viewVersion === c.version ? t('history.hide') : t('history.showOnMap')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {viewed ? (
              <div className="history-map">
                <h3>{t('history.versionTitle', { version: String(viewed.version) })}</h3>
                <AreaMaps key={viewed.version} zones={viewed.zones} height={300} />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

function ConfigSummary({ c }: { c: GeofenceConfig }) {
  const { t } = useTranslation(['geofence', 'common']);
  return (
    <dl className="kv">
      <dt>{t('summary.name')}</dt>
      <dd>{c.name}</dd>
      {c.zones.map((z) => (
        <div key={z.name} className="kv-row">
          <dt>{z.name}</dt>
          <dd>
            <span className="mono">
              {z.centerLat.toFixed(6)}, {z.centerLng.toFixed(6)}
            </span>{' '}
            · {t('summary.radius', { radius: fmtMetres(z.radiusM) })}
          </dd>
        </div>
      ))}
      <dt>{t('summary.gracePeriod')}</dt>
      <dd>{fmtSeconds(c.gracePeriodSec)}</dd>
      <dt>{t('summary.ageAccuracy')}</dt>
      <dd>
        {fmtSeconds(c.maxLocationAgeSec)} / {fmtMetres(c.maxAccuracyM)}
      </dd>
      <dt>{t('summary.effectiveSince')}</dt>
      <dd>{fmtDateTime(c.effectiveAt)}</dd>
    </dl>
  );
}

const toMapArea = (z: GeofenceZone) => ({ name: z.name, center: { lat: z.centerLat, lng: z.centerLng }, radiusM: z.radiusM });

/** One map per area (campuses are kilometres apart, so one map would show only dots). */
export function AreaMaps({ zones, height }: { zones: GeofenceZone[]; height?: number }) {
  return (
    <div className="area-maps">
      {zones.map((z, i) => (
        <div key={z.name}>
          {zones.length > 1 ? <h3>{z.name}</h3> : null}
          <GeofenceMap
            center={{ lat: z.centerLat, lng: z.centerLng }}
            radiusM={z.radiusM}
            areaName={z.name}
            otherAreas={zones.filter((_, j) => j !== i).map(toMapArea)}
            height={height}
          />
        </div>
      ))}
    </div>
  );
}

// Messages are looked up at validation time (zod `error` callbacks), so they follow the language switch.
const RADIUS_MSG = msg(() => t('geofence:validation.radius', { min: String(RADIUS_MIN_M), max: String(RADIUS_MAX_M) }));
const LAT_MSG = msg(() => t('geofence:validation.latRange'));
const LNG_MSG = msg(() => t('geofence:validation.lngRange'));
const GRACE_MSG = msg(() => t('geofence:validation.graceRange'));
const AGE_MSG = msg(() => t('geofence:validation.maxAgeRange'));
const ACC_MSG = msg(() => t('geofence:validation.maxAccuracyRange'));
const num = (text: () => string) => z.number(msg(text));

/** Shared contract plus friendlier, translated messages (the shared schema's own messages are English). */
const ZoneFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg(() => t('geofence:validation.areaName')))
    .max(120),
  centerLat: num(() => t('geofence:validation.lat')).min(-90, LAT_MSG).max(90, LAT_MSG),
  centerLng: num(() => t('geofence:validation.lng')).min(-180, LNG_MSG).max(180, LNG_MSG),
  radiusM: z.number(RADIUS_MSG).int(RADIUS_MSG).min(RADIUS_MIN_M, RADIUS_MSG).max(RADIUS_MAX_M, RADIUS_MSG),
});

export const GeofenceFormSchema = UpdateGeofenceConfigSchema.extend({
  name: z
    .string()
    .trim()
    .min(1, msg(() => t('geofence:validation.name')))
    .max(120),
  zones: z
    .array(ZoneFormSchema)
    .min(1, msg(() => t('geofence:validation.minAreas')))
    .max(MAX_GEOFENCE_ZONES, msg(() => t('geofence:validation.maxAreas', { max: String(MAX_GEOFENCE_ZONES) })))
    .refine(
      (zs) => new Set(zs.map((x) => x.name.trim().toLowerCase())).size === zs.length,
      msg(() => t('geofence:validation.uniqueNames')),
    ),
  gracePeriodSec: num(() => t('geofence:validation.grace')).int(GRACE_MSG).min(30, GRACE_MSG).max(3600, GRACE_MSG),
  maxLocationAgeSec: num(() => t('geofence:validation.maxAge')).int(AGE_MSG).min(5, AGE_MSG).max(600, AGE_MSG),
  maxAccuracyM: num(() => t('geofence:validation.maxAccuracy')).int(ACC_MSG).min(1, ACC_MSG).max(500, ACC_MSG),
  reason: z
    .string()
    .trim()
    .min(3, msg(() => t('geofence:validation.reason')))
    .max(500),
});

/** Seed location (SIIT Rangsit) used only when no configuration exists yet. */
const FALLBACK_ZONE: GeofenceZone = { name: 'Main campus', centerLat: 14.0693, centerLng: 100.6035, radiusM: DEFAULT_GEOFENCE.radiusM };

export function GeofenceForm({
  current,
  onSaved,
}: {
  current: GeofenceConfig | undefined;
  onSaved: (c: GeofenceConfig) => void;
}) {
  const { t } = useTranslation(['geofence', 'common']);
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<UpdateGeofenceConfig>({
    resolver: zodResolver(GeofenceFormSchema),
    defaultValues: {
      name: current?.name ?? 'Faculty',
      zones: current?.zones ?? [FALLBACK_ZONE],
      gracePeriodSec: current?.gracePeriodSec ?? DEFAULT_GEOFENCE.gracePeriodSec,
      maxLocationAgeSec: current?.maxLocationAgeSec ?? DEFAULT_GEOFENCE.maxLocationAgeSec,
      maxAccuracyM: current?.maxAccuracyM ?? DEFAULT_GEOFENCE.maxAccuracyM,
      reason: '',
    },
  });
  const save = useMutation({
    mutationFn: (body: UpdateGeofenceConfig) => api.put<GeofenceConfig>('/admin/geofence/config', body),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['geofence-configs'] });
      onSaved(c);
    },
  });

  const zoneFields = useFieldArray({ control, name: 'zones' });
  const [active, setActive] = useState(0);
  const at = Math.max(0, Math.min(active, zoneFields.fields.length - 1));
  const fieldId = zoneFields.fields[at]?.id;
  const zones = watch('zones');
  const lat = zones[at]?.centerLat ?? NaN;
  const lng = zones[at]?.centerLng ?? NaN;
  const radius = zones[at]?.radiusM ?? NaN;
  const zoneErrors = errors.zones?.[at];
  const others = zones
    .filter((z, i) => i !== at && Number.isFinite(z.centerLat) && Number.isFinite(z.centerLng) && Number.isFinite(z.radiusM))
    .map(toMapArea);
  const mapOk = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const mapRadius = Number.isFinite(radius) ? Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, radius)) : DEFAULT_GEOFENCE.radiusM;
  const opts = { shouldDirty: true, shouldValidate: true } as const;

  return (
    <section className="card">
      <h2>{current ? t('form.editTitle', { version: String(current.version) }) : t('form.createTitle')}</h2>
      <form className="geofence-form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <div className="geofence-map">
          {mapOk ? (
            <GeofenceMap
              key={fieldId}
              center={{ lat, lng }}
              radiusM={mapRadius}
              areaName={zones[at]?.name}
              otherAreas={others}
              onCenterChange={(c) => {
                setValue(`zones.${at}.centerLat`, c.lat, opts);
                setValue(`zones.${at}.centerLng`, c.lng, opts);
              }}
              onRadiusChange={(r) => setValue(`zones.${at}.radiusM`, r, opts)}
              height={420}
            />
          ) : (
            <Empty>{t('form.invalidMap')}</Empty>
          )}
        </div>
        <div className="geofence-fields">
          <label className="field">
            <span>{t('form.configName')}</span>
            <input {...register('name')} />
            <FieldError message={errors.name?.message} />
          </label>
          <div className="field">
            <span>{t('form.areas')}</span>
            <div className="row gap wrap" role="tablist" aria-label={t('form.areasAria')}>
              {zoneFields.fields.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={i === at}
                  className={`btn btn-small${i === at ? ' btn-primary' : ''}`}
                  onClick={() => setActive(i)}
                >
                  {zones[i]?.name || t('form.areaN', { n: String(i + 1) })}
                  {errors.zones?.[i] ? t('form.check') : ''}
                </button>
              ))}
              {zoneFields.fields.length < MAX_GEOFENCE_ZONES ? (
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => {
                    const base = zones[at] ?? FALLBACK_ZONE;
                    zoneFields.append({ ...base, name: t('form.areaN', { n: String(zoneFields.fields.length + 1) }) });
                    setActive(zoneFields.fields.length);
                  }}
                >
                  {t('form.addArea')}
                </button>
              ) : null}
            </div>
            <FieldError message={errors.zones?.message ?? errors.zones?.root?.message} />
          </div>
          <div className="grid-2">
            <label className="field">
              <span>{t('form.areaName')}</span>
              <input key={`name-${fieldId}`} {...register(`zones.${at}.name`)} />
              <FieldError message={zoneErrors?.name?.message} />
            </label>
            <div className="field">
              <span>&nbsp;</span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={zoneFields.fields.length <= 1}
                onClick={() => {
                  zoneFields.remove(at);
                  setActive(Math.max(0, at - 1));
                }}
              >
                {t('form.removeArea')}
              </button>
            </div>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>{t('form.lat')}</span>
              <input key={`lat-${fieldId}`} type="number" step="any" {...register(`zones.${at}.centerLat`, { valueAsNumber: true })} />
              <FieldError message={zoneErrors?.centerLat?.message} />
            </label>
            <label className="field">
              <span>{t('form.lng')}</span>
              <input key={`lng-${fieldId}`} type="number" step="any" {...register(`zones.${at}.centerLng`, { valueAsNumber: true })} />
              <FieldError message={zoneErrors?.centerLng?.message} />
            </label>
          </div>
          <div className="field">
            <label htmlFor="radius-input">{t('form.radius', { def: String(DEFAULT_GEOFENCE.radiusM), max: String(RADIUS_MAX_M) })}</label>
            <div className="row gap">
              <input
                type="range"
                aria-label={t('form.radiusSlider')}
                min={RADIUS_MIN_M}
                max={RADIUS_MAX_M}
                step={1}
                value={mapRadius}
                onChange={(e) => setValue(`zones.${at}.radiusM`, Number(e.target.value), opts)}
                className="grow"
              />
              <input
                key={`radius-${fieldId}`}
                id="radius-input"
                type="number"
                className="w-num"
                step={1}
                {...register(`zones.${at}.radiusM`, { valueAsNumber: true })}
              />
            </div>
            <FieldError message={zoneErrors?.radiusM?.message} />
          </div>
          <div className="grid-3">
            <label className="field">
              <span>{t('form.gracePeriod')}</span>
              <input type="number" {...register('gracePeriodSec', { valueAsNumber: true })} />
              <FieldError message={errors.gracePeriodSec?.message} />
            </label>
            <label className="field">
              <span>{t('form.maxAge')}</span>
              <input type="number" {...register('maxLocationAgeSec', { valueAsNumber: true })} />
              <FieldError message={errors.maxLocationAgeSec?.message} />
            </label>
            <label className="field">
              <span>{t('form.maxAccuracy')}</span>
              <input type="number" {...register('maxAccuracyM', { valueAsNumber: true })} />
              <FieldError message={errors.maxAccuracyM?.message} />
            </label>
          </div>
          <label className="field">
            <span>{t('form.reason')}</span>
            <textarea rows={2} {...register('reason')} />
            <FieldError message={errors.reason?.message} />
          </label>
          <div className="alert alert-info small">
            {t('form.versionNote', { next: String(current ? current.version + 1 : 1), current: String(current?.version ?? '—') })}
          </div>
          <ErrorBox error={save.error} />
          <div className="row gap">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? t('form.saving') : t('form.save')}
            </button>
            <button type="button" className="btn btn-ghost" disabled={!isDirty} onClick={() => reset()}>
              {t('form.discard')}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
