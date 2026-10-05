import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy ALL backend routes to FastAPI on port 8000.
    // This matches production where nginx forwards everything to the backend.
    // Routes like /challenges, /applications, /pilots, /api/auth, /api/uploads
    // are all forwarded transparently.
    proxy: {
      // Auth and uploads (already have /api prefix in backend routers)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Static file serving for uploaded PDFs
      '/static': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Routers without /api prefix
      '/challenges': { target: 'http://localhost:8000', changeOrigin: true },
      '/applications': { target: 'http://localhost:8000', changeOrigin: true },
      '/startups': { target: 'http://localhost:8000', changeOrigin: true },
      '/evaluations': { target: 'http://localhost:8000', changeOrigin: true },
      '/pilots': { target: 'http://localhost:8000', changeOrigin: true },
      '/decisions': { target: 'http://localhost:8000', changeOrigin: true },
      '/users': { target: 'http://localhost:8000', changeOrigin: true },
      '/milestones': { target: 'http://localhost:8000', changeOrigin: true },
      '/invoices': { target: 'http://localhost:8000', changeOrigin: true },
      '/kpis': { target: 'http://localhost:8000', changeOrigin: true },
      '/evidence': { target: 'http://localhost:8000', changeOrigin: true },
      '/health': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
