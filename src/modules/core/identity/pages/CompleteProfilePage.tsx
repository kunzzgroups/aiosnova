import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import { logout } from '@/modules/core/auth/services/authService'
import {
  PROFILE_LANGUAGES,
  PROFILE_TIMEZONES,
  isIdentityProfileComplete,
} from '@/modules/core/identity/types/identity'
import { fetchUser, updateUser } from '@/modules/core/identity/services/identityService'
import '@/modules/core/auth/pages/AuthForm.css'
import './IdentityPage.css'

export function CompleteProfilePage() {
  const navigate = useNavigate()
  const sessionUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)

  const [displayName, setDisplayName] = useState(sessionUser?.name ?? '')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [language, setLanguage] = useState('en')
  const [timezone, setTimezone] = useState('Asia/Kuala_Lumpur')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!sessionUser) {
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const result = await fetchUser(sessionUser.id)
        if (cancelled) {
          return
        }
        setDisplayName(result.user.displayName)
        setFullName(result.user.fullName)
        setPhone(result.user.phone)
        setAvatarUrl(result.user.avatarUrl)
        setLanguage(result.user.language || 'en')
        setTimezone(result.user.timezone || 'Asia/Kuala_Lumpur')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to load profile.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionUser])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionUser) {
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const updated = await updateUser(sessionUser.id, {
        displayName,
        fullName,
        phone,
        avatarUrl,
        language,
        timezone,
      })
      setUser({
        ...sessionUser,
        name: updated.displayName,
        profileComplete: isIdentityProfileComplete(updated),
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save profile.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AuthLayout
      title="Complete your profile"
      subtitle="Google only gives us an email. Add your name and phone so we know who you are."
      footer={
        <p>
          <Link
            to="/login"
            onClick={(event) => {
              event.preventDefault()
              void logout().then(() => navigate('/login', { replace: true }))
            }}
          >
            Sign out
          </Link>
        </p>
      }
    >
      {isLoading ? <p>Loading profile…</p> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {!isLoading ? (
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <FormField label="Email" htmlFor="complete-email">
            <TextField id="complete-email" value={sessionUser?.email ?? ''} disabled />
          </FormField>
          <FormField label="Display name" htmlFor="complete-display">
            <TextField
              id="complete-display"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              disabled={isSaving}
            />
          </FormField>
          <FormField label="Full name" htmlFor="complete-full">
            <TextField
              id="complete-full"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              disabled={isSaving}
              autoComplete="name"
            />
          </FormField>
          <FormField label="Phone" htmlFor="complete-phone">
            <TextField
              id="complete-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              disabled={isSaving}
              autoComplete="tel"
            />
          </FormField>
          <FormField label="Avatar URL" htmlFor="complete-avatar" hint="Optional">
            <TextField
              id="complete-avatar"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              disabled={isSaving}
            />
          </FormField>
          <FormField label="Language" htmlFor="complete-language">
            <select
              id="complete-language"
              className="identity-select"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              disabled={isSaving}
            >
              {PROFILE_LANGUAGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Timezone" htmlFor="complete-timezone">
            <select
              id="complete-timezone"
              className="identity-select"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              disabled={isSaving}
            >
              {PROFILE_TIMEZONES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </FormField>
          <Button type="submit" fullWidth size="lg" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Continue'}
          </Button>
        </form>
      ) : null}
    </AuthLayout>
  )
}
