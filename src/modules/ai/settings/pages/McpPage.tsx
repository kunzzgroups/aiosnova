import type { MockConnectionOutcome } from '../types/connection'
import { useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCompanyStore } from '@/stores/companyStore'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { IconInfo, IconPencil, IconPlus, IconPower, IconRefresh, IconTrash } from '@/components/icons/Icons'
import { Popover } from '@/components/ui/Popover'
import { SettingsDrawer as Drawer } from '../components/SettingsDrawer'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { AiSettingsShell } from '../components/AiSettingsShell'
import { McpAccessDrawer, McpEditor } from '../components/McpDrawers'
import { McpConnectionCheck } from '../components/McpConnectionCheck'
import { connectionStatusLabel } from '../services/connectionPresentation'
import { useDisabledSelection } from '../hooks/useDisabledSelection'
import { refreshMcpCapabilities, removeMcpServers, testMcpServer, toggleMcpServer, type McpServer } from '../services/mcpService'
import { fetchMcpServers, MCP_READ_ONLY } from '../services/mcpApiService'
import '@/modules/ai/shared/AiConsole.css'
import './AiSettingsPage.css'
import './ProvidersPage.css'
import './McpPage.css'

const date=(value:string|null)=>value?new Date(value).toLocaleString():'—'
function Status({status}:{status:string}){return <span className={'console-status console-status--'+status}>{connectionStatusLabel(status)}</span>}
export function McpPage(){const companyId=useCompanyStore(s=>s.companyId);return <McpWorkspace key={companyId} companyId={companyId}/>}
function McpWorkspace({companyId}:{companyId:string}) {
  const [searchParams]=useSearchParams()
  const targetServer=searchParams.get('companyId')===companyId?searchParams.get('serverId'):null
  const targetRef=useRef(targetServer);targetRef.current=targetServer
  const [servers,setServers]=useState<McpServer[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null),[attempt,setAttempt]=useState(0)
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[selectedId,setSelectedId]=useState(''),[editor,setEditor]=useState<{server:McpServer|null}|null>(null),[drawer,setDrawer]=useState<'access'|'activity'|null>(null),[busy,setBusy]=useState(false)
  const [checkingId,setCheckingId]=useState<string|null>(null),[checkErrors,setCheckErrors]=useState<Record<string,string>>({})
  const [pending,setPending]=useState<{kind:'toggle'|'delete';ids:string[]}|null>(null),[actionError,setActionError]=useState<string|null>(null)
  const working=useRef(false),mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{let active=true;setLoading(true);setError(null);void fetchMcpServers(companyId).then(items=>{if(active){setServers(items);setSelectedId(items.find(item=>item.id===targetRef.current)?.id??items[0]?.id??'')}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load MCP servers.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[companyId,attempt])
  useEffect(()=>{if(targetServer){setSelectedId(targetServer);setQuery('');setStatus('all');setDrawer(null)}},[targetServer])
  const filtered=useMemo(()=>servers.filter(s=>(status==='all'||s.status===status)&&s.name.toLowerCase().includes(query.trim().toLowerCase())),[servers,query,status])
  const selection=useDisabledSelection(filtered,filtered,status,query,companyId)
  const selected=filtered.find(s=>s.id===selectedId)??filtered[0]
  const update=(saved:McpServer)=>{if(!mounted.current)return;setServers(items=>items.some(s=>s.id===saved.id)?items.map(s=>s.id===saved.id?saved:s):[...items,saved]);setSelectedId(saved.id)}
  async function operation(fn:()=>Promise<McpServer>,notice:string){if(MCP_READ_ONLY||working.current)return;working.current=true;setBusy(true);setError(null);try{update(await fn());if(mounted.current)setMessage(notice)}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Unable to update connection.')}finally{working.current=false;if(mounted.current)setBusy(false)}}
  async function confirm(){if(MCP_READ_ONLY||!pending||working.current)return;working.current=true;setBusy(true);setActionError(null);try{if(pending.kind==='delete'){await removeMcpServers(companyId,pending.ids);if(mounted.current){setServers(items=>items.filter(s=>!pending.ids.includes(s.id)));selection.clear();setMessage('MCP connections removed.')}}else update(await toggleMcpServer(companyId,pending.ids[0]));if(mounted.current)setPending(null)}catch(e){if(mounted.current)setActionError(e instanceof Error?e.message:'Unable to update connection.')}finally{working.current=false;if(mounted.current)setBusy(false)}}
  async function checkConnection(server:McpServer,outcome:MockConnectionOutcome){
    if(MCP_READ_ONLY||working.current)return
    working.current=true;setBusy(true);setCheckingId(server.id)
    setCheckErrors(previous=>{const next={...previous};delete next[server.id];return next})
    try{update(await testMcpServer(companyId,server.id,outcome))}
    catch(caught){if(mounted.current)setCheckErrors(previous=>({...previous,[server.id]:caught instanceof Error?caught.message:'Unable to record simulated check.'}))}
    finally{working.current=false;if(mounted.current){setBusy(false);setCheckingId(null)}}
  }
  function request(kind:'toggle'|'delete',ids:string[]){if(MCP_READ_ONLY)return;setActionError(null);setPending({kind,ids})}
  return <AiSettingsShell><FlashToasts message={message} onClearMessage={()=>setMessage(null)}/><div className="ai-mcp-page"><TablePanel>
    <TableToolbar search={<TextField type="search" className="ui-table-toolbar__search" aria-label="Search MCP servers" placeholder="Search servers…" value={query} onChange={e=>setQuery(e.target.value)}/>} filters={<SidebarSelect id="mcp-status-filter" label="Status" hideLabel value={status} options={[{value:'all',label:'All status'},{value:'connected',label:'Connected'},{value:'error',label:'Error'},{value:'not_verified',label:'Not verified'},{value:'disabled',label:'Disabled'}]} onChange={setStatus}/>} actions={<>{selection.selected.length?<Button variant="danger" disabled={busy||MCP_READ_ONLY} onClick={()=>request('delete',selection.selected.map(s=>s.id))}><IconTrash/>Remove ({selection.selected.length})</Button>:null}<Button disabled={busy||MCP_READ_ONLY} onClick={()=>setEditor({server:null})}><IconPlus/>Add MCP</Button></>}/>
    {error?<div className="ai-mcp-notice" role="alert">{error}<Button variant="secondary" disabled={busy} onClick={()=>setAttempt(v=>v+1)}>Retry</Button></div>:null}
    <div className="ai-mcp-workspace">
      <aside className="ai-mcp-list-column" aria-label="MCP servers">
        {selection.enabled?<label className="ai-provider-select-all"><input type="checkbox" ref={selection.selectAllRef} checked={selection.allSelected} disabled={busy||MCP_READ_ONLY||!selection.hasSelectablePage} onChange={e=>selection.togglePage(e.target.checked)}/>Select all results</label>:null}
        <div className="ai-provider-list">{loading?<p role="status">Loading MCP servers…</p>:filtered.map(s=><div key={s.id} className={'ai-provider-card'+(selected?.id===s.id?' is-selected':'')}>{selection.enabled?<input type="checkbox" aria-label={'Select '+s.name} checked={selection.ids.includes(s.id)} disabled={busy||MCP_READ_ONLY} onChange={e=>selection.toggle(s.id,e.target.checked)}/>:null}<button className="ai-provider-card-select" aria-pressed={selected?.id===s.id} onClick={()=>{setSelectedId(s.id);setDrawer(null)}}><span className="ai-mcp-mark" aria-hidden="true">{s.name.slice(0,2).toUpperCase()}</span><span className="ai-provider-card-name"><strong>{s.name}</strong><small>{s.auth} · {s.capabilities.length} capabilities</small><Status status={s.status}/></span><span className="ai-provider-card-chevron" aria-hidden="true">›</span></button></div>)}{!loading&&!filtered.length?<p>No matching servers.</p>:null}</div>
      </aside>
      {selected?<section className="ai-mcp-detail" aria-label={selected.name}>
        <header className="ai-mcp-identity"><span className="ai-mcp-mark" aria-hidden="true">{selected.name.slice(0,2).toUpperCase()}</span><div className="ai-mcp-name-group"><h2 title={selected.name}>{selected.name}</h2><Popover label={'Connection details for '+selected.name} trigger={<IconInfo/>}><p>{selected.description}</p><dl className="ai-mcp-info"><dt>Server URL</dt><dd>{selected.url}</dd><dt>Authentication</dt><dd>{selected.auth}</dd><dt>Last checked</dt><dd>{date(selected.checkedAt)}</dd><dt>Last connected</dt><dd>{date(selected.connectedAt)}</dd><dt>Mode</dt><dd>Local backend · read only</dd><dt>Permissions · Read only</dt><dd>{selected.permissions.join(' · ')||'Permissions are not connected yet.'}</dd></dl></Popover></div>
          <div className="ai-mcp-actions"><Status status={selected.status}/>{selected.status==='disabled'?<IconButton label="Delete MCP" variant="danger" disabled={busy||MCP_READ_ONLY} onClick={()=>request('delete',[selected.id])}><IconTrash/></IconButton>:<IconButton label="Edit MCP" disabled={busy||MCP_READ_ONLY} onClick={()=>setEditor({server:selected})}><IconPencil/></IconButton>}<IconButton label={selected.status==='disabled'?'Enable MCP':'Disable MCP'} disabled={busy||MCP_READ_ONLY} onClick={()=>request('toggle',[selected.id])}><IconPower/></IconButton></div>
        </header>
        <dl className="ai-mcp-health"><div><dt>Status</dt><dd>{connectionStatusLabel(selected.status)}</dd></div><div><dt>Latency</dt><dd>{selected.latency===null?'—':selected.latency+' ms'}</dd></div><div><dt>Errors</dt><dd>{selected.dataSource==='database'||selected.status==='disabled'||selected.status==='not_verified'?'—':selected.errors}</dd></div><div><dt>Capabilities</dt><dd>{selected.capabilities.length}</dd></div></dl>
        <McpConnectionCheck key={selected.id} server={selected} busy={busy} checking={checkingId===selected.id} error={checkErrors[selected.id]} onCheck={outcome=>void checkConnection(selected,outcome)}/>
        <p className="ai-mcp-muted">{selected.status==='disabled'?'This connection is disabled. Saved configuration and tools remain visible.':'Showing saved MCP configuration and tool definitions.'}</p>
        <div className="ai-mcp-detail-grid">
          <section className="ai-mcp-card ai-mcp-capabilities"><header><h3>Capabilities</h3><IconButton label="Refresh capabilities" disabled={busy||MCP_READ_ONLY||selected.status==='disabled'} onClick={()=>void operation(()=>refreshMcpCapabilities(companyId,selected.id),'Capability list refreshed.')}><IconRefresh/></IconButton></header><div className="ai-mcp-card-body">{selected.capabilities.map(cap=><div className="ai-mcp-capability" key={cap.name}><code>{cap.name}</code><Status status={selected.status==='disabled'||!cap.enabled?'disabled':'enabled'}/></div>)}{!selected.capabilities.length?<p>No saved tools in this server catalog.</p>:null}</div></section>
          <section className="ai-mcp-card"><header><h3>Assigned Agents</h3><Button variant="secondary" disabled={busy||MCP_READ_ONLY} onClick={()=>setDrawer('access')}>Manage agents</Button></header><div className="ai-mcp-card-body ai-mcp-access-summary">
            <section aria-label="Assigned agents"><div className="ai-mcp-agents-grid">{selected.agents.map(name=><div className="ai-mcp-agent" key={name}><span className="ai-mcp-avatar" aria-hidden="true">{name.split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span><span>{name}</span></div>)}</div>{!selected.agents.length?<p className="ai-mcp-muted">Agent assignments are not connected yet.</p>:null}</section>
          </div></section>
          <section className="ai-mcp-card"><header><h3>Recent Activity</h3><Button variant="secondary" onClick={()=>setDrawer('activity')}>View recent</Button></header><div className="ai-mcp-card-body"><McpActivity server={selected} limit={5}/></div></section>
        </div>
      </section>:<div className="ai-mcp-empty">{loading?'Loading connection details…':'Select or add an MCP server.'}</div>}
    </div>
  </TablePanel></div>
  {!MCP_READ_ONLY&&editor?<McpEditor companyId={companyId} server={editor.server} onClose={()=>setEditor(null)} onSaved={saved=>{update(saved);setEditor(null);setMessage('MCP configuration saved.')}}/>:null}
  {!MCP_READ_ONLY&&drawer==='access'&&selected?<McpAccessDrawer key={selected.id} server={selected} onClose={()=>setDrawer(null)} onSaved={saved=>{update(saved);setDrawer(null);setMessage('Agent access updated.')}}/>:null}
  <Drawer open={drawer==='activity'&&!!selected} title="Recent Activity" closeLabel="Close activity" onClose={()=>setDrawer(null)}>{selected?<McpActivity server={selected}/>:null}</Drawer>
  <ConfirmDialog open={!MCP_READ_ONLY&&!!pending} title={pending?.kind==='delete'?'Remove MCP connections?':selected?.status==='disabled'?'Enable MCP connection?':'Disable MCP connection?'} description={pending?.kind==='delete'?'Remove the selected disabled connections and their local access assignments.':'Change whether this connection is available. Enabling does not verify connection health.'} confirmLabel={pending?.kind==='delete'?'Remove':selected?.status==='disabled'?'Enable':'Disable'} cancelLabel="Cancel" error={actionError} busy={busy} onConfirm={()=>void confirm()} onCancel={()=>{if(!busy)setPending(null)}}/>
  </AiSettingsShell>
}
function McpActivity({server,limit}:{server:McpServer;limit?:number}){if(server.dataSource==='database'&&!server.activity.length)return <p className="ai-mcp-muted">Activity is not connected yet.</p>;return <ul className="ai-mcp-activity">{server.activity.slice(0,limit).map(event=><li key={event.id}><span>{event.message}</span><time dateTime={event.time}>{date(event.time)}</time></li>)}</ul>}
