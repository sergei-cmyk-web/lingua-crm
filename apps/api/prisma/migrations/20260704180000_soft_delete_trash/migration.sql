-- Мягкое удаление (корзина): Deal / Contact / Company
ALTER TABLE "Deal" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");
