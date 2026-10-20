import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { useCompanyStore } from '@/stores/companyStore'
import { AiSettingsShell } from '../components/AiSettingsShell'
import { ToolDrawer } from '../components/ToolDrawer'
import { ToolOverview } from '../components/ToolOverview'
import { ToolActionDialog, type ToolAction } from '../components/ToolControls'
import { fetchTool } from '../services/toolsService'
import type { AiTool } from '../types/tools'
import '@/modules/ai/shared/AiConsole.css'
import './AiSettingsPage.css'
import './ToolsPage.css'
import './ToolDetailPage.css'
export function ToolDetailPage() {
  const companyId = useCompanyStore(state => state.companyId)
  const { toolId = '' } = useParams()
  const companyAtEntry = useRef(companyId)
  if (companyAtEntry.current !== companyId) return <Navigate replace to="/ai/ai/ai-settings/tools"/>
  return <ToolDetail key={companyId + ':' + toolId} companyId={companyId} toolId={toolId}/>
}
function ToolDetail({companyId, toolId}: {companyId: string; toolId: string}) {
  const navigate = useNavigate()
  const [tool,setTool] = useState<AiTool | null>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState<string | null>(null)
  const [message,setMessage] = useState<string | null>(null)
  const [editing,setEditing] = useState(false)
  const [action,setAction] = useState<ToolAction | null>(null)
  const load = useCallback(async()=>{
    setLoading(true); setError(null)
    try { setTool(await fetchTool(companyId,toolId)) }
    catch(caught) { setTool(null); setError(caught instanceof Error ? caught.message : 'Unable to load tool.') }
    finally { setLoading(false) }
  },[companyId,toolId])
  useEffect(()=>{void load()},[load])
  return <AiSettingsShell>
    <FlashToasts message={message} onClearMessage={()=>setMessage(null)}/>
    <div className="ai-settings-tool-detail">
      {loading ? <p role="status">Loading tool…</p> : error || !tool ? <section className="console-panel" role="alert"><p>{error ?? 'Tool not found.'}</p><Button variant="secondary" onClick={()=>void load()}>Retry</Button></section> : <>
        <ToolOverview tool={tool} onEdit={()=>setEditing(true)} onAction={setAction} onSaved={saved => { setTool(saved); setMessage('Agent assignments updated.') }} />
      </>}
    </div>
    {editing && tool ? <ToolDrawer companyId={companyId} tool={tool} onClose={()=>setEditing(false)} onSaved={saved=>{setTool(saved);setEditing(false);setMessage('Tool saved successfully.')}}/> : null}
    {action ? <ToolActionDialog key={action.tool.id+action.kind} action={action} companyId={companyId} onClose={()=>setAction(null)} onDone={deleted=>{setAction(null);if(deleted)navigate('/ai/ai/ai-settings/tools');else{setMessage('Tool status updated.');void load()}}}/> : null}
  </AiSettingsShell>
}
