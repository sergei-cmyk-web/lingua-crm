/**
 * Одноразовая зачистка демо-аккаунтов на проде:
 *  - переназначает сделки и задачи manager1/manager2 на admin
 *  - удаляет manager1@crm.local и manager2@crm.local
 *  - ставит admin@crm.local новый пароль из ADMIN_NEW_PASSWORD
 *
 * Запуск (локально, против прод-базы):
 *   DATABASE_URL=<url-прод-базы> ADMIN_NEW_PASSWORD=<новый-пароль> \
 *     npx tsx scripts/remove-demo-users.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_MANAGERS = ['manager1@crm.local', 'manager2@crm.local']
const ADMIN_EMAIL = 'admin@crm.local'

async function main() {
  const newPassword = process.env.ADMIN_NEW_PASSWORD
  if (!newPassword || newPassword.length < 8) {
    throw new Error('ADMIN_NEW_PASSWORD (минимум 8 символов) обязателен')
  }

  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (!admin) throw new Error(`${ADMIN_EMAIL} не найден — нечего чистить`)

  const managers = await prisma.user.findMany({
    where: { email: { in: DEMO_MANAGERS } },
    select: { id: true, email: true },
  })

  if (managers.length === 0) {
    console.log('Демо-менеджеры уже удалены.')
  } else {
    const managerIds = managers.map((m) => m.id)

    await prisma.$transaction(async (tx) => {
      const deals = await tx.deal.updateMany({
        where: { assigneeId: { in: managerIds } },
        data: { assigneeId: admin.id },
      })
      const tasks = await tx.task.updateMany({
        where: { assigneeId: { in: managerIds } },
        data: { assigneeId: admin.id },
      })
      await tx.user.deleteMany({ where: { id: { in: managerIds } } })
      console.log(
        `Удалены: ${managers.map((m) => m.email).join(', ')} ` +
        `(переназначено сделок: ${deals.count}, задач: ${tasks.count})`
      )
    })
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data: { passwordHash },
  })
  console.log(`Пароль ${ADMIN_EMAIL} обновлён.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
