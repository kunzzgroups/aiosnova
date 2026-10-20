import type { ToolUsagePoint } from '../types/tools'
import { usageToday } from './usageService'

/** Calendar days, including zero-call days; padding does not invent usage history. */
export function toolUsageSeries(records:ToolUsagePoint[],days:number,end=usageToday()) {
  const endTime=Date.parse(end),start=endTime-(days-1)*86400000
  const daily=new Map<string,{requests:number;errors:number;weightedLatency:number}>()
  for(const point of records){
    const date=point.date.slice(0,10),time=Date.parse(date)
    if(!Number.isFinite(time)||time<start||time>endTime)continue
    const previous=daily.get(date)??{requests:0,errors:0,weightedLatency:0}
    daily.set(date,{
      requests:previous.requests+point.requests,errors:previous.errors+point.errors,
      weightedLatency:previous.weightedLatency+point.latencyMs*point.requests,
    })
  }
  const points:ToolUsagePoint[]=Array.from({length:days},(_,index)=>{
    const date=new Date(start+index*86400000).toISOString().slice(0,10),record=daily.get(date)
    return {date,requests:record?.requests??0,errors:record?.errors??0,latencyMs:record?.requests?record.weightedLatency/record.requests:0}
  })
  return {points,hasData:daily.size>0}
}
