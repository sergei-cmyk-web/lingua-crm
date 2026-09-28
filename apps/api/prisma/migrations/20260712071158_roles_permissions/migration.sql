-- Роли с матрицей прав + миграция User.role (строка) → User.roleId (FK) + User.active

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- Три системные роли; admin получает все права из кода (список тут — для отображения в UI)
INSERT INTO "Role" ("id", "name", "permissions", "isSystem") VALUES
  ('role_admin_system', 'admin', ARRAY[
    'settings.crm','settings.integrations','users.manage','trash.manage','finance.manage',
    'deals.export','entities.edit','section.analytics','section.email','section.chats',
    'lessons.teach','data.viewAll'
  ], true),
  ('role_manager_system', 'manager', ARRAY[
    'finance.manage','entities.edit','section.analytics','section.email','section.chats'
  ], true),
  ('role_teacher_system', 'teacher', ARRAY[
    'entities.edit','section.analytics','section.email','section.chats','lessons.teach'
  ], true);

ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Бэкфилл по старой строковой роли; неизвестные значения → manager (никогда не расширяем права)
UPDATE "User" SET "roleId" = CASE
  WHEN "role" = 'admin' THEN 'role_admin_system'
  WHEN "role" = 'teacher' THEN 'role_teacher_system'
  ELSE 'role_manager_system'
END;

ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN "role";

ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
