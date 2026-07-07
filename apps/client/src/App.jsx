import { useState } from 'react'

// Where the bridge game lives. In production this is served behind the same
// domain under /bridge/ by the nginx reverse proxy; override in dev if needed.
const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '/bridge/'

export default function App() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('(not loaded yet)')

  async function pingApi() {
    try {
      const res = await fetch('/api/hello')
      const data = await res.json()
      setMessage(data.message)
    } catch (err) {
      setMessage('error: ' + err.message)
    }
  }

  return (
    <main>
      <h1>pseudosafe.space</h1>
      <p>A fun portal for games.</p>

      {/* scratch text + button example */}
      <hr />
      <p>Scratch text. You clicked the button {count} times.</p>
      <button onClick={() => setCount((c) => c + 1)}>click me</button>

      <hr />
      <p>API says: {message}</p>
      <button onClick={pingApi}>ping /api/hello</button>

      {/* games portal: card list */}
      <hr />
      <h2>Games</h2>
      <ul>
        <li>
          {/* a card linking to the bridge game */}
          <article style={{ border: '1px solid', padding: '8px', maxWidth: '20em' }}>
            <h3>Bridge</h3>
            <p>Join a lobby and play bridge with others.</p>
            <a href={BRIDGE_URL}>Play Bridge</a>
          </article>
        </li>
      </ul>
    </main>
  )
}
