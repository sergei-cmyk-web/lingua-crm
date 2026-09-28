import type { AxiosInstance } from 'axios'
import { demoId } from './ids'
import { getLastSeen } from './merge'
import { useDemoOverlayStore, type EntityType } from './overlayStore'

// Внедряется из installDemoAdapter (adapter.ts), а не импортируется напрямую из lib/api/client —
// иначе получился бы цикл client.ts → adapter.ts → handlers.ts → client.ts. Обработчикам ниже
// нужен обычный GET-доступ (уже домерженный с оверлеем) для контекста: стадия/пакет/сделка и т.п.
let apiClient: AxiosInstance
export function setApiClient(client: AxiosInstance) {
  apiClient = client
}

export class DemoApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, data: unknown) {
    super(typeof data === 'object' && data && 'error' in (data as any) ? String((data as any).error) : 'demo_error')
    this.status = status
    this.data = data
  }
}

export type DemoHandler = (
  params: string[],
  body: any
) => Promise<{ data: any; status?: number }> | { data: any; status?: number }

interface Route {
  method: string
  pattern: RegExp
  handler: DemoHandler
}

const routes: Route[] = []

function on(method: string, pattern: RegExp, handler: DemoHandler) {
  routes.push({ method, pattern, handler })
}

export function matchRoute(method: string, url: string): { handler: DemoHandler; params: string[] } | null {
  for (const r of routes) {
    if (r.method !== method) continue
    const m = url.match(r.pattern)
    if (m) return { handler: r.handler, params: m.slice(1) }
  }
  return null
}

const store = () => useDemoOverlayStore.getState()
const now = () => new Date().toISOString()

function create(entityType: EntityType, body: any, defaults: Record<string, unknown> = {}) {
  const obj = { id: demoId(entityType), createdAt: now(), updatedAt: now(), ...defaults, ...body }
  store().addCreated(entityType, obj)
  return obj
}

function patch(entityType: EntityType, id: string, body: Record<string, unknown>) {
  store().addPatch(entityType, id, { ...body, updatedAt: now() })
  return { id, ...body }
}

function remove(entityType: EntityType, id: string) {
  store().markDeleted(entityType, id)
  return { ok: true }
}

// Мягкое удаление (Deal/Contact/Company имеют deletedAt) — помимо скрытия из списков
// проставляем deletedAt патчем, чтобы вложенные ссылки (напр. contact внутри deal) корректно
// показывали бейдж «в корзине», не завися от deletedIds (см. CLAUDE.md, замечание 41).
function trashify(entityType: EntityType, id: string) {
  store().markDeleted(entityType, id)
  store().addPatch(entityType, id, { deletedAt: now() })
  return { ok: true }
}

function withSubscriptionExtras(sub: any) {
  const balance = (sub.lessonsTotal ?? 0) - (sub.lessonsUsed ?? 0)
  const expired = sub.expiresAt ? new Date(sub.expiresAt).getTime() < Date.now() : false
  return { ...sub, balance, effectiveStatus: expired ? 'expired' : sub.status }
}

function registerCrud(
  entityType: EntityType,
  base: string,
  opts: { defaults?: Record<string, unknown>; soft?: boolean } = {}
) {
  on('POST', new RegExp(`^${base}$`), (_p, body) => ({ data: create(entityType, body, opts.defaults), status: 201 }))
  on('PATCH', new RegExp(`^${base}/([^/]+)$`), ([id], body) => ({ data: patch(entityType, id, body) }))
  on('DELETE', new RegExp(`^${base}/([^/]+)$`), ([id]) => ({
    data: opts.soft ? trashify(entityType, id) : remove(entityType, id),
    status: 204,
  }))
}

// --- Простые сущности (echo тела запроса в оверлей, форма ответа не критична —
// корректную полную форму отдаёт следующий GET через merge.ts) ---
registerCrud('deal', '/deals', {
  defaults: { tags: [], trials: [], _count: { tasks: 0, messages: 0, calls: 0 } },
  soft: true,
})
registerCrud('contact', '/contacts', { defaults: { tags: [], phones: [], emails: [], channels: [] }, soft: true })
registerCrud('company', '/companies', { soft: true })
registerCrud('task', '/tasks')
registerCrud('package', '/packages')
registerCrud('lostReason', '/lost-reasons')
registerCrud('automation', '/automations')
registerCrud('emailAccount', '/email-accounts')

// --- Массовое удаление (чекбоксы в списках/канбане) ---
on('POST', /^\/deals\/bulk-delete$/, (_p, body) => ({
  data: { deleted: (body.ids ?? []).map((id: string) => trashify('deal', id)).length },
}))
on('POST', /^\/contacts\/bulk-delete$/, (_p, body) => ({
  data: { deleted: (body.ids ?? []).map((id: string) => trashify('contact', id)).length },
}))
on('POST', /^\/companies\/bulk-delete$/, (_p, body) => ({
  data: { deleted: (body.ids ?? []).map((id: string) => trashify('company', id)).length },
}))

on('POST', /^\/email-accounts\/([^/]+)\/test$/, () => ({ data: { ok: true } }))

// --- Дедупликация: объединение контактов/компаний (CLAUDE.md, замечание 68). Упрощённая версия
// реального services/dedup: выживает запись по strategy, скалярные поля добираются от остальных
// по тому же порядку, проигравшие уходят в корзину (soft-delete), связанные сделки переезжают на
// survivor.
// ponytail: сделки — единственная связь, переносимая в демо (самая заметная в UI); задачи/
// сообщения/абонементы/платежи проигравшего в демо остаются висеть на нём — на реальном бэкенде
// переносятся все. Апгрейд: добавить сюда те же apiClient.get + patch по образцу deals ниже.
function pickSurvivor(records: any[], strategy: 'newest' | 'oldest') {
  const sorted = [...records].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return strategy === 'oldest' ? sorted[0] : sorted[sorted.length - 1]
}
function orderByStrategy(records: any[], strategy: 'newest' | 'oldest') {
  return [...records].sort((a, b) =>
    strategy === 'oldest'
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}
on('POST', /^\/contacts\/merge$/, async (_p, body) => {
  const { ids, strategy } = body as { ids: string[]; strategy: 'newest' | 'oldest' }
  const found = (await Promise.all(ids.map((id) => apiClient.get(`/contacts/${id}`).then((r) => r.data)))).filter(Boolean)
  if (found.length < 2) throw new DemoApiError(400, { error: 'Недостаточно контактов для объединения' })
  const survivor = pickSurvivor(found, strategy)
  const losers = found.filter((c: any) => c.id !== survivor.id)
  const fallbackOrder = orderByStrategy(losers, strategy)

  const patchData: Record<string, unknown> = {}
  for (const field of ['phone', 'email', 'telegramUsername', 'companyId']) {
    if (!survivor[field]) {
      const val = fallbackOrder.find((c: any) => c[field])?.[field]
      if (val) patchData[field] = val
    }
  }
  for (const loser of losers) {
    if (loser.phone && loser.phone !== (patchData.phone ?? survivor.phone)) {
      create('contactPhone', { phone: loser.phone, label: 'mobile' }, { contactId: survivor.id })
    }
    if (loser.email && loser.email !== (patchData.email ?? survivor.email)) {
      create('contactEmail', { email: loser.email }, { contactId: survivor.id })
    }
  }
  patchData.custom_fields = { ...Object.assign({}, ...losers.map((l: any) => l.custom_fields ?? {})), ...(survivor.custom_fields ?? {}) }
  patch('contact', survivor.id, patchData)

  const deals = await apiClient.get('/deals').then((r) => r.data.deals ?? [])
  for (const loser of losers) {
    for (const deal of deals.filter((d: any) => d.contactId === loser.id)) {
      patch('deal', deal.id, { contactId: survivor.id })
    }
    trashify('contact', loser.id)
  }
  return { data: { ...survivor, ...patchData } }
})
on('POST', /^\/companies\/merge$/, async (_p, body) => {
  const { ids, strategy } = body as { ids: string[]; strategy: 'newest' | 'oldest' }
  const found = (await Promise.all(ids.map((id) => apiClient.get(`/companies/${id}`).then((r) => r.data)))).filter(Boolean)
  if (found.length < 2) throw new DemoApiError(400, { error: 'Недостаточно компаний для объединения' })
  const survivor = pickSurvivor(found, strategy)
  const losers = found.filter((c: any) => c.id !== survivor.id)

  const [deals, contacts] = await Promise.all([
    apiClient.get('/deals').then((r) => r.data.deals ?? []),
    apiClient.get('/contacts').then((r) => r.data.contacts ?? []),
  ])
  for (const loser of losers) {
    for (const deal of deals.filter((d: any) => d.companyId === loser.id)) patch('deal', deal.id, { companyId: survivor.id })
    for (const contact of contacts.filter((c: any) => c.companyId === loser.id)) patch('contact', contact.id, { companyId: survivor.id })
    trashify('company', loser.id)
  }
  const custom_fields = { ...Object.assign({}, ...losers.map((l: any) => l.custom_fields ?? {})), ...(survivor.custom_fields ?? {}) }
  patch('company', survivor.id, { custom_fields })
  return { data: { ...survivor, custom_fields } }
})

// --- Кастомные поля: ключ генерируется из label транслитерацией, как на реальном бэкенде
// (см. CLAUDE.md, замечание 48) ---
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
function slugifyLabel(label: string): string {
  const translit = label.toLowerCase().split('').map((ch) => TRANSLIT[ch] ?? ch).join('')
  return translit.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
}
on('POST', /^\/fields$/, (_p, body) => ({ data: create('field', { ...body, key: slugifyLabel(body.label ?? 'field') }), status: 201 }))
on('PATCH', /^\/fields\/([^/]+)$/, ([id], body) => ({ data: patch('field', id, body) }))
on('DELETE', /^\/fields\/([^/]+)$/, ([id]) => ({ data: remove('field', id), status: 204 }))

// --- Контакт: доп. телефоны/email — отдельные сущности, встраиваются в contact.phones/emails
// через merge.ts (mergeNestedByParent по contactId) ---
on('POST', /^\/contacts\/([^/]+)\/phones$/, ([contactId], body) => ({
  data: create('contactPhone', body, { contactId, label: body.label ?? 'mobile' }),
  status: 201,
}))
on('DELETE', /^\/contacts\/([^/]+)\/phones\/([^/]+)$/, ([, phoneId]) => ({ data: remove('contactPhone', phoneId), status: 204 }))
on('POST', /^\/contacts\/([^/]+)\/emails$/, ([contactId], body) => ({
  data: create('contactEmail', body, { contactId }),
  status: 201,
}))
on('DELETE', /^\/contacts\/([^/]+)\/emails\/([^/]+)$/, ([, emailId]) => ({ data: remove('contactEmail', emailId), status: 204 }))

// --- Воронки и этапы ---
on('POST', /^\/pipelines$/, (_p, body) => {
  const pipeline = create('pipeline', { name: body.name })
  const stages = (body.stages ?? []).map((s: any) => create('stage', { ...s, pipelineId: pipeline.id }))
  return { data: { ...pipeline, stages }, status: 201 }
})
on('PATCH', /^\/pipelines\/([^/]+)$/, ([id], body) => ({ data: patch('pipeline', id, { name: body.name }) }))
on('DELETE', /^\/pipelines\/([^/]+)$/, ([id]) => ({ data: remove('pipeline', id), status: 204 }))
on('POST', /^\/pipelines\/([^/]+)\/stages$/, ([pipelineId], body) => ({
  data: create('stage', { ...body, pipelineId }),
  status: 201,
}))
on('PATCH', /^\/pipelines\/stages\/([^/]+)$/, ([id], body) => ({ data: patch('stage', id, body) }))
// Удаление этапа с переносом сделок на targetStageId (CLAUDE.md, замечание 67) — та же
// closure-семантика, что и applyStageMove: won/lost проставляют closedAt, open — сбрасывают его.
on('DELETE', /^\/pipelines\/stages\/([^/]+)$/, async ([id], body) => {
  const targetStageId = body?.targetStageId
  if (targetStageId) {
    const pipelines = await apiClient.get('/pipelines').then((r) => r.data)
    let targetStage: any = null
    for (const p of pipelines) {
      const found = p.stages.find((s: any) => s.id === targetStageId)
      if (found) { targetStage = found; break }
    }
    if (targetStage) {
      const deals = await apiClient.get('/deals').then((r) => r.data.deals ?? [])
      const closure =
        targetStage.type === 'lost' || targetStage.type === 'won'
          ? { closedAt: now() }
          : { closedAt: null, lostReasonId: null, lostComment: null }
      for (const deal of deals.filter((d: any) => d.stageId === id)) {
        patch('deal', deal.id, { stageId: targetStageId, pipelineId: targetStage.pipelineId, stageEnteredAt: now(), ...closure })
      }
    }
  }
  return { data: remove('stage', id), status: 204 }
})

// --- Интеграции: канned-ответы, реальных вызовов нет (креды в demo-окружении не заданы) ---
on('POST', /^\/integrations\/wazzup\/sync$/, () => ({ data: { channels: [] } }))
on('PUT', /^\/integrations\/settings\/([^/]+)$/, ([key], body) => ({ data: { key, value: body.value, hasValue: Boolean(body.value) } }))
on('POST', /^\/integrations\/targetsms\/test$/, () => ({ data: { ok: true, balance: { currency: 'RUB', value: '1000.00' } } }))

// --- Перенос сделки по этапам: требование причины потери / обязательных полей повторяет
// бизнес-логику PATCH /api/deals/:id/stage (apps/api/src/routes/deals.ts) ---
on('PATCH', /^\/deals\/([^/]+)\/stage$/, async ([dealId], body) => {
  const { stageId, lostReasonId, lostComment } = body
  const pipelines = await apiClient.get('/pipelines').then((r) => r.data)
  let stage: any = null
  for (const p of pipelines) {
    const found = p.stages.find((s: any) => s.id === stageId)
    if (found) { stage = found; break }
  }
  if (!stage) throw new DemoApiError(404, { error: 'Stage not found' })

  if (stage.type === 'lost') {
    if (!lostReasonId) throw new DemoApiError(422, { error: 'lost_reason_required' })
    const reasons = await apiClient.get('/lost-reasons').then((r) => r.data)
    const reason = reasons.find((r: any) => r.id === lostReasonId)
    if (!reason || !reason.active) throw new DemoApiError(400, { error: 'Lost reason not found or inactive' })
  }

  const deal = await apiClient.get(`/deals/${dealId}`).then((r) => r.data)
  if (!deal) throw new DemoApiError(404, { error: 'Deal not found' })

  const fields = await apiClient.get('/fields', { params: { entityType: 'deal' } }).then((r) => r.data)
  const required = fields.filter((f: any) => (f.requiredAtStageIds ?? []).includes(stageId))
  if (required.length) {
    const cf = deal.custom_fields ?? {}
    const empty = required.filter((f: any) => cf[f.key] === null || cf[f.key] === undefined || cf[f.key] === '')
    if (empty.length) {
      throw new DemoApiError(422, { error: 'required_fields', fields: empty.map((f: any) => ({ id: f.id, key: f.key, label: f.label })) })
    }
  }

  const closure =
    stage.type === 'lost'
      ? { lostReasonId, lostComment: lostComment ?? null, closedAt: now() }
      : stage.type === 'won'
        ? { lostReasonId: null, lostComment: null, closedAt: now() }
        : { lostReasonId: null, lostComment: null, closedAt: null }

  return { data: patch('deal', dealId, { stageId, pipelineId: stage.pipelineId, stageEnteredAt: now(), ...closure }) }
})

// --- Переписка (WhatsApp/Telegram/SMS/email) — мгновенно "отправлено", без реального
// исходящего вызова; _demo:true рендерится бейджем в ленте (DealDetail/чаты/почта) ---
on('POST', /^\/deals\/([^/]+)\/messages$/, async ([dealId], body) => {
  const deal = await apiClient.get(`/deals/${dealId}`).then((r) => r.data)
  if (!deal) throw new DemoApiError(404, { error: 'Deal not found' })
  const transport = body.transport ?? deal.contact?.wazzupChannel ?? 'whatsapp'
  return {
    data: create('message', {
      dealId,
      contactId: deal.contact?.id ?? deal.contactId ?? null,
      channel: transport,
      direction: 'out',
      content: String(body.text ?? '').trim(),
      status: 'sent',
      _demo: true,
    }),
    status: 201,
  }
})
on('PATCH', /^\/deals\/([^/]+)\/messages\/([^/]+)$/, ([, messageId], body) => ({
  data: patch('message', messageId, { content: String(body.text ?? '').trim() }),
}))
on('POST', /^\/deals\/([^/]+)\/emails$/, async ([dealId], form: FormData) => {
  const deal = await apiClient.get(`/deals/${dealId}`).then((r) => r.data)
  if (!deal) throw new DemoApiError(404, { error: 'Deal not found' })
  const to = String(form.get('to') ?? '')
  const subject = String(form.get('subject') ?? '')
  const body = String(form.get('body') ?? '')
  return {
    data: create('message', {
      dealId,
      contactId: deal.contact?.id ?? null,
      channel: 'email',
      direction: 'out',
      content: body,
      subject,
      toAddresses: [to],
      threadKey: deal.contact?.id ?? to.trim().toLowerCase(),
      status: 'sent',
      _demo: true,
    }),
    status: 201,
  }
})
on('POST', /^\/email\/compose$/, (_p, form: FormData) => {
  const to = String(form.get('to') ?? '')
  const subject = String(form.get('subject') ?? '')
  const body = String(form.get('body') ?? '')
  const accountId = String(form.get('accountId') ?? '')
  return {
    data: create('message', {
      dealId: null,
      contactId: null,
      channel: 'email',
      direction: 'out',
      content: body,
      subject,
      toAddresses: [to],
      threadKey: to.trim().toLowerCase(),
      emailAccountId: accountId,
      status: 'sent',
      _demo: true,
    }),
    status: 201,
  }
})
on('POST', /^\/chats\/([^/]+)\/messages$/, ([contactId], body) => ({
  data: create('message', {
    dealId: null,
    contactId,
    channel: body.transport ?? 'whatsapp',
    direction: 'out',
    content: String(body.text ?? '').trim(),
    status: 'sent',
    _demo: true,
  }),
  status: 201,
}))
on('POST', /^\/chats\/unmatched\/([^/]+)\/messages$/, ([chatId], body) => ({
  data: create('message', {
    dealId: null,
    contactId: null,
    chatId,
    channel: 'whatsapp',
    direction: 'out',
    content: String(body.text ?? '').trim(),
    status: 'sent',
    _demo: true,
  }),
  status: 201,
}))

// --- Пробные уроки ---
on('POST', /^\/deals\/([^/]+)\/trials$/, async ([dealId], body) => {
  const deal = await apiClient.get(`/deals/${dealId}`).then((r) => r.data)
  if (!deal) throw new DemoApiError(404, { error: 'Deal not found' })
  if ((deal.trials ?? []).some((t: any) => t.status === 'scheduled')) {
    throw new DemoApiError(409, { error: 'У сделки уже есть запланированный пробный урок' })
  }
  const targets = body.reminderTargets ?? (body.reminderTransport ? [{ transport: body.reminderTransport, chatId: body.reminderChatId ?? '' }] : [])
  return {
    data: create('trial', {
      dealId,
      scheduledAt: body.scheduledAt,
      status: 'scheduled',
      reminderTransport: targets[0]?.transport ?? '',
      reminderChatId: targets[0]?.chatId ?? '',
      reminderTargets: targets,
      remindersSent: [],
    }),
    status: 201,
  }
})
on('PATCH', /^\/trials\/([^/]+)$/, ([trialId], body) => {
  const data: Record<string, unknown> = {}
  if (body.scheduledAt) { data.scheduledAt = body.scheduledAt; data.remindersSent = [] }
  if (body.reminderTargets) {
    data.reminderTargets = body.reminderTargets
    data.reminderTransport = body.reminderTargets[0]?.transport
    data.reminderChatId = body.reminderTargets[0]?.chatId
  }
  if (body.status) data.status = body.status
  return { data: patch('trial', trialId, data) }
})

// --- Абонементы: списание баланса повторяет guard реального сервиса
// (apps/api/src/services/subscriptions/index.ts) — completed/no_show списывают, canceled нет ---
on('POST', /^\/subscriptions$/, async (_p, body) => {
  const pkg = await apiClient.get('/packages').then((r) => r.data).then((list: any[]) => list.find((p) => p.id === body.packageId))
  if (!pkg) throw new DemoApiError(404, { error: 'Package not found' })
  const lessonsTotal = body.lessonsTotal ?? pkg.lessonsCount
  const expiresAt = body.expiresAt ?? (pkg.durationDays ? new Date(Date.now() + pkg.durationDays * 86_400_000).toISOString() : null)
  const sub = create('subscription', {
    contactId: body.contactId,
    dealId: body.dealId ?? null,
    packageId: body.packageId,
    packageName: pkg.name,
    lessonsTotal,
    lessonsUsed: 0,
    price: body.price ?? pkg.price,
    status: 'active',
    startsAt: now(),
    expiresAt,
    lessons: [],
  })
  return { data: withSubscriptionExtras(sub), status: 201 }
})
on('PATCH', /^\/subscriptions\/([^/]+)$/, ([id], body) => {
  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status
  if (body.lessonsTotal !== undefined) data.lessonsTotal = body.lessonsTotal
  patch('subscription', id, data)
  const sub = getLastSeen('subscription', id)
  return { data: withSubscriptionExtras(sub ? { ...sub, ...data } : { id, ...data }) }
})
on('POST', /^\/subscriptions\/([^/]+)\/lessons$/, ([subId], body) => {
  const sub = getLastSeen('subscription', subId)
  if (!sub) throw new DemoApiError(404, { error: 'Subscription not found' })
  if (sub.status !== 'active') throw new DemoApiError(409, { error: 'subscription_not_active', message: 'Абонемент не активен' })
  const expired = sub.expiresAt ? new Date(sub.expiresAt).getTime() < Date.now() : false
  if (expired) throw new DemoApiError(409, { error: 'subscription_expired', message: 'Срок действия абонемента истёк' })
  if ((sub.lessonsTotal ?? 0) - (sub.lessonsUsed ?? 0) <= 0) {
    throw new DemoApiError(409, { error: 'subscription_exhausted', message: 'На балансе не осталось уроков' })
  }
  return {
    data: create('lesson', {
      subscriptionId: subId,
      scheduledAt: body.scheduledAt,
      status: 'scheduled',
      teacherId: body.teacherId ?? null,
      note: body.note ?? null,
    }),
    status: 201,
  }
})
on('PATCH', /^\/subscriptions\/([^/]+)\/lessons\/([^/]+)$/, ([subId, lessonId], body) => {
  if (body.status === 'completed' || body.status === 'no_show') {
    const sub = getLastSeen('subscription', subId)
    if (!sub) throw new DemoApiError(404, { error: 'Subscription not found' })
    const lesson = (sub.lessons ?? []).find((l: any) => l.id === lessonId) ?? getLastSeen('lesson', lessonId)
    if (!lesson) throw new DemoApiError(404, { error: 'Lesson not found' })
    if (lesson.status !== 'scheduled') throw new DemoApiError(409, { error: 'lesson_already_finalized', message: 'Урок уже завершён' })
    patch('lesson', lessonId, { status: body.status })
    const lessonsUsed = (sub.lessonsUsed ?? 0) + 1
    const status = lessonsUsed >= sub.lessonsTotal ? 'exhausted' : sub.status
    patch('subscription', subId, { lessonsUsed, status })
    return { data: withSubscriptionExtras({ ...sub, lessonsUsed, status }) }
  }
  if (body.status === 'canceled') {
    const lesson = getLastSeen('lesson', lessonId)
    if (lesson && lesson.status !== 'scheduled') throw new DemoApiError(409, { error: 'lesson_already_finalized', message: 'Урок уже завершён' })
  }
  patch('lesson', lessonId, body)
  const sub = getLastSeen('subscription', subId)
  return { data: sub ? withSubscriptionExtras(sub) : { id: subId } }
})

// --- Счета на оплату: paymentUrl — заглушка, реальный провайдер не вызывается ---
on('POST', /^\/payments$/, async (_p, body) => {
  const [deal, pkg] = await Promise.all([
    apiClient.get(`/deals/${body.dealId}`).then((r) => r.data),
    apiClient.get('/packages').then((r) => r.data).then((list: any[]) => list.find((p) => p.id === body.packageId)),
  ])
  if (!deal) throw new DemoApiError(404, { error: 'Deal not found' })
  if (!pkg) throw new DemoApiError(404, { error: 'Package not found' })
  if (!deal.contact) throw new DemoApiError(400, { error: 'no_contact', message: 'У сделки нет контакта — счёт выставляется клиенту' })
  return {
    data: create('payment', {
      dealId: body.dealId,
      contactId: deal.contact.id,
      packageId: body.packageId,
      packageName: pkg.name,
      lessonsTotal: body.lessonsTotal ?? pkg.lessonsCount,
      durationDays: pkg.durationDays,
      amount: body.amount ?? pkg.price,
      currency: 'RUB',
      provider: body.provider ?? 'cloudpayments',
      status: 'pending',
      paymentUrl: '#demo-payment',
    }),
    status: 201,
  }
})
on('POST', /^\/payments\/([^/]+)\/cancel$/, ([id]) => {
  const payment = getLastSeen('payment', id)
  if (payment && payment.status !== 'pending') throw new DemoApiError(409, { error: 'not_pending', message: 'Счёт уже оплачен или отменён' })
  patch('payment', id, { status: 'canceled' })
  return { data: payment ? { ...payment, status: 'canceled' } : { id, status: 'canceled' } }
})

// --- Корзина: восстановление снимает наши собственные demo-пометки (реальные seed-записи
// на сервере в demo-режиме никогда не удаляются — см. demoGuard на бэкенде) ---
const TRASH_ENTITY: Record<string, EntityType> = { deals: 'deal', contacts: 'contact', companies: 'company' }
on('POST', /^\/trash\/([^/]+)\/([^/]+)\/restore$/, ([type, id]) => {
  const entityType = TRASH_ENTITY[type]
  if (entityType) {
    store().unmarkDeleted(entityType, id)
    store().addPatch(entityType, id, { deletedAt: null })
  }
  return { data: { ok: true } }
})
on('DELETE', /^\/trash\/([^/]+)\/([^/]+)$/, () => ({ data: { ok: true } }))
