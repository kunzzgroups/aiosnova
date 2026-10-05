import type { ReactNode } from 'react'
import './CheckList.css'

export type CheckListItem = {
  value: string
  label: string
  /** Optional second line - a description, or what ticking it would do. */
  hint?: string
}

type CheckListProps = {
  items: CheckListItem[]
  selected: string[]
  onToggle: (value: string) => void
  /** Shown instead of the list when there is nothing to tick. */
  emptyLabel: string
  ariaLabel: string
  columns?: boolean
  disabled?: boolean
}

/**
 * A tick list. Used for both sides of the agent <-> knowledge relation: picking
 * knowledge bases for an agent, and picking agents for a knowledge base or
 * document.
 *
 * Order is the caller's business; this only reflects `selected` back.
 */
export function CheckList({
  items,
  selected,
  onToggle,
  emptyLabel,
  ariaLabel,
  columns = false,
  disabled = false,
}: CheckListProps): ReactNode {
  if (items.length === 0) {
    return <p className="check-list__empty">{emptyLabel}</p>
  }

  return (
    <ul
      className={['check-list', columns ? 'check-list--columns' : ''].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const on = selected.includes(item.value)
        return (
          <li key={item.value}>
            <label
              className={['check-list__item', on ? 'check-list__item--on' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => onToggle(item.value)}
              />
              <span>
                <span className="check-list__label">{item.label}</span>
                {item.hint ? <span className="check-list__hint">{item.hint}</span> : null}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}
