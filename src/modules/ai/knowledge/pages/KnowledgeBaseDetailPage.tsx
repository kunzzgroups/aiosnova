import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
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
import { IconFolder, IconPaperclip, IconPlus } from '@/components/icons/Icons'
import { FileDropZone } from '@/components/ui/FileDropZone'
import { useCompanyStore } from '@/stores/companyStore'
import {
  KeyValueEditor,
  keyValuePairsToObject,
  type KeyValuePair,
} from '@/components/ui/KeyValueEditor'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import type { AgentListItem } from '@/modules/ai/agents/types/agent'
import { ApiError } from '@/services/httpClient'
import {
  addKnowledgeDocument,
  addKnowledgeDataSource,
  addKnowledgeSkill,
  fetchKnowledgeBase,
  setDocumentAgents,
  setKnowledgeBaseAgents,
  updateKnowledgeDocumentStatus,
  updateKnowledgeDataSourceStatus,
  updateKnowledgeSkillStatus,
} from '../services/knowledgeService'
import type {
  DocumentEffectiveAgents,
  KnowledgeBaseDetail,
  KnowledgeBaseKind,
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
} from '../types/knowledge'
import '@/modules/ai/shared/AiConsole.css'
import './KnowledgePage.css'

const ALL_TABS = ['documents', 'skills', 'data', 'agents'] as const
type TabId = (typeof ALL_TABS)[number]

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

const STATUS_FILTERS = ['all', 'ready', 'processing', 'failed'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const MAX_CHIPS = 2

function formatUploaded(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '\u2014'
  }
  return date.toLocaleDateString()
}

function tabsForKind(kind: KnowledgeBaseKind): TabId[] {
  switch (kind) {
    case 'skill':
      return ['skills', 'agents']
    case 'data':
      return ['data', 'agents']
    case 'document':
    default:
      return ['documents', 'agents']
  }
}

function defaultTabForKind(kind: KnowledgeBaseKind): TabId {
  return tabsForKind(kind)[0]
}

const TAB_LABEL_KEY: Record<TabId, string> = {
  documents: 'ai.knowledge.tabDocuments',
  skills: 'ai.knowledge.tabSkills',
  data: 'ai.knowledge.tabData',
  agents: 'ai.knowledge.tabAgents',
}

export function KnowledgeBaseDetailPage() {
  const { baseId = '', tab } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  /**
   * The active company. Used two ways:
   *   1. To fetch the agents THIS user (as this company) can tick.
   *   2. To filter out agent IDs from other companies when rendering.
   */
  const activeCompanyId = useCompanyStore((state) => state.companyId)

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
  const [inheritAgents, setInheritAgents] = useState(true)
  const [docAgentIds, setDocAgentIds] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)

  // ---- Document form
  const [docTitle, setDocTitle] = useState('')
  const [docType, setDocType] = useState<KnowledgeDocumentType>('policy')
  const [docFile, setDocFile] = useState<File[]>([])

  // ---- Skill form
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [skillFile, setSkillFile] = useState<File[]>([])

  // ---- Data source form
  const [dsName, setDsName] = useState('')
  const [dsKind, setDsKind] = useState<'table' | 'api' | 'database'>('table')
  const [dsFile, setDsFile] = useState<File[]>([])
  const [dsConfig, setDsConfig] = useState<KeyValuePair[]>([])

  const highlightDocumentId = searchParams.get('highlight')

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

  /* Fetch the ACTIVE company's agents. Ticking writes `agentKnowledgeLinks`
     on those agents, so a company that shares a base only ever sees and
     manages its own agents here. */
  useEffect(() => {
    if (!activeCompanyId) {
      setAgents([])
      return
    }
    let cancelled = false
    fetchAgents(activeCompanyId)
      .then((result) => {
        if (!cancelled) setAgents(result.items)
      })
      .catch(() => {
        if (!cancelled) setAgents([])
      })
    return () => {
      cancelled = true
    }
  }, [activeCompanyId])

  /** Set of the active company's agent IDs, for fast membership checks. */
  const activeAgentIds = useMemo(
    () => new Set(agents.map((agent) => agent.id)),
    [agents],
  )

  /**
   * Effective agents per document, filtered to the ACTIVE company.
   *
   * `detail.effective` may contain agent IDs from the base's owner company.
   * A company reading a shared base must never see those IDs — only the
   * ones belonging to its own agents are kept.
   */
  const effectiveByDocument = useMemo(() => {
    const map = new Map<string, DocumentEffectiveAgents>()
    for (const item of detail?.effective ?? []) {
      const visible = item.agentIds.filter((id) => activeAgentIds.has(id))
      map.set(item.documentId, { ...item, agentIds: visible })
    }
    return map
  }, [detail, activeAgentIds])

  /** Agent name lookup. Returns '' when the ID isn't in the active company. */
  const agentName = useCallback(
    (agentId: string) => agents.find((item) => item.id === agentId)?.name ?? '',
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

  /** Base-level agent IDs, filtered to the ACTIVE company. */
  const visibleBaseAgentIds = useMemo(
    () => (detail?.baseAgentIds ?? []).filter((id) => activeAgentIds.has(id)),
    [detail, activeAgentIds],
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

  /* Scroll to + highlight the document the assistant linked to. */
  useEffect(() => {
    if (!highlightDocumentId) return
    if (tab !== undefined && tab !== 'documents') return
    const handle = window.setTimeout(() => {
      const row = document.getElementById(`doc-row-${highlightDocumentId}`)
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 200)
    return () => window.clearTimeout(handle)
  }, [highlightDocumentId, tab, visible])

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
    setDocFile([])

    setSkillName('')
    setSkillDescription('')
    setSkillFile([])

    setDsName('')
    setDsKind('table')
    setDsFile([])
    setDsConfig([])

    setInheritAgents(true)
    setDocAgentIds(visibleBaseAgentIds)
    setError(null)
    setAddOpen(true)
  }

  function toggleDocAgent(agentId: string) {
    setDocAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    )
  }

  async function cycleDocumentStatus(
    documentId: string,
    current: KnowledgeDocumentStatus,
  ) {
    const next: KnowledgeDocumentStatus =
      current === 'processing' ? 'ready' : current === 'ready' ? 'failed' : 'processing'
    try {
      await updateKnowledgeDocumentStatus(documentId, next)
      await load()
    } catch {
      setError(t('ai.knowledge.errStatus'))
    }
  }

  async function cycleSkillStatus(skillId: string, current: 'ready' | 'failed') {
    const next = current === 'ready' ? 'failed' : 'ready'
    try {
      await updateKnowledgeSkillStatus(skillId, next)
      await load()
    } catch {
      setError(t('ai.knowledge.errStatus'))
    }
  }

  async function cycleDataSourceStatus(
    dsId: string,
    current: 'connected' | 'disconnected' | 'error',
  ) {
    const next =
      current === 'disconnected' ? 'connected' : current === 'connected' ? 'error' : 'disconnected'
    try {
      await updateKnowledgeDataSourceStatus(dsId, next)
      await load()
    } catch {
      setError(t('ai.knowledge.errStatus'))
    }
  }

  async function handleAddSource(event: FormEvent) {
    event.preventDefault()
    const kind: KnowledgeBaseKind = detail?.base.kind ?? 'document'

    setIsAdding(true)
    setError(null)
    try {
      if (kind === 'document') {
        if (!docTitle.trim() && docFile.length === 0) {
          setError(t('ai.knowledge.errTitleRequired'))
          return
        }

        if (docFile.length > 0) {
          for (const file of docFile) {
            await addKnowledgeDocument(baseId, {
              title: file.name,
              type: docType,
              agentIds: inheritAgents ? null : docAgentIds,
              file,
            })
          }
        } else {
          await addKnowledgeDocument(baseId, {
            title: docTitle,
            type: docType,
            agentIds: inheritAgents ? null : docAgentIds,
          })
        }
      } else if (kind === 'skill') {
        if (!skillName.trim()) {
          setError(t('ai.knowledge.errSkillNameRequired'))
          return
        }
        const inputSchema: Record<string, unknown> | undefined =
          skillFile.length > 0 ? { sourceFile: skillFile[0].name } : undefined
        await addKnowledgeSkill(baseId, {
          name: skillName,
          description: skillDescription,
          inputSchema,
          agentIds: inheritAgents ? null : docAgentIds,
        })
      } else {
        if (!dsName.trim()) {
          setError(t('ai.knowledge.errDataSourceNameRequired'))
          return
        }
        const config = keyValuePairsToObject(dsConfig)
        if (dsFile.length > 0) {
          config.sourceFile = dsFile[0].name
        }
        await addKnowledgeDataSource(baseId, {
          name: dsName,
          kind: dsKind,
          config,
          agentIds: inheritAgents ? null : docAgentIds,
        })
      }

      setMessage(t('ai.knowledge.msgSourceAdded'))
      setAddOpen(false)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('ai.knowledge.errAddSource'))
    } finally {
      setIsAdding(false)
    }
  }

  const kind: KnowledgeBaseKind = detail?.base.kind ?? 'document'
  const visibleTabs = useMemo(() => tabsForKind(kind), [kind])

  const tabs: PageTab[] = useMemo(
    () =>
      visibleTabs.map((id) => ({
        id,
        label: t(TAB_LABEL_KEY[id]),
        to: `/ai/ai/knowledge/${baseId}/${id}`,
      })),
    [visibleTabs, baseId, t],
  )

  if (tab !== undefined && !visibleTabs.includes(tab as TabId)) {
    return <Navigate to={`/ai/ai/knowledge/${baseId}/${defaultTabForKind(kind)}`} replace />
  }
  const activeTab: TabId = (tab as TabId | undefined) ?? defaultTabForKind(kind)

  function renderAgentsSection() {
    return (
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
              {t('ai.knowledge.inheritAgents', { count: visibleBaseAgentIds.length })}
            </span>
            <span className="console-toggle__hint">
              {t('ai.knowledge.agentsHint')}
            </span>
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
    )
  }

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
                <IconPlus />
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
                <table className="console-table console-table--fixed">
                  <colgroup>
                    <col style={{ width: '34%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
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
                        <tr
                          key={document.id}
                          id={`doc-row-${document.id}`}
                          className={
                            document.id === highlightDocumentId
                              ? 'console-table__row--highlight'
                              : undefined
                          }
                        >
                          <td>
                            <span className="console-table__name">
                              {document.kind === 'file' ? <IconPaperclip /> : <IconFolder />}
                              <span>{document.title}</span>
                            </span>
                            {document.fileUrl ? (
                              <a
                                className="console-file-link"
                                href={document.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={document.title}
                              >
                                {t('ai.knowledge.download')}
                              </a>
                            ) : null}
                          </td>
                          <td className="console-table__muted">
                            {t(TYPE_LABEL_KEY[document.type])}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`console-status console-status--${document.status} console-status--clickable`}
                              onClick={() =>
                                void cycleDocumentStatus(document.id, document.status)
                              }
                              title={t('ai.knowledge.statusClickHint')}
                            >
                              {t(STATUS_LABEL_KEY[document.status])}
                            </button>
                          </td>
                          <td>
                            {agentIds.length === 0 ? (
                              <span className="console-chip console-chip--muted">
                                {t('ai.knowledge.noAgentsReach')}
                              </span>
                            ) : (
                              <span className="console-chips">
                                {agentIds.slice(0, MAX_CHIPS).map((agentId) => {
                                  const name = agentName(agentId)
                                  if (!name) return null
                                  return (
                                    <Link
                                      key={agentId}
                                      className="console-chip console-chip--link"
                                      to={`/ai/ai/agents?agentId=${encodeURIComponent(agentId)}`}
                                    >
                                      {name}
                                    </Link>
                                  )
                                })}
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

        {activeTab === 'skills' ? (
          <>
            <div className="console-subhead">
              <div>
                <h3>{t('ai.knowledge.skillsTitle')}</h3>
                <p>{t('ai.knowledge.skillsHint')}</p>
              </div>
              <Button className="console-toolbar__action" onClick={openAddSource}>
                {t('ai.knowledge.addSource')}
              </Button>
            </div>

            {isLoading ? (
              <p className="console-empty">{t('ai.knowledge.loading')}</p>
            ) : (detail?.skills.length ?? 0) === 0 ? (
              <p className="console-empty">{t('ai.knowledge.skillsEmpty')}</p>
            ) : (
              <div className="console-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>{t('ai.knowledge.colName')}</th>
                      <th>{t('ai.knowledge.colDescription')}</th>
                      <th>{t('ai.knowledge.colSchema')}</th>
                      <th>{t('ai.knowledge.colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.skills.map((skill) => (
                      <tr key={skill.id}>
                        <td>
                          <span className="console-table__name">{skill.name}</span>
                        </td>
                        <td className="console-table__muted">{skill.description}</td>
                        <td className="console-table__muted">
                          <code className="console-code">
                            {skill.inputSchema
                              ? Object.entries(skill.inputSchema)
                                .map(([k, v]) => `${k}: ${String(v)}`)
                                .join(', ')
                              : '—'}
                          </code>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`console-status console-status--${skill.status} console-status--clickable`}
                            onClick={() => void cycleSkillStatus(skill.id, skill.status)}
                            title={t('ai.knowledge.statusClickHint')}
                          >
                            {skill.status}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {activeTab === 'data' ? (
          <>
            <div className="console-subhead">
              <div>
                <h3>{t('ai.knowledge.dataTitle')}</h3>
                <p>{t('ai.knowledge.dataHint')}</p>
              </div>
              <Button className="console-toolbar__action" onClick={openAddSource}>
                {t('ai.knowledge.addSource')}
              </Button>
            </div>

            {isLoading ? (
              <p className="console-empty">{t('ai.knowledge.loading')}</p>
            ) : (detail?.dataSources.length ?? 0) === 0 ? (
              <p className="console-empty">{t('ai.knowledge.dataEmpty')}</p>
            ) : (
              <div className="console-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>{t('ai.knowledge.colName')}</th>
                      <th>{t('ai.knowledge.colKind')}</th>
                      <th>{t('ai.knowledge.colConfig')}</th>
                      <th>{t('ai.knowledge.colSynced')}</th>
                      <th>{t('ai.knowledge.colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.dataSources.map((ds) => (
                      <tr key={ds.id}>
                        <td>
                          <span className="console-table__name">{ds.name}</span>
                        </td>
                        <td className="console-table__muted">{ds.kind}</td>
                        <td className="console-table__muted">
                          <span className="console-chips">
                            {Object.entries(ds.config).map(([k, v]) => (
                              <span className="console-chip console-chip--muted" key={k}>
                                {k}: {v}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="console-table__muted">
                          {ds.lastSyncedAt ? formatUploaded(ds.lastSyncedAt) : '—'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`console-status console-status--${ds.status} console-status--clickable`}
                            onClick={() => void cycleDataSourceStatus(ds.id, ds.status)}
                            title={t('ai.knowledge.statusClickHint')}
                          >
                            {ds.status}
                          </button>
                        </td>
                      </tr>
                    ))}
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
              selected={visibleBaseAgentIds}
              onToggle={(agentId) => void toggleBaseAgent(agentId)}
              emptyLabel={t('ai.knowledge.noAgentsInCompany')}
              ariaLabel={t('ai.knowledge.agentsAppliedTitle')}
              columns
              disabled={isSaving || isLoading}
            />

            {kind === 'document' ? (
              <>
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
                    <table className="console-table console-table--fixed">
                      <colgroup>
                        <col style={{ width: '30%' }} />
                        <col style={{ width: '40%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '15%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>{t('ai.knowledge.colName')}</th>
                          <th>{t('ai.knowledge.colAgents')}</th>
                          <th>{t('ai.knowledge.colSource')}</th>
                          <th className="console-table__actions">
                            {t('ai.knowledge.colActions')}
                          </th>
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
                                      {agentIds.map((agentId) => {
                                        const name = agentName(agentId)
                                        if (!name) return null
                                        return (
                                          <Link
                                            key={agentId}
                                            className="console-chip console-chip--link"
                                            to={`/ai/ai/agents?agentId=${encodeURIComponent(agentId)}`}
                                          >
                                            {name}
                                          </Link>
                                        )
                                      })}
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
                                          onClick={() =>
                                            void clearDocumentOverride(document.id)
                                          }
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
          {kind === 'document' ? (
            <>
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
                <h4>{t('ai.knowledge.fieldFile')}</h4>
                <FileDropZone
                  value={docFile}
                  onChange={(files) => {
                    setDocFile(files)
                    const first = files[0]
                    if (first && !docTitle.trim()) {
                      setDocTitle(first.name)
                    }
                  }}
                  disabled={isAdding}
                  multiple
                  hint={t('common.fileDropHint', 'PDF, DOCX, XLSX, PNG, JPG, TXT up to 10 MB')}
                />
              </div>
            </>
          ) : null}

          {kind === 'skill' ? (
            <>
              <div className="console-form__grid">
                <FormField label={t('ai.knowledge.fieldSkillName')} htmlFor="skill-name">
                  <TextField
                    id="skill-name"
                    value={skillName}
                    onChange={(event) => setSkillName(event.target.value)}
                    placeholder="e.g. calculate_tax"
                    disabled={isAdding}
                    autoComplete="off"
                    autoFocus
                  />
                </FormField>
                <FormField
                  label={t('ai.knowledge.fieldSkillDescription')}
                  htmlFor="skill-description"
                >
                  <TextField
                    id="skill-description"
                    value={skillDescription}
                    onChange={(event) => setSkillDescription(event.target.value)}
                    placeholder={t('ai.knowledge.fieldSkillDescriptionPlaceholder')}
                    disabled={isAdding}
                    autoComplete="off"
                  />
                </FormField>
              </div>

              <div className="console-form__section">
                <h4>{t('ai.knowledge.fieldFile')}</h4>
                <FileDropZone
                  value={skillFile}
                  onChange={(files) => {
                    setSkillFile(files)
                    const first = files[0]
                    if (first && !skillName.trim()) {
                      setSkillName(first.name.replace(/\.[^.]+$/, ''))
                    }
                  }}
                  disabled={isAdding}
                  hint={t(
                    'ai.knowledge.skillFileHint',
                    'Optional: attach a spec, sample, or screenshot.',
                  )}
                />
              </div>
            </>
          ) : null}

          {kind === 'data' ? (
            <>
              <div className="console-form__grid">
                <FormField label={t('ai.knowledge.fieldDataSourceName')} htmlFor="ds-name">
                  <TextField
                    id="ds-name"
                    value={dsName}
                    onChange={(event) => setDsName(event.target.value)}
                    placeholder="e.g. customers"
                    disabled={isAdding}
                    autoComplete="off"
                    autoFocus
                  />
                </FormField>
                <FormField label={t('ai.knowledge.fieldDataSourceKind')} htmlFor="ds-kind">
                  <SidebarSelect
                    id="ds-kind"
                    label={t('ai.knowledge.fieldDataSourceKind')}
                    hideLabel
                    value={dsKind}
                    options={[
                      { value: 'table', label: 'Table' },
                      { value: 'api', label: 'API' },
                      { value: 'database', label: 'Database' },
                    ]}
                    onChange={(value) => setDsKind(value as 'table' | 'api' | 'database')}
                    disabled={isAdding}
                  />
                </FormField>
              </div>

              <div className="console-form__section">
                <h4>{t('ai.knowledge.fieldFile')}</h4>
                <FileDropZone
                  value={dsFile}
                  onChange={(files) => {
                    setDsFile(files)
                    const first = files[0]
                    if (first && !dsName.trim()) {
                      setDsName(first.name.replace(/\.[^.]+$/, ''))
                    }
                  }}
                  disabled={isAdding}
                  hint={t(
                    'ai.knowledge.dataFileHint',
                    'Optional: a schema dump, sample export, or screenshot.',
                  )}
                />
              </div>

              <div className="console-form__section">
                <h4>{t('ai.knowledge.fieldDataSourceConfig')}</h4>
                <KeyValueEditor
                  items={dsConfig}
                  onChange={setDsConfig}
                  disabled={isAdding}
                  keyPlaceholder="table"
                  valuePlaceholder="customers"
                  addLabel={t('ai.knowledge.addConfigField', 'Add config field')}
                />
              </div>
            </>
          ) : null}

          {renderAgentsSection()}
        </form>
      </Drawer>
    </div>
  )
}