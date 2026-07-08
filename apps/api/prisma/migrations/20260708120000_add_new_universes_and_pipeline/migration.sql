-- AddUniverseValues: 7 nouveaux univers (nightlife/art_gallery/cheese_shop conservés pour rétrocompatibilité)
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'fast_food';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'hookah';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'coworking';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'padel';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'karting';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'laser_game';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'photo_spot';

-- CreateTable PlaceMenu
CREATE TABLE IF NOT EXISTS "PlaceMenu" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable MenuItem
CREATE TABLE IF NOT EXISTS "MenuItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "category" TEXT,
    "photoUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlaceEvent
CREATE TABLE IF NOT EXISTS "PlaceEvent" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "ticketUrl" TEXT,
    "photoUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable EnrichmentJob
CREATE TABLE IF NOT EXISTS "EnrichmentJob" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlaceMenu_placeId_language_key" ON "PlaceMenu"("placeId", "language");
CREATE INDEX IF NOT EXISTS "PlaceMenu_placeId_idx" ON "PlaceMenu"("placeId");
CREATE INDEX IF NOT EXISTS "MenuItem_menuId_idx" ON "MenuItem"("menuId");
CREATE INDEX IF NOT EXISTS "MenuItem_menuId_category_idx" ON "MenuItem"("menuId", "category");
CREATE UNIQUE INDEX IF NOT EXISTS "PlaceEvent_placeId_source_externalId_key" ON "PlaceEvent"("placeId", "source", "externalId") WHERE "externalId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PlaceEvent_placeId_startAt_idx" ON "PlaceEvent"("placeId", "startAt");
CREATE INDEX IF NOT EXISTS "PlaceEvent_startAt_idx" ON "PlaceEvent"("startAt");
CREATE INDEX IF NOT EXISTS "EnrichmentJob_placeId_idx" ON "EnrichmentJob"("placeId");
CREATE INDEX IF NOT EXISTS "EnrichmentJob_status_type_idx" ON "EnrichmentJob"("status", "type");
CREATE INDEX IF NOT EXISTS "EnrichmentJob_createdAt_idx" ON "EnrichmentJob"("createdAt");

-- AddForeignKey MenuItem → PlaceMenu
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey"
    FOREIGN KEY ("menuId") REFERENCES "PlaceMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
