import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { LocationClass } from '@attendance/shared';
import { enumLabel } from '../../lib/format';
import { Loading } from '../ui';
import { SvgGeofenceMap } from './SvgGeofenceMap';
import { CLASS_COLOR, GEOFENCE_COLOR, type GeofenceMapProps } from './types';

// Loaded on demand so the Google Maps bindings are only downloaded when a key is configured.
const GoogleGeofenceMap = lazy(() => import('./GoogleGeofenceMap'));

export function mapsApiKey(): string | undefined {
  const k = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

export function GeofenceMap(props: GeofenceMapProps) {
  const { t } = useTranslation(['geofence', 'common']);
  const key = mapsApiKey();
  return (
    <div className="map">
      {key ? (
        <Suspense fallback={<Loading label={t('map.loading')} />}>
          <GoogleGeofenceMap apiKey={key} {...props} />
        </Suspense>
      ) : (
        <SvgGeofenceMap {...props} />
      )}
      <MapLegend withEvidence={(props.evidence?.length ?? 0) > 0} />
    </div>
  );
}

function MapLegend({ withEvidence }: { withEvidence: boolean }) {
  const { t } = useTranslation(['geofence', 'common']);
  return (
    <ul className="legend" aria-label={t('map.legend')}>
      <li>
        <span className="swatch" style={{ borderColor: GEOFENCE_COLOR, background: `${GEOFENCE_COLOR}22` }} /> {t('map.geofence')}
      </li>
      {withEvidence
        ? Object.values(LocationClass).map((c) => (
            <li key={c}>
              <span className="dot" style={{ background: CLASS_COLOR[c] }} /> {enumLabel('locationClass', c)}
            </li>
          ))
        : null}
      {withEvidence ? <li className="muted">{t('map.accuracyRing')}</li> : null}
    </ul>
  );
}
