/*
  Warnings:

  - A unique constraint covering the columns `[emailMessageId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "emailAccountId" TEXT,
ADD COLUMN     "emailInReplyTo" TEXT,
ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "threadKey" TEXT,
ADD COLUMN     "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUser" TEXT NOT NULL,
    "smtpPassword" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapUser" TEXT NOT NULL,
    "imapPassword" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imapUidValidity" INTEGER,
    "lastImapUid" INTEGER NOT NULL DEFAULT 0,
    "lastPolledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailAccount_ownerId_idx" ON "EmailAccount"("ownerId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_emailMessageId_key" ON "Message"("emailMessageId");

-- CreateIndex
CREATE INDEX "Message_channel_threadKey_idx" ON "Message"("channel", "threadKey");

-- CreateIndex
CREATE INDEX "Message_emailAccountId_idx" ON "Message"("emailAccountId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
