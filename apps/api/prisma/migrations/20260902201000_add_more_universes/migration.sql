-- AlterEnum
-- Cinq nouveaux univers : animaleries et sport & équipement (« Shopping &
-- Commerce »), mairies et casernes de pompiers (« Autres »), théâtres
-- (« Culture & Tourisme »).
--
-- Note : 'sporting_goods' utilise le type Google 'sporting_goods_store', qui
-- reste bloqué globalement (BLOCKED_GOOGLE_TYPES, grandes surfaces non-
-- expérience) mais est exempté pour cet univers précis — cf.
-- BLOCK_EXEMPT_UNIVERSES dans place-types.ts.
ALTER TYPE "Universe" ADD VALUE 'pet_store';
ALTER TYPE "Universe" ADD VALUE 'sporting_goods';
ALTER TYPE "Universe" ADD VALUE 'city_hall';
ALTER TYPE "Universe" ADD VALUE 'fire_station';
ALTER TYPE "Universe" ADD VALUE 'theater';
