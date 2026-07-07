import type { GameView } from '@pseudosafe/shared'
import Auction from './Auction'
import Play from './Play'
import LeaveControls from './LeaveControls'
import styles from './Frozen.module.css'

interface FrozenProps {
  view: GameView
  onLeaveGame: () => void
}

// No-op handlers: the frozen board is read-only, and Auction/Play also receive
// readOnly so no controls render — these are never invoked.
const noop = () => {}

export default function Frozen({ view, onLeaveGame }: FrozenProps) {
  const showPlay = Boolean(view.contract || view.currentTrick || view.completedTricks)
  return (
    <section>
      <h2>Table: {view.roomId}</h2>
      <p className={styles.reason}>
        <strong>{view.frozenReason ?? 'Game frozen.'}</strong>
      </p>
      {showPlay ? (
        <Play view={view} onPlayCard={noop} readOnly />
      ) : (
        <Auction view={view} onMakeCall={noop} readOnly />
      )}
      <LeaveControls onConfirm={onLeaveGame} />
    </section>
  )
}
