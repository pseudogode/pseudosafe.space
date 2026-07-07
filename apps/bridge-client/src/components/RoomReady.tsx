import type { GameView, RoomPlayer } from '@pseudosafe/shared'
import styles from './RoomReady.module.css'

interface RoomReadyProps {
  view: GameView
  onToggleReady: () => void
  onStartPlay: () => void
  onLeave: () => void
}

export default function RoomReady({ view, onToggleReady, onStartPlay, onLeave }: RoomReadyProps) {
  const canPlay = view.players.length === 4 && view.players.every((p) => p.ready)
  return (
    <section>
      <h2>Table: {view.roomId}</h2>
      <h3>Players ({view.players.length}/4)</h3>
      <ul className={styles.players}>
        {view.players.map((p: RoomPlayer) => (
          <li key={p.id} className={p.ready ? styles.ready : styles.notReady}>
            {p.name} &mdash; {p.ready ? '[READY]' : '[not ready]'}
          </li>
        ))}
      </ul>
      <p>
        <button onClick={onToggleReady}>Toggle ready</button>{' '}
        <button onClick={onStartPlay} disabled={!canPlay}>
          Play
        </button>{' '}
        <button onClick={onLeave}>Leave</button>
      </p>
    </section>
  )
}
