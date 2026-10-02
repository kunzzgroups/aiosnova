import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
} from '@/components/icons/Icons'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { TextField } from '@/components/ui/TextField'
import { useCompanyStore } from '@/stores/companyStore'
import { assistantScopes, type ScopeId } from '../data/assistantOptions'
import type {
  AssistantSource,
  AssistantThread,
  AssistantTurn,
  SourceType,
  ThreadGroup,
} from '../types/assistant'
import './AiAssistantPage.css'

/**
 * How long the "assistant is working" state is shown before the page reports
 * that no service is connected. Keeps the pending state reviewable; a real
 * streamed call replaces it.
 */
const SERVICE_STUB_DELAY_MS = 900

/** Which side rails the reader has folded away. Session-scoped, like the sidebar. */
const PANELS_STORAGE_KEY = 'aios.ai.panels'

type PanelState = { history: boolean; evidence: boolean }

function readPanelState(): PanelState {
  // Nothing stored yet: fold both rails on a narrow window, where they would be
  // overlays instead of columns.
  const narrow = window.matchMedia('(max-width: 1180px)').matches
  const fallback: PanelState = { history: narrow, evidence: narrow }
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

const GROUP_ORDER: ThreadGroup[] = ['today', 'yesterday', 'earlier']

const SOURCE_LABEL_KEY: Record<SourceType, string> = {
  contract: 'ai.assistant.typeContract',
  invoice: 'ai.assistant.typeInvoice',
  policy: 'ai.assistant.typePolicy',
  record: 'ai.assistant.typeRecord',
}

const SCOPE_LABEL_KEY: Record<ScopeId, string> = {
  all: 'ai.assistant.scopeAll',
  contract: 'ai.assistant.typeContract',
  invoice: 'ai.assistant.typeInvoice',
  policy: 'ai.assistant.typePolicy',
  record: 'ai.assistant.typeRecord',
}

/** Plain text of an answer, for the copy action (emphasis markers stripped). */
function answerText(turn: AssistantTurn): string {
  const strip = (value: string) => value.replace(/\*\*/g, '')
  return [
    strip(turn.answer.lead),
    ...turn.answer.facts.map((fact) => `${fact.label}: ${fact.value}`),
    strip(turn.answer.tail),
  ].join('\n')
}

/**
 * Demo copy carries **emphasis** markers; this turns them into <strong> so the
 * transcript keeps its hierarchy without pulling in a markdown renderer.
 */
function rich(text: string): ReactNode[] {
  return text.split('**').map((chunk, index) =>
    index % 2 === 1 ? <strong key={index}>{chunk}</strong> : <Fragment key={index}>{chunk}</Fragment>,
  )
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

/** A question that is waiting on a retry, and how to re-ask it. */
type PendingReply = { question: string; mode: 'append' | 'replace' }

/**
 * AI Assistant: three panes - chats grouped by time, the conversation, and the
 * evidence behind the answer you are reading.
 *
 * Company scope is NOT chosen here. The active company comes from the sidebar
 * (GROUP COMPANIES) and is only *shown* here, because every answer is scoped to
 * it.
 *
 * No content is bundled: threads start empty and a question resolves to the
 * "no service connected" state until `requestReply` calls a real service.
 */
export function AiAssistantPage() {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)
  const companyLabel = companies.find((item) => item.value === companyId)?.label ?? null

  const [threads, setThreads] = useState<AssistantThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [openTraceIds, setOpenTraceIds] = useState<string[]>([])
  const [openSourceIds, setOpenSourceIds] = useState<string[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  /**
   * Answer the evidence rail is showing. `null` means "follow the newest one"; a
   * turn id means the reader pointed at an earlier answer and the rail followed.
   */
  const [evidenceTurnId, setEvidenceTurnId] = useState<string | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [scopeId, setScopeId] = useState<ScopeId>('all')
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({})
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<PanelState>(readPanelState)
  /** Viewport where the side rails become overlays instead of columns. */
  const [compact, setCompact] = useState(() =>
    window.matchMedia('(max-width: 1180px)').matches,
  )
  /** Question whose request failed, plus how to retry it. */
  const [errorQuestion, setErrorQuestion] = useState<PendingReply | null>(null)
  /** Question whose generation the reader stopped, plus how to retry it. */
  const [interrupted, setInterrupted] = useState<PendingReply | null>(null)
  /** Question that has no answer because no assistant service is connected. */
  const [notConnected, setNotConnected] = useState<PendingReply | null>(null)
  /** Whether the in-flight reply appends a turn or replaces the last one. */
  const pendingModeRef = useRef<'append' | 'replace'>('append')
  const replyTimer = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null
  const turns = activeThread?.turns ?? []
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null
  /** The turn the evidence rail mirrors: the hovered one, else the newest. */
  const evidenceTurn = (evidenceTurnId ? turns.find((turn) => turn.id === evidenceTurnId) : null) ?? lastTurn
  const evidenceIsEarlier = Boolean(evidenceTurn && lastTurn && evidenceTurn.id !== lastTurn.id)
  const sources = evidenceTurn?.sources ?? []
  const allSourcesOpen = sources.length > 0 && openSourceIds.length === sources.length

  /** Announcement for the hidden live region; keeps SR users in the loop. */
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return threads
    }
    return threads.filter((thread) => thread.title.toLowerCase().includes(needle))
  }, [threads, query])

  const pinned = filtered.filter((thread) => thread.pinned)
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: filtered.filter((thread) => thread.group === group && !thread.pinned),
  })).filter((bucket) => bucket.items.length > 0)

  useEffect(() => {
    return () => {
      if (replyTimer.current !== null) {
        window.clearTimeout(replyTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(collapsed))
    } catch {
      /* storage unavailable - folding still works for this session */
    }
  }, [collapsed])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1180px)')
    const handle = () => setCompact(query.matches)
    query.addEventListener('change', handle)
    return () => query.removeEventListener('change', handle)
  }, [])

  // Grows the composer with the draft, up to the CSS max-height.
  useEffect(() => {
    const node = inputRef.current
    if (!node) {
      return
    }
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [draft])

  // Escape dismisses an overlay rail on a narrow window.
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

  // Keep the newest turn in view as the transcript grows.
  useEffect(() => {
    const node = scrollRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [activeThreadId, turns.length, pendingQuestion])

  // Brought into view after the rail has re-rendered for the right turn.
  useEffect(() => {
    if (!activeSourceId) {
      return
    }
    document
      .getElementById(`ai-source-evidence-${activeSourceId}`)
      ?.scrollIntoView({ block: 'center' })
  }, [activeSourceId, evidenceTurnId])

  function cancelPendingReply() {
    if (replyTimer.current !== null) {
      window.clearTimeout(replyTimer.current)
      replyTimer.current = null
    }
    setPendingQuestion(null)
  }

  function selectThread(threadId: string) {
    cancelPendingReply()
    setActiveThreadId(threadId)
    setActiveSourceId(null)
    setEvidenceTurnId(null)
  }

  function startNewThread() {
    cancelPendingReply()
    setActiveThreadId(null)
    setActiveSourceId(null)
    setEvidenceTurnId(null)
    setDraft('')
    inputRef.current?.focus()
  }

  /**
   * Point the rail at a source. The rail follows the turn that owns it, so an
   * earlier answer's citation pulls the rail back to that answer first.
   */
  function focusSource(sourceId: string, turnId: string) {
    // Following a citation is an explicit request to see it, so a folded rail opens.
    setCollapsed((current) => (current.evidence ? { ...current, evidence: false } : current))
    setEvidenceTurnId(turnId)
    setActiveSourceId(sourceId)
    setOpenTraceIds((ids) => (ids.includes(turnId) ? ids : [...ids, turnId]))
    setOpenSourceIds((ids) => (ids.includes(sourceId) ? ids : [...ids, sourceId]))
  }

  function copyAnswer(turn: AssistantTurn) {
    void navigator.clipboard?.writeText(answerText(turn)).then(
      () => {
        setCopiedTurnId(turn.id)
        window.setTimeout(() => setCopiedTurnId((current) => (current === turn.id ? null : current)), 1600)
      },
      () => undefined,
    )
  }

  /**
   * The single "ask the assistant" path, shared by send / regenerate / retry.
   *
   * INTEGRATION POINT. Replace the stub below with the real (streamed) call and
   * the existing rendering takes over: append a `turn` for an answer, set
   * `setErrorQuestion(...)` when the request fails, and leave `notConnected`
   * unset. The no-match state needs no extra work - a turn with an empty
   * `sources` array renders as it.
   */
  function requestReply(_threadId: string, question: string, mode: 'append' | 'replace') {
    // `_threadId` is unused by the stub; the real call appends its turn there.
    pendingModeRef.current = mode
    setPendingQuestion(question)
    setErrorQuestion(null)
    setInterrupted(null)
    setNotConnected(null)

    // Stub: nothing is connected yet, so report that instead of inventing content.
    replyTimer.current = window.setTimeout(() => {
      replyTimer.current = null
      setPendingQuestion(null)
      setNotConnected({ question, mode })
    }, SERVICE_STUB_DELAY_MS)
  }

  /** Regenerate = ask the same question again, replacing its answer. */
  function regenerate(turn: AssistantTurn) {
    if (pendingQuestion !== null || activeThreadId === null) {
      return
    }
    requestReply(activeThreadId, turn.question, 'replace')
  }

  /** Stop the in-flight reply. The question stays with a "stopped" line. */
  function stopReply() {
    if (pendingQuestion === null) {
      return
    }
    if (replyTimer.current !== null) {
      window.clearTimeout(replyTimer.current)
      replyTimer.current = null
    }
    setInterrupted({ question: pendingQuestion, mode: pendingModeRef.current })
    setPendingQuestion(null)
  }

  /** Threads are created by asking something; there is no bundled content. */
  function createThread(question: string): string {
    const threadId = `thread-${Date.now()}`
    setThreads((current) => [
      {
        id: threadId,
        title: question,
        group: 'today',
        updated: t('ai.assistant.justNow'),
        turns: [],
      },
      ...current,
    ])
    setActiveThreadId(threadId)
    return threadId
  }

  /**
   * Fold/unfold a side rail. On a narrow window the rails are overlays, so only
   * one can be open at a time - opening one folds the other.
   */
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
    const question = draft.trim()
    if (!question || pendingQuestion !== null) {
      return
    }

    const threadId = activeThreadId ?? createThread(question)

    setDraft('')
    setActiveSourceId(null)
    // A new answer is the newest one, so the rail goes back to following it.
    setEvidenceTurnId(null)
    requestReply(threadId, question, 'append')
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  function renderThreadButton(thread: AssistantThread) {
    const active = thread.id === activeThreadId
    const threadSources = thread.turns.length > 0 ? thread.turns[thread.turns.length - 1].sources : []
    return (
      <button
        key={thread.id}
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
            <button type="button" className="ai-quiet" disabled title={t('ai.assistant.notWired')}>
              <IconExternalLink />
              {source.kind === 'file' ? t('ai.assistant.openFile') : t('ai.assistant.openRecord')}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  /** The provenance trace: a counter line that unfolds into the source rows. */
  function renderTrace(options: {
    turnId: string
    open: boolean
    steps: ReactNode
    /** `null` = nothing to unfold (still searching, or no sources matched). */
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
    // No sources means the search ran and matched nothing: answering anyway is
    // exactly what a grounded assistant must not do.
    const noMatch = turn.sources.length === 0
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
            <div className="ai-kv">
              {answer.facts.map((fact) => (
                <span className="ai-kv__cell" key={fact.label}>
                  <span className="ai-kv__k">{fact.label}</span>
                  <span className="ai-kv__v">{fact.value}</span>
                </span>
              ))}
            </div>
            <p>
              {rich(answer.tail)}
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
            </p>
          </div>
        )}
        {renderTrace({
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
        })}
        {/* Answer-level actions live on the newest answer only. */}
        {isLast ? (
          <div className="ai-actions">
            {/* Nothing to copy on a no-match reply. */}
            {turn.sources.length > 0 ? (
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
      <div className="ai-workspace">
        {/* Narrow windows show the rails as overlays, so they need a dismiss
            target that is not the toggle itself. */}
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
              title={collapsed.history ? t('ai.assistant.showHistory') : t('ai.assistant.hideHistory')}
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
            {/* Screen readers get the same state changes sighted users see. */}
            <p className="ai-sr-only" role="status" aria-live="polite">
              {announcement}
            </p>
            <div className="ai-chat__col">
              {turns.map((turn, index) => (
                <Fragment key={turn.id}>
                  <div className="ai-msg--user">{turn.question}</div>
                  {/* Pointing at an answer (mouse or keyboard) moves the rail. */}
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
                    {renderTrace({
                      turnId: 'pending',
                      open: false,
                      waiting: true,
                      steps: t('ai.assistant.tracePending'),
                      body: null,
                    })}
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
                          requestReply(activeThreadId, interrupted.question, interrupted.mode)
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
                          requestReply(activeThreadId, errorQuestion.question, errorQuestion.mode)
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
            <div className="ai-composer">
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
                {/* Model picker seam: the button is the integration point, there is
                    no catalogue behind it yet (see `assistantModels`). */}
                <button
                  type="button"
                  className="ai-chip-toggle"
                  disabled
                  title={t('ai.assistant.notWired')}
                  aria-label={t('ai.assistant.model')}
                >
                  {t('ai.assistant.model')}
                  <IconChevronDown />
                </button>
                <SidebarSelect
                  id="ai-scope"
                  label={t('ai.assistant.sourcesScope')}
                  hideLabel
                  value={scopeId}
                  options={assistantScopes.map((scope) => ({
                    value: scope,
                    label: t(SCOPE_LABEL_KEY[scope]),
                  }))}
                  onChange={(value) => setScopeId(value as ScopeId)}
                  className="ai-pill-select"
                />
                <span className="ai-composer__spacer" />
                <button
                  type="button"
                  className="ai-quiet"
                  disabled
                  title={t('ai.assistant.notWired')}
                >
                  <IconPaperclip />
                  {t('ai.assistant.attach')}
                </button>
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
                    disabled={draft.trim().length === 0}
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
              <p className="ai-history__empty">{t('ai.assistant.evidenceEmpty')}</p>
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
    </div>
  )
}
