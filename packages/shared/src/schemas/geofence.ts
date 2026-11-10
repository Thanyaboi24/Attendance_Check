import { z } from 'zod';
import { RADIUS_MAX_M, RADIUS_MIN_M } from '../constants';
import { IsoDateTime } from './common';

export const GeofenceConfigSchema = z.object({
  version: z.number().int().positive(),
  name: z.string(),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(RADIUS_MIN_M).max(RADIUS_MAX_M),
  gracePeriodSec: z.number().int().positive(),
  maxLocationAgeSec: z.number().int().positive(),
  maxAccuracyM: z.number().int().positive(),
  effectiveAt: IsoDateTime,
});
export type GeofenceConfig = z.infer<typeof GeofenceConfigSchema>;

/** Every change creates a new configuration version (DS2 §2.9.5). */
export const UpdateGeofenceConfigSchema = z.object({
  name: z.string().trim().min(1).max(120),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(RADIUS_MIN_M).max(RADIUS_MAX_M),
  gracePeriodSec: z.number().int().min(30).max(3600),
  maxLocationAgeSec: z.number().int().min(5).max(600),
  maxAccuracyM: z.number().int().min(1).max(500),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});
export type UpdateGeofenceConfig = z.infer<typeof UpdateGeofenceConfigSchema>;
