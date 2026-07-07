// Pure Bridge game engine.
//
// This module has no I/O and no dependencies on the socket layer. It holds the
// full internal `GameState` (including all four hands) and exposes pure-ish
// helpers plus mutating transition functions (`applyCall`, `applyPlay`) that the
// server drives. The server is responsible for redacting `GameState` into the
// per-client `GameView` before emitting.
//
// ---------------------------------------------------------------------------
// Conventions documented here (referenced throughout):
//
// Hand sort order (for display): suits ordered S, H, D, C (spades first), and
//   within a suit ranks descending (A, K, Q, ... 2). This is the standard
//   bridge "fan" order.
//
// Bid-key scheme: each BID maps to an integer key so bids can be compared with a
//   single `>`. Strain index is C=0, D=1, H=2, S=3, NT=4. The key is
//   `level * 5 + strainIndex`. Thus 1C = 1*5+0 = 5 is the lowest bid, and
//   7NT = 7*5+4 = 39 is the highest. A bid is legal iff its key is strictly
//   greater than the last bid's key (or there is no prior bid).
// ---------------------------------------------------------------------------

import type {
  Card,
  Suit,
  Strain,
  Rank,
  Seat,
  Partnership,
  Call,
  CallType,
  BidLevel,
  Contract,
  PlayedCard,
  CompletedTrick,
  LegalCalls,
} from '@pseudosafe/shared'

// ---------------------------------------------------------------------------
// GameState
// ---------------------------------------------------------------------------

export interface GameState {
  dealer: Seat
  turn: Seat
  phase: 'AUCTION' | 'PLAY' | 'FINISHED'
  hands: Record<Seat, Card[]> // full private hands; server redacts before emit
  auction: Call[]
  contract?: Contract
  dummy?: Seat
  dummyRevealed: boolean
  currentTrick: PlayedCard[]
  trickLeader: Seat
  completedTricks: CompletedTrick[]
  tricksWon: { NS: number; EW: number }
  seatOf: Record<Seat, string> // seat -> socketId
  passedOut?: boolean // set true by applyCall on a 4-pass auction
}

// ---------------------------------------------------------------------------
// Constants / small tables
// ---------------------------------------------------------------------------

const SUITS: Suit[] = ['C', 'D', 'H', 'S']
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
const SEATS: Seat[] = ['N', 'E', 'S', 'W']

// Strain index used by the bid-key scheme (see file header).
const STRAIN_INDEX: Record<Strain, number> = {
  C: 0,
  D: 1,
  H: 2,
  S: 3,
  NT: 4,
}

// Display sort: spades first, then hearts, diamonds, clubs.
const SUIT_DISPLAY_ORDER: Record<Suit, number> = {
  S: 0,
  H: 1,
  D: 2,
  C: 3,
}

// ---------------------------------------------------------------------------
// Deck / deal
// ---------------------------------------------------------------------------

/** Build an ordered 52-card deck (4 suits x 13 ranks). */
export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank })
    }
  }
  return deck
}

/**
 * Sort a hand for display: suits S,H,D,C, ranks descending within a suit.
 * Returns a new array; does not mutate the input.
 */
function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const suitDiff = SUIT_DISPLAY_ORDER[a.suit] - SUIT_DISPLAY_ORDER[b.suit]
    if (suitDiff !== 0) return suitDiff
    return b.rank - a.rank // rank descending
  })
}

/**
 * Deal a fresh game. Shuffles a new deck with Fisher–Yates (Math.random is fine
 * here — this is server runtime code), deals 13 cards to each seat, sorts each
 * hand for display, and returns an AUCTION-phase state with the given dealer to
 * call first.
 */
export function dealNewGame(seatOf: Record<Seat, string>, dealer: Seat): GameState {
  const deck = buildDeck()

  // Fisher–Yates shuffle (in place).
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }

  // Deal 13 to each seat in N, E, S, W order.
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] }
  for (let i = 0; i < deck.length; i++) {
    const seat = SEATS[i % 4]
    hands[seat].push(deck[i])
  }
  for (const seat of SEATS) {
    hands[seat] = sortHand(hands[seat])
  }

  return {
    dealer,
    turn: dealer, // dealer calls first
    phase: 'AUCTION',
    hands,
    auction: [],
    contract: undefined,
    dummy: undefined,
    dummyRevealed: false,
    currentTrick: [],
    trickLeader: dealer, // placeholder until play begins
    completedTricks: [],
    tricksWon: { NS: 0, EW: 0 },
    seatOf,
    passedOut: undefined,
  }
}

// ---------------------------------------------------------------------------
// Seat / partnership helpers
// ---------------------------------------------------------------------------

/** Next seat clockwise: N -> E -> S -> W -> N. */
export function nextSeat(seat: Seat): Seat {
  switch (seat) {
    case 'N':
      return 'E'
    case 'E':
      return 'S'
    case 'S':
      return 'W'
    case 'W':
      return 'N'
  }
}

/** Partner across the table: N<->S, E<->W. */
export function partnerOf(seat: Seat): Seat {
  switch (seat) {
    case 'N':
      return 'S'
    case 'S':
      return 'N'
    case 'E':
      return 'W'
    case 'W':
      return 'E'
  }
}

/** Which partnership a seat belongs to. */
export function partnershipOf(seat: Seat): Partnership {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW'
}

/** The opening leader sits to the declarer's left (i.e. the next seat). */
export function openingLeader(declarer: Seat): Seat {
  return nextSeat(declarer)
}

// ---------------------------------------------------------------------------
// Bid keys
// ---------------------------------------------------------------------------

/** Integer key for a bid, per the bid-key scheme (see file header). */
function bidKey(level: BidLevel, strain: Strain): number {
  return level * 5 + STRAIN_INDEX[strain]
}

/** Decompose a bid key back into (level, strain). Inverse of bidKey. */
function bidFromKey(key: number): { level: BidLevel; strain: Strain } {
  const level = Math.floor(key / 5) as BidLevel
  const strainIdx = key % 5
  const strain = (Object.keys(STRAIN_INDEX) as Strain[]).find(
    (s) => STRAIN_INDEX[s] === strainIdx,
  )!
  return { level, strain }
}

/** The highest possible bid key: 7NT. */
const MAX_BID_KEY = bidKey(7, 'NT')

/** Return the last BID call in the auction, or undefined if none has been made. */
function lastBid(auction: Call[]): Call | undefined {
  for (let i = auction.length - 1; i >= 0; i--) {
    if (auction[i].type === 'BID') return auction[i]
  }
  return undefined
}

/**
 * Return the last non-PASS call in the auction, or undefined if none. Used to
 * evaluate double/redouble legality.
 */
function lastNonPass(auction: Call[]): Call | undefined {
  for (let i = auction.length - 1; i >= 0; i--) {
    if (auction[i].type !== 'PASS') return auction[i]
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Auction legality
// ---------------------------------------------------------------------------

/**
 * Compute the legal calls available to the seat currently on turn.
 * Mirrors isCallLegal for each call type.
 */
export function legalCalls(state: GameState): LegalCalls {
  const turn = state.turn

  // PASS is always legal during the auction.
  const canPass = true

  // DOUBLE / REDOUBLE depend on the last non-PASS call.
  const lnp = lastNonPass(state.auction)

  let canDouble = false
  let canRedouble = false
  if (lnp) {
    const opponent = partnershipOf(lnp.seat) !== partnershipOf(turn)
    if (lnp.type === 'BID' && opponent) {
      // Doubling an opponent's undoubled bid.
      canDouble = true
    } else if (lnp.type === 'DOUBLE' && opponent) {
      // Redoubling an opponent's double (the current contract is doubled).
      canRedouble = true
    }
  }

  // Minimum legal bid: the smallest key strictly greater than the last bid, or
  // 1C if there is no prior bid. null once 7NT has been bid.
  const lb = lastBid(state.auction)
  let minBid: { level: BidLevel; strain: Strain } | null
  if (!lb) {
    minBid = { level: 1, strain: 'C' }
  } else {
    const nextKey = bidKey(lb.level!, lb.strain!) + 1
    minBid = nextKey > MAX_BID_KEY ? null : bidFromKey(nextKey)
  }

  return { canPass, canDouble, canRedouble, minBid }
}

/**
 * Validate a proposed call against the current auction state (relative to
 * state.turn). Does not mutate state.
 */
export function isCallLegal(
  state: GameState,
  call: { type: CallType; level?: BidLevel; strain?: Strain },
): boolean {
  if (state.phase !== 'AUCTION') return false

  const turn = state.turn
  const lnp = lastNonPass(state.auction)

  switch (call.type) {
    case 'PASS':
      return true

    case 'DOUBLE': {
      // Legal iff the last non-PASS call was an opponent's BID (not already
      // doubled/redoubled).
      if (!lnp) return false
      const opponent = partnershipOf(lnp.seat) !== partnershipOf(turn)
      return lnp.type === 'BID' && opponent
    }

    case 'REDOUBLE': {
      // Legal iff the last non-PASS call was an opponent's DOUBLE.
      if (!lnp) return false
      const opponent = partnershipOf(lnp.seat) !== partnershipOf(turn)
      return lnp.type === 'DOUBLE' && opponent
    }

    case 'BID': {
      if (call.level === undefined || call.strain === undefined) return false
      const lb = lastBid(state.auction)
      const key = bidKey(call.level, call.strain)
      if (key > MAX_BID_KEY) return false
      if (!lb) return true // any bid legal if none prior
      return key > bidKey(lb.level!, lb.strain!)
    }

    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Applying a call
// ---------------------------------------------------------------------------

/**
 * Determine whether the auction has ended in the standard way: three
 * consecutive PASS calls following at least one BID.
 */
function auctionEndedByThreePasses(auction: Call[]): boolean {
  if (auction.length < 4) return false // need >= 1 bid + 3 passes
  const anyBid = auction.some((c) => c.type === 'BID')
  if (!anyBid) return false
  const last3 = auction.slice(-3)
  return last3.length === 3 && last3.every((c) => c.type === 'PASS')
}

/** Whether the auction is four PASSes from the very start (a pass-out). */
function auctionPassedOut(auction: Call[]): boolean {
  return auction.length === 4 && auction.every((c) => c.type === 'PASS')
}

/**
 * Apply a call for the seat currently on turn. Assumes the caller has already
 * validated legality (the server does). Mutates and returns the same state.
 */
export function applyCall(
  state: GameState,
  call: { type: CallType; level?: BidLevel; strain?: Strain },
): GameState {
  const seat = state.turn

  // Record the call, stamped with the acting seat.
  const recorded: Call = {
    seat,
    type: call.type,
    ...(call.type === 'BID' ? { level: call.level, strain: call.strain } : {}),
  }
  state.auction.push(recorded)

  // Advance the turn immediately.
  state.turn = nextSeat(seat)

  if (auctionEndedByThreePasses(state.auction)) {
    // Auction closed with a contract. Transition to PLAY.
    const contract = determineContract(state.auction)
    state.contract = contract
    state.dummy = partnerOf(contract.declarer)
    state.trickLeader = openingLeader(contract.declarer)
    state.turn = state.trickLeader
    state.dummyRevealed = false
    state.currentTrick = []
    state.phase = 'PLAY'
  } else if (auctionPassedOut(state.auction)) {
    // Four passes and no bid: the deal is passed out. Leave phase in AUCTION;
    // the server observes passedOut and redeals.
    state.passedOut = true
  }
  // Otherwise the auction continues; turn has already advanced.

  return state
}

// ---------------------------------------------------------------------------
// Contract determination
// ---------------------------------------------------------------------------

/**
 * Derive the final contract from a completed auction.
 *
 * Level/strain come from the last BID. The doubled state is found by scanning
 * calls *after* that last bid for DOUBLE / REDOUBLE.
 *
 * The declarer is NOT simply the last bidder: it is the FIRST member of the
 * winning partnership to have named the winning STRAIN anywhere in the auction.
 * We scan the auction in order and take the first BID whose strain matches the
 * winning strain and whose seat is in the winning partnership.
 */
export function determineContract(auction: Call[]): Contract {
  const lb = lastBid(auction)
  // Precondition: a valid finished auction always has a last bid here.
  if (!lb) {
    throw new Error('determineContract called on an auction with no bid')
  }

  const level = lb.level!
  const strain = lb.strain!
  const winningPartnership = partnershipOf(lb.seat)

  // Doubled state: scan for DOUBLE/REDOUBLE occurring after the last bid.
  const lastBidIndex = auction.lastIndexOf(lb)
  let doubled: 'NONE' | 'DOUBLED' | 'REDOUBLED' = 'NONE'
  for (let i = lastBidIndex + 1; i < auction.length; i++) {
    if (auction[i].type === 'DOUBLE') doubled = 'DOUBLED'
    else if (auction[i].type === 'REDOUBLE') doubled = 'REDOUBLED'
  }

  // Declarer: first seat of the winning partnership to have bid this strain.
  let declarer: Seat | undefined
  for (const c of auction) {
    if (
      c.type === 'BID' &&
      c.strain === strain &&
      partnershipOf(c.seat) === winningPartnership
    ) {
      declarer = c.seat
      break
    }
  }
  // Fallback (should not happen): the last bidder is at worst the declarer.
  if (!declarer) declarer = lb.seat

  return { level, strain, declarer, doubled }
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

/** Whether `hand` contains the exact card (matching suit and rank). */
function handHasCard(hand: Card[], card: Card): boolean {
  return hand.some((c) => c.suit === card.suit && c.rank === card.rank)
}

/**
 * Validate a proposed card play. Does not mutate state.
 * - Must be the PLAY phase.
 * - It must be `seat`'s turn.
 * - `seat` must hold the exact card.
 * - Must follow the led suit if able (a card of the led suit remains in hand).
 */
export function isPlayLegal(state: GameState, seat: Seat, card: Card): boolean {
  if (state.phase !== 'PLAY') return false
  if (seat !== state.turn) return false

  const hand = state.hands[seat]
  if (!handHasCard(hand, card)) return false

  // Must follow suit if a card was already led and the seat can follow.
  if (state.currentTrick.length > 0) {
    const ledSuit = state.currentTrick[0].card.suit
    if (card.suit !== ledSuit) {
      const canFollow = hand.some((c) => c.suit === ledSuit)
      if (canFollow) return false
    }
  }

  return true
}

/**
 * Play the given card for the seat currently on turn. Assumes legality has been
 * validated by the caller. Mutates and returns the same state.
 */
export function applyPlay(state: GameState, card: Card): GameState {
  const seat = state.turn
  const hand = state.hands[seat]

  // Remove the exact card from the hand.
  const idx = hand.findIndex((c) => c.suit === card.suit && c.rank === card.rank)
  if (idx !== -1) hand.splice(idx, 1)

  // Add to the current trick.
  state.currentTrick.push({ seat, card })

  // Opening lead reveals dummy: the very first card of the very first trick.
  if (state.completedTricks.length === 0 && state.currentTrick.length === 1) {
    state.dummyRevealed = true
  }

  if (state.currentTrick.length === 4) {
    // Trick complete: resolve the winner.
    const trump = state.contract!.strain
    const winner = trickWinner(state.currentTrick, trump)

    const completed: CompletedTrick = {
      cards: [...state.currentTrick],
      winner,
      leader: state.trickLeader,
    }
    state.completedTricks.push(completed)
    state.tricksWon[partnershipOf(winner)]++

    // Winner leads the next trick.
    state.currentTrick = []
    state.trickLeader = winner
    state.turn = winner

    if (state.completedTricks.length === 13) {
      state.phase = 'FINISHED'
    }
  } else {
    // Trick continues clockwise.
    state.turn = nextSeat(seat)
  }

  return state
}

/**
 * Determine which seat wins a trick.
 * - The led suit is the suit of the first card played.
 * - If there is a trump suit (trump !== 'NT') and any trump was played, the
 *   highest trump wins.
 * - Otherwise the highest card of the led suit wins.
 */
export function trickWinner(cards: PlayedCard[], trump: Strain): Seat {
  const ledSuit = cards[0].card.suit

  // If trumps were played (in a suit contract), highest trump wins.
  if (trump !== 'NT') {
    const trumps = cards.filter((pc) => pc.card.suit === trump)
    if (trumps.length > 0) {
      let best = trumps[0]
      for (const pc of trumps) {
        if (pc.card.rank > best.card.rank) best = pc
      }
      return best.seat
    }
  }

  // Otherwise highest card of the led suit wins.
  const followers = cards.filter((pc) => pc.card.suit === ledSuit)
  let best = followers[0]
  for (const pc of followers) {
    if (pc.card.rank > best.card.rank) best = pc
  }
  return best.seat
}
