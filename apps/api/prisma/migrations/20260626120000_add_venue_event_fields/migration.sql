-- Champs événement optionnels pour la billetterie (Venue).
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "eventName" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "eventDate" TIMESTAMP(3);
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "ticketPrice" DOUBLE PRECISION;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
