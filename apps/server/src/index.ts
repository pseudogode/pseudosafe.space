import express, { type Request, type Response } from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true })
})

app.get('/api/hello', (_req: Request, res: Response) => {
  res.json({ message: 'hello from the portal API' })
})

// Basic games catalogue the portal can render.
app.get('/api/games', (_req: Request, res: Response) => {
  res.json([
    {
      id: 'bridge',
      name: 'Bridge',
      description: 'Join a lobby and play bridge with others.',
      url: '/bridge/',
    },
  ])
})

app.listen(PORT, () => {
  console.log(`portal server listening on :${PORT}`)
})
