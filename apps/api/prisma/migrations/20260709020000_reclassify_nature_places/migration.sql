-- Reclassification des plages et parcs mal classés en tourist_activity.
-- Cause : tourist_attraction était listé avant beach/park dans le reverse map.

-- Plages classées en tourist_activity → beach
UPDATE "Place"
SET universe = 'beach'
WHERE universe = 'tourist_activity'
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%beach%' OR t ILIKE '%plage%'
  );

-- Parcs/nature classés en tourist_activity → park
UPDATE "Place"
SET universe = 'park'
WHERE universe = 'tourist_activity'
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%park%' OR t ILIKE '%national_park%' OR t ILIKE '%nature_reserve%'
      OR t ILIKE '%garden%' OR t ILIKE '%jardin%'
  );
