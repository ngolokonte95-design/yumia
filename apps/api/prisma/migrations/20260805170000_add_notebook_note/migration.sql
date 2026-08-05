-- Bloc-notes Yumia.
--
-- ATTENTION : table distincte de "Note", qui est le statut ephemere affiche en
-- haut des DM. Le nom "NotebookNote" evite une collision destructrice avec ce
-- modele existant, dont le nom est herite.
--
-- Synchronisation multi-appareils : dernier ecrivain gagne, arbitre par
-- updatedAt. Un merge par champ (CRDT) serait disproportionne pour des notes
-- personnelles rarement editees depuis deux appareils simultanement.
CREATE TABLE "NotebookNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'note',
    "items" JSONB NOT NULL DEFAULT '[]',
    "color" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "placeId" TEXT,
    "placeName" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "noteDate" TIMESTAMP(3),
    "calendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotebookNote_userId_updatedAt_idx" ON "NotebookNote"("userId", "updatedAt");
CREATE INDEX "NotebookNote_userId_archived_idx" ON "NotebookNote"("userId", "archived");
CREATE INDEX "NotebookNote_calendarEventId_idx" ON "NotebookNote"("calendarEventId");

ALTER TABLE "NotebookNote" ADD CONSTRAINT "NotebookNote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
