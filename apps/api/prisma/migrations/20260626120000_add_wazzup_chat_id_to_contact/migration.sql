-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "wazzupChatId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "wazzupChannel" TEXT;

-- CreateIndex
CREATE INDEX "Contact_wazzupChatId_idx" ON "Contact"("wazzupChatId");
