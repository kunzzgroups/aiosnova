import { useEffect, useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { fetchCompanyModels, availableCompanyModelOptions, type AssistantModelOption } from '../services/settingsService'
import { fetchModelPreferences, saveModelPreferences, type ModelPreferences } from '../services/modelPreferencesService'
import type { AiModel, AiProvider } from '../types/settings'

export function AssistantModelPreferences({ companyId, open, onClose }: { companyId: string; open: boolean; onClose: () => void }) {
  const [preferences, setPreferences] = useState<ModelPreferences | null>(null)
  const [options, setOptions] = useState<AssistantModelOption[]>([])
  const [catalog, setCatalog] = useState<{ items: AiModel[]; providers: AiProvider[] }>({ items: [], providers: [] })
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true); setPreferences(null); setError(''); setQuery('')
    void Promise.all([fetchModelPreferences(companyId), fetchCompanyModels(companyId)]).then(([prefs, models]) => {
      if (!active) return
      setPreferences(prefs); setCatalog(models); setOptions(availableCompanyModelOptions(models.providers, models.items))
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load model preferences.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyId, open, attempt])

  async function save() {
    if (!preferences || busy) return
    setBusy(true); setError('')
    try { await saveModelPreferences(preferences); onClose() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save preferences. Reload and try again.') }
    finally { setBusy(false) }
  }
  function remove(id: string) {
    if (preferences) setPreferences({ ...preferences, recommendedModelConfigIds: preferences.recommendedModelConfigIds.filter(value => value !== id) })
  }
  function labelFor(id: string) {
    const existing = catalog.items.find(item => item.id === id)
    const provider = catalog.providers.find(item => item.id === existing?.providerId)
    return existing ? `${existing.name} (${provider?.name ?? 'Provider unavailable'})` : `Deleted model (${id.slice(0, 8)}…)`
  }
  const defaultUnavailable = Boolean(preferences?.defaultModelConfigId && !options.some(option => option.id === preferences.defaultModelConfigId))
  const ids = preferences?.recommendedModelConfigIds ?? []
  const needle = query.trim().toLowerCase()
  const matches = needle ? options.filter(option => !ids.includes(option.id) && `${option.name} ${option.modelId}`.toLowerCase().includes(needle)) : []
  return <Drawer open={open} title="Assistant settings" description="Choose the company default and up to six recommended models." closeLabel="Close Assistant settings" busy={busy} onClose={onClose}
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || loading || !preferences?.storageReady || defaultUnavailable || ids.some(id => !options.some(option => option.id === id))} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</Button></>}>
    <div className="ai-model-preferences-drawer">
      {loading ? <p role="status">Loading company models…</p> : null}
      {error ? <div role="alert"><p>{error}</p><Button variant="secondary" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Reload settings</Button></div> : null}
      {preferences && !preferences.storageReady ? <p role="alert">Run AI database migration 003 before saving company preferences.</p> : null}
      <section><h4>Company default</h4><p>Used for new chats. Unavailable defaults are never replaced automatically.</p>
        <SidebarSelect menuPortal id="company-default-model" label="Default model" hideLabel value={preferences?.defaultModelConfigId ?? ''} disabled={busy || loading || !preferences?.storageReady}
          options={[{ value: '', label: 'No company default' }, ...options.map(option => ({ value: option.id, label: option.label })), ...(defaultUnavailable && preferences?.defaultModelConfigId ? [{ value: preferences.defaultModelConfigId, label: `${labelFor(preferences.defaultModelConfigId)} · Unavailable` }] : [])]}
          onChange={value => preferences && setPreferences({ ...preferences, defaultModelConfigId: value || null })} />
        {defaultUnavailable ? <p role="alert">{labelFor(preferences!.defaultModelConfigId!)} is unavailable. Choose a replacement or select No company default.</p> : null}
      </section>
      <section className="ai-model-recommendations-section"><h4>Recommended models <span>{ids.length} / 6</span></h4><p>Shown first in the model menu. Other enabled models remain under Browse all.</p>
        {ids.length < 6 ? <TextField value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by model name or ID…" aria-label="Search enabled models to recommend" disabled={busy || loading || !preferences?.storageReady} /> : <p className="ai-model-recommendation-hint" role="status">All six slots are filled. Remove a model to add another.</p>}
        {!needle ? <ul className="ai-model-recommendation-list">{ids.map(id => {
          const available = options.find(option => option.id === id)
          const model = catalog.items.find(item => item.id === id)
          const provider = catalog.providers.find(item => item.id === model?.providerId)
          return <li key={id} className={available ? '' : 'is-unavailable'}><div><strong>{model?.name ?? labelFor(id)}</strong><small>{provider?.name ?? 'Provider unavailable'}{model ? ` · ${model.modelId}` : ''}</small>{!available ? <small className="ai-model-recommendation-unavailable">Unavailable — enable the model and Provider, or remove it.</small> : null}</div><Button variant="ghost" disabled={busy} onClick={() => remove(id)} aria-label={`Remove ${available?.label ?? labelFor(id)} from recommendations`}>Remove</Button></li>
        })}</ul> : null}
        {!needle && !ids.length ? <p>No recommendations selected.</p> : null}
        {needle ? <><div className="ai-model-recommendation-search-heading"><small>{matches.length} matches</small><Button variant="ghost" disabled={busy} onClick={() => setQuery('')}>Back to selected ({ids.length})</Button></div><div className="ai-model-recommendation-results">{matches.slice(0, 20).map(option => <div key={option.id}><span><strong>{option.name}</strong><small>{catalog.providers.find(provider => provider.id === option.providerId)?.name ?? 'Provider unavailable'}</small><small>{option.modelId}</small></span><Button variant="secondary" disabled={busy || ids.length >= 6} onClick={() => {
          if (!preferences || ids.length >= 6) return
          setPreferences({ ...preferences, recommendedModelConfigIds: [...ids, option.id] }); setQuery('')
        }}>Add</Button></div>)}{!matches.length ? <p>No enabled models match.</p> : matches.length > 20 ? <p>Showing 20 matches. Refine your search.</p> : null}</div></> : null}
      </section>
    </div>
  </Drawer>
}
