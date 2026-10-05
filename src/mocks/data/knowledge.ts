import type { KnowledgeBase, KnowledgeDocument } from '@/modules/ai/knowledge/types/knowledge'
import { DEMO_TENANT_ID } from '@/mocks/data/identity'

/**
 * Knowledge bases are seeded per company so the sidebar company switcher visibly
 * filters the list - EVERY company has material, so switching never lands on an
 * empty screen while the design is being reviewed.
 *
 * Nothing here is invented beyond the shapes the screen needs.
 */

function base(
  id: string,
  companyId: string,
  name: string,
  description: string,
  createdAt: string,
): KnowledgeBase {
  return { id, tenantId: DEMO_TENANT_ID, companyId, name, description, createdAt, updatedAt: createdAt }
}

export const knowledgeBases: KnowledgeBase[] = [
  // ── Acme Retail ────────────────────────────────────────────────
  base('kb-retail-company', 'company-retail', 'Company Knowledge', 'Company-wide policies, org handbook and internal procedures.', '2026-02-02T09:00:00.000Z'),
  base('kb-retail-hr', 'company-retail', 'HR Knowledge', 'People policies, leave rules and recruitment material.', '2026-02-06T09:00:00.000Z'),
  base('kb-retail-finance', 'company-retail', 'Finance Knowledge', 'Accounting standards, tax rules and reporting templates.', '2026-02-11T09:00:00.000Z'),

  // ── Acme Wholesale ─────────────────────────────────────────────
  base('kb-wholesale-supplier', 'company-wholesale', 'Supplier Agreements', 'Signed supplier contracts and negotiated price lists.', '2026-03-01T09:00:00.000Z'),
  base('kb-wholesale-compliance', 'company-wholesale', 'Trade Compliance', 'Import, duty and labelling requirements.', '2026-03-02T09:00:00.000Z'),

  // ── J1 (MIDVALLEY) ─────────────────────────────────────────────
  base('kb-j1-outlet', 'company-j1', 'Outlet Operations', 'Mid Valley outlet runbooks and shift checklists.', '2026-03-04T09:00:00.000Z'),
  base('kb-j1-menu', 'company-j1', 'Menu & Recipes', 'Standard recipes, portioning and allergen sheets.', '2026-03-05T09:00:00.000Z'),

  // ── J2 (PARADIGM MALL) ─────────────────────────────────────────
  base('kb-j2-outlet', 'company-j2', 'Outlet Operations', 'Paradigm Mall runbooks, shift checklists and incident logs.', '2026-03-08T09:00:00.000Z'),
  base('kb-j2-menu', 'company-j2', 'Menu & Recipes', 'Standard recipes, portioning and allergen sheets.', '2026-03-08T09:20:00.000Z'),
  base('kb-j2-promotions', 'company-j2', 'Promotions & Campaigns', 'Mall campaign briefs and in-store promotion rules.', '2026-03-09T09:00:00.000Z'),
  base('kb-j2-hr', 'company-j2', 'HR Knowledge', 'People policies and staff handbook for this outlet.', '2026-03-10T09:00:00.000Z'),

  // ── TOKYO IZAKAYA SDN BHD ──────────────────────────────────────
  base('kb-tokyo-outlet', 'company-tokyo-izakaya', 'Outlet Operations', 'Kitchen and floor runbooks.', '2026-03-12T09:00:00.000Z'),
  base('kb-tokyo-menu', 'company-tokyo-izakaya', 'Menu & Recipes', 'Izakaya menu, sake list and allergen sheets.', '2026-03-13T09:00:00.000Z'),
]

function document(
  id: string,
  baseId: string,
  title: string,
  type: KnowledgeDocument['type'],
  status: KnowledgeDocument['status'],
  sizeKb: number,
  uploadedAt: string,
  chunkCount: number,
): KnowledgeDocument {
  return {
    id,
    baseId,
    kind: 'file',
    type,
    title,
    status,
    chunkCount: status === 'ready' ? chunkCount : 0,
    sizeBytes: sizeKb * 1024,
    uploadedAt,
    lastIndexedAt: status === 'ready' ? uploadedAt : null,
  }
}

export const knowledgeDocuments: KnowledgeDocument[] = [
  // Acme Retail · Company Knowledge
  document('doc-101', 'kb-retail-company', 'Company Handbook 2026.pdf', 'policy', 'ready', 1799, '2026-02-02T09:10:00.000Z', 214),
  document('doc-102', 'kb-retail-company', 'Code of Conduct.pdf', 'policy', 'ready', 475, '2026-02-02T09:14:00.000Z', 61),
  document('doc-103', 'kb-retail-company', 'Expense Policy.docx', 'policy', 'ready', 207, '2026-02-03T10:02:00.000Z', 38),
  document('doc-104', 'kb-retail-company', 'Fire Safety Procedure.pdf', 'policy', 'failed', 1094, '2026-02-04T11:40:00.000Z', 0),
  document('doc-105', 'kb-retail-company', 'Data Protection Notice.pdf', 'policy', 'ready', 298, '2026-02-05T08:20:00.000Z', 47),

  // Acme Retail · HR Knowledge
  document('doc-111', 'kb-retail-hr', 'Employee Handbook.pdf', 'policy', 'ready', 1211, '2026-02-06T09:30:00.000Z', 158),
  document('doc-112', 'kb-retail-hr', 'Leave Policy.docx', 'policy', 'ready', 164, '2026-02-06T09:34:00.000Z', 29),
  document('doc-113', 'kb-retail-hr', 'Recruitment SOP.pdf', 'policy', 'ready', 725, '2026-02-07T14:05:00.000Z', 96),
  document('doc-114', 'kb-retail-hr', 'Benefits 2026.pdf', 'policy', 'processing', 892, '2026-02-12T07:45:00.000Z', 0),

  // Acme Retail · Finance Knowledge
  document('doc-121', 'kb-retail-finance', 'Accounting Standards.pdf', 'policy', 'ready', 2256, '2026-02-11T09:20:00.000Z', 288),
  document('doc-122', 'kb-retail-finance', 'Tax Filing Guide 2026.pdf', 'policy', 'ready', 639, '2026-02-11T09:26:00.000Z', 74),
  document('doc-123', 'kb-retail-finance', 'Vendor Contract Template.docx', 'contract', 'ready', 118, '2026-02-13T16:10:00.000Z', 19),
  document('doc-124', 'kb-retail-finance', 'Audit Findings 2025.pdf', 'record', 'ready', 496, '2026-02-14T10:00:00.000Z', 55),

  // Acme Wholesale · Supplier Agreements
  document('doc-201', 'kb-wholesale-supplier', 'Supplier MSA - Northwind.pdf', 'contract', 'ready', 421, '2026-03-01T09:22:00.000Z', 52),
  document('doc-202', 'kb-wholesale-supplier', 'Supplier MSA - Contoso.pdf', 'contract', 'ready', 388, '2026-03-01T09:26:00.000Z', 47),
  document('doc-203', 'kb-wholesale-supplier', 'Acme Wholesale Price List.xlsx', 'record', 'ready', 86, '2026-03-01T09:15:00.000Z', 12),

  // Acme Wholesale · Trade Compliance
  document('doc-211', 'kb-wholesale-compliance', 'Import Duty Schedule.pdf', 'policy', 'ready', 512, '2026-03-02T09:10:00.000Z', 63),
  document('doc-212', 'kb-wholesale-compliance', 'Labelling Requirements.docx', 'policy', 'processing', 143, '2026-03-02T11:30:00.000Z', 0),

  // J1 (MIDVALLEY) · Outlet Operations
  document('doc-301', 'kb-j1-outlet', 'Opening Checklist.docx', 'policy', 'ready', 62, '2026-03-04T09:05:00.000Z', 11),
  document('doc-302', 'kb-j1-outlet', 'Closing & Cash-Up SOP.pdf', 'policy', 'ready', 244, '2026-03-04T09:12:00.000Z', 31),
  document('doc-303', 'kb-j1-outlet', 'Incident Log Q1 2026.pdf', 'record', 'ready', 178, '2026-03-06T10:40:00.000Z', 22),

  // J1 (MIDVALLEY) · Menu & Recipes
  document('doc-311', 'kb-j1-menu', 'Core Menu 2026.pdf', 'policy', 'ready', 806, '2026-03-05T09:15:00.000Z', 104),
  document('doc-312', 'kb-j1-menu', 'Allergen Matrix.xlsx', 'record', 'ready', 74, '2026-03-05T09:20:00.000Z', 9),
  document('doc-313', 'kb-j1-menu', 'Portioning Guide.docx', 'policy', 'ready', 129, '2026-03-05T14:00:00.000Z', 17),

  // J2 (PARADIGM MALL) · Outlet Operations
  document('doc-401', 'kb-j2-outlet', 'Paradigm Opening Checklist.docx', 'policy', 'ready', 68, '2026-03-08T09:05:00.000Z', 12),
  document('doc-402', 'kb-j2-outlet', 'Closing & Cash-Up SOP.pdf', 'policy', 'ready', 251, '2026-03-08T09:12:00.000Z', 33),
  document('doc-403', 'kb-j2-outlet', 'Equipment Maintenance Log.pdf', 'record', 'ready', 342, '2026-03-08T15:20:00.000Z', 41),
  document('doc-404', 'kb-j2-outlet', 'Incident Log Q1 2026.pdf', 'record', 'processing', 186, '2026-03-11T08:50:00.000Z', 0),
  document('doc-405', 'kb-j2-outlet', 'Pest Control Report.pdf', 'record', 'failed', 97, '2026-03-11T09:30:00.000Z', 0),

  // J2 (PARADIGM MALL) · Menu & Recipes
  document('doc-411', 'kb-j2-menu', 'Core Menu 2026.pdf', 'policy', 'ready', 812, '2026-03-08T09:25:00.000Z', 106),
  document('doc-412', 'kb-j2-menu', 'Allergen Matrix.xlsx', 'record', 'ready', 71, '2026-03-08T09:30:00.000Z', 9),
  document('doc-413', 'kb-j2-menu', 'Portioning Guide.docx', 'policy', 'ready', 134, '2026-03-08T14:10:00.000Z', 18),
  document('doc-414', 'kb-j2-menu', 'Seasonal Specials.docx', 'policy', 'ready', 96, '2026-03-10T11:00:00.000Z', 13),

  // J2 (PARADIGM MALL) · Promotions & Campaigns
  document('doc-421', 'kb-j2-promotions', 'Mall Campaign Brief - Raya.pdf', 'policy', 'ready', 296, '2026-03-09T09:10:00.000Z', 37),
  document('doc-422', 'kb-j2-promotions', 'In-Store Discount Rules.docx', 'policy', 'ready', 118, '2026-03-09T09:18:00.000Z', 15),
  document('doc-423', 'kb-j2-promotions', 'Loyalty Programme Terms.pdf', 'contract', 'processing', 233, '2026-03-11T10:15:00.000Z', 0),

  // J2 (PARADIGM MALL) · HR Knowledge
  document('doc-431', 'kb-j2-hr', 'Outlet Staff Handbook.pdf', 'policy', 'ready', 687, '2026-03-10T09:20:00.000Z', 88),
  document('doc-432', 'kb-j2-hr', 'Shift & Overtime Policy.docx', 'policy', 'ready', 154, '2026-03-10T09:26:00.000Z', 21),

  // TOKYO IZAKAYA · Outlet Operations
  document('doc-501', 'kb-tokyo-outlet', 'Kitchen Runbook.pdf', 'policy', 'ready', 402, '2026-03-12T09:10:00.000Z', 49),
  document('doc-502', 'kb-tokyo-outlet', 'Floor Service SOP.pdf', 'policy', 'ready', 318, '2026-03-12T09:16:00.000Z', 38),
  document('doc-503', 'kb-tokyo-outlet', 'Cleaning Schedule.xlsx', 'record', 'ready', 58, '2026-03-12T09:22:00.000Z', 7),

  // TOKYO IZAKAYA · Menu & Recipes
  document('doc-511', 'kb-tokyo-menu', 'Izakaya Menu 2026.pdf', 'policy', 'ready', 954, '2026-03-13T09:10:00.000Z', 121),
  document('doc-512', 'kb-tokyo-menu', 'Sake & Beverage List.pdf', 'policy', 'ready', 431, '2026-03-13T09:18:00.000Z', 52),
  document('doc-513', 'kb-tokyo-menu', 'Allergen Matrix.xlsx', 'record', 'ready', 66, '2026-03-13T09:24:00.000Z', 8),
  document('doc-514', 'kb-tokyo-menu', 'Recipe Cards - Skewers.docx', 'policy', 'processing', 187, '2026-03-14T08:40:00.000Z', 0),
]

