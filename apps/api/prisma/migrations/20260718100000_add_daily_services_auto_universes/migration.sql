-- 3 univers « Services du quotidien » : banques, serruriers, réparation téléphone.
-- 3 univers « Automobile » : bornes de recharge, pièces auto, auto-écoles.
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'bank';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'locksmith';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'phone_repair';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'ev_charging';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'auto_parts';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'driving_school';
