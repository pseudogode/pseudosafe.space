import styles from './GameCard.module.css'

interface GameCardProps {
  title: string
  description: string
  href: string
  linkLabel: string
}

// A portal card linking to a game.
export default function GameCard({ title, description, href, linkLabel }: GameCardProps) {
  return (
    <article className={styles.card}>
      <h3>{title}</h3>
      <p>{description}</p>
      <a href={href}>{linkLabel}</a>
    </article>
  )
}
