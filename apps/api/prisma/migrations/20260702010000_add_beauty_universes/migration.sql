-- Ajoute 6 univers beauté / shopping.
-- PostgreSQL ne permet pas de retirer une valeur d'enum ; on ne fait qu'ajouter.
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'nail_salon';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'hair_salon';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'barber';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'shopping';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'jewelry';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'massage';
