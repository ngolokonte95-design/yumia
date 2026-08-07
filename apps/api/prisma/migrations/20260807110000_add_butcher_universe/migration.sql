-- AlterEnum
ALTER TYPE "Universe" ADD VALUE 'butcher';

-- Les lieux existants en 'local_specialty' (5 lieux seed : L'Avant Comptoir de
-- la Mer, Chez Janou, Gymkhana, Fortnum & Mason, Tickets Bar) ne sont pas des
-- boucheries — on les reclasse en 'restaurant' plutôt que de les faire hériter
-- silencieusement du nouvel univers 'butcher'. 'local_specialty' reste dans
-- l'enum (non supprimable) mais n'est plus utilisé par aucun lieu ni exposé
-- dans l'UI (voir packages/shared/src/universes.ts).
UPDATE "Place" SET "universe" = 'restaurant' WHERE "universe" = 'local_specialty';
