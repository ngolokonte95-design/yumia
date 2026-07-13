-- PostSave : enregistrement (bookmark) d'un post
CREATE TABLE "PostSave" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostSave_pkey" PRIMARY KEY ("postId","userId")
);
CREATE INDEX "PostSave_userId_idx" ON "PostSave"("userId");
ALTER TABLE "PostSave" ADD CONSTRAINT "PostSave_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Repost : republication d'un post
CREATE TABLE "Repost" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Repost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Repost_postId_userId_key" ON "Repost"("postId","userId");
CREATE INDEX "Repost_userId_idx" ON "Repost"("userId");
CREATE INDEX "Repost_createdAt_idx" ON "Repost"("createdAt");
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StoryHighlight : stories à la une épinglées sur le profil
CREATE TABLE "StoryHighlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoryHighlight_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoryHighlight_userId_idx" ON "StoryHighlight"("userId");

-- StoryHighlightItem : médias d'une story à la une (survivent aux 24h)
CREATE TABLE "StoryHighlightItem" (
    "id" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "type" "StoryType" NOT NULL DEFAULT 'photo',
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryHighlightItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoryHighlightItem_highlightId_idx" ON "StoryHighlightItem"("highlightId");
ALTER TABLE "StoryHighlightItem" ADD CONSTRAINT "StoryHighlightItem_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "StoryHighlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
