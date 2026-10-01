import { useTranslation } from 'react-i18next'
import { getPasswordChecks, PASSWORD_CHECKS } from '@/modules/core/auth/utils/passwordPolicy'
import './PasswordRequirements.css'

const PASSWORD_CHECK_KEYS: Record<string, string> = {
  length: 'auth.passwordCheckLength',
  upper: 'auth.passwordCheckUpper',
  lower: 'auth.passwordCheckLower',
  symbol: 'auth.passwordCheckSymbol',
}

type PasswordRequirementsProps = {
  value: string
}

export function PasswordRequirements({ value }: PasswordRequirementsProps) {
  const { t } = useTranslation()
  const password = value ?? ''
  const checks = getPasswordChecks(password)
  const allMet = checks.length && checks.upper && checks.lower && checks.symbol

  if (password.length === 0) {
    return <p className="password-requirements password-requirements--idle">{t('auth.passwordRuleHint')}</p>
  }

  if (allMet) {
    return (
      <p className="password-requirements password-requirements--ok" aria-live="polite">
        <span className="password-requirements__mark is-met" aria-hidden>
          ✓
        </span>
        {t('auth.passwordMeetsRequirements')}
      </p>
    )
  }

  return (
    <ul className="password-requirements password-requirements--live" aria-live="polite">
      {PASSWORD_CHECKS.map((item) => {
        const met = checks[item.id]
        return (
          <li
            key={item.id}
            className={['password-requirements__item', met ? 'is-met' : 'is-pending'].join(' ')}
          >
            <span className="password-requirements__mark" aria-hidden>
              {met ? '✓' : '○'}
            </span>
            {t(PASSWORD_CHECK_KEYS[item.id])}
          </li>
        )
      })}
    </ul>
  )
}
