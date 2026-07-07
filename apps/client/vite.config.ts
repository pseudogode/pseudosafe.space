import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The portal client. In dev it proxies /api to the portal server so the
// browser can talk to Express without CORS headaches.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
