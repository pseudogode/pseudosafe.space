import { useEffect, useMemo, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  RoomSummary,
  Player,
  ChatMessage,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@pseudosafe/shared'

// In production the bridge server sits behind the reverse proxy at the same
// origin, reachable under the /bridge-api path. In dev, point at :3002.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined // same-origin
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || '/bridge-api/socket.io'

export default function App() {
  const socket = useMemo<Socket<ServerToClientEvents, ClientToServerEvents>>(
    () => io(SOCKET_URL, { path: SOCKET_PATH, autoConnect: false }),
    [],
  )

  const [connected, setConnected] = useState(false)
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [joined, setJoined] = useState(false)
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    socket.connect()
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('rooms', (list) => setRooms(list))
    socket.on('roomState', (state) => {
      setPlayers(state.players)
      setJoined(true)
    })
    socket.on('chat', (msg) => setMessages((m) => [...m, msg]))
    socket.on('errorMessage', (text) => setError(text))
    return () => {
      socket.disconnect()
    }
  }, [socket])

  function joinRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    socket.emit('joinRoom', { roomId: roomId.trim(), name: name.trim() })
  }

  function leaveRoom() {
    socket.emit('leaveRoom')
    setJoined(false)
    setPlayers([])
    setMessages([])
  }

  function sendChat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!chatText.trim()) return
    socket.emit('chat', { text: chatText.trim() })
    setChatText('')
  }

  return (
    <main>
      <h1>Bridge Lobby</h1>
      <p>Status: {connected ? 'connected' : 'disconnected'}</p>
      <p><a href="/">&larr; back to portal</a></p>

      {error && <p><strong>Error:</strong> {error}</p>}

      {!joined ? (
        <section>
          <h2>Join a table</h2>
          <form onSubmit={joinRoom}>
            <p>
              <label>
                Name:{' '}
                <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
              </label>
            </p>
            <p>
              <label>
                Room:{' '}
                <input value={roomId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoomId(e.target.value)} />
              </label>
            </p>
            <button type="submit" disabled={!connected}>Join</button>
          </form>

          <h3>Open rooms</h3>
          {rooms.length === 0 ? (
            <p>No rooms yet. Create one by joining a room name above.</p>
          ) : (
            <ul>
              {rooms.map((r) => (
                <li key={r.roomId}>
                  <button onClick={() => setRoomId(r.roomId)}>
                    {r.roomId} ({r.count}/4)
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section>
          <h2>Table: {roomId}</h2>
          <button onClick={leaveRoom}>Leave</button>

          <h3>Players ({players.length}/4)</h3>
          <ul>
            {players.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>

          <h3>Chat</h3>
          <ul>
            {messages.map((m, i) => (
              <li key={i}><strong>{m.name}:</strong> {m.text}</li>
            ))}
          </ul>
          <form onSubmit={sendChat}>
            <input value={chatText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChatText(e.target.value)} />
            <button type="submit">Send</button>
          </form>
        </section>
      )}
    </main>
  )
}
