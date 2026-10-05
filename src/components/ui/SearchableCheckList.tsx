import { useMemo, useState } from 'react'
import { CheckList, type CheckListItem } from './CheckList'
import { TextField } from './TextField'
import './CheckList.css'

type SearchableCheckListProps = {
  items: CheckListItem[]
  selected: string[]
  onToggle: (value: string) => void
  /** Shown when there is nothing to tick at all. */
  emptyLabel: string
  /** Shown when a search matched nothing - a different problem from `emptyLabel`. */
  noMatchLabel: string
  searchPlaceholder: string
  searchAriaLabel: string
  listAriaLabel: string
  disabled?: boolean
}

/**
 * A `CheckList` with a filter box above it.
 *
 * The search only narrows what is SHOWN - `selected` is never pruned, so ticking
 * something, searching for something else, and clearing the search leaves the
 * original tick in place. That is why callers that need it also render a selected
 * count next to their heading.
 *
 * The query lives here and dies with the component, which is what a drawer wants:
 * reopening it starts from an empty box.
 */
export function SearchableCheckList({
  items,
  selected,
  onToggle,
  emptyLabel,
  noMatchLabel,
  searchPlaceholder,
  searchAriaLabel,
  listAriaLabel,
  disabled = false,
}: SearchableCheckListProps) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return items
    }
    return items.filter((item) => item.label.toLowerCase().includes(needle))
  }, [items, query])

  return (
    <>
      <TextField
        className="check-list__search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchAriaLabel}
        disabled={disabled}
      />
      <CheckList
        items={visible}
        selected={selected}
        onToggle={onToggle}
        emptyLabel={query.trim() ? noMatchLabel : emptyLabel}
        ariaLabel={listAriaLabel}
        disabled={disabled}
      />
    </>
  )
}
