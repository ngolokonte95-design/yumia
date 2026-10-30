-- Appels app fermée : jeton PushKit iOS et notification d'appel native Android.
ALTER TABLE "User" ADD COLUMN "voipToken" TEXT;
ALTER TABLE "User" ADD COLUMN "nativeCallPush" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "User_voipToken_idx" ON "User"("voipToken");
