import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SettingsDrawer as Drawer } from './SettingsDrawer'
import { SettingsEditor, SettingsEditorSection } from './SettingsEditor'
import { IconSettings, IconShieldCheck, IconSpark } from '@/components/icons/Icons'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { AgentAssignmentChoice } from '@/modules/ai/shared/AgentAssignmentChoice'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import { saveMcpAccess, saveMcpServer, type McpServer } from '../services/mcpService'

export function McpEditor({companyId,server,onClose,onSaved}:{companyId:string;server:McpServer|null;onClose:()=>void;onSaved:(server:McpServer)=>void}) {
  const [name,setName]=useState(server?.name??''),[url,setUrl]=useState(server?.url??''),[auth,setAuth]=useState<McpServer['auth']>(server?.auth??'OAuth')
  const [clientId,setClientId]=useState(server?.clientId??''),[secret,setSecret]=useState(server?.secret??''),[enabled,setEnabled]=useState(server?server.status!=='disabled':true),[description,setDescription]=useState(server?.description??'')
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[selectOpen,setSelectOpen]=useState(false)
  const submitting=useRef(false)
  async function submit(event:FormEvent){event.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError(null);try{onSaved(await saveMcpServer(companyId,{name,url,auth,clientId,secret,enabled,description},server?.id))}catch(e){setError(e instanceof Error?e.message:'Unable to save MCP server.')}finally{submitting.current=false;setBusy(false)}}
  return <SettingsEditor open title={server?'Edit MCP Server':'Add MCP Server'} description="Local demo configuration. Live MCP transport is not connected." closeLabel="Close MCP editor" onClose={onClose} busy={busy} footer={<><Button type="submit" form="mcp-editor" disabled={busy}>{busy?'Saving…':'Save'}</Button><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button></>}>
    <form id="mcp-editor" className="ai-settings-form" onSubmit={event=>void submit(event)} onKeyDownCapture={event=>{if(event.key==='Escape'&&selectOpen){event.preventDefault();event.stopPropagation();setSelectOpen(false)}}}>
      <SettingsEditorSection title="Basic Information" icon={<IconSpark />}>
      <FormField label="Server name" htmlFor="mcp-name"><TextField id="mcp-name" value={name} onChange={e=>setName(e.target.value)} required disabled={busy} autoFocus /></FormField>
      <FormField label="Description" htmlFor="mcp-description"><TextField id="mcp-description" value={description} onChange={e=>setDescription(e.target.value)} disabled={busy} /></FormField>
      </SettingsEditorSection>
      <SettingsEditorSection title="Connection" icon={<IconSettings />}>
      <FormField label="Server URL" htmlFor="mcp-url"><TextField id="mcp-url" type="url" value={url} onChange={e=>setUrl(e.target.value)} required disabled={busy} /></FormField>
      <FormField label="Authentication" htmlFor="mcp-auth"><SidebarSelect menuPortal id="mcp-auth" label="Authentication" hideLabel options={['OAuth','API Key','None']} value={auth} onChange={value=>setAuth(value as McpServer['auth'])} disabled={busy} open={selectOpen} onOpenChange={setSelectOpen} /></FormField>
      {auth==='OAuth'?<FormField label="Client ID" htmlFor="mcp-client"><TextField id="mcp-client" value={clientId} onChange={e=>setClientId(e.target.value)} disabled={busy} /></FormField>:null}
      {auth!=='None'?<FormField label={auth==='OAuth'?'Client secret':'API key'} htmlFor="mcp-secret"><TextField id="mcp-secret" type="password" autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)} disabled={busy} /></FormField>:null}
      </SettingsEditorSection>
      <SettingsEditorSection title="Availability" icon={<IconShieldCheck />}>
      <label className="ai-mcp-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={busy} />Enabled</label>
      </SettingsEditorSection>
      {error?<p role="alert" className="ai-mcp-error">{error}</p>:null}
    </form>
  </SettingsEditor>
}

export function McpAccessDrawer({server,onClose,onSaved}:{server:McpServer;onClose:()=>void;onSaved:(server:McpServer)=>void}) {
  const [names,setNames]=useState<string[]>([]),[selected,setSelected]=useState(()=>new Set(server.agents)),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0)
  const submitting=useRef(false)
  useEffect(()=>{let active=true;setLoading(true);setError(null);void fetchAgents(server.companyId).then(({items})=>{if(active)setNames([...new Set([...items.map(a=>a.name),...server.agents])].sort())}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load agents.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[server.companyId,server.agents,attempt])
  const filtered=names.filter(n=>n.toLowerCase().includes(query.trim().toLowerCase())),all=filtered.length>0&&filtered.every(n=>selected.has(n))
  async function save(){if(submitting.current||loading)return;submitting.current=true;setBusy(true);setError(null);try{onSaved(await saveMcpAccess(server.companyId,server.id,[...selected]))}catch(e){setError(e instanceof Error?e.message:'Unable to save access.')}finally{submitting.current=false;setBusy(false)}}
  return <Drawer open className="ai-mcp-access-drawer" title="Manage agents" description={server.name} closeLabel="Close manage agents" busy={busy} onClose={onClose} footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button onClick={()=>void save()} disabled={busy||loading||!!error}>{busy?'Saving…':'Save'}</Button></>}>
    <div className="ai-mcp-access-controls">
    <div className="ai-mcp-access-heading"><h3>Agents</h3><span>{server.agents.length} assigned</span></div>
    <TextField type="search" aria-label="Search agents" placeholder="Search agents…" value={query} onChange={e=>setQuery(e.target.value)} disabled={busy}/>
    <div className="ai-tool-agent-selection"><span>{selected.size} selected</span><Button variant="secondary" disabled={busy||loading||!filtered.length} onClick={()=>setSelected(previous=>{const next=new Set(previous);filtered.forEach(n=>{if(all)next.delete(n);else next.add(n)});return next})}>{all?'Deselect all results':'Select all results'}</Button></div>
    </div>
    <div className="ai-mcp-access-list" role="region" aria-label="Agent assignments" tabIndex={0}>
    {loading?<p role="status">Loading agents…</p>:<div className="ai-tool-agent-choices">{filtered.map(name=><AgentAssignmentChoice key={name} name={name} checked={selected.has(name)} disabled={busy} onChange={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(name))next.delete(name);else next.add(name);return next})}/>)}{!filtered.length?<p>{names.length ? 'No matching agents.' : 'No agents exist in this company yet. Create an agent before assigning this connection.'}</p>:null}</div>}
    </div>
    {error?<div role="alert"><p>{error}</p><Button variant="secondary" disabled={busy} onClick={()=>setAttempt(v=>v+1)}>Retry</Button></div>:null}
    <section className="ai-mcp-connection-scope" aria-label="Read-only connection details"><header><h3>Connection details</h3><span>Read only</span></header><dl><div><dt>Server URL</dt><dd title={server.url}>{server.url}</dd></div><div><dt>Authentication</dt><dd>{server.auth}</dd></div><div><dt>Permissions</dt><dd title={server.permissions.join(' · ')}>{server.permissions.join(' · ')||'No permissions configured.'}</dd></div></dl></section>
  </Drawer>
}
