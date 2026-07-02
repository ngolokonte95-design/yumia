-- Ajoute 12 nouveaux univers (culture, famille, loisirs).
-- PostgreSQL ne permet pas de retirer une valeur d'enum ; on ne fait qu'ajouter.
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'museum';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'zoo';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'amusement_park';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'bookstore';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'tea_house';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'karaoke';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'library';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'bowling';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'casino';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'art_gallery';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'aquatic';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'florist';
