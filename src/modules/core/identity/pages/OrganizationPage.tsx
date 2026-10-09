import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { RowMenu } from '@/components/ui/RowMenu'
import { Popover } from '@/components/ui/Popover'
import { IconMore } from '@/components/icons/Icons'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { TagInput } from '@/components/ui/TagInput'
import { SelectField } from '@/components/ui/SelectField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconBuilding, IconChevron, IconSearch, IconUsers } from '@/components/navigation/SidebarIcons'
import { AppShellHeaderContext } from '@/layouts/AppShell'
import { ApiError } from '@/services/httpClient'
import { useCompanyStore } from '@/stores/companyStore'
import { useAuthStore } from '@/stores/authStore'
import type { IdentityUser, MembershipRecord, OrganizationNode, PositionRecord } from '@/modules/core/identity/types/identity'
import { createOrganization, deleteOrganization, fetchOrganizations, updateOrganization, createPosition, deletePosition, fetchPositions, updatePosition, fetchUsers, fetchMemberships } from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'
import './OrganizationPage.css'
import './UsersDirectoryDesign.css'

type PositionSortKey = 'name' | 'department' | 'level' | 'employees' | 'status'

type Editor = { kind:'department' | 'position'; organizationId?:string; parentId?:string; item?:OrganizationNode | PositionRecord }
type Draft = { id:number; name:string; status:OrganizationNode['status']; managedIds:string[]; positionId?:string }

function paginationItems(current: number, total: number): (number | 'backward' | 'forward')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const start = Math.max(2, Math.min(current - 2, total - 5))
  const end = Math.min(total - 1, Math.max(current + 2, 6))
  const items: (number | 'backward' | 'forward')[] = [1]
  if (start > 2) items.push('backward')
  for (let number = start; number <= end; number++) items.push(number)
  if (end < total - 1) items.push('forward')
  items.push(total)
  return items
}

export function OrganizationPage() {
  const { t, i18n } = useTranslation()
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
  const [departmentFilter,setDepartmentFilter]=useState('all')
  const [levelFilter,setLevelFilter]=useState('all')
  const [statusFilter,setStatusFilter]=useState('active')
  const [positionSort,setPositionSort]=useState<{ key:PositionSortKey; descending:boolean }>({ key:'name',descending:false })
  const [positionLevel,setPositionLevel]=useState<NonNullable<PositionRecord['level']> | ''>('staff')
  const [pageSize,setPageSize]=useState(0)
  const [autoPageSize,setAutoPageSize]=useState(10)
  const autoFitRowMeasurement=useRef({ width:0,height:0 })
  const [page,setPage]=useState(1)
  const tableRef=useRef<HTMLDivElement>(null)
  const [pendingDelete,setPendingDelete]=useState<{ kind:Editor['kind']; item:OrganizationNode | PositionRecord }|null>(null)
  const [isDeleting,setIsDeleting]=useState(false)
  const [editor,setEditor]=useState<Editor|null>(null)
  const [drafts,setDrafts]=useState<Draft[]>([])
  const [inputName,setInputName]=useState('')
  const [nameError,setNameError]=useState<string|null>(null)
  const [pendingManagedIds,setPendingManagedIds]=useState<string[]>([])
  const draftId=useRef(0)
  const [placement,setPlacement]=useState('')
  const [managerId,setManagerId]=useState('')
  const [error,setError]=useState<string|null>(null)
  const [loadError,setLoadError]=useState<{ message:string; retryable:boolean }|null>(null)
  const [reloadKey,setReloadKey]=useState(0)
  const [deleteError,setDeleteError]=useState<string|null>(null)
  const [updatingStatusId,setUpdatingStatusId]=useState<string|null>(null)
  const [editorError,setEditorError]=useState<string|null>(null)
  const [notice,setNotice]=useState('')
  const [positionMessage,setPositionMessage]=useState('')
  const [recentIds,setRecentIds]=useState<string[]>([])
  const [isLoading,setIsLoading]=useState(true)
  const [isSubmitting,setIsSubmitting]=useState(false)
  const submittingRef=useRef(false)
  const createDialogRef=useRef<HTMLDialogElement>(null)
  const actor=users.find(user => user.id===sessionUser?.id)
  const canManage=Boolean(!isLoading&&!loadError&&companies.some(company=>company.value===companyId)&&(actor?.isOwner||actor?.canManageUsers))
  const isEditorOpen=Boolean(editor&&canManage)
  const company=companies.find(item => item.value===companyId)
  const departments=items.filter(item => item.type==='department')
  const departmentIds=new Set(departments.map(item => item.id))
  const roots=departments.filter(item => !item.parentId||!departmentIds.has(item.parentId))
  const leaders=positions.filter(item => !item.organizationId||!departmentIds.has(item.organizationId))
  const query=search.trim().toLocaleLowerCase()
  const busy=isSubmitting||isDeleting
  const totalToAdd=drafts.length+(!editor?.item&&inputName.trim() ? 1 : 0)
  const editorRows=!editor?.item&&editor?.kind==='position'&&inputName.trim() ? [...drafts,{ id:-1,name:inputName.trim(),status:'active' as const,managedIds:pendingManagedIds }] : drafts

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
    setEditor(null); setPendingDelete(null); setItems([]); setPositions([]); setUsers([]); setMemberships([]); setError(null); setLoadError(null); setDeleteError(null); setNotice(''); setPositionMessage(''); setRecentIds([])
    if (!companyId||!companies.some(company=>company.value===companyId)) { setIsLoading(false); return }
    setIsLoading(true)
    Promise.all([fetchOrganizations(companyId),fetchPositions(companyId),fetchUsers(),fetchMemberships()]).then(([organizations,positionResult,userResult,membershipResult]) => {
      if (!current) return
      setItems(organizations.items); setPositions(positionResult.items); setUsers(userResult.items); setMemberships(membershipResult.items)
    }).catch(err => {
      if (!current) return
      const status=err instanceof ApiError ? err.status : undefined
      setLoadError({ message:status===403 ? t('org.accessDenied') : status===401 ? t('org.sessionExpired') : err instanceof ApiError ? err.message : t('org.errLoadOrganizations'),retryable:status!==401&&status!==403 })
    }).finally(() => { if (current) setIsLoading(false) })
    return () => { current=false }
  },[companyId,companies,sessionUser?.id,t,reloadKey])

  useEffect(() => { setCollapsed({}); setSearch(''); setDepartmentFilter('all'); setLevelFilter('all'); setStatusFilter('active'); setPositionSort({ key:'name',descending:false }); setPage(1) },[companyId,sessionUser?.id])

  function openEditor(next:Editor) {
    const organization=next.kind==='department' ? next.item as OrganizationNode|undefined : undefined
    const position=next.kind==='position' ? next.item as PositionRecord|undefined : undefined
    setEditorError(null)
    setInputName(''); setNameError(null); setPendingManagedIds([])
    setPlacement(next.kind==='department' ? organization?.parentId&&departmentIds.has(organization.parentId) ? organization.parentId : next.parentId||'' : position ? departmentIds.has(position.organizationId||'') ? position.organizationId! : 'company' : next.organizationId||'')
    setManagerId(organization?.managerPositionId||'')
    setPositionLevel(position ? position.level||'' : 'staff')
    setDrafts(!next.item ? [] : [{ id:++draftId.current,name:next.item?.name||'',status:next.item?.status||'active',managedIds:position ? roots.filter(d=>d.managerPositionId===position.id).map(d=>d.id) : [] }])
    setEditor(next)
  }

  function updateDraft(id:number,patch:Partial<Draft>) {
    if (id===-1) { if (patch.managedIds) setPendingManagedIds(patch.managedIds); return }
    setDrafts(current => current.map(row => row.id===id ? { ...row,...patch } : row))
  }

  function validateName(name:string) {
    return !name ? t(editor?.kind==='department' ? 'org.departmentNameRequired' : 'org.positionNameRequired') : drafts.some(row=>row.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase()) ? t(editor?.kind==='department' ? 'org.departmentAlreadyQueued' : 'org.positionAlreadyQueued') : null
  }

  async function save(event:FormEvent) {
    event.preventDefault()
    if (!editor||!canManage||submittingRef.current) return
    let rows=drafts
    if (!editor.item&&inputName.trim()) {
      const name=inputName.trim()
      const message=validateName(name)
      setNameError(message)
      if (message) return
      rows=[...drafts,{ id:++draftId.current,name,status:'active',managedIds:pendingManagedIds }]
      setDrafts(rows); setInputName(''); setPendingManagedIds([])
    }
    if (!rows.length) return
    submittingRef.current=true
    const scope=companyId
    const created:string[]=[]
    setIsSubmitting(true); setEditorError(null); setError(null)
    try {
      for (const row of rows) {
        if (useCompanyStore.getState().companyId!==scope) return
        if (editor.kind==='department') {
          const payload={ name:row.name,status:row.status,parentId:placement||null,managerPositionId:placement ? null : managerId||null }
          const result=editor.item ? await updateOrganization(editor.item.id,payload) : await createOrganization({ ...payload,companyId:scope,type:'department' })
          if (useCompanyStore.getState().companyId!==scope) return
          setItems(current => editor.item ? current.map(item => item.id===result.id ? result : item) : [...current,result])
          created.push(result.id)
        } else {
          const payload={ name:row.name,organizationId:placement==='company' ? null : placement,level:positionLevel||undefined }
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
      if (editor.kind==='position') setNotice('')
      setRecentIds(created); setSearch(''); setTab('departments'); setCollapsed({}); (editor.kind==='position' ? setPositionMessage : setNotice)(t(editor.item ? 'org.saved' : 'org.addedItems',{ count:created.length })); setEditor(null)
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
    if (!canManage||!pendingDelete||deleteBlocked||submittingRef.current) return
    submittingRef.current=true
    const { kind,item:{ id } }=pendingDelete
    const scope=companyId
    setError(null); setDeleteError(null); setIsDeleting(true)
    try {
      if (kind==='department') await deleteOrganization(id)
      else await deletePosition(id)
      if (useCompanyStore.getState().companyId!==scope) return
      if (kind==='department') setItems(current => current.filter(item => item.id!==id))
      else setPositions(current => current.filter(item => item.id!==id))
      if (editor?.item?.id===id) setEditor(null)
      setPendingDelete(null)
    } catch(err) { if (useCompanyStore.getState().companyId===scope) setDeleteError(err instanceof ApiError ? err.message : t('org.errDeleteOrganization')) }
    finally { submittingRef.current=false; setIsDeleting(false) }
  }

  async function toggleStatus(item:OrganizationNode | PositionRecord,kind:Editor['kind']='department') {
    if (!canManage||busy||submittingRef.current) return
    submittingRef.current=true
    const scope=companyId
    setError(null); setIsSubmitting(true); setUpdatingStatusId(item.id)
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
    finally { submittingRef.current=false; setIsSubmitting(false); setUpdatingStatusId(null) }
  }

  function actions(kind:Editor['kind'],item:OrganizationNode | PositionRecord,panel=false) {
    if (!canManage) return <span className="organization-menu-spacer" />
    if (panel) return <Popover placement="left" label={t('org.itemActions',{ name:item.name })} trigger={<IconMore aria-hidden="true" />}><div className="organization-position-actions"><Button variant="ghost" disabled={busy} onClick={()=>openEditor({ kind,item })}>{t('users.actionEdit')}</Button><Button variant="ghost" disabled={busy} className="organization-position-actions__delete" onClick={()=>{setDeleteError(null);setPendingDelete({ kind,item })}}>{t('users.actionDelete')}</Button></div></Popover>
    return <RowMenu label={t('org.itemActions',{ name:item.name })} disabled={busy} items={[
      ...(kind==='department' ? [
        { id:'add-subdepartment',label:t('org.addSubdepartment'),onSelect:() => openEditor({ kind:'department',parentId:item.id }) },
      ] : []),
      { id:'edit',label:t('users.actionEdit'),onSelect:() => openEditor({ kind,item }) },
      { id:'delete',label:t('users.actionDelete'),destructive:true,onSelect:() => { setDeleteError(null); setPendingDelete({ kind,item }) } },
    ]} />
  }

  function status(value:OrganizationNode['status'],item:OrganizationNode | PositionRecord,kind:Editor['kind']='department') {
    const className='organization-status organization-status--'+value
    const label=t(updatingStatusId===item.id ? 'org.updatingStatus' : value==='active' ? 'org.statusActive' : 'org.statusInactive')
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
  const today=new Date().toLocaleDateString('en-CA')
  const filteredPositions=positions.filter(position=>(!query||position.name.toLocaleLowerCase().includes(query))
    &&(departmentFilter==='all'||(departmentFilter==='executive' ? !departmentIds.has(position.organizationId||'') : position.organizationId===departmentFilter))
    &&(levelFilter==='all'||position.level===levelFilter)
    &&(statusFilter==='all'||position.status===statusFilter)).sort((a,b)=>{
      const value=(position:PositionRecord)=>{
        switch(positionSort.key) {
          case 'name': return position.name
          case 'department': return departments.find(d=>d.id===position.organizationId)?.name||t('org.companyWide')
          case 'level': return position.level ? t(position.level==='manager' ? 'org.levelManager' : 'org.levelStaff') : t(position.level===null ? 'org.levelNotApplicable' : 'org.levelNotSet')
          case 'employees': return employeeCount(position.id)
          case 'status': return t(position.status==='active' ? 'org.statusActive' : 'org.statusInactive')
        }
      }
      const left=value(a),right=value(b)
      const order=typeof left==='number'&&typeof right==='number' ? left-right : String(left).localeCompare(String(right),i18n.language)
      return positionSort.descending ? -order : order
    })
  const effectivePageSize=pageSize||autoPageSize
  const pageCount=Math.max(1,Math.ceil(filteredPositions.length/effectivePageSize))
  const currentPage=Math.min(page,pageCount)
  const visiblePositions=filteredPositions.slice((currentPage-1)*effectivePageSize,currentPage*effectivePageSize)
  function employeeCount(positionId:string) {
    return new Set(memberships.filter(m=>m.companyId===companyId&&m.positionId===positionId&&m.status==='active'&&m.validFrom<=today&&(!m.validTo||m.validTo>=today)).map(m=>m.userId)).size
  }
  useEffect(()=>{setPage(1)},[query,departmentFilter,levelFilter,statusFilter,effectivePageSize,positionSort])
  useEffect(()=>{if(tableRef.current) tableRef.current.scrollTop=0},[currentPage,effectivePageSize])
  useEffect(() => {
    if (tab!=='positions' || isLoading || !filteredPositions.length || pageSize !== 0) return
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return
    let frame = 0
    function measureRows() {
      if (!container || !table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      if (!rows.length) return
      // Read natural row sizes before distributing spare space. Otherwise padded
      // rows would feed back into the next capacity calculation.
      rows.forEach(row => row.style.removeProperty('height'))
      const width = container.clientWidth
      const headerHeight = table.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const availableHeight = container.clientHeight - headerHeight
      if (availableHeight <= 0) return
      if (autoFitRowMeasurement.current.width !== width) {
        autoFitRowMeasurement.current = { width, height: 0 }
      }
      // Use a stable natural row height instead of recalculating from each page.
      if (currentPage === 1 || !autoFitRowMeasurement.current.height) {
        const naturalHeight = Math.max(1, ...rows.map(row => row.getBoundingClientRect().height))
        autoFitRowMeasurement.current.height = Math.max(autoFitRowMeasurement.current.height, naturalHeight)
      }
      const limit = Math.max(1, Math.floor(availableHeight / autoFitRowMeasurement.current.height))
      setAutoPageSize(current => current === limit ? current : limit)
      const uniformHeight = availableHeight / limit
      rows.forEach(row => { row.style.height = uniformHeight + 'px' })
    }
    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    observer.observe(table)
    scheduleMeasure()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => row.style.removeProperty('height'))
    }
  }, [tab,isLoading,filteredPositions.length,pageSize,currentPage,effectivePageSize])

  const hasPositionFilters=Boolean(query||departmentFilter!=='all'||levelFilter!=='all'||statusFilter!=='all')
  function clearPositionFilters() {
    setSearch(''); setDepartmentFilter('all'); setLevelFilter('all'); setStatusFilter('all')
  }

  function renderQueuedNames() {
    if (!editor||editor.item) return null
    return <FormField label={t(editor.kind==='department' ? 'org.departmentName' : 'org.positionName')} htmlFor="organization-department-entry"><TagInput id="organization-department-entry" hint={t('org.departmentQueueHint')} autoFocus disabled={isSubmitting} value={inputName} onValueChange={setInputName} error={nameError} onErrorChange={setNameError} validate={validateName} items={drafts} placeholder={t(editor.kind==='department' ? 'org.departmentQueuePlaceholder' : 'org.positionQueuePlaceholder')} onAdd={name=>{const id=++draftId.current;setDrafts(current=>[...current,{ id,name,status:'active',managedIds:pendingManagedIds }]);setPendingManagedIds([])}} onRemove={id=>setDrafts(current=>current.filter(row=>row.id!==id))} removeLabel={name=>t(editor.kind==='department' ? 'org.removeDepartment' : 'org.removePosition',{ name })} /></FormField>
  }

  return <div className="identity-page organization-page">
    <FlashToasts error={error} message={positionMessage} onClearError={()=>setError(null)} onClearMessage={()=>setPositionMessage('')} />
    <section className="organization-panel" aria-busy={isLoading}>
      <div className="organization-toolbar"><div className="organization-tabs" role="tablist" aria-label={t('org.views')}>
        {(['departments','positions'] as const).map((value,index)=><button key={value} id={'organization-tab-'+value} type="button" role="tab" aria-selected={tab===value} aria-controls={'organization-panel-'+value} tabIndex={tab===value ? 0 : -1} onClick={()=>setTab(value)} onKeyDown={event=>{if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault();const next=event.key==='Home' ? 'departments' : event.key==='End' ? 'positions' : index ? 'departments' : 'positions';setTab(next);document.getElementById('organization-tab-'+next)?.focus()}}}>{t(value==='departments' ? 'org.departmentsTitle' : 'org.positionsTab')}</button>)}
      </div>{tab==='departments' ? <div className="organization-search"><IconSearch aria-hidden="true" /><TextField type="search" disabled={isLoading||Boolean(loadError)||!company} aria-label={t('org.search')} placeholder={t('org.search')} value={search} onChange={event=>setSearch(event.target.value)} /></div> : null}{tab==='departments'&&canManage&&companyId ? <Button disabled={isLoading||busy} onClick={()=>openEditor({ kind:'department' })}>{t('org.addDepartment')}</Button> : null}</div>
      {notice&&tab==='departments' ? <p className="organization-notice" role="status">{notice}</p> : null}
      {isLoading ? <div className="organization-load-state" role="status"><p>{t('org.loadingStructure')}</p><div className="organization-skeleton" aria-hidden="true">{[0,1,2].map(index=><div key={index}><span /><span /></div>)}</div></div> : loadError ? <div className="organization-load-state organization-load-state--error" role="alert"><h2>{t('org.loadFailed')}</h2><p>{loadError.message}</p>{loadError.retryable ? <Button variant="secondary" onClick={()=>{setIsLoading(true);setReloadKey(current=>current+1)}}>{t('org.retry')}</Button> : null}</div> : !company ? <p className="identity-empty">{t('org.selectActiveCompany')}</p> : <>
        <div id="organization-panel-departments" role="tabpanel" aria-labelledby="organization-tab-departments" hidden={tab!=='departments'}>
          {visibleLeaders.map(leader=>{const managed=roots.filter(d=>d.managerPositionId===leader.id),key='leader-'+leader.id,open=Boolean(query)||!(collapsed[key]??true);return <section className="organization-leadership" key={leader.id}><div className="organization-department__header"><button className="organization-expand" type="button" aria-expanded={open} aria-controls={key} onClick={()=>setCollapsed(current=>({ ...current,[key]:!(current[key]??true) }))}><IconChevron aria-hidden="true" /><span className="organization-department__label"><span className="organization-department__name">{leader.name}</span><span className="organization-count">{t('org.companyWide')}</span></span></button><div className="organization-header-meta"><span className="organization-count">{t('org.departmentCount',{ count:managed.length })}</span>{status(leader.status,leader,'position')}</div>{actions('position',leader)}</div><div id={key} hidden={!open}>{managed.length ? <ul className="organization-branches organization-managed">{managed.map(d=>renderDepartment(d,Boolean(query&&leader.name.toLocaleLowerCase().includes(query))))}</ul> : <p className="organization-muted organization-leadership-empty">{t('org.noManagedDepartments')}</p>}</div></section>})}
          <ul className="organization-branches">{ungrouped.map(d=>renderDepartment(d))}</ul>
          {!visibleLeaders.length&&!ungrouped.some(matches) ? <p className="identity-empty">{t(query ? 'org.noSearchResults' : 'org.noDepartments')}</p> : null}
        </div>
        <div id="organization-panel-positions" className="organization-position-panel" role="tabpanel" aria-labelledby="organization-tab-positions" hidden={tab!=='positions'}>
          <section className="identity-panel identity-directory-panel identity-directory-design organization-position-directory">
          <div className="organization-position-filters">
            <div className="organization-search"><IconSearch aria-hidden="true" /><TextField type="search" aria-label={t('org.searchPositions')} placeholder={t('org.searchPositions')} value={search} onChange={event=>setSearch(event.target.value)} /></div>
            <SidebarSelect id="organization-filter-department" label={t('org.department')} value={departmentFilter} onChange={setDepartmentFilter} options={[{value:'all',label:t('org.allDepartments')},{value:'executive',label:t('org.companyWide')},...departments.map(d=>({value:d.id,label:d.name}))]} />
            <SidebarSelect id="organization-filter-level" label={t('org.level')} value={levelFilter} onChange={setLevelFilter} options={[{value:'all',label:t('org.allLevels')},...(['manager','staff'] as const).map(value=>({value,label:t(value==='manager' ? 'org.levelManager' : 'org.levelStaff')}))]} />
            <SidebarSelect id="organization-filter-status" label={t('org.status')} value={statusFilter} onChange={setStatusFilter} options={[{value:'all',label:t('org.allStatus')},{value:'active',label:t('org.statusActive')},{value:'inactive',label:t('org.statusInactive')}]} />
            {canManage&&companyId ? <Button disabled={isLoading||busy} onClick={()=>openEditor({ kind:'position' })}>{t('org.addPosition')}</Button> : null}
          </div>
            <div className="identity-table-wrap identity-directory-scroll" ref={tableRef} tabIndex={0} aria-label={t('org.positionsTab')}>
              <table className={'identity-table identity-table--packed directory-design-table'+(pageSize===0 ? ' directory-design-table--auto-fit' : '')}>
                <thead><tr>{([['name','org.positionName'],['department','org.department'],['level','org.level'],['employees','org.employees'],['status','org.status']] as const).map(([key,label])=><th key={key} scope="col" aria-sort={positionSort.key===key ? positionSort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" className="directory-design-sort" onClick={()=>setPositionSort({ key,descending:positionSort.key===key&&!positionSort.descending })}>{t(label)}<span aria-hidden="true">{positionSort.key===key&&positionSort.descending ? '↓' : '↑'}</span></button></th>)}<th scope="col">{t('org.actions')}</th></tr></thead>
                <tbody>{visiblePositions.map(position=><tr key={position.id}><td>{position.name}</td><td>{departments.find(d=>d.id===position.organizationId)?.name||t('org.companyWide')}</td><td>{position.level ? t(position.level==='manager' ? 'org.levelManager' : 'org.levelStaff') : t(position.level===null ? 'org.levelNotApplicable' : 'org.levelNotSet')}</td><td><span className="organization-employee-count"><IconUsers aria-hidden="true" /><span>{employeeCount(position.id).toLocaleString(i18n.language)}</span></span></td><td>{status(position.status,position,'position')}</td><td>{actions('position',position,true)}</td></tr>)}</tbody>
              </table>
              {!filteredPositions.length ? <div className="organization-position-empty" role="status"><p className="identity-empty">{t(hasPositionFilters ? 'org.noSearchResults' : 'org.noPositions')}</p>{hasPositionFilters ? <Button variant="secondary" onClick={clearPositionFilters}>{t('org.clearFilters')}</Button> : null}</div> : null}
            </div>
        <footer className="identity-directory-footer">
          <div className="identity-directory-footer__listing">
            <label htmlFor="organization-page-size">{t('users.rowsPerPage')}</label>
            <SidebarSelect id="organization-page-size" hideLabel className="identity-pagination-select" label={t('users.rowsPerPage')} title={pageSize===0? t('users.autoRowsHint', { count: autoPageSize }):undefined} value={String(pageSize)} options={[{ value: '0', label: '–' }, ...[10,25,50,100,200].map(n => ({ value: String(n), label: String(n) }))]} onChange={value => setPageSize(Number(value))} />
            <span>{t('users.listingRange', { start: filteredPositions.length ? (currentPage-1)*effectivePageSize+1 : 0, end: Math.min(currentPage*effectivePageSize,filteredPositions.length), total: filteredPositions.length })}</span>
          </div>
          <nav className="identity-pagination" aria-label={t('org.positionPages')}>
            <Button variant="secondary" disabled={currentPage===1} onClick={() => setPage(currentPage-1)} aria-label={t('users.previousPage')}>‹</Button>
            {paginationItems(currentPage,pageCount).map(item => {
              if (typeof item === 'number') return (
                <Button key={item} variant="secondary" aria-label={t('users.pageNumber', { page: item })} aria-current={item===currentPage? 'page':undefined} onClick={() => setPage(item)}>{item}</Button>
              )
              const backward = item === 'backward'
              const label = t(backward ? 'users.jumpBackPages' : 'users.jumpForwardPages')
              return <Button key={item} variant="ghost" className="identity-pagination__jump" aria-label={label} title={label} onClick={() => setPage(Math.max(1,Math.min(pageCount,currentPage + (backward ? -5 : 5))))}>
                <span className="identity-pagination__ellipsis" aria-hidden>•••</span>
                <span className="identity-pagination__jump-arrow" aria-hidden>{backward ? '«' : '»'}</span>
              </Button>
            })}
            <Button variant="secondary" disabled={currentPage===pageCount} onClick={() => setPage(currentPage+1)} aria-label={t('users.nextPage')}>›</Button>
          </nav>
        </footer>
          </section>
        </div>
      </>}
    </section>
    {isEditorOpen&&editor ? <dialog ref={createDialogRef} className={'organization-create-dialog'+(editor.kind==='position'&&!editor.item ? ' organization-create-dialog--position-flow' : '')} aria-labelledby="create-department-title" aria-describedby="create-department-description" onCancel={event=>{event.preventDefault();if (!busy) setEditor(null)}}><form aria-busy={isSubmitting} onSubmit={event=>void save(event)}>
      <h2 id="create-department-title">{t(editor.item ? editor.kind==='position' ? 'org.editPosition' : 'org.editDepartment' : editor.kind==='position' ? 'org.addPositions' : 'org.addDepartments')}</h2><p id="create-department-description">{t(editor.kind==='position' ? editor.item ? 'org.positionBatchHint' : 'org.positionCreationHint' : 'org.departmentBatchHint')}</p>
      <fieldset disabled={isSubmitting} className="organization-editor-fields">
        {editor.kind==='position'&&!editor.item ? <h3 className="organization-flow-heading">{t('org.positionPlacementStep')}</h3> : null}
        {editor.kind==='position' ? <fieldset className="organization-scope"><legend>{t(editor.item ? 'org.positionBelongsTo' : 'org.positionType')}</legend><label><input type="radio" name="position-scope" checked={placement!=='company'} onChange={()=>setPlacement('')} />{t(editor.item ? 'org.departmentScope' : 'org.departmentPosition')}</label><label><input type="radio" name="position-scope" checked={placement==='company'} onChange={()=>setPlacement('company')} />{t(editor.item ? 'org.companyWide' : 'org.executivePosition')}</label></fieldset> : null}
        <div className="organization-editor-fields">
        {editor.kind==='position' ? <FormField label={t('org.level')} htmlFor="organization-position-level" hint={!editor.item ? t('org.levelForAll') : undefined}><SelectField id="organization-position-level" label={t('org.level')} value={positionLevel} onChange={value=>setPositionLevel(value as NonNullable<PositionRecord['level']> | '')} options={[...(editor.item&&!(editor.item as PositionRecord).level ? [{value:'',label:t('org.levelUnassigned')}] : []),{value:'manager',label:t('org.levelManager')},{value:'staff',label:t('org.levelStaff')}]} /></FormField> : null}
        {placement!=='company' ? <FormField label={t(editor.kind==='department' ? 'org.parentDepartment' : editor.item ? 'org.departmentForAll' : 'org.assignPositionsTo')} htmlFor="organization-placement" hint={editor.kind==='position'&&!editor.item ? t('org.positionPlacementHint') : undefined}><SelectField id="organization-placement" label={t(editor.kind==='department' ? 'org.parentDepartment' : editor.item ? 'org.departmentForAll' : 'org.assignPositionsTo')} value={placement} disabled={isSubmitting} onChange={setPlacement} options={[{ value:'',label:t(editor.kind==='department' ? 'org.companyLevel' : 'org.chooseDepartment') },...departments.filter(d=>!editor.item||d.id!==editor.item.id&&!isDescendant(d,editor.item.id)).map(d=>({ value:d.id,label:d.name+(d.status==='inactive' ? ' ('+t('org.statusInactive')+')' : ''),disabled:editor.kind==='position'&&d.status==='inactive' }))]} /></FormField> : null}
        {editor.kind==='department' ? <FormField label={t('org.managedByPosition')} htmlFor="organization-manager" hint={placement ? t('org.inheritsManagement') : undefined}><SelectField id="organization-manager" label={t('org.managedByPosition')} value={managerId} disabled={Boolean(placement)||isSubmitting} onChange={setManagerId} options={[{ value:'',label:t('org.companyLevel') },...leaders.map(p=>({ value:p.id,label:p.name }))]} /></FormField> : null}
        </div>
        {editor.kind!=='position'||editor.item ? <p className="organization-batch-context">{placement==='company' ? t('org.companyWide') : departments.find(d=>d.id===placement)?.name||t('org.companyLevel')}</p> : null}
        {editor.kind==='department' ? renderQueuedNames() : null}
        {editor.kind==='position'&&!editor.item ? <><h3 className="organization-flow-heading organization-flow-heading--placement">{t('org.positionNamesStep')}</h3>{renderQueuedNames()}</> : null}
        {editorRows.map((row,index)=>!editor.item&&(editor.kind==='department'||placement!=='company') ? null : <div className="organization-batch-row" key={row.id}><div className={'organization-batch-fields'+(editor.kind==='position' ? ' organization-batch-fields--position' : '')}>{editor.item ? <><FormField label={t(editor.kind==='position' ? 'org.positionName' : 'org.departmentName')+' '+(index+1)} htmlFor={'organization-name-'+row.id}><TextField id={'organization-name-'+row.id} autoFocus={index===0&&(editor.kind!=='department'||Boolean(editor.item))} value={row.name} placeholder={t(editor.kind==='position' ? 'org.positionNamePlaceholder' : 'org.departmentNamePlaceholder')} onChange={event=>updateDraft(row.id,{ name:event.target.value })} required /></FormField>{editor.kind==='department' ? <FormField label={t('org.status')} htmlFor={'organization-status-'+row.id}><select id={'organization-status-'+row.id} className="ui-text-field" value={row.status} onChange={event=>updateDraft(row.id,{ status:event.target.value as Draft['status'] })}><option value="active">{t('org.statusActive')}</option><option value="inactive">{t('org.statusInactive')}</option></select></FormField> : null}{!editor.item ? <Button variant="ghost" className="organization-remove-row" aria-label={t('org.removeRow',{ count:index+1 })} disabled={editor.kind!=='department'&&drafts.length===1} onClick={()=>setDrafts(current=>current.filter(d=>d.id!==row.id))}>×</Button> : null}</> : <h3 className="organization-queued-position-name">{row.name}</h3>}</div>
          {editor.kind==='position'&&placement==='company' ? <fieldset className="organization-managed-choices"><legend>{t('org.managesDepartments')}</legend>{roots.map(d=><label key={d.id}><input type="checkbox" checked={row.managedIds.includes(d.id)} disabled={editorRows.some(other=>other.id!==row.id&&other.managedIds.includes(d.id))} onChange={()=>updateDraft(row.id,{ managedIds:row.managedIds.includes(d.id) ? row.managedIds.filter(id=>id!==d.id) : [...row.managedIds,d.id] })} /><span>{d.name}</span>{d.managerPositionId&&d.managerPositionId!==editor.item?.id ? <small>{t('org.reassignFrom',{ name:positions.find(p=>p.id===d.managerPositionId)?.name||'' })}</small> : null}</label>)}</fieldset> : null}
        </div>)}
      </fieldset>
      {editorError ? <p className="organization-create-dialog__error" role="alert">{editorError}</p> : null}
      <div className="organization-create-dialog__actions">{editor.kind==='position'&&!editor.item&&totalToAdd ? <span className="organization-placement-summary">{t('org.positionCount',{ count:totalToAdd })} · {placement==='company' ? t('org.companyWide') : departments.find(d=>d.id===placement)?.name||t('org.chooseDepartment')}</span> : null}<Button variant="secondary" onClick={()=>setEditor(null)} disabled={isSubmitting}>{t('users.cancel')}</Button><Button type="submit" disabled={isSubmitting||!totalToAdd||drafts.some(row=>!row.name.trim())||editor.kind==='position'&&!placement}>{t(isSubmitting ? 'users.saving' : editor.item ? 'users.saveChanges' : editor.kind==='position' ? 'org.addPositionBatch' : 'org.addDepartmentBatch',{ count:totalToAdd })}</Button></div>
    </form></dialog> : null}
    <ConfirmDialog open={Boolean(pendingDelete&&canManage)} title={t(pendingDelete?.kind==='department' ? 'org.deleteDepartmentTitle' : 'org.deletePositionTitle',{ name:pendingDelete?.item.name })} description={<>{deleteError ? <p className="organization-create-dialog__error" role="alert">{deleteError}</p> : null}<p>{t(pendingDelete?.kind==='department' ? 'org.deleteDepartmentImpact' : 'org.deletePositionImpact',{ name:pendingDelete?.item.name })}</p>{dependentPositions ? <p>{t('org.deletePositionDependency',{ count:dependentPositions })}</p> : null}{childDepartments ? <p>{t('org.deleteChildDependency',{ count:childDepartments })}</p> : null}{managedDepartments ? <p>{t('org.managedDepartmentDependency',{ count:managedDepartments })}</p> : null}{activeAssignments ? <p>{t('org.deleteAssignmentDependency',{ count:activeAssignments })}</p> : null}</>} warning={t(deleteBlocked ? 'org.deleteBlocked' : 'org.deleteMockWarning')} confirmDisabled={deleteBlocked} confirmLabel={t('users.actionDelete')} cancelLabel={t('users.cancel')} busyLabel={t('org.deleting')} busy={isDeleting} onConfirm={()=>void remove()} onCancel={()=>setPendingDelete(null)} />
  </div>
}
