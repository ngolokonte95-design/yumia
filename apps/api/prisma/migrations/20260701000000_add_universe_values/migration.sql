-- Ajout des nouvelles valeurs à l'enum Universe
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'nightclub';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'pub';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'cheese_shop';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'beach';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'place_of_worship';
