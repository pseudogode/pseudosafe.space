// Shared Socket.IO event/payload contracts between bridge-server and
// bridge-client. Type-only: there is no runtime output, so consumers import
// these with `import type` and the imports are erased at build time. This keeps
// the two ends of the socket protocol from drifting apart.

// ============================================================================
// Lobby (v1)
// ============================================================================

export interface RoomSummary {
  roomId: string
  count: number
}

export interface Player {
  id: string
  name: string
}

export interface RoomState {
  roomId: string
  players: Player[]
}

export interface ChatMessage {
  name: string
  text: string
  ts: number
}

// ============================================================================
// Bridge game (v2)
// ============================================================================

// ---------- Cards ----------
// Strain ordering for bidding: clubs < diamonds < hearts < spades < notrump.
export type Suit = 'C' | 'D' | 'H' | 'S'
export type Strain = Suit | 'NT'
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14
// 11=J, 12=Q, 13=K, 14=A. Numeric so rank comparison in play is trivial.

export interface Card {
  suit: Suit
  rank: Rank
}

// ---------- Seats / partnerships ----------
// Partnerships: N-S vs E-W. Clockwise turn rotation: N -> E -> S -> W -> N.
export type Seat = 'N' | 'E' | 'S' | 'W'
export type Partnership = 'NS' | 'EW'

// ---------- Phases ----------
export type Phase =
  | 'LOBBY' // in room, toggling ready (pre-game)
  | 'COUNTDOWN' // Play pressed; ready locked; server ticking down
  | 'AUCTION' // bidding
  | 'PLAY' // card play
  | 'FROZEN' // someone left mid-game; read-only
  | 'FINISHED' // 13 tricks done (or passed-out handled)

// ---------- Calls (auction) ----------
export type CallType = 'PASS' | 'BID' | 'DOUBLE' | 'REDOUBLE'
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7

// A single entry in the auction history. `level`/`strain` present only when
// type === 'BID'.
export interface Call {
  seat: Seat
  type: CallType
  level?: BidLevel
  strain?: Strain
}

// ---------- Play ----------
export interface PlayedCard {
  seat: Seat
  card: Card
}

// A completed trick (4 cards) plus who led and who won it.
export interface CompletedTrick {
  cards: PlayedCard[] // in play order, length 4
  winner: Seat
  leader: Seat
}

export interface Contract {
  level: BidLevel
  strain: Strain
  declarer: Seat
  doubled: 'NONE' | 'DOUBLED' | 'REDOUBLED'
}

// ---------- Room player (lobby Player + ready + seat) ----------
export interface RoomPlayer {
  id: string
  name: string
  ready: boolean
  seat?: Seat // assigned only from COUNTDOWN onward
}

// Legal-call descriptor sent only to the seat on turn, so the client can render
// exactly which buttons to enable. Server still re-validates on receipt.
export interface LegalCalls {
  canPass: boolean
  canDouble: boolean
  canRedouble: boolean
  // Minimum legal bid; all (level,strain) >= this are legal. null if none.
  minBid: { level: BidLevel; strain: Strain } | null
}

// ---------- The authoritative, PER-CLIENT view the server pushes ----------
// The server holds full internal state; this is the redacted projection sent to
// one specific socket. A player only ever sees their own hand (and dummy's,
// once revealed).
export interface GameView {
  roomId: string
  phase: Phase
  players: RoomPlayer[] // all four (or fewer, pre-game), with ready flags
  you?: Seat // recipient's own seat, if seated

  // COUNTDOWN
  countdown?: number // whole seconds remaining

  // From AUCTION onward
  dealer?: Seat
  turn?: Seat // whose action the server is waiting for (AUCTION/PLAY)
  vulnerability?: 'NONE' // [SIMPLIFICATION] always NONE in v2; reserved

  // Hands: recipient always sees own hand. Dummy's hand is included for ALL
  // clients only after the opening lead. Others' hands are never sent.
  hand?: Card[] // recipient's own remaining cards
  handCounts?: Record<Seat, number> // cards still held per seat (public)
  dummy?: Seat // set once dummy is revealed (after opening lead)
  dummyHand?: Card[] // present only when dummy revealed

  // AUCTION
  auction?: Call[] // full public history
  legalCalls?: LegalCalls // computed for `turn` seat; sent only to that seat

  // PLAY
  contract?: Contract
  currentTrick?: PlayedCard[] // cards played so far this trick (public)
  trickLeader?: Seat
  completedTricks?: CompletedTrick[] // full history (public)
  tricksWon?: Record<Partnership, number>

  // FINISHED
  result?: {
    made: boolean // did the declaring side make the contract?
    declarerTricks: number // tricks won by the declaring side
    contract: Contract
  }

  // FROZEN
  frozenReason?: string // e.g. "West (Bob) left the game."
}

// ============================================================================
// Events
// ============================================================================

export interface ClientToServerEvents {
  listRooms: () => void
  joinRoom: (p: { roomId: string; name: string }) => void
  chat: (p: { text: string }) => void
  leaveRoom: () => void // lobby leave (pre-game)

  // v2:
  toggleReady: () => void // flip own ready flag (LOBBY only)
  startPlay: () => void // any player; valid only if 4 players all ready
  makeCall: (c: { type: CallType; level?: BidLevel; strain?: Strain }) => void
  playCard: (c: { card: Card }) => void
  leaveGame: () => void // leave from within a running/frozen/finished game
}

export interface ServerToClientEvents {
  rooms: (rooms: RoomSummary[]) => void
  roomState: (state: RoomState) => void // legacy lobby-count view (pre-join)
  chat: (msg: ChatMessage) => void
  errorMessage: (text: string) => void

  // v2: the single authoritative push for everything post-join.
  gameView: (view: GameView) => void
}

export interface SocketData {
  roomId?: string
}
