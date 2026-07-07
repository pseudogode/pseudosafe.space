import { useEffect, useMemo, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  RoomSummary,
  ChatMessage,
  ServerToClientEvents,
  ClientToServerEvents,
  GameView,
  Card,
  CallType,
  BidLevel,
  Strain,
} from '@pseudosafe/shared'
import Lobby from './components/Lobby'
import RoomReady from './components/RoomReady'
import Countdown from './components/Countdown'
import Auction from './components/Auction'
import Play from './components/Play'
import Frozen from './components/Frozen'
import Finished from './components/Finished'
import Chat from './components/Chat'
import styles from './App.module.css'

// In production the bridge server sits behind the reverse proxy at the same
// origin, reachable under the /bridge-api path. In dev, point at :3002.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined // same-origin
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || '/bridge-api/socket.io'

export default function App() {
  const socket = useMemo<Socket<ServerToClientEvents, ClientToServerEvents>>(
    () => io(SOCKET_URL, { path: SOCKET_PATH, autoConnect: false }),
    [],
  )

  const [connected, setConnected] = useState<boolean>(false)
  const [name, setName] = useState<string>('')
  const [roomId, setRoomId] = useState<string>('')
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [view, setView] = useState<GameView | null>(null)

  useEffect(() => {
    socket.connect()
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('rooms', (list) => setRooms(list))
    socket.on('gameView', (v) => setView(v))
    socket.on('chat', (msg) => setMessages((m) => [...m, msg]))
    socket.on('errorMessage', (text) => setError(text))
    return () => {
      socket.disconnect()
    }
  }, [socket])

  function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    socket.emit('joinRoom', { roomId: roomId.trim(), name: name.trim() })
  }

  function sendChat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!chatText.trim()) return
    socket.emit('chat', { text: chatText.trim() })
    setChatText('')
  }

  function returnToLobby() {
    setView(null)
    setMessages([])
  }

  function leaveRoom() {
    socket.emit('leaveRoom')
    returnToLobby()
  }

  function leaveGame() {
    socket.emit('leaveGame')
    returnToLobby()
  }

  const makeCall = (call: { type: CallType; level?: BidLevel; strain?: Strain }) =>
    socket.emit('makeCall', call)
  const playCard = (card: Card) => socket.emit('playCard', { card })

  function body() {
    if (!view) {
      return (
        <Lobby
          connected={connected}
          name={name}
          roomId={roomId}
          rooms={rooms}
          onNameChange={setName}
          onRoomIdChange={setRoomId}
          onJoin={join}
          onSelectRoom={setRoomId}
        />
      )
    }
    switch (view.phase) {
      case 'LOBBY':
        return (
          <RoomReady
            view={view}
            onToggleReady={() => socket.emit('toggleReady')}
            onStartPlay={() => socket.emit('startPlay')}
            onLeave={leaveRoom}
          />
        )
      case 'COUNTDOWN':
        return <Countdown view={view} onLeaveGame={leaveGame} />
      case 'AUCTION':
        return <Auction view={view} onMakeCall={makeCall} />
      case 'PLAY':
        return <Play view={view} onPlayCard={playCard} />
      case 'FROZEN':
        return <Frozen view={view} onLeaveGame={leaveGame} />
      case 'FINISHED':
        return <Finished view={view} onLeaveGame={leaveGame} />
      default:
        return <p>Unknown phase.</p>
    }
  }

  return (
    <main className={styles.app}>
      <h1>Bridge</h1>
      <p>Status: {connected ? 'connected' : 'disconnected'}</p>

      {error && (
        <p className={styles.error}>
          <strong>Error:</strong> {error}
        </p>
      )}

      {body()}
      {view && (
        <Chat messages={messages} chatText={chatText} onChatChange={setChatText} onSend={sendChat} />
      )}
    </main>
  )
}
