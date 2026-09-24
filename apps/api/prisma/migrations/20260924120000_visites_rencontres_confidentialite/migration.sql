-- Confidentialité des visites et des rencontres, désactivées par défaut.
ALTER TABLE "User" ADD COLUMN "shareVisits" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "shareEncounters" BOOLEAN NOT NULL DEFAULT false;

-- Rencontres refondues : plus de lieu, une ligne par paire et par jour.
-- Les anciennes lignes venaient d'un mécanisme retiré (notification en temps
-- réel du lieu exact à un inconnu) : elles ne sont pas conservées.
DELETE FROM "Encounter";
DROP INDEX IF EXISTS "Encounter_userAId_userBId_placeId_key";
ALTER TABLE "Encounter" DROP COLUMN "placeId";
ALTER TABLE "Encounter" ADD COLUMN "day" DATE NOT NULL;
CREATE UNIQUE INDEX "Encounter_userAId_userBId_day_key" ON "Encounter"("userAId", "userBId", "day");
