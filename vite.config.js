import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-liga': {
        target: 'https://ligaindonesia-api.vercel.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-liga/, ''),
      },
      '/api-sports': {
        target: 'https://thesportsdb.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-sports/, ''),
      },
    }
  }
})
