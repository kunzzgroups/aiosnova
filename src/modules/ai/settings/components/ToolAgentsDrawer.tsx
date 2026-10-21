import { useEffect, useRef, useState } from 'react'
import { SettingsDrawer as Drawer } from './SettingsDrawer'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import { saveToolAgents } from '../services/toolsService'
import { AgentAssignmentChoice } from '@/modules/ai/shared/AgentAssignmentChoice'
import type { AiTool } from '../types/tools'

export function ToolAgentsDrawer({ tool, onClose, onSaved }: { tool: AiTool; onClose: () => void; onSaved: (tool: AiTool) => void }) {
  const [names, setNames] = useState<string[]>([])
  const [selected, setSelected] = useState(() => new Set(tool.agents))
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const submitting = useRef(false)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    void fetchAgents(tool.companyId).then(({ items }) => {
      if (!cancelled) setNames([...new Set([...items.map(agent => agent.name), ...tool.agents])].sort((a,b) => a.localeCompare(b)))
    }).catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load agents.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tool.companyId, tool.agents, attempt])
  async function save() {
    if (submitting.current || loading) return
    submitting.current = true; setBusy(true); setError(null)
    try { onSaved(await saveToolAgents(tool.companyId, tool.id, [...selected])) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save assignments.') }
    finally { submitting.current = false; setBusy(false) }
  }
  const filtered = names.filter(name => name.toLowerCase().includes(query.trim().toLowerCase()))
  const allFilteredSelected = filtered.length > 0 && filtered.every(name => selected.has(name))
  function toggleFiltered() {
    setSelected(previous => {
      const next = new Set(previous)
      filtered.forEach(name => { if (allFilteredSelected) next.delete(name); else next.add(name) })
      return next
    })
  }
  return <Drawer open className="ai-settings-agents-drawer" title="Manage agents" description={`Choose agents assigned to ${tool.name}.`} closeLabel="Close manage agents" busy={busy} onClose={onClose} footer={<><Button onClick={() => void save()} disabled={busy || loading || !names.length && !!error}>{busy ? 'Saving…' : 'Save'}</Button><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button></>}>
    <div className="ai-settings-agents-controls">
    <TextField type="search" aria-label="Search agents" placeholder="Search agents…" value={query} onChange={event => setQuery(event.target.value)} disabled={busy} />
    <div className="ai-tool-agent-selection"><span className="console-table__muted" aria-live="polite">{selected.size} selected · {filtered.length} results</span><Button variant="secondary" disabled={busy || loading || !filtered.length} onClick={toggleFiltered}>{allFilteredSelected ? 'Deselect all results' : 'Select all results'}</Button></div>
    </div>
    <div className="ai-settings-agents-list" role="region" aria-label="Agent assignments" tabIndex={0}>
    {loading ? <p role="status">Loading agents…</p> : <div className="ai-tool-agent-choices">{filtered.map(name => <AgentAssignmentChoice key={name} name={name} checked={selected.has(name)} disabled={busy} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(name)) next.delete(name); else next.add(name); return next })} />)}{!filtered.length ? <p>{names.length ? 'No matching agents.' : 'No agents exist in this company yet. Create an agent before assigning this tool.'}</p> : null}</div>}
    </div>
    {error ? <div role="alert" className="ai-settings-agents-feedback"><p className="ai-settings-tool-error">{error}</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)} disabled={busy}>Retry loading agents</Button></div> : null}
  </Drawer>
}
