-- Essai Gold de 7 jours à l'inscription + suivi de la conversion. Purement additif.
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trialRemindedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trialEndNotifiedAt" TIMESTAMP(3);

CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "onTrial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConversionEvent_type_createdAt_idx" ON "ConversionEvent"("type", "createdAt");
CREATE INDEX "ConversionEvent_userId_idx" ON "ConversionEvent"("userId");
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
