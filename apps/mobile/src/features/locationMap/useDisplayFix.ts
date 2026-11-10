import { classify, type GeofenceConfig } from '@attendance/shared';
import { useCallback, useState } from 'react';
import { getDeps } from '../../app/container';
import { isLocationError } from '../../domain/errors';
import { useAppStore } from '../../store/appStore';

/** Takes a fresh fix for display (location card / map). It is not stored as evidence and never uploaded. */
export function useDisplayFix(cfg: GeofenceConfig | null) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const deps = await getDeps();
      const reading = await deps.location.getFreshLocation();
      if (cfg) {
        const c = classify(reading, cfg, new Date());
        useAppStore.getState().setLastFix({
          ...reading,
          isMock: reading.isMock ?? false,
          classification: c.classification,
          distanceM: c.distanceM,
          uncertainReason: c.uncertainReason,
        });
      }
    } catch (e) {
      setError(isLocationError(e) ? e.message : 'Location unavailable');
    } finally {
      setBusy(false);
    }
  }, [cfg]);

  return { busy, error, setError, refresh };
}
