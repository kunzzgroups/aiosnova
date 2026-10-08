import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
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
import { createAgent, fetchAgent, fetchAgents, updateAgent } from '../services/agentService'
import {
  DEFAULT_AGENT_MODEL,
  type AgentListItem,
  type AgentModelConfig,
  type AgentModelProvider,
  type AgentStatus,
} from '../types/agent'
import '@/modules/ai/shared/AiConsole.css'

const AGENT_FORM_ID = 'agent-form'

const STATUS_LABEL_KEY: Record<AgentStatus, string> = {
  active: 'ai.agents.statusActive',
  draft: 'ai.agents.statusDraft',
  disabled: 'ai.agents.statusDisabled',
}

const OTHER_CATEGORY = 'Other'

const MODEL_PROVIDERS: Array<{ value: AgentModelProvider; label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'azure', label: 'Azure OpenAI' },
]

const MODELS_BY_PROVIDER: Record<AgentModelProvider, string[]> = {
  auto: [''],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'],
  anthropic: ['claude-3.5-sonnet', 'claude-3.5-haiku', 'claude-3-opus'],
  google: ['gemini-2.0-pro', 'gemini-2.0-flash'],
  azure: ['gpt-4o-azure', 'gpt-4-turbo-azure'],
}

/**
 * The Agent screen, and one half of the agent <-> knowledge relation.
 *
 * Rows are grouped by `agent.category` using one <tbody> per group, so the
 * table header still aligns across every category.
 *
 * Deep links:
 *   ?agentId=<id>  -> highlight that agent's row
 *   ?baseId=<id>   -> keep only agents linked to that knowledge base
 */
export function AgentsPage() {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)

  const [searchParams, setSearchParams] = useSearchParams()
  const highlightAgentId = searchParams.get('agentId')
  const baseIdFilter = searchParams.get('baseId')

  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // ---- Model configuration ----
  const [provider, setProvider] = useState<AgentModelProvider>('auto')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.3)
  const [advancedOpen, setAdvancedOpen] = useState(false)

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

  const companyName = companies.find((item) => item.value === companyId)?.label ?? ''

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
    if (!baseIdFilter) {
      return agents
    }
    return agents.filter((agent) => agent.knowledgeBaseIds?.includes(baseIdFilter))
  }, [agents, baseIdFilter])

  const groupedAgents = useMemo(() => {
    const buckets = new Map<string, AgentListItem[]>()
    for (const agent of visibleAgents) {
      const key = agent.category?.trim() || OTHER_CATEGORY
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.push(agent)
      } else {
        buckets.set(key, [agent])
      }
    }

    const entries = [...buckets.entries()]
    const otherIndex = entries.findIndex(([key]) => key === OTHER_CATEGORY)
    if (otherIndex > -1 && otherIndex < entries.length - 1) {
      const [other] = entries.splice(otherIndex, 1)
      entries.push(other)
    }
    return entries
  }, [visibleAgents])

  function clearBaseFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('baseId')
    next.delete('agentId')
    setSearchParams(next, { replace: true })
  }

  function resetModelFields(config?: AgentModelConfig) {
    const c = config ?? DEFAULT_AGENT_MODEL
    setProvider(c.provider)
    setModel(c.model)
    setTemperature(c.temperature)
    setAdvancedOpen(false)
  }

  function openCreate() {
    setEditingId(null)
    setName('')
    setDescription('')
    setSelectedBaseIds([])
    resetModelFields()
    setError(null)
    setFormOpen(true)
  }

  async function openEdit(agent: AgentListItem) {
    setEditingId(agent.id)
    setName(agent.name)
    setDescription(agent.description)
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
    setSelectedBaseIds((current) =>
      current.includes(baseId)
        ? current.filter((id) => id !== baseId)
        : [...current, baseId],
    )
  }

  function onProviderChange(next: AgentModelProvider) {
    setProvider(next)
    setModel(MODELS_BY_PROVIDER[next][0] ?? '')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError(t('ai.agents.errNameRequired'))
      return
    }

    setIsSaving(true)
    setError(null)

    const modelPayload: AgentModelConfig = {
      provider,
      model,
      temperature,
      topP: 1,
      maxTokens: 4096,
    }

    try {
      if (editingId) {
        await updateAgent(editingId, {
          name,
          description,
          knowledgeBaseIds: selectedBaseIds,
          model: modelPayload,
        })
        setMessage(t('ai.agents.msgUpdated'))
      } else {
        await createAgent({
          name,
          description,
          companyId,
          knowledgeBaseIds: selectedBaseIds,
          model: modelPayload,
        })
        setMessage(t('ai.agents.msgCreated'))
      }
      closeForm()
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('ai.agents.errSave'))
    } finally {
      setIsSaving(false)
    }
  }

  const isEmpty = !isLoading && visibleAgents.length === 0

  return (
    <div className="console-page">
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      <section className="console-panel">
        <div className="console-panel__title-row">
          <h2>{t('ai.agents.listTitle')}</h2>
          <Button onClick={openCreate}>{t('ai.agents.newAgent')}</Button>
        </div>
        <p className="console-hint">
          {companyName
            ? t('ai.agents.companyScope', { company: companyName })
            : t('ai.agents.companyScopeUnknown')}
        </p>

        {activeBase ? (
          <div className="console-filter-chip">
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

        {isLoading ? (
          <p className="console-empty">{t('ai.agents.loading')}</p>
        ) : isEmpty ? (
          <p className="console-empty">
            {agents.length === 0 ? t('ai.agents.empty') : t('ai.agents.emptyFiltered')}
          </p>
        ) : (
          <div className="console-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('ai.agents.colName')}</th>
                  <th>{t('ai.agents.colDescription')}</th>
                  <th>{t('ai.agents.colModel')}</th>
                  <th>{t('ai.agents.colKnowledge')}</th>
                  <th>{t('ai.agents.colStatus')}</th>
                  <th className="console-table__actions">{t('ai.agents.colActions')}</th>
                </tr>
              </thead>
              {groupedAgents.map(([category, items]) => (
                <tbody key={category} className="console-table__group">
                  <tr className="console-table__group-row">
                    <td colSpan={6}>
                      <span className="console-table__group-label">{category}</span>
                      <span className="console-table__group-count">{items.length}</span>
                    </td>
                  </tr>
                  {items.map((agent) => (
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
                        {agent.model && agent.model.provider !== 'auto' ? (
                          <span className="console-chip">
                            {agent.model.provider} · {agent.model.model || '—'}
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
                        <span className={`console-status console-status--${agent.status}`}>
                          {t(STATUS_LABEL_KEY[agent.status])}
                        </span>
                      </td>
                      <td className="console-table__actions">
                        <Button variant="secondary" onClick={() => void openEdit(agent)}>
                          {t('ai.agents.edit')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>

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

          {/* ---- Model section ---- */}
          <div className="console-form__section">
            <h4>{t('ai.agents.modelTitle', 'Model')}</h4>
            <p>
              {t(
                'ai.agents.modelHint',
                'Which LLM this agent uses. Auto picks the best model for its knowledge.',
              )}
            </p>

            <div className="console-form__grid">
              <FormField
                label={t('ai.agents.fieldProvider', 'Provider')}
                htmlFor="agent-provider"
              >
                <SidebarSelect
                  id="agent-provider"
                  label={t('ai.agents.fieldProvider', 'Provider')}
                  value={provider}
                  options={MODEL_PROVIDERS}
                  onChange={(value) => onProviderChange(value as AgentModelProvider)}
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
                  options={MODELS_BY_PROVIDER[provider].map((m) => ({
                    value: m,
                    label: m || t('ai.agents.modelAuto', 'Auto'),
                  }))}
                  onChange={setModel}
                  disabled={isSaving || provider === 'auto'}
                />
              </FormField>
            </div>

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
                <FormField
                  label={t('ai.agents.fieldTemperature', 'Temperature')}
                  htmlFor="agent-temp"
                >
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
            <p>{t('ai.agents.knowledgeHint')}</p>
            <SearchableCheckList
              items={baseItems}
              selected={selectedBaseIds}
              onToggle={toggleBase}
              emptyLabel={t('ai.agents.noKnowledgeBases')}
              noMatchLabel={t('ai.agents.knowledgeSearchNoMatch')}
              searchPlaceholder={t('ai.agents.knowledgeSearchPlaceholder')}
              searchAriaLabel={t('ai.agents.knowledgeSearchAria')}
              listAriaLabel={t('ai.agents.knowledgeTitle')}
              disabled={isSaving}
            />
          </div>
        </form>
      </Drawer>
    </div>
  )
}
