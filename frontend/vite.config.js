import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../static/dist' },
  server: {
    proxy: {
      '/api': 'http://localhost:8421',
      '/auth': 'http://localhost:8421',
      '/ws': { target: 'ws://localhost:8421', ws: true },
    }
  }
})
