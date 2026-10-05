import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { SearchableCheckList } from '@/components/ui/SearchableCheckList'
import { FormField } from '@/components/ui/FormField'
import { Drawer } from '@/components/ui/Drawer'
import { TextField } from '@/components/ui/TextField'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { useCompanyStore } from '@/stores/companyStore'
import { fetchKnowledgeBases } from '@/modules/ai/knowledge/services/knowledgeService'
import type { KnowledgeBaseListItem } from '@/modules/ai/knowledge/types/knowledge'
import { ApiError } from '@/services/httpClient'
import { createAgent, fetchAgent, fetchAgents, updateAgent } from '../services/agentService'
import type { AgentListItem, AgentStatus } from '../types/agent'
import '@/modules/ai/shared/AiConsole.css'

const AGENT_FORM_ID = 'agent-form'

const STATUS_LABEL_KEY: Record<AgentStatus, string> = {
  active: 'ai.agents.statusActive',
  draft: 'ai.agents.statusDraft',
  disabled: 'ai.agents.statusDisabled',
}

/**
 * The Agent screen, and one half of the agent <-> knowledge relation.
 *
 * Ticking a knowledge base here writes `agentKnowledgeLinks` through
 * `PATCH /api/agents/:id` - the same rows the knowledge base's Agents tab writes.
 * Neither screen caches its own copy, so both always agree.
 *
 * Create / edit happens in a right-hand `Drawer`, so the table stays visible
 * behind it. Scoped to the ACTIVE company, like the Knowledge screen.
 */
export function AgentsPage() {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)

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

  function openCreate() {
    setEditingId(null)
    setName('')
    setDescription('')
    setSelectedBaseIds([])
    setError(null)
    setFormOpen(true)
  }

  async function openEdit(agent: AgentListItem) {
    setEditingId(agent.id)
    setName(agent.name)
    setDescription(agent.description)
    setSelectedBaseIds([])
    setError(null)
    setFormOpen(true)
    try {
      // The list row only carries a COUNT; the ticks have to be fetched.
      const detail = await fetchAgent(agent.id)
      setSelectedBaseIds(detail.knowledgeBaseIds)
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
      current.includes(baseId) ? current.filter((id) => id !== baseId) : [...current, baseId],
    )
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
      if (editingId) {
        await updateAgent(editingId, { name, description, knowledgeBaseIds: selectedBaseIds })
        setMessage(t('ai.agents.msgUpdated'))
      } else {
        await createAgent({ name, description, companyId, knowledgeBaseIds: selectedBaseIds })
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

        {isLoading ? (
          <p className="console-empty">{t('ai.agents.loading')}</p>
        ) : agents.length === 0 ? (
          <p className="console-empty">{t('ai.agents.empty')}</p>
        ) : (
          <div className="console-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('ai.agents.colName')}</th>
                  <th>{t('ai.agents.colDescription')}</th>
                  <th>{t('ai.agents.colKnowledge')}</th>
                  <th>{t('ai.agents.colStatus')}</th>
                  <th className="console-table__actions">{t('ai.agents.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <span className="console-table__name">
                        <span>{agent.name}</span>
                      </span>
                    </td>
                    <td className="console-table__muted">{agent.description || '—'}</td>
                    <td>
                      {agent.knowledgeBaseCount > 0 ? (
                        <span className="console-chip">
                          {t('ai.agents.knowledgeCount', { count: agent.knowledgeBaseCount })}
                        </span>
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
            <Button type="button" variant="ghost" onClick={closeForm} disabled={isSaving}>
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
            <FormField label={t('ai.agents.fieldDescription')} htmlFor="agent-description">
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

          <div className="console-form__section">
            <h4>
              {t('ai.agents.knowledgeTitle')}
              {selectedBaseIds.length > 0 ? (
                <span className="console-form__count">
                  {t('ai.agents.knowledgeSelected', { count: selectedBaseIds.length })}
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
