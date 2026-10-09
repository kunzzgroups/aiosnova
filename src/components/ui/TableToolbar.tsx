import type { ReactNode } from 'react'
import './TableToolbar.css'

type TableToolbarProps = {
  search: ReactNode
  filters?: ReactNode
  actions?: ReactNode
}

export function TableToolbar({ search, filters, actions }: TableToolbarProps) {
  return (
    <div className="ui-table-toolbar">
      <div className="ui-table-toolbar__search">{search}</div>
      {filters}
      {actions ? <div className="ui-table-toolbar__actions">{actions}</div> : null}
    </div>
  )
}
