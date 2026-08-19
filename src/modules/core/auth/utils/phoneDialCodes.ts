export const PHONE_DIAL_CODES = [
  { id: 'my', prefix: '+601', label: 'MY +601' },
] as const

export const DEFAULT_PHONE_DIAL_CODE = PHONE_DIAL_CODES[0]

export function localPhoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function composeDialedPhone(prefix: string, local: string) {
  const prefixDigits = prefix.replace(/\D/g, '')
  let digits = localPhoneDigits(local)

  if (digits.startsWith(prefixDigits)) {
    digits = digits.slice(prefixDigits.length)
  } else if (digits.startsWith('60') && prefixDigits.startsWith('60')) {
    digits = digits.slice(2)
    if (prefixDigits === '601' && digits.startsWith('1')) {
      digits = digits.slice(1)
    }
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1)
    if (prefixDigits === '601' && digits.startsWith('1')) {
      digits = digits.slice(1)
    }
  }

  return {
    local: digits,
    full: `${prefix}${digits}`,
  }
}
