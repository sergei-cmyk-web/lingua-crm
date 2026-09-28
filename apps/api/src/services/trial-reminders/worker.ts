import { Queue, Worker } from 'bullmq'
import { Prisma, type TrialLesson } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'
import { ru } from 'date-fns/locale'
import { prisma } from '../../lib/prisma'
import { workerTuning } from '../../lib/redis'
import { emitToRoom } from '../../socket/handlers'
import { sendViaTransport } from '../messaging/send'

function getRedisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  try {
    const u = new URL(url)
    return {
      host: u.hostname,
      port: Number(u.port) || 6379,
      ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
      ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

const connection = getRedisConnection()

// Шаблоны рендерятся в таймзоне школы: контейнер живёт в UTC,
// без явной TZ клиент получит «в 08:00» вместо «в 11:00».
const SCHOOL_TZ = process.env.SCHOOL_TZ || 'Europe/Moscow'

export const DEFAULT_REMINDER_OFFSETS: ReminderOffset[] = [
  {
    minutes: 1440,
    template: 'Здравствуйте, {имя}! Напоминаем: {дата} в {время} у вас пробный урок. Ждём вас!',
  },
  {
    minutes: 60,
    template: '{имя}, напоминаем: сегодня в {время} у вас пробный урок. До встречи!',
  },
]

interface ReminderOffset {
  minutes: number
  template: string
  /** Транспорты, по которым слать именно этот офсет; пусто/отсутствует = все каналы урока */
  channels?: string[]
}

interface RemindJobData {
  trialId: string
  offsetMinutes: number
  scheduledAtISO: string // снапшот времени урока на момент планирования
}

// 15 мин: sweep — лишь страховка на случай рестарта контейнера/потери ключей Redis,
// точность до 15 мин достаточна, чаще опрашивать смысла нет.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000

const reminderQueue = new Queue('trial-reminders', {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
})

export async function getReminderSettings(): Promise<{ offsets: ReminderOffset[] }> {
  const setting = await prisma.integrationSetting.findUnique({ where: { key: 'trial_reminders' } })
  if (setting) {
    try {
      const parsed = JSON.parse(setting.value)
      if (Array.isArray(parsed?.offsets)) {
        const offsets = parsed.offsets.filter(
          (o: ReminderOffset) => Number(o?.minutes) > 0 && typeof o?.template === 'string' && o.template.trim()
        )
        if (offsets.length > 0) return { offsets }
      }
    } catch {
      // повреждённая настройка — работаем на дефолте
    }
  }
  return { offsets: DEFAULT_REMINDER_OFFSETS }
}

// jobId без двоеточий — BullMQ использует ':' как разделитель ключей
function reminderJobId(trialId: string, offsetMinutes: number, scheduledAt: Date) {
  return `trial_${trialId}_${offsetMinutes}_${scheduledAt.getTime()}`
}

function renderTemplate(template: string, contactName: string, scheduledAt: Date): string {
  const date = formatInTimeZone(scheduledAt, SCHOOL_TZ, 'd MMMM', { locale: ru })
  const time = formatInTimeZone(scheduledAt, SCHOOL_TZ, 'HH:mm', { locale: ru })
  return template
    .replaceAll('{имя}', contactName)
    .replaceAll('{дата}', date)
    .replaceAll('{время}', time)
}

/**
 * Планирует delayed-джобы для всех настроенных офсетов.
 * Офсеты, чей момент уже в прошлом (урок записан «впритык»), помечаются
 * отправленными сразу — иначе sweep разослал бы их немедленно с неверным текстом.
 * Pre-claim идёт ДО постановки джобов: вызов может быть fire-and-forget,
 * и при зависшем Redis отметка в Postgres всё равно должна успеть до sweep.
 */
export async function scheduleTrialReminders(trial: TrialLesson) {
  const { offsets } = await getReminderSettings()
  const future = offsets.filter(o => trial.scheduledAt.getTime() - o.minutes * 60_000 > Date.now())
  const preClaimed = offsets.filter(o => !future.includes(o)).map(o => o.minutes)

  if (preClaimed.length > 0) {
    await prisma.$executeRaw`
      UPDATE "TrialLesson"
      SET "remindersSent" = "remindersSent" || ${JSON.stringify(preClaimed)}::jsonb
      WHERE "id" = ${trial.id}
    `
  }

  for (const offset of future) {
    const delay = trial.scheduledAt.getTime() - offset.minutes * 60_000 - Date.now()
    await reminderQueue.add(
      'remind',
      { trialId: trial.id, offsetMinutes: offset.minutes, scheduledAtISO: trial.scheduledAt.toISOString() } satisfies RemindJobData,
      { delay, jobId: reminderJobId(trial.id, offset.minutes, trial.scheduledAt) }
    )
  }
}

/** Снимает delayed-джобы урока. Guard-ы в воркере подстрахуют, если remove не удался. */
export async function cancelTrialReminders(trial: TrialLesson) {
  const { offsets } = await getReminderSettings()
  for (const offset of offsets) {
    await reminderQueue
      .remove(reminderJobId(trial.id, offset.minutes, trial.scheduledAt))
      .catch(() => undefined)
  }
}

export interface ReminderTarget {
  transport: string
  chatId: string
}

/** Все получатели напоминаний урока: reminderTargets, для старых записей — legacy-поля. */
export function trialReminderTargets(trial: TrialLesson): ReminderTarget[] {
  const targets = (trial.reminderTargets as ReminderTarget[] | null) ?? []
  const valid = targets.filter(t => t?.transport && t?.chatId)
  if (valid.length > 0) return valid
  if (trial.reminderTransport && trial.reminderChatId) {
    return [{ transport: trial.reminderTransport, chatId: trial.reminderChatId }]
  }
  return []
}

/**
 * Атомарно «забирает» офсет (защита от гонки delayed-job ↔ sweep), шлёт напоминание
 * по каналам урока, отфильтрованным под ЭТОТ офсет (offset.channels; пусто = все каналы урока),
 * пишет Message в ленту сделки по каждому.
 * Email — заглушка (реальной отправки пока нет): вместо sendViaTransport сразу пишется
 * error-Message с понятным текстом, без участия в ретраях.
 * Если НИ ОДИН ретраябельный (не-email) канал не отработал — офсет возвращается, чтобы retry
 * BullMQ мог повторить. При частичном успехе офсет остаётся забранным (иначе retry задублирует
 * успешные каналы).
 */
async function sendReminder(
  trial: TrialLesson & { deal: { id: string; pipelineId: string; contactId: string | null; contact: { name: string } | null } },
  offset: ReminderOffset
) {
  const offsetMinutes = offset.minutes
  const claimed = await prisma.$executeRaw`
    UPDATE "TrialLesson"
    SET "remindersSent" = "remindersSent" || ${JSON.stringify([offsetMinutes])}::jsonb
    WHERE "id" = ${trial.id}
      AND "status" = 'scheduled'
      AND NOT ("remindersSent" @> ${JSON.stringify([offsetMinutes])}::jsonb)
  `
  if (claimed === 0) return // другой процесс уже отправил

  const text = renderTemplate(offset.template, trial.deal.contact?.name ?? 'Клиент', trial.scheduledAt)
  const allTargets = trialReminderTargets(trial)
  const channels = offset.channels ?? []
  const targets = channels.length > 0 ? allTargets.filter(t => channels.includes(t.transport)) : allTargets
  const retryable = targets.filter(t => t.transport !== 'email')

  const emitNewMessage = (message: unknown) => {
    emitToRoom(`pipeline:${trial.deal.pipelineId}`, 'NEW_MESSAGE', { dealId: trial.deal.id, message })
    emitToRoom(`deal:${trial.deal.id}`, 'NEW_MESSAGE', { dealId: trial.deal.id, message })
  }

  let sentCount = 0
  let lastError: unknown = null

  for (const target of targets) {
    if (target.transport === 'email') {
      // Email-напоминания пока не реализованы (UI-заглушка) — не участвует в sentCount/retry
      const message = await prisma.message.create({
        data: {
          dealId: trial.deal.id,
          contactId: trial.deal.contactId,
          channel: target.transport,
          chatId: target.chatId,
          direction: 'out',
          content: text,
          status: 'error',
          errorMsg: 'Email-напоминания пока не реализованы',
        },
      })
      emitNewMessage(message)
      continue
    }
    try {
      const result = await sendViaTransport({ transport: target.transport, chatId: target.chatId, text })
      const message = await prisma.message.create({
        data: {
          dealId: trial.deal.id,
          contactId: trial.deal.contactId,
          channel: target.transport,
          channelId: result.channelId ?? null,
          chatId: target.chatId,
          direction: 'out',
          content: text,
          status: 'sent',
          wazzupId: target.transport === 'sms' ? null : result.externalId ?? null,
        },
      })
      emitNewMessage(message)
      sentCount++
    } catch (err) {
      lastError = err
      const errorMsg = err instanceof Error ? err.message : 'Ошибка отправки напоминания'
      const message = await prisma.message.create({
        data: {
          dealId: trial.deal.id,
          contactId: trial.deal.contactId,
          channel: target.transport,
          chatId: target.chatId,
          direction: 'out',
          content: text,
          status: 'error',
          errorMsg,
        },
      })
      emitNewMessage(message)
    }
  }

  if (sentCount === 0 && retryable.length > 0) {
    // ни один ретраябельный (не-email) канал не отработал — возвращаем офсет, чтобы retry мог отправить повторно
    const fresh = await prisma.trialLesson.findUnique({ where: { id: trial.id } })
    if (fresh) {
      const sent = (fresh.remindersSent as number[] | null) ?? []
      await prisma.trialLesson.update({
        where: { id: trial.id },
        data: { remindersSent: sent.filter(m => m !== offsetMinutes) as unknown as Prisma.InputJsonValue },
      })
    }
    throw lastError instanceof Error ? lastError : new Error('Ошибка отправки напоминания') // BullMQ attempts/backoff
  }
}

const trialInclude = {
  deal: {
    select: {
      id: true,
      pipelineId: true,
      contactId: true,
      contact: { select: { name: true } },
    },
  },
} as const

async function processRemind(data: RemindJobData) {
  const trial = await prisma.trialLesson.findUnique({
    where: { id: data.trialId },
    include: trialInclude,
  })
  if (!trial || trial.status !== 'scheduled') return
  if (trial.scheduledAt.toISOString() !== data.scheduledAtISO) return // урок перенесён
  if (trial.scheduledAt.getTime() <= Date.now()) return // урок уже прошёл

  const sent = (trial.remindersSent as number[] | null) ?? []
  if (sent.includes(data.offsetMinutes)) return

  const { offsets } = await getReminderSettings()
  const offset = offsets.find(o => o.minutes === data.offsetMinutes)
  if (!offset) return // офсет убрали из настроек после планирования

  await sendReminder(trial, offset)
}

/**
 * Reconciliation-sweep: источник истины — Postgres, не Redis.
 * Догоняет напоминания, потерянные из-за рестарта процесса или потери
 * delayed-джобов в Redis. remindersSent гарантирует отсутствие дублей.
 */
export async function runReminderSweep() {
  const { offsets } = await getReminderSettings()
  const trials = await prisma.trialLesson.findMany({
    where: { status: 'scheduled', scheduledAt: { gt: new Date() } },
    include: trialInclude,
  })

  for (const trial of trials) {
    const sent = (trial.remindersSent as number[] | null) ?? []
    for (const offset of offsets) {
      const fireAt = trial.scheduledAt.getTime() - offset.minutes * 60_000
      if (fireAt <= Date.now() && !sent.includes(offset.minutes)) {
        try {
          await sendReminder(trial, offset)
        } catch (err) {
          console.error(`[trial-reminders] sweep: не удалось отправить напоминание ${trial.id}/${offset.minutes}м:`, err)
        }
      }
    }
  }
}

const worker = new Worker(
  'trial-reminders',
  async (job) => {
    if (job.name === 'sweep') return runReminderSweep()
    return processRemind(job.data as RemindJobData)
  },
  { connection, ...workerTuning }
)

worker.on('failed', (job, err) => {
  console.error(`[trial-reminders] job ${job?.id} failed:`, err)
})

// Repeatable sweep каждые 5 минут + прогон на старте (после подъёма сервера)
reminderQueue
  .add('sweep', {}, { repeat: { every: SWEEP_INTERVAL_MS } })
  .catch(err => console.error('[trial-reminders] failed to register sweep:', err))

setTimeout(() => {
  runReminderSweep().catch(err => console.error('[trial-reminders] boot sweep failed:', err))
}, 10_000)

export { reminderQueue }
