import { useDisabledSelection } from '../hooks/useDisabledSelection'
import { rememberModelProvider } from '../services/modelProviderSelection'
import { MODEL_VENDORS, getModelVendor, type ModelVendor } from '../services/modelVendor'
import { useCompanyStore } from '@/stores/companyStore'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Button } from '@/components/ui/Button'
import { SettingsEditor, SettingsEditorSection } from './SettingsEditor'
import { IconSettings, IconShieldCheck, IconSpark } from '@/components/icons/Icons'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { IconButton } from '@/components/ui/IconButton'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { RowMenu } from '@/components/ui/RowMenu'
import { ModelsPagination } from './ModelsPagination'
import { modelTableLayout } from '../services/modelTableLayout'
import { IconPlus, IconTrash, IconPencil, IconX, IconRefresh, IconCircleCheck } from '@/components/icons/Icons'
import { TextField } from '@/components/ui/TextField'

import {
  createModel,
  deleteModel,
  deleteModels,
  fetchProviders,
  fetchProvider,
  fetchProviderModels,
  setModelEnabled,
  setModelsEnabled,
  updateModel,
  refreshModelCapabilities,
} from '../services/settingsService'

import type {
  AiModel,
  AiProvider,
  ModelStatus,
  ModelType,
} from '../types/settings'


import '@/modules/ai/shared/AiConsole.css'
import '../pages/AiSettingsPage.css'
import '../pages/AiSettingsDirectory.css'
import '../pages/ProviderModelsPage.css'

const MODEL_FORM_ID = 'ai-model-form'

type StatusFilter = 'all' | ModelStatus

type ModelManagementProps = {
  providerId: string
  initialCreate?: boolean
  onBusyChange?: (busy: boolean) => void
  onClose?: () => void
}

export function ModelManagement({ providerId, initialCreate = false, onBusyChange, onClose }: ModelManagementProps) {
  const companyId = useCompanyStore((state) => state.companyId)
  const [selecting, setSelecting] = useState(false)
  const [pendingBulk, setPendingBulk] = useState<{
    ids: string[]
    items: AiModel[]
    scope: string
    companyId: string
  } | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [pendingState, setPendingState] = useState<{
    enabled: boolean; companyId: string; providerId: string; items: { id: string; version: number }[]
  } | null>(null)
  const [stateError, setStateError] = useState<string | null>(null)
  const bulkSubmittingRef = useRef(false)
  const currentScopeRef = useRef(providerId)
  currentScopeRef.current = providerId
  useEffect(() => { setPendingBulk(null); setBulkError(null); setPendingState(null); setStateError(null) }, [providerId, companyId])
  const [pendingDelete, setPendingDelete] = useState<AiModel | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(0)
  const [autoPageSize, setAutoPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const tableRef = useRef<HTMLDivElement>(null)
  const [openFormSelect, setOpenFormSelect] = useState<'type' | 'status' | null>(null)

  const [provider, setProvider] =
    useState<AiProvider | null>(null)

  const [models, setModels] =
    useState<AiModel[]>([])

  const [isLoading, setIsLoading] =
    useState(true)

  const [query, setQuery] =
    useState('')

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all')

  const [vendorFilter, setVendorFilter] =
    useState<ModelVendor | 'all'>('all')

  const [error, setError] =
    useState<string | null>(null)

  const [message, setMessage] =
    useState<string | null>(null)
  const [capabilityWarnings, setCapabilityWarnings] = useState<string[]>([])

  const [formOpen, setFormOpen] =
    useState(false)

  const [editingId, setEditingId] =
    useState<string | null>(null)

  const [editingVersion, setEditingVersion] =
    useState<number | null>(null)

  const [name, setName] =
    useState('')

  const [modelId, setModelId] =
    useState('')

  const [type, setType] =
    useState<ModelType>('chat')

  const [contextWindow, setContextWindow] =
    useState(128000)

  const [enabled, setEnabled] =
    useState(false)

  const [description, setDescription] =
    useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const mutationRef = useRef(false)
  const loadSequence = useRef(0)
  const currentCompanyRef = useRef(companyId)
  currentCompanyRef.current = companyId

  useEffect(() => {
    onBusyChange?.(isSaving || isDeleting || isUpdating || isLoading || formOpen || pendingDelete !== null || pendingBulk !== null || pendingState !== null)
  }, [onBusyChange, isSaving, isDeleting, isUpdating, isLoading, formOpen, pendingDelete, pendingBulk, pendingState])

  const load = useCallback(async () => {
    if (!providerId) return
    const request = ++loadSequence.current
    const isCurrent = () => request === loadSequence.current && currentScopeRef.current === providerId && currentCompanyRef.current === companyId
    setIsLoading(true)
    setError(null)
    setCapabilityWarnings([])

    try {
      await fetchProviders(companyId)
      const [nextProvider, modelResult] =
        await Promise.all([
          fetchProvider(providerId),
          fetchProviderModels(providerId, companyId),
        ])

      if (!isCurrent()) return
      if (nextProvider.companyId !== companyId) throw new Error('Provider is not available in the current company.')
      rememberModelProvider(companyId, providerId)
      setProvider(nextProvider)
      setModels(modelResult.items.filter(model => model.providerId === providerId))
      setCapabilityWarnings(modelResult.capabilityErrors)
    } catch (caught) {
      if (!isCurrent()) return
      setProvider(null)
      setModels([])
      setCapabilityWarnings([])

      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load models.',
      )
    } finally {
      if (isCurrent()) setIsLoading(false)
    }
  }, [providerId, companyId])

  useEffect(() => {
    void load()
    return () => { loadSequence.current++ }
  }, [load])

  const visibleModels =
    useMemo(() => {
      const needle =
        query.trim().toLowerCase()

      return models
        .filter(model =>
          vendorFilter === 'all' ||
          getModelVendor(model.modelId) === vendorFilter
        )
        .filter(
          (model) =>
            statusFilter === 'all' ||
            model.status === statusFilter,
        )
        .filter(
          (model) =>
            !needle ||
            model.name
              .toLowerCase()
              .includes(needle) ||
            model.modelId
              .toLowerCase()
              .includes(needle),
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name),
        )
    }, [models, query, statusFilter, vendorFilter])

  const effectivePageSize = pageSize || autoPageSize
  const pageCount = Math.max(1, Math.ceil(visibleModels.length / effectivePageSize))
  const currentPage = Math.min(page, pageCount)
  const paginatedModels = visibleModels.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)
  const selection = useDisabledSelection(visibleModels, paginatedModels, selecting ? statusFilter : 'all', query, `${companyId}:${providerId}:${vendorFilter}`)
  useEffect(() => { setSelecting(false) }, [providerId, companyId, vendorFilter, query])
  const bulkItems = pendingBulk?.items ?? []
  const enableTargets = visibleModels.filter(item => item.status !== 'enabled' && item.capabilities && item.capabilitiesCheckedAt && !item.capabilityError)
  const disableTargets = visibleModels.filter(item => item.status === 'enabled')

  function requestStateChange(enabled: boolean) {
    const targets = enabled ? enableTargets : disableTargets
    setStateError(null)
    setPendingState({ enabled, companyId, providerId, items: targets.map(item => ({ id: item.id, version: item.version })) })
  }

  async function confirmStateChange() {
    const target = pendingState
    if (!target || mutationRef.current || target.companyId !== useCompanyStore.getState().companyId || target.providerId !== currentScopeRef.current) return
    mutationRef.current = true; setIsUpdating(true); setStateError(null)
    try {
      await setModelsEnabled(target.companyId, target.providerId, target.enabled, target.items)
      if (target.companyId !== useCompanyStore.getState().companyId || target.providerId !== currentScopeRef.current) return
      setPendingState(null); selection.clear(); await load()
      setMessage(`${target.items.length} models ${target.enabled ? 'enabled' : 'disabled'}. Assistant recommendations remain separate.`)
    } catch (caught) {
      if (target.companyId === useCompanyStore.getState().companyId && target.providerId === currentScopeRef.current)
        setStateError(caught instanceof Error ? caught.message : 'Unable to update models.')
    }
    finally { mutationRef.current = false; setIsUpdating(false) }
  }

  useEffect(() => {
    if (tableRef.current) tableRef.current.scrollTop = 0
  }, [query, statusFilter, vendorFilter, currentPage, effectivePageSize, pageSize, providerId])


  // 条件变化时重置页码
  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, vendorFilter, effectivePageSize, pageSize, providerId])

  useEffect(() => {
    setPendingBulk(null)
    setBulkError(null)
  }, [vendorFilter])

  useEffect(() => {
    setVendorFilter('all')
  }, [companyId, providerId])

  useEffect(() => {
    setPendingDelete(null)
    setDeleteError(null)
  }, [companyId, providerId])

  // Count complete natural-height rows in the space above the fixed footer.
  useEffect(() => {
    if (isLoading || !visibleModels.length) return
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return
    let frame = 0

    function measureRows() {
      if (!container || !table) return
      const actionWidth = 7.25 * parseFloat(getComputedStyle(document.documentElement).fontSize)
      const minimumWidth = parseFloat(getComputedStyle(table).minWidth) || 0
      table.style.setProperty('--ai-model-content-width', `${Math.max(container.clientWidth, minimumWidth) - actionWidth}px`)
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      if (!rows.length) return
      rows.forEach(row => row.style.removeProperty('height'))

      const availableHeight = container.clientHeight - (table.querySelector('thead')?.getBoundingClientRect().height ?? 0)
      if (availableHeight <= 0) return

      const naturalHeight = Math.max(1, ...rows.map(row => row.getBoundingClientRect().height))
      const layout = modelTableLayout(availableHeight, naturalHeight, pageSize, rows.length, currentPage === pageCount)
      if (pageSize === 0) {
        setAutoPageSize(current => current === layout.autoPageSize ? current : layout.autoPageSize)
      }
      if (layout.rowHeight !== null) {
        rows.forEach(row => { row.style.height = `${layout.rowHeight}px` })
      }
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    observer.observe(table)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => row.style.removeProperty('height'))
    }
  }, [isLoading, visibleModels.length, pageSize, currentPage, effectivePageSize, pageCount, providerId, query, statusFilter, vendorFilter])


  function resetForm() {
    setOpenFormSelect(null)
    setEditingId(null)
    setEditingVersion(null)
    setName('')
    setModelId('')
    setType('chat')
    setContextWindow(128000)
    setEnabled(false)
    setDescription('')
    setError(null)
  }

  const initialCreatePending = useRef(initialCreate)
  useEffect(() => {
    if (initialCreatePending.current && !isLoading && provider) {
      initialCreatePending.current = false
      resetForm()
      setFormOpen(true)
    }
  }, [isLoading, provider])

  function openCreate() {
    resetForm()
    setFormOpen(true)
  }

  function openEdit(model: AiModel) {
    setOpenFormSelect(null)
    setEditingId(model.id)
    setEditingVersion(model.version)
    setName(model.name)
    setModelId(model.modelId)
    setType(model.type)
    setContextWindow(model.contextWindow ?? 0)
    setEnabled(model.status !== 'disabled')
    setDescription(model.description)
    setError(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (isSaving) return

    setFormOpen(false)
    resetForm()
  }

  async function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault()

    if (
      !provider ||
      provider.id !== providerId ||
      provider.companyId !== companyId ||
      useCompanyStore.getState().companyId !== companyId
    ) {
      setError('The company or Provider changed. Reopen this page.')
      return
    }

    if (
      !name.trim() ||
      !modelId.trim()
    ) {
      setError(
        'Model name and Model ID are required.',
      )
      return
    }

    if (
      !Number.isSafeInteger(contextWindow) ||
      contextWindow < 0 ||
      contextWindow > 2147483647
    ) {
      setError(
        'Context window must be an integer from 0 to 2147483647; 0 means unknown.',
      )
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const payload = {
        providerId: provider.id,
        name,
        modelId,
        type,
        contextWindow,
        enabled,
        description,
      }

      if (editingId) {
        if (editingVersion === null) {
          throw new Error('Missing edit version. Close and reopen the form.')
        }

        await updateModel(
          editingId,
          payload,
          companyId,
          editingVersion,
        )

        setMessage(
          'Model updated successfully.',
        )
      } else {
        await createModel(payload, companyId)

        setMessage('Model created and disabled by default. Load capabilities before enabling.')
      }

      setFormOpen(false)
      resetForm()

      await load()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save model.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleModel(model: AiModel) {
    if (
      mutationRef.current ||
      isDeleting ||
      isSaving ||
      model.providerId !== providerId ||
      useCompanyStore.getState().companyId !== companyId
    ) {
      return
    }

    mutationRef.current = true
    setIsUpdating(true)
    setError(null)

    try {
      await setModelEnabled(
        model.id,
        model.status === 'disabled',
        companyId,
        providerId,
        model.version,
      )

      if (
        useCompanyStore.getState().companyId !== companyId ||
        currentScopeRef.current !== providerId
      ) {
        return
      }

      await load()
    } catch (caught) {
      if (
        useCompanyStore.getState().companyId === companyId &&
        currentScopeRef.current === providerId
      ) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to update model.',
        )
      }
    } finally {
      mutationRef.current = false
      setIsUpdating(false)
    }
  }

  async function handleRefreshCapabilities(model: AiModel) {
    if (
      mutationRef.current ||
      isLoading ||
      isDeleting ||
      isSaving ||
      formOpen ||
      pendingDelete ||
      pendingBulk ||
      pendingState ||
      model.providerId !== providerId ||
      provider?.companyId !== companyId ||
      provider.baseUrl.trim() !== 'https://openrouter.ai/api/v1' ||
      useCompanyStore.getState().companyId !== companyId
    ) return

    const scope = providerId
    const refreshCompany = companyId

    const isCurrent = () =>
      currentScopeRef.current === scope &&
      useCompanyStore.getState().companyId === refreshCompany

    mutationRef.current = true
    setIsUpdating(true)
    setError(null)
    setMessage(null)

    try {
      const updated = await refreshModelCapabilities(
        refreshCompany,
        scope,
        model.id,
        model.version,
      )

      if (!isCurrent()) return

      await load()

      if (!isCurrent()) return

      if (updated.capabilityError || !updated.capabilities) {
        setError(
          updated.capabilityError ??
          'Catalog capability metadata is incomplete and was saved as unknown.',
        )
      } else {
        setMessage('Capabilities updated. The name and enabled state are unchanged.')
      }
    } catch (caught) {
      if (!isCurrent()) return

      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to refresh model capabilities.',
      )
    } finally {
      mutationRef.current = false
      setIsUpdating(false)
    }
  }

  async function handleDelete() {
    if (
      !pendingDelete ||
      isDeleting ||
      mutationRef.current ||
      pendingDelete.status !== 'disabled' ||
      pendingDelete.providerId !== providerId ||
      useCompanyStore.getState().companyId !== companyId
    ) return

    const target = pendingDelete
    const deleteCompany = companyId
    const deleteProvider = providerId

    const isCurrent = () =>
      currentScopeRef.current === deleteProvider &&
      useCompanyStore.getState().companyId === deleteCompany

    mutationRef.current = true
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deleteModel(
        target.id,
        deleteCompany,
        deleteProvider,
        target.version,
      )

      if (!isCurrent()) return

      setPendingDelete(null)
      setMessage('Model deleted successfully.')
      await load()
    } catch (caught) {
      if (!isCurrent()) return

      setDeleteError(
        caught instanceof Error
          ? caught.message
          : 'Unable to delete model.',
      )
    } finally {
      mutationRef.current = false
      setIsDeleting(false)
    }
  }

  async function removeSelectedModels() {
    const target = pendingBulk

    if (
      !target ||
      target.items.length < 2 ||
      target.items.length > 100 ||
      bulkSubmittingRef.current ||
      mutationRef.current ||
      isDeleting ||
      useCompanyStore.getState().companyId !== target.companyId ||
      currentScopeRef.current !== target.scope
    ) return

    if (
      target.items.length !== target.ids.length ||
      target.items.some(item =>
        item.status !== 'disabled' ||
        item.providerId !== target.scope
      )
    ) {
      setBulkError('Selected models cannot be deleted. Select disabled models again.')
      return
    }

    const isCurrent = () =>
      useCompanyStore.getState().companyId === target.companyId &&
      currentScopeRef.current === target.scope

    bulkSubmittingRef.current = true
    mutationRef.current = true
    setBulkError(null)
    setIsDeleting(true)

    try {
      await deleteModels(
        target.companyId,
        target.scope,
        target.items.map(item => ({
          id: item.id,
          version: item.version,
        })),
      )

      if (!isCurrent()) return

      const deletedIds = new Set(target.ids)

      setModels(current =>
        current.filter(item =>
          item.providerId !== target.scope ||
          !deletedIds.has(item.id)
        )
      )

      selection.clear()
      setPendingBulk(null)
      setMessage(`Removed ${deletedIds.size} models successfully.`)

      await load()
    } catch (caught) {
      if (!isCurrent()) return

      setBulkError(
        caught instanceof Error
          ? caught.message
          : 'Unable to remove selected models.',
      )
    } finally {
      bulkSubmittingRef.current = false
      mutationRef.current = false
      setIsDeleting(false)
    }
  }

  return (
    <>
      <FlashToasts
        error={error}
        message={message}
        onClearError={() =>
          setError(null)
        }
        onClearMessage={() =>
          setMessage(null)
        }
      />

      <div className="console-page console-page--internal-table-scroll ai-settings-models-page">
        <TablePanel>
          <div className="ai-model-scope-heading"><strong title={provider?.name}>{provider?.name ?? 'Provider models'}</strong><small>Models configured for this Provider only.</small></div>
          <TableToolbar
            search={
              <TextField
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models…"
                aria-label="Search models"
              />
            }
            filters={
              <>
              <SidebarSelect
                id="model-vendor-filter"
                label="Model vendor"
                hideLabel
                value={vendorFilter}
                options={[
                  { value: 'all', label: 'All vendors' },
                  ...MODEL_VENDORS.map(item => ({ value: item.value, label: item.label })),
                ]}
                onChange={value => setVendorFilter(value as ModelVendor | 'all')}
                disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen || pendingDelete !== null || pendingBulk !== null || pendingState !== null}
              />
              <SidebarSelect
                id="model-status-filter"
                label="Model status"
                hideLabel
                value={statusFilter}
                options={[
                  { value: 'all', label: 'All status' },
                  { value: 'enabled', label: 'Enabled' },
                  { value: 'disabled', label: 'Disabled' },
                  { value: 'error', label: 'Error' },
                ]}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
              />
              </>
            }
            actions={<>
              <Button variant="secondary" disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen} onClick={() => { selection.clear(); if (!selecting) setStatusFilter('disabled'); setSelecting(value => !value) }}>{selecting ? 'Done' : 'Select'}</Button>
              <RowMenu label="Provider model actions" disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen || !!pendingDelete || !!pendingBulk || !!pendingState}
                items={[
                  ...(enableTargets.length && enableTargets.length <= 1000 ? [{ id: 'enable-filtered', label: `Enable filtered models (${enableTargets.length})`, onSelect: () => requestStateChange(true) }] : []),
                  ...(disableTargets.length && disableTargets.length <= 1000 ? [{ id: 'disable-filtered', label: `Disable filtered models (${disableTargets.length})`, onSelect: () => requestStateChange(false) }] : []),
                ]} />
              {selecting && selection.selected.length > 0 ? <Button variant="danger" disabled={isDeleting || isLoading || isUpdating} onClick={() => {
                setBulkError(null); setPendingBulk({
                  ids: selection.selected.map(item => item.id),
                  items: structuredClone(selection.selected),
                  scope: providerId,
                  companyId,
                })
              }}><IconTrash aria-hidden="true" />Remove</Button> : null}
              <IconButton label="Reload models" disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen || !!pendingDelete || !!pendingBulk || !!pendingState} onClick={() => void load()}><IconRefresh /></IconButton>
              <Button onClick={openCreate} disabled={!provider || isDeleting || isLoading || isUpdating}><IconPlus />Add Model</Button>
              {onClose ? <IconButton label="Close model manager" disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen || pendingDelete !== null || pendingBulk !== null} onClick={onClose}><IconX /></IconButton> : null}
            </>}
          />

          {!isLoading && capabilityWarnings.length > 0 ? (
            <details className="ai-model-capability-notice">
              <summary>{capabilityWarnings.length} models have unknown capabilities</summary>
              <p>The list is loaded. These models have incomplete capability metadata; other models remain available.</p>
              <ul>
                {capabilityWarnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            </details>
          ) : null}

          {isLoading ? (
            <p className="console-empty ai-settings-models-empty">
              Loading models…
            </p>
          ) : visibleModels.length === 0 ? (
            <div className="ai-settings-empty ai-settings-models-empty">
              <strong>
                {models.length ? 'No matching models' : 'No models added yet'}
              </strong>

              <p>
                {models.length ? 'No models match the current filters.' : 'Sync the catalog from Provider details, or add a model manually.'}
              </p>

              {models.length ? <Button variant="secondary" onClick={() => { setQuery(''); setStatusFilter('all'); setVendorFilter('all') }}>Clear filters</Button> : <Button
                onClick={openCreate}
                disabled={!provider || isUpdating || isDeleting || isLoading}
              >
                Add Model
              </Button>}
            </div>
          ) : (
            <div className="console-table-wrap" ref={tableRef}>
              <table className="console-table console-table--fixed ai-settings-model-table">
                <colgroup>
                  <col className="ai-model-col-name" />
                  <col className="ai-model-col-status" />
                  <col className="ai-model-col-type" />
                  <col className="ai-model-col-context" />
                  <col className="ai-model-col-used" />
                  <col className="ai-model-col-actions" />
                </colgroup>

                <thead>
                  <tr>
                    <th><span className="ai-settings-selection-name">{selection.enabled ? <input ref={selection.selectAllRef} type="checkbox" className="ai-settings-selection-checkbox" aria-label="Select all models on this page" disabled={isDeleting || isUpdating || !selection.hasSelectablePage} checked={selection.allSelected} onChange={event => selection.togglePage(event.target.checked)} /> : null}Model Name</span></th>

                    <th>
                      Status
                    </th>

                    <th>
                      Type
                    </th>

                    <th>
                      Context
                    </th>

                    <th>
                      Used by
                    </th>

                    <th className="console-table__actions">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedModels.map(
                    (model) => (
                      <tr key={model.id}>
                        <td>
                          <div className="ai-settings-selection-name">{selection.enabled ? <input type="checkbox" className="ai-settings-selection-checkbox" aria-label={`Select ${model.name}`} disabled={isDeleting || isUpdating || model.status !== 'disabled'} checked={selection.ids.includes(model.id)} onChange={event => selection.toggle(model.id, event.target.checked)} /> : null}
                            <div className="ai-settings-model-name">
                              <strong>
                                {model.name}
                              </strong>

                              <small>
                                {model.modelId}
                              </small>
                            </div>
                          </div>
                        </td>

                        <td>
                          <button
                            type="button"
                            className={`console-status console-status--${model.status ===
                              'enabled'
                              ? 'active'
                              : model.status
                              } console-status--clickable`}
                            disabled={isDeleting || isUpdating}
                            onClick={() =>
                              void toggleModel(
                                model,
                              )
                            }
                          >
                            {model.status}
                          </button>
                        </td>

                        <td>
                          <span className="console-chip">
                            {model.type}
                          </span>
                        </td>

                        <td>
                          {formatContext(
                            model.contextWindow,
                          )}
                        </td>

                        <td>
                          {model.usedByAgents > 0
                            ? `${model.usedByAgents} Agents`
                            : '—'}
                        </td>

                        <td className="console-table__actions identity-table__actions">
                          <div className="identity-inline-actions identity-directory-actions ai-model-management-actions">
                            {model.status === 'disabled' ? (
                              <IconButton label={`Delete ${model.name}`} variant="danger" disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen || !!pendingDelete || !!pendingBulk || !!pendingState} onClick={() => { setDeleteError(null); setPendingDelete(structuredClone(model)) }}><IconTrash /></IconButton>
                            ) : (
                              <IconButton label={`Edit ${model.name}`} disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen || !!pendingDelete || !!pendingBulk || !!pendingState} onClick={() => openEdit(model)}><IconPencil /></IconButton>
                            )}
                            <IconButton
                              label={`Refresh capabilities for ${model.name}`}
                              disabled={provider?.baseUrl.trim() !== 'https://openrouter.ai/api/v1' || isLoading || isSaving || isDeleting || isUpdating || formOpen || !!pendingDelete || !!pendingBulk || !!pendingState}
                              onClick={() => void handleRefreshCapabilities(model)}
                            ><IconCircleCheck /></IconButton>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
          <ModelsPagination
            id="models-pagination"
            total={visibleModels.length}
            pageSize={pageSize}
            autoPageSize={autoPageSize}
            effectivePageSize={effectivePageSize}
            currentPage={currentPage}
            pageCount={pageCount}
            pagesLabel="Model pages"
            onPageSizeChange={setPageSize}
            onPageChange={setPage}
          />
        </TablePanel>
      </div>

      <ConfirmDialog
        open={pendingState !== null}
        title={`${pendingState?.enabled ? 'Enable' : 'Disable'} ${pendingState?.items.length ?? 0} filtered models?`}
        description="This updates all captured filtered results, across pages, as one transaction. If any version changed, no models are updated."
        warning={pendingState?.enabled ? 'Enabled models become available under Browse all. This does not add them to recommendations.' : 'Bound Agents and any company default using these models will become unavailable until re-enabled or reassigned.'}
        confirmLabel={pendingState?.enabled ? 'Enable models' : 'Disable models'}
        cancelLabel="Cancel" busyLabel="Updating…" busy={isUpdating} error={stateError}
        onConfirm={() => void confirmStateChange()} onCancel={() => { if (!isUpdating) setPendingState(null) }}
      />

      <ConfirmDialog
        variant="deletion"
        className="ai-settings-delete-dialog"
        open={pendingBulk !== null}
        title={`Remove ${bulkItems.length} models?`}
        description={<div className="ai-settings-bulk-delete-copy"><p>The selected model configurations will be permanently removed from this provider.</p><ul className="ai-settings-bulk-delete-list">{bulkItems.map(item => <li key={item.id}>{item.name}</li>)}</ul></div>}
        warning="This cannot be undone."
        error={bulkError}
        busy={isDeleting}
        confirmDisabled={bulkItems.length < 2 || bulkItems.length !== pendingBulk?.ids.length || bulkItems.some(item => item.status !== 'disabled')}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        busyLabel="Removing…"
        onConfirm={removeSelectedModels}
        onCancel={() => { if (!isDeleting) { setPendingBulk(null); setBulkError(null) } }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        className="ai-settings-delete-dialog"
        title={`Delete "${pendingDelete?.name ?? 'model'}"?`}
        description="This model configuration will be permanently removed from this provider."
        warning="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busyLabel="Deleting…"
        busy={isDeleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => { if (!isDeleting) { setPendingDelete(null); setDeleteError(null) } }}
      />

      <SettingsEditor
        open={formOpen}
        title={
          editingId
            ? 'Edit Model'
            : 'Add Model'
        }
        description={`Configure a model for ${provider?.name ??
          'this provider'
          }.`}
        onClose={closeForm}
        busy={isSaving}
        closeLabel="Close"
        footer={
          <>
            <Button
              type="submit"
              form={MODEL_FORM_ID}
              disabled={isSaving}
            >
              {isSaving
                ? 'Saving…'
                : 'Save'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={closeForm}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </>
        }
      >
        <form
          className="ai-settings-form"
          id={MODEL_FORM_ID}
          onKeyDownCapture={(event) => {
            if (event.key === 'Escape' && openFormSelect) {
              event.preventDefault()
              event.stopPropagation()
              setOpenFormSelect(null)
            }
          }}
          onSubmit={(event) =>
            void handleSubmit(event)
          }
        >
          <SettingsEditorSection title="Basic Information" icon={<IconSpark />}>
            <FormField
              label="Model Name"
              htmlFor="model-name"
            >
              <TextField
                id="model-name"
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value,
                  )
                }
                placeholder="GPT-5"
                disabled={isSaving}
                autoFocus
              />
            </FormField>

            <FormField
              label="Model ID"
              htmlFor="model-id"
            >
              <TextField
                id="model-id"
                value={modelId}
                onChange={(event) =>
                  setModelId(
                    event.target.value,
                  )
                }
                placeholder="gpt-5"
                disabled={isSaving || editingId !== null}
              />
            </FormField>
          </SettingsEditorSection>
          <SettingsEditorSection title="Model Configuration" icon={<IconSettings />}><div className="ai-settings-editor-row">

            <FormField
              label="Type"
              htmlFor="model-type"
            >
              <SidebarSelect menuPortal
                id="model-type"
                open={openFormSelect === 'type'}
                onOpenChange={(open) => setOpenFormSelect(open ? 'type' : null)}
                label="Type"
                hideLabel
                className="console-form-select--down"
                value={type}
                options={[
                  {
                    value: 'chat',
                    label: 'Chat',
                  },
                  {
                    value:
                      'reasoning',
                    label:
                      'Reasoning',
                  },
                  {
                    value:
                      'embedding',
                    label:
                      'Embedding',
                  },
                  { value: 'other', label: 'Other / Unknown' },
                ]}
                onChange={(value) =>
                  setType(
                    value as ModelType,
                  )
                }
                disabled={isSaving}
              />
            </FormField>

            <FormField
              label="Context Window (0 = unknown)"
              htmlFor="model-context-window"
            >
              <TextField
                id="model-context-window"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                value={String(
                  contextWindow,
                )}
                onChange={(event) =>
                  setContextWindow(
                    Number(
                      event.target.value,
                    ) || 0,
                  )
                }
                disabled={isSaving}
              />
            </FormField>
          </div></SettingsEditorSection>
          <SettingsEditorSection title="Availability & Details" icon={<IconShieldCheck />}>

            <FormField
              label="Status"
              htmlFor="model-status"
            >
              <SidebarSelect menuPortal
                id="model-status"
                open={openFormSelect === 'status'}
                onOpenChange={(open) => setOpenFormSelect(open ? 'status' : null)}
                label="Status"
                hideLabel
                className="console-form-select--down"
                value={
                  enabled
                    ? 'enabled'
                    : 'disabled'
                }
                options={[
                  {
                    value:
                      'enabled',
                    label:
                      'Enabled',
                  },
                  {
                    value:
                      'disabled',
                    label:
                      'Disabled',
                  },
                ]}
                onChange={(value) =>
                  setEnabled(
                    value ===
                    'enabled',
                  )
                }
                disabled={isSaving || editingId === null}
              />
            </FormField>

            <FormField
              label="Description"
              htmlFor="model-description"
            >
              <TextField
                id="model-description"
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
                placeholder="What this model is best used for"
                disabled={isSaving}
              />
            </FormField>
          </SettingsEditorSection>
        </form>
      </SettingsEditor>
    </>
  )
}

function formatContext(value: number | null) {
  if (value === null) {
    return 'Unknown'
  }
  if (value >= 1_000_000) {
    return `${(
      value / 1_000_000
    ).toFixed(
      value % 1_000_000 === 0
        ? 0
        : 1,
    )}M`
  }

  if (value >= 1_000) {
    return `${Math.round(
      value / 1_000,
    )}K`
  }

  return String(value)
}
