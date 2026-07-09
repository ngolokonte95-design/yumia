-- Reclassification des lieux mal placés dans les univers beauté/bien-être.
-- Problème : beauty_salon était trop générique → ramenait ongleries, coiffeurs,
-- magasins de cosmétiques (Yves Rocher) dans l'univers spa.

-- Les lieux en 'spa' dont le tag principal est 'nail_salon' → ongleries
UPDATE "Place"
SET universe = 'nail_salon'
WHERE universe = 'spa'
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%nail%' OR t ILIKE '%ongl%'
  );

-- Les lieux en 'spa' dont le tag indique coiffure → hair_salon
UPDATE "Place"
SET universe = 'hair_salon'
WHERE universe = 'spa'
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%hair%' OR t ILIKE '%coiff%' OR t ILIKE '%hair_salon%' OR t ILIKE '%hair_care%'
  );

-- Les lieux en 'spa' dont le tag indique cosmétiques/magasin → shopping
UPDATE "Place"
SET universe = 'shopping'
WHERE universe = 'spa'
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%cosmetic%' OR t ILIKE '%beauty_product%' OR t ILIKE '%drugstore%'
      OR t ILIKE '%store%' OR t ILIKE '%shop%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%spa%' OR t ILIKE '%wellness%' OR t ILIKE '%massage%'
  );

-- Les lieux en 'spa' dont le tag est barber_shop → barber
UPDATE "Place"
SET universe = 'barber'
WHERE universe = 'spa'
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t
    WHERE t ILIKE '%barber%'
  );
