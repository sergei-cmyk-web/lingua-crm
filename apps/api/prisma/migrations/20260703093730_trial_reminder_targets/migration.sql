-- AlterTable
ALTER TABLE "TrialLesson" ADD COLUMN     "reminderTargets" JSONB NOT NULL DEFAULT '[]';
