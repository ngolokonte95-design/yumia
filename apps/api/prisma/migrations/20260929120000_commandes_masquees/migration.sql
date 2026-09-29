-- Le client peut retirer de « Mes commandes » une commande terminée
-- (livrée, annulée, remboursée). La commande reste en base : c'est une pièce
-- comptable, et l'administration continue de la voir. Purement additif.
ALTER TABLE "Order" ADD COLUMN "hiddenByUserAt" TIMESTAMP(3);
