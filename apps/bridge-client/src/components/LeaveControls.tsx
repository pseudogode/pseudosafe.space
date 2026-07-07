import { useState } from 'react'
import styles from './LeaveControls.module.css'

// A Leave button that asks for confirmation before firing onConfirm.
export default function LeaveControls({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <p className={styles.controls}>
        Leave game?{' '}
        <button onClick={onConfirm}>Yes</button>{' '}
        <button onClick={() => setConfirming(false)}>No</button>
      </p>
    )
  }
  return (
    <p className={styles.controls}>
      <button onClick={() => setConfirming(true)}>Leave</button>
    </p>
  )
}
