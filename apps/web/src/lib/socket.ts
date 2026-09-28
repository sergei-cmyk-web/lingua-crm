import { io, type Socket } from 'socket.io-client'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    // Auth is the httpOnly access_token cookie (see socket/handlers.ts on the backend) —
    // withCredentials makes the handshake carry it, same as apiClient's withCredentials.
    socket = io(WS_URL, {
      autoConnect: false,
      withCredentials: true,
    })
  }
  return socket
}

export function connectSocket() {
  getSocket().connect()
}

export function disconnectSocket() {
  socket?.disconnect()
}
