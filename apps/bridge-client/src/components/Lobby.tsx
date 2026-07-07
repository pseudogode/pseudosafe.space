import type { RoomSummary } from '@pseudosafe/shared'
import styles from './Lobby.module.css'

interface LobbyProps {
  connected: boolean
  name: string
  roomId: string
  rooms: RoomSummary[]
  onNameChange: (value: string) => void
  onRoomIdChange: (value: string) => void
  onJoin: (e: React.FormEvent<HTMLFormElement>) => void
  onSelectRoom: (id: string) => void
}

export default function Lobby(props: LobbyProps) {
  const { connected, name, roomId, rooms, onNameChange, onRoomIdChange, onJoin, onSelectRoom } = props
  return (
    <section className={styles.lobby}>
      <h2>Join a table</h2>
      <form onSubmit={onJoin}>
        <p>
          <label>
            Name:{' '}
            <input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Room:{' '}
            <input
              value={roomId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onRoomIdChange(e.target.value)}
            />
          </label>
        </p>
        <button type="submit" disabled={!connected}>
          Join
        </button>
      </form>

      <h3>Open rooms</h3>
      {rooms.length === 0 ? (
        <p>No rooms yet. Create one by joining a room name above.</p>
      ) : (
        <ul className={styles.rooms}>
          {rooms.map((r) => (
            <li key={r.roomId}>
              <button onClick={() => onSelectRoom(r.roomId)}>
                {r.roomId} ({r.count}/4)
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
