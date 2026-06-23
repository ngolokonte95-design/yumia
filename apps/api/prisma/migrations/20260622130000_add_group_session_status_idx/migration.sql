-- Optimise le cron de nettoyage des GroupSession (filtre sur status + createdAt)
CREATE INDEX IF NOT EXISTS "GroupSession_status_createdAt_idx"
  ON "GroupSession" ("status", "createdAt");
