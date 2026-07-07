import type { GameView } from '@pseudosafe/shared'
import LeaveControls from './LeaveControls'
import styles from './Countdown.module.css'

interface CountdownProps {
  view: GameView
  onLeaveGame: () => void
}

export default function Countdown({ view, onLeaveGame }: CountdownProps) {
  const seated = view.players.filter((p) => p.seat !== undefined)
  return (
    <section>
      <h2>Table: {view.roomId}</h2>
      <p className={styles.countdown}>Starting in {view.countdown}&hellip;</p>
      {seated.length > 0 && (
        <ul className={styles.seats}>
          {seated.map((p) => (
            <li key={p.id}>
              {p.seat}: {p.name}
            </li>
          ))}
        </ul>
      )}
      <LeaveControls onConfirm={onLeaveGame} />
    </section>
  )
}
