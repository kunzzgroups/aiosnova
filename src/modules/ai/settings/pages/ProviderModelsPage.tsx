import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useCompanyStore } from '@/stores/companyStore'
import { AiSettingsShell } from '../components/AiSettingsShell'
import { ModelManagement } from '../components/ModelManagement'
import { fetchProviders } from '../services/settingsService'
import type { AiProvider } from '../types/settings'
import { Button } from '@/components/ui/Button'

export function ProviderModelsPage() {
  const { providerId = '' } = useParams()
  const companyId = useCompanyStore(state => state.companyId)
  return <ScopedModels key={`${companyId}:${providerId}`} companyId={companyId} providerId={providerId}/>
}

function ScopedModels({companyId,providerId}:{companyId:string;providerId:string}) {
  const [providers,setProviders]=useState<AiProvider[]|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{let active=true;setError(null);void fetchProviders(companyId).then(result=>{if(active)setProviders(result.items)}).catch(caught=>{if(active)setError(caught instanceof Error?caught.message:'Unable to load providers.')});return()=>{active=false}},[companyId,attempt])
  if(error)return <AiSettingsShell><p role="alert">{error}</p><Button variant="secondary" onClick={()=>setAttempt(value=>value+1)}>Retry</Button></AiSettingsShell>
  if(!providers)return <AiSettingsShell><p role="status">Loading models…</p></AiSettingsShell>
  if(!providers.some(provider=>provider.id===providerId)){
    return <Navigate replace to="/ai/ai/ai-settings/models/providers"/>
  }
  return <AiSettingsShell><ModelManagement providerId={providerId}/></AiSettingsShell>
}
