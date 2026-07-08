-- CreateTable PlaceReview (1 avis par user par lieu)
CREATE TABLE IF NOT EXISTS "PlaceReview" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaceReview_placeId_userId_key" ON "PlaceReview"("placeId", "userId");
CREATE INDEX IF NOT EXISTS "PlaceReview_placeId_idx" ON "PlaceReview"("placeId");
CREATE INDEX IF NOT EXISTS "PlaceReview_userId_idx" ON "PlaceReview"("userId");

-- Remove market from Universe (conservé dans l'enum pour rétrocompatibilité)
-- Les lieux market existants sont redirigés vers shopping au prochain re-hydration
