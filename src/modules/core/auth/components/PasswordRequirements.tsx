import {
  getPasswordChecks,
  PASSWORD_CHECKS,
  PASSWORD_MEETS_REQUIREMENTS,
  PASSWORD_RULE_HINT,
} from '@/modules/core/auth/utils/passwordPolicy'
import './PasswordRequirements.css'

type PasswordRequirementsProps = {
  value: string
}

export function PasswordRequirements({ value }: PasswordRequirementsProps) {
  const password = value ?? ''
  const checks = getPasswordChecks(password)
  const allMet = checks.length && checks.upper && checks.lower && checks.symbol

  if (password.length === 0) {
    return <p className="password-requirements password-requirements--idle">{PASSWORD_RULE_HINT}</p>
  }

  if (allMet) {
    return (
      <p className="password-requirements password-requirements--ok" aria-live="polite">
        <span className="password-requirements__mark is-met" aria-hidden>
          ✓
        </span>
        {PASSWORD_MEETS_REQUIREMENTS}
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
            {item.label}
          </li>
        )
      })}
    </ul>
  )
}
