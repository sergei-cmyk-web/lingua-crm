-- Replace single requiredAtStageId with array (no data yet, safe to drop)
ALTER TABLE "FieldDefinition" DROP COLUMN IF EXISTS "requiredAtStageId";
ALTER TABLE "FieldDefinition" ADD COLUMN "requiredAtStageIds" TEXT[] NOT NULL DEFAULT '{}';

-- Scheduled messages support
ALTER TABLE "Message" ADD COLUMN "scheduledAt" TIMESTAMP(3);
