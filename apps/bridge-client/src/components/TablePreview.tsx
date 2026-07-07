import type { GameView, Seat } from '@pseudosafe/shared'
import { handText, cardText, callText, strainGlyph, seatDir, SEATS_CLOCKWISE } from '../lib/cards'
import styles from './TablePreview.module.css'

// One seat's box on the table: direction (bold if it's you), name, a turn
// arrow, and the hand — your real cards, the revealed dummy, or a face-down
// count for everyone else.
function SeatCell({ view, seat }: { view: GameView; seat: Seat }) {
  const player = view.players.find((p) => p.seat === seat)
  const isYou = view.you === seat
  const isTurn = view.turn === seat
  const count = view.handCounts ? view.handCounts[seat] : undefined
  const isDummy = view.dummy === seat && !!view.dummyHand

  let handLine = ''
  if (isYou && view.hand) {
    handLine = handText(view.hand)
  } else if (isDummy && view.dummyHand) {
    handLine = handText(view.dummyHand)
  } else if (count !== undefined) {
    // Hidden hand: a face-down card box with the remaining count.
    handLine = `🂠 ×${count}`
  }

  return (
    <div className={isTurn ? `${styles.seat} ${styles.seatTurn}` : styles.seat}>
      <div>
        {isTurn ? '▶ ' : ''}
        {isYou ? <strong>{seatDir(seat)} (you)</strong> : seatDir(seat)}
        {isDummy ? ' — dummy' : ''}
      </div>
      <div>{player ? player.name : '—'}</div>
      <div className={styles.hand}>{handLine}</div>
    </div>
  )
}

// Bidding progress as an N/E/S/W column grid, rows advancing clockwise.
function AuctionGrid({ view }: { view: GameView }) {
  if (!view.auction || view.auction.length === 0) return <p>(no calls yet)</p>

  const rows: Array<Partial<Record<Seat, string>>> = []
  let current: Partial<Record<Seat, string>> = {}
  let started = false
  for (const call of view.auction) {
    // A new row starts each time the bidding comes back around to North.
    if (call.seat === 'N' && started) {
      rows.push(current)
      current = {}
    }
    current[call.seat] = callText(call)
    started = true
  }
  rows.push(current)

  return (
    <table className={styles.auction}>
      <thead>
        <tr>
          {SEATS_CLOCKWISE.map((s) => (
            <th key={s}>{s}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {SEATS_CLOCKWISE.map((s) => (
              <td key={s}>{row[s] ?? ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// The whole table box: seats around a center, plus bidding progress.
export default function TablePreview({ view }: { view: GameView }) {
  const spacer = <div />

  let center: React.ReactNode
  if (view.currentTrick && view.currentTrick.length > 0) {
    center = (
      <div>
        <div>Trick</div>
        {view.currentTrick.map((pc, i) => (
          <div key={i}>
            {pc.seat}: {cardText(pc.card)}
          </div>
        ))}
      </div>
    )
  } else if (view.contract) {
    center = (
      <div>
        {view.contract.level}
        {strainGlyph(view.contract.strain)} by {view.contract.declarer}
      </div>
    )
  } else {
    center = <div>Bidding</div>
  }

  return (
    <div className={styles.table}>
      <div className={styles.grid}>
        {spacer}
        <SeatCell view={view} seat="N" />
        {spacer}
        <SeatCell view={view} seat="W" />
        <div className={styles.center}>{center}</div>
        <SeatCell view={view} seat="E" />
        {spacer}
        <SeatCell view={view} seat="S" />
        {spacer}
      </div>
      <div className={styles.bidding}>
        <div>Bidding progress</div>
        <AuctionGrid view={view} />
      </div>
    </div>
  )
}
