// Pure rendering helpers shared across the bridge components. No styling here —
// just text/format utilities for cards, calls, and seats.
import type { Card, Suit, Strain, BidLevel, Call, Contract, Seat } from '@pseudosafe/shared'

export const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
// Order suits are displayed in a hand: spades, hearts, diamonds, clubs.
export const SUIT_ORDER: Suit[] = ['S', 'H', 'D', 'C']
// Strain ordering for bidding comparisons: C < D < H < S < NT.
export const STRAIN_ORDER: Strain[] = ['C', 'D', 'H', 'S', 'NT']
export const BID_LEVELS: BidLevel[] = [1, 2, 3, 4, 5, 6, 7]
export const SEATS_CLOCKWISE: Seat[] = ['N', 'E', 'S', 'W']

export function strainGlyph(strain: Strain): string {
  return strain === 'NT' ? 'NT' : SUIT_GLYPH[strain]
}

export function rankText(rank: number): string {
  switch (rank) {
    case 14:
      return 'A'
    case 13:
      return 'K'
    case 12:
      return 'Q'
    case 11:
      return 'J'
    default:
      return String(rank)
  }
}

export function cardText(card: Card): string {
  return `${SUIT_GLYPH[card.suit]}${rankText(card.rank)}`
}

export function callText(call: Call): string {
  switch (call.type) {
    case 'PASS':
      return 'Pass'
    case 'DOUBLE':
      return 'X'
    case 'REDOUBLE':
      return 'XX'
    case 'BID':
      return call.level !== undefined && call.strain !== undefined
        ? `${call.level}${strainGlyph(call.strain)}`
        : '?'
    default:
      return '?'
  }
}

// Render a hand as text grouped by suit, e.g. "♠ A K 5   ♥ Q 7   ♦ 10 4".
export function handText(cards: Card[]): string {
  const parts: string[] = []
  for (const suit of SUIT_ORDER) {
    const ranks = cards
      .filter((c) => c.suit === suit)
      .sort((a, b) => b.rank - a.rank)
      .map((c) => rankText(c.rank))
    if (ranks.length > 0) {
      parts.push(`${SUIT_GLYPH[suit]} ${ranks.join(' ')}`)
    }
  }
  return parts.length > 0 ? parts.join('   ') : '(void)'
}

export function bidKey(level: BidLevel, strain: Strain): number {
  return level * 5 + STRAIN_ORDER.indexOf(strain)
}

export function doubledSuffix(doubled: Contract['doubled']): string {
  if (doubled === 'DOUBLED') return ' X'
  if (doubled === 'REDOUBLED') return ' XX'
  return ''
}

export function seatDir(seat: Seat): string {
  switch (seat) {
    case 'N':
      return 'North'
    case 'E':
      return 'East'
    case 'S':
      return 'South'
    case 'W':
      return 'West'
  }
}
