import { apiClient } from './client'
import type { CreateDealDto, UpdateDealDto, MoveDealDto, CreateContactDto, UpdateContactDto, CreateCompanyDto, UpdateCompanyDto, CreateTaskDto, UpdateTaskDto, CreateAutomationDto, CreatePipelineDto, Role } from '@crm/shared'

// Auth — токены живут только в httpOnly cookie, ответы отдают только user
export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }).then(r => r.data),
  logout: () => apiClient.post('/auth/logout').then(r => r.data),
  me: () => apiClient.get('/auth/me').then(r => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }).then(r => r.data),
}

// Pipelines
export const pipelinesApi = {
  list: () => apiClient.get('/pipelines').then(r => r.data),
  get: (id: string) => apiClient.get(`/pipelines/${id}`).then(r => r.data),
  create: (data: CreatePipelineDto) => apiClient.post('/pipelines', data).then(r => r.data),
  update: (id: string, data: Partial<CreatePipelineDto>) => apiClient.patch(`/pipelines/${id}`, data).then(r => r.data),
}

// Stages
export const stagesApi = {
  create: (pipelineId: string, data: { name: string; color: string; order: number; type?: string }) =>
    apiClient.post(`/pipelines/${pipelineId}/stages`, data).then(r => r.data),
  update: (stageId: string, data: { name?: string; color?: string; order?: number; type?: string }) =>
    apiClient.patch(`/pipelines/stages/${stageId}`, data).then(r => r.data),
  delete: (stageId: string, targetStageId?: string) =>
    apiClient.delete(`/pipelines/stages/${stageId}`, { params: targetStageId ? { targetStageId } : undefined }).then(r => r.data),
  deletionCheck: (stageId: string, targetStageId?: string) =>
    apiClient.get(`/pipelines/stages/${stageId}/deletion-check`, { params: targetStageId ? { targetStageId } : undefined }).then(r => r.data as { dealCount: number; totalCount: number; requiredFields: { key: string; label: string; missingCount: number }[] }),
}

// Lost reasons
export const lostReasonsApi = {
  list: (params?: { active?: boolean }) =>
    apiClient.get('/lost-reasons', { params }).then(r => r.data),
  create: (data: { name: string; order?: number }) =>
    apiClient.post('/lost-reasons', data).then(r => r.data),
  update: (id: string, data: { name?: string; order?: number; active?: boolean }) =>
    apiClient.patch(`/lost-reasons/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/lost-reasons/${id}`).then(r => r.data),
}

// Deals
export const dealsApi = {
  list: (params?: Record<string, string | number>) => apiClient.get('/deals', { params }).then(r => r.data),
  tags: () => apiClient.get('/deals/tags').then(r => r.data as string[]),
  kanban: (pipelineId: string) => apiClient.get(`/deals/kanban/${pipelineId}`).then(r => r.data),
  get: (id: string) => apiClient.get(`/deals/${id}`).then(r => r.data),
  create: (data: CreateDealDto) => apiClient.post('/deals', data).then(r => r.data),
  update: (id: string, data: UpdateDealDto) => apiClient.patch(`/deals/${id}`, data).then(r => r.data),
  moveStage: (id: string, data: MoveDealDto) => apiClient.patch(`/deals/${id}/stage`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/deals/${id}`).then(r => r.data),
  bulkDelete: (ids: string[]) => apiClient.post('/deals/bulk-delete', { ids }).then(r => r.data),
  sendMessage: (id: string, text: string, transport?: string, chatId?: string, scheduledAt?: string, recipientType?: 'chatId' | 'phone' | 'username') =>
    apiClient.post(`/deals/${id}/messages`, { text, transport, chatId, scheduledAt, recipientType }).then(r => r.data),
  editMessage: (id: string, messageId: string, text: string) =>
    apiClient.patch(`/deals/${id}/messages/${messageId}`, { text }).then(r => r.data),
  sendEmail: (id: string, formData: FormData) =>
    apiClient.post(`/deals/${id}/emails`, formData, { headers: { 'Content-Type': undefined } }).then(r => r.data),
  exportDeals: (params: { format: 'csv' | 'xlsx'; search?: string; ids?: string[]; pipelineId?: string; stageId?: string }) =>
    apiClient.get('/deals/export', {
      params: {
        format: params.format,
        search: params.search,
        ids: params.ids?.join(','),
        pipelineId: params.pipelineId,
        stageId: params.stageId,
      },
      responseType: 'blob',
    }).then(r => r.data as Blob),
}

// Contacts
export const contactsApi = {
  list: (params?: Record<string, string | number>) => apiClient.get('/contacts', { params }).then(r => r.data),
  tags: () => apiClient.get('/contacts/tags').then(r => r.data as string[]),
  get: (id: string) => apiClient.get(`/contacts/${id}`).then(r => r.data),
  create: (data: CreateContactDto) => apiClient.post('/contacts', data).then(r => r.data),
  update: (id: string, data: UpdateContactDto) => apiClient.patch(`/contacts/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/contacts/${id}`).then(r => r.data),
  bulkDelete: (ids: string[]) => apiClient.post('/contacts/bulk-delete', { ids }).then(r => r.data),
  addPhone: (id: string, phone: string, label?: string) =>
    apiClient.post(`/contacts/${id}/phones`, { phone, label }).then(r => r.data),
  removePhone: (id: string, phoneId: string) =>
    apiClient.delete(`/contacts/${id}/phones/${phoneId}`).then(r => r.data),
  addEmail: (id: string, email: string, label?: string) =>
    apiClient.post(`/contacts/${id}/emails`, { email, label }).then(r => r.data),
  removeEmail: (id: string, emailId: string) =>
    apiClient.delete(`/contacts/${id}/emails/${emailId}`).then(r => r.data),
  duplicates: () => apiClient.get('/contacts/duplicates').then(r => r.data),
  merge: (ids: string[], strategy: 'newest' | 'oldest') =>
    apiClient.post('/contacts/merge', { ids, strategy }).then(r => r.data),
}

// Companies
export const companiesApi = {
  list: (params?: Record<string, string | number>) => apiClient.get('/companies', { params }).then(r => r.data),
  get: (id: string) => apiClient.get(`/companies/${id}`).then(r => r.data),
  create: (data: CreateCompanyDto) => apiClient.post('/companies', data).then(r => r.data),
  update: (id: string, data: UpdateCompanyDto) => apiClient.patch(`/companies/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/companies/${id}`).then(r => r.data),
  bulkDelete: (ids: string[]) => apiClient.post('/companies/bulk-delete', { ids }).then(r => r.data),
  duplicates: () => apiClient.get('/companies/duplicates').then(r => r.data),
  merge: (ids: string[], strategy: 'newest' | 'oldest') =>
    apiClient.post('/companies/merge', { ids, strategy }).then(r => r.data),
}

// Tasks
export const tasksApi = {
  list: (params?: Record<string, string | number | boolean>) => apiClient.get('/tasks', { params }).then(r => r.data),
  create: (data: CreateTaskDto) => apiClient.post('/tasks', data).then(r => r.data),
  update: (id: string, data: UpdateTaskDto) => apiClient.patch(`/tasks/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/tasks/${id}`).then(r => r.data),
}

// Fields
export const fieldsApi = {
  list: (params?: { entityType?: string; pipelineId?: string | null }) =>
    apiClient.get('/fields', { params }).then(r => r.data),
  create: (data: Record<string, unknown>) => apiClient.post('/fields', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => apiClient.patch(`/fields/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/fields/${id}`).then(r => r.data),
}

// Users
export interface ManagedUser {
  id: string
  name: string
  email: string
  active: boolean
  role: { id: string; name: string }
}

export const usersApi = {
  list: () => apiClient.get('/auth/users').then(r => r.data) as Promise<Array<{ id: string; name: string; email?: string; role: string; isTeacher: boolean }>>,
  // Управление пользователями (users.manage) — включая деактивированных
  listAll: () => apiClient.get('/users').then(r => r.data) as Promise<ManagedUser[]>,
  create: (data: { name: string; email: string; password: string; roleId: string }) =>
    apiClient.post('/users', data).then(r => r.data) as Promise<ManagedUser>,
  update: (id: string, data: { name?: string; email?: string; roleId?: string; active?: boolean; password?: string }) =>
    apiClient.patch(`/users/${id}`, data).then(r => r.data) as Promise<ManagedUser>,
}

// Roles
export const rolesApi = {
  list: () => apiClient.get('/roles').then(r => r.data) as Promise<Role[]>,
  create: (data: { name: string; permissions: string[] }) => apiClient.post('/roles', data).then(r => r.data) as Promise<Role>,
  update: (id: string, data: { name?: string; permissions?: string[] }) => apiClient.patch(`/roles/${id}`, data).then(r => r.data) as Promise<Role>,
  delete: (id: string) => apiClient.delete(`/roles/${id}`).then(r => r.data),
}

// Analytics
export const analyticsApi = {
  pipeline: (pipelineId: string, params?: { from?: string; to?: string }) =>
    apiClient.get(`/analytics/pipeline/${pipelineId}`, { params }).then(r => r.data),
  tasksSummary: (params?: { assigneeId?: string }) =>
    apiClient.get('/analytics/tasks/summary', { params }).then(r => r.data),
}

// Automations
export const automationsApi = {
  list: (pipelineId?: string) => apiClient.get('/automations', { params: { pipelineId } }).then(r => r.data),
  create: (data: CreateAutomationDto) => apiClient.post('/automations', data).then(r => r.data),
  update: (id: string, data: Partial<CreateAutomationDto>) => apiClient.patch(`/automations/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/automations/${id}`).then(r => r.data),
}

// Integrations
export const integrationsApi = {
  wazzupChannels: () => apiClient.get('/integrations/wazzup/channels').then(r => r.data) as Promise<{ channels: WazzupChannel[]; hasApiKey: boolean }>,
  wazzupSync: () => apiClient.post('/integrations/wazzup/sync').then(r => r.data) as Promise<{ channels: WazzupChannel[] }>,
  getSetting: (key: string) =>
    apiClient.get(`/integrations/settings/${key}`).then(r => r.data) as Promise<{ key: string; value?: string | null; hasValue?: boolean }>,
  putSetting: (key: string, value: string) =>
    apiClient.put(`/integrations/settings/${key}`, { value }).then(r => r.data),
  targetsmsTest: () =>
    apiClient.post('/integrations/targetsms/test').then(r => r.data) as Promise<{ ok: boolean; balance?: { currency: string; value: string } }>,
  targetsmsTemplates: () =>
    apiClient.get('/integrations/targetsms/templates').then(r => r.data) as Promise<{ templates: { id: string; name: string; text: string }[] }>,
}

// Trial lessons
export interface TrialReminderTarget {
  transport: string
  chatId: string
}

export const trialsApi = {
  create: (dealId: string, data: { scheduledAt: string; reminderTargets: TrialReminderTarget[] }) =>
    apiClient.post(`/deals/${dealId}/trials`, data).then(r => r.data),
  reschedule: (trialId: string, scheduledAt: string) =>
    apiClient.patch(`/trials/${trialId}`, { scheduledAt }).then(r => r.data),
  setStatus: (trialId: string, status: 'completed' | 'no_show' | 'canceled') =>
    apiClient.patch(`/trials/${trialId}`, { status }).then(r => r.data),
  setReminderTargets: (trialId: string, reminderTargets: TrialReminderTarget[]) =>
    apiClient.patch(`/trials/${trialId}`, { reminderTargets }).then(r => r.data),
}

// Packages (тарифы абонементов)
export const packagesApi = {
  list: (params?: { active?: boolean }) =>
    apiClient.get('/packages', { params }).then(r => r.data),
  create: (data: { name: string; lessonsCount: number; durationDays?: number | null; price: number }) =>
    apiClient.post('/packages', data).then(r => r.data),
  update: (id: string, data: { name?: string; lessonsCount?: number; durationDays?: number | null; price?: number; active?: boolean }) =>
    apiClient.patch(`/packages/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/packages/${id}`).then(r => r.data),
}

// Subscriptions (абонементы)
export const subscriptionsApi = {
  list: (params: { contactId?: string; dealId?: string }) =>
    apiClient.get('/subscriptions', { params }).then(r => r.data),
  create: (data: { contactId: string; dealId?: string; packageId: string; lessonsTotal?: number; price?: number; expiresAt?: string }) =>
    apiClient.post('/subscriptions', data).then(r => r.data),
  update: (id: string, data: { status?: 'canceled'; lessonsTotal?: number }) =>
    apiClient.patch(`/subscriptions/${id}`, data).then(r => r.data),
  createLesson: (subscriptionId: string, data: { scheduledAt: string; teacherId?: string; note?: string }) =>
    apiClient.post(`/subscriptions/${subscriptionId}/lessons`, data).then(r => r.data),
  updateLesson: (subscriptionId: string, lessonId: string, data: { status?: 'completed' | 'no_show' | 'canceled'; teacherId?: string | null; scheduledAt?: string }) =>
    apiClient.patch(`/subscriptions/${subscriptionId}/lessons/${lessonId}`, data).then(r => r.data),
}

// Payments (счета на оплату)
export const paymentsApi = {
  create: (data: { dealId: string; packageId: string; provider?: string; amount?: number; lessonsTotal?: number }) =>
    apiClient.post('/payments', data).then(r => r.data),
  list: (params: { dealId?: string; contactId?: string }) =>
    apiClient.get('/payments', { params }).then(r => r.data),
  cancel: (id: string) => apiClient.post(`/payments/${id}/cancel`).then(r => r.data),
}

// Trash (корзина): просмотр/восстановление/окончательное удаление — admin only
export interface TrashItemDeal {
  id: string
  title: string
  budget: string | number | null
  deletedAt: string
  stage: { name: string; color: string } | null
  pipeline: { name: string } | null
  contact: { id: string; name: string } | null
}
export interface TrashItemContact {
  id: string
  name: string
  phone: string | null
  email: string | null
  deletedAt: string
  _count: { deals: number }
}
export interface TrashItemCompany {
  id: string
  name: string
  deletedAt: string
  _count: { contacts: number; deals: number }
}
export type TrashEntityType = 'deals' | 'contacts' | 'companies'

export const trashApi = {
  list: () =>
    apiClient.get('/trash').then(r => r.data) as Promise<{
      deals: TrashItemDeal[]
      contacts: TrashItemContact[]
      companies: TrashItemCompany[]
      retentionDays: number
    }>,
  restore: (type: TrashEntityType, id: string) =>
    apiClient.post(`/trash/${type}/${id}/restore`).then(r => r.data),
  deleteForever: (type: TrashEntityType, id: string) =>
    apiClient.delete(`/trash/${type}/${id}`).then(r => r.data),
}

// Pipelines delete
export const pipelineDeleteApi = {
  delete: (id: string) => apiClient.delete(`/pipelines/${id}`).then(r => r.data),
}

export interface WazzupChannel {
  channelId: string
  transport: string
  plainId: string
  state: string
}

// Email-аккаунты (SMTP/IMAP-ящики)
export interface EmailAccountSummary {
  id: string
  label: string
  emailAddress: string
  fromName: string | null
  active: boolean
  ownerId: string
  allowedUserIds: string[]
}

export interface EmailAccountInput {
  label: string
  emailAddress: string
  fromName?: string | null
  smtpHost: string
  smtpPort: number
  smtpSecure?: boolean
  smtpUser: string
  smtpPassword?: string
  imapHost: string
  imapPort: number
  imapSecure?: boolean
  imapUser: string
  imapPassword?: string
  ownerId: string
  allowedUserIds?: string[]
  active?: boolean
}

export const emailAccountsApi = {
  list: () => apiClient.get('/email-accounts').then(r => r.data) as Promise<EmailAccountSummary[]>,
  get: (id: string) => apiClient.get(`/email-accounts/${id}`).then(r => r.data),
  create: (data: EmailAccountInput) => apiClient.post('/email-accounts', data).then(r => r.data),
  update: (id: string, data: Partial<EmailAccountInput>) => apiClient.patch(`/email-accounts/${id}`, data).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/email-accounts/${id}`).then(r => r.data),
  test: (id: string) => apiClient.post(`/email-accounts/${id}/test`).then(r => r.data) as Promise<{ ok: boolean; error?: string }>,
}

// Единый инбокс «Почта»
export const emailApi = {
  threads: (params?: { search?: string; page?: number; limit?: number }) =>
    apiClient.get('/email/threads', { params }).then(r => r.data),
  thread: (threadKey: string) =>
    apiClient.get(`/email/threads/${encodeURIComponent(threadKey)}`).then(r => r.data),
  compose: (formData: FormData) =>
    apiClient.post('/email/compose', formData, { headers: { 'Content-Type': undefined } }).then(r => r.data),
  attachmentUrl: (id: string) =>
    apiClient.get(`/email/attachments/${id}/download`).then(r => r.data) as Promise<{ url: string }>,
}

// Раздел «Чаты» — единый инбокс мессенджеров (не email), группировка по контакту.
// id несматченных чатов (без contactId) — `unmatched:{chatId}`, резолвится в отдельный роут.
const UNMATCHED_PREFIX = 'unmatched:'
function chatPath(id: string, suffix = '') {
  return id.startsWith(UNMATCHED_PREFIX)
    ? `/chats/unmatched/${encodeURIComponent(id.slice(UNMATCHED_PREFIX.length))}${suffix}`
    : `/chats/${id}${suffix}`
}
export const chatsApi = {
  list: (params?: { search?: string; limit?: number }) => apiClient.get('/chats', { params }).then(r => r.data),
  thread: (id: string) => apiClient.get(chatPath(id)).then(r => r.data),
  reply: (id: string, data: { transport?: string; chatId?: string; text: string }) =>
    apiClient.post(chatPath(id, '/messages'), data).then(r => r.data),
}
