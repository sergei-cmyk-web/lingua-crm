import { Queue, Worker } from 'bullmq'
import { prisma } from '../../lib/prisma'
import { workerTuning } from '../../lib/redis'
import { Prisma } from '@prisma/client'
import { emitToRoom } from '../../socket/handlers'
import { sendViaTransport } from '../messaging/send'
import { phoneDigits } from '../../lib/phone'

// Plain connection options — avoids ioredis version conflict with BullMQ's bundled copy
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

interface AutomationEvent {
  type:
    | 'stage_enter'
    | 'stage_leave'
    | 'field_change'
    | 'webhook'
    | 'timer'
    | 'trial_booked'
    | 'trial_completed'
    | 'trial_no_show'
    | 'subscription_low_balance'
    | 'payment_received'
  deal: { id: string; pipelineId: string; stageId: string; assigneeId?: string | null; contactId?: string | null; [key: string]: unknown }
  stageId?: string
  fieldKey?: string
  fieldValue?: unknown
  source?: string
  payload?: unknown
  /** channelId конкретного подключённого WazzUp-канала — для фильтра webhook-триггера */
  channelId?: string
  /** Остаток уроков после списания — для subscription_low_balance */
  remaining?: number
  subscriptionId?: string
  /** Глубина каскада move_stage → stage_enter; защита от циклов автоматизаций */
  hop?: number
}

interface TimerCheckData {
  automationId: string
  dealId: string
  stageId: string
  stageEnteredAtISO: string // снапшот входа в этап — отсекает «ушёл и вернулся»
}

const automationQueue = new Queue('automations', {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
})

export async function triggerAutomation(event: AutomationEvent) {
  await automationQueue.add('process', event)
}

const worker = new Worker(
  'automations',
  async (job) => {
    if (job.name === 'timer-check') return processTimerCheck(job.data as TimerCheckData)

    const event = job.data as AutomationEvent

    const automations = await prisma.automation.findMany({
      where: { pipelineId: event.deal.pipelineId, active: true },
    })

    for (const automation of automations) {
      const trigger = automation.trigger as { type: string; stageId?: string; fieldKey?: string; fieldValue?: unknown }

      if (!matchesTrigger(trigger, event)) continue

      const actions = automation.actions as Array<{ type: string; [key: string]: unknown }>
      for (const action of actions) {
        await executeAction(action, event)
      }
    }

    if (event.type === 'stage_enter') {
      await scheduleTimerChecks(event, automations)
    }
  },
  { connection, ...workerTuning }
)

// «Сделка находится в этапе дольше N часов»: при входе в этап ставим delayed-джоб
// в эту же очередь; при исполнении сверяем, что сделка всё ещё там же.
async function scheduleTimerChecks(
  event: AutomationEvent,
  automations: Array<{ id: string; trigger: unknown }>
) {
  const timers = automations.filter(a => {
    const t = a.trigger as { type: string; stageId?: string; delayHours?: number }
    return t.type === 'timer' && Number(t.delayHours) > 0 && (!t.stageId || t.stageId === event.stageId)
  })
  if (timers.length === 0) return

  const deal = await prisma.deal.findUnique({
    where: { id: event.deal.id },
    select: { stageId: true, stageEnteredAt: true },
  })
  if (!deal || deal.stageId !== event.stageId) return

  for (const automation of timers) {
    const t = automation.trigger as { delayHours?: number }
    const delay = Number(t.delayHours) * 3600_000
    await automationQueue.add(
      'timer-check',
      {
        automationId: automation.id,
        dealId: event.deal.id,
        stageId: event.stageId!,
        stageEnteredAtISO: deal.stageEnteredAt.toISOString(),
      } satisfies TimerCheckData,
      // jobId без двоеточий (разделитель ключей BullMQ); дедуп при retry stage_enter-джоба
      { delay, jobId: `timer_${automation.id}_${event.deal.id}_${deal.stageEnteredAt.getTime()}` }
    )
  }
}

async function processTimerCheck(data: TimerCheckData) {
  const [automation, deal] = await Promise.all([
    prisma.automation.findUnique({ where: { id: data.automationId } }),
    prisma.deal.findUnique({ where: { id: data.dealId } }),
  ])
  // Снапшот в джобе устарел на N часов — все проверки по свежим данным из БД
  if (!automation?.active || !deal) return
  if (deal.stageId !== data.stageId) return
  if (deal.stageEnteredAt.toISOString() !== data.stageEnteredAtISO) return

  const event: AutomationEvent = { type: 'timer', deal, stageId: data.stageId }
  const actions = automation.actions as Array<{ type: string; [key: string]: unknown }>
  for (const action of actions) {
    await executeAction(action, event)
  }
}

function matchesTrigger(trigger: { type: string; stageId?: string; fieldKey?: string; fieldValue?: unknown; threshold?: number; channelId?: string }, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false
  // Точное равенство порогу = идемпотентность без флагов: срабатывает ровно
  // в момент пересечения, последующие списания (remaining меньше) не матчатся
  if (trigger.type === 'subscription_low_balance') {
    return event.remaining === (Number(trigger.threshold) || 2)
  }
  if (trigger.type === 'webhook' && trigger.channelId && trigger.channelId !== event.channelId) return false
  if (trigger.stageId && event.stageId && trigger.stageId !== event.stageId) return false
  if (trigger.fieldKey && event.fieldKey && trigger.fieldKey !== event.fieldKey) return false
  if (trigger.fieldValue !== undefined && event.fieldValue !== undefined && trigger.fieldValue !== event.fieldValue) return false
  return true
}

// Плейсхолдеры для send_http_request — тот же приём, что renderInvoiceTemplate на фронте
async function buildPlaceholderVars(event: AutomationEvent): Promise<Record<string, string>> {
  const vars: Record<string, string> = {
    dealId: event.deal.id,
    название: String(event.deal.title ?? ''),
    сумма: event.deal.budget != null ? String(event.deal.budget) : '',
  }
  if (event.deal.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: event.deal.contactId as string } })
    if (contact) {
      vars.имя = contact.name
      vars.телефон = contact.phone ?? ''
      vars.email = contact.email ?? ''
    }
  }
  return vars
}

function renderPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key) => vars[key] ?? match)
}

async function executeAction(action: { type: string; [key: string]: unknown }, event: AutomationEvent) {
  switch (action.type) {
    case 'create_task': {
      const dueDate = action.taskDueDateHours
        ? new Date(Date.now() + Number(action.taskDueDateHours) * 3600000)
        : null

      await prisma.task.create({
        data: {
          title: String(action.taskTitle ?? 'Задача'),
          dealId: event.deal.id,
          assigneeId: String(action.taskAssigneeId ?? event.deal.assigneeId ?? ''),
          dueDate,
        },
      })

      emitToRoom(`pipeline:${event.deal.pipelineId}`, 'TASK_CREATED', { dealId: event.deal.id })
      break
    }

    case 'send_wazzup_message': {
      if (!event.deal.contactId || !action.message) break

      const contact = await prisma.contact.findUnique({
        where: { id: event.deal.contactId as string },
        include: { channels: true },
      })
      if (!contact) break

      // Канал: явный из конфига действия → канал переписки → legacy-поле → whatsapp
      const transport =
        (action.transport as string | undefined) ??
        contact.wazzupChannel ??
        contact.channels[0]?.transport ??
        'whatsapp'
      const chatId =
        transport === 'sms'
          ? contact.phone
            ? phoneDigits(contact.phone)
            : null
          : contact.channels.find(c => c.transport === transport)?.chatId ??
            contact.wazzupChatId ??
            (contact.phone ? phoneDigits(contact.phone) : null)
      if (!chatId) break

      const text = String(action.message)
      let messageData
      try {
        const result = await sendViaTransport({ transport, chatId, text })
        messageData = {
          status: 'sent',
          wazzupId: transport === 'sms' ? null : result.externalId ?? null,
          channelId: result.channelId ?? null,
          errorMsg: null,
        }
      } catch (err) {
        messageData = { status: 'error', wazzupId: null, errorMsg: err instanceof Error ? err.message : 'Ошибка отправки' }
      }

      const message = await prisma.message.create({
        data: {
          dealId: event.deal.id,
          contactId: contact.id,
          channel: transport,
          chatId,
          direction: 'out',
          content: text,
          ...messageData,
        },
      })
      emitToRoom(`pipeline:${event.deal.pipelineId}`, 'NEW_MESSAGE', { dealId: event.deal.id, message })
      emitToRoom(`deal:${event.deal.id}`, 'NEW_MESSAGE', { dealId: event.deal.id, message })
      break
    }

    case 'change_field': {
      if (!action.fieldKey) break
      await prisma.deal.update({
        where: { id: event.deal.id },
        data: {
          custom_fields: {
            ...(event.deal.custom_fields as Record<string, unknown>),
            [action.fieldKey as string]: action.fieldValue,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      break
    }

    case 'move_stage': {
      if (!action.stageId) break
      const targetStage = await prisma.stage.findUnique({ where: { id: String(action.stageId) } })
      if (!targetStage) break

      // Автоматизация не спрашивает причину потери — фиксируем только closedAt.
      // Не таргетируйте lost-этапы автоматизациями, если важна аналитика по причинам.
      const closureData =
        targetStage.type === 'lost' || targetStage.type === 'won'
          ? { closedAt: new Date() }
          : { closedAt: null, lostReasonId: null, lostComment: null }

      const updated = await prisma.deal.update({
        where: { id: event.deal.id },
        data: { stageId: targetStage.id, pipelineId: targetStage.pipelineId, stageEnteredAt: new Date(), ...closureData },
      })
      emitToRoom(`pipeline:${event.deal.pipelineId}`, 'DEAL_MOVED', {
        dealId: event.deal.id,
        prevStageId: event.deal.stageId,
        newStageId: targetStage.id,
      })
      if (targetStage.pipelineId !== event.deal.pipelineId) {
        emitToRoom(`pipeline:${targetStage.pipelineId}`, 'DEAL_MOVED', {
          dealId: event.deal.id,
          prevStageId: event.deal.stageId,
          newStageId: targetStage.id,
        })
      }

      // Каскадный stage_enter, чтобы работали автоматизации целевого этапа
      // (включая timer). hop-limit против вечного цикла двух move_stage.
      const hop = (event.hop ?? 0) + 1
      if (hop <= 3) {
        await triggerAutomation({ type: 'stage_enter', deal: updated, stageId: targetStage.id, hop })
      }
      break
    }

    case 'send_http_request': {
      const url = action.httpUrl as string | undefined
      if (!url) break

      const vars = await buildPlaceholderVars(event)
      const method = String(action.httpMethod ?? 'POST').toUpperCase()
      const headers: Record<string, string> = {}
      for (const h of (action.httpHeaders as { key: string; value: string }[] | undefined) ?? []) {
        if (h.key) headers[h.key] = renderPlaceholders(h.value ?? '', vars)
      }
      const body = action.httpBody ? renderPlaceholders(String(action.httpBody), vars) : undefined
      const hasBody = body !== undefined && method !== 'GET' && method !== 'DELETE'
      if (hasBody && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json'
      }

      // Fire-and-forget: ошибка/не-2xx только в лог, не прерывает остальные actions и не ретраит job
      const renderedUrl = renderPlaceholders(url, vars)
      try {
        const res = await fetch(renderedUrl, { method, headers, body: hasBody ? body : undefined })
        if (!res.ok) console.error(`send_http_request: ${method} ${renderedUrl} → ${res.status}`)
      } catch (err) {
        console.error(`send_http_request failed: ${method} ${renderedUrl}`, err)
      }
      break
    }

    case 'notify_user': {
      if (action.userId) {
        emitToRoom(`user:${action.userId}`, 'NOTIFICATION', {
          message: action.message ?? 'Событие автоматизации',
          dealId: event.deal.id,
        })
      }
      break
    }
  }
}

worker.on('failed', (job, err) => {
  console.error(`Automation job ${job?.id} failed:`, err)
})
