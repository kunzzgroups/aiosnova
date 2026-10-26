import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SelectField } from '@/components/ui/SelectField'
import type { RoleOption } from '../services/identityService'
import './RoleSelection.css'

type RoleSelectionProps = {
  roles: RoleOption[]
  selectedIds: string[]
  savedIds: string[]
  onToggle: (id: string) => void
  disabled?: boolean
  readOnly?: boolean
}

export function RoleSelection({ roles, selectedIds, savedIds, onToggle, disabled = false, readOnly = false }: RoleSelectionProps) {
  const { t } = useTranslation()
  const id = useId()
  // Order by the saved snapshot so toggling a role never moves its option.
  const orderedRoles = useMemo(() => {
    const saved = new Set(savedIds)
    const entries: Array<Partial<RoleOption> & Pick<RoleOption, 'id' | 'name'>> = [...roles]
    for (const roleId of savedIds) {
      if (!entries.some(role => role.id === roleId)) entries.push({ id: roleId, name: roleId })
    }
    return entries.sort((a, b) => Number(saved.has(b.id)) - Number(saved.has(a.id)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }, [roles, savedIds])
  const selectedNames = selectedIds.map(roleId => orderedRoles.find(role => role.id === roleId)?.name ?? roleId)
  const summary = selectedNames.length === 0 ? t('users.rolesSelectPlaceholder')
    : selectedNames.length <= 2 ? selectedNames.join(', ')
    : t('users.rolesSelectedCount', { count: selectedIds.length })

  return <div className="role-selection" aria-busy={disabled}>
    <SelectField
      id={id}
      label={t('users.rolesTitle')}
      value=""
      disabled={disabled || readOnly}
      onChange={onToggle}
      multiple={{ values: selectedIds, summary, onToggle }}
      picker={{
        popupWidth: 320,
        boundarySelector: '.identity-invite-content',
        searchLabel: t('users.rolesSearch'),
        clearLabel: t('users.rolesClearSearch'),
        emptyLabel: t(roles.length ? 'users.rolesNoMatches' : 'users.rolesNoneDefined'),
        expandLabel: t('org.expandDepartment'),
        collapseLabel: t('org.collapseDepartment'),
      }}
      options={orderedRoles.map(role => ({
        value: role.id,
        label: [
          role.name,
          role.status === undefined ? t('users.rolesUnavailable') : '',
          role.status === 'disabled' ? t('access.disabled') : '',
        ].filter(Boolean).join(' · '),
      }))}
    />
    <span className="role-selection__count" role="status" aria-live="polite" aria-atomic="true">
      {t('users.rolesSelectedCount', { count: selectedIds.length })}
    </span>
  </div>
}
