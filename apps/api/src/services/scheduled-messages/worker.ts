import { Queue, Worker } from 'bullmq'
import { prisma } from '../../lib/prisma'
import { workerTuning } from '../../lib/redis'
import { wazzupClient } from '../wazzup/client'
import { emitToRoom } from '../../socket/handlers'

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

interface ScheduledJobData {
  messageId: string
  chatId: string
  channel: string
  dealId: string
  pipelineId: string
  recipientType?: 'chatId' | 'phone' | 'username'
}

const scheduledQueue = new Queue('scheduled-messages', {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _worker = new Worker(
  'scheduled-messages',
  async (job) => {
    const { messageId, chatId, channel, dealId, pipelineId, recipientType } = job.data as ScheduledJobData

    const message = await prisma.message.findUnique({ where: { id: messageId } })
    if (!message || message.status !== 'scheduled') return

    const emitStatus = (status: string, extra?: object) => {
      const payload = { dealId, messageId, status, ...extra }
      emitToRoom(`pipeline:${pipelineId}`, 'MESSAGE_STATUS', payload)
      emitToRoom(`deal:${dealId}`, 'MESSAGE_STATUS', payload)
    }

    await prisma.message.update({ where: { id: messageId }, data: { status: 'sending' } })
    emitStatus('sending')

    try {
      const result = await wazzupClient.sendMessage({ chatId, message: message.content, channel, recipientType })
      const wazzupResult = result as { messageId?: string; channelId?: string } | null
      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'sent', wazzupId: wazzupResult?.messageId ?? null, channelId: wazzupResult?.channelId ?? null },
      })
      emitStatus('sent')
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { message?: string; error?: string } }; message?: string }
      const errorMsg = axErr.response?.data?.message ?? axErr.response?.data?.error ?? (err instanceof Error ? err.message : 'Ошибка отправки')
      await prisma.message.update({ where: { id: messageId }, data: { status: 'error', errorMsg } })
      emitStatus('error', { errorMsg })
    }
  },
  { connection, ...workerTuning }
)

export async function scheduleMessage(
  messageId: string,
  chatId: string,
  channel: string,
  scheduledAt: Date,
  dealId: string,
  pipelineId: string,
  recipientType?: 'chatId' | 'phone' | 'username'
) {
  const delay = scheduledAt.getTime() - Date.now()
  if (delay <= 0) throw new Error('Scheduled time must be in the future')
  await scheduledQueue.add('send', { messageId, chatId, channel, dealId, pipelineId, recipientType }, { delay })
}

export async function cancelScheduledMessage(messageId: string) {
  const jobs = await scheduledQueue.getDelayed()
  for (const job of jobs) {
    if ((job.data as ScheduledJobData).messageId === messageId) {
      await job.remove()
      break
    }
  }
}
