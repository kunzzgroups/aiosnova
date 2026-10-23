import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCompanyStore } from '@/stores/companyStore'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconShieldCheck, IconSpark, IconSettings, IconTrash, IconShield, IconSend, IconPencil } from '@/components/icons/Icons'
import { AiSettingsShell } from '../components/AiSettingsShell'
import { SettingsDrawer } from '../components/SettingsDrawer'
import { fetchSecurityPolicy, saveSecurityPolicy, validateSecurityPolicy, SENSITIVE_ACTIONS, type PolicyChange, type SecurityPolicy, type SecuritySnapshot, type SensitiveAction } from '../services/securityService'
import '@/modules/ai/shared/AiConsole.css'
import './AiSettingsPage.css'
import './SecurityLimitsPage.css'

const actionIcons = {deleteData:IconTrash,financialData:IconPencil,permissions:IconShield,externalMessage:IconSend,accountChanges:IconSettings}

export function SecurityLimitsPage(){const companyId=useCompanyStore(s=>s.companyId);return <SecurityWorkspace key={companyId} companyId={companyId}/>}
function SecurityWorkspace({companyId}:{companyId:string}){
  const user=useAuthStore(s=>s.user)
  const [snapshot,setSnapshot]=useState<SecuritySnapshot|null>(null),[draft,setDraft]=useState<SecurityPolicy|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[pending,setPending]=useState<SensitiveAction|null>(null),[errors,setErrors]=useState<Record<string,string>>({})
  const mounted=useRef(true),submitting=useRef(false)
  const scrollRef=useRef<HTMLDivElement>(null),formRef=useRef<HTMLFormElement>(null),recentRef=useRef<HTMLElement>(null)
  const [recentCount,setRecentCount]=useState(1)
  useLayoutEffect(()=>{
    const scroll=scrollRef.current,form=formRef.current,recent=recentRef.current
    if(!scroll||!form||!recent)return
    let frame=0
    function measure(){
      if(error||Object.keys(errors).length||!snapshot||snapshot.changes.length<2){setRecentCount(1);return}
      const second=recent!.querySelector<HTMLElement>('.ai-security-history li:nth-child(2)')
      if(!second){setRecentCount(1);return}
      const list=second.parentElement!,body=list.parentElement!,header=recent!.querySelector('header')!
      const first=list.querySelector('li')!
      const listHeight=first.getBoundingClientRect().height+second.getBoundingClientRect().height
      const bodyStyle=getComputedStyle(body),cardStyle=getComputedStyle(recent!)
      const bodyHeight=listHeight+parseFloat(bodyStyle.paddingTop)+parseFloat(bodyStyle.paddingBottom)
      const headerHeight=header.getBoundingClientRect().height
      const twoRowHeight=(cardStyle.display==='grid'?Math.max(headerHeight,bodyHeight):headerHeight+bodyHeight)+parseFloat(cardStyle.borderTopWidth)+parseFloat(cardStyle.borderBottomWidth)
      const bottom=form!.getBoundingClientRect().bottom-scroll!.getBoundingClientRect().top+scroll!.scrollTop+parseFloat(getComputedStyle(scroll!).paddingBottom)
      const withoutRecent=bottom-recent!.getBoundingClientRect().height
      setRecentCount(withoutRecent+twoRowHeight+4<=scroll!.clientHeight?2:1)
    }
    function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
    measure()
    const observer=new ResizeObserver(schedule)
    observer.observe(scroll);observer.observe(form);observer.observe(recent)
    window.addEventListener('resize',schedule)
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule)}
  },[snapshot,loading,error,errors,recentCount])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{let active=true;setLoading(true);setError(null);void fetchSecurityPolicy(companyId).then(result=>{if(active){setSnapshot(result);setDraft(structuredClone(result.policy));setErrors({})}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load settings.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[companyId,attempt])
  const dirty=!!draft&&!!snapshot&&JSON.stringify(draft)!==JSON.stringify(snapshot.policy)
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
  function edit<K extends keyof SecurityPolicy>(key:K,value:SecurityPolicy[K]){setDraft(previous=>previous?{...previous,[key]:value}:previous);setErrors({});setError(null)}
  async function save(){if(!draft||!snapshot||submitting.current)return;const validation=validateSecurityPolicy(draft);setErrors(validation);if(Object.keys(validation).length)return;submitting.current=true;setBusy(true);setError(null);try{const result=await saveSecurityPolicy(companyId,draft,snapshot.revision,user?.name??'Current user');if(mounted.current){setSnapshot(result);setDraft(structuredClone(result.policy));setMessage('Policy saved locally. Runtime enforcement is not connected.')}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Unable to save policy.')}finally{submitting.current=false;if(mounted.current)setBusy(false)}}
  const count=snapshot?SENSITIVE_ACTIONS.filter(a=>snapshot.policy.confirmations[a.id]).length:0
  const numeric=(key:'steps'|'calls'|'timeout'|'upload'|'daily'|'monthly',label:string,unit:string,max?:number)=><FormField label={label} htmlFor={'security-'+key} error={errors[key]}><div className="ai-security-input-unit"><TextField id={'security-'+key} type="number" min={key==='daily'||key==='monthly'?'0.01':'1'} max={max} step={key==='daily'||key==='monthly'?'0.01':'1'} required value={draft&&Number.isFinite(draft[key])?String(draft[key]):''} disabled={busy} aria-invalid={!!errors[key]} aria-describedby={errors[key]?'security-'+key+'-error':undefined} onChange={e=>edit(key,e.target.value===''?NaN:Number(e.target.value))}/><span>{unit}</span></div></FormField>
  return <AiSettingsShell><FlashToasts message={message} onClearMessage={()=>setMessage(null)}/><div className="ai-security-page"><section className="ai-security-frame">

    {snapshot?<dl className="ai-security-summary"><div><dt>Security posture</dt><dd>{count===5?'Protected':'Review required'}</dd><small>{count}/5 confirmations required</small></div><div><dt>Runtime policy</dt><dd>{snapshot.policy.steps===10&&snapshot.policy.calls===20&&snapshot.policy.timeout===60&&snapshot.policy.upload===50?'Standard':'Custom'}</dd><small>Saved execution limits</small></div><div><dt>Monthly budget</dt><dd>MYR {snapshot.policy.monthly.toLocaleString('en-MY')}</dd><small>{snapshot.policy.behavior==='warn'?'Warn when reached':'Block new requests'}</small></div></dl>:null}
    <div className="ai-security-scroll" ref={scrollRef}>
      {loading?<p role="status">Loading security settings…</p>:null}
      {error?<div role="alert" className="ai-security-error"><p>{error}</p><Button variant="secondary" disabled={busy} onClick={()=>setAttempt(v=>v+1)}>{draft?'Reload saved settings':'Retry'}</Button></div>:null}
      {!loading&&draft&&snapshot?<form id="ai-security-form" ref={formRef} onSubmit={event=>{event.preventDefault();void save()}}>
        <div className="ai-security-grid">
          <section className="ai-security-card ai-security-sensitive"><header><IconShieldCheck/><div><h3>Sensitive Actions</h3><p>Require user confirmation before execution.</p></div></header><div className="ai-security-card-body">{SENSITIVE_ACTIONS.map(action=>{const ActionIcon=actionIcons[action.id];return <label className="ai-security-action" key={action.id}><span className={'ai-security-action-icon'+(['deleteData','permissions'].includes(action.id)?' is-sensitive':'')} aria-hidden="true"><ActionIcon/></span><span className="ai-security-action-copy"><strong>{action.label}</strong><small>{action.description}</small></span><input type="checkbox" role="switch" aria-label={'Require confirmation for '+action.label} checked={draft.confirmations[action.id]} disabled={busy} onChange={e=>{if(!e.target.checked)setPending(action.id);else edit('confirmations',{...draft.confirmations,[action.id]:true})}}/></label>})}<p className="ai-security-note">ON means confirmation is required. These rules do not grant agents additional permissions.</p></div></section>
          <section className="ai-security-card ai-security-execution"><header><IconSpark/><div><h3>Execution Limits</h3><p>Bound each agent run.</p></div></header><div className="ai-security-card-body ai-security-fields">{numeric('steps','Max agent steps','steps',1000)}{numeric('calls','Max tool calls','calls',1000)}{numeric('timeout','Execution timeout','sec',3600)}{numeric('upload','Max file upload','MB',1024)}</div></section>
          <section className="ai-security-card"><header><IconSettings/><div><h3>Budget Limits</h3><p>Control spending limits.</p></div></header><div className="ai-security-card-body ai-security-fields">{numeric('daily','Daily budget','MYR',1e9)}{numeric('monthly','Monthly budget','MYR',1e9)}<FormField label="When limit reached" htmlFor="security-behavior" error={errors.behavior}><SidebarSelect menuPortal id="security-behavior" label="When limit reached" hideLabel options={[{value:'warn',label:'Warn user'},{value:'block',label:'Block new requests'}]} value={draft.behavior} onChange={value=>edit('behavior',value as SecurityPolicy['behavior'])} disabled={busy}/></FormField><p className="ai-security-note">{draft.behavior==='warn'?'Users receive a warning. Requests can continue after the budget is reached.':'New requests are blocked after the budget is reached.'}</p></div></section>
        </div>
        <section className="ai-security-card ai-security-changes" ref={recentRef}><header><h3>Recent Policy Changes</h3><Button variant="secondary" onClick={()=>setHistoryOpen(true)}>View all</Button></header><div className="ai-security-card-body"><PolicyHistory items={snapshot.changes.slice(0,2)} visibleCount={recentCount}/></div></section>
      </form>:null}
    </div>
    <footer className="ai-security-footer"><div role="status"><strong>{dirty?'Unsaved changes':'All changes saved'}</strong><small>{dirty?'Summary shows saved policy.':'Local demo · runtime enforcement not connected.'}</small></div><Button variant="secondary" disabled={!dirty||busy||loading} onClick={()=>{if(snapshot)setDraft(structuredClone(snapshot.policy));setErrors({});setError(null)}}>Reset</Button><Button form="ai-security-form" type="submit" disabled={!dirty||busy||loading}>{busy?'Saving…':'Save Changes'}</Button></footer>
  </section></div>
  <SettingsDrawer open={historyOpen} title="Recent Policy Changes" description="Changes saved in this local demo." closeLabel="Close policy history" onClose={()=>setHistoryOpen(false)}>{snapshot?<PolicyHistory items={snapshot.changes}/>:null}</SettingsDrawer>
  <ConfirmDialog open={!!pending} title="Remove confirmation requirement?" description={'Agents would no longer need user confirmation for '+(SENSITIVE_ACTIONS.find(a=>a.id===pending)?.label.toLowerCase()??'this action')+'.'} warning="This changes the draft only. Save Changes applies the policy." confirmLabel="Remove" cancelLabel="Keep required" onCancel={()=>setPending(null)} onConfirm={()=>{if(pending&&draft)edit('confirmations',{...draft.confirmations,[pending]:false});setPending(null)}}/>
  </AiSettingsShell>
}
function PolicyHistory({items,visibleCount}:{items:PolicyChange[];visibleCount?:number}){return items.length?<ul className={'ai-security-history'+(visibleCount===1?' ai-security-history--single':'')}>{items.map((item,index)=><li key={item.id} aria-hidden={visibleCount!==undefined&&index>=visibleCount?true:undefined}><span className="ai-security-dot" aria-hidden="true"/><div><strong>{item.field}</strong><small>{item.before} → {item.after} · {item.actor}</small></div><time dateTime={item.time}>{new Date(item.time).toLocaleString()}</time></li>)}</ul>:<p className="ai-security-empty">No policy changes recorded yet. Saved changes will appear here.</p>}
