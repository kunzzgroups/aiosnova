import { companyFixture, fixtureTime } from './companyFixtures'
export const SENSITIVE_ACTIONS = [
  {id:'deleteData',label:'Delete Data',description:'Deletion of business records.'},
  {id:'financialData',label:'Update Financial Data',description:'Changes to financial records.'},
  {id:'permissions',label:'Change Permission',description:'Role and access changes.'},
  {id:'externalMessage',label:'Send External Message',description:'Messages sent outside the workspace.'},
  {id:'accountChanges',label:'Account Changes',description:'Changes to account configuration.'},
] as const
export type SensitiveAction = typeof SENSITIVE_ACTIONS[number]['id']
export type SecurityPolicy = {
  confirmations:Record<SensitiveAction,boolean>
  steps:number; calls:number; timeout:number; upload:number; daily:number; monthly:number; behavior:'warn'|'block'
}
export type PolicyChange = {id:string;field:string;before:string;after:string;time:string;actor:string}
export type SecuritySnapshot = {policy:SecurityPolicy;changes:PolicyChange[];revision:number}
// In-memory settings are separate for every company, including policy history.
const store=new Map<string,SecuritySnapshot>()
function record(companyId:string){
  if(!store.has(companyId)){
    const fixture=companyFixture(companyId),{externalConfirmation,...limits}=fixture.security
    const policy:SecurityPolicy={...limits,confirmations:{deleteData:true,financialData:true,permissions:true,externalMessage:externalConfirmation,accountChanges:true}}
    store.set(companyId,{policy,revision:0,changes:[
      {id:companyId+'-budget-seed',field:'Monthly budget',before:'Not configured',after:'MYR '+policy.monthly.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}),time:fixtureTime(180),actor:fixture.label+' Admin'},
      {id:companyId+'-runtime-seed',field:'Execution timeout',before:'30 seconds',after:policy.timeout+' seconds',time:fixtureTime(240),actor:fixture.label+' Admin'},
    ]})
  }
  return store.get(companyId)!
}
export async function fetchSecurityPolicy(companyId:string){return structuredClone(record(companyId))}
export function validateSecurityPolicy(policy:SecurityPolicy):Record<string,string>{
  const errors:Record<string,string>={}
  for(const [field,max] of [['steps',1000],['calls',1000],['timeout',3600],['upload',1024]] as const)if(!Number.isInteger(policy[field])||policy[field]<1||policy[field]>max)errors[field]=`Enter a whole number from 1 to ${max}.`
  for(const field of ['daily','monthly'] as const)if(!Number.isFinite(policy[field])||policy[field]<=0||policy[field]>1e9||Math.abs(policy[field]*100-Math.round(policy[field]*100))>0.0001)errors[field]='Enter a positive amount with up to two decimal places.'
  if(!errors.daily&&!errors.monthly&&policy.daily>policy.monthly)errors.monthly='Monthly budget must be at least the daily budget.'
  if(!['warn','block'].includes(policy.behavior))errors.behavior='Choose a valid limit action.'
  for(const action of SENSITIVE_ACTIONS)if(typeof policy.confirmations?.[action.id]!=='boolean')errors[action.id]='Choose whether confirmation is required.'
  return errors
}
const fields={steps:'Max agent steps',calls:'Max tool calls',timeout:'Execution timeout',upload:'Max file upload',daily:'Daily budget',monthly:'Monthly budget',behavior:'Budget action'}
function format(key:string,value:unknown){if(key==='daily'||key==='monthly')return 'MYR '+Number(value).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});if(key==='behavior')return value==='warn'?'Warn user':'Block new requests';return String(value)+(key==='timeout'?' seconds':key==='upload'?' MB':'')}
export async function saveSecurityPolicy(companyId:string,policy:SecurityPolicy,revision:number,actor:string){
  const current=record(companyId)
  if(current.revision!==revision)throw new Error('The policy has changed. Reload the latest settings before saving.')
  if(Object.keys(validateSecurityPolicy(policy)).length)throw new Error('Review the highlighted policy values.')
  const changes:PolicyChange[]=[],time=new Date().toISOString()
  for(const action of SENSITIVE_ACTIONS)if(current.policy.confirmations[action.id]!==policy.confirmations[action.id])changes.push({id:crypto.randomUUID(),field:action.label+' confirmation',before:current.policy.confirmations[action.id]?'Required':'Not required',after:policy.confirmations[action.id]?'Required':'Not required',actor,time})
  for(const key of Object.keys(fields) as (keyof typeof fields)[])if(current.policy[key]!==policy[key])changes.push({id:crypto.randomUUID(),field:fields[key],before:format(key,current.policy[key]),after:format(key,policy[key]),actor,time})
  if(changes.length)store.set(companyId,{policy:structuredClone(policy),changes:[...changes,...current.changes],revision:current.revision+1})
  return structuredClone(record(companyId))
}
