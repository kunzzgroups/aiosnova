// Isolated UI demonstration. These selections never grant application access.
export const accessPermissionGroups = [
  { key: 'employees', permissions: ['viewEmployees', 'createEmployees', 'editEmployees', 'deleteEmployees'] },
  { key: 'organization', permissions: ['viewOrganization', 'manageOrganization'] },
  { key: 'accounts', permissions: ['manageAccounts'] },
  { key: 'rolesAndAccess', permissions: ['viewRoles', 'createRoles', 'renameRoles', 'changeRolePermissions', 'changeRoleStatus', 'assignRoles', 'deleteRoles'] },
] as const

export const accessPermissionRisks: Record<string, { kind: 'destructive' | 'privileged'; hintKey: string }> = {
  deleteEmployees: { kind: 'destructive', hintKey: 'access.destructiveHint' },
  manageAccounts: { kind: 'privileged', hintKey: 'access.privilegedHint' },
  createRoles: { kind: 'privileged', hintKey: 'access.createRolesHint' },
  renameRoles: { kind: 'privileged', hintKey: 'access.renameRolesHint' },
  changeRolePermissions: { kind: 'privileged', hintKey: 'access.changeRolePermissionsHint' },
  changeRoleStatus: { kind: 'privileged', hintKey: 'access.changeRoleStatusHint' },
  assignRoles: { kind: 'privileged', hintKey: 'access.assignRolesHint' },
  deleteRoles: { kind: 'destructive', hintKey: 'access.deleteRolesHint' },
}

export type AccessDemoRole = { id: string; name: string; enabled: boolean; permissions: string[]; peopleCount: number; createdAt: string }

export function createAccessDemoRoles(): AccessDemoRole[] {
  return [
    { id: 'hr-admin', name: 'HR Administrator', enabled: true, permissions: ['viewEmployees', 'createEmployees', 'editEmployees', 'viewOrganization'], peopleCount: 3, createdAt: '2026-10-12T08:00:00Z' },
    { id: 'viewer', name: 'Employee Viewer', enabled: true, permissions: ['viewEmployees'], peopleCount: 8, createdAt: '2026-10-13T08:00:00Z' },
    { id: 'org-admin', name: 'Organization Administrator', enabled: true, permissions: ['viewOrganization', 'manageOrganization'], peopleCount: 2, createdAt: '2026-10-14T08:00:00Z' },
    { id: 'assistant', name: 'Temporary HR Assistant', enabled: false, permissions: ['viewEmployees', 'editEmployees'], peopleCount: 0, createdAt: '2026-10-15T08:00:00Z' },
  ]
}

