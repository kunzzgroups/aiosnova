import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SearchableCheckList } from '@/components/ui/SearchableCheckList'
import { FormField } from '@/components/ui/FormField'
import { Drawer } from '@/components/ui/Drawer'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { useCompanyStore } from '@/stores/companyStore'
import { fetchKnowledgeBases } from '@/modules/ai/knowledge/services/knowledgeService'
import type { KnowledgeBaseListItem } from '@/modules/ai/knowledge/types/knowledge'
import { ApiError } from '@/services/httpClient'
import { fetchAssistantModelOptions, type AssistantModelOption } from '@/modules/ai/settings/services/settingsService'
import { createAgent, deleteAgent, fetchAgent, fetchAgents, updateAgent } from '../services/agentService'
import { IconPlus, IconPencil, IconTrash } from '@/components/icons/Icons'
import { TablePanel } from '@/components/ui/TablePanel'
import { TablePagination } from '@/components/ui/TablePagination'
import { TableToolbar } from '@/components/ui/TableToolbar'
import {
  DEFAULT_AGENT_MODEL,
  type AgentListItem,
  type AgentModelConfig,
  type AgentStatus,
} from '../types/agent'
import '@/modules/ai/shared/AiConsole.css'
import './AgentsPage.css'

const AGENT_FORM_ID = 'agent-form'

const STATUS_LABEL_KEY: Record<AgentStatus, string> = {
  active: 'ai.agents.statusActive',
  draft: 'ai.agents.statusDraft',
  disabled: 'ai.agents.statusDisabled',
}

export function AgentsPage() {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)

  const [searchParams, setSearchParams] = useSearchParams()
  const highlightAgentId = searchParams.get('agentId')
  const baseIdFilter = searchParams.get('baseId')

  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [createStatus, setCreateStatus] = useState<Extract<AgentStatus, 'active' | 'draft'>>('active')
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDeleteAgent, setPendingDeleteAgent] = useState<AgentListItem | null>(null)
  const [isDeletingAgent, setIsDeletingAgent] = useState(false)

  const editingAgent = useMemo(
    () =>
      editingId
        ? agents.find((agent) => agent.id === editingId) ?? null
        : null,
    [agents, editingId],
  )
  const canAssignKnowledge =
    editingAgent !== null
      ? editingAgent.status === 'active'
      : createStatus === 'active'

  const [provider, setProvider] = useState<'auto' | 'specific'>('auto')
  const [model, setModel] = useState('')
  const [modelOptions, setModelOptions] = useState<AssistantModelOption[]>([])
  const [modelOptionsCompany, setModelOptionsCompany] = useState('')
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null)
  const currentModelOptions = modelOptionsCompany === companyId ? modelOptions : []

  useEffect(() => {
    let active = true
    setModelOptionsError(null)
    setModelOptionsCompany('')
    void fetchAssistantModelOptions(companyId).then(options => {
      if (!active) return
      setModelOptions(options)
      setModelOptionsCompany(companyId)
    }).catch(caught => {
      if (active) setModelOptionsError(caught instanceof Error ? caught.message : 'Unable to load company models.')
    })
    return () => { active = false }
  }, [companyId, formOpen])

  useEffect(() => { setFormOpen(false); setEditingId(null) }, [companyId])
  const [temperature, setTemperature] = useState(0.3)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // ---- 分页状态 (完全对齐 Employees) ----
  const [pageSize, setPageSize] = useState(0) // 0 代表自动适应
  const [autoPageSize, setAutoPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const tableRef = useRef<HTMLDivElement>(null)
  const autoFitRowMeasurement = useRef({ width: 0, height: 0 })

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [agentsResult, basesResult] = await Promise.all([
        fetchAgents(companyId),
        fetchKnowledgeBases(companyId),
      ])
      setAgents(agentsResult.items)
      setKnowledgeBases(basesResult.items)
    } catch {
      setAgents([])
      setKnowledgeBases([])
      setError(t('ai.agents.errLoad'))
    } finally {
      setIsLoading(false)
    }
  }, [companyId, t])

  useEffect(() => {
    void load()
  }, [load])

  const baseItems = useMemo(
    () =>
      knowledgeBases.map((base) => ({
        value: base.id,
        label: base.name,
        hint: t('ai.knowledge.documentCount', { count: base.documentCount }),
      })),
    [knowledgeBases, t],
  )

  const activeBase = useMemo(
    () =>
      baseIdFilter
        ? knowledgeBases.find((base) => base.id === baseIdFilter) ?? null
        : null,
    [baseIdFilter, knowledgeBases],
  )

  const visibleAgents = useMemo(() => {
    let list = agents
    if (baseIdFilter) {
      list = list.filter((agent) => agent.knowledgeBaseIds?.includes(baseIdFilter))
    }
    const needle = query.trim().toLowerCase()
    if (needle) {
      list = list.filter(
        (agent) =>
          agent.name.toLowerCase().includes(needle) ||
          agent.description.toLowerCase().includes(needle),
      )
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [agents, baseIdFilter, query])

  // ---- 分页计算逻辑 (完全对齐 Employees) ----
  const effectivePageSize = pageSize || autoPageSize
  const pageCount = Math.max(1, Math.ceil(visibleAgents.length / effectivePageSize))
  const currentPage = Math.min(page, pageCount)
  const paginatedAgents = visibleAgents.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)

  // 条件变化时重置页码
  useEffect(() => {
    setPage(1)
  }, [query, baseIdFilter, effectivePageSize])

  // 自动高度测量逻辑 (完全对齐 Employees)
  useEffect(() => {
    if (isLoading || !visibleAgents.length) return
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return
    let frame = 0

    function measureRows() {
      if (!container || !table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      if (!rows.length) return
      rows.forEach(row => row.style.removeProperty('height'))

      const availableHeight = container.clientHeight - (table.querySelector('thead')?.getBoundingClientRect().height ?? 0)
      if (availableHeight <= 0) return

      const width = container.clientWidth
      if (autoFitRowMeasurement.current.width !== width) {
        autoFitRowMeasurement.current = { width, height: 0 }
      }

      if (currentPage === 1 || !autoFitRowMeasurement.current.height) {
        const naturalHeight = Math.max(1, ...rows.map(row => row.getBoundingClientRect().height))
        autoFitRowMeasurement.current.height = Math.max(autoFitRowMeasurement.current.height, naturalHeight)
      }

      const naturalHeight = autoFitRowMeasurement.current.height
      if (pageSize === 0) {
        const limit = Math.max(1, Math.floor(availableHeight / naturalHeight))
        setAutoPageSize(current => current === limit ? current : limit)

        const uniformHeight = Math.max(naturalHeight, availableHeight / limit)
        rows.forEach(row => { row.style.height = uniformHeight + 'px' })
        return
      }

      // Explicit page sizes (10 / 25 / ...):
      // when the current page is full, distribute the small amount of spare
      // height across those rows so the footer sits directly under the table.
      // Do not stretch a short final page into giant rows.
      if (rows.length === pageSize) {
        const uniformHeight = Math.max(naturalHeight, availableHeight / rows.length)
        rows.forEach(row => { row.style.height = uniformHeight + 'px' })
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
  }, [isLoading, visibleAgents.length, pageSize, currentPage, effectivePageSize])

  function clearBaseFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('baseId')
    next.delete('agentId')
    setSearchParams(next, { replace: true })
  }

  function resetModelFields(config?: AgentModelConfig) {
    const c = config ?? DEFAULT_AGENT_MODEL
    setProvider(c.binding || c.provider !== 'auto' ? 'specific' : 'auto')
    setModel(c.binding?.modelConfigId ?? '')
    setTemperature(c.temperature)
    setAdvancedOpen(false)
  }

  function openCreate() {
    setEditingId(null)
    setName('')
    setDescription('')
    setCreateStatus('active')
    setSelectedBaseIds([])
    resetModelFields()
    setError(null)
    setFormOpen(true)
  }

  async function openEdit(agent: AgentListItem) {
    setEditingId(agent.id)
    setName(agent.name)
    setDescription(agent.description)
    setCreateStatus('active')
    setSelectedBaseIds([])
    resetModelFields(agent.model)
    setError(null)
    setFormOpen(true)
    try {
      const detail = await fetchAgent(agent.id)
      setSelectedBaseIds(detail.knowledgeBaseIds)
      resetModelFields(detail.agent.model)
    } catch {
      setError(t('ai.agents.errLoad'))
    }
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
  }

  function toggleBase(baseId: string) {
    if (!canAssignKnowledge) return
    setSelectedBaseIds((current) =>
      current.includes(baseId)
        ? current.filter((id) => id !== baseId)
        : [...current, baseId],
    )
  }

  function onProviderChange(next: 'auto' | 'specific') {
    setProvider(next)
    setModel('')
  }

  async function cycleAgentStatus(agentId: string, current: AgentStatus) {
    const next: AgentStatus =
      current === 'active'
        ? 'draft'
        : current === 'draft'
          ? 'disabled'
          : 'active'

    try {
      await updateAgent(agentId, {
        status: next,
        ...(next === 'active' ? {} : { knowledgeBaseIds: [] }),
      })
      await load()
    } catch {
      setError(t('ai.agents.errSave'))
    }
  }

  async function handleDeleteAgent() {
    if (!pendingDeleteAgent || isDeletingAgent) return

    setIsDeletingAgent(true)
    setError(null)

    try {
      const deletedAgentId = pendingDeleteAgent.id

      await deleteAgent(deletedAgentId)
      setPendingDeleteAgent(null)
      setMessage(t('ai.agents.msgDeleted', 'Agent deleted.'))

      if (highlightAgentId === deletedAgentId) {
        const next = new URLSearchParams(searchParams)
        next.delete('agentId')
        setSearchParams(next, { replace: true })
      }

      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t('ai.agents.errDelete', 'Unable to delete this agent.'),
      )
    } finally {
      setIsDeletingAgent(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError(t('ai.agents.errNameRequired'))
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const freshOptions = provider === 'specific' ? await fetchAssistantModelOptions(companyId) : []
      if (useCompanyStore.getState().companyId !== companyId) throw new Error('The company changed. Reopen the form.')
      const selected = freshOptions.find(option => option.id === model)
      if (provider === 'specific' && !selected) throw new Error('Select an enabled database model for this company. Legacy configurations must be reselected.')
      const modelPayload: AgentModelConfig = {
        provider: 'auto',
        model: selected?.modelId ?? '',
        binding: selected ? { providerId: selected.providerId, modelConfigId: selected.id } : undefined,
        temperature,
        topP: 1,
        maxTokens: 2048,
      }
      if (editingId) {
        await updateAgent(editingId, {
          name,
          description,
          knowledgeBaseIds: canAssignKnowledge ? selectedBaseIds : [],
          model: modelPayload,
        })
        setMessage(t('ai.agents.msgUpdated'))
      } else {
        await createAgent({
          name,
          description,
          companyId,
          status: createStatus,
          knowledgeBaseIds: createStatus === 'active' ? selectedBaseIds : [],
          model: modelPayload,
        })
        setMessage(t('ai.agents.msgCreated'))
      }
      closeForm()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.agents.errSave'))
    } finally {
      setIsSaving(false)
    }
  }

  const isEmpty = !isLoading && visibleAgents.length === 0

  return (
    <div className="console-page console-page--internal-table-scroll ai-agents-page">
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      <TablePanel>
        <TableToolbar
          search={
            <TextField
              className="ui-table-toolbar__search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('ai.agents.searchPlaceholder', 'Search agents…')}
              aria-label={t('ai.agents.searchAria', 'Search agents')}
            />
          }
          actions={
            <Button onClick={openCreate}>
              <IconPlus />
              {t('ai.agents.newAgent')}
            </Button>
          }
        />

        {activeBase ? (
          <div className="console-filter-chip" style={{ margin: '0 24px 12px' }}>
            <span>{t('ai.agents.filteredByKnowledge', { name: activeBase.name })}</span>
            <button
              type="button"
              className="console-filter-chip__clear"
              onClick={clearBaseFilter}
              aria-label={t('common.dismiss')}
            >
              ×
            </button>
          </div>
        ) : null}

        {/* 表格区域：绑定 ref 用于自动高度测量 */}
        {isLoading ? (
          <p className="console-empty" style={{ padding: '0 24px 24px' }}>{t('ai.agents.loading')}</p>
        ) : isEmpty ? (
          <p className="console-empty" style={{ padding: '0 24px 24px' }}>
            {agents.length === 0 ? t('ai.agents.empty') : t('ai.agents.emptyFiltered')}
          </p>
        ) : (
          <>
            <div className="console-table-wrap" ref={tableRef}>
              <table className="console-table console-table--fixed console-table--agents">
                <colgroup>
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('ai.agents.colName')}</th>
                    <th>{t('ai.agents.colDescription')}</th>
                    <th>{t('ai.agents.colModel')}</th>
                    <th>{t('ai.agents.colKnowledge')}</th>
                    <th>{t('ai.agents.colStatus')}</th>
                    <th className="console-table__actions identity-table__actions">{t('ai.agents.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAgents.map((agent) => (
                    <tr
                      key={agent.id}
                      className={
                        agent.id === highlightAgentId
                          ? 'console-table__row--highlight'
                          : undefined
                      }
                    >
                      <td>
                        <span className="console-table__name">
                          <span>{agent.name}</span>
                        </span>
                      </td>
                      <td className="console-table__muted">{agent.description || '—'}</td>
                      <td>
                        {agent.model && (agent.model.binding || agent.model.provider !== 'auto') ? (
                          <span className="console-chip">
                            {currentModelOptions.find(option => option.id === agent.model?.binding?.modelConfigId && option.providerId === agent.model.binding.providerId)?.label ?? (agent.model.binding ? 'Bound model unavailable' : 'Legacy configuration: reselect a model')}
                          </span>
                        ) : (
                          <span className="console-chip console-chip--muted">
                            {t('ai.agents.modelAuto', 'Auto')}
                          </span>
                        )}
                      </td>
                      <td>
                        {agent.knowledgeBaseCount > 0 ? (
                          <Link
                            className="console-chip console-chip--link"
                            to={`/ai/ai/knowledge?agentId=${encodeURIComponent(agent.id)}`}
                          >
                            {t('ai.agents.knowledgeCount', {
                              count: agent.knowledgeBaseCount,
                            })}
                          </Link>
                        ) : (
                          <span className="console-chip console-chip--muted">
                            {t('ai.agents.knowledgeCountNone')}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`console-status console-status--${agent.status} console-status--clickable`}
                          onClick={() => void cycleAgentStatus(agent.id, agent.status)}
                          title={t('ai.agents.statusClickHint', 'Click to change status')}
                        >
                          {t(STATUS_LABEL_KEY[agent.status])}
                        </button>
                      </td>
                      <td className="console-table__actions identity-table__actions">
                        <div className="identity-inline-actions identity-directory-actions">
                          <IconButton
                            label={t('ai.agents.edit')}
                            variant="secondary"
                            onClick={() => void openEdit(agent)}
                          >
                            <IconPencil />
                          </IconButton>
                          <IconButton
                            label={t(
                              'ai.agents.delete',
                              'Delete {{name}}',
                              { name: agent.name },
                            )}
                            variant="danger"
                            disabled={isDeletingAgent}
                            onClick={() => setPendingDeleteAgent(agent)}
                          >
                            <IconTrash />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页组件 */}
            <TablePagination
              id="agents-pagination"
              total={visibleAgents.length}
              pageSize={pageSize}
              autoPageSize={autoPageSize}
              effectivePageSize={effectivePageSize}
              currentPage={currentPage}
              pageCount={pageCount}
              pagesLabel={t('users.directoryPages')}
              onPageSizeChange={setPageSize}
              onPageChange={setPage}
            />
          </>
        )}
      </TablePanel>

      <ConfirmDialog
        open={pendingDeleteAgent !== null}
        title={t(
          'ai.agents.deleteTitle',
          'Delete "{{name}}"?',
          { name: pendingDeleteAgent?.name ?? '' },
        )}
        description={t(
          'ai.agents.deleteBody',
          'This agent will be removed from AI Assistant and from every knowledge-base and document assignment.',
        )}
        warning={t(
          'ai.agents.deleteWarning',
          'This cannot be undone.',
        )}
        confirmLabel={t('ai.agents.deleteConfirm', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        busyLabel={t('ai.agents.deleting', 'Deleting…')}
        busy={isDeletingAgent}
        onConfirm={() => void handleDeleteAgent()}
        onCancel={() => {
          if (!isDeletingAgent) {
            setPendingDeleteAgent(null)
          }
        }}
      />

      <Drawer
        open={formOpen}
        title={editingId ? t('ai.agents.editTitle') : t('ai.agents.newTitle')}
        description={editingId ? t('ai.agents.editHint') : t('ai.agents.newHint')}
        onClose={closeForm}
        busy={isSaving}
        closeLabel={t('common.dismiss')}
        footer={
          <>
            <Button type="submit" form={AGENT_FORM_ID} disabled={isSaving}>
              {isSaving
                ? t('ai.agents.saving')
                : editingId
                  ? t('ai.agents.save')
                  : t('ai.agents.create')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={closeForm}
              disabled={isSaving}
            >
              {t('ai.agents.cancel')}
            </Button>
          </>
        }
      >
        <form id={AGENT_FORM_ID} onSubmit={(event) => void handleSubmit(event)}>
          <div className="console-form__grid">
            <FormField label={t('ai.agents.fieldName')} htmlFor="agent-name">
              <TextField
                id="agent-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('ai.agents.namePlaceholder')}
                disabled={isSaving}
                autoComplete="off"
                autoFocus
              />
            </FormField>
            <FormField
              label={t('ai.agents.fieldDescription')}
              htmlFor="agent-description"
            >
              <TextField
                id="agent-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('ai.agents.descriptionPlaceholder')}
                disabled={isSaving}
                autoComplete="off"
              />
            </FormField>
          </div>

          {!editingId ? (
            <div className="console-form__section">
              <h4>{t('ai.agents.initialStatus', 'Initial status')}</h4>
              <p>
                {t(
                  'ai.agents.initialStatusHint',
                  'Active agents can be assigned immediately. Draft agents stay unassigned until activated.',
                )}
              </p>

              <div className="console-form__grid">
                <FormField
                  label={t('ai.agents.fieldStatus', 'Status')}
                  htmlFor="agent-create-status"
                >
                  <SidebarSelect
                    id="agent-create-status"
                    className="console-form-select--down"
                    label={t('ai.agents.fieldStatus', 'Status')}
                    value={createStatus}
                    options={[
                      {
                        value: 'active',
                        label: t('ai.agents.statusActive', 'Active'),
                      },
                      {
                        value: 'draft',
                        label: t('ai.agents.statusDraft', 'Draft'),
                      },
                    ]}
                    onChange={(value) => {
                      const next = value as 'active' | 'draft'
                      setCreateStatus(next)
                      if (next === 'draft') setSelectedBaseIds([])
                    }}
                    disabled={isSaving}
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="console-form__section">
            <h4>{t('ai.agents.modelTitle', 'Model')}</h4>
            <p>
              Follow the current Assistant selection or bind an enabled model configuration from this company. Reselect and save legacy configurations.
            </p>

            <div className="console-form__grid">
              <FormField
                label="Model selection"
                htmlFor="agent-provider"
              >
                <SidebarSelect
                  id="agent-provider"
                  className="console-form-select--down"
                  label="Model selection"
                  value={provider}
                  options={[{ value: 'auto', label: 'Follow Assistant selection' }, { value: 'specific', label: 'Use a specific model' }]}
                  onChange={(value) => onProviderChange(value as 'auto' | 'specific')}
                  disabled={isSaving}
                />
              </FormField>

              <FormField
                label={t('ai.agents.fieldModel', 'Model')}
                htmlFor="agent-model"
              >
                <SidebarSelect
                  id="agent-model"
                  label={t('ai.agents.fieldModel', 'Model')}
                  value={model}
                  options={[
                    { value: '', label: provider === 'auto' ? 'Follow Assistant selection' : 'Select a model configuration' },
                    ...currentModelOptions.map(option => ({ value: option.id, label: `${option.label} · ${option.modelId}` })),
                    ...(model && !currentModelOptions.some(option => option.id === model) ? [{ value: model, label: 'Original binding unavailable; select a replacement' }] : []),
                  ]}
                  onChange={setModel}
                  disabled={isSaving || provider === 'auto' || modelOptionsCompany !== companyId}
                />
              </FormField>
            </div>

            {modelOptionsError ? <p role="alert">{modelOptionsError}</p> : null}
            <button
              type="button"
              className="console-form__toggle"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
            >
              <span className="console-form__toggle-caret">
                {advancedOpen ? '▾' : '▸'}
              </span>
              {t('ai.agents.advanced', 'Advanced')}
            </button>

            {advancedOpen ? (
              <div className="console-form__grid">
                <FormField label="Temperature" htmlFor="agent-temp">
                  <TextField
                    id="agent-temp"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={String(temperature)}
                    onChange={(e) => setTemperature(Number(e.target.value) || 0)}
                    disabled={isSaving}
                  />
                </FormField>
              </div>
            ) : null}
          </div>

          <div className="console-form__section">
            <h4>
              {t('ai.agents.knowledgeTitle')}
              {selectedBaseIds.length > 0 ? (
                <span className="console-form__count">
                  {t('ai.agents.knowledgeSelected', {
                    count: selectedBaseIds.length,
                  })}
                </span>
              ) : null}
            </h4>
            <p>
              {!editingId && createStatus === 'draft'
                ? t(
                    'ai.agents.draftKnowledgeHint',
                    'Draft agents cannot be assigned to knowledge bases. Activate the agent first.',
                  )
                : t('ai.agents.knowledgeHint')}
            </p>
            <SearchableCheckList
              items={baseItems}
              selected={selectedBaseIds}
              onToggle={toggleBase}
              emptyLabel={t('ai.agents.noKnowledgeBases')}
              noMatchLabel={t('ai.agents.knowledgeSearchNoMatch')}
              searchPlaceholder={t('ai.agents.knowledgeSearchPlaceholder')}
              searchAriaLabel={t('ai.agents.knowledgeSearchAria')}
              listAriaLabel={t('ai.agents.knowledgeTitle')}
              disabled={isSaving || !canAssignKnowledge}
            />
          </div>
        </form>
      </Drawer>
    </div>
  )
}
