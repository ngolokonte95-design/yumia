-- Add composite (lat, lng) index on Place for bounding-box geo queries.
-- Used by nearbyViaPg() and trending() to avoid full-table scans.
CREATE INDEX IF NOT EXISTS "Place_lat_lng_idx" ON "Place"("lat", "lng");
