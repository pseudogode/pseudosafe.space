import { useState } from 'react'
import GameCard from './components/GameCard'
import styles from './App.module.css'

// Where the bridge game lives. In production this is served behind the same
// domain under /bridge/ by the nginx reverse proxy; override in dev if needed.
const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '/bridge/'

export default function App() {
  const [message, setMessage] = useState('(not loaded yet)')

  async function pingApi() {
    try {
      const res = await fetch('/api/hello')
      const data = await res.json()
      setMessage(data.message)
    } catch (err) {
      setMessage('error: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <main className={styles.app}>
      <h1>pseudosafe.space</h1>
      <p>A fun portal for games.</p>

      <hr />
      <p>API says: {message}</p>
      <button onClick={pingApi}>ping /api/hello</button>

      {/* games portal: card list */}
      <hr />
      <h2>Games</h2>
      <ul className={styles.games}>
        <li>
          <GameCard
            title="Bridge"
            description="Join a lobby and play bridge with others."
            href={BRIDGE_URL}
            linkLabel="Bridge.BG"
          />
        </li>
      </ul>
    </main>
  )
}
