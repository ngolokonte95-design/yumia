-- Suspension de compte : exigée par la règle 1.2 de l'App Store (pouvoir
-- exclure l'auteur d'un contenu signalé). NULL = compte actif.
ALTER TABLE "User" ADD COLUMN "suspendedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "suspendedReason" TEXT;

-- Trace de traitement d'un signalement : sans elle, un signalement traité et
-- un signalement oublié sont indiscernables.
ALTER TABLE "Report" ADD COLUMN "resolution" TEXT;
ALTER TABLE "Report" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- La file d'attente de modération se lit par date, du plus ancien au plus
-- récent : c'est l'ordre dans lequel on doit traiter.
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
