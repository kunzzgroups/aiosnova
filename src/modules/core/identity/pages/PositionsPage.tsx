import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/services/httpClient'
import type { PositionRecord } from '@/modules/core/identity/types/identity'
import {
  createPosition,
  fetchPositions,
  updatePosition,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

export function PositionsPage() {
  const [items, setItems] = useState<PositionRecord[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchPositions()
      setItems(result.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load positions.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await createPosition({ code, name, description })
      setCode('')
      setName('')
      setDescription('')
      setMessage('Position created.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create position.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(position: PositionRecord) {
    try {
      await updatePosition(position.id, {
        status: position.status === 'active' ? 'inactive' : 'active',
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update position.')
    }
  }

  return (
    <div className="identity-page">
        <header className="identity-page__header">
          <h1>Position</h1>
          <p>Job positions — reusable titles, not roles (Layer 1 · 05).</p>
        </header>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}

        <section className="identity-panel">
          <h2>Add position</h2>
          <form className="identity-form" onSubmit={(event) => void handleCreate(event)}>
            <FormField label="Code" htmlFor="pos-code">
              <TextField
                id="pos-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Name" htmlFor="pos-name">
              <TextField
                id="pos-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Description" htmlFor="pos-desc">
              <TextField
                id="pos-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSubmitting}
              />
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Add'}
              </Button>
            </div>
          </form>
        </section>

        <section className="identity-panel">
          <h2>Catalog</h2>
          {isLoading ? <p className="identity-empty">Loading…</p> : null}
          {items.length > 0 ? (
            <div className="identity-table-wrap">
              <table className="identity-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.code}</td>
                      <td>{item.name}</td>
                      <td>{item.description || '—'}</td>
                      <td>
                        <span className={`identity-status identity-status--${item.status}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => void handleToggleStatus(item)}
                        >
                          {item.status === 'active' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
  )
}
