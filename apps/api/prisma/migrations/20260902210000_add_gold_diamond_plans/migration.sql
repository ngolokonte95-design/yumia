-- AlterEnum
-- Deux nouveaux niveaux d'abonnement : Gold et Diamond, au-dessus de Plus.
-- Non destructif — les utilisateurs existants ('free'/'plus') ne sont pas
-- affectés, aucune migration de données nécessaire.
ALTER TYPE "Plan" ADD VALUE 'gold';
ALTER TYPE "Plan" ADD VALUE 'diamond';
