import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { IconPlus, IconSettings, IconSpark } from '@/components/icons/Icons'
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  fetchKnowledgeBase,
  fetchKnowledgeBases,
  updateKnowledgeBase,
  updateKnowledgeDocumentMode,
  updateKnowledgeSkillMode,
  updateKnowledgeDataSourceMode,
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
  KnowledgeBaseDetail,
  KnowledgeBaseKind,
  KnowledgeBaseListItem,
  KnowledgeBaseStatus,
  KnowledgeManualMode,
  KnowledgeItemDisplayStatus,
} from '../types/knowledge'
import {
  nextKnowledgeManualMode,
} from '../types/knowledge'
import '@/modules/ai/shared/AiConsole.css'
import './KnowledgePage.css'
const FORM_ID = 'knowledge-base-form'
const TEMPLATE_FORM_ID = 'template-adopt-form'
const STATUS_LABEL_KEY: Record<KnowledgeBaseStatus, string> = {
  ready: 'ai.knowledge.statusReady',
  processing: 'ai.knowledge.statusProcessing',
  testing: 'ai.knowledge.statusTesting',
  paused: 'ai.knowledge.statusPaused',
  failed: 'ai.knowledge.statusFailed',
  empty: 'ai.knowledge.statusEmpty',
}
const STATUS_LABEL_FALLBACK: Record<KnowledgeBaseStatus, string> = {
  ready: 'Ready',
  processing: 'Processing',
  testing: 'Testing',
  paused: 'Paused',
  failed: 'Failed',
  empty: 'Empty',
}
const KIND_LABEL_KEY: Record<KnowledgeBaseKind, string> = {
  document: 'ai.knowledge.kindDocument',
  skill: 'ai.knowledge.kindSkill',
  data: 'ai.knowledge.kindData',
}
type KnowledgeContentItem = {
  id: string
  name: string
  description: string
  status: 'ready' | 'processing' | 'failed'
  mode: KnowledgeManualMode
  meta: string
}
const KIND_ORDER: KnowledgeBaseKind[] = ['document', 'skill', 'data']
const OTHER_CATEGORY = 'Other'
export function KnowledgeBasesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)
  const companyName = companies.find((item) => item.value === companyId)?.label ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const agentIdFilter = searchParams.get('agentId')
  const [bases, setBases] = useState<KnowledgeBaseListItem[]>([])
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<KnowledgeBaseKind | ''>('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<KnowledgeBaseListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [adoptName, setAdoptName] = useState('')
  const [adoptCategory, setAdoptCategory] = useState('')
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isAdopting, setIsAdopting] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [pendingPromote, setPendingPromote] = useState<KnowledgeBaseListItem | null>(null)
  const [promoteName, setPromoteName] = useState('')
  const [promoteVisibility, setPromoteVisibility] = useState<string[]>([])
  const [promoteSearch, setPromoteSearch] = useState('')
  const [isPromoting, setIsPromoting] = useState(false)
  const [query, setQuery] = useState('')
  type KnowledgeKindFilter = 'all' | KnowledgeBaseKind
  const [kindFilter, setKindFilter] =
    useState<KnowledgeKindFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  type WorkspaceTab = 'content' | 'agents'
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null)
  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('content')
  const [contentQuery, setContentQuery] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
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
  const canUseTemplates = useMemo(() => userCanSeeTemplates(companyId), [companyId])
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status === 'active'),
    [agents],
  )
  const agentItems = useMemo(
    () =>
      activeAgents.map((agent) => ({
        value: agent.id,
        label: agent.name,
        hint: agent.description,
      })),
    [activeAgents],
  )
  const activeAgent = useMemo(
    () =>
      agentIdFilter
        ? activeAgents.find((agent) => agent.id === agentIdFilter) ?? null
        : null,
    [agentIdFilter, activeAgents],
  )
  const filteredBases = useMemo(() => {
    let list = bases
    // Preserve the existing Agent deep-link filter.
    if (agentIdFilter) {
      list = list.filter((base) =>
        base.agentIds?.includes(agentIdFilter),
      )
    }
    // Preserve the existing search behaviour.
    const needle = query.trim().toLowerCase()
    if (needle) {
      list = list.filter(
        (base) =>
          base.name.toLowerCase().includes(needle) ||
          base.description.toLowerCase().includes(needle),
      )
    }
    return list
  }, [bases, agentIdFilter, query])
  const categoryOptions = useMemo(() => {
    const values = new Set<string>()
    for (const base of bases) {
      const baseKind = base.kind ?? 'document'
      if (kindFilter !== 'all' && baseKind !== kindFilter) {
        continue
      }
      values.add(base.category?.trim() || OTHER_CATEGORY)
    }
    return [
      { value: 'all', label: 'All categories' },
      ...Array.from(values)
        .sort((a, b) =>
          a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        )
        .map((value) => ({ value, label: value })),
    ]
  }, [bases, kindFilter])
  useEffect(() => {
    if (categoryFilter === 'all') return
    const stillExists = categoryOptions.some(
      (option) => option.value === categoryFilter,
    )
    if (!stillExists) {
      setCategoryFilter('all')
    }
  }, [categoryFilter, categoryOptions])
  // Apply both the type filter and the business category filter.
  const visibleBases = useMemo(() => {
    return filteredBases.filter((base) => {
      const matchesKind =
        kindFilter === 'all' || (base.kind ?? 'document') === kindFilter
      const category = base.category?.trim() || OTHER_CATEGORY
      const matchesCategory =
        categoryFilter === 'all' || category === categoryFilter
      return matchesKind && matchesCategory
    })
  }, [filteredBases, kindFilter, categoryFilter])
  const leftSections = useMemo(() => {
    return KIND_ORDER
      .map((kindId) => {
        const items = visibleBases
          .filter((base) => (base.kind ?? 'document') === kindId)
          .slice()
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: 'base',
            }),
          )
        return {
          kind: kindId,
          label:
            kindId === 'document'
              ? 'Documents'
              : kindId === 'skill'
                ? 'Skills'
                : 'Data Sources',
          items,
        }
      })
      .filter((section) => section.items.length > 0)
  }, [visibleBases])
  useEffect(() => {
    if (visibleBases.length === 0) {
      setSelectedBaseId(null)
      setDetail(null)
      return
    }
    if (!selectedBaseId || !visibleBases.some((base) => base.id === selectedBaseId)) {
      setSelectedBaseId(visibleBases[0].id)
      setWorkspaceTab('content')
      setContentQuery('')
      setSelectedItemId(null)
    }
  }, [visibleBases, selectedBaseId])
  useEffect(() => {
    if (!selectedBaseId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setIsLoadingDetail(true)
    fetchKnowledgeBase(selectedBaseId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result)
          setSelectedItemId(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null)
          setError(t('ai.knowledge.errLoadBase'))
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedBaseId, t])
  const selectedBase = useMemo(
    () => visibleBases.find((base) => base.id === selectedBaseId) ?? null,
    [visibleBases, selectedBaseId],
  )
  const selectedBaseKind: KnowledgeBaseKind =
    detail?.base.kind ?? selectedBase?.kind ?? 'document'
  const contentItems = useMemo<KnowledgeContentItem[]>(() => {
    if (!detail) return []
    const needle = contentQuery.trim().toLowerCase()
    if (selectedBaseKind === 'skill') {
      return detail.skills
        .filter(
          (item) =>
            !needle ||
            item.name.toLowerCase().includes(needle) ||
            item.description.toLowerCase().includes(needle),
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          status:
            item.status === 'draft'
              ? 'processing'
              : item.status,
          mode: item.mode ?? 'active',
          meta: 'Skill',
        }))
    }
    if (selectedBaseKind === 'data') {
      return detail.dataSources
        .filter(
          (item) =>
            !needle ||
            item.name.toLowerCase().includes(needle) ||
            item.kind.toLowerCase().includes(needle),
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.kind,
          status:
            item.status === 'connected'
              ? 'ready'
              : item.status === 'error'
                ? 'failed'
                : 'processing',
          mode: item.mode ?? 'active',
          meta: item.kind,
        }))
    }
    return detail.documents
      .filter((item) => !needle || item.title.toLowerCase().includes(needle))
      .map((item) => ({
        id: item.id,
        name: item.title,
        description: item.type,
        status: item.status,
        mode: item.mode ?? 'active',
        meta: item.kind === 'file' ? 'File' : 'Record',
      }))
  }, [detail, contentQuery, selectedBaseKind])
  const selectedContentItem = useMemo(
    () => contentItems.find((item) => item.id === selectedItemId) ?? null,
    [contentItems, selectedItemId],
  )
  const connectedAgents = useMemo(() => {
    if (!detail) return []
    const ids = new Set(detail.baseAgentIds)
    return activeAgents.filter((agent) => ids.has(agent.id))
  }, [activeAgents, detail])
  function displayStatusForItem(
    item: KnowledgeContentItem,
  ): KnowledgeItemDisplayStatus {
    return item.status === 'failed'
      ? 'failed'
      : item.status === 'processing'
        ? 'processing'
        : item.mode === 'testing'
          ? 'testing'
          : item.mode === 'paused'
            ? 'paused'
            : 'ready'
  }
  async function refreshWorkspaceKnowledge() {
    await load()
    if (!selectedBaseId) return
    const refreshed = await fetchKnowledgeBase(selectedBaseId)
    setDetail(refreshed)
  }
  async function changeContentMode(
    itemId: string,
    currentMode: KnowledgeManualMode,
  ) {
    const next = nextKnowledgeManualMode(currentMode)
    setError(null)
    try {
      if (selectedBaseKind === 'skill') {
        await updateKnowledgeSkillMode(itemId, next)
      } else if (selectedBaseKind === 'data') {
        await updateKnowledgeDataSourceMode(itemId, next)
      } else {
        await updateKnowledgeDocumentMode(itemId, next)
      }
      // Refresh BOTH projections from the same store:
      // - left/main Knowledge Base status
      // - selected base detail/content status
      await refreshWorkspaceKnowledge()
    } catch {
      setError(t('ai.knowledge.errStatus'))
    }
  }
  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  )
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
  function clearAgentFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('agentId')
    setSearchParams(next, { replace: true })
  }
  function openCreate() {
    setEditingId(null)
    setName('')
    setDescription('')
    setKind('')
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
    if (!editingId && !kind) {
      setError(
        t(
          'ai.knowledge.errKindRequired',
          'Select a knowledge base type before creating.',
        ),
      )
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
          kind: kind as KnowledgeBaseKind,
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
          count: result.documentsCreated + result.skillsCreated + result.dataSourcesCreated,
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
  function openPromote(base: KnowledgeBaseListItem) {
    setPendingPromote(base)
    setPromoteName(base.name)
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
  const contentLabel =
    selectedBaseKind === 'skill'
      ? 'Skills'
      : selectedBaseKind === 'data'
        ? 'Data Sources'
        : 'Documents'
  const addLabel =
    selectedBaseKind === 'skill'
      ? 'Manage skills'
      : selectedBaseKind === 'data'
        ? 'Manage data sources'
        : 'Manage documents'
  return (
    <div className="knowledge-workspace-page">
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />
      <div className="knowledge-workspace-toolbar">
        <div className="knowledge-workspace-toolbar__filters">
          <div className="knowledge-toolbar-filter">
            <SidebarSelect
              id="knowledge-kind-filter"
              label="Type"
              hideLabel
              value={kindFilter}
              options={[
                { value: 'all', label: 'All type' },
                { value: 'document', label: 'Documents' },
                { value: 'skill', label: 'Skills' },
                { value: 'data', label: 'Data Sources' },
              ]}
              onChange={(value) =>
                setKindFilter(value as KnowledgeKindFilter)
              }
            />
          </div>
          <div className="knowledge-toolbar-filter knowledge-toolbar-filter--category">
            <SidebarSelect
              id="knowledge-category-filter"
              label="Category"
              hideLabel
              value={categoryFilter}
              options={categoryOptions}
              onChange={setCategoryFilter}
            />
          </div>
        </div>
        <div className="knowledge-workspace-toolbar__actions">
          {canUseTemplates ? (
            <>
              <Button
                variant="secondary"
                onClick={() => void navigate('/ai/ai/knowledge/templates')}
              >
                <IconSettings />
                {t('ai.knowledge.manageTemplates', 'Manage templates')}
              </Button>
              <Button variant="secondary" onClick={openTemplates}>
                <IconSpark />
                {t('ai.knowledge.useTemplate')}
              </Button>
            </>
          ) : null}
          <Button onClick={openCreate}>
            <IconPlus />
            {t('ai.knowledge.create')}
          </Button>
        </div>
      </div>
      {activeAgent ? (
        <div className="knowledge-workspace-filter">
          <span>{t('ai.knowledge.filteredByAgent', { name: activeAgent.name })}</span>
          <button
            type="button"
            onClick={clearAgentFilter}
            aria-label={t('common.dismiss')}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="knowledge-workspace">
        <aside className="knowledge-workspace__bases" aria-label="Knowledge bases">
          <div className="knowledge-base-pane__search">
            <TextField
              className="knowledge-pane-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(
                'ai.knowledge.searchBasesPlaceholder',
                'Search knowledge bases…',
              )}
              aria-label={t(
                'ai.knowledge.searchBasesAria',
                'Search knowledge bases',
              )}
            />
          </div>
          <div className="knowledge-base-pane__label">Knowledge bases</div>
          <div className="knowledge-base-pane__list">
            {isLoading ? (
              <p className="knowledge-workspace-empty">{t('ai.knowledge.loading')}</p>
            ) : isEmpty ? (
              <p className="knowledge-workspace-empty">
                {bases.length === 0
                  ? t('ai.knowledge.empty')
                  : t('ai.knowledge.emptyFiltered')}
              </p>
            ) : (
              leftSections.map((section) => (
                <section
                  className="knowledge-base-pane__kind-section"
                  key={section.kind}
                >
                  <h3 className="knowledge-base-pane__kind-title">
                    {section.label}
                  </h3>
                  {section.items.map((base) => {
                    const baseKind = base.kind ?? 'document'
                    const iconLabel =
                      baseKind === 'skill'
                        ? 'AI'
                        : baseKind === 'data'
                          ? 'DB'
                          : 'DOC'
                    const selected = base.id === selectedBaseId
                    return (
                      <div
                        className={`knowledge-base-pane__row${selected ? ' is-selected' : ''}`}
                        key={base.id}
                      >
                        <button
                          type="button"
                          className="knowledge-base-pane__select"
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedBaseId(base.id)
                            setWorkspaceTab('content')
                            setContentQuery('')
                            setSelectedItemId(null)
                          }}
                        >
                          <span
                            className={`knowledge-base-pane__icon knowledge-base-pane__icon--${baseKind}`}
                            aria-hidden="true"
                          >
                            {iconLabel}
                          </span>
                          <span className="knowledge-base-pane__copy">
                            <strong>{base.name}</strong>
                          </span>
                        </button>
                        <RowMenu
                          label={t('ai.knowledge.rowActions', { name: base.name })}
                          items={[
                            {
                              id: 'rename',
                              label: t('ai.knowledge.rename'),
                              onSelect: () => openRename(base),
                            },
                            ...(userCanPromoteBase(base.id)
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
                      </div>
                    )
                  })}
                </section>
              ))
            )}
          </div>
        </aside>
        <main className="knowledge-workspace__content">
          {!selectedBase || isLoadingDetail ? (
            <div className="knowledge-workspace-empty knowledge-workspace-empty--center">
              {isLoadingDetail ? t('ai.knowledge.loading') : 'Select a knowledge base'}
            </div>
          ) : detail ? (
            <>
              <div className="knowledge-content-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={workspaceTab === 'content'}
                  className={workspaceTab === 'content' ? 'is-active' : ''}
                  onClick={() => {
                    setWorkspaceTab('content')
                    setSelectedItemId(null)
                  }}
                >
                  {contentLabel}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={workspaceTab === 'agents'}
                  className={workspaceTab === 'agents' ? 'is-active' : ''}
                  onClick={() => {
                    setWorkspaceTab('agents')
                    setSelectedItemId(null)
                  }}
                >
                  Agents
                </button>
              </div>
              <div className="knowledge-content-toolbar">
                <TextField
                  className="console-panel__search knowledge-content-search"
                  type="search"
                  value={contentQuery}
                  onChange={(event) => setContentQuery(event.target.value)}
                  placeholder={
                    workspaceTab === 'agents'
                      ? 'Search agents…'
                      : `Search ${contentLabel.toLowerCase()}…`
                  }
                  aria-label={
                    workspaceTab === 'agents'
                      ? 'Search agents'
                      : `Search ${contentLabel.toLowerCase()}`
                  }
                />
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigate(
                      `/ai/ai/knowledge/${selectedBase.id}/${tabForKind(selectedBaseKind)}`,
                    )
                  }
                >
                  <IconPlus />
                  {addLabel}
                </Button>
              </div>
              <div className="console-table-wrap knowledge-content-table-wrap">
                {workspaceTab === 'agents' ? (
                  connectedAgents.length > 0 ? (
                    <table className="console-table console-table--fixed knowledge-workspace-table knowledge-workspace-table--agents">
                      <colgroup>
                        <col />
                        <col style={{ width: '14.5rem' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Agent name</th>
                          <th className="knowledge-agent-status-cell">
                            <span className="knowledge-agent-status-cell__inner">
                              Status
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {connectedAgents
                          .filter((agent) =>
                            agent.name
                              .toLowerCase()
                              .includes(contentQuery.trim().toLowerCase()),
                          )
                          .map((agent) => (
                            <tr key={agent.id}>
                              <td>
                                <div className="knowledge-agent-cell">
                                  <span>{agent.name.slice(0, 1).toUpperCase()}</span>
                                  <div>
                                    <strong>{agent.name}</strong>
                                    <small>{agent.description}</small>
                                  </div>
                                </div>
                              </td>
                              <td className="knowledge-agent-status-cell">
                                <span className="knowledge-agent-status-cell__inner">
                                  <span className="console-status console-status--ready">
                                    Connected
                                  </span>
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="knowledge-workspace-empty">
                      No connected agents.
                    </div>
                  )
                ) : contentItems.length > 0 ? (
                  <table className="console-table console-table--fixed knowledge-workspace-table">
                    <colgroup>
                      <col />
                      <col style={{ width: '9rem' }} />
                      <col style={{ width: '5.5rem' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contentItems.map((item) => (
                        <tr
                          key={item.id}
                          className={selectedItemId === item.id ? 'is-selected' : ''}
                          onClick={() => setSelectedItemId(item.id)}
                        >
                          <td>
                            <div className="knowledge-content-name">
                              <span
                                className={`knowledge-content-name__icon knowledge-content-name__icon--${selectedBaseKind}`}
                              >
                                {selectedBaseKind === 'skill'
                                  ? 'AI'
                                  : selectedBaseKind === 'data'
                                    ? 'DB'
                                    : 'DOC'}
                              </span>
                              <div>
                                <strong>{item.name}</strong>
                                <small>{item.description}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            {(() => {
                              const displayStatus =
                                displayStatusForItem(item)
                              if (
                                displayStatus === 'failed' ||
                                displayStatus === 'processing'
                              ) {
                                return (
                                  <span
                                    className={`console-status console-status--${displayStatus}`}
                                    title={
                                      displayStatus === 'failed'
                                        ? 'System issue detected'
                                        : 'System is processing this item'
                                    }
                                  >
                                    {displayStatus === 'failed'
                                      ? 'Failed'
                                      : 'Processing'}
                                  </span>
                                )
                              }
                              return (
                                <button
                                  type="button"
                                  className={`console-status console-status--${displayStatus} console-status--clickable`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void changeContentMode(
                                      item.id,
                                      item.mode,
                                    )
                                  }}
                                  title={
                                    displayStatus === 'ready'
                                      ? 'Click to pause'
                                      : displayStatus === 'paused'
                                        ? 'Click to switch to testing'
                                        : 'Click to activate'
                                  }
                                >
                                  {displayStatus === 'ready'
                                    ? 'Ready'
                                    : displayStatus === 'paused'
                                      ? 'Paused'
                                      : 'Testing'}
                                </button>
                              )
                            })()}
                          </td>
                          <td>{item.meta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="knowledge-workspace-empty">
                    No matching content.
                  </div>
                )}
              </div>
              <footer className="knowledge-content-foot">
                <span>
                  {workspaceTab === 'agents'
                    ? `${connectedAgents.length} connected agents`
                    : `${contentItems.length} ${contentLabel.toLowerCase()}`}
                </span>
              </footer>
            </>
          ) : (
            <div className="knowledge-workspace-empty knowledge-workspace-empty--center">
              Unable to load this knowledge base.
            </div>
          )}
        </main>
        <aside className="knowledge-workspace__details" aria-label="Details">
          {detail ? (
            <>
              <div className="knowledge-detail-top">
                <span
                  className={`knowledge-detail-icon knowledge-detail-icon--${selectedBaseKind}`}
                  aria-hidden="true"
                >
                  {selectedBaseKind === 'skill'
                    ? 'AI'
                    : selectedBaseKind === 'data'
                      ? 'DB'
                      : 'DOC'}
                </span>
                <span
                  className={`console-status console-status--${detail.base.status}`}
                >
                  {t(STATUS_LABEL_KEY[detail.base.status], STATUS_LABEL_FALLBACK[detail.base.status])}
                </span>
              </div>
              <h2 className="knowledge-detail-title">
                {selectedContentItem?.name ?? detail.base.name}
              </h2>
              <p className="knowledge-detail-type">
                {selectedContentItem
                  ? selectedContentItem.meta
                  : selectedBaseKind === 'skill'
                    ? 'Skill knowledge base'
                    : selectedBaseKind === 'data'
                      ? 'Data source knowledge base'
                      : 'Knowledge base'}
              </p>
              <section className="knowledge-detail-section">
                <h3>Description</h3>
                <p>
                  {selectedContentItem?.description ||
                    detail.base.description ||
                    'No description provided.'}
                </p>
              </section>
              {!selectedContentItem ? (
                <section className="knowledge-detail-section">
                  <div className="knowledge-detail-stats">
                    <div>
                      <strong>
                        {selectedBaseKind === 'skill'
                          ? detail.skills.length
                          : selectedBaseKind === 'data'
                            ? detail.dataSources.length
                            : detail.documents.length}
                      </strong>
                      <span>{contentLabel}</span>
                    </div>
                    <div>
                      <strong>{connectedAgents.length}</strong>
                      <span>Connected agents</span>
                    </div>
                  </div>
                </section>
              ) : null}
              <section className="knowledge-detail-section">
                <h3>Connected agents</h3>
                {connectedAgents.length > 0 ? (
                  <div className="knowledge-detail-agents">
                    {connectedAgents.slice(0, 3).map((agent) => (
                      <div key={agent.id}>
                        <span>{agent.name.slice(0, 1).toUpperCase()}</span>
                        <strong>{agent.name}</strong>
                        <i aria-hidden="true" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No connected agents.</p>
                )}
              </section>
              <section className="knowledge-detail-section">
                <h3>Information</h3>
                <dl className="knowledge-detail-meta">
                  <div>
                    <dt>Status</dt>
                    <dd>{t(STATUS_LABEL_KEY[detail.base.status], STATUS_LABEL_FALLBACK[detail.base.status])}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>
                      {new Date(detail.base.updatedAt).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </section>
              <Button
                variant="secondary"
                className="knowledge-detail-edit"
                onClick={() => openRename(detail.base)}
              >
                <IconSettings />
                Edit knowledge base
              </Button>
            </>
          ) : (
            <div className="knowledge-workspace-empty">
              Select a knowledge base to view details.
            </div>
          )}
        </aside>
      </div>
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
            <Button
              type="submit"
              form={FORM_ID}
              disabled={
                isSaving ||
                !name.trim() ||
                (!editingId && !kind)
              }
            >
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
            {t(
              'ai.knowledge.companyLocked',
              'Created in the active company. Switch company from the sidebar to create one elsewhere.',
            )}
          </p>
          {editingId ? (
            <div className="console-form__section">
              <p>{t('ai.knowledge.renameAgentsNote')}</p>
            </div>
          ) : (
            <>
              <div className="console-form__section">
                <FormField
                  label={t('ai.knowledge.fieldKind', 'Type')}
                  htmlFor="kb-kind"
                >
                  <SidebarSelect
                    id="kb-kind"
                    className="console-form-select--down"
                    label={t('ai.knowledge.fieldKind', 'Type')}
                    hideLabel
                    value={kind}
                    options={[
                      {
                        value: '',
                        label: t(
                          'ai.knowledge.kindSelectPlaceholder',
                          'Select type...',
                        ),
                      },
                      ...KIND_ORDER.map((option) => ({
                        value: option,
                        label: t(KIND_LABEL_KEY[option]),
                      })),
                    ]}
                    onChange={(value) =>
                      setKind(value as KnowledgeBaseKind | '')
                    }
                    disabled={isSaving}
                  />
                </FormField>
                <p className="console-hint console-hint--flat">
                  {t(
                    'ai.knowledge.kindHint',
                    'Documents are indexed for search. Skills are callable actions. Data sources are queried live.',
                  )}
                </p>
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