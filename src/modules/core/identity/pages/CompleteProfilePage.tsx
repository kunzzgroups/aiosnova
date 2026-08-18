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
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { fetchUser, updateUser } from '@/modules/core/identity/services/identityService'
import './CompleteProfilePage.css'

export function CompleteProfilePage() {
  const navigate = useNavigate()
  const sessionUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)

  const [displayName, setDisplayName] = useState(sessionUser?.name ?? '')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
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
      wide
      compact
      title="Complete your profile"
      subtitle="Add your full name and phone so CORE can identify this account."
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
        <form className="complete-profile-form" onSubmit={(event) => void handleSubmit(event)}>
          <FormField label="Email" htmlFor="complete-email">
            <TextField id="complete-email" value={sessionUser?.email ?? ''} disabled />
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
          <FormField label="Language" htmlFor="complete-language">
            <SidebarSelect
              id="complete-language"
              label="Language"
              hideLabel
              value={language}
              options={[...PROFILE_LANGUAGES]}
              onChange={setLanguage}
              disabled={isSaving}
            />
          </FormField>
          <FormField label="Timezone" htmlFor="complete-timezone">
            <SidebarSelect
              id="complete-timezone"
              label="Timezone"
              hideLabel
              value={timezone}
              options={[...PROFILE_TIMEZONES]}
              onChange={setTimezone}
              disabled={isSaving}
            />
          </FormField>
          <div className="complete-profile-form__full">
            <Button type="submit" fullWidth size="lg" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Continue'}
            </Button>
          </div>
        </form>
      ) : null}
    </AuthLayout>
  )
}
