-- AlterTable: User — ajoute Apple Sign-In, Expo push token
ALTER TABLE "User" ADD COLUMN "appleId" TEXT;
ALTER TABLE "User" ADD COLUMN "expoPushToken" TEXT;

-- CreateIndex: appleId unique
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");

-- AlterTable: Visit — note personnelle optionnelle
ALTER TABLE "Visit" ADD COLUMN "notes" TEXT;

-- CreateTable: PasswordResetToken
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
