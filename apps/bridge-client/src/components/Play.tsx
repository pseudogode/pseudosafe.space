import type { GameView, Card, Suit, Contract, PlayedCard } from '@pseudosafe/shared'
import { handText, cardText, strainGlyph, doubledSuffix, rankText, SUIT_GLYPH, SUIT_ORDER } from '../lib/cards'
import TablePreview from './TablePreview'
import styles from './Play.module.css'

interface PlayProps {
  view: GameView
  onPlayCard: (card: Card) => void
  // In the frozen view the board is shown read-only, with no clickable cards.
  readOnly?: boolean
}

export default function Play({ view, onPlayCard, readOnly = false }: PlayProps) {
  const contract: Contract | undefined = view.contract
  const tricksWon = view.tricksWon
  const currentTrick: PlayedCard[] = view.currentTrick ?? []
  const completedCount = view.completedTricks ? view.completedTricks.length : 0

  // Led suit of the current trick (first card played), if any.
  const ledSuit: Suit | undefined = currentTrick.length > 0 ? currentTrick[0].card.suit : undefined

  const declarer = view.contract?.declarer
  const youAreDummy = view.you !== undefined && view.you === view.dummy

  // You play your own hand on your turn — unless you are the dummy, who never
  // plays once the hand is down (the declarer plays it instead).
  const controllingOwnHand =
    !readOnly && view.you !== undefined && view.you === view.turn && !youAreDummy

  // Bridge rule: the declarer plays the dummy's hand when it's the dummy's turn.
  const controllingDummy =
    !readOnly &&
    declarer !== undefined &&
    view.dummy !== undefined &&
    view.you === declarer &&
    view.turn === view.dummy

  function canPlayFrom(hand: Card[], card: Card): boolean {
    // Follow suit: if a suit was led and this hand holds it, only that suit is playable.
    if (ledSuit !== undefined && card.suit !== ledSuit) {
      const hasLed = hand.some((c) => c.suit === ledSuit)
      if (hasLed) return false
    }
    return true
  }

  function renderPlayableHand(hand: Card[]) {
    const parts: React.ReactNode[] = []
    for (const suit of SUIT_ORDER) {
      const inSuit = hand.filter((c) => c.suit === suit).sort((a, b) => b.rank - a.rank)
      if (inSuit.length === 0) continue
      parts.push(
        <span key={suit} className={styles.suitGroup}>
          {SUIT_GLYPH[suit]}{' '}
          {inSuit.map((card) => (
            <button
              key={`${card.suit}${card.rank}`}
              disabled={!canPlayFrom(hand, card)}
              onClick={() => onPlayCard(card)}
            >
              {rankText(card.rank)}
            </button>
          ))}
        </span>,
      )
    }
    return <p>{parts}</p>
  }

  return (
    <section>
      <h2>Table: {view.roomId}</h2>
      {contract ? (
        <p>
          Contract: {contract.level}
          {strainGlyph(contract.strain)} by {contract.declarer}
          {doubledSuffix(contract.doubled)} | NS {tricksWon ? tricksWon.NS : 0} &mdash; EW{' '}
          {tricksWon ? tricksWon.EW : 0} | Turn: {view.turn}
        </p>
      ) : (
        <p>Turn: {view.turn}</p>
      )}

      <TablePreview view={view} />

      {/* The dummy's own hand IS the dummy shown below once it's down, so we
          don't repeat it as "Your hand" for the dummy player. */}
      {!(youAreDummy && view.dummyHand) && (
        <>
          <h3>Your hand{view.you ? ` (${view.you})` : ''}</h3>
          {view.hand ? (
            controllingOwnHand ? (
              renderPlayableHand(view.hand)
            ) : (
              <p className={styles.hand}>{handText(view.hand)}</p>
            )
          ) : (
            <p>(no hand)</p>
          )}
        </>
      )}

      {view.dummy && view.dummyHand && (
        <>
          <h3>
            Dummy ({view.dummy}){controllingDummy ? ' — you play this hand' : ''}
          </h3>
          {controllingDummy ? (
            renderPlayableHand(view.dummyHand)
          ) : (
            <p className={styles.hand}>{handText(view.dummyHand)}</p>
          )}
        </>
      )}

      <h3>Current trick</h3>
      {currentTrick.length > 0 ? (
        <ul className={styles.trick}>
          {currentTrick.map((pc, i) => (
            <li key={i}>
              {pc.seat}: {cardText(pc.card)}
            </li>
          ))}
        </ul>
      ) : (
        <p>(no cards played yet)</p>
      )}
      <p>Tricks played: {completedCount}</p>
    </section>
  )
}
