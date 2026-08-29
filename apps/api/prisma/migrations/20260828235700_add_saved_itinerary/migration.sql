-- CreateTable
CREATE TABLE "SavedItinerary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedItinerary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedItinerary_userId_createdAt_idx" ON "SavedItinerary"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SavedItinerary" ADD CONSTRAINT "SavedItinerary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
