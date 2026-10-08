import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { RowMenu } from '@/components/ui/RowMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { TagInput } from '@/components/ui/TagInput'
import { SelectField } from '@/components/ui/SelectField'
import { IconBuilding, IconChevron, IconSearch } from '@/components/navigation/SidebarIcons'
import { AppShellHeaderContext } from '@/layouts/AppShell'
import { ApiError } from '@/services/httpClient'
import { useCompanyStore } from '@/stores/companyStore'
import { useAuthStore } from '@/stores/authStore'
import type { IdentityUser, MembershipRecord, OrganizationNode, PositionRecord } from '@/modules/core/identity/types/identity'
import { createOrganization, deleteOrganization, fetchOrganizations, updateOrganization, createPosition, deletePosition, fetchPositions, updatePosition, fetchUsers, fetchMemberships } from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'
import './OrganizationPage.css'

type Editor = { kind:'department' | 'position'; organizationId?:string; parentId?:string; item?:OrganizationNode | PositionRecord }
type Draft = { id:number; name:string; status:OrganizationNode['status']; managedIds:string[]; positionId?:string }

export function OrganizationPage() {
  const { t } = useTranslation()
  const setShellHeader=useContext(AppShellHeaderContext)
  const companyId=useCompanyStore(state => state.companyId)
  const companies=useCompanyStore(state => state.companies)
  const sessionUser=useAuthStore(state => state.user)
  const [users,setUsers]=useState<IdentityUser[]>([])
  const [items,setItems]=useState<OrganizationNode[]>([])
  const [positions,setPositions]=useState<PositionRecord[]>([])
  const [memberships,setMemberships]=useState<MembershipRecord[]>([])
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>({})
  const [tab,setTab]=useState<'departments' | 'positions'>('departments')
  const [search,setSearch]=useState('')
  const [pendingDelete,setPendingDelete]=useState<{ kind:Editor['kind']; item:OrganizationNode | PositionRecord }|null>(null)
  const [isDeleting,setIsDeleting]=useState(false)
  const [editor,setEditor]=useState<Editor|null>(null)
  const [drafts,setDrafts]=useState<Draft[]>([])
  const draftId=useRef(0)
  const [placement,setPlacement]=useState('')
  const [managerId,setManagerId]=useState('')
  const [error,setError]=useState<string|null>(null)
  const [editorError,setEditorError]=useState<string|null>(null)
  const [notice,setNotice]=useState('')
  const [recentIds,setRecentIds]=useState<string[]>([])
  const [isLoading,setIsLoading]=useState(true)
  const [isSubmitting,setIsSubmitting]=useState(false)
  const submittingRef=useRef(false)
  const createDialogRef=useRef<HTMLDialogElement>(null)
  const actor=users.find(user => user.id===sessionUser?.id)
  const canManage=Boolean(actor?.isOwner||actor?.canManageUsers)
  const isEditorOpen=Boolean(editor&&canManage)
  const company=companies.find(item => item.value===companyId)
  const departments=items.filter(item => item.type==='department')
  const departmentIds=new Set(departments.map(item => item.id))
  const roots=departments.filter(item => !item.parentId||!departmentIds.has(item.parentId))
  const leaders=positions.filter(item => !item.organizationId||!departmentIds.has(item.organizationId))
  const query=search.trim().toLocaleLowerCase()
  const busy=isSubmitting||isDeleting

  useEffect(() => {
    if (!isEditorOpen) return
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog=createDialogRef.current
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  },[isEditorOpen])

  useEffect(() => {
    setShellHeader(company ? { titleKey:'org.organization.title',titleAside:<span className="organization-company-badge"><IconBuilding aria-hidden="true" /><span>{company.label}</span></span> } : null)
    return () => setShellHeader(null)
  },[company?.label,setShellHeader])

  useEffect(() => {
    let current=true
    setEditor(null); setPendingDelete(null); setCollapsed({}); setItems([]); setPositions([]); setError(null); setNotice(''); setSearch(''); setRecentIds([])
    if (!companyId) { setIsLoading(false); return }
    setIsLoading(true)
    Promise.all([fetchOrganizations(companyId),fetchPositions(companyId),fetchUsers(),fetchMemberships()]).then(([organizations,positionResult,userResult,membershipResult]) => {
      if (!current) return
      setItems(organizations.items); setPositions(positionResult.items); setUsers(userResult.items); setMemberships(membershipResult.items)
    }).catch(err => { if (current) setError(err instanceof ApiError ? err.message : t('org.errLoadOrganizations')) }).finally(() => { if (current) setIsLoading(false) })
    return () => { current=false }
  },[companyId,t])

  function openEditor(next:Editor) {
    const organization=next.kind==='department' ? next.item as OrganizationNode|undefined : undefined
    const position=next.kind==='position' ? next.item as PositionRecord|undefined : undefined
    setEditorError(null)
    setPlacement(next.kind==='department' ? organization?.parentId&&departmentIds.has(organization.parentId) ? organization.parentId : next.parentId||'' : position ? departmentIds.has(position.organizationId||'') ? position.organizationId! : 'company' : next.organizationId||'')
    setManagerId(organization?.managerPositionId||'')
    setDrafts(!next.item ? [] : [{ id:++draftId.current,name:next.item?.name||'',status:next.item?.status||'active',managedIds:position ? roots.filter(d=>d.managerPositionId===position.id).map(d=>d.id) : [] }])
    setEditor(next)
  }

  function updateDraft(id:number,patch:Partial<Draft>) { setDrafts(current => current.map(row => row.id===id ? { ...row,...patch } : row)) }

  async function save(event:FormEvent) {
    event.preventDefault()
    if (!editor||!canManage||submittingRef.current||!drafts.length) return
    submittingRef.current=true
    const scope=companyId
    const created:string[]=[]
    setIsSubmitting(true); setEditorError(null); setError(null)
    try {
      for (const row of drafts) {
        if (useCompanyStore.getState().companyId!==scope) return
        if (editor.kind==='department') {
          const payload={ name:row.name,status:row.status,parentId:placement||null,managerPositionId:placement ? null : managerId||null }
          const result=editor.item ? await updateOrganization(editor.item.id,payload) : await createOrganization({ ...payload,companyId:scope,type:'department' })
          if (useCompanyStore.getState().companyId!==scope) return
          setItems(current => editor.item ? current.map(item => item.id===result.id ? result : item) : [...current,result])
          created.push(result.id)
        } else {
          const payload={ name:row.name,organizationId:placement==='company' ? null : placement }
          const result=editor.item ? await updatePosition(editor.item.id,payload) : row.positionId ? positions.find(p=>p.id===row.positionId)! : await createPosition({ ...payload,companyId:scope })
          if (useCompanyStore.getState().companyId!==scope) return
          setPositions(current => current.some(item=>item.id===result.id) ? current.map(item=>item.id===result.id ? result : item) : [...current,result])
          updateDraft(row.id,{ positionId:result.id })
          const managed=placement==='company' ? row.managedIds : []
          for (const department of roots.filter(d=>d.managerPositionId===result.id||managed.includes(d.id))) {
            if (useCompanyStore.getState().companyId!==scope) return
            const updated=await updateOrganization(department.id,{ managerPositionId:managed.includes(department.id) ? result.id : null })
            if (useCompanyStore.getState().companyId!==scope) return
            setItems(current => current.map(item=>item.id===updated.id ? updated : item))
          }
          created.push(result.id)
        }
        if (!editor.item) setDrafts(current => current.filter(d=>d.id!==row.id))
      }
      if (useCompanyStore.getState().companyId!==scope) return
      setRecentIds(created); setSearch(''); setTab('departments'); setCollapsed({}); setNotice(t(editor.item ? 'org.saved' : 'org.addedItems',{ count:created.length })); setEditor(null)
    } catch(err) {
      if (useCompanyStore.getState().companyId===scope) setEditorError(err instanceof ApiError ? err.message : t('org.errUpdateOrganization'))
    } finally { submittingRef.current=false; setIsSubmitting(false) }
  }

  const dependentPositions=pendingDelete?.kind==='department' ? positions.filter(position => position.organizationId===pendingDelete.item.id).length : 0
  const childDepartments=pendingDelete?.kind==='department' ? items.filter(item => item.parentId===pendingDelete.item.id).length : 0
  const managedDepartments=pendingDelete?.kind==='position' ? departments.filter(d=>d.managerPositionId===pendingDelete.item.id).length : 0
  const activeAssignments=pendingDelete ? memberships.filter(membership => membership.status==='active' && (pendingDelete.kind==='department' ? membership.organizationId===pendingDelete.item.id : membership.positionId===pendingDelete.item.id)).length : 0
  const deleteBlocked=Boolean(dependentPositions||childDepartments||managedDepartments||activeAssignments)

  async function remove() {
    if (!canManage||!pendingDelete||deleteBlocked) return
    const { kind,item:{ id } }=pendingDelete
    const scope=companyId
    setError(null); setIsDeleting(true)
    try {
      if (kind==='department') await deleteOrganization(id)
      else await deletePosition(id)
      if (useCompanyStore.getState().companyId!==scope) return
      if (kind==='department') setItems(current => current.filter(item => item.id!==id))
      else setPositions(current => current.filter(item => item.id!==id))
      if (editor?.item?.id===id) setEditor(null)
      setPendingDelete(null)
    } catch(err) { if (useCompanyStore.getState().companyId===scope) setError(err instanceof ApiError ? err.message : t('org.errDeleteOrganization')) }
    finally { setIsDeleting(false) }
  }

  async function toggleStatus(item:OrganizationNode | PositionRecord,kind:Editor['kind']='department') {
    if (!canManage||busy) return
    const scope=companyId
    setIsSubmitting(true)
    try {
      const nextStatus=item.status==='active' ? 'inactive' : 'active'
      if (kind==='department') {
        const updated=await updateOrganization(item.id,{ status:nextStatus })
        if (useCompanyStore.getState().companyId===scope) setItems(current=>current.map(d=>d.id===updated.id ? updated : d))
      } else {
        const updated=await updatePosition(item.id,{ status:nextStatus })
        if (useCompanyStore.getState().companyId===scope) setPositions(current=>current.map(p=>p.id===updated.id ? updated : p))
      }
    }
    catch(err) { if (useCompanyStore.getState().companyId===scope) setError(err instanceof ApiError ? err.message : t('org.errUpdateOrganization')) }
    finally { setIsSubmitting(false) }
  }

  function actions(kind:Editor['kind'],item:OrganizationNode | PositionRecord) {
    if (!canManage) return <span className="organization-menu-spacer" />
    return <RowMenu label={t('org.itemActions',{ name:item.name })} disabled={busy} items={[
      ...(kind==='department' ? [
        { id:'add-subdepartment',label:t('org.addSubdepartment'),onSelect:() => openEditor({ kind:'department',parentId:item.id }) },
      ] : []),
      { id:'edit',label:t('users.actionEdit'),onSelect:() => openEditor({ kind,item }) },
      { id:'delete',label:t('users.actionDelete'),destructive:true,onSelect:() => setPendingDelete({ kind,item }) },
    ]} />
  }

  function status(value:OrganizationNode['status'],item:OrganizationNode | PositionRecord,kind:Editor['kind']='department') {
    const className='organization-status organization-status--'+value
    const label=t(value==='active' ? 'org.statusActive' : 'org.statusInactive')
    return canManage ? <button type="button" className={className} role="switch" aria-checked={value==='active'} aria-label={t('org.itemStatus',{ name:item.name })} title={t(value==='active' ? 'org.setInactive' : 'org.setActive')} disabled={busy} onClick={()=>void toggleStatus(item,kind)}>{label}</button> : <span className={className}>{label}</span>
  }
  function matches(department:OrganizationNode):boolean { return !query||department.name.toLocaleLowerCase().includes(query)||positions.some(p=>p.organizationId===department.id&&p.name.toLocaleLowerCase().includes(query))||departments.some(d=>d.parentId===department.id&&matches(d)) }
  function isDescendant(node:OrganizationNode,id:string):boolean {
    if (node.parentId===id) return true
    const parent=departments.find(d=>d.id===node.parentId)
    return Boolean(parent&&isDescendant(parent,id))
  }
  function renderPosition(position:PositionRecord) { return <div className={'organization-position'+(recentIds.includes(position.id) ? ' organization-new' : '')} key={position.id}><span>{position.name}</span>{status(position.status,position,'position')}{actions('position',position)}</div> }
  function renderDepartment(department:OrganizationNode,showAll=false) {
    if (!showAll&&!matches(department)) return null
    const list=positions.filter(position=>position.organizationId===department.id)
    const children=departments.filter(item=>item.parentId===department.id)
    const open=Boolean(query)||!(collapsed[department.id]??true)
    const all=showAll||Boolean(query&&department.name.toLocaleLowerCase().includes(query))
    return <li key={department.id}><section className={'organization-department'+(recentIds.includes(department.id) ? ' organization-new' : '')} aria-labelledby={'department-title-'+department.id}>
      <div className="organization-department__header"><button type="button" className="organization-expand" id={'department-title-'+department.id} aria-expanded={open} aria-controls={'department-positions-'+department.id} onClick={()=>setCollapsed(current=>({ ...current,[department.id]:!(current[department.id]??true) }))}><IconChevron aria-hidden="true" /><span className="organization-department__label"><span className="organization-department__name">{department.name}</span></span></button><div className="organization-header-meta"><span className="organization-count">{t('org.positionCount',{ count:list.length })}{children.length ? ' · '+t('org.subdepartmentCount',{ count:children.length }) : ''}</span>{status(department.status,department)}</div>{actions('department',department)}</div>
      <div className="organization-positions" id={'department-positions-'+department.id} hidden={!open}>
        {list.length ? <div className="organization-position-tree">{list.filter(p=>all||!query||p.name.toLocaleLowerCase().includes(query)).map(renderPosition)}</div> : !children.length ? <p className="organization-muted">{t('org.noPositions')}</p> : null}
        {children.length ? <ul className="organization-branches organization-subdepartments">{children.map(child=>renderDepartment(child,all))}</ul> : null}
      </div>
    </section></li>
  }
  const visibleLeaders=leaders.filter(p=>!query||p.name.toLocaleLowerCase().includes(query)||roots.some(d=>d.managerPositionId===p.id&&matches(d)))
  const ungrouped=roots.filter(d=>!leaders.some(p=>p.id===d.managerPositionId))
  const visiblePositions=positions.filter(p=>!query||p.name.toLocaleLowerCase().includes(query)||departments.find(d=>d.id===p.organizationId)?.name.toLocaleLowerCase().includes(query))

  return <div className="identity-page organization-page">
    <FlashToasts error={error} onClearError={()=>setError(null)} />
    <section className="organization-panel">
      <div className="organization-toolbar"><div className="organization-tabs" role="tablist" aria-label={t('org.views')}>
        {(['departments','positions'] as const).map((value,index)=><button key={value} id={'organization-tab-'+value} type="button" role="tab" aria-selected={tab===value} aria-controls={'organization-panel-'+value} tabIndex={tab===value ? 0 : -1} onClick={()=>setTab(value)} onKeyDown={event=>{if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault();const next=event.key==='Home' ? 'departments' : event.key==='End' ? 'positions' : index ? 'departments' : 'positions';setTab(next);document.getElementById('organization-tab-'+next)?.focus()}}}>{t(value==='departments' ? 'org.departmentsTitle' : 'org.positionsTab')}</button>)}
      </div><div className="organization-search"><IconSearch aria-hidden="true" /><TextField type="search" aria-label={t('org.search')} placeholder={t('org.search')} value={search} onChange={event=>setSearch(event.target.value)} /></div>{canManage&&companyId ? <Button disabled={isLoading||busy} onClick={()=>openEditor({ kind:tab==='departments' ? 'department' : 'position' })}>{t(tab==='departments' ? 'org.addDepartment' : 'org.addPosition')}</Button> : null}</div>
      {notice ? <p className="organization-notice" role="status">{notice}</p> : null}
      {isLoading ? <p className="identity-empty" role="status">{t('users.loading')}</p> : !company ? <p className="identity-empty">{t('org.selectActiveCompany')}</p> : <>
        <div id="organization-panel-departments" role="tabpanel" aria-labelledby="organization-tab-departments" hidden={tab!=='departments'}>
          {visibleLeaders.map(leader=>{const managed=roots.filter(d=>d.managerPositionId===leader.id),key='leader-'+leader.id,open=Boolean(query)||!(collapsed[key]??true);return <section className="organization-leadership" key={leader.id}><div className="organization-department__header"><button className="organization-expand" type="button" aria-expanded={open} aria-controls={key} onClick={()=>setCollapsed(current=>({ ...current,[key]:!(current[key]??true) }))}><IconChevron aria-hidden="true" /><span className="organization-department__label"><span className="organization-department__name">{leader.name}</span><span className="organization-count">{t('org.companyWide')}</span></span></button><div className="organization-header-meta"><span className="organization-count">{t('org.departmentCount',{ count:managed.length })}</span>{status(leader.status,leader,'position')}</div>{actions('position',leader)}</div><div id={key} hidden={!open}>{managed.length ? <ul className="organization-branches organization-managed">{managed.map(d=>renderDepartment(d,Boolean(query&&leader.name.toLocaleLowerCase().includes(query))))}</ul> : <p className="organization-muted organization-leadership-empty">{t('org.noManagedDepartments')}</p>}</div></section>})}
          <ul className="organization-branches">{ungrouped.map(d=>renderDepartment(d))}</ul>
          {!visibleLeaders.length&&!ungrouped.some(matches) ? <p className="identity-empty">{t(query ? 'org.noSearchResults' : 'org.noDepartments')}</p> : null}
        </div>
        <div id="organization-panel-positions" role="tabpanel" aria-labelledby="organization-tab-positions" hidden={tab!=='positions'}>{visiblePositions.map(position=><section className="organization-catalog-row" key={position.id}><div><h2>{position.name}</h2><p>{departments.find(d=>d.id===position.organizationId)?.name||t('org.companyWide')}</p></div>{status(position.status,position,'position')}{actions('position',position)}</section>)}{!visiblePositions.length ? <p className="identity-empty">{t(query ? 'org.noSearchResults' : 'org.noPositions')}</p> : null}</div>
      </>}
    </section>
    {isEditorOpen&&editor ? <dialog ref={createDialogRef} className="organization-create-dialog" aria-labelledby="create-department-title" aria-describedby="create-department-description" onCancel={event=>{event.preventDefault();if (!busy) setEditor(null)}}><form onSubmit={event=>void save(event)}>
      <h2 id="create-department-title">{t(editor.item ? editor.kind==='position' ? 'org.editPosition' : 'org.editDepartment' : editor.kind==='position' ? 'org.addPositions' : 'org.addDepartments')}</h2><p id="create-department-description">{t(editor.kind==='position' ? 'org.positionBatchHint' : 'org.departmentBatchHint')}</p>
      <fieldset disabled={isSubmitting} className="organization-editor-fields">
        {editor.kind==='position' ? <fieldset className="organization-scope"><legend>{t('org.positionBelongsTo')}</legend><label><input type="radio" name="position-scope" checked={placement!=='company'} onChange={()=>setPlacement('')} />{t('org.departmentScope')}</label><label><input type="radio" name="position-scope" checked={placement==='company'} onChange={()=>setPlacement('company')} />{t('org.companyWide')}</label></fieldset> : null}
        <div className="organization-editor-fields">
        {placement!=='company' ? <FormField label={t(editor.kind==='department' ? 'org.parentDepartment' : 'org.departmentForAll')} htmlFor="organization-placement"><SelectField id="organization-placement" label={t(editor.kind==='department' ? 'org.parentDepartment' : 'org.departmentForAll')} value={placement} disabled={isSubmitting} onChange={setPlacement} options={[{ value:'',label:t(editor.kind==='department' ? 'org.companyLevel' : 'org.chooseDepartment') },...departments.filter(d=>!editor.item||d.id!==editor.item.id&&!isDescendant(d,editor.item.id)).map(d=>({ value:d.id,label:d.name+(d.status==='inactive' ? ' ('+t('org.statusInactive')+')' : ''),disabled:editor.kind==='position'&&d.status==='inactive' }))]} /></FormField> : null}
        {editor.kind==='department' ? <FormField label={t('org.managedByPosition')} htmlFor="organization-manager" hint={placement ? t('org.inheritsManagement') : undefined}><SelectField id="organization-manager" label={t('org.managedByPosition')} value={managerId} disabled={Boolean(placement)||isSubmitting} onChange={setManagerId} options={[{ value:'',label:t('org.companyLevel') },...leaders.map(p=>({ value:p.id,label:p.name }))]} /></FormField> : null}
        </div>
        <p className="organization-batch-context">{placement==='company' ? t('org.companyWide') : departments.find(d=>d.id===placement)?.name||t('org.companyLevel')}</p>
        {!editor.item ? <FormField label={t(editor.kind==='department' ? 'org.departmentName' : 'org.positionName')} htmlFor="organization-department-entry"><TagInput id="organization-department-entry" hint={t('org.departmentQueueHint')} autoFocus disabled={isSubmitting} validate={name=>!name ? t(editor.kind==='department' ? 'org.departmentNameRequired' : 'org.positionNameRequired') : drafts.some(row=>row.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase()) ? t(editor.kind==='department' ? 'org.departmentAlreadyQueued' : 'org.positionAlreadyQueued') : null} items={drafts} placeholder={t(editor.kind==='department' ? 'org.departmentQueuePlaceholder' : 'org.positionQueuePlaceholder')} onAdd={name=>{const id=++draftId.current;setDrafts(current=>[...current,{ id,name,status:'active',managedIds:[] }])}} onRemove={id=>setDrafts(current=>current.filter(row=>row.id!==id))} removeLabel={name=>t(editor.kind==='department' ? 'org.removeDepartment' : 'org.removePosition',{ name })} /></FormField> : null}
        {drafts.map((row,index)=>!editor.item&&(editor.kind==='department'||placement!=='company') ? null : <div className="organization-batch-row" key={row.id}><div className={'organization-batch-fields'+(editor.kind==='position' ? ' organization-batch-fields--position' : '')}>{editor.item ? <><FormField label={t(editor.kind==='position' ? 'org.positionName' : 'org.departmentName')+' '+(index+1)} htmlFor={'organization-name-'+row.id}><TextField id={'organization-name-'+row.id} autoFocus={index===0&&(editor.kind!=='department'||Boolean(editor.item))} value={row.name} placeholder={t(editor.kind==='position' ? 'org.positionNamePlaceholder' : 'org.departmentNamePlaceholder')} onChange={event=>updateDraft(row.id,{ name:event.target.value })} required /></FormField>{editor.kind==='department' ? <FormField label={t('org.status')} htmlFor={'organization-status-'+row.id}><select id={'organization-status-'+row.id} className="ui-text-field" value={row.status} onChange={event=>updateDraft(row.id,{ status:event.target.value as Draft['status'] })}><option value="active">{t('org.statusActive')}</option><option value="inactive">{t('org.statusInactive')}</option></select></FormField> : null}{!editor.item ? <Button variant="ghost" className="organization-remove-row" aria-label={t('org.removeRow',{ count:index+1 })} disabled={editor.kind!=='department'&&drafts.length===1} onClick={()=>setDrafts(current=>current.filter(d=>d.id!==row.id))}>×</Button> : null}</> : <h3 className="organization-queued-position-name">{row.name}</h3>}</div>
          {editor.kind==='position'&&placement==='company' ? <fieldset className="organization-managed-choices"><legend>{t('org.managesDepartments')}</legend>{roots.map(d=><label key={d.id}><input type="checkbox" checked={row.managedIds.includes(d.id)} disabled={drafts.some(other=>other.id!==row.id&&other.managedIds.includes(d.id))} onChange={()=>updateDraft(row.id,{ managedIds:row.managedIds.includes(d.id) ? row.managedIds.filter(id=>id!==d.id) : [...row.managedIds,d.id] })} /><span>{d.name}</span>{d.managerPositionId&&d.managerPositionId!==editor.item?.id ? <small>{t('org.reassignFrom',{ name:positions.find(p=>p.id===d.managerPositionId)?.name||'' })}</small> : null}</label>)}</fieldset> : null}
        </div>)}
      </fieldset>
      {editorError ? <p className="organization-create-dialog__error" role="alert">{editorError}</p> : null}
      <div className="organization-create-dialog__actions"><Button variant="secondary" onClick={()=>setEditor(null)} disabled={isSubmitting}>{t('users.cancel')}</Button><Button type="submit" disabled={isSubmitting||!drafts.length||drafts.some(row=>!row.name.trim())||editor.kind==='position'&&!placement}>{t(isSubmitting ? 'users.saving' : editor.item ? 'users.saveChanges' : editor.kind==='position' ? 'org.addPositionBatch' : 'org.addDepartmentBatch',{ count:drafts.length })}</Button></div>
    </form></dialog> : null}
    <ConfirmDialog open={Boolean(pendingDelete&&canManage)} title={t(pendingDelete?.kind==='department' ? 'org.deleteDepartmentTitle' : 'org.deletePositionTitle',{ name:pendingDelete?.item.name })} description={<><p>{t(pendingDelete?.kind==='department' ? 'org.deleteDepartmentImpact' : 'org.deletePositionImpact',{ name:pendingDelete?.item.name })}</p>{dependentPositions ? <p>{t('org.deletePositionDependency',{ count:dependentPositions })}</p> : null}{childDepartments ? <p>{t('org.deleteChildDependency',{ count:childDepartments })}</p> : null}{managedDepartments ? <p>{t('org.managedDepartmentDependency',{ count:managedDepartments })}</p> : null}{activeAssignments ? <p>{t('org.deleteAssignmentDependency',{ count:activeAssignments })}</p> : null}</>} warning={t(deleteBlocked ? 'org.deleteBlocked' : 'org.deleteMockWarning')} confirmDisabled={deleteBlocked} confirmLabel={t('users.actionDelete')} cancelLabel={t('users.cancel')} busyLabel={t('org.deleting')} busy={isDeleting} onConfirm={()=>void remove()} onCancel={()=>setPendingDelete(null)} />
  </div>
}
