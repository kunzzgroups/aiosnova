import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
    '/api/auth/login/tac/send': 'http://localhost:8080',
    '/api/auth/login/tac/verify': 'http://localhost:8080',
    '/api/auth/mfa/verify': 'http://localhost:8080',
    '/api/auth/refresh': 'http://localhost:8080',
    '/api/auth/logout': 'http://localhost:8080',
    '/api/mock/inbox': 'http://localhost:8080',
    '/api/mock/invitations': 'http://localhost:8080',
  },
  },
})
