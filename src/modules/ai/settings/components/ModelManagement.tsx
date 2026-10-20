import { useDisabledSelection } from '../hooks/useDisabledSelection'
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
import { TablePagination } from '@/components/ui/TablePagination'
import { IconPlus, IconTrash, IconPower, IconPencil, IconX } from '@/components/icons/Icons'
import { TextField } from '@/components/ui/TextField'

import {
  createModel,
  deleteModel,
  deleteModels,
  fetchProviders,
  fetchProvider,
  fetchProviderModels,
  setModelEnabled,
  updateModel,
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

export function ModelManagement({ providerId, initialCreate=false, onBusyChange, onClose }: ModelManagementProps) {
  const companyId = useCompanyStore((state) => state.companyId)
  const [pendingBulk, setPendingBulk] = useState<{ ids: string[]; scope: string; companyId: string } | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkSubmittingRef = useRef(false)
  const currentScopeRef = useRef(providerId)
  currentScopeRef.current = providerId
  useEffect(() => { setPendingBulk(null); setBulkError(null) }, [providerId, companyId])
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

  const [error, setError] =
    useState<string | null>(null)

  const [message, setMessage] =
    useState<string | null>(null)

  const [formOpen, setFormOpen] =
    useState(false)

  const [editingId, setEditingId] =
    useState<string | null>(null)

  const [name, setName] =
    useState('')

  const [modelId, setModelId] =
    useState('')

  const [type, setType] =
    useState<ModelType>('chat')

  const [contextWindow, setContextWindow] =
    useState(128000)

  const [enabled, setEnabled] =
    useState(true)

  const [description, setDescription] =
    useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const mutationRef = useRef(false)
  const loadSequence = useRef(0)
  const currentCompanyRef = useRef(companyId)
  currentCompanyRef.current = companyId

  useEffect(() => {
    onBusyChange?.(isSaving || isDeleting || isUpdating || isLoading || formOpen || pendingDelete !== null || pendingBulk !== null)
  }, [onBusyChange, isSaving, isDeleting, isUpdating, isLoading, formOpen, pendingDelete, pendingBulk])

  const load = useCallback(async () => {
    if (!providerId) return
    const request = ++loadSequence.current
    const isCurrent = () => request === loadSequence.current && currentScopeRef.current === providerId && currentCompanyRef.current === companyId
    setIsLoading(true)
    setError(null)

    try {
      await fetchProviders(companyId)
      const [nextProvider, modelResult] =
        await Promise.all([
          fetchProvider(providerId),
          fetchProviderModels(providerId),
        ])

      if (!isCurrent()) return
      if (nextProvider.companyId !== companyId) throw new Error('Provider is not available in the current company.')
      setProvider(nextProvider)
      setModels(modelResult.items.filter(model => model.providerId === providerId))
    } catch (caught) {
      if (!isCurrent()) return
      setProvider(null)
      setModels([])

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
    }, [models, query, statusFilter])

  const effectivePageSize = pageSize || autoPageSize
  const pageCount = Math.max(1, Math.ceil(visibleModels.length / effectivePageSize))
  const currentPage = Math.min(page, pageCount)
  const paginatedModels = visibleModels.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)
  const selection = useDisabledSelection(visibleModels, paginatedModels, statusFilter, query, `${companyId}:${providerId}`)
  const bulkItems = models.filter(item => pendingBulk?.ids.includes(item.id))

  useEffect(() => {
    if (tableRef.current) tableRef.current.scrollTop = 0
  }, [query, statusFilter, currentPage, effectivePageSize, providerId])


  // 条件变化时重置页码
  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, effectivePageSize, providerId])

  // Match Manage Templates: measure a stable, full-height table viewport.
  // Only a full Auto page shares the small remainder; short pages stay compact.
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
      if (pageSize === 0) {
        const limit = Math.max(1, Math.floor(availableHeight / naturalHeight))
        setAutoPageSize(current => current === limit ? current : limit)
        if (rows.length === limit) {
          const height = Math.max(naturalHeight, (availableHeight - 1) / limit)
          rows.forEach(row => { row.style.height = `${height}px` })
        }
      } else if (rows.length === pageSize) {
        // Match Templates: a full explicit page shares spare space; long pages scroll.
        const height = Math.max(naturalHeight, (availableHeight - 1) / rows.length)
        rows.forEach(row => { row.style.height = `${height}px` })
      }
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => row.style.removeProperty('height'))
    }
  }, [isLoading, visibleModels.length, pageSize, currentPage, effectivePageSize])


  function resetForm() {
    setOpenFormSelect(null)
    setEditingId(null)
    setName('')
    setModelId('')
    setType('chat')
    setContextWindow(128000)
    setEnabled(true)
    setDescription('')
    setError(null)
  }

  const initialCreatePending=useRef(initialCreate)
  useEffect(()=>{
    if(initialCreatePending.current&&!isLoading&&provider){
      initialCreatePending.current=false
      resetForm()
      setFormOpen(true)
    }
  },[isLoading,provider])

  function openCreate() {
    resetForm()
    setFormOpen(true)
  }

  function openEdit(model: AiModel) {
    setOpenFormSelect(null)
    setEditingId(model.id)
    setName(model.name)
    setModelId(model.modelId)
    setType(model.type)
    setContextWindow(model.contextWindow)
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

    if (!provider) return

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
      !Number.isFinite(contextWindow) ||
      contextWindow <= 0
    ) {
      setError(
        'Context window must be greater than zero.',
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
        await updateModel(
          editingId,
          payload,
        )

        setMessage(
          'Model updated successfully.',
        )
      } else {
        await createModel(payload)

        setMessage(
          'Model added successfully.',
        )
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

  async function toggleModel(
    model: AiModel,
  ) {
    if (mutationRef.current || isDeleting || isSaving) return
    mutationRef.current = true
    setIsUpdating(true)
    try {
      await setModelEnabled(
        model.id,
        model.status === 'disabled',
      )

      await load()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update model.',
      )
    } finally { mutationRef.current = false; setIsUpdating(false) }
  }

  async function handleDelete() {
    if (!pendingDelete || isDeleting || pendingDelete.status !== 'disabled' || pendingDelete.providerId !== providerId || useCompanyStore.getState().companyId !== companyId) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteModel(pendingDelete.id)
      setPendingDelete(null)
      setMessage('Model deleted successfully.')
      await load()
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Unable to delete model.')
    } finally { setIsDeleting(false) }
  }

  async function removeSelectedModels() {
    if (!pendingBulk || useCompanyStore.getState().companyId !== pendingBulk.companyId || pendingBulk.ids.length < 2 || bulkSubmittingRef.current || isDeleting || currentScopeRef.current !== pendingBulk.scope) return
    if (bulkItems.length !== pendingBulk.ids.length || bulkItems.some(item => item.status !== 'disabled')) {
      setBulkError('The selection has changed. Select disabled items again.')
      return
    }
    bulkSubmittingRef.current = true
    const deletingScope = pendingBulk.scope
    const deletingCompanyId = pendingBulk.companyId
    setBulkError(null)
    setIsDeleting(true)
    try {
      await deleteModels(deletingScope, pendingBulk.ids)
      if (useCompanyStore.getState().companyId !== deletingCompanyId || currentScopeRef.current !== deletingScope) return
      const deleted = new Set(pendingBulk.ids)
      setModels(current => current.filter(item => !deleted.has(item.id)))
      selection.clear()
      setPendingBulk(null)
      setMessage(`Removed ${deleted.size} models successfully.`)
    } catch (caught) {
      if (useCompanyStore.getState().companyId === deletingCompanyId && currentScopeRef.current === deletingScope) setBulkError(caught instanceof Error ? caught.message : 'Unable to remove selected models.')
    } finally {
      bulkSubmittingRef.current = false
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
        <TableToolbar
          search={
            <TextField
              className="ui-table-toolbar__search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models…"
              aria-label="Search models"
            />
          }
          filters={
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
          }
          actions={<>{selection.selected.length > 1 ? <Button variant="danger" disabled={isDeleting || isLoading || isUpdating} onClick={() => { setBulkError(null); setPendingBulk({ ids: selection.selected.map(item => item.id), scope: providerId, companyId }) }}><IconTrash aria-hidden="true" />Remove</Button> : null}<Button onClick={openCreate} disabled={!provider || isDeleting || isLoading || isUpdating}><IconPlus />Add Model</Button>{onClose ? <IconButton label="Close model manager" disabled={isLoading || isSaving || isDeleting || isUpdating || formOpen || pendingDelete !== null || pendingBulk !== null} onClick={onClose}><IconX /></IconButton> : null}</>}
        />

        {isLoading ? (
          <p className="console-empty ai-settings-models-empty">
            Loading models…
          </p>
        ) : visibleModels.length === 0 ? (
          <div className="ai-settings-empty ai-settings-models-empty">
            <strong>
              No models found
            </strong>

            <p>
              Add a model or change the current filters.
            </p>

            <Button
              onClick={openCreate}
              disabled={!provider}
            >
              Add Model
            </Button>
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
                          className={`console-status console-status--${
                            model.status ===
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
                            <IconButton label={`Delete ${model.name}`} variant="danger" disabled={isDeleting || isUpdating} onClick={() => { setDeleteError(null); setPendingDelete(model) }}><IconTrash /></IconButton>
                          ) : (
                            <IconButton label={`Edit ${model.name}`} disabled={isDeleting || isUpdating} onClick={() => openEdit(model)}><IconPencil /></IconButton>
                          )}
                          <IconButton
                            label={model.status === 'disabled' ? `Enable ${model.name}` : `Disable ${model.name}`}
                            variant={model.status === 'disabled' ? 'secondary' : 'ghost'}
                            disabled={isDeleting || isUpdating}
                            aria-pressed={model.status !== 'disabled'}
                            onClick={() => void toggleModel(model)}
                          ><IconPower /></IconButton>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination
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
        description={`Configure a model for ${
          provider?.name ??
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
                disabled={isSaving}
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
              label="Context Window"
              htmlFor="model-context-window"
            >
              <TextField
                id="model-context-window"
                type="number"
                min="1"
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
                disabled={isSaving}
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

function formatContext(
  value: number,
) {
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
