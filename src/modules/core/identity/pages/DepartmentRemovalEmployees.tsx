import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { SelectField } from '@/components/ui/SelectField'
import type { DatabaseDepartment, DatabasePosition, DepartmentRemovalImpact } from '../services/organizationService'

export type EmployeeRemovalPlan = { departmentId:string; positionId:string }

type Props = {
  impact:DepartmentRemovalImpact
  departments:DatabaseDepartment[]
  positions:DatabasePosition[]
  mode:'retain'|'reassign'
  plans:Record<string,EmployeeRemovalPlan>
  busy:boolean
  onModeChange:(mode:'retain'|'reassign')=>void
  onPlansChange:(plans:Record<string,EmployeeRemovalPlan>)=>void
}

export function DepartmentRemovalEmployees({impact,departments,positions,mode,plans,busy,onModeChange,onPlansChange}:Props) {
  const { t }=useTranslation()
  const [selected,setSelected]=useState<string[]>([])
  const [departmentId,setDepartmentId]=useState('')
  const [positionId,setPositionId]=useState('')
  const allRef=useRef<HTMLInputElement>(null)
  const employees=impact.employees
  const count=mode==='reassign' ? Object.keys(plans).length : 0
  const allSelected=employees.length>0&&selected.length===employees.length
  const choices=positions.filter(position=>position.organizationId===departmentId&&position.status==='active')
  useEffect(()=>{if(allRef.current)allRef.current.indeterminate=selected.length>0&&!allSelected},[selected,allSelected])

  function changeMode(next:'retain'|'reassign') {
    setSelected([])
    onModeChange(next)
  }

  function assign() {
    if(!selected.length||!departments.some(item=>item.id===departmentId)||!choices.some(item=>item.id===positionId))return
    const next={...plans}
    for(const userId of selected)next[userId]={departmentId,positionId}
    onPlansChange(next)
    setSelected([])
  }

  return <div className="organization-removal-placement">
    <strong>{t('org.affectedEmployees',{count:impact.employeeCount})}</strong>
    <label><input type="radio" name="department-removal-mode" checked={mode==='reassign'} disabled={busy||!impact.canReassign} onChange={()=>changeMode('reassign')} />{t('org.reassignSelectedEmployees')}</label>
    <label><input type="radio" name="department-removal-mode" checked={mode==='retain'} disabled={busy} onChange={()=>changeMode('retain')} />{t('org.removeWithoutReassignment')}</label>
    {impact.canReassign ? <>
      <div className="organization-removal-employees">
        <div className="organization-removal-employees__heading">
          <label><input ref={allRef} type="checkbox" checked={allSelected} disabled={busy||mode!=='reassign'||!employees.length} onChange={event=>setSelected(event.target.checked ? employees.map(item=>item.userId) : [])} />{t('org.selectAllEmployees')}</label>
          <span>{t('org.selectedEmployees',{count:selected.length})}</span>
        </div>
        <ul>
          {employees.map(employee=>{
            const plan=mode==='reassign' ? plans[employee.userId] : undefined
            return <li key={employee.userId}>
              <label className="organization-removal-employees__person">
                <input type="checkbox" checked={selected.includes(employee.userId)} disabled={busy||mode!=='reassign'} onChange={event=>setSelected(current=>event.target.checked ? [...current,employee.userId] : current.filter(id=>id!==employee.userId))} />
                <span><span className="organization-removal-employees__name">{employee.name}</span><small>{employee.positionName||employee.departmentName}</small></span>
              </label>
              <div className="organization-removal-employees__destination">
                {plan ? <><span>{departments.find(item=>item.id===plan.departmentId)?.name}</span><small>{positions.find(item=>item.id===plan.positionId)?.name}</small><Button variant="ghost" disabled={busy} aria-label={t('org.undoEmployeeReassignment',{name:employee.name})} onClick={()=>{const next={...plans};delete next[employee.userId];onPlansChange(next)}}>{t('org.undoReassignment')}</Button></> : <small>{t('org.notReassigned')}</small>}
              </div>
            </li>
          })}
        </ul>
      </div>
      {mode==='reassign' ? <div className="organization-removal-assignment">
        <strong>{t('org.assignSelectedEmployees',{count:selected.length})}</strong>
        <div className="organization-removal-assignment__fields">
          <FormField label={t('org.destinationDepartment')} htmlFor="removal-destination"><SelectField id="removal-destination" label={t('org.destinationDepartment')} value={departmentId} disabled={busy} onChange={value=>{setDepartmentId(value);setPositionId('')}} options={[{value:'',label:t('org.chooseDepartment')},...departments.map(item=>({value:item.id,label:item.name}))]} /></FormField>
          <FormField label={t('org.destinationPosition')} htmlFor="removal-position"><SelectField id="removal-position" label={t('org.destinationPosition')} value={positionId} disabled={busy||!departmentId} onChange={setPositionId} options={[{value:'',label:t('org.choosePosition')},...choices.map(item=>({value:item.id,label:item.name}))]} /></FormField>
        </div>
        <Button disabled={busy||!selected.length||!departmentId||!positionId} onClick={assign}>{t('org.assignSelectedButton',{count:selected.length})}</Button>
        <p className="organization-removal-note">{t('org.assignmentsApplyOnRemoval')}</p>
      </div> : null}
    </> : <p>{t('org.reassignmentPermissionDenied')}</p>}
    <p className="organization-removal-note" role="status">{t('org.reassignmentSummary',{assigned:count,count:impact.employeeCount-count})}</p>
  </div>
}
