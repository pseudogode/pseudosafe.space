import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served behind the reverse proxy at /bridge/ in production, so the built
// asset paths must be prefixed. In dev it runs at the root of its own port.
export default defineConfig({
  base: '/bridge/',
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
  },
})
