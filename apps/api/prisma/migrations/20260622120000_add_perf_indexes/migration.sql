-- Optimise le cron streak-danger : filtre sur current > 0 ET lastActivityDay < today
CREATE INDEX IF NOT EXISTS "Streak_current_lastActivityDay_idx"
  ON "Streak" ("current", "lastActivityDay");

-- Optimise le cron daily-digest : filtre sur expoPushToken IS NOT NULL
CREATE INDEX IF NOT EXISTS "User_expoPushToken_idx"
  ON "User" ("expoPushToken");
