import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { IconBan, IconCircleCheck } from '@/components/icons/Icons'
import { ApiError } from '@/services/httpClient'
import type { PositionRecord } from '@/modules/core/identity/types/identity'
import { formatStatusLabel } from '@/modules/core/identity/types/identity'
import {
  createPosition,
  fetchPositions,
  updatePosition,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

export function PositionsPage() {
  const { t } = useTranslation()
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
      setError(err instanceof ApiError ? err.message : t('org.errLoadPositions'))
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
      setMessage(t('org.msgPositionCreated'))
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('org.errCreatePosition'))
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
      setError(err instanceof ApiError ? err.message : t('org.errUpdatePosition'))
    }
  }

  return (
    <div className="identity-page">
        <header className="identity-page__header">
          <h1>{t('org.positions.title')}</h1>
          <p>Job positions — reusable titles, not roles (Layer 1 · 05).</p>
        </header>

        <FlashToasts
          error={error}
          message={message}
          onClearError={() => setError(null)}
          onClearMessage={() => setMessage(null)}
        />

        <section className="identity-panel">
          <h2>{t('org.positions.addTitle')}</h2>
          <form className="identity-form" onSubmit={(event) => void handleCreate(event)}>
            <FormField label={t('org.fieldCode')} htmlFor="pos-code">
              <TextField
                id="pos-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label={t('org.fieldName')} htmlFor="pos-name">
              <TextField
                id="pos-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label={t('org.fieldDescription')} htmlFor="pos-desc">
              <TextField
                id="pos-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSubmitting}
              />
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('users.saving') : t('org.actionAdd')}
              </Button>
            </div>
          </form>
        </section>

        <section className="identity-panel">
          <h2>{t('org.positions.catalog')}</h2>
          {isLoading ? <p className="identity-empty">{t('users.loading')}</p> : null}
          {items.length > 0 ? (
            <div className="identity-table-wrap">
              <table className="identity-table">
                <thead>
                  <tr>
                    <th>{t('org.colCode')}</th>
                    <th>{t('org.colName')}</th>
                    <th>{t('org.fieldDescription')}</th>
                    <th>{t('org.fieldStatus')}</th>
                    <th className="identity-table__actions">{t('users.colActions')}</th>
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
                          {formatStatusLabel(item.status, t)}
                        </span>
                      </td>
                      <td className="identity-table__actions">
                        <div className="identity-inline-actions">
                          <IconButton
                            label={item.status === 'active' ? t('users.statusActive') : t('users.statusInactive')}
                            variant={item.status === 'active' ? 'secondary' : 'danger'}
                            onClick={() => void handleToggleStatus(item)}
                          >
                            {item.status === 'active' ? <IconCircleCheck /> : <IconBan />}
                          </IconButton>
                        </div>
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
