-- ============================================================================
-- Parité Instagram — extension massive du mode social
-- ============================================================================

-- ── Post : gestion de contenu ───────────────────────────────────────────────
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "viewsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isDraft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "commentsDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "hideLikeCount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "taggedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "collabUserId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── Commentaires : réponses en fil + likes + épinglage ──────────────────────
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "likesCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "PostComment_parentId_idx" ON "PostComment"("parentId");

CREATE TABLE IF NOT EXISTS "CommentLike" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("commentId", "userId"),
    CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CommentLike_userId_idx" ON "CommentLike"("userId");

-- ── Sauvegardes : collections ────────────────────────────────────────────────
ALTER TABLE "PostSave" ADD COLUMN IF NOT EXISTS "collectionId" TEXT;
CREATE INDEX IF NOT EXISTS "PostSave_collectionId_idx" ON "PostSave"("collectionId");

CREATE TABLE IF NOT EXISTS "SavedCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedCollection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SavedCollection_userId_idx" ON "SavedCollection"("userId");

-- ── Stories : close friends + stickers + votes de sondage ───────────────────
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "closeFriendsOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "stickers" JSONB;

CREATE TABLE IF NOT EXISTS "StoryPollVote" (
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryPollVote_pkey" PRIMARY KEY ("storyId", "userId"),
    CONSTRAINT "StoryPollVote_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── Conversations : groupes ──────────────────────────────────────────────────
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "isGroup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "creatorId" TEXT;

-- ── Messages : nouveaux types + réponse + vocal + vue unique ────────────────
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'video';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'audio';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'post_share';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'story_reply';

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "postId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "storyId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "durationSec" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "oneTime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "viewedOnceAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "MessageReaction" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId", "userId"),
    CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── Notes (statut 24h dans les DM) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Note_userId_key" ON "Note"("userId");
CREATE INDEX IF NOT EXISTS "Note_expiresAt_idx" ON "Note"("expiresAt");

-- ── Modération : bloquer / restreindre / masquer / signaler ─────────────────
CREATE TABLE IF NOT EXISTS "Block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Block_pkey" PRIMARY KEY ("blockerId", "blockedId")
);
CREATE INDEX IF NOT EXISTS "Block_blockedId_idx" ON "Block"("blockedId");

CREATE TABLE IF NOT EXISTS "Restrict" (
    "userId" TEXT NOT NULL,
    "restrictedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Restrict_pkey" PRIMARY KEY ("userId", "restrictedId")
);

CREATE TABLE IF NOT EXISTS "Mute" (
    "userId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "mutePosts" BOOLEAN NOT NULL DEFAULT true,
    "muteStories" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mute_pkey" PRIMARY KEY ("userId", "mutedId")
);

CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "Report_status_idx" ON "Report"("status");

-- ── Amis proches + favoris ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CloseFriend" (
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CloseFriend_pkey" PRIMARY KEY ("userId", "friendId")
);

CREATE TABLE IF NOT EXISTS "FavoriteUser" (
    "userId" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FavoriteUser_pkey" PRIMARY KEY ("userId", "favoriteId")
);
