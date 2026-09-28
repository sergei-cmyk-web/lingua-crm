-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "lostComment" TEXT,
ADD COLUMN     "lostReasonId" TEXT;

-- AlterTable
ALTER TABLE "Stage" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'open';

-- CreateTable
CREATE TABLE "LostReason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LostReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_lostReasonId_idx" ON "Deal"("lostReasonId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "LostReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: до появления типов этапов аналитика считала последний этап воронки «выигранным».
-- Сохраняем эту семантику, чтобы конверсия не обнулилась после деплоя; админ уточнит типы вручную.
UPDATE "Stage" s SET "type" = 'won'
WHERE s."order" = (SELECT MAX(s2."order") FROM "Stage" s2 WHERE s2."pipelineId" = s."pipelineId");

-- Сделки, уже находящиеся в won-этапах, получают closedAt = входу в этап.
UPDATE "Deal" d SET "closedAt" = d."stageEnteredAt"
FROM "Stage" s WHERE d."stageId" = s."id" AND s."type" = 'won';
