-- Comptes privés + demandes d'abonnement
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "FollowRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FollowRequest_requesterId_targetId_key" ON "FollowRequest"("requesterId", "targetId");
CREATE INDEX IF NOT EXISTS "FollowRequest_targetId_idx" ON "FollowRequest"("targetId");
