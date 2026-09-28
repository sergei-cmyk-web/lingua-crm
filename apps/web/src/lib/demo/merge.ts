import { useDemoOverlayStore, patchKey, type EntityType } from './overlayStore'
import { isDemoId } from './ids'

function state() {
  return useDemoOverlayStore.getState()
}

function applyPatch<T extends { id: string }>(entityType: EntityType, obj: T): T {
  const patch = state().patches[patchKey(entityType, obj.id)]
  return patch ? { ...obj, ...patch } : obj
}

function isDeleted(entityType: EntityType, id: string): boolean {
  return Boolean(state().deletedIds[patchKey(entityType, id)])
}

function createdOf(entityType: EntityType): any[] {
  return state().created[entityType] ?? []
}

// Мелкий in-memory кэш "последнего увиденного" полного объекта по каждой сущности — не
// персистится (это рантайм-состояние вкладки). Заполняется при каждом GET, где сущность
// встретилась. Нужен bespoke-обработчикам мутаций (handlers.ts) для сущностей без отдельного
// GET-по-id роута на реальном бэкенде (Subscription, Lesson, Payment) — раз UI показывает кнопку
// действия над записью, значит запись только что была получена через какой-то GET и уже здесь.
const lastSeen: Record<string, any> = {}
function remember<T extends { id: string }>(entityType: EntityType, obj: T): T {
  if (obj?.id) lastSeen[patchKey(entityType, obj.id)] = obj
  return obj
}
export function getLastSeen(entityType: EntityType, id: string): any | undefined {
  return lastSeen[patchKey(entityType, id)]
}

// Список: без удалённых, с патчами поверх серверных записей + локально созданные записи первыми.
function mergeList<T extends { id: string }>(entityType: EntityType, list: T[]): T[] {
  const created = createdOf(entityType)
    .filter((item) => !isDeleted(entityType, item.id))
    .map((item) => applyPatch(entityType, item))
  const server = list
    .filter((item) => !isDeleted(entityType, item.id))
    .map((item) => applyPatch(entityType, item))
  return [...created, ...server].map((item) => remember(entityType, item))
}

// Одна запись: удалена → null (адаптер эмулирует 404); demo-id → искать только среди созданных
// (сервер о ней не знает); иначе патч поверх серверного объекта.
function mergeSingle<T extends { id: string }>(
  entityType: EntityType,
  id: string,
  serverObj: T | null
): T | null {
  if (isDeleted(entityType, id)) return null
  if (isDemoId(id)) {
    const found = createdOf(entityType).find((item) => item.id === id)
    return found ? remember(entityType, applyPatch(entityType, found)) : null
  }
  return serverObj ? remember(entityType, applyPatch(entityType, serverObj)) : null
}

// Вложенный список внутри родительской записи (задачи/сообщения/пробные уроки сделки,
// сделки/задачи контакта и т.п.) — то же самое, но отфильтровано по внешнему ключу.
function mergeNestedByParent<T extends { id: string }>(
  entityType: EntityType,
  list: T[] | undefined,
  parentField: string,
  parentId: string
): T[] {
  const created = createdOf(entityType)
    .filter((item) => item[parentField] === parentId && !isDeleted(entityType, item.id))
    .map((item) => applyPatch(entityType, item))
  const server = (list ?? [])
    .filter((item) => !isDeleted(entityType, (item as any).id))
    .map((item) => applyPatch(entityType, item))
  return [...created, ...server].map((item) => remember(entityType, item))
}

// Контакт, вложенный в сделку (dealInclude.contact) — правки из ContactInlineCard
// (имя/телефон/email/telegram) и добавленные доп. телефоны/email идут через отдельные
// patch-записи по сущности 'contact'/'contactPhone'/'contactEmail', не через сам патч сделки.
function mergeEmbeddedContact(contact: any): any {
  if (!contact) return contact
  const patched = applyPatch('contact', contact)
  return {
    ...patched,
    phones: mergeNestedByParent('contactPhone', patched.phones, 'contactId', patched.id),
    emails: mergeNestedByParent('contactEmail', patched.emails, 'contactId', patched.id),
  }
}

// Сделки везде (список/канбан/детали) приходят через общий dealInclude — донасыщаем
// вложенный контакт, trials и счётчик сообщений (для бейджа на карточке канбана), не трогая
// остальные поля.
function withDealExtras(deal: any): any {
  const demoMessages = createdOf('message').filter(
    (m) => m.dealId === deal.id && !isDeleted('message', m.id)
  )
  return {
    ...deal,
    contact: mergeEmbeddedContact(deal.contact),
    trials: mergeNestedByParent('trial', deal.trials, 'dealId', deal.id),
    _count: deal._count
      ? { ...deal._count, messages: (deal._count.messages ?? 0) + demoMessages.length }
      : deal._count,
  }
}

function mergeDealList(list: any[]): any[] {
  return mergeList('deal', list).map(withDealExtras)
}

function mergeDealSingle(id: string, serverObj: any | null): any | null {
  const merged = mergeSingle('deal', id, serverObj)
  if (!merged) return null
  return {
    ...withDealExtras(merged),
    tasks: mergeNestedByParent('task', merged.tasks, 'dealId', id),
    messages: mergeNestedByParent('message', merged.messages, 'dealId', id),
  }
}

// Канбан: сделки сгруппированы по этапам на сервере — после патча stageId может измениться,
// поэтому группируем заново по актуальному (патченному) stageId, а не доверяем исходной корзине.
function mergeKanban(stages: Array<{ id: string; deals: any[] }>): Array<{ id: string; deals: any[] }> {
  const createdDeals = createdOf('deal')
    .filter((d) => !isDeleted('deal', d.id))
    .map((d) => withDealExtras(applyPatch('deal', d)))
  const serverDeals = stages
    .flatMap((s) => s.deals)
    .filter((d) => !isDeleted('deal', d.id))
    .map((d) => withDealExtras(applyPatch('deal', d)))
  const all = [...createdDeals, ...serverDeals]
  return stages.map((stage) => ({ ...stage, deals: all.filter((d) => d.stageId === stage.id) }))
}

function mergeContactSingle(id: string, serverObj: any | null): any | null {
  const merged = mergeSingle('contact', id, serverObj)
  if (!merged) return null
  return {
    ...merged,
    phones: mergeNestedByParent('contactPhone', merged.phones, 'contactId', id),
    emails: mergeNestedByParent('contactEmail', merged.emails, 'contactId', id),
    deals: mergeNestedByParent('deal', merged.deals, 'contactId', id).map(withDealExtras),
    tasks: mergeNestedByParent('task', merged.tasks, 'contactId', id),
    messages: mergeNestedByParent('message', merged.messages, 'contactId', id),
  }
}

function mergeCompanySingle(id: string, serverObj: any | null): any | null {
  const merged = mergeSingle('company', id, serverObj)
  if (!merged) return null
  return {
    ...merged,
    deals: merged.deals ? mergeNestedByParent('deal', merged.deals, 'companyId', id).map(withDealExtras) : merged.deals,
    contacts: merged.contacts ? mergeNestedByParent('contact', merged.contacts, 'companyId', id) : merged.contacts,
  }
}

// balance/effectiveStatus пересчитываются здесь, а не берутся из ответа сервера/оверлея —
// сервер вычисляет их один раз в момент своего ответа (services/subscriptions), а патч (например,
// списание урока) меняет lessonsUsed/status уже ПОСЛЕ этого — без пересчёта карточка абонемента
// показывала бы устаревший баланс до следующей полной перезагрузки страницы.
function mergeSubscriptionsList(list: any[]): any[] {
  return mergeList('subscription', list).map((sub) => {
    const balance = (sub.lessonsTotal ?? 0) - (sub.lessonsUsed ?? 0)
    const expired = sub.expiresAt ? new Date(sub.expiresAt).getTime() < Date.now() : false
    return remember('subscription', {
      ...sub,
      balance,
      effectiveStatus: expired ? 'expired' : sub.status,
      lessons: sub.lessons ? mergeNestedByParent('lesson', sub.lessons, 'subscriptionId', sub.id) : sub.lessons,
    })
  })
}

// Переписка «Чатов»/«Почты» — упрощённый merge (список тредов не переупорядочивается по
// свежести демо-сообщения, только содержимое открытого треда). Известное ограничение демо-режима.
function mergeMessagesByField(list: any[] | undefined, field: 'dealId' | 'contactId' | 'threadKey', value: string): any[] {
  return mergeNestedByParent('message', list, field, value)
}

// Единая точка входа для GET-ответов в demo-адаптере (lib/demo/adapter.ts) — по пути запроса
// определяет, какой merge применить. Без совпадения — данные с сервера возвращаются как есть
// (актуально для /auth/me, /auth/users, /trash, /chats, /email/threads, /analytics/* — эти
// разделы в demo-режиме сознательно упрощены, см. Часть 1.6 плана демо-стенда).
// Роут-литералы вида /deals/tags, /deals/export и т.д. (см. server-side порядок регистрации
// в routes/deals.ts — литерал ДО GET /:id) синтаксически неотличимы от /deals/:id по
// одному сегменту пути. Без этого списка они попадали в mergeDealSingle/mergeContactSingle/
// mergeCompanySingle, где ответ (string[] с тегами, blob экспорта, группы дублей) прогонялся
// через spread как будто это объект сущности — портило форму данных, и caller дальше падал на
// .filter()/.map() уже на этой испорченной форме (найдено на демо: "i.filter is not a function"
// при открытии карточки сделки — TagInput дёргает /deals/tags). Эти пути не нуждаются в
// merge — оверлей их не патчит, возвращаем ответ сервера как есть.
const LITERAL_SUBROUTES: Record<string, Set<string>> = {
  deals: new Set(['tags', 'export']),
  contacts: new Set(['tags', 'duplicates']),
  companies: new Set(['duplicates']),
}

export function applyOverlayToGetResponse(url: string, data: any): any {
  if (!data) return data
  let m: RegExpMatchArray | null

  if (url === '/deals') return { ...data, deals: mergeDealList(data.deals) }
  if (/^\/deals\/kanban\/[^/]+$/.test(url)) return mergeKanban(data)
  if ((m = url.match(/^\/deals\/([^/]+)$/)) && !LITERAL_SUBROUTES.deals.has(m[1])) {
    return mergeDealSingle(m[1], data)
  }

  if (url === '/contacts') return { ...data, contacts: mergeList('contact', data.contacts) }
  if ((m = url.match(/^\/contacts\/([^/]+)$/)) && !LITERAL_SUBROUTES.contacts.has(m[1])) {
    return mergeContactSingle(m[1], data)
  }

  if (url === '/companies') return { ...data, companies: mergeList('company', data.companies) }
  if ((m = url.match(/^\/companies\/([^/]+)$/)) && !LITERAL_SUBROUTES.companies.has(m[1])) {
    return mergeCompanySingle(m[1], data)
  }

  if (url === '/tasks') return mergeList('task', data)
  if (url === '/subscriptions') return mergeSubscriptionsList(data)
  if (url === '/payments') return mergeList('payment', data)

  if ((m = url.match(/^\/chats\/([^/]+)$/))) {
    return { ...data, messages: mergeMessagesByField(data.messages, 'contactId', m[1]) }
  }

  if (url === '/pipelines') {
    return mergeList('pipeline', data).map((p: any) => ({
      ...p,
      stages: mergeNestedByParent('stage', p.stages, 'pipelineId', p.id),
    }))
  }
  if ((m = url.match(/^\/pipelines\/([^/]+)$/))) {
    const merged = mergeSingle('pipeline', m[1], data)
    return merged ? { ...merged, stages: mergeNestedByParent('stage', merged.stages, 'pipelineId', m[1]) } : merged
  }

  if (url === '/lost-reasons') return mergeList('lostReason', data)
  if (url === '/packages') return mergeList('package', data)
  if (url === '/fields') return mergeList('field', data)
  if (url === '/automations') return mergeList('automation', data)
  if (url === '/email-accounts') return mergeList('emailAccount', data)
  if ((m = url.match(/^\/email-accounts\/([^/]+)$/))) return mergeSingle('emailAccount', m[1], data)

  if ((m = url.match(/^\/email\/threads\/([^/]+)$/))) {
    return { ...data, messages: mergeMessagesByField(data.messages, 'threadKey', decodeURIComponent(m[1])) }
  }

  return data
}
