import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  DEFAULT_GEOFENCE,
  RADIUS_MAX_M,
  RADIUS_MIN_M,
  UpdateGeofenceConfigSchema,
  type GeofenceConfig,
  type UpdateGeofenceConfig,
} from '@attendance/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { canEditGeofence } from '../auth/roles';
import { GeofenceMap } from '../components/map/GeofenceMap';
import { Empty, ErrorBox, FieldError, Loading, PageHeader } from '../components/ui';
import { fmtDateTime, fmtMetres } from '../lib/format';

export function GeofencePage() {
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
        title="Geofence configuration"
        subtitle="Every change creates a new version. Requests that are already pending keep the version they were created with; the new version applies to new requests once the mobile app refreshes its configuration."
      />
      <ErrorBox error={configs.error} />
      {configs.isPending ? <Loading /> : null}
      {saved ? (
        <div className="alert alert-success" role="status">
          Saved as version {saved.version}. Staff devices pick it up the next time the app refreshes its configuration.
        </div>
      ) : null}
      {configs.data ? (
        <>
          {editable ? (
            <GeofenceForm key={current?.version ?? 0} current={current} onSaved={setSaved} />
          ) : current ? (
            <section className="card">
              <h2>Current configuration (v{current.version})</h2>
              <ConfigSummary c={current} />
              <GeofenceMap center={{ lat: current.centerLat, lng: current.centerLng }} radiusM={current.radiusM} />
              <p className="muted small">Only a System Administrator can change the geofence.</p>
            </section>
          ) : (
            <Empty>No geofence has been configured yet.</Empty>
          )}
          <section className="card">
            <h2>Version history</h2>
            {configs.data.length === 0 ? (
              <Empty>No versions yet.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Name</th>
                      <th>Centre</th>
                      <th>Radius</th>
                      <th>Grace</th>
                      <th>Max age</th>
                      <th>Max accuracy</th>
                      <th>Effective</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {configs.data.map((c, i) => (
                      <tr key={c.version}>
                        <td>
                          v{c.version} {i === 0 ? <span className="badge badge-green">Current</span> : null}
                        </td>
                        <td>{c.name}</td>
                        <td className="mono">
                          {c.centerLat.toFixed(6)}, {c.centerLng.toFixed(6)}
                        </td>
                        <td>{fmtMetres(c.radiusM)}</td>
                        <td>{c.gracePeriodSec} s</td>
                        <td>{c.maxLocationAgeSec} s</td>
                        <td>{c.maxAccuracyM} m</td>
                        <td>{fmtDateTime(c.effectiveAt)}</td>
                        <td className="right">
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => setViewVersion(viewVersion === c.version ? null : c.version)}
                          >
                            {viewVersion === c.version ? 'Hide' : 'Show on map'}
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
                <h3>Version {viewed.version}</h3>
                <GeofenceMap
                  key={viewed.version}
                  center={{ lat: viewed.centerLat, lng: viewed.centerLng }}
                  radiusM={viewed.radiusM}
                  height={300}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

function ConfigSummary({ c }: { c: GeofenceConfig }) {
  return (
    <dl className="kv">
      <dt>Name</dt>
      <dd>{c.name}</dd>
      <dt>Centre</dt>
      <dd className="mono">
        {c.centerLat.toFixed(6)}, {c.centerLng.toFixed(6)}
      </dd>
      <dt>Radius</dt>
      <dd>{fmtMetres(c.radiusM)}</dd>
      <dt>Grace period</dt>
      <dd>{c.gracePeriodSec} s</dd>
      <dt>Max location age / accuracy</dt>
      <dd>
        {c.maxLocationAgeSec} s / {c.maxAccuracyM} m
      </dd>
      <dt>Effective since</dt>
      <dd>{fmtDateTime(c.effectiveAt)}</dd>
    </dl>
  );
}

const RADIUS_MSG = `Radius must be a whole number between ${RADIUS_MIN_M} and ${RADIUS_MAX_M} m`;
const num = (msg: string) => z.number({ error: msg });

/** Shared contract plus friendlier messages for the number fields. */
export const GeofenceFormSchema = UpdateGeofenceConfigSchema.extend({
  centerLat: num('Enter a latitude').min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  centerLng: num('Enter a longitude')
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  radiusM: num(RADIUS_MSG).int(RADIUS_MSG).min(RADIUS_MIN_M, RADIUS_MSG).max(RADIUS_MAX_M, RADIUS_MSG),
  gracePeriodSec: num('Enter the grace period').int().min(30, 'Between 30 and 3600 s').max(3600, 'Between 30 and 3600 s'),
  maxLocationAgeSec: num('Enter the maximum age').int().min(5, 'Between 5 and 600 s').max(600, 'Between 5 and 600 s'),
  maxAccuracyM: num('Enter the maximum accuracy').int().min(1, 'Between 1 and 500 m').max(500, 'Between 1 and 500 m'),
});

/** Seed location (SIIT Rangsit) used only when no configuration exists yet. */
const FALLBACK_CENTRE = { lat: 14.0693, lng: 100.6035 };

export function GeofenceForm({
  current,
  onSaved,
}: {
  current: GeofenceConfig | undefined;
  onSaved: (c: GeofenceConfig) => void;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateGeofenceConfig>({
    resolver: zodResolver(GeofenceFormSchema),
    defaultValues: {
      name: current?.name ?? 'Faculty',
      centerLat: current?.centerLat ?? FALLBACK_CENTRE.lat,
      centerLng: current?.centerLng ?? FALLBACK_CENTRE.lng,
      radiusM: current?.radiusM ?? DEFAULT_GEOFENCE.radiusM,
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

  const lat = watch('centerLat');
  const lng = watch('centerLng');
  const radius = watch('radiusM');
  const mapOk = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const mapRadius = Number.isFinite(radius) ? Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, radius)) : DEFAULT_GEOFENCE.radiusM;
  const opts = { shouldDirty: true, shouldValidate: true } as const;

  return (
    <section className="card">
      <h2>{current ? `Edit configuration (current: v${current.version})` : 'Create the first configuration'}</h2>
      <form className="geofence-form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <div className="geofence-map">
          {mapOk ? (
            <GeofenceMap
              center={{ lat, lng }}
              radiusM={mapRadius}
              onCenterChange={(c) => {
                setValue('centerLat', c.lat, opts);
                setValue('centerLng', c.lng, opts);
              }}
              onRadiusChange={(r) => setValue('radiusM', r, opts)}
              height={420}
            />
          ) : (
            <Empty>Enter a valid latitude and longitude to show the map.</Empty>
          )}
        </div>
        <div className="geofence-fields">
          <label className="field">
            <span>Name</span>
            <input {...register('name')} />
            <FieldError message={errors.name?.message} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Centre latitude</span>
              <input type="number" step="any" {...register('centerLat', { valueAsNumber: true })} />
              <FieldError message={errors.centerLat?.message} />
            </label>
            <label className="field">
              <span>Centre longitude</span>
              <input type="number" step="any" {...register('centerLng', { valueAsNumber: true })} />
              <FieldError message={errors.centerLng?.message} />
            </label>
          </div>
          <div className="field">
            <label htmlFor="radius-input">Radius (m) — default {DEFAULT_GEOFENCE.radiusM} m, at most {RADIUS_MAX_M} m</label>
            <div className="row gap">
              <input
                type="range"
                aria-label="Radius slider"
                min={RADIUS_MIN_M}
                max={RADIUS_MAX_M}
                step={1}
                value={mapRadius}
                onChange={(e) => setValue('radiusM', Number(e.target.value), opts)}
                className="grow"
              />
              <input
                id="radius-input"
                type="number"
                className="w-num"
                step={1}
                {...register('radiusM', { valueAsNumber: true })}
              />
            </div>
            <FieldError message={errors.radiusM?.message} />
          </div>
          <div className="grid-3">
            <label className="field">
              <span>Grace period (s)</span>
              <input type="number" {...register('gracePeriodSec', { valueAsNumber: true })} />
              <FieldError message={errors.gracePeriodSec?.message} />
            </label>
            <label className="field">
              <span>Max location age (s)</span>
              <input type="number" {...register('maxLocationAgeSec', { valueAsNumber: true })} />
              <FieldError message={errors.maxLocationAgeSec?.message} />
            </label>
            <label className="field">
              <span>Max accuracy (m)</span>
              <input type="number" {...register('maxAccuracyM', { valueAsNumber: true })} />
              <FieldError message={errors.maxAccuracyM?.message} />
            </label>
          </div>
          <label className="field">
            <span>Reason for the change (required, kept in the audit log)</span>
            <textarea rows={2} {...register('reason')} />
            <FieldError message={errors.reason?.message} />
          </label>
          <div className="alert alert-info small">
            Saving creates version {current ? current.version + 1 : 1}. Pending attendance requests keep the version
            they were created with (v{current?.version ?? '—'}); only new requests use the new geofence.
          </div>
          <ErrorBox error={save.error} />
          <div className="row gap">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save as new version'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={!isDirty} onClick={() => reset()}>
              Discard changes
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
