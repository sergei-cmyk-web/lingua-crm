import nodemailer from 'nodemailer'
import { prisma } from '../../lib/prisma'

interface EmailAccountConfig {
  id: string
  emailAddress: string
  fromName: string | null
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapPassword: string
}

interface CacheEntry {
  config: EmailAccountConfig | null
  at: number
}

class EmailClient {
  private cache = new Map<string, CacheEntry>()

  // Креды живут в EmailAccount — кэш на минуту по accountId, как у TargetSMS/WazzUp
  async getAccountConfig(accountId: string): Promise<EmailAccountConfig | null> {
    const cached = this.cache.get(accountId)
    if (cached && Date.now() - cached.at < 60_000) return cached.config

    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } })
    const config: EmailAccountConfig | null =
      account && account.active
        ? {
            id: account.id,
            emailAddress: account.emailAddress,
            fromName: account.fromName,
            smtpHost: account.smtpHost,
            smtpPort: account.smtpPort,
            smtpSecure: account.smtpSecure,
            smtpUser: account.smtpUser,
            smtpPassword: account.smtpPassword,
            imapHost: account.imapHost,
            imapPort: account.imapPort,
            imapSecure: account.imapSecure,
            imapUser: account.imapUser,
            imapPassword: account.imapPassword,
          }
        : null

    this.cache.set(accountId, { config, at: Date.now() })
    return config
  }

  invalidateCache(accountId?: string) {
    if (accountId) this.cache.delete(accountId)
    else this.cache.clear()
  }

  private async transporterFor(config: EmailAccountConfig) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPassword },
      // Дефолт nodemailer — 2 минуты на установку соединения; на недоступном или закрытом
      // фаерволом SMTP-хосте (порты 25/465/587) это вешает запрос куда дольше терпения nginx
      // перед нами — прокси успевает сдаться и отдать 500/socket hang up браузеру, пока сервер
      // всё ещё ждёт.
      connectionTimeout: 10_000,
    })
  }

  async sendEmailMessage({
    accountId,
    to,
    subject,
    text,
    inReplyTo,
    references,
    attachments,
  }: {
    accountId: string
    to: string
    subject: string
    text: string
    inReplyTo?: string
    references?: string
    attachments?: { filename: string; content: Buffer; contentType: string }[]
  }): Promise<{ messageId: string }> {
    const config = await this.getAccountConfig(accountId)
    if (!config) throw new Error('Почтовый ящик не найден или отключён')

    const transporter = await this.transporterFor(config)
    const from = config.fromName ? `"${config.fromName}" <${config.emailAddress}>` : config.emailAddress

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      inReplyTo,
      references,
      attachments,
    })

    return { messageId: info.messageId }
  }

  async testConnection(config: EmailAccountConfig): Promise<{ smtp: boolean; imap: boolean; error?: string }> {
    let smtpOk = false
    let imapOk = false
    const errors: string[] = []

    try {
      const transporter = await this.transporterFor(config)
      await transporter.verify()
      smtpOk = true
    } catch (err) {
      errors.push(`SMTP: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const { ImapFlow } = await import('imapflow')
      const client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: { user: config.imapUser, pass: config.imapPassword },
        logger: false,
        // Дефолт imapflow — 90 секунд; для интерактивной кнопки теста этого достаточно, чтобы
        // запрос завис дольше, чем терпит прокси перед api (см. connectionTimeout у nodemailer выше).
        connectionTimeout: 10_000,
      })
      await client.connect()
      await client.logout()
      imapOk = true
    } catch (err) {
      errors.push(`IMAP: ${err instanceof Error ? err.message : String(err)}`)
    }

    return { smtp: smtpOk, imap: imapOk, error: errors.length ? errors.join('; ') : undefined }
  }
}

export const emailClient = new EmailClient()
