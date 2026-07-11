-- AlterEnum: add taxi_vtc, atm, currency_exchange universe values
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'taxi_vtc';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'atm';
ALTER TYPE "Universe" ADD VALUE IF NOT EXISTS 'currency_exchange';
