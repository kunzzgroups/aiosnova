import { useState, type FormEvent } from 'react'
import { useCompanyStore } from '@/stores/companyStore'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { SettingsEditor } from './SettingsEditor'
import { createModel, updateModel } from '../services/settingsService'
import type { AiModel, AiProvider, ModelType } from '../types/settings'

export function CompanyModelEditor({ companyId, providers, target, initialProviderId, providerLocked = false, onClose, onSaved }: {
  companyId: string; providers: AiProvider[]; target: AiModel | null; initialProviderId: string; providerLocked?: boolean; onClose: () => void; onSaved: () => Promise<void>
}) {
  const [providerId, setProviderId] = useState(target?.providerId ?? initialProviderId)
  const [name, setName] = useState(target?.name ?? '')
  const [modelId, setModelId] = useState(target?.modelId ?? '')
  const [type, setType] = useState<ModelType>(target?.type ?? 'chat')
  const [context, setContext] = useState(String(target?.configuredContextWindow ?? 0))
  const [enabled, setEnabled] = useState(target?.status === 'enabled')
  const [description, setDescription] = useState(target?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || useCompanyStore.getState().companyId !== companyId) return
    const contextWindow = Number(context)
    if (!providerId || !name.trim() || !modelId.trim()) { setError('Select a Provider and enter a model name and ID.'); return }
    if (!Number.isSafeInteger(contextWindow) || contextWindow < 0 || contextWindow > 2147483647) { setError('Enter a valid context window; 0 follows the catalog.'); return }
    setBusy(true); setError('')
    try {
      const payload = { providerId, name, modelId, type, contextWindow, enabled, description }
      if (target) await updateModel(target.id, payload, companyId, target.version)
      else await createModel(payload, companyId)
      if (useCompanyStore.getState().companyId !== companyId) return
      await onSaved(); onClose()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save the model.') }
    finally { setBusy(false) }
  }
  return <SettingsEditor open title={target ? 'Edit model' : 'Add model'} description="Model configurations belong to a specific Provider account." closeLabel="Close model editor" onClose={onClose} busy={busy}
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" form="company-model-editor" disabled={busy}>{busy ? 'Saving…' : 'Save model'}</Button></>}>
    <form id="company-model-editor" onSubmit={submit} className="console-form">
      {error ? <p role="alert">{error}</p> : null}
      <FormField label="Provider" htmlFor="company-model-provider"><SidebarSelect menuPortal id="company-model-provider" label="Provider" hideLabel value={providerId} options={[...(!providerLocked ? [{ value: '', label: 'Select a Provider' }] : []), ...providers.map(provider => ({ value: provider.id, label: provider.name }))]} onChange={setProviderId} disabled={busy || !!target || providerLocked} /></FormField>
      <FormField label="Model name" htmlFor="company-model-name"><TextField id="company-model-name" value={name} onChange={event => setName(event.target.value)} disabled={busy} autoFocus /></FormField>
      <FormField label="Model ID" htmlFor="company-model-id"><TextField id="company-model-id" value={modelId} onChange={event => setModelId(event.target.value)} disabled={busy || !!target} placeholder="vendor/model-id" /></FormField>
      <FormField label="Type" htmlFor="company-model-type"><SidebarSelect menuPortal id="company-model-type" label="Type" hideLabel value={type} options={['chat', 'reasoning', 'embedding', 'other'].map(value => ({ value, label: value }))} onChange={value => setType(value as ModelType)} disabled={busy} /></FormField>
      <FormField label="Context window (0 = follow catalog)" htmlFor="company-model-context"><TextField id="company-model-context" type="number" min="0" max="2147483647" step="1" value={context} onChange={event => setContext(event.target.value)} disabled={busy} /></FormField>
      <FormField label="Status" htmlFor="company-model-status"><SidebarSelect menuPortal id="company-model-status" label="Status" hideLabel value={enabled ? 'enabled' : 'disabled'} options={[{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} onChange={value => setEnabled(value === 'enabled')} disabled={busy || !target} /></FormField>
      {!target ? <p>New models are disabled until their capabilities are confirmed.</p> : null}
      <FormField label="Description" htmlFor="company-model-description"><TextField id="company-model-description" value={description} onChange={event => setDescription(event.target.value)} disabled={busy} /></FormField>
    </form>
  </SettingsEditor>
}
