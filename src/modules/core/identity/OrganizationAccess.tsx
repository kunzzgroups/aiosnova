import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useCompanyStore } from '@/stores/companyStore'
import { fetchOrganizationAccess } from './services/organizationService'

const OrganizationAccessContext=createContext({ canRead:false,canManage:false })
export const useOrganizationAccess=()=>useContext(OrganizationAccessContext)

export function OrganizationAccessProvider({ children }:{ children:ReactNode }) {
  const companyId=useCompanyStore(state=>state.companyId)
  const userId=useAuthStore(state=>state.user?.id)
  const token=useAuthStore(state=>state.accessToken)
  const { pathname }=useLocation()
  const [access,setAccess]=useState<{ scope:string; canRead:boolean; canManage:boolean }|null>(null)
  const scope=JSON.stringify([companyId,userId,token,pathname])
  useEffect(()=>{
    let current=true
    setAccess(null)
    if (companyId&&userId&&token?.startsWith('backend_')) fetchOrganizationAccess(companyId).then(result=>{
      if(current) setAccess({ scope,canRead:result.canRead,canManage:result.canManage })
    }).catch(()=>{ if(current) setAccess(null) })
    return ()=>{ current=false }
  },[companyId,userId,token,scope])
  return <OrganizationAccessContext.Provider value={access?.scope===scope ? access : { canRead:false,canManage:false }}>{children}</OrganizationAccessContext.Provider>
}
