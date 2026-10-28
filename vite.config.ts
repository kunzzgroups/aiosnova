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
    '/api/identity/directory': 'http://localhost:8080',
    '/api/identity/users': 'http://localhost:8080',
    '/api/identity/invitation-organization': 'http://localhost:8080',
    '/api/auth/local-test-login': 'http://localhost:8080',
    '/api/identity/organizations': 'http://localhost:8080',
    '/api/identity/positions': 'http://localhost:8080',
    '/api/identity/organization-companies': 'http://localhost:8080',
    '/api/identity/organization-batches': 'http://localhost:8080',
    '/api/auth/login/tac/send': 'http://localhost:8080',
    '/api/auth/login/tac/verify': 'http://localhost:8080',
    '/api/auth/mfa/verify': 'http://localhost:8080',
    '/api/auth/refresh': 'http://localhost:8080',
    '/api/auth/logout': 'http://localhost:8080',
    '/api/auth/invitations': 'http://localhost:8080',
    '/api/mock/inbox': 'http://localhost:8080',
    '/api/mock/invitations': 'http://localhost:8080',
    '/api/identity/roles': 'http://localhost:8080',
    '/api/ai/test-connection': 'http://127.0.0.1:8081',
    '/api/ai/providers': 'http://127.0.0.1:8081',
    '/api/ai/model-capabilities': 'http://127.0.0.1:8081',
    '/api/ai/openrouter/models': 'http://127.0.0.1:8081',
    '/api/ai/chat': 'http://127.0.0.1:8081',
    '/api/ai/agents': 'http://127.0.0.1:8081',
    '/api/ai/knowledge': 'http://127.0.0.1:8081',
    '/api/ai/models': 'http://127.0.0.1:8081',
    '/api/ai/model-preferences': 'http://127.0.0.1:8081',
    '/api/identity/permissions': 'http://localhost:8080',
  },
  },
})
