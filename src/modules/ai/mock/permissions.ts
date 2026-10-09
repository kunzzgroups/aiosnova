import { DEMO_MERCHANT_ID } from '@/mocks/data/identity'
/**
 * Role + Visibility permission model.
 *
 * Two orthogonal concepts:
 *
 *   ROLE (per company) - what you may DO to that company's resources.
 *     viewer  - read only
 *     editor  - read + create / update / adopt templates / edit own templates
 *     admin   - everything, plus promote a base into the library and delete
 *               templates owned by the company
 *
 *   VISIBILITY (`resource.allowedCompanyIds`) - which companies may READ a
 *   specific resource. A resource defaults to "only its owner can read".
 *
 * Every read/write decision goes through the functions in this file. UI,
 * services, and (in production) the backend must all call them so the rules
 * can never drift.
 */

export type Role = 'viewer' | 'editor' | 'admin'

export type Membership = {
  companyId: string
  role: Role
}

export type User = {
  userId: string
  merchantId: string
  memberships: Membership[]
}

/**
 * The mock user.
 *
 * Companies in the seed:
 *   company-j1               admin   (home)
 *   company-j2               editor
 *   company-retail           editor
 *   company-wholesale        viewer
 *   company-tokyo-izakaya    (NOT a member)  - "no permission at all"
 */
export const MOCK_USER: User = {
  userId: 'user-demo',
  merchantId: DEMO_MERCHANT_ID,
  memberships: [
    { companyId: 'company-j1', role: 'admin' },
    { companyId: 'company-j2', role: 'editor' },
    { companyId: 'company-retail', role: 'editor' },
    { companyId: 'company-wholesale', role: 'viewer' },
  ],
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Can the user read this resource?
 *
 * `allowedCompanyIds` (when present and non-empty) is the whitelist.
 * Otherwise the resource is owner-only, using `companyId` as the owner.
 * A resource with neither is invisible to everyone.
 */
export function canRead(
  user: User,
  resource: { allowedCompanyIds?: string[]; companyId?: string },
): boolean {
  const allowed =
    resource.allowedCompanyIds && resource.allowedCompanyIds.length > 0
      ? resource.allowedCompanyIds
      : resource.companyId
        ? [resource.companyId]
        : []

  if (allowed.length === 0) return false
  return user.memberships.some((m) => allowed.includes(m.companyId))
}

/**
 * Can the user read this resource while acting as `activeCompanyId`?
 *
 * Stricter than `canRead`: the resource must be visible to THAT company,
 * not just to some company the user happens to belong to.
 */
export function canReadAsCompany(
  resource: { allowedCompanyIds?: string[]; companyId?: string },
  activeCompanyId: string,
): boolean {
  if (resource.companyId && resource.companyId === activeCompanyId) return true

  const allowed =
    resource.allowedCompanyIds && resource.allowedCompanyIds.length > 0
      ? resource.allowedCompanyIds
      : resource.companyId
        ? [resource.companyId]
        : []

  return allowed.includes(activeCompanyId)
}

/** Can the user write to this company's resources? editor or admin only. */
export function canWriteToCompany(user: User, companyId: string): boolean {
  return user.memberships.some(
    (m) =>
      m.companyId === companyId &&
      (m.role === 'editor' || m.role === 'admin'),
  )
}

/** Can the user write this specific resource? */
export function canWrite(user: User, resource: { companyId: string }): boolean {
  return canWriteToCompany(user, resource.companyId)
}

/** Can the user promote a base from its owner company into the library? */
export function canPromote(user: User, resource: { companyId: string }): boolean {
  return user.memberships.some(
    (m) => m.companyId === resource.companyId && m.role === 'admin',
  )
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * Can the user EDIT this template?
 *
 * Rule: editor or admin of the template's OWNER company. When
 * `activeCompanyId` is provided, the user must also be acting as that owner -
 * an admin of company A browsing from company B must not edit an A-owned
 * template.
 *
 * The `activeCompanyId` check is a UI-side restriction. The server-side
 * check (calling this without `activeCompanyId`) still uses the raw
 * membership, so a hand-crafted request cannot bypass the owner rule.
 */
export function canEditTemplate(
  user: User,
  template: { ownerCompanyId: string },
  activeCompanyId?: string,
): boolean {
  if (activeCompanyId && activeCompanyId !== template.ownerCompanyId) {
    return false
  }
  return user.memberships.some(
    (m) =>
      m.companyId === template.ownerCompanyId &&
      (m.role === 'admin' || m.role === 'editor'),
  )
}

/**
 * Can the user DELETE this template?
 *
 * Rule: admin of the template's OWNER company only. Editors can maintain a
 * template, but deleting it is destructive and stays with admins.
 */
export function canDeleteTemplate(
  user: User,
  template: { ownerCompanyId: string },
  activeCompanyId?: string,
): boolean {
  if (activeCompanyId && activeCompanyId !== template.ownerCompanyId) {
    return false
  }
  return user.memberships.some(
    (m) => m.companyId === template.ownerCompanyId && m.role === 'admin',
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function roleIn(user: User, companyId: string): Role | null {
  return user.memberships.find((m) => m.companyId === companyId)?.role ?? null
}

export function memberCompanyIds(user: User): string[] {
  return user.memberships.map((m) => m.companyId)
}

export function writableCompanyIds(user: User): string[] {
  return user.memberships
    .filter((m) => m.role === 'editor' || m.role === 'admin')
    .map((m) => m.companyId)
}