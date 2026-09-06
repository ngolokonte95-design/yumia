-- AlterEnum
-- Nouveau type de message pour les événements d'appel (fin/manqué/refusé),
-- afin qu'ils apparaissent dans le fil de discussion et dans l'aperçu de la
-- liste des conversations — non destructif, aucune donnée existante affectée.
ALTER TYPE "MessageType" ADD VALUE 'call';

-- AlterTable
-- Champs annexes de l'événement d'appel (uniquement renseignés quand
-- type = 'call'). Nommés pour correspondre exactement aux champs attendus
-- par CallEventBubble côté mobile (callType/callStatus/callDuration).
ALTER TABLE "Message" ADD COLUMN "callType" TEXT;
ALTER TABLE "Message" ADD COLUMN "callStatus" TEXT;
ALTER TABLE "Message" ADD COLUMN "callDuration" INTEGER;
