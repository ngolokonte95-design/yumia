-- Editeur de post facon CapCut : texte et dessins superposes, son coupe,
-- voix off.
--
-- `overlays` est recompose a la LECTURE par le client (meme mecanisme que
-- Story.stickers) — jamais grave dans le fichier video, qui reste inchange.
-- Additif et retrocompatible : les posts existants ont overlays=NULL,
-- videoMuted=false, voiceTrackUrl=NULL, comportement inchange.
ALTER TABLE "Post" ADD COLUMN "overlays" JSONB;
ALTER TABLE "Post" ADD COLUMN "videoMuted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "voiceTrackUrl" TEXT;
