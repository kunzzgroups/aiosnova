import { useAuthStore } from '@/stores/authStore'
import type { AuthUser } from '@/modules/core/auth/types/auth'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  if (!match) {
    return null
  }

  return decodeURIComponent(match.slice(name.length + 1))
}

function getCsrfToken() {
  return getCookie('aios_csrf')
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
  csrf?: boolean
  skipRefresh?: boolean
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    const csrf = getCsrfToken()
    if (!csrf) {
      useAuthStore.getState().clearSession()
      return false
    }

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrf,
      },
    })

    if (!response.ok) {
      useAuthStore.getState().clearSession()
      return false
    }

    const data = (await response.json()) as {
      accessToken: string
      user: AuthUser
    }

    useAuthStore.getState().setSession(data.accessToken, data.user)
    return true
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, csrf = false, skipRefresh = false } = options
  const headers = new Headers()

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth) {
    const token = useAuthStore.getState().accessToken
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  if (csrf) {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401 && auth && !skipRefresh) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipRefresh: true })
    }
  }

  if (!response.ok) {
    let message = 'Request failed.'
    try {
      const errorBody = (await response.json()) as { message?: string }
      if (errorBody.message) {
        message = errorBody.message
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function refreshSession(): Promise<boolean> {
  return tryRefresh()
}
