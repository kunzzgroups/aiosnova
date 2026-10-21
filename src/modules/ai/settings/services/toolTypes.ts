import type { ToolModule, ToolRisk } from '../types/tools'

type ToolType = { action: string; label: string; module: ToolModule; risk: ToolRisk }

export const TOOL_TYPES: ToolType[] = [
  { action: 'web.search', label: 'Web Search', module: 'Retrieval', risk: 'low' },
  { action: 'knowledge.search', label: 'Knowledge Search', module: 'Retrieval', risk: 'low' },
  { action: 'calc.run', label: 'Calculator', module: 'Utility', risk: 'low' },
  { action: 'http.request', label: 'HTTP Request', module: 'Utility', risk: 'medium' },
  { action: 'sql.query', label: 'SQL Query', module: 'Data', risk: 'high' },
  { action: 'csv.export', label: 'CSV Export', module: 'Data', risk: 'medium' },
  { action: 'file.read', label: 'File Read', module: 'Files', risk: 'low' },
  { action: 'file.write', label: 'File Write', module: 'Files', risk: 'high' },
  { action: 'document.extract', label: 'Document Extract', module: 'Files', risk: 'low' },
  { action: 'text.translate', label: 'Translate', module: 'Utility', risk: 'low' },
  { action: 'calendar.read', label: 'Calendar Read', module: 'Communication', risk: 'medium' },
  { action: 'email.send', label: 'Send Email', module: 'Communication', risk: 'high' },
]

export function toolTypeDescription(action: string): string {
  return ({
    'web.search': 'Search the web. Set result limits, allowed domains and search depth.',
    'knowledge.search': 'Search knowledge bases. Set result limits, relevance and source citations.',
    'calc.run': 'Run calculations. No additional action settings are needed.',
    'http.request': 'Call an HTTP API. Set the base URL, allowed methods and response size.',
    'sql.query': 'Query a database. Set the connection name, read-only access and row limit.',
    'csv.export': 'Export CSV data. Choose the delimiter, header row and encoding.',
    'file.read': 'Read files. Set allowed extensions and maximum file size.',
    'file.write': 'Write files. Set the target directory and overwrite policy.',
    'document.extract': 'Extract document content. Set languages and output format.',
    'text.translate': 'Translate text. Choose the target language and formality.',
    'calendar.read': 'Read calendar events. Set the time zone and how many days ahead to include.',
    'email.send': 'Send email. Set the sender, external recipient policy and subject prefix.',
  } as Record<string, string>)[action] ?? 'Use the action identifier and JSON required by your custom integration.'
}
