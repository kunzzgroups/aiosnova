export const PASSWORD_MIN_LENGTH = 6

export const PASSWORD_CREATE_PLACEHOLDER = 'e.g. Abc#12'
export const PASSWORD_CONFIRM_PLACEHOLDER = 'Re-enter your password'
export const PASSWORD_CURRENT_PLACEHOLDER = 'Enter current password'

export const PASSWORD_RULE_HINT =
  'At least 6 characters, with 1 uppercase, 1 lowercase, and 1 symbol.'

export const PASSWORD_ERROR_MESSAGE =
  'Password must be at least 6 characters and include 1 uppercase letter, 1 lowercase letter, and 1 symbol.'

export const NEW_PASSWORD_ERROR_MESSAGE =
  'New password must be at least 6 characters and include 1 uppercase letter, 1 lowercase letter, and 1 symbol.'

const HAS_UPPER = /[A-Z]/
const HAS_LOWER = /[a-z]/
const HAS_SPECIAL = /[^A-Za-z0-9]/

export function isValidPassword(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    HAS_UPPER.test(password) &&
    HAS_LOWER.test(password) &&
    HAS_SPECIAL.test(password)
  )
}
