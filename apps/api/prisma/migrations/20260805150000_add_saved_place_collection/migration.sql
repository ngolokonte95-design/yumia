-- Relie un lieu sauvegarde a une collection de favoris.
--
-- Les collections (SavedCollection) ne servaient jusqu'ici qu'aux publications
-- enregistrees (PostSave.collectionId). Cette colonne permet a une meme
-- collection de contenir a la fois des lieux et des publications, ce qui est la
-- base de l'espace Favoris unifie.
--
-- Nullable et sans valeur par defaut : les lieux deja sauvegardes restent dans
-- les favoris, simplement non ranges. Aucune donnee existante n'est touchee.
ALTER TABLE "SavedPlace" ADD COLUMN "collectionId" TEXT;

CREATE INDEX "SavedPlace_collectionId_idx" ON "SavedPlace"("collectionId");
