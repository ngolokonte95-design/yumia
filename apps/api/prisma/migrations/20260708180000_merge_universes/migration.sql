-- Fusion fast_food → restaurant : fast food = restauration, même univers utilisateur
UPDATE "Place" SET "universe" = 'restaurant' WHERE "universe" = 'fast_food';

-- Fusion padel → fitness : tennis/padel = activité sportive, même univers que fitness
UPDATE "Place" SET "universe" = 'fitness' WHERE "universe" = 'padel';

-- Note : les valeurs d'enum 'fast_food' et 'padel' restent dans le type PostgreSQL
-- (impossible de les supprimer après création) mais ne sont plus utilisées.
