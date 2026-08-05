-- Calendrier personnel Yumia.
--
-- Fuseaux : startAt/endAt sont des instants absolus (timestamptz) et `timezone`
-- garde le fuseau IANA du lieu. Les deux sont necessaires — un diner reserve a
-- Tokyo doit rester a 20h heure de Tokyo meme consulte depuis Paris.
--
-- Recurrence : `rrule` suit la RFC 5545, format standard choisi pour rendre
-- possible une synchronisation future avec Apple et Google Calendar.
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "category" TEXT NOT NULL DEFAULT 'personal',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "rrule" TEXT,
    "excludedDates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "reminderMinutes" INTEGER,
    "placeId" TEXT,
    "placeName" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarEvent_userId_startAt_idx" ON "CalendarEvent"("userId", "startAt");
CREATE INDEX "CalendarEvent_placeId_idx" ON "CalendarEvent"("placeId");

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
