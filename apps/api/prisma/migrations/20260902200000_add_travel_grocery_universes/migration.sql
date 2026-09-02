-- AlterEnum
-- Trois nouveaux univers : agences de voyage (rattaché à « Culture & Tourisme »
-- côté UI) ainsi que supermarchés et épiceries (« Shopping & Commerce »).
--
-- Note : supermarchés et épiceries étaient jusqu'ici écartés de l'hydratation
-- Google (BLOCKED_GOOGLE_TYPES, pour ne pas polluer les autres univers). Ils
-- sont maintenant exemptés quand ces univers sont explicitement demandés —
-- cf. BLOCK_EXEMPT_UNIVERSES dans place-types.ts.
ALTER TYPE "Universe" ADD VALUE 'travel_agency';
ALTER TYPE "Universe" ADD VALUE 'supermarket';
ALTER TYPE "Universe" ADD VALUE 'grocery_store';
