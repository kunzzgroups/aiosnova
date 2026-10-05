import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Drawer } from '@/components/ui/Drawer'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { RowMenu } from '@/components/ui/RowMenu'
import { SearchableCheckList } from '@/components/ui/SearchableCheckList'
import { TextField } from '@/components/ui/TextField'
import { useCompanyStore } from '@/stores/companyStore'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import type { AgentListItem } from '@/modules/ai/agents/types/agent'
import { ApiError } from '@/services/httpClient'
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  fetchKnowledgeBases,
  updateKnowledgeBase,
} from '../services/knowledgeService'
import type { KnowledgeBaseListItem, KnowledgeBaseStatus } from '../types/knowledge'
import '@/modules/ai/shared/AiConsole.css'
import './KnowledgePage.css'

const FORM_ID = 'knowledge-base-form'

const STATUS_LABEL_KEY: Record<KnowledgeBaseStatus, string> = {
  ready: 'ai.knowledge.statusReady',
  processing: 'ai.knowledge.statusProcessing',
  failed: 'ai.knowledge.statusFailed',
  empty: 'ai.knowledge.statusEmpty',
}

/**
 * L1: the knowledge bases of the ACTIVE company.
 *
 * Scoped by `companyStore` rather than by a filter on this page, because a base
 * belongs to exactly one company - the switcher in the sidebar IS the filter.
 *
 * Rename and delete live on each row's "more actions" menu, so the tab strip on
 * the detail screen only carries sections that hold content (Documents, Agents).
 */
export function KnowledgeBasesPage() {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)

  const [bases, setBases] = useState<KnowledgeBaseListItem[]>([])
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<KnowledgeBaseListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [basesResult, agentsResult] = await Promise.all([
        fetchKnowledgeBases(companyId),
        fetchAgents(companyId),
      ])
      setBases(basesResult.items)
      setAgents(agentsResult.items)
    } catch {
      setBases([])
      setAgents([])
      setError(t('ai.knowledge.errLoadBases'))
    } finally {
      setIsLoading(false)
    }
  }, [companyId, t])

  useEffect(() => {
    void load()
  }, [load])

  const companyName = companies.find((item) => item.value === companyId)?.label ?? ''

  const agentItems = useMemo(
    () =>
      agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
        hint: agent.description,
      })),
    [agents],
  )

  function openCreate() {
    setEditingId(null)
    setName('')
    setDescription('')
    setSelectedAgentIds([])
    setError(null)
    setFormOpen(true)
  }

  function openRename(base: KnowledgeBaseListItem) {
    setEditingId(base.id)
    setName(base.name)
    setDescription(base.description)
    setSelectedAgentIds([])
    setError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
  }

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError(t('ai.knowledge.errNameRequired'))
      return
    }
    if (!editingId && !companyId) {
      setError(t('ai.knowledge.errNoCompany'))
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateKnowledgeBase(editingId, { name, description })
        setMessage(t('ai.knowledge.msgUpdated'))
      } else {
        await createKnowledgeBase({ name, description, companyId, agentIds: selectedAgentIds })
        setMessage(t('ai.knowledge.msgCreated'))
      }
      closeForm()
      await load()
    } catch (caught) {
      const fallback = editingId ? t('ai.knowledge.errUpdate') : t('ai.knowledge.errCreate')
      setError(caught instanceof ApiError ? caught.message : fallback)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!pendingDelete || isDeleting) {
      return
    }
    setIsDeleting(true)
    setError(null)
    try {
      await deleteKnowledgeBase(pendingDelete.id)
      setMessage(t('ai.knowledge.msgDeleted'))
      setPendingDelete(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('ai.knowledge.errDelete'))
    } finally {
      setIsDeleting(false)
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
          <h2>{t('ai.knowledge.listTitle')}</h2>
          <Button onClick={openCreate}>{t('ai.knowledge.create')}</Button>
        </div>
        <p className="console-hint">
          {companyName
            ? t('ai.knowledge.companyScope', { company: companyName })
            : t('ai.knowledge.companyScopeUnknown')}
        </p>

        {isLoading ? (
          <p className="console-empty">{t('ai.knowledge.loading')}</p>
        ) : bases.length === 0 ? (
          <p className="console-empty">{t('ai.knowledge.empty')}</p>
        ) : (
          <ul className="knowledge-bases">
            {bases.map((base) => (
              <li className="knowledge-base-row" key={base.id}>
                <Link className="knowledge-base" to={`/ai/ai/knowledge/${base.id}/documents`}>
                  <div className="knowledge-base__body">
                    <strong className="knowledge-base__name">{base.name}</strong>
                    <span className="knowledge-base__description">{base.description}</span>
                    <div className="knowledge-base__meta">
                      <span>{t('ai.knowledge.documentCount', { count: base.documentCount })}</span>
                      <span>
                        {base.agentCount > 0
                          ? t('ai.knowledge.agentCount', { count: base.agentCount })
                          : t('ai.knowledge.agentCountNone')}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`console-status console-status--${base.status} knowledge-base__status`}
                  >
                    {t(STATUS_LABEL_KEY[base.status])}
                  </span>
                </Link>
                <RowMenu
                  label={t('ai.knowledge.rowActions', { name: base.name })}
                  items={[
                    { id: 'rename', label: t('ai.knowledge.rename'), onSelect: () => openRename(base) },
                    {
                      id: 'delete',
                      label: t('ai.knowledge.delete'),
                      destructive: true,
                      onSelect: () => setPendingDelete(base),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Drawer
        open={formOpen}
        title={editingId ? t('ai.knowledge.renameTitle') : t('ai.knowledge.createTitle')}
        description={editingId ? t('ai.knowledge.renameHint') : t('ai.knowledge.createHint')}
        onClose={closeForm}
        busy={isSaving}
        closeLabel={t('common.dismiss')}
        footer={
          <>
            <Button type="submit" form={FORM_ID} disabled={isSaving}>
              {isSaving
                ? t('ai.knowledge.saving')
                : editingId
                  ? t('ai.knowledge.save')
                  : t('ai.knowledge.create')}
            </Button>
            <Button type="button" variant="ghost" onClick={closeForm} disabled={isSaving}>
              {t('ai.knowledge.cancel')}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)}>
          <div className="console-form__grid">
            <FormField label={t('ai.knowledge.fieldName')} htmlFor="kb-name">
              <TextField
                id="kb-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('ai.knowledge.namePlaceholder')}
                disabled={isSaving}
                autoComplete="off"
                autoFocus
              />
            </FormField>
            <FormField label={t('ai.knowledge.fieldDescription')} htmlFor="kb-description">
              <TextField
                id="kb-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('ai.knowledge.descriptionPlaceholder')}
                disabled={isSaving}
                autoComplete="off"
              />
            </FormField>
            <FormField label={t('ai.knowledge.fieldCompany')} htmlFor="kb-company">
              <TextField
                id="kb-company"
                value={companyName}
                readOnly
                disabled
                title={t('ai.knowledge.companyLocked')}
              />
            </FormField>
          </div>
          <p className="console-hint console-hint--flat">{t('ai.knowledge.companyLocked')}</p>

          {editingId ? (
            <div className="console-form__section">
              <p>{t('ai.knowledge.renameAgentsNote')}</p>
            </div>
          ) : (
            <div className="console-form__section">
              <h4>
                {t('ai.knowledge.tabAgents')}
                {selectedAgentIds.length > 0 ? (
                  <span className="console-form__count">
                    {t('ai.knowledge.agentsSelected', { count: selectedAgentIds.length })}
                  </span>
                ) : null}
              </h4>
              <p>{t('ai.knowledge.agentsHint')}</p>
              <SearchableCheckList
                items={agentItems}
                selected={selectedAgentIds}
                onToggle={toggleAgent}
                emptyLabel={t('ai.knowledge.noAgentsInCompany')}
                noMatchLabel={t('ai.knowledge.agentsSearchNoMatch')}
                searchPlaceholder={t('ai.knowledge.agentsSearchPlaceholder')}
                searchAriaLabel={t('ai.knowledge.agentsSearchAria')}
                listAriaLabel={t('ai.knowledge.tabAgents')}
                disabled={isSaving}
              />
            </div>
          )}
        </form>
      </Drawer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('ai.knowledge.deleteTitle', { name: pendingDelete?.name ?? '' })}
        description={t('ai.knowledge.deleteBody', {
          count: pendingDelete?.documentCount ?? 0,
        })}
        warning={t('ai.knowledge.deleteWarning')}
        confirmLabel={t('ai.knowledge.delete')}
        cancelLabel={t('ai.knowledge.cancel')}
        busyLabel={t('ai.knowledge.deleting')}
        busy={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
