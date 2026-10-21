import type { AiProvider } from '../types/settings'

export function providerOverviewActivity(provider:AiProvider) {
  if(provider.activity?.length)return provider.activity.map(event=>({id:'provider-'+provider.id+'-'+event.id,time:event.time,title:provider.name,detail:event.message,status:event.status??'neutral' as const}))
  return provider.lastTestedAt?[{id:'provider-'+provider.id,time:provider.lastTestedAt,title:provider.name+' · Sample status recorded',detail:'Provider · Sample configuration status; no live connection was tested.',status:'neutral' as const}]:[]
}

export function connectionStatusLabel(status:string) {
  return status==='not_verified'?'Not verified':status==='connected'?'Connected':status==='disabled'?'Disabled':status==='error'?'Error':status
}

type HealthResource={id:string;name:string;status:string}
export function settingsHealthItems(companyId:string,providers:HealthResource[],tools:HealthResource[],servers:HealthResource[]) {
  return [
    ...providers.map(item=>({...item,kind:'Provider',path:'/ai/ai/ai-settings/models/providers?providerId='+encodeURIComponent(item.id)+'&companyId='+encodeURIComponent(companyId)})),
    ...tools.map(item=>({...item,kind:'Tool',path:'/ai/ai/ai-settings/tools/'+item.id})),
    ...servers.map(item=>({...item,kind:'MCP',path:'/ai/ai/ai-settings/mcp?serverId='+encodeURIComponent(item.id)+'&companyId='+encodeURIComponent(companyId)})),
  ].filter(item=>item.status==='error'||item.status==='not_verified')
    .map(item=>({...item,label:item.status==='error'?'Sample error':'Not verified'}))
    .sort((a,b)=>Number(b.status==='error')-Number(a.status==='error'))
}
