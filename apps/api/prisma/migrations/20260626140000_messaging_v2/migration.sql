-- Contact: add telegramUsername
ALTER TABLE "Contact" ADD COLUMN "telegramUsername" TEXT;

-- ContactPhone
CREATE TABLE "ContactPhone" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "label" TEXT DEFAULT 'mobile',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactPhone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactPhone_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ContactPhone_contactId_idx" ON "ContactPhone"("contactId");

-- ContactChannel
CREATE TABLE "ContactChannel" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "transport" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactChannel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactChannel_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactChannel_contactId_transport_key" UNIQUE ("contactId", "transport")
);
CREATE INDEX "ContactChannel_contactId_idx" ON "ContactChannel"("contactId");

-- Message: add status and errorMsg
ALTER TABLE "Message" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE "Message" ADD COLUMN "errorMsg" TEXT;
