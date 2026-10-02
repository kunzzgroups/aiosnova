import { ai } from './ai'
import { auth } from './auth'
import { common } from './common'
import { home } from './home'
import { nav } from './nav'
import { org } from './org'
import { users } from './users'

/**
 * Later entries win on duplicate keys, so `nav` (the largest area) is merged
 * last to make any accidental collision obvious during review.
 */
export const zhCN: Record<string, string> = {
  ...common,
  ...home,
  ...auth,
  ...users,
  ...org,
  ...ai,
  ...nav,
}
