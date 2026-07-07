import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3002

// Socket.IO runs over WebSockets, attached to the Express HTTP server.
const httpServer = createServer(app)
const io = new Server(httpServer, {
  path: '/socket.io',
  cors: { origin: '*' },
})

// --- simple in-memory lobby state ---
// rooms: Map<roomId, { players: Map<socketId, name> }>
const rooms = new Map()

function roomState(roomId) {
  const room = rooms.get(roomId)
  if (!room) return { roomId, players: [] }
  return {
    roomId,
    players: [...room.players.entries()].map(([id, name]) => ({ id, name })),
  }
}

function listRooms() {
  return [...rooms.entries()].map(([roomId, room]) => ({
    roomId,
    count: room.players.size,
  }))
}

app.get('/health', (_req, res) => res.json({ ok: true }))

io.on('connection', (socket) => {
  console.log('client connected', socket.id)

  socket.emit('rooms', listRooms())

  socket.on('listRooms', () => {
    socket.emit('rooms', listRooms())
  })

  socket.on('joinRoom', ({ roomId, name }) => {
    if (!roomId) return
    if (!rooms.has(roomId)) rooms.set(roomId, { players: new Map() })
    const room = rooms.get(roomId)

    // a bridge table seats at most 4 players
    if (room.players.size >= 4) {
      socket.emit('errorMessage', 'Room is full (max 4 players).')
      return
    }

    socket.join(roomId)
    socket.data.roomId = roomId
    room.players.set(socket.id, name || 'anon')

    io.to(roomId).emit('roomState', roomState(roomId))
    io.emit('rooms', listRooms())
  })

  socket.on('chat', ({ text }) => {
    const roomId = socket.data.roomId
    if (!roomId) return
    const room = rooms.get(roomId)
    const name = room?.players.get(socket.id) || 'anon'
    io.to(roomId).emit('chat', { name, text, ts: Date.now() })
  })

  socket.on('leaveRoom', () => leave(socket))
  socket.on('disconnect', () => leave(socket))
})

function leave(socket) {
  const roomId = socket.data.roomId
  if (!roomId) return
  const room = rooms.get(roomId)
  if (room) {
    room.players.delete(socket.id)
    if (room.players.size === 0) rooms.delete(roomId)
    else io.to(roomId).emit('roomState', roomState(roomId))
  }
  socket.leave(roomId)
  socket.data.roomId = undefined
  io.emit('rooms', listRooms())
}

httpServer.listen(PORT, () => {
  console.log(`bridge server (express + socket.io) listening on :${PORT}`)
})
