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
  action?: 'search' | 'tenant' | 'company' | 'favorites' | 'recent'
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
  { id: 'favorites', label: 'Favorites', action: 'favorites', path: '/favorites' },
  { id: 'recent', label: 'Recent', action: 'recent', path: '/recent' },
]

export const sidebarSections: SidebarSection[] = [
  {
    id: 'overview',
    label: 'Overview',
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
        'AI Copilot',
        'AI Agents',
        'Agent Manager',
        'Prompt Center',
        'Knowledge Base',
        'RAG',
        'Memory',
        'AI Automation',
        'AI Decision Engine',
        'Multi-Agent System',
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
          'Users',
          'Companies',
          'Organization',
          'Roles',
          'Permissions',
          'Multi-Tenant',
          'Login & SSO',
          'Audit Logs',
          'Notifications',
          'File Center',
          'Workflows',
          'Approvals',
          'Settings',
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

export function collectAncestorGroupIds(pathname: string): string[] {
  const ids: string[] = []

  function walk(nodes: SidebarNode[], ancestors: string[]): boolean {
    for (const node of nodes) {
      if (node.kind === 'link' && node.path === pathname) {
        ids.push(...ancestors)
        return true
      }
      if (node.kind === 'group') {
        if (walk(node.children, [...ancestors, node.id])) {
          return true
        }
      }
    }
    return false
  }

  for (const section of sidebarSections) {
    if (walk(section.children, [section.id])) {
      break
    }
  }

  return ids
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
