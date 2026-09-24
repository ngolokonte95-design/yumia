-- Qui voit ma position sur la carte, et qui peut me voir dans les Rencontres.
ALTER TABLE "User" ADD COLUMN "mapAudience" TEXT NOT NULL DEFAULT 'friends';
ALTER TABLE "User" ADD COLUMN "encounterAudience" TEXT NOT NULL DEFAULT 'everyone';
