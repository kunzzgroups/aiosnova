import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconChevronDown,
  IconCircleCheck,
  IconClock,
  IconCopy,
  IconExternalLink,
  IconPanelLeft,
  IconPanelRight,
  IconPaperclip,
  IconPin,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSpark,
  IconStop,
  IconThumbDown,
  IconThumbUp,
  IconSettings,
} from '@/components/icons/Icons'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconChevron } from '@/components/navigation/SidebarIcons'
import { TextField } from '@/components/ui/TextField'
import { useCompanyStore } from '@/stores/companyStore'
import { AttachMenu } from '../components/AttachMenu'
import type {
  AssistantSource,
  AssistantThread,
  AssistantTurn,
  SourceType,
  ThreadGroup,
} from '../types/assistant'
import './AiAssistantPage.css'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import type {
  AgentListItem,
  AgentModelConfig,
  AgentModelProvider,
} from '@/modules/ai/agents/types/agent'
import { retrieveEvidence } from '../services/assistantService'
import {
  readAssistantPrefs,
  writeAssistantPrefs,
  type AssistantPreferences,
} from '../preferences'
import { AssistantSettingsDrawer } from '../components/AssistantSettingsDrawer'

/** Which side rails the reader has folded away. Session-scoped, like the sidebar. */
const PANELS_STORAGE_KEY = 'aios.ai.panels'
/** v2: threads carry a companyId. v1 data is discarded on read. */
const THREADS_STORAGE_KEY = 'aios.ai.threads.v2'
/** Versioned so the old full-catalogue cache is discarded automatically. */
const MODELS_STORAGE_KEY = 'aios.ai.models.v2'
/** Full provider catalogue, kept separately so search has something to reach into. */
const ALL_MODELS_STORAGE_KEY = 'aios.ai.models.all.v1'

const PREFERRED_MODELS = [
  'openai/gpt-4o',
  'anthropic/claude-sonnet-4',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct',
]

const FALLBACK_MODELS = PREFERRED_MODELS

/** Sentinel value meaning "let the assistant route". */
const AUTO_AGENT_ID = 'auto'

const SYSTEM_PROMPT = 'You are a helpful assistant.'
const DEFAULT_TEMPERATURE = 0.7

/** OpenRouter expects "provider/model". Map our enum to its prefix. */
const PROVIDER_PREFIX: Record<AgentModelProvider, string> = {
  auto: '',
  openai: 'openai/',
  anthropic: 'anthropic/',
  google: 'google/',
  azure: 'openai/',
}

function resolveAgentModelId(config?: AgentModelConfig): string | null {
  if (!config) return null
  if (config.provider === 'auto') return null
  if (!config.model) return null
  const prefix = PROVIDER_PREFIX[config.provider] ?? ''
  return `${prefix}${config.model}`
}

function pickDefaultAgentId(agents: AgentListItem[]): string | null {
  if (agents.length === 0) return null
  const management = agents.find((a) => /management/i.test(a.name))
  return (management ?? agents[0]).id
}

type PanelState = { history: boolean; evidence: boolean }
type PopoverId = 'model' | 'agent' | null

function readPanelState(): PanelState {
  const narrow = window.matchMedia('(max-width: 1180px)').matches
  const fallback: PanelState = { history: narrow, evidence: true }
  try {
    const raw = window.sessionStorage.getItem(PANELS_STORAGE_KEY)
    if (!raw) {
      return fallback
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return fallback
    }
    const value = parsed as Partial<PanelState>
    return { history: value.history === true, evidence: value.evidence === true }
  } catch {
    return fallback
  }
}

function readThreads(): AssistantThread[] {
  try {
    const raw = window.localStorage.getItem(THREADS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as AssistantThread[]).filter(
      (t) => t && typeof t.id === 'string' && typeof t.companyId === 'string',
    )
  } catch {
    return []
  }
}

const GROUP_ORDER: ThreadGroup[] = ['today', 'yesterday', 'earlier']

const SOURCE_LABEL_KEY: Record<SourceType, string> = {
  contract: 'ai.assistant.typeContract',
  invoice: 'ai.assistant.typeInvoice',
  policy: 'ai.assistant.typePolicy',
  record: 'ai.assistant.typeRecord',
}

function answerText(turn: AssistantTurn): string {
  const strip = (value: string) => value.replace(/\*\*/g, '')
  return [
    strip(turn.answer.lead),
    ...turn.answer.facts.map((fact) => `${fact.label}: ${fact.value}`),
    strip(turn.answer.tail),
  ]
    .filter(Boolean)
    .join('\n')
}

function rich(text: string): ReactNode[] {
  return text.split('**').map((chunk, index) =>
    index % 2 === 1 ? <strong key={index}>{chunk}</strong> : <Fragment key={index}>{chunk}</Fragment>,
  )
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function readFileForLLM(
  file: File,
): Promise<
  | { kind: 'image'; name: string; dataUrl: string }
  | { kind: 'text'; name: string; text: string }
> {
  if (file.type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    return { kind: 'image', name: file.name, dataUrl }
  }

  const isTexty =
    file.type.startsWith('text/') ||
    /\.(txt|md|csv|json|log|ya?ml|xml|html?)$/i.test(file.name)

  if (isTexty) {
    return { kind: 'text', name: file.name, text: await file.text() }
  }

  return {
    kind: 'text',
    name: file.name,
    text: `[Binary file: ${file.name} (${file.type || 'unknown'}), ${file.size} bytes. Contents not extractable in the browser.]`,
  }
}

type PendingReply = { question: string; mode: 'append' | 'replace' }

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

function AiModelPicker(props: {
  value: string
  recommended: string[]
  all: string[]
  temperature: number
  onTemperatureChange: (next: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (id: string) => void
  lockedFromAgent?: boolean
  lockedFromAgentLabel?: string
  lockedFromAgentHint?: string
}) {
  const {
    value,
    recommended,
    all,
    temperature,
    onTemperatureChange,
    open,
    onOpenChange,
    onChange,
    lockedFromAgent = false,
    lockedFromAgentLabel = 'from agent',
    lockedFromAgentHint,
  } = props

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  const needle = query.trim().toLowerCase()
  const items = needle
    ? all.filter((id) => id.toLowerCase().includes(needle))
    : recommended

  return (
    <div className="ai-model-picker" data-popover>
      <button
        type="button"
        className={[
          'ai-model-picker__trigger',
          lockedFromAgent ? 'is-agent-locked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        title={lockedFromAgent ? lockedFromAgentHint : undefined}
      >
        {lockedFromAgent ? (
          <span className="ai-model-picker__lock" aria-label={lockedFromAgentLabel}>
            <IconSpark />
          </span>
        ) : null}
        {value}
        <span className="sidebar-select__chevron" aria-hidden>
          <IconChevron />
        </span>
      </button>

      {open ? (
        <div className="ai-model-picker__menu" role="dialog">
          <div className="ai-model-picker__temperature">
            <span className="ai-model-picker__label">Temp</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              aria-label="Temperature"
              onChange={(event) => onTemperatureChange(Number(event.target.value))}
            />
            <span className="ai-model-picker__value">{temperature.toFixed(1)}</span>
          </div>

          <div className="ai-model-picker__search">
            <IconSearch />
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder="Search all models…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <ul className="ai-model-picker__list" role="listbox">
            {items.length === 0 ? (
              <li className="ai-model-picker__empty">No models match “{query}”</li>
            ) : (
              items.map((id) => (
                <li key={id} className="ai-model-picker__item">
                  <button
                    type="button"
                    role="option"
                    aria-selected={id === value}
                    className={['ai-model-picker__option', id === value ? 'is-active' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onChange(id)
                      onOpenChange(false)
                    }}
                  >
                    {id}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function AiAssistantPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)
  const companyLabel = companies.find((item) => item.value === companyId)?.label ?? null

  const [threads, setThreads] = useState<AssistantThread[]>(readThreads)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [openTraceIds, setOpenTraceIds] = useState<string[]>([])
  const [openSourceIds, setOpenSourceIds] = useState<string[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [evidenceTurnId, setEvidenceTurnId] = useState<string | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string>(AUTO_AGENT_ID)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [prefs, setPrefs] = useState<AssistantPreferences>(readAssistantPrefs)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({})
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<PanelState>(readPanelState)
  const [compact, setCompact] = useState(() =>
    window.matchMedia('(max-width: 1180px)').matches,
  )
  const [errorQuestion, setErrorQuestion] = useState<PendingReply | null>(null)
  const [interrupted, setInterrupted] = useState<PendingReply | null>(null)
  const [notConnected, setNotConnected] = useState<PendingReply | null>(null)

  const [recommendedModels, setRecommendedModels] = useState<string[]>(FALLBACK_MODELS)
  const [allModels, setAllModels] = useState<string[]>(FALLBACK_MODELS)
  const [model, setModel] = useState<string>(PREFERRED_MODELS[0])
  const [temperature, setTemperature] = useState<number>(DEFAULT_TEMPERATURE)

  const [openPopover, setOpenPopover] = useState<PopoverId>(null)
  const [streamingText, setStreamingText] = useState<string | null>(null)

  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isComposerDragging, setIsComposerDragging] = useState(false)

  const modelRef = useRef(model)
  const temperatureRef = useRef(temperature)
  useEffect(() => {
    modelRef.current = model
  }, [model])
  useEffect(() => {
    temperatureRef.current = temperature
  }, [temperature])

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null
  const turns = activeThread?.turns ?? []
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null
  const evidenceTurn =
    (evidenceTurnId ? turns.find((turn) => turn.id === evidenceTurnId) : null) ?? lastTurn
  const evidenceIsEarlier = Boolean(evidenceTurn && lastTurn && evidenceTurn.id !== lastTurn.id)
  const sources = evidenceTurn?.sources ?? []
  const allSourcesOpen = sources.length > 0 && openSourceIds.length === sources.length

  const effectiveModel = useMemo(() => {
    const selected =
      agentId !== AUTO_AGENT_ID ? agents.find((a) => a.id === agentId) : null
    const override = resolveAgentModelId(selected?.model)
    return {
      id: override ?? model,
      fromAgent: override !== null,
    }
  }, [agentId, agents, model])

  const announcement =
    pendingQuestion !== null
      ? t('ai.assistant.liveSearching')
      : errorQuestion !== null
        ? t('ai.assistant.liveError')
        : interrupted !== null
          ? t('ai.assistant.liveStopped')
          : notConnected !== null
            ? t('ai.assistant.liveNotConnected')
            : lastTurn
              ? lastTurn.sources.length === 0
                ? t('ai.assistant.liveNotFound')
                : t('ai.assistant.liveAnswered', { count: lastTurn.sources.length })
              : ''

  const visibleThreads = useMemo(
    () => threads.filter((thread) => thread.companyId === companyId),
    [threads, companyId],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return visibleThreads
    }
    return visibleThreads.filter((thread) =>
      thread.title.toLowerCase().includes(needle),
    )
  }, [visibleThreads, query])

  const pinned = filtered.filter((thread) => thread.pinned)
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: filtered.filter((thread) => thread.group === group && !thread.pinned),
  })).filter((bucket) => bucket.items.length > 0)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(collapsed))
    } catch {
      /* storage unavailable */
    }
  }, [collapsed])

  useEffect(() => {
    try {
      window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads))
    } catch {
      /* quota or private mode */
    }
  }, [threads])

  useEffect(() => {
    try {
      const cachedAll = window.sessionStorage.getItem(ALL_MODELS_STORAGE_KEY)
      const cachedCurated = window.sessionStorage.getItem(MODELS_STORAGE_KEY)
      if (cachedAll && cachedCurated) {
        setAllModels(JSON.parse(cachedAll) as string[])
        setRecommendedModels(JSON.parse(cachedCurated) as string[])
        return
      }
    } catch {
      /* fall through to the network fetch */
    }

    fetch(OPENROUTER_MODELS_URL)
      .then((response) => response.json())
      .then((payload: { data?: Array<{ id: string }> }) => {
        const ids = (payload.data ?? []).map((entry) => entry.id).sort()
        if (ids.length === 0) {
          return
        }
        const curated = PREFERRED_MODELS.filter((id) => ids.includes(id))
        const nextCurated = curated.length > 0 ? curated : PREFERRED_MODELS

        setAllModels(ids)
        setRecommendedModels(nextCurated)

        try {
          window.sessionStorage.setItem(ALL_MODELS_STORAGE_KEY, JSON.stringify(ids))
          window.sessionStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(nextCurated))
        } catch {
          /* best-effort */
        }
      })
      .catch(() => {
        /* offline: keep the shortlist */
      })
  }, [])

  useEffect(() => {
    if (recommendedModels.length > 0 && !recommendedModels.includes(model)) {
      setModel(recommendedModels[0])
    }
  }, [recommendedModels, model])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1180px)')
    const handle = () => setCompact(media.matches)
    media.addEventListener('change', handle)
    return () => media.removeEventListener('change', handle)
  }, [])

  useEffect(() => {
    const node = inputRef.current
    if (!node) {
      return
    }
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [draft])

  useEffect(() => {
    if (!compact || (collapsed.history && collapsed.evidence)) {
      return
    }
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setCollapsed({ history: true, evidence: true })
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [compact, collapsed])

  useEffect(() => {
    if (openPopover === null) {
      return
    }
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenPopover(null)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [openPopover])

  useEffect(() => {
    if (openPopover === null) {
      return
    }
    function handleDoc(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (target.closest('[data-popover]')) {
        return
      }
      setOpenPopover(null)
    }
    document.addEventListener('mousedown', handleDoc)
    return () => document.removeEventListener('mousedown', handleDoc)
  }, [openPopover])

  useEffect(() => {
    const node = scrollRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [activeThreadId, turns.length, pendingQuestion, streamingText])

  useEffect(() => {
    if (!activeSourceId) {
      return
    }
    document
      .getElementById(`ai-source-evidence-${activeSourceId}`)
      ?.scrollIntoView({ block: 'center' })
  }, [activeSourceId, evidenceTurnId])

  useEffect(() => {
    if (message === null) {
      return
    }
    const handle = window.setTimeout(() => setMessage(null), 3200)
    return () => window.clearTimeout(handle)
  }, [message])

  useEffect(() => {
    function reset() {
      setIsComposerDragging(false)
    }
    window.addEventListener('blur', reset)
    window.addEventListener('focus', reset)
    document.addEventListener('visibilitychange', reset)
    return () => {
      window.removeEventListener('blur', reset)
      window.removeEventListener('focus', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAgents(companyId)
      .then((result) => {
        if (!cancelled) setAgents(result.items)
      })
      .catch(() => {
        if (!cancelled) setAgents([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId])

  useEffect(() => {
    writeAssistantPrefs(prefs)
  }, [prefs])

  useEffect(() => {
    setActiveThreadId(null)
    setActiveSourceId(null)
    setEvidenceTurnId(null)
    setAgentId(AUTO_AGENT_ID)
  }, [companyId])

  useEffect(() => {
    if (!activeThreadId) return
    setThreads((current) =>
      current.map((thread) =>
        thread.id === activeThreadId && thread.agentId !== agentId
          ? { ...thread, agentId }
          : thread,
      ),
    )
  }, [agentId, activeThreadId])

  function cancelPendingReply() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreamingText(null)
    setPendingQuestion(null)
  }

  function selectThread(threadId: string) {
    cancelPendingReply()
    setActiveThreadId(threadId)
    setActiveSourceId(null)
    setEvidenceTurnId(null)
    setErrorQuestion(null)
    setInterrupted(null)
    setNotConnected(null)
    const thread = threads.find((t) => t.id === threadId)
    setAgentId(thread?.agentId ?? AUTO_AGENT_ID)
  }

  function deleteThread(threadId: string) {
    if (threadId === activeThreadId && pendingQuestion !== null) {
      cancelPendingReply()
    }
    setThreads((current) => current.filter((thread) => thread.id !== threadId))
    setErrorQuestion(null)
    setInterrupted(null)
    setNotConnected(null)
    if (threadId === activeThreadId) {
      setActiveThreadId(null)
      setActiveSourceId(null)
      setEvidenceTurnId(null)
      setFeedback({})
      setCopiedTurnId(null)
    }
  }

  function startNewThread() {
    cancelPendingReply()
    setActiveThreadId(null)
    setActiveSourceId(null)
    setEvidenceTurnId(null)
    setDraft('')
    setAttachedFiles([])
    setErrorQuestion(null)
    setInterrupted(null)
    setNotConnected(null)
    setAgentId(AUTO_AGENT_ID)
    inputRef.current?.focus()
  }

  function focusSource(sourceId: string, turnId: string) {
    setCollapsed((current) => (current.evidence ? { ...current, evidence: false } : current))
    setEvidenceTurnId(turnId)
    setActiveSourceId(sourceId)
    setOpenTraceIds((ids) => (ids.includes(turnId) ? ids : [...ids, turnId]))
    setOpenSourceIds((ids) => (ids.includes(sourceId) ? ids : [...ids, sourceId]))
  }

  function openSource(source: AssistantSource) {
    if (!source.baseId) return
    const target = `/ai/ai/knowledge/${source.baseId}/documents${
      source.documentId ? `?highlight=${encodeURIComponent(source.documentId)}` : ''
    }`
    if (prefs.evidenceAction === 'newTab') {
      window.open(target, '_blank', 'noopener,noreferrer')
    } else {
      void navigate(target)
    }
  }

  function copyAnswer(turn: AssistantTurn) {
    void navigator.clipboard?.writeText(answerText(turn)).then(
      () => {
        setCopiedTurnId(turn.id)
        window.setTimeout(
          () => setCopiedTurnId((current) => (current === turn.id ? null : current)),
          1600,
        )
      },
      () => undefined,
    )
  }

  function applyTurn(threadId: string, turn: AssistantTurn, mode: 'append' | 'replace') {
    setThreads((current) =>
      current.map((thread) => {
        if (thread.id !== threadId) {
          return thread
        }
        const nextTurns =
          mode === 'replace' && thread.turns.length > 0
            ? [...thread.turns.slice(0, -1), turn]
            : [...thread.turns, turn]
        return {
          ...thread,
          turns: nextTurns,
          title: thread.turns.length === 0 ? turn.question : thread.title,
          group: 'today',
          updated: t('ai.assistant.justNow'),
        }
      }),
    )
  }

  async function requestReply(
    threadId: string,
    question: string,
    mode: 'append' | 'replace',
    files: File[] = [],
  ) {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (!apiKey) {
      setNotConnected({ question, mode })
      return
    }

    setPendingQuestion(question)
    setErrorQuestion(null)
    setInterrupted(null)
    setNotConnected(null)
    setStreamingText('')

    const controller = new AbortController()
    abortRef.current = controller
    const started = performance.now()

    const selectedAgent =
      agentId !== AUTO_AGENT_ID ? agents.find((a) => a.id === agentId) : null
    const effectiveAgentId = selectedAgent?.id ?? pickDefaultAgentId(agents)

    const agentModelId = resolveAgentModelId(selectedAgent?.model)
    const selectedModel = agentModelId ?? modelRef.current
    const selectedTemperature =
      selectedAgent?.model?.temperature ?? temperatureRef.current

    try {
      const history = (threads.find((thread) => thread.id === threadId)?.turns ?? []).flatMap(
        (turn) => [
          { role: 'user' as const, content: turn.question },
          { role: 'assistant' as const, content: answerText(turn) },
        ],
      )

      const attachments = await Promise.all(files.map(readFileForLLM))

      const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      > = [{ type: 'text', text: question }]

      for (const file of attachments) {
        if (file.kind === 'image') {
          parts.push({ type: 'image_url', image_url: { url: file.dataUrl } })
        } else {
          parts.push({
            type: 'text',
            text: `--- ${file.name} ---\n${file.text}`,
          })
        }
      }

      const evidence = effectiveAgentId
        ? await retrieveEvidence({
          agentId: effectiveAgentId,
          question,
          activeCompanyId: companyId,
        })
        : { sources: [], scanned: 0, matched: 0, scope: '' }

      const systemWithContext =
        evidence.sources.length === 0
          ? SYSTEM_PROMPT
          : `${SYSTEM_PROMPT}\n\nYou have access to the following company documents. Cite them when they answer the question:\n${evidence.sources
            .map((s) => `- ${s.title} (${s.origin})`)
            .join('\n')}`

      const userContent =
        parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts

      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          temperature: selectedTemperature,
          stream: true,
          messages: [
            { role: 'system', content: systemWithContext },
            ...history,
            { role: 'user', content: userContent },
          ],
        }),
      })

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '')
        // eslint-disable-next-line no-console
        console.error('[assistant] OpenRouter error', response.status, detail)
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''

      for (; ;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue
          }
          const payload = line.slice(6).trim()
          if (payload === '[DONE]' || payload.length === 0) {
            continue
          }
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>
            }
            full += parsed.choices?.[0]?.delta?.content ?? ''
            setStreamingText(full)
          } catch {
            /* half a packet */
          }
        }
      }

      const turn: AssistantTurn = {
        id: `turn-${Date.now()}`,
        question,
        kind: evidence.sources.length > 0 ? 'grounded' : 'chat',
        answer: {
          lead: full,
          facts: [],
          tail: '',
          model: selectedModel,
          cites: evidence.sources.map((_, i) => i + 1),
          trace: {
            scanned: evidence.scanned,
            matched: evidence.matched,
            seconds: Math.round(performance.now() - started) / 1000,
            scope: evidence.scope || undefined,
          },
        },
        sources: evidence.sources,
      }

      applyTurn(threadId, turn, mode)
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setInterrupted({ question, mode })
      } else {
        setErrorQuestion({ question, mode })
      }
    } finally {
      setStreamingText(null)
      setPendingQuestion(null)
      abortRef.current = null
    }
  }

  function regenerate(turn: AssistantTurn) {
    if (pendingQuestion !== null || activeThreadId === null) {
      return
    }
    void requestReply(activeThreadId, turn.question, 'replace')
  }

  function stopReply() {
    abortRef.current?.abort()
  }

  function createThread(question: string): string {
    const threadId = `thread-${Date.now()}`
    setThreads((current) => [
      {
        id: threadId,
        title: question,
        group: 'today',
        updated: t('ai.assistant.justNow'),
        companyId,
        agentId,
        turns: [],
      },
      ...current,
    ])
    setActiveThreadId(threadId)
    return threadId
  }

  function togglePanel(which: 'history' | 'evidence') {
    setCollapsed((current) => {
      const next = { ...current, [which]: !current[which] }
      if (compact && !next[which]) {
        next[which === 'history' ? 'evidence' : 'history'] = true
      }
      return next
    })
  }

  function toggleFeedback(turnId: string, value: 'up' | 'down') {
    setFeedback((current) => {
      const next = { ...current }
      if (next[turnId] === value) {
        delete next[turnId]
      } else {
        next[turnId] = value
      }
      return next
    })
  }

  function submit() {
    const trimmed = draft.trim()
    const hasText = trimmed.length > 0
    const hasFiles = attachedFiles.length > 0
    if ((!hasText && !hasFiles) || pendingQuestion !== null) {
      return
    }

    const question = hasText
      ? trimmed
      : t('ai.assistant.analyzeAttachments', 'Analyze the attached file(s).')

    const threadId = activeThreadId ?? createThread(question)
    const filesToSend = attachedFiles

    setDraft('')
    setActiveSourceId(null)
    setEvidenceTurnId(null)
    setAttachedFiles([])
    void requestReply(threadId, question, 'append', filesToSend)
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  function renderThreadButton(thread: AssistantThread) {
    const active = thread.id === activeThreadId
    const threadSources =
      thread.turns.length > 0 ? thread.turns[thread.turns.length - 1].sources : []

    return (
      <div
        key={thread.id}
        className={['ai-thread-row', active ? 'is-active' : ''].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          className={['ai-thread', active ? 'is-active' : ''].filter(Boolean).join(' ')}
          aria-current={active ? 'true' : undefined}
          onClick={() => selectThread(thread.id)}
        >
          <span className="ai-thread__name">
            {thread.pinned ? (
              <span className="ai-thread__pin" aria-hidden>
                <IconPin />
              </span>
            ) : null}
            <span>{thread.title}</span>
          </span>
          <span className="ai-thread__meta">
            {thread.updated}
            {threadSources.length > 0
              ? ` · ${t('ai.assistant.evidenceCount', { count: threadSources.length })}`
              : ''}
          </span>
        </button>
        <button
          type="button"
          className="ai-thread__delete"
          aria-label={t('ai.assistant.deleteThread')}
          title={t('ai.assistant.deleteThread')}
          onClick={(event) => {
            event.stopPropagation()
            deleteThread(thread.id)
          }}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L12 4M6.5 7v4M9.5 7v4" />
          </svg>
        </button>
      </div>
    )
  }

  function renderSource(source: AssistantSource, index: number, scope: 'trace' | 'evidence') {
    const open = openSourceIds.includes(source.id)
    return (
      <div
        key={source.id}
        id={`ai-source-${scope}-${source.id}`}
        className={[
          'ai-source',
          open ? 'is-open' : '',
          activeSourceId === source.id ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          className="ai-source__head"
          aria-expanded={open}
          onClick={() => setOpenSourceIds((ids) => toggleId(ids, source.id))}
        >
          <span className="ai-source__n">{index + 1}</span>
          <span className="ai-source__body">
            <span className="ai-source__title">
              <span className={`ai-badge ai-badge--${source.type}`}>
                {t(SOURCE_LABEL_KEY[source.type])}
              </span>
              {source.title}
            </span>
            <span className="ai-source__meta">{source.origin}</span>
            <span className="ai-source__snippet">{source.snippet}</span>
          </span>
          <span
            className="ai-source__rel"
            title={t('ai.assistant.relevance', { percent: source.relevance })}
          >
            <i style={{ width: `${source.relevance}%` }} />
          </span>
        </button>
        {open ? (
          <div className="ai-source__actions">
            <button
              type="button"
              className="ai-quiet"
              disabled={!source.baseId}
              title={source.baseId ? undefined : t('ai.assistant.notWired')}
              onClick={() => openSource(source)}
            >
              <IconExternalLink />
              {t('ai.assistant.openFile', 'Open file')}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  function renderTrace(options: {
    turnId: string
    open: boolean
    steps: ReactNode
    body: ReactNode | null
    waiting?: boolean
  }) {
    const canExpand = options.body !== null
    const traceHead = (
      <>
        <span
          className={['ai-trace__dot', options.waiting ? 'ai-trace__dot--pending' : '']
            .filter(Boolean)
            .join(' ')}
        />
        <span className="ai-trace__steps">{options.steps}</span>
        {canExpand ? (
          <span className="ai-trace__chev">
            <IconChevronDown />
          </span>
        ) : null}
      </>
    )

    return (
      <div className="ai-trace">
        {canExpand ? (
          <button
            type="button"
            className="ai-trace__head"
            aria-expanded={options.open}
            onClick={() => setOpenTraceIds((ids) => toggleId(ids, options.turnId))}
          >
            {traceHead}
          </button>
        ) : (
          <div className="ai-trace__head">{traceHead}</div>
        )}
        {canExpand && options.open ? <div className="ai-trace__body">{options.body}</div> : null}
      </div>
    )
  }

  function renderAnswer(turn: AssistantTurn, isLast: boolean) {
    const open = openTraceIds.includes(turn.id)
    const { answer } = turn
    const noMatch = turn.kind === 'grounded' && turn.sources.length === 0
    return (
      <div className="ai-msg">
        <span className="ai-msg__who">
          <span className="ai-msg__mark">
            <IconSpark />
          </span>
          {answer.model
            ? t('ai.assistant.byAssistantModel', {
              model: answer.model,
              count: turn.sources.length,
            })
            : t('ai.assistant.byAssistant', { count: turn.sources.length })}
        </span>
        {noMatch ? (
          <div className="ai-notfound">
            <h3>{t('ai.assistant.notFoundTitle')}</h3>
            <p>
              {t('ai.assistant.notFoundBody', {
                count: answer.trace.scanned,
                scope: answer.trace.scope ?? t('ai.assistant.scopeAll'),
              })}
            </p>
            <ul>
              <li>{t('ai.assistant.notFoundHintScope')}</li>
              <li>{t('ai.assistant.notFoundHintRephrase')}</li>
            </ul>
          </div>
        ) : (
          <div className="ai-prose">
            <p>{rich(answer.lead)}</p>
            {answer.facts.length > 0 ? (
              <div className="ai-kv">
                {answer.facts.map((fact) => (
                  <span className="ai-kv__cell" key={fact.label}>
                    <span className="ai-kv__k">{fact.label}</span>
                    <span className="ai-kv__v">{fact.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {answer.tail || answer.cites.length > 0 ? (
              <p>
                {answer.tail ? rich(answer.tail) : null}
                {answer.cites.length > 0 ? (
                  <span className="ai-cites">
                    {answer.cites.map((cite) => {
                      const source = turn.sources[cite - 1]
                      if (!source) {
                        return null
                      }
                      return (
                        <button
                          key={cite}
                          type="button"
                          className={['ai-cite', activeSourceId === source.id ? 'is-active' : '']
                            .filter(Boolean)
                            .join(' ')}
                          aria-label={t('ai.assistant.openSource', { index: cite })}
                          onClick={() => focusSource(source.id, turn.id)}
                        >
                          {cite}
                        </button>
                      )
                    })}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        )}
        {turn.kind === 'grounded'
          ? renderTrace({
            turnId: turn.id,
            open,
            steps: (
              <>
                {t('ai.assistant.traceScanned', { count: answer.trace.scanned })}
                <span className="ai-trace__arrow">→</span>
                {t('ai.assistant.traceMatched', { count: answer.trace.matched })}
                <span className="ai-trace__arrow">→</span>
                {t('ai.assistant.traceCited', { count: turn.sources.length })}
                <span className="ai-trace__arrow">→</span>
                {t('ai.assistant.traceSeconds', { count: answer.trace.seconds })}
                {answer.trace.scope ? (
                  <>
                    <span className="ai-trace__arrow">·</span>
                    {t('ai.assistant.traceScope', { scope: answer.trace.scope })}
                  </>
                ) : null}
              </>
            ),
            body:
              turn.sources.length === 0
                ? null
                : turn.sources.map((source, index) => renderSource(source, index, 'trace')),
          })
          : null}
        {isLast ? (
          <div className="ai-actions">
            {turn.answer.lead.length > 0 ? (
              <button type="button" className="ai-quiet" onClick={() => copyAnswer(turn)}>
                {copiedTurnId === turn.id ? <IconCircleCheck /> : <IconCopy />}
                {copiedTurnId === turn.id ? t('ai.assistant.copied') : t('ai.assistant.copy')}
              </button>
            ) : null}
            <button
              type="button"
              className="ai-quiet"
              disabled={pendingQuestion !== null}
              onClick={() => regenerate(turn)}
            >
              <IconRefresh />
              {t('ai.assistant.regenerate')}
            </button>
            <span className="ai-actions__sep" aria-hidden />
            <button
              type="button"
              className={['ai-quiet', feedback[turn.id] === 'up' ? 'is-on' : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={feedback[turn.id] === 'up'}
              aria-label={t('ai.assistant.helpful')}
              title={t('ai.assistant.helpful')}
              onClick={() => toggleFeedback(turn.id, 'up')}
            >
              <IconThumbUp />
            </button>
            <button
              type="button"
              className={['ai-quiet', feedback[turn.id] === 'down' ? 'is-on' : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={feedback[turn.id] === 'down'}
              aria-label={t('ai.assistant.notHelpful')}
              title={t('ai.assistant.notHelpful')}
              onClick={() => toggleFeedback(turn.id, 'down')}
            >
              <IconThumbDown />
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const hasTranscript =
    turns.length > 0 ||
    pendingQuestion !== null ||
    interrupted !== null ||
    errorQuestion !== null ||
    notConnected !== null

  return (
    <div className="ai-page">
      {message !== null ? (
        <div className="ai-toast" role="status">
          {message}
        </div>
      ) : null}

      <div className="ai-workspace">
        {compact && (!collapsed.history || !collapsed.evidence) ? (
          <button
            type="button"
            className="ai-backdrop"
            aria-label={t('ai.assistant.closePanels')}
            onClick={() => setCollapsed({ history: true, evidence: true })}
          />
        ) : null}
        {collapsed.history ? null : (
          <aside className="ai-history">
            <div className="ai-rail-head">
              <span className="ai-rail-title">{t('ai.assistant.history')}</span>
              <button type="button" className="ai-quiet ai-quiet--push" onClick={startNewThread}>
                <IconPlus />
                {t('ai.assistant.newThread')}
              </button>
            </div>
            <div className="ai-history__search">
              <span className="ai-history__search-icon" aria-hidden>
                <IconSearch />
              </span>
              <TextField
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('ai.assistant.searchThreads')}
                aria-label={t('ai.assistant.searchThreads')}
              />
            </div>
            <div className="ai-history__scroll">
              {filtered.length === 0 ? (
                <p className="ai-history__empty">
                  {threads.length === 0 ? t('ai.assistant.noThreads') : t('ai.assistant.noMatches')}
                </p>
              ) : null}

              {pinned.length > 0 ? (
                <div>
                  <span className="ai-group-label">{t('ai.assistant.pinned')}</span>
                  {pinned.map(renderThreadButton)}
                </div>
              ) : null}

              {grouped.map((bucket) => (
                <div key={bucket.group}>
                  <span className="ai-group-label">{t(`ai.assistant.${bucket.group}`)}</span>
                  {bucket.items.map(renderThreadButton)}
                </div>
              ))}
            </div>
          </aside>
        )}

        <section className="ai-chat">
          <div className="ai-chat__bar">
            <button
              type="button"
              className="ai-quiet ai-quiet--icon"
              aria-pressed={!collapsed.history}
              aria-label={
                collapsed.history ? t('ai.assistant.showHistory') : t('ai.assistant.hideHistory')
              }
              title={
                collapsed.history ? t('ai.assistant.showHistory') : t('ai.assistant.hideHistory')
              }
              onClick={() => togglePanel('history')}
            >
              <IconPanelLeft />
            </button>
            <h2 className="ai-chat__title">
              {activeThread?.title ?? t('ai.assistant.newThreadTitle')}
            </h2>
            {companyLabel ? (
              <span className="ai-scope">
                <span className="ai-scope__dot" />
                {t('ai.assistant.scope')} <strong>{companyLabel}</strong>
              </span>
            ) : null}
            <div className="ai-chat__actions">
              {sources.length > 0 ? (
                <span className="ai-meta">
                  <IconClock />
                  {t('ai.assistant.evidenceCount', { count: sources.length })}
                </span>
              ) : null}
              <button
                type="button"
                className="ai-quiet ai-quiet--icon"
                aria-label={t('ai.assistant.settingsTitle', 'Assistant settings')}
                title={t('ai.assistant.settingsTitle', 'Assistant settings')}
                onClick={() => setSettingsOpen(true)}
              >
                <IconSettings />
              </button>
              <button
                type="button"
                className="ai-quiet ai-quiet--icon"
                aria-pressed={!collapsed.evidence}
                aria-label={
                  collapsed.evidence
                    ? t('ai.assistant.showEvidence')
                    : t('ai.assistant.hideEvidence')
                }
                title={
                  collapsed.evidence
                    ? t('ai.assistant.showEvidence')
                    : t('ai.assistant.hideEvidence')
                }
                onClick={() => togglePanel('evidence')}
              >
                <IconPanelRight />
              </button>
            </div>
          </div>

          <div className="ai-chat__scroll" ref={scrollRef} aria-busy={pendingQuestion !== null}>
            <p className="ai-sr-only" role="status" aria-live="polite">
              {announcement}
            </p>
            <div className="ai-chat__col">
              {turns.map((turn, index) => (
                <Fragment key={turn.id}>
                  <div className="ai-msg--user">{turn.question}</div>
                  <div
                    onMouseEnter={() => setEvidenceTurnId(turn.id)}
                    onFocusCapture={() => setEvidenceTurnId(turn.id)}
                  >
                    {renderAnswer(turn, index === turns.length - 1)}
                  </div>
                </Fragment>
              ))}

              {pendingQuestion !== null ? (
                <>
                  <div className="ai-msg--user">{pendingQuestion}</div>
                  <div className="ai-msg">
                    <span className="ai-msg__who">
                      <span className="ai-msg__mark">
                        <IconSpark />
                      </span>
                      {effectiveModel.id}
                    </span>
                    {streamingText ? (
                      <div className="ai-prose">
                        <p>{streamingText}</p>
                      </div>
                    ) : (
                      renderTrace({
                        turnId: 'pending',
                        open: false,
                        waiting: true,
                        steps: t('ai.assistant.tracePending'),
                        body: null,
                      })
                    )}
                  </div>
                </>
              ) : null}

              {interrupted !== null ? (
                <>
                  <div className="ai-msg--user">{interrupted.question}</div>
                  <div className="ai-msg">
                    <span className="ai-stopped">
                      <IconStop />
                      {t('ai.assistant.stopped')}
                    </span>
                    <div className="ai-actions">
                      <button
                        type="button"
                        className="ai-quiet"
                        onClick={() =>
                          activeThreadId &&
                          void requestReply(activeThreadId, interrupted.question, interrupted.mode)
                        }
                      >
                        <IconRefresh />
                        {t('ai.assistant.retry')}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}

              {notConnected !== null ? (
                <>
                  <div className="ai-msg--user">{notConnected.question}</div>
                  <div className="ai-msg">
                    <div className="ai-notconnected">
                      <h3>{t('ai.assistant.notConnectedTitle')}</h3>
                      <p>{t('ai.assistant.notConnectedBody')}</p>
                    </div>
                  </div>
                </>
              ) : null}

              {errorQuestion !== null ? (
                <>
                  <div className="ai-msg--user">{errorQuestion.question}</div>
                  <div className="ai-msg">
                    <div className="ai-error" role="alert">
                      <span className="ai-error__mark">
                        <IconAlertTriangle />
                      </span>
                      <div>
                        <h3>{t('ai.assistant.errorTitle')}</h3>
                        <p>{t('ai.assistant.errorBody')}</p>
                      </div>
                      <button
                        type="button"
                        className="ai-quiet ai-quiet--push"
                        onClick={() =>
                          activeThreadId &&
                          void requestReply(
                            activeThreadId,
                            errorQuestion.question,
                            errorQuestion.mode,
                          )
                        }
                      >
                        <IconRefresh />
                        {t('ai.assistant.retry')}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}

              {!hasTranscript ? (
                <div className="ai-empty">
                  <span className="ai-empty__mark">
                    <IconSpark />
                  </span>
                  <h2>{t('ai.assistant.emptyTitle')}</h2>
                  <p>{t('ai.assistant.emptyHint')}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="ai-chat__composer">
            <div
              className={`ai-composer${isComposerDragging ? ' is-dragging' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); setIsComposerDragging(true) }}
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setIsComposerDragging(true) }}
              onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); setIsComposerDragging(false) }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setIsComposerDragging(false)
                const files = Array.from(event.dataTransfer.files ?? [])
                if (files.length > 0) setAttachedFiles((prev) => [...prev, ...files])
              }}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData?.files ?? [])
                if (files.length > 0) {
                  event.preventDefault()
                  setAttachedFiles((prev) => [...prev, ...files])
                }
              }}
            >
              {attachedFiles.length > 0 ? (
                <ul
                  className="ai-composer__attachments"
                  aria-label={t('ai.assistant.attachedFiles')}
                >
                  {attachedFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="ai-composer__file">
                      <IconPaperclip />
                      <span className="ai-composer__file-name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="ai-composer__file-size">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        className="ai-composer__file-remove"
                        aria-label={t('ai.assistant.removeFile', { name: file.name })}
                        onClick={() =>
                          setAttachedFiles((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {isComposerDragging ? (
                <div className="ai-composer__drop-overlay" aria-hidden>
                  <IconPaperclip />
                  <span>{t('ai.assistant.dropFilesHere', 'Drop files to attach')}</span>
                </div>
              ) : null}

              <textarea
                ref={inputRef}
                className="ai-composer__input"
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={t('ai.assistant.composerPlaceholder')}
                aria-label={t('ai.assistant.composerPlaceholder')}
              />

              <div className="ai-composer__foot">
                <AiModelPicker
                  value={effectiveModel.id}
                  recommended={recommendedModels}
                  all={allModels}
                  temperature={temperature}
                  onTemperatureChange={setTemperature}
                  open={openPopover === 'model'}
                  onOpenChange={(next) => setOpenPopover(next ? 'model' : null)}
                  onChange={setModel}
                  lockedFromAgent={effectiveModel.fromAgent}
                  lockedFromAgentLabel={t('ai.assistant.modelFromAgent', 'from agent')}
                  lockedFromAgentHint={t(
                    'ai.assistant.modelFromAgentHint',
                    'This model is set by the selected agent. Clear the agent to use your own choice.',
                  )}
                />

                <div className="ai-pill-select" data-popover>
                  <SidebarSelect
                    id="ai-agent"
                    label="Agent"
                    hideLabel
                    value={agentId}
                    options={[
                      { value: AUTO_AGENT_ID, label: t('ai.assistant.agentAuto', 'Auto') },
                      ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
                    ]}
                    onChange={setAgentId}
                    open={openPopover === 'agent'}
                    onOpenChange={(next) => setOpenPopover(next ? 'agent' : null)}
                  />
                </div>

                <span className="ai-composer__spacer" />

                <AttachMenu
                  onAttachToChat={(file) => setAttachedFiles((prev) => [...prev, file])}
                  onStored={({ baseName, fileName }) =>
                    setMessage(
                      t('ai.assistant.storedIn', { base: baseName, name: fileName }),
                    )
                  }
                />

                {pendingQuestion !== null ? (
                  <button
                    type="button"
                    className="ai-send ai-send--stop"
                    aria-label={t('ai.assistant.stop')}
                    title={t('ai.assistant.stop')}
                    onClick={stopReply}
                  >
                    <IconStop />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ai-send"
                    aria-label={t('ai.assistant.send')}
                    disabled={draft.trim().length === 0 && attachedFiles.length === 0}
                    onClick={submit}
                  >
                    <IconSend />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {collapsed.evidence ? null : (
          <aside className="ai-evidence">
            <div className="ai-rail-head">
              <span className="ai-rail-title">{t('ai.assistant.evidence')}</span>
              {sources.length > 0 ? <span className="ai-rail-count">{sources.length}</span> : null}
              {sources.length > 1 ? (
                <button
                  type="button"
                  className="ai-quiet ai-quiet--push"
                  onClick={() =>
                    setOpenSourceIds(allSourcesOpen ? [] : sources.map((source) => source.id))
                  }
                >
                  {allSourcesOpen ? t('ai.assistant.closeAll') : t('ai.assistant.openAll')}
                </button>
              ) : null}
            </div>
            {evidenceIsEarlier && evidenceTurn ? (
              <div className="ai-evidence__note">
                <IconClock />
                <span className="ai-evidence__note-text">
                  {t('ai.assistant.evidenceEarlier', { question: evidenceTurn.question })}
                </span>
                <button
                  type="button"
                  className="ai-quiet ai-quiet--push"
                  onClick={() => setEvidenceTurnId(null)}
                >
                  {t('ai.assistant.backToLatest')}
                </button>
              </div>
            ) : null}
            <div className="ai-evidence__list">
              {sources.length === 0 ? (
                evidenceTurn && evidenceTurn.kind === 'chat' ? (
                  <div className="ai-kv">
                    <span className="ai-kv__cell">
                      <span className="ai-kv__k">{t('ai.assistant.model')}</span>
                      <span className="ai-kv__v">{evidenceTurn.answer.model}</span>
                    </span>
                    <span className="ai-kv__cell">
                      <span className="ai-kv__k">Latency</span>
                      <span className="ai-kv__v">{evidenceTurn.answer.trace.seconds}s</span>
                    </span>
                  </div>
                ) : (
                  <p className="ai-history__empty">{t('ai.assistant.evidenceEmpty')}</p>
                )
              ) : (
                sources.map((source, index) => renderSource(source, index, 'evidence'))
              )}
            </div>
            {companyLabel ? (
              <div className="ai-evidence__foot">
                {t('ai.assistant.scopeNote', { company: companyLabel })}
              </div>
            ) : null}
          </aside>
        )}
      </div>

      <AssistantSettingsDrawer
        open={settingsOpen}
        prefs={prefs}
        onChange={setPrefs}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}