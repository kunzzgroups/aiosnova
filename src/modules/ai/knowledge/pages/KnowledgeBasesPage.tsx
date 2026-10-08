import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Drawer } from '@/components/ui/Drawer'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { RowMenu } from '@/components/ui/RowMenu'
import { SearchableCheckList } from '@/components/ui/SearchableCheckList'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
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
import {
  adoptKnowledgeTemplate,
  fetchTemplates,
  promoteKnowledgeBaseToTemplate,
  userCanPromoteBase,
  userCanSeeTemplates,
  type TemplateListItem,
} from '../services/templateService'
import type {
  KnowledgeBaseKind,
  KnowledgeBaseListItem,
  KnowledgeBaseStatus,
} from '../types/knowledge'
import '@/modules/ai/shared/AiConsole.css'
import './KnowledgePage.css'

const FORM_ID = 'knowledge-base-form'
const TEMPLATE_FORM_ID = 'template-adopt-form'

const STATUS_LABEL_KEY: Record<KnowledgeBaseStatus, string> = {
  ready: 'ai.knowledge.statusReady',
  processing: 'ai.knowledge.statusProcessing',
  failed: 'ai.knowledge.statusFailed',
  empty: 'ai.knowledge.statusEmpty',
}

const KIND_LABEL_KEY: Record<KnowledgeBaseKind, string> = {
  document: 'ai.knowledge.kindDocument',
  skill: 'ai.knowledge.kindSkill',
  data: 'ai.knowledge.kindData',
}

const KIND_ORDER: KnowledgeBaseKind[] = ['document', 'skill', 'data']
const OTHER_CATEGORY = 'Other'

/**
 * L1: the knowledge bases visible while acting as the ACTIVE company.
 *
 * Two creation flows:
 *   - Create:       an empty base named by the user.
 *   - Use template: adopt a snapshot from the tenant-level template library.
 *
 * Per row:
 *   - Rename / Delete (write access).
 *   - Promote to template (admin of the base's owner company): snapshots the
 *     base into the library and lets the admin choose who can see it.
 */
export function KnowledgeBasesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)

  const [searchParams, setSearchParams] = useSearchParams()
  const agentIdFilter = searchParams.get('agentId')

  const [bases, setBases] = useState<KnowledgeBaseListItem[]>([])
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // ---- Create / rename drawer
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<KnowledgeBaseKind>('document')
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // ---- Delete dialog
  const [pendingDelete, setPendingDelete] = useState<KnowledgeBaseListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ---- Adopt template drawer
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [adoptName, setAdoptName] = useState('')
  const [adoptCategory, setAdoptCategory] = useState('')
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isAdopting, setIsAdopting] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  // ---- Promote dialog
  const [pendingPromote, setPendingPromote] = useState<KnowledgeBaseListItem | null>(null)
  const [promoteName, setPromoteName] = useState('')
  const [promoteVisibility, setPromoteVisibility] = useState<string[]>([])
  const [promoteSearch, setPromoteSearch] = useState('')
  const [isPromoting, setIsPromoting] = useState(false)

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

  /* ---- Permission-aware flags (recomputed when the active company changes) ---- */
  const canUseTemplates = useMemo(
    () => userCanSeeTemplates(companyId),
    [companyId],
  )

  const agentItems = useMemo(
    () =>
      agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
        hint: agent.description,
      })),
    [agents],
  )

  const activeAgent = useMemo(
    () =>
      agentIdFilter
        ? agents.find((agent) => agent.id === agentIdFilter) ?? null
        : null,
    [agentIdFilter, agents],
  )

  const visibleBases = useMemo(() => {
    if (!agentIdFilter) return bases
    return bases.filter((base) => base.agentIds?.includes(agentIdFilter))
  }, [bases, agentIdFilter])

  const groupedByKind = useMemo(() => {
    const byKind = new Map<KnowledgeBaseKind, Map<string, KnowledgeBaseListItem[]>>()

    for (const base of visibleBases) {
      const kindId: KnowledgeBaseKind = base.kind ?? 'document'
      const category = base.category?.trim() || OTHER_CATEGORY

      const categories = byKind.get(kindId) ?? new Map<string, KnowledgeBaseListItem[]>()
      const bucket = categories.get(category) ?? []
      bucket.push(base)
      categories.set(category, bucket)
      byKind.set(kindId, categories)
    }

    return KIND_ORDER.flatMap((kindId) => {
      const categories = byKind.get(kindId)
      if (!categories || categories.size === 0) return []
      const entries = [...categories.entries()]
      const otherIndex = entries.findIndex(([key]) => key === OTHER_CATEGORY)
      if (otherIndex > -1 && otherIndex < entries.length - 1) {
        const [other] = entries.splice(otherIndex, 1)
        entries.push(other)
      }
      return [{ kind: kindId, categories: entries }]
    })
  }, [visibleBases])

  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  )

  /* ---------------- Promote visibility helpers ---------------- */

  /** Companies with the owner first, then alphabetical. */
  const orderedPromoteCompanies = useMemo(() => {
    if (!pendingPromote) return companies
    const ownerId = pendingPromote.companyId
    const owner = companies.find((c) => c.value === ownerId)
    const rest = companies
      .filter((c) => c.value !== ownerId)
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
    return owner ? [owner, ...rest] : companies
  }, [companies, pendingPromote])

  /** Filtered by the search box. Owner is preserved even if filtered out. */
  const visiblePromoteCompanies = useMemo(() => {
    const needle = promoteSearch.trim().toLowerCase()
    if (!needle) return orderedPromoteCompanies
    return orderedPromoteCompanies.filter((c) =>
      c.label.toLowerCase().includes(needle),
    )
  }, [orderedPromoteCompanies, promoteSearch])

  function promoteSelectAll() {
    const ownerId = pendingPromote?.companyId
    const next = new Set(promoteVisibility)
    for (const c of visiblePromoteCompanies) next.add(c.value)
    if (ownerId) next.add(ownerId)
    setPromoteVisibility([...next])
  }

  function promoteSelectNone() {
    const ownerId = pendingPromote?.companyId
    setPromoteVisibility(ownerId ? [ownerId] : [])
  }

  function promoteCopyFrom(templateId: string) {
    const src = templates.find((tpl) => tpl.id === templateId)
    if (!src) return
    const ownerId = pendingPromote?.companyId
    const next = new Set(src.allowedCompanyIds)
    if (ownerId) next.add(ownerId)
    setPromoteVisibility([...next])
  }

  /* ------------------------------------------------------------------ */
  /* Create / rename                                                     */
  /* ------------------------------------------------------------------ */

  function clearAgentFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('agentId')
    setSearchParams(next, { replace: true })
  }

  function openCreate() {
    setEditingId(null)
    setName('')
    setDescription('')
    setKind('document')
    setSelectedAgentIds([])
    setError(null)
    setFormOpen(true)
  }

  function openRename(base: KnowledgeBaseListItem) {
    setEditingId(base.id)
    setName(base.name)
    setDescription(base.description)
    setKind(base.kind ?? 'document')
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
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
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
        await createKnowledgeBase({
          name,
          description,
          companyId,
          agentIds: selectedAgentIds,
          kind,
        })
        setMessage(t('ai.knowledge.msgCreated'))
      }
      closeForm()
      await load()
    } catch (caught) {
      const fallback = editingId
        ? t('ai.knowledge.errUpdate')
        : t('ai.knowledge.errCreate')
      setError(caught instanceof ApiError ? caught.message : fallback)
    } finally {
      setIsSaving(false)
    }
  }

  /* ------------------------------------------------------------------ */
  /* Delete                                                              */
  /* ------------------------------------------------------------------ */

  async function handleDelete() {
    if (!pendingDelete || isDeleting) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteKnowledgeBase(pendingDelete.id)
      setMessage(t('ai.knowledge.msgDeleted'))
      setPendingDelete(null)
      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : t('ai.knowledge.errDelete'),
      )
    } finally {
      setIsDeleting(false)
    }
  }

  /* ------------------------------------------------------------------ */
  /* Adopt template                                                      */
  /* ------------------------------------------------------------------ */

  function openTemplates() {
    setTemplateOpen(true)
    setSelectedTemplateId('')
    setAdoptName('')
    setAdoptCategory('')
    setTemplateError(null)
    setIsLoadingTemplates(true)
    fetchTemplates(companyId)
      .then((result) => {
        setTemplates(result.items)
        const first = result.items[0]
        if (first) {
          setSelectedTemplateId(first.id)
          setAdoptName(first.name)
          setAdoptCategory(first.category)
        }
      })
      .catch(() => setTemplates([]))
      .finally(() => setIsLoadingTemplates(false))
  }

  function pickTemplate(template: TemplateListItem) {
    setSelectedTemplateId(template.id)
    setAdoptName(template.name)
    setAdoptCategory(template.category)
  }

  async function handleAdopt(event: FormEvent) {
    event.preventDefault()
    if (!selectedTemplateId) return
    setIsAdopting(true)
    setTemplateError(null)
    try {
      const result = await adoptKnowledgeTemplate({
        templateId: selectedTemplateId,
        companyId,
        baseName: adoptName.trim() || undefined,
        category: adoptCategory.trim() || undefined,
      })
      setMessage(
        t('ai.knowledge.adoptDone', {
          name: result.baseName,
          count:
            result.documentsCreated + result.skillsCreated + result.dataSourcesCreated,
          defaultValue: 'Created "{{name}}" with {{count}} item(s).',
        }),
      )
      setTemplateOpen(false)
      await load()
    } catch (caught) {
      setTemplateError(
        caught instanceof ApiError ? caught.message : t('ai.knowledge.adoptErr'),
      )
    } finally {
      setIsAdopting(false)
    }
  }

  /* ------------------------------------------------------------------ */
  /* Promote to template                                                 */
  /* ------------------------------------------------------------------ */

  function openPromote(base: KnowledgeBaseListItem) {
    setPendingPromote(base)
    setPromoteName(base.name)
    // Owner company is always selected and cannot be unchecked.
    setPromoteVisibility([base.companyId])
    setPromoteSearch('')
    setError(null)
  }

  async function handlePromote() {
    if (!pendingPromote || isPromoting) return
    if (promoteVisibility.length === 0) {
      setError(t('ai.knowledge.errTemplateNoVisibility', 'Pick at least one company.'))
      return
    }
    setIsPromoting(true)
    try {
      const result = await promoteKnowledgeBaseToTemplate({
        baseId: pendingPromote.id,
        name: promoteName.trim() || undefined,
        allowedCompanyIds: promoteVisibility,
      })
      setMessage(
        t('ai.knowledge.promoteDone', {
          name: result.templateName,
          defaultValue: 'Added "{{name}}" to the template library.',
        }),
      )
      setPendingPromote(null)
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : t('ai.knowledge.promoteErr'),
      )
    } finally {
      setIsPromoting(false)
    }
  }

  const isEmpty = !isLoading && visibleBases.length === 0

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
          <div className="console-panel__actions">
            {canUseTemplates ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void navigate('/ai/ai/knowledge/templates')}
                >
                  {t('ai.knowledge.manageTemplates', 'Manage templates')}
                </Button>
                <Button variant="secondary" onClick={openTemplates}>
                  {t('ai.knowledge.useTemplate')}
                </Button>
              </>
            ) : null}
            <Button onClick={openCreate}>{t('ai.knowledge.create')}</Button>
          </div>
        </div>
        <p className="console-hint">
          {companyName
            ? t('ai.knowledge.companyScope', { company: companyName })
            : t('ai.knowledge.companyScopeUnknown')}
        </p>

        {activeAgent ? (
          <div className="console-filter-chip">
            <span>{t('ai.knowledge.filteredByAgent', { name: activeAgent.name })}</span>
            <button
              type="button"
              className="console-filter-chip__clear"
              onClick={clearAgentFilter}
              aria-label={t('common.dismiss')}
            >
              ×
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="console-empty">{t('ai.knowledge.loading')}</p>
        ) : isEmpty ? (
          <p className="console-empty">
            {bases.length === 0
              ? t('ai.knowledge.empty')
              : t('ai.knowledge.emptyFiltered')}
          </p>
        ) : (
          <div className="knowledge-kinds">
            {groupedByKind.map(({ kind: kindId, categories }) => (
              <section className="knowledge-kind" key={kindId}>
                <header className="knowledge-kind__header">
                  <h3 className="knowledge-kind__title">
                    {t(KIND_LABEL_KEY[kindId])}
                  </h3>
                  <span className="knowledge-kind__count">
                    {categories.reduce((sum, [, items]) => sum + items.length, 0)}
                  </span>
                </header>

                <div className="knowledge-groups">
                  {categories.map(([category, items]) => (
                    <section className="knowledge-group" key={category}>
                      <header className="knowledge-group__header">
                        <h4 className="knowledge-group__title">{category}</h4>
                        <span className="knowledge-group__count">{items.length}</span>
                      </header>
                      <ul className="knowledge-bases">
                        {items.map((base) => {
                          const canPromoteThis = userCanPromoteBase(base.id)
                          return (
                            <li className="knowledge-base-row" key={base.id}>
                              <Link
                                className="knowledge-base"
                                to={`/ai/ai/knowledge/${base.id}/${tabForKind(
                                  base.kind ?? 'document',
                                )}`}
                              >
                                <div className="knowledge-base__body">
                                  <strong className="knowledge-base__name">
                                    {base.name}
                                  </strong>
                                  <span className="knowledge-base__description">
                                    {base.description}
                                  </span>
                                  <div className="knowledge-base__meta">
                                    {base.kind === 'document' ? (
                                      <span>
                                        {t('ai.knowledge.documentCount', {
                                          count: base.documentCount,
                                        })}
                                      </span>
                                    ) : null}
                                    <span>
                                      {base.agentCount > 0
                                        ? t('ai.knowledge.agentCount', {
                                            count: base.agentCount,
                                          })
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
                                  {
                                    id: 'rename',
                                    label: t('ai.knowledge.rename'),
                                    onSelect: () => openRename(base),
                                  },
                                  ...(canPromoteThis
                                    ? [
                                        {
                                          id: 'promote',
                                          label: t('ai.knowledge.promote'),
                                          onSelect: () => openPromote(base),
                                        },
                                      ]
                                    : []),
                                  {
                                    id: 'delete',
                                    label: t('ai.knowledge.delete'),
                                    destructive: true,
                                    onSelect: () => setPendingDelete(base),
                                  },
                                ]}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Create / rename drawer ---------- */}
      <Drawer
        open={formOpen}
        title={editingId ? t('ai.knowledge.renameTitle') : t('ai.knowledge.createTitle')}
        description={
          editingId ? t('ai.knowledge.renameHint') : t('ai.knowledge.createHint')
        }
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
            <Button
              type="button"
              variant="ghost"
              onClick={closeForm}
              disabled={isSaving}
            >
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
            <FormField
              label={t('ai.knowledge.fieldDescription')}
              htmlFor="kb-description"
            >
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
          <p className="console-hint console-hint--flat">
            {t('ai.knowledge.companyLocked')}
          </p>

          {editingId ? (
            <div className="console-form__section">
              <p>{t('ai.knowledge.renameAgentsNote')}</p>
            </div>
          ) : (
            <>
              <div className="console-form__section">
                <h4>{t('ai.knowledge.fieldKind', 'Type')}</h4>
                <p>
                  {t(
                    'ai.knowledge.kindHint',
                    'Documents are indexed for search. Skills are callable actions. Data sources are queried live.',
                  )}
                </p>
                <div className="console-kind-picker" role="radiogroup">
                  {KIND_ORDER.map((option) => {
                    const selected = kind === option
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`console-kind-card${
                          selected ? ' console-kind-card--selected' : ''
                        }`}
                        onClick={() => setKind(option)}
                        disabled={isSaving}
                      >
                        <span className="console-kind-card__title">
                          {t(KIND_LABEL_KEY[option])}
                        </span>
                        <span className="console-kind-card__hint">
                          {t(`ai.knowledge.kindHint_${option}`)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="console-form__section">
                <h4>
                  {t('ai.knowledge.tabAgents')}
                  {selectedAgentIds.length > 0 ? (
                    <span className="console-form__count">
                      {t('ai.knowledge.agentsSelected', {
                        count: selectedAgentIds.length,
                      })}
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
            </>
          )}
        </form>
      </Drawer>

      {/* ---------- Adopt template drawer ---------- */}
      <Drawer
        open={templateOpen}
        title={t('ai.knowledge.useTemplateTitle')}
        description={t('ai.knowledge.useTemplateHint')}
        onClose={() => setTemplateOpen(false)}
        busy={isAdopting}
        closeLabel={t('common.dismiss')}
        footer={
          <>
            <Button
              type="submit"
              form={TEMPLATE_FORM_ID}
              disabled={isAdopting || !selectedTemplateId}
            >
              {isAdopting ? t('ai.knowledge.saving') : t('ai.knowledge.useTemplateConfirm')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTemplateOpen(false)}
              disabled={isAdopting}
            >
              {t('ai.knowledge.cancel')}
            </Button>
          </>
        }
      >
        <form id={TEMPLATE_FORM_ID} onSubmit={(event) => void handleAdopt(event)}>
          {isLoadingTemplates ? (
            <p className="console-empty">{t('common.loading')}</p>
          ) : templates.length === 0 ? (
            <p className="console-empty">{t('ai.knowledge.useTemplateEmpty')}</p>
          ) : (
            <>
              <div className="console-form__section">
                <h4>{t('ai.knowledge.templatePick')}</h4>
                <ul className="template-list">
                  {templates.map((tpl) => {
                    const selected = tpl.id === selectedTemplateId
                    return (
                      <li key={tpl.id}>
                        <label
                          className={[
                            'template-list__item',
                            selected ? 'is-selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <input
                            type="radio"
                            name="template"
                            checked={selected}
                            disabled={isAdopting}
                            onChange={() => pickTemplate(tpl)}
                          />
                          <span className="template-list__body">
                            <span className="template-list__name">{tpl.name}</span>
                            <span className="template-list__description">
                              {tpl.description}
                            </span>
                            <span className="template-list__meta">
                              <span className="console-chip console-chip--muted">
                                {t(KIND_LABEL_KEY[tpl.kind])}
                              </span>
                              <span className="console-chip console-chip--muted">
                                {t('ai.knowledge.templateItemCount', {
                                  count: tpl.itemCount,
                                })}
                              </span>
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {selectedTemplate ? (
                <div className="console-form__section">
                  <h4>{t('ai.knowledge.templateTarget')}</h4>
                  <div className="console-form__grid">
                    <FormField
                      label={t('ai.knowledge.fieldName')}
                      htmlFor="adopt-name"
                    >
                      <TextField
                        id="adopt-name"
                        value={adoptName}
                        onChange={(event) => setAdoptName(event.target.value)}
                        disabled={isAdopting}
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField
                      label={t('ai.knowledge.fieldCategory', 'Category')}
                      htmlFor="adopt-category"
                    >
                      <TextField
                        id="adopt-category"
                        value={adoptCategory}
                        onChange={(event) => setAdoptCategory(event.target.value)}
                        disabled={isAdopting}
                        autoComplete="off"
                      />
                    </FormField>
                  </div>
                  <p className="console-hint console-hint--flat">
                    {t('ai.knowledge.templateTargetHint')}
                  </p>
                </div>
              ) : null}
            </>
          )}

          {templateError ? <p className="console-error">{templateError}</p> : null}
        </form>
      </Drawer>

      {/* ---------- Promote to template drawer ---------- */}
      <Drawer
        open={pendingPromote !== null}
        title={t('ai.knowledge.promoteTitle')}
        description={t('ai.knowledge.promoteHint')}
        onClose={() => setPendingPromote(null)}
        busy={isPromoting}
        closeLabel={t('common.dismiss')}
        footer={
          <>
            <Button onClick={() => void handlePromote()} disabled={isPromoting}>
              {isPromoting ? t('ai.knowledge.saving') : t('ai.knowledge.promote')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPendingPromote(null)}
              disabled={isPromoting}
            >
              {t('ai.knowledge.cancel')}
            </Button>
          </>
        }
      >
        <p className="console-hint">
          {t('ai.knowledge.promoteBody', { name: pendingPromote?.name ?? '' })}
        </p>

        <FormField label={t('ai.knowledge.promoteName')} htmlFor="promote-name">
          <TextField
            id="promote-name"
            value={promoteName}
            onChange={(event) => setPromoteName(event.target.value)}
            disabled={isPromoting}
            autoComplete="off"
          />
        </FormField>

        {/* ---- Visibility picker ---- */}
        <div className="console-form__section">
          <h4>{t('ai.knowledge.promoteVisibility', 'Who can see this template?')}</h4>
          <p>
            {t(
              'ai.knowledge.promoteVisibilityHint',
              'The owner company is always included. Tick others to share the template with them.',
            )}
          </p>

          <div className="promote-toolbar">
            <TextField
              className="promote-toolbar__search"
              type="search"
              value={promoteSearch}
              onChange={(event) => setPromoteSearch(event.target.value)}
              placeholder={t('ai.knowledge.promoteSearch', 'Search companies...')}
              aria-label={t('ai.knowledge.promoteSearch', 'Search companies...')}
              disabled={isPromoting}
            />
            <span className="promote-toolbar__count">
              {t('ai.knowledge.promoteSelected', '{{selected}} of {{total}} selected', {
                selected: promoteVisibility.length,
                total: companies.length,
              })}
            </span>
          </div>

          <div className="promote-toolbar promote-toolbar--bulk">
            <Button
              type="button"
              variant="ghost"
              onClick={promoteSelectAll}
              disabled={isPromoting}
            >
              {t('ai.knowledge.promoteSelectAll', 'Select all')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={promoteSelectNone}
              disabled={isPromoting}
            >
              {t('ai.knowledge.promoteSelectNone', 'Clear')}
            </Button>

            {templates.length > 0 ? (
              <div className="promote-toolbar__spacer">
                <SidebarSelect
                  id="promote-copy-from"
                  label={t('ai.knowledge.promoteCopyFrom', 'Copy from…')}
                  hideLabel
                  value=""
                  options={[
                    {
                      value: '',
                      label: t('ai.knowledge.promoteCopyFrom', 'Copy from…'),
                    },
                    ...templates.map((tpl) => ({ value: tpl.id, label: tpl.name })),
                  ]}
                  onChange={(value) => {
                    if (value) promoteCopyFrom(value)
                  }}
                  disabled={isPromoting}
                />
              </div>
            ) : null}
          </div>

          {visiblePromoteCompanies.length === 0 ? (
            <p className="console-empty">
              {t('ai.knowledge.promoteNoMatch', 'No company matches that search.')}
            </p>
          ) : (
            <ul className="promote-visibility">
              {visiblePromoteCompanies.map((company) => {
                const isOwner = company.value === pendingPromote?.companyId
                const checked = promoteVisibility.includes(company.value)
                return (
                  <li key={company.value}>
                    <label
                      className={[
                        'promote-visibility__item',
                        checked ? 'is-checked' : '',
                        isOwner ? 'is-locked' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isPromoting || isOwner}
                        onChange={() =>
                          setPromoteVisibility((current) =>
                            current.includes(company.value)
                              ? current.filter((id) => id !== company.value)
                              : [...current, company.value],
                          )
                        }
                      />
                      <span className="promote-visibility__name">
                        {company.label}
                      </span>
                      {isOwner ? (
                        <span className="promote-visibility__badge">
                          {t('ai.knowledge.promoteOwner', 'Owner')}
                        </span>
                      ) : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Drawer>

      {/* ---------- Delete dialog ---------- */}
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

function tabForKind(kind: KnowledgeBaseKind): string {
  switch (kind) {
    case 'skill':
      return 'skills'
    case 'data':
      return 'data'
    case 'document':
    default:
      return 'documents'
  }
}