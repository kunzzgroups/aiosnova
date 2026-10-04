export type SidebarLink = {
  kind: 'link'
  id: string
  label: string
  path: string
}

export type SidebarGroup = {
  kind: 'group'
  id: string
  label: string
  children: SidebarNode[]
}

export type SidebarNode = SidebarLink | SidebarGroup

export type SidebarSection = {
  id: string
  label: string
  children: SidebarNode[]
}

export type SidebarUtilityItem = {
  id: string
  label: string
  path?: string
  action?: 'search' | 'tenant' | 'company'
}

export type ModuleMatch = {
  section: SidebarSection
  module: SidebarGroup
  items: SidebarLink[]
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function link(label: string, basePath: string): SidebarLink {
  const path = `${basePath}/${slugify(label)}`
  return {
    kind: 'link',
    id: path.replace(/^\//, '').replace(/\//g, '.'),
    label,
    path,
  }
}

function group(label: string, basePath: string, childLabels: string[]): SidebarGroup {
  const path = `${basePath}/${slugify(label)}`
  return {
    kind: 'group',
    id: path.replace(/^\//, '').replace(/\//g, '.'),
    label,
    children: childLabels.map((child) => link(child, path)),
  }
}

function moduleGroup(
  basePath: string,
  modules: Array<{ label: string; items: string[] }>,
): SidebarGroup[] {
  return modules.map((module) => group(module.label, basePath, module.items))
}

export const sidebarUtilities: SidebarUtilityItem[] = [
  { id: 'search', label: 'Search', action: 'search' },
  { id: 'tenant-switcher', label: 'Tenant Switcher', action: 'tenant' },
  { id: 'company-switcher', label: 'Company Switcher', action: 'company' },
]

export const sidebarSections: SidebarSection[] = [
  {
    id: 'overview',
    label: 'Dashboard',
    children: [
      group('Dashboard', '/overview', [
        'Executive Dashboard',
        'KPI',
        'Real-Time Dashboard',
        'Reports',
        'Analytics',
        'Forecast',
        'Alerts',
        'AI Insights',
      ]),
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    children: [
      group('AI', '/ai', [
        'AI Assistant',
        'AI Agents',
        'Agent Manager',
        'Knowledge',
        'Automation',
        'AI Settings',
      ]),
    ],
  },
  {
    id: 'customer-revenue',
    label: 'Customer & Revenue',
    children: moduleGroup('/customer-revenue', [
      {
        label: 'CRM',
        items: [
          'Customers',
          'Leads',
          'Opportunities',
          'Pipeline',
          'Customer 360',
          'Membership',
          'Loyalty',
          'Customer Service',
        ],
      },
      {
        label: 'Sales',
        items: [
          'Quotations',
          'Sales Orders',
          'Contracts',
          'Invoices',
          'Sales Commission',
          'Sales Targets',
          'Sales Forecast',
        ],
      },
      {
        label: 'POS',
        items: [
          'POS Terminal',
          'Orders',
          'Payments',
          'Refunds',
          'Discounts',
          'Promotions',
          'Membership',
          'Shifts',
          'Cash Drawer',
          'Outlets',
        ],
      },
      {
        label: 'Commerce',
        items: [
          'Ecommerce',
          'Mobile Commerce',
          'Commerce Marketplace',
          'Online Orders',
          'Delivery',
          'Pickup',
          'Omni-Channel',
        ],
      },
      {
        label: 'Marketing',
        items: [
          'Campaigns',
          'Email',
          'SMS',
          'WhatsApp',
          'Push Notifications',
          'Social Media',
          'Marketing Automation',
          'Customer Segments',
        ],
      },
      {
        label: 'Help Desk',
        items: [
          'Tickets',
          'SLA',
          'Live Chat',
          'Customer Support',
          'Support Knowledge Base',
          'AI Support Agent',
        ],
      },
    ]),
  },
  {
    id: 'operations',
    label: 'Operations',
    children: moduleGroup('/operations', [
      {
        label: 'Inventory',
        items: [
          'Products',
          'SKUs',
          'Warehouses',
          'Stock',
          'Stock Transfers',
          'Stock Counts',
          'Batches',
          'Serial Numbers',
          'Reorder',
        ],
      },
      {
        label: 'Procurement',
        items: [
          'Suppliers',
          'Purchase Requests',
          'RFQ',
          'Purchase Orders',
          'Goods Receiving',
          'Supplier Invoices',
          'Supplier Evaluation',
        ],
      },
      {
        label: 'Supply Chain',
        items: [
          'Demand Planning',
          'Supply Planning',
          'Logistics',
          'Shipments',
          'Distribution',
          'Route Planning',
          'Control Tower',
        ],
      },
      {
        label: 'Manufacturing',
        items: [
          'BOM',
          'Production Orders',
          'Work Centers',
          'Material Planning',
          'Production Planning',
          'Quality',
          'Manufacturing Maintenance',
        ],
      },
      {
        label: 'Asset Management',
        items: ['Assets', 'Equipment', 'Asset Maintenance', 'Warranty', 'Lifecycle'],
      },
    ]),
  },
  {
    id: 'finance-people',
    label: 'Finance & People',
    children: moduleGroup('/finance-people', [
      {
        label: 'Finance',
        items: [
          'General Ledger',
          'Accounts Payable',
          'Accounts Receivable',
          'Cash Flow',
          'Bank',
          'Expenses',
          'Budget',
          'Fixed Assets',
          'Tax',
          'Profit & Loss',
          'Balance Sheet',
        ],
      },
      {
        label: 'HRM',
        items: [
          'Employees',
          'Recruitment',
          'Attendance',
          'Leave',
          'Payroll',
          'Performance',
          'Training',
          'Shifts',
          'Employee Self Service',
        ],
      },
    ]),
  },
  {
    id: 'work-management',
    label: 'Work Management',
    children: moduleGroup('/work-management', [
      {
        label: 'Projects',
        items: [
          'Projects',
          'Tasks',
          'Milestones',
          'Kanban',
          'Timeline',
          'Timesheets',
          'Cost',
          'Resource Planning',
        ],
      },
      {
        label: 'Documents',
        items: [
          'Documents',
          'Version Control',
          'E-Signature',
          'Contract Management',
          'AI Document Search',
        ],
      },
      {
        label: 'Communication',
        items: ['Chat', 'Channels', 'Video Meetings', 'Announcements', 'Internal Collaboration'],
      },
      {
        label: 'Automation',
        items: ['Workflow Builder', 'Rule Engine', 'Triggers', 'Scheduler', 'Webhooks', 'AI Workflow'],
      },
    ]),
  },
  {
    id: 'platform',
    label: 'Platform',
    children: moduleGroup('/platform', [
      {
        label: 'Developer Platform',
        items: [
          'REST API',
          'GraphQL API',
          'Webhooks',
          'SDK',
          'OAuth',
          'API Keys',
          'Developer Console',
          'Sandbox',
        ],
      },
      {
        label: 'Integration Hub',
        items: [
          'Payment Gateways',
          'Banking',
          'Accounting',
          'Ecommerce',
          'Delivery',
          'Social Media',
          'Google',
          'Microsoft',
          'Third-Party APIs',
        ],
      },
      {
        label: 'App Marketplace',
        items: ['Apps', 'Plugins', 'Extensions', 'Themes', 'Developers'],
      },
      {
        label: 'Data Platform',
        items: [
          'Operational Database',
          'Data Warehouse',
          'Data Lake',
          'ETL',
          'Master Data',
          'Customer Data Platform',
          'AI Data Platform',
        ],
      },
    ]),
  },
  {
    id: 'system',
    label: 'System',
    children: moduleGroup('/system', [
      {
        label: 'Core',
        items: [
          'Employees',
          'Companies',
          'Organization',
          'Roles & Access',
          'Security',
          'Activity',
        ],
      },
      {
        label: 'Security',
        items: [
          'MFA',
          'SSO',
          'RBAC',
          'ABAC',
          'Encryption',
          'Security Audit',
          'Device Management',
          'Risk Detection',
          'Zero Trust',
        ],
      },
      {
        label: 'Cloud Platform',
        items: [
          'Multi-Region',
          'Auto Scaling',
          'Backup',
          'Disaster Recovery',
          'Monitoring',
          'Logging',
          'Observability',
        ],
      },
    ]),
  },
  {
    id: 'platform-admin',
    label: 'Platform Admin',
    children: [
      group('Admin / Super Admin', '/platform-admin', [
        'Tenant Management',
        'Subscription',
        'Billing',
        'Plans',
        'Feature Control',
        'Usage',
        'Platform Security',
        'System Monitoring',
      ]),
    ],
  },
]

export function findSidebarLink(
  nodes: SidebarNode[],
  path: string,
): SidebarLink | null {
  for (const node of nodes) {
    if (node.kind === 'link' && node.path === path) {
      return node
    }
    if (node.kind === 'group') {
      const found = findSidebarLink(node.children, path)
      if (found) {
        return found
      }
    }
  }
  return null
}

export function findSidebarLabelByPath(path: string): string | null {
  for (const section of sidebarSections) {
    const found = findSidebarLink(section.children, path)
    if (found) {
      return found.label
    }
  }

  const utility = sidebarUtilities.find((item) => item.path === path)
  return utility?.label ?? null
}

export function findModuleByPath(pathname: string): ModuleMatch | null {
  for (const section of sidebarSections) {
    for (const node of section.children) {
      if (node.kind !== 'group') {
        continue
      }
      const items = node.children.filter((child): child is SidebarLink => child.kind === 'link')
      if (items.length === 0) {
        continue
      }
      const matched = items.some(
        (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
      )
      if (matched) {
        return { section, module: node, items }
      }
    }
  }
  return null
}

/**
 * Deepest nav link owning a path - i.e. the page the user is on. Used for the
 * workspace header title, so it always reads exactly like the sidebar entry
 * ("Users", "AI Assistant") instead of a generic label.
 *
 * Longest match wins, so a detail route such as `/system/core/users/:id` still
 * resolves to the list link it belongs to rather than a shorter prefix.
 */
export function findNavItemByPath(pathname: string): SidebarLink | null {
  let best: SidebarLink | null = null

  function visit(nodes: SidebarNode[]) {
    for (const node of nodes) {
      if (node.kind === 'group') {
        visit(node.children)
        continue
      }
      const matches = pathname === node.path || pathname.startsWith(`${node.path}/`)
      if (matches && (best === null || node.path.length > best.path.length)) {
        best = node
      }
    }
  }

  for (const section of sidebarSections) {
    visit(section.children)
  }

  return best
}

export function filterSidebarSections(query: string): SidebarSection[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return sidebarSections
  }

  function filterNodes(nodes: SidebarNode[]): SidebarNode[] {
    const result: SidebarNode[] = []
    for (const node of nodes) {
      if (node.kind === 'link') {
        if (node.label.toLowerCase().includes(normalized)) {
          result.push(node)
        }
        continue
      }

      const children = filterNodes(node.children)
      if (node.label.toLowerCase().includes(normalized) || children.length > 0) {
        result.push({ ...node, children })
      }
    }
    return result
  }

  return sidebarSections
    .map((section) => ({
      ...section,
      children: filterNodes(section.children),
    }))
    .filter((section) => section.children.length > 0)
}
