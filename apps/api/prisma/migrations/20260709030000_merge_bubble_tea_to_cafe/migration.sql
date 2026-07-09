-- Fusion bubble_tea → cafe (enum PG non supprimable, on migre les données)
UPDATE "Place" SET universe = 'cafe' WHERE universe = 'bubble_tea';
