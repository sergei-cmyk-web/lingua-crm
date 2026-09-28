-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "tags" TEXT[] NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "tags" TEXT[] NOT NULL DEFAULT '{}';
