import { createServer } from 'node:http'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { Server, type Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState,
  RoomSummary,
  RoomPlayer,
  GameView,
  Phase,
  Seat,
  Partnership,
  SocketData,
} from '@pseudosafe/shared'
import {
  dealNewGame,
  applyCall,
  isCallLegal,
  legalCalls,
  isPlayLegal,
  applyPlay,
  nextSeat,
  partnershipOf,
  type GameState,
} from './bridge.js'

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3002

// Socket.IO runs over WebSockets, attached to the Express HTTP server.
const httpServer = createServer(app)
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  path: '/socket.io',
  cors: { origin: '*' },
})

// Convenient alias for a fully-typed socket in this server.
type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

const SEATS: Seat[] = ['N', 'E', 'S', 'W']

// --- in-memory room state (v2) ---
interface Room {
  players: Map<string, { name: string; ready: boolean; seat?: Seat }> // key socketId
  phase: Phase
  countdownTimer?: ReturnType<typeof setInterval>
  countdownRemaining?: number
  game?: GameState
  frozenReason?: string
}

const rooms = new Map<string, Room>()

// Legacy lobby projection (pre-join room list & counts).
function roomState(roomId: string): RoomState {
  const room = rooms.get(roomId)
  if (!room) return { roomId, players: [] }
  return {
    roomId,
    players: [...room.players.entries()].map(([id, p]) => ({ id, name: p.name })),
  }
}

function listRooms(): RoomSummary[] {
  return [...rooms.entries()].map(([roomId, room]) => ({
    roomId,
    count: room.players.size,
  }))
}

// Map the room's players Map into the public RoomPlayer[] shape.
function roomPlayers(room: Room): RoomPlayer[] {
  return [...room.players.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    ready: p.ready,
    seat: p.seat,
  }))
}

// Build the per-socket, redacted GameView. A socket only ever sees its own
// hand (plus dummy's, once revealed).
function buildGameView(roomId: string, room: Room, socketId: string): GameView {
  const view: GameView = {
    roomId,
    phase: room.phase,
    players: roomPlayers(room),
  }

  if (room.phase === 'FROZEN' && room.frozenReason) {
    view.frozenReason = room.frozenReason
  }

  if (room.phase === 'COUNTDOWN' && room.countdownRemaining !== undefined) {
    view.countdown = room.countdownRemaining
  }

  const game = room.game
  if (game) {
    const me = room.players.get(socketId)
    const you = me?.seat

    view.you = you
    view.dealer = game.dealer
    view.turn = game.turn
    view.vulnerability = 'NONE'

    if (you) {
      view.hand = game.hands[you]
    }

    view.handCounts = {
      N: game.hands.N.length,
      E: game.hands.E.length,
      S: game.hands.S.length,
      W: game.hands.W.length,
    }

    view.auction = game.auction
    view.contract = game.contract

    view.currentTrick = game.currentTrick
    view.trickLeader = game.trickLeader
    view.completedTricks = game.completedTricks
    view.tricksWon = {
      NS: game.tricksWon.NS,
      EW: game.tricksWon.EW,
    } as Record<Partnership, number>

    // Legal calls: only during AUCTION, only for the seat on turn.
    if (room.phase === 'AUCTION' && you && you === game.turn) {
      view.legalCalls = legalCalls(game)
    }

    // Dummy hand is public once revealed (after the opening lead).
    if (game.dummyRevealed && game.dummy) {
      view.dummy = game.dummy
      view.dummyHand = game.hands[game.dummy]
    }

    // Result on FINISHED.
    if (room.phase === 'FINISHED' && game.contract) {
      const declarerTricks = game.tricksWon[partnershipOf(game.contract.declarer)]
      const made = declarerTricks >= 6 + game.contract.level
      view.result = {
        made,
        declarerTricks,
        contract: game.contract,
      }
    }
  }

  return view
}

// Push a per-seat view to every socket in the room. Never broadcast a single
// shared view — views differ by seat (hidden hands).
function emitGameViews(roomId: string, room: Room): void {
  for (const socketId of room.players.keys()) {
    io.to(socketId).emit('gameView', buildGameView(roomId, room, socketId))
  }
}

// Cancel an in-progress countdown and return the room to the LOBBY.
function cancelCountdown(room: Room): void {
  if (room.countdownTimer) clearInterval(room.countdownTimer)
  room.countdownTimer = undefined
  room.countdownRemaining = undefined
  room.phase = 'LOBBY'
  room.game = undefined
  for (const p of room.players.values()) p.seat = undefined
}

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }))

io.on('connection', (socket: AppSocket) => {
  console.log('client connected', socket.id)

  socket.emit('rooms', listRooms())

  socket.on('listRooms', () => {
    socket.emit('rooms', listRooms())
  })

  socket.on('joinRoom', ({ roomId, name }) => {
    if (!roomId) return
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { players: new Map(), phase: 'LOBBY' })
    }
    const room = rooms.get(roomId)!

    // Only joinable in the LOBBY, and a bridge table seats at most 4.
    if (room.phase !== 'LOBBY') {
      socket.emit('errorMessage', 'Game already in progress.')
      return
    }
    if (room.players.size >= 4) {
      socket.emit('errorMessage', 'Room is full (max 4 players).')
      return
    }

    socket.join(roomId)
    socket.data.roomId = roomId
    room.players.set(socket.id, { name: name || 'anon', ready: false })

    emitGameViews(roomId, room)
    io.to(roomId).emit('roomState', roomState(roomId))
    io.emit('rooms', listRooms())
  })

  socket.on('chat', ({ text }) => {
    const roomId = socket.data.roomId
    if (!roomId) return
    const room = rooms.get(roomId)
    const name = room?.players.get(socket.id)?.name || 'anon'
    io.to(roomId).emit('chat', { name, text, ts: Date.now() })
  })

  socket.on('toggleReady', () => {
    const { roomId, room } = ctx(socket)
    if (!roomId || !room) return
    if (room.phase !== 'LOBBY') {
      socket.emit('errorMessage', 'Can only ready up in the lobby.')
      emitGameViews(roomId, room)
      return
    }
    const me = room.players.get(socket.id)
    if (!me) return
    me.ready = !me.ready
    emitGameViews(roomId, room)
  })

  socket.on('startPlay', () => {
    const { roomId, room } = ctx(socket)
    if (!roomId || !room) return
    if (room.phase !== 'LOBBY') {
      socket.emit('errorMessage', 'Game already starting or in progress.')
      emitGameViews(roomId, room)
      return
    }
    if (room.players.size !== 4) {
      socket.emit('errorMessage', 'Need exactly 4 players to start.')
      emitGameViews(roomId, room)
      return
    }
    if (![...room.players.values()].every((p) => p.ready)) {
      socket.emit('errorMessage', 'All players must be ready.')
      emitGameViews(roomId, room)
      return
    }

    // Randomize the 4 players across seats N, E, S, W.
    const socketIds = [...room.players.keys()]
    const shuffledSeats = [...SEATS]
    for (let i = shuffledSeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledSeats[i], shuffledSeats[j]] = [shuffledSeats[j], shuffledSeats[i]]
    }
    socketIds.forEach((id, idx) => {
      room.players.get(id)!.seat = shuffledSeats[idx]
    })

    room.phase = 'COUNTDOWN'
    room.countdownRemaining = 5
    emitGameViews(roomId, room)

    room.countdownTimer = setInterval(() => {
      // Room may have been cancelled/torn down between ticks.
      if (rooms.get(roomId) !== room || room.phase !== 'COUNTDOWN') {
        if (room.countdownTimer) clearInterval(room.countdownTimer)
        room.countdownTimer = undefined
        return
      }

      room.countdownRemaining = (room.countdownRemaining ?? 0) - 1

      if (room.countdownRemaining! <= 0) {
        clearInterval(room.countdownTimer!)
        room.countdownTimer = undefined
        room.countdownRemaining = undefined

        // Build seatOf from the assigned seats.
        const seatOf = seatOfFor(room)
        const dealer = SEATS[Math.floor(Math.random() * 4)]
        room.game = dealNewGame(seatOf, dealer)
        room.phase = 'AUCTION'
      }

      emitGameViews(roomId, room)
    }, 1000)
  })

  socket.on('makeCall', (call) => {
    const { roomId, room } = ctx(socket)
    if (!roomId || !room) return
    if (room.phase !== 'AUCTION' || !room.game) {
      socket.emit('errorMessage', 'Not currently bidding.')
      emitGameViews(roomId, room!)
      return
    }
    const me = room.players.get(socket.id)
    if (!me?.seat || me.seat !== room.game.turn) {
      socket.emit('errorMessage', 'Not your turn to bid.')
      emitGameViews(roomId, room)
      return
    }
    const fullCall = { seat: me.seat, ...call }
    if (!isCallLegal(room.game, fullCall)) {
      socket.emit('errorMessage', 'Illegal call.')
      emitGameViews(roomId, room)
      return
    }

    const oldDealer = room.game.dealer
    room.game = applyCall(room.game, fullCall)

    if (room.game.passedOut) {
      // Redeal with the next dealer; stay in AUCTION.
      const seatOf = seatOfFor(room)
      room.game = dealNewGame(seatOf, nextSeat(oldDealer))
      room.phase = 'AUCTION'
    } else if (room.game.phase === 'PLAY') {
      room.phase = 'PLAY'
    }

    emitGameViews(roomId, room)
  })

  socket.on('playCard', ({ card }) => {
    const { roomId, room } = ctx(socket)
    if (!roomId || !room) return
    if (room.phase !== 'PLAY' || !room.game) {
      socket.emit('errorMessage', 'Not currently in play.')
      emitGameViews(roomId, room!)
      return
    }
    const me = room.players.get(socket.id)
    // The socket must own the seat on turn. Note: the dummy's own socket plays
    // the dummy's cards, and game.turn will be the dummy seat when it's dummy's
    // turn — so this same ownership check covers that case.
    if (!me?.seat || me.seat !== room.game.turn) {
      socket.emit('errorMessage', 'Not your turn to play.')
      emitGameViews(roomId, room)
      return
    }
    if (!isPlayLegal(room.game, me.seat, card)) {
      socket.emit('errorMessage', 'Illegal card.')
      emitGameViews(roomId, room)
      return
    }

    room.game = applyPlay(room.game, card)
    if (room.game.phase === 'FINISHED') {
      room.phase = 'FINISHED'
    }

    emitGameViews(roomId, room)
  })

  socket.on('leaveRoom', () => leave(socket))
  socket.on('leaveGame', () => leave(socket))
  socket.on('disconnect', () => leave(socket))
})

// Resolve the roomId + Room for a socket in one shot.
function ctx(socket: AppSocket): { roomId?: string; room?: Room } {
  const roomId = socket.data.roomId
  if (!roomId) return {}
  return { roomId, room: rooms.get(roomId) }
}

// Build the seatOf record (Seat -> name) from assigned seats.
function seatOfFor(room: Room): Record<Seat, string> {
  const seatOf: Record<Seat, string> = { N: '', E: '', S: '', W: '' }
  for (const p of room.players.values()) {
    if (p.seat) seatOf[p.seat] = p.name
  }
  return seatOf
}

function leave(socket: AppSocket): void {
  const roomId = socket.data.roomId
  if (!roomId) return
  const room = rooms.get(roomId)

  socket.leave(roomId)
  socket.data.roomId = undefined

  if (!room) {
    io.emit('rooms', listRooms())
    return
  }

  const me = room.players.get(socket.id)

  if (room.phase === 'LOBBY' || room.phase === 'COUNTDOWN') {
    // Pre-game: drop the player. If a countdown was running, cancel it.
    room.players.delete(socket.id)
    if (room.phase === 'COUNTDOWN') cancelCountdown(room)

    if (room.players.size === 0) {
      rooms.delete(roomId)
    } else {
      emitGameViews(roomId, room)
      io.to(roomId).emit('roomState', roomState(roomId))
    }
  } else if (room.phase === 'AUCTION' || room.phase === 'PLAY') {
    // In-game: freeze the table. Keep game state intact for the remaining
    // players; remove the leaver but do not delete the room.
    const seat = me?.seat
    const name = me?.name ?? 'anon'
    room.phase = 'FROZEN'
    room.frozenReason = `${seat ?? '?'} (${name}) left the game.`
    room.players.delete(socket.id)

    if (room.players.size === 0) {
      rooms.delete(roomId)
    } else {
      emitGameViews(roomId, room)
    }
  } else {
    // FROZEN / FINISHED: just remove the leaver.
    room.players.delete(socket.id)
    if (room.players.size === 0) {
      rooms.delete(roomId)
    } else {
      emitGameViews(roomId, room)
    }
  }

  io.emit('rooms', listRooms())
}

httpServer.listen(PORT, () => {
  console.log(`bridge server (express + socket.io) listening on :${PORT}`)
})
