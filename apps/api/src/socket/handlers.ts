import type { Server } from 'socket.io'
import { verifyAccessToken, type AuthUser } from '../middleware/auth'
import { parseCookieHeader } from '../lib/cookies'
import { canViewContact } from '../services/chats/access'
import { userHasPermission } from '../services/roles/permissions'

let io: Server | null = null

export function initSocket(server: Server) {
  io = server

  // Authenticate every socket connection with the same JWT as the REST API. access_token is an
  // httpOnly cookie, sent automatically by the browser on the handshake — same-origin in prod
  // (nginx routes /socket.io/ to this same host), cross-port-but-same-site in dev (SameSite=Lax
  // only blocks cross-SITE requests, not cross-port on localhost), as long as the client sets
  // withCredentials and CORS here allows credentials from an explicit origin (both true, see below).
  io.use((socket, next) => {
    const token = parseCookieHeader(socket.handshake.headers.cookie).access_token
    if (!token) return next(new Error('Unauthorized'))
    try {
      socket.data.user = verifyAccessToken(token) satisfies AuthUser
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    // Join pipeline room for real-time kanban updates
    socket.on('join:pipeline', (pipelineId: string) => {
      socket.join(`pipeline:${pipelineId}`)
    })

    socket.on('leave:pipeline', (pipelineId: string) => {
      socket.leave(`pipeline:${pipelineId}`)
    })

    socket.on('join:deal', (dealId: string) => {
      socket.join(`deal:${dealId}`)
    })

    socket.on('leave:deal', (dealId: string) => {
      socket.leave(`deal:${dealId}`)
    })

    // Единая комната для раздела «Почта» — живое обновление списка тредов.
    // Гейт зеркалит REST (router.use(requirePermission('section.email')) в routes/email.ts) —
    // без него любой залогиненный сокет мог слушать NEW_EMAIL по всем ящикам, включая личные.
    socket.on('join:email', async () => {
      if (await userHasPermission(socket.data.user.id, 'section.email')) socket.join('email:inbox')
    })

    socket.on('leave:email', () => {
      socket.leave('email:inbox')
    })

    // Единая комната для раздела «Чаты» — обновление списка чатов без открытия конкретного.
    // Гейт зеркалит REST (requirePermission('section.chats') в routes/chats.ts).
    socket.on('join:chats-inbox', async () => {
      if (await userHasPermission(socket.data.user.id, 'section.chats')) socket.join('chats:inbox')
    })

    socket.on('leave:chats-inbox', () => {
      socket.leave('chats:inbox')
    })

    // Комната открытого чата (по контакту) — как deal:{id} для карточки сделки.
    // canViewContact — та же проверка видимости, что и в GET /api/chats/:contactId (A5): без
    // неё менеджер мог подписаться на переписку контакта, чьи сделки закреплены за другими.
    socket.on('join:chat', async (contactId: string) => {
      if (await canViewContact(socket.data.user, contactId)) socket.join(`contact:${contactId}`)
    })

    socket.on('leave:chat', (contactId: string) => {
      socket.leave(`contact:${contactId}`)
    })

    socket.on('disconnect', () => {
      // Socket.io cleans up rooms automatically
    })
  })
}

export function emitToRoom(room: string, event: string, data: unknown) {
  if (!io) return
  io.to(room).emit(event, data)
}
