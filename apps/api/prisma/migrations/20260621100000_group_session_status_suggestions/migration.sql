-- GroupSession: add status enum, createdById, suggestions
CREATE TYPE "GroupStatus" AS ENUM ('waiting', 'voting', 'done');

ALTER TABLE "GroupSession"
  ADD COLUMN "status"      "GroupStatus" NOT NULL DEFAULT 'waiting',
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "suggestions" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX "GroupSession_inviteCode_idx" ON "GroupSession"("inviteCode");
