import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { TablePanel } from '@/components/ui/TablePanel'
import { TablePagination } from '@/components/ui/TablePagination'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { Button } from '@/components/ui/Button'
import { RowMenu } from '@/components/ui/RowMenu'
import { IconButton } from '@/components/ui/IconButton'
import { IconPencil, IconTrash } from '@/components/icons/Icons'
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
import type { DatabaseDepartment as OrganizationNode, DatabasePosition as PositionRecord } from '@/modules/core/identity/services/organizationService'
import { fetchOrganizationStructure, createOrganizationBatch, fetchDepartmentRemovalImpact, removeDepartmentWithEmployees, updateOrganization, deletePosition, deletePositions, updatePosition } from '@/modules/core/identity/services/organizationService'
import './IdentityPage.css'
import { DepartmentRemovalEmployees, type EmployeeRemovalPlan } from './DepartmentRemovalEmployees'
import './OrganizationPage.css'
import './UsersDirectoryDesign.css'

type PositionSortKey = 'name' | 'department' | 'level' | 'employees' | 'status'

type Editor = { kind:'department' | 'position'; organizationId?:string; parentId?:string; item?:OrganizationNode | PositionRecord }
type Draft = { id:number; name:string; status:OrganizationNode['status']; managedIds:string[]; positionId?:string }



export function OrganizationPage() {
  const { t, i18n } = useTranslation()
  const setShellHeader=useContext(AppShellHeaderContext)
  const companyId=useCompanyStore(state => state.companyId)
  const companies=useCompanyStore(state => state.companies)
  const sessionUser=useAuthStore(state => state.user)
  const accessToken=useAuthStore(state => state.accessToken)
  const [databaseCompanyId,setDatabaseCompanyId]=useState('')
  const [hasManagementAccess,setHasManagementAccess]=useState(false)
  const [items,setItems]=useState<OrganizationNode[]>([])
  const [positions,setPositions]=useState<PositionRecord[]>([])
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>({})
  const [tab,setTab]=useState<'departments' | 'positions'>('departments')
  const [search,setSearch]=useState('')
  const [departmentFilter,setDepartmentFilter]=useState('all')
  const [levelFilter,setLevelFilter]=useState('all')
  const [statusFilter,setStatusFilter]=useState('active')
  const [positionSort,setPositionSort]=useState<{ key:PositionSortKey; descending:boolean }>({ key:'name',descending:false })
  const [positionLevel,setPositionLevel]=useState<NonNullable<PositionRecord['level']>>('staff')
  const [pageSize,setPageSize]=useState(0)
  const [autoPageSize,setAutoPageSize]=useState(10)
  const autoFitRowMeasurement=useRef({ width:0,height:0 })
  const [page,setPage]=useState(1)
  const tableRef=useRef<HTMLDivElement>(null)
  const selectAllPositionsRef=useRef<HTMLInputElement>(null)
  const [pendingDelete,setPendingDelete]=useState<{ kind:Editor['kind']; item:OrganizationNode | PositionRecord }|null>(null)
  const [selectedPositionIds,setSelectedPositionIds]=useState<string[]>([])
  const [pendingBulkDeleteIds,setPendingBulkDeleteIds]=useState<string[]>([])
  const [isDeleting,setIsDeleting]=useState(false)
  const [removalImpact,setRemovalImpact]=useState<Awaited<ReturnType<typeof fetchDepartmentRemovalImpact>>|null>(null)
  const [impactLoading,setImpactLoading]=useState(false)
  const [removalMode,setRemovalMode]=useState<'retain'|'reassign'>('retain')
  const [employeeRemovalPlans,setEmployeeRemovalPlans]=useState<Record<string,EmployeeRemovalPlan>>({})
  useEffect(()=>{
    setRemovalImpact(null);setEmployeeRemovalPlans({});setRemovalMode('retain')
    if(pendingDelete?.kind!=='department') {setImpactLoading(false);return}
    const controller=new AbortController()
    setImpactLoading(true)
    fetchDepartmentRemovalImpact(pendingDelete.item as OrganizationNode,controller.signal).then(result=>{
      if(controller.signal.aborted)return
      setRemovalImpact(result);setRemovalMode(result.employeeCount&&result.canReassign ? 'reassign' : 'retain')
    }).catch(err=>{if(!controller.signal.aborted)setDeleteError(err instanceof ApiError ? err.message : t('org.errLoadOrganizations'))})
      .finally(()=>{if(!controller.signal.aborted)setImpactLoading(false)})
    return()=>controller.abort()
  },[pendingDelete?.item.id,companyId])

  const [editor,setEditor]=useState<Editor|null>(null)
  const [pendingDeactivate,setPendingDeactivate]=useState<{ department:OrganizationNode; source:'toggle' | 'editor' }|null>(null)
  const [drafts,setDrafts]=useState<Draft[]>([])
  const [inputName,setInputName]=useState('')
  const [nameError,setNameError]=useState<string|null>(null)
  const [pendingManagedIds,setPendingManagedIds]=useState<string[]>([])
  const draftId=useRef(0)
  const [placement,setPlacement]=useState('')
  const [managerId,setManagerId]=useState('')
  const [departmentPlacementTab,setDepartmentPlacementTab]=useState<'parent'|'manager'>('parent')
  const [error,setError]=useState<string|null>(null)
  const [loadError,setLoadError]=useState<{ message:string; retryable:boolean }|null>(null)
  const [reloadKey,setReloadKey]=useState(0)
  const [refreshError,setRefreshError]=useState<string|null>(null)
  const [isRefreshing,setIsRefreshing]=useState(false)
  const batchRequestRef=useRef<{ requestId:string; fingerprint:string }|null>(null)
  const managedDepartmentVersionsRef=useRef<Record<string,number>>({})
  const [deleteError,setDeleteError]=useState<string|null>(null)
  const [deleteConflict,setDeleteConflict]=useState(false)
  useEffect(()=>setDeleteConflict(false),[pendingDelete?.item.id,pendingBulkDeleteIds])
  const [updatingStatusId,setUpdatingStatusId]=useState<string|null>(null)
  const [editorError,setEditorError]=useState<string|null>(null)
  const [successMessage,setSuccessMessage]=useState('')
  const [recentIds,setRecentIds]=useState<string[]>([])
  const [isLoading,setIsLoading]=useState(true)
  const [isSubmitting,setIsSubmitting]=useState(false)
  const submittingRef=useRef(false)
  const createDialogRef=useRef<HTMLDialogElement>(null)
  const canManage=Boolean(!isLoading&&!loadError&&companies.some(company=>company.value===companyId)&&hasManagementAccess)
  const isEditorOpen=Boolean(editor&&canManage&&!pendingDeactivate)
  const company=companies.find(item => item.value===companyId)
  const departments=items.filter(item => item.type==='department')
  const departmentIds=new Set(departments.map(item => item.id))
  const roots=departments.filter(item => !item.parentId||!departmentIds.has(item.parentId))
  const leaders=positions.filter(item => !item.organizationId||!departmentIds.has(item.organizationId))
  const query=search.trim().toLocaleLowerCase()
  const busy=isSubmitting||isDeleting||isRefreshing||Boolean(refreshError)
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
    const controller=new AbortController()
    batchRequestRef.current=null; setRefreshError(null); setIsRefreshing(false); setEditor(null); setPendingDelete(null); setPendingDeactivate(null); setItems([]); setPositions([]); setDatabaseCompanyId(''); setHasManagementAccess(false); setError(null); setLoadError(null); setDeleteError(null); setSuccessMessage(''); setRecentIds([])
    if (!companyId||!companies.some(company=>company.value===companyId)) { setIsLoading(false); return }
    setIsLoading(true)
    fetchOrganizationStructure(companyId,controller.signal).then(result => {
      if (!current) return
      setItems(result.departments); setPositions(result.positions); setDatabaseCompanyId(result.companyId); setHasManagementAccess(result.canManage)
    }).catch(err => {
      if (!current) return
      const status=err instanceof ApiError ? err.status : undefined
      setLoadError({ message:status===401 ? t('org.sessionExpired') : err instanceof ApiError ? err.message : t('org.errLoadOrganizations'),retryable:status!==401&&status!==403 })
    }).finally(() => { if (current) setIsLoading(false) })
    return () => { current=false;controller.abort() }
  },[companyId,companies,sessionUser?.id,accessToken,t,reloadKey])

  useEffect(() => { setCollapsed({}); setSearch(''); setDepartmentFilter('all'); setLevelFilter('all'); setStatusFilter('active'); setPositionSort({ key:'name',descending:false }); setPage(1) },[companyId,sessionUser?.id])

  async function refreshStructure(scope:string) {
    const actorId=useAuthStore.getState().user?.id
    const current=()=>useCompanyStore.getState().companyId===scope&&useAuthStore.getState().user?.id===actorId
    setIsRefreshing(true)
    try {
      const result=await fetchOrganizationStructure(scope)
      if (!current()) return
      setItems(result.departments); setPositions(result.positions); setHasManagementAccess(result.canManage); setRefreshError(null)
    } catch(err) {
      if (!current()) return
      if (err instanceof ApiError&&(err.status===401||err.status===403)) {
        setItems([]); setPositions([]); setHasManagementAccess(false)
        setLoadError({ message:err.status===401 ? t('org.sessionExpired') : err.message,retryable:false })
      } else setRefreshError(t('org.savedRefreshFailed'))
    } finally { if (current()) setIsRefreshing(false) }
  }

  function openEditor(next:Editor) {
    batchRequestRef.current=null
    managedDepartmentVersionsRef.current=Object.fromEntries(departments.map(department=>[department.id,department.version]))
    const organization=next.kind==='department' ? next.item as OrganizationNode|undefined : undefined
    const position=next.kind==='position' ? next.item as PositionRecord|undefined : undefined
    setEditorError(null)
    setInputName(''); setNameError(null); setPendingManagedIds([])
    setPlacement(next.kind==='department' ? organization?.parentId&&departmentIds.has(organization.parentId) ? organization.parentId : next.parentId||'' : position ? departmentIds.has(position.organizationId||'') ? position.organizationId! : 'company' : next.organizationId||'')
    setManagerId(organization?.managerPositionId||'')
    setDepartmentPlacementTab(organization?.managerPositionId ? 'manager' : 'parent')
    setPositionLevel(position&&(!position.organizationId||!departmentIds.has(position.organizationId)) ? 'executive' : position?.level==='manager' ? 'manager' : 'staff')
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

  async function save(event?:FormEvent,confirmed=false) {
    event?.preventDefault()
    if (!editor||!canManage||submittingRef.current||isRefreshing||refreshError) return
    if (!confirmed&&editor.kind==='department'&&editor.item?.status==='active'&&drafts[0]?.status==='inactive'&&departments.some(d=>isDescendant(d,editor.item!.id))) {
      setPendingDeactivate({ department:editor.item as OrganizationNode,source:'editor' }); return
    }
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
    let refreshAfterSave=false
    setIsSubmitting(true); setEditorError(null); setError(null)
    try {
      if (!editor.item) {
        const payload:Parameters<typeof createOrganizationBatch>[1]=editor.kind==='department' ? {
          departments:rows.map(row=>({ name:row.name,status:row.status,parentId:placement||null,managerPositionId:placement ? null : managerId||null }))
        } : {
          positions:rows.map(row=>({ name:row.name,organizationId:placement==='company' ? null : placement,level:placement==='company' ? 'executive' : positionLevel,managedDepartmentIds:placement==='company' ? row.managedIds : [],managedDepartmentVersions:managedDepartmentVersionsRef.current }))
        }
        const fingerprint=JSON.stringify({ companyId:databaseCompanyId,payload })
        if (batchRequestRef.current?.fingerprint!==fingerprint) batchRequestRef.current={ requestId:crypto.randomUUID(),fingerprint }
        const result=await createOrganizationBatch(databaseCompanyId,payload,batchRequestRef.current.requestId)
        if (useCompanyStore.getState().companyId!==scope) return
        setItems(result.departments); setPositions(result.positions); setDrafts([]); batchRequestRef.current=null
        created.push(...(editor.kind==='department' ? result.departmentIds : result.positionIds))
      } else if (editor.kind==='department') {
        const row=rows[0]
        const result=await updateOrganization(editor.item as OrganizationNode,{ name:row.name,status:row.status,parentId:placement||null,managerPositionId:placement ? null : managerId||null })
        if (useCompanyStore.getState().companyId!==scope) return
        setItems(current=>current.map(item=>item.id===result.id ? result : item)); created.push(result.id)
      } else {
        const row=rows[0]
        const updated=await updatePosition(editor.item as PositionRecord,{ name:row.name,organizationId:placement==='company' ? null : placement,level:placement==='company' ? 'executive' : positionLevel,managedDepartmentIds:placement==='company' ? row.managedIds : [],managedDepartmentVersions:managedDepartmentVersionsRef.current })
        if (useCompanyStore.getState().companyId!==scope) return
        setPositions(current=>current.map(item=>item.id===updated.id ? updated : item)); created.push(updated.id); refreshAfterSave=true
      }
      if (useCompanyStore.getState().companyId!==scope) return
      setRecentIds(created); setSearch(''); setTab(editor.kind==='position'&&!editor.item ? 'positions' : 'departments'); setCollapsed({}); setSuccessMessage(t(editor.item ? 'org.saved' : 'org.addedItems',{ count:created.length })); setEditor(null)
    } catch(err) {
      if (useCompanyStore.getState().companyId===scope) setEditorError(err instanceof ApiError ? err.message : t('org.errUpdateOrganization'))
    } finally { submittingRef.current=false; setIsSubmitting(false); if (confirmed) setPendingDeactivate(null) }
    if (refreshAfterSave&&useCompanyStore.getState().companyId===scope) void refreshStructure(scope)
  }

  const deletingDepartmentIds=new Set<string>()
  if(pendingDelete?.kind==='department') {
    deletingDepartmentIds.add(pendingDelete.item.id)
    let expanded=true
    while(expanded) {
      expanded=false
      for(const department of departments) if(department.parentId&&deletingDepartmentIds.has(department.parentId)&&!deletingDepartmentIds.has(department.id)) { deletingDepartmentIds.add(department.id); expanded=true }
    }
  }
  const deletingPositions=pendingDelete ? positions.filter(position=>pendingDelete.kind==='department' ? deletingDepartmentIds.has(position.organizationId||'') : position.id===pendingDelete.item.id) : []
  const dependentPositions=pendingDelete?.kind==='department' ? deletingPositions.length : 0
  const childDepartments=Math.max(0,deletingDepartmentIds.size-1)
  const cascadeDepartments=childDepartments ? t('org.deleteCascadeDepartments',{ count:childDepartments }) : ''
  const cascadePositions=dependentPositions ? t('org.deleteCascadePositions',{ count:dependentPositions }) : ''
  const cascadeItems=cascadeDepartments&&cascadePositions ? t('org.deleteCascadeBoth',{ departments:cascadeDepartments,positions:cascadePositions }) : cascadeDepartments||cascadePositions
  const managedDepartments=departments.filter(d=>deletingPositions.some(position=>position.id===d.managerPositionId)).length
  const deleteBlocked=Boolean(managedDepartments)

  const removalIncomplete=pendingDelete?.kind==='department'&&(impactLoading||!removalImpact)
  const removalEmployeeControls=pendingDelete?.kind==='department' ? <div className="organization-removal-placement">
    {impactLoading ? <p role="status">{t('org.loadingRemovalImpact')}</p> : removalImpact?.employeeCount ?
      <DepartmentRemovalEmployees key={pendingDelete.item.id} impact={removalImpact} departments={departments.filter(department=>!deletingDepartmentIds.has(department.id)&&departmentActive(department))} positions={positions} mode={removalMode} plans={employeeRemovalPlans} busy={isDeleting} onModeChange={setRemovalMode} onPlansChange={setEmployeeRemovalPlans} /> : null}
  </div> : null

  async function remove() {
    if (!canManage||!pendingDelete||deleteBlocked||submittingRef.current) return
    submittingRef.current=true
    const { kind,item:{ id } }=pendingDelete
    const scope=companyId
    setError(null); setDeleteError(null); setIsDeleting(true)
    try {
      if (kind==='department') {
        if(!removalImpact)return
        await removeDepartmentWithEmployees(pendingDelete.item as OrganizationNode,{mode:removalMode,employeeMappings:removalMode==='reassign' ? Object.entries(employeeRemovalPlans).map(([userId,plan])=>({userId,...plan})) : [],snapshot:removalImpact.snapshot})
      }
      else await deletePosition(pendingDelete.item as PositionRecord)
      if (useCompanyStore.getState().companyId!==scope) return
      if (kind==='department') { setItems(current => current.filter(item => !deletingDepartmentIds.has(item.id))); setPositions(current => current.filter(position => !deletingDepartmentIds.has(position.organizationId||''))) }
      else setPositions(current => current.filter(item => item.id!==id))
      if (editor?.item&&(editor.item.id===id||deletingDepartmentIds.has(editor.item.id)||deletingPositions.some(position=>position.id===editor.item?.id))) setEditor(null)
      setPendingDelete(null)
      void refreshStructure(scope)
    } catch(err) { if (useCompanyStore.getState().companyId===scope) {setDeleteError(err instanceof ApiError ? err.message : t('org.errDeleteOrganization'));setDeleteConflict(err instanceof ApiError&&[403,404,409].includes(err.status||0))} }
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
        const updated=await updateOrganization(item as OrganizationNode,{ status:nextStatus })
        if (useCompanyStore.getState().companyId===scope) setItems(current=>current.map(d=>d.id===updated.id ? updated : d))
      } else {
        const updated=await updatePosition(item as PositionRecord,{ status:nextStatus })
        if (useCompanyStore.getState().companyId===scope) setPositions(current=>current.map(p=>p.id===updated.id ? updated : p))
      }
    }
    catch(err) { if (useCompanyStore.getState().companyId===scope) setError(err instanceof ApiError ? err.message : t('org.errUpdateOrganization')) }
    finally { submittingRef.current=false; setIsSubmitting(false); setUpdatingStatusId(null); setPendingDeactivate(null) }
  }

  function inactiveParent(department:OrganizationNode) {
    let parentId=department.parentId
    const visited=new Set<string>()
    while (parentId) {
      if (visited.has(parentId)) return department
      visited.add(parentId)
      const parent=departments.find(item=>item.id===parentId)
      if (!parent) return null
      if (parent.status==='inactive') return parent
      parentId=parent.parentId
    }
    return null
  }
  function departmentActive(department:OrganizationNode) { return department.status==='active'&&!inactiveParent(department) }
  function inactivePositionDepartment(position:PositionRecord) {
    const department=departments.find(item=>item.id===position.organizationId)
    return department ? department.status==='inactive' ? department : inactiveParent(department) : null
  }
  function effectivePositionStatus(position:PositionRecord) {
    return position.status==='inactive'||inactivePositionDepartment(position) ? 'inactive' : 'active'
  }
  function requestStatusChange(item:OrganizationNode | PositionRecord,kind:Editor['kind']) {
    if (kind==='department'&&item.status==='active'&&departments.some(d=>isDescendant(d,item.id))) {
      setError(null); setPendingDeactivate({ department:item as OrganizationNode,source:'toggle' })
    } else void toggleStatus(item,kind)
  }

  function actions(kind:Editor['kind'],item:OrganizationNode | PositionRecord,panel=false) {
    if (!canManage) return <span className="organization-menu-spacer" />
    if (panel) return <div className="identity-inline-actions identity-directory-actions">{item.status==='active' ? <IconButton label={t('users.actionEdit')} disabled={busy} onClick={()=>openEditor({ kind,item })}><IconPencil /></IconButton> : null}{item.status==='inactive' ? <IconButton label={t('org.removeAction')} variant="danger" disabled={busy} onClick={()=>{setDeleteError(null);setPendingDelete({ kind,item })}}><IconTrash /></IconButton> : null}</div>
    return <RowMenu label={t('org.itemActions',{ name:item.name })} disabled={busy} items={[
      ...(kind==='department' ? [
        { id:'add-subdepartment',label:t('org.addSubdepartment'),onSelect:() => openEditor({ kind:'department',parentId:item.id }) },
      ] : []),
      { id:'edit',label:t('users.actionEdit'),onSelect:() => openEditor({ kind,item }) },
      ...(kind==='position'&&item.status==='active'&&inactivePositionDepartment(item as PositionRecord) ? [] : [{ id:'delete',label:t('org.removeAction'),destructive:true,onSelect:() => { setDeleteError(null); setPendingDelete({ kind,item }) } }]),
    ]} />
  }

  function status(value:OrganizationNode['status'],item:OrganizationNode | PositionRecord,kind:Editor['kind']='department') {
    const inherited=kind==='department' ? inactiveParent(item as OrganizationNode) : inactivePositionDepartment(item as PositionRecord)
    if (inherited) return <span className="organization-status organization-status--inactive">{t('org.statusInactive')}</span>
    const className='organization-status organization-status--'+value
    const label=t(updatingStatusId===item.id ? 'org.updatingStatus' : value==='active' ? 'org.statusActive' : 'org.statusInactive')
    return canManage ? <button type="button" className={className} role="switch" aria-checked={value==='active'} aria-label={t('org.itemStatus',{ name:item.name })} title={t(value==='active' ? 'org.setInactive' : 'org.setActive')} disabled={busy} onClick={()=>requestStatusChange(item,kind)}>{label}</button> : <span className={className}>{label}</span>
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
  function renderPositionDepartment(position:PositionRecord) {
    const department=departments.find(d=>d.id===position.organizationId)
    if (department) return department.name
    const managed=departments.filter(d=>d.managerPositionId===position.id).map(d=>d.name)
    return <span className="organization-position-placement"><span className="organization-position-placement__badge">{t('org.companyWidePlacement')}</span>{managed.length ? <span className="organization-position-placement__managed">{t('org.managedDepartmentNames',{ names:new Intl.ListFormat(i18n.language,{ style:'short',type:'conjunction' }).formatToParts(managed).map(part=>part.type==='literal' ? part.value.replace(/,\s*&/g,' &') : part.value).join('') })}</span> : null}</span>
  }
  function displayedLevel(position:PositionRecord) {
    return !departmentIds.has(position.organizationId||'') ? 'executive' : position.level
  }
  const filteredPositions=positions.filter(position=>(!query||position.name.toLocaleLowerCase().includes(query))
    &&(departmentFilter==='all'||position.organizationId===departmentFilter)
    &&(levelFilter==='all'||displayedLevel(position)===levelFilter)
    &&(statusFilter==='all'||effectivePositionStatus(position)===statusFilter)).sort((a,b)=>{
      const value=(position:PositionRecord)=>{
        switch(positionSort.key) {
          case 'name': return position.name
          case 'department': return departments.find(d=>d.id===position.organizationId)?.name||t('org.companyWidePlacement')
          case 'level': return displayedLevel(position) ? t(displayedLevel(position)==='executive' ? 'org.levelExecutive' : displayedLevel(position)==='manager' ? 'org.levelManager' : 'org.levelStaff') : t(position.level===null ? 'org.levelNotApplicable' : 'org.levelNotSet')
          case 'employees': return employeeCount(position.id)
          case 'status': return t(effectivePositionStatus(position)==='active' ? 'org.statusActive' : 'org.statusInactive')
        }
      }
      const left=value(a),right=value(b)
      const order=typeof left==='number'&&typeof right==='number' ? left-right : String(left).localeCompare(String(right),i18n.language)
      return positionSort.descending ? -order : order
    })
  const selectedPositions=statusFilter==='inactive'&&canManage ? filteredPositions.filter(position=>position.status==='inactive'&&selectedPositionIds.includes(position.id)) : []
  const bulkPositions=positions.filter(position=>pendingBulkDeleteIds.includes(position.id))
  const bulkManaged=departments.filter(department=>pendingBulkDeleteIds.includes(department.managerPositionId||'')).length
  const bulkDeleteBlocked=Boolean(bulkManaged)
  useEffect(()=>{setSelectedPositionIds([]);setPendingBulkDeleteIds([])},[companyId,sessionUser?.id,tab,search,departmentFilter,levelFilter,statusFilter])
  async function removeSelectedPositions() {
    if (!canManage||bulkDeleteBlocked||!bulkPositions.length||submittingRef.current||bulkPositions.some(position=>position.status!=='inactive')) return
    submittingRef.current=true
    const scope=companyId
    setDeleteError(null);setIsDeleting(true)
    try {
      await deletePositions(databaseCompanyId,bulkPositions)
      if (useCompanyStore.getState().companyId!==scope) return
      const deleted=new Set(bulkPositions.map(position=>position.id))
      setPositions(current=>current.filter(item=>!deleted.has(item.id)))
      setSelectedPositionIds([]); setPendingBulkDeleteIds([])
      setSuccessMessage(t('org.deletedPositions',{ count:bulkPositions.length }))
    } catch(err) {
      if (useCompanyStore.getState().companyId===scope) {setDeleteError(err instanceof ApiError ? err.message : t('org.errDeleteOrganization'));setDeleteConflict(err instanceof ApiError&&[403,404,409].includes(err.status||0))}
    } finally {submittingRef.current=false;setIsDeleting(false)}
  }
  const effectivePageSize=pageSize||autoPageSize
  const pageCount=Math.max(1,Math.ceil(filteredPositions.length/effectivePageSize))
  const currentPage=Math.min(page,pageCount)
  const visiblePositions=filteredPositions.slice((currentPage-1)*effectivePageSize,currentPage*effectivePageSize)
  const selectableVisiblePositions=visiblePositions.filter(position=>position.status==='inactive')
  const allVisiblePositionsSelected=selectableVisiblePositions.length>0&&selectableVisiblePositions.every(position=>selectedPositionIds.includes(position.id))
  const someVisiblePositionsSelected=selectableVisiblePositions.some(position=>selectedPositionIds.includes(position.id))
  useEffect(()=>{
    if (selectAllPositionsRef.current) selectAllPositionsRef.current.indeterminate=someVisiblePositionsSelected&&!allVisiblePositionsSelected
  },[someVisiblePositionsSelected,allVisiblePositionsSelected,statusFilter,canManage])
  function employeeCount(positionId:string) {
    return positions.find(position=>position.id===positionId)?.employeeCount||0
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
    const input=<TagInput id="organization-department-entry" hint={t(editor.kind==='department' ? 'org.departmentQueueHint' : 'org.positionQueueHint')} autoFocus disabled={isSubmitting} value={inputName} onValueChange={setInputName} error={nameError} onErrorChange={setNameError} validate={validateName} items={drafts} placeholder={t(editor.kind==='department' ? 'org.departmentQueuePlaceholder' : positionLevel==='executive' ? 'org.executiveQueuePlaceholder' : 'org.positionQueuePlaceholder')} onAdd={name=>{const id=++draftId.current;setDrafts(current=>[...current,{ id,name,status:'active',managedIds:pendingManagedIds }]);setPendingManagedIds([])}} onRemove={id=>setDrafts(current=>current.filter(row=>row.id!==id))} removeLabel={name=>t(editor.kind==='department' ? 'org.removeDepartment' : 'org.removePosition',{ name })} />
    return editor.kind==='department' ? <FormField label={t('org.departmentName')} htmlFor="organization-department-entry">{input}</FormField> : <div className="organization-editor-fields"><h3 className="organization-flow-heading organization-flow-heading--placement"><label htmlFor="organization-department-entry">{t('org.positionNamesStep')}</label></h3>{input}</div>
  }

  return <div className="identity-page organization-page">
    <FlashToasts error={error} message={successMessage} onClearError={()=>setError(null)} onClearMessage={()=>setSuccessMessage('')} />
    {refreshError ? <div className="organization-refresh-notice" role="alert"><span>{refreshError}</span><Button variant="secondary" disabled={isRefreshing} onClick={()=>void refreshStructure(companyId)}>{t(isRefreshing ? 'org.refreshing' : 'org.retry')}</Button></div> : null}
    <section className="organization-panel" aria-busy={isLoading}>
      <div className="organization-toolbar"><div className="organization-tabs" role="tablist" aria-label={t('org.views')}>
        {(['departments','positions'] as const).map((value,index)=><button key={value} id={'organization-tab-'+value} type="button" role="tab" aria-selected={tab===value} aria-controls={'organization-panel-'+value} tabIndex={tab===value ? 0 : -1} onClick={()=>setTab(value)} onKeyDown={event=>{if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault();const next=event.key==='Home' ? 'departments' : event.key==='End' ? 'positions' : index ? 'departments' : 'positions';setTab(next);document.getElementById('organization-tab-'+next)?.focus()}}}>{t(value==='departments' ? 'org.departmentsTitle' : 'org.positionsTab')}</button>)}
      </div>{tab==='departments' ? <div className="organization-search"><IconSearch aria-hidden="true" /><TextField type="search" disabled={isLoading||Boolean(loadError)||!company} aria-label={t('org.search')} placeholder={t('org.search')} value={search} onChange={event=>setSearch(event.target.value)} /></div> : null}{tab==='departments'&&canManage&&companyId ? <Button disabled={isLoading||busy} onClick={()=>openEditor({ kind:'department' })}>{t('org.addDepartment')}</Button> : null}</div>
      {isLoading ? <div className="organization-load-state" role="status"><p>{t('org.loadingStructure')}</p><div className="organization-skeleton" aria-hidden="true">{[0,1,2].map(index=><div key={index}><span /><span /></div>)}</div></div> : loadError ? <div className="organization-load-state organization-load-state--error" role="alert"><h2>{t('org.loadFailed')}</h2><p>{loadError.message}</p>{loadError.retryable ? <Button variant="secondary" onClick={()=>{setIsLoading(true);setReloadKey(current=>current+1)}}>{t('org.retry')}</Button> : null}</div> : !company ? <p className="identity-empty">{t('org.selectActiveCompany')}</p> : <>
        <div id="organization-panel-departments" role="tabpanel" aria-labelledby="organization-tab-departments" hidden={tab!=='departments'}>
          {visibleLeaders.map(leader=>{const managed=roots.filter(d=>d.managerPositionId===leader.id),key='leader-'+leader.id,open=Boolean(query)||!(collapsed[key]??true);return <section className="organization-leadership" key={leader.id}><div className="organization-department__header"><button className="organization-expand" type="button" aria-expanded={open} aria-controls={key} onClick={()=>setCollapsed(current=>({ ...current,[key]:!(current[key]??true) }))}><IconChevron aria-hidden="true" /><span className="organization-department__label"><span className="organization-department__name">{leader.name}</span><span className="organization-count">{t('org.companyWide')}</span></span></button><div className="organization-header-meta"><span className="organization-count">{t('org.departmentCount',{ count:managed.length })}</span></div>{actions('position',leader)}</div><div id={key} hidden={!open}>{managed.length ? <ul className="organization-branches organization-managed">{managed.map(d=>renderDepartment(d,Boolean(query&&leader.name.toLocaleLowerCase().includes(query))))}</ul> : <p className="organization-muted organization-leadership-empty">{t('org.noManagedDepartments')}</p>}</div></section>})}
          <ul className="organization-branches">{ungrouped.map(d=>renderDepartment(d))}</ul>
          {!visibleLeaders.length&&!ungrouped.some(matches) ? <p className="identity-empty">{t(query ? 'org.noSearchResults' : 'org.noDepartments')}</p> : null}
        </div>
        <div id="organization-panel-positions" className="organization-position-panel" role="tabpanel" aria-labelledby="organization-tab-positions" hidden={tab!=='positions'}>
          <TablePanel className="organization-position-directory">
          <TableToolbar
            search={<><IconSearch aria-hidden="true" /><TextField type="search" aria-label={t('org.searchPositions')} placeholder={t('org.searchPositions')} value={search} onChange={event=>setSearch(event.target.value)} /></>}
            filters={<>
            <SidebarSelect id="organization-filter-department" label={t('org.department')} value={departmentFilter} onChange={setDepartmentFilter} options={[{value:'all',label:t('org.allDepartments')},...departments.map(d=>({value:d.id,label:d.name}))]} />
            <SidebarSelect id="organization-filter-level" label={t('org.level')} value={levelFilter} onChange={setLevelFilter} options={[{value:'all',label:t('org.allLevels')},...(['executive','manager','staff'] as const).map(value=>({value,label:t(value==='executive' ? 'org.levelExecutive' : value==='manager' ? 'org.levelManager' : 'org.levelStaff')}))]} />
            <SidebarSelect id="organization-filter-status" label={t('org.status')} value={statusFilter} onChange={setStatusFilter} options={[{value:'all',label:t('org.allStatus')},{value:'active',label:t('org.statusActive')},{value:'inactive',label:t('org.statusInactive')}]} />
            </>}
            actions={canManage&&companyId ? <>{selectedPositions.length>1 ? <Button variant="danger" disabled={busy} onClick={()=>{setDeleteError(null);setPendingBulkDeleteIds(selectedPositions.map(position=>position.id))}}><IconTrash aria-hidden="true" />{t('org.removeAction')}</Button> : null}<Button disabled={isLoading||busy} onClick={()=>openEditor({ kind:'position' })}>{t('org.addPosition')}</Button></> : null}
          />
            <div className="identity-table-wrap identity-directory-scroll" ref={tableRef} tabIndex={0} aria-label={t('org.positionsTab')}>
              <table className={'identity-table identity-table--packed directory-design-table'+(pageSize===0 ? ' directory-design-table--auto-fit' : '')}>
                <thead><tr>{([['name','org.positionName'],['department','org.department'],['level','org.level'],['employees','org.employees'],['status','org.status']] as const).map(([key,label])=><th key={key} scope="col" aria-sort={positionSort.key===key ? positionSort.descending ? 'descending' : 'ascending' : 'none'}><span className="organization-position-name">{key==='name'&&statusFilter==='inactive'&&canManage ? <input ref={selectAllPositionsRef} type="checkbox" className="organization-position-checkbox" aria-label={t('org.selectAllPositions')} disabled={busy||!selectableVisiblePositions.length} checked={allVisiblePositionsSelected} onChange={event=>{const checked=event.target.checked;setSelectedPositionIds(current=>checked ? [...new Set([...current,...selectableVisiblePositions.map(position=>position.id)])] : current.filter(id=>!selectableVisiblePositions.some(position=>position.id===id)))}} /> : null}<button type="button" className="directory-design-sort" onClick={()=>setPositionSort({ key,descending:positionSort.key===key&&!positionSort.descending })}>{t(label)}<span aria-hidden="true">{positionSort.key===key&&positionSort.descending ? '↓' : '↑'}</span></button></span></th>)}{canManage ? <th scope="col">{t('org.actions')}</th> : null}</tr></thead>
                <tbody>{visiblePositions.map(position=><tr key={position.id}><td><span className="organization-position-name">{statusFilter==='inactive'&&canManage ? <input type="checkbox" className="organization-position-checkbox" aria-label={t(position.status==='inactive' ? 'org.selectPosition' : 'org.inheritedPositionSelection',{ name:position.name })} title={position.status==='inactive' ? undefined : t('org.inheritedPositionSelection',{ name:position.name })} disabled={busy||position.status!=='inactive'} checked={selectedPositionIds.includes(position.id)} onChange={event=>setSelectedPositionIds(current=>event.target.checked ? [...current,position.id] : current.filter(id=>id!==position.id))} /> : null}<span>{position.name}</span></span></td><td>{renderPositionDepartment(position)}</td><td>{displayedLevel(position) ? t(displayedLevel(position)==='executive' ? 'org.levelExecutive' : displayedLevel(position)==='manager' ? 'org.levelManager' : 'org.levelStaff') : t(position.level===null ? 'org.levelNotApplicable' : 'org.levelNotSet')}</td><td><span className="organization-employee-count"><IconUsers aria-hidden="true" /><span>{employeeCount(position.id).toLocaleString(i18n.language)}</span></span></td><td>{status(position.status,position,'position')}</td>{canManage ? <td className="identity-table__actions">{actions('position',position,true)}</td> : null}</tr>)}</tbody>
              </table>
              {!filteredPositions.length ? <div className="organization-position-empty" role="status"><p className="identity-empty">{t(hasPositionFilters ? 'org.noSearchResults' : 'org.noPositions')}</p>{hasPositionFilters ? <Button variant="secondary" onClick={clearPositionFilters}>{t('org.clearFilters')}</Button> : null}</div> : null}
            </div>
        <TablePagination id="organization-page-size" total={filteredPositions.length} pageSize={pageSize} autoPageSize={autoPageSize} effectivePageSize={effectivePageSize} currentPage={currentPage} pageCount={pageCount} pagesLabel={t('org.positionPages')} onPageSizeChange={setPageSize} onPageChange={setPage} />
          </TablePanel>
        </div>
      </>}
    </section>
    {isEditorOpen&&editor ? <dialog ref={createDialogRef} className={'organization-create-dialog'+(editor.kind==='position'&&!editor.item ? ' organization-create-dialog--position-flow' : '')} aria-labelledby="create-department-title" aria-describedby="create-department-description" onCancel={event=>{event.preventDefault();if (!busy) setEditor(null)}}><form aria-busy={isSubmitting} onSubmit={event=>void save(event)}>
      <h2 id="create-department-title">{t(editor.item ? editor.kind==='position' ? 'org.editPosition' : 'org.editDepartment' : editor.kind==='position' ? 'org.addPositions' : 'org.addDepartments')}</h2><p id="create-department-description">{t(editor.kind==='position' ? editor.item ? 'org.positionBatchHint' : positionLevel==='executive' ? 'org.executiveCreationHint' : 'org.positionCreationHint' : 'org.departmentCreationHint')}</p>
      <fieldset disabled={isSubmitting} className="organization-editor-fields">
        {editor.kind==='position'&&!editor.item ? <h3 className="organization-flow-heading">{t('org.positionDetails')}</h3> : null}
        {editor.kind==='position'&&editor.item ? <fieldset className="organization-scope"><legend>{t(editor.item ? 'org.positionBelongsTo' : 'org.positionType')}</legend><label><input type="radio" name="position-scope" checked={placement!=='company'} onChange={()=>{setPlacement('');setPositionLevel('staff')}} />{t(editor.item ? 'org.departmentScope' : 'org.departmentPosition')}</label><label><input type="radio" name="position-scope" checked={placement==='company'} onChange={()=>{setPlacement('company');setPositionLevel('executive')}} />{t(editor.item ? 'org.companyWide' : 'org.executivePosition')}</label></fieldset> : null}
        {editor.kind==='department' ? <div className="organization-tabs organization-placement-tabs" role="tablist" aria-label={t('org.departmentPlacement')}>
          {(['parent','manager'] as const).map(mode=><button key={mode} type="button" role="tab" id={'department-placement-tab-'+mode} aria-controls="department-placement-panel" aria-selected={departmentPlacementTab===mode} tabIndex={departmentPlacementTab===mode ? 0 : -1} onClick={()=>{setDepartmentPlacementTab(mode);if(mode==='parent') setManagerId('');else setPlacement('')}} onKeyDown={event=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
            event.preventDefault()
            const next=event.key==='Home' ? 'parent' : event.key==='End' ? 'manager' : mode==='parent' ? 'manager' : 'parent'
            setDepartmentPlacementTab(next);if(next==='parent') setManagerId('');else setPlacement('')
            document.getElementById('department-placement-tab-'+next)?.focus()
          }}>{t(mode==='parent' ? 'org.hierarchy' : 'org.leadership')}</button>)}
        </div> : null}
        <div className="organization-editor-fields" id={editor.kind==='department' ? 'department-placement-panel' : undefined} role={editor.kind==='department' ? 'tabpanel' : undefined} aria-labelledby={editor.kind==='department' ? 'department-placement-tab-'+departmentPlacementTab : undefined}>
        {editor.kind==='position'&&(!editor.item||placement!=='company') ? <FormField label={t('org.level')} htmlFor="organization-position-level" hint={!editor.item ? t('org.levelForAll') : undefined}><SelectField id="organization-position-level" label={t('org.level')} value={positionLevel} onChange={value=>{setPositionLevel(value as NonNullable<PositionRecord['level']>);if(!editor.item){if(value==='executive') setPlacement('company');else if(placement==='company') setPlacement('')}}} options={[{value:'staff',label:t('org.levelStaff')},{value:'manager',label:t('org.levelManager')},...(!editor.item ? [{value:'executive',label:t('org.levelExecutive')}] : [])]} /></FormField> : null}
        {placement!=='company'&&(editor.kind!=='department'||departmentPlacementTab==='parent') ? <FormField label={t(editor.kind==='department' ? 'org.parentDepartment' : editor.item ? 'org.departmentForAll' : 'org.department')} htmlFor="organization-placement" hint={editor.kind==='position'&&!editor.item ? t('org.positionPlacementHint') : undefined}><SelectField id="organization-placement" label={t(editor.kind==='department' ? 'org.parentDepartment' : editor.item ? 'org.departmentForAll' : 'org.assignPositionsTo')} value={placement} disabled={isSubmitting} onChange={setPlacement} picker={editor.kind==='department' ? { tree:true,searchLabel:t('org.searchDepartments'),clearLabel:t('org.clearPickerSearch'),emptyLabel:t('org.pickerNoResults'),expandLabel:t('org.expandDepartment'),collapseLabel:t('org.collapseDepartment') } : undefined} options={[{ value:'',label:t(editor.kind==='department' ? 'org.noneCompanyLevel' : 'org.chooseDepartment') },...departments.filter(d=>!editor.item||d.id!==editor.item.id&&!isDescendant(d,editor.item.id)).map(d=>({ value:d.id,parentValue:d.parentId,label:d.name+(!departmentActive(d) ? ' ('+t(inactiveParent(d)&&d.status==='active' ? 'org.inactiveParent' : 'org.statusInactive',{ name:inactiveParent(d)?.name })+')' : ''),disabled:editor.kind==='position'&&!departmentActive(d) }))]} /></FormField> : null}
        {editor.kind==='department'&&departmentPlacementTab==='manager' ? <FormField label={t('org.managedByPosition')} htmlFor="organization-manager" hint={placement ? t('org.inheritsManagement') : undefined}><SelectField id="organization-manager" label={t('org.managedByPosition')} value={managerId} disabled={Boolean(placement)||isSubmitting} onChange={setManagerId} picker={{ hideGroupHeadings:true,searchLabel:t('org.searchManagingPositions'),clearLabel:t('org.clearPickerSearch'),emptyLabel:t('org.pickerNoResults'),expandLabel:t('org.expandDepartment'),collapseLabel:t('org.collapseDepartment') }} options={[{ value:'',label:t('org.pickerNoManagingPosition') },...leaders.map(p=>({ value:p.id,label:p.name,groups:roots.some(d=>d.managerPositionId===p.id) ? roots.filter(d=>d.managerPositionId===p.id).map(d=>d.name) : [t('org.companyLevel')] }))]} /></FormField> : null}
        </div>
        {editor.kind!=='position'||editor.item ? <p className="organization-batch-context">{placement==='company' ? t('org.companyWide') : departments.find(d=>d.id===placement)?.name||t('org.companyLevel')}</p> : null}
        {editor.kind==='department' ? renderQueuedNames() : null}
        {editor.kind==='position'&&!editor.item ? renderQueuedNames() : null}
        {editorRows.map((row,index)=>!editor.item&&(editor.kind==='department'||placement!=='company') ? null : <div className="organization-batch-row" key={row.id}><div className={'organization-batch-fields'+(editor.kind==='position' ? ' organization-batch-fields--position' : '')}>{editor.item ? <><FormField label={t(editor.kind==='position' ? 'org.positionName' : 'org.departmentName')+' '+(index+1)} htmlFor={'organization-name-'+row.id}><TextField id={'organization-name-'+row.id} autoFocus={index===0&&(editor.kind!=='department'||Boolean(editor.item))} value={row.name} placeholder={t(editor.kind==='position' ? 'org.positionNamePlaceholder' : 'org.departmentNamePlaceholder')} onChange={event=>updateDraft(row.id,{ name:event.target.value })} required /></FormField>{editor.kind==='department' ? <FormField label={t('org.status')} htmlFor={'organization-status-'+row.id}><SelectField id={'organization-status-'+row.id} label={t('org.status')} value={row.status} onChange={value=>updateDraft(row.id,{ status:value as Draft['status'] })} options={[{value:'active',label:t('org.statusActive')},{value:'inactive',label:t('org.statusInactive')}]} /></FormField> : null}{!editor.item ? <Button variant="ghost" className="organization-remove-row" aria-label={t('org.removeRow',{ count:index+1 })} disabled={editor.kind!=='department'&&drafts.length===1} onClick={()=>setDrafts(current=>current.filter(d=>d.id!==row.id))}>×</Button> : null}</> : <h3 className="organization-queued-position-name">{row.name}</h3>}</div>
          {editor.kind==='position'&&placement==='company' ? <fieldset className="organization-managed-choices"><legend>{t('org.managesDepartments')}</legend>{roots.map(d=><label key={d.id}><input type="checkbox" checked={row.managedIds.includes(d.id)} disabled={editorRows.some(other=>other.id!==row.id&&other.managedIds.includes(d.id))} onChange={()=>updateDraft(row.id,{ managedIds:row.managedIds.includes(d.id) ? row.managedIds.filter(id=>id!==d.id) : [...row.managedIds,d.id] })} /><span>{d.name}</span>{d.managerPositionId&&d.managerPositionId!==editor.item?.id ? <small>{t('org.reassignFrom',{ name:positions.find(p=>p.id===d.managerPositionId)?.name||'' })}</small> : null}</label>)}</fieldset> : null}
        </div>)}
      </fieldset>
      {editorError ? <p className="organization-create-dialog__error" role="alert">{editorError}</p> : null}
      <div className="organization-create-dialog__actions">{editor.kind==='position'&&!editor.item&&totalToAdd ? <span className="organization-placement-summary">{t('org.positionCount',{ count:totalToAdd })} · {placement==='company' ? t('org.companyWide') : departments.find(d=>d.id===placement)?.name||t('org.chooseDepartment')}</span> : null}<Button variant="secondary" onClick={()=>setEditor(null)} disabled={isSubmitting}>{t('users.cancel')}</Button><Button type="submit" disabled={isSubmitting||!totalToAdd||drafts.some(row=>!row.name.trim())||editor.kind==='position'&&!placement}>{t(isSubmitting ? 'users.saving' : editor.item ? 'users.saveChanges' : editor.kind==='position' ? 'org.addPositionBatch' : 'org.addDepartmentBatch',{ count:totalToAdd })}</Button></div>
    </form></dialog> : null}
    <ConfirmDialog className="organization-deactivate-dialog" open={Boolean(pendingDeactivate&&canManage)} title={t('org.deactivateDepartmentTitle',{ name:pendingDeactivate?.department.name })} description={<><span className="organization-deactivate-count">{t('org.deactivateDepartmentImpact',{ count:pendingDeactivate ? departments.filter(d=>isDescendant(d,pendingDeactivate.department.id)).length : 0 })}</span><p>{t('org.deactivateDepartmentAvailability')}</p>{error&&pendingDeactivate?.source==='toggle' ? <p className="organization-create-dialog__error" role="alert">{error}</p> : null}</>} warning={t('org.deactivateDepartmentRestore')} confirmLabel={t('org.setInactive')} cancelLabel={t('users.cancel')} busyLabel={t('org.updatingStatus')} busy={isSubmitting} onConfirm={()=>{if(!pendingDeactivate) return; if(pendingDeactivate.source==='editor') void save(undefined,true); else void toggleStatus(pendingDeactivate.department)}} onCancel={()=>{if(!isSubmitting) setPendingDeactivate(null)}} />
    <ConfirmDialog variant="deletion" open={Boolean(pendingBulkDeleteIds.length&&canManage)} title={t('org.deletePositionsTitle',{ count:bulkPositions.length })} items={bulkPositions.map(position=>({id:position.id,name:position.name,details:departments.find(department=>department.id===position.organizationId)?.name||t('org.companyLevel')}))} description={<><p>{t('org.deletePositionsShort')}</p>{bulkManaged ? <p>{t('org.managedDepartmentDependency',{ count:bulkManaged })}</p> : null}</>} error={deleteError} warning={bulkDeleteBlocked||deleteConflict ? t('org.deleteBlocked') : undefined} confirmDisabled={deleteConflict||bulkDeleteBlocked||!bulkPositions.length} confirmLabel={t('org.deletePositionsAction')} cancelLabel={t('users.cancel')} busyLabel={t('org.deleting')} busy={isDeleting} onConfirm={removeSelectedPositions} onCancel={()=>setPendingBulkDeleteIds([])} />
    <ConfirmDialog className={pendingDelete?.kind==='department'&&removalImpact?.employeeCount&&removalImpact.canReassign ? 'organization-removal-dialog' : undefined} variant="deletion" open={Boolean(pendingDelete&&canManage)} title={t(deleteBlocked||deleteConflict||pendingDelete?.kind==='position'&&pendingDelete.item.status!=='inactive' ? pendingDelete?.kind==='department' ? 'org.cannotDeleteDepartment' : 'org.cannotDeletePosition' : pendingDelete?.kind==='department' ? 'org.deleteDepartmentTitle' : 'org.deletePositionTitle')} items={pendingDelete ? [{id:pendingDelete.item.id,name:pendingDelete.item.name}] : []} description={<><p>{t(deleteConflict ? 'org.deleteRefreshShort' : managedDepartments ? 'org.deleteManagerShort' : pendingDelete?.kind==='position'&&pendingDelete.item.status!=='inactive' ? 'org.deleteInactiveFirst' : pendingDelete?.kind==='department' ? 'org.deleteDepartmentQuestion' : 'org.deletePositionShort',{ departments:childDepartments,positions:dependentPositions })}</p>{removalEmployeeControls}</>} warningTitle={pendingDelete?.kind==='department'&&Boolean(cascadeItems)&&!deleteBlocked&&!deleteConflict ? t('org.deleteWarningHeading') : undefined} warning={pendingDelete?.kind==='department'&&cascadeItems&&!deleteBlocked&&!deleteConflict ? t('org.deleteDepartmentCascadeWarning',{ items:cascadeItems }) : undefined} error={deleteError} hideConfirm={deleteConflict||deleteBlocked||pendingDelete?.kind==='position'&&pendingDelete.item.status!=='inactive'} confirmDisabled={Boolean(removalIncomplete)||deleteConflict||deleteBlocked||pendingDelete?.kind==='position'&&pendingDelete.item.status!=='inactive'} confirmLabel={t(pendingDelete?.kind==='department' ? 'org.deleteDepartmentAction' : 'org.deletePositionAction')} cancelLabel={t(deleteConflict||deleteBlocked||pendingDelete?.kind==='position'&&pendingDelete.item.status!=='inactive' ? 'org.deleteClose' : 'users.cancel')} busyLabel={t('org.deleting')} busy={isDeleting} onConfirm={remove} onCancel={()=>setPendingDelete(null)} />
  </div>
}
