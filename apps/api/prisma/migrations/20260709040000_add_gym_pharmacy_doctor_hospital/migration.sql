-- Nouveaux univers : gym, pharmacy, doctor, hospital
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'gym';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'pharmacy';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'doctor';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'hospital';

-- Les gymnases en 'fitness' dont le tag indique gym → univers gym
UPDATE "Place"
SET universe = 'gym'
WHERE universe = 'fitness'
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%gym%' OR t ILIKE '%fitness_center%' OR t ILIKE '%health_club%'
  );
