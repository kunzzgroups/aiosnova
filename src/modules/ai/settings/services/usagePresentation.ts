import type { UsageGroup, UsageRow } from './usageService'

export function usageWindow(days:number,end:string) {
  return {start:new Date(Date.parse(end)-(days-1)*86400000).toISOString().slice(0,10),end}
}

export function usageComparison(current:number,previous:number,days:number) {
  if(previous===0)return current===0?'No usage in either period':'No previous usage to compare'
  const change=(current-previous)/previous*100
  return `${change>0?'+':''}${change.toFixed(1)}% vs previous ${days} days`
}

export function usageExportCsv(rows:UsageRow[],group:UsageGroup,companyId:string,range:{start:string;end:string}) {
  const heading=group==='mcp'?'MCP':group[0].toUpperCase()+group.slice(1)
  const values:unknown[][]=[['Company ID','From (inclusive)','To (inclusive)','Source',...(group==='tool'?['Tool ID']:[]),heading,'Requests','Input tokens','Output tokens','Estimated cost (MYR)','Errors','Error rate (%)'],
    ...rows.map(row=>[companyId,range.start,range.end,'Mock estimate',...(group==='tool'?[row.id]:[]),row.name,row.requests,row.input,row.output,row.cost.toFixed(2),row.errors,row.requests?(row.errors/row.requests*100).toFixed(2):''])]
  return values.map(row=>row.map(value=>{
    const text=String(value)
    // Names are editable: prevent spreadsheet formula execution on export.
    return '"'+(/^[=+@\-\t\r]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"'
  }).join(',')).join('\r\n')
}
