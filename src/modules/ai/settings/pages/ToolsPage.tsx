import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDisabledSelection } from '../hooks/useDisabledSelection'
import { Button } from '@/components/ui/Button'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { ModelsPagination as SettingsPagination } from '../components/ModelsPagination'
import { TextField } from '@/components/ui/TextField'
import { RowMenu } from '@/components/ui/RowMenu'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconPlus, IconSpark, IconTrash } from '@/components/icons/Icons'
import { useCompanyStore } from '@/stores/companyStore'
import { AiSettingsShell } from '../components/AiSettingsShell'
import { ToolDrawer } from '../components/ToolDrawer'
import { ToolActionDialog, ToolRisk, ToolStatus, type ToolAction } from '../components/ToolControls'
import { useSettingsPagination } from '../hooks/useSettingsPagination'
import { fetchTools, deleteTools } from '../services/toolsService'
import { TOOL_MODULES, type AiTool } from '../types/tools'
import '@/modules/ai/shared/AiConsole.css'
import './AiSettingsPage.css'
import './AiSettingsDirectory.css'
import './ToolsPage.css'

export function ToolsPage() {
  const companyId = useCompanyStore(state => state.companyId)
  return <ToolsList key={companyId} companyId={companyId} />
}
function ToolsList({ companyId }: { companyId: string }) {
  const navigate = useNavigate()
  const [pendingBulk, setPendingBulk] = useState<string[]>([])
  const [removing, setRemoving] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const [tools, setTools] = useState<AiTool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [module, setModule] = useState('all')
  const [status, setStatus] = useState('all')
  const [risk, setRisk] = useState('all')
  const [editor, setEditor] = useState<{ tool: AiTool | null } | null>(null)
  const [action, setAction] = useState<ToolAction | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setTools(await fetchTools(companyId)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load tools.'); setTools([]) }
    finally { setLoading(false) }
  }, [companyId])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => tools.filter(tool => (module === 'all' || tool.module === module) && (status === 'all' || tool.status === status) && (risk === 'all' || tool.risk === risk) && (!query.trim() || [tool.name, tool.action, tool.description].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))).sort((a,b) => a.name.localeCompare(b.name)), [tools, module, status, risk, query])
  const { tableRef, rows, pagination } = useSettingsPagination(filtered, loading, JSON.stringify([query, module, status, risk]), {fitCompletePages:true})
  const selection = useDisabledSelection(filtered, rows, status, JSON.stringify([query, module, risk]), companyId)
  const bulkTools = tools.filter(tool => pendingBulk.includes(tool.id))
  async function removeSelectedTools() {
    if (submittingRef.current || pendingBulk.length < 2 || useCompanyStore.getState().companyId !== companyId) return
    submittingRef.current = true
    setRemoving(true); setBulkError(null)
    try {
      await deleteTools(companyId, pendingBulk)
      if (useCompanyStore.getState().companyId !== companyId) return
      const deleted = new Set(pendingBulk)
      setTools(current => current.filter(tool => !deleted.has(tool.id)))
      selection.clear(); setPendingBulk([]); setMessage('Removed ' + deleted.size + ' tools successfully.')
    } catch (caught) { if (useCompanyStore.getState().companyId === companyId) setBulkError(caught instanceof Error ? caught.message : 'Unable to remove tools.') }
    finally { submittingRef.current = false; setRemoving(false) }
  }
  const clearFilters = () => { setQuery(''); setModule('all'); setStatus('all'); setRisk('all') }
  return <AiSettingsShell>
    <FlashToasts message={message} onClearMessage={() => setMessage(null)} />
    <div className="console-page console-page--internal-table-scroll ai-settings-tools-page">
      <TablePanel>
        <TableToolbar search={<TextField className="ui-table-toolbar__search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tools…" aria-label="Search tools" />} filters={<>
          <SidebarSelect id="tools-module-filter" label="Tool module" hideLabel value={module} options={[{value:'all',label:'All modules'}, ...TOOL_MODULES.map(value => ({value,label:value}))]} onChange={setModule} />
          <SidebarSelect id="tools-status-filter" label="Tool status" hideLabel value={status} options={[{value:'all',label:'All status'},{value:'active',label:'Active'},{value:'disabled',label:'Disabled'},{value:'error',label:'Error'}]} onChange={setStatus} />
          <SidebarSelect id="tools-risk-filter" label="Tool risk" hideLabel value={risk} options={[{value:'all',label:'All risk'},{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'}]} onChange={setRisk} />
        </>} actions={<>{selection.selected.length > 1 ? <Button variant="danger" disabled={removing || loading} onClick={() => { setBulkError(null); setPendingBulk(selection.selected.map(tool => tool.id)) }}><IconTrash aria-hidden="true"/>Remove</Button> : null}<Button onClick={() => setEditor({tool:null})} disabled={!companyId || removing}><IconPlus/>Add Tool</Button></>}/>
        {loading ? <div className="ai-settings-tools-empty" role="status">Loading tools…</div> : error ? <div className="ai-settings-tools-empty" role="alert"><p>{error}</p><Button variant="secondary" onClick={() => void load()}>Retry</Button></div> : !filtered.length ? <div className="ai-settings-tools-empty"><strong>{tools.length ? 'No tools match your filters' : 'No tools yet'}</strong><p>{tools.length ? 'Try another search or clear the filters.' : 'Add a tool to make an action available to your agents.'}</p>{tools.length ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : <Button onClick={() => setEditor({tool:null})} disabled={!companyId}>Add Tool</Button>}</div> : <div className="console-table-wrap" ref={tableRef}>
          <table className="console-table console-table--fixed ai-settings-tool-table"><colgroup><col style={{width:'23%'}}/><col style={{width:'14%'}}/><col/><col style={{width:'10%'}}/><col style={{width:'12%'}}/><col style={{width:'12%'}}/><col style={{width:'7rem'}}/></colgroup><thead><tr><th><span className="ai-settings-selection-name">{selection.enabled ? <input ref={selection.selectAllRef} type="checkbox" className="ai-settings-selection-checkbox" aria-label="Select all tools on this page" disabled={removing || !selection.hasSelectablePage} checked={selection.allSelected} onChange={event => selection.togglePage(event.target.checked)} /> : null}Name</span></th><th>Module</th><th>Action</th><th>Risk</th><th>Status</th><th>Used by</th><th className="console-table__actions">Actions</th></tr></thead><tbody>{rows.map(tool => <tr key={tool.id}>
            <td><span className="ai-settings-tool-name-cell">{selection.enabled ? <input type="checkbox" className="ai-settings-selection-checkbox" aria-label={'Select ' + tool.name} disabled={removing} checked={selection.ids.includes(tool.id)} onChange={event => selection.toggle(tool.id, event.target.checked)} /> : null}<span className="ai-settings-provider-mark" aria-hidden="true"><IconSpark /></span><Link className="ai-settings-tool-name" to={'/ai/ai/ai-settings/tools/' + tool.id}>{tool.name}</Link></span></td><td>{tool.module}</td><td title={tool.action}><code>{tool.action}</code></td><td><ToolRisk risk={tool.risk}/></td><td><ToolStatus status={tool.status}/></td><td>{tool.agents.length ? tool.agents.length + (tool.agents.length === 1 ? ' agent' : ' agents') : '—'}</td>
            <td className="console-table__actions"><RowMenu disabled={removing} label={'Actions for ' + tool.name} items={[{id:'detail',label:'View details',onSelect:() => navigate('/ai/ai/ai-settings/tools/' + tool.id)}, {id:'edit',label:'Edit tool',onSelect:() => setEditor({tool})}, {id:'toggle',label:tool.status === 'disabled' ? 'Enable tool' : 'Disable tool',onSelect:() => setAction({tool,kind:'toggle'})}, ...(tool.status === 'disabled' ? [{id:'delete',label:'Delete tool',destructive:true,onSelect:() => setAction({tool,kind:'delete'})}] : [])]}/></td>
          </tr>)}</tbody></table>
        </div>}
        <SettingsPagination id="tools-pagination" pagesLabel="Tool pages" {...pagination}/>
      </TablePanel>
    </div>
    <ConfirmDialog open={pendingBulk.length > 0} variant="deletion" className="ai-settings-delete-dialog" title={'Remove ' + bulkTools.length + ' tools?'} description={<div className="ai-settings-bulk-delete-copy"><p>The selected tool configurations will be permanently removed.</p><ul className="ai-settings-bulk-delete-list">{bulkTools.map(tool => <li key={tool.id}>{tool.name}</li>)}</ul></div>} warning="This cannot be undone." error={bulkError} busy={removing} confirmDisabled={bulkTools.length < 2 || bulkTools.length !== pendingBulk.length || bulkTools.some(tool => tool.status !== 'disabled')} confirmLabel="Remove" cancelLabel="Cancel" busyLabel="Removing…" onConfirm={removeSelectedTools} onCancel={() => { if (!removing) { setPendingBulk([]); setBulkError(null) } }}/>
    {editor ? <ToolDrawer key={editor.tool?.id ?? 'new'} companyId={companyId} tool={editor.tool} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setMessage('Tool saved successfully.'); void load() }}/>:null}
    {action ? <ToolActionDialog key={action.tool.id + action.kind} action={action} companyId={companyId} onClose={() => setAction(null)} onDone={deleted => { setAction(null); setMessage(deleted ? 'Tool deleted successfully.' : 'Tool status updated.'); void load() }}/>:null}
  </AiSettingsShell>
}
