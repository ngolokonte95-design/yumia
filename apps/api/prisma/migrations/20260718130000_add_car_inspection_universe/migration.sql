-- Remplace l'univers « Auto-écoles » par « Contrôle technique » côté produit.
-- driving_school (jamais utilisé, migration précédente déjà appliquée) reste en
-- valeur héritée : un enum PG ne permet pas de supprimer une valeur.
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'car_inspection';
