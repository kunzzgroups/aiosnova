/**
 * Placeholder content for the AI Assistant screen.
 *
 * There is no assistant service behind this yet: the page renders these threads
 * and, when you send a message, replays one of these answers (see
 * `buildDemoTurn` in the page). Keep it here rather than inline in the page so
 * swapping in a real `assistantService` later is a single import change.
 *
 * Copy is English on purpose - the same convention as `mocks/data/*`: demo
 * records are not translated, only the UI chrome is.
 */

export type SourceKind = 'file' | 'record'

export type SourceType = 'contract' | 'invoice' | 'policy' | 'record'

export type AssistantSource = {
  id: string
  /** Drives the badge colour + the action label (open file vs open record). */
  type: SourceType
  kind: SourceKind
  title: string
  /** Where it lives: file path page/section, or the record's table + company. */
  origin: string
  snippet: string
  /** 0-100, rendered as the small bar on the right of the row. */
  relevance: number
}

export type AssistantAnswer = {
  lead: string
  facts: Array<{ label: string; value: string }>
  tail: string
  /** 1-based indexes into `sources`, rendered as the inline citation chips. */
  cites: number[]
  /**
   * Model that produced the answer. Optional on purpose: no model catalogue is
   * wired up yet, and the transcript only shows what it is told. Set it from
   * the real service and the header line switches to `Assistant · <model> · …`.
   */
  model?: string
  trace: { scanned: number; matched: number; seconds: number; /** scope label used for the search, when it was not "everything". */ scope?: string }
}

/**
 * Model picker seam.
 *
 * The composer renders a model button (see AiAssistantPage) but there is no
 * catalogue behind it: whatever the assistant service reports becomes the model
 * label. Wiring it up = own this list, pass it to the button, call the service.
 * Deliberately empty so nothing pretends to be a real model.
 */
export type AssistantModelOption = { id: string; label: string }

export const assistantModels: AssistantModelOption[] = []

/** Which part of the company's indexed sources a question may search. */
export type ScopeId = 'all' | SourceType

export const assistantScopes: ScopeId[] = ['all', 'contract', 'invoice', 'policy', 'record']

export type AssistantTurn = {
  id: string
  question: string
  answer: AssistantAnswer
  sources: AssistantSource[]
}

export type ThreadGroup = 'today' | 'yesterday' | 'earlier'

export type AssistantThread = {
  id: string
  title: string
  group: ThreadGroup
  updated: string
  pinned?: boolean
  turns: AssistantTurn[]
}

const paymentSources: AssistantSource[] = [
  {
    id: 'src-contract-kunzz',
    type: 'contract',
    kind: 'file',
    title: 'KUNZZ master purchase agreement 2026',
    origin: 'Contracts / Procurement · p.4 §3.2 · Acme Retail',
    snippet:
      '“...payment is due within thirty (30) days of invoice receipt (NET 30); overdue amounts accrue interest at 1.5% per month...”',
    relevance: 96,
  },
  {
    id: 'src-invoice-0418',
    type: 'record',
    kind: 'record',
    title: 'INV-2026-0418 · payment terms field',
    origin: 'Invoices · Acme Wholesale · 2026-04-18',
    snippet: 'Payment terms = NET 45 (supplier master data flagged as group exception).',
    relevance: 88,
  },
  {
    id: 'src-policy-exceptions',
    type: 'policy',
    kind: 'file',
    title: 'Group payment-terms exception policy v3',
    origin: 'Policies / Finance · §2 · KUNZZ HOLDINGS',
    snippet:
      'Exception terms require group CFO approval; single-transaction ceiling RM 500,000. Applies to invoices issued after 2026-03-01.',
    relevance: 71,
  },
]

const matchingSources: AssistantSource[] = [
  {
    id: 'src-matching-sop',
    type: 'policy',
    kind: 'file',
    title: 'Three-way match SOP (finance)',
    origin: 'Policies / Finance · §1-3 · Acme Retail',
    snippet:
      'Match against purchase order first, then goods receipt, then supplier invoice. Tolerance: quantity ±2%, unit price ±1%.',
    relevance: 94,
  },
  {
    id: 'src-purchase-order',
    type: 'record',
    kind: 'record',
    title: 'PO-2026-2214 · line-level match result',
    origin: 'Purchase Orders · Acme Retail · 2026-05-02',
    snippet: '12 of 12 lines matched; 1 line price variance 0.8% (within tolerance).',
    relevance: 82,
  },
]

const customerSources: AssistantSource[] = [
  {
    id: 'src-cdp-golden',
    type: 'policy',
    kind: 'file',
    title: 'CDP segment definitions v7',
    origin: 'Policies / Customer · §4 · Acme Retail',
    snippet:
      'Golden customer: ≥ RM 50,000 revenue in trailing 12 months, ≥ 3 orders, no write-off in the last 90 days.',
    relevance: 91,
  },
  {
    id: 'src-customer-360',
    type: 'record',
    kind: 'record',
    title: 'Customer 360 · segment roll-up',
    origin: 'Customer 360 · Acme Retail · refreshed 06:00',
    snippet: '428 customers currently qualify as golden; 61 lost the status this quarter.',
    relevance: 76,
  },
]

const mfaSources: AssistantSource[] = [
  {
    id: 'src-mfa-policy',
    type: 'policy',
    kind: 'file',
    title: 'Identity & access policy · MFA',
    origin: 'Policies / Security · §5 · KUNZZ HOLDINGS',
    snippet: 'MFA is mandatory for any role holding an administrative or finance approval permission.',
    relevance: 93,
  },
  {
    id: 'src-role-matrix',
    type: 'record',
    kind: 'record',
    title: 'Role matrix · permissions with approval scope',
    origin: 'Roles · Acme Retail · 14 roles',
    snippet: '9 of 14 roles carry approval permissions, therefore 9 roles must enforce MFA.',
    relevance: 85,
  },
  {
    id: 'src-users-mfa',
    type: 'record',
    kind: 'record',
    title: 'Directory · MFA enrolment status',
    origin: 'Users · Acme Retail · 61 accounts',
    snippet: '18 accounts hold an affected role; 4 of them have not enrolled yet.',
    relevance: 68,
  },
]

const consolidationSources: AssistantSource[] = [
  {
    id: 'src-consol-scope',
    type: 'policy',
    kind: 'file',
    title: 'Group consolidation manual 2026',
    origin: 'Policies / Finance · §1 · KUNZZ HOLDINGS',
    snippet:
      'All subsidiaries where the group holds > 50% of voting rights are fully consolidated; joint ventures use the equity method.',
    relevance: 90,
  },
  {
    id: 'src-entity-list',
    type: 'record',
    kind: 'record',
    title: 'Legal entity register · ownership %',
    origin: 'Companies · KUNZZ HOLDINGS · 7 entities',
    snippet: '5 entities above the consolidation threshold, 2 equity-method entities.',
    relevance: 79,
  },
]

export const assistantThreads: AssistantThread[] = [
  {
    id: 'thread-net-terms',
    title: 'Are KUNZZ payment terms NET 30 or NET 45?',
    group: 'today',
    updated: '12 min ago',
    pinned: true,
    turns: [
      {
        id: 'turn-net-terms',
        question:
          'Are our payment terms with KUNZZ NET 30 or NET 45, and does the contract list any exceptions?',
        answer: {
          lead:
            'The group **default** is **NET 30**; **KUNZZ HOLDINGS** carries a registered exception of **NET 45**, so the invoice field is not a data error.',
          facts: [
            { label: 'Default terms', value: 'NET 30' },
            { label: 'Group exception', value: 'NET 45' },
            { label: 'Exceptions on file', value: '2 contracts' },
            { label: 'Approval ceiling', value: 'RM 500,000' },
          ],
          tail:
            'Note the exception only applies to invoices issued after 2026-03-01 - the two invoices from January are still NET 30 and are accruing interest.',
          cites: [1, 2, 3],
          trace: { scanned: 1284, matched: 17, seconds: 2.4 },
        },
        sources: paymentSources,
      },
    ],
  },
  {
    id: 'thread-invoice-matching',
    title: 'The three invoice matching rules',
    group: 'today',
    updated: '1 hour ago',
    pinned: true,
    turns: [
      {
        id: 'turn-invoice-matching',
        question: 'What are the three matching rules before an invoice can be approved?',
        answer: {
          lead: 'Approval needs a **three-way match**: purchase order, then goods receipt, then supplier invoice.',
          facts: [
            { label: 'Quantity tolerance', value: '±2%' },
            { label: 'Unit price tolerance', value: '±1%' },
            { label: 'Open variances', value: '1' },
          ],
          tail: 'One line on PO-2026-2214 has a 0.8% price variance, which is inside tolerance and therefore auto-approvable.',
          cites: [1, 2],
          trace: { scanned: 640, matched: 9, seconds: 1.6 },
        },
        sources: matchingSources,
      },
    ],
  },
  {
    id: 'thread-golden-customer',
    title: 'How a golden customer is defined',
    group: 'yesterday',
    updated: 'Yesterday 16:20',
    turns: [
      {
        id: 'turn-golden-customer',
        question: 'What qualifies a customer as golden, and how many do we have?',
        answer: {
          lead: 'A **golden customer** needs trailing-12-month revenue above **RM 50,000**, at least **3 orders**, and no write-off in **90 days**.',
          facts: [
            { label: 'Revenue floor', value: 'RM 50,000' },
            { label: 'Order floor', value: '3' },
            { label: 'Qualifying now', value: '428' },
            { label: 'Lost this quarter', value: '61' },
          ],
          tail: 'Segment roll-up is refreshed daily at 06:00, so today’s approval decisions use the figures above.',
          cites: [1, 2],
          trace: { scanned: 902, matched: 12, seconds: 1.9 },
        },
        sources: customerSources,
      },
    ],
  },
  {
    id: 'thread-mfa-scope',
    title: 'Which roles enforced MFA affects',
    group: 'yesterday',
    updated: 'Yesterday 09:05',
    turns: [
      {
        id: 'turn-mfa-scope',
        question: 'Which roles are affected if we enforce MFA this week?',
        answer: {
          lead: 'Any role holding an **administrative or finance approval permission**, which is **9 of 14 roles** in Acme Retail.',
          facts: [
            { label: 'Affected roles', value: '9 of 14' },
            { label: 'Affected accounts', value: '18' },
            { label: 'Not enrolled', value: '4' },
          ],
          tail: 'The four accounts that have not enrolled would be locked out on enforcement day, so invite them first.',
          cites: [1, 2, 3],
          trace: { scanned: 1176, matched: 21, seconds: 2.8 },
        },
        sources: mfaSources,
      },
    ],
  },
  {
    id: 'thread-consolidation',
    title: 'Consolidation scope for the group',
    group: 'earlier',
    updated: 'Last week',
    turns: [
      {
        id: 'turn-consolidation',
        question: 'Which entities sit inside the consolidation scope this year?',
        answer: {
          lead: 'Entities where the group holds **more than 50%** of voting rights are fully consolidated; the rest use the **equity method**.',
          facts: [
            { label: 'Fully consolidated', value: '5' },
            { label: 'Equity method', value: '2' },
            { label: 'Entities registered', value: '7' },
          ],
          tail: 'Both equity-method entities were re-checked in the 2026 register, so the split is current.',
          cites: [1, 2],
          trace: { scanned: 1480, matched: 14, seconds: 3.1 },
        },
        sources: consolidationSources,
      },
    ],
  },
]

/** Starter prompts shown on the empty state. */
export const assistantSuggestions: string[] = [
  'Which invoices are waiting on goods receipt right now?',
  'Summarise the payment-term exceptions approved this quarter',
  'Which roles can approve a purchase order above RM 100,000?',
]

/**
 * Demo-only question triggers, so every reply state can be reviewed while no
 * assistant service exists. A question containing one of these words produces
 * that state instead of an answer. Delete together with the demo data.
 */
export const demoReplyTriggers = {
  unanswered: ['no answer', 'not found'],
  error: ['network', 'timeout'],
}

export type DemoReplyState = 'answered' | 'unanswered' | 'error'

export function detectDemoReplyState(question: string): DemoReplyState {
  const needle = question.toLowerCase()
  if (demoReplyTriggers.error.some((token) => needle.includes(token))) {
    return 'error'
  }
  if (demoReplyTriggers.unanswered.some((token) => needle.includes(token))) {
    return 'unanswered'
  }
  return 'answered'
}

/** A search that ran and matched nothing - renders as the "no match" reply. */
export function buildUnansweredTurn(
  question: string,
  turnId: string,
  meta?: { model?: string; scope?: string },
): AssistantTurn {
  const template = assistantThreads[0].turns[0]
  return {
    id: turnId,
    question,
    answer: {
      lead: '',
      facts: [],
      tail: '',
      cites: [],
      model: meta?.model,
      trace: { scanned: template.answer.trace.scanned, matched: 0, seconds: 1.7, scope: meta?.scope },
    },
    sources: [],
  }
}

/**
 * Reply replayed for anything you type. Deliberately the same answer as the
 * first demo thread, so the UI states (trace, citations, evidence rail) are all
 * exercised without pretending there is a model behind it yet.
 */
export function buildDemoTurn(
  question: string,
  turnId: string,
  meta?: { model?: string; scope?: string },
): AssistantTurn {
  const template = assistantThreads[0].turns[0]
  return {
    id: turnId,
    question,
    answer: {
      ...template.answer,
      // Undefined until an assistant service reports which model answered.
      model: meta?.model,
      trace: { ...template.answer.trace, scope: meta?.scope },
    },
    sources: template.sources,
  }
}
