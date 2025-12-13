import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',  // Use relative paths for HA ingress compatibility
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/plugins': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  }
})
