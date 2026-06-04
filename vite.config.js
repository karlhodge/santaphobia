import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['kokoro-js'] },
  server: {
    proxy: {
      '/api/chat': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
