import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

function backendProxy(): ProxyOptions {
  return {
    target: 'http://127.0.0.1:8000',
    configure(proxy) {
      proxy.on('proxyReq', (request) => {
        // FastAPI allowlists this Vite origin; production never uses this proxy.
        if (request.getHeader('origin')) {
          request.setHeader('origin', 'http://localhost:5173')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': backendProxy(),
      '/docs': backendProxy(),
      '/openapi.json': backendProxy(),
    },
  },
})
