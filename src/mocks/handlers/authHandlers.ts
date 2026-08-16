import { HttpResponse, http } from 'msw'
import type {
  AuthUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  MfaSetupConfirmRequest,
  MfaVerifyRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '@/modules/core/auth/types/auth'
import { MOCK_MFA_CODE, seedUsers, toPublicUser, type MockUser } from '@/mocks/data/users'

const REFRESH_COOKIE = 'aios_refresh'
const CSRF_COOKIE = 'aios_csrf'

type SessionRecord = {
  userId: string
  refreshToken: string
  revoked: boolean
}

type MfaTicketRecord = {
  userId: string
  expiresAt: number
}

type ResetTokenRecord = {
  userId: string
  expiresAt: number
}

const users: MockUser[] = [...seedUsers]
const sessions = new Map<string, SessionRecord>()
const mfaTickets = new Map<string, MfaTicketRecord>()
const resetTokens = new Map<string, ResetTokenRecord>()
const pendingMfaSecrets = new Map<string, string>()

function createToken(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) {
    return {}
  }

  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split('=')
    if (!rawKey) {
      return acc
    }
    acc[rawKey] = decodeURIComponent(rest.join('=') || '')
    return acc
  }, {})
}

function cookieHeader(name: string, value: string, options?: { maxAge?: number; httpOnly?: boolean }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
  ]

  if (options?.httpOnly) {
    parts.push('HttpOnly')
  }

  if (typeof options?.maxAge === 'number') {
    parts.push(`Max-Age=${options.maxAge}`)
  }

  return parts.join('; ')
}

function clearCookieHeader(name: string, httpOnly = false) {
  return cookieHeader(name, '', { maxAge: 0, httpOnly })
}

function findUserByEmail(email: string) {
  return users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase())
}

function findUserById(id: string) {
  return users.find((user) => user.id === id)
}

function getBearerUser(request: Request): AuthUser | null {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return null
  }

  const token = auth.slice('Bearer '.length)
  const match = /^access_(.+)$/.exec(token)
  if (!match) {
    return null
  }

  const user = findUserById(match[1])
  return user ? toPublicUser(user) : null
}

function issueSession(user: MockUser) {
  const refreshToken = createToken('refresh')
  const csrfToken = createToken('csrf')
  const accessToken = `access_${user.id}`

  sessions.set(refreshToken, {
    userId: user.id,
    refreshToken,
    revoked: false,
  })

  const body = {
    accessToken,
    user: toPublicUser(user),
  }

  return HttpResponse.json(body, {
    headers: [
      ['Set-Cookie', cookieHeader(REFRESH_COOKIE, refreshToken, { maxAge: 60 * 60 * 24 * 7, httpOnly: true })],
      ['Set-Cookie', cookieHeader(CSRF_COOKIE, csrfToken, { maxAge: 60 * 60 * 24 * 7 })],
    ],
  })
}

function revokeUserSessions(userId: string) {
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.set(token, { ...session, revoked: true })
    }
  }
}

function requireCsrf(request: Request) {
  const cookies = parseCookies(request.headers.get('cookie'))
  const cookieToken = cookies[CSRF_COOKIE]
  const headerToken = request.headers.get('X-CSRF-Token')
  return Boolean(cookieToken && headerToken && cookieToken === headerToken)
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password.'
const FORGOT_MESSAGE =
  'If an account exists for that email, you will receive password reset instructions.'

export const authHandlers = [
  http.post('/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as RegisterRequest
    const email = body.email?.trim() ?? ''
    const password = body.password ?? ''
    const name = body.name?.trim() ?? ''

    if (!email || !password || password.length < 8 || !name) {
      return HttpResponse.json({ message: 'Please provide a valid name, email, and password.' }, { status: 400 })
    }

    if (findUserByEmail(email)) {
      return HttpResponse.json({ message: 'Unable to create account with the provided details.' }, { status: 400 })
    }

    const user: MockUser = {
      id: createToken('user'),
      email: email.toLowerCase(),
      name,
      password,
      mfaEnabled: false,
    }

    users.push(user)
    return issueSession(user)
  }),

  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as LoginRequest
    const user = findUserByEmail(body.email ?? '')

    if (!user || user.password !== body.password) {
      return HttpResponse.json({ message: GENERIC_LOGIN_ERROR }, { status: 401 })
    }

    if (user.mfaEnabled) {
      const mfaTicket = createToken('mfa')
      mfaTickets.set(mfaTicket, {
        userId: user.id,
        expiresAt: Date.now() + 5 * 60 * 1000,
      })

      const response: LoginResponse = {
        status: 'mfa_required',
        mfaTicket,
      }

      return HttpResponse.json(response)
    }

    return issueSession(user)
  }),

  http.post('/api/auth/mfa/verify', async ({ request }) => {
    const body = (await request.json()) as MfaVerifyRequest
    const ticket = mfaTickets.get(body.mfaTicket)

    if (!ticket || ticket.expiresAt < Date.now()) {
      return HttpResponse.json({ message: 'MFA challenge expired. Please sign in again.' }, { status: 401 })
    }

    const user = findUserById(ticket.userId)
    if (!user) {
      return HttpResponse.json({ message: 'MFA challenge expired. Please sign in again.' }, { status: 401 })
    }

    if (body.code !== MOCK_MFA_CODE) {
      return HttpResponse.json({ message: 'Invalid verification code.' }, { status: 401 })
    }

    mfaTickets.delete(body.mfaTicket)
    return issueSession(user)
  }),

  http.post('/api/auth/refresh', ({ request }) => {
    if (!requireCsrf(request)) {
      return HttpResponse.json({ message: 'CSRF validation failed.' }, { status: 403 })
    }

    const cookies = parseCookies(request.headers.get('cookie'))
    const refreshToken = cookies[REFRESH_COOKIE]
    const session = refreshToken ? sessions.get(refreshToken) : undefined

    if (!session || session.revoked) {
      return HttpResponse.json({ message: 'Session expired.' }, { status: 401 })
    }

    const user = findUserById(session.userId)
    if (!user) {
      return HttpResponse.json({ message: 'Session expired.' }, { status: 401 })
    }

    return HttpResponse.json({
      accessToken: `access_${user.id}`,
      user: toPublicUser(user),
    })
  }),

  http.post('/api/auth/logout', ({ request }) => {
    if (!requireCsrf(request)) {
      return HttpResponse.json({ message: 'CSRF validation failed.' }, { status: 403 })
    }

    const cookies = parseCookies(request.headers.get('cookie'))
    const refreshToken = cookies[REFRESH_COOKIE]
    if (refreshToken && sessions.has(refreshToken)) {
      const session = sessions.get(refreshToken)!
      sessions.set(refreshToken, { ...session, revoked: true })
    }

    return HttpResponse.json(
      { message: 'Signed out.' },
      {
        headers: [
          ['Set-Cookie', clearCookieHeader(REFRESH_COOKIE, true)],
          ['Set-Cookie', clearCookieHeader(CSRF_COOKIE)],
        ],
      },
    )
  }),

  http.get('/api/auth/oauth/google/start', () => {
    return HttpResponse.json({
      redirectUrl: '/oauth/google/callback?mock=1',
    })
  }),

  http.get('/api/auth/oauth/google/callback', () => {
    let user = findUserByEmail('google.user@aios.dev')
    if (!user) {
      user = {
        id: 'user-google',
        email: 'google.user@aios.dev',
        name: 'Google User',
        password: '',
        mfaEnabled: false,
      }
      users.push(user)
    }

    return issueSession(user)
  }),

  http.post('/api/auth/password/forgot', async ({ request }) => {
    const body = (await request.json()) as ForgotPasswordRequest
    const user = findUserByEmail(body.email ?? '')

    if (user) {
      const token = createToken('reset')
      resetTokens.set(token, {
        userId: user.id,
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      return HttpResponse.json({
        message: FORGOT_MESSAGE,
        // Demo-only helper so reset can be tested without email.
        demoResetToken: token,
      })
    }

    return HttpResponse.json({ message: FORGOT_MESSAGE })
  }),

  http.post('/api/auth/password/reset', async ({ request }) => {
    const body = (await request.json()) as ResetPasswordRequest
    const record = resetTokens.get(body.token)

    if (!record || record.expiresAt < Date.now()) {
      return HttpResponse.json({ message: 'Reset link is invalid or expired.' }, { status: 400 })
    }

    if (!body.password || body.password.length < 8) {
      return HttpResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const user = findUserById(record.userId)
    if (!user) {
      return HttpResponse.json({ message: 'Reset link is invalid or expired.' }, { status: 400 })
    }

    user.password = body.password
    resetTokens.delete(body.token)
    revokeUserSessions(user.id)

    return HttpResponse.json({ message: 'Password updated. Please sign in with your new password.' })
  }),

  http.post('/api/auth/mfa/setup/start', ({ request }) => {
    const authUser = getBearerUser(request)
    if (!authUser) {
      return HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
    }

    const secret = 'AIOSMOCKSECRET'
    pendingMfaSecrets.set(authUser.id, secret)

    return HttpResponse.json({
      secret,
      otpauthUri: `otpauth://totp/AIOS:${authUser.email}?secret=${secret}&issuer=AIOS`,
    })
  }),

  http.post('/api/auth/mfa/setup/confirm', async ({ request }) => {
    const authUser = getBearerUser(request)
    if (!authUser) {
      return HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
    }

    const body = (await request.json()) as MfaSetupConfirmRequest
    if (body.code !== MOCK_MFA_CODE) {
      return HttpResponse.json({ message: 'Invalid verification code.' }, { status: 400 })
    }

    const user = findUserById(authUser.id)
    if (!user) {
      return HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
    }

    user.mfaEnabled = true
    pendingMfaSecrets.delete(user.id)

    return HttpResponse.json({
      recoveryCodes: ['RCVY-1111', 'RCVY-2222', 'RCVY-3333', 'RCVY-4444'],
      user: toPublicUser(user),
    })
  }),
]
