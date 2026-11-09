import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // expose on local network so others on same WiFi can open it
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
