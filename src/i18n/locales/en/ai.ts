export const ai: Record<string, string> = {
  // AI Assistant screen
  'ai.assistant.history': 'Chats',
  'ai.assistant.closePanels': 'Close side panels',
  'ai.assistant.showHistory': 'Show chats panel',
  'ai.assistant.hideHistory': 'Hide chats panel',
  'ai.assistant.showEvidence': 'Show evidence panel',
  'ai.assistant.hideEvidence': 'Hide evidence panel',
  'ai.assistant.newThread': 'New chat',
  'ai.assistant.newThreadTitle': 'New chat',
  'ai.assistant.searchThreads': 'Search chats',
  'ai.assistant.pinned': 'Pinned',
  'ai.assistant.justNow': 'just now',
  'ai.assistant.noThreads': 'No chats yet',
  'ai.assistant.noMatches': 'No chats match that search.',

  'ai.assistant.scope': 'Scope',
  'ai.assistant.scopeNote': 'Answers only use {{company}} sources. Switch company from GROUP COMPANIES.',
  'ai.assistant.byAssistant': 'Assistant · {{count}} sources',
  'ai.assistant.evidence': 'Evidence',
  'ai.assistant.evidenceCount': '{{count}} sources',
  'ai.assistant.evidenceEmpty': 'Sources behind an answer appear here.',
  // Shown when the evidence rail follows the reader to an older answer.
  'ai.assistant.evidenceEarlier': 'Earlier answer: {{question}}',
  'ai.assistant.backToLatest': 'Back to latest',
  'ai.assistant.openAll': 'Expand all',
  'ai.assistant.closeAll': 'Collapse all',
  'ai.assistant.relevance': 'Relevance {{percent}}%',
  'ai.assistant.openSource': 'Open source {{index}}',

  'ai.assistant.typeContract': 'Contract',
  'ai.assistant.typeInvoice': 'Invoice',
  'ai.assistant.typePolicy': 'Policy',
  'ai.assistant.typeRecord': 'Record',
  'ai.assistant.openFile': 'Open file',
  'ai.assistant.openRecord': 'Open record',
  'ai.assistant.notWired': 'Not connected yet',

  'ai.assistant.tracePending': 'Searching your sources…',
  'ai.assistant.stop': 'Stop generating',
  'ai.assistant.stopped': 'Generation stopped',
  'ai.assistant.retry': 'Retry',

  // No-match reply: the search ran, the sources had nothing.
  'ai.assistant.notFoundTitle': 'No match in the selected sources',
  'ai.assistant.notFoundBody':
    'Searched {{count}} passages in {{scope}} and found nothing relevant. Try different wording, or widen the source scope.',
  'ai.assistant.notFoundHintScope': 'Widen the source scope',
  'ai.assistant.notFoundHintRephrase': 'Rephrase using a document or record name',

  // Request failed before an answer existed.
  'ai.assistant.errorTitle': 'Could not reach the assistant',
  'ai.assistant.errorBody': 'The request failed before an answer was produced. Nothing was changed.',

  // Screen-reader announcements (visually hidden live region).
  'ai.assistant.liveSearching': 'Searching your sources',
  'ai.assistant.liveAnswered': 'Answer ready, {{count}} sources',
  'ai.assistant.liveStopped': 'Generation stopped',
  'ai.assistant.liveError': 'The request failed',
  'ai.assistant.liveNotFound': 'Answer ready, no matching sources',
  'ai.assistant.traceScanned': 'Scanned {{count}}',
  'ai.assistant.traceMatched': 'matched {{count}}',
  'ai.assistant.traceCited': 'cited {{count}}',
  'ai.assistant.traceSeconds': '{{count}}s',

  // Placeholder label for the model button; no catalogue is wired up yet.
  'ai.assistant.model': 'Model',
  'ai.assistant.sourcesScope': 'Sources to search',
  'ai.assistant.scopeAll': 'All sources',
  'ai.assistant.traceScope': 'in {{scope}}',
  'ai.assistant.copy': 'Copy',
  'ai.assistant.copied': 'Copied',
  'ai.assistant.regenerate': 'Regenerate',
  'ai.assistant.helpful': 'Helpful',
  'ai.assistant.notHelpful': 'Not helpful',
  // Used once the assistant service reports which model answered.
  'ai.assistant.byAssistantModel': 'Assistant · {{model}} · {{count}} sources',

  'ai.assistant.composerPlaceholder': 'Ask a follow-up, or paste an invoice or contract number…',
  'ai.assistant.attach': 'Attach',
  'ai.assistant.send': 'Send',

  'ai.assistant.emptyTitle': 'Ask about contracts, invoices, policies or people',
  'ai.assistant.emptyHint':
    'Every answer cites the company, the file or record, and the section it came from.',

  // No assistant service is wired up yet, so nothing is invented in its place.
  'ai.assistant.notConnectedTitle': 'Assistant service not connected',
  'ai.assistant.notConnectedBody':
    'The screen is ready - once a service answers, this is where the cited reply appears.',
  'ai.assistant.liveNotConnected': 'No assistant service connected',
}
