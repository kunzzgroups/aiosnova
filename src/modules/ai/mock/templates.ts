/**
 * Central template library.
 *
 * Templates live at the TENANT level. Each template carries:
 *   - `ownerCompanyId`     the company that owns it. Only its admin can
 *                          edit or delete the template.
 *   - `allowedCompanyIds`  which companies can see and adopt it. Always
 *                          includes the owner.
 *
 * Adoption is a snapshot: it copies the content into a new base owned by the
 * target company; later edits to the template do not propagate.
 */

export type SeedTemplate = {
  id: string
  name: string
  description: string
  category: string
  kind: 'document' | 'skill' | 'data'
  /** The company that owns this template. Only its admin can edit/delete. */
  ownerCompanyId: string
  /** Which companies may see and adopt this template. Always includes owner. */
  allowedCompanyIds: string[]
  documents?: Array<{
    title: string
    type: 'policy' | 'contract' | 'invoice' | 'record'
  }>
  skills?: Array<{
    name: string
    description: string
    inputSchema?: Record<string, unknown>
  }>
  dataSources?: Array<{
    name: string
    kind: 'table' | 'api' | 'database'
    config: Record<string, string>
  }>
}

const J1 = 'company-j1'
const J2 = 'company-j2'
const RETAIL = 'company-retail'
const WHOLESALE = 'company-wholesale'
// company-tokyo-izakaya is intentionally absent from every template.

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    id: 'tpl-hr-handbook',
    name: 'HR Handbook',
    description: 'Standard employee handbook, leave policy, and attendance SOP.',
    category: 'HR',
    kind: 'document',
    ownerCompanyId: J1,
    allowedCompanyIds: [J1, J2, RETAIL],
    documents: [
      { title: 'Employee Handbook.pdf', type: 'policy' },
      { title: 'Leave Policy.docx', type: 'policy' },
      { title: 'Attendance SOP.pdf', type: 'policy' },
    ],
  },
  {
    id: 'tpl-it-onboarding',
    name: 'IT Onboarding',
    description: 'New hire IT setup, assessment, and security policy.',
    category: 'IT',
    kind: 'document',
    ownerCompanyId: J1,
    allowedCompanyIds: [J1, RETAIL],
    documents: [
      { title: 'IT Onboarding Checklist.pdf', type: 'policy' },
      { title: 'IT New Hire Assessment.docx', type: 'policy' },
      { title: 'Security Policy.pdf', type: 'policy' },
    ],
  },
  {
    id: 'tpl-finance-reporting',
    name: 'Finance Reporting',
    description: 'Monthly reporting template and expense policy.',
    category: 'Finance',
    kind: 'document',
    ownerCompanyId: J1,
    allowedCompanyIds: [J1],
    documents: [
      { title: 'Monthly Report Template.xlsx', type: 'record' },
      { title: 'Expense Policy.pdf', type: 'policy' },
    ],
  },
  {
    id: 'tpl-operations-sop',
    name: 'Store Operations SOP',
    description: 'Opening, closing, and daily-operations procedures.',
    category: 'Operations',
    kind: 'document',
    ownerCompanyId: J1,
    allowedCompanyIds: [J1, J2, RETAIL, WHOLESALE],
    documents: [
      { title: 'Opening Checklist.pdf', type: 'policy' },
      { title: 'Closing Checklist.pdf', type: 'policy' },
      { title: 'Cash Handling SOP.pdf', type: 'policy' },
    ],
  },
  {
    id: 'tpl-marketing-campaigns',
    name: 'Marketing Campaigns',
    description: 'Campaign briefs, brand voice, and content calendar.',
    category: 'Marketing',
    kind: 'document',
    ownerCompanyId: J2,
    allowedCompanyIds: [J2],
    documents: [
      { title: 'Brand Voice.pdf', type: 'policy' },
      { title: 'Campaign Brief Template.docx', type: 'policy' },
    ],
  },
  {
    id: 'tpl-calculator-skill',
    name: 'Calculator Skill',
    description: 'Reusable math skills the assistant can call.',
    category: 'Skills',
    kind: 'skill',
    ownerCompanyId: J1,
    allowedCompanyIds: [J1],
    skills: [
      { name: 'arithmetic', description: 'Basic + - * /' },
      { name: 'percentage', description: 'Percent math' },
    ],
  },
  {
    id: 'tpl-crm-data',
    name: 'CRM Data Connector',
    description: 'Standard CRM tables (customers, deals).',
    category: 'Data',
    kind: 'data',
    ownerCompanyId: J1,
    allowedCompanyIds: [J1, RETAIL],
    dataSources: [
      { name: 'customers', kind: 'table', config: { table: 'customers' } },
      { name: 'deals', kind: 'table', config: { table: 'deals' } },
    ],
  },
]