-- Champs profil social sur l'utilisateur
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gender"       TEXT;          -- 'male' | 'female' | 'other'
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthYear"    INTEGER;       -- ex: 1995 → âge = année_courante - birthYear
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "interestedIn" TEXT NOT NULL DEFAULT 'everyone'; -- 'male' | 'female' | 'everyone'

-- Médias enrichis sur les posts
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "videoUrl"    TEXT;          -- URL vidéo uploadée
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "musicTrack"  TEXT;          -- ex: "Blinding Lights - The Weeknd"

-- Index pour filtrage par genre dans discover
CREATE INDEX IF NOT EXISTS "User_gender_idx" ON "User"("gender");
CREATE INDEX IF NOT EXISTS "User_interestedIn_idx" ON "User"("interestedIn");
