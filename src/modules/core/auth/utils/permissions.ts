import type { AuthUser } from '../types/auth'

export function hasPermission(
  user: AuthUser | null,
  permissionCode: string
): boolean{
    if(!user) return false
    if(user.isOwner) return true
    return (user.permissions?.includes(permissionCode)) ?? false
}