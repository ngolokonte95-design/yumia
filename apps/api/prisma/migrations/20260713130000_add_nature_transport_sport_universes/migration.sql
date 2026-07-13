-- Add new Universe enum values
-- Nature & Plein air
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'hiking';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'natural_site';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'waterspot';
-- Sport & Loisirs
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'jetski';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'quad';
-- Transport & Mobilité
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'airport';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'parking';
