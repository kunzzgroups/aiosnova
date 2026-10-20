import type { ProviderStatus, ModelStatus } from '../types/settings'
import type { ToolStatus } from '../types/tools'

type Fixture = {
  label: string
  providers: Record<string, ProviderStatus>
  modelIds: string[]
  modelStates?: Record<string, ModelStatus>
  testModels: number
  tools: Array<{ action: string; name?: string; status: ToolStatus }>
  mcp: Array<{ index: number; name: string; status: ProviderStatus }>
  security: { steps:number;calls:number;timeout:number;upload:number;daily:number;monthly:number;behavior:'warn'|'block';externalConfirmation:boolean }
  usage: { daily:number; variation:number; costScale:number; users:string[] }
  runtime: { model:string; fallback:string|null; routing:string }
}

const fixtures: Record<string, Fixture> = {
  'company-retail': {
    label:'Retail',providers:{openai:'connected',anthropic:'connected',google:'error',deepseek:'disabled'},
    modelIds:['gpt-5','gpt-5-mini','o4-mini','text-embedding-3-large','claude-sonnet-4','claude-3-5-haiku-latest','gemini-2.5-flash','deepseek-chat'],testModels:0,
    tools:[{action:'web.search',status:'active'},{action:'calc.run',status:'active'},{action:'file.read',status:'active'},{action:'knowledge.search',name:'Product Catalog Search',status:'active'},{action:'http.request',name:'Retail Inventory API',status:'error'},{action:'csv.export',status:'disabled'},{action:'text.translate',status:'active'},{action:'email.send',status:'disabled'}],
    mcp:[{index:1,name:'Retail Knowledge MCP',status:'connected'},{index:2,name:'Retail Inventory MCP',status:'error'},{index:3,name:'Retail Sandbox MCP',status:'disabled'}],
    security:{steps:12,calls:24,timeout:90,upload:25,daily:300,monthly:4500,behavior:'warn',externalConfirmation:true},
    usage:{daily:720,variation:190,costScale:.9,users:['Demo User','Retail Manager','Store Supervisor']},
    runtime:{model:'gpt-5-mini',fallback:'claude-3-5-haiku-latest',routing:'Cost optimized'},
  },
  'company-wholesale': {
    label:'Wholesale',providers:{openai:'connected',anthropic:'connected',deepseek:'disabled'},
    modelIds:['gpt-5','gpt-5-mini','o3','text-embedding-3-large','claude-sonnet-4','deepseek-chat'],testModels:0,
    tools:[{action:'calc.run',status:'active'},{action:'sql.query',name:'Wholesale Orders Query',status:'active'},{action:'knowledge.search',name:'Wholesale Pricing Search',status:'active'},{action:'csv.export',status:'active'},{action:'file.read',status:'active'},{action:'file.write',status:'disabled'}],
    mcp:[{index:2,name:'Wholesale ERP MCP',status:'connected'},{index:0,name:'Wholesale Reporting MCP',status:'connected'}],
    security:{steps:20,calls:35,timeout:180,upload:100,daily:600,monthly:18000,behavior:'block',externalConfirmation:true},
    usage:{daily:400,variation:130,costScale:1.15,users:['Demo User','Wholesale Finance','Sales Manager']},
    runtime:{model:'gpt-5',fallback:'claude-sonnet-4',routing:'Quality first'},
  },
  'company-j1': {
    label:'Midvalley',providers:{openai:'connected',anthropic:'connected',google:'connected',deepseek:'disabled','test-05':'connected','test-06':'connected','test-07':'disabled','test-08':'error','test-09':'connected','test-10':'disabled','test-11':'error','test-12':'connected'},
    modelIds:['test-error-model','gpt-5','gpt-5-mini','o3','o4-mini','text-embedding-3-large','claude-sonnet-4','claude-3-5-haiku-latest','gemini-2.5-flash','deepseek-chat'],testModels:300,
    tools:[{action:'web.search',status:'active'},{action:'calc.run',status:'active'},{action:'sql.query',status:'disabled'},{action:'email.send',status:'disabled'},{action:'file.read',status:'active'},{action:'knowledge.search',status:'active'},{action:'http.request',status:'error'},{action:'csv.export',status:'disabled'},{action:'document.extract',status:'active'},{action:'text.translate',status:'active'},{action:'calendar.read',status:'active'},{action:'file.write',status:'disabled'}],
    mcp:[{index:0,name:'GitHub MCP',status:'connected'},{index:1,name:'Notion MCP',status:'connected'},{index:2,name:'Internal MCP',status:'error'},{index:3,name:'Local MCP',status:'disabled'}],
    security:{steps:10,calls:20,timeout:60,upload:50,daily:500,monthly:10000,behavior:'warn',externalConfirmation:true},
    usage:{daily:340,variation:260,costScale:1,users:['Demo User','Finance User','Support User']},
    runtime:{model:'gpt-5-mini',fallback:'claude-sonnet-4',routing:'Automatic'},
  },
  'company-j2': {
    label:'Paradigm',providers:{google:'connected',openai:'disabled'},
    modelIds:['gemini-2.5-flash','gpt-5-mini','text-embedding-3-large'],modelStates:{'gpt-5-mini':'disabled','text-embedding-3-large':'disabled'},testModels:0,
    tools:[{action:'calc.run',status:'active'},{action:'knowledge.search',name:'Paradigm Menu Search',status:'active'},{action:'text.translate',status:'active'},{action:'email.send',status:'disabled'}],
    mcp:[{index:1,name:'Paradigm Menu MCP',status:'connected'}],
    security:{steps:6,calls:8,timeout:45,upload:10,daily:40,monthly:400,behavior:'block',externalConfirmation:false},
    usage:{daily:130,variation:65,costScale:.65,users:['Demo User','Paradigm Supervisor']},
    runtime:{model:'gemini-2.5-flash',fallback:null,routing:'Single provider'},
  },
  'company-tokyo-izakaya': {
    label:'Tokyo',providers:{anthropic:'connected',google:'disabled'},
    modelIds:['claude-sonnet-4','claude-3-5-haiku-latest','gemini-2.5-flash'],modelStates:{'gemini-2.5-flash':'disabled'},testModels:0,
    tools:[{action:'calc.run',status:'active'},{action:'knowledge.search',name:'Tokyo Menu Search',status:'active'},{action:'text.translate',status:'active'},{action:'calendar.read',name:'Reservation Calendar',status:'error'},{action:'email.send',status:'disabled'}],
    mcp:[{index:2,name:'Tokyo Reservations MCP',status:'error'},{index:3,name:'Tokyo Local MCP',status:'disabled'}],
    security:{steps:8,calls:12,timeout:75,upload:20,daily:120,monthly:2400,behavior:'warn',externalConfirmation:true},
    usage:{daily:210,variation:85,costScale:.8,users:['Demo User','Tokyo Manager','Reservations Staff']},
    runtime:{model:'claude-3-5-haiku-latest',fallback:'claude-sonnet-4',routing:'Latency optimized'},
  },
}

export function companyFixture(companyId:string): Fixture {
  if(!companyId)throw new Error('Select a company to manage AI settings.')
  // Future companies get their own isolated, small baseline rather than J1 stress data.
  return structuredClone(fixtures[companyId] ?? {...fixtures['company-j2'],label:companyId})
}
export const fixtureTime=(minutesAgo:number)=>new Date(Date.now()-minutesAgo*60000).toISOString()
