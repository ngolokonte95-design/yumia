-- Compteur de codes faux par demande de réinitialisation (anti force brute).
ALTER TABLE "PasswordResetToken" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
