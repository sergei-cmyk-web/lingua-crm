import 'dotenv/config'
import dns from 'dns'
import express from 'express'
import http from 'http'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { Server } from 'socket.io'
import { initSocket } from './socket/handlers'

import { demoGuard } from './middleware/demoGuard'
import { csrfProtection } from './middleware/csrf'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import roleRoutes from './routes/roles'
import dealRoutes from './routes/deals'
import contactRoutes from './routes/contacts'
import companyRoutes from './routes/companies'
import taskRoutes from './routes/tasks'
import pipelineRoutes from './routes/pipelines'
import lostReasonRoutes from './routes/lost-reasons'
import packageRoutes from './routes/packages'
import subscriptionRoutes from './routes/subscriptions'
import fieldRoutes from './routes/fields'
import analyticsRoutes from './routes/analytics'
import automationRoutes from './routes/automations'
import integrationRoutes from './routes/integrations'
import trialRoutes from './routes/trials'
import leadRoutes from './routes/public/leads'
import wazzupWebhook from './routes/webhooks/wazzup'
import uisWebhook from './routes/webhooks/uis'
import paymentsWebhook from './routes/webhooks/payments'
import paymentRoutes from './routes/payments'
import trashRoutes, { startTrashPurge } from './routes/trash'
import emailAccountRoutes from './routes/email-accounts'
import emailRoutes from './routes/email'
import chatRoutes from './routes/chats'

// Не у всякого хоста есть исходящая IPv6-связность — без этого Node может выбрать
// IPv6-адрес при резолвинге (напр. smtp.gmail.com) и упасть с ENETUNREACH
dns.setDefaultResultOrder('ipv4first')

const app = express()
const httpServer = http.createServer(app)

// За nginx реальный IP клиента приходит в X-Forwarded-For —
// без trust proxy rate limit считал бы всех клиентов одним IP.
app.set('trust proxy', 1)

// Express по умолчанию генерирует ETag на каждый JSON-ответ; при повторной навигации браузер
// шлёт If-None-Match и получает 304 БЕЗ ТЕЛА — TanStack Query/demo-оверлей этого не ждут (весь
// код полагается на то, что успешный GET всегда возвращает реальные данные) и падают на
// .filter()/.map() пустого тела необработанным исключением — без error boundary это валит всю
// вкладку в нативный "This page couldn't load" браузера. Своего кэширования на уровне HTTP API
// не нужно — React Query уже кэширует в памяти клиента.
app.set('etag', false)

const isProd = process.env.NODE_ENV === 'production'

// In production require an explicit allowlist — never fall back to '*' with credentials.
if (isProd && !process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN must be set in production')
}
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : '*'

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, credentials: true },
})
initSocket(io)

app.use(helmet())
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(morgan('dev'))

// Raw body for webhook signature verification — preserve the exact bytes,
// since HMAC must be computed over the original payload (not a re-serialization).
// Платёжные провайдеры (CloudPayments, Робокасса) шлют form-urlencoded — тип расширен;
// парс JSON ниже в try/catch, urlencoded-тело остаётся в req.rawBody (роутеры платежей читают его сами).
app.use('/api/webhooks', express.raw({ type: ['application/json', 'application/x-www-form-urlencoded'], limit: '1mb' }))
app.use('/api/webhooks', (req: express.Request & { rawBody?: Buffer }, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body
    try { req.body = JSON.parse(req.body.toString()) } catch { req.body = {} }
  }
  next()
})

app.use(express.json({ limit: '1mb' }))

const isDemo = process.env.DEMO_MODE === 'true'

// Фоновые воркеры (BullMQ delayed jobs для напоминаний/отложенных сообщений, IMAP-поллинг) не
// нужны в demo-режиме: мутации не персистятся (см. demoGuard ниже), реальных триггеров для них
// не будет — заодно демо не шлёт ничего наружу. Автоматизации (services/automation/engine)
// не гейтим отдельно: их очередь просто не получит ни одного джоба, т.к. demoGuard отсекает
// мутирующие запросы раньше, чем роуты успевают вызвать triggerAutomation(...).
if (!isDemo) {
  import('./services/scheduled-messages/worker') // initialize scheduled message worker
  import('./services/trial-reminders/worker') // initialize trial reminder worker + sweep
  import('./services/email/imap-worker') // initialize email IMAP polling worker
}

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// Auth cookies are httpOnly — CSRF must be checked before any mutating route runs.
app.use(csrfProtection)
app.use(demoGuard)

// A7: global throttle across the whole API. /auth/login|refresh and /api/leads keep their own
// tighter limiters (defined in those routers); webhooks are excluded — provider callbacks are
// already authenticated by signature/token, not by this app's users, and can legitimately burst.
// 600/min/IP — generous enough for an office NAT shared by 10-50 managers, still bounds scraping.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/webhooks'),
})
app.use('/api', apiLimiter)

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/roles', roleRoutes)
app.use('/api/deals', dealRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/companies', companyRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/pipelines', pipelineRoutes)
app.use('/api/lost-reasons', lostReasonRoutes)
app.use('/api/packages', packageRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/fields', fieldRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/automations', automationRoutes)
app.use('/api/integrations', integrationRoutes)
app.use('/api/trials', trialRoutes)
app.use('/api/trash', trashRoutes)
app.use('/api/email-accounts', emailAccountRoutes)
app.use('/api/email', emailRoutes)
app.use('/api/chats', chatRoutes)
app.use('/api/leads', leadRoutes)
app.use('/api/webhooks/wazzup', wazzupWebhook)
app.use('/api/webhooks/uis', uisWebhook)
app.use('/api/webhooks/payments', paymentsWebhook)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Global async error handler — catches unhandled errors from async route handlers.
// Log full details server-side, but never leak internals to the client in production.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API Error]', err.message, err.stack)
  res.status(500).json(
    isProd ? { error: 'Internal server error' } : { error: 'Internal server error', message: err.message }
  )
})

if (!isDemo) startTrashPurge() // автоочистка корзины (30 дней): при старте + каждые 12 часов

const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`)
})
