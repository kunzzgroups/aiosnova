import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import { logout, setOwnPassword } from '@/modules/core/auth/services/authService'
import { isIdentityProfileComplete } from '@/modules/core/identity/types/identity'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import {
  isValidPassword,
  PASSWORD_CONFIRM_PLACEHOLDER,
  PASSWORD_CREATE_PLACEHOLDER,
  PASSWORD_ERROR_MESSAGE,
} from '@/modules/core/auth/utils/passwordPolicy'
import { fetchUser, updateUser } from '@/modules/core/identity/services/identityService'
import './CompleteProfilePage.css'

export function CompleteProfilePage() {
  const navigate = useNavigate()
  const sessionUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)

  const [displayName, setDisplayName] = useState(sessionUser?.name ?? '')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
    if (!isValidPassword(password)) {
      setError(PASSWORD_ERROR_MESSAGE)
      return
    }
    if (password !== confirmPassword) {
      setError('Password and confirm password do not match.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const updated = await updateUser(sessionUser.id, {
        displayName,
        fullName,
        phone,
      })
      await setOwnPassword(password)
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
          <FormField label="Display name" htmlFor="complete-display">
            <TextField
              id="complete-display"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Enter your display name"
              required
              disabled={isSaving}
            />
          </FormField>
          <FormField label="Full name" htmlFor="complete-full">
            <TextField
              id="complete-full"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter your full name"
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
              placeholder="Enter your phone number"
              required
              disabled={isSaving}
              autoComplete="tel"
            />
          </FormField>
          <FormField label="Password" htmlFor="complete-password">
            <PasswordField
              id="complete-password"
              value={password}
              onChange={setPassword}
              placeholder={PASSWORD_CREATE_PLACEHOLDER}
              autoComplete="new-password"
              showRequirements
              disabled={isSaving}
            />
          </FormField>
          <FormField label="Confirm password" htmlFor="complete-confirm-password">
            <PasswordField
              id="complete-confirm-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder={PASSWORD_CONFIRM_PLACEHOLDER}
              autoComplete="new-password"
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
