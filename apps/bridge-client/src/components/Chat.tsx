import type { ChatMessage } from '@pseudosafe/shared'
import styles from './Chat.module.css'

interface ChatProps {
  messages: ChatMessage[]
  chatText: string
  onChatChange: (value: string) => void
  onSend: (e: React.FormEvent<HTMLFormElement>) => void
}

export default function Chat({ messages, chatText, onChatChange, onSend }: ChatProps) {
  return (
    <section className={styles.chat}>
      <h3>Chat</h3>
      <ul className={styles.log}>
        {messages.map((m, i) => (
          <li key={i}>
            <strong>{m.name}:</strong> {m.text}
          </li>
        ))}
      </ul>
      <form onSubmit={onSend}>
        <input
          value={chatText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChatChange(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </section>
  )
}
