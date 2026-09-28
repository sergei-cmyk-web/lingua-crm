-- AlterTable
ALTER TABLE "ContactChannel" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "TrialLesson" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "reminderTransport" TEXT NOT NULL,
    "reminderChatId" TEXT,
    "remindersSent" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialLesson_dealId_idx" ON "TrialLesson"("dealId");

-- CreateIndex
CREATE INDEX "TrialLesson_status_scheduledAt_idx" ON "TrialLesson"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "TrialLesson" ADD CONSTRAINT "TrialLesson_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
