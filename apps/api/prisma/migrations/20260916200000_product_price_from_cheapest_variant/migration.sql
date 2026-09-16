-- Prix d'un produit = prix de sa déclinaison en stock la moins chère.
--
-- Jusqu'ici, le prix du produit venait des résultats de recherche AliExpress,
-- tandis que la fiche et le panier facturent le prix de la déclinaison
-- choisie : la carte du rayon annonçait un prix que le client ne retrouvait
-- pas en ouvrant le produit. L'import applique désormais cette règle ; cette
-- migration l'applique aux produits déjà en boutique.
--
-- Sans déclinaison en stock avec un prix, le produit garde son prix actuel.
UPDATE "Product" AS p
SET "priceCents" = v.prix_min
FROM (
  SELECT "productId", MIN("priceCents") AS prix_min
  FROM "ProductVariant"
  WHERE "priceCents" IS NOT NULL AND "priceCents" > 0 AND "stock" > 0
  GROUP BY "productId"
) AS v
WHERE v."productId" = p."id"
  AND p."priceCents" <> v.prix_min;
