import { z } from 'zod';
import { MAX_GEOFENCE_ZONES, RADIUS_MAX_M, RADIUS_MIN_M } from '../constants';
import { IsoDateTime } from './common';

/** One circular area (e.g. one campus). A configuration version holds one or more zones. */
export const GeofenceZoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(RADIUS_MIN_M).max(RADIUS_MAX_M),
});
export type GeofenceZone = z.infer<typeof GeofenceZoneSchema>;

export const GeofenceConfigSchema = z.object({
  version: z.number().int().positive(),
  name: z.string(),
  /** The first zone, kept at the top level for older clients. `zones` is authoritative. */
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(RADIUS_MIN_M).max(RADIUS_MAX_M),
  /** Every area that counts as "inside". A location is inside when it is confirmed inside any zone. */
  zones: z.array(GeofenceZoneSchema).min(1).max(MAX_GEOFENCE_ZONES),
  gracePeriodSec: z.number().int().positive(),
  maxLocationAgeSec: z.number().int().positive(),
  maxAccuracyM: z.number().int().positive(),
  effectiveAt: IsoDateTime,
});
export type GeofenceConfig = z.infer<typeof GeofenceConfigSchema>;

/** Every change creates a new configuration version (DS2 §2.9.5). */
export const UpdateGeofenceConfigSchema = z.object({
  name: z.string().trim().min(1).max(120),
  zones: z
    .array(GeofenceZoneSchema)
    .min(1, 'Add at least one area')
    .max(MAX_GEOFENCE_ZONES, `At most ${MAX_GEOFENCE_ZONES} areas`)
    .refine((zs) => new Set(zs.map((z) => z.name.trim().toLowerCase())).size === zs.length, 'Each area needs a different name'),
  gracePeriodSec: z.number().int().min(30).max(3600),
  maxLocationAgeSec: z.number().int().min(5).max(600),
  maxAccuracyM: z.number().int().min(1).max(500),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});
export type UpdateGeofenceConfig = z.infer<typeof UpdateGeofenceConfigSchema>;

/** The zones of a configuration; falls back to the top-level circle for configurations without `zones`. */
export function zonesOf(cfg: { name: string; centerLat: number; centerLng: number; radiusM: number; zones?: readonly GeofenceZone[] | null }): GeofenceZone[] {
  if (cfg.zones && cfg.zones.length > 0) return [...cfg.zones];
  return [{ name: cfg.name, centerLat: cfg.centerLat, centerLng: cfg.centerLng, radiusM: cfg.radiusM }];
}
