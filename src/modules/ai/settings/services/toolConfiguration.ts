import { companyFixture } from './companyFixtures'

export type ToolConfigurationField = {
  key:string;label:string;type:'number'|'text'|'list'|'boolean'|'select'
  defaultValue:unknown;min?:number;max?:number;step?:number
  options?:Array<{value:string;label:string}>;hint?:string
}
const number=(key:string,label:string,value:number,min:number,max:number,step=1):ToolConfigurationField=>({key,label,type:'number',defaultValue:value,min,max,step})
const text=(key:string,label:string,value:string,hint?:string):ToolConfigurationField=>({key,label,type:'text',defaultValue:value,hint})
const list=(key:string,label:string,value:string[],hint='Separate entries with commas.'):ToolConfigurationField=>({key,label,type:'list',defaultValue:value,hint})
const boolean=(key:string,label:string,value:boolean):ToolConfigurationField=>({key,label,type:'boolean',defaultValue:value})
const select=(key:string,label:string,value:string,options:Array<[string,string]>):ToolConfigurationField=>({key,label,type:'select',defaultValue:value,options:options.map(([value,label])=>({value,label}))})

const schemas:Record<string,ToolConfigurationField[]>={
  'web.search':[number('maxResults','Maximum results',5,1,50),list('allowedDomains','Allowed domains',[],'Leave empty for all domains. Separate domains with commas.'),select('searchDepth','Search depth','basic',[['basic','Basic'],['deep','Deep']])],
  'knowledge.search':[number('resultLimit','Maximum results',5,1,50),number('minScore','Minimum relevance',.6,0,1,.05),boolean('includeSources','Include source references',true)],
  'csv.export':[select('delimiter','Delimiter',',',[[',','Comma'],[';','Semicolon'],['\t','Tab']]),boolean('includeHeader','Include header row',true),select('encoding','Encoding','utf-8',[['utf-8','UTF-8'],['utf-8-bom','UTF-8 with BOM']])],
  'http.request':[text('baseUrl','Base URL','https://api.example.test'),list('allowedMethods','Allowed methods',['GET']),number('maxResponseKB','Maximum response (KB)',1024,1,10240)],
  'sql.query':[text('connection','Connection name','reporting'),boolean('readOnly','Read-only access',true),number('maxRows','Maximum rows',100,1,10000)],
  'file.read':[list('allowedExtensions','Allowed file extensions',['pdf','txt','csv']),number('maxSizeMB','Maximum file size (MB)',20,1,1024)],
  'file.write':[text('targetDirectory','Target directory','/exports'),boolean('overwrite','Allow overwriting files',false)],
  'document.extract':[list('languages','Document languages',['en']),select('outputFormat','Output format','text',[['text','Plain text'],['markdown','Markdown'],['json','Structured JSON']])],
  'text.translate':[select('targetLanguage','Default target language','en',[['en','English'],['zh','Chinese'],['ja','Japanese'],['ms','Malay']]),select('formality','Tone','neutral',[['neutral','Neutral'],['formal','Formal'],['casual','Casual']])],
  'calendar.read':[text('timeZone','Time zone','Asia/Kuala_Lumpur'),number('daysAhead','Days ahead',14,1,365)],
  'email.send':[text('fromAddress','Sender address','notifications@example.test'),boolean('allowExternal','Allow external recipients',false),text('subjectPrefix','Subject prefix','[AI]')],
  // Calculator has no additional configuration; custom actions retain Advanced JSON.
}

export function toolConfigurationFields(action:string){return schemas[action.trim()]??[]}
export function defaultToolConfiguration(action:string):Record<string,unknown>{return Object.fromEntries(toolConfigurationFields(action).map(field=>[field.key,structuredClone(field.defaultValue)]))}
export function parseToolConfiguration(raw:string):Record<string,unknown>|null {
  try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?value:null}catch{return null}
}
export function configurationDrafts(action:string,configuration:Record<string,unknown>):Record<string,string>{
  return Object.fromEntries(toolConfigurationFields(action).map(field=>{
    const value=Object.prototype.hasOwnProperty.call(configuration,field.key)?configuration[field.key]:field.defaultValue
    return [field.key,value===null?'':Array.isArray(value)?value.join(', '):typeof value==='object'?JSON.stringify(value):String(value)]
  }))
}
export function setConfigurationField(configuration:Record<string,unknown>,field:ToolConfigurationField,raw:string):Record<string,unknown>{
  const value=field.type==='number'?(raw.trim()===''?null:Number(raw)):field.type==='boolean'?raw==='true':field.type==='list'?raw.split(',').map(value=>value.trim()).filter(Boolean):raw
  return {...configuration,[field.key]:value}
}
export function validateToolConfiguration(action:string,configuration:Record<string,unknown>):Record<string,string>{
  const errors:Record<string,string>={}
  for(const field of toolConfigurationFields(action)){
    const value=configuration[field.key]
    // Existing sparse configuration is supported; the editor supplies defaults.
    if(value===undefined)continue
    if(field.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)||value<field.min!||value>field.max!||(field.step===1&&!Number.isInteger(value))))errors[field.key]=`${field.label} must be ${field.step===1?'a whole number':'a number'} from ${field.min} to ${field.max}.`
    if(field.type==='text'&&(typeof value!=='string'||(field.key!=='subjectPrefix'&&!value.trim())))errors[field.key]=`Enter ${field.label.toLowerCase()}.`
    if(field.type==='list'&&(!Array.isArray(value)||value.some(item=>typeof item!=='string'||!item.trim())))errors[field.key]=`${field.label} must be a list of non-empty strings.`
    if(field.type==='boolean'&&typeof value!=='boolean')errors[field.key]=`${field.label} must be true or false.`
    if(field.type==='select'&&!field.options?.some(option=>option.value===value))errors[field.key]=`Choose a valid ${field.label.toLowerCase()}.`
  }
  if(action.trim()==='http.request'&&typeof configuration.baseUrl==='string'){
    try{if(!['http:','https:'].includes(new URL(configuration.baseUrl).protocol))errors.baseUrl='Use an HTTP or HTTPS URL.'}catch{errors.baseUrl='Enter a valid HTTP or HTTPS URL.'}
  }
  if(action.trim()==='http.request'&&Array.isArray(configuration.allowedMethods)&&configuration.allowedMethods.some(value=>!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(String(value))))errors.allowedMethods='Use HTTP methods such as GET, POST or PUT.'
  if(action.trim()==='calendar.read'&&typeof configuration.timeZone==='string')try{new Intl.DateTimeFormat('en',{timeZone:configuration.timeZone})}catch{errors.timeZone='Enter a valid time zone.'}
  if(action.trim()==='email.send'&&typeof configuration.fromAddress==='string'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.fromAddress))errors.fromAddress='Enter a valid sender email address.'
  return errors
}
export function displayConfigurationValue(field:ToolConfigurationField,value:unknown):string{
  if(field.type==='boolean')return value?'Yes':'No'
  if(field.type==='select')return field.options?.find(option=>option.value===value)?.label??String(value)
  if(Array.isArray(value))return value.length?value.join(', '):field.key==='allowedDomains'?'All domains':'None'
  return typeof value==='object'?JSON.stringify(value,null,2):String(value)
}

export function mockToolConfiguration(companyId:string,action:string):Record<string,unknown>{
  const fixture=companyFixture(companyId),config=defaultToolConfiguration(action),scale=fixture.security.steps
  if(action==='web.search')return {...config,maxResults:Math.min(20,scale),allowedDomains:companyId==='company-j1'?[]:[fixture.label.toLowerCase()+'.example.test'],cache:{enabled:true,ttlSeconds:scale*30}}
  if(action==='knowledge.search')return {...config,resultLimit:Math.min(20,scale),minScore:companyId==='company-j2'?.75:.6,includeSources:companyId!=='company-tokyo-izakaya'}
  if(action==='csv.export')return {...config,delimiter:companyId==='company-wholesale'?';':',',encoding:companyId==='company-retail'?'utf-8-bom':'utf-8'}
  if(action==='http.request')return {...config,baseUrl:'https://'+fixture.label.toLowerCase()+'.example.test/api',allowedMethods:companyId==='company-retail'?['GET']:['GET','POST'],headers:{'X-Demo-Company':fixture.label},retry:{maxAttempts:3,backoffMs:500}}
  if(action==='sql.query')return {...config,connection:fixture.label.toLowerCase()+'_reporting',maxRows:scale*25}
  if(action==='file.read')return {...config,maxSizeMB:fixture.security.upload}
  if(action==='file.write')return {...config,targetDirectory:'/exports/'+fixture.label.toLowerCase()}
  if(action==='document.extract')return {...config,languages:['en','zh'],outputFormat:'markdown',ocr:{enabled:true,minConfidence:.8}}
  if(action==='text.translate')return {...config,targetLanguage:companyId==='company-tokyo-izakaya'?'ja':companyId==='company-j2'?'ms':'en',formality:companyId==='company-retail'?'casual':'formal'}
  if(action==='calendar.read')return {...config,timeZone:companyId==='company-tokyo-izakaya'?'Asia/Tokyo':'Asia/Kuala_Lumpur',daysAhead:scale}
  if(action==='email.send')return {...config,fromAddress:fixture.label.toLowerCase()+'@example.test',subjectPrefix:'['+fixture.label+']'}
  return config
}
