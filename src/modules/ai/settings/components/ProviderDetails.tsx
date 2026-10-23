import { connectionStatusLabel } from '../services/connectionPresentation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { IconPower, IconPencil, IconTrash, IconClock, IconPlus, IconSpark, IconRefresh } from '@/components/icons/Icons'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { fetchProviderModels } from '../services/settingsService'
import type { AiModel, AiProvider } from '../types/settings'

type Props = {
  provider: AiProvider
  companyId: string
  busy: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onManageModels: () => void
  onAddModel: () => void
  onSync: () => void
  syncing: boolean
  modelsRevision: number
}

export function ProviderDetails({ provider, companyId, busy, onEdit, onToggle, onDelete, onManageModels, onAddModel, onSync, syncing, modelsRevision }: Props) {
  const [models, setModels] = useState<AiModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelQuery, setModelQuery] = useState('')
  const [modelStatus, setModelStatus] = useState('all')
  const visibleModels = models.filter(model =>
    (modelStatus === 'all' || model.status === modelStatus) &&
    `${model.name} ${model.modelId}`.toLowerCase().includes(modelQuery.trim().toLowerCase()),
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setModels([])
    setError(null)
    void fetchProviderModels(provider.id, companyId).then(result => {
      if (active) setModels(result.items.filter(model => model.providerId === provider.id))
    }).catch(caught => {
      if (active) setError(caught instanceof Error ? caught.message : 'Unable to load models.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [provider.id, companyId, modelsRevision])

  return (
    <div className="ai-provider-details">
      <section className="ai-provider-overview" aria-label={`${provider.name} overview`}>
        <header className="ai-provider-details-header identity-table__actions">
          <span className={`ai-settings-provider-mark ai-settings-provider-mark--${provider.slug}`} aria-hidden="true">{provider.name.slice(0, 2).toUpperCase()}</span>
          <strong>{provider.name}</strong>
          <span className={`console-status console-status--${provider.status}`}>{connectionStatusLabel(provider.status)}</span>
          <div className="ai-provider-details-actions identity-inline-actions identity-directory-actions">
            {!provider.enabled && provider.status === 'disabled' ? (
              <IconButton label={`Delete ${provider.name}`} variant="danger" disabled={busy} onClick={onDelete}><IconTrash /></IconButton>
            ) : (
              <IconButton label={`Edit ${provider.name}`} disabled={busy} onClick={onEdit}><IconPencil /></IconButton>
            )}
            <IconButton label={provider.enabled ? `Disable ${provider.name}` : `Enable ${provider.name}`} variant={provider.enabled ? 'ghost' : 'secondary'} disabled={busy} aria-pressed={provider.enabled} onClick={onToggle}><IconPower /></IconButton>
          </div>
        </header>
        <div className="ai-provider-overview-body">
          <dl>
            <dt>API Key</dt><dd>{provider.apiKeyMasked || 'Not configured'}</dd>
            <dt>Base URL</dt><dd>{provider.baseUrl}</dd>
            <dt>Status</dt><dd><button type="button" className={`console-status console-status--${provider.status} console-status--clickable`} disabled={busy} onClick={onToggle}>{connectionStatusLabel(provider.status)}</button></dd>
          </dl>
          <div className="ai-provider-connection-actions ai-provider-connection-check">
            <div className="ai-provider-connection-summary"><span aria-hidden="true"><IconClock/></span><div><strong>{provider.lastConnectionTest?.message ?? 'Not tested in this session'}</strong><small>{provider.lastConnectionTest ? `${provider.lastConnectionTest.modelId} · ${new Date(provider.lastConnectionTest.checkedAt).toLocaleString()}` : 'Enter a test model ID. Leave API Key blank to test the saved database key.'}</small><small>This is the last test for one model, not all models. Results are session-only; the enabled state is saved separately.</small></div></div>
            <Button variant="secondary" disabled={busy || !provider.enabled} onClick={onEdit}>Test Connection</Button>
          </div>
        </div>
      </section>
      <section className="ai-provider-models" aria-label={`${provider.name} models`}>
        <header className="ai-provider-models-header">
          <div><h2>Model catalog</h2><small>{loading ? 'Loading catalog…' : `${models.length} models configured for this Provider`}</small></div>
          <div className="ai-provider-catalog-actions">
            {provider.baseUrl.trim() === 'https://openrouter.ai/api/v1' ? <Button variant="secondary" disabled={busy || syncing} onClick={onSync}><IconRefresh className={syncing ? 'ai-catalog-spinning' : undefined} />{syncing ? 'Syncing models…' : 'Sync catalog'}</Button> : null}
            <Button variant="secondary" disabled={busy} onClick={onManageModels}>Manage Models</Button>
          </div>
        </header>
        {models.length>0?<TableToolbar
          search={<TextField className="ui-table-toolbar__search" type="search" value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="Search models…" aria-label="Search provider models" />}
          filters={<SidebarSelect menuPortal id="provider-model-status" label="Model status" hideLabel value={modelStatus} options={[
            { value: 'all', label: 'All status' }, { value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }, { value: 'error', label: 'Error' },
          ]} onChange={setModelStatus} />}
        />:null}
        <div className="ai-provider-models-scroll">
          {loading ? <p className="console-empty" role="status">Loading models…</p> : error ? <p className="console-empty" role="alert">{error}</p> : !models.length ? <div className="ai-provider-models-empty"><IconSpark aria-hidden="true"/><strong>No models added yet</strong><p>Add a model to make this provider available to agents.</p>{!provider.enabled?<p>This provider is disabled. Enable the connection before using its models.</p>:null}<Button disabled={busy} onClick={onAddModel}><IconPlus/>Add Model</Button></div> : visibleModels.length === 0 ? <div className="ai-provider-models-empty"><strong>No matching models</strong><Button variant="secondary" onClick={()=>{setModelQuery('');setModelStatus('all')}}>Clear filters</Button></div> : (
            <table className="console-table ai-provider-models-table">
              <thead><tr><th>Model</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>{visibleModels.map(model => <tr key={model.id}>
                <td><strong title={model.name}>{model.name}</strong><small title={model.modelId}>{model.modelId}</small></td>
                <td><span className="console-chip">{model.type}</span></td>
                <td><span className={`console-status console-status--${model.status === 'enabled' ? 'active' : model.status}`}>{model.status}</span></td>
              </tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
