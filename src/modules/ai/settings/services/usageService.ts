import { companyFixture } from './companyFixtures'
export type UsageGroup='model'|'agent'|'user'|'tool'|'mcp'
export type UsageMetric='requests'|'tokens'|'cost'
export type UsageTotals={requests:number;input:number;output:number;runs:number;calls:number;cost:number;errors:number}
export type UsageRecord=UsageTotals&Record<UsageGroup,string>&{date:string;toolId?:string}
export type UsageRow=UsageTotals&{id:string;name:string}
const DAY=86400000
export function usageToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
// Deterministic sample attribution only. No billing or runtime telemetry is connected.
export async function fetchUsageRecords(companyId:string):Promise<UsageRecord[]>{return generateUsageRecords(companyId)}
export function generateUsageRecords(companyId:string):UsageRecord[]{
  if(!companyId)throw new Error('Select a company to view usage.')
  const fixture=companyFixture(companyId),end=Date.parse(usageToday()),seed=[...companyId].reduce((sum,c)=>sum+c.charCodeAt(0),0)%61,records:UsageRecord[]=[]
  const names:Record<string,string>={'gpt-5':'GPT-5','gpt-5-mini':'GPT-5 mini','o3':'o3','o4-mini':'o4-mini','claude-sonnet-4':'Claude Sonnet','claude-3-5-haiku-latest':'Claude Haiku','gemini-2.5-flash':'Gemini Flash','deepseek-chat':'DeepSeek Chat'}
  // Historical attribution can include a model or connection disabled today.
  const modelIds=fixture.modelIds.filter(id=>id in names)
  const agents=companyId==='company-j1'?['HR Agent','Finance Agent','Customer Agent']:[fixture.label+' Assistant',fixture.label+' Operations']
  const tools=fixture.tools.map(tool=>tool.name??({'web.search':'Web Search','calc.run':'Calculator','sql.query':'SQL Query','email.send':'Send Email','file.read':'File Read','knowledge.search':'Knowledge Search','http.request':'HTTP Request','csv.export':'CSV Export','document.extract':'Document Extract','text.translate':'Translate','calendar.read':'Calendar Read','file.write':'File Write'}[tool.action]??tool.action))
  const weights=modelIds.map((_,index)=>1/(index+1)),weightSum=weights.reduce((sum,value)=>sum+value,0)
  for(let i=0;i<120;i++){
    const date=new Date(end-(119-i)*DAY).toISOString().slice(0,10)
    const daily=fixture.usage.daily+((i*73+seed)%fixture.usage.variation)+Math.round(Math.sin(i*.7)*fixture.usage.variation*.2)
    let allocated=0
    modelIds.forEach((id,j)=>{
      const requests=j===modelIds.length-1?daily-allocated:Math.round(daily*weights[j]/weightSum)
      allocated+=requests
      records.push({date,model:names[id],agent:agents[(i+j)%agents.length],user:fixture.usage.users[(i+2*j)%fixture.usage.users.length],tool:tools[(i+j)%tools.length],toolId:'tool-'+((i+j)%tools.length+1)+'-'+companyId,mcp:fixture.mcp[(i+j)%fixture.mcp.length].name,
        requests,input:requests*(1800+j*130),output:requests*(480+j*55),runs:Math.round(requests*.05),calls:Math.round(requests*.16),
        cost:Math.round(requests*(.29-j*.015)*fixture.usage.costScale*100)/100,errors:Math.round(requests*(.008+j*.003))})
    })
  }
  return records
}
export function usageTotals(items:UsageTotals[]):UsageTotals{return items.reduce((sum,item)=>{for(const key of Object.keys(sum) as (keyof UsageTotals)[])sum[key]+=item[key];return sum},{requests:0,input:0,output:0,runs:0,calls:0,cost:0,errors:0})}
export function usagePeriod(records:UsageRecord[],days:number,previous=false,end=usageToday()){
  const hi=Date.parse(end)-(previous?days:0)*DAY,lo=hi-(days-1)*DAY
  return records.filter(row=>Date.parse(row.date)>=lo&&Date.parse(row.date)<=hi)
}
export function usageBreakdown(records:UsageRecord[],group:UsageGroup,tools:{id:string;name:string}[]=[]):UsageRow[]{
  const groups=new Map<string,{name:string;items:UsageRecord[]}>()
  const names=new Map(tools.map(tool=>[tool.id,tool.name]))
  records.forEach(row=>{
    const id=group==='tool'?(row.toolId??'legacy-tool:'+row.tool):row[group]
    const entry=groups.get(id)??{name:group==='tool'?(names.get(id)??row.tool):row[group],items:[]}
    entry.items.push(row);groups.set(id,entry)
  })
  if(group==='tool')tools.forEach(tool=>{if(!groups.has(tool.id))groups.set(tool.id,{name:tool.name,items:[]})})
  return [...groups].map(([id,{name,items}])=>({id,name,...usageTotals(items)})).sort((a,b)=>b.cost-a.cost||a.name.localeCompare(b.name))
}
export function usageDaily(records:UsageRecord[]){const groups=new Map<string,UsageRecord[]>();records.forEach(row=>groups.set(row.date,[...(groups.get(row.date)??[]),row]));return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({date,...usageTotals(items)}))}
export function budgetUsage(records:UsageRecord[],monthly:number,today=usageToday()){
  const month=today.slice(0,7),spent=usageTotals(records.filter(row=>row.date.startsWith(month)&&row.date<=today)).cost,elapsed=Number(today.slice(8)),[year,monthNumber]=month.split('-').map(Number),days=new Date(Date.UTC(year,monthNumber,0)).getUTCDate()
  return {spent,remaining:monthly-spent,used:spent/monthly*100,forecast:spent/elapsed*days,month}
}
