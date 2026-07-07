import { useEffect, useMemo, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  RoomSummary,
  ChatMessage,
  ServerToClientEvents,
  ClientToServerEvents,
  GameView,
  Card,
  Suit,
  Strain,
  CallType,
  BidLevel,
  Call,
  PlayedCard,
  LegalCalls,
  Contract,
  RoomPlayer,
} from '@pseudosafe/shared'

// In production the bridge server sits behind the reverse proxy at the same
// origin, reachable under the /bridge-api path. In dev, point at :3002.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined // same-origin
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || '/bridge-api/socket.io'

// ---------------------------------------------------------------------------
// Rendering helpers (pure, plain text)
// ---------------------------------------------------------------------------

const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
// Order suits are displayed in a hand: spades, hearts, diamonds, clubs.
const SUIT_ORDER: Suit[] = ['S', 'H', 'D', 'C']
// Strain ordering for bidding comparisons: C < D < H < S < NT.
const STRAIN_ORDER: Strain[] = ['C', 'D', 'H', 'S', 'NT']
const BID_LEVELS: BidLevel[] = [1, 2, 3, 4, 5, 6, 7]

function strainGlyph(strain: Strain): string {
  return strain === 'NT' ? 'NT' : SUIT_GLYPH[strain]
}

function rankText(rank: number): string {
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

function cardText(card: Card): string {
  return `${SUIT_GLYPH[card.suit]}${rankText(card.rank)}`
}

function callText(call: Call): string {
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

// Render a hand as text grouped by suit, e.g.
//   ♠ A K 5   ♥ Q 7   ♦ 10 4   ♣ J 9 3
function handText(cards: Card[]): string {
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

function bidKey(level: BidLevel, strain: Strain): number {
  return level * 5 + STRAIN_ORDER.indexOf(strain)
}

function doubledSuffix(doubled: Contract['doubled']): string {
  if (doubled === 'DOUBLED') return ' X'
  if (doubled === 'REDOUBLED') return ' XX'
  return ''
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const socket = useMemo<Socket<ServerToClientEvents, ClientToServerEvents>>(
    () => io(SOCKET_URL, { path: SOCKET_PATH, autoConnect: false }),
    [],
  )

  const [connected, setConnected] = useState<boolean>(false)
  const [name, setName] = useState<string>('')
  const [roomId, setRoomId] = useState<string>('')
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [view, setView] = useState<GameView | null>(null)
  const [confirmingLeave, setConfirmingLeave] = useState<boolean>(false)

  useEffect(() => {
    socket.connect()
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('rooms', (list: RoomSummary[]) => setRooms(list))
    socket.on('gameView', (v: GameView) => setView(v))
    socket.on('chat', (msg: ChatMessage) => setMessages((m) => [...m, msg]))
    socket.on('errorMessage', (text: string) => setError(text))
    return () => {
      socket.disconnect()
    }
  }, [socket])

  function joinRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    socket.emit('joinRoom', { roomId: roomId.trim(), name: name.trim() })
  }

  function sendChat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!chatText.trim()) return
    socket.emit('chat', { text: chatText.trim() })
    setChatText('')
  }

  // Return to the lobby list. Used after leaving a room/game.
  function returnToLobby() {
    setView(null)
    setMessages([])
    setConfirmingLeave(false)
  }

  function leaveRoomFromLobbyPhase() {
    socket.emit('leaveRoom')
    returnToLobby()
  }

  function leaveGame() {
    socket.emit('leaveGame')
    returnToLobby()
  }

  // -------------------------------------------------------------------------
  // Chat box, reused across all in-room phases.
  // -------------------------------------------------------------------------
  function renderChat() {
    return (
      <section>
        <h3>Chat</h3>
        <ul>
          {messages.map((m, i) => (
            <li key={i}>
              <strong>{m.name}:</strong> {m.text}
            </li>
          ))}
        </ul>
        <form onSubmit={sendChat}>
          <input
            value={chatText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChatText(e.target.value)}
          />
          <button type="submit">Send</button>
        </form>
      </section>
    )
  }

  // -------------------------------------------------------------------------
  // Leave controls with confirmation.
  // -------------------------------------------------------------------------
  function renderLeaveControls(onConfirm: () => void) {
    if (confirmingLeave) {
      return (
        <p>
          Leave game?{' '}
          <button onClick={onConfirm}>Yes</button>{' '}
          <button onClick={() => setConfirmingLeave(false)}>No</button>
        </p>
      )
    }
    return (
      <p>
        <button onClick={() => setConfirmingLeave(true)}>Leave</button>
      </p>
    )
  }

  // =========================================================================
  // LOBBY LIST (no view yet)
  // =========================================================================
  if (!view) {
    return (
      <main>
        <h1>Bridge Lobby</h1>
        <p>Status: {connected ? 'connected' : 'disconnected'}</p>
        <p>
          <a href="/">&larr; back to portal</a>
        </p>

        {error && (
          <p>
            <strong>Error:</strong> {error}
          </p>
        )}

        <section>
          <h2>Join a table</h2>
          <form onSubmit={joinRoom}>
            <p>
              <label>
                Name:{' '}
                <input
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                />
              </label>
            </p>
            <p>
              <label>
                Room:{' '}
                <input
                  value={roomId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoomId(e.target.value)}
                />
              </label>
            </p>
            <button type="submit" disabled={!connected}>
              Join
            </button>
          </form>

          <h3>Open rooms</h3>
          {rooms.length === 0 ? (
            <p>No rooms yet. Create one by joining a room name above.</p>
          ) : (
            <ul>
              {rooms.map((r) => (
                <li key={r.roomId}>
                  <button onClick={() => setRoomId(r.roomId)}>
                    {r.roomId} ({r.count}/4)
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    )
  }

  // =========================================================================
  // In-room phase views
  // =========================================================================

  function renderRoomReady(v: GameView) {
    const canPlay = v.players.length === 4 && v.players.every((p) => p.ready)
    return (
      <section>
        <h2>Table: {v.roomId}</h2>
        <h3>Players ({v.players.length}/4)</h3>
        <ul>
          {v.players.map((p: RoomPlayer) => (
            <li key={p.id}>
              {p.name} &mdash; {p.ready ? '[READY]' : '[not ready]'}
            </li>
          ))}
        </ul>
        <p>
          <button onClick={() => socket.emit('toggleReady')}>Toggle ready</button>{' '}
          <button onClick={() => socket.emit('startPlay')} disabled={!canPlay}>
            Play
          </button>{' '}
          <button onClick={leaveRoomFromLobbyPhase}>Leave</button>
        </p>
      </section>
    )
  }

  function renderCountdown(v: GameView) {
    const seated = v.players.filter((p) => p.seat !== undefined)
    return (
      <section>
        <h2>Table: {v.roomId}</h2>
        <p>Starting in {v.countdown}&hellip;</p>
        {seated.length > 0 && (
          <ul>
            {seated.map((p) => (
              <li key={p.id}>
                {p.seat}: {p.name}
              </li>
            ))}
          </ul>
        )}
        {renderLeaveControls(leaveGame)}
      </section>
    )
  }

  function renderAuction(v: GameView) {
    const yourTurn = v.you !== undefined && v.you === v.turn
    const legal: LegalCalls | undefined = v.legalCalls
    return (
      <section>
        <h2>Table: {v.roomId}</h2>
        <p>
          Dealer: {v.dealer} | Turn: {v.turn} | You: {v.you}
        </p>

        <h3>Your hand</h3>
        <p>{v.hand ? handText(v.hand) : '(no hand)'}</p>

        <h3>Auction</h3>
        {v.auction && v.auction.length > 0 ? (
          <ul>
            {v.auction.map((c, i) => (
              <li key={i}>
                {c.seat}: {callText(c)}
              </li>
            ))}
          </ul>
        ) : (
          <p>(no calls yet)</p>
        )}

        {yourTurn && legal && (
          <section>
            <h3>Your call</h3>
            <p>
              <button onClick={() => socket.emit('makeCall', { type: 'PASS' })} disabled={!legal.canPass}>
                Pass
              </button>{' '}
              <button
                onClick={() => socket.emit('makeCall', { type: 'DOUBLE' })}
                disabled={!legal.canDouble}
              >
                Double
              </button>{' '}
              <button
                onClick={() => socket.emit('makeCall', { type: 'REDOUBLE' })}
                disabled={!legal.canRedouble}
              >
                Redouble
              </button>
            </p>
            <p>Bids:</p>
            <div>
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
                        onClick={() =>
                          socket.emit('makeCall', { type: 'BID' as CallType, level, strain })
                        }
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

  function renderPlay(v: GameView, readOnly: boolean) {
    const contract: Contract | undefined = v.contract
    const tricksWon = v.tricksWon
    const currentTrick: PlayedCard[] = v.currentTrick ?? []
    const completedCount = v.completedTricks ? v.completedTricks.length : 0

    // Determine the led suit of the current trick (first card played), if any.
    const ledSuit: Suit | undefined = currentTrick.length > 0 ? currentTrick[0].card.suit : undefined

    // Which hand (if any) the local player may currently play from.
    const controllingOwnHand = !readOnly && v.you !== undefined && v.you === v.turn
    const controllingDummy =
      !readOnly &&
      v.dummy !== undefined &&
      v.you !== undefined &&
      v.you === v.dummy &&
      v.turn === v.dummy

    function canPlayFrom(hand: Card[], card: Card): boolean {
      // Follow-suit: if a suit was led and this hand holds it, only that suit is playable.
      if (ledSuit !== undefined && card.suit !== ledSuit) {
        const hasLed = hand.some((c) => c.suit === ledSuit)
        if (hasLed) return false
      }
      return true
    }

    function renderPlayableHand(hand: Card[]) {
      // Show grouped by suit, but as clickable buttons per card.
      const parts: React.ReactNode[] = []
      for (const suit of SUIT_ORDER) {
        const inSuit = hand
          .filter((c) => c.suit === suit)
          .sort((a, b) => b.rank - a.rank)
        if (inSuit.length === 0) continue
        parts.push(
          <span key={suit} style={{ marginRight: '1em' }}>
            {SUIT_GLYPH[suit]}{' '}
            {inSuit.map((card) => (
              <button
                key={`${card.suit}${card.rank}`}
                disabled={!canPlayFrom(hand, card)}
                onClick={() => socket.emit('playCard', { card })}
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
        <h2>Table: {v.roomId}</h2>
        {contract ? (
          <p>
            Contract: {contract.level}
            {strainGlyph(contract.strain)} by {contract.declarer}
            {doubledSuffix(contract.doubled)} | NS {tricksWon ? tricksWon.NS : 0} &mdash; EW{' '}
            {tricksWon ? tricksWon.EW : 0} | Turn: {v.turn}
          </p>
        ) : (
          <p>Turn: {v.turn}</p>
        )}

        <h3>Your hand{v.you ? ` (${v.you})` : ''}</h3>
        {v.hand ? (
          controllingOwnHand ? (
            renderPlayableHand(v.hand)
          ) : (
            <p>{handText(v.hand)}</p>
          )
        ) : (
          <p>(no hand)</p>
        )}

        {v.dummy && v.dummyHand && (
          <>
            <h3>Dummy ({v.dummy})</h3>
            {controllingDummy ? renderPlayableHand(v.dummyHand) : <p>{handText(v.dummyHand)}</p>}
          </>
        )}

        <h3>Current trick</h3>
        {currentTrick.length > 0 ? (
          <ul>
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

  function renderFrozen(v: GameView) {
    return (
      <section>
        <h2>Table: {v.roomId}</h2>
        <p>
          <strong>{v.frozenReason ?? 'Game frozen.'}</strong>
        </p>
        {/* Render the last board read-only: play if we have a contract, else the auction. */}
        {v.contract || v.currentTrick || v.completedTricks ? renderPlay(v, true) : renderAuction(v)}
        {renderLeaveControls(leaveGame)}
      </section>
    )
  }

  function renderFinished(v: GameView) {
    const result = v.result
    const tricksWon = v.tricksWon
    return (
      <section>
        <h2>Table: {v.roomId}</h2>
        <h3>Result</h3>
        {result ? (
          <p>
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
        {renderLeaveControls(leaveGame)}
      </section>
    )
  }

  function renderPhase(v: GameView) {
    switch (v.phase) {
      case 'LOBBY':
        return renderRoomReady(v)
      case 'COUNTDOWN':
        return renderCountdown(v)
      case 'AUCTION':
        return renderAuction(v)
      case 'PLAY':
        return renderPlay(v, false)
      case 'FROZEN':
        return renderFrozen(v)
      case 'FINISHED':
        return renderFinished(v)
      default:
        return <p>Unknown phase.</p>
    }
  }

  return (
    <main>
      <h1>Bridge</h1>
      <p>Status: {connected ? 'connected' : 'disconnected'}</p>
      <p>
        <a href="/">&larr; back to portal</a>
      </p>

      {error && (
        <p>
          <strong>Error:</strong> {error}
        </p>
      )}

      {renderPhase(view)}
      {renderChat()}
    </main>
  )
}
