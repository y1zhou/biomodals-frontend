import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

function backendProxy(target: string, origin: string): ProxyOptions {
  return {
    target,
    configure(proxy) {
      proxy.on('proxyReq', (request) => {
        if (request.getHeader('origin')) {
          request.setHeader('origin', origin)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'BIOMODALS_')
  const publicUrl = new URL(
    env.BIOMODALS_PUBLIC_URL ?? 'http://localhost:5173',
  )
  const proxyTarget =
    env.BIOMODALS_API_PROXY_TARGET ?? 'http://127.0.0.1:8000'
  const proxy = backendProxy(proxyTarget, publicUrl.origin)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: [publicUrl.hostname],
      proxy: {
        '/api': proxy,
        '/docs': proxy,
        '/openapi.json': proxy,
        '/redoc': proxy,
      },
    },
  }
})
