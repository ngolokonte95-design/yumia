-- Abonnement Premium (RevenueCat). `plan` (enum free/plus) reste synchronisé.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPremium" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumSince" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumPlan" TEXT;
