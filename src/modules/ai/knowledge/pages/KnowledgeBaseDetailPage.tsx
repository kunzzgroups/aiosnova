import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { CheckList } from '@/components/ui/CheckList'
import { Drawer } from '@/components/ui/Drawer'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { PageTabs, type PageTab } from '@/components/ui/PageTabs'
import { SearchableCheckList } from '@/components/ui/SearchableCheckList'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconFolder, IconPaperclip } from '@/components/icons/Icons'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import type { AgentListItem } from '@/modules/ai/agents/types/agent'
import { ApiError } from '@/services/httpClient'
import {
  addKnowledgeDocument,
  fetchKnowledgeBase,
  setDocumentAgents,
  setKnowledgeBaseAgents,
} from '../services/knowledgeService'
import type {
  DocumentEffectiveAgents,
  KnowledgeBaseDetail,
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
} from '../types/knowledge'
import '@/modules/ai/shared/AiConsole.css'
import './KnowledgePage.css'

const TAB_IDS = ['documents', 'agents'] as const
type TabId = (typeof TAB_IDS)[number]

const ADD_FORM_ID = 'knowledge-source-form'

const STATUS_LABEL_KEY: Record<KnowledgeDocumentStatus, string> = {
  ready: 'ai.knowledge.statusReady',
  processing: 'ai.knowledge.statusProcessing',
  failed: 'ai.knowledge.statusFailed',
}

const TYPE_LABEL_KEY: Record<KnowledgeDocumentType, string> = {
  contract: 'ai.knowledge.typeContract',
  invoice: 'ai.knowledge.typeInvoice',
  policy: 'ai.knowledge.typePolicy',
  record: 'ai.knowledge.typeRecord',
}

const DOCUMENT_TYPES: KnowledgeDocumentType[] = ['policy', 'contract', 'invoice', 'record']

/** `all` plus every ingestion state the filter can narrow to. */
const STATUS_FILTERS = ['all', 'ready', 'processing', 'failed'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

/** Chips shown per row before collapsing into "+N". */
const MAX_CHIPS = 2

function formatUploaded(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '\u2014'
  }
  return date.toLocaleDateString()
}

/**
 * L2: one knowledge base, split into sections by its own tab strip.
 *
 * Sections live in the URL (`\u2026/:baseId/:tab`) rather than in component state, so a
 * section can be linked and survives a reload. `PageTabs` is the generic strip and
 * carries the Back action; `ModuleTabs` above stays on "Knowledge" because its
 * matcher is prefix-based.
 */
export function KnowledgeBaseDetailPage() {
  const { baseId = '', tab } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [docTitle, setDocTitle] = useState('')
  const [docType, setDocType] = useState<KnowledgeDocumentType>('policy')
  const [inheritAgents, setInheritAgents] = useState(true)
  const [docAgentIds, setDocAgentIds] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setDetail(await fetchKnowledgeBase(baseId))
    } catch {
      setDetail(null)
      setError(t('ai.knowledge.errLoadBase'))
    } finally {
      setIsLoading(false)
    }
  }, [baseId, t])

  useEffect(() => {
    void load()
  }, [load])

  /** Only agents of the base's OWN company may be assigned. */
  const baseCompanyId = detail?.base.companyId ?? ''
  useEffect(() => {
    if (!baseCompanyId) {
      return
    }
    let cancelled = false
    fetchAgents(baseCompanyId)
      .then((result) => {
        if (!cancelled) {
          setAgents(result.items)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgents([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [baseCompanyId])

  const effectiveByDocument = useMemo(() => {
    const map = new Map<string, DocumentEffectiveAgents>()
    for (const item of detail?.effective ?? []) {
      map.set(item.documentId, item)
    }
    return map
  }, [detail])

  const agentName = useCallback(
    (agentId: string) => agents.find((item) => item.id === agentId)?.name ?? agentId,
    [agents],
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

  const documents = detail?.documents ?? []
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return documents.filter((document) => {
      if (statusFilter !== 'all' && document.status !== statusFilter) {
        return false
      }
      return !needle || document.title.toLowerCase().includes(needle)
    })
  }, [documents, query, statusFilter])

  async function toggleBaseAgent(agentId: string) {
    if (!detail || isSaving) {
      return
    }
    const current = detail.baseAgentIds
    const next = current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId]

    setIsSaving(true)
    try {
      await setKnowledgeBaseAgents(detail.base.id, next)
      await load()
    } catch {
      setError(t('ai.knowledge.errAssign'))
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Ticking a document always WRITES an override - never merges with the base.
   * An override that ends up empty is kept as an empty override, which is how a
   * document is deliberately withheld from every agent while its base is shared.
   */
  async function toggleDocumentAgent(documentId: string, agentId: string) {
    if (isSaving) {
      return
    }
    const current = effectiveByDocument.get(documentId)?.agentIds ?? []
    const next = current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId]

    setIsSaving(true)
    try {
      await setDocumentAgents(documentId, next)
      await load()
    } catch {
      setError(t('ai.knowledge.errAssign'))
    } finally {
      setIsSaving(false)
    }
  }

  /** `null` clears the override, so the document inherits its base again. */
  async function clearDocumentOverride(documentId: string) {
    if (isSaving) {
      return
    }
    setIsSaving(true)
    try {
      await setDocumentAgents(documentId, null)
      await load()
    } catch {
      setError(t('ai.knowledge.errAssign'))
    } finally {
      setIsSaving(false)
    }
  }

  function openAddSource() {
    setDocTitle('')
    setDocType('policy')
    setInheritAgents(true)
    // Pre-filled so unticking "inherit" starts from what the base already shares.
    setDocAgentIds(detail?.baseAgentIds ?? [])
    setError(null)
    setAddOpen(true)
  }

  function toggleDocAgent(agentId: string) {
    setDocAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    )
  }

  async function handleAddSource(event: FormEvent) {
    event.preventDefault()
    if (!docTitle.trim()) {
      setError(t('ai.knowledge.errTitleRequired'))
      return
    }

    setIsAdding(true)
    setError(null)
    try {
      await addKnowledgeDocument(baseId, {
        title: docTitle,
        type: docType,
        // `null` means "no override": the document inherits the base's agents.
        agentIds: inheritAgents ? null : docAgentIds,
      })
      setMessage(t('ai.knowledge.msgSourceAdded'))
      setAddOpen(false)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('ai.knowledge.errAddSource'))
    } finally {
      setIsAdding(false)
    }
  }

  const tabs: PageTab[] = useMemo(
    () => [
      { id: 'documents', label: t('ai.knowledge.tabDocuments'), to: `/ai/ai/knowledge/${baseId}/documents` },
      { id: 'agents', label: t('ai.knowledge.tabAgents'), to: `/ai/ai/knowledge/${baseId}/agents` },
    ],
    [baseId, t],
  )

  // Hooks above run unconditionally, so redirecting here is safe.
  if (tab !== undefined && !TAB_IDS.includes(tab as TabId)) {
    return <Navigate to={`/ai/ai/knowledge/${baseId}/documents`} replace />
  }
  const activeTab: TabId = (tab as TabId | undefined) ?? 'documents'

  return (
    <div className="console-page">
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      <PageTabs
        items={tabs}
        ariaLabel={t('ai.knowledge.tabsAria')}
        actions={
          <Button variant="secondary" onClick={() => void navigate('/ai/ai/knowledge')}>
            {t('ai.knowledge.back')}
          </Button>
        }
      />

      <section className="console-panel">
        {activeTab === 'documents' ? (
          <>
            <div className="console-toolbar">
              <TextField
                className="console-toolbar__search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('ai.knowledge.searchPlaceholder')}
                aria-label={t('ai.knowledge.searchAria')}
              />
              <SidebarSelect
                id="knowledge-document-status"
                label={t('ai.knowledge.filterStatus')}
                value={statusFilter}
                options={STATUS_FILTERS.map((value) => ({
                  value,
                  label: value === 'all' ? t('ai.knowledge.filterAll') : t(STATUS_LABEL_KEY[value]),
                }))}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
              />
              <Button className="console-toolbar__action" onClick={openAddSource}>
                {t('ai.knowledge.addSource')}
              </Button>
            </div>

            {isLoading ? (
              <p className="console-empty">{t('ai.knowledge.loading')}</p>
            ) : visible.length === 0 ? (
              <p className="console-empty">
                {documents.length === 0
                  ? t('ai.knowledge.documentsEmpty')
                  : t('ai.knowledge.documentsEmptyFiltered')}
              </p>
            ) : (
              <div className="console-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>{t('ai.knowledge.colName')}</th>
                      <th>{t('ai.knowledge.colType')}</th>
                      <th>{t('ai.knowledge.colStatus')}</th>
                      <th>{t('ai.knowledge.colAgents')}</th>
                      <th>{t('ai.knowledge.colUploaded')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((document) => {
                      const effective = effectiveByDocument.get(document.id)
                      const agentIds = effective?.agentIds ?? []
                      return (
                        <tr key={document.id}>
                          <td>
                            <span className="console-table__name">
                              {document.kind === 'file' ? <IconPaperclip /> : <IconFolder />}
                              <span>{document.title}</span>
                            </span>
                          </td>
                          <td className="console-table__muted">
                            {t(TYPE_LABEL_KEY[document.type])}
                          </td>
                          <td>
                            <span className={`console-status console-status--${document.status}`}>
                              {t(STATUS_LABEL_KEY[document.status])}
                            </span>
                          </td>
                          <td>
                            {agentIds.length === 0 ? (
                              <span className="console-chip console-chip--muted">
                                {t('ai.knowledge.noAgentsReach')}
                              </span>
                            ) : (
                              <span className="console-chips">
                                {agentIds.slice(0, MAX_CHIPS).map((agentId) => (
                                  <span className="console-chip" key={agentId}>
                                    {agentName(agentId)}
                                  </span>
                                ))}
                                {agentIds.length > MAX_CHIPS ? (
                                  <span className="console-chip console-chip--muted">
                                    +{agentIds.length - MAX_CHIPS}
                                  </span>
                                ) : null}
                                {effective?.source === 'document' ? (
                                  <span className="console-chip console-chip--muted">
                                    {t('ai.knowledge.sourceOverride')}
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </td>
                          <td className="console-table__uploaded">
                            {formatUploaded(document.uploadedAt)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {activeTab === 'agents' ? (
          <>
            <div className="console-subhead">
              <div>
                <h3>{t('ai.knowledge.agentsAppliedTitle')}</h3>
                <p>{t('ai.knowledge.agentsAppliedHint')}</p>
              </div>
              {isSaving ? <span className="console-saving">{t('ai.knowledge.saving')}</span> : null}
            </div>
            <CheckList
              items={agentItems}
              selected={detail?.baseAgentIds ?? []}
              onToggle={(agentId) => void toggleBaseAgent(agentId)}
              emptyLabel={t('ai.knowledge.noAgentsInCompany')}
              ariaLabel={t('ai.knowledge.agentsAppliedTitle')}
              columns
              disabled={isSaving || isLoading}
            />

            <div className="console-subhead console-subhead--spaced">
              <div>
                <h3>{t('ai.knowledge.overridesTitle')}</h3>
                <p>{t('ai.knowledge.overridesHint')}</p>
              </div>
            </div>

            {documents.length === 0 ? (
              <p className="console-empty">{t('ai.knowledge.documentsEmpty')}</p>
            ) : (
              <div className="console-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>{t('ai.knowledge.colName')}</th>
                      <th>{t('ai.knowledge.colAgents')}</th>
                      <th>{t('ai.knowledge.colSource')}</th>
                      <th className="console-table__actions">{t('ai.knowledge.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((document) => {
                      const effective = effectiveByDocument.get(document.id)
                      const agentIds = effective?.agentIds ?? []
                      const overridden = effective?.source === 'document'
                      const expanded = expandedDocumentId === document.id
                      return (
                        <Fragment key={document.id}>
                          <tr>
                            <td>
                              <span className="console-table__name">
                                {document.kind === 'file' ? <IconPaperclip /> : <IconFolder />}
                                <span>{document.title}</span>
                              </span>
                            </td>
                            <td>
                              {agentIds.length === 0 ? (
                                <span className="console-chip console-chip--muted">
                                  {t('ai.knowledge.noAgentsReach')}
                                </span>
                              ) : (
                                <span className="console-chips">
                                  {agentIds.map((agentId) => (
                                    <span className="console-chip" key={agentId}>
                                      {agentName(agentId)}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </td>
                            <td className="console-table__muted">
                              {overridden
                                ? t('ai.knowledge.sourceOverride')
                                : t('ai.knowledge.sourceInherited')}
                            </td>
                            <td className="console-table__actions">
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  setExpandedDocumentId(expanded ? null : document.id)
                                }
                              >
                                {expanded
                                  ? t('ai.knowledge.overrideClose')
                                  : t('ai.knowledge.overrideEdit')}
                              </Button>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr>
                              <td colSpan={4}>
                                <p className="console-hint console-hint--flat">
                                  {t('ai.knowledge.overrideHint')}
                                </p>
                                <CheckList
                                  items={agentItems}
                                  selected={agentIds}
                                  onToggle={(agentId) =>
                                    void toggleDocumentAgent(document.id, agentId)
                                  }
                                  emptyLabel={t('ai.knowledge.noAgentsInCompany')}
                                  ariaLabel={t('ai.knowledge.overrideEdit')}
                                  columns
                                  disabled={isSaving}
                                />
                                {overridden ? (
                                  <div className="console-form__actions">
                                    <Button
                                      variant="ghost"
                                      onClick={() => void clearDocumentOverride(document.id)}
                                    >
                                      {t('ai.knowledge.overrideReset')}
                                    </Button>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </section>

      <Drawer
        open={addOpen}
        title={t('ai.knowledge.addSourceTitle')}
        description={t('ai.knowledge.addSourceHint')}
        onClose={() => setAddOpen(false)}
        busy={isAdding}
        closeLabel={t('common.dismiss')}
        footer={
          <>
            <Button type="submit" form={ADD_FORM_ID} disabled={isAdding}>
              {isAdding ? t('ai.knowledge.saving') : t('ai.knowledge.add')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAddOpen(false)}
              disabled={isAdding}
            >
              {t('ai.knowledge.cancel')}
            </Button>
          </>
        }
      >
        <form id={ADD_FORM_ID} onSubmit={(event) => void handleAddSource(event)}>
          <div className="console-form__grid">
            <FormField label={t('ai.knowledge.fieldTitle')} htmlFor="doc-title">
              <TextField
                id="doc-title"
                value={docTitle}
                onChange={(event) => setDocTitle(event.target.value)}
                placeholder={t('ai.knowledge.titlePlaceholder')}
                disabled={isAdding}
                autoComplete="off"
                autoFocus
              />
            </FormField>
            <FormField label={t('ai.knowledge.fieldType')} htmlFor="doc-type">
              <SidebarSelect
                id="doc-type"
                label={t('ai.knowledge.fieldType')}
                hideLabel
                value={docType}
                options={DOCUMENT_TYPES.map((value) => ({
                  value,
                  label: t(TYPE_LABEL_KEY[value]),
                }))}
                onChange={(value) => setDocType(value as KnowledgeDocumentType)}
                disabled={isAdding}
              />
            </FormField>
          </div>

          <div className="console-form__section">
            <label className="console-toggle">
              <input
                type="checkbox"
                checked={inheritAgents}
                disabled={isAdding}
                onChange={(event) => setInheritAgents(event.target.checked)}
              />
              <span>
                <span className="console-toggle__label">
                  {t('ai.knowledge.inheritAgents', { count: detail?.baseAgentIds.length ?? 0 })}
                </span>
                <span className="console-toggle__hint">{t('ai.knowledge.inheritAgentsHint')}</span>
              </span>
            </label>

            {inheritAgents ? null : (
              <div className="console-toggle__reveal">
                <h4>{t('ai.knowledge.docAgentsTitle')}</h4>
                <SearchableCheckList
                  items={agentItems}
                  selected={docAgentIds}
                  onToggle={toggleDocAgent}
                  emptyLabel={t('ai.knowledge.noAgentsInCompany')}
                  noMatchLabel={t('ai.knowledge.agentsSearchNoMatch')}
                  searchPlaceholder={t('ai.knowledge.agentsSearchPlaceholder')}
                  searchAriaLabel={t('ai.knowledge.agentsSearchAria')}
                  listAriaLabel={t('ai.knowledge.docAgentsTitle')}
                  disabled={isAdding}
                />
              </div>
            )}
          </div>
        </form>
      </Drawer>
    </div>
  )
}
