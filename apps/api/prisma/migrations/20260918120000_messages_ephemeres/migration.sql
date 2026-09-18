-- Messages éphémères : durée réglée par conversation, échéance posée à l'envoi.
ALTER TABLE "Conversation" ADD COLUMN "ephemeralTtlSec" INTEGER;
ALTER TABLE "Message" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "Message_expiresAt_idx" ON "Message"("expiresAt");
