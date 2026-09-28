-- DropIndex
DROP INDEX "Activity_dealId_idx";

-- DropIndex
DROP INDEX "Deal_deletedAt_idx";

-- DropIndex
DROP INDEX "Message_contactId_idx";

-- CreateIndex
CREATE INDEX "Activity_dealId_createdAt_idx" ON "Activity"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "Company_deletedAt_createdAt_idx" ON "Company"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_deletedAt_createdAt_idx" ON "Contact"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_deletedAt_createdAt_idx" ON "Deal"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Message_contactId_createdAt_idx" ON "Message"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_readAt_idx" ON "Message"("readAt");

