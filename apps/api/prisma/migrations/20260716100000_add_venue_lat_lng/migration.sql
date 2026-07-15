-- Ajoute les colonnes de géolocalisation au modèle Venue pour le filtrage par proximité.
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
