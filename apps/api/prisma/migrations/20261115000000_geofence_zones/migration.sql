-- Several areas (campuses) per geofence version. NULL keeps the single centre/radius circle.
ALTER TABLE "GeofenceConfiguration" ADD COLUMN "zones" JSONB;
