-- Provenance des lieux : 'seed' (local) ou 'google' (hydratation à la demande).
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS "providerPlaceId" TEXT;
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS "address" TEXT;

-- Déduplication des lieux importés. NULL autorisé en multiple par PostgreSQL,
-- donc les lieux seed (providerPlaceId NULL) ne se gênent pas entre eux.
CREATE UNIQUE INDEX IF NOT EXISTS "Place_providerPlaceId_key"
  ON "Place" ("providerPlaceId");
