import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconChevronDown,
  IconClock,
  IconExternalLink,
  IconPaperclip,
  IconPin,
  IconPlus,
  IconSearch,
  IconSend,
  IconSpark,
} from '@/components/icons/Icons'
import { TextField } from '@/components/ui/TextField'
import { useCompanyStore } from '@/stores/companyStore'
import {
  assistantSuggestions,
  assistantThreads,
  buildDemoTurn,
  type AssistantSource,
  type AssistantThread,
  type AssistantTurn,
  type SourceType,
  type ThreadGroup,
} from '../data/assistantDemo'
import './AiAssistantPage.css'

/** How long the stand-in "assistant is working" state lasts. */
const DEMO_REPLY_DELAY_MS = 1100

const GROUP_ORDER: ThreadGroup[] = ['today', 'yesterday', 'earlier']

const SOURCE_LABEL_KEY: Record<SourceType, string> = {
  contract: 'ai.assistant.typeContract',
  invoice: 'ai.assistant.typeInvoice',
  policy: 'ai.assistant.typePolicy',
  record: 'ai.assistant.typeRecord',
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

/**
 * AI Assistant: three panes - chats grouped by time, the conversation, and the
 * evidence behind the answer you are reading.
 *
 * Company scope is NOT chosen here. The active company comes from the sidebar
 * (GROUP COMPANIES) and is only *shown* here, because every answer is scoped to
 * it.
 *
 * Content comes from `data/assistantDemo` - there is no assistant service yet,
 * see `buildDemoTurn`.
 */
export function AiAssistantPage() {
  const { t } = useTranslation()
  const companyId = useCompanyStore((state) => state.companyId)
  const companies = useCompanyStore((state) => state.companies)
  const companyLabel = companies.find((item) => item.value === companyId)?.label ?? null

  const [threads, setThreads] = useState<AssistantThread[]>(assistantThreads)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    assistantThreads[0]?.id ?? null,
  )
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [groundedOnly, setGroundedOnly] = useState(true)
  const [openTraceIds, setOpenTraceIds] = useState<string[]>([])
  const [openSourceIds, setOpenSourceIds] = useState<string[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const replyTimer = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null
  const turns = activeThread?.turns ?? []
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null
  const sources = lastTurn?.sources ?? []
  const allSourcesOpen = sources.length > 0 && openSourceIds.length === sources.length

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

  // Keep the newest turn in view as the transcript grows.
  useEffect(() => {
    const node = scrollRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [activeThreadId, turns.length, pendingQuestion])

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
  }

  function startNewThread() {
    cancelPendingReply()
    setActiveThreadId(null)
    setDraft('')
    inputRef.current?.focus()
  }

  function focusSource(sourceId: string, turnId: string) {
    setActiveSourceId(sourceId)
    setOpenTraceIds((ids) => (ids.includes(turnId) ? ids : [...ids, turnId]))
    setOpenSourceIds((ids) => (ids.includes(sourceId) ? ids : [...ids, sourceId]))
    // The evidence rail copy is the one to scroll to; the trace row above the
    // composer shares the source id, so the scope is part of the DOM id.
    document.getElementById(`ai-source-evidence-${sourceId}`)?.scrollIntoView({ block: 'center' })
  }

  function submit() {
    const question = draft.trim()
    if (!question || pendingQuestion !== null) {
      return
    }

    const threadId = activeThreadId ?? `thread-${Date.now()}`
    if (!activeThreadId) {
      const thread: AssistantThread = {
        id: threadId,
        title: question,
        group: 'today',
        updated: t('ai.assistant.justNow'),
        turns: [],
      }
      setThreads((current) => [thread, ...current])
      setActiveThreadId(threadId)
    }

    setDraft('')
    setActiveSourceId(null)
    setPendingQuestion(question)

    // Stand-in for the assistant call: with no service to talk to, the answer is
    // replayed from the demo data. Swap this for the real (streamed) call.
    replyTimer.current = window.setTimeout(() => {
      const turn = buildDemoTurn(question, `turn-${Date.now()}`)
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId ? { ...thread, turns: [...thread.turns, turn] } : thread,
        ),
      )
      setPendingQuestion(null)
      replyTimer.current = null
    }, DEMO_REPLY_DELAY_MS)
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
    body: ReactNode
    waiting?: boolean
  }) {
    return (
      <div className="ai-trace">
        <button
          type="button"
          className="ai-trace__head"
          aria-expanded={options.open}
          onClick={() => setOpenTraceIds((ids) => toggleId(ids, options.turnId))}
        >
          <span
            className={['ai-trace__dot', options.waiting ? 'ai-trace__dot--pending' : '']
              .filter(Boolean)
              .join(' ')}
          />
          <span className="ai-trace__steps">{options.steps}</span>
          <span className="ai-trace__chev">
            <IconChevronDown />
          </span>
        </button>
        {options.open ? <div className="ai-trace__body">{options.body}</div> : null}
      </div>
    )
  }

  function renderAnswer(turn: AssistantTurn) {
    const open = openTraceIds.includes(turn.id)
    const { answer } = turn
    return (
      <div className="ai-msg">
        <span className="ai-msg__who">
          <span className="ai-msg__mark">
            <IconSpark />
          </span>
          {t('ai.assistant.byAssistant', { count: turn.sources.length })}
        </span>
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
            </>
          ),
          body: turn.sources.map((source, index) => renderSource(source, index, 'trace')),
        })}
      </div>
    )
  }

  const hasTranscript = turns.length > 0 || pendingQuestion !== null

  return (
    <div className="ai-page">
      <div className="ai-workspace">
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

        <section className="ai-chat">
          <div className="ai-chat__bar">
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
            </div>
          </div>

          <div className="ai-chat__scroll" ref={scrollRef}>
            <div className="ai-chat__col">
              {turns.map((turn) => (
                <Fragment key={turn.id}>
                  <div className="ai-msg--user">{turn.question}</div>
                  {renderAnswer(turn)}
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

              {!hasTranscript ? (
                <div className="ai-empty">
                  <span className="ai-empty__mark">
                    <IconSpark />
                  </span>
                  <h2>{t('ai.assistant.emptyTitle')}</h2>
                  <p>{t('ai.assistant.emptyHint')}</p>
                  <div className="ai-empty__suggestions">
                    <span className="ai-group-label">{t('ai.assistant.suggestions')}</span>
                    {assistantSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="ai-suggestion"
                        onClick={() => {
                          setDraft(suggestion)
                          inputRef.current?.focus()
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
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
                <button
                  type="button"
                  className="ai-quiet"
                  disabled
                  title={t('ai.assistant.notWired')}
                >
                  <IconPaperclip />
                  {t('ai.assistant.attach')}
                </button>
                <button
                  type="button"
                  className={['ai-chip-toggle', groundedOnly ? 'is-on' : ''].filter(Boolean).join(' ')}
                  aria-pressed={groundedOnly}
                  onClick={() => setGroundedOnly((value) => !value)}
                >
                  {t('ai.assistant.groundedOnly')}
                </button>
                <span className="ai-composer__spacer" />
                <button
                  type="button"
                  className="ai-send"
                  aria-label={t('ai.assistant.send')}
                  disabled={draft.trim().length === 0 || pendingQuestion !== null}
                  onClick={submit}
                >
                  <IconSend />
                </button>
              </div>
            </div>
          </div>
        </section>

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
      </div>
    </div>
  )
}
