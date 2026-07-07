import type { GameView, CallType, BidLevel, Strain, LegalCalls } from '@pseudosafe/shared'
import { handText, callText, strainGlyph, bidKey, STRAIN_ORDER, BID_LEVELS } from '../lib/cards'
import TablePreview from './TablePreview'
import styles from './Auction.module.css'

interface AuctionProps {
  view: GameView
  onMakeCall: (call: { type: CallType; level?: BidLevel; strain?: Strain }) => void
  // In the frozen view the board is shown read-only, with no call controls.
  readOnly?: boolean
}

export default function Auction({ view, onMakeCall, readOnly = false }: AuctionProps) {
  const yourTurn = !readOnly && view.you !== undefined && view.you === view.turn
  const legal: LegalCalls | undefined = view.legalCalls

  return (
    <section>
      <h2>Table: {view.roomId}</h2>
      <p>
        Dealer: {view.dealer} | Turn: {view.turn} | You: {view.you}
      </p>

      <TablePreview view={view} />

      <h3>Your hand</h3>
      <p className={styles.hand}>{view.hand ? handText(view.hand) : '(no hand)'}</p>

      <h3>Auction</h3>
      {view.auction && view.auction.length > 0 ? (
        <ul className={styles.calls}>
          {view.auction.map((c, i) => (
            <li key={i}>
              {c.seat}: {callText(c)}
            </li>
          ))}
        </ul>
      ) : (
        <p>(no calls yet)</p>
      )}

      {yourTurn && legal && (
        <section className={styles.controls}>
          <h3>Your call</h3>
          <p>
            <button onClick={() => onMakeCall({ type: 'PASS' })} disabled={!legal.canPass}>
              Pass
            </button>{' '}
            <button onClick={() => onMakeCall({ type: 'DOUBLE' })} disabled={!legal.canDouble}>
              Double
            </button>{' '}
            <button onClick={() => onMakeCall({ type: 'REDOUBLE' })} disabled={!legal.canRedouble}>
              Redouble
            </button>
          </p>
          <p>Bids:</p>
          <div className={styles.bidGrid}>
            {BID_LEVELS.map((level) => (
              <p key={level}>
                {STRAIN_ORDER.map((strain) => {
                  const disabled =
                    legal.minBid === null ||
                    bidKey(level, strain) < bidKey(legal.minBid.level, legal.minBid.strain)
                  return (
                    <button
                      key={strain}
                      disabled={disabled}
                      onClick={() => onMakeCall({ type: 'BID', level, strain })}
                    >
                      {level}
                      {strainGlyph(strain)}
                    </button>
                  )
                })}
              </p>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
