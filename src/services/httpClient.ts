import { useAuthStore } from '@/stores/authStore'
import type { AuthUser } from '@/modules/core/auth/types/auth'
import { ensureMocking, mockingEnabled } from '@/mocks/runtime'

export class ApiError extends Error {
  readonly status: number | undefined
  readonly retryAfter: number | null

  constructor(message: string, status?: number, retryAfter: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
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
  signal?: AbortSignal
  cache?: RequestCache
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
  await ensureMocking()
  options.signal?.throwIfAborted()
  const { method = 'GET', body, auth = false, csrf = false, skipRefresh = false, cache, signal } = options
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

  const requestInit: RequestInit = {
    method,
    cache,
    signal,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }
  let response = await fetch(path, requestInit)

  // A suspended worker loses its active-client set. These GET routes belong to
  // the MSW adapter, so re-enable it and retry the read once if it leaked through.
  if (mockingEnabled && method === 'GET' && response.status === 404 && /^\/api\/identity\/users(?:\/[^/?]+)?(?:\?|$)/.test(path)) {
    await ensureMocking(true)
    signal?.throwIfAborted()
    response = await fetch(path, requestInit)
  }

  signal?.throwIfAborted()

  if (response.status === 401 && auth && !skipRefresh) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipRefresh: true })
    }
  }

  if (!response.ok) {
    let message = 'Request failed.'
    let retryAfter: number | null = null

    const retryAfterHeader = response.headers.get('Retry-After')?.trim()

    if (retryAfterHeader) {
      if (/^\d+$/.test(retryAfterHeader)) {
        retryAfter = Number(retryAfterHeader)
      } else {
        const retryDate = Date.parse(retryAfterHeader)
        if (Number.isFinite(retryDate)) {
          retryAfter = Math.max(0, Math.ceil((retryDate - Date.now()) / 1000))
        }
      }

      if (retryAfter !== null && !Number.isFinite(retryAfter)) {
        retryAfter = null
      }
    }

    try {
      const errorBody = (await response.json()) as { message?: string }
      if (errorBody.message) {
        message = errorBody.message
      }
    } catch {
      // ignore JSON parse errors
    }

    throw new ApiError(message, response.status, retryAfter)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function refreshSession(): Promise<boolean> {
  return tryRefresh()
}
