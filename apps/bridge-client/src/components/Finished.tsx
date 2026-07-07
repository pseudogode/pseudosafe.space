import type { GameView } from '@pseudosafe/shared'
import LeaveControls from './LeaveControls'
import { strainGlyph } from '../lib/cards'
import styles from './Finished.module.css'

interface FinishedProps {
  view: GameView
  onLeaveGame: () => void
}

export default function Finished({ view, onLeaveGame }: FinishedProps) {
  const result = view.result
  const tricksWon = view.tricksWon
  return (
    <section>
      <h2>Table: {view.roomId}</h2>
      <h3>Result</h3>
      {result ? (
        <p className={styles.result}>
          {result.contract.level}
          {strainGlyph(result.contract.strain)} by {result.contract.declarer} &mdash;{' '}
          {result.made ? 'MADE' : 'DOWN'} ({result.declarerTricks} tricks)
        </p>
      ) : (
        <p>(no result)</p>
      )}
      <p>
        Final: NS {tricksWon ? tricksWon.NS : 0} &mdash; EW {tricksWon ? tricksWon.EW : 0}
      </p>
      <LeaveControls onConfirm={onLeaveGame} />
    </section>
  )
}
