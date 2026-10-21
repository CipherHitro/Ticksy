import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api/v1/auth': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      '/api/v1/bookings': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
      '/api/v1/payments': {
        target: 'http://localhost:4004',
        changeOrigin: true,
      },
      '/api/v1/ledger': {
        target: 'http://localhost:4005',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})

