import { AgentAssignmentChoice } from '@/modules/ai/shared/AgentAssignmentChoice'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Drawer } from '@/components/ui/Drawer'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TablePagination } from '@/components/ui/TablePagination'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconFolder, IconPaperclip, IconPlus, IconTrash, IconPencil } from '@/components/icons/Icons'
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
  renameKnowledgeDocument,
  documentUploadTitle,
  deleteKnowledgeDocument,
  deleteKnowledgeSkill,
  deleteKnowledgeDataSource,
  addKnowledgeDataSource,
  addKnowledgeSkill,
  fetchKnowledgeBase,
  userCanWriteKnowledge,
  setDocumentAgents,
  setKnowledgeBaseAgents,
  updateKnowledgeDocumentMode,
  updateKnowledgeDataSourceMode,
  updateKnowledgeSkillMode,
} from '../services/knowledgeService'
import type {
  DocumentEffectiveAgents,
  KnowledgeBaseDetail,
  KnowledgeBaseKind,
  KnowledgeDocument,
  KnowledgeSkill,
  KnowledgeDataSource,
  KnowledgeItemDisplayStatus,
  KnowledgeManualMode,
  KnowledgeDocumentType,
} from '../types/knowledge'
import {
  getDataSourceDisplayStatus,
  getDocumentDisplayStatus,
  getSkillDisplayStatus,
  nextKnowledgeManualMode,
} from '../types/knowledge'
import '@/modules/ai/shared/AiConsole.css'
import './KnowledgePage.css'
const ALL_TABS = ['documents', 'skills', 'data', 'agents'] as const
type TabId = (typeof ALL_TABS)[number]
const ADD_FORM_ID = 'knowledge-source-form'
const STATUS_LABEL_KEY: Record<KnowledgeItemDisplayStatus, string> = {
  ready: 'ai.knowledge.statusReady',
  processing: 'ai.knowledge.statusProcessing',
  stored_only: 'ai.knowledge.statusStoredOnly',
  testing: 'ai.knowledge.statusTesting',
  paused: 'ai.knowledge.statusPaused',
  failed: 'ai.knowledge.statusFailed',
}

const STATUS_LABEL_FALLBACK: Record<KnowledgeItemDisplayStatus, string> = {
  ready: 'Ready',
  processing: 'Processing',
  stored_only: 'Stored only',
  testing: 'Testing',
  paused: 'Paused',
  failed: 'Failed',
}
const TYPE_LABEL_KEY: Record<KnowledgeDocumentType, string> = {
  contract: 'ai.knowledge.typeContract',
  invoice: 'ai.knowledge.typeInvoice',
  policy: 'ai.knowledge.typePolicy',
  record: 'ai.knowledge.typeRecord',
}
const DOCUMENT_TYPES: KnowledgeDocumentType[] = ['policy', 'contract', 'invoice', 'record']
const STATUS_FILTERS = ['all', 'ready', 'processing', 'testing', 'paused', 'failed'] as const
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

type SkillInputType = 'string' | 'number' | 'boolean'

type SkillInputDraft = {
  id: string
  name: string
  type: SkillInputType
}

let skillInputSequence = 0

function createSkillInputDraft(): SkillInputDraft {
  skillInputSequence += 1
  return {
    id: `skill-input-${skillInputSequence}`,
    name: '',
    type: 'string',
  }
}

export function KnowledgeBaseDetailPage() {
  const { baseId = '', tab } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeCompanyId = useCompanyStore((state) => state.companyId)
  const canWriteKnowledge = userCanWriteKnowledge(activeCompanyId ?? '')
  const loadRequest = useRef(0)
  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [agentQuery, setAgentQuery] = useState('')
  const [overrideQuery, setOverrideQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [documentPageSize, setDocumentPageSize] = useState(0)
  const [documentAutoPageSize, setDocumentAutoPageSize] = useState(10)
  const [documentPage, setDocumentPage] = useState(1)
  const [skillPageSize, setSkillPageSize] = useState(0)
  const [skillAutoPageSize, setSkillAutoPageSize] = useState(10)
  const [skillPage, setSkillPage] = useState(1)
  const [dataPageSize, setDataPageSize] = useState(0)
  const [dataAutoPageSize, setDataAutoPageSize] = useState(10)
  const [dataPage, setDataPage] = useState(1)
  const [overridePageSize, setOverridePageSize] = useState(0)
  const [overrideAutoPageSize, setOverrideAutoPageSize] = useState(10)
  const [overridePage, setOverridePage] = useState(1)
  const documentTableRef = useRef<HTMLDivElement>(null)
  const documentAutoFitRowMeasurement = useRef({ width: 0, height: 0 })
  const skillTableRef = useRef<HTMLDivElement>(null)
  const skillAutoFitRowMeasurement = useRef({ width: 0, height: 0 })
  const dataTableRef = useRef<HTMLDivElement>(null)
  const dataAutoFitRowMeasurement = useRef({ width: 0, height: 0 })
  const overrideTableRef = useRef<HTMLDivElement>(null)
  const overrideAutoFitRowMeasurement = useRef({ width: 0, height: 0 })
  const agentListRef = useRef<HTMLDivElement>(null)
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [inheritAgents, setInheritAgents] = useState(true)
  const [docAgentIds, setDocAgentIds] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState<KnowledgeDocument | null>(null)
  const [pendingDeleteSkill, setPendingDeleteSkill] = useState<KnowledgeSkill | null>(null)
  const [pendingDeleteDataSource, setPendingDeleteDataSource] = useState<KnowledgeDataSource | null>(null)
  const [isDeletingDocument, setIsDeletingDocument] = useState(false)
  const [isDeletingSkill, setIsDeletingSkill] = useState(false)
  const [isDeletingDataSource, setIsDeletingDataSource] = useState(false)
  const [renaming, setRenaming] = useState<KnowledgeDocument | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameScope = useRef(0)
  useEffect(() => {
    renameScope.current++
    setRenaming(null); setRenameError(null); setRenameBusy(false)
    return () => { renameScope.current++ }
  }, [baseId, activeCompanyId])
  const [docTitle, setDocTitle] = useState('')
  const [docType, setDocType] = useState<KnowledgeDocumentType>('policy')
  const [docFile, setDocFile] = useState<File[]>([])
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [skillFile, setSkillFile] = useState<File[]>([])
  const [skillInputs, setSkillInputs] = useState<SkillInputDraft[]>([])
  const [dsName, setDsName] = useState('')
  const [dsKind, setDsKind] = useState<'table' | 'api' | 'database'>('table')
  const [dsFile, setDsFile] = useState<File[]>([])
  const [dsConfig, setDsConfig] = useState<KeyValuePair[]>([])
  useEffect(() => {
    setRenaming(null); setRenameError(null); setAddOpen(false); setPendingDeleteDocument(null); setPendingDeleteSkill(null); setPendingDeleteDataSource(null)
  }, [activeCompanyId])
  const highlightDocumentId = searchParams.get('highlight')
  const load = useCallback(async () => {
    const request = ++loadRequest.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchKnowledgeBase(baseId, activeCompanyId ?? '')
      if (request !== loadRequest.current) return
      setDetail(result)
    } catch {
      if (request !== loadRequest.current) return
      setDetail(null)
      setError(t('ai.knowledge.errLoadBase'))
    } finally {
      if (request === loadRequest.current) setIsLoading(false)
    }
  }, [baseId, activeCompanyId, t])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!detail?.documents.some(document => document.status === 'processing')) return
    let cancelled = false
    let busy = false
    const timer = window.setInterval(() => {
      if (busy) return
      busy = true
      void fetchKnowledgeBase(baseId, activeCompanyId ?? '').then(result => {
        if (!cancelled) setDetail(result)
      }).catch(() => { /* Keep current content; normal reload still reports errors. */ }).finally(() => { busy = false })
    }, 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [baseId, activeCompanyId, detail?.documents.some(document => document.status === 'processing')])
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
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status === 'active'),
    [agents],
  )

  const activeAgentIds = useMemo(
    () => new Set(activeAgents.map((agent) => agent.id)),
    [activeAgents],
  )
  const effectiveByDocument = useMemo(() => {
    const map = new Map<string, DocumentEffectiveAgents>()
    for (const item of detail?.effective ?? []) {
      const visible = item.agentIds.filter((id) => activeAgentIds.has(id))
      map.set(item.documentId, { ...item, agentIds: visible })
    }
    return map
  }, [detail, activeAgentIds])
  const agentName = useCallback(
    (agentId: string) =>
      activeAgents.find((item) => item.id === agentId)?.name ?? '',
    [activeAgents],
  )
  const visibleBaseAgentIds = useMemo(
    () => (detail?.baseAgentIds ?? []).filter((id) => activeAgentIds.has(id)),
    [detail, activeAgentIds],
  )
  const kind: KnowledgeBaseKind = detail?.base.kind ?? 'document'
  const visibleTabs = useMemo(() => tabsForKind(kind), [kind])
  const activeTab: TabId =
    (tab as TabId | undefined) ?? defaultTabForKind(kind)

  useEffect(() => {
    if (activeTab === 'agents') {
      agentListRef.current?.scrollTo({ top: 0 })
    }
  }, [baseId, activeTab])

  const filteredAgents = useMemo(() => {
    const needle = agentQuery.trim().toLowerCase()
    if (!needle) return activeAgents
    return activeAgents.filter((agent) =>
      `${agent.name} ${agent.description ?? ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [activeAgents, agentQuery])

  const overrideDocuments = useMemo(() => {
    const needle = overrideQuery.trim().toLowerCase()
    if (!needle) return detail?.documents ?? []
    return (detail?.documents ?? []).filter((document) =>
      `${document.title} ${document.type}`
        .toLowerCase()
        .includes(needle),
    )
  }, [detail?.documents, overrideQuery])


  const nonDocumentScopeItems = useMemo(() => {
    const needle = overrideQuery.trim().toLowerCase()

    if (kind === 'skill') {
      return (detail?.skills ?? [])
        .filter(
          (skill) =>
            !needle ||
            `${skill.name} ${skill.description ?? ''}`
              .toLowerCase()
              .includes(needle),
        )
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          status: getSkillDisplayStatus(skill),
        }))
    }

    if (kind === 'data') {
      return (detail?.dataSources ?? [])
        .filter(
          (ds) =>
            !needle ||
            `${ds.name} ${ds.kind}`
              .toLowerCase()
              .includes(needle),
        )
        .map((ds) => ({
          id: ds.id,
          name: ds.name,
          status: getDataSourceDisplayStatus(ds),
        }))
    }

    return []
  }, [
    detail?.skills,
    detail?.dataSources,
    kind,
    overrideQuery,
  ])

  const effectiveOverridePageSize =
    overridePageSize || overrideAutoPageSize

  const agentScopeTotal =
    kind === 'document'
      ? overrideDocuments.length
      : nonDocumentScopeItems.length

  const totalOverridePages = Math.max(
    1,
    Math.ceil(agentScopeTotal / effectiveOverridePageSize),
  )

  const currentOverridePage = Math.min(
    overridePage,
    totalOverridePages,
  )

  const pagedOverrideDocuments = overrideDocuments.slice(
    (currentOverridePage - 1) * effectiveOverridePageSize,
    currentOverridePage * effectiveOverridePageSize,
  )


  const pagedNonDocumentScopeItems = nonDocumentScopeItems.slice(
    (currentOverridePage - 1) * effectiveOverridePageSize,
    currentOverridePage * effectiveOverridePageSize,
  )

  useEffect(() => {
    setOverridePage(1)
  }, [baseId, overrideQuery, effectiveOverridePageSize])

  useEffect(() => {
    overrideTableRef.current?.scrollTo({ top: 0 })
  }, [currentOverridePage, effectiveOverridePageSize])

  useEffect(() => {
    if (
      activeTab !== 'agents' ||
      isLoading ||
      agentScopeTotal === 0 ||
      overridePageSize !== 0 ||
      (kind === 'document' && expandedDocumentId !== null)
    ) {
      return
    }

    const container = overrideTableRef.current
    const table = container?.querySelector('table')

    if (!container || !table) return

    const containerElement = container
    const tableElement = table
    let frame = 0

    function measureRows() {
      const rowSelector =
        kind === 'document'
          ? 'tbody > tr:not(.knowledge-agent-split__override-row)'
          : 'tbody > tr'

      const rows = Array.from(
        tableElement.querySelectorAll<HTMLTableRowElement>(rowSelector),
      )

      if (!rows.length) return

      // Keep this in parity with the Documents table:
      // measure the natural row first, then distribute spare body height.
      rows.forEach((row) => row.style.removeProperty('height'))

      const width = containerElement.clientWidth
      const headerHeight =
        tableElement.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const availableHeight = containerElement.clientHeight - headerHeight

      if (availableHeight <= 0) return

      if (overrideAutoFitRowMeasurement.current.width !== width) {
        overrideAutoFitRowMeasurement.current = { width, height: 0 }
      }

      if (
        currentOverridePage === 1 ||
        !overrideAutoFitRowMeasurement.current.height
      ) {
        const naturalHeight = Math.max(
          1,
          ...rows.map((row) => row.getBoundingClientRect().height),
        )

        overrideAutoFitRowMeasurement.current.height = Math.max(
          overrideAutoFitRowMeasurement.current.height,
          naturalHeight,
        )
      }

      const limit = Math.max(
        1,
        Math.floor(
          availableHeight / overrideAutoFitRowMeasurement.current.height,
        ),
      )

      setOverrideAutoPageSize((current) =>
        current === limit ? current : limit,
      )

      const uniformHeight = availableHeight / limit

      rows.forEach((row) => {
        row.style.height = `${uniformHeight}px`
      })
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(containerElement)
    observer.observe(tableElement)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      const rowSelector =
        kind === 'document'
          ? 'tbody > tr:not(.knowledge-agent-split__override-row)'
          : 'tbody > tr'

      tableElement
        .querySelectorAll<HTMLTableRowElement>(rowSelector)
        .forEach((row) => row.style.removeProperty('height'))
    }
  }, [
    activeTab,
    kind,
    isLoading,
    agentScopeTotal,
    overridePageSize,
    currentOverridePage,
    effectiveOverridePageSize,
    expandedDocumentId,
  ])
  const skills = detail?.skills ?? []
  const dataSources = detail?.dataSources ?? []

  const visibleSkills = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return skills.filter((skill) => {
      const displayStatus = getSkillDisplayStatus(skill)
      if (statusFilter !== 'all' && displayStatus !== statusFilter) {
        return false
      }
      return (
        !needle ||
        `${skill.name} ${skill.description ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
    })
  }, [skills, query, statusFilter])

  const visibleDataSources = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return dataSources.filter((ds) => {
      const displayStatus = getDataSourceDisplayStatus(ds)
      if (statusFilter !== 'all' && displayStatus !== statusFilter) {
        return false
      }
      return (
        !needle ||
        `${ds.name} ${ds.kind} ${Object.values(ds.config).join(' ')}`
          .toLowerCase()
          .includes(needle)
      )
    })
  }, [dataSources, query, statusFilter])

  const effectiveSkillPageSize = skillPageSize || skillAutoPageSize
  const skillPageCount = Math.max(
    1,
    Math.ceil(visibleSkills.length / effectiveSkillPageSize),
  )
  const currentSkillPage = Math.min(skillPage, skillPageCount)
  const pagedSkills = visibleSkills.slice(
    (currentSkillPage - 1) * effectiveSkillPageSize,
    currentSkillPage * effectiveSkillPageSize,
  )

  const effectiveDataPageSize = dataPageSize || dataAutoPageSize
  const dataPageCount = Math.max(
    1,
    Math.ceil(visibleDataSources.length / effectiveDataPageSize),
  )
  const currentDataPage = Math.min(dataPage, dataPageCount)
  const pagedDataSources = visibleDataSources.slice(
    (currentDataPage - 1) * effectiveDataPageSize,
    currentDataPage * effectiveDataPageSize,
  )

  useEffect(() => {
    setSkillPage(1)
    setDataPage(1)
  }, [
    baseId,
    query,
    statusFilter,
    effectiveSkillPageSize,
    effectiveDataPageSize,
  ])

  useEffect(() => {
    skillTableRef.current?.scrollTo({ top: 0 })
  }, [currentSkillPage, effectiveSkillPageSize])

  useEffect(() => {
    dataTableRef.current?.scrollTo({ top: 0 })
  }, [currentDataPage, effectiveDataPageSize])

  const documents = detail?.documents ?? []
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return documents.filter((document) => {
      if (
        statusFilter !== 'all' &&
        getDocumentDisplayStatus(document) !== statusFilter
      ) {
        return false
      }
      return !needle || document.title.toLowerCase().includes(needle)
    })
  }, [documents, query, statusFilter])

  const effectiveDocumentPageSize = documentPageSize || documentAutoPageSize
  const documentPageCount = Math.max(
    1,
    Math.ceil(visible.length / effectiveDocumentPageSize),
  )
  const currentDocumentPage = Math.min(documentPage, documentPageCount)
  const pagedVisible = visible.slice(
    (currentDocumentPage - 1) * effectiveDocumentPageSize,
    currentDocumentPage * effectiveDocumentPageSize,
  )
  useEffect(() => {
    setDocumentPage(1)
  }, [baseId, query, statusFilter, effectiveDocumentPageSize])

  useEffect(() => {
    documentTableRef.current?.scrollTo({ top: 0 })
  }, [currentDocumentPage, effectiveDocumentPageSize])

  useEffect(() => {
    const documentsTabVisible = tab === undefined || tab === 'documents'
    if (
      !documentsTabVisible ||
      isLoading ||
      visible.length === 0 ||
      documentPageSize !== 0
    ) {
      return
    }

    const container = documentTableRef.current
    const table = container?.querySelector('table')

    if (!container || !table) return

    const containerElement = container
    const tableElement = table
    let frame = 0

    function measureRows() {
      const rows = Array.from(
        tableElement.querySelectorAll<HTMLTableRowElement>('tbody tr'),
      )

      if (!rows.length) return

      // Same approach as OrganizationPage: measure natural row height first,
      // then distribute spare height evenly across the visible rows.
      rows.forEach((row) => row.style.removeProperty('height'))

      const width = containerElement.clientWidth
      const headerHeight =
        tableElement.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const availableHeight = containerElement.clientHeight - headerHeight

      if (availableHeight <= 0) return

      if (documentAutoFitRowMeasurement.current.width !== width) {
        documentAutoFitRowMeasurement.current = { width, height: 0 }
      }

      if (
        currentDocumentPage === 1 ||
        !documentAutoFitRowMeasurement.current.height
      ) {
        const naturalHeight = Math.max(
          1,
          ...rows.map((row) => row.getBoundingClientRect().height),
        )

        documentAutoFitRowMeasurement.current.height = Math.max(
          documentAutoFitRowMeasurement.current.height,
          naturalHeight,
        )
      }

      // Keep this identical to OrganizationPage's Positions auto-fit logic.
      // Capacity is based only on the available table height and the stable
      // natural row height. Spare vertical room is then distributed by slot.
      const limit = Math.max(
        1,
        Math.floor(
          availableHeight / documentAutoFitRowMeasurement.current.height,
        ),
      )

      setDocumentAutoPageSize((current) =>
        current === limit ? current : limit,
      )

      const uniformHeight = availableHeight / limit

      rows.forEach((row) => {
        row.style.height = `${uniformHeight}px`
      })
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(containerElement)
    observer.observe(tableElement)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      tableElement
        .querySelectorAll<HTMLTableRowElement>('tbody tr')
        .forEach((row) => row.style.removeProperty('height'))
    }
  }, [
    tab,
    isLoading,
    visible.length,
    documentPageSize,
    currentDocumentPage,
    effectiveDocumentPageSize,
  ])
  useEffect(() => {
    if (
      activeTab !== 'skills' ||
      isLoading ||
      visibleSkills.length === 0 ||
      skillPageSize !== 0
    ) {
      return
    }

    const container = skillTableRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return

    const containerElement = container
    const tableElement = table
    let frame = 0

    function measureRows() {
      const rows = Array.from(
        tableElement.querySelectorAll<HTMLTableRowElement>('tbody tr'),
      )
      if (!rows.length) return

      rows.forEach((row) => row.style.removeProperty('height'))

      const width = containerElement.clientWidth
      const headerHeight =
        tableElement.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const availableHeight = containerElement.clientHeight - headerHeight
      if (availableHeight <= 0) return

      if (skillAutoFitRowMeasurement.current.width !== width) {
        skillAutoFitRowMeasurement.current = { width, height: 0 }
      }

      if (
        currentSkillPage === 1 ||
        !skillAutoFitRowMeasurement.current.height
      ) {
        const naturalHeight = Math.max(
          1,
          ...rows.map((row) => row.getBoundingClientRect().height),
        )
        skillAutoFitRowMeasurement.current.height = Math.max(
          skillAutoFitRowMeasurement.current.height,
          naturalHeight,
        )
      }

      const limit = Math.max(
        1,
        Math.floor(
          availableHeight / skillAutoFitRowMeasurement.current.height,
        ),
      )

      setSkillAutoPageSize((current) =>
        current === limit ? current : limit,
      )

      const uniformHeight = availableHeight / limit
      rows.forEach((row) => {
        row.style.height = `${uniformHeight}px`
      })
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(containerElement)
    observer.observe(tableElement)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      tableElement
        .querySelectorAll<HTMLTableRowElement>('tbody tr')
        .forEach((row) => row.style.removeProperty('height'))
    }
  }, [
    activeTab,
    isLoading,
    visibleSkills.length,
    skillPageSize,
    currentSkillPage,
    effectiveSkillPageSize,
  ])

  useEffect(() => {
    if (
      activeTab !== 'data' ||
      isLoading ||
      visibleDataSources.length === 0 ||
      dataPageSize !== 0
    ) {
      return
    }

    const container = dataTableRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return

    const containerElement = container
    const tableElement = table
    let frame = 0

    function measureRows() {
      const rows = Array.from(
        tableElement.querySelectorAll<HTMLTableRowElement>('tbody tr'),
      )
      if (!rows.length) return

      rows.forEach((row) => row.style.removeProperty('height'))

      const width = containerElement.clientWidth
      const headerHeight =
        tableElement.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const availableHeight = containerElement.clientHeight - headerHeight
      if (availableHeight <= 0) return

      if (dataAutoFitRowMeasurement.current.width !== width) {
        dataAutoFitRowMeasurement.current = { width, height: 0 }
      }

      if (
        currentDataPage === 1 ||
        !dataAutoFitRowMeasurement.current.height
      ) {
        const naturalHeight = Math.max(
          1,
          ...rows.map((row) => row.getBoundingClientRect().height),
        )
        dataAutoFitRowMeasurement.current.height = Math.max(
          dataAutoFitRowMeasurement.current.height,
          naturalHeight,
        )
      }

      const limit = Math.max(
        1,
        Math.floor(
          availableHeight / dataAutoFitRowMeasurement.current.height,
        ),
      )

      setDataAutoPageSize((current) =>
        current === limit ? current : limit,
      )

      const uniformHeight = availableHeight / limit
      rows.forEach((row) => {
        row.style.height = `${uniformHeight}px`
      })
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(containerElement)
    observer.observe(tableElement)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      tableElement
        .querySelectorAll<HTMLTableRowElement>('tbody tr')
        .forEach((row) => row.style.removeProperty('height'))
    }
  }, [
    activeTab,
    isLoading,
    visibleDataSources.length,
    dataPageSize,
    currentDataPage,
    effectiveDataPageSize,
  ])

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
    if (!detail || isSaving || !canWriteKnowledge) return
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
    if (isSaving || !canWriteKnowledge) return
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
    if (isSaving || !canWriteKnowledge) return
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
  async function handleDeleteDocument() {
    if (!pendingDeleteDocument || isDeletingDocument) return

    setIsDeletingDocument(true)
    setError(null)

    try {
      const deletedId = pendingDeleteDocument.id

      await deleteKnowledgeDocument(deletedId)

      // Close any per-document Agent override editor that pointed at the
      // deleted source. The service also removes the persisted override.
      if (expandedDocumentId === deletedId) {
        setExpandedDocumentId(null)
      }

      setPendingDeleteDocument(null)
      setMessage(
        t(
          'ai.knowledge.msgDocumentDeleted',
          'Document deleted.',
        ),
      )

      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t(
              'ai.knowledge.errDeleteDocument',
              'Unable to delete this document.',
            ),
      )
    } finally {
      setIsDeletingDocument(false)
    }
  }

  async function handleDeleteSkill() {
    if (!pendingDeleteSkill || isDeletingSkill) return

    setIsDeletingSkill(true)
    setError(null)

    try {
      await deleteKnowledgeSkill(pendingDeleteSkill.id)
      setPendingDeleteSkill(null)
      setMessage(
        t('ai.knowledge.msgSkillDeleted', 'Skill deleted.'),
      )
      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t(
              'ai.knowledge.errDeleteSkill',
              'Unable to delete this skill.',
            ),
      )
    } finally {
      setIsDeletingSkill(false)
    }
  }

  async function handleDeleteDataSource() {
    if (!pendingDeleteDataSource || isDeletingDataSource) return

    setIsDeletingDataSource(true)
    setError(null)

    try {
      await deleteKnowledgeDataSource(pendingDeleteDataSource.id)
      setPendingDeleteDataSource(null)
      setMessage(
        t(
          'ai.knowledge.msgDataSourceDeleted',
          'Data source deleted.',
        ),
      )
      await load()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t(
              'ai.knowledge.errDeleteDataSource',
              'Unable to delete this data source.',
            ),
      )
    } finally {
      setIsDeletingDataSource(false)
    }
  }

  function addSkillInputRow() {
    setSkillInputs((current) => [
      ...current,
      createSkillInputDraft(),
    ])
  }

  function updateSkillInput(
    id: string,
    patch: Partial<Pick<SkillInputDraft, 'name' | 'type'>>,
  ) {
    setSkillInputs((current) =>
      current.map((input) =>
        input.id === id
          ? { ...input, ...patch }
          : input,
      ),
    )
  }

  function removeSkillInput(id: string) {
    setSkillInputs((current) =>
      current.filter((input) => input.id !== id),
    )
  }

  function openAddSource() {
    setDocTitle('')
    setDocType('policy')
    setDocFile([])
    setSkillName('')
    setSkillDescription('')
    setSkillFile([])
    setSkillInputs([])
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
  async function cycleDocumentMode(
    document: Pick<KnowledgeDocument, 'id' | 'status' | 'mode'>,
  ) {
    if (document.status !== 'ready') return

    try {
      await updateKnowledgeDocumentMode(
        document.id,
        nextKnowledgeManualMode(document.mode),
      )
      await load()
    } catch {
      setError(t('ai.knowledge.errStatus'))
    }
  }

  async function cycleSkillMode(
    skillId: string,
    health: 'draft' | 'ready' | 'failed',
    currentMode?: KnowledgeManualMode,
  ) {
    if (health !== 'ready') return

    try {
      await updateKnowledgeSkillMode(
        skillId,
        nextKnowledgeManualMode(currentMode),
      )
      await load()
    } catch {
      setError(t('ai.knowledge.errStatus'))
    }
  }

  async function cycleDataSourceMode(
    dataSourceId: string,
    health: 'connected' | 'disconnected' | 'error',
    currentMode?: KnowledgeManualMode,
  ) {
    if (health !== 'connected') return

    try {
      await updateKnowledgeDataSourceMode(
        dataSourceId,
        nextKnowledgeManualMode(currentMode),
      )
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
              title: documentUploadTitle(docTitle, docFile.length, file.name),
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
        const normalizedInputs = skillInputs
          .map((input) => ({
            ...input,
            name: input.name.trim(),
          }))
          .filter((input) => input.name.length > 0)

        const inputNames = normalizedInputs.map((input) =>
          input.name.toLowerCase(),
        )

        if (new Set(inputNames).size !== inputNames.length) {
          setError(
            t(
              'ai.knowledge.errDuplicateSkillInput',
              'Skill input names must be unique.',
            ),
          )
          return
        }

        const inputSchema: Record<string, unknown> | undefined =
          normalizedInputs.length > 0
            ? Object.fromEntries(
                normalizedInputs.map((input) => [
                  input.name,
                  input.type,
                ]),
              )
            : undefined

        await addKnowledgeSkill(baseId, {
          name: skillName,
          description: skillDescription,
          inputSchema,
          file: skillFile[0],
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
          file: dsFile[0],
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
  if (tab !== undefined && !visibleTabs.includes(tab as TabId)) {
    return <Navigate to={`/ai/ai/knowledge/${baseId}/${defaultTabForKind(kind)}`} replace />
  }
  // 图4：现代化的分配 Agent 卡片网格
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
            {/* 替换为漂亮的卡片网格 */}
            <div className="agent-assignment-grid">
              {activeAgents.map((agent) => {
                const selected = docAgentIds.includes(agent.id)
                return (
                  <label
                    key={agent.id}
                    className={[
                      'agent-assignment-card',
                      selected ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={isAdding}
                      onChange={() => toggleDocAgent(agent.id)}
                    />
                    <span className="agent-assignment-card__body">
                      <span className="agent-assignment-card__name">{agent.name}</span>
                      <span className="agent-assignment-card__desc">{agent.description || '—'}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {activeAgents.length === 0 && (
              <p className="console-empty">{t('ai.knowledge.noAgentsInCompany')}</p>
            )}
          </div>
        )}
      </div>
    )
  }
  function activateDetailTab(nextTab: TabId) {
    void navigate(`/ai/ai/knowledge/${baseId}/${nextTab}`)
  }
  function handleDetailTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const lastIndex = visibleTabs.length - 1
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? lastIndex
          : event.key === 'ArrowLeft'
            ? index === 0
              ? lastIndex
              : index - 1
            : index === lastIndex
              ? 0
              : index + 1
    const nextTab = visibleTabs[nextIndex]
    activateDetailTab(nextTab)
    requestAnimationFrame(() => {
      document.getElementById(`knowledge-detail-tab-${nextTab}`)?.focus()
    })
  }
  return (
    <div className="console-page knowledge-detail-page">
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />
      <div className="knowledge-detail-viewbar">
        <div
          className="knowledge-detail-tabs"
          role="tablist"
          aria-label={t('ai.knowledge.tabsAria')}
        >
          {visibleTabs.map((id, index) => (
            <button
              key={id}
              id={`knowledge-detail-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`knowledge-detail-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => activateDetailTab(id)}
              onKeyDown={(event) => handleDetailTabKeyDown(event, index)}
            >
              {t(TAB_LABEL_KEY[id])}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          className="knowledge-detail-back"
          onClick={() => void navigate('/ai/ai/knowledge')}
        >
          {t('ai.knowledge.back')}
        </Button>
      </div>
      {activeTab === 'documents' ? (
        <div
          id="knowledge-detail-panel-documents"
          role="tabpanel"
          aria-labelledby="knowledge-detail-tab-documents"
          className="knowledge-detail-tabpanel"
        >
          <TablePanel className="knowledge-detail-directory">
            <TableToolbar
              search={
                <TextField
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('ai.knowledge.searchPlaceholder')}
                  aria-label={t('ai.knowledge.searchAria')}
                />
              }
              filters={
                <SidebarSelect
                  id="knowledge-document-status"
                  label={t('ai.knowledge.filterStatus')}
                  value={statusFilter}
                  options={STATUS_FILTERS.map((value) => ({
                    value,
                    label:
                      value === 'all'
                        ? t('ai.knowledge.filterAll')
                        : t(STATUS_LABEL_KEY[value], STATUS_LABEL_FALLBACK[value]),
                  }))}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                />
              }
              actions={
                <Button style={!canWriteKnowledge ? { display: 'none' } : undefined} onClick={openAddSource}>
                  <IconPlus />
                  {t('ai.knowledge.addSource')}
                </Button>
              }
            />
          {isLoading ? (
            <p className="console-empty">{t('ai.knowledge.loading')}</p>
          ) : visible.length === 0 ? (
            <p className="console-empty">
              {documents.length === 0
                ? t('ai.knowledge.documentsEmpty')
                : t('ai.knowledge.documentsEmptyFiltered')}
            </p>
          ) : (
            <div className="console-table-wrap" ref={documentTableRef} tabIndex={0} aria-label={t('ai.knowledge.tabDocuments')}>
              <table className={`console-table console-table--fixed console-table--knowledge-documents${documentPageSize === 0 ? ' console-table--auto-fit' : ''}`}>
                <colgroup>
                  <col />
                  <col style={{ width: '7rem' }} />
                  <col style={{ width: '7.5rem' }} />
                  <col style={{ width: '16rem' }} />
                  <col style={{ width: '9rem' }} />
                  <col style={{ width: '6rem' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('ai.knowledge.colName')}</th>
                    <th>{t('ai.knowledge.colType')}</th>
                    <th>{t('ai.knowledge.colStatus')}</th>
                    <th>{t('ai.knowledge.colAgents')}</th>
                    <th className="console-table__uploaded">{t('ai.knowledge.colUploaded')}</th>
                    <th className="console-table__actions identity-table__actions">
                      {t('ai.knowledge.colActions', 'Actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedVisible.map((document) => {
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
                            <span title={document.title}>{document.title}</span>
                          </span>
                          {document.fileUrl ? (
                            <a
                              className="console-file-link"
                              href={document.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                            >
                              {t('ai.knowledge.download')}
                            </a>
                          ) : null}
                        </td>
                        <td className="console-table__muted">
                          {t(TYPE_LABEL_KEY[document.type])}
                        </td>
                        <td className="console-table__status">
                          {(() => {
                            const displayStatus =
                              getDocumentDisplayStatus(document)
                            const canChangeMode = canWriteKnowledge && document.status === 'ready'

                            return (
                              <button
                                type="button"
                                className={[
                                  'console-status',
                                  `console-status--${displayStatus}`,
                                  canChangeMode
                                    ? 'console-status--clickable'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                disabled={!canChangeMode}
                                onClick={() =>
                                  void cycleDocumentMode(document)
                                }
                                title={
                                  canChangeMode
                                    ? t('ai.knowledge.statusClickHint')
                                    : undefined
                                }
                              >
                                {t(
                                  STATUS_LABEL_KEY[displayStatus],
                                  STATUS_LABEL_FALLBACK[displayStatus],
                                )}
                              </button>
                            )
                          })()}
                        </td>
                        <td className="knowledge-document-agents">
                          {agentIds.length === 0 ? (
                            <span className="console-chip console-chip--muted">{t('ai.knowledge.noAgentsReach')}</span>
                          ) : (
                            <span
                              className="console-chips"
                              title={agentIds.map(id => agentName(id)).filter(Boolean).join(', ')}
                            >
                              {agentIds.slice(0, MAX_CHIPS).map((id) => (
                                <span className="console-chip console-chip--link" key={id}
                                  title={agentName(id) || t('ai.knowledge.unknownAgent', 'Unknown Agent')}>
                                  <span>{agentName(id) || t('ai.knowledge.unknownAgent', 'Unknown Agent')}</span>
                                </span>
                              ))}
                              {agentIds.length > MAX_CHIPS && (
                                <span className="console-chip console-chip--muted">
                                  +{agentIds.length - MAX_CHIPS}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="console-table__uploaded">
                          {formatUploaded(document.uploadedAt)}
                        </td>
                        <td className="console-table__actions identity-table__actions">
                          <div className="identity-inline-actions identity-directory-actions">
                            {canWriteKnowledge ? <IconButton label={t('ai.knowledge.renameDocument')} disabled={renameBusy || isDeletingDocument} onClick={() => { setRenaming(document); setRenameTitle(document.title); setRenameError(null) }}><IconPencil /></IconButton> : null}
                            <IconButton
                              label={t(
                                'ai.knowledge.deleteDocument',
                                'Delete {{name}}',
                                { name: document.title },
                              )}
                              variant="danger"
                              disabled={isDeletingDocument}
                              style={!canWriteKnowledge ? { display: 'none' } : undefined}
                              onClick={() => setPendingDeleteDocument(document)}
                            >
                              <IconTrash />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
            <TablePagination
              id="knowledge-document-page-size"
              total={visible.length}
              pageSize={documentPageSize}
              autoPageSize={documentAutoPageSize}
              effectivePageSize={effectiveDocumentPageSize}
              currentPage={currentDocumentPage}
              pageCount={documentPageCount}
              pagesLabel="Document pages"
              onPageSizeChange={(value) => {
                setDocumentPageSize(value)
                setDocumentPage(1)
              }}
              onPageChange={setDocumentPage}
            />
          </TablePanel>
        </div>
      ) : null}
      {activeTab === 'skills' ? (
        <div
          id="knowledge-detail-panel-skills"
          role="tabpanel"
          aria-labelledby="knowledge-detail-tab-skills"
          className="knowledge-detail-tabpanel"
        >
          <TablePanel className="knowledge-detail-directory">
            <TableToolbar
              search={
                <TextField
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('ai.knowledge.searchSkills', 'Search skills...')}
                  aria-label={t('ai.knowledge.searchSkills', 'Search skills')}
                />
              }
              filters={
                <SidebarSelect
                  id="knowledge-skill-status"
                  label={t('ai.knowledge.filterStatus')}
                  value={statusFilter}
                  options={STATUS_FILTERS.map((value) => ({
                    value,
                    label:
                      value === 'all'
                        ? t('ai.knowledge.filterAll')
                        : t(
                            STATUS_LABEL_KEY[value],
                            STATUS_LABEL_FALLBACK[value],
                          ),
                  }))}
                  onChange={(value) =>
                    setStatusFilter(value as StatusFilter)
                  }
                />
              }
              actions={
                <Button style={!canWriteKnowledge ? { display: 'none' } : undefined} onClick={openAddSource}>
                  <IconPlus />
                  {t('ai.knowledge.addSource')}
                </Button>
              }
            />

            {isLoading ? (
              <p className="console-empty">{t('ai.knowledge.loading')}</p>
            ) : visibleSkills.length === 0 ? (
              <p className="console-empty">
                {skills.length === 0
                  ? t('ai.knowledge.skillsEmpty')
                  : t(
                      'ai.knowledge.skillsEmptyFiltered',
                      'No skills match your filters.',
                    )}
              </p>
            ) : (
              <div
                className="console-table-wrap"
                ref={skillTableRef}
                tabIndex={0}
                aria-label={t('ai.knowledge.tabSkills')}
              >
                <table
                  className={[
                    'console-table',
                    'console-table--fixed',
                    'console-table--knowledge-skills',
                    skillPageSize === 0 ? 'console-table--auto-fit' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <colgroup>
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '8%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('ai.knowledge.colName')}</th>
                      <th>{t('ai.knowledge.colDescription')}</th>
                      <th>{t('ai.knowledge.colSchema')}</th>
                      <th className="console-table__status">
                        {t('ai.knowledge.colStatus')}
                      </th>
                      <th className="console-table__actions identity-table__actions">
                        {t('ai.knowledge.colActions', 'Actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSkills.map((skill) => (
                      <tr key={skill.id}>
                        <td>
                          <span className="console-table__name">{skill.name}</span>
                        </td>
                        <td className="console-table__muted">{skill.description}</td>
                        <td className="console-table__muted">
                          <code className="console-code">
                            {skill.inputSchema
                              ? Object.entries(skill.inputSchema)
                                  .map(([key, value]) => `${key}: ${String(value)}`)
                                  .join(', ')
                              : '—'}
                          </code>
                        </td>
                        <td className="console-table__status">
                          {(() => {
                            const displayStatus = getSkillDisplayStatus(skill)
                            const canChangeMode = canWriteKnowledge && skill.status === 'ready'
                            return (
                              <button
                                type="button"
                                className={[
                                  'console-status',
                                  `console-status--${displayStatus}`,
                                  canChangeMode ? 'console-status--clickable' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                disabled={!canChangeMode}
                                onClick={() =>
                                  void cycleSkillMode(
                                    skill.id,
                                    skill.status,
                                    skill.mode,
                                  )
                                }
                                title={
                                  canChangeMode
                                    ? t('ai.knowledge.statusClickHint')
                                    : undefined
                                }
                              >
                                {t(
                                  STATUS_LABEL_KEY[displayStatus],
                                  STATUS_LABEL_FALLBACK[displayStatus],
                                )}
                              </button>
                            )
                          })()}
                        </td>
                        <td className="console-table__actions identity-table__actions">
                          <div className="identity-inline-actions identity-directory-actions">
                            <IconButton
                              label={t(
                                'ai.knowledge.deleteSkill',
                                'Delete {{name}}',
                                { name: skill.name },
                              )}
                              variant="danger"
                              disabled={isDeletingSkill}
                              style={!canWriteKnowledge ? { display: 'none' } : undefined}
                              onClick={() => setPendingDeleteSkill(skill)}
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
            )}

            <TablePagination
              id="knowledge-skill-page-size"
              total={visibleSkills.length}
              pageSize={skillPageSize}
              autoPageSize={skillAutoPageSize}
              effectivePageSize={effectiveSkillPageSize}
              currentPage={currentSkillPage}
              pageCount={skillPageCount}
              pagesLabel="Skill pages"
              onPageSizeChange={(value) => {
                setSkillPageSize(value)
                setSkillPage(1)
              }}
              onPageChange={setSkillPage}
            />
          </TablePanel>
        </div>
      ) : null}

      {activeTab === 'data' ? (
        <div
          id="knowledge-detail-panel-data"
          role="tabpanel"
          aria-labelledby="knowledge-detail-tab-data"
          className="knowledge-detail-tabpanel"
        >
          <TablePanel className="knowledge-detail-directory">
            <TableToolbar
              search={
                <TextField
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t(
                    'ai.knowledge.searchDataSources',
                    'Search data sources...',
                  )}
                  aria-label={t(
                    'ai.knowledge.searchDataSources',
                    'Search data sources',
                  )}
                />
              }
              filters={
                <SidebarSelect
                  id="knowledge-data-status"
                  label={t('ai.knowledge.filterStatus')}
                  value={statusFilter}
                  options={STATUS_FILTERS.map((value) => ({
                    value,
                    label:
                      value === 'all'
                        ? t('ai.knowledge.filterAll')
                        : t(
                            STATUS_LABEL_KEY[value],
                            STATUS_LABEL_FALLBACK[value],
                          ),
                  }))}
                  onChange={(value) =>
                    setStatusFilter(value as StatusFilter)
                  }
                />
              }
              actions={
                <Button style={!canWriteKnowledge ? { display: 'none' } : undefined} onClick={openAddSource}>
                  <IconPlus />
                  {t('ai.knowledge.addSource')}
                </Button>
              }
            />

            {isLoading ? (
              <p className="console-empty">{t('ai.knowledge.loading')}</p>
            ) : visibleDataSources.length === 0 ? (
              <p className="console-empty">
                {dataSources.length === 0
                  ? t('ai.knowledge.dataEmpty')
                  : t(
                      'ai.knowledge.dataEmptyFiltered',
                      'No data sources match your filters.',
                    )}
              </p>
            ) : (
              <div
                className="console-table-wrap"
                ref={dataTableRef}
                tabIndex={0}
                aria-label={t('ai.knowledge.tabData')}
              >
                <table
                  className={[
                    'console-table',
                    'console-table--fixed',
                    'console-table--knowledge-data',
                    dataPageSize === 0 ? 'console-table--auto-fit' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <colgroup>
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '35%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '8%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('ai.knowledge.colName')}</th>
                      <th>{t('ai.knowledge.colKind')}</th>
                      <th>{t('ai.knowledge.colConfig')}</th>
                      <th>{t('ai.knowledge.colSynced')}</th>
                      <th className="console-table__status">
                        {t('ai.knowledge.colStatus')}
                      </th>
                      <th className="console-table__actions identity-table__actions">
                        {t('ai.knowledge.colActions', 'Actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDataSources.map((ds) => (
                      <tr key={ds.id}>
                        <td>
                          <span className="console-table__name">{ds.name}</span>
                        </td>
                        <td className="console-table__muted">{ds.kind}</td>
                        <td className="console-table__muted">
                          <span className="console-chips">
                            {Object.entries(ds.config).map(([key, value]) => (
                              <span
                                className="console-chip console-chip--muted"
                                key={key}
                              >
                                {key}: {value}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="console-table__muted">
                          {ds.lastSyncedAt
                            ? formatUploaded(ds.lastSyncedAt)
                            : '—'}
                        </td>
                        <td className="console-table__status">
                          {(() => {
                            const displayStatus = getDataSourceDisplayStatus(ds)
                            const canChangeMode = canWriteKnowledge && ds.status === 'connected'
                            return (
                              <button
                                type="button"
                                className={[
                                  'console-status',
                                  `console-status--${displayStatus}`,
                                  canChangeMode ? 'console-status--clickable' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                disabled={!canChangeMode}
                                onClick={() =>
                                  void cycleDataSourceMode(
                                    ds.id,
                                    ds.status,
                                    ds.mode,
                                  )
                                }
                                title={
                                  canChangeMode
                                    ? t('ai.knowledge.statusClickHint')
                                    : undefined
                                }
                              >
                                {t(
                                  STATUS_LABEL_KEY[displayStatus],
                                  STATUS_LABEL_FALLBACK[displayStatus],
                                )}
                              </button>
                            )
                          })()}
                        </td>
                        <td className="console-table__actions identity-table__actions">
                          <div className="identity-inline-actions identity-directory-actions">
                            <IconButton
                              label={t(
                                'ai.knowledge.deleteDataSource',
                                'Delete {{name}}',
                                { name: ds.name },
                              )}
                              variant="danger"
                              disabled={isDeletingDataSource}
                              style={!canWriteKnowledge ? { display: 'none' } : undefined}
                              onClick={() => setPendingDeleteDataSource(ds)}
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
            )}

            <TablePagination
              id="knowledge-data-page-size"
              total={visibleDataSources.length}
              pageSize={dataPageSize}
              autoPageSize={dataAutoPageSize}
              effectivePageSize={effectiveDataPageSize}
              currentPage={currentDataPage}
              pageCount={dataPageCount}
              pagesLabel="Data source pages"
              onPageSizeChange={(value) => {
                setDataPageSize(value)
                setDataPage(1)
              }}
              onPageChange={setDataPage}
            />
          </TablePanel>
        </div>
      ) : null}

      {activeTab === 'agents' ? (
        <section
          id="knowledge-detail-panel-agents"
          role="tabpanel"
          aria-labelledby="knowledge-detail-tab-agents"
          className="knowledge-agent-split"
        >
          <aside className="knowledge-agent-split__assigned">
            <header className="knowledge-agent-split__header">
              <div>
                <h3>Assigned agents</h3>
                <p>These agents can access and use this knowledge base.</p>
              </div>
              <span className="knowledge-agent-split__count">
                {visibleBaseAgentIds.length} assigned
              </span>
            </header>

            <div className="knowledge-agent-split__search">
              <input
                className="ui-text-field"
                type="search"
                value={agentQuery}
                onChange={(event) => setAgentQuery(event.target.value)}
                placeholder="Search agents..."
                aria-label="Search agents"
              />
            </div>

            <div
              className="knowledge-agent-split__agent-list"
              ref={agentListRef}
            >
              {filteredAgents.map((agent) => {
                const selected = visibleBaseAgentIds.includes(agent.id)
                return (
                  <AgentAssignmentChoice key={agent.id} name={agent.name} checked={selected} disabled={isSaving || isLoading || !canWriteKnowledge} onChange={() => void toggleBaseAgent(agent.id)} />
                )
              })}

              {filteredAgents.length === 0 ? (
                <p className="console-empty">
                  {activeAgents.length === 0
                    ? t('ai.knowledge.noAgentsInCompany')
                    : 'No agents match your search.'}
                </p>
              ) : null}
            </div>
          </aside>

          <section className="knowledge-agent-split__overrides">
            <header className="knowledge-agent-split__header">
              <div>
                <h3>
                  {kind === 'document'
                    ? 'Per-document overrides'
                    : 'Base access scope'}
                </h3>
                <p>
                  {kind === 'document'
                    ? 'Documents inherit assigned agents unless a document overrides them.'
                    : kind === 'skill'
                      ? 'Assigned agents inherit access to every skill in this knowledge base.'
                      : 'Assigned agents inherit access to every data source in this knowledge base.'}
                </p>
              </div>
              {isSaving ? (
                <span className="console-saving">
                  {t('ai.knowledge.saving')}
                </span>
              ) : null}
            </header>

            <div className="knowledge-agent-split__toolbar">
              <TextField
                type="search"
                value={overrideQuery}
                onChange={(event) => setOverrideQuery(event.target.value)}
                placeholder={
                  kind === 'document'
                    ? t('ai.knowledge.searchPlaceholder')
                    : kind === 'skill'
                      ? t('ai.knowledge.searchSkills', 'Search skills...')
                      : t(
                          'ai.knowledge.searchDataSources',
                          'Search data sources...',
                        )
                }
                aria-label="Search access scope"
              />
            </div>

            {kind !== 'document' ? (
              nonDocumentScopeItems.length === 0 ? (
                <p className="console-empty">
                  {kind === 'skill'
                    ? t('ai.knowledge.skillsEmpty')
                    : t('ai.knowledge.dataEmpty')}
                </p>
              ) : (
                <>
                  <div
                    className="console-table-wrap knowledge-agent-split__table-wrap"
                    ref={overrideTableRef}
                    tabIndex={0}
                    aria-label={
                      kind === 'skill'
                        ? 'Skill access scope'
                        : 'Data source access scope'
                    }
                  >
                    <table
                      className={[
                        'console-table',
                        'console-table--fixed',
                        'knowledge-agent-split__table',
                        overridePageSize === 0
                          ? 'console-table--auto-fit'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <colgroup>
                        <col style={{ width: '48%' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '30%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>{t('ai.knowledge.colName')}</th>
                          <th className="console-table__status">
                            {t('ai.knowledge.colStatus')}
                          </th>
                          <th>Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedNonDocumentScopeItems.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className="console-table__name">
                                {item.name}
                              </span>
                            </td>
                            <td className="console-table__status">
                              <span
                                className={[
                                  'console-status',
                                  `console-status--${item.status}`,
                                ].join(' ')}
                              >
                                {t(
                                  STATUS_LABEL_KEY[item.status],
                                  STATUS_LABEL_FALLBACK[item.status],
                                )}
                              </span>
                            </td>
                            <td>
                              <span className="console-chip console-chip--muted">
                                Inherited from base
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <TablePagination
                    id="knowledge-scope-page-size"
                    total={nonDocumentScopeItems.length}
                    pageSize={overridePageSize}
                    autoPageSize={overrideAutoPageSize}
                    effectivePageSize={effectiveOverridePageSize}
                    currentPage={currentOverridePage}
                    pageCount={totalOverridePages}
                    pagesLabel={
                      kind === 'skill'
                        ? 'Skill access pages'
                        : 'Data source access pages'
                    }
                    onPageSizeChange={(value) => {
                      setOverridePageSize(value)
                      setOverridePage(1)
                    }}
                    onPageChange={setOverridePage}
                  />
                </>
              )
            ) : overrideDocuments.length === 0 ? (
              <p className="console-empty">
                {documents.length === 0
                  ? t('ai.knowledge.documentsEmpty')
                  : t('ai.knowledge.documentsEmptyFiltered')}
              </p>
            ) : (
              <>
                <div
                  className="console-table-wrap knowledge-agent-split__table-wrap"
                  ref={overrideTableRef}
                  tabIndex={0}
                  aria-label="Per-document overrides"
                >
                  <table
                    className={[
                      'console-table',
                      'console-table--fixed',
                      'knowledge-agent-split__table',
                      overridePageSize === 0 ? 'console-table--auto-fit' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <colgroup>
                      <col style={{ width: '39%' }} />
                      <col style={{ width: '31%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '16%' }} />
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
                      {pagedOverrideDocuments.map((document) => {
                        const effective = effectiveByDocument.get(document.id)
                        const agentIds = effective?.agentIds ?? []
                        const overridden = effective?.source === 'document'
                        const expanded = expandedDocumentId === document.id

                        return (
                          <Fragment key={document.id}>
                            <tr>
                              <td>
                                <span className="console-table__name">
                                  {document.kind === 'file' ? (
                                    <IconPaperclip />
                                  ) : (
                                    <IconFolder />
                                  )}
                                  <span className="knowledge-agent-split__document-copy">
                                    <strong>{document.title}</strong>
                                  </span>
                                </span>
                              </td>

                              <td>
                                {agentIds.length === 0 ? (
                                  <span className="console-chip console-chip--muted">
                                    {t('ai.knowledge.noAgentsReach')}
                                  </span>
                                ) : (
                                  <span
                                    className="console-chips"
                                    title={agentIds
                                      .map((id) => agentName(id))
                                      .filter(Boolean)
                                      .join(', ')}
                                  >
                                    {agentIds.slice(0, MAX_CHIPS).map((id) => (
                                      <span
                                        className="console-chip console-chip--link"
                                        key={id}
                                      >
                                        {agentName(id) ||
                                          t(
                                            'ai.knowledge.unknownAgent',
                                            'Unknown Agent',
                                          )}
                                      </span>
                                    ))}
                                    {agentIds.length > MAX_CHIPS ? (
                                      <span className="console-chip console-chip--muted">
                                        +{agentIds.length - MAX_CHIPS}
                                      </span>
                                    ) : null}
                                  </span>
                                )}
                              </td>

                              <td>
                                <span
                                  className={[
                                    'knowledge-agent-split__source',
                                    overridden ? 'is-override' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  {overridden
                                    ? t('ai.knowledge.sourceOverride')
                                    : t('ai.knowledge.sourceInherited')}
                                </span>
                              </td>

                              <td className="console-table__actions">
                                <Button
                                  variant="secondary"
                                  style={!canWriteKnowledge ? { display: 'none' } : undefined}
                                  onClick={() =>
                                    setExpandedDocumentId(
                                      expanded ? null : document.id,
                                    )
                                  }
                                >
                                  {expanded
                                    ? t('ai.knowledge.overrideClose')
                                    : overridden
                                      ? 'Edit'
                                      : t('ai.knowledge.overrideEdit')}
                                </Button>
                              </td>
                            </tr>

                            {expanded ? (
                              <tr className="knowledge-agent-split__override-row">
                                <td colSpan={4}>
                                  <div className="knowledge-agent-split__override-editor">
                                    <p className="console-hint console-hint--flat">
                                      {t('ai.knowledge.overrideHint')}
                                    </p>

                                    <div className="knowledge-agent-split__override-grid">
                                      {activeAgents.map((agent) => {
                                        const selected =
                                          agentIds.includes(agent.id)
                                        return (
                                          <label
                                            key={agent.id}
                                            className={[
                                              'knowledge-agent-choice',
                                              'knowledge-agent-choice--compact',
                                              selected ? 'is-selected' : '',
                                            ]
                                              .filter(Boolean)
                                              .join(' ')}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selected}
                                              disabled={isSaving || !canWriteKnowledge}
                                              onChange={() =>
                                                void toggleDocumentAgent(
                                                  document.id,
                                                  agent.id,
                                                )
                                              }
                                            />
                                            <span className="knowledge-agent-choice__avatar">
                                              {agent.name
                                                .slice(0, 1)
                                                .toUpperCase()}
                                            </span>
                                            <span className="knowledge-agent-choice__body">
                                              <strong>{agent.name}</strong>
                                            </span>
                                          </label>
                                        )
                                      })}
                                    </div>

                                    {overridden ? (
                                      <div className="console-form__actions">
                                        <Button
                                          variant="ghost"
                                          disabled={!canWriteKnowledge || isSaving}
                                          onClick={() =>
                                            void clearDocumentOverride(
                                              document.id,
                                            )
                                          }
                                        >
                                          {t('ai.knowledge.overrideReset')}
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <TablePagination
                  id="knowledge-override-page-size"
                  total={overrideDocuments.length}
                  pageSize={overridePageSize}
                  autoPageSize={overrideAutoPageSize}
                  effectivePageSize={effectiveOverridePageSize}
                  currentPage={currentOverridePage}
                  pageCount={totalOverridePages}
                  pagesLabel="Override document pages"
                  onPageSizeChange={(value) => {
                    setOverridePageSize(value)
                    setOverridePage(1)
                  }}
                  onPageChange={setOverridePage}
                />
              </>
            )}
          </section>
        </section>
      ) : null}
      <ConfirmDialog
        open={pendingDeleteDocument !== null}
        title={t(
          'ai.knowledge.deleteDocumentTitle',
          'Delete "{{name}}"?',
          { name: pendingDeleteDocument?.title ?? '' },
        )}
        description={t(
          'ai.knowledge.deleteDocumentBody',
          'This document will be removed from the knowledge base. It will no longer be available to AI Assistant and its document-level Agent assignments will be removed.',
        )}
        warning={t(
          'ai.knowledge.deleteWarning',
          'This cannot be undone.',
        )}
        confirmLabel={t('ai.knowledge.delete', 'Delete')}
        cancelLabel={t('ai.knowledge.cancel', 'Cancel')}
        busyLabel={t('ai.knowledge.deleting', 'Deleting…')}
        busy={isDeletingDocument}
        onConfirm={() => void handleDeleteDocument()}
        onCancel={() => {
          if (!isDeletingDocument) {
            setPendingDeleteDocument(null)
          }
        }}
      />

      <ConfirmDialog
        open={pendingDeleteSkill !== null}
        title={t(
          'ai.knowledge.deleteSkillTitle',
          'Delete "{{name}}"?',
          { name: pendingDeleteSkill?.name ?? '' },
        )}
        description={t(
          'ai.knowledge.deleteSkillBody',
          'This skill will be removed from the knowledge base and will no longer be available to assigned Agents or runtime tools.',
        )}
        warning={t(
          'ai.knowledge.deleteWarning',
          'This cannot be undone.',
        )}
        confirmLabel={t('ai.knowledge.delete', 'Delete')}
        cancelLabel={t('ai.knowledge.cancel', 'Cancel')}
        busyLabel={t('ai.knowledge.deleting', 'Deleting…')}
        busy={isDeletingSkill}
        onConfirm={() => void handleDeleteSkill()}
        onCancel={() => {
          if (!isDeletingSkill) {
            setPendingDeleteSkill(null)
          }
        }}
      />

      <ConfirmDialog
        open={pendingDeleteDataSource !== null}
        title={t(
          'ai.knowledge.deleteDataSourceTitle',
          'Delete "{{name}}"?',
          { name: pendingDeleteDataSource?.name ?? '' },
        )}
        description={t(
          'ai.knowledge.deleteDataSourceBody',
          'This data source will be removed from the knowledge base and will no longer be available to assigned Agents, Assistant context, or data tools.',
        )}
        warning={t(
          'ai.knowledge.deleteWarning',
          'This cannot be undone.',
        )}
        confirmLabel={t('ai.knowledge.delete', 'Delete')}
        cancelLabel={t('ai.knowledge.cancel', 'Cancel')}
        busyLabel={t('ai.knowledge.deleting', 'Deleting…')}
        busy={isDeletingDataSource}
        onConfirm={() => void handleDeleteDataSource()}
        onCancel={() => {
          if (!isDeletingDataSource) {
            setPendingDeleteDataSource(null)
          }
        }}
      />

      <Drawer open={renaming !== null} title={t('ai.knowledge.renameDocument')} closeLabel={t('ai.knowledge.cancel', 'Cancel')} busy={renameBusy}
        onClose={() => { if (!renameBusy) setRenaming(null) }}
        footer={<><Button form="rename-knowledge-document" type="submit" disabled={renameBusy || !renameTitle.trim() || renaming?.version === undefined}>{t('ai.knowledge.save', 'Save')}</Button><Button variant="secondary" disabled={renameBusy} onClick={() => setRenaming(null)}>{t('ai.knowledge.cancel', 'Cancel')}</Button></>}>
        <form id="rename-knowledge-document" onSubmit={event => {
          event.preventDefault()
          if (!renaming || renameBusy || !activeCompanyId || renaming.version === undefined) return
          const company = activeCompanyId
          const scope = renameScope.current
          setRenameBusy(true); setRenameError(null)
          void renameKnowledgeDocument(renaming.id, renameTitle.trim(), company, renaming.version).then(async () => {
            if (useCompanyStore.getState().companyId !== company || renameScope.current !== scope) return
            setRenaming(null); await load()
          }).catch(error => {
            if (useCompanyStore.getState().companyId === company && renameScope.current === scope) setRenameError(error instanceof ApiError && error.status === 409 ? t('ai.knowledge.renameConflict') : t('ai.knowledge.renameFailed'))
          }).finally(() => { if (renameScope.current === scope) setRenameBusy(false) })
        }}>
          <FormField htmlFor="knowledge-document-title" label={t('ai.knowledge.name', 'Name')}><TextField id="knowledge-document-title" value={renameTitle} maxLength={512} disabled={renameBusy} onChange={event => setRenameTitle(event.target.value)} /></FormField>
          {renameError ? <p role="alert">{renameError}</p> : null}
        </form>
      </Drawer>

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
                    className="console-form-select--down"
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
                  maxSizeBytes={10 * 1024 * 1024}
                  maxFiles={20}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.tif,.tiff,.bmp"
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
              <div className="console-form__section skill-input-builder">
                <div className="skill-input-builder__heading">
                  <div>
                    <h4>
                      {t('ai.knowledge.fieldSkillInputs', 'Inputs')}
                    </h4>
                    <p>
                      {t(
                        'ai.knowledge.fieldSkillInputsHint',
                        'Define the parameters this skill accepts.',
                      )}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={addSkillInputRow}
                    disabled={isAdding}
                  >
                    <IconPlus />
                    {t('ai.knowledge.addSkillInput', 'Add input')}
                  </Button>
                </div>

                {skillInputs.length === 0 ? (
                  <div className="skill-input-builder__empty">
                    {t(
                      'ai.knowledge.noSkillInputs',
                      'No inputs defined. This skill can be called without parameters.',
                    )}
                  </div>
                ) : (
                  <div className="skill-input-builder__rows">
                    <div
                      className="skill-input-builder__header"
                      aria-hidden="true"
                    >
                      <span>
                        {t(
                          'ai.knowledge.skillInputName',
                          'Input name',
                        )}
                      </span>
                      <span>
                        {t(
                          'ai.knowledge.skillInputType',
                          'Type',
                        )}
                      </span>
                      <span>
                        {t(
                          'ai.knowledge.colActions',
                          'Actions',
                        )}
                      </span>
                    </div>

                    {skillInputs.map((input, index) => (
                      <div
                        className="skill-input-builder__row"
                        key={input.id}
                      >
                        <TextField
                          value={input.name}
                          onChange={(event) =>
                            updateSkillInput(input.id, {
                              name: event.target.value,
                            })
                          }
                          placeholder={
                            index === 0
                              ? 'e.g. amount'
                              : 'e.g. tax_rate'
                          }
                          aria-label={t(
                            'ai.knowledge.skillInputName',
                            'Input name',
                          )}
                          disabled={isAdding}
                          autoComplete="off"
                        />

                        <SidebarSelect
                          id={`${input.id}-type`}
                          className="console-form-select--down"
                          label={t(
                            'ai.knowledge.skillInputType',
                            'Type',
                          )}
                          hideLabel
                          value={input.type}
                          options={[
                            {
                              value: 'string',
                              label: 'String',
                            },
                            {
                              value: 'number',
                              label: 'Number',
                            },
                            {
                              value: 'boolean',
                              label: 'Boolean',
                            },
                          ]}
                          onChange={(value) =>
                            updateSkillInput(input.id, {
                              type: value as SkillInputType,
                            })
                          }
                          disabled={isAdding}
                        />

                        <IconButton
                          label={t(
                            'ai.knowledge.removeSkillInput',
                            'Remove input',
                          )}
                          variant="secondary"
                          disabled={isAdding}
                          onClick={() =>
                            removeSkillInput(input.id)
                          }
                        >
                          <IconTrash />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
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
                  maxSizeBytes={10 * 1024 * 1024}
                  maxFiles={1}
                  accept=".pdf,.doc,.docx,.txt,.md,.json,.png,.jpg,.jpeg"
                  hint={t(
                    'ai.knowledge.skillFileHint',
                    'Optional: attach a spec, sample, or screenshot. Inputs are defined above.',
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
                    className="console-form-select--down"
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
                  maxSizeBytes={10 * 1024 * 1024}
                  maxFiles={1}
                  accept=".csv,.xls,.xlsx,.json,.txt,.md,.png,.jpg,.jpeg"
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
