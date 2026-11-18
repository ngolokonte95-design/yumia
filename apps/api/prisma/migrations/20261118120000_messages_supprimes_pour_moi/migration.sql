-- « Supprimer pour moi » : participants ayant retiré le message de leur vue. Purement additif.
ALTER TABLE "Message" ADD COLUMN "hiddenFor" TEXT[] DEFAULT ARRAY[]::TEXT[];
