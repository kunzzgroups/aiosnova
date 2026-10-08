/**
 * Mock seed data.
 *
 * Every base carries two fields for the permission model:
 *   - `companyId`           the owner (write gate)
 *   - `allowedCompanyIds`   which companies may READ it (includes the owner)
 *
 * When `allowedCompanyIds` is missing or empty the base is owner-only.
 */

import type { AgentModelConfig } from '@/modules/ai/agents/types/agent'
import type {
  KnowledgeBaseKind,
  KnowledgeDataSource,
  KnowledgeSkill,
} from '@/modules/ai/knowledge/types/knowledge'

export type SeedAgentStatus = 'active' | 'draft' | 'disabled'

export type SeedAgent = {
  id: string
  tenantId: string
  companyId: string
  name: string
  description: string
  category: string
  status: SeedAgentStatus
  createdAt: string
  knowledgeBaseIds: string[]
  model: AgentModelConfig
}

export type SeedKnowledgeBase = {
  id: string
  tenantId: string
  /** Owner. */
  companyId: string
  /** Read visibility. Always includes the owner. */
  allowedCompanyIds: string[]
  name: string
  description: string
  category: string
  kind: KnowledgeBaseKind
  createdAt: string
  updatedAt: string
  status: 'ready' | 'processing' | 'failed' | 'empty'
}

export type SeedDocument = {
  id: string
  baseId: string
  title: string
  kind: 'file' | 'record'
  type: 'contract' | 'invoice' | 'policy' | 'record'
  status: 'ready' | 'processing' | 'failed'
  chunkCount: number
  sizeBytes: number
  uploadedAt: string
  lastIndexedAt: string | null
  fileUrl?: string
  mimeType?: string
}

export const SEED_COMPANY_ID = 'company-j1'

const TENANT_ID = 'tenant-demo'
const NOW = '2025-01-15T08:00:00.000Z'

/* ------------------------------------------------------------------ */
/* Base factory - every base carries owner + visibility                */
/* ------------------------------------------------------------------ */

function mkBase(
  id: string,
  name: string,
  description: string,
  category: string,
  kind: KnowledgeBaseKind,
  companyId: string,
  allowedCompanyIds?: string[],
): SeedKnowledgeBase {
  return {
    id,
    tenantId: TENANT_ID,
    companyId,
    allowedCompanyIds: allowedCompanyIds ?? [companyId],
    name,
    description,
    category,
    kind,
    createdAt: NOW,
    updatedAt: NOW,
    status: 'ready',
  }
}

/* ------------------------------------------------------------------ */
/* Bases owned by company-j1                                           */
/* ------------------------------------------------------------------ */

const J1 = 'company-j1'
const J2 = 'company-j2'
const RETAIL = 'company-retail'
const WHOLESALE = 'company-wholesale'
const TOKYO = 'company-tokyo-izakaya'

const J1_BASES: SeedKnowledgeBase[] = [
  // Shared with j2 + retail.
  mkBase('kb-hr', 'HR Knowledge', '员工手册、休假、入职、HR SOP', 'HR', 'document', J1, [J1, J2, RETAIL]),
  mkBase('kb-training', 'Training Knowledge', '培训材料、考核标准、学习路径', 'HR', 'document', J1, [J1, J2]),

  // j1-only.
  mkBase('kb-finance', 'Finance Knowledge', '营收、交易、财务报表', 'Finance', 'document', J1, [J1]),
  mkBase('kb-legal', 'Legal Knowledge', '合同、合规、法务意见', 'Legal', 'document', J1, [J1]),

  // Shared with retail.
  mkBase('kb-it', 'IT Knowledge', 'IT 新人考核、SOP、安全策略', 'IT', 'document', J1, [J1, RETAIL]),

  // Shared with j2.
  mkBase('kb-marketing', 'Marketing Knowledge', 'Campaign、品牌、内容素材', 'Marketing', 'document', J1, [J1, J2]),

  // Shared with every member company.
  mkBase('kb-product', 'Product Knowledge', '产品文档、规格、Roadmap', 'Product', 'document', J1, [J1, J2, RETAIL, WHOLESALE]),
  mkBase('kb-operations', 'Operations Knowledge', '运营流程、SOP、供应商', 'Operations', 'document', J1, [J1, J2, RETAIL, WHOLESALE]),

  // j1-only.
  mkBase('kb-customer', 'Customer Knowledge', '客户 FAQ、工单、SLA', 'Customer', 'document', J1, [J1]),
  mkBase('kb-sales', 'Sales Knowledge', '销售手册、报价、Pipeline', 'Sales', 'document', J1, [J1]),

  // Skill bases.
  mkBase('kb-calc', 'Calculator Skill', '数学计算能力：四则运算、百分比、汇率换算', 'Skills', 'skill', J1, [J1]),
  mkBase('kb-translate', 'Translation Skill', '多语言翻译能力', 'Skills', 'skill', J1, [J1]),

  // Data bases.
  mkBase('kb-crm', 'CRM Data', 'CRM 客户与交易数据源', 'Data', 'data', J1, [J1, RETAIL]),
  mkBase('kb-warehouse', 'Warehouse Data', '数据仓库：订单、库存、营收', 'Data', 'data', J1, [J1]),
]

/* ------------------------------------------------------------------ */
/* Bases owned by other companies (cross-company visibility tests)     */
/* ------------------------------------------------------------------ */

const OTHER_BASES: SeedKnowledgeBase[] = [
  // j2-owned.
  mkBase('kb-j2-sop', 'J2 Store SOP', 'J2 门店运营 SOP', 'Operations', 'document', J2, [J2, J1]),
  mkBase('kb-j2-menu', 'J2 Menu', 'J2 门店菜单', 'Operations', 'document', J2, [J2]),

  // retail-owned.
  mkBase('kb-retail-catalog', 'Product Catalog', '零售产品目录', 'Product', 'document', RETAIL, [RETAIL, J1]),

  // wholesale-owned.
  mkBase('kb-wholesale-pricing', 'Wholesale Pricing', '批发价目表', 'Sales', 'document', WHOLESALE, [WHOLESALE, J1]),

  // tokyo-owned - the user is NOT a member of tokyo, so it stays invisible.
  mkBase('kb-tokyo-menu', 'Tokyo Menu', 'Tokyo Izakaya 菜单', 'Operations', 'document', TOKYO, [TOKYO]),
]

export const SEED_KNOWLEDGE_BASES: SeedKnowledgeBase[] = [...J1_BASES, ...OTHER_BASES]

/* ------------------------------------------------------------------ */
/* Agents (owned by j1 by default; the cross-company case does not     */
/* matter for the current UI, so they all stay in the home company)    */
/* ------------------------------------------------------------------ */

type RawAgent = Omit<SeedAgent, 'tenantId' | 'companyId'>

const RAW_AGENTS: RawAgent[] = [
  {
    id: 'ag-hr',
    name: 'HR Agent',
    description: 'HR 政策、休假、入职咨询',
    category: 'HR',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-hr', 'kb-training'],
    model: { provider: 'auto', model: '', temperature: 0.3, topP: 1, maxTokens: 2048 },
  },
  {
    id: 'ag-finance',
    name: 'Finance Agent',
    description: '财务分析、营收、报表',
    category: 'Finance',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-finance', 'kb-legal', 'kb-warehouse'],
    model: { provider: 'openai', model: 'gpt-4o', temperature: 0.1, topP: 1, maxTokens: 4096 },
  },
  {
    id: 'ag-legal',
    name: 'Legal Agent',
    description: '合同、合规、法务',
    category: 'Legal',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-legal', 'kb-finance'],
    model: { provider: 'anthropic', model: 'claude-sonnet-4', temperature: 0.2, topP: 1, maxTokens: 4096 },
  },
  {
    id: 'ag-it',
    name: 'IT Agent',
    description: 'IT 支持、新人考核、SOP',
    category: 'IT',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-it', 'kb-calc'],
    model: { provider: 'auto', model: '', temperature: 0.3, topP: 1, maxTokens: 2048 },
  },
  {
    id: 'ag-marketing',
    name: 'Marketing Agent',
    description: 'Campaign、品牌、内容',
    category: 'Marketing',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-marketing', 'kb-translate'],
    model: { provider: 'auto', model: '', temperature: 0.5, topP: 1, maxTokens: 2048 },
  },
  {
    id: 'ag-customer',
    name: 'Customer Agent',
    description: '客户支持、FAQ、SLA',
    category: 'Customer',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-customer', 'kb-product', 'kb-crm'],
    model: { provider: 'auto', model: '', temperature: 0.4, topP: 1, maxTokens: 2048 },
  },
  {
    id: 'ag-sales',
    name: 'Sales Agent',
    description: '销售手册、报价、Pipeline',
    category: 'Sales',
    status: 'draft',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-sales', 'kb-product', 'kb-customer', 'kb-crm'],
    model: { provider: 'auto', model: '', temperature: 0.4, topP: 1, maxTokens: 2048 },
  },
  {
    id: 'ag-management',
    name: 'Management Agent',
    description: '管理决策，访问全部知识库',
    category: 'Management',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: [
      'kb-hr',
      'kb-training',
      'kb-finance',
      'kb-legal',
      'kb-it',
      'kb-marketing',
      'kb-product',
      'kb-customer',
      'kb-sales',
      'kb-operations',
    ],
    model: { provider: 'anthropic', model: 'claude-sonnet-4', temperature: 0.3, topP: 1, maxTokens: 8192 },
  },
    // ---------- J2-owned agents ----------
  {
    id: 'ag-j2-hr',
    name: 'J2 HR Agent',
    description: 'J2 门店 HR 政策',
    category: 'HR',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-hr', 'kb-j2-sop'],
    model: { provider: 'auto', model: '', temperature: 0.3, topP: 1, maxTokens: 2048 },
  },
  {
    id: 'ag-j2-menu',
    name: 'J2 Menu Agent',
    description: 'J2 门店菜单咨询',
    category: 'Operations',
    status: 'active',
    createdAt: NOW,
    knowledgeBaseIds: ['kb-j2-menu'],
    model: { provider: 'auto', model: '', temperature: 0.3, topP: 1, maxTokens: 2048 },
  },
]

/** Which company owns each agent. Defaults to SEED_COMPANY_ID. */
const AGENT_OWNER: Record<string, string> = {
  'ag-j2-hr': 'company-j2',
  'ag-j2-menu': 'company-j2',
  // 其他 agent 保持默认（company-j1）
}

export const SEED_AGENTS: SeedAgent[] = RAW_AGENTS.map((agent) => ({
  ...agent,
  tenantId: TENANT_ID,
  companyId: AGENT_OWNER[agent.id] ?? SEED_COMPANY_ID,
  knowledgeBaseIds: [...agent.knowledgeBaseIds],
  model: { ...agent.model },
}))

/* ------------------------------------------------------------------ */
/* Synthetic documents                                                 */
/* ------------------------------------------------------------------ */

function generateDocuments(): SeedDocument[] {
  const countPerBase: Record<string, number> = {
    'kb-hr': 4,
    'kb-training': 3,
    'kb-finance': 5,
    'kb-legal': 2,
    'kb-it': 6,
    'kb-marketing': 3,
    'kb-product': 7,
    'kb-customer': 4,
    'kb-sales': 3,
    'kb-operations': 2,
    'kb-j2-sop': 2,
    'kb-j2-menu': 2,
    'kb-retail-catalog': 3,
    'kb-wholesale-pricing': 2,
    'kb-tokyo-menu': 2,
  }

  const docs: SeedDocument[] = []
  for (const base of SEED_KNOWLEDGE_BASES) {
    if (base.kind !== 'document') continue
    const count = countPerBase[base.id] ?? 2
    for (let i = 1; i <= count; i += 1) {
      docs.push({
        id: `${base.id}-doc-${i}`,
        baseId: base.id,
        title: `${base.name} Document ${i}`,
        kind: 'file',
        type: i % 3 === 0 ? 'record' : 'policy',
        status: 'ready',
        chunkCount: 10 + i * 3,
        sizeBytes: 1024 * 48 * i,
        uploadedAt: NOW,
        lastIndexedAt: NOW,
      })
    }
  }
  return docs
}

export const SEED_DOCUMENTS: SeedDocument[] = generateDocuments()

/* ------------------------------------------------------------------ */
/* Skills + data sources                                               */
/* ------------------------------------------------------------------ */

export const SEED_SKILLS: KnowledgeSkill[] = [
  { id: 'sk-calc-arith', baseId: 'kb-calc', name: 'arithmetic', description: '四则运算：+ - * /', inputSchema: { expression: 'string' }, status: 'ready', updatedAt: NOW },
  { id: 'sk-calc-percent', baseId: 'kb-calc', name: 'percentage', description: '百分比计算，如 "15% of 240"', inputSchema: { value: 'number', percent: 'number' }, status: 'ready', updatedAt: NOW },
  { id: 'sk-calc-fx', baseId: 'kb-calc', name: 'fx', description: '汇率换算（按日更新）', inputSchema: { amount: 'number', from: 'string', to: 'string' }, status: 'ready', updatedAt: NOW },
  { id: 'sk-translate-text', baseId: 'kb-translate', name: 'translate', description: '文本翻译，支持 40+ 语言', inputSchema: { text: 'string', target: 'string' }, status: 'ready', updatedAt: NOW },
  { id: 'sk-translate-detect', baseId: 'kb-translate', name: 'detect_language', description: '识别文本语言', inputSchema: { text: 'string' }, status: 'ready', updatedAt: NOW },
]

export const SEED_DATA_SOURCES: KnowledgeDataSource[] = [
  { id: 'ds-crm-customers', baseId: 'kb-crm', name: 'customers', kind: 'table', config: { table: 'customers', region: 'ap-southeast-1' }, status: 'connected', lastSyncedAt: NOW },
  { id: 'ds-crm-deals', baseId: 'kb-crm', name: 'deals', kind: 'table', config: { table: 'deals' }, status: 'connected', lastSyncedAt: NOW },
  { id: 'ds-warehouse-orders', baseId: 'kb-warehouse', name: 'orders', kind: 'database', config: { engine: 'postgres', schema: 'public' }, status: 'connected', lastSyncedAt: NOW },
  { id: 'ds-warehouse-revenue', baseId: 'kb-warehouse', name: 'revenue_daily', kind: 'database', config: { engine: 'postgres', schema: 'analytics' }, status: 'connected', lastSyncedAt: NOW },
]