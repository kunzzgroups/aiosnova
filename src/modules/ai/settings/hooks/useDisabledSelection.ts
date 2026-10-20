import { useEffect, useRef, useState } from 'react'

type Selectable = { id: string; status: string }

/** Organization-style selection: page-local select all, filtered cross-page selection. */
export function useDisabledSelection<T extends Selectable>(items: T[], pageItems: T[], statusFilter: string, query: string, scope: string) {
  const [ids, setIds] = useState<string[]>([])
  const selectAllRef = useRef<HTMLInputElement>(null)
  const enabled = statusFilter === 'disabled'
  const selected = enabled ? items.filter(item => item.status === 'disabled' && ids.includes(item.id)) : []
  const selectablePage = enabled ? pageItems.filter(item => item.status === 'disabled') : []
  const allSelected = selectablePage.length > 0 && selectablePage.every(item => ids.includes(item.id))
  const someSelected = selectablePage.some(item => ids.includes(item.id))
  useEffect(() => { setIds([]) }, [statusFilter, query, scope])
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected, enabled])
  return {
    enabled, ids, selected, selectAllRef, allSelected,
    hasSelectablePage: selectablePage.length > 0,
    toggle: (id: string, checked: boolean) => setIds(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id)),
    togglePage: (checked: boolean) => setIds(current => checked ? [...new Set([...current, ...selectablePage.map(item => item.id)])] : current.filter(id => !selectablePage.some(item => item.id === id))),
    clear: () => setIds([]),
  }
}
