import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useCompanyStore } from '@/stores/companyStore'
import { fetchOrganizationAccess } from './services/organizationService'

const OrganizationAccessContext=createContext({ canRead:false,canManage:false,isLoading:false })
export const useOrganizationAccess=()=>useContext(OrganizationAccessContext)

export function OrganizationAccessProvider({ children }:{ children:ReactNode }) {
  const companyId=useCompanyStore(state=>state.companyId)
  const userId=useAuthStore(state=>state.user?.id)
  const token=useAuthStore(state=>state.accessToken)
  const { pathname }=useLocation()
  const [access,setAccess]=useState<{ scope:string; canRead:boolean; canManage:boolean }|null>(null)
  const scope=JSON.stringify([companyId,userId,token,pathname])
  const canCheckAccess=Boolean(companyId&&userId&&token?.startsWith('backend_'))
  useEffect(()=>{
    let current=true
    const controller=new AbortController()
    setAccess(null)
    if (companyId&&userId&&token?.startsWith('backend_')) fetchOrganizationAccess(companyId,controller.signal).then(result=>{
      if(current) setAccess({ scope,canRead:result.canRead,canManage:result.canManage })
    }).catch(()=>{ if(current) setAccess({ scope,canRead:false,canManage:false }) })
    return ()=>{ current=false;controller.abort() }
  },[companyId,userId,token,scope])
  const value=access?.scope===scope
    ? { ...access,isLoading:false }
    : { canRead:false,canManage:false,isLoading:canCheckAccess }
  return <OrganizationAccessContext.Provider value={value}>{children}</OrganizationAccessContext.Provider>
}
