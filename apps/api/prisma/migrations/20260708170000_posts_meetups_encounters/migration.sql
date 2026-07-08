-- Post
CREATE TABLE "Post" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "caption" TEXT,
  "placeId" TEXT,
  "mediaUrls" TEXT[] NOT NULL DEFAULT '{}',
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Post_userId_idx" ON "Post"("userId");
CREATE INDEX "Post_placeId_idx" ON "Post"("placeId");
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- PostLike
CREATE TABLE "PostLike" (
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostLike_pkey" PRIMARY KEY ("postId", "userId")
);
CREATE INDEX "PostLike_userId_idx" ON "PostLike"("userId");
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PostComment
CREATE TABLE "PostComment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostComment_postId_idx" ON "PostComment"("postId");
CREATE INDEX "PostComment_userId_idx" ON "PostComment"("userId");
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MeetupEvent
CREATE TABLE "MeetupEvent" (
  "id" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "city" TEXT NOT NULL,
  "placeId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "maxAttendees" INTEGER,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetupEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MeetupEvent_date_idx" ON "MeetupEvent"("date");
CREATE INDEX "MeetupEvent_city_idx" ON "MeetupEvent"("city");
CREATE INDEX "MeetupEvent_hostId_idx" ON "MeetupEvent"("hostId");

-- MeetupRsvp
CREATE TABLE "MeetupRsvp" (
  "meetupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'going',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetupRsvp_pkey" PRIMARY KEY ("meetupId", "userId")
);
CREATE INDEX "MeetupRsvp_userId_idx" ON "MeetupRsvp"("userId");
ALTER TABLE "MeetupRsvp" ADD CONSTRAINT "MeetupRsvp_meetupId_fkey"
  FOREIGN KEY ("meetupId") REFERENCES "MeetupEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Encounter
CREATE TABLE "Encounter" (
  "id" TEXT NOT NULL,
  "userAId" TEXT NOT NULL,
  "userBId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Encounter_userAId_userBId_placeId_key" ON "Encounter"("userAId", "userBId", "placeId");
CREATE INDEX "Encounter_userAId_idx" ON "Encounter"("userAId");
CREATE INDEX "Encounter_userBId_idx" ON "Encounter"("userBId");
