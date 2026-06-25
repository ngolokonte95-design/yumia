-- Modèle économique : Venue (partenaires/boost), Ticket (billetterie), Guide + GuideBooking.

CREATE TABLE IF NOT EXISTS "Venue" (
    "id" TEXT NOT NULL,
    "placeId" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "countryCode" TEXT,
    "boostLevel" INTEGER NOT NULL DEFAULT 0,
    "boostExpiresAt" TIMESTAMP(3),
    "businessPlan" TEXT NOT NULL DEFAULT 'basic',
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Guide" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "certified" BOOLEAN NOT NULL DEFAULT false,
    "pricePerPerson" DOUBLE PRECISION NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GuideBooking" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "userId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "people" INTEGER NOT NULL DEFAULT 1,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuideBooking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Venue_boostLevel_idx" ON "Venue"("boostLevel");
CREATE INDEX IF NOT EXISTS "Venue_placeId_idx" ON "Venue"("placeId");
CREATE INDEX IF NOT EXISTS "Ticket_venueId_idx" ON "Ticket"("venueId");
CREATE INDEX IF NOT EXISTS "Ticket_userId_idx" ON "Ticket"("userId");
CREATE INDEX IF NOT EXISTS "Ticket_eventId_idx" ON "Ticket"("eventId");
CREATE INDEX IF NOT EXISTS "Guide_city_idx" ON "Guide"("city");
CREATE INDEX IF NOT EXISTS "GuideBooking_guideId_idx" ON "GuideBooking"("guideId");
CREATE INDEX IF NOT EXISTS "GuideBooking_userId_idx" ON "GuideBooking"("userId");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuideBooking" ADD CONSTRAINT "GuideBooking_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
