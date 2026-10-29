import { ai } from './ai'
import { activity } from './activity'
import { access } from './access'
import { auth } from './auth'
import { common } from './common'
import { home } from './home'
import { org } from './org'
import { users } from './users'

/** English is the source language. `nav` is intentionally absent - see i18n/index.ts. */
export const en: Record<string, string> = {
  ...common,
  ...activity,
  ...access,
  ...home,
  ...auth,
  ...users,
  ...org,
  ...ai,
}
