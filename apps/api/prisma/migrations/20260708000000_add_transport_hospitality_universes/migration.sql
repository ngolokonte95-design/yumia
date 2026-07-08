-- AlterEnum: ajout de 5 nouveaux univers
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'gare';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'hotel';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'monument';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'mall';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'event_venue';
