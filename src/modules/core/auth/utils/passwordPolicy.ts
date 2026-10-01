export const PASSWORD_MIN_LENGTH = 6

export const PASSWORD_CREATE_PLACEHOLDER = 'e.g. Abc#12'
export const PASSWORD_CONFIRM_PLACEHOLDER = 'Re-enter your password'
export const PASSWORD_CURRENT_PLACEHOLDER = 'Enter current password'

export const PASSWORD_RULE_HINT = '6+ chars · A-Z · a-z · symbol'
export const PASSWORD_MEETS_REQUIREMENTS = 'Password meets requirements'

export const PASSWORD_ERROR_MESSAGE =
  'Password must be at least 6 characters and include 1 uppercase letter, 1 lowercase letter, and 1 symbol.'

export const NEW_PASSWORD_ERROR_MESSAGE =
  'New password must be at least 6 characters and include 1 uppercase letter, 1 lowercase letter, and 1 symbol.'

export const PASSWORD_MISMATCH_MESSAGE = 'Passwords do not match.'

const HAS_UPPER = /[A-Z]/
const HAS_LOWER = /[a-z]/
const HAS_SPECIAL = /[^A-Za-z0-9]/

export type PasswordCheckId = 'length' | 'upper' | 'lower' | 'symbol'

/** Labels live in the i18n dictionary (`auth.passwordCheck*`), keyed by id. */
export const PASSWORD_CHECKS: { id: PasswordCheckId }[] = [
  { id: 'length' },
  { id: 'upper' },
  { id: 'lower' },
  { id: 'symbol' },
]

export function getPasswordChecks(password: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    upper: HAS_UPPER.test(password),
    lower: HAS_LOWER.test(password),
    symbol: HAS_SPECIAL.test(password),
  }
}

export function isValidPassword(password: string) {
  const checks = getPasswordChecks(password)
  return checks.length && checks.upper && checks.lower && checks.symbol
}
