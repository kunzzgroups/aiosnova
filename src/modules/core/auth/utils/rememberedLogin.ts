const STORAGE_KEY = 'aios.rememberedLogin'

export type RememberedLogin = {
  email: string
  password: string
}

export function readRememberedLogin(): RememberedLogin | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<RememberedLogin>
    if (typeof parsed.email === 'string' && typeof parsed.password === 'string') {
      return { email: parsed.email, password: parsed.password }
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }

  return null
}

export function writeRememberedLogin(email: string, password: string) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ email: email.trim(), password }),
  )
}

export function clearRememberedLogin() {
  window.localStorage.removeItem(STORAGE_KEY)
}
