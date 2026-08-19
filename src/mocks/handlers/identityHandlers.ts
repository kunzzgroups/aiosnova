import { HttpResponse, http } from 'msw'
import { MOCK_MFA_CODE, provisionMockAuthUser, removeMockAuthUser, setMockUserMfaEnabled } from '@/mocks/data/users'
import {
  DEMO_TENANT_ID,
  identityCompanies,
  identityMemberships,
  identityOrganizations,
  identityPositions,
  identityUsers,
} from '@/mocks/data/identity'
import type {
  CompanyRecord,
  IdentityProfilePayload,
  IdentityUser,
  MembershipRecord,
  OrganizationNode,
  PositionRecord,
} from '@/modules/core/identity/types/identity'

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}

function wouldCreateCycle(nodeId: string, newParentId: string | null): boolean {
  if (!newParentId) {
    return false
  }
  if (newParentId === nodeId) {
    return true
  }

  let current: string | null = newParentId
  while (current) {
    if (current === nodeId) {
      return true
    }
    const parent = identityOrganizations.find((item) => item.id === current)
    current = parent?.parentId ?? null
  }
  return false
}

function companyMemberCount(companyId: string) {
  const userIds = new Set(
    identityMemberships
      .filter((item) => item.companyId === companyId && item.status === 'active')
      .map((item) => item.userId),
  )
  return userIds.size
}

function withMemberCount(company: CompanyRecord) {
  return {
    ...company,
    memberCount: companyMemberCount(company.id),
  }
}

export const identityHandlers = [
  http.get('/api/identity/meta', () => {
    return HttpResponse.json({
      tenantId: DEMO_TENANT_ID,
      companies: identityCompanies,
    })
  }),

  http.get('/api/identity/users', () => {
    return HttpResponse.json({ items: identityUsers })
  }),

  http.get('/api/identity/users/:id', ({ params }) => {
    const user = identityUsers.find((item) => item.id === params.id)
    if (!user) {
      return HttpResponse.json({ message: 'User not found.' }, { status: 404 })
    }

    const memberships = identityMemberships
      .filter((item) => item.userId === user.id)
      .map((item) => ({
        ...item,
        companyName:
          identityCompanies.find((company) => company.id === item.companyId)?.name ?? null,
        organizationName:
          identityOrganizations.find((org) => org.id === item.organizationId)?.name ?? null,
        positionName:
          identityPositions.find((position) => position.id === item.positionId)?.name ?? null,
      }))

    return HttpResponse.json({ user, memberships })
  }),

  http.post('/api/identity/users/:id/password-reset', ({ params }) => {
    const user = identityUsers.find((item) => item.id === params.id)
    if (!user) {
      return HttpResponse.json({ message: 'User not found.' }, { status: 404 })
    }

    if (user.status === 'disabled') {
      return HttpResponse.json(
        { message: 'Cannot send a password reset for a disabled user.' },
        { status: 400 },
      )
    }

    return HttpResponse.json({
      message: `Password reset email queued for ${user.email} (demo — no email sent).`,
      demoHint: 'User should complete reset via Forgot password with their email.',
    })
  }),

  http.post('/api/identity/users/:id/mfa/disable', async ({ params, request }) => {
    const user = identityUsers.find((item) => item.id === params.id)
    if (!user) {
      return HttpResponse.json({ message: 'User not found.' }, { status: 404 })
    }

    if (!user.mfaEnabled) {
      return HttpResponse.json({ message: 'MFA is not enabled for this user.' }, { status: 400 })
    }

    const body = (await request.json()) as { code?: string }
    if (body.code !== MOCK_MFA_CODE) {
      return HttpResponse.json({ message: 'Invalid verification code.' }, { status: 400 })
    }

    setMockUserMfaEnabled(user.id, false)
    return HttpResponse.json({
      user,
      message: `MFA disabled for ${user.displayName}.`,
    })
  }),

  http.post('/api/identity/users/:id/mfa/enable', async ({ params, request }) => {
    const user = identityUsers.find((item) => item.id === params.id)
    if (!user) {
      return HttpResponse.json({ message: 'User not found.' }, { status: 404 })
    }

    if (user.mfaEnabled) {
      return HttpResponse.json({ message: 'MFA is already enabled for this user.' }, { status: 400 })
    }

    const body = (await request.json()) as { code?: string }
    if (body.code !== MOCK_MFA_CODE) {
      return HttpResponse.json({ message: 'Invalid verification code.' }, { status: 400 })
    }

    setMockUserMfaEnabled(user.id, true)
    return HttpResponse.json({
      user,
      message: `MFA enabled for ${user.displayName}.`,
    })
  }),

  http.post('/api/identity/users', async ({ request }) => {
    const body = (await request.json()) as {
      email?: string
      password?: string
      companyId?: string
      status?: IdentityUser['status']
    }

    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''
    const companyId = body.companyId?.trim() ?? ''
    const displayName = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'Invited user'

    if (!email) {
      return HttpResponse.json({ message: 'Email is required.' }, { status: 400 })
    }

    if (password.length < 8) {
      return HttpResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const company = identityCompanies.find((item) => item.id === companyId && item.tenantId === DEMO_TENANT_ID)
    if (!company) {
      return HttpResponse.json({ message: 'Company is required.' }, { status: 400 })
    }
    if (company.status !== 'active') {
      return HttpResponse.json({ message: 'Cannot invite a user into an inactive company.' }, { status: 400 })
    }

    if (identityUsers.some((user) => user.email === email)) {
      return HttpResponse.json({ message: 'A user with this email already exists.' }, { status: 409 })
    }

    const user: IdentityUser = {
      id: createId('user'),
      email,
      displayName,
      fullName: '',
      phone: '',
      avatarUrl: '',
      language: 'en',
      timezone: 'Asia/Kuala_Lumpur',
      status: body.status ?? 'invited',
      signInMethod: null,
      mfaEnabled: false,
      lastActiveAt: null,
      createdAt: new Date().toISOString(),
    }

    identityUsers.push(user)
    identityMemberships.push({
      id: createId('mem'),
      tenantId: DEMO_TENANT_ID,
      userId: user.id,
      companyId: company.id,
      organizationId: null,
      positionId: null,
      isPrimary: true,
      status: 'active',
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: null,
    })
    provisionMockAuthUser({
      id: user.id,
      email: user.email,
      name: user.displayName,
      mfaEnabled: user.mfaEnabled,
      password,
    })
    return HttpResponse.json(user, { status: 201 })
  }),

  http.patch('/api/identity/users/:id', async ({ params, request }) => {
    const user = identityUsers.find((item) => item.id === params.id)
    if (!user) {
      return HttpResponse.json({ message: 'User not found.' }, { status: 404 })
    }

    const body = (await request.json()) as IdentityProfilePayload
    if (body.displayName !== undefined) {
      user.displayName = body.displayName.trim()
    }
    if (body.fullName !== undefined) {
      user.fullName = body.fullName.trim()
    }
    if (body.phone !== undefined) {
      user.phone = body.phone.trim()
    }
    if (body.avatarUrl !== undefined) {
      user.avatarUrl = body.avatarUrl.trim()
    }
    if (body.language !== undefined) {
      user.language = body.language
    }
    if (body.timezone !== undefined) {
      user.timezone = body.timezone
    }
    if (body.status !== undefined) {
      user.status = body.status
    }

    return HttpResponse.json(user)
  }),

  http.delete('/api/identity/users/:id', ({ params, request }) => {
    const index = identityUsers.findIndex((item) => item.id === params.id)
    if (index < 0) {
      return HttpResponse.json({ message: 'User not found.' }, { status: 404 })
    }

    const id = String(params.id)
    const auth = request.headers.get('Authorization')
    const actorMatch = auth?.startsWith('Bearer ') ? /^access_(.+)$/.exec(auth.slice(7)) : null
    if (actorMatch?.[1] === id) {
      return HttpResponse.json({ message: 'You cannot delete your own account.' }, { status: 409 })
    }

    identityUsers.splice(index, 1)
    for (let i = identityMemberships.length - 1; i >= 0; i -= 1) {
      if (identityMemberships[i]?.userId === id) {
        identityMemberships.splice(i, 1)
      }
    }
    removeMockAuthUser(id)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/identity/companies', () => {
    return HttpResponse.json({ items: identityCompanies.map(withMemberCount) })
  }),

  http.get('/api/identity/companies/:id', ({ params }) => {
    const company = identityCompanies.find((item) => item.id === params.id)
    if (!company) {
      return HttpResponse.json({ message: 'Company not found.' }, { status: 404 })
    }

    const members = identityMemberships
      .filter((item) => item.companyId === company.id)
      .map((item) => {
        const user = identityUsers.find((entry) => entry.id === item.userId)
        return {
          membershipId: item.id,
          userId: item.userId,
          displayName: user?.displayName ?? item.userId,
          email: user?.email ?? '—',
          userStatus: user?.status ?? 'disabled',
          isPrimary: item.isPrimary,
          status: item.status,
          organizationName:
            identityOrganizations.find((org) => org.id === item.organizationId)?.name ?? null,
          positionName:
            identityPositions.find((position) => position.id === item.positionId)?.name ?? null,
        }
      })

    return HttpResponse.json({
      company: withMemberCount(company),
      members,
    })
  }),

  http.post('/api/identity/companies', async ({ request }) => {
    const body = (await request.json()) as { code?: string; name?: string }
    const code = body.code?.trim().toUpperCase() ?? ''
    const name = body.name?.trim() ?? ''

    if (!code || !name) {
      return HttpResponse.json({ message: 'Code and name are required.' }, { status: 400 })
    }

    if (identityCompanies.some((item) => item.tenantId === DEMO_TENANT_ID && item.code === code)) {
      return HttpResponse.json({ message: 'A company with this code already exists.' }, { status: 409 })
    }

    const company: CompanyRecord = {
      id: createId('company'),
      tenantId: DEMO_TENANT_ID,
      code,
      name,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    identityCompanies.push(company)
    return HttpResponse.json(withMemberCount(company), { status: 201 })
  }),

  http.patch('/api/identity/companies/:id', async ({ params, request }) => {
    const company = identityCompanies.find((item) => item.id === params.id)
    if (!company) {
      return HttpResponse.json({ message: 'Company not found.' }, { status: 404 })
    }

    const body = (await request.json()) as {
      name?: string
      status?: CompanyRecord['status']
    }

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return HttpResponse.json({ message: 'Name is required.' }, { status: 400 })
      }
      company.name = name
    }

    if (body.status !== undefined) {
      company.status = body.status
    }

    return HttpResponse.json(withMemberCount(company))
  }),

  http.get('/api/identity/organizations', () => {
    const items = [...identityOrganizations].sort((a, b) => a.sortOrder - b.sortOrder)
    return HttpResponse.json({ items })
  }),

  http.post('/api/identity/organizations', async ({ request }) => {
    const body = (await request.json()) as {
      parentId?: string | null
      code?: string
      name?: string
      type?: OrganizationNode['type']
    }

    const code = body.code?.trim().toUpperCase() ?? ''
    const name = body.name?.trim() ?? ''
    const parentId = body.parentId ?? null

    if (!code || !name) {
      return HttpResponse.json({ message: 'Code and name are required.' }, { status: 400 })
    }

    if (identityOrganizations.some((item) => item.code === code)) {
      return HttpResponse.json({ message: 'Organization code already exists in this tenant.' }, { status: 409 })
    }

    if (parentId && !identityOrganizations.some((item) => item.id === parentId)) {
      return HttpResponse.json({ message: 'Parent organization not found.' }, { status: 400 })
    }

    const node: OrganizationNode = {
      id: createId('org'),
      tenantId: DEMO_TENANT_ID,
      parentId,
      code,
      name,
      type: body.type ?? 'department',
      status: 'active',
      sortOrder: identityOrganizations.length + 1,
    }

    identityOrganizations.push(node)
    return HttpResponse.json(node, { status: 201 })
  }),

  http.patch('/api/identity/organizations/:id', async ({ params, request }) => {
    const node = identityOrganizations.find((item) => item.id === params.id)
    if (!node) {
      return HttpResponse.json({ message: 'Organization not found.' }, { status: 404 })
    }

    const body = (await request.json()) as Partial<
      Pick<OrganizationNode, 'name' | 'status' | 'parentId' | 'type'>
    >

    if (body.parentId !== undefined) {
      if (wouldCreateCycle(node.id, body.parentId)) {
        return HttpResponse.json({ message: 'Cannot move organization under its descendant.' }, { status: 409 })
      }
      if (body.parentId && !identityOrganizations.some((item) => item.id === body.parentId)) {
        return HttpResponse.json({ message: 'Parent organization not found.' }, { status: 400 })
      }
      node.parentId = body.parentId
    }

    if (body.name !== undefined) {
      node.name = body.name.trim()
    }
    if (body.status !== undefined) {
      node.status = body.status
    }
    if (body.type !== undefined) {
      node.type = body.type
    }

    return HttpResponse.json(node)
  }),

  http.delete('/api/identity/organizations/:id', ({ params }) => {
    const index = identityOrganizations.findIndex((item) => item.id === params.id)
    if (index < 0) {
      return HttpResponse.json({ message: 'Organization not found.' }, { status: 404 })
    }

    const id = String(params.id)
    if (identityOrganizations.some((item) => item.parentId === id)) {
      return HttpResponse.json(
        { message: 'Cannot delete an organization that still has child nodes.' },
        { status: 409 },
      )
    }

    if (identityMemberships.some((item) => item.organizationId === id && item.status === 'active')) {
      return HttpResponse.json(
        { message: 'Cannot delete an organization that still has active memberships.' },
        { status: 409 },
      )
    }

    identityOrganizations.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/identity/positions', () => {
    return HttpResponse.json({ items: identityPositions })
  }),

  http.post('/api/identity/positions', async ({ request }) => {
    const body = (await request.json()) as {
      code?: string
      name?: string
      description?: string
    }

    const code = body.code?.trim().toUpperCase() ?? ''
    const name = body.name?.trim() ?? ''

    if (!code || !name) {
      return HttpResponse.json({ message: 'Code and name are required.' }, { status: 400 })
    }

    if (identityPositions.some((item) => item.code === code)) {
      return HttpResponse.json({ message: 'Position code already exists in this tenant.' }, { status: 409 })
    }

    const position: PositionRecord = {
      id: createId('pos'),
      tenantId: DEMO_TENANT_ID,
      code,
      name,
      description: body.description?.trim() ?? '',
      status: 'active',
    }

    identityPositions.push(position)
    return HttpResponse.json(position, { status: 201 })
  }),

  http.patch('/api/identity/positions/:id', async ({ params, request }) => {
    const position = identityPositions.find((item) => item.id === params.id)
    if (!position) {
      return HttpResponse.json({ message: 'Position not found.' }, { status: 404 })
    }

    const body = (await request.json()) as Partial<
      Pick<PositionRecord, 'name' | 'description' | 'status'>
    >

    if (body.name !== undefined) {
      position.name = body.name.trim()
    }
    if (body.description !== undefined) {
      position.description = body.description.trim()
    }
    if (body.status !== undefined) {
      position.status = body.status
    }

    return HttpResponse.json(position)
  }),

  http.get('/api/identity/memberships', () => {
    return HttpResponse.json({ items: identityMemberships })
  }),

  http.post('/api/identity/memberships', async ({ request }) => {
    const body = (await request.json()) as {
      userId?: string
      companyId?: string | null
      organizationId?: string | null
      positionId?: string | null
      isPrimary?: boolean
      validFrom?: string
    }

    const userId = body.userId ?? ''
    if (!identityUsers.some((user) => user.id === userId)) {
      return HttpResponse.json({ message: 'User not found.' }, { status: 400 })
    }

    if (body.companyId && !identityCompanies.some((company) => company.id === body.companyId && company.tenantId === DEMO_TENANT_ID)) {
      return HttpResponse.json({ message: 'Company not found in tenant.' }, { status: 400 })
    }

    if (
      body.organizationId &&
      !identityOrganizations.some((org) => org.id === body.organizationId && org.tenantId === DEMO_TENANT_ID)
    ) {
      return HttpResponse.json({ message: 'Organization not found in tenant.' }, { status: 400 })
    }

    if (
      body.positionId &&
      !identityPositions.some((position) => position.id === body.positionId && position.tenantId === DEMO_TENANT_ID)
    ) {
      return HttpResponse.json({ message: 'Position not found in tenant.' }, { status: 400 })
    }

    const isPrimary = Boolean(body.isPrimary)
    if (isPrimary) {
      for (const membership of identityMemberships) {
        if (membership.userId === userId && membership.status === 'active' && membership.isPrimary) {
          membership.isPrimary = false
        }
      }
    }

    const membership: MembershipRecord = {
      id: createId('mem'),
      tenantId: DEMO_TENANT_ID,
      userId,
      companyId: body.companyId ?? null,
      organizationId: body.organizationId ?? null,
      positionId: body.positionId ?? null,
      isPrimary,
      status: 'active',
      validFrom: body.validFrom ?? new Date().toISOString().slice(0, 10),
      validTo: null,
    }

    identityMemberships.push(membership)
    return HttpResponse.json(membership, { status: 201 })
  }),

  http.patch('/api/identity/memberships/:id', async ({ params, request }) => {
    const membership = identityMemberships.find((item) => item.id === params.id)
    if (!membership) {
      return HttpResponse.json({ message: 'Membership not found.' }, { status: 404 })
    }

    const body = (await request.json()) as Partial<
      Pick<MembershipRecord, 'status' | 'isPrimary' | 'validTo'>
    >

    if (body.isPrimary === true) {
      for (const item of identityMemberships) {
        if (item.userId === membership.userId && item.status === 'active' && item.id !== membership.id) {
          item.isPrimary = false
        }
      }
      membership.isPrimary = true
    }

    if (body.isPrimary === false) {
      membership.isPrimary = false
    }

    if (body.status !== undefined) {
      membership.status = body.status
      if (body.status === 'ended' && !membership.validTo) {
        membership.validTo = new Date().toISOString().slice(0, 10)
      }
    }

    if (body.validTo !== undefined) {
      membership.validTo = body.validTo
    }

    return HttpResponse.json(membership)
  }),
]
