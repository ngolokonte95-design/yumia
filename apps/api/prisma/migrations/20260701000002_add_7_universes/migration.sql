-- Ajout des 7 nouveaux univers YUMIA (spa, park, cinema, market, fitness, live_music, escape_game)
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'spa';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'park';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'cinema';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'market';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'fitness';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'live_music';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'escape_game';
