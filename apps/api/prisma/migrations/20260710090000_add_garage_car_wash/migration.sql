-- AlterEnum: add garage and car_wash universe values
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'garage';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'car_wash';
