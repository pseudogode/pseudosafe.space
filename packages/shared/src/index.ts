// Shared Socket.IO event/payload contracts between bridge-server and
// bridge-client. Type-only: there is no runtime output, so consumers import
// these with `import type` and the imports are erased at build time. This keeps
// the two ends of the socket protocol from drifting apart.

export interface RoomSummary {
  roomId: string
  count: number
}

export interface Player {
  id: string
  name: string
}

export interface RoomState {
  roomId: string
  players: Player[]
}

export interface ChatMessage {
  name: string
  text: string
  ts: number
}

export interface ClientToServerEvents {
  listRooms: () => void
  joinRoom: (p: { roomId: string; name: string }) => void
  chat: (p: { text: string }) => void
  leaveRoom: () => void
}

export interface ServerToClientEvents {
  rooms: (rooms: RoomSummary[]) => void
  roomState: (state: RoomState) => void
  chat: (msg: ChatMessage) => void
  errorMessage: (text: string) => void
}

export interface SocketData {
  roomId?: string
}
