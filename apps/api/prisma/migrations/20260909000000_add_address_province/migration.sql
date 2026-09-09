-- Région/département de l'adresse de livraison.
-- AliExpress refuse toute commande sans « province » (MissingParameter).
-- Colonne nullable : les adresses déjà enregistrées restent valides, et
-- l'expédition retombe sur la ville tant qu'aucune région n'est saisie.
ALTER TABLE "ShippingAddress" ADD COLUMN "province" TEXT;
