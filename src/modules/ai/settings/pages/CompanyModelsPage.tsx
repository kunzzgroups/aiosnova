import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCompanyStore } from '@/stores/companyStore'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TextField } from '@/components/ui/TextField'
import { IconPlus, IconSpark, IconTrash, IconPencil, IconRefresh, IconCircleCheck, IconX } from '@/components/icons/Icons'
import { AiSettingsShell } from '../components/AiSettingsShell'
import { ModelsPagination } from '../components/ModelsPagination'
import { useSettingsPagination } from '../hooks/useSettingsPagination'
import { AssistantModelPreferences } from '../components/AssistantModelPreferences'
import { CompanyModelEditor } from '../components/CompanyModelEditor'
import { fetchCompanyModels, fetchProviders, fetchProviderModels, setModelEnabled, refreshModelCapabilities } from '../services/settingsService'
import { mutateCompanyModels } from '../services/modelApiService'
import { MODEL_VENDORS } from '../services/modelVendor'
import { companyModelActionTargets, filterCompanyModels, type CompanyModelAction } from '../services/companyModelPresentation'
import type { AiModel, AiProvider } from '../types/settings'
import '../pages/ProviderModelsPage.css'
import '@/modules/ai/shared/AiConsole.css'
import './AiSettingsPage.css'
import './AiSettingsDirectory.css'
import './CompanyModelsPage.css'

export function CompanyModelsPage() {
  const companyId = useCompanyStore(state => state.companyId)
  return <AiSettingsShell><CompanyModelsWorkspace key={companyId} companyId={companyId} /></AiSettingsShell>
}

export function CompanyModelsWorkspace({ companyId, providerId, initialCreate = false, onClose, onBusyChange }: {
  companyId: string; providerId?: string; initialCreate?: boolean; onClose?: () => void; onBusyChange?: (busy: boolean) => void
}) {
  const [models, setModels] = useState<AiModel[]>([])
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [providerFilter, setProviderFilter] = useState(providerId ?? 'all')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editor, setEditor] = useState<{ target: AiModel | null } | null>(initialCreate ? { target: null } : null)
  const [pending, setPending] = useState<{ action: CompanyModelAction; models: AiModel[]; source: string; skipped: number } | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const sequence = useRef(0)
  const mutation = useRef(false)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const current = () => useCompanyStore.getState().companyId === companyId
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setError(null)
    try {
      let result: { providers: AiProvider[]; items: AiModel[] }
      if (providerId) {
        const parents = await fetchProviders(companyId)
        const provider = parents.items.find(item => item.id === providerId && item.companyId === companyId)
        if (!provider) throw new Error('Provider is not available in this company.')
        const catalog = await fetchProviderModels(providerId, companyId)
        result = { providers: [provider], items: catalog.items.filter(item => item.providerId === providerId) }
      } else {
        result = await fetchCompanyModels(companyId)
      }
      if (request !== sequence.current || useCompanyStore.getState().companyId !== companyId) return
      setProviders(result.providers); setModels(result.items)
      setProviderFilter(value => value === 'all' || result.providers.some(provider => provider.id === value) ? value : 'all')
    } catch (caught) {
      if (request === sequence.current && useCompanyStore.getState().companyId === companyId) {
        if (providerId) setEditor(null)
        setModels([]); setError(caught instanceof Error ? caught.message : 'Unable to load company models.')
      }
    } finally { if (request === sequence.current) setLoading(false) }
  }, [companyId, providerId])
  useEffect(() => { void load(); return () => { sequence.current++ } }, [load])
  const filtered = filterCompanyModels(models, { query, providerId: providerFilter, vendor: vendorFilter, status: statusFilter })
  const selecting = statusFilter === 'disabled'
  const scopedModels = models.filter(model => providerFilter === 'all' || model.providerId === providerFilter)
  const selectedProvider = providers.find(provider => provider.id === providerFilter)
  const scopeEmpty = scopedModels.length === 0
  const { tableRef, rows, pagination } = useSettingsPagination(filtered, loading, JSON.stringify([query, providerFilter, vendorFilter, statusFilter]), { fitCompletePages: true })
  const selected = filtered.filter(model => selectedIds.includes(model.id))
  const allChecked = rows.length > 0 && rows.every(model => selectedIds.includes(model.id))
  const someChecked = rows.some(model => selectedIds.includes(model.id))
  useEffect(() => {
    setSelectedIds([]); setPending(null); setOperationError(null)
    if (tableRef.current) tableRef.current.scrollTop = 0
  }, [query, providerFilter, vendorFilter, statusFilter])
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked && !allChecked }, [someChecked, allChecked, loading])
  const locked = loading || busy || !!editor || settingsOpen || !!pending
  useEffect(() => { onBusyChange?.(locked) }, [locked, onBusyChange])
  function request(action: CompanyModelAction, source: AiModel[], sourceLabel: string) {
    const targets = companyModelActionTargets(source, action)
    const limit = action === 'delete' ? 100 : 1000
    if (!targets.length || targets.length > limit) { setError(`Choose between 1 and ${limit} eligible models.`); return }
    setOperationError(null); setPending({ action, models: structuredClone(targets), source: sourceLabel, skipped: source.length - targets.length })
  }
  async function confirm() {
    const target = pending
    if (!target || mutation.current || !current()) return
    mutation.current = true; setBusy(true); setOperationError(null)
    try {
      await mutateCompanyModels(companyId, target.models.map(model => ({ providerId: model.providerId, id: model.id, version: model.version })), target.action)
      if (!current()) return
      setPending(null); setSelectedIds([]); await load()
      setMessage(`${target.models.length} model configurations ${target.action === 'delete' ? 'deleted' : target.action === 'enable' ? 'enabled' : 'disabled'}.`)
    } catch (caught) { if (current()) setOperationError(caught instanceof Error ? caught.message : 'Unable to update models.') }
    finally { mutation.current = false; setBusy(false) }
  }
  async function run(operation: () => Promise<unknown>, success: string) {
    if (mutation.current || !current()) return
    mutation.current = true; setBusy(true); setError(null)
    try { await operation(); if (!current()) return; setSelectedIds([]); await load(); setMessage(success) }
    catch (caught) { if (current()) setError(caught instanceof Error ? caught.message : 'Model operation failed.') }
    finally { mutation.current = false; setBusy(false) }
  }
  function clearFilters() { setQuery(''); setProviderFilter(providerId ?? 'all'); setVendorFilter('all'); setStatusFilter('all') }
  return <>
    <FlashToasts error={error} message={message} onClearError={() => setError(null)} onClearMessage={() => setMessage(null)} />
    <div className="console-page console-page--internal-table-scroll ai-company-models-page">
      <TablePanel>
        <TableToolbar search={<TextField className="ui-table-toolbar__search" type="search" aria-label="Search company models" placeholder="Search models…" value={query} onChange={event => setQuery(event.target.value)} disabled={busy} />}
          filters={<>
            <SidebarSelect id="company-model-provider-filter" label="Provider" hideLabel value={providerFilter} options={[...(!providerId ? [{ value: 'all', label: 'All Providers' }] : []), ...providers.map(provider => ({ value: provider.id, label: provider.name }))]} onChange={setProviderFilter} disabled={locked || !!providerId} />
            <SidebarSelect id="company-model-vendor-filter" label="Vendor" hideLabel value={vendorFilter} options={[{ value: 'all', label: 'All vendors' }, ...MODEL_VENDORS.map(item => ({ ...item }))]} onChange={setVendorFilter} disabled={locked} />
            <SidebarSelect id="company-model-status-filter" label="Status" hideLabel value={statusFilter} options={[{ value: 'all', label: 'All statuses' }, { value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }, { value: 'error', label: 'Error' }]} onChange={setStatusFilter} disabled={locked} />
          </>}
          actions={<>{selected.length ? <Button variant="danger" disabled={locked || selected.length > 100} onClick={() => request('delete', selected, 'Selected models')}><IconTrash aria-hidden="true" />Remove ({selected.length})</Button> : null}<Button variant="secondary" disabled={locked} onClick={() => setSettingsOpen(true)}>Assistant settings</Button><IconButton label="Reload models" disabled={locked} onClick={() => void load()}><IconRefresh className={loading ? 'ai-catalog-spinning' : undefined} /></IconButton><Button disabled={locked || !providers.length} onClick={() => setEditor({ target: null })}><IconPlus aria-hidden="true" />Add Model</Button>{onClose ? <IconButton label="Back to Providers" disabled={locked} onClick={onClose}><IconX /></IconButton> : null}</>} />
        {loading ? <div role="status" className="ai-company-models-empty">Loading company models…</div> : error ? <div className="ai-company-models-empty" role="alert"><strong>Unable to load models</strong><p>{error}</p><Button variant="secondary" onClick={() => void load()}>Retry</Button></div> : !filtered.length ? <div className="ai-company-models-empty"><span className="ai-company-models-empty-icon" aria-hidden="true"><IconSpark /></span><strong>{scopeEmpty ? selectedProvider ? 'No models for this Provider yet' : 'No models yet' : 'No models match your filters'}</strong><p>{scopeEmpty ? selectedProvider ? `Sync the catalog from ${selectedProvider.name}, or add a model manually.` : 'Connect a Provider and sync its catalog to get started.' : 'Try another search, vendor, or status.'}</p><div className="ai-company-models-empty-actions">{scopeEmpty ? <><Link className="ai-company-models-provider-link" to="/ai/ai/ai-settings/models/providers">Manage Providers</Link>{providers.length ? <Button disabled={locked} onClick={() => setEditor({ target: null })}><IconPlus aria-hidden="true" />Add Model</Button> : null}</> : <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}</div></div> : <div className="console-table-wrap" ref={tableRef}>
          <table className={`console-table console-table--fixed ai-company-model-table${selecting ? ' is-selecting' : ''}`}><thead><tr>
            {selecting ? <th className="ai-company-model-check"><input type="checkbox" ref={selectAllRef} aria-label="Select all models on this page" checked={allChecked} disabled={locked} onChange={event => {
              const pageIds = new Set(rows.map(model => model.id))
              setSelectedIds(ids => event.target.checked ? [...new Set([...ids, ...pageIds])] : ids.filter(id => !pageIds.has(id)))
            }} /></th> : null}<th className="ai-company-col-name">Model</th><th className="ai-company-col-provider">Provider</th><th className="ai-company-col-status">Status</th><th className="ai-company-col-type">Type</th><th className="ai-company-col-context">Context</th><th className="console-table__actions">Actions</th>
          </tr></thead><tbody>{rows.map(model => {
            const parent = providers.find(provider => provider.id === model.providerId)
            return <tr key={model.id}>{selecting ? <td><input type="checkbox" aria-label={`Select ${model.name} (${parent?.name ?? model.providerId})`} checked={selectedIds.includes(model.id)} disabled={locked} onChange={event => setSelectedIds(ids => event.target.checked ? [...new Set([...ids, model.id])] : ids.filter(id => id !== model.id))} /></td> : null}
              <td><div className="ai-company-model-name"><strong title={model.name}>{model.name}</strong><small title={model.modelId}>{model.modelId}</small></div></td>
              <td className="ai-company-model-provider-cell"><span className="ai-company-model-provider" title={parent?.name}>{parent?.name ?? 'Unavailable'}</span></td>
              <td className="ai-company-model-status"><button type="button" disabled={locked} className={`console-status console-status--${model.status === 'enabled' ? 'active' : model.status} console-status--clickable`} onClick={() => void run(() => setModelEnabled(model.id, model.status !== 'enabled', companyId, model.providerId, model.version), 'Model state updated.')}>{model.status}</button></td>
              <td className="ai-company-model-type"><span className="console-chip">{model.type}</span></td><td>{model.contextWindow == null ? 'Unknown' : model.contextWindow.toLocaleString()}</td>
              <td className="console-table__actions"><div className="ai-company-model-row-actions">
                {model.status === 'disabled' ? <IconButton variant="danger" label={`Delete ${model.name}`} disabled={locked} onClick={() => request('delete', [model], 'This model configuration')}><IconTrash /></IconButton> : <IconButton label={`Edit ${model.name}`} disabled={locked} onClick={() => setEditor({ target: structuredClone(model) })}><IconPencil /></IconButton>}
                <IconButton label={`Refresh capabilities for ${model.name}`} disabled={locked || parent?.baseUrl.trim() !== 'https://openrouter.ai/api/v1'} onClick={() => void run(async () => {
                  const refreshed = await refreshModelCapabilities(companyId, model.providerId, model.id, model.version)
                  if (refreshed.capabilityError || !refreshed.capabilities) throw new Error(refreshed.capabilityError ?? 'Capability metadata is unknown.')
                }, 'Model capabilities refreshed.')}><IconCircleCheck /></IconButton>
              </div></td>
            </tr>
          })}</tbody></table>
        </div>}
        {!loading && !error && filtered.length > 0 ? <ModelsPagination id="company-model-pagination" pagesLabel="Company model pages" {...pagination} /> : null}
      </TablePanel>
    </div>
    <AssistantModelPreferences key={companyId} companyId={companyId} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    {editor && (!providerId || providers.length === 1) ? <CompanyModelEditor key={editor.target?.id ?? 'create'} companyId={companyId} providers={providers} target={editor.target} initialProviderId={providerFilter === 'all' ? '' : providerFilter} providerLocked={!!providerId} onClose={() => setEditor(null)} onSaved={async () => { await load(); setMessage('Model saved.') }} /> : null}
    <ConfirmDialog open={pending !== null} title={`${pending?.action === 'delete' ? 'Delete' : pending?.action === 'enable' ? 'Enable' : 'Disable'} ${pending?.models.length ?? 0} models?`}
      description={<><p>{pending?.source}. {new Set(pending?.models.map(model => model.providerId)).size} Provider account(s).</p><p>{pending?.skipped ? `${pending.skipped} ineligible or already matching models were excluded. ` : ''}All target versions are checked; a conflict cancels the entire transaction.</p></>}
      warning={pending?.action === 'delete' ? 'Deletion is permanent. A future catalog sync may import these models again.' : pending?.action === 'disable' ? 'Bound Agents and company defaults may become unavailable. No automatic replacement is made.' : 'Enabled models appear under Browse all. Recommendations are configured separately; no model connection tests are run.'}
      confirmLabel={pending?.action === 'delete' ? 'Delete models' : pending?.action === 'enable' ? 'Enable models' : 'Disable models'} cancelLabel="Cancel" busyLabel="Updating…" busy={busy} error={operationError}
      onConfirm={() => void confirm()} onCancel={() => { if (!busy) { setPending(null); setOperationError(null) } }} />
  </>
}
