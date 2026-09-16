-- Les commandes survivent à la suppression du compte : pièces comptables à
-- conserver dix ans. Le lien vers l'utilisateur passe à NULL au lieu
-- d'emporter la commande.

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
